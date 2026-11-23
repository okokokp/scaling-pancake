import React, { useCallback, useEffect, useState } from 'react';
import {
  AlertCircle,
  Award,
  BarChart3,
  Check,
  Cloud,
  Copy,
  Database,
  Download,
  ExternalLink,
  FileSpreadsheet,
  Flame,
  Globe,
  ImagePlus,
  MapPin,
  MessageCircle,
  MessageSquare,
  Navigation,
  Package,
  Pencil,
  Phone,
  Plus,
  QrCode,
  RefreshCw,
  Search,
  Settings,
  Store as StoreIcon,
  Trash2,
  TrendingUp,
  Truck,
  Upload,
  UserCircle,
  X,
} from 'lucide-react';
import type {
  AvailabilityStatus,
  Category,
  ElOuedArea,
  Inquiry,
  LanguageCode,
  Order,
  PriceHistoryPoint,
  PublicUser,
  SellerBusinessType,
  Store,
} from '../../shared/types.ts';
import { DJELFA_AREAS, getAreaDisplayName } from '../../shared/locationConfig.ts';
import { CANONICAL_CATEGORIES, normalizeCategoryId } from '../../shared/taxonomy.ts';
import { apiFetch } from '../lib/api.ts';
import { DashboardTableSkeleton } from './Skeletons.tsx';
import {
  deleteSellerProductFromFirestore,
  recordProductSaleInFirestore,
  saveSellerProductToFirestore,
  saveStoreProfileToFirestore,
  subscribePublicBestSellers,
  subscribeSellerProducts,
  syncMerchantCatalogToFirestore,
  toggleBestSellerFlagInFirestore,
  type FirestoreBestSellingProduct,
  type FirestoreSellerProduct,
} from '../lib/firestoreProducts.ts';
import { formatDzd, formatRelativeTime } from '../lib/format.ts';
import {
  extractSpreadsheetId,
  fetchGoogleSheetRows,
  fetchGoogleSpreadsheetMetadata,
  getGoogleSheetsAccessToken,
  initGoogleSheetsAuth,
  signInWithGoogleSheets,
  signOutGoogleSheets,
  type GoogleSheetTabInfo,
} from '../lib/googleSheetsAuth.ts';
import {
  downloadExcelTemplate,
  mapMatrixToImportRows,
  parseSpreadsheetFile,
  type ParsedProductImportRow,
} from '../lib/spreadsheetImport.ts';
import { useFirebase } from './FirebaseProvider.tsx';
import { PriceHistorySparkline } from './PriceHistorySparkline.tsx';
import { ProductArtwork } from './ProductArtwork.tsx';
import { SellerQRPrintModal } from './SellerQRPrintModal.tsx';

interface MerchantListingRow {
  id: string;
  storeId: string;
  storeName: string;
  productId: string;
  productSlug?: string;
  productName: string;
  brand: string;
  description: string;
  categoryId: string;
  categoryName: string;
  imageKey: string;
  imageUrl?: string | null;
  price: number;
  stockQuantity: number | null;
  availabilityStatus: AvailabilityStatus;
  availabilityUpdatedAt: string;
  isActive: boolean;
  soldCount?: number;
  priceHistory?: PriceHistoryPoint[];
}

interface MerchantDashboardProps {
  user: PublicUser | null;
  lang: LanguageCode;
  notify: (msg: string, type?: 'success' | 'error') => void;
  onMarketplaceMutated: () => void;
  onOpenStore: (slug: string) => void;
  onOpenDashboard?: () => void;
}

const IMAGE_KEY_OPTIONS = [
  { id: 'gpu', label: 'Graphics Card (GPU)' },
  { id: 'cpu', label: 'Processor (CPU)' },
  { id: 'ssd', label: 'NVMe SSD / Storage' },
  { id: 'ram', label: 'RAM Memory' },
  { id: 'cooler', label: 'Cooler / Thermal' },
  { id: 'pc-case', label: 'PC Case / Chassis' },
  { id: 'psu', label: 'Power Supply (PSU)' },
  { id: 'phone', label: 'iPhone / Smartphone' },
  { id: 'phone-android', label: 'Android Smartphone' },
  { id: 'charger', label: 'Charger / Adapter' },
  { id: 'powerbank', label: 'Power Bank' },
  { id: 'case', label: 'Phone Case / Glass' },
  { id: 'earbuds', label: 'Earbuds / Audio' },
  { id: 'console', label: 'Console (PS5 / Xbox)' },
  { id: 'controller', label: 'Gaming Controller' },
  { id: 'headset', label: 'Gaming Headset' },
  { id: 'monitor', label: 'Monitor / Display' },
  { id: 'keyboard', label: 'Keyboard' },
  { id: 'mouse', label: 'Mouse' },
  { id: 'router', label: 'Router / Wi-Fi' },
];

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('Could not read selected image file.'));
    reader.readAsDataURL(file);
  });
}

