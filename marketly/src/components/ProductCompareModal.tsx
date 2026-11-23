import React, { useEffect, useState } from 'react';
import {
  AlertTriangle,
  ArrowUpRight,
  Flag,
  Heart,
  MessageCircle,
  Phone,
  Plus,
  Send,
  Star,
  X,
} from 'lucide-react';
import type { EnrichedListing, LanguageCode, PublicUser } from '../../shared/types.ts';
import { getAreaDisplayName } from '../../shared/locationConfig.ts';
import { apiFetch } from '../lib/api.ts';
import { fetchFirestoreProductOffersBySlug } from '../lib/firestoreProducts.ts';
import { formatDzd, formatRelativeTime } from '../lib/format.ts';
import { t } from '../lib/i18n.ts';
import { PriceHistorySparkline } from './PriceHistorySparkline.tsx';
import { ProductArtwork } from './ProductArtwork.tsx';

interface ProductCompareModalProps {
  productSlug: string | null;
  coords: { lat: number; lng: number } | null;
  onClose: () => void;
  onAddToCart: (listing: EnrichedListing) => void;
  onOpenStore: (storeSlug: string) => void;
  lang: LanguageCode;
  user: PublicUser | null;
  isFavorite: boolean;
  onToggleFavorite: (type: 'product' | 'store', id: string) => void;
  notify: (msg: string, type?: 'success' | 'error') => void;
}

