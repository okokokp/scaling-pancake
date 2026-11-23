import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, LayoutGroup, MotionConfig, motion } from 'motion/react';
import {
  AlertTriangle,
  ArrowRight,
  ArrowUpRight,
  BarChart3,
  Bike,
  Briefcase,
  ChevronLeft,
  ChevronRight,
  Compass,
  Cpu,
  ExternalLink,
  Gamepad2,
  Globe,
  HardDrive,
  Heart,
  LayoutGrid,
  List,
  LogOut,
  MapPin,
  Menu,
  MessageCircle,
  MessageSquarePlus,
  Monitor,
  Moon,
  Navigation,
  Package,
  Search,
  Settings,
  Shield,
  ShoppingBag,
  Smartphone,
  Sparkles,
  Star,
  Store as StoreIcon,
  Sun,
  Truck,
  User as UserIcon,
  X,
  Zap,
} from 'lucide-react';
import type {
  Category,
  ElOuedArea,
  EnrichedListing,
  Favorite,
  LanguageCode,
  Order,
  PublicUser,
  SellerBusinessType,
  Store,
  StoreReview,
  UserRole,
} from '../shared/types.ts';
import { DJELFA_AREAS, getAreaDisplayName } from '../shared/locationConfig.ts';
import {
  CANONICAL_CATEGORIES,
  CATEGORY_SUBPARTS,
  getSubPartLabel,
  matchesSubPart,
  normalizeCategoryId,
} from '../shared/taxonomy.ts';
import { AdminDashboard } from './components/AdminDashboard.tsx';
import { AuthModal } from './components/AuthModal.tsx';
import { CartCheckoutDrawer, type CartItem } from './components/CartCheckoutDrawer.tsx';
import { DriverDashboard } from './components/DriverDashboard.tsx';
import { ElOuedMap } from './components/ElOuedMap.tsx';
import { MarketplaceFooter } from './components/MarketplaceFooter.tsx';
import { MerchantDashboard } from './components/MerchantDashboard.tsx';
import { OrdersFavoritesView } from './components/OrdersFavoritesView.tsx';
import { PhoneMarketplaceView, type PublicBestSellerItem } from './components/PhoneMarketplaceView.tsx';
import { ProductArtwork } from './components/ProductArtwork.tsx';
import { ProductCompareModal } from './components/ProductCompareModal.tsx';
import { OfflineIndicator, PWAInstallButton } from './components/PWAInstallButton.tsx';
import { SellerAnalyticsDashboard } from './components/SellerAnalyticsDashboard.tsx';
import { SellerQRPrintModal } from './components/SellerQRPrintModal.tsx';
import { SellerSignUpPage } from './components/SellerSignUpPage.tsx';
import { SellerStorePage } from './components/SellerStorePage.tsx';
import { CatalogGridSkeleton } from './components/Skeletons.tsx';
import { SupportHelpCenter } from './components/SupportHelpCenter.tsx';
import { apiFetch, getAuthToken, setAuthToken } from './lib/api.ts';
import {
  buildEnrichedListingsFromFirestore,
  fetchFirestoreCatalogSnapshot,
  mergeAndFilterListings,
  subscribePublicBestSellers,
  subscribePublicProducts,
  subscribePublicStores,
  type FirestoreBestSellingProduct,
  type FirestoreSellerProduct,
  type FirestoreStore,
} from './lib/firestoreProducts.ts';
import { formatDzd, formatRelativeTime } from './lib/format.ts';
import { t } from './lib/i18n.ts';
import { MARKETLY_MEDIA } from './lib/productMedia.ts';

type WorkspaceView =
  | 'marketplace'
  | 'catalog'
  | 'physical_stores'
  | 'online_sellers'
  | 'seller_signup'
  | 'orders'
  | 'merchant'
  | 'dashboard'
  | 'driver'
  | 'moderator'
  | 'admin'
  | 'store';

function readStoreSlugFromUrl(): string | null {
  if (typeof window === 'undefined') return null;
  const searchParams = new URLSearchParams(window.location.search);
  const qStore = searchParams.get('store');
  if (qStore) return qStore;
  const h = window.location.hash;
  if (h.startsWith('#store/')) return decodeURIComponent(h.slice(7));
  const pathMatch = /^\/store\/([^/]+)/.exec(window.location.pathname);
  if (pathMatch?.[1]) return decodeURIComponent(pathMatch[1]);
  return null;
}