export const MerchantDashboard: React.FC<MerchantDashboardProps> = ({
  user,
  lang,
  notify,
  onMarketplaceMutated,
  onOpenStore,
  onOpenDashboard,
}) => {
  const isAr = lang === 'ar';
  const {
    firebaseUser,
    authReady,
    dbStatus,
    signingIn: fbSigningIn,
    signInWithGoogle,
    signOutFirebase,
  } = useFirebase();
  const [tab, setTab] = useState<'profile' | 'orders' | 'products' | 'bestsellers' | 'inquiries' | 'settings'>('products');
  const [loading, setLoading] = useState(true);
  const [stores, setStores] = useState<Store[]>([]);
  const [listings, setListings] = useState<MerchantListingRow[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [inquiries, setInquiries] = useState<Inquiry[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [areas, setAreas] = useState<ElOuedArea[]>([]);
  const [prodFilter, setProdFilter] = useState('');

  // Firestore Cloud DB state
  const [cloudProducts, setCloudProducts] = useState<FirestoreSellerProduct[]>([]);
  const [cloudBestSellers, setCloudBestSellers] = useState<FirestoreBestSellingProduct[]>([]);
  const [syncingCloud, setSyncingCloud] = useState(false);
  const [recordingSaleId, setRecordingSaleId] = useState<string | null>(null);

  // Add product form
  const [showAddProd, setShowAddProd] = useState(false);
  const [newProdStoreId, setNewProdStoreId] = useState('');
  const [newProdName, setNewProdName] = useState('');
  const [newProdBrand, setNewProdBrand] = useState('');
  const [newProdDesc, setNewProdDesc] = useState('');
  const [newProdCatId, setNewProdCatId] = useState('cat-pc-parts');
  const [newProdImageKey, setNewProdImageKey] = useState('gpu');
  const [newProdImageUrl, setNewProdImageUrl] = useState('');
  const [newProdUploadingPhoto, setNewProdUploadingPhoto] = useState(false);
  const [newProdPrice, setNewProdPrice] = useState('3500');
  const [newProdQty, setNewProdQty] = useState('15');
  const [newProdStatus, setNewProdStatus] = useState<AvailabilityStatus>('in_stock');

  // Edit product modal
  const [editingListing, setEditingListing] = useState<MerchantListingRow | null>(null);
  const [editName, setEditName] = useState('');
  const [editBrand, setEditBrand] = useState('');
  const [editDesc, setEditDesc] = useState('');
  const [editCatId, setEditCatId] = useState('cat-pc-parts');
  const [editImageKey, setEditImageKey] = useState('gpu');
  const [editImageUrl, setEditImageUrl] = useState('');
  const [editUploadingPhoto, setEditUploadingPhoto] = useState(false);
  const [editPrice, setEditPrice] = useState('');
  const [editQty, setEditQty] = useState('');
  const [editStatus, setEditStatus] = useState<AvailabilityStatus>('in_stock');
  const [editActive, setEditActive] = useState(true);
  const [savingEdit, setSavingEdit] = useState(false);

  // Bulk import (Excel / CSV or Google Sheets)
  const [showBulkImport, setShowBulkImport] = useState(false);
  const [importMode, setImportMode] = useState<'excel' | 'google_sheets'>('excel');
  const [importStoreId, setImportStoreId] = useState('');
  const [importRows, setImportRows] = useState<ParsedProductImportRow[]>([]);
  const [importSourceLabel, setImportSourceLabel] = useState('');
  const [importingBulk, setImportingBulk] = useState(false);

  // Google Sheets OAuth & fetch state (access token kept strictly in memory)
  const [googleAccessToken, setGoogleAccessToken] = useState<string | null>(() =>
    getGoogleSheetsAccessToken()
  );
  const [googleUserEmail, setGoogleUserEmail] = useState<string | null>(null);
  const [googleSigningIn, setGoogleSigningIn] = useState(false);
  const [sheetUrlInput, setSheetUrlInput] = useState('');
  const [sheetTitle, setSheetTitle] = useState('');
  const [sheetTabs, setSheetTabs] = useState<GoogleSheetTabInfo[]>([]);
  const [selectedSheetTab, setSelectedSheetTab] = useState('');
  const [loadingSheetMeta, setLoadingSheetMeta] = useState(false);
  const [loadingSheetRows, setLoadingSheetRows] = useState(false);

  // Create new store form
  const [showNewStore, setShowNewStore] = useState(false);
  const [newStoreType, setNewStoreType] = useState<SellerBusinessType>('physical_store');
  const [storeName, setStoreName] = useState('');
  const [storeDesc, setStoreDesc] = useState('');
  const [storeArea, setStoreArea] = useState(DJELFA_AREAS[0].name);
  const [storeAddress, setStoreAddress] = useState('');
  const [storePhone, setStorePhone] = useState('0662 45 11 09');
  const [storeHours, setStoreHours] = useState('08:00 - 22:00');
  const [storeInstagramInput, setStoreInstagramInput] = useState('');
  const [storeFacebookInput, setStoreFacebookInput] = useState('');
  const [storeZonesInput, setStoreZonesInput] = useState<string[]>([
    DJELFA_AREAS[0].name,
    DJELFA_AREAS[1].name,
  ]);
  const [storeFeeInput, setStoreFeeInput] = useState('200');
  const [storeRadiusInput, setStoreRadiusInput] = useState('10');

  // Store delivery zone editor state keyed by storeId
  const [zoneDrafts, setZoneDrafts] = useState<
    Record<string, { deliveryZones: string[]; deliveryFee: number; deliveryRadiusKm: number }>
  >({});
  const [savingZoneStoreId, setSavingZoneStoreId] = useState<string | null>(null);

  // Store profile editor state keyed by storeId
  const [profileStoreId, setProfileStoreId] = useState<string>('');
  const [profileDrafts, setProfileDrafts] = useState<
    Record<
      string,
      {
        name: string;
        storeType: SellerBusinessType;
        description: string;
        area: string;
        address: string;
        openingHours: string;
        phone: string;
        whatsapp: string;
        logoUrl: string;
        facebookUrl: string;
        instagramUrl: string;
        googleMapsUrl: string;
      }
    >
  >({});
  const [savingProfileStoreId, setSavingProfileStoreId] = useState<string | null>(null);
  const [uploadingLogoStoreId, setUploadingLogoStoreId] = useState<string | null>(null);
  const [logoPreviewError, setLogoPreviewError] = useState(false);

  const [replyTexts, setReplyTexts] = useState<Record<string, string>>({});
  const [qrModalOpen, setQrModalOpen] = useState(false);
  const [qrInitialStoreId, setQrInitialStoreId] = useState<string | null>(null);

  useEffect(() => {
    const unsub = initGoogleSheetsAuth(
      (gUser, token) => {
        setGoogleAccessToken(token);
        setGoogleUserEmail(gUser.email || gUser.displayName || 'Google Account');
      },
      () => {
        setGoogleAccessToken(null);
        setGoogleUserEmail(null);
      }
    );
    return () => unsub();
  }, []);

  const loadDashboard = useCallback(async (): Promise<{
    stores: Store[];
    listings: MerchantListingRow[];
  } | null> => {
    if (!user || !user.roles.includes('merchant')) {
      setLoading(false);
      return null;
    }
    setLoading(true);
    try {
      const data = await apiFetch<{
        stores: Store[];
        listings: MerchantListingRow[];
        orders: Order[];
        inquiries: Inquiry[];
        categories: Category[];
        areas: ElOuedArea[];
      }>('/api/merchant/dashboard');
      setStores(data.stores);
      setListings(data.listings);
      setOrders(data.orders);
      setInquiries(data.inquiries);
      setCategories(
        data.categories && data.categories.length > 0 ? data.categories : CANONICAL_CATEGORIES
      );
      setAreas(data.areas);

      const drafts: Record<
        string,
        { deliveryZones: string[]; deliveryFee: number; deliveryRadiusKm: number }
      > = {};
      const nextProfileDrafts: Record<
        string,
        {
          name: string;
          storeType: SellerBusinessType;
          description: string;
          area: string;
          address: string;
          openingHours: string;
          phone: string;
          whatsapp: string;
          logoUrl: string;
          facebookUrl: string;
          instagramUrl: string;
          googleMapsUrl: string;
        }
      > = {};
      for (const s of data.stores) {
        drafts[s.id] = {
          deliveryZones:
            s.deliveryZones && s.deliveryZones.length > 0 ? s.deliveryZones : [s.area],
          deliveryFee: s.deliveryFee ?? 200,
          deliveryRadiusKm: s.deliveryRadiusKm ?? 10,
        };
        nextProfileDrafts[s.id] = {
          name: s.name || '',
          storeType: s.storeType || 'physical_store',
          description: s.description || '',
          area: s.area || DJELFA_AREAS[0].name,
          address: s.address || '',
          openingHours: s.openingHours || '08:00 - 22:00',
          phone: s.phone || '',
          whatsapp: s.whatsapp || '',
          logoUrl: s.logoUrl || '',
          facebookUrl: s.facebookUrl || '',
          instagramUrl: s.instagramUrl || '',
          googleMapsUrl: s.googleMapsUrl || '',
        };
      }
      setZoneDrafts(drafts);
      setProfileDrafts(nextProfileDrafts);

      if (data.stores[0]) {
        setNewProdStoreId((prev) => prev || data.stores[0].id);
        setImportStoreId((prev) => prev || data.stores[0].id);
        setProfileStoreId((prev) =>
          prev && data.stores.some((st) => st.id === prev) ? prev : data.stores[0].id
        );
      }
      return { stores: data.stores, listings: data.listings };
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Could not load merchant dashboard.', 'error');
      return null;
    } finally {
      setLoading(false);
    }
  }, [user, notify]);

  useEffect(() => {
    loadDashboard();
  }, [loadDashboard]);

  // Subscribe to public best-selling products in Firestore
  useEffect(() => {
    const unsub = subscribePublicBestSellers(
      (rows) => setCloudBestSellers(rows),
      (err) => console.warn('Firestore best sellers subscription:', err.message)
    );
    return () => unsub();
  }, []);

  // Subscribe to authenticated seller's saved products in Firestore
  useEffect(() => {
    if (!authReady || !firebaseUser || !firebaseUser.emailVerified) {
      setCloudProducts([]);
      return;
    }
    const unsub = subscribeSellerProducts(
      firebaseUser.uid,
      (rows) => setCloudProducts(rows),
      (err) => console.warn('Firestore seller products subscription:', err.message)
    );
    return () => unsub();
  }, [authReady, firebaseUser]);

  if (!user || !user.roles.includes('merchant')) {
    return (
      <div
        dir={isAr ? 'rtl' : 'ltr'}
        className="mx-auto max-w-2xl rounded-3xl border border-[#E5DDF5] bg-white p-10 text-center dark:border-[#22222C] dark:bg-[#0E0E13]"
      >
        <StoreIcon className="mx-auto h-10 w-10 text-[#4A3894] dark:text-[#9678CE]" />
        <h2 className="font-display mt-3 text-xl font-bold">
          {isAr ? 'بوابة التاجر' : 'Seller Studio'}
        </h2>
        <p className="mt-1 text-sm text-[#60567E] dark:text-[#AEA2CB]">
          {isAr
            ? 'سجّل الدخول بحساب تاجر لإدارة واجهة متجرك والمخزون والطلبات على ماركتلي.'
            : 'Sign in with a seller account to manage storefronts, inventory, and orders on Marketly.'}
        </p>
      </div>
    );
  }

  const uploadProductPhotoFile = async (
    file: File,
    onSuccessUrl: (url: string) => void,
    setBusy: (busy: boolean) => void
  ) => {
    if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) {
      notify('Please choose a PNG, JPG, or WebP image file.', 'error');
      return;
    }
    if (file.size > 2_000_000) {
      notify('Image must be 2MB or smaller.', 'error');
      return;
    }
    setBusy(true);
    try {
      const dataUrl = await fileToDataUrl(file);
      const res = await apiFetch<{ imageUrl: string }>('/api/merchant/upload-photo', {
        method: 'POST',
        body: JSON.stringify({ dataUrl }),
      });
      onSuccessUrl(res.imageUrl);
      notify('Product photo uploaded!');
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Photo upload failed.', 'error');
    } finally {
      setBusy(false);
    }
  };

  const openEditModal = (item: MerchantListingRow) => {
    setEditingListing(item);
    setEditName(item.productName);
    setEditBrand(item.brand);
    setEditDesc(item.description || '');
    setEditCatId(normalizeCategoryId(item.categoryId, { imageKey: item.imageKey, name: item.productName }));
    setEditImageKey(item.imageKey || 'gpu');
    setEditImageUrl(item.imageUrl || '');
    setEditPrice(String(item.price));
    setEditQty(item.stockQuantity !== null && item.stockQuantity !== undefined ? String(item.stockQuantity) : '');
    setEditStatus(item.availabilityStatus);
    setEditActive(item.isActive);
  };

  const syncSingleListingToCloud = async (listing: MerchantListingRow) => {
    if (!firebaseUser || !firebaseUser.emailVerified) return;
    const store = stores.find((s) => s.id === listing.storeId) || stores[0];
    if (!store) return;
    await saveSellerProductToFirestore(firebaseUser, {
      id: listing.id,
      store,
      name: listing.productName,
      slug: listing.productSlug || listing.productName,
      brand: listing.brand,
      description: listing.description || `${listing.brand} ${listing.productName}`,
      categoryId: listing.categoryId || 'cat-pc-parts',
      categoryName: listing.categoryName || 'Hardware',
      imageKey: listing.imageKey || 'gpu',
      imageUrl: listing.imageUrl || '',
      price: listing.price,
      stockQuantity: listing.stockQuantity,
      availabilityStatus: listing.availabilityStatus,
      soldCount: listing.soldCount ?? 0,
      revenueTotal: (listing.soldCount ?? 0) * listing.price,
      isActive: listing.isActive,
      isBestSeller: (listing.soldCount ?? 0) >= 25,
    });
  };

  const handleSyncAllToFirestore = async () => {
    if (!firebaseUser) {
      try {
        const gUser = await signInWithGoogle();
        notify(`Connected ${gUser.email || 'Google Account'} to Firestore Cloud DB.`);
      } catch (err) {
        notify(err instanceof Error ? err.message : 'Google sign-in failed.', 'error');
      }
      return;
    }
    if (!firebaseUser.emailVerified) {
      notify('Please use a verified Google account email.', 'error');
      return;
    }
    setSyncingCloud(true);
    try {
      const payload = listings
        .map((l) => {
          const store = stores.find((s) => s.id === l.storeId) || stores[0];
          if (!store) return null;
          return {
            id: l.id,
            store,
            name: l.productName,
            slug: l.productSlug || l.productName,
            brand: l.brand,
            description: l.description || `${l.brand} ${l.productName}`,
            categoryId: l.categoryId || 'cat-pc-parts',
            categoryName: l.categoryName || 'Hardware',
            imageKey: l.imageKey || 'gpu',
            imageUrl: l.imageUrl || '',
            price: l.price,
            stockQuantity: l.stockQuantity,
            availabilityStatus: l.availabilityStatus,
            soldCount: l.soldCount ?? 0,
            revenueTotal: (l.soldCount ?? 0) * l.price,
            isActive: l.isActive,
            isBestSeller: (l.soldCount ?? 0) >= 25,
          };
        })
        .filter((x): x is NonNullable<typeof x> => Boolean(x));

      const res = await syncMerchantCatalogToFirestore(firebaseUser, stores, payload);
      notify(`Saved ${res.syncedCount} products & best-seller stats to Firestore database!`);
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Cloud sync failed.', 'error');
    } finally {
      setSyncingCloud(false);
    }
  };

  const handleRecordListingSale = async (listing: MerchantListingRow, units = 1) => {
    setRecordingSaleId(listing.id);
    try {
      await apiFetch(`/api/merchant/listings/${listing.id}/record-sale`, {
        method: 'POST',
        body: JSON.stringify({ units }),
      });

      if (firebaseUser && firebaseUser.emailVerified) {
        const existingCloud = cloudProducts.find((c) => c.id === listing.id);
        if (existingCloud) {
          await recordProductSaleInFirestore(existingCloud, units);
        } else {
          await syncSingleListingToCloud({
            ...listing,
            soldCount: (listing.soldCount ?? 0) + units,
            stockQuantity:
              listing.stockQuantity !== null ? Math.max(0, listing.stockQuantity - units) : null,
          });
        }
      }

      notify(`Recorded +${units} sale for ${listing.productName}!`);
      await loadDashboard();
      onMarketplaceMutated();
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Could not record sale.', 'error');
    } finally {
      setRecordingSaleId(null);
    }
  };

  const handleRecordCloudSale = async (cloudItem: FirestoreSellerProduct, units = 1) => {
    setRecordingSaleId(cloudItem.id);
    try {
      await recordProductSaleInFirestore(cloudItem, units);
      // Also mirror to local API if matching listing exists
      const localMatch = listings.find((l) => l.id === cloudItem.id);
      if (localMatch) {
        await apiFetch(`/api/merchant/listings/${localMatch.id}/record-sale`, {
          method: 'POST',
          body: JSON.stringify({ units }),
        }).catch(() => {});
        await loadDashboard();
        onMarketplaceMutated();
      }
      notify(`Saved +${units} sale for ${cloudItem.name} in Firestore!`);
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Could not update Firestore sale.', 'error');
    } finally {
      setRecordingSaleId(null);
    }
  };

  const handleSaveEditListing = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingListing) return;
    setSavingEdit(true);
    try {
      await apiFetch(`/api/merchant/listings/${editingListing.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          name: editName.trim(),
          brand: editBrand.trim(),
          description: editDesc.trim(),
          categoryId: editCatId,
          imageKey: editImageKey,
          imageUrl: editImageUrl.trim() ? editImageUrl.trim() : null,
          price: Math.round(Number(editPrice)),
          stockQuantity: editQty.trim() !== '' ? Number(editQty) : null,
          availabilityStatus: editStatus,
          isActive: editActive,
        }),
      });
      if (firebaseUser && firebaseUser.emailVerified) {
        const cat = categories.find((c) => c.id === editCatId);
        await syncSingleListingToCloud({
          ...editingListing,
          productName: editName.trim(),
          brand: editBrand.trim(),
          description: editDesc.trim(),
          categoryId: editCatId,
          categoryName: cat?.name || editingListing.categoryName,
          imageKey: editImageKey,
          imageUrl: editImageUrl.trim() ? editImageUrl.trim() : '',
          price: Math.round(Number(editPrice)),
          stockQuantity: editQty.trim() !== '' ? Number(editQty) : editingListing.stockQuantity,
          availabilityStatus: editStatus,
          isActive: editActive,
        });
      }
      notify('Product listing updated!');
      setEditingListing(null);
      await loadDashboard();
      onMarketplaceMutated();
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Could not save product changes.', 'error');
    } finally {
      setSavingEdit(false);
    }
  };

  const updateOrderStatus = async (orderId: string, nextStatus: string) => {
    try {
      await apiFetch(`/api/merchant/orders/${orderId}/status`, {
        method: 'POST',
        body: JSON.stringify({ nextStatus }),
      });
      notify(`Order updated to ${nextStatus}.`);
      await loadDashboard();
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Status update failed.', 'error');
    }
  };

  const quickUpdateAvailability = async (listingId: string, availabilityStatus: AvailabilityStatus) => {
    try {
      await apiFetch(`/api/merchant/listings/${listingId}`, {
        method: 'PATCH',
        body: JSON.stringify({ availabilityStatus }),
      });
      const existing = listings.find((l) => l.id === listingId);
      if (existing && firebaseUser && firebaseUser.emailVerified) {
        await syncSingleListingToCloud({ ...existing, availabilityStatus }).catch(() => {});
      }
      notify(`Stock updated to ${availabilityStatus.replace('_', ' ')}.`);
      await loadDashboard();
      onMarketplaceMutated();
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Update failed.', 'error');
    }
  };

  const updateListingPrice = async (listingId: string, price: number) => {
    if (!Number.isFinite(price) || price < 1) return;
    try {
      const rounded = Math.round(price);
      await apiFetch(`/api/merchant/listings/${listingId}`, {
        method: 'PATCH',
        body: JSON.stringify({ price: rounded }),
      });
      const existing = listings.find((l) => l.id === listingId);
      if (existing && firebaseUser && firebaseUser.emailVerified) {
        await syncSingleListingToCloud({ ...existing, price: rounded }).catch(() => {});
      }
      notify('Price updated & recorded in history.');
      await loadDashboard();
      onMarketplaceMutated();
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Price update failed.', 'error');
    }
  };

  const handleDuplicate = async (listingId: string) => {
    try {
      const res = await apiFetch<{ listing: { id: string } }>(
        `/api/merchant/listings/${listingId}/duplicate`,
        { method: 'POST' }
      );
      const original = listings.find((l) => l.id === listingId);
      if (original && firebaseUser && firebaseUser.emailVerified) {
        await syncSingleListingToCloud({
          ...original,
          id: res.listing.id,
        }).catch(() => {});
      }
      notify('Listing duplicated.');
      await loadDashboard();
      onMarketplaceMutated();
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Duplicate failed.', 'error');
    }
  };

  const handleDeleteListing = async (listingId: string) => {
    try {
      await apiFetch(`/api/merchant/listings/${listingId}`, { method: 'DELETE' });
      if (firebaseUser && firebaseUser.emailVerified) {
        await deleteSellerProductFromFirestore(listingId).catch(() => {});
      }
      notify('Listing removed.');
      await loadDashboard();
      onMarketplaceMutated();
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Delete failed.', 'error');
    }
  };

  const handleCreateProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const targetStoreId = newProdStoreId || stores[0]?.id;
      const created = await apiFetch<{ listing: { id: string; productId: string } }>('/api/merchant/listings', {
        method: 'POST',
        body: JSON.stringify({
          storeId: targetStoreId,
          name: newProdName,
          brand: newProdBrand,
          description: newProdDesc,
          categoryId: newProdCatId,
          imageKey: newProdImageKey,
          imageUrl: newProdImageUrl.trim() ? newProdImageUrl.trim() : null,
          price: Number(newProdPrice),
          stockQuantity: newProdQty ? Number(newProdQty) : null,
          availabilityStatus: newProdStatus,
        }),
      });
      if (firebaseUser && firebaseUser.emailVerified) {
        const store = stores.find((s) => s.id === targetStoreId) || stores[0];
        const cat = categories.find((c) => c.id === newProdCatId);
        if (store) {
          await saveSellerProductToFirestore(firebaseUser, {
            id: created.listing.id,
            store,
            name: newProdName,
            brand: newProdBrand,
            description: newProdDesc,
            categoryId: newProdCatId,
            categoryName: cat?.name || 'Hardware',
            imageKey: newProdImageKey,
            imageUrl: newProdImageUrl.trim() ? newProdImageUrl.trim() : '',
            price: Number(newProdPrice),
            stockQuantity: newProdQty ? Number(newProdQty) : 0,
            availabilityStatus: newProdStatus,
            soldCount: 0,
            revenueTotal: 0,
            isActive: true,
            isBestSeller: false,
          }).catch(() => {});
        }
      }
      notify(
        firebaseUser?.emailVerified
          ? 'Product saved to storefront & Firestore database!'
          : 'Product added to storefront!'
      );
      setShowAddProd(false);
      setNewProdName('');
      setNewProdBrand('');
      setNewProdDesc('');
      setNewProdImageUrl('');
      await loadDashboard();
      onMarketplaceMutated();
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Could not create listing.', 'error');
    }
  };

  const handleExcelFileSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const parsed = await parseSpreadsheetFile(file);
      setImportRows(parsed);
      setImportSourceLabel(file.name);
      if (parsed.length === 0) {
        notify('No product rows found in spreadsheet.', 'error');
      } else {
        notify(`Parsed ${parsed.length} rows from ${file.name}.`);
      }
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Could not read spreadsheet file.', 'error');
    } finally {
      e.target.value = '';
    }
  };

  const handleGoogleSignIn = async () => {
    setGoogleSigningIn(true);
    try {
      const res = await signInWithGoogleSheets();
      setGoogleAccessToken(res.accessToken);
      setGoogleUserEmail(res.user.email || res.user.displayName || 'Google Account');
      notify('Connected to Google Sheets!');
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Google sign-in failed.', 'error');
    } finally {
      setGoogleSigningIn(false);
    }
  };

  const handleGoogleSignOut = async () => {
    await signOutGoogleSheets();
    setGoogleAccessToken(null);
    setGoogleUserEmail(null);
    setSheetTabs([]);
    setSelectedSheetTab('');
    notify('Disconnected Google Sheets.');
  };

  const handleLoadGoogleSheetTabs = async () => {
    if (!googleAccessToken) return;
    const spreadsheetId = extractSpreadsheetId(sheetUrlInput);
    if (!spreadsheetId) {
      notify('Paste a valid Google Sheets URL or Spreadsheet ID.', 'error');
      return;
    }
    setLoadingSheetMeta(true);
    try {
      const meta = await fetchGoogleSpreadsheetMetadata(spreadsheetId, googleAccessToken);
      setSheetTitle(meta.title);
      setSheetTabs(meta.sheets);
      if (meta.sheets[0]) {
        setSelectedSheetTab(meta.sheets[0].title);
      }
      notify(`Loaded "${meta.title}" (${meta.sheets.length} tab${meta.sheets.length === 1 ? '' : 's'}).`);
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Could not load Google Sheet tabs.', 'error');
    } finally {
      setLoadingSheetMeta(false);
    }
  };

  const handleFetchGoogleSheetRows = async () => {
    if (!googleAccessToken || !selectedSheetTab) return;
    const spreadsheetId = extractSpreadsheetId(sheetUrlInput);
    if (!spreadsheetId) return;
    setLoadingSheetRows(true);
    try {
      const matrix = await fetchGoogleSheetRows(spreadsheetId, selectedSheetTab, googleAccessToken);
      const parsed = mapMatrixToImportRows(matrix);
      setImportRows(parsed);
      setImportSourceLabel(`${sheetTitle || 'Google Sheet'} · ${selectedSheetTab}`);
      notify(`Loaded ${parsed.length} rows from "${selectedSheetTab}".`);
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Could not read rows from Google Sheet.', 'error');
    } finally {
      setLoadingSheetRows(false);
    }
  };

  const handleConfirmBulkImport = async () => {
    const validRows = importRows.filter((r) => !r.error);
    if (validRows.length === 0) {
      notify('Fix validation errors or load valid rows before importing.', 'error');
      return;
    }
    const targetStoreId = importStoreId || stores[0]?.id;
    if (!targetStoreId) {
      notify('Create or select a store first.', 'error');
      return;
    }
    setImportingBulk(true);
    try {
      const res = await apiFetch<{
        createdCount: number;
        updatedCount: number;
        totalProcessed: number;
      }>('/api/merchant/listings/bulk', {
        method: 'POST',
        body: JSON.stringify({
          storeId: targetStoreId,
          rows: validRows.slice(0, 100).map((r) => ({
            name: r.name,
            brand: r.brand,
            category: r.category,
            price: r.price,
            stockQuantity: r.stockQuantity,
            availabilityStatus: r.availabilityStatus,
            description: r.description,
            imageKey: r.imageKey,
            imageUrl: r.imageUrl,
          })),
        }),
      });
      setImportRows([]);
      setImportSourceLabel('');
      setShowBulkImport(false);
      const fresh = await loadDashboard();
      if (fresh && firebaseUser && firebaseUser.emailVerified) {
        const cloudPayload = fresh.listings
          .map((l) => {
            const store = fresh.stores.find((s) => s.id === l.storeId) || fresh.stores[0];
            if (!store) return null;
            return {
              id: l.id,
              store,
              name: l.productName,
              slug: l.productSlug || l.productName,
              brand: l.brand,
              description: l.description || `${l.brand} ${l.productName}`,
              categoryId: l.categoryId || 'cat-pc-parts',
              categoryName: l.categoryName || 'Hardware',
              imageKey: l.imageKey || 'gpu',
              imageUrl: l.imageUrl || '',
              price: l.price,
              stockQuantity: l.stockQuantity,
              availabilityStatus: l.availabilityStatus,
              soldCount: l.soldCount ?? 0,
              revenueTotal: (l.soldCount ?? 0) * l.price,
              isActive: l.isActive,
              isBestSeller: (l.soldCount ?? 0) >= 25,
            };
          })
          .filter((x): x is NonNullable<typeof x> => Boolean(x));
        await syncMerchantCatalogToFirestore(firebaseUser, fresh.stores, cloudPayload).catch(() => {});
      }
      notify(
        firebaseUser?.emailVerified
          ? `Imported ${res.totalProcessed} products (${res.createdCount} new, ${res.updatedCount} updated) & synced to Firestore!`
          : `Imported ${res.totalProcessed} products (${res.createdCount} new, ${res.updatedCount} updated)!`
      );
      onMarketplaceMutated();
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Bulk import failed.', 'error');
    } finally {
      setImportingBulk(false);
    }
  };

  const handleCreateStore = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await apiFetch('/api/merchant/stores', {
        method: 'POST',
        body: JSON.stringify({
          name: storeName,
          storeType: newStoreType,
          description: storeDesc,
          area: storeArea,
          address:
            newStoreType === 'online_page'
              ? storeAddress.trim() || `Online Storefront · ${storeArea}, Djelfa`
              : storeAddress,
          phone: storePhone,
          whatsapp: storePhone,
          openingHours: storeHours,
          facebookUrl: storeFacebookInput.trim() || null,
          instagramUrl: storeInstagramInput.trim() || null,
          categories: ['cat-pc-parts'],
          deliveryZones: storeZonesInput.length > 0 ? storeZonesInput : [storeArea],
          deliveryFee: Math.max(0, Number(storeFeeInput) || 200),
          deliveryRadiusKm: Math.max(1, Number(storeRadiusInput) || 10),
        }),
      });
      notify(
        newStoreType === 'online_page'
          ? 'Online Seller Page is now live!'
          : 'Physical Business storefront is now live!'
      );
      setShowNewStore(false);
      setStoreName('');
      setStoreDesc('');
      setStoreAddress('');
      setStoreInstagramInput('');
      setStoreFacebookInput('');
      await loadDashboard();
      onMarketplaceMutated();
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Could not create store.', 'error');
    }
  };

  const handleToggleStoreOpen = async (store: Store) => {
    try {
      await apiFetch(`/api/merchant/stores/${store.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ isOpen: !store.isOpen }),
      });
      notify(`${store.name} is now ${!store.isOpen ? 'Open' : 'Closed'}.`);
      await loadDashboard();
      onMarketplaceMutated();
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Update failed.', 'error');
    }
  };

  const handleToggleStoreZone = (storeId: string, areaName: string) => {
    setZoneDrafts((prev) => {
      const current = prev[storeId] || {
        deliveryZones: [DJELFA_AREAS[0].name],
        deliveryFee: 200,
        deliveryRadiusKm: 10,
      };
      const exists = current.deliveryZones.includes(areaName);
      const nextZones = exists
        ? current.deliveryZones.filter((z) => z !== areaName)
        : [...current.deliveryZones, areaName];
      return {
        ...prev,
        [storeId]: {
          ...current,
          deliveryZones: nextZones.length > 0 ? nextZones : [areaName],
        },
      };
    });
  };

  const handleSaveDeliveryZone = async (store: Store) => {
    const draft = zoneDrafts[store.id];
    if (!draft) return;
    setSavingZoneStoreId(store.id);
    try {
      await apiFetch(`/api/merchant/stores/${store.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          deliveryZones: draft.deliveryZones,
          deliveryFee: Math.max(0, Math.round(draft.deliveryFee)),
          deliveryRadiusKm: Math.max(1, Math.min(100, Number(draft.deliveryRadiusKm))),
        }),
      });
      notify(`Updated delivery zones for ${store.name}.`);
      await loadDashboard();
      onMarketplaceMutated();
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Could not update delivery zones.', 'error');
    } finally {
      setSavingZoneStoreId(null);
    }
  };

  const updateProfileDraft = (
    storeId: string,
    patch: Partial<{
      name: string;
      storeType: SellerBusinessType;
      description: string;
      area: string;
      address: string;
      openingHours: string;
      phone: string;
      whatsapp: string;
      logoUrl: string;
      facebookUrl: string;
      instagramUrl: string;
      googleMapsUrl: string;
    }>
  ) => {
    setProfileDrafts((prev) => {
      const store = stores.find((s) => s.id === storeId);
      const current = prev[storeId] || {
        name: store?.name || '',
        storeType: store?.storeType || 'physical_store',
        description: store?.description || '',
        area: store?.area || DJELFA_AREAS[0].name,
        address: store?.address || '',
        openingHours: store?.openingHours || '08:00 - 22:00',
        phone: store?.phone || '',
        whatsapp: store?.whatsapp || '',
        logoUrl: store?.logoUrl || '',
        facebookUrl: store?.facebookUrl || '',
        instagramUrl: store?.instagramUrl || '',
        googleMapsUrl: store?.googleMapsUrl || '',
      };
      return {
        ...prev,
        [storeId]: {
          ...current,
          ...patch,
        },
      };
    });
  };

  const handleSaveStoreProfile = async (e: React.FormEvent, store: Store) => {
    e.preventDefault();
    const draft = profileDrafts[store.id];
    if (!draft) return;

    const cleanName = draft.name.trim();
    const cleanDesc = draft.description.trim();
    const isOnlineOnly = draft.storeType === 'online_page';
    const cleanAddr =
      draft.address.trim() || (isOnlineOnly ? `Online Storefront · ${draft.area}, Djelfa` : '');
    const cleanWhatsapp = draft.whatsapp.trim();
    const cleanPhone = draft.phone.trim() || cleanWhatsapp;

    if (cleanName.length < 2) {
      notify('Shop name must be at least 2 characters.', 'error');
      return;
    }
    if (cleanDesc.length < 4) {
      notify('Shop description must be at least 4 characters.', 'error');
      return;
    }
    if (!isOnlineOnly && cleanAddr.length < 4) {
      notify('Street address must be at least 4 characters for a physical shop.', 'error');
      return;
    }
    if (cleanWhatsapp.replace(/\D/g, '').length < 6) {
      notify('Enter a valid WhatsApp number (at least 6 digits).', 'error');
      return;
    }

    setSavingProfileStoreId(store.id);
    try {
      const res = await apiFetch<{ store: Store }>(`/api/merchant/stores/${store.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          name: cleanName,
          storeType: draft.storeType,
          description: cleanDesc,
          area: draft.area,
          address: cleanAddr,
          openingHours: draft.openingHours.trim() || '08:00 - 22:00',
          phone: cleanPhone,
          whatsapp: cleanWhatsapp,
          logoUrl: draft.logoUrl.trim() ? draft.logoUrl.trim() : null,
          facebookUrl: draft.facebookUrl.trim() ? draft.facebookUrl.trim() : null,
          instagramUrl: draft.instagramUrl.trim() ? draft.instagramUrl.trim() : null,
          googleMapsUrl: draft.googleMapsUrl.trim() ? draft.googleMapsUrl.trim() : null,
        }),
      });

      if (firebaseUser && firebaseUser.emailVerified) {
        await saveStoreProfileToFirestore(firebaseUser, res.store).catch((err) => {
          console.warn('Firestore profile sync warning:', err);
        });
      }

      setLogoPreviewError(false);
      notify(
        firebaseUser?.emailVerified
          ? `Saved profile & social links for ${res.store.name} (synced to cloud)!`
          : `Saved profile & social links for ${res.store.name}!`
      );
      await loadDashboard();
      onMarketplaceMutated();
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Could not save store profile.', 'error');
    } finally {
      setSavingProfileStoreId(null);
    }
  };

  const handleUseCurrentGpsForStore = (storeId: string) => {
    if (!navigator.geolocation) {
      notify('GPS is unavailable in this browser. Paste a Google Maps link instead.', 'error');
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const lat = Number(pos.coords.latitude.toFixed(6));
        const lng = Number(pos.coords.longitude.toFixed(6));
        const mapsUrl = `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`;
        updateProfileDraft(storeId, { googleMapsUrl: mapsUrl });
        notify('Google Maps location pinned from your GPS!');
      },
      () => notify('Location permission denied. You can paste a Google Maps link manually.', 'error'),
      { enableHighAccuracy: true, timeout: 8000 }
    );
  };

  const handleReplyInquiry = async (inqId: string) => {
    const reply = replyTexts[inqId]?.trim();
    if (!reply) return;
    try {
      await apiFetch(`/api/merchant/inquiries/${inqId}/reply`, {
        method: 'POST',
        body: JSON.stringify({ reply }),
      });
      notify('Reply sent to customer.');
      await loadDashboard();
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Failed to reply.', 'error');
    }
  };

  const inStockCount = listings.filter((l) => l.availabilityStatus === 'in_stock').length;
  const outStockCount = listings.filter((l) => l.availabilityStatus === 'out_of_stock').length;
  const incomingCount = orders.filter((o) => o.orderStatus === 'new' || o.orderStatus === 'accepted').length;
  const completedCount = orders.filter((o) => o.orderStatus === 'done').length;

  const visibleListings = listings.filter((l) =>
    `${l.productName} ${l.brand} ${l.storeName}`.toLowerCase().includes(prodFilter.trim().toLowerCase())
  );

  const validImportCount = importRows.filter((r) => !r.error).length;
  const areaNames =
    areas.length > 0 ? areas.map((a) => a.name) : DJELFA_AREAS.map((a) => a.name);

  return (
    <section
      dir={isAr ? 'rtl' : 'ltr'}
      className="marketly-page-enter mx-auto max-w-5xl space-y-6"
    >
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl sm:text-3xl font-bold text-[#1D1538] dark:text-white">
            {isAr ? 'لوحة تحكم التاجر' : 'Seller Studio'}
          </h1>
          <p className="text-sm text-[#60567E] dark:text-[#AEA2CB]">
            {isAr
              ? `إدارة ${stores.length} متجر، صور المنتجات، الاستيراد الجماعي، مناطق التوصيل في الجلفة، والطلبات الواردة.`
              : `Manage ${stores.length} store(s), product photos, bulk sheet imports, Djelfa delivery zones, and incoming orders.`}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {onOpenDashboard && (
            <button
              type="button"
              onClick={onOpenDashboard}
              className="inline-flex items-center gap-1.5 rounded-full border border-[#E5DDF5] bg-white px-4 py-2 text-xs font-bold text-[#1D1538] shadow-xs transition hover:border-[#4A3894] hover:text-[#4A3894] dark:border-[#22222C] dark:bg-[#0E0E13] dark:text-white cursor-pointer"
            >
              <BarChart3 className="h-3.5 w-3.5 text-[#4A3894] dark:text-[#9678CE]" />
              <span>{isAr ? 'التحليلات' : 'Analytics'}</span>
            </button>
          )}
          {stores.length > 0 && (
            <button
              type="button"
              onClick={() => {
                setQrInitialStoreId(stores[0].id);
                setQrModalOpen(true);
              }}
              className="inline-flex items-center gap-1.5 rounded-full bg-[#9678CE] px-4 py-2 text-xs font-semibold text-white shadow-xs transition hover:brightness-105 cursor-pointer"
            >
              <QrCode className="h-3.5 w-3.5" />
              <span>{isAr ? 'طباعة رمز QR' : 'Print Store QR'}</span>
            </button>
          )}
          <button
            type="button"
            onClick={() => setShowNewStore((v) => !v)}
            className="inline-flex items-center gap-1.5 rounded-full bg-[#4A3894] px-4 py-2 text-xs font-semibold text-white transition hover:bg-[#3A2B78] cursor-pointer"
          >
            <Plus className="h-3.5 w-3.5" />
            <span>{isAr ? 'متجر جديد' : 'New Store'}</span>
          </button>
        </div>
      </div>

      {/* KPI Strip */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="rounded-2xl border border-[#E5DDF5] bg-white p-4 dark:border-[#22222C] dark:bg-[#0E0E13]">
          <div className="text-xs text-[#60567E] dark:text-[#AEA2CB]">
            {isAr ? 'المنتجات المتوفرة' : 'Active Products'}
          </div>
          <div className="font-display mt-1 text-2xl font-extrabold text-[#1D1538] dark:text-white tabular-nums">
            {inStockCount}
          </div>
        </div>
        <div className="rounded-2xl border border-[#E5DDF5] bg-white p-4 dark:border-[#22222C] dark:bg-[#0E0E13]">
          <div className="text-xs text-[#60567E] dark:text-[#AEA2CB]">
            {isAr ? 'نفذت الكمية' : 'Out of Stock'}
          </div>
          <div className="font-display mt-1 text-2xl font-extrabold text-rose-600 tabular-nums">
            {outStockCount}
          </div>
        </div>
        <div className="rounded-2xl border border-[#E5DDF5] bg-white p-4 dark:border-[#22222C] dark:bg-[#0E0E13]">
          <div className="text-xs text-[#60567E] dark:text-[#AEA2CB]">
            {isAr ? 'الطلبات الواردة' : 'Incoming Orders'}
          </div>
          <div className="font-display mt-1 text-2xl font-extrabold text-[#4A3894] dark:text-[#9678CE] tabular-nums">
            {incomingCount}
          </div>
        </div>
        <div className="rounded-2xl border border-[#E5DDF5] bg-white p-4 dark:border-[#22222C] dark:bg-[#0E0E13]">
          <div className="text-xs text-[#60567E] dark:text-[#AEA2CB]">
            {isAr ? 'الطلبات المكتملة' : 'Completed Orders'}
          </div>
          <div className="font-display mt-1 text-2xl font-extrabold text-emerald-600 tabular-nums">
            {completedCount}
          </div>
        </div>
      </div>

      {showNewStore && (
        <form
          onSubmit={handleCreateStore}
          className="rounded-3xl border border-[#9678CE]/40 bg-white p-6 space-y-4 dark:bg-[#0E0E13]"
        >
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h3 className="font-display text-lg font-bold">
              {newStoreType === 'online_page'
                ? isAr
                  ? 'إطلاق صفحة بائع أونلاين (إنستغرام / فيسبوك / واتساب)'
                  : 'Launch an Online Seller Page (IG / FB / WhatsApp)'
                : isAr
                  ? 'تسجيل متجر فعلي في الجلفة'
                  : 'Register a Physical Business Store'}
            </h3>
            <div className="inline-flex rounded-full border border-[#E5DDF5] bg-[#F9F5FD] p-1 text-xs font-semibold dark:border-[#22222C] dark:bg-[#15151C]">
              <button
                type="button"
                onClick={() => setNewStoreType('physical_store')}
                className={`rounded-full px-3 py-1 transition cursor-pointer ${
                  newStoreType === 'physical_store'
                    ? 'bg-[#4A3894] text-white'
                    : 'text-[#60567E] dark:text-[#AEA2CB]'
                }`}
              >
                {isAr ? 'متجر فعلي' : 'Physical Store'}
              </button>
              <button
                type="button"
                onClick={() => setNewStoreType('online_page')}
                className={`rounded-full px-3 py-1 transition cursor-pointer ${
                  newStoreType === 'online_page'
                    ? 'bg-[#4A3894] text-white'
                    : 'text-[#60567E] dark:text-[#AEA2CB]'
                }`}
              >
                {isAr ? 'صفحة أونلاين (IG / FB)' : 'Online Page (IG / FB)'}
              </button>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <input
              required
              value={storeName}
              onChange={(e) => setStoreName(e.target.value)}
              placeholder={
                newStoreType === 'online_page'
                  ? isAr
                    ? 'اسم الصفحة (مثال: Djelfa Gadgets IG)'
                    : 'Page name (e.g. Djelfa Gadgets IG)'
                  : isAr
                    ? 'اسم المتجر (مثال: Atlas Tech Djelfa)'
                    : 'Store name (e.g. Atlas Tech Djelfa)'
              }
              className="rounded-xl border border-[#E5DDF5] px-3.5 py-2 text-sm dark:border-[#22222C] dark:bg-[#15151C]"
            />
            <select
              value={storeArea}
              onChange={(e) => setStoreArea(e.target.value)}
              className="rounded-xl border border-[#E5DDF5] bg-white px-3.5 py-2 text-sm dark:border-[#22222C] dark:bg-[#15151C]"
            >
              {(areas.length > 0 ? areas : DJELFA_AREAS).map((a) => (
                <option key={a.id} value={a.name}>
                  {getAreaDisplayName(a.name, lang)}
                </option>
              ))}
            </select>
            {newStoreType === 'physical_store' ? (
              <input
                required
                value={storeAddress}
                onChange={(e) => setStoreAddress(e.target.value)}
                placeholder={isAr ? 'عنوان الشارع في الجلفة' : 'Street address in Djelfa'}
                className="rounded-xl border border-[#E5DDF5] px-3.5 py-2 text-sm dark:border-[#22222C] dark:bg-[#15151C]"
              />
            ) : (
              <input
                value={storeInstagramInput}
                onChange={(e) => setStoreInstagramInput(e.target.value)}
                placeholder="Instagram handle or URL (e.g. @soufgadgets)"
                className="rounded-xl border border-[#E4E4F0] px-3.5 py-2 text-sm dark:border-[#22222C] dark:bg-[#15151C]"
              />
            )}
            <input
              required
              value={storePhone}
              onChange={(e) => setStorePhone(e.target.value)}
              placeholder="Phone / WhatsApp"
              className="rounded-xl border border-[#E4E4F0] px-3.5 py-2 text-sm dark:border-[#22222C] dark:bg-[#15151C]"
            />
            {newStoreType === 'online_page' && (
              <input
                value={storeFacebookInput}
                onChange={(e) => setStoreFacebookInput(e.target.value)}
                placeholder="Facebook page link or handle (optional)"
                className="rounded-xl border border-[#E4E4F0] px-3.5 py-2 text-sm dark:border-[#22222C] dark:bg-[#15151C]"
              />
            )}
            <input
              required
              value={storeHours}
              onChange={(e) => setStoreHours(e.target.value)}
              placeholder={
                newStoreType === 'online_page'
                  ? 'Response hours (e.g. 09:00 - 23:00)'
                  : 'Opening hours (e.g. 08:00 - 22:00)'
              }
              className="rounded-xl border border-[#E4E4F0] px-3.5 py-2 text-sm dark:border-[#22222C] dark:bg-[#15151C]"
            />
            <div className="grid grid-cols-2 gap-2">
              <input
                type="number"
                min={0}
                value={storeFeeInput}
                onChange={(e) => setStoreFeeInput(e.target.value)}
                placeholder="Delivery fee (DZD)"
                className="rounded-xl border border-[#E4E4F0] px-3 py-2 text-sm dark:border-[#22222C] dark:bg-[#15151C]"
              />
              <input
                type="number"
                min={1}
                max={100}
                value={storeRadiusInput}
                onChange={(e) => setStoreRadiusInput(e.target.value)}
                placeholder="Radius (km)"
                className="rounded-xl border border-[#E4E4F0] px-3 py-2 text-sm dark:border-[#22222C] dark:bg-[#15151C]"
              />
            </div>
          </div>
          <div>
            <div className="mb-1.5 text-xs font-semibold text-[#5E5C70] dark:text-[#9D9BB0]">
              Covered Delivery Neighborhoods
            </div>
            <div className="flex flex-wrap gap-1.5">
              {areaNames.map((areaName) => {
                const selected = storeZonesInput.includes(areaName);
                return (
                  <button
                    key={areaName}
                    type="button"
                    onClick={() =>
                      setStoreZonesInput((prev) =>
                        prev.includes(areaName)
                          ? prev.length > 1
                            ? prev.filter((z) => z !== areaName)
                            : prev
                          : [...prev, areaName]
                      )
                    }
                      className={`rounded-full px-3 py-1 text-xs font-semibold transition cursor-pointer ${
                        selected
                          ? 'bg-[#4A3894] text-white'
                          : 'border border-[#E5DDF5] bg-[#F9F5FD] text-[#60567E] dark:border-[#22222C] dark:bg-[#15151C] dark:text-[#AEA2CB]'
                      }`}
                    >
                      {getAreaDisplayName(areaName, lang)}
                    </button>
                  );
                })}
              </div>
            </div>
            <textarea
              required
              rows={2}
              value={storeDesc}
              onChange={(e) => setStoreDesc(e.target.value)}
              placeholder={isAr ? 'وصف مختصر لما يبيعه متجرك...' : 'Describe what your store sells...'}
              className="w-full rounded-xl border border-[#E5DDF5] px-3.5 py-2 text-sm dark:border-[#22222C] dark:bg-[#15151C]"
            />
            <div className="flex gap-2">
              <button
                type="submit"
                className="rounded-full bg-[#4A3894] px-5 py-2 text-xs font-bold text-white hover:bg-[#3A2B78] cursor-pointer"
              >
                {isAr ? 'إرسال للموافقة' : 'Submit for Approval'}
              </button>
              <button
                type="button"
                onClick={() => setShowNewStore(false)}
                className="rounded-full border border-[#E5DDF5] px-4 py-2 text-xs font-semibold cursor-pointer"
              >
                {isAr ? 'إلغاء' : 'Cancel'}
              </button>
            </div>
          </form>
        )}

      {/* Navigation Tabs */}
      <div className="flex flex-wrap gap-2">
        {[
          { id: 'products', label: isAr ? `المنتجات (${listings.length})` : `Products (${listings.length})`, icon: StoreIcon },
          { id: 'profile', label: isAr ? 'ملف المتجر' : 'Shop Profile', icon: UserCircle },
          { id: 'bestsellers', label: isAr ? `الأكثر مبيعاً (${cloudProducts.length || listings.length})` : `Best Sellers DB (${cloudProducts.length || listings.length})`, icon: Flame },
          { id: 'orders', label: isAr ? `الطلبات (${orders.length})` : `Orders (${orders.length})`, icon: Package },
          { id: 'inquiries', label: isAr ? `الاستفسارات (${inquiries.length})` : `Inquiries (${inquiries.length})`, icon: MessageSquare },
          { id: 'settings', label: isAr ? 'إعدادات المناطق' : 'Store Settings & Zones', icon: Settings },
        ].map((item) => {
          const Icon = item.icon;
          const active = tab === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => setTab(item.id as typeof tab)}
              className={`inline-flex items-center gap-2 rounded-full px-4 py-2 text-xs font-semibold transition cursor-pointer ${
                active
                  ? 'bg-[#4A3894] text-white'
                  : 'bg-white text-[#60567E] border border-[#E5DDF5] dark:bg-[#0E0E13] dark:border-[#22222C] dark:text-[#AEA2CB]'
              }`}
            >
              <Icon className="h-3.5 w-3.5" />
              <span>{item.label}</span>
            </button>
          );
        })}
      </div>

      {loading ? (
        <DashboardTableSkeleton rows={5} />
      ) : tab === 'orders' ? (
        <div className="space-y-3">
          {orders.length === 0 ? (
            <div className="rounded-3xl border border-[#E4E4F0] bg-white p-8 text-center text-sm text-[#5E5C70] dark:border-[#22222C] dark:bg-[#0E0E13]">
              No orders received yet.
            </div>
          ) : (
            orders.map((order) => (
              <div
                key={order.id}
                className="rounded-2xl border border-[#E4E4F0] bg-white p-5 dark:border-[#22222C] dark:bg-[#0E0E13]"
              >
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2 text-xs">
                      <span className="font-display font-bold text-[#13111C] dark:text-white tabular-nums">
                        {order.orderNumber}
                      </span>
                      <span className="text-[#5E5C70]">· {order.storeName}</span>
                      <span className="font-semibold uppercase text-[#6E65F6]">{order.orderStatus}</span>
                    </div>
                    <div className="mt-1 text-sm font-semibold">
                      {order.customerName} · {order.customerPhone}
                    </div>
                    <div className="text-xs text-[#5E5C70] dark:text-[#9D9BB0]">
                      {order.fulfillmentType === 'delivery' ? `Deliver to: ${order.deliveryAddress}` : 'Customer pickup at shop'}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="font-display text-lg font-extrabold tabular-nums">
                      {formatDzd(order.total, lang)}
                    </div>
                    <div className="text-xs text-[#5E5C70]">
                      {order.items.map((i) => `${i.quantity}× ${i.productNameSnapshot}`).join(', ')}
                    </div>
                  </div>
                </div>

                <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-[#E4E4F0] pt-3 dark:border-[#22222C]">
                  {order.orderStatus === 'new' && (
                    <>
                      <button
                        type="button"
                        onClick={() => updateOrderStatus(order.id, 'accepted')}
                        className="inline-flex items-center gap-1.5 rounded-full bg-[#4A3894] px-4 py-1.5 text-xs font-bold text-white hover:bg-[#3A2B78] cursor-pointer"
                      >
                        <Check className="h-3.5 w-3.5" />
                        <span>{isAr ? 'قبول الطلب' : 'Accept Order'}</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => updateOrderStatus(order.id, 'rejected')}
                        className="rounded-full border border-rose-200 px-3.5 py-1.5 text-xs font-semibold text-rose-600 cursor-pointer"
                      >
                        {isAr ? 'رفض' : 'Reject'}
                      </button>
                    </>
                  )}
                  {order.orderStatus === 'accepted' && order.fulfillmentType === 'delivery' && (
                    <button
                      type="button"
                      onClick={() => updateOrderStatus(order.id, 'looking')}
                      className="inline-flex items-center gap-1.5 rounded-full bg-[#9678CE] px-4 py-1.5 text-xs font-bold text-white cursor-pointer"
                    >
                      <Truck className="h-3.5 w-3.5" />
                      <span>{isAr ? 'طلب سائق محلي' : 'Request Local Driver'}</span>
                    </button>
                  )}
                  {order.orderStatus === 'accepted' && order.fulfillmentType === 'pickup' && (
                    <button
                      type="button"
                      onClick={() => updateOrderStatus(order.id, 'ready')}
                      className="rounded-full bg-[#9678CE] px-4 py-1.5 text-xs font-bold text-white cursor-pointer"
                    >
                      {isAr ? 'جاهز للاستلام' : 'Mark Ready for Pickup'}
                    </button>
                  )}
                  {order.orderStatus === 'ready' && order.fulfillmentType === 'pickup' && (
                    <button
                      type="button"
                      onClick={() => updateOrderStatus(order.id, 'done')}
                      className="rounded-full bg-emerald-600 px-4 py-1.5 text-xs font-bold text-white cursor-pointer"
                    >
                      {isAr ? 'تأكيد استلام العميل' : 'Confirm Customer Collection'}
                    </button>
                  )}
                  {order.orderStatus === 'looking' && (
                    <span className="text-xs font-medium text-[#4A3894] dark:text-[#9678CE]">
                      {isAr ? 'جاري البحث عن سائقين متاحين في الجلفة...' : 'Broadcasted to online drivers in Djelfa...'}
                    </span>
                  )}
                  {order.orderStatus === 'onway' && (
                    <span className="text-xs font-medium text-emerald-600">
                      {isAr ? `تم التعيين لـ ${order.driverName} — في الطريق للتوصيل` : `Assigned to ${order.driverName} — out for delivery`}
                    </span>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      ) : tab === 'products' ? (
        <div className="space-y-4">
          {/* Cloud Firestore Persistence Bar */}
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[#9678CE]/35 bg-white px-4 py-3 dark:border-[#9678CE]/30 dark:bg-[#0E0E13]">
            <div className="flex items-center gap-3 min-w-0">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#FBEFFB] text-[#4A3894] dark:bg-[#15151C] dark:text-[#9678CE]">
                <Database className="h-4 w-4" />
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-2 text-xs font-bold text-[#1D1538] dark:text-white">
                  <span>{isAr ? 'قاعدة بيانات Firestore السحابية' : 'Firestore Seller Database'}</span>
                  <span
                    className={`rounded-full px-2 py-0.5 text-[10px] font-extrabold ${
                      dbStatus === 'connected'
                        ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400'
                        : 'bg-amber-500/15 text-amber-700 dark:text-amber-400'
                    }`}
                  >
                    {dbStatus === 'connected' ? (isAr ? 'متصل' : 'Cloud Ready') : dbStatus}
                  </span>
                </div>
                <p className="truncate text-[11px] text-[#60567E] dark:text-[#AEA2CB]">
                  {firebaseUser
                    ? `Signed in as ${firebaseUser.email} · ${cloudProducts.length} products saved in Cloud DB`
                    : isAr
                      ? 'اربط حساب Google لحفظ منتجاتك وإحصائيات المبيعات سحابياً.'
                      : 'Connect Google to save your products & best-selling rankings permanently in Firestore.'}
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {firebaseUser ? (
                <>
                  <button
                    type="button"
                    disabled={syncingCloud}
                    onClick={handleSyncAllToFirestore}
                    className="inline-flex items-center gap-1.5 rounded-full bg-[#4A3894] px-3.5 py-1.5 text-xs font-bold text-white hover:bg-[#3A2B78] disabled:opacity-50 cursor-pointer"
                  >
                    <RefreshCw className={`h-3.5 w-3.5 ${syncingCloud ? 'animate-spin' : ''}`} />
                    <span>{syncingCloud ? (isAr ? 'جاري المزامنة...' : 'Syncing...') : isAr ? `مزامنة (${listings.length})` : `Sync All (${listings.length}) to Cloud DB`}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => signOutFirebase()}
                    className="rounded-full border border-[#E5DDF5] px-3 py-1.5 text-[11px] font-semibold text-[#60567E] hover:text-rose-600 dark:border-[#22222C] dark:text-[#AEA2CB] cursor-pointer"
                  >
                    {isAr ? 'فصل' : 'Disconnect'}
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  disabled={fbSigningIn}
                  onClick={handleSyncAllToFirestore}
                  className="inline-flex items-center gap-1.5 rounded-full bg-[#4A3894] px-4 py-1.5 text-xs font-bold text-white hover:bg-[#3A2B78] disabled:opacity-50 cursor-pointer"
                >
                  <Cloud className="h-3.5 w-3.5" />
                  <span>{fbSigningIn ? (isAr ? 'جاري الربط...' : 'Connecting...') : isAr ? 'ربط حساب Google' : 'Connect Google to Save to DB'}</span>
                </button>
              )}
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="relative w-full sm:w-72">
              <Search className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#60567E]" />
              <input
                value={prodFilter}
                onChange={(e) => setProdFilter(e.target.value)}
                placeholder={isAr ? 'تصفية منتجاتك...' : 'Filter your products...'}
                className="w-full rounded-full border border-[#E5DDF5] bg-white py-2 ps-9 pe-4 text-xs dark:border-[#22222C] dark:bg-[#0E0E13]"
              />
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  setShowBulkImport((v) => !v);
                  setShowAddProd(false);
                }}
                className="inline-flex items-center gap-1.5 rounded-full border border-[#E5DDF5] bg-white px-4 py-2 text-xs font-bold text-[#1D1538] transition hover:border-[#4A3894] dark:border-[#22222C] dark:bg-[#0E0E13] dark:text-white cursor-pointer"
              >
                <FileSpreadsheet className="h-3.5 w-3.5 text-[#4A3894] dark:text-[#9678CE]" />
                <span>{isAr ? 'استيراد Excel / Google Sheet' : 'Import Excel / Google Sheet'}</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setShowAddProd((v) => !v);
                  setShowBulkImport(false);
                }}
                className="inline-flex items-center gap-1.5 rounded-full bg-[#4A3894] px-4 py-2 text-xs font-bold text-white hover:bg-[#3A2B78] cursor-pointer"
              >
                <Plus className="h-3.5 w-3.5" />
                <span>{isAr ? 'إضافة منتج' : 'Add Product Listing'}</span>
              </button>
            </div>
          </div>

          {/* Bulk Import Workspace (Excel / CSV or Google Sheets) */}
          {showBulkImport && (
            <div className="rounded-3xl border border-[#9678CE]/40 bg-white p-5 space-y-4 dark:bg-[#0E0E13]">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h3 className="font-display text-base font-bold">
                    Bulk Product Import (Excel, CSV, or Google Sheets)
                  </h3>
                  <p className="text-xs text-[#60567E] dark:text-[#AEA2CB]">
                    Add new hardware or update prices &amp; stock across up to 100 rows at once.
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  <select
                    aria-label="Target store for bulk import"
                    value={importStoreId}
                    onChange={(e) => setImportStoreId(e.target.value)}
                    className="rounded-xl border border-[#E5DDF5] bg-white px-3 py-1.5 text-xs font-semibold dark:border-[#22222C] dark:bg-[#15151C]"
                  >
                    {stores.map((s) => (
                      <option key={s.id} value={s.id}>
                        Target: {s.name}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    onClick={() => setShowBulkImport(false)}
                    aria-label="Close bulk import"
                    className="rounded-full p-1.5 text-[#60567E] hover:bg-[#F9F5FD] dark:hover:bg-[#15151C] cursor-pointer"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              </div>

              {/* Source Switcher */}
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => setImportMode('excel')}
                  className={`inline-flex items-center gap-1.5 rounded-full px-4 py-1.5 text-xs font-bold transition cursor-pointer ${
                    importMode === 'excel'
                      ? 'bg-[#4A3894] text-white'
                      : 'border border-[#E5DDF5] bg-[#F9F5FD] text-[#60567E] dark:border-[#22222C] dark:bg-[#15151C] dark:text-[#AEA2CB]'
                  }`}
                >
                  <Upload className="h-3.5 w-3.5" />
                  <span>Excel (.xlsx) / CSV File</span>
                </button>
                <button
                  type="button"
                  onClick={() => setImportMode('google_sheets')}
                  className={`inline-flex items-center gap-1.5 rounded-full px-4 py-1.5 text-xs font-bold transition cursor-pointer ${
                    importMode === 'google_sheets'
                      ? 'bg-[#4A3894] text-white'
                      : 'border border-[#E5DDF5] bg-[#F9F5FD] text-[#60567E] dark:border-[#22222C] dark:bg-[#15151C] dark:text-[#AEA2CB]'
                  }`}
                >
                  <FileSpreadsheet className="h-3.5 w-3.5" />
                  <span>Google Sheets</span>
                </button>
              </div>

              {importMode === 'excel' ? (
                <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-dashed border-[#D6D6EA] bg-[#F8F8FC] p-4 dark:border-[#22222C] dark:bg-[#0E0E13]/85">
                  <div className="space-y-1">
                    <div className="text-xs font-bold">
                      Upload an `.xlsx` or `.csv` catalog sheet
                    </div>
                    <div className="text-[11px] text-[#5E5C70] dark:text-[#9D9BB0]">
                      Columns: Product Name, Brand, Category, Price (DZD), Stock Qty, Availability, Description, Photo URL
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() => downloadExcelTemplate()}
                      className="inline-flex items-center gap-1.5 rounded-full border border-[#E4E4F0] bg-white px-3.5 py-2 text-xs font-semibold text-[#13111C] hover:border-[#6E65F6] dark:border-[#22222C] dark:bg-[#15151C] dark:text-white cursor-pointer"
                    >
                      <Download className="h-3.5 w-3.5 text-[#6E65F6]" />
                      <span>Download Sample .xlsx</span>
                    </button>
                    <label className="inline-flex items-center gap-1.5 rounded-full bg-[#6E65F6] px-4 py-2 text-xs font-bold text-white cursor-pointer hover:brightness-110">
                      <Upload className="h-3.5 w-3.5" />
                      <span>Choose .xlsx / .csv</span>
                      <input
                        type="file"
                        accept=".xlsx,.csv,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                        onChange={handleExcelFileSelected}
                        className="sr-only"
                      />
                    </label>
                  </div>
                </div>
              ) : (
                <div className="space-y-3 rounded-2xl border border-[#E5DDF5] bg-[#F9F5FD] p-4 dark:border-[#22222C] dark:bg-[#15151C]/80">
                  {!googleAccessToken ? (
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <div className="text-xs font-bold">Connect your Google account</div>
                        <p className="text-[11px] text-[#5E5C70] dark:text-[#9D9BB0]">
                          Sign in to read products directly from your Google Sheets (read-only access, kept in session memory).
                        </p>
                      </div>
                      <button
                        type="button"
                        disabled={googleSigningIn}
                        onClick={handleGoogleSignIn}
                        className="gsi-material-button"
                      >
                        <div className="gsi-material-button-state" />
                        <div className="gsi-material-button-content-wrapper">
                          <div className="gsi-material-button-icon">
                            <svg
                              version="1.1"
                              xmlns="http://www.w3.org/2000/svg"
                              viewBox="0 0 48 48"
                              style={{ display: 'block' }}
                            >
                              <path
                                fill="#EA4335"
                                d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"
                              />
                              <path
                                fill="#4285F4"
                                d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"
                              />
                              <path
                                fill="#FBBC05"
                                d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"
                              />
                              <path
                                fill="#34A853"
                                d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"
                              />
                              <path fill="none" d="M0 0h48v48H0z" />
                            </svg>
                          </div>
                          <span className="gsi-material-button-contents">
                            {googleSigningIn ? 'Signing in...' : 'Sign in with Google'}
                          </span>
                        </div>
                      </button>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                        <span className="inline-flex items-center gap-1.5 font-semibold text-emerald-700 dark:text-emerald-400">
                          <Check className="h-3.5 w-3.5" />
                          Connected: {googleUserEmail || 'Google Sheets'}
                        </span>
                        <button
                          type="button"
                          onClick={handleGoogleSignOut}
                          className="text-xs font-semibold text-rose-600 hover:underline cursor-pointer"
                        >
                          Disconnect
                        </button>
                      </div>

                      <div className="flex flex-wrap gap-2">
                        <input
                          value={sheetUrlInput}
                          onChange={(e) => setSheetUrlInput(e.target.value)}
                          placeholder="Paste Google Sheet URL (https://docs.google.com/spreadsheets/d/...) or ID"
                          className="min-w-[240px] flex-1 rounded-xl border border-[#E5DDF5] bg-white px-3 py-2 text-xs dark:border-[#22222C] dark:bg-[#15151C]"
                        />
                        <button
                          type="button"
                          disabled={loadingSheetMeta}
                          onClick={handleLoadGoogleSheetTabs}
                          className="rounded-full bg-[#4A3894] px-4 py-2 text-xs font-bold text-white disabled:opacity-50 dark:bg-[#9678CE] cursor-pointer"
                        >
                          {loadingSheetMeta ? 'Loading...' : 'Load Tabs'}
                        </button>
                      </div>

                      {sheetTabs.length > 0 && (
                        <div className="flex flex-wrap items-center gap-2">
                          <select
                            aria-label="Select Google Sheet tab"
                            value={selectedSheetTab}
                            onChange={(e) => setSelectedSheetTab(e.target.value)}
                            className="rounded-xl border border-[#E5DDF5] bg-white px-3 py-2 text-xs font-semibold dark:border-[#22222C] dark:bg-[#15151C]"
                          >
                            {sheetTabs.map((st) => (
                              <option key={st.title} value={st.title}>
                                Tab: {st.title}
                              </option>
                            ))}
                          </select>
                          <button
                            type="button"
                            disabled={loadingSheetRows}
                            onClick={handleFetchGoogleSheetRows}
                            className="rounded-full bg-[#4A3894] px-4 py-2 text-xs font-bold text-white disabled:opacity-50 cursor-pointer"
                          >
                            {loadingSheetRows ? 'Reading rows...' : 'Load Rows'}
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

            {/* Parsed Rows Preview Table */}
            {importRows.length > 0 && (
              <div className="space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                  <span>
                    Preview from <strong>{importSourceLabel}</strong>: {validImportCount} valid /{' '}
                    {importRows.length} rows
                  </span>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setImportRows([]);
                        setImportSourceLabel('');
                      }}
                      className="rounded-full border border-[#E5DDF5] px-3 py-1.5 text-xs font-semibold dark:border-[#22222C] cursor-pointer"
                    >
                      Clear Preview
                    </button>
                    <button
                      type="button"
                      disabled={validImportCount === 0 || importingBulk}
                      onClick={handleConfirmBulkImport}
                      className="rounded-full bg-[#4A3894] px-4 py-1.5 text-xs font-extrabold text-white disabled:opacity-45 cursor-pointer"
                    >
                      {importingBulk
                        ? 'Importing...'
                        : `Import ${validImportCount} Product${validImportCount === 1 ? '' : 's'}`}
                    </button>
                  </div>
                </div>

                  <div className="max-h-64 overflow-auto rounded-2xl border border-[#E4E4F0] dark:border-[#22222C]">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-[#F4F5FB] text-[11px] uppercase text-[#5E5C70] dark:bg-[#15151C] dark:text-[#9D9BB0]">
                        <tr>
                          <th className="px-3 py-2">#</th>
                          <th className="px-3 py-2">Product</th>
                          <th className="px-3 py-2">Brand</th>
                          <th className="px-3 py-2">Category</th>
                          <th className="px-3 py-2">Price</th>
                          <th className="px-3 py-2">Stock</th>
                          <th className="px-3 py-2">Status</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[#E4E4F0] dark:divide-[#22222C]">
                        {importRows.map((row) => (
                          <tr
                            key={row.rowIndex}
                            className={row.error ? 'bg-rose-50/70 dark:bg-rose-950/20' : ''}
                          >
                            <td className="px-3 py-2 tabular-nums text-[#5E5C70]">{row.rowIndex}</td>
                            <td className="px-3 py-2 font-semibold">{row.name || '—'}</td>
                            <td className="px-3 py-2">{row.brand}</td>
                            <td className="px-3 py-2">{row.category}</td>
                            <td className="px-3 py-2 tabular-nums">
                              {row.price > 0 ? formatDzd(row.price, lang) : '—'}
                            </td>
                            <td className="px-3 py-2 tabular-nums">
                              {row.stockQuantity !== null ? row.stockQuantity : '—'}
                            </td>
                            <td className="px-3 py-2">
                              {row.error ? (
                                <span className="inline-flex items-center gap-1 font-semibold text-rose-600">
                                  <AlertCircle className="h-3 w-3" />
                                  {row.error}
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1 font-semibold text-emerald-600">
                                  <Check className="h-3 w-3" />
                                  Ready
                                </span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Add Single Product Form (with Photo Upload & URL Preview) */}
          {showAddProd && (
            <form
              onSubmit={handleCreateProduct}
              className="rounded-3xl border border-[#6E65F6]/40 bg-white p-5 space-y-4 dark:bg-[#0E0E13]"
            >
              <div className="flex items-center justify-between">
                <h3 className="font-display text-base font-bold">Add New Product Listing</h3>
                <button
                  type="button"
                  onClick={() => setShowAddProd(false)}
                  aria-label="Close add product form"
                  className="rounded-full p-1 text-[#5E5C70] hover:bg-[#F4F5FB] dark:hover:bg-[#15151C] cursor-pointer"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              <div className="grid gap-3 sm:grid-cols-3">
                <select
                  value={newProdStoreId}
                  onChange={(e) => setNewProdStoreId(e.target.value)}
                  className="rounded-xl border border-[#E4E4F0] bg-white px-3 py-2 text-xs dark:border-[#22222C] dark:bg-[#15151C]"
                >
                  {stores.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
                <input
                  required
                  value={newProdName}
                  onChange={(e) => setNewProdName(e.target.value)}
                  placeholder="Product name (e.g. RTX 4070 12GB)"
                  className="rounded-xl border border-[#E4E4F0] px-3 py-2 text-xs dark:border-[#22222C] dark:bg-[#15151C]"
                />
                <input
                  required
                  value={newProdBrand}
                  onChange={(e) => setNewProdBrand(e.target.value)}
                  placeholder="Brand (e.g. ASUS, Apple)"
                  className="rounded-xl border border-[#E4E4F0] px-3 py-2 text-xs dark:border-[#22222C] dark:bg-[#15151C]"
                />
                <select
                  value={newProdCatId}
                  onChange={(e) => setNewProdCatId(e.target.value)}
                  className="rounded-xl border border-[#E4E4F0] bg-white px-3 py-2 text-xs dark:border-[#22222C] dark:bg-[#15151C]"
                >
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
                <input
                  required
                  type="number"
                  min={1}
                  value={newProdPrice}
                  onChange={(e) => setNewProdPrice(e.target.value)}
                  placeholder="Price in DZD"
                  className="rounded-xl border border-[#E4E4F0] px-3 py-2 text-xs dark:border-[#22222C] dark:bg-[#15151C]"
                />
                <input
                  type="number"
                  min={0}
                  value={newProdQty}
                  onChange={(e) => setNewProdQty(e.target.value)}
                  placeholder="Optional stock qty"
                  className="rounded-xl border border-[#E4E4F0] px-3 py-2 text-xs dark:border-[#22222C] dark:bg-[#15151C]"
                />
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <select
                  value={newProdImageKey}
                  onChange={(e) => setNewProdImageKey(e.target.value)}
                  className="rounded-xl border border-[#E4E4F0] bg-white px-3 py-2 text-xs dark:border-[#22222C] dark:bg-[#15151C]"
                >
                  {IMAGE_KEY_OPTIONS.map((opt) => (
                    <option key={opt.id} value={opt.id}>
                      Fallback icon: {opt.label}
                    </option>
                  ))}
                </select>
                <select
                  value={newProdStatus}
                  onChange={(e) => setNewProdStatus(e.target.value as AvailabilityStatus)}
                  className="rounded-xl border border-[#E4E4F0] bg-white px-3 py-2 text-xs dark:border-[#22222C] dark:bg-[#15151C]"
                >
                  <option value="in_stock">In stock</option>
                  <option value="out_of_stock">Out of stock</option>
                  <option value="unconfirmed">Availability unconfirmed</option>
                </select>
              </div>

              {/* Photo Upload or Safe HTTPS URL */}
              <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-[#E4E4F0] bg-[#F8F8FC] p-3 dark:border-[#22222C] dark:bg-[#0E0E13]/85">
                <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-xl bg-white dark:bg-[#15151C] overflow-hidden border border-[#E4E4F0] dark:border-[#22222C]">
                  <ProductArtwork
                    categoryId={newProdCatId}
                    imageKey={newProdImageKey}
                    imageUrl={newProdImageUrl}
                    alt={newProdName || 'Preview'}
                    className="h-14 w-14"
                  />
                </div>
                <div className="min-w-[200px] flex-1 space-y-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <label className="inline-flex items-center gap-1.5 rounded-full bg-[#4A3894] px-3.5 py-1.5 text-xs font-semibold text-white cursor-pointer">
                      <ImagePlus className="h-3.5 w-3.5" />
                      <span>{newProdUploadingPhoto ? 'Uploading...' : 'Upload Photo (PNG/JPG)'}</span>
                      <input
                        type="file"
                        accept="image/png,image/jpeg,image/webp"
                        disabled={newProdUploadingPhoto}
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) {
                            uploadProductPhotoFile(
                              file,
                              setNewProdImageUrl,
                              setNewProdUploadingPhoto
                            );
                          }
                          e.target.value = '';
                        }}
                        className="sr-only"
                      />
                    </label>
                    {newProdImageUrl && (
                      <button
                        type="button"
                        onClick={() => setNewProdImageUrl('')}
                        className="text-xs font-semibold text-rose-600 hover:underline cursor-pointer"
                      >
                        Remove photo
                      </button>
                    )}
                  </div>
                  <input
                    value={newProdImageUrl}
                    onChange={(e) => setNewProdImageUrl(e.target.value)}
                    placeholder="Or paste safe https:// photo URL (optional)"
                    className="w-full rounded-xl border border-[#E5DDF5] bg-white px-3 py-1.5 text-xs dark:border-[#22222C] dark:bg-[#15151C]"
                  />
                </div>
              </div>

              <input
                required
                value={newProdDesc}
                onChange={(e) => setNewProdDesc(e.target.value)}
                placeholder="Short hardware specification or description..."
                className="w-full rounded-xl border border-[#E5DDF5] px-3 py-2 text-xs dark:border-[#22222C] dark:bg-[#15151C]"
              />
              <div className="flex flex-wrap items-center gap-3">
                <button
                  type="submit"
                  className="rounded-full bg-[#4A3894] px-5 py-2 text-xs font-semibold text-white hover:bg-[#3A2B78] cursor-pointer"
                >
                  {isAr ? 'حفظ المنتج' : 'Save Product'}
                </button>
              </div>
            </form>
          )}

          {/* Product Rows */}
          <div className="space-y-2.5">
            {visibleListings.map((item) => (
              <div
                key={item.id}
                className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-[#E5DDF5] bg-white p-4 dark:border-[#22222C] dark:bg-[#0E0E13]"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-[#F9F5FD] dark:bg-[#15151C] overflow-hidden">
                    <ProductArtwork
                      categoryId={item.categoryId}
                      imageKey={item.imageKey}
                      imageUrl={item.imageUrl}
                      alt={item.productName}
                      className="h-10 w-10"
                    />
                  </div>
                  <div className="min-w-0">
                    <div className="text-[11px] font-medium text-[#60567E] dark:text-[#AEA2CB]">
                      {item.storeName} · {item.brand} · Updated{' '}
                      {formatRelativeTime(item.availabilityUpdatedAt, lang)}
                      {!item.isActive && (
                        <span className="ms-1.5 rounded bg-rose-500/15 px-1.5 py-0.5 text-[10px] font-bold text-rose-600">
                          Hidden
                        </span>
                      )}
                    </div>
                    <div className="truncate font-display text-base font-bold">{item.productName}</div>
                    <div className="text-[11px] font-semibold text-[#4A3894] dark:text-[#9678CE] tabular-nums">
                      {item.soldCount ?? 0} sold
                      {item.stockQuantity !== null ? ` · ${item.stockQuantity} in stock` : ''}
                    </div>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  {/* 1-tap 3-state stock switcher */}
                  <div className="flex rounded-full bg-[#F9F5FD] p-1 dark:bg-[#15151C]">
                    {(['in_stock', 'out_of_stock', 'unconfirmed'] as AvailabilityStatus[]).map((st) => (
                      <button
                        key={st}
                        type="button"
                        onClick={() => quickUpdateAvailability(item.id, st)}
                        className={`rounded-full px-2.5 py-1 text-[11px] font-semibold transition cursor-pointer ${
                          item.availabilityStatus === st
                            ? st === 'in_stock'
                              ? 'bg-emerald-600 text-white'
                              : st === 'out_of_stock'
                                ? 'bg-rose-600 text-white'
                                : 'bg-amber-500 text-white'
                            : 'text-[#60567E] dark:text-[#AEA2CB]'
                        }`}
                      >
                        {st === 'in_stock' ? 'In stock' : st === 'out_of_stock' ? 'Out' : 'Unconfirmed'}
                      </button>
                    ))}
                  </div>

                  <input
                    type="number"
                    defaultValue={item.price}
                    onBlur={(e) => {
                      const val = Number(e.target.value);
                      if (val !== item.price) updateListingPrice(item.id, val);
                    }}
                    aria-label={`Price for ${item.productName}`}
                    className="w-24 rounded-xl border border-[#E5DDF5] px-2.5 py-1.5 text-xs font-bold tabular-nums dark:border-[#22222C] dark:bg-[#15151C]"
                  />

                  <button
                    type="button"
                    disabled={recordingSaleId === item.id}
                    onClick={() => handleRecordListingSale(item, 1)}
                    title="Record +1 unit sold and update Best Sellers DB"
                    className="inline-flex items-center gap-1 rounded-full bg-[#FBEFFB] border border-[#E794C9]/50 px-3 py-1.5 text-xs font-extrabold text-[#4A3894] hover:bg-[#4A3894] hover:text-white disabled:opacity-50 cursor-pointer"
                  >
                    <TrendingUp className="h-3 w-3" />
                    <span>+1 Sale</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => openEditModal(item)}
                    title="Edit product details & photo"
                    className="inline-flex items-center gap-1 rounded-full border border-[#E5DDF5] px-3 py-1.5 text-xs font-semibold text-[#1D1538] hover:border-[#4A3894] hover:text-[#4A3894] dark:border-[#22222C] dark:text-white cursor-pointer"
                  >
                    <Pencil className="h-3 w-3" />
                    <span>Edit</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleDuplicate(item.id)}
                    title="Duplicate listing"
                    className="rounded-full p-2 text-[#60567E] hover:bg-[#F9F5FD] dark:hover:bg-[#15151C] cursor-pointer"
                  >
                    <Copy className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDeleteListing(item.id)}
                    title="Delete listing"
                    className="rounded-full p-2 text-[#60567E] hover:text-rose-600 cursor-pointer"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : tab === 'bestsellers' ? (
        <div className="space-y-5">
          {/* Best-Sellers & Cloud DB Header */}
          <div className="rounded-3xl bg-gradient-to-br from-[#4A3894] via-[#684FA8] to-[#9678CE] p-6 text-white shadow-lg">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <div className="inline-flex items-center gap-1.5 rounded-full bg-white/15 px-3 py-1 text-[10px] font-extrabold uppercase tracking-wider text-[#FBEFFB]">
                  <Flame className="h-3.5 w-3.5" />
                  <span>{isAr ? 'قاعدة بيانات الأكثر مبيعاً' : 'Best-Selling Products Database'}</span>
                </div>
                <h2 className="font-display mt-2.5 text-xl sm:text-2xl font-extrabold">
                  {isAr ? 'تتبع المبيعات والأكثر مبيعاً لحظياً' : 'Track Product Sales & Top Sellers in Real Time'}
                </h2>
                <p className="mt-1 text-xs text-white/80">
                  {firebaseUser
                    ? `Synced with Firestore (${firebaseUser.email}) · Every sale atomically updates seller_products and best_selling_products.`
                    : 'Connect your Google account to save your seller inventory & best-selling products directly to Firestore.'}
                </p>
              </div>
              <button
                type="button"
                disabled={syncingCloud || fbSigningIn}
                onClick={handleSyncAllToFirestore}
                className="inline-flex items-center gap-2 rounded-full bg-white px-4 py-2.5 text-xs font-extrabold text-[#4A3894] hover:bg-[#FBEFFB] disabled:opacity-50 cursor-pointer"
              >
                {firebaseUser ? (
                  <>
                    <RefreshCw className={`h-3.5 w-3.5 ${syncingCloud ? 'animate-spin' : ''}`} />
                    <span>{syncingCloud ? 'Syncing...' : 'Sync Store Products to Firestore'}</span>
                  </>
                ) : (
                  <>
                    <Cloud className="h-3.5 w-3.5" />
                    <span>{fbSigningIn ? 'Signing in...' : 'Connect Google Cloud DB'}</span>
                  </>
                )}
              </button>
            </div>

            {(() => {
              const sourceRows =
                cloudProducts.length > 0
                  ? cloudProducts.map((c) => ({
                      sold: c.soldCount,
                      rev: c.revenueTotal,
                      name: c.name,
                    }))
                  : listings.map((l) => ({
                      sold: l.soldCount ?? 0,
                      rev: (l.soldCount ?? 0) * l.price,
                      name: l.productName,
                    }));
              const totalUnits = sourceRows.reduce((acc, r) => acc + r.sold, 0);
              const totalRev = sourceRows.reduce((acc, r) => acc + r.rev, 0);
              const topItem = [...sourceRows].sort((a, b) => b.sold - a.sold)[0];
              return (
                <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
                  <div className="rounded-2xl bg-white/12 p-3.5">
                    <div className="text-[11px] text-white/80">Saved Products</div>
                    <div className="font-display mt-1 text-xl font-extrabold tabular-nums">
                      {sourceRows.length}
                    </div>
                  </div>
                  <div className="rounded-2xl bg-white/12 p-3.5">
                    <div className="text-[11px] text-white/80">Total Units Sold</div>
                    <div className="font-display mt-1 text-xl font-extrabold text-[#FBEFFB] tabular-nums">
                      {totalUnits}
                    </div>
                  </div>
                  <div className="rounded-2xl bg-white/12 p-3.5">
                    <div className="text-[11px] text-white/80">Tracked Revenue</div>
                    <div className="font-display mt-1 text-xl font-extrabold tabular-nums">
                      {formatDzd(totalRev, lang)}
                    </div>
                  </div>
                  <div className="rounded-2xl bg-white/12 p-3.5">
                    <div className="text-[11px] text-white/80">#1 Best Seller</div>
                    <div className="font-display mt-1 truncate text-sm font-extrabold text-white">
                      {topItem ? `${topItem.name} (${topItem.sold})` : '—'}
                    </div>
                  </div>
                </div>
              );
            })()}
          </div>

          {/* Seller's Firestore Saved Products & Sales Controls */}
          <div className="rounded-3xl border border-[#E4E4F0] bg-white p-5 space-y-4 dark:border-[#22222C] dark:bg-[#0E0E13]">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h3 className="font-display text-lg font-bold">
                  {cloudProducts.length > 0
                    ? 'Your Firestore Saved Products (Ranked by Sales)'
                    : 'Your Store Products (Ranked by Sales)'}
                </h3>
                <p className="text-xs text-[#5E5C70] dark:text-[#9D9BB0]">
                  Record unit sales or highlight items as Best Sellers to keep the marketplace leaderboard updated.
                </p>
              </div>
            </div>

            {cloudProducts.length > 0 ? (
              <div className="space-y-2.5">
                {cloudProducts.map((item, idx) => (
                  <div
                    key={item.id}
                    className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[#E4E4F0] bg-[#F8F8FC] p-3.5 dark:border-[#22222C] dark:bg-[#15151C]/80"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <span
                        className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full font-display text-xs font-extrabold tabular-nums ${
                          idx === 0
                            ? 'bg-[#4A3894] text-white'
                            : idx < 3
                              ? 'bg-[#9678CE] text-white'
                              : 'bg-white text-[#60567E] border border-[#E5DDF5] dark:bg-[#0E0E13] dark:border-[#22222C]'
                        }`}
                      >
                        #{idx + 1}
                      </span>
                      <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-white dark:bg-[#0E0E13] overflow-hidden">
                        <ProductArtwork
                          categoryId={item.categoryId}
                          imageKey={item.imageKey}
                          imageUrl={item.imageUrl || null}
                          alt={item.name}
                          className="h-10 w-10"
                        />
                      </div>
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className="truncate font-display text-sm font-bold">{item.name}</span>
                          {item.isBestSeller && (
                            <span className="inline-flex items-center gap-1 rounded-full bg-[#FBEFFB] px-2 py-0.5 text-[10px] font-extrabold text-[#4A3894]">
                              <Award className="h-2.5 w-2.5" />
                              Best Seller
                            </span>
                          )}
                        </div>
                        <div className="text-[11px] text-[#60567E] dark:text-[#AEA2CB] tabular-nums">
                          {item.storeName} · {formatDzd(item.price, lang)} ·{' '}
                          <strong className="text-[#4A3894] dark:text-[#9678CE]">{item.soldCount} sold</strong> · Rev{' '}
                          {formatDzd(item.revenueTotal, lang)} · Stock {item.stockQuantity}
                        </div>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-1.5">
                      <button
                        type="button"
                        disabled={recordingSaleId === item.id}
                        onClick={() => handleRecordCloudSale(item, 1)}
                        className="rounded-full bg-[#FBEFFB] border border-[#E794C9]/50 px-3 py-1.5 text-[11px] font-extrabold text-[#4A3894] hover:bg-[#4A3894] hover:text-white disabled:opacity-50 cursor-pointer"
                      >
                        +1 Sale
                      </button>
                      <button
                        type="button"
                        disabled={recordingSaleId === item.id}
                        onClick={() => handleRecordCloudSale(item, 5)}
                        className="rounded-full bg-[#4A3894] px-3 py-1.5 text-[11px] font-bold text-white hover:bg-[#3A2B78] disabled:opacity-50 cursor-pointer"
                      >
                        +5 Sales
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          toggleBestSellerFlagInFirestore(item)
                            .then(() => notify(`${item.name} best-seller badge updated.`))
                            .catch((e) => notify(e instanceof Error ? e.message : 'Update failed', 'error'))
                        }
                        className={`rounded-full border px-3 py-1.5 text-[11px] font-semibold cursor-pointer ${
                          item.isBestSeller
                            ? 'border-[#4A3894] bg-[#4A3894]/10 text-[#4A3894]'
                            : 'border-[#E5DDF5] text-[#60567E] dark:border-[#22222C] dark:text-[#AEA2CB]'
                        }`}
                      >
                        {item.isBestSeller ? 'Unmark Top' : 'Mark Best Seller'}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="space-y-2.5">
                {[...listings]
                  .sort((a, b) => (b.soldCount ?? 0) - (a.soldCount ?? 0))
                  .map((item, idx) => (
                    <div
                      key={item.id}
                      className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[#E5DDF5] bg-[#F9F5FD] p-3.5 dark:border-[#22222C] dark:bg-[#15151C]/75"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <span
                          className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full font-display text-xs font-extrabold tabular-nums ${
                            idx === 0
                              ? 'bg-[#4A3894] text-white'
                              : 'bg-white text-[#60567E] border border-[#E5DDF5] dark:bg-[#0E0E13] dark:border-[#22222C]'
                          }`}
                        >
                          #{idx + 1}
                        </span>
                        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-white dark:bg-[#0E0E13] overflow-hidden">
                          <ProductArtwork
                            categoryId={item.categoryId}
                            imageKey={item.imageKey}
                            imageUrl={item.imageUrl}
                            alt={item.productName}
                            className="h-10 w-10"
                          />
                        </div>
                        <div className="min-w-0">
                          <div className="truncate font-display text-sm font-bold">{item.productName}</div>
                          <div className="text-[11px] text-[#60567E] dark:text-[#AEA2CB] tabular-nums">
                            {item.storeName} · {formatDzd(item.price, lang)} ·{' '}
                            <strong className="text-[#4A3894] dark:text-[#9678CE]">{item.soldCount ?? 0} sold</strong>
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          disabled={recordingSaleId === item.id}
                          onClick={() => handleRecordListingSale(item, 1)}
                          className="rounded-full bg-[#FBEFFB] border border-[#E794C9]/50 px-3 py-1.5 text-[11px] font-extrabold text-[#4A3894] cursor-pointer"
                        >
                          +1 Sale
                        </button>
                        <button
                          type="button"
                          disabled={recordingSaleId === item.id}
                          onClick={() => handleRecordListingSale(item, 5)}
                          className="rounded-full bg-[#4A3894] px-3 py-1.5 text-[11px] font-bold text-white cursor-pointer"
                        >
                          +5 Sales
                        </button>
                      </div>
                    </div>
                  ))}
              </div>
            )}
          </div>

          {/* Public Cloud Best-Selling Products Leaderboard */}
          {cloudBestSellers.length > 0 && (
            <div className="rounded-3xl border border-[#E4E4F0] bg-white p-5 space-y-3 dark:border-[#22222C] dark:bg-[#0E0E13]">
              <div className="flex items-center justify-between">
                <h3 className="font-display text-base font-bold">
                  Marketplace Cloud Best-Selling Leaderboard ({cloudBestSellers.length})
                </h3>
                <span className="text-[11px] font-semibold text-[#6E65F6]">Live Firestore Collection</span>
              </div>
              <div className="grid gap-2.5 sm:grid-cols-2">
                {cloudBestSellers.slice(0, 8).map((bs, idx) => (
                  <div
                    key={bs.id}
                    className="flex items-center justify-between gap-3 rounded-2xl border border-[#E4E4F0] p-3 dark:border-[#22222C]"
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <span className="font-display text-xs font-extrabold text-[#6E65F6] tabular-nums">
                        #{idx + 1}
                      </span>
                      <div className="min-w-0">
                        <div className="truncate text-xs font-bold">{bs.productName}</div>
                        <div className="truncate text-[11px] text-[#5E5C70] dark:text-[#9D9BB0]">
                          {bs.storeName} · {formatDzd(bs.price, lang)}
                        </div>
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <div className="text-xs font-extrabold text-emerald-600 tabular-nums">
                        {bs.soldCount} sold
                      </div>
                      <div className="text-[10px] text-[#5E5C70] tabular-nums">
                        {formatDzd(bs.revenueTotal, lang)}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      ) : tab === 'inquiries' ? (
        <div className="space-y-3">
          {inquiries.length === 0 ? (
            <div className="rounded-3xl border border-[#E4E4F0] bg-white p-8 text-center text-sm text-[#5E5C70] dark:border-[#22222C] dark:bg-[#0E0E13]">
              No customer inquiries yet.
            </div>
          ) : (
            inquiries.map((inq) => (
              <div
                key={inq.id}
                className="rounded-2xl border border-[#E4E4F0] bg-white p-5 space-y-3 dark:border-[#22222C] dark:bg-[#0E0E13]"
              >
                <div className="flex justify-between text-xs text-[#5E5C70]">
                  <span>
                    <strong className="text-[#13111C] dark:text-white">{inq.customerName}</strong> ({inq.customerPhone}) · {inq.productName}
                  </span>
                  <span>{formatRelativeTime(inq.createdAt, lang)}</span>
                </div>
                <p className="text-sm">{inq.message}</p>
                {inq.reply ? (
                  <div className="rounded-xl bg-[#F4F5FB] p-3 text-xs dark:bg-[#15151C]">
                    <strong>Your reply:</strong> {inq.reply}
                  </div>
                ) : (
                  <div className="flex gap-2">
                    <input
                      value={replyTexts[inq.id] || ''}
                      onChange={(e) => setReplyTexts((prev) => ({ ...prev, [inq.id]: e.target.value }))}
                      placeholder="Write reply to customer..."
                      className="flex-1 rounded-xl border border-[#E4E4F0] px-3 py-2 text-xs dark:border-[#22222C] dark:bg-[#15151C]"
                    />
                      <button
                        type="button"
                        onClick={() => handleReplyInquiry(inq.id)}
                        className="rounded-full bg-[#4A3894] px-4 py-2 text-xs font-semibold text-white cursor-pointer"
                      >
                        Reply
                      </button>
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        ) : tab === 'profile' ? (
          (() => {
            const activeStore = stores.find((s) => s.id === profileStoreId) || stores[0];
            if (!activeStore) {
              return (
                <div className="rounded-3xl border border-[#E5DDF5] bg-white p-8 text-center text-sm text-[#60567E] dark:border-[#22222C] dark:bg-[#0E0E13]">
                  Register a store first using the New Store button above to customize your Shop Profile.
                </div>
              );
            }
            const draft = profileDrafts[activeStore.id] || {
              name: activeStore.name || '',
              storeType: activeStore.storeType || 'physical_store',
              description: activeStore.description || '',
              area: activeStore.area || DJELFA_AREAS[0].name,
              address: activeStore.address || '',
              openingHours: activeStore.openingHours || '08:00 - 22:00',
              phone: activeStore.phone || '',
              whatsapp: activeStore.whatsapp || '',
              logoUrl: activeStore.logoUrl || '',
              facebookUrl: activeStore.facebookUrl || '',
              instagramUrl: activeStore.instagramUrl || '',
              googleMapsUrl: activeStore.googleMapsUrl || '',
            };
            const mapsPreviewHref = draft.googleMapsUrl.trim().startsWith('https://')
              ? draft.googleMapsUrl.trim()
              : `https://www.google.com/maps/search/?api=1&query=${activeStore.lat},${activeStore.lng}`;
            const initials = (draft.name || activeStore.name || 'S')
              .trim()
              .slice(0, 2)
              .toUpperCase();

            return (
              <form
                onSubmit={(e) => handleSaveStoreProfile(e, activeStore)}
                className="rounded-3xl border border-[#E5DDF5] bg-white p-6 space-y-6 dark:border-[#22222C] dark:bg-[#0E0E13]"
              >
                {/* Store Selector if merchant owns multiple stores */}
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#E5DDF5] pb-4 dark:border-[#22222C]">
                  <div>
                    <h2 className="font-display text-lg font-bold">Simple Shop Profile</h2>
                    <p className="text-xs text-[#60567E] dark:text-[#AEA2CB]">
                      Add your PFP / logo, shop name, channel type (Physical Store vs Online Page), WhatsApp, social pages, and Google Maps pin.
                    </p>
                  </div>
                  {stores.length > 1 && (
                    <div className="flex flex-wrap gap-1.5">
                      {stores.map((s) => (
                        <button
                          key={s.id}
                          type="button"
                          onClick={() => {
                            setProfileStoreId(s.id);
                            setLogoPreviewError(false);
                          }}
                          className={`rounded-full px-3 py-1.5 text-xs font-semibold transition cursor-pointer ${
                            s.id === activeStore.id
                              ? 'bg-[#4A3894] text-white'
                              : 'border border-[#E5DDF5] bg-[#F9F5FD] text-[#60567E] dark:border-[#22222C] dark:bg-[#15151C] dark:text-[#AEA2CB]'
                          }`}
                        >
                          {s.name}
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                {/* Channel Type Switcher: Physical Store vs Online Page (IG / FB) */}
                <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[#E5DDF5] bg-[#F9F5FD] p-3.5 dark:border-[#22222C] dark:bg-[#15151C]/80">
                  <div>
                    <div className="text-xs font-bold text-[#1D1538] dark:text-white">
                      Seller Channel Category
                    </div>
                    <div className="text-[11px] text-[#60567E] dark:text-[#AEA2CB]">
                      Choose which dedicated directory lists your business storefront.
                    </div>
                  </div>
                  <div className="inline-flex rounded-full border border-[#E5DDF5] bg-white p-1 text-xs font-semibold dark:border-[#22222C] dark:bg-[#0E0E13]">
                    <button
                      type="button"
                      onClick={() => updateProfileDraft(activeStore.id, { storeType: 'physical_store' })}
                      className={`rounded-full px-3.5 py-1.5 transition cursor-pointer ${
                        draft.storeType === 'physical_store'
                          ? 'bg-[#4A3894] text-white'
                          : 'text-[#60567E] dark:text-[#AEA2CB]'
                      }`}
                    >
                      Physical Store
                    </button>
                    <button
                      type="button"
                      onClick={() => updateProfileDraft(activeStore.id, { storeType: 'online_page' })}
                      className={`rounded-full px-3.5 py-1.5 transition cursor-pointer ${
                        draft.storeType === 'online_page'
                          ? 'bg-[#4A3894] text-white'
                          : 'text-[#60567E] dark:text-[#AEA2CB]'
                      }`}
                    >
                      Online Page (IG / FB)
                    </button>
                  </div>
                </div>

                {/* PFP / Logo + Basic Shop Identity */}
                <div className="grid gap-6 md:grid-cols-12">
                  <div className="md:col-span-5 space-y-3 rounded-2xl border border-[#E5DDF5] bg-[#F9F5FD] p-4 dark:border-[#22222C] dark:bg-[#15151C]/80">
                    <div className="text-xs font-bold uppercase tracking-wide text-[#4A3894] dark:text-[#9678CE]">
                      Shop PFP / Logo
                    </div>
                    <div className="flex items-center gap-4">
                      <div className="relative flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-[#E5DDF5] bg-[#4A3894] text-white shadow-xs dark:border-[#22222C]">
                        {draft.logoUrl.trim() && !logoPreviewError ? (
                          <img
                            src={draft.logoUrl.trim()}
                            alt={draft.name || activeStore.name}
                            referrerPolicy="no-referrer"
                            onError={() => setLogoPreviewError(true)}
                            className="h-full w-full object-cover"
                          />
                        ) : (
                          <span className="font-display text-xl font-extrabold text-[#FBEFFB]">
                            {initials}
                          </span>
                        )}
                      </div>
                      <div className="space-y-2">
                        <div className="flex flex-wrap gap-2">
                          <label className="inline-flex items-center gap-1.5 rounded-full bg-[#4A3894] px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-[#3A2B78] cursor-pointer">
                            <ImagePlus className="h-3.5 w-3.5" />
                            <span>
                              {uploadingLogoStoreId === activeStore.id ? 'Uploading...' : 'Upload Logo'}
                            </span>
                          <input
                            type="file"
                            accept="image/png,image/jpeg,image/webp"
                            className="hidden"
                            onChange={(e) => {
                              const file = e.target.files?.[0];
                              e.target.value = '';
                              if (file) {
                                uploadProductPhotoFile(
                                  file,
                                  (url) => {
                                    setLogoPreviewError(false);
                                    updateProfileDraft(activeStore.id, { logoUrl: url });
                                  },
                                  (busy) => setUploadingLogoStoreId(busy ? activeStore.id : null)
                                );
                              }
                            }}
                          />
                        </label>
                        {draft.logoUrl.trim() && (
                          <button
                            type="button"
                            onClick={() => {
                              setLogoPreviewError(false);
                              updateProfileDraft(activeStore.id, { logoUrl: '' });
                            }}
                            className="rounded-full border border-[#E4E4F0] bg-white px-3 py-1.5 text-xs font-semibold text-[#5E5C70] hover:text-rose-600 dark:border-[#22222C] dark:bg-[#15151C] cursor-pointer"
                          >
                            Remove
                          </button>
                        )}
                      </div>
                      <p className="text-[11px] text-[#5E5C70] dark:text-[#9D9BB0]">
                        PNG, JPG, or WebP up to 2MB, or paste a logo link below.
                      </p>
                    </div>
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold text-[#5E5C70] dark:text-[#9D9BB0]">
                      Or Logo Image URL (https://)
                    </label>
                    <input
                      value={draft.logoUrl}
                      onChange={(e) => {
                        setLogoPreviewError(false);
                        updateProfileDraft(activeStore.id, { logoUrl: e.target.value });
                      }}
                      placeholder="https://example.com/shop-logo.png"
                      className="mt-1 w-full rounded-xl border border-[#E4E4F0] bg-white px-3 py-2 text-xs dark:border-[#22222C] dark:bg-[#15151C]"
                    />
                  </div>
                </div>

                {/* Shop Name, Bio, Address, Hours */}
                <div className="md:col-span-7 grid gap-3 sm:grid-cols-2">
                  <div className="sm:col-span-2">
                    <label className="block text-xs font-bold text-[#13111C] dark:text-white">
                      {draft.storeType === 'online_page' ? 'Page / Seller Name' : 'Shop Name'}
                    </label>
                    <input
                      required
                      value={draft.name}
                      onChange={(e) => updateProfileDraft(activeStore.id, { name: e.target.value })}
                      placeholder={
                        draft.storeType === 'online_page'
                          ? 'Your Instagram / Facebook shop name'
                          : 'Your physical shop name'
                      }
                      className="mt-1 w-full rounded-xl border border-[#E4E4F0] bg-white px-3.5 py-2 text-sm font-semibold dark:border-[#22222C] dark:bg-[#15151C]"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-[#13111C] dark:text-white">
                      Neighborhood Area
                    </label>
                    <select
                      value={draft.area}
                      onChange={(e) => updateProfileDraft(activeStore.id, { area: e.target.value })}
                      className="mt-1 w-full rounded-xl border border-[#E5DDF5] bg-white px-3 py-2 text-xs dark:border-[#22222C] dark:bg-[#15151C]"
                    >
                      {areaNames.map((aName) => (
                        <option key={aName} value={aName}>
                          {getAreaDisplayName(aName, lang)}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-[#1D1538] dark:text-white">
                      Opening Hours
                    </label>
                    <input
                      value={draft.openingHours}
                      onChange={(e) => updateProfileDraft(activeStore.id, { openingHours: e.target.value })}
                      placeholder="08:00 - 22:00"
                      className="mt-1 w-full rounded-xl border border-[#E5DDF5] bg-white px-3 py-2 text-xs dark:border-[#22222C] dark:bg-[#15151C]"
                    />
                  </div>

                  <div className="sm:col-span-2">
                    <label className="block text-xs font-bold text-[#1D1538] dark:text-white">
                      {draft.storeType === 'online_page'
                        ? 'Dispatch / Coverage Note (optional)'
                        : 'Street Address'}
                    </label>
                    <input
                      required={draft.storeType !== 'online_page'}
                      value={draft.address}
                      onChange={(e) => updateProfileDraft(activeStore.id, { address: e.target.value })}
                      placeholder={
                        draft.storeType === 'online_page'
                          ? 'e.g. Online Storefront · Djelfa COD Delivery'
                          : 'e.g. Rue de la République, Centre-Ville, Djelfa'
                      }
                      className="mt-1 w-full rounded-xl border border-[#E5DDF5] bg-white px-3.5 py-2 text-xs dark:border-[#22222C] dark:bg-[#15151C]"
                    />
                  </div>

                  <div className="sm:col-span-2">
                    <label className="block text-xs font-bold text-[#13111C] dark:text-white">
                      Short Shop Bio
                    </label>
                    <textarea
                      required
                      rows={2}
                      value={draft.description}
                      onChange={(e) => updateProfileDraft(activeStore.id, { description: e.target.value })}
                      placeholder="What does your shop specialize in?"
                      className="mt-1 w-full rounded-xl border border-[#E4E4F0] bg-white px-3.5 py-2 text-xs dark:border-[#22222C] dark:bg-[#15151C]"
                    />
                  </div>
                </div>
              </div>

              {/* Social Pages, WhatsApp & Google Maps Location */}
              <div className="rounded-2xl border border-[#E4E4F0] bg-[#F8F8FC] p-4 space-y-4 dark:border-[#22222C] dark:bg-[#0E0E13]/85">
                <div className="text-xs font-bold uppercase tracking-wide text-[#6E65F6]">
                  Contact, Social Pages &amp; Google Maps Pin
                </div>

                <div className="grid gap-3.5 sm:grid-cols-2">
                  <div>
                    <label className="flex items-center gap-1.5 text-xs font-bold text-[#13111C] dark:text-white">
                      <MessageCircle className="h-3.5 w-3.5 text-emerald-600" />
                      <span>WhatsApp Number</span>
                    </label>
                    <input
                      required
                      value={draft.whatsapp}
                      onChange={(e) => updateProfileDraft(activeStore.id, { whatsapp: e.target.value })}
                      placeholder="213662451109"
                      className="mt-1 w-full rounded-xl border border-[#E4E4F0] bg-white px-3 py-2 text-xs tabular-nums dark:border-[#22222C] dark:bg-[#15151C]"
                    />
                    <span className="mt-1 block text-[10px] text-[#5E5C70] dark:text-[#9D9BB0]">
                      Digits with country code (e.g. 213662...) for direct WhatsApp chat button.
                    </span>
                  </div>

                  <div>
                    <label className="flex items-center gap-1.5 text-xs font-bold text-[#13111C] dark:text-white">
                      <Phone className="h-3.5 w-3.5 text-[#6E65F6]" />
                      <span>Phone Number</span>
                    </label>
                    <input
                      value={draft.phone}
                      onChange={(e) => updateProfileDraft(activeStore.id, { phone: e.target.value })}
                      placeholder="0662 45 11 09"
                      className="mt-1 w-full rounded-xl border border-[#E4E4F0] bg-white px-3 py-2 text-xs tabular-nums dark:border-[#22222C] dark:bg-[#15151C]"
                    />
                  </div>

                  <div>
                    <label className="flex items-center gap-1.5 text-xs font-bold text-[#13111C] dark:text-white">
                      <Globe className="h-3.5 w-3.5 text-blue-600" />
                      <span>Facebook Page</span>
                    </label>
                    <input
                      value={draft.facebookUrl}
                      onChange={(e) => updateProfileDraft(activeStore.id, { facebookUrl: e.target.value })}
                      placeholder="https://facebook.com/yourshop or @yourshop"
                      className="mt-1 w-full rounded-xl border border-[#E4E4F0] bg-white px-3 py-2 text-xs dark:border-[#22222C] dark:bg-[#15151C]"
                    />
                  </div>

                  <div>
                    <label className="flex items-center gap-1.5 text-xs font-bold text-[#13111C] dark:text-white">
                      <Globe className="h-3.5 w-3.5 text-pink-600" />
                      <span>Instagram Page</span>
                    </label>
                    <input
                      value={draft.instagramUrl}
                      onChange={(e) => updateProfileDraft(activeStore.id, { instagramUrl: e.target.value })}
                      placeholder="https://instagram.com/yourshop or @yourshop"
                      className="mt-1 w-full rounded-xl border border-[#E4E4F0] bg-white px-3 py-2 text-xs dark:border-[#22222C] dark:bg-[#15151C]"
                    />
                  </div>

                  <div className="sm:col-span-2">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <label className="flex items-center gap-1.5 text-xs font-bold text-[#13111C] dark:text-white">
                        <Navigation className="h-3.5 w-3.5 text-[#6E65F6]" />
                        <span>Google Maps Location Link or GPS Coordinates</span>
                      </label>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => handleUseCurrentGpsForStore(activeStore.id)}
                          className="inline-flex items-center gap-1 rounded-full bg-white px-3 py-1 text-[11px] font-semibold text-[#6E65F6] border border-[#E4E4F0] hover:border-[#6E65F6] dark:border-[#22222C] dark:bg-[#15151C] cursor-pointer"
                        >
                          <MapPin className="h-3 w-3" />
                          <span>Use My GPS</span>
                        </button>
                        <a
                          href={mapsPreviewHref}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1 text-[11px] font-semibold text-[#5E5C70] hover:text-[#6E65F6] dark:text-[#9D9BB0]"
                        >
                          <span>Test pin</span>
                          <ExternalLink className="h-3 w-3" />
                        </a>
                      </div>
                    </div>
                    <input
                      value={draft.googleMapsUrl}
                      onChange={(e) => updateProfileDraft(activeStore.id, { googleMapsUrl: e.target.value })}
                      placeholder="https://maps.app.goo.gl/... or 34.6728,3.2630"
                      className="mt-1 w-full rounded-xl border border-[#E5DDF5] bg-white px-3 py-2 text-xs dark:border-[#22222C] dark:bg-[#15151C]"
                    />
                  </div>
                </div>
              </div>

              {/* Save & Quick Actions */}
              <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => onOpenStore(activeStore.slug)}
                    className="inline-flex items-center gap-1.5 rounded-full border border-[#E5DDF5] bg-white px-4 py-2 text-xs font-semibold text-[#1D1538] hover:border-[#4A3894] dark:border-[#22222C] dark:bg-[#15151C] dark:text-white cursor-pointer"
                  >
                    <ExternalLink className="h-3.5 w-3.5 text-[#4A3894] dark:text-[#9678CE]" />
                    <span>Preview Storefront</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setQrInitialStoreId(activeStore.id);
                      setQrModalOpen(true);
                    }}
                    className="inline-flex items-center gap-1.5 rounded-full border border-[#E5DDF5] bg-white px-4 py-2 text-xs font-semibold text-[#1D1538] hover:border-[#4A3894] dark:border-[#22222C] dark:bg-[#15151C] dark:text-white cursor-pointer"
                  >
                    <QrCode className="h-3.5 w-3.5 text-[#4A3894] dark:text-[#9678CE]" />
                    <span>Print Store QR</span>
                  </button>
                </div>

                <button
                  type="submit"
                  disabled={savingProfileStoreId === activeStore.id}
                  className="inline-flex items-center gap-2 rounded-full bg-[#4A3894] px-6 py-2.5 text-xs font-extrabold text-white shadow-xs transition hover:bg-[#3A2B78] disabled:opacity-50 cursor-pointer"
                >
                  <Check className="h-4 w-4" />
                  <span>
                    {savingProfileStoreId === activeStore.id ? 'Saving Profile...' : 'Save Shop Profile'}
                  </span>
                </button>
              </div>
            </form>
          );
        })()
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {stores.map((store) => {
            const draft = zoneDrafts[store.id] || {
              deliveryZones: store.deliveryZones || [store.area],
              deliveryFee: store.deliveryFee ?? 200,
              deliveryRadiusKm: store.deliveryRadiusKm ?? 10,
            };
            return (
              <div
                key={store.id}
                className="rounded-3xl border border-[#E5DDF5] bg-white p-5 space-y-4 dark:border-[#22222C] dark:bg-[#0E0E13]"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-3 min-w-0">
                    <div className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-[#E5DDF5] bg-[#4A3894] text-xs font-extrabold text-[#FBEFFB] dark:border-[#22222C]">
                      {store.logoUrl ? (
                        <img
                          src={store.logoUrl}
                          alt={store.name}
                          referrerPolicy="no-referrer"
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        store.name.slice(0, 2).toUpperCase()
                      )}
                    </div>
                    <div className="min-w-0">
                      <div className="text-xs font-semibold uppercase text-[#4A3894] dark:text-[#9678CE]">
                        Approval: {store.approvalStatus}
                      </div>
                      <h3 className="font-display truncate text-lg font-bold">{store.name}</h3>
                      <p className="truncate text-xs text-[#60567E] dark:text-[#AEA2CB]">{store.address}</p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleToggleStoreOpen(store)}
                    className={`shrink-0 rounded-full px-3 py-1 text-xs font-bold cursor-pointer ${
                      store.isOpen
                        ? 'bg-emerald-600 text-white'
                        : 'bg-[#F9F5FD] text-[#60567E] dark:bg-[#15151C]'
                    }`}
                  >
                    {store.isOpen ? 'Open' : 'Closed'}
                  </button>
                </div>

                <p className="text-xs text-[#60567E] dark:text-[#AEA2CB]">{store.description}</p>

                {/* Store Delivery Zone Editor */}
                <div className="rounded-2xl border border-[#E5DDF5] bg-[#F9F5FD] p-3.5 space-y-3 dark:border-[#22222C] dark:bg-[#15151C]/80">
                  <div className="flex items-center justify-between text-xs font-bold">
                    <span className="inline-flex items-center gap-1.5 text-[#1D1538] dark:text-white">
                      <MapPin className="h-3.5 w-3.5 text-[#4A3894] dark:text-[#9678CE]" />
                      Delivery Zones &amp; Fee
                    </span>
                    <span className="text-[11px] text-[#4A3894] dark:text-[#9678CE] tabular-nums">
                      {draft.deliveryRadiusKm} km radius
                    </span>
                  </div>

                  <div className="flex flex-wrap gap-1.5">
                    {areaNames.map((areaName) => {
                      const active = draft.deliveryZones.includes(areaName);
                      return (
                        <button
                          key={areaName}
                          type="button"
                          onClick={() => handleToggleStoreZone(store.id, areaName)}
                          className={`rounded-full px-2.5 py-1 text-[11px] font-semibold transition cursor-pointer ${
                            active
                              ? 'bg-[#4A3894] text-white'
                              : 'border border-[#E5DDF5] bg-white text-[#60567E] dark:border-[#22222C] dark:bg-[#0E0E13] dark:text-[#AEA2CB]'
                          }`}
                        >
                          {getAreaDisplayName(areaName, lang)}
                        </button>
                      );
                    })}
                  </div>

                  <div className="grid grid-cols-2 gap-2.5">
                    <div>
                      <label className="block text-[11px] text-[#60567E] dark:text-[#AEA2CB]">
                        Delivery Fee (DZD)
                      </label>
                      <input
                        type="number"
                        min={0}
                        max={5000}
                        value={draft.deliveryFee}
                        onChange={(e) =>
                          setZoneDrafts((prev) => ({
                            ...prev,
                            [store.id]: {
                              ...draft,
                              deliveryFee: Number(e.target.value),
                            },
                          }))
                        }
                        className="mt-1 w-full rounded-xl border border-[#E5DDF5] bg-white px-2.5 py-1.5 text-xs font-bold tabular-nums dark:border-[#22222C] dark:bg-[#0E0E13]"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] text-[#60567E] dark:text-[#AEA2CB]">
                        Coverage Radius (km)
                      </label>
                      <input
                        type="number"
                        min={1}
                        max={100}
                        value={draft.deliveryRadiusKm}
                        onChange={(e) =>
                          setZoneDrafts((prev) => ({
                            ...prev,
                            [store.id]: {
                              ...draft,
                              deliveryRadiusKm: Number(e.target.value),
                            },
                          }))
                        }
                        className="mt-1 w-full rounded-xl border border-[#E5DDF5] bg-white px-2.5 py-1.5 text-xs font-bold tabular-nums dark:border-[#22222C] dark:bg-[#0E0E13]"
                      />
                    </div>
                  </div>

                  <button
                    type="button"
                    disabled={savingZoneStoreId === store.id}
                    onClick={() => handleSaveDeliveryZone(store)}
                    className="w-full rounded-full bg-[#4A3894] py-2 text-xs font-extrabold text-white hover:bg-[#3A2B78] disabled:opacity-50 cursor-pointer"
                  >
                    {savingZoneStoreId === store.id ? 'Saving...' : 'Save Delivery Zone'}
                  </button>
                </div>

                <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-[#E5DDF5] dark:border-[#22222C] text-xs">
                  <span>Hours: {store.openingHours}</span>
                  <div className="flex items-center gap-3">
                    <button
                      type="button"
                      onClick={() => {
                        setProfileStoreId(store.id);
                        setLogoPreviewError(false);
                        setTab('profile');
                      }}
                      className="inline-flex items-center gap-1 font-bold text-[#4A3894] dark:text-[#9678CE] hover:underline cursor-pointer"
                    >
                      <UserCircle className="h-3.5 w-3.5" />
                      <span>Edit Profile</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setQrInitialStoreId(store.id);
                        setQrModalOpen(true);
                      }}
                      className="inline-flex items-center gap-1 font-bold text-[#1D1538] hover:text-[#4A3894] dark:text-[#9678CE] cursor-pointer"
                    >
                      <QrCode className="h-3.5 w-3.5" />
                      <span>Print QR</span>
                    </button>
                    {store.approvalStatus === 'approved' && (
                      <button
                        type="button"
                        onClick={() => onOpenStore(store.slug)}
                        className="font-semibold text-[#6E65F6] hover:underline cursor-pointer"
                      >
                        Share Storefront ↗
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Edit Product Modal */}
      {editingListing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-xs">
          <form
            onSubmit={handleSaveEditListing}
            className="max-h-[90vh] w-full max-w-xl overflow-y-auto rounded-3xl border border-[#E4E4F0] bg-white p-6 shadow-2xl space-y-4 dark:border-[#22222C] dark:bg-[#0E0E13]"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-xs font-bold uppercase tracking-wider text-[#6E65F6]">
                  Edit Product Listing · {editingListing.storeName}
                </div>
                <h2 className="font-display text-xl font-bold">{editingListing.productName}</h2>
              </div>
              <button
                type="button"
                onClick={() => setEditingListing(null)}
                aria-label="Close edit product modal"
                className="rounded-full p-2 text-[#5E5C70] hover:bg-[#F4F5FB] dark:hover:bg-[#15151C] cursor-pointer"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Product Photo Upload / URL Preview */}
            <div className="flex flex-wrap items-center gap-4 rounded-2xl border border-[#E4E4F0] bg-[#F8F8FC] p-3.5 dark:border-[#22222C] dark:bg-[#0E0E13]/85">
              <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-2xl bg-white border border-[#E4E4F0] dark:border-[#22222C] dark:bg-[#15151C] overflow-hidden">
                <ProductArtwork
                  categoryId={editCatId}
                  imageKey={editImageKey}
                  imageUrl={editImageUrl}
                  alt={editName || editingListing.productName}
                  className="h-18 w-18"
                />
              </div>
              <div className="min-w-[220px] flex-1 space-y-2">
                <div className="flex flex-wrap items-center gap-2">
                  <label className="inline-flex items-center gap-1.5 rounded-full bg-[#4A3894] px-3.5 py-1.5 text-xs font-semibold text-white cursor-pointer">
                    <ImagePlus className="h-3.5 w-3.5" />
                    <span>{editUploadingPhoto ? 'Uploading...' : 'Upload New Photo'}</span>
                    <input
                      type="file"
                      accept="image/png,image/jpeg,image/webp"
                      disabled={editUploadingPhoto}
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) {
                          uploadProductPhotoFile(file, setEditImageUrl, setEditUploadingPhoto);
                        }
                        e.target.value = '';
                      }}
                      className="sr-only"
                    />
                  </label>
                  {editImageUrl && (
                    <button
                      type="button"
                      onClick={() => setEditImageUrl('')}
                      className="text-xs font-semibold text-rose-600 hover:underline cursor-pointer"
                    >
                      Remove photo
                    </button>
                  )}
                </div>
                <input
                  value={editImageUrl}
                  onChange={(e) => setEditImageUrl(e.target.value)}
                  placeholder="Or paste safe https:// photo URL"
                  className="w-full rounded-xl border border-[#E5DDF5] bg-white px-3 py-1.5 text-xs dark:border-[#22222C] dark:bg-[#15151C]"
                />
              </div>
            </div>

            {/* Price History Preview */}
            <PriceHistorySparkline
              history={editingListing.priceHistory}
              currentPrice={Number(editPrice) || editingListing.price}
              lang={lang}
            />

            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className="block text-[11px] font-semibold text-[#60567E] dark:text-[#AEA2CB]">
                  Product Name
                </label>
                <input
                  required
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-[#E5DDF5] px-3 py-2 text-xs dark:border-[#22222C] dark:bg-[#15151C]"
                />
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-[#60567E] dark:text-[#AEA2CB]">
                  Brand
                </label>
                <input
                  required
                  value={editBrand}
                  onChange={(e) => setEditBrand(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-[#E5DDF5] px-3 py-2 text-xs dark:border-[#22222C] dark:bg-[#15151C]"
                />
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-[#60567E] dark:text-[#AEA2CB]">
                  Category
                </label>
                <select
                  value={editCatId}
                  onChange={(e) => setEditCatId(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-[#E5DDF5] bg-white px-3 py-2 text-xs dark:border-[#22222C] dark:bg-[#15151C]"
                >
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {isAr ? c.nameAr : c.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-[#60567E] dark:text-[#AEA2CB]">
                  Fallback SVG Artwork
                </label>
                <select
                  value={editImageKey}
                  onChange={(e) => setEditImageKey(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-[#E5DDF5] bg-white px-3 py-2 text-xs dark:border-[#22222C] dark:bg-[#15151C]"
                >
                  {IMAGE_KEY_OPTIONS.map((opt) => (
                    <option key={opt.id} value={opt.id}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-[#60567E] dark:text-[#AEA2CB]">
                  Price (DZD)
                </label>
                <input
                  required
                  type="number"
                  min={1}
                  value={editPrice}
                  onChange={(e) => setEditPrice(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-[#E5DDF5] px-3 py-2 text-xs font-bold tabular-nums dark:border-[#22222C] dark:bg-[#15151C]"
                />
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-[#60567E] dark:text-[#AEA2CB]">
                  Stock Quantity (Optional)
                </label>
                <input
                  type="number"
                  min={0}
                  value={editQty}
                  onChange={(e) => setEditQty(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-[#E5DDF5] px-3 py-2 text-xs tabular-nums dark:border-[#22222C] dark:bg-[#15151C]"
                />
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-[#60567E] dark:text-[#AEA2CB]">
                  Availability Status
                </label>
                <select
                  value={editStatus}
                  onChange={(e) => setEditStatus(e.target.value as AvailabilityStatus)}
                  className="mt-1 w-full rounded-xl border border-[#E5DDF5] bg-white px-3 py-2 text-xs dark:border-[#22222C] dark:bg-[#15151C]"
                >
                  <option value="in_stock">In stock</option>
                  <option value="out_of_stock">Out of stock</option>
                  <option value="unconfirmed">Availability unconfirmed</option>
                </select>
              </div>
              <div className="flex items-end pb-1.5">
                <label className="inline-flex items-center gap-2 text-xs font-semibold cursor-pointer">
                  <input
                    type="checkbox"
                    checked={editActive}
                    onChange={(e) => setEditActive(e.target.checked)}
                    className="h-4 w-4 accent-[#4A3894]"
                  />
                  <span>Visible in customer marketplace</span>
                </label>
              </div>
            </div>

            <div>
              <label className="block text-[11px] font-semibold text-[#60567E] dark:text-[#AEA2CB]">
                Description
              </label>
              <textarea
                required
                rows={2}
                value={editDesc}
                onChange={(e) => setEditDesc(e.target.value)}
                className="mt-1 w-full rounded-xl border border-[#E5DDF5] px-3 py-2 text-xs dark:border-[#22222C] dark:bg-[#15151C]"
              />
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setEditingListing(null)}
                className="rounded-full border border-[#E5DDF5] px-4 py-2 text-xs font-semibold dark:border-[#22222C] cursor-pointer"
              >
                {isAr ? 'إلغاء' : 'Cancel'}
              </button>
              <button
                type="submit"
                disabled={savingEdit}
                className="rounded-full bg-[#4A3894] px-5 py-2 text-xs font-extrabold text-white hover:bg-[#3A2B78] disabled:opacity-50 cursor-pointer"
              >
                {savingEdit ? (isAr ? 'جاري الحفظ...' : 'Saving...') : isAr ? 'حفظ التغييرات' : 'Save Changes'}
              </button>
            </div>
          </form>
        </div>
      )}

      <SellerQRPrintModal
        open={qrModalOpen}
        stores={stores}
        initialStoreId={qrInitialStoreId}
        onClose={() => setQrModalOpen(false)}
        onPreviewStore={(slug) => onOpenStore(slug)}
        notify={notify}
      />
    </section>
  );
};
