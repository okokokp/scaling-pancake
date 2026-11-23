import type { User } from 'firebase/auth';
import {
  collection,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  query,
  serverTimestamp,
  where,
  writeBatch,
  type Timestamp,
} from 'firebase/firestore';
import type { AvailabilityStatus, EnrichedListing, SellerBusinessType, Store } from '../../shared/types.ts';
import { getCanonicalCategoryName, normalizeCategoryId } from '../../shared/taxonomy.ts';
import { DJELFA_AREAS, normalizeDjelfaArea } from '../../shared/locationConfig.ts';
import { db, handleFirestoreError, OperationType } from './firebase.ts';

// Synchronized verbatim with firebase-blueprint.json & firestore.rules
export const BLUEPRINT_LIMITS = {
  ID_PATTERN: /^[a-zA-Z0-9_-]+$/,
  SLUG_PATTERN: /^[a-z0-9-]+$/,
  ID_MIN: 2,
  ID_MAX: 64,
  NAME_MIN: 2,
  NAME_MAX: 100,
  STORE_NAME_MAX: 80,
  SELLER_NAME_MAX: 80,
  SLUG_MAX: 120,
  BRAND_MIN: 1,
  BRAND_MAX: 60,
  DESC_MIN: 4,
  DESC_MAX: 400,
  CAT_ID_MAX: 40,
  CAT_NAME_MAX: 60,
  IMAGE_KEY_MAX: 40,
  IMAGE_URL_MAX: 500,
  PRICE_MIN: 1,
  PRICE_MAX: 5_000_000,
  STOCK_MIN: 0,
  STOCK_MAX: 100_000,
  SOLD_MAX: 1_000_000,
} as const;

export interface FirestoreSellerProduct {
  id: string;
  sellerUid: string;
  sellerName: string;
  storeId: string;
  storeName: string;
  name: string;
  slug: string;
  brand: string;
  description: string;
  categoryId: string;
  categoryName: string;
  imageKey: string;
  imageUrl: string;
  price: number;
  currency: 'DZD';
  stockQuantity: number;
  availabilityStatus: AvailabilityStatus;
  soldCount: number;
  revenueTotal: number;
  isActive: boolean;
  isBestSeller: boolean;
  createdAt?: Timestamp | null;
  updatedAt?: Timestamp | null;
}

export interface FirestoreBestSellingProduct {
  id: string;
  productId: string;
  sellerUid: string;
  storeId: string;
  storeName: string;
  productName: string;
  productSlug: string;
  brand: string;
  categoryName: string;
  imageKey: string;
  imageUrl: string;
  price: number;
  currency: 'DZD';
  soldCount: number;
  revenueTotal: number;
  stockQuantity: number;
  isPublic: boolean;
  createdAt?: Timestamp | null;
  updatedAt?: Timestamp | null;
}

export interface FirestoreStore {
  id: string;
  ownerUid: string;
  storeType?: SellerBusinessType;
  name: string;
  slug: string;
  description: string;
  area: string;
  city: string;
  openingHours: string;
  isOpen: boolean;
  isApproved: boolean;
  rating: number;
  reviewCount: number;
  deliveryFee: number;
  deliveryRadiusKm: number;
  logoUrl?: string;
  whatsapp?: string;
  facebookUrl?: string;
  instagramUrl?: string;
  googleMapsUrl?: string;
  createdAt?: Timestamp | null;
  updatedAt?: Timestamp | null;
}

export function sanitizeId(raw: string, fallback = 'item'): string {
  const cleaned = raw.replace(/[^a-zA-Z0-9_-]/g, '-').slice(0, BLUEPRINT_LIMITS.ID_MAX);
  return cleaned.length >= BLUEPRINT_LIMITS.ID_MIN ? cleaned : `${fallback}-01`;
}

export function sanitizeSlug(raw: string, fallback = 'product'): string {
  const cleaned = raw
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/(^-|-$)/g, '')
    .slice(0, BLUEPRINT_LIMITS.SLUG_MAX);
  return cleaned.length >= 2 ? cleaned : `${fallback}-item`;
}

function clampStr(val: string | undefined | null, minLen: number, maxLen: number, fallback: string): string {
  const trimmed = (val || '').trim();
  if (trimmed.length < minLen) return fallback.slice(0, maxLen);
  return trimmed.slice(0, maxLen);
}

function clampInt(val: number | undefined | null, min: number, max: number, fallback: number): number {
  const n = typeof val === 'number' && Number.isFinite(val) ? Math.round(val) : fallback;
  return Math.max(min, Math.min(max, n));
}

