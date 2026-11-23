import React, { useEffect, useRef, useState } from 'react';
import {
  Clock,
  ExternalLink,
  Flag,
  Globe,
  Heart,
  MapPin,
  MessageCircle,
  MessageSquarePlus,
  Navigation,
  Phone,
  Plus,
  Search,
  Send,
  Share2,
  Star,
  Truck,
  X,
} from 'lucide-react';
import type { EnrichedListing, LanguageCode, PublicUser, Store, StoreReview } from '../../shared/types.ts';
import { getAreaDisplayName } from '../../shared/locationConfig.ts';
import { apiFetch } from '../lib/api.ts';
import { fetchFirestoreStoreBySlug } from '../lib/firestoreProducts.ts';
import { formatDzd, formatRelativeTime } from '../lib/format.ts';
import { t } from '../lib/i18n.ts';
import { ProductArtwork } from './ProductArtwork.tsx';
import { PWAInstallButton } from './PWAInstallButton.tsx';

interface StorefrontModalProps {
  storeSlug: string | null;
  coords: { lat: number; lng: number } | null;
  onClose: () => void;
  onAddToCart: (listing: EnrichedListing) => void;
  onCompareProduct: (productSlug: string) => void;
  lang: LanguageCode;
  user: PublicUser | null;
  isFavorite: boolean;
  onToggleFavorite: (type: 'store' | 'product', id: string) => void;
  onReviewSubmitted?: () => void;
  focusReviews?: boolean;
  notify: (msg: string, type?: 'success' | 'error') => void;
}