export default function App() {
  const [lang, setLang] = useState<LanguageCode>(() => {
    try {
      const saved = localStorage.getItem('mk_lang') || localStorage.getItem('sf_lang');
      return saved === 'ar' ? 'ar' : 'en';
    } catch {
      return 'en';
    }
  });
  const [darkMode, setDarkMode] = useState<boolean>(() => {
    try {
      const saved = localStorage.getItem('mk_theme') || localStorage.getItem('sf_theme');
      return saved === 'dark';
    } catch {
      return false;
    }
  });
  const [previewMode, setPreviewMode] = useState<'desktop' | 'phone'>(() => {
    try {
      const saved =
        localStorage.getItem('mk_preview_mode') || localStorage.getItem('sf_preview_mode');
      if (saved === 'phone' || saved === 'desktop') return saved;
    } catch {
      // ignore
    }
    return typeof window !== 'undefined' && window.innerWidth < 768 ? 'phone' : 'desktop';
  });
  const [isMobileViewport, setIsMobileViewport] = useState(() =>
    typeof window !== 'undefined' ? window.innerWidth < 768 : false
  );
  const [phoneMenuOpen, setPhoneMenuOpen] = useState(false);

  const [activeStoreSlug, setActiveStoreSlug] = useState<string | null>(() => readStoreSlugFromUrl());
  const [activeView, setActiveView] = useState<WorkspaceView>(() =>
    readStoreSlugFromUrl() ? 'store' : 'marketplace'
  );
  const [user, setUser] = useState<PublicUser | null>(null);
  const [authOpen, setAuthOpen] = useState(false);
  const [authConfig, setAuthConfig] = useState<{
    mode: 'login' | 'register';
    role: 'customer' | 'merchant' | 'driver';
    sellerType: SellerBusinessType;
  }>({ mode: 'login', role: 'customer', sellerType: 'physical_store' });
  const [sellerSignupDefaultType, setSellerSignupDefaultType] =
    useState<SellerBusinessType>('online_page');

  // Header popovers, dynamic sticky scroll visibility & hover-reveal category sidebar
  const [sidebarHoverOpen, setSidebarHoverOpen] = useState(false);
  const [headerVisible, setHeaderVisible] = useState(true);
  const [headerSettingsOpen, setHeaderSettingsOpen] = useState(false);
  const [headerAccountOpen, setHeaderAccountOpen] = useState(false);
  const [downloadingZip, setDownloadingZip] = useState(false);
  const [helpChatOpen, setHelpChatOpen] = useState(false);
  const [helpChatRole, setHelpChatRole] = useState<'customer' | 'seller'>('customer');
  const [heroImgError, setHeroImgError] = useState(false);
  const [promoImgError, setPromoImgError] = useState(false);
  const [quoteImgError, setQuoteImgError] = useState(false);
  const [gmpQuotaExceeded, setGmpQuotaExceeded] = useState(false);

  const openSupportChat = useCallback((role: 'customer' | 'seller' = 'customer') => {
    setHelpChatRole(role);
    setHelpChatOpen(true);
  }, []);
  const sidebarCloseTimerRef = useRef<number | null>(null);
  const phoneScrollRef = useRef<HTMLDivElement | null>(null);
  const desktopSearchInputRef = useRef<HTMLInputElement | null>(null);
  const phoneSearchInputRef = useRef<HTMLInputElement | null>(null);
  const lastScrollYRef = useRef(0);
  const upScrollAccumRef = useRef(0);
  const downScrollAccumRef = useRef(0);

  // Dedicated channel directory filters (Physical Stores & Online Pages)
  const [channelSearch, setChannelSearch] = useState('');
  const [channelAreaFilter, setChannelAreaFilter] = useState('all');
  const [channelOpenOnly, setChannelOpenOnly] = useState(false);
  const [onlinePlatformFilter, setOnlinePlatformFilter] = useState<'all' | 'instagram' | 'facebook'>('all');

  // Marketplace data
  const [categories, setCategories] = useState<Category[]>(CANONICAL_CATEGORIES);
  const [areas, setAreas] = useState<ElOuedArea[]>([]);
  const [stores, setStores] = useState<
    (Store & { distanceKm?: number | null; productCount?: number; topReview?: StoreReview | null })[]
  >([]);
  const [highestRatedStore, setHighestRatedStore] = useState<
    (Store & { distanceKm?: number | null; productCount?: number; topReview?: StoreReview | null }) | null
  >(null);
  const [mostSellingListing, setMostSellingListing] = useState<EnrichedListing | null>(null);
  const [bestSellingListings, setBestSellingListings] = useState<EnrichedListing[]>([]);
  const [cloudBestSellers, setCloudBestSellers] = useState<FirestoreBestSellingProduct[]>([]);
  const [cloudStores, setCloudStores] = useState<FirestoreStore[]>([]);
  const [cloudProducts, setCloudProducts] = useState<FirestoreSellerProduct[]>([]);
  const [apiListings, setApiListings] = useState<EnrichedListing[]>([]);
  const [loadingMarket, setLoadingMarket] = useState(true);
  const [hasLoadedMarket, setHasLoadedMarket] = useState(false);

  // Search & filters
  const [searchQuery, setSearchQuery] = useState('');
  const [searchDropdownOpen, setSearchDropdownOpen] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [selectedSubPart, setSelectedSubPart] = useState<string>('all');
  const [inStockOnly, setInStockOnly] = useState(false);
  const [openOnly, setOpenOnly] = useState(false);
  const [maxDistanceKm, setMaxDistanceKm] = useState<string>('');
  const [sortBy, setSortBy] = useState<string>('relevance');
  const [shopsDisplay, setShopsDisplay] = useState<'list' | 'map'>('list');
  const [catalogPage, setCatalogPage] = useState(0);

  // Location selection
  const [selectedAreaId, setSelectedAreaId] = useState<string>('all');
  const [gpsCoords, setGpsCoords] = useState<{ lat: number; lng: number; label: string } | null>(null);

  // Modals & Drawers
  const [compareProductSlug, setCompareProductSlug] = useState<string | null>(null);
  const [focusStoreReviews, setFocusStoreReviews] = useState(false);
  const [qrPrintStoreId, setQrPrintStoreId] = useState<string | null>(null);
  const [cartOpen, setCartOpen] = useState(false);

  // Cart & Orders & Favorites
  const [cart, setCart] = useState<CartItem[]>(() => {
    try {
      const raw = localStorage.getItem('mk_cart') || localStorage.getItem('sf_cart');
      return raw ? (JSON.parse(raw) as CartItem[]) : [];
    } catch {
      return [];
    }
  });
  const [pendingSwitchListing, setPendingSwitchListing] = useState<EnrichedListing | null>(null);
  const [recentOrders, setRecentOrders] = useState<Order[]>([]);
  const [favorites, setFavorites] = useState<Favorite[]>([]);

  // Toast
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  const isAr = lang === 'ar';
  const dict = t(lang);

  const notify = useCallback((message: string, type: 'success' | 'error' = 'success') => {
    setToast({ message, type });
  }, []);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 3500);
    return () => clearTimeout(timer);
  }, [toast]);

  // Listen for Google Maps quota exceeded event from map embeds
  useEffect(() => {
    const onQuota = () => setGmpQuotaExceeded(true);
    window.addEventListener('gmp-quota-exceeded', onQuota);
    return () => window.removeEventListener('gmp-quota-exceeded', onQuota);
  }, []);

  // Sync RTL & Dark Mode & Preview Preference
  useEffect(() => {
    document.documentElement.dir = lang === 'ar' ? 'rtl' : 'ltr';
    document.documentElement.lang = lang;
    try {
      localStorage.setItem('mk_lang', lang);
    } catch {
      // ignore
    }
  }, [lang]);

  useEffect(() => {
    document.documentElement.classList.toggle('dark', darkMode);
    try {
      localStorage.setItem('mk_theme', darkMode ? 'dark' : 'light');
    } catch {
      // ignore
    }
  }, [darkMode]);

  useEffect(() => {
    const mq = window.matchMedia('(max-width: 767px)');
    const update = () => setIsMobileViewport(mq.matches);
    update();
    mq.addEventListener('change', update);
    return () => mq.removeEventListener('change', update);
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem('mk_preview_mode', previewMode);
    } catch {
      // ignore
    }
  }, [previewMode]);

  useEffect(() => {
    try {
      localStorage.setItem('mk_cart', JSON.stringify(cart));
    } catch {
      // ignore
    }
  }, [cart]);

  const openSellerPage = useCallback((slug: string, focusRev = false) => {
    setFocusStoreReviews(focusRev);
    setActiveStoreSlug(slug);
    setActiveView('store');
    if (typeof window !== 'undefined') {
      const encoded = encodeURIComponent(slug);
      const nextUrl = `/?store=${encoded}#store/${encoded}`;
      const cur = window.location.pathname + window.location.search + window.location.hash;
      if (cur !== nextUrl) {
        history.pushState(null, '', nextUrl);
      }
    }
  }, []);

  const closeSellerPage = useCallback(() => {
    setActiveStoreSlug(null);
    setFocusStoreReviews(false);
    setActiveView('marketplace');
    if (typeof window !== 'undefined') {
      const url = new URL(window.location.href);
      if (
        url.searchParams.has('store') ||
        url.hash.startsWith('#store/') ||
        url.pathname.startsWith('/store/')
      ) {
        history.pushState(null, '', '/');
      }
    }
  }, []);

  // Deep-link support for QR scans & shared links (/?store=slug, /#store/slug, /store/slug)
  useEffect(() => {
    const syncStoreDeepLink = () => {
      const targetSlug = readStoreSlugFromUrl();
      if (targetSlug) {
        setActiveStoreSlug(targetSlug);
        setActiveView('store');
      } else {
        setActiveStoreSlug(null);
        setActiveView((prev) => (prev === 'store' ? 'marketplace' : prev));
      }
    };
    window.addEventListener('hashchange', syncStoreDeepLink);
    window.addEventListener('popstate', syncStoreDeepLink);
    return () => {
      window.removeEventListener('hashchange', syncStoreDeepLink);
      window.removeEventListener('popstate', syncStoreDeepLink);
    };
  }, []);

  // Reset dynamic header when switching views or preview modes
  useEffect(() => {
    setHeaderVisible(true);
    lastScrollYRef.current = 0;
    upScrollAccumRef.current = 0;
    downScrollAccumRef.current = 0;
  }, [activeView, previewMode]);

  // Keep header visible whenever a header popover or live search dropdown is open
  useEffect(() => {
    if (
      sidebarHoverOpen ||
      headerSettingsOpen ||
      headerAccountOpen ||
      phoneMenuOpen ||
      searchDropdownOpen
    ) {
      setHeaderVisible(true);
    }
  }, [
    sidebarHoverOpen,
    headerSettingsOpen,
    headerAccountOpen,
    phoneMenuOpen,
    searchDropdownOpen,
  ]);

  // Dynamic sticky header + search bar: hide on scroll down, reappear on slight scroll up
  useEffect(() => {
    const isLockedOpen =
      sidebarHoverOpen ||
      headerSettingsOpen ||
      headerAccountOpen ||
      phoneMenuOpen ||
      searchDropdownOpen;

    const handleScrollPosition = (currentY: number) => {
      if (isLockedOpen || currentY <= 48) {
        lastScrollYRef.current = currentY;
        upScrollAccumRef.current = 0;
        downScrollAccumRef.current = 0;
        setHeaderVisible(true);
        return;
      }

      const delta = currentY - lastScrollYRef.current;
      lastScrollYRef.current = currentY;

      if (delta > 0) {
        upScrollAccumRef.current = 0;
        downScrollAccumRef.current += delta;
        if (currentY > 88 && downScrollAccumRef.current > 10) {
          setHeaderVisible(false);
        }
      } else if (delta < 0) {
        downScrollAccumRef.current = 0;
        upScrollAccumRef.current += Math.abs(delta);
        if (upScrollAccumRef.current >= 6) {
          setHeaderVisible(true);
        }
      }
    };

    const onWindowScroll = () => {
      handleScrollPosition(window.scrollY || document.documentElement.scrollTop || 0);
    };

    const phoneEl = phoneScrollRef.current;
    const onPhoneScroll = () => {
      if (phoneEl) {
        handleScrollPosition(phoneEl.scrollTop);
      }
    };

    window.addEventListener('scroll', onWindowScroll, { passive: true });
    phoneEl?.addEventListener('scroll', onPhoneScroll, { passive: true });
    return () => {
      window.removeEventListener('scroll', onWindowScroll);
      phoneEl?.removeEventListener('scroll', onPhoneScroll);
    };
  }, [
    previewMode,
    activeView,
    sidebarHoverOpen,
    headerSettingsOpen,
    headerAccountOpen,
    phoneMenuOpen,
    searchDropdownOpen,
  ]);

  const activeCoords = useMemo(() => {
    if (gpsCoords) return { lat: gpsCoords.lat, lng: gpsCoords.lng, label: gpsCoords.label };
    if (selectedAreaId !== 'all') {
      const found = areas.find((a) => a.id === selectedAreaId);
      if (found) return { lat: found.lat, lng: found.lng, label: getAreaDisplayName(found.name, lang) };
    }
    return null;
  }, [gpsCoords, selectedAreaId, areas, lang]);

  // Load initial user session (or restore token)
  useEffect(() => {
    if (!getAuthToken()) return;
    apiFetch<{ user: PublicUser | null }>('/api/auth/me')
      .then((res) => {
        if (res.user) setUser(res.user);
      })
      .catch(() => setAuthToken(null));
  }, []);

  // Load favorites when signed in
  useEffect(() => {
    if (!user) {
      setFavorites([]);
      return;
    }
    apiFetch<{ favorites: Favorite[] }>('/api/favorites')
      .then((res) => setFavorites(res.favorites))
      .catch(() => {});
  }, [user]);

  // Fetch marketplace overview (stores, areas, stats)
  const loadOverview = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      if (activeCoords) {
        params.set('lat', String(activeCoords.lat));
        params.set('lng', String(activeCoords.lng));
      }
      const data = await apiFetch<{
        categories: Category[];
        areas: ElOuedArea[];
        stores: (Store & { distanceKm?: number | null; productCount?: number; topReview?: StoreReview | null })[];
        highestRatedStore: (Store & { distanceKm?: number | null; productCount?: number; topReview?: StoreReview | null }) | null;
        mostSellingListing: EnrichedListing | null;
        bestSellingListings?: EnrichedListing[];
        listings: EnrichedListing[];
      }>(`/api/marketplace/overview?${params.toString()}`);
      setCategories(
        data?.categories && data.categories.length > 0 ? data.categories : CANONICAL_CATEGORIES
      );
      setAreas(data?.areas ?? []);
      setStores(data.stores ?? []);
      setHighestRatedStore(data.highestRatedStore ?? null);
      setMostSellingListing(data.mostSellingListing ?? null);
      setBestSellingListings(data.bestSellingListings || []);
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Failed to load marketplace.', 'error');
    }
  }, [activeCoords, notify]);

  useEffect(() => {
    loadOverview();
  }, [loadOverview]);

  // Subscribe to public best-sellers, stores, and products in Firestore (with initial snapshot seed)
  useEffect(() => {
    fetchFirestoreCatalogSnapshot()
      .then((snap) => {
        if (snap.stores.length > 0) setCloudStores(snap.stores);
        if (snap.products.length > 0) setCloudProducts(snap.products);
      })
      .catch((err) => {
        console.warn('Initial Firestore catalog snapshot:', err instanceof Error ? err.message : err);
      });

    const unsubBest = subscribePublicBestSellers(
      (rows) => setCloudBestSellers(rows),
      (err) => console.warn('Public best sellers subscription:', err.message)
    );
    const unsubStores = subscribePublicStores(
      (rows) => setCloudStores(rows),
      (err) => console.warn('Public stores subscription:', err.message)
    );
    const unsubProducts = subscribePublicProducts(
      (rows) => setCloudProducts(rows),
      (err) => console.warn('Public products subscription:', err.message)
    );

    return () => {
      unsubBest();
      unsubStores();
      unsubProducts();
    };
  }, []);

  // Reset catalog pagination when filters change
  useEffect(() => {
    setCatalogPage(0);
  }, [searchQuery, selectedCategory, selectedSubPart, inStockOnly, openOnly, maxDistanceKm, sortBy]);

  // Fetch filtered/sorted product listings from backend search endpoint (merged with Firestore in memo)
  const loadSearchResults = useCallback(async () => {
    setLoadingMarket(true);
    try {
      const params = new URLSearchParams();
      if (searchQuery.trim()) params.set('q', searchQuery.trim());
      if (selectedCategory !== 'all') params.set('categoryId', selectedCategory);
      if (inStockOnly) params.set('availability', 'in_stock');
      if (openOnly) params.set('openOnly', 'true');
      if (maxDistanceKm) params.set('maxDistanceKm', maxDistanceKm);
      params.set('sortBy', sortBy);
      if (activeCoords) {
        params.set('lat', String(activeCoords.lat));
        params.set('lng', String(activeCoords.lng));
      }
      const data = await apiFetch<{ listings: EnrichedListing[] }>(
        `/api/marketplace/search?${params.toString()}`
      );
      setApiListings(data.listings || []);
      setCatalogPage(0);
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Search failed.', 'error');
    } finally {
      setLoadingMarket(false);
      setHasLoadedMarket(true);
    }
  }, [searchQuery, selectedCategory, inStockOnly, openOnly, maxDistanceKm, sortBy, activeCoords, notify]);

  useEffect(() => {
    const timer = setTimeout(() => {
      loadSearchResults();
    }, 150);
    return () => clearTimeout(timer);
  }, [loadSearchResults]);

  const handleUseGps = () => {
    if (!navigator.geolocation) {
      notify(
        isAr
          ? 'المتصفح لا يدعم تحديد الموقع. اختر حياً في الجلفة يدوياً.'
          : 'Geolocation is not supported by your browser. Choose a Djelfa area manually.',
        'error'
      );
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setSelectedAreaId('gps');
        setGpsCoords({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          label: isAr ? 'الموقع الحالي عبر GPS' : 'Current GPS location',
        });
        notify(isAr ? 'تم تحديث الموقع من GPS.' : 'Location updated from GPS.');
      },
      () => {
        notify(
          isAr
            ? 'تم رفض إذن الموقع. يتم عرض أحياء الجلفة يدوياً.'
            : 'Location permission declined. Showing Djelfa manual areas.',
          'error'
        );
      }
    );
  };

  const openAuthDialog = useCallback(
    (
      mode: 'login' | 'register' = 'login',
      role: 'customer' | 'merchant' | 'driver' = 'customer',
      sellerType: SellerBusinessType = 'physical_store'
    ) => {
      setAuthConfig({ mode, role, sellerType });
      setAuthOpen(true);
    },
    []
  );

  const openSellerSignUp = useCallback((preferredType: SellerBusinessType = 'online_page') => {
    setSellerSignupDefaultType(preferredType);
    setActiveView('seller_signup');
    if (typeof window !== 'undefined') {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }, []);

  const openPartnerRegister = useCallback(
    (target: 'physical_store' | 'online_page' | 'driver') => {
      if (target === 'driver') {
        if (user?.roles.includes('driver')) {
          setActiveView('driver');
          return;
        }
        openAuthDialog('register', 'driver', 'physical_store');
        return;
      }
      openSellerSignUp(target);
    },
    [user, openAuthDialog, openSellerSignUp]
  );

  const handleSidebarEnter = useCallback(() => {
    if (sidebarCloseTimerRef.current) {
      window.clearTimeout(sidebarCloseTimerRef.current);
      sidebarCloseTimerRef.current = null;
    }
    setSidebarHoverOpen(true);
  }, []);

  const handleSidebarLeave = useCallback(() => {
    if (sidebarCloseTimerRef.current) {
      window.clearTimeout(sidebarCloseTimerRef.current);
    }
    sidebarCloseTimerRef.current = window.setTimeout(() => {
      setSidebarHoverOpen(false);
    }, 140);
  }, []);

  const openCatalogPage = useCallback((catId: string, subPartId = 'all') => {
    setSelectedCategory(catId);
    setSelectedSubPart(subPartId);
    setCatalogPage(0);
    setSidebarHoverOpen(false);
    setSearchDropdownOpen(false);
    setHeaderSettingsOpen(false);
    setHeaderAccountOpen(false);
    setPhoneMenuOpen(false);
    setActiveView('catalog');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, []);

  const handleExploreNavClick = useCallback(() => {
    setActiveView('marketplace');
    setHeaderSettingsOpen(false);
    setHeaderAccountOpen(false);
    setPhoneMenuOpen(false);
    if (previewMode === 'phone' || isMobileViewport) {
      window.setTimeout(() => {
        const target = document.getElementById('phone-products-section');
        target?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 60);
    } else {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }, [previewMode, isMobileViewport]);

  const handleDownloadSiteZip = async () => {
    if (downloadingZip) return;
    setDownloadingZip(true);
    try {
      const token = getAuthToken();
      const res = await fetch('/api/export-zip', {
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      });
      if (!res.ok) {
        let errMessage = isAr ? 'فشل تصدير أرشيف الموقع.' : 'Failed to package site archive.';
        try {
          const payload = (await res.json()) as { error?: string };
          if (payload?.error) errMessage = payload.error;
        } catch {
          // ignore parse failure
        }
        throw new Error(errMessage);
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'marketly-editable.zip';
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      notify(isAr ? 'تم تحميل marketly-editable.zip' : 'Downloaded marketly-editable.zip');
    } catch (err) {
      notify(err instanceof Error ? err.message : 'ZIP download failed.', 'error');
    } finally {
      setDownloadingZip(false);
    }
  };

  const handleSwitchDemoRole = async (role: UserRole, targetView?: WorkspaceView) => {
    try {
      const res = await apiFetch<{ user: PublicUser; token: string }>('/api/demo/switch-role', {
        method: 'POST',
        body: JSON.stringify({ role }),
      });
      setAuthToken(res.token);
      setUser(res.user);
      if (targetView) {
        setActiveView(targetView);
      } else if (role === 'merchant') {
        setActiveView('merchant');
      } else if (role === 'driver') {
        setActiveView('driver');
      } else if (role === 'moderator') {
        setActiveView('moderator');
      } else if (role === 'admin') {
        setActiveView('admin');
      } else {
        setActiveView('marketplace');
      }
      notify(`Switched to ${res.user.fullName} (${role === 'merchant' ? 'seller' : role})`);
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Account switch failed.', 'error');
    }
  };

  const handleSignOut = () => {
    setAuthToken(null);
    setUser(null);
    setActiveView('marketplace');
    notify(isAr ? 'تم تسجيل الخروج.' : 'Signed out.');
  };

  const addListingToCart = (listing: EnrichedListing, forceReplace = false) => {
    if (listing.availabilityStatus === 'out_of_stock') {
      notify(isAr ? 'هذا المنتج غير متوفر حالياً.' : 'This item is currently out of stock.', 'error');
      return;
    }
    if (!listing.storeIsOpen) {
      notify(
        isAr ? `${listing.storeName} مغلق حالياً.` : `${listing.storeName} is currently closed.`,
        'error'
      );
      return;
    }
    if (cart.length > 0 && cart[0].storeId !== listing.storeId && !forceReplace) {
      setPendingSwitchListing(listing);
      return;
    }

    setCart((prev) => {
      const base = forceReplace ? [] : prev;
      const existing = base.find((item) => item.listingId === listing.listingId);
      if (existing) {
        return base.map((item) =>
          item.listingId === listing.listingId ? { ...item, quantity: item.quantity + 1 } : item
        );
      }
      return [
        ...base,
        {
          listingId: listing.listingId,
          productId: listing.productId,
          productName: listing.productName,
          brand: listing.brand,
          categoryId: listing.categoryId,
          imageKey: listing.imageKey,
          imageUrl: listing.imageUrl,
          price: listing.price,
          quantity: 1,
          storeId: listing.storeId,
          storeName: listing.storeName,
          storeDeliveryFee: listing.storeDeliveryFee,
          storeDeliveryZones: listing.storeDeliveryZones,
        },
      ];
    });
    notify(
      isAr
        ? `تمت إضافة ${listing.productName} من ${listing.storeName}`
        : `Added ${listing.productName} from ${listing.storeName}`
    );
  };

  const handleToggleFavorite = async (type: 'store' | 'product', targetId: string) => {
    if (!user) {
      setAuthOpen(true);
      notify('Sign in or switch to a demo customer to save favorites.');
      return;
    }
    try {
      const res = await apiFetch<{ saved: boolean; favorites: Favorite[] }>('/api/favorites/toggle', {
        method: 'POST',
        body: JSON.stringify({ type, targetId }),
      });
      setFavorites(res.favorites);
      notify(res.saved ? 'Saved to favorites.' : 'Removed from favorites.');
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Could not update favorite.', 'error');
    }
  };

  const firestoreListings = useMemo(
    () =>
      buildEnrichedListingsFromFirestore(
        cloudProducts,
        cloudStores,
        stores,
        activeCoords ? { lat: activeCoords.lat, lng: activeCoords.lng } : null
      ),
    [cloudProducts, cloudStores, stores, activeCoords]
  );

  const listings = useMemo(() => {
    const base = mergeAndFilterListings(apiListings, firestoreListings, {
      q: searchQuery,
      categoryId: selectedCategory,
      inStockOnly,
      openOnly,
      maxDistanceKm,
      sortBy,
    });
    if (selectedSubPart === 'all') return base;
    return base.filter((item) => matchesSubPart(item, selectedSubPart));
  }, [
    apiListings,
    firestoreListings,
    searchQuery,
    selectedCategory,
    selectedSubPart,
    inStockOnly,
    openOnly,
    maxDistanceKm,
    sortBy,
  ]);

  const mergedStores = useMemo(() => {
    const areaCoords: Record<string, { lat: number; lng: number }> = {};
    for (const a of DJELFA_AREAS) {
      areaCoords[a.name.toLowerCase()] = { lat: a.lat, lng: a.lng };
    }

    const countByStore = new Map<string, number>();
    for (const p of cloudProducts) {
      if (p.isActive) {
        countByStore.set(p.storeId, (countByStore.get(p.storeId) || 0) + 1);
      }
    }

    const storeMap = new Map(
      stores.map((s) => [
        s.id,
        {
          ...s,
          productCount: Math.max(s.productCount || 0, countByStore.get(s.id) || 0),
        },
      ])
    );

    for (const cs of cloudStores) {
      if (!cs.isApproved) continue;
      const existing = storeMap.get(cs.id);
      if (existing) {
        storeMap.set(cs.id, {
          ...existing,
          name: cs.name || existing.name,
          storeType: existing.storeType || cs.storeType || 'physical_store',
          description: cs.description || existing.description,
          openingHours: cs.openingHours || existing.openingHours,
          logoUrl: existing.logoUrl ?? (cs.logoUrl ? cs.logoUrl : null),
          whatsapp: existing.whatsapp || cs.whatsapp || '213662451109',
          facebookUrl: existing.facebookUrl ?? (cs.facebookUrl ? cs.facebookUrl : null),
          instagramUrl: existing.instagramUrl ?? (cs.instagramUrl ? cs.instagramUrl : null),
          googleMapsUrl: existing.googleMapsUrl ?? (cs.googleMapsUrl ? cs.googleMapsUrl : null),
          isOpen: cs.isOpen,
          rating: cs.rating || existing.rating,
          reviewCount: Math.max(existing.reviewCount, cs.reviewCount),
          productCount: Math.max(existing.productCount || 0, countByStore.get(cs.id) || 0),
        });
      } else {
        const coords = areaCoords[cs.area.toLowerCase()] || { lat: 34.6728, lng: 3.263 };
        storeMap.set(cs.id, {
          id: cs.id,
          ownerId: cs.ownerUid,
          name: cs.name,
          slug: cs.slug,
          storeType: cs.storeType || 'physical_store',
          description: cs.description,
          logoUrl: cs.logoUrl ? cs.logoUrl : null,
          area: cs.area,
          address:
            cs.storeType === 'online_page'
              ? `Online Storefront · ${cs.area}, Djelfa`
              : `${cs.area}, Djelfa`,
          city: cs.city || 'Djelfa',
          lat: coords.lat,
          lng: coords.lng,
          phone: '0662 45 11 09',
          whatsapp: cs.whatsapp || '213662451109',
          facebookUrl: cs.facebookUrl ? cs.facebookUrl : null,
          instagramUrl: cs.instagramUrl ? cs.instagramUrl : null,
          googleMapsUrl: cs.googleMapsUrl ? cs.googleMapsUrl : null,
          categories: ['cat-pc-parts'],
          openingHours: cs.openingHours,
          isOpen: cs.isOpen,
          rating: cs.rating,
          reviewCount: cs.reviewCount,
          approvalStatus: 'approved',
          accentColor: cs.storeType === 'online_page' ? '#9678CE' : '#4A3894',
          deliveryZones: [cs.area],
          deliveryFee: cs.deliveryFee,
          deliveryRadiusKm: cs.deliveryRadiusKm,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          productCount: countByStore.get(cs.id) || 0,
        });
      }
    }

    return Array.from(storeMap.values());
  }, [stores, cloudStores, cloudProducts]);

  const physicalStores = useMemo(
    () =>
      mergedStores.filter(
        (s) => (s.storeType || 'physical_store') === 'physical_store'
      ),
    [mergedStores]
  );

  const onlineStores = useMemo(
    () => mergedStores.filter((s) => s.storeType === 'online_page'),
    [mergedStores]
  );

  const filteredPhysicalStores = useMemo(() => {
    const q = channelSearch.trim().toLowerCase();
    return physicalStores.filter((s) => {
      if (channelAreaFilter !== 'all' && s.area !== channelAreaFilter) return false;
      if (channelOpenOnly && !s.isOpen) return false;
      if (!q) return true;
      return `${s.name} ${s.description} ${s.area} ${s.address}`.toLowerCase().includes(q);
    });
  }, [physicalStores, channelSearch, channelAreaFilter, channelOpenOnly]);

  const filteredOnlineStores = useMemo(() => {
    const q = channelSearch.trim().toLowerCase();
    return onlineStores.filter((s) => {
      if (channelOpenOnly && !s.isOpen) return false;
      if (
        channelAreaFilter !== 'all' &&
        s.area !== channelAreaFilter &&
        !(s.deliveryZones || []).includes(channelAreaFilter)
      ) {
        return false;
      }
      if (onlinePlatformFilter === 'instagram' && !s.instagramUrl) return false;
      if (onlinePlatformFilter === 'facebook' && !s.facebookUrl) return false;
      if (!q) return true;
      return `${s.name} ${s.description} ${s.area} ${(s.deliveryZones || []).join(' ')}`
        .toLowerCase()
        .includes(q);
    });
  }, [onlineStores, channelSearch, channelAreaFilter, channelOpenOnly, onlinePlatformFilter]);

  const handleHeroSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setActiveView('catalog');
    setSearchDropdownOpen(false);
    setCatalogPage(0);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleClearAllFilters = () => {
    setSearchQuery('');
    setSelectedCategory('all');
    setSelectedSubPart('all');
    setInStockOnly(false);
    setOpenOnly(false);
    setMaxDistanceKm('');
    setSortBy('relevance');
    setCatalogPage(0);
  };

  const cartCount = cart.reduce((sum, i) => sum + i.quantity, 0);
  const pageSize = previewMode === 'phone' ? 4 : activeView === 'catalog' ? 12 : 8;
  const maxPages = Math.max(1, Math.ceil(listings.length / pageSize));
  const pagedListings = listings.slice(catalogPage * pageSize, (catalogPage + 1) * pageSize);

  const canExportZip = Boolean(
    user &&
      (user.roles.includes('admin') ||
        user.email.toLowerCase() === 'iimrxreports@gmail.com')
  );

  const rankedBestSellers = useMemo<PublicBestSellerItem[]>(() => {
    const map = new Map<string, PublicBestSellerItem>();

    for (const item of bestSellingListings) {
      const matched = listings.find((l) => l.listingId === item.listingId) || item;
      const key = item.productSlug || item.listingId;
      map.set(key, {
        id: item.listingId,
        productName: item.productName,
        productSlug: item.productSlug,
        brand: item.brand,
        storeName: item.storeName,
        imageKey: item.imageKey,
        imageUrl: item.imageUrl,
        price: item.price,
        soldCount: item.soldCount,
        isCloudSynced: false,
        listing: matched,
      });
    }

    for (const cloud of cloudBestSellers) {
      const matched =
        listings.find(
          (l) => l.listingId === cloud.productId || l.productSlug === cloud.productSlug
        ) || null;
      const key = cloud.productSlug || cloud.productId;
      const prev = map.get(key);
      if (prev) {
        map.set(key, {
          ...prev,
          soldCount: Math.max(prev.soldCount, cloud.soldCount),
          price: cloud.price || prev.price,
          isCloudSynced: true,
          listing: prev.listing || matched,
        });
      } else {
        map.set(key, {
          id: cloud.id,
          productName: cloud.productName,
          productSlug: cloud.productSlug,
          brand: cloud.brand,
          storeName: cloud.storeName,
          imageKey: cloud.imageKey,
          imageUrl: cloud.imageUrl || null,
          price: cloud.price,
          soldCount: cloud.soldCount,
          isCloudSynced: true,
          listing: matched,
        });
      }
    }

    return Array.from(map.values())
      .sort((a, b) => b.soldCount - a.soldCount)
      .slice(0, 6);
  }, [bestSellingListings, cloudBestSellers, listings]);

  const isPhoneLayout = previewMode === 'phone' || isMobileViewport;

  return (
    <MotionConfig reducedMotion="user">
    <div
      dir={isAr ? 'rtl' : 'ltr'}
      className={`min-h-screen text-[#1E1438] transition-colors dark:bg-[#050507] dark:text-[#F4F1FC] ${
        previewMode === 'phone'
          ? 'bg-[#F3EFFA]'
          : 'bg-white marketly-ambient-bg dark:bg-none'
      }`}
    >
      {activeView === 'store' && activeStoreSlug ? (
        <SellerStorePage
          storeSlug={activeStoreSlug}
          areas={areas}
          categories={categories}
          coords={activeCoords ? { lat: activeCoords.lat, lng: activeCoords.lng } : null}
          cloudStores={cloudStores}
          cloudProducts={cloudProducts}
          lang={lang}
          onChangeLang={setLang}
          darkMode={darkMode}
          onToggleDarkMode={() => setDarkMode((d) => !d)}
          user={user}
          cart={cart}
          onAddToCart={(listing) => addListingToCart(listing)}
          onUpdateCartQty={(listingId, delta) => {
            setCart((prev) =>
              prev
                .map((item) =>
                  item.listingId === listingId ? { ...item, quantity: item.quantity + delta } : item
                )
                .filter((item) => item.quantity > 0)
            );
          }}
          onOpenCart={() => setCartOpen(true)}
          onCompareProduct={(slug) => setCompareProductSlug(slug)}
          isFavorite={favorites.some(
            (f) =>
              f.type === 'store' &&
              mergedStores.some((s) => s.slug === activeStoreSlug && s.id === f.targetId)
          )}
          onToggleFavorite={handleToggleFavorite}
          focusReviews={focusStoreReviews}
          onReviewSubmitted={() => {
            loadOverview();
            loadSearchResults();
          }}
          onBackToMarketplace={closeSellerPage}
          onOpenQrPrint={(storeId) => setQrPrintStoreId(storeId)}
          onOpenDashboard={() => setActiveView('dashboard')}
          onStoreMutated={() => {
            loadOverview();
            loadSearchResults();
          }}
          notify={notify}
        />
      ) : activeView === 'dashboard' ? (
        <SellerAnalyticsDashboard
          user={user}
          lang={lang}
          onBackToMarketplace={() => setActiveView('marketplace')}
          onOpenStorefront={(slug) => openSellerPage(slug)}
          onOpenMerchantManage={() => setActiveView('merchant')}
          onOpenQrPrint={(storeId) => setQrPrintStoreId(storeId)}
          onOpenSellerSignUp={() => openSellerSignUp('online_page')}
          notify={notify}
        />
      ) : activeView === 'seller_signup' ? (
        <SellerSignUpPage
          key={sellerSignupDefaultType}
          initialSellerType={sellerSignupDefaultType}
          existingUser={user}
          lang={lang}
          onAuthSynced={(u) => {
            setUser(u);
            loadOverview();
            loadSearchResults();
          }}
          onSuccess={(u, meta) => {
            setUser(u);
            loadOverview();
            loadSearchResults();
            if (meta?.storeSlug) {
              openSellerPage(meta.storeSlug);
            } else {
              setActiveView('merchant');
            }
          }}
          onBack={() => setActiveView('marketplace')}
          onOpenLogin={() => openAuthDialog('login', 'customer', 'physical_store')}
          onOpenMerchantPortal={() => setActiveView('merchant')}
          notify={notify}
        />
      ) : (
      /* Outer Frame supporting both Desktop (1380px centered workspace) and Phone Preview (404x820 bezel) */
      <div
        className={`mx-auto transition-all duration-300 ${
          previewMode === 'phone'
            ? 'my-0 sm:my-5 flex h-screen sm:h-[820px] max-w-[404px] flex-col sm:rounded-[40px] sm:border-[8px] sm:border-[#15151C] sm:shadow-2xl overflow-hidden bg-white dark:bg-[#050507]'
            : 'min-h-screen max-w-[1380px] bg-transparent'
        }`}
      >
        <div
          ref={phoneScrollRef}
          className={isPhoneLayout && previewMode === 'phone' ? 'flex-1 overflow-y-auto' : 'w-full'}
        >
        {isPhoneLayout ? (
            /* ==========================================
                COMPACT PHONE TOP HEADER + ALWAYS-VISIBLE SEARCH BAR
               ========================================== */
            <header
              className={`sticky top-0 z-30 border-b border-[#E5DDF5] bg-white/95 backdrop-blur-md transition-transform duration-300 ease-out dark:border-[#22222C] dark:bg-[#050507]/95 ${
                headerVisible ? 'translate-y-0' : '-translate-y-full'
              }`}
            >
              <div className="flex items-center justify-between gap-2 px-3.5 py-2.5">
                <button
                  type="button"
                  onClick={() => {
                    setActiveView('marketplace');
                    setHeaderSettingsOpen(false);
                    setPhoneMenuOpen(false);
                  }}
                  className="flex items-center gap-2 whitespace-nowrap shrink-0 cursor-pointer"
                >
                  <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-gradient-to-br from-[#4A3894] to-[#9678CE] text-white shadow-xs">
                    <StoreIcon className="h-4 w-4" />
                  </span>
                  <span className="font-display text-sm font-extrabold tracking-tight text-[#1E1438] dark:text-white">
                    {dict.brand}
                  </span>
                </button>

                <div className="flex items-center gap-1.5 shrink-0">
                  <button
                    type="button"
                    onClick={() => {
                      setHeaderVisible(true);
                      setHeaderSettingsOpen(false);
                      setPhoneMenuOpen(false);
                      phoneSearchInputRef.current?.focus();
                    }}
                    aria-label={isAr ? 'التركيز على البحث' : 'Focus search bar'}
                    className={`relative flex h-8 w-8 items-center justify-center rounded-full border transition cursor-pointer ${
                      searchQuery.trim().length > 0
                        ? 'border-[#4A3894] bg-[#F9F5FD] text-[#4A3894] dark:bg-[#15151C] dark:text-[#9678CE]'
                        : 'border-[#E5DDF5] bg-white text-[#5E5C70] dark:border-[#22222C] dark:bg-[#0E0E13] dark:text-[#B9B0D8]'
                    }`}
                  >
                    <Search className="h-3.5 w-3.5" />
                  </button>

                  <button
                    type="button"
                    onClick={() => setCartOpen(true)}
                    aria-label={isAr ? 'فتح السلة' : 'Open cart'}
                    className="relative flex h-8 w-8 items-center justify-center rounded-full border border-[#E5DDF5] bg-white text-[#5E5C70] hover:text-[#1E1438] dark:border-[#22222C] dark:bg-[#0E0E13] dark:text-[#B9B0D8] cursor-pointer"
                  >
                    <ShoppingBag className="h-3.5 w-3.5" />
                    {cartCount > 0 && (
                      <span className="absolute -end-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-[#4A3894] px-1 text-[9px] font-bold text-white tabular-nums">
                        {cartCount}
                      </span>
                    )}
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setHeaderSettingsOpen((v) => !v);
                      setPhoneMenuOpen(false);
                    }}
                    aria-label={isAr ? 'الإعدادات والموقع' : 'Preferences & location'}
                    className="flex h-8 w-8 items-center justify-center rounded-full border border-[#E5DDF5] bg-white text-[#5E5C70] hover:text-[#1E1438] dark:border-[#22222C] dark:bg-[#0E0E13] dark:text-[#B9B0D8] cursor-pointer"
                  >
                    <Settings className="h-3.5 w-3.5" />
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setPhoneMenuOpen((v) => !v);
                      setHeaderSettingsOpen(false);
                    }}
                    aria-label={isAr ? 'قائمة الحساب' : 'Open account menu'}
                    className="flex h-8 w-8 items-center justify-center rounded-full bg-[#4A3894] text-[11px] font-extrabold text-white cursor-pointer"
                  >
                    {user ? user.fullName.slice(0, 1).toUpperCase() : <UserIcon className="h-3.5 w-3.5" />}
                  </button>
                </div>
              </div>

              {/* Persistent Search Bar directly under Phone Header */}
              <div className="border-t border-[#E5DDF5]/80 bg-white/95 px-3.5 py-2 dark:border-[#22222C] dark:bg-[#050507]/95">
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    setActiveView('marketplace');
                    setTimeout(() => {
                      (
                        document.getElementById('phone-products-section') ||
                        document.getElementById('local-picks-grid')
                      )?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                    }, 50);
                  }}
                  className="flex items-center gap-2 rounded-full border border-[#E5DDF5] bg-[#F9F5FD] px-3 py-1.5 dark:border-[#22222C] dark:bg-[#0E0E13]"
                >
                  <Search className="h-3.5 w-3.5 shrink-0 text-[#4A3894] dark:text-[#9678CE]" />
                  <input
                    ref={phoneSearchInputRef}
                    type="search"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder={dict.searchPlaceholder}
                    aria-label={isAr ? 'ابحث في السوق' : 'Search local products'}
                    className="w-full bg-transparent text-xs text-[#1E1438] placeholder:text-[#5E5C70] focus:outline-none dark:text-[#F4F1FC]"
                  />
                  {searchQuery && (
                    <button
                      type="button"
                      onClick={() => setSearchQuery('')}
                      aria-label={isAr ? 'مسح البحث' : 'Clear search'}
                      className="text-[#5E5C70] hover:text-[#1E1438] dark:hover:text-white cursor-pointer"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  )}
                </form>
              </div>

            {headerSettingsOpen && (
              <div className="liquid-glass space-y-2.5 border-t border-[#E5DDF5] px-3.5 py-2.5 text-xs dark:border-[#22222C]">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => setPreviewMode('desktop')}
                      className="hidden sm:inline-flex items-center gap-1 rounded-full border border-[#E5DDF5] px-2.5 py-1 text-[11px] font-semibold dark:border-[#22222C] cursor-pointer"
                    >
                      <Monitor className="h-3 w-3" />
                      <span>{dict.desktopPreview}</span>
                    </button>
                    <select
                      aria-label={isAr ? 'اللغة' : 'Language'}
                      value={lang}
                      onChange={(e) => setLang(e.target.value as LanguageCode)}
                      className="rounded-full border border-[#E5DDF5] bg-[#F9F5FD] px-2.5 py-1 text-[11px] font-semibold dark:border-[#22222C] dark:bg-[#15151C]"
                    >
                      <option value="en">EN</option>
                      <option value="ar">AR</option>
                    </select>
                    <button
                      type="button"
                      onClick={() => setDarkMode((d) => !d)}
                      aria-label={isAr ? 'تبديل المظهر' : 'Toggle theme'}
                      className="rounded-full border border-[#E5DDF5] bg-[#F9F5FD] p-1.5 text-[#5E5C70] dark:border-[#22222C] dark:bg-[#15151C] dark:text-[#E794C9] cursor-pointer"
                    >
                      {darkMode ? <Sun className="h-3.5 w-3.5" /> : <Moon className="h-3.5 w-3.5" />}
                    </button>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <PWAInstallButton compact lang={lang} />
                  </div>
                </div>
              </div>
            )}

            {phoneMenuOpen && (
              <div className="liquid-glass space-y-2.5 border-t border-[#E5DDF5] px-3.5 py-2.5 text-xs dark:border-[#22222C]">
                <div className="flex flex-wrap items-center gap-1.5 border-b border-[#E5DDF5]/80 pb-2 dark:border-[#22222C]/80">
                  <button
                    type="button"
                    onClick={() => {
                      openCatalogPage('all', 'all');
                      setPhoneMenuOpen(false);
                    }}
                    className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-semibold cursor-pointer ${
                      activeView === 'catalog'
                        ? 'bg-[#4A3894] text-white'
                        : 'border border-[#E5DDF5] text-[#1E1438] dark:border-[#22222C] dark:text-white'
                    }`}
                  >
                    <LayoutGrid className="h-3 w-3" />
                    <span>{dict.navCatalog}</span>
                  </button>
                </div>

                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-1.5">
                    {user?.roles.includes('merchant') && (
                      <>
                        <button
                          type="button"
                          onClick={() => {
                            setActiveView('dashboard');
                            setPhoneMenuOpen(false);
                          }}
                          className="rounded-full bg-[#4A3894] px-3 py-1 text-[11px] font-bold text-white cursor-pointer"
                        >
                          {isAr ? 'الإحصائيات' : 'Dashboard'}
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setActiveView('merchant');
                            setPhoneMenuOpen(false);
                          }}
                          className="rounded-full bg-[#9678CE] px-3 py-1 text-[11px] font-bold text-white cursor-pointer"
                        >
                          {dict.navMerchant}
                        </button>
                      </>
                    )}
                    {user?.roles.includes('driver') && (
                      <button
                        type="button"
                        onClick={() => {
                          setActiveView('driver');
                          setPhoneMenuOpen(false);
                        }}
                        className="rounded-full bg-[#4A3894] px-3 py-1 text-[11px] font-bold text-white cursor-pointer"
                      >
                        {dict.navDriver}
                      </button>
                    )}
                    {(user?.roles.includes('moderator') || user?.roles.includes('admin')) && (
                      <button
                        type="button"
                        onClick={() => {
                          setActiveView('moderator');
                          setPhoneMenuOpen(false);
                        }}
                        className="rounded-full border border-[#E5DDF5] px-2.5 py-1 text-[11px] font-semibold dark:border-[#22222C] cursor-pointer"
                      >
                        {dict.navModerator}
                      </button>
                    )}
                    {user?.roles.includes('admin') && (
                      <button
                        type="button"
                        onClick={() => {
                          setActiveView('admin');
                          setPhoneMenuOpen(false);
                        }}
                        className="rounded-full border border-[#E5DDF5] px-2.5 py-1 text-[11px] font-semibold dark:border-[#22222C] cursor-pointer"
                      >
                        {dict.navAdmin}
                      </button>
                    )}
                    {!user && (
                      <button
                        type="button"
                        onClick={() => {
                          openSellerSignUp('online_page');
                          setPhoneMenuOpen(false);
                        }}
                        className="rounded-full border border-[#E5DDF5] px-2.5 py-1 text-[11px] font-semibold dark:border-[#22222C] cursor-pointer"
                      >
                        {isAr ? 'ابدأ البيع' : 'Join & Start Selling'}
                      </button>
                    )}
                  </div>
                  {user ? (
                    <button
                      type="button"
                      onClick={() => {
                        handleSignOut();
                        setPhoneMenuOpen(false);
                      }}
                      className="inline-flex items-center gap-1 text-[11px] font-semibold text-rose-600 cursor-pointer"
                    >
                      <span>{user.fullName} · {isAr ? 'خروج' : 'Sign out'}</span>
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => {
                        openAuthDialog('login', 'customer', 'physical_store');
                        setPhoneMenuOpen(false);
                      }}
                      className="rounded-full bg-[#4A3894] px-3 py-1 text-[11px] font-semibold text-white cursor-pointer"
                    >
                      {dict.signIn}
                    </button>
                  )}
                </div>
              </div>
            )}
          </header>
        ) : (
          /* ==========================================
             MARKETLY DESKTOP HEADER (ROW 1: SEARCH & UTILITIES, ROW 2: CENTERED NAV)
             ========================================== */
          <header
            className={`sticky top-0 z-40 border-b border-[#E5DDF5]/85 bg-white/95 backdrop-blur-xl transition-transform duration-[250ms] ease-[cubic-bezier(0.16,1,0.3,1)] dark:border-[#22222C]/85 dark:bg-[#050507]/95 ${
              headerVisible ? 'translate-y-0' : '-translate-y-full'
            }`}
          >
            {/* Row 1: Brand + Centered Search Bar + Right Utility Group */}
            <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 sm:px-6 pt-3 pb-2.5">
              {/* Left: Marketly Geometric Brand Mark + Wordmark */}
              <button
                type="button"
                onClick={() => {
                  setActiveView('marketplace');
                  setHeaderSettingsOpen(false);
                  setHeaderAccountOpen(false);
                  window.scrollTo({ top: 0, behavior: 'smooth' });
                }}
                title={dict.brand}
                className="flex items-center gap-2.5 shrink-0 cursor-pointer group"
              >
                <span className="relative flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-[#4A3894] to-[#9678CE] text-white shadow-xs transition-transform group-hover:scale-105">
                  <StoreIcon className="h-4 w-4" />
                  <span className="absolute -end-0.5 -top-0.5 h-2.5 w-2.5 rounded-full bg-[#E794C9] ring-2 ring-white dark:ring-[#050507]" />
                </span>
                <span className="font-display text-base font-extrabold tracking-tight text-[#1E1438] dark:text-white">
                  {dict.brand}
                </span>
              </button>

              {/* Center: Search Pill + Live Instant Results Dropdown */}
              <div className="relative mx-auto flex-1 max-w-xl">
                <form
                  onSubmit={handleHeroSearchSubmit}
                  className="flex items-center gap-2 rounded-full border border-[#E5DDF5] bg-[#F9F5FD]/95 ps-4 pe-1.5 py-1.5 shadow-xs transition focus-within:border-[#4A3894] focus-within:bg-white dark:border-[#22222C] dark:bg-[#0E0E13]/95 dark:focus-within:border-[#9678CE] dark:focus-within:bg-[#0E0E13]"
                >
                  <Search className="h-4 w-4 shrink-0 text-[#4A3894] dark:text-[#9678CE]" />
                  <input
                    ref={desktopSearchInputRef}
                    type="text"
                    inputMode="search"
                    enterKeyHint="search"
                    value={searchQuery}
                    onFocus={() => setSearchDropdownOpen(true)}
                    onBlur={() => setTimeout(() => setSearchDropdownOpen(false), 160)}
                    onChange={(e) => {
                      setSearchQuery(e.target.value);
                      setSearchDropdownOpen(true);
                    }}
                    placeholder={dict.searchPlaceholder}
                    aria-label={isAr ? 'ابحث في سوق الجلفة' : 'Search local products'}
                    className="min-w-0 flex-1 bg-transparent text-xs text-[#1E1438] placeholder:text-[#5E5C70] focus:outline-none dark:text-[#F4F1FC] dark:placeholder:text-[#B9B0D8]"
                  />
                  {searchQuery && (
                    <button
                      type="button"
                      onClick={() => {
                        setSearchQuery('');
                        desktopSearchInputRef.current?.focus();
                      }}
                      aria-label={isAr ? 'مسح البحث' : 'Clear search text'}
                      className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[#5E5C70] hover:bg-[#EDE4FA] hover:text-[#1E1438] dark:text-[#B9B0D8] dark:hover:bg-[#15151C] dark:hover:text-white cursor-pointer"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  )}
                  <button
                    type="submit"
                    aria-label={isAr ? 'بحث' : 'Search local products'}
                    className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#4A3894] text-white transition hover:bg-[#3A2B78] cursor-pointer"
                  >
                    <ArrowRight className="h-3.5 w-3.5 rtl:rotate-180" />
                  </button>
                </form>

                {searchDropdownOpen && searchQuery.trim().length > 0 && (
                  <div
                    onMouseDown={(e) => e.preventDefault()}
                    className="liquid-glass absolute inset-x-0 top-full z-50 mt-2 overflow-hidden rounded-2xl border border-[#E5DDF5] bg-white/95 shadow-2xl dark:border-[#22222C] dark:bg-[#0E0E13]/95"
                  >
                    <div className="flex items-center justify-between border-b border-[#E5DDF5] bg-[#F9F5FD] px-4 py-2 text-[11px] dark:border-[#22222C] dark:bg-[#15151C]">
                      <span className="font-semibold text-[#5E5C70] dark:text-[#B9B0D8]">
                        {isAr
                          ? `${listings.length} نتيجة في الجلفة`
                          : `${listings.length} ${listings.length === 1 ? 'result' : 'results'} in Djelfa`}
                      </span>
                      <button
                        type="button"
                        onClick={() => {
                          setSearchDropdownOpen(false);
                          setCatalogPage(0);
                          setActiveView('catalog');
                          window.scrollTo({ top: 0, behavior: 'smooth' });
                        }}
                        className="font-bold text-[#4A3894] hover:underline dark:text-[#9678CE] cursor-pointer"
                      >
                        {isAr ? 'عرض كل النتائج' : 'View all results'}
                      </button>
                    </div>

                    {listings.length === 0 ? (
                      <div className="px-4 py-5 text-center text-xs text-[#5E5C70] dark:text-[#B9B0D8]">
                        {isAr
                          ? `لا توجد نتائج لـ "${searchQuery}". جرب RTX 4060 أو SSD أو iPhone.`
                          : `No products found for “${searchQuery}”. Try RTX 4060, SSD, iPhone, or Monitor.`}
                      </div>
                    ) : (
                      <div className="max-h-72 divide-y divide-[#E5DDF5] overflow-y-auto dark:divide-[#22222C]">
                        {listings.slice(0, 6).map((item) => (
                          <div
                            key={item.listingId}
                            className="flex items-center justify-between gap-3 px-4 py-2.5 transition hover:bg-[#F9F5FD] dark:hover:bg-[#15151C]"
                          >
                            <button
                              type="button"
                              onClick={() => {
                                setSearchDropdownOpen(false);
                                setCompareProductSlug(item.productSlug);
                              }}
                              className="flex min-w-0 flex-1 items-center gap-3 text-start cursor-pointer"
                            >
                              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#F9F5FD] dark:bg-[#15151C] overflow-hidden">
                                <ProductArtwork
                                  imageKey={item.imageKey}
                                  imageUrl={item.imageUrl}
                                  categoryId={item.categoryId}
                                  alt={item.productName}
                                  className="h-8 w-8"
                                />
                              </div>
                              <div className="min-w-0">
                                <div className="truncate font-display text-xs font-bold text-[#1E1438] dark:text-white">
                                  {item.productName}
                                </div>
                                <div className="truncate text-[11px] text-[#5E5C70] dark:text-[#B9B0D8]">
                                  {item.storeName} · {getAreaDisplayName(item.storeArea, lang)} ·{' '}
                                  <span
                                    className={
                                      item.availabilityStatus === 'in_stock'
                                        ? 'font-semibold text-emerald-600 dark:text-emerald-400'
                                        : 'font-semibold text-rose-600 dark:text-rose-400'
                                    }
                                  >
                                    {item.availabilityStatus === 'in_stock' ? dict.inStock : dict.outOfStock}
                                  </span>
                                </div>
                              </div>
                            </button>
                            <div className="flex shrink-0 items-center gap-2">
                              <span className="font-display text-xs font-extrabold text-[#1E1438] dark:text-white tabular-nums">
                                {formatDzd(item.price, lang)}
                              </span>
                              <button
                                type="button"
                                disabled={item.availabilityStatus === 'out_of_stock' || !item.storeIsOpen}
                                onClick={() => addListingToCart(item)}
                                aria-label={`Add ${item.productName}`}
                                className="flex h-7 w-7 items-center justify-center rounded-full bg-[#4A3894] text-white transition hover:bg-[#3A2B78] disabled:opacity-35 cursor-pointer"
                              >
                                <ArrowRight className="h-3.5 w-3.5 rtl:rotate-180" />
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Right: Cart + Settings + Icon-Only Account Button */}
              <div className="relative flex items-center gap-2 shrink-0">
                {/* Cart Circle Button */}
                <button
                  type="button"
                  onClick={() => setCartOpen(true)}
                  title={`${dict.cartButton} (${cartCount})`}
                  aria-label={isAr ? 'فتح السلة' : 'Open cart'}
                  className="relative flex h-9 w-9 items-center justify-center rounded-full border border-[#E5DDF5] bg-white text-[#5E5C70] transition hover:border-[#4A3894] hover:text-[#4A3894] dark:border-[#22222C] dark:bg-[#0E0E13] dark:text-[#B9B0D8] dark:hover:border-[#9678CE] dark:hover:text-white cursor-pointer"
                >
                  <ShoppingBag className="h-4 w-4" />
                  {cartCount > 0 && (
                    <span className="absolute -end-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-[#4A3894] px-1 text-[9px] font-bold text-white tabular-nums">
                      {cartCount}
                    </span>
                  )}
                </button>

                {/* Settings Gear Circle Button */}
                <div className="relative">
                  <button
                    type="button"
                    onClick={() => {
                      setHeaderSettingsOpen((v) => !v);
                      setHeaderAccountOpen(false);
                    }}
                    title={isAr ? 'المنطقة واللغة والمظهر' : 'Area, Language & Display Settings'}
                    aria-label={isAr ? 'الإعدادات' : 'Preferences'}
                    className={`flex h-9 w-9 items-center justify-center rounded-full border transition cursor-pointer ${
                      headerSettingsOpen
                        ? 'border-[#4A3894] bg-[#F9F5FD] text-[#4A3894] dark:border-[#9678CE] dark:bg-[#15151C] dark:text-[#9678CE]'
                        : 'border-[#E5DDF5] bg-white text-[#5E5C70] hover:border-[#4A3894] hover:text-[#4A3894] dark:border-[#22222C] dark:bg-[#0E0E13] dark:text-[#B9B0D8] dark:hover:border-[#9678CE] dark:hover:text-white'
                    }`}
                  >
                    <Settings className="h-4 w-4" />
                  </button>

                  {headerSettingsOpen && (
                    <div className="liquid-glass absolute end-0 top-full z-50 mt-2 w-72 max-w-[calc(100vw-2rem)] rounded-2xl border border-[#E5DDF5] bg-white/95 p-4 shadow-xl space-y-3.5 text-xs dark:border-[#22222C] dark:bg-[#0E0E13]/95">
                      <div className="flex items-center justify-between">
                        <span className="font-display text-xs font-bold text-[#1E1438] dark:text-white">
                          {isAr ? 'الموقع والتفضيلات' : 'Location & Preferences'}
                        </span>
                        <button
                          type="button"
                          onClick={() => setHeaderSettingsOpen(false)}
                          className="text-[#5E5C70] hover:text-[#1E1438] dark:text-[#B9B0D8] dark:hover:text-white cursor-pointer"
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      </div>

                      <div className="space-y-1.5">
                        <label className="flex items-center gap-1 text-[11px] font-semibold text-[#5E5C70] dark:text-[#B9B0D8]">
                          <MapPin className="h-3 w-3 text-[#4A3894] dark:text-[#9678CE]" />
                          <span>{isAr ? 'منطقة الجلفة' : 'Djelfa Area'}</span>
                        </label>
                        <div className="flex w-full items-center gap-1.5">
                          <select
                            aria-label={isAr ? 'اختر حي في الجلفة' : 'Select Djelfa area'}
                            value={selectedAreaId}
                            onChange={(e) => {
                              setGpsCoords(null);
                              setSelectedAreaId(e.target.value);
                            }}
                            className="min-w-0 flex-1 rounded-xl border border-[#E5DDF5] bg-[#F9F5FD] px-2.5 py-1.5 text-xs font-medium text-[#1E1438] dark:border-[#22222C] dark:bg-[#15151C] dark:text-white"
                          >
                            <option value="all">{isAr ? 'الجلفة (كل الأحياء)' : 'Djelfa (All Areas)'}</option>
                            {areas.map((area) => (
                              <option key={area.id} value={area.id}>
                                {lang === 'ar' ? area.nameAr : area.name}
                              </option>
                            ))}
                            {gpsCoords && (
                              <option value="gps">{isAr ? 'موقع GPS' : 'GPS Location'}</option>
                            )}
                          </select>
                          <button
                            type="button"
                            onClick={handleUseGps}
                            aria-label={isAr ? 'استخدام موقعي الحالي' : 'Use current location'}
                            title={isAr ? 'استخدام موقعي الحالي' : 'Use current location'}
                            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-[#4A3894]/12 text-[#4A3894] transition hover:bg-[#4A3894]/20 dark:bg-[#9678CE]/18 dark:text-[#E5DDF5] cursor-pointer"
                          >
                            <MapPin className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <div className="mb-1 text-[11px] font-semibold text-[#5E5C70] dark:text-[#B9B0D8]">
                            {isAr ? 'اللغة' : 'Language'}
                          </div>
                          <select
                            aria-label={isAr ? 'اللغة' : 'Language'}
                            value={lang}
                            onChange={(e) => setLang(e.target.value as LanguageCode)}
                            className="w-full rounded-xl border border-[#E5DDF5] bg-[#F9F5FD] px-2.5 py-1.5 text-xs font-semibold text-[#1E1438] dark:border-[#22222C] dark:bg-[#15151C] dark:text-white"
                          >
                            <option value="en">English (EN)</option>
                            <option value="ar">العربية (AR)</option>
                          </select>
                        </div>
                        <div>
                          <div className="mb-1 text-[11px] font-semibold text-[#5E5C70] dark:text-[#B9B0D8]">
                            {isAr ? 'المظهر' : 'Theme'}
                          </div>
                          <button
                            type="button"
                            onClick={() => setDarkMode((d) => !d)}
                            className="flex w-full items-center justify-center gap-1.5 rounded-xl border border-[#E5DDF5] bg-[#F9F5FD] px-2.5 py-1.5 text-xs font-semibold text-[#1E1438] dark:border-[#22222C] dark:bg-[#15151C] dark:text-white cursor-pointer"
                          >
                            {darkMode ? (
                              <Sun className="h-3.5 w-3.5 text-[#E794C9]" />
                            ) : (
                              <Moon className="h-3.5 w-3.5 text-[#4A3894]" />
                            )}
                            <span>{darkMode ? (isAr ? 'فاتح' : 'Light') : (isAr ? 'داكن' : 'Dark')}</span>
                          </button>
                        </div>
                      </div>

                      <div className="flex items-center justify-between gap-2 border-t border-[#E5DDF5] pt-2.5 dark:border-[#22222C]">
                        <button
                          type="button"
                          onClick={() => {
                            setPreviewMode((m) => (m === 'desktop' ? 'phone' : 'desktop'));
                            setHeaderSettingsOpen(false);
                          }}
                          className="inline-flex items-center gap-1.5 rounded-xl border border-[#E5DDF5] px-2.5 py-1.5 text-[11px] font-semibold text-[#5E5C70] hover:text-[#1E1438] dark:border-[#22222C] dark:text-[#B9B0D8] dark:hover:text-white cursor-pointer"
                        >
                          {previewMode === 'desktop' ? (
                            <>
                              <Smartphone className="h-3.5 w-3.5" />
                              <span>{dict.phonePreview}</span>
                            </>
                          ) : (
                            <>
                              <Monitor className="h-3.5 w-3.5" />
                              <span>{dict.desktopPreview}</span>
                            </>
                          )}
                        </button>
                        <PWAInstallButton compact lang={lang} />
                      </div>
                    </div>
                  )}
                </div>

                {/* Icon-Only Account Button + Account Dropdown */}
                <div className="relative">
                  <button
                    type="button"
                    onClick={() => {
                      if (!user) {
                        openAuthDialog('login', 'customer', 'physical_store');
                      } else {
                        setHeaderAccountOpen((v) => !v);
                        setHeaderSettingsOpen(false);
                      }
                    }}
                    title={user ? user.fullName : dict.signIn}
                    aria-label={user ? user.fullName : dict.signIn}
                    className={`flex h-9 w-9 items-center justify-center rounded-full border transition cursor-pointer ${
                      user
                        ? 'border-[#4A3894] bg-[#4A3894] text-xs font-extrabold text-white hover:bg-[#3A2B78]'
                        : 'border-[#E5DDF5] bg-white text-[#4A3894] hover:border-[#4A3894] hover:bg-[#F9F5FD] dark:border-[#22222C] dark:bg-[#0E0E13] dark:text-[#9678CE] dark:hover:border-[#9678CE]'
                    }`}
                  >
                    {user ? user.fullName.slice(0, 1).toUpperCase() : <UserIcon className="h-4 w-4" />}
                  </button>

                  {user && headerAccountOpen && (
                    <div className="liquid-glass absolute end-0 top-full z-50 mt-2 w-60 rounded-2xl border border-[#E5DDF5] bg-white/95 p-2 shadow-xl text-xs dark:border-[#22222C] dark:bg-[#0E0E13]/95">
                      <div className="border-b border-[#E5DDF5] px-3 py-2 dark:border-[#22222C]">
                        <div className="font-bold text-[#1E1438] dark:text-white truncate">{user.fullName}</div>
                        <div className="text-[11px] text-[#5E5C70] dark:text-[#B9B0D8] truncate">{user.email}</div>
                      </div>
                      <div className="py-1 space-y-0.5">
                        {user.roles.includes('merchant') ? (
                          <>
                            <button
                              type="button"
                              onClick={() => {
                                setActiveView('dashboard');
                                setHeaderAccountOpen(false);
                              }}
                              className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-start font-semibold text-[#1E1438] hover:bg-[#F9F5FD] dark:text-white dark:hover:bg-[#15151C] cursor-pointer"
                            >
                              <BarChart3 className="h-3.5 w-3.5 text-[#4A3894] dark:text-[#9678CE]" />
                              <span>{isAr ? 'لوحة التحليلات' : 'Store Dashboard'}</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setActiveView('merchant');
                                setHeaderAccountOpen(false);
                              }}
                              className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-start font-semibold text-[#1E1438] hover:bg-[#F9F5FD] dark:text-white dark:hover:bg-[#15151C] cursor-pointer"
                            >
                              <StoreIcon className="h-3.5 w-3.5 text-[#4A3894] dark:text-[#9678CE]" />
                              <span>{dict.navMerchant}</span>
                            </button>
                          </>
                        ) : (
                          <button
                            type="button"
                            onClick={() => {
                              openSellerSignUp('online_page');
                              setHeaderAccountOpen(false);
                            }}
                            className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-start font-semibold text-[#4A3894] hover:bg-[#F9F5FD] dark:text-[#9678CE] dark:hover:bg-[#15151C] cursor-pointer"
                          >
                            <Briefcase className="h-3.5 w-3.5" />
                            <span>{isAr ? 'انضم وابدأ البيع' : 'Join & Start Selling'}</span>
                          </button>
                        )}
                        {user.roles.includes('driver') && (
                          <button
                            type="button"
                            onClick={() => {
                              setActiveView('driver');
                              setHeaderAccountOpen(false);
                            }}
                            className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-start font-semibold text-[#1E1438] hover:bg-[#F9F5FD] dark:text-white dark:hover:bg-[#15151C] cursor-pointer"
                          >
                            <Bike className="h-3.5 w-3.5 text-[#4A3894] dark:text-[#9678CE]" />
                            <span>{dict.navDriver}</span>
                          </button>
                        )}
                        {(user.roles.includes('moderator') || user.roles.includes('admin')) && (
                          <button
                            type="button"
                            onClick={() => {
                              setActiveView('moderator');
                              setHeaderAccountOpen(false);
                            }}
                            className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-start font-semibold text-[#1E1438] hover:bg-[#F9F5FD] dark:text-white dark:hover:bg-[#15151C] cursor-pointer"
                          >
                            <MessageCircle className="h-3.5 w-3.5 text-[#4A3894] dark:text-[#9678CE]" />
                            <span>{dict.navModerator}</span>
                          </button>
                        )}
                        {user.roles.includes('admin') && (
                          <button
                            type="button"
                            onClick={() => {
                              setActiveView('admin');
                              setHeaderAccountOpen(false);
                            }}
                            className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-start font-semibold text-[#1E1438] hover:bg-[#F9F5FD] dark:text-white dark:hover:bg-[#15151C] cursor-pointer"
                          >
                            <Shield className="h-3.5 w-3.5 text-[#4A3894] dark:text-[#9678CE]" />
                            <span>{dict.navAdmin}</span>
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => {
                            handleSignOut();
                            setHeaderAccountOpen(false);
                          }}
                          className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-start font-semibold text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/30 cursor-pointer"
                        >
                          <LogOut className="h-3.5 w-3.5" />
                          <span>{isAr ? 'تسجيل الخروج' : 'Sign Out'}</span>
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Row 2: Centered Single-Line Navigation Links Directly Under Search Bar */}
            <div className="border-t border-[#E5DDF5]/70 dark:border-[#22222C]/70">
              <nav
                aria-label="Primary navigation"
                className="mx-auto flex max-w-6xl items-center justify-center gap-5 lg:gap-7 px-4 sm:px-6 text-xs font-semibold"
              >
                <button
                  type="button"
                  onClick={handleExploreNavClick}
                  className={`relative inline-flex items-center gap-1.5 py-2.5 transition whitespace-nowrap shrink-0 cursor-pointer ${
                    activeView === 'marketplace'
                      ? 'text-[#4A3894] font-bold dark:text-white'
                      : 'text-[#5E5C70] hover:text-[#4A3894] dark:text-[#B9B0D8] dark:hover:text-white'
                  }`}
                >
                  <span>{dict.navExplore}</span>
                  {activeView === 'marketplace' && (
                    <span className="absolute inset-x-0 bottom-0 h-0.5 rounded-full bg-[#4A3894] dark:bg-[#9678CE]" />
                  )}
                </button>

                {/* Hover-Reveal Categories Menu (Click Opens Catalog Page) */}
                <div
                  className="relative"
                  onMouseEnter={handleSidebarEnter}
                  onMouseLeave={handleSidebarLeave}
                >
                  <button
                    type="button"
                    onClick={() => openCatalogPage('all', 'all')}
                    aria-expanded={sidebarHoverOpen}
                    className={`relative inline-flex items-center py-2.5 transition whitespace-nowrap shrink-0 cursor-pointer ${
                      activeView === 'catalog' || sidebarHoverOpen || selectedCategory !== 'all'
                        ? 'text-[#4A3894] font-bold dark:text-white'
                        : 'text-[#5E5C70] hover:text-[#4A3894] dark:text-[#B9B0D8] dark:hover:text-white'
                    }`}
                  >
                    <span>{dict.navCatalog}</span>
                    {(activeView === 'catalog' || sidebarHoverOpen || selectedCategory !== 'all') && (
                      <span className="absolute inset-x-0 bottom-0 h-0.5 rounded-full bg-[#4A3894] dark:bg-[#9678CE]" />
                    )}
                  </button>

                  <AnimatePresence>
                    {sidebarHoverOpen && (
                      <motion.aside
                        aria-label={isAr ? 'قائمة الفئات' : 'Categories menu'}
                        initial={{ opacity: 0, y: 6, scale: 0.98 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: 4, scale: 0.98 }}
                        transition={{ duration: 0.15, ease: 'easeOut' }}
                        onMouseEnter={handleSidebarEnter}
                        onMouseLeave={handleSidebarLeave}
                        className="absolute start-1/2 ltr:-translate-x-1/2 rtl:translate-x-1/2 top-full z-50 mt-2 w-[430px] max-w-[92vw] overflow-hidden rounded-3xl border border-[#E5DDF5] bg-white shadow-[0_24px_60px_-12px_rgba(29,21,56,0.28)] dark:border-[#22222C] dark:bg-[#0E0E13] dark:shadow-[0_24px_60px_-12px_rgba(0,0,0,0.85)]"
                      >
                        <div className="flex items-center justify-between bg-[#4A3894] px-4 py-3 text-white">
                          <span className="inline-flex items-center gap-2 font-display text-xs font-extrabold uppercase tracking-wide">
                            <Menu className="h-3.5 w-3.5 text-[#E794C9]" />
                            <span>{isAr ? 'تصفح الفئات والقطع' : 'Browse Categories & Parts'}</span>
                          </span>
                          <button
                            type="button"
                            onClick={() => openCatalogPage('all', 'all')}
                            className="text-[11px] font-bold text-[#FBEFFB] hover:underline cursor-pointer"
                          >
                            {isAr ? 'إعادة تعيين' : 'Reset all'}
                          </button>
                        </div>

                        <div className="divide-y divide-[#F1EAF9] py-1 dark:divide-[#22222C]">
                          {(categories.length > 0 ? categories : CANONICAL_CATEGORIES).map((cat) => {
                            const IconMap: Record<string, React.ComponentType<{ className?: string }>> = {
                              cpu: Cpu,
                              smartphone: Smartphone,
                              gamepad: Gamepad2,
                              'hard-drive': HardDrive,
                              monitor: Monitor,
                              zap: Zap,
                              shield: Shield,
                            };
                            const canonicalId = normalizeCategoryId(cat.id);
                            const CatIcon = IconMap[cat.iconKey] || LayoutGrid;
                            const isSelected = selectedCategory === cat.id;
                            const subParts = CATEGORY_SUBPARTS[canonicalId] || [];
                            return (
                              <div key={cat.id} className="px-4 py-2.5">
                                <button
                                  type="button"
                                  onClick={() => openCatalogPage(cat.id, 'all')}
                                  className={`flex w-full items-center justify-between gap-3 rounded-xl px-2 py-1.5 text-start text-xs font-bold transition cursor-pointer ${
                                    isSelected && selectedSubPart === 'all'
                                      ? 'bg-[#4A3894]/10 text-[#4A3894] dark:bg-[#9678CE]/15 dark:text-[#E5DDF5]'
                                      : 'text-[#1E1438] hover:bg-[#F9F5FD] dark:text-white dark:hover:bg-[#15151C]'
                                  }`}
                                >
                                  <span className="flex items-center gap-2.5 min-w-0">
                                    <CatIcon className="h-4 w-4 shrink-0 text-[#4A3894] dark:text-[#9678CE]" />
                                    <span className="truncate">
                                      {lang === 'ar' ? cat.nameAr : cat.name}
                                    </span>
                                  </span>
                                  <ChevronRight className="h-3.5 w-3.5 shrink-0 text-[#9678CE] rtl:rotate-180" />
                                </button>

                                {subParts.length > 0 && (
                                  <div className="mt-1.5 flex flex-wrap gap-1.5 ps-6">
                                    {subParts.map((sp) => {
                                      const spActive = isSelected && selectedSubPart === sp.id;
                                      const spLabel = lang === 'ar' ? sp.labelAr : sp.label;
                                      return (
                                        <button
                                          key={sp.id}
                                          type="button"
                                          onClick={() => openCatalogPage(cat.id, sp.id)}
                                          className={`rounded-full px-2.5 py-1 text-[11px] font-semibold transition cursor-pointer ${
                                            spActive
                                              ? 'bg-[#4A3894] text-white'
                                              : 'bg-[#F9F5FD] text-[#5E5C70] hover:bg-[#4A3894]/12 hover:text-[#4A3894] dark:bg-[#15151C] dark:text-[#B9B0D8]'
                                          }`}
                                        >
                                          {spLabel}
                                        </button>
                                      );
                                    })}
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                    </motion.aside>
                    )}
                  </AnimatePresence>
                </div>

                <button
                  type="button"
                  onClick={() => setActiveView('orders')}
                  className={`relative inline-flex items-center gap-1.5 py-2.5 transition whitespace-nowrap shrink-0 cursor-pointer ${
                    activeView === 'orders'
                      ? 'text-[#4A3894] font-bold dark:text-white'
                      : 'text-[#5E5C70] hover:text-[#4A3894] dark:text-[#B9B0D8] dark:hover:text-white'
                  }`}
                >
                  <span>{dict.navOrders}</span>
                  {activeView === 'orders' && (
                    <span className="absolute inset-x-0 bottom-0 h-0.5 rounded-full bg-[#4A3894] dark:bg-[#9678CE]" />
                  )}
                </button>

                {user?.roles.includes('merchant') && (
                  <>
                    <button
                      type="button"
                      onClick={() => setActiveView('dashboard')}
                      className="hidden lg:inline-flex items-center gap-1.5 py-2.5 text-[#5E5C70] hover:text-[#4A3894] dark:text-[#B9B0D8] dark:hover:text-white whitespace-nowrap shrink-0 cursor-pointer"
                    >
                      <span>{isAr ? 'الإحصائيات' : 'Dashboard'}</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setActiveView('merchant')}
                      className={`relative hidden lg:inline-flex items-center gap-1.5 py-2.5 transition whitespace-nowrap shrink-0 cursor-pointer ${
                        activeView === 'merchant'
                          ? 'text-[#4A3894] font-bold dark:text-white'
                          : 'text-[#5E5C70] hover:text-[#4A3894] dark:text-[#B9B0D8] dark:hover:text-white'
                      }`}
                    >
                      <span>{dict.navMerchant}</span>
                      {activeView === 'merchant' && (
                        <span className="absolute inset-x-0 bottom-0 h-0.5 rounded-full bg-[#4A3894] dark:bg-[#9678CE]" />
                      )}
                    </button>
                  </>
                )}
                {user?.roles.includes('driver') && (
                  <button
                    type="button"
                    onClick={() => setActiveView('driver')}
                    className={`relative hidden lg:inline-flex items-center gap-1.5 py-2.5 transition whitespace-nowrap shrink-0 cursor-pointer ${
                      activeView === 'driver'
                        ? 'text-[#4A3894] font-bold dark:text-white'
                        : 'text-[#5E5C70] hover:text-[#4A3894] dark:text-[#B9B0D8] dark:hover:text-white'
                    }`}
                  >
                    <span>{dict.navDriver}</span>
                    {activeView === 'driver' && (
                      <span className="absolute inset-x-0 bottom-0 h-0.5 rounded-full bg-[#4A3894] dark:bg-[#9678CE]" />
                    )}
                  </button>
                )}
                {(user?.roles.includes('moderator') || user?.roles.includes('admin')) && (
                  <button
                    type="button"
                    onClick={() => setActiveView('moderator')}
                    className={`relative hidden lg:inline-flex items-center gap-1.5 py-2.5 transition whitespace-nowrap shrink-0 cursor-pointer ${
                      activeView === 'moderator'
                        ? 'text-[#4A3894] font-bold dark:text-white'
                        : 'text-[#5E5C70] hover:text-[#4A3894] dark:text-[#B9B0D8] dark:hover:text-white'
                    }`}
                  >
                    <span>{dict.navModerator}</span>
                    {activeView === 'moderator' && (
                      <span className="absolute inset-x-0 bottom-0 h-0.5 rounded-full bg-[#4A3894] dark:bg-[#9678CE]" />
                    )}
                  </button>
                )}
                {user?.roles.includes('admin') && (
                  <button
                    type="button"
                    onClick={() => setActiveView('admin')}
                    className={`relative hidden lg:inline-flex items-center gap-1.5 py-2.5 transition whitespace-nowrap shrink-0 cursor-pointer ${
                      activeView === 'admin'
                        ? 'text-[#4A3894] font-bold dark:text-white'
                        : 'text-[#5E5C70] hover:text-[#4A3894] dark:text-[#B9B0D8] dark:hover:text-white'
                    }`}
                  >
                    <span>{dict.navAdmin}</span>
                    {activeView === 'admin' && (
                      <span className="absolute inset-x-0 bottom-0 h-0.5 rounded-full bg-[#4A3894] dark:bg-[#9678CE]" />
                    )}
                  </button>
                )}
              </nav>
            </div>
          </header>
        )}

        {/* Main Workspace Body */}
        <div
          className={
            isPhoneLayout
              ? 'px-3.5 py-3.5 pb-20 sm:pb-4'
              : 'relative mx-auto max-w-6xl px-4 sm:px-6 pb-24 pt-6 md:pb-12'
          }
        >
          {gmpQuotaExceeded && (
            <div
              role="alert"
              className="mb-5 flex items-center justify-between gap-3 rounded-2xl border border-amber-300 bg-amber-50 px-4 py-3 text-xs text-amber-900 dark:border-amber-700/60 dark:bg-amber-950/40 dark:text-amber-200"
            >
              <div className="flex items-center gap-2.5">
                <AlertTriangle className="h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
                <span>
                  {isAr
                    ? 'تم الوصول إلى حد حصّة خرائط Google مؤقتاً. يمكنك الاستمرار في تصفح قائمة متاجر الجلفة وتحديد الأحياء يدوياً.'
                    : 'Google Maps quota is temporarily exceeded. You can still browse Djelfa storefronts and filter by area below.'}
                </span>
              </div>
              <button
                type="button"
                onClick={() => setGmpQuotaExceeded(false)}
                aria-label={isAr ? 'إغلاق التنبيه' : 'Dismiss'}
                className="rounded-full p-1 hover:bg-amber-200/50 dark:hover:bg-amber-900/40 cursor-pointer"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          )}

          {/* Active Workspace Content */}
          <main className="min-w-0 space-y-10">
            {activeView === 'orders' ? (
              <OrdersFavoritesView
                user={user}
                orders={recentOrders}
                favorites={favorites}
                stores={mergedStores}
                listings={listings}
                lang={lang}
                onRefreshOrders={() => loadOverview()}
                onOpenStore={(slug) => openSellerPage(slug)}
                onCompareProduct={(slug) => setCompareProductSlug(slug)}
                onOpenAuth={() => openAuthDialog('login', 'customer', 'physical_store')}
              />
            ) : activeView === 'merchant' ? (
              <MerchantDashboard
                user={user}
                lang={lang}
                notify={notify}
                onMarketplaceMutated={() => {
                  loadOverview();
                  loadSearchResults();
                }}
                onOpenStore={(slug) => openSellerPage(slug)}
                onOpenDashboard={() => setActiveView('dashboard')}
              />
            ) : activeView === 'driver' ? (
              <DriverDashboard user={user} lang={lang} notify={notify} />
            ) : activeView === 'admin' || activeView === 'moderator' ? (
              <AdminDashboard
                user={user}
                lang={lang}
                mode={activeView === 'moderator' ? 'moderator' : 'admin'}
                notify={notify}
                onMarketplaceMutated={() => {
                  loadOverview();
                  loadSearchResults();
                }}
              />
            ) : isPhoneLayout && activeView === 'marketplace' ? (
              <PhoneMarketplaceView
                lang={lang}
                searchQuery={searchQuery}
                onSearchChange={setSearchQuery}
                selectedCategory={selectedCategory}
                onSelectCategory={(catId) => {
                  setSelectedCategory(catId);
                  setSelectedSubPart('all');
                }}
                selectedSubPart={selectedSubPart}
                onSelectSubPart={setSelectedSubPart}
                sortBy={sortBy}
                onSortChange={setSortBy}
                inStockOnly={inStockOnly}
                onToggleInStock={() => setInStockOnly((v) => !v)}
                openOnly={openOnly}
                onToggleOpenOnly={() => setOpenOnly((v) => !v)}
                categories={categories}
                areas={areas}
                selectedAreaId={selectedAreaId}
                onSelectArea={(id) => {
                  setGpsCoords(null);
                  setSelectedAreaId(id);
                }}
                gpsCoords={gpsCoords}
                onUseGps={handleUseGps}
                activeCoords={activeCoords}
                stores={mergedStores}
                highestRatedStore={highestRatedStore}
                mostSellingListing={mostSellingListing}
                bestSellers={rankedBestSellers}
                listings={listings}
                loadingMarket={loadingMarket && !hasLoadedMarket}
                onOpenStore={(slug, focusRev) => openSellerPage(slug, !!focusRev)}
                onCompareProduct={(slug) => setCompareProductSlug(slug)}
                onAddToCart={(item) => addListingToCart(item)}
                onOpenPartnerRegister={openPartnerRegister}
                onNavigateView={(view) => setActiveView(view)}
              />
            ) : activeView === 'physical_stores' ? (
              /* ==========================================
                 DEDICATED PAGE 1: PHYSICAL STORE BUSINESSES
                 ========================================== */
              <div className="space-y-8">
                <section className="rounded-3xl bg-gradient-to-br from-[#3A2B78] via-[#4A3894] to-[#221B36] p-6 sm:p-9 text-white shadow-lg">
                  <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
                    <div className="space-y-2.5 max-w-2xl">
                      <div className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-[#FBEFFB]">
                        <StoreIcon className="h-3.5 w-3.5 text-[#E794C9]" />
                        <span>
                          {isAr ? 'المتاجر الفعلية · الجلفة' : 'Brick-and-Mortar Businesses · Djelfa'}
                        </span>
                      </div>
                      <h1 className="font-display text-3xl sm:text-4xl font-extrabold tracking-tight text-balance">
                        {isAr ? 'المتاجر الفعلية ومحلات التقنية المحلية' : 'Physical Businesses & Local Retail Shops'}
                      </h1>
                      <p className="text-sm leading-relaxed text-[#E5DDF5]">
                        {isAr
                          ? 'زر المتاجر الفعلية المعتمدة في الجلفة، وعاين قطع الحاسوب والهواتف مباشرة، واستلم طلبك في موعدك، أو انتقل إليها عبر خرائط Google.'
                          : 'Visit verified physical stores across Djelfa in person, inspect PC parts and smartphones at the counter, pick up orders on your schedule, or navigate via Google Maps.'}
                      </p>
                    </div>

                    <div className="flex flex-wrap items-center gap-2.5 shrink-0">
                      <button
                        type="button"
                        onClick={() => openPartnerRegister('physical_store')}
                        className="inline-flex items-center gap-2 rounded-full bg-white px-5 py-2.5 text-xs font-extrabold text-[#4A3894] transition hover:bg-[#F9F5FD] cursor-pointer"
                      >
                        <StoreIcon className="h-3.5 w-3.5" />
                        <span>{isAr ? 'تسجيل متجر فعلي' : 'Register Physical Business'}</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setActiveView('online_sellers')}
                        className="inline-flex items-center gap-1.5 rounded-full border border-white/25 bg-white/10 px-4 py-2.5 text-xs font-semibold text-white hover:bg-white/20 cursor-pointer"
                      >
                        <Globe className="h-3.5 w-3.5 text-[#E794C9]" />
                        <span>{isAr ? 'الانتقال لصفحات الأونلاين' : 'Switch to Online Pages'}</span>
                      </button>
                    </div>
                  </div>

                  <div className="mt-6 grid grid-cols-3 gap-4 border-t border-white/15 pt-5 text-xs">
                    <div>
                      <div className="text-[#E5DDF5]/80">{isAr ? 'المتاجر الفعلية' : 'Physical Stores'}</div>
                      <div className="font-display mt-1 text-xl font-bold tabular-nums text-white">
                        {physicalStores.length}
                      </div>
                    </div>
                    <div>
                      <div className="text-[#E5DDF5]/80">{isAr ? 'مفتوح الآن' : 'Open Right Now'}</div>
                      <div className="font-display mt-1 text-xl font-bold tabular-nums text-[#E794C9]">
                        {physicalStores.filter((s) => s.isOpen).length}
                      </div>
                    </div>
                    <div>
                      <div className="text-[#E5DDF5]/80">{isAr ? 'الاستلام والخرائط' : 'Pickup & Map Pins'}</div>
                      <div className="font-display mt-1 text-xl font-bold text-white">
                        {isAr ? 'موثّق' : 'Verified'}
                      </div>
                    </div>
                  </div>
                </section>

                {/* Filter & Map Toggle Bar */}
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <div className="relative w-64">
                      <Search className="pointer-events-none absolute start-3.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[#5E5C70]" />
                      <input
                        type="search"
                        value={channelSearch}
                        onChange={(e) => setChannelSearch(e.target.value)}
                        placeholder={isAr ? 'ابحث باسم المتجر أو الشارع...' : 'Search shop name or street...'}
                        className="w-full rounded-full border border-[#E5DDF5] bg-white py-2 ps-9 pe-4 text-xs focus:border-[#4A3894] focus:outline-none dark:border-[#22222C] dark:bg-[#0E0E13]"
                      />
                    </div>
                    <select
                      aria-label={isAr ? 'تصفية المتاجر حسب الحي' : 'Filter physical stores by area'}
                      value={channelAreaFilter}
                      onChange={(e) => setChannelAreaFilter(e.target.value)}
                      className="rounded-full border border-[#E5DDF5] bg-white px-3.5 py-2 text-xs font-semibold dark:border-[#22222C] dark:bg-[#0E0E13]"
                    >
                      <option value="all">{isAr ? 'جميع أحياء الجلفة' : 'All Djelfa Areas'}</option>
                      {areas.map((a) => (
                        <option key={a.id} value={a.name}>
                          {getAreaDisplayName(a.name, lang)}
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      onClick={() => setChannelOpenOnly((v) => !v)}
                      className={`rounded-full border px-3.5 py-2 text-xs font-semibold cursor-pointer ${
                        channelOpenOnly
                          ? 'border-[#4A3894] bg-[#4A3894] text-white'
                          : 'border-[#E5DDF5] bg-white text-[#5E5C70] dark:border-[#22222C] dark:bg-[#0E0E13] dark:text-[#B9B0D8]'
                      }`}
                    >
                      {dict.openNow}
                    </button>
                  </div>

                  <div className="inline-flex rounded-full border border-[#E5DDF5] bg-white p-1 dark:border-[#22222C] dark:bg-[#0E0E13]">
                    <button
                      type="button"
                      onClick={() => setShopsDisplay('list')}
                      className={`inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs font-semibold cursor-pointer ${
                        shopsDisplay === 'list'
                          ? 'bg-[#4A3894] text-white'
                          : 'text-[#5E5C70] dark:text-[#B9B0D8]'
                      }`}
                    >
                      <List className="h-3.5 w-3.5" />
                      <span>{dict.listView}</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setShopsDisplay('map')}
                      className={`inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs font-semibold cursor-pointer ${
                        shopsDisplay === 'map'
                          ? 'bg-[#4A3894] text-white'
                          : 'text-[#5E5C70] dark:text-[#B9B0D8]'
                      }`}
                    >
                      <MapPin className="h-3.5 w-3.5" />
                      <span>{dict.mapView}</span>
                    </button>
                  </div>
                </div>

                {shopsDisplay === 'map' ? (
                  <ElOuedMap
                    stores={filteredPhysicalStores}
                    areas={areas}
                    selectedLocation={activeCoords}
                    onSelectStore={(slug) => openSellerPage(slug)}
                    lang={lang}
                    quotaExceeded={gmpQuotaExceeded}
                  />
                ) : filteredPhysicalStores.length === 0 ? (
                  <div className="rounded-3xl border border-[#E5DDF5] bg-white p-10 text-center dark:border-[#22222C] dark:bg-[#0E0E13]">
                    <p className="font-display text-lg font-bold">
                      {isAr ? 'لا توجد متاجر فعلية مطابقة لهذا الفلتر' : 'No physical shops match this filter'}
                    </p>
                    <button
                      type="button"
                      onClick={() => {
                        setChannelSearch('');
                        setChannelAreaFilter('all');
                        setChannelOpenOnly(false);
                      }}
                      className="mt-3 rounded-full bg-[#4A3894] px-4 py-2 text-xs font-bold text-white cursor-pointer"
                    >
                      {isAr ? 'عرض جميع المتاجر الفعلية' : 'Show all physical stores'}
                    </button>
                  </div>
                ) : (
                  <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    {filteredPhysicalStores.map((store) => {
                      const isFav = favorites.some((f) => f.type === 'store' && f.targetId === store.id);
                      const mapsUrl =
                        store.googleMapsUrl && store.googleMapsUrl.startsWith('https://')
                          ? store.googleMapsUrl
                          : `https://www.google.com/maps/search/?api=1&query=${store.lat},${store.lng}`;
                      return (
                        <div
                          key={store.id}
                          className="overflow-hidden rounded-3xl border border-[#E5DDF5] bg-white transition hover:border-[#4A3894] dark:border-[#22222C] dark:bg-[#0E0E13]"
                        >
                          <div className="marketly-awning" />
                          <div className="p-5 space-y-3">
                            <div className="flex items-start justify-between gap-2">
                              <div className="flex items-start gap-3 min-w-0">
                                <div className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-[#E5DDF5] bg-[#4A3894] text-xs font-extrabold text-white dark:border-[#22222C]">
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
                                  <div className="flex flex-wrap items-center gap-1.5 text-[11px] font-medium text-[#5E5C70] dark:text-[#B9B0D8]">
                                    <span className="font-bold text-[#4A3894] dark:text-[#9678CE]">
                                      {isAr ? 'متجر فعلي' : 'Physical Store'}
                                    </span>
                                    <span>·</span>
                                    <span>{getAreaDisplayName(store.area, lang)}</span>
                                    <span>·</span>
                                    <span className={store.isOpen ? 'text-emerald-600 font-semibold' : 'text-rose-600 font-semibold'}>
                                      {store.isOpen ? dict.openStatus : dict.closedStatus}
                                    </span>
                                  </div>
                                  <h3 className="font-display mt-0.5 truncate text-lg font-bold">{store.name}</h3>
                                </div>
                              </div>
                              <button
                                type="button"
                                onClick={() => handleToggleFavorite('store', store.id)}
                                aria-label={`Favorite ${store.name}`}
                                className="shrink-0 rounded-full p-2 text-[#5E5C70] hover:bg-[#F9F5FD] dark:hover:bg-[#15151C] cursor-pointer"
                              >
                                <Heart className={`h-4 w-4 ${isFav ? 'fill-[#4A3894] text-[#4A3894] dark:fill-[#E794C9] dark:text-[#E794C9]' : ''}`} />
                              </button>
                            </div>

                            <p className="line-clamp-2 text-xs leading-relaxed text-[#5E5C70] dark:text-[#B9B0D8]">
                              {store.description}
                            </p>

                            <div className="rounded-2xl bg-[#F9F5FD] p-3 text-[11px] space-y-1 dark:bg-[#15151C]">
                              <div className="flex items-center gap-1.5 font-semibold text-[#1E1438] dark:text-white">
                                <MapPin className="h-3.5 w-3.5 shrink-0 text-[#4A3894] dark:text-[#9678CE]" />
                                <span className="truncate">{store.address}</span>
                              </div>
                              <div className="flex items-center justify-between text-[#5E5C70] dark:text-[#B9B0D8]">
                                <span>{isAr ? 'الأوقات:' : 'Hours:'} {store.openingHours}</span>
                                <a
                                  href={mapsUrl}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="inline-flex items-center gap-1 font-bold text-[#4A3894] hover:underline dark:text-[#9678CE]"
                                >
                                  <Navigation className="h-3 w-3" />
                                  <span>{isAr ? 'خرائط Google' : 'Maps'}</span>
                                </a>
                              </div>
                            </div>

                            <div className="flex items-center justify-between gap-2 border-t border-[#E5DDF5] pt-3 dark:border-[#22222C]">
                              <div className="flex items-center gap-2 text-xs font-semibold">
                                <span className="inline-flex items-center gap-1">
                                  <Star className="h-3.5 w-3.5 fill-amber-400 text-amber-400" />
                                  <span>{store.rating}</span>
                                  <span className="text-[#5E5C70] dark:text-[#B9B0D8]">({store.reviewCount})</span>
                                </span>
                                <span className="text-[#5E5C70] dark:text-[#B9B0D8]">
                                  · {store.productCount || 0} {isAr ? 'منتج' : 'items'}
                                </span>
                              </div>
                              <button
                                type="button"
                                onClick={() => openSellerPage(store.slug)}
                                className="inline-flex items-center gap-1.5 rounded-full bg-[#4A3894] px-3.5 py-1.5 text-xs font-semibold text-white transition hover:bg-[#3A2B78] cursor-pointer"
                              >
                                <span>{dict.viewStore}</span>
                                <ArrowUpRight className="h-3.5 w-3.5 rtl:-scale-x-100" />
                              </button>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            ) : activeView === 'online_sellers' ? (
              /* ==========================================
                 DEDICATED PAGE 2: ONLINE-ONLY SELLER PAGES (IG / FB)
                 ========================================== */
              <div className="space-y-8">
                <section className="rounded-3xl bg-gradient-to-br from-[#4A3894] via-[#7A5AF5] to-[#221B36] p-6 sm:p-9 text-white shadow-lg">
                  <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
                    <div className="space-y-2.5 max-w-2xl">
                      <div className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-[#FBEFFB]">
                        <Globe className="h-3.5 w-3.5 text-[#E794C9]" />
                        <span>
                          {isAr
                            ? 'بائعو إنستغرام وفيسبوك وواتساب · الجلفة'
                            : 'Instagram, Facebook & WhatsApp Sellers · Djelfa'}
                        </span>
                      </div>
                      <h1 className="font-display text-3xl sm:text-4xl font-extrabold tracking-tight text-balance">
                        {isAr ? 'صفحات البيع عبر الإنترنت' : 'Online-Only Seller Pages'}
                      </h1>
                      <p className="text-sm leading-relaxed text-[#E5DDF5]">
                        {isAr
                          ? 'تصفح واجهات إنستغرام وفيسبوك المعتمدة في الجلفة، قارن الأسعار بالدينار الجزائري وتحقق من التوفر مع الدفع عند الاستلام.'
                          : 'Shop curated Djelfa Instagram & Facebook storefronts operating exclusively online—compare DZD prices, check live stock, and get cash-on-delivery across town without needing a physical shopfront.'}
                      </p>
                    </div>

                    <div className="flex flex-wrap items-center gap-2.5 shrink-0">
                      <button
                        type="button"
                        onClick={() => openPartnerRegister('online_page')}
                        className="inline-flex items-center gap-2 rounded-full bg-white px-5 py-2.5 text-xs font-extrabold text-[#4A3894] transition hover:bg-[#F9F5FD] cursor-pointer"
                      >
                        <Globe className="h-3.5 w-3.5" />
                        <span>{isAr ? 'إنشاء حساب بائع أونلاين' : 'Create Online Seller Account'}</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setActiveView('physical_stores')}
                        className="inline-flex items-center gap-1.5 rounded-full border border-white/25 bg-white/10 px-4 py-2.5 text-xs font-semibold text-white hover:bg-white/20 cursor-pointer"
                      >
                        <StoreIcon className="h-3.5 w-3.5 text-[#E794C9]" />
                        <span>{isAr ? 'عرض المتاجر الفعلية' : 'View Physical Stores'}</span>
                      </button>
                    </div>
                  </div>

                  <div className="mt-6 grid grid-cols-3 gap-4 border-t border-white/15 pt-5 text-xs">
                    <div>
                      <div className="text-[#E5DDF5]/80">{isAr ? 'صفحات موثقة' : 'Verified Online Pages'}</div>
                      <div className="font-display mt-1 text-xl font-bold tabular-nums text-white">
                        {onlineStores.length}
                      </div>
                    </div>
                    <div>
                      <div className="text-[#E5DDF5]/80">{isAr ? 'طريقة الدفع' : 'Payment Method'}</div>
                      <div className="font-display mt-1 text-xl font-bold text-[#FBEFFB]">
                        {dict.cashOnDelivery}
                      </div>
                    </div>
                    <div>
                      <div className="text-[#E5DDF5]/80">{isAr ? 'القنوات المرتبطة' : 'Channels Connected'}</div>
                      <div className="font-display mt-1 text-xl font-bold text-white">
                        IG · FB · WA
                      </div>
                    </div>
                  </div>
                </section>

                {/* Filter Bar */}
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <div className="relative w-64">
                      <Search className="pointer-events-none absolute start-3.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[#5E5C70]" />
                      <input
                        type="search"
                        value={channelSearch}
                        onChange={(e) => setChannelSearch(e.target.value)}
                        placeholder={isAr ? 'ابحث عن صفحة أونلاين أو منتج...' : 'Search online page or item...'}
                        className="w-full rounded-full border border-[#E5DDF5] bg-white py-2 ps-9 pe-4 text-xs focus:border-[#4A3894] focus:outline-none dark:border-[#22222C] dark:bg-[#0E0E13]"
                      />
                    </div>
                    <select
                      aria-label={isAr ? 'تصفية حسب منطقة التوصيل' : 'Filter delivery zone'}
                      value={channelAreaFilter}
                      onChange={(e) => setChannelAreaFilter(e.target.value)}
                      className="rounded-full border border-[#E5DDF5] bg-white px-3.5 py-2 text-xs font-semibold dark:border-[#22222C] dark:bg-[#0E0E13]"
                    >
                      <option value="all">{isAr ? 'يوصل لكل أحياء الجلفة' : 'Delivers to All Areas'}</option>
                      {areas.map((a) => (
                        <option key={a.id} value={a.name}>
                          {getAreaDisplayName(a.name, lang)}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="flex flex-wrap items-center gap-1.5">
                    {(
                      [
                        { id: 'all', label: isAr ? 'كل المنصات' : 'All Platforms' },
                        { id: 'instagram', label: 'Instagram' },
                        { id: 'facebook', label: 'Facebook' },
                      ] as const
                    ).map((plat) => (
                      <button
                        key={plat.id}
                        type="button"
                        onClick={() => setOnlinePlatformFilter(plat.id)}
                        className={`rounded-full border px-3.5 py-1.5 text-xs font-semibold transition cursor-pointer ${
                          onlinePlatformFilter === plat.id
                            ? 'border-[#4A3894] bg-[#4A3894] text-white'
                            : 'border-[#E5DDF5] bg-white text-[#5E5C70] dark:border-[#22222C] dark:bg-[#0E0E13] dark:text-[#B9B0D8]'
                        }`}
                      >
                        {plat.label}
                      </button>
                    ))}
                  </div>
                </div>

                {filteredOnlineStores.length === 0 ? (
                  <div className="rounded-3xl border border-[#E5DDF5] bg-white p-10 text-center dark:border-[#22222C] dark:bg-[#0E0E13] space-y-3">
                    <p className="font-display text-lg font-bold">
                      {isAr ? 'لا توجد صفحات بائعين مطابقة' : 'No online seller pages match this filter'}
                    </p>
                    <div className="flex justify-center gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          setChannelSearch('');
                          setChannelAreaFilter('all');
                          setOnlinePlatformFilter('all');
                        }}
                        className="rounded-full bg-[#4A3894] px-4 py-2 text-xs font-bold text-white cursor-pointer"
                      >
                        {isAr ? 'إعادة ضبط الفلاتر' : 'Reset filters'}
                      </button>
                      <button
                        type="button"
                        onClick={() => openPartnerRegister('online_page')}
                        className="rounded-full bg-[#9678CE] px-4 py-2 text-xs font-extrabold text-white cursor-pointer"
                      >
                        {isAr ? 'أنشئ صفحتك أونلاين' : 'Create Your Online Page'}
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    {filteredOnlineStores.map((store) => {
                      const isFav = favorites.some((f) => f.type === 'store' && f.targetId === store.id);
                      return (
                        <div
                          key={store.id}
                          className="flex flex-col justify-between overflow-hidden rounded-3xl border border-[#E5DDF5] bg-white p-5 transition hover:border-[#4A3894] dark:border-[#22222C] dark:bg-[#0E0E13]"
                        >
                          <div>
                            <div className="flex items-start justify-between gap-2">
                              <div className="flex items-start gap-3 min-w-0">
                                <div className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-[#E5DDF5] bg-[#9678CE] text-xs font-extrabold text-white dark:border-[#22222C]">
                                  {store.logoUrl ? (
                                    <img
                                      src={store.logoUrl}
                                      alt={store.name}
                                      referrerPolicy="no-referrer"
                                      className="h-full w-full object-cover"
                                    />
                                  ) : (
                                    <Globe className="h-5 w-5" />
                                  )}
                                </div>
                                <div className="min-w-0">
                                  <div className="flex flex-wrap items-center gap-1.5 text-[11px] font-medium text-[#5E5C70] dark:text-[#B9B0D8]">
                                    <span className="font-bold text-[#9678CE] dark:text-[#E794C9]">
                                      {isAr ? 'صفحة أونلاين' : 'Online Page'}
                                    </span>
                                    <span>·</span>
                                    <span>{getAreaDisplayName(store.area, lang)}</span>
                                    <span>·</span>
                                    <span className={store.isOpen ? 'text-emerald-600 font-semibold' : 'text-rose-600 font-semibold'}>
                                      {store.isOpen ? (isAr ? 'نشط' : 'Active') : dict.closedStatus}
                                    </span>
                                  </div>
                                  <h3 className="font-display mt-0.5 truncate text-lg font-bold">{store.name}</h3>
                                </div>
                              </div>
                              <button
                                type="button"
                                onClick={() => handleToggleFavorite('store', store.id)}
                                aria-label={`Favorite ${store.name}`}
                                className="shrink-0 rounded-full p-2 text-[#5E5C70] hover:bg-[#F9F5FD] dark:hover:bg-[#15151C] cursor-pointer"
                              >
                                <Heart className={`h-4 w-4 ${isFav ? 'fill-[#4A3894] text-[#4A3894] dark:fill-[#E794C9] dark:text-[#E794C9]' : ''}`} />
                              </button>
                            </div>

                            <p className="mt-2.5 line-clamp-2 text-xs leading-relaxed text-[#5E5C70] dark:text-[#B9B0D8]">
                              {store.description}
                            </p>

                            {/* Social Quick Links */}
                            <div className="mt-3 flex flex-wrap gap-1.5">
                              {store.instagramUrl && store.instagramUrl.startsWith('https://') && (
                                <a
                                  href={store.instagramUrl}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="inline-flex items-center gap-1 rounded-full border border-pink-500/30 bg-pink-500/8 px-2.5 py-1 text-[11px] font-semibold text-pink-700 hover:bg-pink-500/15 dark:text-pink-300"
                                >
                                  <Globe className="h-3 w-3" />
                                  <span>Instagram</span>
                                  <ExternalLink className="h-2.5 w-2.5" />
                                </a>
                              )}
                              {store.facebookUrl && store.facebookUrl.startsWith('https://') && (
                                <a
                                  href={store.facebookUrl}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="inline-flex items-center gap-1 rounded-full border border-blue-500/30 bg-blue-500/8 px-2.5 py-1 text-[11px] font-semibold text-blue-700 hover:bg-blue-500/15 dark:text-blue-300"
                                >
                                  <Globe className="h-3 w-3" />
                                  <span>Facebook</span>
                                  <ExternalLink className="h-2.5 w-2.5" />
                                </a>
                              )}
                              <a
                                href={`https://wa.me/${store.whatsapp}`}
                                target="_blank"
                                rel="noreferrer"
                                className="inline-flex items-center gap-1 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-1 text-[11px] font-semibold text-emerald-700 hover:bg-emerald-500/20 dark:text-emerald-300"
                              >
                                <MessageCircle className="h-3 w-3" />
                                <span>WhatsApp</span>
                              </a>
                            </div>

                            {store.deliveryZones && store.deliveryZones.length > 0 && (
                              <div className="mt-3 rounded-2xl bg-[#F9F5FD] p-2.5 text-[11px] text-[#5E5C70] dark:bg-[#15151C] dark:text-[#B9B0D8]">
                                <span className="font-semibold text-[#1E1438] dark:text-white">
                                  {isAr ? 'توصيل الدفع عند الاستلام' : 'COD Delivery'} {formatDzd(store.deliveryFee ?? 200, lang)}:
                                </span>{' '}
                                {store.deliveryZones.slice(0, 3).map((z) => getAreaDisplayName(z, lang)).join(', ')}
                                {store.deliveryZones.length > 3 ? ` +${store.deliveryZones.length - 3}` : ''}
                              </div>
                            )}
                          </div>

                          <div className="mt-4 flex items-center justify-between gap-2 border-t border-[#E5DDF5] pt-3 dark:border-[#22222C]">
                            <div className="flex items-center gap-2 text-xs font-semibold">
                              <span className="inline-flex items-center gap-1">
                                <Star className="h-3.5 w-3.5 fill-amber-400 text-amber-400" />
                                <span>{store.rating}</span>
                                <span className="text-[#5E5C70] dark:text-[#B9B0D8]">({store.reviewCount})</span>
                              </span>
                              <span className="text-[#5E5C70] dark:text-[#B9B0D8]">
                                · {store.productCount || 0} {isAr ? 'منتج' : 'items'}
                              </span>
                            </div>
                            <button
                              type="button"
                              onClick={() => openSellerPage(store.slug)}
                              className="inline-flex items-center gap-1.5 rounded-full bg-[#4A3894] px-3.5 py-1.5 text-xs font-extrabold text-white transition hover:bg-[#3A2B78] cursor-pointer"
                            >
                              <span>{isAr ? 'فتح الصفحة' : 'Open Page'}</span>
                              <ArrowUpRight className="h-3.5 w-3.5 rtl:-scale-x-100" />
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            ) : activeView === 'catalog' ? (
              /* ==========================================
                 DEDICATED SEARCH & CATALOG PAGE (#local-picks-grid)
                 ========================================== */
              <section id="local-picks-grid" aria-label="Catalog search results" className="space-y-5">
                <div className="flex flex-wrap items-center justify-between gap-4">
                  <div className="flex flex-wrap items-center gap-4">
                    <button
                      type="button"
                      onClick={() => {
                        setActiveView('marketplace');
                        window.scrollTo({ top: 0, behavior: 'smooth' });
                      }}
                      aria-label={isAr ? 'العودة للرئيسية' : 'Back to Home'}
                      title={isAr ? 'العودة للرئيسية' : 'Back to Home'}
                      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-[#E5DDF5] bg-white text-[#1E1438] shadow-xs transition hover:border-[#4A3894] hover:text-[#4A3894] dark:border-[#22222C] dark:bg-[#0E0E13] dark:text-white cursor-pointer"
                    >
                      <ChevronLeft className="h-4 w-4 rtl:rotate-180" />
                    </button>

                    <div>
                      <div className="flex items-center gap-2.5">
                        <h1 className="font-display text-2xl font-extrabold tracking-tight text-[#1E1438] dark:text-white">
                          {dict.topPicksTitle}
                        </h1>
                        <span className="text-xs font-semibold text-[#5E5C70] dark:text-[#B9B0D8] tabular-nums">
                          ({listings.length} {isAr ? 'عرض' : listings.length === 1 ? 'item' : 'items'})
                        </span>
                      </div>
                      <div className="mt-1.5 h-0.5 w-10 bg-[#4A3894] dark:bg-[#9678CE]" />
                    </div>
                  </div>

                  {/* On-Page Search Refinement */}
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      setCatalogPage(0);
                    }}
                    className="flex items-center gap-2 rounded-full border border-[#E5DDF5] bg-white px-3.5 py-1.5 shadow-xs focus-within:border-[#4A3894] dark:border-[#22222C] dark:bg-[#0E0E13]"
                  >
                    <Search className="h-3.5 w-3.5 shrink-0 text-[#4A3894] dark:text-[#9678CE]" />
                    <input
                      type="search"
                      value={searchQuery}
                      onChange={(e) => {
                        setSearchQuery(e.target.value);
                        setCatalogPage(0);
                      }}
                      placeholder={isAr ? 'تصفية المنتجات والعلامات...' : 'Filter products, brands...'}
                      aria-label={isAr ? 'تصفية الكتالوج' : 'Filter catalog products'}
                      className="w-48 sm:w-60 bg-transparent text-xs text-[#1E1438] placeholder:text-[#5E5C70] focus:outline-none dark:text-white"
                    />
                    {searchQuery && (
                      <button
                        type="button"
                        onClick={() => {
                          setSearchQuery('');
                          setCatalogPage(0);
                        }}
                        aria-label={isAr ? 'مسح البحث' : 'Clear filter search'}
                        className="text-[#5E5C70] hover:text-[#1E1438] dark:text-[#B9B0D8] dark:hover:text-white cursor-pointer"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </form>
                </div>

                {(searchQuery.trim() || selectedCategory !== 'all' || selectedSubPart !== 'all' || inStockOnly || openOnly || maxDistanceKm) && (
                  <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-[#4A3894]/25 bg-[#F9F5FD] px-4 py-2 text-xs dark:border-[#22222C] dark:bg-[#0E0E13]">
                    <span className="font-semibold text-[#1E1438] dark:text-white">
                      {isAr ? 'عرض' : 'Showing'}{' '}
                      <strong className="tabular-nums">{listings.length}</strong>{' '}
                      {isAr ? 'منتج مطابق' : listings.length === 1 ? 'matching product' : 'matching products'}
                      {selectedCategory !== 'all' && (
                        <>
                          {' '}
                          {isAr ? 'في' : 'in'}{' '}
                          <span className="text-[#4A3894] dark:text-[#9678CE]">
                            {(() => {
                              const cat = categories.find((c) => c.id === selectedCategory);
                              return cat ? (lang === 'ar' ? cat.nameAr : cat.name) : selectedCategory;
                            })()}
                          </span>
                        </>
                      )}
                      {selectedSubPart !== 'all' && (
                        <>
                          {' '}
                          · <span className="font-bold text-[#4A3894] dark:text-[#E794C9]">{getSubPartLabel(selectedSubPart, lang)}</span>
                        </>
                      )}
                      {searchQuery.trim() ? (
                        <>
                          {' '}
                          {isAr ? 'لـ' : 'for'} &ldquo;<span className="text-[#4A3894] dark:text-[#9678CE]">{searchQuery.trim()}</span>&rdquo;
                        </>
                      ) : null}
                    </span>
                    <button
                      type="button"
                      onClick={handleClearAllFilters}
                      className="font-bold text-[#4A3894] hover:underline dark:text-[#9678CE] cursor-pointer"
                    >
                      {isAr ? 'مسح جميع الفلاتر' : 'Clear all filters'}
                    </button>
                  </div>
                )}

                {/* Category, Stock, Open, Distance & Sort Controls */}
                <div className="space-y-2.5">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedCategory('all');
                          setSelectedSubPart('all');
                          setCatalogPage(0);
                        }}
                        className={`rounded-full px-3.5 py-1.5 text-xs font-semibold transition cursor-pointer ${
                          selectedCategory === 'all'
                            ? 'bg-[#4A3894] text-white'
                            : 'bg-white text-[#5E5C70] border border-[#E5DDF5] dark:bg-[#0E0E13] dark:border-[#22222C] dark:text-[#B9B0D8]'
                        }`}
                      >
                        {dict.allCategories}
                      </button>
                      {(categories.length > 0 ? categories : CANONICAL_CATEGORIES).map((cat) => (
                        <button
                          key={cat.id}
                          type="button"
                          onClick={() => {
                            setSelectedCategory(cat.id);
                            setSelectedSubPart('all');
                            setCatalogPage(0);
                          }}
                          className={`rounded-full px-3.5 py-1.5 text-xs font-semibold transition cursor-pointer ${
                            selectedCategory === cat.id
                              ? 'bg-[#4A3894] text-white'
                              : 'bg-white text-[#5E5C70] border border-[#E5DDF5] dark:bg-[#0E0E13] dark:border-[#22222C] dark:text-[#B9B0D8]'
                          }`}
                        >
                          {lang === 'ar' ? cat.nameAr : cat.name}
                        </button>
                      ))}
                    </div>

                    <div className="flex flex-wrap items-center gap-2 text-xs">
                      <button
                        type="button"
                        onClick={() => setInStockOnly((v) => !v)}
                        className={`rounded-full px-3 py-1.5 font-semibold border transition cursor-pointer ${
                          inStockOnly
                            ? 'border-[#4A3894] bg-[#4A3894] text-white'
                            : 'border-[#E5DDF5] bg-white text-[#5E5C70] dark:border-[#22222C] dark:bg-[#0E0E13] dark:text-[#B9B0D8]'
                        }`}
                      >
                        {dict.inStockOnly}
                      </button>
                      <button
                        type="button"
                        onClick={() => setOpenOnly((v) => !v)}
                        className={`rounded-full px-3 py-1.5 font-semibold border transition cursor-pointer ${
                          openOnly
                            ? 'border-[#4A3894] bg-[#4A3894] text-white'
                            : 'border-[#E5DDF5] bg-white text-[#5E5C70] dark:border-[#22222C] dark:bg-[#0E0E13] dark:text-[#B9B0D8]'
                        }`}
                      >
                        {dict.openNow}
                      </button>

                      {activeCoords && (
                        <select
                          aria-label={isAr ? 'نطاق المسافة' : 'Distance radius'}
                          value={maxDistanceKm}
                          onChange={(e) => setMaxDistanceKm(e.target.value)}
                          className="rounded-full border border-[#E5DDF5] bg-white px-3 py-1.5 text-xs font-semibold dark:border-[#22222C] dark:bg-[#0E0E13]"
                        >
                          <option value="">{isAr ? 'أي مسافة' : 'Any distance'}</option>
                          <option value="1">{isAr ? 'ضمن 1 كم' : 'Within 1 km'}</option>
                          <option value="5">{isAr ? 'ضمن 5 كم' : 'Within 5 km'}</option>
                          <option value="10">{isAr ? 'ضمن 10 كم' : 'Within 10 km'}</option>
                          <option value="20">{isAr ? 'ضمن 20 كم' : 'Within 20 km'}</option>
                        </select>
                      )}

                      <select
                        aria-label={isAr ? 'ترتيب المنتجات' : 'Sort products'}
                        value={sortBy}
                        onChange={(e) => setSortBy(e.target.value)}
                        className="rounded-full border border-[#E5DDF5] bg-white px-3 py-1.5 text-xs font-semibold dark:border-[#22222C] dark:bg-[#0E0E13]"
                      >
                        <option value="relevance">{dict.sortRelevance}</option>
                        <option value="lowest_price">{dict.sortLowestPrice}</option>
                        <option value="closest">{dict.sortClosest}</option>
                        <option value="highest_price">{dict.sortHighestPrice}</option>
                        <option value="rating">{dict.sortRating}</option>
                        <option value="popular">{dict.sortPopular}</option>
                      </select>
                    </div>
                  </div>

                  {/* Clickable Sub-Parts Row */}
                  {selectedCategory !== 'all' ? (
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="me-1 text-[11px] font-bold uppercase tracking-wider text-[#5E5C70] dark:text-[#B9B0D8]">
                        {isAr ? 'القطع:' : 'Parts:'}
                      </span>
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedSubPart('all');
                          setCatalogPage(0);
                        }}
                        className={`rounded-full px-3 py-1 text-[11px] font-semibold transition cursor-pointer ${
                          selectedSubPart === 'all'
                            ? 'bg-[#4A3894] font-bold text-white'
                            : 'border border-[#E5DDF5] bg-white text-[#5E5C70] hover:border-[#4A3894] dark:border-[#22222C] dark:bg-[#0E0E13] dark:text-[#B9B0D8]'
                        }`}
                      >
                        {isAr ? 'كل القطع' : 'All Parts'}
                      </button>
                      {(CATEGORY_SUBPARTS[normalizeCategoryId(selectedCategory)] || []).map((sp) => (
                        <button
                          key={sp.id}
                          type="button"
                          onClick={() => {
                            setSelectedSubPart(sp.id);
                            setCatalogPage(0);
                          }}
                          className={`rounded-full px-3 py-1 text-[11px] font-semibold transition cursor-pointer ${
                            selectedSubPart === sp.id
                              ? 'bg-[#4A3894] font-bold text-white'
                              : 'border border-[#E5DDF5] bg-white text-[#5E5C70] hover:border-[#4A3894] dark:border-[#22222C] dark:bg-[#0E0E13] dark:text-[#B9B0D8]'
                          }`}
                        >
                          {lang === 'ar' ? sp.labelAr : sp.label}
                        </button>
                      ))}
                    </div>
                  ) : (
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="me-1 text-[11px] font-bold uppercase tracking-wider text-[#5E5C70] dark:text-[#B9B0D8]">
                        {isAr ? 'وصول سريع:' : 'Quick Parts:'}
                      </span>
                      {[
                        { catId: 'cat-pc-parts', spId: 'gpu', label: isAr ? 'بطاقات رسومية' : 'GPUs' },
                        { catId: 'cat-pc-parts', spId: 'ssd-ram', label: 'SSD & RAM' },
                        { catId: 'cat-pc-parts', spId: 'cooling-cases', label: isAr ? 'تبريد وصناديق' : 'Cooling & Cases' },
                        { catId: 'cat-phones', spId: 'chargers-power', label: isAr ? 'شواحن وطاقة' : 'Chargers & Power' },
                        { catId: 'cat-phones', spId: 'cases-glass', label: isAr ? 'حافظات هواتف' : 'Phone Cases' },
                        { catId: 'cat-consoles', spId: 'consoles', label: isAr ? 'منصات ألعاب' : 'Consoles' },
                        { catId: 'cat-peripherals', spId: 'monitors', label: isAr ? 'شاشات' : 'Monitors' },
                      ].map((q) => (
                        <button
                          key={`${q.catId}-${q.spId}`}
                          type="button"
                          onClick={() => openCatalogPage(q.catId, q.spId)}
                          className="rounded-full border border-[#E5DDF5] bg-white px-2.5 py-1 text-[11px] font-semibold text-[#5E5C70] transition hover:border-[#4A3894] hover:text-[#4A3894] dark:border-[#22222C] dark:bg-[#0E0E13] dark:text-[#B9B0D8] cursor-pointer"
                        >
                          {q.label}
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                {/* 4-Column Product Grid */}
                {loadingMarket && !hasLoadedMarket ? (
                  <CatalogGridSkeleton count={8} />
                ) : pagedListings.length === 0 ? (
                  <div className="rounded-2xl border border-[#E5DDF5] bg-white p-10 text-center dark:border-[#22222C] dark:bg-[#0E0E13]">
                    <p className="font-display text-lg font-bold">
                      {isAr ? 'لا توجد منتجات مطابقة' : 'No matching products found'}
                    </p>
                    <p className="mt-1 text-sm text-[#5E5C70] dark:text-[#B9B0D8]">
                      {isAr
                        ? 'جرّب مسح الفلاتر أو البحث عن RTX 4060 أو iPhone 15 أو NVMe SSD.'
                        : 'Try clearing your filters or searching another keyword like RTX 4060, iPhone 15, or NVMe SSD.'}
                    </p>
                    <button
                      type="button"
                      onClick={handleClearAllFilters}
                      className="mt-4 inline-flex items-center gap-1.5 rounded-full bg-[#4A3894] px-4 py-2 text-xs font-bold text-white hover:bg-[#3A2B78] cursor-pointer"
                    >
                      <X className="h-3.5 w-3.5" />
                      <span>{isAr ? 'مسح الفلاتر' : 'Clear filters'}</span>
                    </button>
                  </div>
                ) : (
                  <LayoutGroup id="desktop-catalog-grid">
                    <div
                      className={`grid gap-4 sm:grid-cols-2 lg:grid-cols-4 transition-opacity duration-150 ${
                        loadingMarket ? 'opacity-75' : 'opacity-100'
                      }`}
                    >
                      <AnimatePresence mode="popLayout">
                        {pagedListings.map((item) => {
                          const disabled = item.availabilityStatus === 'out_of_stock' || !item.storeIsOpen;
                          return (
                            <motion.article
                              key={item.listingId}
                              layout
                              initial={{ opacity: 0, scale: 0.97 }}
                              animate={{ opacity: 1, scale: 1 }}
                              exit={{ opacity: 0, scale: 0.97 }}
                              transition={{
                                layout: { type: 'spring', stiffness: 360, damping: 32, mass: 0.85 },
                                opacity: { duration: 0.16, ease: 'easeOut' },
                                scale: { duration: 0.16, ease: 'easeOut' },
                              }}
                              whileHover={{ y: -2 }}
                              className="group flex flex-col justify-between rounded-2xl border border-[#E5DDF5] bg-white p-3.5 transition-shadow duration-150 hover:border-[#4A3894]/55 hover:shadow-md dark:border-[#22222C] dark:bg-[#0E0E13]"
                            >
                              <div>
                                <button
                                  type="button"
                                  onClick={() => setCompareProductSlug(item.productSlug)}
                                  className="relative flex h-40 w-full items-center justify-center rounded-xl bg-[#F9F5FD] dark:bg-[#15151C] overflow-hidden cursor-pointer"
                                >
                                  <ProductArtwork
                                    imageKey={item.imageKey}
                                    imageUrl={item.imageUrl}
                                    categoryId={item.categoryId}
                                    alt={item.productName}
                                    className="h-28 w-28 transition-transform duration-150 group-hover:scale-105"
                                  />
                                  {item.isLowestPrice && (
                                    <span className="absolute start-2.5 top-2.5 text-[10px] font-bold uppercase tracking-wide text-[#4A3894] dark:text-[#E794C9]">
                                      {dict.lowestPriceTag}
                                    </span>
                                  )}
                                </button>

                                <div className="mt-3 flex flex-wrap items-center gap-1.5 text-[11px] text-[#5E5C70] dark:text-[#B9B0D8]">
                                  <button
                                    type="button"
                                    onClick={() => openSellerPage(item.storeSlug)}
                                    className="font-semibold text-[#1E1438] hover:text-[#4A3894] dark:text-white dark:hover:text-[#9678CE] cursor-pointer"
                                  >
                                    {item.storeName}
                                  </button>
                                  {item.distanceKm !== null && (
                                    <>
                                      <span>·</span>
                                      <span className="tabular-nums">{item.distanceKm} km</span>
                                    </>
                                  )}
                                  <span>·</span>
                                  <span
                                    className={
                                      item.availabilityStatus === 'in_stock'
                                        ? 'font-semibold text-emerald-700 dark:text-emerald-400'
                                        : item.availabilityStatus === 'unconfirmed'
                                          ? 'font-semibold text-amber-700 dark:text-amber-400'
                                          : 'font-semibold text-rose-600 dark:text-rose-400'
                                    }
                                  >
                                    {item.availabilityStatus === 'in_stock'
                                      ? dict.inStock
                                      : item.availabilityStatus === 'unconfirmed'
                                        ? dict.unconfirmed
                                        : dict.outOfStock}
                                  </span>
                                </div>

                                <button
                                  type="button"
                                  onClick={() => setCompareProductSlug(item.productSlug)}
                                  className="mt-1 block text-start font-display text-sm font-bold text-[#1E1438] hover:text-[#4A3894] dark:text-white dark:hover:text-[#9678CE] cursor-pointer"
                                >
                                  {item.productName}
                                </button>
                                <div className="text-[11px] text-[#5E5C70] dark:text-[#B9B0D8]">
                                  {item.brand} · {dict.updated} {formatRelativeTime(item.availabilityUpdatedAt, lang)}
                                  {item.storeOfferCount > 1 && ` · ${item.storeOfferCount} ${isAr ? 'متاجر' : 'shops'}`}
                                </div>
                              </div>

                              <div className="mt-3.5 flex items-center justify-between gap-2">
                                <span className="font-display text-base font-extrabold text-[#1E1438] dark:text-white tabular-nums">
                                  {formatDzd(item.price, lang)}
                                </span>

                                <div className="flex items-center gap-1.5">
                                  {item.storeOfferCount > 1 && (
                                    <button
                                      type="button"
                                      onClick={() => setCompareProductSlug(item.productSlug)}
                                      className="rounded-full border border-[#E5DDF5] px-2.5 py-1 text-[11px] font-semibold text-[#5E5C70] hover:border-[#4A3894] hover:text-[#4A3894] dark:border-[#22222C] dark:text-[#B9B0D8] cursor-pointer"
                                    >
                                      {dict.compareStores}
                                    </button>
                                  )}
                                  <button
                                    type="button"
                                    disabled={disabled}
                                    onClick={() => addListingToCart(item)}
                                    aria-label={`Add ${item.productName} from ${item.storeName} to cart`}
                                    className="flex h-8 w-8 items-center justify-center rounded-full bg-[#4A3894] text-white transition hover:bg-[#3A2B78] disabled:cursor-not-allowed disabled:opacity-35 cursor-pointer"
                                  >
                                    <ArrowRight className="h-4 w-4 rtl:rotate-180" />
                                  </button>
                                </div>
                              </div>
                            </motion.article>
                          );
                        })}
                      </AnimatePresence>
                    </div>
                  </LayoutGroup>
                )}

                {maxPages > 1 && (
                  <div className="flex flex-wrap items-center justify-center gap-2 border-t border-[#E5DDF5] pt-6 dark:border-[#22222C]">
                    <button
                      type="button"
                      disabled={catalogPage === 0}
                      onClick={() => {
                        setCatalogPage((p) => Math.max(0, p - 1));
                        window.scrollTo({ top: 0, behavior: 'smooth' });
                      }}
                      className="inline-flex items-center gap-1 rounded-full border border-[#E5DDF5] bg-white px-3.5 py-1.5 text-xs font-semibold text-[#1E1438] disabled:opacity-35 dark:border-[#22222C] dark:bg-[#0E0E13] dark:text-white cursor-pointer"
                    >
                      <ChevronLeft className="h-3.5 w-3.5 rtl:rotate-180" />
                      <span>{dict.prevPage}</span>
                    </button>

                    <div className="flex items-center gap-1">
                      {Array.from({ length: maxPages }).map((_, idx) => (
                        <button
                          key={idx}
                          type="button"
                          onClick={() => {
                            setCatalogPage(idx);
                            window.scrollTo({ top: 0, behavior: 'smooth' });
                          }}
                          className={`flex h-8 w-8 items-center justify-center rounded-full text-xs font-bold tabular-nums transition cursor-pointer ${
                            catalogPage === idx
                              ? 'bg-[#4A3894] text-white shadow-xs'
                              : 'border border-[#E5DDF5] bg-white text-[#5E5C70] hover:border-[#4A3894] dark:border-[#22222C] dark:bg-[#0E0E13] dark:text-[#B9B0D8]'
                          }`}
                        >
                          {idx + 1}
                        </button>
                      ))}
                    </div>

                    <button
                      type="button"
                      disabled={catalogPage + 1 >= maxPages}
                      onClick={() => {
                        setCatalogPage((p) => Math.min(maxPages - 1, p + 1));
                        window.scrollTo({ top: 0, behavior: 'smooth' });
                      }}
                      className="inline-flex items-center gap-1 rounded-full bg-[#4A3894] px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-[#3A2B78] disabled:opacity-35 cursor-pointer"
                    >
                      <span>{dict.nextPage}</span>
                      <ChevronRight className="h-3.5 w-3.5 rtl:rotate-180" />
                    </button>

                    <span className="ms-2 text-xs font-medium text-[#5E5C70] dark:text-[#B9B0D8] tabular-nums">
                      {dict.pageLabel} {catalogPage + 1} {dict.ofLabel} {maxPages}
                    </span>
                  </div>
                )}
              </section>
            ) : (
              <>
                {/* ==========================================
                    (1) HERO SPLIT (lg:grid-cols-12)
                   ========================================== */}
                {activeView === 'marketplace' && (
                  <section className="relative grid items-center gap-8 pt-2 pb-2 lg:grid-cols-12">
                    <div className="space-y-5 lg:col-span-5">
                      <h1 className="font-display text-4xl font-extrabold leading-[1.02] tracking-tight text-balance sm:text-5xl lg:text-[52px]">
                        <span className="block text-[#1E1438] dark:text-white">{dict.heroLine1}</span>
                        <span className="block bg-gradient-to-r from-[#4A3894] via-[#7A5AF5] to-[#E794C9] bg-clip-text text-transparent">
                          {dict.heroLine2}
                        </span>
                        <span className="block text-[#1E1438] dark:text-white">{dict.heroLine3}</span>
                      </h1>

                      <p className="max-w-md text-sm leading-relaxed text-[#5E5C70] dark:text-[#B9B0D8] sm:text-base">
                        {dict.heroSubtitle}
                      </p>

                      <div className="flex flex-wrap items-center gap-3 pt-1">
                        <button
                          type="button"
                          onClick={() => openCatalogPage('all', 'all')}
                          className="inline-flex items-center gap-3 rounded-full bg-[#4A3894] ps-5 pe-2 py-2 text-xs font-extrabold uppercase tracking-wide text-white shadow-sm transition hover:bg-[#3A2B78] cursor-pointer"
                        >
                          <span>{dict.exploreCta}</span>
                          <span className="flex h-7 w-7 items-center justify-center rounded-full bg-white/15 text-white">
                            <ArrowRight className="h-3.5 w-3.5 rtl:rotate-180" />
                          </span>
                        </button>
                      </div>
                    </div>

                    {/* Right 7 cols: Soft Purple Halo + Dot-Matrix + Studio Showcase */}
                    <div className="relative flex flex-col items-center lg:col-span-7">
                      <div className="relative w-full">
                        <div
                          aria-hidden="true"
                          className="pointer-events-none absolute left-1/2 top-1/2 h-72 w-72 -translate-x-1/2 -translate-y-1/2 rounded-full bg-[radial-gradient(circle,rgba(74,56,148,0.20)_0%,rgba(150,120,206,0.09)_55%,transparent_75%)] sm:h-80 sm:w-80"
                        />
                        <div
                          aria-hidden="true"
                          className="pointer-events-none absolute end-2 top-3 h-40 w-44 rounded-2xl bg-[radial-gradient(#9678CE_1.5px,transparent_1.5px)] [background-size:14px_14px] opacity-35"
                        />

                        {!heroImgError ? (
                          <img
                            src={MARKETLY_MEDIA.heroShowcase}
                            alt={
                              isAr
                                ? 'عرض منتجات التقنية من ماركتلي في الجلفة'
                                : 'Marketly Djelfa tech hardware and mobile device showcase'
                            }
                            referrerPolicy="no-referrer"
                            onError={() => setHeroImgError(true)}
                            className="relative z-10 mx-auto w-full max-w-xl rounded-3xl object-contain mix-blend-multiply dark:mix-blend-normal"
                          />
                        ) : (
                          <div className="relative z-10 mx-auto flex h-72 w-full max-w-xl items-center justify-center rounded-3xl border border-[#E5DDF5] bg-white/90 dark:border-[#22222C] dark:bg-[#0E0E13]">
                            <Monitor className="h-16 w-16 text-[#4A3894] dark:text-[#9678CE]" />
                          </div>
                        )}
                      </div>
                    </div>
                  </section>
                )}

                {/* ==========================================
                    (2) PROMO BANNER & 4 CATEGORY SPOTLIGHT CARDS
                   ========================================== */}
                {activeView === 'marketplace' && (
                  <section className="space-y-6">
                    {/* Hero Promotional Banner */}
                    <div className="overflow-hidden rounded-3xl bg-gradient-to-r from-[#4A3894] via-[#6D4FC4] to-[#E794C9] p-6 text-white shadow-md sm:p-8">
                      <div className="grid items-center gap-6 lg:grid-cols-12">
                        <div className="space-y-3 lg:col-span-7">
                          <span className="inline-flex items-center rounded-full bg-white/15 px-3 py-1 text-[11px] font-bold uppercase tracking-wider text-white backdrop-blur-xs">
                            {dict.promoKicker}
                          </span>
                          <h2 className="font-display text-2xl font-extrabold leading-tight text-balance sm:text-3xl">
                            {dict.promoHeadline}
                          </h2>
                          <p className="max-w-xl text-xs leading-relaxed text-white/90 sm:text-sm">
                            {dict.promoBody}
                          </p>
                          <div className="pt-1">
                            <button
                              type="button"
                              onClick={() => openCatalogPage('all', 'all')}
                              className="inline-flex items-center gap-2 rounded-full bg-white px-5 py-2.5 text-xs font-extrabold text-[#4A3894] shadow-sm transition hover:bg-[#F9F5FD] cursor-pointer"
                            >
                              <span>{dict.promoCta}</span>
                              <ArrowRight className="h-3.5 w-3.5 rtl:rotate-180" />
                            </button>
                          </div>
                        </div>

                        <div className="lg:col-span-5">
                          <div className="overflow-hidden rounded-2xl border border-white/20 bg-white/10 shadow-inner">
                            {!promoImgError ? (
                              <img
                                src={MARKETLY_MEDIA.promoSpotlight}
                                alt={
                                  isAr
                                    ? 'عروض الحواسيب والهواتف في الجلفة'
                                    : 'Seasonal Djelfa tech hardware and mobile setup spotlight'
                                }
                                referrerPolicy="no-referrer"
                                onError={() => setPromoImgError(true)}
                                className="h-48 w-full object-cover sm:h-56"
                              />
                            ) : (
                              <div className="flex h-48 w-full items-center justify-center sm:h-56">
                                <Zap className="h-12 w-12 text-white/80" />
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* 4 Category Spotlight Cards */}
                    <div className="space-y-3">
                      <div className="flex items-center justify-between gap-2">
                        <h2 className="font-display text-xl font-extrabold tracking-tight text-[#1E1438] dark:text-white sm:text-2xl">
                          {dict.spotlightTitle}
                        </h2>
                        <button
                          type="button"
                          onClick={() => openCatalogPage('all', 'all')}
                          className="inline-flex items-center gap-1 text-xs font-bold text-[#4A3894] hover:underline dark:text-[#E794C9] cursor-pointer"
                        >
                          <span>{dict.exploreCta}</span>
                          <ArrowRight className="h-3.5 w-3.5 rtl:rotate-180" />
                        </button>
                      </div>

                      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                        {[
                          { id: 'cat-pc-parts', desc: dict.spotPcDesc },
                          { id: 'cat-phones', desc: dict.spotPhonesDesc },
                          { id: 'cat-consoles', desc: dict.spotConsolesDesc },
                          { id: 'cat-peripherals', desc: dict.spotPeripheralsDesc },
                        ].map((spot) => {
                          const cat = categories.find((c) => c.id === spot.id);
                          const catLabel = cat
                            ? isAr
                              ? cat.nameAr
                              : cat.name
                            : spot.id;
                          return (
                            <button
                              key={spot.id}
                              type="button"
                              onClick={() => openCatalogPage(spot.id, 'all')}
                              className="group flex flex-col overflow-hidden rounded-3xl border border-[#E5DDF5] bg-white text-start shadow-xs transition duration-200 hover:-translate-y-0.5 hover:border-[#4A3894] hover:shadow-md dark:border-[#22222C] dark:bg-[#0E0E13] dark:hover:border-[#9678CE] cursor-pointer"
                            >
                              <div className="h-40 w-full overflow-hidden bg-[#F9F5FD] dark:bg-[#15151C]">
                                <img
                                  src={MARKETLY_MEDIA.categories[spot.id]}
                                  alt={catLabel}
                                  referrerPolicy="no-referrer"
                                  className="h-full w-full object-cover transition duration-300 group-hover:scale-105"
                                />
                              </div>
                              <div className="flex flex-1 flex-col justify-between p-4">
                                <div>
                                  <h3 className="font-display text-base font-extrabold text-[#1E1438] dark:text-white">
                                    {catLabel}
                                  </h3>
                                  <p className="mt-1 line-clamp-2 text-xs text-[#5E5C70] dark:text-[#B9B0D8]">
                                    {spot.desc}
                                  </p>
                                </div>
                                <div className="mt-3 inline-flex items-center gap-1.5 text-xs font-bold text-[#4A3894] dark:text-[#E794C9]">
                                  <span>{dict.spotlightBrowse}</span>
                                  <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5 rtl:rotate-180 rtl:group-hover:-translate-x-0.5" />
                                </div>
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  </section>
                )}

                {/* ==========================================
                    (3) QUOTE & PARTNER ONBOARDING CTA
                   ========================================== */}
                {activeView === 'marketplace' && (
                  <section className="overflow-hidden rounded-3xl bg-gradient-to-r from-[#3A2B78] via-[#4A3894] to-[#15151C] p-6 text-white shadow-xl sm:p-10">
                    <div className="grid items-center gap-8 lg:grid-cols-12">
                      {/* Left 3 cols: Studio Portrait */}
                      <div className="flex items-center justify-center lg:col-span-3">
                        <div className="relative h-48 w-48 overflow-hidden rounded-2xl bg-[#0E0E13] sm:h-52 sm:w-52">
                          {!quoteImgError ? (
                            <img
                              src={MARKETLY_MEDIA.quotePortrait}
                              alt={
                                isAr
                                  ? 'شهادة متسوقة تقنية في الجلفة'
                                  : 'Djelfa tech enthusiast portrait'
                              }
                              referrerPolicy="no-referrer"
                              onError={() => setQuoteImgError(true)}
                              className="h-full w-full object-cover opacity-95"
                            />
                          ) : (
                            <div className="flex h-full w-full items-center justify-center bg-[#15151C]">
                              <Sparkles className="h-12 w-12 text-[#E794C9]" />
                            </div>
                          )}
                          <div
                            aria-hidden="true"
                            className="pointer-events-none absolute inset-0 bg-gradient-to-t from-[#0E0E13] via-transparent to-transparent opacity-60"
                          />
                        </div>
                      </div>

                      {/* Center 5 cols: Quote Mark + Testimonial + Directory Links */}
                      <div className="space-y-3.5 lg:col-span-5">
                        <div className="font-display text-5xl font-extrabold leading-none text-[#E794C9]">
                          &ldquo;
                        </div>
                        <p className="font-display text-xl font-medium leading-snug text-white sm:text-2xl">
                          {dict.quoteText}
                        </p>
                        <div className="text-xs text-[#E5DDF5]/80">
                          — <strong className="text-white">{dict.quoteAuthor}</strong> · {dict.quoteRole}
                        </div>
                        <div className="flex flex-wrap items-center gap-3 pt-1 text-xs">
                          <button
                            type="button"
                            onClick={() => {
                              setActiveView('physical_stores');
                              window.scrollTo({ top: 0, behavior: 'smooth' });
                            }}
                            className="inline-flex items-center gap-1.5 font-bold text-[#E794C9] hover:text-white hover:underline cursor-pointer"
                          >
                            <StoreIcon className="h-3.5 w-3.5" />
                            <span>{dict.navShops}</span>
                          </button>
                          <span aria-hidden="true" className="text-white/30">·</span>
                          <button
                            type="button"
                            onClick={() => {
                              setActiveView('online_sellers');
                              window.scrollTo({ top: 0, behavior: 'smooth' });
                            }}
                            className="inline-flex items-center gap-1.5 font-bold text-[#E794C9] hover:text-white hover:underline cursor-pointer"
                          >
                            <Globe className="h-3.5 w-3.5" />
                            <span>{dict.navPages}</span>
                          </button>
                        </div>
                      </div>

                      {/* Right 4 cols: Partner Onboarding Card */}
                      <div className="rounded-2xl border border-white/15 bg-[#0E0E13]/80 p-5 backdrop-blur-xs lg:col-span-4">
                        <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-[#E794C9]">
                          <Sparkles className="h-3.5 w-3.5" />
                          <span>
                            {isAr ? 'شبكة شركاء الجلفة' : 'Djelfa Partner Network'}
                          </span>
                        </div>
                        <h3 className="font-display mt-2 text-lg font-bold uppercase">
                          {dict.ctaBoxTitle}
                        </h3>
                        <p className="mt-1.5 text-xs leading-relaxed text-[#E5DDF5]/80">
                          {dict.ctaBoxDesc}
                        </p>
                        <div className="mt-4 flex flex-wrap gap-2">
                          <button
                            type="button"
                            onClick={() => openSellerSignUp('online_page')}
                            className="inline-flex items-center gap-2 rounded-full bg-white ps-4 pe-2 py-2 text-xs font-extrabold text-[#4A3894] transition hover:bg-[#F9F5FD] cursor-pointer"
                          >
                            <span>{dict.openMerchantBtn}</span>
                            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-[#4A3894] text-white">
                              <ArrowRight className="h-3 w-3 rtl:rotate-180" />
                            </span>
                          </button>
                          <button
                            type="button"
                            onClick={() => openPartnerRegister('driver')}
                            className="rounded-full border border-white/25 px-4 py-2 text-xs font-semibold text-white transition hover:bg-white/10 cursor-pointer"
                          >
                            {dict.openDriverBtn}
                          </button>
                        </div>
                      </div>
                    </div>
                  </section>
                )}
              </>
            )}
          </main>

          {(activeView === 'marketplace' ||
            activeView === 'catalog' ||
            activeView === 'physical_stores' ||
            activeView === 'online_sellers' ||
            activeView === 'orders') && (
            <MarketplaceFooter
              lang={lang}
              onChangeLang={setLang}
              onOpenSupportChat={(role) => openSupportChat(role || 'customer')}
              onNavigateView={(view) => {
                setActiveView(view);
                window.scrollTo({ top: 0, behavior: 'smooth' });
              }}
              compact={isPhoneLayout}
              variant={activeView === 'marketplace' ? 'full' : 'compact'}
              canExportZip={canExportZip}
              onDownloadZip={handleDownloadSiteZip}
            />
          )}
        </div>
        </div>

        {/* Mobile Bottom Navigation (Clean Customer Experience) */}
        <nav
          aria-label={isAr ? 'شريط التنقل السفلي' : 'Mobile navigation'}
          className={`z-30 border-t border-[#E5DDF5] bg-white/95 px-2 py-2 backdrop-blur-md dark:border-[#22222C] dark:bg-[#0E0E13]/95 ${
            previewMode === 'phone'
              ? 'shrink-0'
              : 'fixed bottom-0 start-0 end-0 md:hidden'
          }`}
        >
          <div className="mx-auto flex max-w-md items-center justify-around">
            <button
              type="button"
              onClick={handleExploreNavClick}
              className={`flex flex-col items-center gap-0.5 px-2.5 py-1 text-[11px] font-semibold cursor-pointer ${
                activeView === 'marketplace'
                  ? 'text-[#4A3894] dark:text-[#E794C9]'
                  : 'text-[#5E5C70] dark:text-[#B9B0D8]'
              }`}
            >
              <Compass className="h-4 w-4" />
              <span>{dict.navExplore}</span>
            </button>
            <button
              type="button"
              onClick={() => setCartOpen(true)}
              className="relative flex flex-col items-center gap-0.5 px-2.5 py-1 text-[11px] font-semibold text-[#5E5C70] dark:text-[#B9B0D8] cursor-pointer"
            >
              <ShoppingBag className="h-4 w-4" />
              <span>{dict.cartButton}</span>
              {cartCount > 0 && (
                <span className="absolute end-1 top-0 flex h-4 min-w-4 items-center justify-center rounded-full bg-[#4A3894] px-1 text-[10px] font-extrabold text-white tabular-nums">
                  {cartCount}
                </span>
              )}
            </button>
            <button
              type="button"
              onClick={() => setActiveView('orders')}
              className={`flex flex-col items-center gap-0.5 px-2.5 py-1 text-[11px] font-semibold cursor-pointer ${
                activeView === 'orders'
                  ? 'text-[#4A3894] dark:text-[#E794C9]'
                  : 'text-[#5E5C70] dark:text-[#B9B0D8]'
              }`}
            >
              <Package className="h-4 w-4" />
              <span>{dict.navOrders}</span>
            </button>
          </div>
        </nav>
      </div>
      )}

      {/* Single-Store Cart Switch Confirmation Modal */}
      {pendingSwitchListing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-xs">
          <div className="w-full max-w-sm rounded-3xl border border-[#E5DDF5] bg-white p-6 shadow-2xl dark:border-[#22222C] dark:bg-[#0E0E13]">
            <h3 className="font-display text-lg font-bold text-[#1E1438] dark:text-white">
              {isAr ? 'بدء سلة تسوق جديدة؟' : 'Start a new cart?'}
            </h3>
            <p className="mt-2 text-sm text-[#5E5C70] dark:text-[#B9B0D8]">
              {isAr ? (
                <>
                  تحتوي سلتك حالياً على منتجات من <strong>{cart[0]?.storeName}</strong>. تدعم الطلبات متجراً واحداً في كل مرة. هل تريد استبدالها بـ <strong>{pendingSwitchListing.storeName}</strong>؟
                </>
              ) : (
                <>
                  Your cart currently has items from <strong>{cart[0]?.storeName}</strong>. Orders support one shop at a time. Replace it with <strong>{pendingSwitchListing.storeName}</strong>?
                </>
              )}
            </p>
            <div className="mt-5 flex gap-2">
              <button
                type="button"
                onClick={() => {
                  const item = pendingSwitchListing;
                  setPendingSwitchListing(null);
                  addListingToCart(item, true);
                }}
                className="flex-1 rounded-full bg-[#4A3894] py-2.5 text-xs font-bold text-white transition hover:bg-[#3A2B78] cursor-pointer"
              >
                {isAr ? 'استبدال السلة' : 'Replace Cart'}
              </button>
              <button
                type="button"
                onClick={() => setPendingSwitchListing(null)}
                className="flex-1 rounded-full border border-[#E5DDF5] py-2.5 text-xs font-semibold text-[#1E1438] dark:border-[#22222C] dark:text-white cursor-pointer"
              >
                {isAr ? 'إبقاء الحالية' : 'Keep Current'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Drawers & Modals */}
      <CartCheckoutDrawer
        open={cartOpen}
        onClose={() => setCartOpen(false)}
        cart={cart}
        onUpdateQty={(listingId, delta) => {
          setCart((prev) =>
            prev
              .map((item) =>
                item.listingId === listingId ? { ...item, quantity: item.quantity + delta } : item
              )
              .filter((item) => item.quantity > 0)
          );
        }}
        onRemoveItem={(listingId) => setCart((prev) => prev.filter((i) => i.listingId !== listingId))}
        onClearCart={() => setCart([])}
        user={user}
        lang={lang}
        onOrderCreated={(order) => {
          setRecentOrders((prev) => [order, ...prev]);
          loadOverview();
          loadSearchResults();
        }}
        notify={notify}
      />

      <ProductCompareModal
        productSlug={compareProductSlug}
        coords={activeCoords ? { lat: activeCoords.lat, lng: activeCoords.lng } : null}
        onClose={() => setCompareProductSlug(null)}
        onAddToCart={(listing) => addListingToCart(listing)}
        onOpenStore={(slug) => openSellerPage(slug)}
        lang={lang}
        user={user}
        isFavorite={
          !!compareProductSlug &&
          favorites.some(
            (f) =>
              f.type === 'product' &&
              listings.some((l) => l.productSlug === compareProductSlug && l.productId === f.targetId)
          )
        }
        onToggleFavorite={handleToggleFavorite}
        notify={notify}
      />

      <SellerQRPrintModal
        open={Boolean(qrPrintStoreId)}
        stores={mergedStores}
        initialStoreId={qrPrintStoreId}
        onClose={() => setQrPrintStoreId(null)}
        onPreviewStore={(slug) => openSellerPage(slug)}
        notify={notify}
      />

      <AuthModal
        open={authOpen}
        initialMode={authConfig.mode}
        initialRole={authConfig.role}
        initialSellerType={authConfig.sellerType}
        lang={lang}
        onClose={() => setAuthOpen(false)}
        onSuccess={(u, meta) => {
          setUser(u);
          loadOverview();
          loadSearchResults();
          if (u.roles.includes('merchant') && (meta?.isRegister || activeView === 'seller_signup')) {
            setActiveView('merchant');
          } else if (meta?.isRegister && u.roles.includes('driver')) {
            setActiveView('driver');
          } else if (activeView === 'seller_signup') {
            setActiveView('marketplace');
          }
        }}
        onSwitchDemoRole={handleSwitchDemoRole}
        notify={notify}
      />

      <OfflineIndicator lang={lang} />

      <SupportHelpCenter
        open={helpChatOpen}
        onToggleOpen={setHelpChatOpen}
        defaultRole={helpChatRole}
        user={user}
        lang={lang}
        notify={notify}
      />

      {toast && (
        <div
          role="status"
          className={`fixed bottom-36 end-4 z-50 rounded-full px-4 py-2.5 text-xs font-semibold shadow-lg md:bottom-22 md:end-6 ${
            toast.type === 'error'
              ? 'bg-rose-600 text-white'
              : 'border border-[#9678CE]/40 bg-[#4A3894] text-white'
          }`}
        >
          {toast.message}
        </div>
      )}
    </div>
    </MotionConfig>
  );
}
