import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  ArrowUpRight,
  BarChart3,
  ChevronLeft,
  ChevronRight,
  Clock,
  ExternalLink,
  Flag,
  Globe,
  Heart,
  ImagePlus,
  MapPin,
  MessageCircle,
  MessageSquarePlus,
  Minus,
  Moon,
  Navigation,
  Pencil,
  Phone,
  Plus,
  QrCode,
  Save,
  Search,
  Share2,
  ShoppingBag,
  Star,
  Store as StoreIcon,
  Sun,
  Truck,
  X,
} from 'lucide-react';
import type {
  AvailabilityStatus,
  Category,
  ElOuedArea,
  EnrichedListing,
  LanguageCode,
  PublicUser,
  SellerBusinessType,
  Store,
  StoreReview,
} from '../../shared/types.ts';
import { DJELFA_AREAS, getAreaDisplayName } from '../../shared/locationConfig.ts';
import {
  CANONICAL_CATEGORIES,
  getSubPartId,
  getSubPartLabel,
  resolveStoreThemeVariant,
  type StoreThemeVariant,
} from '../../shared/taxonomy.ts';
import { apiFetch } from '../lib/api.ts';
import {
  buildEnrichedListingsFromFirestore,
  fetchFirestoreStoreBySlug,
  saveSellerProductToFirestore,
  saveStoreProfileToFirestore,
  type FirestoreSellerProduct,
  type FirestoreStore,
} from '../lib/firestoreProducts.ts';
import { formatDzd, formatRelativeTime } from '../lib/format.ts';
import { t } from '../lib/i18n.ts';
import type { CartItem } from './CartCheckoutDrawer.tsx';
import { ElOuedMap } from './ElOuedMap.tsx';
import { useFirebase } from './FirebaseProvider.tsx';
import { ProductArtwork } from './ProductArtwork.tsx';
import { PWAInstallButton } from './PWAInstallButton.tsx';

const OWNER_IMAGE_KEYS = [
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

const FALLBACK_CATEGORIES: Category[] = CANONICAL_CATEGORIES;

interface StoreThemeConfig {
  variant: StoreThemeVariant;
  badgeLabel: string;
  pageBg: string;
  ambientGlow: string;
  headerBg: string;
  surfaceBg: string;
  surfaceHover: string;
  wellBg: string;
  inputBg: string;
  accentText: string;
  accentBg: string;
  accentBorder: string;
  highlightBtn: string;
  highlightText: string;
  sliderProgressBg: string;
}

const STORE_THEMES: Record<StoreThemeVariant, StoreThemeConfig> = {
  consoles: {
    variant: 'consoles',
    badgeLabel: 'Consoles & Gaming Only',
    pageBg: 'bg-[#120D24]',
    ambientGlow:
      'radial-gradient(64% 48% at 86% 0%, rgba(150,120,206,0.28), rgba(231,148,201,0.08) 52%, transparent 72%)',
    headerBg: 'border-[#2E2548] bg-[#120D24]/92',
    surfaceBg: 'border-[#2E2548] bg-[#1A1330]',
    surfaceHover: 'hover:border-[#9678CE]/70',
    wellBg: 'bg-[#140E27]',
    inputBg: 'border-[#332752] bg-[#151029] text-white placeholder:text-[#988CB8]',
    accentText: 'text-[#C49BF5]',
    accentBg: 'bg-[#4A3894] text-white',
    accentBorder: 'border-[#9678CE]',
    highlightBtn: 'bg-[#9678CE] text-white hover:bg-[#7D5EB8]',
    highlightText: 'text-[#E794C9]',
    sliderProgressBg: 'bg-[#9678CE]',
  },
  pc_parts: {
    variant: 'pc_parts',
    badgeLabel: 'PC & PC Parts Only',
    pageBg: 'bg-[#151029]',
    ambientGlow:
      'radial-gradient(64% 48% at 86% 0%, rgba(74,56,148,0.34), rgba(231,148,201,0.09) 52%, transparent 72%)',
    headerBg: 'border-[#2E2548] bg-[#151029]/92',
    surfaceBg: 'border-[#2E2548] bg-[#1E1736]',
    surfaceHover: 'hover:border-[#9678CE]/75',
    wellBg: 'bg-[#151029]',
    inputBg: 'border-[#332752] bg-[#16112B] text-white placeholder:text-[#988CB8]',
    accentText: 'text-[#C49BF5]',
    accentBg: 'bg-[#4A3894] text-white',
    accentBorder: 'border-[#9678CE]',
    highlightBtn: 'bg-[#9678CE] text-white hover:bg-[#7D5EB8]',
    highlightText: 'text-[#E794C9]',
    sliderProgressBg: 'bg-[#9678CE]',
  },
  phones: {
    variant: 'phones',
    badgeLabel: 'Phones & Mobile Gear Only',
    pageBg: 'bg-[#181026]',
    ambientGlow:
      'radial-gradient(64% 48% at 86% 0%, rgba(231,148,201,0.22), rgba(150,120,206,0.10) 52%, transparent 72%)',
    headerBg: 'border-[#342447] bg-[#181026]/92',
    surfaceBg: 'border-[#38274B] bg-[#221733]',
    surfaceHover: 'hover:border-[#E794C9]/70',
    wellBg: 'bg-[#181026]',
    inputBg: 'border-[#3B2A50] bg-[#191128] text-white placeholder:text-[#A995B8]',
    accentText: 'text-[#E794C9]',
    accentBg: 'bg-[#9678CE] text-white',
    accentBorder: 'border-[#E794C9]',
    highlightBtn: 'bg-[#E794C9] text-[#1E1438] hover:brightness-95',
    highlightText: 'text-[#E794C9]',
    sliderProgressBg: 'bg-[#E794C9]',
  },
};

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('Could not read selected image file.'));
    reader.readAsDataURL(file);
  });
}

interface SellerStorePageProps {
  storeSlug: string;
  areas: ElOuedArea[];
  categories?: Category[];
  coords: { lat: number; lng: number } | null;
  cloudStores: FirestoreStore[];
  cloudProducts: FirestoreSellerProduct[];
  lang: LanguageCode;
  onChangeLang: (lang: LanguageCode) => void;
  darkMode: boolean;
  onToggleDarkMode: () => void;
  user: PublicUser | null;
  cart: CartItem[];
  onAddToCart: (listing: EnrichedListing) => void;
  onUpdateCartQty: (listingId: string, delta: number) => void;
  onOpenCart: () => void;
  onCompareProduct: (productSlug: string) => void;
  isFavorite: boolean;
  onToggleFavorite: (type: 'store' | 'product', id: string) => void;
  onReviewSubmitted?: () => void;
  focusReviews?: boolean;
  onBackToMarketplace: () => void;
  onOpenQrPrint?: (storeId: string) => void;
  onOpenDashboard?: () => void;
  onStoreMutated?: () => void;
  notify: (msg: string, type?: 'success' | 'error') => void;
}