export const StorefrontModal: React.FC<StorefrontModalProps> = ({
  storeSlug,
  coords,
  onClose,
  onAddToCart,
  onCompareProduct,
  lang,
  user,
  isFavorite,
  onToggleFavorite,
  onReviewSubmitted,
  focusReviews,
  notify,
}) => {
  const isAr = lang === 'ar';
  const dict = t(lang);
  const [loading, setLoading] = useState(false);
  const [store, setStore] = useState<(Store & { distanceKm?: number | null }) | null>(null);
  const [listings, setListings] = useState<EnrichedListing[]>([]);
  const [reviews, setReviews] = useState<StoreReview[]>([]);
  const [query, setQuery] = useState('');

  const [reviewRating, setReviewRating] = useState(5);
  const [reviewAuthor, setReviewAuthor] = useState(user?.fullName || '');
  const [reviewComment, setReviewComment] = useState('');
  const [submittingReview, setSubmittingReview] = useState(false);
  const [logoError, setLogoError] = useState(false);
  const reviewsSectionRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (user?.fullName) {
      setReviewAuthor(user.fullName);
    }
  }, [user?.fullName]);

  useEffect(() => {
    if (!storeSlug) return;
    let active = true;
    setLoading(true);
    setLogoError(false);
    const params = new URLSearchParams();
    if (coords) {
      params.set('lat', String(coords.lat));
      params.set('lng', String(coords.lng));
    }
    Promise.allSettled([
      apiFetch<{ store: NonNullable<typeof store>; listings: EnrichedListing[]; reviews: StoreReview[] }>(
        `/api/marketplace/stores/${encodeURIComponent(storeSlug)}?${params.toString()}`
      ),
      fetchFirestoreStoreBySlug(storeSlug, [], coords).catch(() => ({ store: null, listings: [] })),
    ])
      .then(([apiRes, fsRes]) => {
        if (!active) return;
        const apiData = apiRes.status === 'fulfilled' ? apiRes.value : null;
        const fsData = fsRes.status === 'fulfilled' ? fsRes.value : { store: null, listings: [] };

        if (apiData) {
          const listingMap = new Map<string, EnrichedListing>(
            apiData.listings.map((l) => [l.listingId, l])
          );
          for (const fsL of fsData.listings) {
            const cur = listingMap.get(fsL.listingId);
            listingMap.set(
              fsL.listingId,
              cur
                ? {
                    ...cur,
                    price: fsL.price,
                    stockQuantity: fsL.stockQuantity,
                    availabilityStatus: fsL.availabilityStatus,
                  }
                : fsL
            );
          }
          setStore({
            ...apiData.store,
            logoUrl: apiData.store.logoUrl ?? fsData.store?.logoUrl ?? null,
            whatsapp: apiData.store.whatsapp || fsData.store?.whatsapp || '213662451109',
            facebookUrl: apiData.store.facebookUrl ?? fsData.store?.facebookUrl ?? null,
            instagramUrl: apiData.store.instagramUrl ?? fsData.store?.instagramUrl ?? null,
            googleMapsUrl: apiData.store.googleMapsUrl ?? fsData.store?.googleMapsUrl ?? null,
          });
          setListings(Array.from(listingMap.values()));
          setReviews(apiData.reviews || []);
        } else if (fsData.store) {
          setStore(fsData.store);
          setListings(fsData.listings);
          setReviews([]);
        } else if (apiRes.status === 'rejected') {
          notify(
            apiRes.reason instanceof Error ? apiRes.reason.message : 'Store not found.',
            'error'
          );
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [storeSlug, coords, notify]);

  useEffect(() => {
    if (focusReviews && !loading && store && reviewsSectionRef.current) {
      const timer = setTimeout(() => {
        reviewsSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 80);
      return () => clearTimeout(timer);
    }
  }, [focusReviews, loading, store]);

  if (!storeSlug) return null;

  const filtered = listings.filter((l) =>
    `${l.productName} ${l.brand} ${l.categoryName}`.toLowerCase().includes(query.trim().toLowerCase())
  );

  const handleShare = () => {
    if (!store) return;
    const slug = encodeURIComponent(store.slug);
    const shareUrl = `${window.location.origin}/?store=${slug}#store/${slug}`;
    navigator.clipboard?.writeText(shareUrl).then(
      () =>
        notify(
          isAr
            ? 'تم نسخ رابط المتجر للمشاركة!'
            : 'Storefront link copied! Share on WhatsApp or Instagram.'
        ),
      () => notify(`Share URL: ${shareUrl}`)
    );
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
      notify(isAr ? 'تم إرسال البلاغ للمراجعة.' : 'Report submitted for admin review.');
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Report failed.', 'error');
    }
  };

  const handleSubmitReview = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!store) return;
    if (reviewComment.trim().length < 3) {
      notify(
        isAr
          ? 'يرجى كتابة 3 أحرف على الأقل في التقييم.'
          : 'Please write at least 3 characters in your review.',
        'error'
      );
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
      setStore((prev) => (prev ? { ...prev, ...res.store } : res.store));
      setReviews(res.reviews);
      setReviewComment('');
      setReviewRating(5);
      notify(
        isAr
          ? `شكراً لك! تمت إضافة تقييمك إلى ${store.name}.`
          : `Thank you! Review added to ${store.name}.`
      );
      onReviewSubmitted?.();
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Could not submit review.', 'error');
    } finally {
      setSubmittingReview(false);
    }
  };

  return (
    <div
      dir={isAr ? 'rtl' : 'ltr'}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-xs"
    >
      <div className="modal-enter max-h-[92vh] w-full max-w-4xl overflow-y-auto rounded-3xl border border-[#E4DCF7] bg-white shadow-2xl dark:border-[#22222C] dark:bg-[#0E0E13]">
        <div className="marketly-awning" />
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-[#E4DCF7] bg-white/95 px-6 py-4 backdrop-blur-xs dark:border-[#22222C] dark:bg-[#0E0E13]/95">
          <div className="text-xs font-semibold text-[#5E5C70] dark:text-[#B9B0D8]">
            /store/{storeSlug}
          </div>
          <div className="flex items-center gap-2">
            {store && (
              <>
                <PWAInstallButton compact />
                <button
                  type="button"
                  onClick={() =>
                    reviewsSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
                  }
                  className="inline-flex items-center gap-1.5 rounded-full border border-[#E4DCF7] px-3 py-1.5 text-xs font-semibold hover:bg-[#F5F0FC] dark:border-[#22222C] dark:hover:bg-[#15151C] cursor-pointer"
                >
                  <MessageSquarePlus className="h-3.5 w-3.5 text-[#9678CE]" />
                  <span>{isAr ? `التقييمات (${reviews.length})` : `Reviews (${reviews.length})`}</span>
                </button>
                <button
                  type="button"
                  onClick={handleShare}
                  className="inline-flex items-center gap-1.5 rounded-full border border-[#E4DCF7] px-3 py-1.5 text-xs font-semibold hover:bg-[#F5F0FC] dark:border-[#22222C] dark:hover:bg-[#15151C] cursor-pointer"
                >
                  <Share2 className="h-3.5 w-3.5" />
                  <span>{isAr ? 'مشاركة' : 'Share'}</span>
                </button>
                <button
                  type="button"
                  onClick={() => onToggleFavorite('store', store.id)}
                  className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold cursor-pointer ${
                    isFavorite
                      ? 'border-[#4A3894] bg-[#4A3894]/10 text-[#4A3894] dark:border-[#9678CE] dark:text-[#E794C9]'
                      : 'border-[#E4DCF7] text-[#5E5C70] dark:border-[#22222C] dark:text-[#B9B0D8]'
                  }`}
                >
                  <Heart className={`h-3.5 w-3.5 ${isFavorite ? 'fill-current' : ''}`} />
                  <span>{isFavorite ? (isAr ? 'محفوظ' : 'Saved') : isAr ? 'حفظ' : 'Save'}</span>
                </button>
              </>
            )}
            <button
              type="button"
              onClick={onClose}
              aria-label={isAr ? 'إغلاق واجهة المتجر' : 'Close storefront'}
              className="rounded-full p-2 text-[#5E5C70] hover:bg-[#F5F0FC] dark:text-[#B9B0D8] dark:hover:bg-[#15151C] cursor-pointer"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {loading || !store ? (
          <div className="p-12 text-center text-sm text-[#5E5C70]">
            {isAr ? 'جاري تحميل واجهة المتجر...' : 'Loading storefront...'}
          </div>
        ) : (
          <div className="space-y-6 p-6">
            {/* Storefront Hero Banner */}
            <div className="rounded-3xl bg-gradient-to-br from-[#4A3894] to-[#2E2163] p-6 text-white">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="flex min-w-0 items-start gap-4">
                  <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-white/20 bg-white/10 sm:h-20 sm:w-20">
                    {store.logoUrl && !logoError ? (
                      <img
                        src={store.logoUrl}
                        alt={store.name}
                        referrerPolicy="no-referrer"
                        onError={() => setLogoError(true)}
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <span className="font-display text-xl font-extrabold text-[#FBEFFB] sm:text-2xl">
                        {store.name.slice(0, 2).toUpperCase()}
                      </span>
                    )}
                  </div>
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2 text-xs font-medium text-[#E794C9]">
                      <span>
                        {getAreaDisplayName(store.area, lang)}، {isAr ? 'الجلفة' : 'Djelfa'}
                      </span>
                      {store.distanceKm !== null && store.distanceKm !== undefined && (
                        <span>
                          · {store.distanceKm} {isAr ? 'كم' : 'km away'}
                        </span>
                      )}
                      <span>· {store.isOpen ? dict.openStatus : dict.closedStatus}</span>
                    </div>
                    <h2 className="font-display mt-1.5 text-2xl font-bold sm:text-3xl">
                      {store.name}
                    </h2>
                    <p className="mt-2 max-w-xl text-sm text-[#E9DFF9]">{store.description}</p>
                  </div>
                </div>

                <div className="flex items-center gap-2 rounded-2xl bg-white/15 px-4 py-2.5">
                  <Star className="h-4 w-4 fill-[#FBEFFB] text-[#FBEFFB]" />
                  <span className="font-display text-lg font-bold tabular-nums">{store.rating}</span>
                  <span className="text-xs text-[#E9DFF9]">
                    ({store.reviewCount} {isAr ? 'تقييم' : 'reviews'})
                  </span>
                </div>
              </div>

              <div className="mt-5 flex flex-wrap items-center gap-2.5 border-t border-white/15 pt-4 text-xs text-[#E9DFF9]">
                <span className="me-1 inline-flex items-center gap-1.5">
                  <MapPin className="h-3.5 w-3.5 text-[#E794C9]" />
                  {store.address}
                </span>
                <span className="me-1 inline-flex items-center gap-1.5">
                  <Clock className="h-3.5 w-3.5 text-[#E794C9]" />
                  {store.openingHours}
                </span>
                <a
                  href={`https://wa.me/${store.whatsapp}`}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1.5 rounded-full bg-[#FBEFFB] px-3 py-1 font-bold text-[#4A3894]"
                >
                  <MessageCircle className="h-3.5 w-3.5" />
                  <span>WhatsApp</span>
                </a>
                <a
                  href={`tel:${store.phone.replace(/\s+/g, '')}`}
                  className="inline-flex items-center gap-1.5 rounded-full bg-white/15 px-3 py-1 font-semibold text-white hover:bg-white/25"
                >
                  <Phone className="h-3.5 w-3.5" />
                  <span>{store.phone}</span>
                </a>
                {store.facebookUrl && store.facebookUrl.startsWith('https://') && (
                  <a
                    href={store.facebookUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1.5 rounded-full border border-white/25 bg-white/10 px-3 py-1 font-semibold text-white hover:bg-white/20"
                  >
                    <Globe className="h-3.5 w-3.5 text-[#E9DFF9]" />
                    <span>Facebook</span>
                    <ExternalLink className="h-3 w-3 opacity-75" />
                  </a>
                )}
                {store.instagramUrl && store.instagramUrl.startsWith('https://') && (
                  <a
                    href={store.instagramUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1.5 rounded-full border border-white/25 bg-pink-400/20 px-3 py-1 font-semibold text-white hover:bg-pink-400/35"
                  >
                    <Globe className="h-3.5 w-3.5 text-pink-200" />
                    <span>Instagram</span>
                    <ExternalLink className="h-3 w-3 opacity-75" />
                  </a>
                )}
                <a
                  href={
                    store.googleMapsUrl && store.googleMapsUrl.startsWith('https://')
                      ? store.googleMapsUrl
                      : `https://www.google.com/maps/search/?api=1&query=${store.lat},${store.lng}`
                  }
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1.5 rounded-full bg-white/15 px-3 py-1 font-semibold text-white hover:bg-white/25"
                >
                  <Navigation className="h-3.5 w-3.5 text-[#E794C9]" />
                  <span>{isAr ? 'خرائط Google' : 'Google Maps'}</span>
                  <ExternalLink className="h-3 w-3 opacity-75" />
                </a>
                <button
                  type="button"
                  onClick={handleReportStore}
                  className="ms-auto inline-flex items-center gap-1 text-[#E9DFF9] hover:text-white cursor-pointer"
                >
                  <Flag className="h-3 w-3" />
                  <span>{isAr ? 'إبلاغ' : 'Report'}</span>
                </button>
              </div>

              <div className="mt-4 flex flex-wrap items-center gap-2 rounded-2xl bg-white/10 px-3.5 py-2.5 text-xs">
                <span className="inline-flex items-center gap-1.5 font-bold text-[#FBEFFB]">
                  <Truck className="h-3.5 w-3.5" />
                  <span>
                    {isAr
                      ? `نطاق التوصيل (${store.deliveryRadiusKm ?? 10} كم · ${formatDzd(store.deliveryFee ?? 200, lang)}):`
                      : `Delivery Zone (${store.deliveryRadiusKm ?? 10} km · ${formatDzd(store.deliveryFee ?? 200, lang)}):`}
                  </span>
                </span>
                {(store.deliveryZones && store.deliveryZones.length > 0
                  ? store.deliveryZones
                  : [store.area]
                ).map((zone) => (
                  <span
                    key={zone}
                    className="rounded-full bg-white/15 px-2.5 py-0.5 text-[11px] font-medium text-white"
                  >
                    {getAreaDisplayName(zone, lang)}
                  </span>
                ))}
              </div>
            </div>

            {/* Store catalog search */}
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h3 className="font-display text-lg font-bold text-[#1E1438] dark:text-white">
                {isAr ? `كتالوج المتجر (${filtered.length})` : `Store Catalog (${filtered.length})`}
              </h3>
              <div className="relative w-full sm:w-64">
                <Search className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#5E5C70]" />
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder={isAr ? 'ابحث داخل هذا المتجر...' : 'Search inside this store...'}
                  className="w-full rounded-full border border-[#E4DCF7] bg-[#FBF9FE] py-2 ps-9 pe-4 text-xs dark:border-[#22222C] dark:bg-[#15151C]"
                />
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {filtered.map((item) => {
                const disabled = item.availabilityStatus === 'out_of_stock' || !store.isOpen;
                return (
                  <div
                    key={item.listingId}
                    className="group flex flex-col justify-between rounded-2xl border border-[#E4DCF7] bg-white p-4 transition hover:border-[#9678CE] dark:border-[#22222C] dark:bg-[#15151C]"
                  >
                    <div>
                      <div className="flex h-36 items-center justify-center overflow-hidden rounded-xl bg-[#F9F5FD] p-2 dark:bg-[#0E0E13]">
                        <ProductArtwork
                          imageKey={item.imageKey}
                          imageUrl={item.imageUrl}
                          categoryId={item.categoryId}
                          alt={item.productName}
                          className="h-28 w-28"
                        />
                      </div>
                      <div className="mt-3 text-[11px] font-medium text-[#5E5C70] dark:text-[#B9B0D8]">
                        {item.brand} ·{' '}
                        {item.availabilityStatus === 'in_stock'
                          ? dict.inStock
                          : item.availabilityStatus === 'unconfirmed'
                            ? dict.unconfirmed
                            : dict.outOfStock}{' '}
                        · {formatRelativeTime(item.availabilityUpdatedAt, lang)}
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          onClose();
                          onCompareProduct(item.productSlug);
                        }}
                        className="font-display mt-1 text-start text-base font-bold text-[#1E1438] hover:text-[#4A3894] dark:text-white cursor-pointer"
                      >
                        {item.productName}
                      </button>
                    </div>

                    <div className="mt-4 flex items-center justify-between">
                      <span className="font-display text-lg font-extrabold tabular-nums">
                        {formatDzd(item.price, lang)}
                      </span>
                      <button
                        type="button"
                        disabled={disabled}
                        onClick={() => onAddToCart(item)}
                        aria-label={`Add ${item.productName} to cart`}
                        className="flex h-9 w-9 items-center justify-center rounded-full bg-[#4A3894] text-white transition hover:bg-[#3A2B78] disabled:opacity-35 cursor-pointer"
                      >
                        <Plus className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Store Reviews Section */}
            <div
              ref={reviewsSectionRef}
              className="space-y-4 border-t border-[#E4DCF7] pt-6 dark:border-[#22222C]"
            >
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h3 className="font-display text-lg font-bold text-[#1E1438] dark:text-white">
                    {isAr ? `تقييمات المتجر (${reviews.length})` : `Store Reviews (${reviews.length})`}
                  </h3>
                  <p className="text-xs text-[#5E5C70] dark:text-[#B9B0D8]">
                    {isAr
                      ? 'آراء متسوقين موثقة حول جودة المنتجات والأسعار وسرعة الاستلام.'
                      : 'Verified shopper feedback on hardware authenticity, prices, and pickup speed.'}
                  </p>
                </div>
                <div className="inline-flex items-center gap-1.5 rounded-full bg-[#F5F0FC] px-3 py-1.5 text-xs font-bold dark:bg-[#15151C]">
                  <Star className="h-3.5 w-3.5 fill-amber-400 text-amber-400" />
                  <span className="tabular-nums">{store.rating}</span>
                  <span className="font-medium text-[#5E5C70] dark:text-[#B9B0D8]">/ 5.0</span>
                </div>
              </div>

              <form
                onSubmit={handleSubmitReview}
                className="space-y-3 rounded-2xl border border-[#E4DCF7] bg-[#FBF9FE] p-4 dark:border-[#22222C] dark:bg-[#15151C]"
              >
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <span className="font-display text-sm font-bold text-[#1E1438] dark:text-white">
                    {isAr ? 'أضف تقييمك للمتجر' : 'Leave a store review'}
                  </span>
                  <div
                    className="flex items-center gap-1"
                    role="radiogroup"
                    aria-label={isAr ? 'تقييم المتجر' : 'Store rating'}
                  >
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
                              : 'text-[#B8B6C8] dark:text-[#4D4A66]'
                          }`}
                        />
                      </button>
                    ))}
                    <span className="ms-1.5 text-xs font-bold text-[#4A3894] tabular-nums dark:text-[#E794C9]">
                      {reviewRating}.0
                    </span>
                  </div>
                </div>

                {!user && (
                  <input
                    type="text"
                    value={reviewAuthor}
                    onChange={(e) => setReviewAuthor(e.target.value)}
                    placeholder={isAr ? 'اسمك (اختياري)' : 'Your name (optional, e.g. Yacine B.)'}
                    className="w-full rounded-xl border border-[#E4DCF7] bg-white px-3 py-2 text-xs dark:border-[#22222C] dark:bg-[#0E0E13]"
                  />
                )}

                <div className="flex flex-col gap-2 sm:flex-row">
                  <input
                    type="text"
                    required
                    minLength={3}
                    maxLength={500}
                    value={reviewComment}
                    onChange={(e) => setReviewComment(e.target.value)}
                    placeholder={
                      isAr
                        ? `شارك تجربتك مع ${store.name}...`
                        : `Share your experience with ${store.name}...`
                    }
                    className="flex-1 rounded-xl border border-[#E4DCF7] bg-white px-3.5 py-2.5 text-xs dark:border-[#22222C] dark:bg-[#0E0E13]"
                  />
                  <button
                    type="submit"
                    disabled={submittingReview}
                    className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-[#4A3894] px-4 py-2.5 text-xs font-bold text-white transition hover:bg-[#3A2B78] disabled:opacity-50 cursor-pointer"
                  >
                    <Send className="h-3.5 w-3.5 rtl:rotate-180" />
                    <span>
                      {submittingReview
                        ? isAr
                          ? 'جاري النشر...'
                          : 'Posting...'
                        : isAr
                          ? 'نشر التقييم'
                          : 'Post Review'}
                    </span>
                  </button>
                </div>
              </form>

              {reviews.length === 0 ? (
                <div className="rounded-2xl border border-[#E4DCF7] p-6 text-center text-xs text-[#5E5C70] dark:border-[#22222C] dark:text-[#B9B0D8]">
                  {isAr
                    ? `لا توجد تقييمات بعد. كن أول من يقيم ${store.name}!`
                    : `No reviews yet. Be the first to review ${store.name}!`}
                </div>
              ) : (
                <div className="grid gap-3 sm:grid-cols-2">
                  {reviews.map((rev) => (
                    <div
                      key={rev.id}
                      className="rounded-2xl border border-[#E4DCF7] bg-white p-4 dark:border-[#22222C] dark:bg-[#15151C]"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-display text-xs font-bold text-[#1E1438] dark:text-white">
                          {rev.authorName}
                        </span>
                        <span className="inline-flex items-center gap-0.5 rounded-full bg-amber-400/15 px-2 py-0.5 text-[11px] font-bold text-amber-600 dark:text-amber-400">
                          <Star className="h-3 w-3 fill-current" />
                          {rev.rating}.0
                        </span>
                      </div>
                      <p className="mt-2 text-xs leading-relaxed text-[#5E5C70] dark:text-[#C5B2EA]">
                        {rev.comment}
                      </p>
                      <div className="mt-2 text-[10px] text-[#8E8CA0]">
                        {formatRelativeTime(rev.createdAt, lang)}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