export async function ensureFirebaseUserProfile(
  user: User,
  role: 'customer' | 'merchant' | 'driver' = 'merchant',
  sellerType?: SellerBusinessType,
  phone?: string
): Promise<void> {
  if (!user.emailVerified) return;
  const userPath = `users/${user.uid}`;
  const privatePath = `users/${user.uid}/private/info`;
  const userRef = doc(db, 'users', user.uid);
  const privateRef = doc(db, 'users', user.uid, 'private', 'info');

  try {
    const [userSnap, privateSnap] = await Promise.all([getDoc(userRef), getDoc(privateRef)]);
    const batch = writeBatch(db);
    const displayName = clampStr(user.displayName || user.email?.split('@')[0], 1, 80, 'Seller');
    const email = clampStr(user.email, 3, 120, 'seller@marketly.dz');
    const resolvedPhone = clampStr(phone || user.phoneNumber, 0, 24, '');

    if (!userSnap.exists()) {
      batch.set(userRef, {
        uid: user.uid,
        displayName,
        role,
        ...(role === 'merchant' && sellerType ? { sellerType } : {}),
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    } else {
      batch.update(userRef, {
        displayName,
        role,
        ...(role === 'merchant' && sellerType ? { sellerType } : {}),
        updatedAt: serverTimestamp(),
      });
    }

    if (!privateSnap.exists()) {
      batch.set(privateRef, {
        uid: user.uid,
        email,
        phone: resolvedPhone,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    } else {
      batch.update(privateRef, {
        email,
        phone: resolvedPhone,
        updatedAt: serverTimestamp(),
      });
    }

    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `${userPath} & ${privatePath}`);
  }
}

export interface SaveProductToFirestoreInput {
  id: string;
  store: Pick<
    Store,
    | 'id'
    | 'storeType'
    | 'name'
    | 'slug'
    | 'description'
    | 'area'
    | 'city'
    | 'openingHours'
    | 'isOpen'
    | 'rating'
    | 'reviewCount'
    | 'deliveryFee'
    | 'deliveryRadiusKm'
    | 'logoUrl'
    | 'whatsapp'
    | 'facebookUrl'
    | 'instagramUrl'
    | 'googleMapsUrl'
  >;
  name: string;
  slug?: string;
  brand: string;
  description: string;
  categoryId: string;
  categoryName: string;
  imageKey: string;
  imageUrl?: string | null;
  price: number;
  stockQuantity: number | null;
  availabilityStatus: AvailabilityStatus;
  soldCount?: number;
  revenueTotal?: number;
  isActive?: boolean;
  isBestSeller?: boolean;
}

function buildStorePayload(user: User, store: SaveProductToFirestoreInput['store']) {
  const storeId = sanitizeId(store.id, 'store');
  const storeType: SellerBusinessType = store.storeType === 'online_page' ? 'online_page' : 'physical_store';
  return {
    id: storeId,
    ownerUid: user.uid,
    storeType,
    name: clampStr(store.name, 2, BLUEPRINT_LIMITS.STORE_NAME_MAX, 'Local Shop'),
    slug: sanitizeSlug(store.slug || store.name, 'store').slice(0, 100),
    description: clampStr(store.description, 4, BLUEPRINT_LIMITS.DESC_MAX, 'Verified local shop in Djelfa.'),
    area: clampStr(store.area, 2, 60, DJELFA_AREAS[0].name),
    city: clampStr(store.city || 'Djelfa', 2, 60, 'Djelfa'),
    openingHours: clampStr(store.openingHours, 3, 60, '09:00 - 21:00'),
    isOpen: Boolean(store.isOpen),
    isApproved: true,
    rating: Math.max(0, Math.min(5, Number(store.rating) || 4.8)),
    reviewCount: clampInt(store.reviewCount, 0, 1_000_000, 1),
    deliveryFee: clampInt(store.deliveryFee, 0, 50_000, 200),
    deliveryRadiusKm: Math.max(1, Math.min(100, Number(store.deliveryRadiusKm) || 10)),
    logoUrl: clampStr(store.logoUrl, 0, 500, ''),
    whatsapp: clampStr((store.whatsapp || '').replace(/\D/g, ''), 0, 32, ''),
    facebookUrl: clampStr(store.facebookUrl, 0, 300, ''),
    instagramUrl: clampStr(store.instagramUrl, 0, 300, ''),
    googleMapsUrl: clampStr(store.googleMapsUrl, 0, 500, ''),
  };
}

export async function saveStoreProfileToFirestore(
  user: User,
  store: SaveProductToFirestoreInput['store']
): Promise<void> {
  if (!user.emailVerified) {
    throw new Error('Your Google account email must be verified to sync your shop profile.');
  }
  const payload = buildStorePayload(user, store);
  const storeRef = doc(db, 'stores', payload.id);

  try {
    const snap = await getDoc(storeRef);
    const batch = writeBatch(db);
    if (!snap.exists()) {
      batch.set(storeRef, {
        ...payload,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    } else {
      batch.update(storeRef, {
        storeType: payload.storeType,
        name: payload.name,
        slug: payload.slug,
        description: payload.description,
        area: payload.area,
        openingHours: payload.openingHours,
        isOpen: payload.isOpen,
        deliveryFee: payload.deliveryFee,
        deliveryRadiusKm: payload.deliveryRadiusKm,
        logoUrl: payload.logoUrl,
        whatsapp: payload.whatsapp,
        facebookUrl: payload.facebookUrl,
        instagramUrl: payload.instagramUrl,
        googleMapsUrl: payload.googleMapsUrl,
        updatedAt: serverTimestamp(),
      });
    }
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `stores/${payload.id}`);
  }
}

function buildProductPayloads(user: User, input: SaveProductToFirestoreInput) {
  const productId = sanitizeId(input.id, 'prod');
  const storeId = sanitizeId(input.store.id, 'store');
  const sellerName = clampStr(user.displayName || user.email?.split('@')[0], 1, BLUEPRINT_LIMITS.SELLER_NAME_MAX, 'Seller');
  const storeName = clampStr(input.store.name, 2, BLUEPRINT_LIMITS.STORE_NAME_MAX, 'Local Shop');
  const name = clampStr(input.name, BLUEPRINT_LIMITS.NAME_MIN, BLUEPRINT_LIMITS.NAME_MAX, 'Hardware Product');
  const slug = sanitizeSlug(input.slug || input.name, 'product');
  const brand = clampStr(input.brand, BLUEPRINT_LIMITS.BRAND_MIN, BLUEPRINT_LIMITS.BRAND_MAX, 'Generic');
  const description = clampStr(input.description, BLUEPRINT_LIMITS.DESC_MIN, BLUEPRINT_LIMITS.DESC_MAX, `${brand} ${name}`);
  const categoryId = normalizeCategoryId(
    sanitizeId(input.categoryId, 'cat-pc-parts').slice(0, BLUEPRINT_LIMITS.CAT_ID_MAX),
    { imageKey: input.imageKey, name: input.name, description: input.description }
  );
  const categoryName = clampStr(
    input.categoryName || getCanonicalCategoryName(categoryId),
    2,
    BLUEPRINT_LIMITS.CAT_NAME_MAX,
    'PC Parts'
  );
  const imageKey = clampStr(input.imageKey, 1, BLUEPRINT_LIMITS.IMAGE_KEY_MAX, 'gpu');
  const imageUrl = clampStr(input.imageUrl, 0, BLUEPRINT_LIMITS.IMAGE_URL_MAX, '');
  const price = clampInt(input.price, BLUEPRINT_LIMITS.PRICE_MIN, BLUEPRINT_LIMITS.PRICE_MAX, 1000);
  const stockQuantity = clampInt(input.stockQuantity, BLUEPRINT_LIMITS.STOCK_MIN, BLUEPRINT_LIMITS.STOCK_MAX, 10);
  const soldCount = clampInt(input.soldCount, 0, BLUEPRINT_LIMITS.SOLD_MAX, 0);
  const revenueTotal = Math.max(0, Number(input.revenueTotal ?? soldCount * price));
  const isActive = input.isActive !== false;
  const isBestSeller = Boolean(input.isBestSeller ?? soldCount >= 25);

  const productData = {
    id: productId,
    sellerUid: user.uid,
    sellerName,
    storeId,
    storeName,
    name,
    slug,
    brand,
    description,
    categoryId,
    categoryName,
    imageKey,
    imageUrl,
    price,
    currency: 'DZD' as const,
    stockQuantity,
    availabilityStatus: input.availabilityStatus,
    soldCount,
    revenueTotal,
    isActive,
    isBestSeller,
  };

  const bestSellerData = {
    id: productId,
    productId,
    sellerUid: user.uid,
    storeId,
    storeName,
    productName: name,
    productSlug: slug,
    brand,
    categoryName,
    imageKey,
    imageUrl,
    price,
    currency: 'DZD' as const,
    soldCount,
    revenueTotal,
    stockQuantity,
    isPublic: isActive,
  };

  return { productId, storeId, productData, bestSellerData };
}

export async function saveSellerProductToFirestore(
  user: User,
  input: SaveProductToFirestoreInput
): Promise<void> {
  if (!user.emailVerified) {
    throw new Error('Your Google account email must be verified to save products to Cloud DB.');
  }
  const { productId, storeId, productData, bestSellerData } = buildProductPayloads(user, input);
  const storeRef = doc(db, 'stores', storeId);
  const prodRef = doc(db, 'seller_products', productId);
  const bestRef = doc(db, 'best_selling_products', productId);

  try {
    const [storeSnap, prodSnap, bestSnap] = await Promise.all([
      getDoc(storeRef),
      getDoc(prodRef),
      getDoc(bestRef),
    ]);
    const batch = writeBatch(db);

    if (!storeSnap.exists()) {
      batch.set(storeRef, {
        ...buildStorePayload(user, input.store),
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }

    if (!prodSnap.exists()) {
      batch.set(prodRef, {
        ...productData,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    } else {
      batch.update(prodRef, {
        name: productData.name,
        slug: productData.slug,
        brand: productData.brand,
        description: productData.description,
        categoryId: productData.categoryId,
        categoryName: productData.categoryName,
        imageKey: productData.imageKey,
        imageUrl: productData.imageUrl,
        price: productData.price,
        stockQuantity: productData.stockQuantity,
        availabilityStatus: productData.availabilityStatus,
        isActive: productData.isActive,
        updatedAt: serverTimestamp(),
      });
    }

    if (!bestSnap.exists()) {
      batch.set(bestRef, {
        ...bestSellerData,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    } else {
      batch.update(bestRef, {
        storeName: bestSellerData.storeName,
        productName: bestSellerData.productName,
        productSlug: bestSellerData.productSlug,
        brand: bestSellerData.brand,
        categoryName: bestSellerData.categoryName,
        imageKey: bestSellerData.imageKey,
        imageUrl: bestSellerData.imageUrl,
        price: bestSellerData.price,
        soldCount: bestSellerData.soldCount,
        revenueTotal: bestSellerData.revenueTotal,
        stockQuantity: bestSellerData.stockQuantity,
        isPublic: bestSellerData.isPublic,
        updatedAt: serverTimestamp(),
      });
    }

    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `seller_products/${productId}`);
  }
}

export async function syncMerchantCatalogToFirestore(
  user: User,
  stores: SaveProductToFirestoreInput['store'][],
  items: SaveProductToFirestoreInput[]
): Promise<{ syncedCount: number }> {
  if (!user.emailVerified) {
    throw new Error('Your Google account email must be verified to sync products.');
  }
  const storeMap = new Map<string, SaveProductToFirestoreInput['store']>();
  for (const s of stores) {
    storeMap.set(sanitizeId(s.id, 'store'), s);
  }

  try {
    // Check existing stores first
    const storeIds = Array.from(storeMap.keys());
    const existingStoreIds = new Set<string>();
    for (const sid of storeIds) {
      const snap = await getDoc(doc(db, 'stores', sid));
      if (snap.exists()) existingStoreIds.add(sid);
    }

    // Batch stores (<= 400 ops)
    const storeBatch = writeBatch(db);
    let hasStoreWrites = false;
    for (const [sid, st] of storeMap.entries()) {
      if (!existingStoreIds.has(sid)) {
        storeBatch.set(doc(db, 'stores', sid), {
          ...buildStorePayload(user, st),
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
        hasStoreWrites = true;
      }
    }
    if (hasStoreWrites) {
      await storeBatch.commit();
    }

    // Sync products & best sellers in chunks of 150 products (300 writes per batch)
    let syncedCount = 0;
    for (let i = 0; i < items.length; i += 150) {
      const chunk = items.slice(i, i + 150);
      const existingProds = new Set<string>();
      const existingBest = new Set<string>();

      await Promise.all(
        chunk.map(async (item) => {
          const pid = sanitizeId(item.id, 'prod');
          const [pSnap, bSnap] = await Promise.all([
            getDoc(doc(db, 'seller_products', pid)),
            getDoc(doc(db, 'best_selling_products', pid)),
          ]);
          if (pSnap.exists()) existingProds.add(pid);
          if (bSnap.exists()) existingBest.add(pid);
        })
      );

      const batch = writeBatch(db);
      for (const item of chunk) {
        const { productId, productData, bestSellerData } = buildProductPayloads(user, item);
        const prodRef = doc(db, 'seller_products', productId);
        const bestRef = doc(db, 'best_selling_products', productId);

        if (!existingProds.has(productId)) {
          batch.set(prodRef, {
            ...productData,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          });
        } else {
          batch.update(prodRef, {
            name: productData.name,
            slug: productData.slug,
            brand: productData.brand,
            description: productData.description,
            categoryId: productData.categoryId,
            categoryName: productData.categoryName,
            imageKey: productData.imageKey,
            imageUrl: productData.imageUrl,
            price: productData.price,
            stockQuantity: productData.stockQuantity,
            availabilityStatus: productData.availabilityStatus,
            isActive: productData.isActive,
            updatedAt: serverTimestamp(),
          });
        }

        if (!existingBest.has(productId)) {
          batch.set(bestRef, {
            ...bestSellerData,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          });
        } else {
          batch.update(bestRef, {
            storeName: bestSellerData.storeName,
            productName: bestSellerData.productName,
            productSlug: bestSellerData.productSlug,
            brand: bestSellerData.brand,
            categoryName: bestSellerData.categoryName,
            imageKey: bestSellerData.imageKey,
            imageUrl: bestSellerData.imageUrl,
            price: bestSellerData.price,
            soldCount: bestSellerData.soldCount,
            revenueTotal: bestSellerData.revenueTotal,
            stockQuantity: bestSellerData.stockQuantity,
            isPublic: bestSellerData.isPublic,
            updatedAt: serverTimestamp(),
          });
        }
        syncedCount += 1;
      }
      await batch.commit();
    }

    return { syncedCount };
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, 'seller_products & best_selling_products');
  }
}

export async function recordProductSaleInFirestore(
  product: FirestoreSellerProduct,
  unitsSold: number
): Promise<void> {
  const safeUnits = clampInt(unitsSold, 1, 1000, 1);
  const nextSoldCount = clampInt(product.soldCount + safeUnits, 0, BLUEPRINT_LIMITS.SOLD_MAX, safeUnits);
  const nextStock = Math.max(0, product.stockQuantity - safeUnits);
  const nextStatus: AvailabilityStatus =
    nextStock === 0 ? 'out_of_stock' : product.availabilityStatus === 'out_of_stock' ? 'in_stock' : product.availabilityStatus;
  const nextRevenue = Math.max(0, Number(product.revenueTotal) + safeUnits * product.price);
  const nextBestSeller = product.isBestSeller || nextSoldCount >= 10;

  const prodRef = doc(db, 'seller_products', product.id);
  const bestRef = doc(db, 'best_selling_products', product.id);

  try {
    const bestSnap = await getDoc(bestRef);
    const batch = writeBatch(db);

    batch.update(prodRef, {
      soldCount: nextSoldCount,
      revenueTotal: nextRevenue,
      stockQuantity: nextStock,
      availabilityStatus: nextStatus,
      isBestSeller: nextBestSeller,
      updatedAt: serverTimestamp(),
    });

    if (!bestSnap.exists()) {
      batch.set(bestRef, {
        id: product.id,
        productId: product.id,
        sellerUid: product.sellerUid,
        storeId: product.storeId,
        storeName: product.storeName,
        productName: product.name,
        productSlug: product.slug,
        brand: product.brand,
        categoryName: product.categoryName,
        imageKey: product.imageKey,
        imageUrl: product.imageUrl || '',
        price: product.price,
        currency: 'DZD',
        soldCount: nextSoldCount,
        revenueTotal: nextRevenue,
        stockQuantity: nextStock,
        isPublic: product.isActive,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    } else {
      batch.update(bestRef, {
        soldCount: nextSoldCount,
        revenueTotal: nextRevenue,
        stockQuantity: nextStock,
        updatedAt: serverTimestamp(),
      });
    }

    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `seller_products/${product.id}`);
  }
}

export async function toggleBestSellerFlagInFirestore(
  product: FirestoreSellerProduct
): Promise<void> {
  const prodRef = doc(db, 'seller_products', product.id);
  try {
    const batch = writeBatch(db);
    batch.update(prodRef, {
      isBestSeller: !product.isBestSeller,
      updatedAt: serverTimestamp(),
    });
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `seller_products/${product.id}`);
  }
}

export async function deleteSellerProductFromFirestore(productId: string): Promise<void> {
  const safeId = sanitizeId(productId, 'prod');
  const prodRef = doc(db, 'seller_products', safeId);
  const bestRef = doc(db, 'best_selling_products', safeId);

  try {
    const [pSnap, bSnap] = await Promise.all([getDoc(prodRef), getDoc(bestRef)]);
    const batch = writeBatch(db);
    if (pSnap.exists()) batch.delete(prodRef);
    if (bSnap.exists()) batch.delete(bestRef);
    if (pSnap.exists() || bSnap.exists()) {
      await batch.commit();
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, `seller_products/${safeId}`);
  }
}

export function subscribeSellerProducts(
  sellerUid: string,
  onData: (items: FirestoreSellerProduct[]) => void,
  onError?: (err: Error) => void
): () => void {
  const path = 'seller_products';
  const q = query(collection(db, path), where('sellerUid', '==', sellerUid));
  return onSnapshot(
    q,
    (snapshot) => {
      const rows = snapshot.docs.map((d) => d.data() as FirestoreSellerProduct);
      rows.sort((a, b) => b.soldCount - a.soldCount);
      onData(rows);
    },
    (error) => {
      try {
        handleFirestoreError(error, OperationType.LIST, path);
      } catch (wrapped) {
        onError?.(wrapped instanceof Error ? wrapped : new Error(String(wrapped)));
      }
    }
  );
}

export function subscribePublicBestSellers(
  onData: (items: FirestoreBestSellingProduct[]) => void,
  onError?: (err: Error) => void
): () => void {
  const path = 'best_selling_products';
  const q = query(collection(db, path), where('isPublic', '==', true));
  return onSnapshot(
    q,
    (snapshot) => {
      const rows = snapshot.docs.map((d) => d.data() as FirestoreBestSellingProduct);
      rows.sort((a, b) => {
        if (b.soldCount !== a.soldCount) return b.soldCount - a.soldCount;
        return b.revenueTotal - a.revenueTotal;
      });
      onData(rows);
    },
    (error) => {
      try {
        handleFirestoreError(error, OperationType.LIST, path);
      } catch (wrapped) {
        onError?.(wrapped instanceof Error ? wrapped : new Error(String(wrapped)));
      }
    }
  );
}

export function subscribePublicStores(
  onData: (items: FirestoreStore[]) => void,
  onError?: (err: Error) => void
): () => void {
  const path = 'stores';
  const q = query(collection(db, path), where('isApproved', '==', true));
  return onSnapshot(
    q,
    (snapshot) => {
      const rows = snapshot.docs.map((d) => d.data() as FirestoreStore);
      onData(rows);
    },
    (error) => {
      try {
        handleFirestoreError(error, OperationType.LIST, path);
      } catch (wrapped) {
        onError?.(wrapped instanceof Error ? wrapped : new Error(String(wrapped)));
      }
    }
  );
}

export function subscribePublicProducts(
  onData: (items: FirestoreSellerProduct[]) => void,
  onError?: (err: Error) => void
): () => void {
  const path = 'seller_products';
  const q = query(collection(db, path), where('isActive', '==', true));
  return onSnapshot(
    q,
    (snapshot) => {
      const rows = snapshot.docs.map((d) => d.data() as FirestoreSellerProduct);
      onData(rows);
    },
    (error) => {
      try {
        handleFirestoreError(error, OperationType.LIST, path);
      } catch (wrapped) {
        onError?.(wrapped instanceof Error ? wrapped : new Error(String(wrapped)));
      }
    }
  );
}

export async function fetchFirestoreCatalogSnapshot(): Promise<{
  products: FirestoreSellerProduct[];
  stores: FirestoreStore[];
}> {
  try {
    const [prodSnap, storeSnap] = await Promise.all([
      getDocs(query(collection(db, 'seller_products'), where('isActive', '==', true))),
      getDocs(query(collection(db, 'stores'), where('isApproved', '==', true))),
    ]);
    return {
      products: prodSnap.docs.map((d) => d.data() as FirestoreSellerProduct),
      stores: storeSnap.docs.map((d) => d.data() as FirestoreStore),
    };
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, 'seller_products & stores');
  }
}

function getDjelfaCoords(areaName: string): { lat: number; lng: number } {
  const { area } = normalizeDjelfaArea(areaName);
  return { lat: area.lat, lng: area.lng };
}

function calcDistanceKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Math.round(R * c * 10) / 10;
}

function timestampToIso(ts: Timestamp | string | null | undefined): string {
  if (!ts) return new Date().toISOString();
  if (typeof ts === 'string') return ts;
  if (typeof (ts as Timestamp).toDate === 'function') {
    return (ts as Timestamp).toDate().toISOString();
  }
  return new Date().toISOString();
}

export function buildEnrichedListingsFromFirestore(
  products: FirestoreSellerProduct[],
  cloudStores: FirestoreStore[],
  localStores: Store[] = [],
  originCoords: { lat: number; lng: number } | null = null
): EnrichedListing[] {
  const cloudStoreMap = new Map(cloudStores.map((s) => [s.id, s]));
  const localStoreMap = new Map(localStores.map((s) => [s.id, s]));

  // Precompute lowest price & offer count per product slug
  const lowestBySlug = new Map<string, number>();
  const countBySlug = new Map<string, number>();

  for (const p of products) {
    if (!p.isActive) continue;
    const key = p.slug || p.id;
    countBySlug.set(key, (countBySlug.get(key) || 0) + 1);
    if (p.availabilityStatus === 'in_stock') {
      const cur = lowestBySlug.get(key);
      if (cur === undefined || p.price < cur) {
        lowestBySlug.set(key, p.price);
      }
    }
  }

  return products
    .filter((p) => p.isActive)
    .map((p) => {
      const cStore = cloudStoreMap.get(p.storeId);
      const lStore = localStoreMap.get(p.storeId);
      const areaName = normalizeDjelfaArea(cStore?.area || lStore?.area || DJELFA_AREAS[0].name).area.name;
      const coords = lStore
        ? { lat: lStore.lat, lng: lStore.lng }
        : getDjelfaCoords(areaName);

      const distanceKm = originCoords
        ? calcDistanceKm(originCoords.lat, originCoords.lng, coords.lat, coords.lng)
        : null;

      const updatedIso = timestampToIso(p.updatedAt);
      const slugKey = p.slug || p.id;
      const offerCount = countBySlug.get(slugKey) || 1;
      const lowest = lowestBySlug.get(slugKey);

      const normalizedCatId = normalizeCategoryId(p.categoryId, {
        imageKey: p.imageKey,
        name: p.name,
        slug: p.slug,
        description: p.description,
      });

      return {
        listingId: p.id,
        productId: p.id,
        storeId: p.storeId,
        productName: p.name,
        productSlug: p.slug || sanitizeSlug(p.name),
        brand: p.brand,
        description: p.description,
        categoryId: normalizedCatId,
        categoryName: getCanonicalCategoryName(normalizedCatId),
        imageKey: p.imageKey || 'gpu',
        imageUrl: p.imageUrl ? p.imageUrl : null,
        popularity: Math.min(999, 50 + (p.soldCount || 0)),
        soldCount: p.soldCount || 0,
        priceHistory: [{ price: p.price, recordedAt: updatedIso }],
        price: p.price,
        currency: p.currency || 'DZD',
        stockQuantity: p.stockQuantity,
        availabilityStatus: p.availabilityStatus,
        availabilityUpdatedAt: updatedIso,
        isStale: false,
        isActive: p.isActive,
        isLowestPrice:
          p.availabilityStatus === 'in_stock' &&
          lowest !== undefined &&
          p.price === lowest &&
          offerCount > 1,
        storeOfferCount: offerCount,
        storeType: cStore?.storeType ?? lStore?.storeType ?? 'physical_store',
        storeName: cStore?.name || lStore?.name || p.storeName,
        storeSlug: cStore?.slug || lStore?.slug || sanitizeSlug(p.storeName, 'store'),
        storeArea: areaName,
        storeAddress: lStore?.address || `${areaName}, Djelfa`,
        storePhone: lStore?.phone || '0662 45 11 09',
        storeWhatsapp: lStore?.whatsapp || '213662451109',
        storeIsOpen: cStore?.isOpen ?? lStore?.isOpen ?? true,
        storeRating: cStore?.rating ?? lStore?.rating ?? 4.8,
        storeDeliveryZones: lStore?.deliveryZones || [areaName],
        storeDeliveryFee: cStore?.deliveryFee ?? lStore?.deliveryFee ?? 200,
        storeDeliveryRadiusKm: cStore?.deliveryRadiusKm ?? lStore?.deliveryRadiusKm ?? 10,
        distanceKm,
      };
    });
}

export interface SearchFilterOptions {
  q: string;
  categoryId: string;
  inStockOnly: boolean;
  openOnly: boolean;
  maxDistanceKm: string;
  sortBy: string;
}

export function mergeAndFilterListings(
  apiListings: EnrichedListing[],
  firestoreListings: EnrichedListing[],
  filters: SearchFilterOptions
): EnrichedListing[] {
  const mergedMap = new Map<string, EnrichedListing>();

  for (const item of apiListings) {
    mergedMap.set(item.listingId, item);
  }

  for (const fsItem of firestoreListings) {
    const existing = mergedMap.get(fsItem.listingId);
    if (existing) {
      mergedMap.set(fsItem.listingId, {
        ...existing,
        productName: fsItem.productName || existing.productName,
        brand: fsItem.brand || existing.brand,
        description: fsItem.description || existing.description,
        categoryId: fsItem.categoryId || existing.categoryId,
        categoryName: fsItem.categoryName || existing.categoryName,
        imageKey: fsItem.imageKey || existing.imageKey,
        imageUrl: fsItem.imageUrl ?? existing.imageUrl,
        price: fsItem.price,
        stockQuantity: fsItem.stockQuantity,
        availabilityStatus: fsItem.availabilityStatus,
        soldCount: Math.max(existing.soldCount, fsItem.soldCount),
        storeIsOpen: fsItem.storeIsOpen,
        storeName: fsItem.storeName || existing.storeName,
      });
    } else {
      mergedMap.set(fsItem.listingId, fsItem);
    }
  }

  let items = Array.from(mergedMap.values());

  // Recompute lowest price & offer counts across combined catalog
  const lowestByProd = new Map<string, number>();
  const countByProd = new Map<string, number>();
  for (const item of items) {
    const prodKey = item.productSlug || item.productId;
    countByProd.set(prodKey, (countByProd.get(prodKey) || 0) + 1);
    if (item.availabilityStatus === 'in_stock') {
      const cur = lowestByProd.get(prodKey);
      if (cur === undefined || item.price < cur) {
        lowestByProd.set(prodKey, item.price);
      }
    }
  }
  items = items.map((item) => {
    const prodKey = item.productSlug || item.productId;
    const count = countByProd.get(prodKey) || item.storeOfferCount;
    const lowest = lowestByProd.get(prodKey);
    return {
      ...item,
      storeOfferCount: count,
      isLowestPrice:
        item.availabilityStatus === 'in_stock' &&
        lowest !== undefined &&
        item.price === lowest &&
        count > 1,
    };
  });

  const q = filters.q.trim().toLowerCase();
  if (q) {
    const tokens = q.split(/\s+/).filter(Boolean);
    items = items.filter((l) => {
      const hay = `${l.productName} ${l.brand} ${l.categoryName} ${l.storeName} ${l.storeArea} ${l.description}`.toLowerCase();
      return tokens.every(
        (tok) => hay.includes(tok) || (tok.length > 3 && hay.includes(tok.slice(0, tok.length - 1)))
      );
    });
  }

  if (filters.categoryId && filters.categoryId !== 'all') {
    items = items.filter((l) => l.categoryId === filters.categoryId);
  }

  if (filters.inStockOnly) {
    items = items.filter((l) => l.availabilityStatus === 'in_stock');
  }

  if (filters.openOnly) {
    items = items.filter((l) => l.storeIsOpen);
  }

  const maxDist = filters.maxDistanceKm ? Number(filters.maxDistanceKm) : null;
  if (maxDist && Number.isFinite(maxDist)) {
    items = items.filter((l) => l.distanceKm === null || l.distanceKm <= maxDist);
  }

  const stockRank = (s: AvailabilityStatus) => (s === 'in_stock' ? 0 : s === 'unconfirmed' ? 1 : 2);
  items.sort((a, b) => {
    if (filters.sortBy === 'lowest_price') {
      const sr = stockRank(a.availabilityStatus) - stockRank(b.availabilityStatus);
      return sr !== 0 ? sr : a.price - b.price;
    }
    if (filters.sortBy === 'highest_price') {
      return b.price - a.price;
    }
    if (filters.sortBy === 'closest') {
      const da = a.distanceKm ?? 999;
      const db = b.distanceKm ?? 999;
      return da !== db ? da - db : stockRank(a.availabilityStatus) - stockRank(b.availabilityStatus);
    }
    if (filters.sortBy === 'popular') {
      return b.soldCount !== a.soldCount ? b.soldCount - a.soldCount : b.popularity - a.popularity;
    }
    if (filters.sortBy === 'rating') {
      return b.storeRating - a.storeRating;
    }
    const sr = stockRank(a.availabilityStatus) - stockRank(b.availabilityStatus);
    if (sr !== 0) return sr;
    return b.soldCount !== a.soldCount ? b.soldCount - a.soldCount : b.popularity - a.popularity;
  });

  return items;
}

export async function fetchFirestoreProductOffersBySlug(
  productSlug: string,
  localStores: Store[] = [],
  originCoords: { lat: number; lng: number } | null = null
): Promise<EnrichedListing[]> {
  const { products, stores } = await fetchFirestoreCatalogSnapshot();
  const matching = products.filter(
    (p) => p.slug === productSlug || p.id === productSlug
  );
  if (matching.length === 0) return [];
  return buildEnrichedListingsFromFirestore(matching, stores, localStores, originCoords).sort((a, b) => {
    if (a.availabilityStatus === 'in_stock' && b.availabilityStatus !== 'in_stock') return -1;
    if (b.availabilityStatus === 'in_stock' && a.availabilityStatus !== 'in_stock') return 1;
    return a.price - b.price;
  });
}

export async function fetchFirestoreStoreBySlug(
  storeSlug: string,
  localStores: Store[] = [],
  originCoords: { lat: number; lng: number } | null = null
): Promise<{
  store: (Store & { distanceKm?: number | null }) | null;
  listings: EnrichedListing[];
}> {
  const { products, stores } = await fetchFirestoreCatalogSnapshot();
  const cStore = stores.find((s) => s.slug === storeSlug || s.id === storeSlug);
  if (!cStore) return { store: null, listings: [] };

  const storeProducts = products.filter((p) => p.storeId === cStore.id);
  const listings = buildEnrichedListingsFromFirestore(
    storeProducts,
    stores,
    localStores,
    originCoords
  );
  const normalizedArea = normalizeDjelfaArea(cStore.area).area;
  const coords = { lat: normalizedArea.lat, lng: normalizedArea.lng };
  const distanceKm = originCoords
    ? calcDistanceKm(originCoords.lat, originCoords.lng, coords.lat, coords.lng)
    : null;

  const normalizedStore: Store & { distanceKm?: number | null } = {
    id: cStore.id,
    ownerId: cStore.ownerUid,
    storeType: cStore.storeType || 'physical_store',
    name: cStore.name,
    slug: cStore.slug,
    description: cStore.description,
    logoUrl: cStore.logoUrl || null,
    area: normalizedArea.name,
    address: `${normalizedArea.name}, Djelfa`,
    city: 'Djelfa',
    lat: coords.lat,
    lng: coords.lng,
    phone: '0662 45 11 09',
    whatsapp: cStore.whatsapp || '213662451109',
    facebookUrl: cStore.facebookUrl || null,
    instagramUrl: cStore.instagramUrl || null,
    googleMapsUrl: cStore.googleMapsUrl || null,
    categories: ['cat-pc-parts'],
    openingHours: cStore.openingHours,
    isOpen: cStore.isOpen,
    rating: cStore.rating,
    reviewCount: cStore.reviewCount,
    approvalStatus: 'approved',
    accentColor: '#9678CE',
    deliveryZones: [normalizedArea.name],
    deliveryFee: cStore.deliveryFee,
    deliveryRadiusKm: cStore.deliveryRadiusKm,
    createdAt: timestampToIso(cStore.createdAt),
    updatedAt: timestampToIso(cStore.updatedAt),
    distanceKm,
  };

  return { store: normalizedStore, listings };
}