export const SellerStorePage: React.FC<SellerStorePageProps> = ({
  storeSlug,
  areas,
  categories,
  coords,
  cloudStores,
  cloudProducts,
  lang,
  onChangeLang,
  darkMode,
  onToggleDarkMode,
  user,
  cart,
  onAddToCart,
  onUpdateCartQty,
  onOpenCart,
  onCompareProduct,
  isFavorite,
  onToggleFavorite,
  onReviewSubmitted,
  focusReviews,
  onBackToMarketplace,
  onOpenQrPrint,
  onOpenDashboard,
  onStoreMutated,
  notify,
}) => {
  const dict = t(lang);
  const isAr = lang === 'ar';
  const { firebaseUser } = useFirebase();
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [apiStore, setApiStore] = useState<(Store & { distanceKm?: number | null }) | null>(null);
  const [apiListings, setApiListings] = useState<EnrichedListing[]>([]);
  const [fsFallbackStore, setFsFallbackStore] = useState<(Store & { distanceKm?: number | null }) | null>(null);
  const [fsFallbackListings, setFsFallbackListings] = useState<EnrichedListing[]>([]);
  const [reviews, setReviews] = useState<StoreReview[]>([]);

  // Store catalog filters & Pic-2 showcase slider state
  const [query, setQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [selectedSubPart, setSelectedSubPart] = useState<string>('all');
  const [sliderIndex, setSliderIndex] = useState(0);
  const [inStockOnly, setInStockOnly] = useState(false);
  const [sortBy, setSortBy] = useState<'featured' | 'popular' | 'lowest_price' | 'highest_price'>('featured');
  const [logoError, setLogoError] = useState(false);

  // Owner Storefront Studio controls (inline Edit Store Info + Add Product right on the dedicated storefront page)
  const [ownerPanel, setOwnerPanel] = useState<'none' | 'edit_store' | 'add_product'>('none');
  const [savingOwnerStore, setSavingOwnerStore] = useState(false);
  const [uploadingOwnerLogo, setUploadingOwnerLogo] = useState(false);
  const [ownerName, setOwnerName] = useState('');
  const [ownerType, setOwnerType] = useState<SellerBusinessType>('physical_store');
  const [ownerDesc, setOwnerDesc] = useState('');
  const [ownerArea, setOwnerArea] = useState(DJELFA_AREAS[0].name);
  const [ownerAddress, setOwnerAddress] = useState('');
  const [ownerHours, setOwnerHours] = useState('08:30 - 22:00');
  const [ownerPhone, setOwnerPhone] = useState('');
  const [ownerWhatsapp, setOwnerWhatsapp] = useState('');
  const [ownerLogoUrl, setOwnerLogoUrl] = useState('');
  const [ownerInstagram, setOwnerInstagram] = useState('');
  const [ownerFacebook, setOwnerFacebook] = useState('');
  const [ownerMapsUrl, setOwnerMapsUrl] = useState('');

  const [savingNewProd, setSavingNewProd] = useState(false);
  const [uploadingProdImg, setUploadingProdImg] = useState(false);
  const [newProdName, setNewProdName] = useState('');
  const [newProdBrand, setNewProdBrand] = useState('');
  const [newProdCatId, setNewProdCatId] = useState('cat-pc-parts');
  const [newProdImageKey, setNewProdImageKey] = useState('gpu');
  const [newProdImageUrl, setNewProdImageUrl] = useState('');
  const [newProdPrice, setNewProdPrice] = useState('');
  const [newProdStock, setNewProdStock] = useState('5');
  const [newProdStatus, setNewProdStatus] = useState<AvailabilityStatus>('in_stock');
  const [newProdDesc, setNewProdDesc] = useState('');

  // Review submission state
  const [reviewRating, setReviewRating] = useState(5);
  const [reviewAuthor, setReviewAuthor] = useState(user?.fullName || '');
  const [reviewComment, setReviewComment] = useState('');
  const [submittingReview, setSubmittingReview] = useState(false);

  const catalogSectionRef = useRef<HTMLElement | null>(null);
  const locationSectionRef = useRef<HTMLElement | null>(null);
  const reviewsSectionRef = useRef<HTMLElement | null>(null);
  const ownerStudioRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (user?.fullName) {
      setReviewAuthor(user.fullName);
    }
  }, [user?.fullName]);

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'auto' });
  }, [storeSlug]);

  useEffect(() => {
    if (!storeSlug) return;
    let active = true;
    setLoading(true);
    setNotFound(false);
    setLogoError(false);
    setQuery('');
    setSelectedCategory('all');
    setSelectedSubPart('all');
    setSliderIndex(0);
    setInStockOnly(false);

    const params = new URLSearchParams();
    if (coords) {
      params.set('lat', String(coords.lat));
      params.set('lng', String(coords.lng));
    }

    Promise.allSettled([
      apiFetch<{
        store: Store & { distanceKm?: number | null };
        listings: EnrichedListing[];
        reviews: StoreReview[];
      }>(`/api/marketplace/stores/${encodeURIComponent(storeSlug)}?${params.toString()}`),
      fetchFirestoreStoreBySlug(storeSlug, [], coords).catch(() => ({
        store: null,
        listings: [],
      })),
    ])
      .then(([apiRes, fsRes]) => {
        if (!active) return;
        const apiData = apiRes.status === 'fulfilled' ? apiRes.value : null;
        const fsData =
          fsRes.status === 'fulfilled' ? fsRes.value : { store: null, listings: [] };

        if (apiData) {
          setApiStore(apiData.store);
          setApiListings(apiData.listings || []);
          setReviews(apiData.reviews || []);
        } else {
          setApiStore(null);
          setApiListings([]);
          setReviews([]);
        }

        if (fsData.store) {
          setFsFallbackStore(fsData.store);
          setFsFallbackListings(fsData.listings || []);
        } else {
          setFsFallbackStore(null);
          setFsFallbackListings([]);
        }

        if (!apiData && !fsData.store) {
          setNotFound(true);
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [storeSlug, coords]);

  // Merge live Firestore cloudStores & cloudProducts with fetched store data
  const liveCloudStore = useMemo(
    () =>
      cloudStores.find(
        (cs) => cs.slug === storeSlug || cs.id === storeSlug || cs.id === apiStore?.id
      ) || null,
    [cloudStores, storeSlug, apiStore?.id]
  );

  const store = useMemo(() => {
    const base = apiStore || fsFallbackStore;
    if (!base && !liveCloudStore) return null;

    if (!base && liveCloudStore) {
      return {
        id: liveCloudStore.id,
        ownerId: liveCloudStore.ownerUid,
        name: liveCloudStore.name,
        slug: liveCloudStore.slug,
        storeType: liveCloudStore.storeType || 'physical_store',
        description: liveCloudStore.description,
        logoUrl: liveCloudStore.logoUrl || null,
        area: liveCloudStore.area,
        address:
          liveCloudStore.storeType === 'online_page'
            ? `Online Storefront · ${liveCloudStore.area}, ${liveCloudStore.city}`
            : `${liveCloudStore.area}, ${liveCloudStore.city}`,
        city: liveCloudStore.city || 'Djelfa',
        lat: 34.6728,
        lng: 3.263,
        phone: '0662 45 11 09',
        whatsapp: liveCloudStore.whatsapp || '213662451109',
        facebookUrl: liveCloudStore.facebookUrl || null,
        instagramUrl: liveCloudStore.instagramUrl || null,
        googleMapsUrl: liveCloudStore.googleMapsUrl || null,
        categories: ['cat-pc-parts'],
        openingHours: liveCloudStore.openingHours,
        isOpen: liveCloudStore.isOpen,
        rating: liveCloudStore.rating,
        reviewCount: liveCloudStore.reviewCount,
        approvalStatus: 'approved' as const,
        accentColor: '#4A3894',
        deliveryZones: [liveCloudStore.area],
        deliveryFee: liveCloudStore.deliveryFee,
        deliveryRadiusKm: liveCloudStore.deliveryRadiusKm,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        distanceKm: null,
      };
    }

    if (!base) return null;
    if (!liveCloudStore) return base;

    return {
      ...base,
      name: liveCloudStore.name || base.name,
      storeType: base.storeType || liveCloudStore.storeType || 'physical_store',
      description: liveCloudStore.description || base.description,
      openingHours: liveCloudStore.openingHours || base.openingHours,
      isOpen: liveCloudStore.isOpen ?? base.isOpen,
      rating: liveCloudStore.rating || base.rating,
      reviewCount: Math.max(base.reviewCount, liveCloudStore.reviewCount || 0),
      deliveryFee: liveCloudStore.deliveryFee ?? base.deliveryFee,
      deliveryRadiusKm: liveCloudStore.deliveryRadiusKm ?? base.deliveryRadiusKm,
      logoUrl: base.logoUrl ?? (liveCloudStore.logoUrl || null),
      whatsapp: base.whatsapp || liveCloudStore.whatsapp || '213662451109',
      facebookUrl: base.facebookUrl ?? (liveCloudStore.facebookUrl || null),
      instagramUrl: base.instagramUrl ?? (liveCloudStore.instagramUrl || null),
      googleMapsUrl: base.googleMapsUrl ?? (liveCloudStore.googleMapsUrl || null),
    };
  }, [apiStore, fsFallbackStore, liveCloudStore]);

  const listings = useMemo(() => {
    const map = new Map<string, EnrichedListing>();
    for (const item of apiListings) {
      map.set(item.listingId, item);
    }

    const storeList = store ? [store] : [];
    const liveFsProducts =
      store && cloudProducts.length > 0
        ? buildEnrichedListingsFromFirestore(
            cloudProducts.filter((p) => p.storeId === store.id),
            cloudStores,
            storeList,
            coords
          )
        : [];

    for (const fsItem of [...fsFallbackListings, ...liveFsProducts]) {
      const existing = map.get(fsItem.listingId);
      if (existing) {
        map.set(fsItem.listingId, {
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
        map.set(fsItem.listingId, fsItem);
      }
    }

    return Array.from(map.values());
  }, [apiListings, fsFallbackListings, store, cloudProducts, cloudStores, coords]);

  // Update browser document title while viewing dedicated seller page
  useEffect(() => {
    if (!store) return;
    const prevTitle = document.title;
    document.title = `${isAr ? 'ماركتلي' : 'Marketly'} | ${store.name} (${getAreaDisplayName(store.area, lang)})`;
    return () => {
      document.title = prevTitle;
    };
  }, [store, isAr, lang]);

  useEffect(() => {
    if (focusReviews && !loading && store && reviewsSectionRef.current) {
      const timer = setTimeout(() => {
        reviewsSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [focusReviews, loading, store]);

  const themeVariant = useMemo(
    () => resolveStoreThemeVariant(store, listings),
    [store, listings]
  );
  const theme = STORE_THEMES[themeVariant];

  const storeSubParts = useMemo(() => {
    const groups = new Map<
      string,
      { id: string; label: string; minPrice: number; sampleItem: EnrichedListing; count: number }
    >();
    for (const item of listings) {
      const spId = getSubPartId(item);
      const existing = groups.get(spId);
      if (!existing) {
        groups.set(spId, {
          id: spId,
          label: getSubPartLabel(spId, lang),
          minPrice: item.price,
          sampleItem: item,
          count: 1,
        });
      } else {
        existing.count += 1;
        if (item.price < existing.minPrice) existing.minPrice = item.price;
        if (item.soldCount > existing.sampleItem.soldCount) existing.sampleItem = item;
      }
    }
    return Array.from(groups.values());
  }, [listings, lang]);

  const bentoTiles = useMemo(() => storeSubParts.slice(0, 4), [storeSubParts]);

  const sliderListings = useMemo(() => {
    const sorted = [...listings].sort((a, b) => {
      const aStock = a.availabilityStatus === 'in_stock' ? 0 : 1;
      const bStock = b.availabilityStatus === 'in_stock' ? 0 : 1;
      if (aStock !== bStock) return aStock - bStock;
      return b.soldCount - a.soldCount;
    });
    return sorted.slice(0, 6);
  }, [listings]);

  useEffect(() => {
    if (sliderIndex >= sliderListings.length && sliderListings.length > 0) {
      setSliderIndex(0);
    }
  }, [sliderIndex, sliderListings.length]);

  const filteredListings = useMemo(() => {
    const q = query.trim().toLowerCase();
    let items = listings.filter((item) => {
      if (selectedCategory !== 'all' && item.categoryId !== selectedCategory) return false;
      if (selectedSubPart !== 'all' && getSubPartId(item) !== selectedSubPart) return false;
      if (inStockOnly && item.availabilityStatus !== 'in_stock') return false;
      if (!q) return true;
      return `${item.productName} ${item.brand} ${item.categoryName} ${item.description}`
        .toLowerCase()
        .includes(q);
    });

    items = [...items];
    items.sort((a, b) => {
      const stockRank = (s: EnrichedListing['availabilityStatus']) =>
        s === 'in_stock' ? 0 : s === 'unconfirmed' ? 1 : 2;
      if (sortBy === 'lowest_price') {
        const sr = stockRank(a.availabilityStatus) - stockRank(b.availabilityStatus);
        return sr !== 0 ? sr : a.price - b.price;
      }
      if (sortBy === 'highest_price') {
        return b.price - a.price;
      }
      if (sortBy === 'popular') {
        return b.soldCount - a.soldCount;
      }
      const sr = stockRank(a.availabilityStatus) - stockRank(b.availabilityStatus);
      return sr !== 0 ? sr : b.soldCount - a.soldCount;
    });
    return items;
  }, [listings, query, selectedCategory, selectedSubPart, inStockOnly, sortBy]);

  const directStoreUrl = useMemo(() => {
    if (typeof window === 'undefined' || !store) return '';
    const encoded = encodeURIComponent(store.slug);
    return `${window.location.origin}/?store=${encoded}#store/${encoded}`;
  }, [store]);

  const cartQtyMap = useMemo(() => {
    const map = new Map<string, number>();
    for (const item of cart) {
      map.set(item.listingId, item.quantity);
    }
    return map;
  }, [cart]);

  const cartCount = useMemo(() => cart.reduce((sum, i) => sum + i.quantity, 0), [cart]);
  const cartSubtotal = useMemo(
    () => cart.reduce((sum, i) => sum + i.price * i.quantity, 0),
    [cart]
  );

  const handleCopyShareLink = async () => {
    if (!store || !directStoreUrl) return;
    try {
      await navigator.clipboard.writeText(directStoreUrl);
      notify(`Direct link to ${store.name} copied!`);
    } catch {
      notify(`Store link: ${directStoreUrl}`);
    }
  };

  const handleReportStore = async () => {
    if (!store) return;
    try {
      await apiFetch('/api/reports', {
        method: 'POST',
        body: JSON.stringify({
          targetType: 'store',
          targetId: store.id,
          targetName: store.name,
          reason: 'Customer requested moderation review for storefront details.',
        }),
      });
      notify('Report submitted for admin review.');
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Report failed.', 'error');
    }
  };

  const handleSubmitReview = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!store) return;
    if (reviewComment.trim().length < 3) {
      notify('Please write at least 3 characters in your review.', 'error');
      return;
    }
    setSubmittingReview(true);
    try {
      const res = await apiFetch<{ review: StoreReview; store: Store; reviews: StoreReview[] }>(
        `/api/marketplace/stores/${encodeURIComponent(store.slug)}/reviews`,
        {
          method: 'POST',
          body: JSON.stringify({
            rating: reviewRating,
            comment: reviewComment.trim(),
            authorName: user?.fullName || reviewAuthor.trim() || undefined,
          }),
        }
      );
      setApiStore((prev) => (prev ? { ...prev, ...res.store } : res.store));
      setReviews(res.reviews);
      setReviewComment('');
      setReviewRating(5);
      notify(`Thank you! Review added to ${store.name}.`);
      onReviewSubmitted?.();
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Could not submit review.', 'error');
    } finally {
      setSubmittingReview(false);
    }
  };

  const reloadStoreData = useCallback(async () => {
    if (!storeSlug) return;
    const params = new URLSearchParams();
    if (coords) {
      params.set('lat', String(coords.lat));
      params.set('lng', String(coords.lng));
    }
    try {
      const apiData = await apiFetch<{
        store: Store & { distanceKm?: number | null };
        listings: EnrichedListing[];
        reviews: StoreReview[];
      }>(`/api/marketplace/stores/${encodeURIComponent(storeSlug)}?${params.toString()}`);
      setApiStore(apiData.store);
      setApiListings(apiData.listings || []);
      setReviews(apiData.reviews || []);
    } catch {
      // ignore fallback refresh error
    }
  }, [storeSlug, coords]);

  const isMerchantOwner = Boolean(
    user && store && user.roles.includes('merchant') && store.ownerId === user.id
  );

  // Sync owner profile draft fields whenever the loaded store changes
  useEffect(() => {
    if (!store) return;
    setOwnerName(store.name || '');
    setOwnerType(store.storeType || 'physical_store');
    setOwnerDesc(store.description || '');
    setOwnerArea(store.area || DJELFA_AREAS[0].name);
    setOwnerAddress(store.address || '');
    setOwnerHours(store.openingHours || '08:30 - 22:00');
    setOwnerPhone(store.phone || '');
    setOwnerWhatsapp(store.whatsapp || '');
    setOwnerLogoUrl(store.logoUrl || '');
    setOwnerInstagram(store.instagramUrl || '');
    setOwnerFacebook(store.facebookUrl || '');
    setOwnerMapsUrl(store.googleMapsUrl || '');
  }, [store]);

  const availableCategories = categories && categories.length > 0 ? categories : FALLBACK_CATEGORIES;
  const availableAreaNames =
    areas.length > 0
      ? areas.map((a) => a.name)
      : DJELFA_AREAS.map((a) => a.name);

  const handleUploadOwnerLogo = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingOwnerLogo(true);
    try {
      const dataUrl = await readFileAsDataUrl(file);
      const uploaded = await apiFetch<{ imageUrl: string }>('/api/merchant/upload-photo', {
        method: 'POST',
        body: JSON.stringify({ dataUrl }),
      });
      setOwnerLogoUrl(uploaded.imageUrl);
      setLogoError(false);
      notify('Logo photo uploaded! Click Save Storefront Changes to publish.');
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Logo upload failed.', 'error');
    } finally {
      setUploadingOwnerLogo(false);
      e.target.value = '';
    }
  };

  const handleUploadOwnerProdPhoto = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingProdImg(true);
    try {
      const dataUrl = await readFileAsDataUrl(file);
      const uploaded = await apiFetch<{ imageUrl: string }>('/api/merchant/upload-photo', {
        method: 'POST',
        body: JSON.stringify({ dataUrl }),
      });
      setNewProdImageUrl(uploaded.imageUrl);
      notify('Product photo uploaded!');
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Photo upload failed.', 'error');
    } finally {
      setUploadingProdImg(false);
      e.target.value = '';
    }
  };

  const handleSaveOwnerProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!store) return;
    if (ownerName.trim().length < 2) {
      notify('Store name must be at least 2 characters.', 'error');
      return;
    }
    setSavingOwnerStore(true);
    try {
      const cleanWa = ownerWhatsapp.trim() || ownerPhone.trim();
      const res = await apiFetch<{ store: Store }>(`/api/merchant/stores/${store.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          name: ownerName.trim(),
          storeType: ownerType,
          description: ownerDesc.trim().length >= 4 ? ownerDesc.trim() : store.description,
          area: ownerArea,
          address:
            ownerType === 'physical_store'
              ? ownerAddress.trim() || `${ownerArea}, Djelfa`
              : `Online Storefront · ${ownerArea}, Djelfa`,
          openingHours: ownerHours.trim() || '08:30 - 22:00',
          phone: ownerPhone.trim() || store.phone,
          whatsapp: cleanWa.replace(/\D/g, '') || store.whatsapp,
          logoUrl: ownerLogoUrl.trim() || null,
          instagramUrl: ownerInstagram.trim() || null,
          facebookUrl: ownerFacebook.trim() || null,
          googleMapsUrl: ownerMapsUrl.trim() || null,
        }),
      });
      setApiStore((prev) => (prev ? { ...prev, ...res.store } : res.store));
      setLogoError(false);
      if (firebaseUser && firebaseUser.emailVerified) {
        await saveStoreProfileToFirestore(firebaseUser, res.store).catch(() => {});
      }
      setOwnerPanel('none');
      onStoreMutated?.();
      notify(`${res.store.name} storefront details updated!`);
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Could not update store profile.', 'error');
    } finally {
      setSavingOwnerStore(false);
    }
  };

  const handleAddOwnerProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!store) return;
    const priceNum = Number(newProdPrice);
    if (!newProdName.trim() || !newProdBrand.trim() || !Number.isFinite(priceNum) || priceNum < 1) {
      notify('Enter a valid product name, brand, and price in DZD.', 'error');
      return;
    }
    setSavingNewProd(true);
    try {
      const created = await apiFetch<{ listing: { id: string } }>('/api/merchant/listings', {
        method: 'POST',
        body: JSON.stringify({
          storeId: store.id,
          name: newProdName.trim(),
          brand: newProdBrand.trim(),
          description:
            newProdDesc.trim().length >= 4
              ? newProdDesc.trim()
              : `${newProdBrand.trim()} ${newProdName.trim()} available at ${store.name}.`,
          categoryId: newProdCatId,
          imageKey: newProdImageKey,
          imageUrl: newProdImageUrl.trim() || null,
          price: Math.round(priceNum),
          stockQuantity: newProdStock ? Math.max(0, Math.round(Number(newProdStock))) : null,
          availabilityStatus: newProdStatus,
        }),
      });
      if (firebaseUser && firebaseUser.emailVerified) {
        const cat = availableCategories.find((c) => c.id === newProdCatId);
        await saveSellerProductToFirestore(firebaseUser, {
          id: created.listing.id,
          store,
          name: newProdName.trim(),
          brand: newProdBrand.trim(),
          description:
            newProdDesc.trim().length >= 4
              ? newProdDesc.trim()
              : `${newProdBrand.trim()} ${newProdName.trim()}`,
          categoryId: newProdCatId,
          categoryName: cat?.name || 'Hardware',
          imageKey: newProdImageKey,
          imageUrl: newProdImageUrl.trim(),
          price: Math.round(priceNum),
          stockQuantity: newProdStock ? Math.max(0, Math.round(Number(newProdStock))) : 0,
          availabilityStatus: newProdStatus,
          soldCount: 0,
          revenueTotal: 0,
          isActive: true,
          isBestSeller: false,
        }).catch(() => {});
      }
      setNewProdName('');
      setNewProdBrand('');
      setNewProdDesc('');
      setNewProdPrice('');
      setNewProdImageUrl('');
      setOwnerPanel('none');
      await reloadStoreData();
      onStoreMutated?.();
      notify(`${newProdName.trim()} added to ${store.name}!`);
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Could not add product.', 'error');
    } finally {
      setSavingNewProd(false);
    }
  };

  if (loading && !store) {
    return (
      <div
        dir={isAr ? 'rtl' : 'ltr'}
        className="min-h-screen bg-white text-[#1E1438] dark:bg-[#050507] dark:text-[#F4F1FC]"
      >
        <div className="marketly-awning" />
        <div className="mx-auto max-w-6xl px-4 sm:px-6 py-16 text-center space-y-4">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-[#F9F5FD] border border-[#E5DDF5] dark:bg-[#0E0E13] dark:border-[#22222C]">
            <StoreIcon className="h-6 w-6 text-[#4A3894] dark:text-[#9678CE]" />
          </div>
          <p className="font-display text-lg font-bold">
            {isAr ? 'جاري تحميل واجهة المتجر...' : 'Loading storefront...'}
          </p>
          <button
            type="button"
            onClick={onBackToMarketplace}
            className="text-xs font-semibold text-[#4A3894] dark:text-[#9678CE] hover:underline cursor-pointer"
          >
            {isAr ? 'العودة إلى جميع متاجر الجلفة' : 'Back to all Djelfa shops'}
          </button>
        </div>
      </div>
    );
  }

  if (notFound || !store) {
    return (
      <div
        dir={isAr ? 'rtl' : 'ltr'}
        className="min-h-screen bg-white text-[#1E1438] dark:bg-[#050507] dark:text-[#F4F1FC]"
      >
        <div className="marketly-awning" />
        <div className="mx-auto max-w-xl px-4 py-20 text-center space-y-4">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-[#F9F5FD] border border-[#E5DDF5] dark:bg-[#0E0E13] dark:border-[#22222C]">
            <StoreIcon className="h-6 w-6 text-[#5E5C70] dark:text-[#B9B0D8]" />
          </div>
          <h1 className="font-display text-2xl font-bold text-balance">
            {isAr ? 'واجهة المتجر غير موجودة' : 'Storefront not found'}
          </h1>
          <p className="text-sm text-[#5E5C70] dark:text-[#B9B0D8]">
            {isAr ? 'قد يكون رابط المتجر' : 'The store link'}{' '}
            <code className="font-mono">{storeSlug}</code>{' '}
            {isAr ? 'تغير أو غير متوفر حالياً.' : 'may have changed or is currently unavailable.'}
          </p>
          <button
            type="button"
            onClick={onBackToMarketplace}
            className="inline-flex items-center gap-2 rounded-full bg-[#4A3894] px-5 py-2.5 text-xs font-semibold text-white transition hover:bg-[#3A2B78] cursor-pointer"
          >
            <ArrowLeft className="h-3.5 w-3.5 rtl:rotate-180" />
            <span>{isAr ? 'تصفح جميع المتاجر' : 'Browse all shops'}</span>
          </button>
        </div>
      </div>
    );
  }

  const isOnlineOnly = store.storeType === 'online_page';
  const inStockCount = listings.filter((l) => l.availabilityStatus === 'in_stock').length;
  const zones =
    store.deliveryZones && store.deliveryZones.length > 0 ? store.deliveryZones : [store.area];
  const mapsUrl =
    store.googleMapsUrl && store.googleMapsUrl.startsWith('https://')
      ? store.googleMapsUrl
      : `https://www.google.com/maps/search/?api=1&query=${store.lat},${store.lng}`;

  const activeSlide = sliderListings[sliderIndex] || null;
  const activeSlideSubLabel = activeSlide ? getSubPartLabel(getSubPartId(activeSlide), lang) : '';

  return (
    <div
      dir={isAr ? 'rtl' : 'ltr'}
      className={`min-h-screen ${theme.pageBg} text-white transition-colors`}
      style={{ backgroundImage: theme.ambientGlow }}
    >
      {/* Top Header Bar */}
      <header className={`sticky top-0 z-30 border-b backdrop-blur-md ${theme.headerBg}`}>
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-6 px-4 sm:px-6 py-3.5">
          {/* Brand & Back */}
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={onBackToMarketplace}
              aria-label={isAr ? 'العودة للسوق' : 'Back to marketplace'}
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-white/15 bg-white/5 text-white/80 transition hover:bg-white/15 hover:text-white cursor-pointer"
            >
              <ArrowLeft className="h-3.5 w-3.5 rtl:rotate-180" />
            </button>
            <a
              href={directStoreUrl || '#top'}
              onClick={(e) => {
                e.preventDefault();
                window.scrollTo({ top: 0, behavior: 'smooth' });
              }}
              className="flex items-center gap-2.5 min-w-0"
            >
              <span
                className={`flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-full border ${theme.accentBorder} bg-white/5 font-display text-xs font-extrabold`}
              >
                {store.logoUrl && !logoError ? (
                  <img
                    src={store.logoUrl}
                    alt={store.name}
                    referrerPolicy="no-referrer"
                    onError={() => setLogoError(true)}
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <span className={theme.accentText}>{store.name.slice(0, 2).toUpperCase()}</span>
                )}
              </span>
              <span className="min-w-0">
                <span className="block truncate font-display text-sm sm:text-base font-extrabold tracking-tight text-white">
                  {store.name}
                </span>
                <span className={`block truncate text-[10px] font-semibold uppercase tracking-wider ${theme.accentText}`}>
                  {theme.badgeLabel}
                </span>
              </span>
            </a>
          </div>

          {/* Zone 2: Clean Single-Line Nav Links */}
          <nav className="hidden md:flex items-center gap-7 text-xs font-semibold text-[#A0A3B8]">
            <button
              type="button"
              onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
              className="whitespace-nowrap shrink-0 hover:text-white transition cursor-pointer"
            >
              Showcase
            </button>
            <button
              type="button"
              onClick={() =>
                catalogSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
              }
              className="whitespace-nowrap shrink-0 hover:text-white transition cursor-pointer"
            >
              Catalog ({listings.length})
            </button>
            <button
              type="button"
              onClick={() =>
                locationSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
              }
              className="whitespace-nowrap shrink-0 hover:text-white transition cursor-pointer"
            >
              Location
            </button>
            <button
              type="button"
              onClick={() =>
                reviewsSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
              }
              className="whitespace-nowrap shrink-0 hover:text-white transition cursor-pointer"
            >
              Reviews ({reviews.length})
            </button>
            <button
              type="button"
              onClick={onBackToMarketplace}
              className="whitespace-nowrap shrink-0 hover:text-white transition cursor-pointer"
            >
              All Shops
            </button>
          </nav>

          {/* Zone 3: Save Shop + Live Bag Subtotal Pill */}
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => onToggleFavorite('store', store.id)}
              aria-label={isFavorite ? 'Remove saved shop' : 'Save shop'}
              className={`flex h-9 w-9 items-center justify-center rounded-full border transition cursor-pointer ${
                isFavorite
                  ? `${theme.accentBorder} bg-white/10 ${theme.highlightText}`
                  : 'border-white/15 bg-white/5 text-white/75 hover:text-white'
              }`}
            >
              <Heart className={`h-4 w-4 ${isFavorite ? 'fill-current' : ''}`} />
            </button>

            <button
              type="button"
              onClick={onOpenCart}
              className="inline-flex items-center gap-2.5 rounded-full border border-white/15 bg-white/5 pl-3.5 pr-1.5 py-1 text-xs font-bold text-white transition hover:border-white/35 cursor-pointer whitespace-nowrap shrink-0"
            >
              <span className="tabular-nums text-white/85">
                {cartCount > 0 ? formatDzd(cartSubtotal, lang) : dict.cartButton}
              </span>
              <span
                className={`flex h-7 w-7 items-center justify-center rounded-full text-[11px] font-extrabold tabular-nums ${theme.accentBg}`}
              >
                {cartCount > 0 ? cartCount : <ShoppingBag className="h-3.5 w-3.5" />}
              </span>
            </button>
          </div>
        </div>
      </header>

      {/* Slim Utility & Owner Control Strip */}
      <div className="border-b border-white/8 bg-black/20">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-2 px-4 sm:px-6 py-2 text-xs">
          <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[#A6A9BD]">
            <span className={store.isOpen ? 'font-bold text-emerald-400' : 'font-bold text-rose-400'}>
              {store.isOpen ? dict.openStatus : dict.closedStatus}
            </span>
            <span aria-hidden="true">·</span>
            <span>
              {getAreaDisplayName(store.area, lang)}, {isAr ? 'الجلفة' : store.city || 'Djelfa'}
            </span>
            <span aria-hidden="true">·</span>
            <span>{store.openingHours}</span>
            <span aria-hidden="true">·</span>
            <button
              type="button"
              onClick={() =>
                reviewsSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
              }
              className="inline-flex items-center gap-1 font-bold text-white hover:underline cursor-pointer"
            >
              <Star className="h-3 w-3 fill-amber-400 text-amber-400" />
              <span className="tabular-nums">{store.rating}</span>
              <span className="text-[#8E91A8]">({store.reviewCount})</span>
            </button>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <PWAInstallButton compact lang={lang} />

            {isMerchantOwner && (
              <>
                {onOpenDashboard && (
                  <button
                    type="button"
                    onClick={onOpenDashboard}
                    className={`inline-flex items-center gap-1 rounded-full px-3 py-1 font-bold ${theme.accentBg} cursor-pointer whitespace-nowrap`}
                  >
                    <BarChart3 className="h-3 w-3" />
                    <span>{isAr ? 'لوحة التحليلات' : 'Dashboard'}</span>
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => {
                    setOwnerPanel((p) => (p === 'edit_store' ? 'none' : 'edit_store'));
                    setTimeout(() => ownerStudioRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50);
                  }}
                  className="inline-flex items-center gap-1 rounded-full border border-white/15 bg-white/5 px-2.5 py-1 font-semibold text-white hover:bg-white/15 cursor-pointer whitespace-nowrap"
                >
                  <Pencil className="h-3 w-3" />
                  <span>{isAr ? 'تعديل المتجر' : 'Edit Store'}</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setOwnerPanel((p) => (p === 'add_product' ? 'none' : 'add_product'));
                    setTimeout(() => ownerStudioRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50);
                  }}
                  className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 font-extrabold ${theme.highlightBtn} cursor-pointer whitespace-nowrap`}
                >
                  <Plus className="h-3 w-3" />
                  <span>{isAr ? 'إضافة منتج' : 'Add Product'}</span>
                </button>
                {onOpenQrPrint && (
                  <button
                    type="button"
                    onClick={() => onOpenQrPrint(store.id)}
                    className="inline-flex items-center gap-1 rounded-full border border-white/15 bg-white/5 px-2.5 py-1 font-semibold text-white hover:bg-white/15 cursor-pointer whitespace-nowrap"
                  >
                    <QrCode className="h-3 w-3" />
                    <span>{isAr ? 'طباعة QR' : 'Print QR'}</span>
                  </button>
                )}
              </>
            )}

            <select
              aria-label="Language"
              value={lang}
              onChange={(e) => onChangeLang(e.target.value as LanguageCode)}
              className="rounded-full border border-white/15 bg-white/5 px-2.5 py-1 text-[11px] font-semibold text-white"
            >
              <option value="en" className="text-black">EN</option>
              <option value="ar" className="text-black">AR</option>
            </select>
            <button
              type="button"
              onClick={onToggleDarkMode}
              aria-label="Toggle site theme"
              className="rounded-full border border-white/15 bg-white/5 p-1.5 text-white/80 hover:text-white cursor-pointer"
            >
              {darkMode ? <Sun className="h-3.5 w-3.5" /> : <Moon className="h-3.5 w-3.5" />}
            </button>
          </div>
        </div>
      </div>

      <main className="mx-auto max-w-6xl px-4 sm:px-6 py-8 sm:py-10 space-y-12 pb-28">
        {/* ==========================================
            SECTION 1: PIC-2 2×2 BENTO CATEGORY GRID
           ========================================== */}
        <section aria-label={`${store.name} specialty categories`} className="space-y-4">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <div className={`text-[11px] font-bold uppercase tracking-widest ${theme.accentText}`}>
                {isOnlineOnly ? 'Online Page · Local Delivery' : store.address}
              </div>
              <h1 className="font-display mt-1 text-2xl sm:text-3xl font-extrabold tracking-tight text-white">
                {store.name}
              </h1>
              <p className="mt-1 max-w-2xl text-xs sm:text-sm text-[#A6A9BD]">
                {store.description}
              </p>
            </div>
            <span className="text-xs font-semibold uppercase tracking-widest text-[#8E91A8]">
              Categories
            </span>
          </div>

          {bentoTiles.length > 0 && (
            <div className="grid gap-4 sm:grid-cols-2">
              {bentoTiles.map((tile) => (
                <button
                  key={tile.id}
                  type="button"
                  onClick={() => {
                    setSelectedCategory('all');
                    setSelectedSubPart(tile.id);
                    catalogSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                  }}
                  className={`group relative flex min-h-[190px] items-stretch justify-between overflow-hidden rounded-2xl border p-6 text-start transition duration-200 hover:-translate-y-0.5 ${theme.surfaceBg} ${theme.surfaceHover} cursor-pointer`}
                >
                  <div className="relative z-10 flex flex-col justify-between gap-6">
                    <div>
                      <div className="text-[11px] font-medium text-[#9295AB]">
                        {isAr ? 'ابتداءً من' : 'Starting from'}
                      </div>
                      <div className={`font-display mt-0.5 text-lg font-extrabold tabular-nums ${theme.accentText}`}>
                        {formatDzd(tile.minPrice, lang)}
                      </div>
                    </div>

                    <div className="space-y-3">
                      <h2 className="font-display text-2xl sm:text-3xl font-extrabold tracking-tight text-white">
                        {tile.label}
                      </h2>
                      <div className="inline-flex items-center gap-2.5 text-[11px] font-bold uppercase tracking-widest text-[#D5D7E6] group-hover:text-white">
                        <span
                          className={`flex h-6 w-6 items-center justify-center rounded-full border ${theme.accentBorder} transition group-hover:scale-105`}
                        >
                          <ArrowRight className={`h-3 w-3 rtl:rotate-180 ${theme.accentText}`} />
                        </span>
                        <span>{isAr ? `تصفح (${tile.count})` : `Browse (${tile.count})`}</span>
                      </div>
                    </div>
                  </div>

                  {/* Cropped Edge-Anchored Hardware Visual */}
                  <div className="pointer-events-none flex items-center justify-end -me-3 sm:-me-1">
                    <ProductArtwork
                      imageKey={tile.sampleItem.imageKey}
                      imageUrl={tile.sampleItem.imageUrl}
                      categoryId={tile.sampleItem.categoryId}
                      alt={tile.label}
                      className="h-36 w-36 sm:h-44 sm:w-44 transition-transform duration-300 group-hover:scale-105"
                    />
                  </div>
                </button>
              ))}
            </div>
          )}
        </section>

        {/* ==========================================
            SECTION 2: PIC-2 INTERACTIVE FEATURED PRODUCT SLIDER
           ========================================== */}
        {activeSlide && (
          <section aria-label="Featured product showcase" className="space-y-3">
            <div className="flex items-center justify-between text-xs text-[#8E91A8]">
              <span className="uppercase tracking-widest font-semibold">Featured Hardware</span>
              <span className="tabular-nums">
                {inStockCount} of {listings.length} ready in stock
              </span>
            </div>

            <div className={`relative overflow-hidden rounded-3xl border p-6 sm:p-10 ${theme.surfaceBg}`}>
              <div className="grid items-center gap-8 lg:grid-cols-12">
                {/* Left Vertical Social/Direct Rail + Hero Copy */}
                <div className="lg:col-span-7 flex gap-5 sm:gap-7">
                  {/* Minimal Vertical Social & Contact Icons (Pic 2 left rail) */}
                  <div className="hidden sm:flex flex-col items-center justify-center gap-3 border-r border-white/10 pr-5 text-[#9295AB]">
                    <a
                      href={`https://wa.me/${store.whatsapp}`}
                      target="_blank"
                      rel="noreferrer"
                      title="Order on WhatsApp"
                      className="flex h-8 w-8 items-center justify-center rounded-full hover:bg-white/10 hover:text-white transition"
                    >
                      <MessageCircle className="h-4 w-4" />
                    </a>
                    <a
                      href={`tel:${store.phone.replace(/\s+/g, '')}`}
                      title={`Call ${store.phone}`}
                      className="flex h-8 w-8 items-center justify-center rounded-full hover:bg-white/10 hover:text-white transition"
                    >
                      <Phone className="h-4 w-4" />
                    </a>
                    {(!isOnlineOnly || (store.googleMapsUrl && store.googleMapsUrl.startsWith('https://'))) && (
                      <a
                        href={mapsUrl}
                        target="_blank"
                        rel="noreferrer"
                        title="Open Google Maps"
                        className="flex h-8 w-8 items-center justify-center rounded-full hover:bg-white/10 hover:text-white transition"
                      >
                        <Navigation className="h-4 w-4" />
                      </a>
                    )}
                    <button
                      type="button"
                      onClick={handleCopyShareLink}
                      title="Copy direct storefront link"
                      className="flex h-8 w-8 items-center justify-center rounded-full hover:bg-white/10 hover:text-white transition cursor-pointer"
                    >
                      <Share2 className="h-4 w-4" />
                    </button>
                  </div>

                  <div className="min-w-0 space-y-5">
                    <div className={`text-xs font-bold uppercase tracking-widest ${theme.accentText}`}>
                      {activeSlideSubLabel} — {activeSlide.brand}
                    </div>

                    <h2
                      className="font-display font-extrabold tracking-tight text-white text-balance"
                      style={{ fontSize: 'clamp(1.75rem, 3.3vw, 2.85rem)', lineHeight: 1.06 }}
                    >
                      {activeSlideSubLabel} — {activeSlide.productName}
                    </h2>

                    <p className="max-w-lg text-xs sm:text-sm leading-relaxed text-[#A6A9BD] line-clamp-2">
                      {activeSlide.description}
                    </p>

                    <div className="flex flex-wrap items-baseline gap-4">
                      <span className="text-base font-semibold text-[#7A7E96] line-through tabular-nums">
                        {formatDzd(Math.round((activeSlide.price * 1.1) / 100) * 100, lang)}
                      </span>
                      <span className={`font-display text-2xl sm:text-3xl font-extrabold tabular-nums ${theme.accentText}`}>
                        {formatDzd(activeSlide.price, lang)}
                      </span>
                    </div>

                    <div className="flex flex-wrap items-center gap-4 pt-1">
                      <button
                        type="button"
                        disabled={activeSlide.availabilityStatus === 'out_of_stock' || !store.isOpen}
                        onClick={() => onAddToCart(activeSlide)}
                        className="group inline-flex items-center gap-3 text-xs font-extrabold uppercase tracking-widest text-white disabled:opacity-40 cursor-pointer whitespace-nowrap"
                      >
                        <span
                          className={`flex h-9 w-9 items-center justify-center rounded-full ${theme.highlightBtn} transition group-hover:scale-105`}
                        >
                          <Plus className="h-4 w-4" />
                        </span>
                        <span>Add to Cart</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => onCompareProduct(activeSlide.productSlug)}
                        className="inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-white/5 px-4 py-2 text-xs font-semibold text-[#D5D7E6] transition hover:border-white/35 hover:text-white cursor-pointer whitespace-nowrap"
                      >
                        <span>Compare Price</span>
                        <ArrowUpRight className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                </div>

                {/* Right: Large Hardware Display + Slide Controls */}
                <div className="lg:col-span-5 flex flex-col items-center justify-between gap-6">
                  <div className="relative flex w-full items-center justify-center">
                    <button
                      type="button"
                      onClick={() => onCompareProduct(activeSlide.productSlug)}
                      className={`flex h-56 w-56 sm:h-64 sm:w-64 items-center justify-center rounded-3xl ${theme.wellBg} p-6 transition hover:scale-[1.02] cursor-pointer overflow-hidden`}
                    >
                      <ProductArtwork
                        imageKey={activeSlide.imageKey}
                        imageUrl={activeSlide.imageUrl}
                        categoryId={activeSlide.categoryId}
                        alt={activeSlide.productName}
                        className="h-44 w-44 sm:h-52 sm:w-52"
                      />
                    </button>

                    {sliderListings.length > 1 && (
                      <div className="absolute end-0 top-1/2 -translate-y-1/2 flex flex-col gap-2">
                        <button
                          type="button"
                          onClick={() =>
                            setSliderIndex((i) => (i + 1) % sliderListings.length)
                          }
                          aria-label="Next featured product"
                          className="flex h-9 w-9 items-center justify-center rounded-full border border-white/15 bg-black/30 text-white hover:bg-white/15 cursor-pointer"
                        >
                          <ChevronRight className="h-4 w-4 rtl:rotate-180" />
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            setSliderIndex((i) => (i - 1 + sliderListings.length) % sliderListings.length)
                          }
                          aria-label="Previous featured product"
                          className="flex h-9 w-9 items-center justify-center rounded-full border border-white/15 bg-black/30 text-white hover:bg-white/15 cursor-pointer"
                        >
                          <ChevronLeft className="h-4 w-4 rtl:rotate-180" />
                        </button>
                      </div>
                    )}
                  </div>

                  {sliderListings.length > 1 && (
                    <div className="flex w-full max-w-xs items-center gap-3 text-xs font-bold tabular-nums">
                      <span className={theme.accentText}>{sliderIndex + 1}</span>
                      <div className="h-0.5 flex-1 overflow-hidden rounded-full bg-white/12">
                        <div
                          className={`h-full transition-all duration-200 ${theme.sliderProgressBg}`}
                          style={{
                            width: `${((sliderIndex + 1) / sliderListings.length) * 100}%`,
                          }}
                        />
                      </div>
                      <span className="text-[#8E91A8]">{sliderListings.length}</span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </section>
        )}

        {/* ==========================================
            OWNER STOREFRONT STUDIO (Visible only to this shop's owner)
           ========================================== */}
        {isMerchantOwner && (
          <section ref={ownerStudioRef} className="space-y-4">
            <div className={`flex flex-wrap items-center justify-between gap-3 rounded-3xl border p-5 ${theme.surfaceBg}`}>
              <div className="space-y-1">
                <div className={`inline-flex items-center gap-2 text-xs font-bold uppercase tracking-wider ${theme.accentText}`}>
                  <StoreIcon className="h-3.5 w-3.5" />
                  <span>Your Dedicated Seller Studio</span>
                </div>
                <p className="text-xs sm:text-sm text-[#A6A9BD]">
                  {listings.length === 0
                    ? 'Your storefront page is live! Add your logo, social/map links, and your first products right here.'
                    : 'Customize your store profile, add products directly on this page, or view your analytics Dashboard.'}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() =>
                    setOwnerPanel((p) => (p === 'edit_store' ? 'none' : 'edit_store'))
                  }
                  className="inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-white/5 px-4 py-2 text-xs font-bold text-white hover:bg-white/15 cursor-pointer"
                >
                  <Pencil className="h-3.5 w-3.5" />
                  <span>{ownerPanel === 'edit_store' ? 'Close Editor' : 'Edit Logo & Store Info'}</span>
                </button>
                <button
                  type="button"
                  onClick={() =>
                    setOwnerPanel((p) => (p === 'add_product' ? 'none' : 'add_product'))
                  }
                  className={`inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-xs font-extrabold ${theme.highlightBtn} cursor-pointer`}
                >
                  <Plus className="h-3.5 w-3.5" />
                  <span>{ownerPanel === 'add_product' ? 'Close Product Form' : '+ Add Product'}</span>
                </button>
                {onOpenDashboard && (
                  <button
                    type="button"
                    onClick={onOpenDashboard}
                    className={`inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-xs font-bold ${theme.accentBg} cursor-pointer`}
                  >
                    <BarChart3 className="h-3.5 w-3.5" />
                    <span>Open Dashboard</span>
                  </button>
                )}
              </div>
            </div>

            {ownerPanel === 'edit_store' && (
              <form
                onSubmit={handleSaveOwnerProfile}
                className={`rounded-3xl border p-6 space-y-4 ${theme.surfaceBg}`}
              >
                <div className="flex items-center justify-between">
                  <h3 className="font-display text-lg font-bold">
                    Customize Storefront Profile, Logo &amp; Links
                  </h3>
                  <button
                    type="button"
                    onClick={() => setOwnerPanel('none')}
                    className="rounded-full p-1.5 text-[#A6A9BD] hover:bg-white/10 cursor-pointer"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>

                <div className={`flex flex-wrap items-center gap-4 rounded-2xl p-4 ${theme.wellBg}`}>
                  <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-white/15 bg-black/30 text-base font-extrabold">
                    {ownerLogoUrl ? (
                      <img
                        src={ownerLogoUrl}
                        alt="Logo preview"
                        referrerPolicy="no-referrer"
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <span className={theme.accentText}>
                        {(ownerName || store.name).slice(0, 2).toUpperCase()}
                      </span>
                    )}
                  </div>
                  <div className="flex-1 min-w-[200px] space-y-2">
                    <label className={`inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs font-bold ${theme.accentBg} cursor-pointer`}>
                      <ImagePlus className="h-3.5 w-3.5" />
                      <span>{uploadingOwnerLogo ? 'Uploading...' : 'Upload Shop Logo / PFP'}</span>
                      <input
                        type="file"
                        accept="image/png,image/jpeg,image/webp"
                        onChange={handleUploadOwnerLogo}
                        className="hidden"
                      />
                    </label>
                    <input
                      value={ownerLogoUrl}
                      onChange={(e) => setOwnerLogoUrl(e.target.value)}
                      placeholder="Or paste logo image URL (https://...)"
                      className={`w-full rounded-xl border px-3 py-1.5 text-xs focus:outline-none ${theme.inputBg}`}
                    />
                  </div>
                </div>

                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  <div>
                    <label className="text-[11px] font-semibold text-[#A6A9BD]">
                      Store / Page Name *
                    </label>
                    <input
                      required
                      value={ownerName}
                      onChange={(e) => setOwnerName(e.target.value)}
                      className={`mt-1 w-full rounded-xl border px-3 py-2 text-xs font-semibold ${theme.inputBg}`}
                    />
                  </div>
                  <div>
                    <label className="text-[11px] font-semibold text-[#A6A9BD]">
                      Business Channel
                    </label>
                    <select
                      value={ownerType}
                      onChange={(e) => setOwnerType(e.target.value as SellerBusinessType)}
                      className={`mt-1 w-full rounded-xl border px-3 py-2 text-xs font-semibold ${theme.inputBg}`}
                    >
                      <option value="physical_store" className="text-black">Physical Store (Walk-in &amp; Map)</option>
                      <option value="online_page" className="text-black">Online Seller Page (IG / FB / WhatsApp)</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-[11px] font-semibold text-[#A6A9BD]">
                      {isAr ? 'حي الجلفة' : 'Djelfa Area'}
                    </label>
                    <select
                      value={ownerArea}
                      onChange={(e) => setOwnerArea(e.target.value)}
                      className={`mt-1 w-full rounded-xl border px-3 py-2 text-xs font-semibold ${theme.inputBg}`}
                    >
                      {availableAreaNames.map((a) => (
                        <option key={a} value={a} className="text-black">
                          {getAreaDisplayName(a, lang)}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="text-[11px] font-semibold text-[#A6A9BD]">
                      Phone Number
                    </label>
                    <input
                      value={ownerPhone}
                      onChange={(e) => setOwnerPhone(e.target.value)}
                      className={`mt-1 w-full rounded-xl border px-3 py-2 text-xs ${theme.inputBg}`}
                    />
                  </div>
                  <div>
                    <label className="text-[11px] font-semibold text-[#A6A9BD]">
                      WhatsApp Number
                    </label>
                    <input
                      value={ownerWhatsapp}
                      onChange={(e) => setOwnerWhatsapp(e.target.value)}
                      placeholder="213661..."
                      className={`mt-1 w-full rounded-xl border px-3 py-2 text-xs ${theme.inputBg}`}
                    />
                  </div>
                  <div>
                    <label className="text-[11px] font-semibold text-[#A6A9BD]">
                      Working Hours
                    </label>
                    <input
                      value={ownerHours}
                      onChange={(e) => setOwnerHours(e.target.value)}
                      className={`mt-1 w-full rounded-xl border px-3 py-2 text-xs ${theme.inputBg}`}
                    />
                  </div>
                  {ownerType === 'physical_store' && (
                    <div className="sm:col-span-2">
                      <label className="text-[11px] font-semibold text-[#A6A9BD]">
                        Street Address
                      </label>
                      <input
                        value={ownerAddress}
                        onChange={(e) => setOwnerAddress(e.target.value)}
                        className={`mt-1 w-full rounded-xl border px-3 py-2 text-xs ${theme.inputBg}`}
                      />
                    </div>
                  )}
                  <div>
                    <label className="text-[11px] font-semibold text-[#A6A9BD]">
                      Google Maps Link
                    </label>
                    <input
                      value={ownerMapsUrl}
                      onChange={(e) => setOwnerMapsUrl(e.target.value)}
                      placeholder="https://maps.google.com/?q=..."
                      className={`mt-1 w-full rounded-xl border px-3 py-2 text-xs ${theme.inputBg}`}
                    />
                  </div>
                  <div>
                    <label className="text-[11px] font-semibold text-[#A6A9BD]">
                      Instagram Page
                    </label>
                    <input
                      value={ownerInstagram}
                      onChange={(e) => setOwnerInstagram(e.target.value)}
                      placeholder="https://instagram.com/..."
                      className={`mt-1 w-full rounded-xl border px-3 py-2 text-xs ${theme.inputBg}`}
                    />
                  </div>
                  <div>
                    <label className="text-[11px] font-semibold text-[#A6A9BD]">
                      Facebook Page
                    </label>
                    <input
                      value={ownerFacebook}
                      onChange={(e) => setOwnerFacebook(e.target.value)}
                      placeholder="https://facebook.com/..."
                      className={`mt-1 w-full rounded-xl border px-3 py-2 text-xs ${theme.inputBg}`}
                    />
                  </div>
                </div>

                <div>
                  <label className="text-[11px] font-semibold text-[#A6A9BD]">
                    Storefront Description
                  </label>
                  <textarea
                    rows={2}
                    value={ownerDesc}
                    onChange={(e) => setOwnerDesc(e.target.value)}
                    className={`mt-1 w-full rounded-xl border px-3 py-2 text-xs ${theme.inputBg}`}
                  />
                </div>

                <div className="flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setOwnerPanel('none')}
                    className="rounded-full border border-white/15 px-4 py-2 text-xs font-semibold text-white cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={savingOwnerStore}
                    className={`inline-flex items-center gap-1.5 rounded-full px-5 py-2 text-xs font-extrabold ${theme.highlightBtn} disabled:opacity-50 cursor-pointer`}
                  >
                    <Save className="h-3.5 w-3.5" />
                    <span>{savingOwnerStore ? 'Saving...' : 'Save Storefront Changes'}</span>
                  </button>
                </div>
              </form>
            )}

            {ownerPanel === 'add_product' && (
              <form
                onSubmit={handleAddOwnerProduct}
                className={`rounded-3xl border p-6 space-y-4 ${theme.surfaceBg}`}
              >
                <div className="flex items-center justify-between">
                  <h3 className="font-display text-lg font-bold">
                    Add Product to {store.name}
                  </h3>
                  <button
                    type="button"
                    onClick={() => setOwnerPanel('none')}
                    className="rounded-full p-1.5 text-[#A6A9BD] hover:bg-white/10 cursor-pointer"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>

                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  <div>
                    <label className="text-[11px] font-semibold text-[#A6A9BD]">
                      Product Name *
                    </label>
                    <input
                      required
                      value={newProdName}
                      onChange={(e) => setNewProdName(e.target.value)}
                      placeholder="eg. RTX 4060 Gaming OC 8GB"
                      className={`mt-1 w-full rounded-xl border px-3 py-2 text-xs ${theme.inputBg}`}
                    />
                  </div>
                  <div>
                    <label className="text-[11px] font-semibold text-[#A6A9BD]">
                      Brand *
                    </label>
                    <input
                      required
                      value={newProdBrand}
                      onChange={(e) => setNewProdBrand(e.target.value)}
                      placeholder="eg. Gigabyte / Apple / Sony"
                      className={`mt-1 w-full rounded-xl border px-3 py-2 text-xs ${theme.inputBg}`}
                    />
                  </div>
                  <div>
                    <label className="text-[11px] font-semibold text-[#A6A9BD]">
                      Category
                    </label>
                    <select
                      value={newProdCatId}
                      onChange={(e) => setNewProdCatId(e.target.value)}
                      className={`mt-1 w-full rounded-xl border px-3 py-2 text-xs ${theme.inputBg}`}
                    >
                      {availableCategories.map((c) => (
                        <option key={c.id} value={c.id} className="text-black">
                          {c.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="text-[11px] font-semibold text-[#A6A9BD]">
                      Price (DZD) *
                    </label>
                    <input
                      required
                      type="number"
                      min={1}
                      value={newProdPrice}
                      onChange={(e) => setNewProdPrice(e.target.value)}
                      placeholder="eg. 64500"
                      className={`mt-1 w-full rounded-xl border px-3 py-2 text-xs tabular-nums ${theme.inputBg}`}
                    />
                  </div>
                  <div>
                    <label className="text-[11px] font-semibold text-[#A6A9BD]">
                      Stock Quantity
                    </label>
                    <input
                      type="number"
                      min={0}
                      value={newProdStock}
                      onChange={(e) => setNewProdStock(e.target.value)}
                      className={`mt-1 w-full rounded-xl border px-3 py-2 text-xs tabular-nums ${theme.inputBg}`}
                    />
                  </div>
                  <div>
                    <label className="text-[11px] font-semibold text-[#A6A9BD]">
                      Availability
                    </label>
                    <select
                      value={newProdStatus}
                      onChange={(e) => setNewProdStatus(e.target.value as AvailabilityStatus)}
                      className={`mt-1 w-full rounded-xl border px-3 py-2 text-xs ${theme.inputBg}`}
                    >
                      <option value="in_stock" className="text-black">In Stock</option>
                      <option value="unconfirmed" className="text-black">Call to Confirm</option>
                      <option value="out_of_stock" className="text-black">Out of Stock</option>
                    </select>
                  </div>
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <label className="text-[11px] font-semibold text-[#A6A9BD]">
                      Artwork Icon Preset
                    </label>
                    <select
                      value={newProdImageKey}
                      onChange={(e) => setNewProdImageKey(e.target.value)}
                      className={`mt-1 w-full rounded-xl border px-3 py-2 text-xs ${theme.inputBg}`}
                    >
                      {OWNER_IMAGE_KEYS.map((ik) => (
                        <option key={ik.id} value={ik.id} className="text-black">
                          {ik.label}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="text-[11px] font-semibold text-[#A6A9BD]">
                      Product Photo (upload or URL)
                    </label>
                    <div className="mt-1 flex items-center gap-2">
                      <label className={`inline-flex shrink-0 items-center gap-1 rounded-xl px-3 py-2 text-xs font-bold ${theme.accentBg} cursor-pointer`}>
                        <ImagePlus className="h-3.5 w-3.5" />
                        <span>{uploadingProdImg ? '...' : 'Upload'}</span>
                        <input
                          type="file"
                          accept="image/png,image/jpeg,image/webp"
                          onChange={handleUploadOwnerProdPhoto}
                          className="hidden"
                        />
                      </label>
                      <input
                        value={newProdImageUrl}
                        onChange={(e) => setNewProdImageUrl(e.target.value)}
                        placeholder="https://... (optional)"
                        className={`w-full rounded-xl border px-3 py-2 text-xs ${theme.inputBg}`}
                      />
                    </div>
                  </div>
                </div>

                <div>
                  <label className="text-[11px] font-semibold text-[#A6A9BD]">
                    Product Description
                  </label>
                  <textarea
                    rows={2}
                    value={newProdDesc}
                    onChange={(e) => setNewProdDesc(e.target.value)}
                    placeholder="Specs, warranty, box contents..."
                    className={`mt-1 w-full rounded-xl border px-3 py-2 text-xs ${theme.inputBg}`}
                  />
                </div>

                <div className="flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setOwnerPanel('none')}
                    className="rounded-full border border-white/15 px-4 py-2 text-xs font-semibold text-white cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={savingNewProd}
                    className={`inline-flex items-center gap-1.5 rounded-full px-5 py-2 text-xs font-extrabold ${theme.highlightBtn} disabled:opacity-50 cursor-pointer`}
                  >
                    <Plus className="h-3.5 w-3.5" />
                    <span>{savingNewProd ? 'Adding...' : 'Publish Product to Storefront'}</span>
                  </button>
                </div>
              </form>
            )}
          </section>
        )}

        {/* ==========================================
            SECTION 3: SELLER FULL PRODUCT CATALOG
           ========================================== */}
        <section ref={catalogSectionRef} className="space-y-6 scroll-mt-24">
          <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
            <div>
              <h2 className="font-display text-2xl sm:text-3xl font-extrabold tracking-tight text-white">
                {store.name} Catalog
              </h2>
              <p className="mt-1 text-xs sm:text-sm text-[#A6A9BD]">
                All {listings.length} verified item{listings.length === 1 ? '' : 's'} with live DZD prices and real-time stock.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2.5">
              <div className="relative flex-1 sm:flex-initial sm:w-64">
                <Search className="pointer-events-none absolute start-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[#8E91A8]" />
                <input
                  type="search"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder={isAr ? `ابحث في ${store.name}...` : `Search in ${store.name}...`}
                  className={`w-full rounded-full border py-2 ps-10 pe-4 text-xs focus:outline-none ${theme.inputBg}`}
                />
              </div>

              <select
                aria-label="Sort products"
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as typeof sortBy)}
                className={`rounded-full border px-3.5 py-2 text-xs font-semibold ${theme.inputBg}`}
              >
                <option value="featured" className="text-black">Featured First</option>
                <option value="popular" className="text-black">Best Selling</option>
                <option value="lowest_price" className="text-black">Lowest Price</option>
                <option value="highest_price" className="text-black">Highest Price</option>
              </select>
            </div>
          </div>

          {/* Sub-Part & In-Stock Filters */}
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 pb-4">
            <div className="flex flex-wrap items-center gap-1.5">
              <button
                type="button"
                onClick={() => {
                  setSelectedCategory('all');
                  setSelectedSubPart('all');
                }}
                className={`rounded-full px-3.5 py-1.5 text-xs font-semibold transition cursor-pointer whitespace-nowrap ${
                  selectedSubPart === 'all' && selectedCategory === 'all'
                    ? theme.accentBg
                    : 'border border-white/12 bg-white/5 text-[#B4B7CB] hover:text-white'
                }`}
              >
                All ({listings.length})
              </button>
              {storeSubParts.map((sp) => (
                <button
                  key={sp.id}
                  type="button"
                  onClick={() => {
                    setSelectedCategory('all');
                    setSelectedSubPart(sp.id);
                  }}
                  className={`rounded-full px-3.5 py-1.5 text-xs font-semibold transition cursor-pointer whitespace-nowrap ${
                    selectedSubPart === sp.id
                      ? theme.accentBg
                      : 'border border-white/12 bg-white/5 text-[#B4B7CB] hover:text-white'
                  }`}
                >
                  {sp.label} ({sp.count})
                </button>
              ))}
            </div>

            <button
              type="button"
              onClick={() => setInStockOnly((v) => !v)}
              className={`rounded-full px-3.5 py-1.5 text-xs font-bold transition cursor-pointer whitespace-nowrap ${
                inStockOnly
                  ? theme.highlightBtn
                  : 'border border-white/12 bg-white/5 text-[#B4B7CB] hover:text-white'
              }`}
            >
              In Stock Only
            </button>
          </div>

          {/* 3-Column Product Grid */}
          {filteredListings.length === 0 ? (
            <div className={`rounded-3xl border p-12 text-center space-y-3 ${theme.surfaceBg}`}>
              <p className="font-display text-lg font-bold text-white">No products match your filter</p>
              <p className="text-xs text-[#A6A9BD]">
                Try clearing your search or switching back to all parts in {store.name}.
              </p>
              <button
                type="button"
                onClick={() => {
                  setQuery('');
                  setSelectedCategory('all');
                  setSelectedSubPart('all');
                  setInStockOnly(false);
                }}
                className={`inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-xs font-extrabold ${theme.highlightBtn} cursor-pointer`}
              >
                <X className="h-3.5 w-3.5" />
                <span>Show All Products</span>
              </button>
            </div>
          ) : (
            <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {filteredListings.map((item) => {
                const disabled = item.availabilityStatus === 'out_of_stock' || !store.isOpen;
                const qtyInCart = cartQtyMap.get(item.listingId) || 0;
                const statusLabel =
                  item.availabilityStatus === 'in_stock'
                    ? dict.inStock
                    : item.availabilityStatus === 'unconfirmed'
                      ? dict.unconfirmed
                      : dict.outOfStock;

                return (
                  <article
                    key={item.listingId}
                    className={`group flex flex-col justify-between rounded-2xl border p-4 transition duration-200 hover:-translate-y-0.5 ${theme.surfaceBg} ${theme.surfaceHover}`}
                  >
                    <div>
                      <button
                        type="button"
                        onClick={() => onCompareProduct(item.productSlug)}
                        className={`flex aspect-[4/3] w-full items-center justify-center overflow-hidden rounded-xl ${theme.wellBg} p-4 cursor-pointer`}
                      >
                        <ProductArtwork
                          imageKey={item.imageKey}
                          imageUrl={item.imageUrl}
                          categoryId={item.categoryId}
                          alt={item.productName}
                          className="h-36 w-36 transition-transform duration-200 group-hover:scale-105"
                        />
                      </button>

                      {/* Clean Unboxed Metadata */}
                      <div className="mt-3.5 flex flex-wrap items-center gap-1.5 text-xs text-[#A6A9BD]">
                        <span className="font-semibold text-white">{item.brand}</span>
                        <span aria-hidden="true">·</span>
                        <span>{getSubPartLabel(getSubPartId(item), lang)}</span>
                        <span aria-hidden="true">·</span>
                        <span
                          className={
                            item.availabilityStatus === 'in_stock'
                              ? 'text-emerald-400 font-semibold'
                              : item.availabilityStatus === 'out_of_stock'
                                ? 'text-rose-400 font-semibold'
                                : 'text-amber-400 font-semibold'
                          }
                        >
                          {statusLabel}
                        </span>
                      </div>

                      <button
                        type="button"
                        onClick={() => onCompareProduct(item.productSlug)}
                        className="mt-1.5 block text-start font-display text-base font-bold leading-snug text-white hover:underline cursor-pointer"
                      >
                        {item.productName}
                      </button>

                      {item.description && (
                        <p className="mt-1.5 line-clamp-2 text-xs leading-relaxed text-[#9DA1B8]">
                          {item.description}
                        </p>
                      )}
                    </div>

                    {/* Baseline-aligned Price & Cart Action Row */}
                    <div className="mt-4 flex items-center justify-between gap-3 border-t border-white/10 pt-3.5">
                      <div>
                        <div className={`font-display text-lg font-extrabold tabular-nums ${theme.accentText}`}>
                          {formatDzd(item.price, lang)}
                        </div>
                        <div className="text-[11px] text-[#9295AB] tabular-nums">
                          {item.stockQuantity !== null && item.stockQuantity !== undefined
                            ? `${item.stockQuantity} available`
                            : formatRelativeTime(item.availabilityUpdatedAt, lang)}
                          {item.soldCount > 0 ? ` · ${item.soldCount} sold` : ''}
                        </div>
                      </div>

                      {qtyInCart > 0 ? (
                        <div className={`inline-flex items-center gap-1 rounded-full p-1 ${theme.accentBg}`}>
                          <button
                            type="button"
                            onClick={() => onUpdateCartQty(item.listingId, -1)}
                            aria-label={`Decrease ${item.productName} quantity`}
                            className="flex h-7 w-7 items-center justify-center rounded-full hover:bg-black/20 cursor-pointer"
                          >
                            <Minus className="h-3.5 w-3.5" />
                          </button>
                          <span className="min-w-5 text-center text-xs font-bold tabular-nums">
                            {qtyInCart}
                          </span>
                          <button
                            type="button"
                            disabled={disabled}
                            onClick={() => onUpdateCartQty(item.listingId, 1)}
                            aria-label={`Increase ${item.productName} quantity`}
                            className="flex h-7 w-7 items-center justify-center rounded-full hover:bg-black/20 disabled:opacity-40 cursor-pointer"
                          >
                            <Plus className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          disabled={disabled}
                          onClick={() => onAddToCart(item)}
                          className={`inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-xs font-extrabold transition disabled:opacity-40 cursor-pointer whitespace-nowrap shrink-0 ${theme.highlightBtn}`}
                        >
                          <Plus className="h-3.5 w-3.5" />
                          <span>Add</span>
                        </button>
                      )}
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </section>

        {/* ==========================================
            SECTION 4: SHOP LOCATION / ONLINE CHANNELS, DELIVERY ZONES & SOCIALS
           ========================================== */}
        <section
          ref={locationSectionRef}
          className="grid gap-8 border-t border-white/10 pt-10 lg:grid-cols-12 items-stretch scroll-mt-24"
        >
          {isOnlineOnly ? (
            <div className={`lg:col-span-7 flex flex-col justify-between rounded-3xl border p-6 space-y-5 ${theme.surfaceBg}`}>
              <div>
                <div className={`text-xs font-bold uppercase tracking-wider ${theme.accentText}`}>
                  Online Seller Channels
                </div>
                <h2 className="mt-1 font-display text-2xl font-bold text-white">
                  Order Directly or Follow {store.name}
                </h2>
                <p className="mt-1 text-sm text-[#A6A9BD]">
                  {store.name} operates online via Instagram, Facebook &amp; WhatsApp with local Cash-on-Delivery across {zones.join(', ')}.
                </p>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                {store.instagramUrl && store.instagramUrl.startsWith('https://') && (
                  <a
                    href={store.instagramUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center justify-between gap-3 rounded-2xl border border-pink-500/30 bg-pink-500/10 p-4 transition hover:bg-pink-500/20"
                  >
                    <div>
                      <div className="text-xs font-bold text-pink-300">Instagram Page</div>
                      <div className="mt-0.5 text-sm font-extrabold text-white">Open Instagram</div>
                    </div>
                    <ExternalLink className="h-4 w-4 text-pink-400" />
                  </a>
                )}

                {store.facebookUrl && store.facebookUrl.startsWith('https://') && (
                  <a
                    href={store.facebookUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center justify-between gap-3 rounded-2xl border border-blue-500/30 bg-blue-500/10 p-4 transition hover:bg-blue-500/20"
                  >
                    <div>
                      <div className="text-xs font-bold text-blue-300">Facebook Page</div>
                      <div className="mt-0.5 text-sm font-extrabold text-white">Open Facebook</div>
                    </div>
                    <ExternalLink className="h-4 w-4 text-blue-400" />
                  </a>
                )}

                <a
                  href={`https://wa.me/${store.whatsapp}`}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center justify-between gap-3 rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-4 transition hover:bg-emerald-500/20 sm:col-span-2"
                >
                  <div>
                    <div className="text-xs font-bold text-emerald-300">WhatsApp Direct Order</div>
                    <div className="mt-0.5 text-sm font-extrabold text-white">
                      Chat on WhatsApp ({store.phone})
                    </div>
                  </div>
                  <MessageCircle className="h-5 w-5 text-emerald-400" />
                </a>
              </div>

              <div className={`rounded-2xl p-4 ${theme.wellBg}`}>
                <div className="text-xs font-bold text-white">
                  Delivery Coverage Across {store.city} ({store.deliveryRadiusKm ?? 15} km)
                </div>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {zones.map((z) => (
                    <span
                      key={z}
                      className="rounded-full border border-white/12 bg-white/5 px-3 py-1 text-[11px] font-semibold text-white"
                    >
                      {z}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          ) : (
            <div className="lg:col-span-7 space-y-4">
              <div>
                <h2 className="font-display text-2xl font-bold text-white">Find {store.name}</h2>
                <p className="mt-1 text-sm text-[#A6A9BD]">
                  Visit in person for pickup or order delivery across {store.deliveryRadiusKm ?? 10} km in {store.city}.
                </p>
              </div>
              <ElOuedMap
                stores={[store]}
                areas={areas}
                selectedLocation={coords ? { lat: coords.lat, lng: coords.lng, label: isAr ? 'موقعك' : 'Your location' } : null}
                onSelectStore={() => {}}
                lang={lang}
              />
            </div>
          )}

          <div className={`lg:col-span-5 flex flex-col justify-between rounded-3xl border p-6 space-y-5 ${theme.surfaceBg}`}>
            <div className="space-y-4">
              <h3 className="font-display text-lg font-bold text-white">
                {isOnlineOnly ? 'Online Seller Summary' : 'Store Details & Direct Links'}
              </h3>

              <div className="space-y-3 text-sm text-[#D5D7E6]">
                <div className="flex items-start gap-3">
                  {isOnlineOnly ? (
                    <Globe className={`mt-0.5 h-4 w-4 shrink-0 ${theme.accentText}`} />
                  ) : (
                    <MapPin className={`mt-0.5 h-4 w-4 shrink-0 ${theme.accentText}`} />
                  )}
                  <div>
                    <div className="font-semibold text-white">
                      {isOnlineOnly ? 'Online Seller (Delivery Only)' : store.address}
                    </div>
                    <div className="text-xs text-[#9295AB]">
                      {store.area}, {store.city}
                    </div>
                  </div>
                </div>

                <div className="flex items-start gap-3">
                  <Clock className={`mt-0.5 h-4 w-4 shrink-0 ${theme.accentText}`} />
                  <div>
                    <div className="font-semibold text-white">{store.openingHours}</div>
                    <div className="text-xs text-[#9295AB]">
                      Currently{' '}
                      {store.isOpen
                        ? isOnlineOnly
                          ? 'Taking online orders'
                          : 'Open for pickup & delivery'
                        : 'Closed'}
                    </div>
                  </div>
                </div>

                <div className="flex items-start gap-3">
                  <Truck className={`mt-0.5 h-4 w-4 shrink-0 ${theme.accentText}`} />
                  <div>
                    <div className="font-semibold text-white">
                      Delivery {formatDzd(store.deliveryFee ?? 200, lang)} · {store.deliveryRadiusKm ?? 10} km
                    </div>
                    <div className="text-xs text-[#9295AB]">
                      Covers: {zones.join(' · ')}
                    </div>
                  </div>
                </div>
              </div>

              <div className="flex flex-wrap gap-2 pt-2 border-t border-white/10">
                <a
                  href={`https://wa.me/${store.whatsapp}`}
                  target="_blank"
                  rel="noreferrer"
                  className={`inline-flex items-center gap-1.5 rounded-full px-3.5 py-2 text-xs font-extrabold ${theme.highlightBtn}`}
                >
                  <MessageCircle className="h-3.5 w-3.5" />
                  <span>WhatsApp</span>
                </a>
                {(!isOnlineOnly || (store.googleMapsUrl && store.googleMapsUrl.startsWith('https://'))) && (
                  <a
                    href={mapsUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-white/5 px-3.5 py-2 text-xs font-semibold text-white hover:bg-white/15"
                  >
                    <Navigation className={`h-3.5 w-3.5 ${theme.accentText}`} />
                    <span>Google Maps</span>
                  </a>
                )}
                {store.facebookUrl && store.facebookUrl.startsWith('https://') && (
                  <a
                    href={store.facebookUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-white/5 px-3.5 py-2 text-xs font-semibold text-white hover:bg-white/15"
                  >
                    <Globe className="h-3.5 w-3.5 text-blue-400" />
                    <span>Facebook</span>
                  </a>
                )}
                {store.instagramUrl && store.instagramUrl.startsWith('https://') && (
                  <a
                    href={store.instagramUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-white/5 px-3.5 py-2 text-xs font-semibold text-white hover:bg-white/15"
                  >
                    <Globe className="h-3.5 w-3.5 text-pink-400" />
                    <span>Instagram</span>
                  </a>
                )}
              </div>
            </div>

            <div className={`rounded-2xl p-3.5 text-xs space-y-1.5 ${theme.wellBg}`}>
              <div className="font-semibold text-white">Direct Storefront &amp; QR Link</div>
              <div className="flex items-center justify-between gap-2">
                <code className="truncate font-mono text-[11px] text-[#9295AB]">
                  {directStoreUrl}
                </code>
                <button
                  type="button"
                  onClick={handleCopyShareLink}
                  className={`shrink-0 font-bold hover:underline cursor-pointer ${theme.accentText}`}
                >
                  Copy
                </button>
              </div>
            </div>
          </div>
        </section>

        {/* ==========================================
            SECTION 5: CUSTOMER REVIEWS
           ========================================== */}
        <section
          ref={reviewsSectionRef}
          className="space-y-6 border-t border-white/10 pt-10 scroll-mt-24"
        >
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="font-display text-2xl font-bold text-white">
                Customer Reviews ({reviews.length})
              </h2>
              <p className="text-sm text-[#A6A9BD]">
                Feedback from local shoppers at {store.name}.
              </p>
            </div>
            <div className="flex items-center gap-1.5 text-sm font-bold text-white">
              <Star className="h-4 w-4 fill-amber-400 text-amber-400" />
              <span className="tabular-nums">{store.rating}</span>
              <span className="font-medium text-[#9295AB]">/ 5.0</span>
            </div>
          </div>

          <div className="grid gap-6 lg:grid-cols-12">
            <form
              onSubmit={handleSubmitReview}
              className={`lg:col-span-5 rounded-3xl border p-5 space-y-4 h-fit ${theme.surfaceBg}`}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="font-display text-base font-bold text-white">Leave a review</span>
                <div className="flex items-center gap-1" role="radiogroup" aria-label="Store rating">
                  {[1, 2, 3, 4, 5].map((star) => (
                    <button
                      key={star}
                      type="button"
                      onClick={() => setReviewRating(star)}
                      aria-label={`Rate ${star} out of 5 stars`}
                      className="p-0.5 transition hover:scale-110 cursor-pointer"
                    >
                      <Star
                        className={`h-5 w-5 ${
                          star <= reviewRating
                            ? 'fill-amber-400 text-amber-400'
                            : 'text-[#555972]'
                        }`}
                      />
                    </button>
                  ))}
                  <span className={`ml-1.5 text-xs font-bold tabular-nums ${theme.accentText}`}>
                    {reviewRating}.0
                  </span>
                </div>
              </div>

              {!user && (
                <input
                  type="text"
                  value={reviewAuthor}
                  onChange={(e) => setReviewAuthor(e.target.value)}
                  placeholder="Your name (optional)"
                  maxLength={60}
                  className={`w-full rounded-xl border px-3.5 py-2.5 text-xs focus:outline-none ${theme.inputBg}`}
                />
              )}

              <textarea
                rows={3}
                value={reviewComment}
                onChange={(e) => setReviewComment(e.target.value)}
                placeholder={`Share your experience with ${store.name}...`}
                maxLength={400}
                className={`w-full rounded-xl border px-3.5 py-2.5 text-xs focus:outline-none ${theme.inputBg}`}
              />

              <button
                type="submit"
                disabled={submittingReview}
                className={`inline-flex w-full items-center justify-center gap-2 rounded-full px-4 py-2.5 text-xs font-extrabold transition disabled:opacity-50 ${theme.highlightBtn} cursor-pointer`}
              >
                <MessageSquarePlus className="h-3.5 w-3.5" />
                <span>{submittingReview ? 'Posting...' : 'Post Review'}</span>
              </button>
            </form>

            <div className="lg:col-span-7 space-y-3">
              {reviews.length === 0 ? (
                <div className={`rounded-3xl border p-8 text-center text-sm text-[#A6A9BD] ${theme.surfaceBg}`}>
                  No reviews yet for {store.name}. Be the first shopper to leave feedback!
                </div>
              ) : (
                reviews.map((rev) => (
                  <div
                    key={rev.id}
                    className={`rounded-2xl border p-4 ${theme.surfaceBg}`}
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <span className="font-display text-sm font-bold text-white">
                          {rev.authorName}
                        </span>
                        <span className="inline-flex items-center gap-0.5 text-amber-400 text-xs font-bold tabular-nums">
                          <Star className="h-3.5 w-3.5 fill-amber-400 text-amber-400" />
                          {rev.rating}.0
                        </span>
                      </div>
                      <span className="text-xs text-[#9295AB]">
                        {formatRelativeTime(rev.createdAt, lang)}
                      </span>
                    </div>
                    <p className="mt-2 text-sm leading-relaxed text-[#C2C4D6]">
                      {rev.comment}
                    </p>
                  </div>
                ))
              )}
            </div>
          </div>
        </section>

        {/* Quiet Footer */}
        <footer className="flex flex-wrap items-center justify-between gap-4 border-t border-white/10 pt-6 text-xs text-[#9295AB]">
          <div>
            <strong className="text-white">{store.name}</strong> · {store.area}, {store.city}
          </div>
          <div className="flex items-center gap-4">
            <button
              type="button"
              onClick={handleReportStore}
              className="inline-flex items-center gap-1 hover:text-white cursor-pointer"
            >
              <Flag className="h-3 w-3" />
              <span>Report storefront</span>
            </button>
            <button
              type="button"
              onClick={onBackToMarketplace}
              className={`inline-flex items-center gap-1 font-semibold hover:underline cursor-pointer ${theme.accentText}`}
            >
              <span>{isAr ? 'تصفح جميع متاجر الجلفة' : 'Browse all Djelfa shops'}</span>
              <ArrowUpRight className="h-3.5 w-3.5" />
            </button>
          </div>
        </footer>
      </main>

      {/* Compact Sticky Cart Bar when items are in bag */}
      {cartCount > 0 && (
        <div className="fixed bottom-4 left-0 right-0 z-40 mx-auto max-w-md px-4">
          <button
            type="button"
            onClick={onOpenCart}
            className={`flex w-full items-center justify-between gap-3 rounded-full px-5 py-3 shadow-2xl transition ${theme.highlightBtn} cursor-pointer`}
          >
            <span className="inline-flex items-center gap-2 text-xs font-extrabold">
              <ShoppingBag className="h-4 w-4" />
              <span className="tabular-nums">
                {cartCount} item{cartCount === 1 ? '' : 's'} in bag
              </span>
            </span>
            <span className="inline-flex items-center gap-1.5 font-display text-sm font-extrabold tabular-nums">
              <span>{formatDzd(cartSubtotal, lang)}</span>
              <ArrowUpRight className="h-4 w-4" />
            </span>
          </button>
        </div>
      )}
    </div>
  );
};