export const ProductCompareModal: React.FC<ProductCompareModalProps> = ({
  productSlug,
  coords,
  onClose,
  onAddToCart,
  onOpenStore,
  lang,
  user,
  isFavorite,
  onToggleFavorite,
  notify,
}) => {
  const isAr = lang === 'ar';
  const dict = t(lang);
  const [loading, setLoading] = useState(false);
  const [product, setProduct] = useState<{
    id: string;
    name: string;
    brand: string;
    description: string;
    categoryId?: string;
    categoryName: string;
    imageKey: string;
    imageUrl?: string | null;
  } | null>(null);
  const [offers, setOffers] = useState<EnrichedListing[]>([]);
  const [inquiryTarget, setInquiryTarget] = useState<EnrichedListing | null>(null);
  const [inqName, setInqName] = useState(user?.fullName || '');
  const [inqPhone, setInqPhone] = useState(user?.phone || '');
  const [inqMessage, setInqMessage] = useState('');
  const [sendingInq, setSendingInq] = useState(false);

  useEffect(() => {
    if (!productSlug) return;
    let active = true;
    setLoading(true);
    const params = new URLSearchParams();
    if (coords) {
      params.set('lat', String(coords.lat));
      params.set('lng', String(coords.lng));
    }
    Promise.allSettled([
      apiFetch<{ product: NonNullable<typeof product>; offers: EnrichedListing[] }>(
        `/api/marketplace/products/${encodeURIComponent(productSlug)}?${params.toString()}`
      ),
      fetchFirestoreProductOffersBySlug(productSlug, [], coords).catch(() => []),
    ])
      .then(([apiRes, fsRes]) => {
        if (!active) return;
        const apiData = apiRes.status === 'fulfilled' ? apiRes.value : null;
        const fsOffers = fsRes.status === 'fulfilled' ? fsRes.value : [];

        if (apiData) {
          const offerMap = new Map<string, EnrichedListing>(
            apiData.offers.map((o) => [o.listingId, o])
          );
          for (const fsOffer of fsOffers) {
            const cur = offerMap.get(fsOffer.listingId);
            offerMap.set(
              fsOffer.listingId,
              cur
                ? {
                    ...cur,
                    price: fsOffer.price,
                    stockQuantity: fsOffer.stockQuantity,
                    availabilityStatus: fsOffer.availabilityStatus,
                  }
                : fsOffer
            );
          }
          setProduct(apiData.product);
          setOffers(Array.from(offerMap.values()));
        } else if (fsOffers.length > 0) {
          const first = fsOffers[0];
          setProduct({
            id: first.productId,
            name: first.productName,
            brand: first.brand,
            description: first.description,
            categoryId: first.categoryId,
            categoryName: first.categoryName,
            imageKey: first.imageKey,
            imageUrl: first.imageUrl,
          });
          setOffers(fsOffers);
        } else if (apiRes.status === 'rejected') {
          notify(
            apiRes.reason instanceof Error ? apiRes.reason.message : 'Product not found.',
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
  }, [productSlug, coords, notify]);

  if (!productSlug) return null;

  const handleSendInquiry = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inquiryTarget) return;
    setSendingInq(true);
    try {
      await apiFetch('/api/inquiries', {
        method: 'POST',
        body: JSON.stringify({
          storeId: inquiryTarget.storeId,
          storeProductId: inquiryTarget.listingId,
          customerName: inqName,
          customerPhone: inqPhone,
          message: inqMessage,
        }),
      });
      notify(
        isAr
          ? `تم إرسال الاستفسار إلى ${inquiryTarget.storeName}.`
          : `Inquiry sent to ${inquiryTarget.storeName}.`
      );
      setInquiryTarget(null);
      setInqMessage('');
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Failed to send inquiry.', 'error');
    } finally {
      setSendingInq(false);
    }
  };

  const handleReportListing = async (offer: EnrichedListing) => {
    try {
      await apiFetch('/api/reports', {
        method: 'POST',
        body: JSON.stringify({
          targetType: 'product',
          targetId: offer.listingId,
          targetName: `${offer.productName} at ${offer.storeName}`,
          reason: 'Customer flagged inaccurate price or stock status.',
        }),
      });
      notify(
        isAr
          ? 'تم إرسال البلاغ لمراجعة فريق ماركتلي.'
          : 'Listing reported to Marketly moderation.'
      );
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Could not report.', 'error');
    }
  };

  return (
    <div
      dir={isAr ? 'rtl' : 'ltr'}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-xs"
    >
      <div className="modal-enter max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-3xl border border-[#E4DCF7] bg-white shadow-2xl dark:border-[#22222C] dark:bg-[#0E0E13]">
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-[#E4DCF7] bg-white/95 px-6 py-4 backdrop-blur-xs dark:border-[#22222C] dark:bg-[#0E0E13]/95">
          <div className="text-xs font-semibold uppercase tracking-wider text-[#4A3894] dark:text-[#E794C9]">
            {product?.categoryName || dict.compareStores}
          </div>
          <div className="flex items-center gap-2">
            {product && (
              <button
                type="button"
                onClick={() => onToggleFavorite('product', product.id)}
                className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold transition cursor-pointer ${
                  isFavorite
                    ? 'border-[#4A3894] bg-[#4A3894]/10 text-[#4A3894] dark:border-[#9678CE] dark:text-[#E794C9]'
                    : 'border-[#E4DCF7] text-[#5E5C70] dark:border-[#22222C] dark:text-[#B9B0D8]'
                }`}
              >
                <Heart className={`h-3.5 w-3.5 ${isFavorite ? 'fill-current' : ''}`} />
                <span>
                  {isFavorite ? (isAr ? 'محفوظ' : 'Saved') : isAr ? 'حفظ' : 'Save'}
                </span>
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              aria-label={isAr ? 'إغلاق' : 'Close'}
              className="rounded-full p-2 text-[#5E5C70] hover:bg-[#F5F0FC] dark:text-[#B9B0D8] dark:hover:bg-[#15151C] cursor-pointer"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {loading || !product ? (
          <div className="p-10 text-center text-sm text-[#5E5C70]">
            {isAr ? 'جاري تحميل أسعار المتاجر القريبة...' : 'Loading nearby store prices...'}
          </div>
        ) : (
          <div className="space-y-6 p-6">
            <div className="grid items-center gap-6 sm:grid-cols-[180px_1fr]">
              <div className="flex h-44 items-center justify-center overflow-hidden rounded-2xl bg-[#F9F5FD] p-2 dark:bg-[#15151C]">
                <ProductArtwork
                  imageKey={product.imageKey}
                  imageUrl={offers[0]?.imageUrl || product.imageUrl}
                  categoryId={offers[0]?.categoryId || product.categoryId}
                  alt={product.name}
                  className="h-36 w-36"
                />
              </div>
              <div>
                <div className="text-xs font-semibold uppercase tracking-wider text-[#5E5C70] dark:text-[#B9B0D8]">
                  {product.brand}
                </div>
                <h2 className="font-display mt-1 text-2xl font-bold text-[#1E1438] dark:text-white">
                  {product.name}
                </h2>
                <p className="mt-2 text-sm leading-relaxed text-[#5E5C70] dark:text-[#B9B0D8]">
                  {product.description}
                </p>
                <div className="mt-3 text-xs font-medium text-[#4A3894] dark:text-[#E794C9]">
                  {isAr
                    ? `متوفر لدى ${offers.length} متجر في الجلفة`
                    : `Available across ${offers.length} local ${offers.length === 1 ? 'shop' : 'shops'} in Djelfa`}
                </div>
              </div>
            </div>

            <div className="space-y-3">
              <h3 className="font-display text-sm font-bold uppercase tracking-wider text-[#5E5C70] dark:text-[#B9B0D8]">
                {isAr ? 'مقارنة السعر والتوفر بين المتاجر' : 'Store Price & Stock Comparison'}
              </h3>

              {offers.map((offer) => {
                const disabled = offer.availabilityStatus === 'out_of_stock' || !offer.storeIsOpen;
                return (
                  <div
                    key={offer.listingId}
                    className={`rounded-2xl border p-4 transition ${
                      offer.isLowestPrice
                        ? 'border-[#4A3894] bg-[#FBEFFB]/60 dark:border-[#9678CE] dark:bg-[#15151C]/80'
                        : 'border-[#E4DCF7] dark:border-[#22222C]'
                    }`}
                  >
                    <div className="flex flex-wrap items-center justify-between gap-4">
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <button
                            type="button"
                            onClick={() => {
                              onClose();
                              onOpenStore(offer.storeSlug);
                            }}
                            className="font-display inline-flex items-center gap-1 text-base font-bold text-[#1E1438] hover:text-[#4A3894] dark:text-white cursor-pointer"
                          >
                            <span>{offer.storeName}</span>
                            <ArrowUpRight className="h-3.5 w-3.5" />
                          </button>
                          <span className="text-xs text-[#5E5C70] dark:text-[#B9B0D8]">
                            · {getAreaDisplayName(offer.storeArea, lang)}
                            {offer.distanceKm !== null
                              ? ` · ${offer.distanceKm} ${isAr ? 'كم' : 'km'}`
                              : ''}
                            {' · '}
                            <span className="inline-flex items-center gap-0.5">
                              <Star className="h-3 w-3 fill-amber-400 text-amber-400" />
                              {offer.storeRating}
                            </span>
                          </span>
                        </div>

                        <div className="mt-1.5 flex flex-wrap items-center gap-3 text-xs">
                          <span
                            className={`font-semibold ${
                              offer.availabilityStatus === 'in_stock'
                                ? 'text-emerald-700 dark:text-emerald-400'
                                : offer.availabilityStatus === 'unconfirmed'
                                  ? 'text-amber-700 dark:text-amber-400'
                                  : 'text-rose-600 dark:text-rose-400'
                            }`}
                          >
                            {offer.availabilityStatus === 'in_stock'
                              ? dict.inStock
                              : offer.availabilityStatus === 'unconfirmed'
                                ? dict.unconfirmed
                                : dict.outOfStock}
                          </span>
                          <span className="text-[#5E5C70] dark:text-[#B9B0D8]">
                            · {dict.updated} {formatRelativeTime(offer.availabilityUpdatedAt, lang)}
                          </span>
                          {offer.isStale && (
                            <span className="inline-flex items-center gap-1 text-amber-700 dark:text-amber-400">
                              <AlertTriangle className="h-3 w-3" />
                              {isAr ? 'يُفضل التأكد مع المتجر' : 'Verify with shop'}
                            </span>
                          )}
                          <span className="text-[#5E5C70] dark:text-[#B9B0D8]">
                            · {offer.storeIsOpen ? dict.openStatus : dict.closedStatus}
                          </span>
                        </div>
                      </div>

                      <div className="flex items-center gap-3">
                        <div className="text-end">
                          {offer.isLowestPrice && (
                            <div className="text-[11px] font-bold uppercase tracking-wide text-[#4A3894] dark:text-[#E794C9]">
                              {dict.lowestPriceTag}
                            </div>
                          )}
                          <div className="font-display text-xl font-extrabold text-[#1E1438] tabular-nums dark:text-white">
                            {formatDzd(offer.price, lang)}
                          </div>
                        </div>

                        <button
                          type="button"
                          disabled={disabled}
                          onClick={() => onAddToCart(offer)}
                          className="inline-flex items-center gap-1.5 rounded-full bg-[#4A3894] px-4 py-2 text-xs font-bold text-white transition hover:bg-[#3A2B78] disabled:cursor-not-allowed disabled:opacity-40 cursor-pointer"
                        >
                          <Plus className="h-3.5 w-3.5" />
                          <span>{dict.addToCart}</span>
                        </button>
                      </div>
                    </div>

                    <div className="mt-3">
                      <PriceHistorySparkline
                        history={offer.priceHistory}
                        currentPrice={offer.price}
                        lang={lang}
                      />
                    </div>

                    {offer.storeDeliveryZones && offer.storeDeliveryZones.length > 0 && (
                      <div className="mt-2 text-[11px] text-[#5E5C70] dark:text-[#B9B0D8]">
                        {isAr ? 'يوصل إلى:' : 'Delivers to:'}{' '}
                        <strong className="text-[#1E1438] dark:text-white">
                          {offer.storeDeliveryZones
                            .map((z) => getAreaDisplayName(z, lang))
                            .join('، ')}
                        </strong>
                        {' · '}
                        {formatDzd(offer.storeDeliveryFee ?? 200, lang)} (
                        {offer.storeDeliveryRadiusKm ?? 10} {isAr ? 'كم' : 'km zone'})
                      </div>
                    )}

                    <div className="mt-3 flex flex-wrap items-center gap-3 border-t border-[#E4DCF7]/70 pt-2.5 text-xs dark:border-[#22222C]">
                      <a
                        href={`https://wa.me/${offer.storeWhatsapp}?text=${encodeURIComponent(
                          `Hello ${offer.storeName}, is ${offer.productName} available at ${formatDzd(offer.price)}?`
                        )}`}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 font-medium text-emerald-700 hover:underline dark:text-emerald-400"
                      >
                        <MessageCircle className="h-3.5 w-3.5" />
                        <span>WhatsApp</span>
                      </a>
                      <a
                        href={`tel:${offer.storePhone.replace(/\s+/g, '')}`}
                        className="inline-flex items-center gap-1 font-medium text-[#5E5C70] hover:text-[#4A3894] dark:text-[#B9B0D8] dark:hover:text-white"
                      >
                        <Phone className="h-3.5 w-3.5" />
                        <span>{offer.storePhone}</span>
                      </a>
                      <button
                        type="button"
                        onClick={() => setInquiryTarget(offer)}
                        className="inline-flex items-center gap-1 font-medium text-[#4A3894] hover:underline dark:text-[#E794C9] cursor-pointer"
                      >
                        <Send className="h-3 w-3" />
                        <span>{isAr ? 'اسأل المتجر' : 'Ask shop'}</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => handleReportListing(offer)}
                        className="ms-auto inline-flex items-center gap-1 text-[#5E5C70] hover:text-rose-600 dark:text-[#B9B0D8] cursor-pointer"
                      >
                        <Flag className="h-3 w-3" />
                        <span>{isAr ? 'إبلاغ' : 'Report'}</span>
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>

            {inquiryTarget && (
              <form
                onSubmit={handleSendInquiry}
                className="space-y-3 rounded-2xl border border-[#9678CE]/40 bg-[#F5F0FC] p-4 dark:bg-[#15151C]"
              >
                <div className="flex items-center justify-between">
                  <div className="text-xs font-bold text-[#1E1438] dark:text-white">
                    {isAr
                      ? `اسأل ${inquiryTarget.storeName} عن ${inquiryTarget.productName}`
                      : `Ask ${inquiryTarget.storeName} about ${inquiryTarget.productName}`}
                  </div>
                  <button
                    type="button"
                    onClick={() => setInquiryTarget(null)}
                    className="text-xs text-[#5E5C70] hover:underline cursor-pointer"
                  >
                    {isAr ? 'إلغاء' : 'Cancel'}
                  </button>
                </div>
                <div className="grid gap-2 sm:grid-cols-2">
                  <input
                    required
                    value={inqName}
                    onChange={(e) => setInqName(e.target.value)}
                    placeholder={isAr ? 'اسمك' : 'Your name'}
                    className="rounded-xl border border-[#E4DCF7] bg-white px-3 py-2 text-xs dark:border-[#22222C] dark:bg-[#0E0E13]"
                  />
                  <input
                    required
                    value={inqPhone}
                    onChange={(e) => setInqPhone(e.target.value)}
                    placeholder={isAr ? 'رقم الهاتف' : 'Phone number'}
                    className="rounded-xl border border-[#E4DCF7] bg-white px-3 py-2 text-xs dark:border-[#22222C] dark:bg-[#0E0E13]"
                  />
                </div>
                <textarea
                  required
                  rows={2}
                  value={inqMessage}
                  onChange={(e) => setInqMessage(e.target.value)}
                  placeholder={
                    isAr
                      ? 'اسأل عن التوفر أو الألوان أو التوصيل في الجلفة...'
                      : 'Ask about availability, colors, or delivery...'
                  }
                  className="w-full rounded-xl border border-[#E4DCF7] bg-white px-3 py-2 text-xs dark:border-[#22222C] dark:bg-[#0E0E13]"
                />
                <button
                  type="submit"
                  disabled={sendingInq}
                  className="rounded-full bg-[#4A3894] px-4 py-2 text-xs font-semibold text-white hover:bg-[#3A2B78] cursor-pointer"
                >
                  {sendingInq
                    ? isAr
                      ? 'جاري الإرسال...'
                      : 'Sending...'
                    : isAr
                      ? 'إرسال الاستفسار'
                      : 'Send Inquiry'}
                </button>
              </form>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
