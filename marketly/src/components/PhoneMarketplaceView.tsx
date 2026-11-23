import React, { useState } from 'react';
import { AnimatePresence, LayoutGroup, motion } from 'motion/react';
import {
  ArrowRight,
  Award,
  Bike,
  ChevronDown,
  Flame,
  Globe,
  MapPin,
  MessageSquarePlus,
  Plus,
  Search,
  ShoppingBag,
  Sparkles,
  Star,
  Store as StoreIcon,
  X,
} from 'lucide-react';
import type {
  Category,
  CityArea,
  EnrichedListing,
  LanguageCode,
  Store,
  StoreReview,
} from '../../shared/types.ts';
import { getAreaDisplayName } from '../../shared/locationConfig.ts';
import { CANONICAL_CATEGORIES, CATEGORY_SUBPARTS, normalizeCategoryId } from '../../shared/taxonomy.ts';
import { formatDzd, formatRelativeTime } from '../lib/format.ts';
import { t } from '../lib/i18n.ts';
import { ElOuedMap } from './ElOuedMap.tsx';
import { ProductArtwork } from './ProductArtwork.tsx';

export interface PublicBestSellerItem {
  id: string;
  productName: string;
  productSlug: string;
  brand: string;
  storeName: string;
  imageKey: string;
  imageUrl?: string | null;
  price: number;
  soldCount: number;
  isCloudSynced: boolean;
  listing: EnrichedListing | null;
}

interface PhoneMarketplaceViewProps {
  lang: LanguageCode;
  searchQuery: string;
  onSearchChange: (q: string) => void;
  selectedCategory: string;
  onSelectCategory: (id: string) => void;
  selectedSubPart?: string;
  onSelectSubPart?: (id: string) => void;
  sortBy: string;
  onSortChange: (sort: string) => void;
  inStockOnly: boolean;
  onToggleInStock: () => void;
  openOnly: boolean;
  onToggleOpenOnly: () => void;
  categories: Category[];
  areas: CityArea[];
  selectedAreaId: string;
  onSelectArea: (id: string) => void;
  gpsCoords: { lat: number; lng: number; label: string } | null;
  onUseGps: () => void;
  activeCoords: { lat: number; lng: number; label: string } | null;
  stores: (Store & { distanceKm?: number | null; productCount?: number; topReview?: StoreReview | null })[];
  highestRatedStore: (Store & { distanceKm?: number | null; productCount?: number; topReview?: StoreReview | null }) | null;
  mostSellingListing: EnrichedListing | null;
  bestSellers?: PublicBestSellerItem[];
  listings: EnrichedListing[];
  loadingMarket: boolean;
  onOpenStore: (slug: string, focusReviews?: boolean) => void;
  onCompareProduct: (slug: string) => void;
  onAddToCart: (listing: EnrichedListing) => void;
  onOpenPartnerRegister: (target: 'physical_store' | 'online_page' | 'driver') => void;
  onNavigateView?: (view: 'physical_stores' | 'online_sellers') => void;
}

export const PhoneMarketplaceView: React.FC<PhoneMarketplaceViewProps> = ({
  lang,
  searchQuery,
  onSearchChange,
  selectedCategory,
  onSelectCategory,
  selectedSubPart = 'all',
  onSelectSubPart,
  sortBy,
  onSortChange,
  inStockOnly,
  onToggleInStock,
  openOnly,
  onToggleOpenOnly,
  categories,
  areas,
  selectedAreaId,
  onSelectArea,
  gpsCoords,
  onUseGps,
  activeCoords,
  stores,
  highestRatedStore,
  mostSellingListing,
  bestSellers = [],
  listings,
  loadingMarket,
  onOpenStore,
  onCompareProduct,
  onAddToCart,
  onOpenPartnerRegister,
  onNavigateView,
}) => {
  const isAr = lang === 'ar';
  const dict = t(lang);
  const [locationPickerOpen, setLocationPickerOpen] = useState(false);
  const [phoneSearchOpen, setPhoneSearchOpen] = useState(false);
  const [shopsMode, setShopsMode] = useState<'list' | 'map'>('list');

  const currentAreaLabel = gpsCoords
    ? isAr
      ? 'موقع GPS'
      : 'GPS Location'
    : selectedAreaId === 'all'
      ? isAr
        ? 'الجلفة (كل الأحياء)'
        : 'Djelfa (All Areas)'
      : getAreaDisplayName(
          areas.find((a) => a.id === selectedAreaId)?.name || 'Centre-Ville',
          lang
        );

  const sortOptions = [
    { id: 'closest', label: dict.sortClosest },
    { id: 'lowest_price', label: dict.sortLowestPrice },
    { id: 'popular', label: dict.sortPopular },
    { id: 'rating', label: dict.sortRating },
  ];

  const isFiltering =
    searchQuery.trim().length > 0 ||
    selectedCategory !== 'all' ||
    selectedSubPart !== 'all' ||
    inStockOnly ||
    openOnly;

  return (
    <div dir={isAr ? 'rtl' : 'ltr'} className="space-y-4">
      <div className="rounded-2xl border border-[#E4DCF7] bg-white px-3.5 py-2.5 dark:border-[#22222C] dark:bg-[#0E0E13]">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#F5F0FC] text-[#4A3894] dark:bg-[#15151C] dark:text-[#C5B2EA]">
              <MapPin className="h-4 w-4" />
            </div>
            <div className="min-w-0">
              <div className="text-[10px] font-medium text-[#5E5C70] dark:text-[#B9B0D8]">
                {isAr ? 'التوصيل في الجلفة إلى' : 'Delivering to'}
              </div>
              <div className="truncate font-display text-xs font-bold text-[#1E1438] dark:text-white">
                {currentAreaLabel}
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={() => setLocationPickerOpen((v) => !v)}
            className="inline-flex items-center gap-1 text-xs font-bold text-[#4A3894] dark:text-[#E794C9] cursor-pointer shrink-0"
          >
            <span>{isAr ? 'تغيير' : 'Change'}</span>
            <ChevronDown className={`h-3.5 w-3.5 transition-transform ${locationPickerOpen ? 'rotate-180' : ''}`} />
          </button>
        </div>

        {locationPickerOpen && (
          <div className="mt-2.5 flex flex-wrap items-center gap-1.5 border-t border-[#E4DCF7] pt-2.5 dark:border-[#22222C]">
            <button
              type="button"
              onClick={() => {
                onUseGps();
                setLocationPickerOpen(false);
              }}
              aria-label={isAr ? 'استخدام موقعي الحالي' : 'Use current location'}
              title={isAr ? 'استخدام موقعي الحالي' : 'Use current location'}
              className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#4A3894] text-white transition hover:bg-[#3A2B78] cursor-pointer"
            >
              <MapPin className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              onClick={() => {
                onSelectArea('all');
                setLocationPickerOpen(false);
              }}
              className={`rounded-full px-2.5 py-1 text-[11px] font-semibold cursor-pointer ${
                selectedAreaId === 'all' && !gpsCoords
                  ? 'bg-[#4A3894] text-white'
                  : 'bg-[#F5F0FC] text-[#5E5C70] dark:bg-[#15151C] dark:text-[#B9B0D8]'
              }`}
            >
              {isAr ? 'كل الجلفة' : 'All Djelfa'}
            </button>
            {areas.map((a) => (
              <button
                key={a.id}
                type="button"
                onClick={() => {
                  onSelectArea(a.id);
                  setLocationPickerOpen(false);
                }}
                className={`rounded-full px-2.5 py-1 text-[11px] font-semibold cursor-pointer ${
                  selectedAreaId === a.id && !gpsCoords
                    ? 'bg-[#4A3894] text-white'
                    : 'bg-[#F5F0FC] text-[#5E5C70] dark:bg-[#15151C] dark:text-[#B9B0D8]'
                }`}
              >
                {lang === 'ar' ? a.nameAr : a.name}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* 2. Compact Search Icon Trigger (Expands live DB/Firestore search bar on tap) */}
      <div className="flex items-center justify-between gap-2">
        {phoneSearchOpen || searchQuery.trim().length > 0 ? (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const el = document.getElementById('phone-products-section');
              el?.scrollIntoView({ behavior: 'smooth' });
            }}
            className="relative flex flex-1 items-center gap-1 rounded-full border border-[#DFDFEE] bg-white pl-3.5 pr-1.5 py-1.5 shadow-xs dark:border-[#22222C] dark:bg-[#0E0E13]"
          >
            <Search className="h-4 w-4 shrink-0 text-[#6E65F6]" />
            <input
              type="search"
              autoFocus
              value={searchQuery}
              onChange={(e) => onSearchChange(e.target.value)}
              placeholder={dict.searchPlaceholder}
              aria-label="Search PC parts, phones, or shops"
              className="w-full bg-transparent text-sm text-[#13111C] placeholder:text-[#5E5C70] focus:outline-none dark:text-white dark:placeholder:text-[#9D9BB0]"
            />
            <button
              type="button"
              onClick={() => {
                onSearchChange('');
                setPhoneSearchOpen(false);
              }}
              aria-label="Close search"
              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[#5E5C70] hover:bg-[#F4F5FB] dark:text-[#9D9BB0] dark:hover:bg-[#15151C] cursor-pointer"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </form>
        ) : (
          <div className="flex w-full items-center justify-between gap-2">
            <span className="text-xs font-semibold text-[#5E5C70] dark:text-[#B9B0D8]">
              {isAr ? 'استكشف عروض الجلفة الموثوقة' : 'Explore verified Djelfa deals'}
            </span>
            <button
              type="button"
              onClick={() => setPhoneSearchOpen(true)}
              aria-label={isAr ? 'فتح البحث عن المنتجات' : 'Open product search'}
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-[#E4DCF7] bg-white text-[#4A3894] shadow-xs hover:border-[#4A3894] dark:border-[#22222C] dark:bg-[#0E0E13] dark:text-white cursor-pointer"
            >
              <Search className="h-4 w-4" />
            </button>
          </div>
        )}
      </div>

      {/* 3. Two Horizontal Single-Line Scrollable Filter Rows (inspired by Souq Local screenshot) */}
      <div className="space-y-2">
        <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar pb-0.5">
          {sortOptions.map((opt) => (
            <button
              key={opt.id}
              type="button"
              onClick={() => onSortChange(opt.id)}
              className={`shrink-0 whitespace-nowrap rounded-full px-3 py-1.5 text-[11px] font-semibold transition cursor-pointer ${
                sortBy === opt.id
                  ? 'bg-[#6E65F6] text-white'
                  : 'border border-[#E4E4F0] bg-white text-[#5E5C70] dark:border-[#22222C] dark:bg-[#0E0E13] dark:text-[#9D9BB0]'
              }`}
            >
              {opt.label}
            </button>
          ))}
          <button
            type="button"
            onClick={onToggleInStock}
            className={`shrink-0 whitespace-nowrap rounded-full px-3 py-1.5 text-[11px] font-semibold transition cursor-pointer ${
              inStockOnly
                ? 'bg-[#4A3894] text-white'
                : 'border border-[#E4DCF7] bg-white text-[#5E5C70] dark:border-[#22222C] dark:bg-[#0E0E13] dark:text-[#B9B0D8]'
            }`}
          >
            {dict.inStockOnly}
          </button>
          <button
            type="button"
            onClick={onToggleOpenOnly}
            className={`shrink-0 whitespace-nowrap rounded-full px-3 py-1.5 text-[11px] font-semibold transition cursor-pointer ${
              openOnly
                ? 'bg-[#9678CE] text-white'
                : 'border border-[#E4DCF7] bg-white text-[#5E5C70] dark:border-[#22222C] dark:bg-[#0E0E13] dark:text-[#B9B0D8]'
            }`}
          >
            {dict.openNow}
          </button>
        </div>

        <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar pb-0.5">
          <button
            type="button"
            onClick={() => {
              onSelectCategory('all');
              onSelectSubPart?.('all');
            }}
            className={`shrink-0 whitespace-nowrap rounded-full px-3 py-1.5 text-[11px] font-semibold transition cursor-pointer ${
              selectedCategory === 'all'
                ? 'bg-[#4A3894] text-white'
                : 'border border-[#E4DCF7] bg-white text-[#5E5C70] dark:border-[#22222C] dark:bg-[#0E0E13] dark:text-[#B9B0D8]'
            }`}
          >
            {dict.allCategories}
          </button>
          {(categories.length > 0 ? categories : CANONICAL_CATEGORIES).map((cat) => (
            <button
              key={cat.id}
              type="button"
              onClick={() => {
                onSelectCategory(cat.id);
                onSelectSubPart?.('all');
              }}
              className={`shrink-0 whitespace-nowrap rounded-full px-3 py-1.5 text-[11px] font-semibold transition cursor-pointer ${
                selectedCategory === cat.id
                  ? 'bg-[#4A3894] text-white'
                  : 'border border-[#E4DCF7] bg-white text-[#5E5C70] dark:border-[#22222C] dark:bg-[#0E0E13] dark:text-[#B9B0D8]'
              }`}
            >
              {lang === 'ar' ? cat.nameAr : cat.name}
            </button>
          ))}
        </div>

        {selectedCategory !== 'all' && onSelectSubPart && (
          <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar pb-0.5">
            <button
              type="button"
              onClick={() => onSelectSubPart('all')}
              className={`shrink-0 whitespace-nowrap rounded-full px-2.5 py-1 text-[10px] font-bold transition cursor-pointer ${
                selectedSubPart === 'all'
                  ? 'bg-[#9678CE] text-white'
                  : 'border border-[#E4DCF7] bg-white text-[#5E5C70] dark:border-[#22222C] dark:bg-[#0E0E13] dark:text-[#B9B0D8]'
              }`}
            >
              {isAr ? 'الكل' : 'All Parts'}
            </button>
            {(CATEGORY_SUBPARTS[normalizeCategoryId(selectedCategory)] || []).map((sp) => (
              <button
                key={sp.id}
                type="button"
                onClick={() => onSelectSubPart(sp.id)}
                className={`shrink-0 whitespace-nowrap rounded-full px-2.5 py-1 text-[10px] font-bold transition cursor-pointer ${
                  selectedSubPart === sp.id
                    ? 'bg-[#9678CE] text-white'
                    : 'border border-[#E4DCF7] bg-white text-[#5E5C70] dark:border-[#22222C] dark:bg-[#0E0E13] dark:text-[#B9B0D8]'
                }`}
              >
                {lang === 'ar' ? sp.labelAr : sp.label}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* 4. Top Spotlights: Highest Rated Store & Most Selling Product */}
      {(highestRatedStore || mostSellingListing) && (
        <div className="space-y-2.5">
          {highestRatedStore && (
            <div className="rounded-2xl border border-[#4A3894]/25 bg-gradient-to-br from-[#4A3894] to-[#2E2163] p-3.5 text-white shadow-sm">
              <div className="flex items-center justify-between gap-2">
                <span className="inline-flex items-center gap-1 rounded-full bg-[#FBEFFB] px-2.5 py-0.5 text-[10px] font-extrabold uppercase tracking-wide text-[#4A3894]">
                  <Award className="h-3 w-3" />
                  {isAr ? 'أعلى متجر تقييماً' : 'Highest Rated Store'}
                </span>
                <span className="inline-flex items-center gap-1 text-xs font-bold text-[#E794C9] tabular-nums">
                  <Star className="h-3.5 w-3.5 fill-current" />
                  {highestRatedStore.rating} ({highestRatedStore.reviewCount})
                </span>
              </div>
              <div className="mt-2 flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="truncate font-display text-sm font-extrabold">
                    {highestRatedStore.name}
                  </div>
                  <div className="text-[11px] text-[#E9DFF9]">
                    {getAreaDisplayName(highestRatedStore.area, lang)}
                    {highestRatedStore.distanceKm != null ? ` · ${highestRatedStore.distanceKm} km` : ''} ·{' '}
                    {highestRatedStore.productCount || 0} {isAr ? 'منتجاً' : 'PC & phone items'}
                  </div>
                </div>
              </div>
              {highestRatedStore.topReview && (
                <p className="mt-2 line-clamp-2 rounded-xl bg-white/10 px-2.5 py-2 text-[11px] text-[#FBEFFB]">
                  &ldquo;{highestRatedStore.topReview.comment}&rdquo; —{' '}
                  <strong className="text-white">{highestRatedStore.topReview.authorName}</strong>
                </p>
              )}
              <div className="mt-2.5 flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => onOpenStore(highestRatedStore.slug)}
                  className="flex-1 rounded-full bg-white py-1.5 text-[11px] font-extrabold text-[#4A3894] cursor-pointer"
                >
                  {dict.viewStore}
                </button>
                <button
                  type="button"
                  onClick={() => onOpenStore(highestRatedStore.slug, true)}
                  className="inline-flex items-center justify-center gap-1 rounded-full border border-white/25 px-3 py-1.5 text-[11px] font-semibold text-white cursor-pointer"
                >
                  <MessageSquarePlus className="h-3 w-3 text-[#E794C9]" />
                  <span>{isAr ? 'تقييم' : 'Review'}</span>
                </button>
              </div>
            </div>
          )}

          {mostSellingListing && (
            <div className="flex items-center justify-between gap-3 rounded-2xl border border-[#E4DCF7] bg-white p-3 dark:border-[#22222C] dark:bg-[#0E0E13]">
              <button
                type="button"
                onClick={() => onCompareProduct(mostSellingListing.productSlug)}
                className="flex items-center gap-3 min-w-0 text-start cursor-pointer"
              >
                <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl bg-[#F9F5FD] dark:bg-[#15151C] overflow-hidden">
                  <ProductArtwork
                    imageKey={mostSellingListing.imageKey}
                    imageUrl={mostSellingListing.imageUrl}
                    categoryId={mostSellingListing.categoryId}
                    alt={mostSellingListing.productName}
                    className="h-12 w-12"
                  />
                </div>
                <div className="min-w-0">
                  <span className="inline-flex items-center gap-1 text-[10px] font-extrabold uppercase tracking-wide text-[#4A3894] dark:text-[#E794C9]">
                    <Flame className="h-3 w-3" />
                    {isAr ? `الأكثر مبيعاً · ${mostSellingListing.soldCount}` : `Most Selling · ${mostSellingListing.soldCount} sold`}
                  </span>
                  <div className="truncate font-display text-sm font-extrabold text-[#1E1438] dark:text-white">
                    {mostSellingListing.productName}
                  </div>
                  <div className="truncate text-[11px] text-[#5E5C70] dark:text-[#B9B0D8]">
                    {mostSellingListing.storeName} ·{' '}
                    <strong className="text-[#1E1438] dark:text-white tabular-nums">
                      {formatDzd(mostSellingListing.price, lang)}
                    </strong>
                  </div>
                </div>
              </button>
              <button
                type="button"
                disabled={
                  mostSellingListing.availabilityStatus === 'out_of_stock' ||
                  !mostSellingListing.storeIsOpen
                }
                onClick={() => onAddToCart(mostSellingListing)}
                aria-label={`Add ${mostSellingListing.productName}`}
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#4A3894] text-white disabled:opacity-35 cursor-pointer"
              >
                <Plus className="h-4 w-4" />
              </button>
            </div>
          )}
          {bestSellers.length > 1 && (
            <div className="space-y-2 pt-1">
              <div className="flex items-center justify-between">
                <h3 className="inline-flex items-center gap-1.5 font-display text-xs font-extrabold uppercase tracking-wide text-[#1E1438] dark:text-white">
                  <Flame className="h-3.5 w-3.5 text-[#9678CE]" />
                  <span>{isAr ? 'الأكثر طلباً' : 'Best-Selling Ranking'}</span>
                </h3>
                <span className="text-[10px] font-semibold text-[#4A3894] dark:text-[#E794C9]">
                  Top {bestSellers.length}
                </span>
              </div>
              <div className="flex items-stretch gap-2.5 overflow-x-auto no-scrollbar pb-1">
                {bestSellers.slice(0, 6).map((bs, idx) => (
                  <div
                    key={bs.id}
                    className="flex w-44 shrink-0 flex-col justify-between rounded-2xl border border-[#E4DCF7] bg-white p-2.5 dark:border-[#22222C] dark:bg-[#0E0E13]"
                  >
                    <button
                      type="button"
                      onClick={() => onCompareProduct(bs.productSlug)}
                      className="text-start cursor-pointer"
                    >
                      <div className="flex items-center justify-between gap-1">
                        <span
                          className={`rounded-md px-1.5 py-0.5 text-[10px] font-extrabold tabular-nums ${
                            idx === 0
                              ? 'bg-[#4A3894] text-white'
                              : 'bg-[#F5F0FC] text-[#4A3894] dark:bg-[#15151C] dark:text-[#C5B2EA]'
                          }`}
                        >
                          #{idx + 1}
                        </span>
                        <span className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400 tabular-nums">
                          {bs.soldCount} {isAr ? 'مباع' : 'sold'}
                        </span>
                      </div>
                      <div className="mt-2 flex h-16 w-full items-center justify-center rounded-xl bg-[#F9F5FD] dark:bg-[#15151C] overflow-hidden">
                        <ProductArtwork
                          imageKey={bs.imageKey}
                          imageUrl={bs.imageUrl}
                          categoryId={bs.listing?.categoryId}
                          alt={bs.productName}
                          className="h-14 w-14"
                        />
                      </div>
                      <div className="mt-2 truncate font-display text-xs font-bold text-[#1E1438] dark:text-white">
                        {bs.productName}
                      </div>
                      <div className="truncate text-[10px] text-[#5E5C70] dark:text-[#B9B0D8]">
                        {bs.storeName}
                      </div>
                    </button>
                    <div className="mt-2 flex items-center justify-between gap-1">
                      <span className="font-display text-xs font-extrabold tabular-nums">
                        {formatDzd(bs.price, lang)}
                      </span>
                      {bs.listing && (
                        <button
                          type="button"
                          disabled={
                            bs.listing.availabilityStatus === 'out_of_stock' ||
                            !bs.listing.storeIsOpen
                          }
                          onClick={() => onAddToCart(bs.listing!)}
                          aria-label={`Add ${bs.productName}`}
                          className="flex h-6 w-6 items-center justify-center rounded-full bg-[#4A3894] text-white disabled:opacity-35 cursor-pointer"
                        >
                          <Plus className="h-3 w-3" />
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {!isFiltering && (
        <div className="space-y-2.5">
          <div className="rounded-3xl bg-gradient-to-br from-[#4A3894] to-[#9678CE] p-5 text-white shadow-sm">
            <h2 className="font-display text-xl font-extrabold leading-tight">
              {dict.promoHeadline}
            </h2>
            <p className="mt-1 text-xs text-[#FBEFFB]">
              {dict.promoBody}
            </p>
            <button
              type="button"
              onClick={() => {
                const el = document.getElementById('phone-products-section');
                el?.scrollIntoView({ behavior: 'smooth' });
              }}
              className="mt-3.5 inline-flex items-center gap-2 rounded-full bg-white ps-4 pe-2 py-1.5 text-xs font-extrabold text-[#4A3894] cursor-pointer"
            >
              <span>{dict.exploreCta}</span>
              <span className="flex h-5 w-5 items-center justify-center rounded-full bg-[#4A3894] text-white">
                <ArrowRight className="h-3 w-3 rtl:rotate-180" />
              </span>
            </button>
          </div>

          <div className="rounded-2xl border border-[#E4DCF7] bg-[#FBEFFB] p-4 text-[#1E1438] shadow-sm dark:border-[#22222C] dark:bg-[#15151C] dark:text-white">
            <div className="text-[10px] font-bold uppercase tracking-wider text-[#4A3894] dark:text-[#E794C9]">
              {isAr ? 'شبكة بائعي الجلفة' : 'Djelfa Seller Network'}
            </div>
            <h3 className="font-display mt-1 text-base font-extrabold">
              {isAr ? 'انضم وابدأ البيع اليوم' : 'Join & Start Selling Today'}
            </h3>
            <p className="mt-1 text-[11px] leading-relaxed text-[#5E5C70] dark:text-[#B9B0D8]">
              {isAr
                ? 'أنشئ واجهة متجرك خلال ثوانٍ وأدر المنتجات والإحصائيات ورمز QR.'
                : 'Create your seller storefront in seconds and manage products, analytics & QR access.'}
            </p>
            <button
              type="button"
              onClick={() => onOpenPartnerRegister('online_page')}
              className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-full bg-[#4A3894] px-4 py-2 text-xs font-extrabold text-white cursor-pointer"
            >
              <span>{isAr ? 'افتح متجرك الآن' : 'Join & Start Selling Today'}</span>
              <ArrowRight className="h-3.5 w-3.5 rtl:rotate-180" />
            </button>
          </div>
        </div>
      )}

      {/* 5. Local Stores List & Map */}
      <section className="space-y-2.5">
        <div className="flex items-center justify-between gap-2">
          <h3 className="font-display text-sm font-extrabold">
            {stores.length} Local Sellers
          </h3>
          <div className="inline-flex rounded-full border border-[#E4E4F0] bg-white p-0.5 text-[10px] font-semibold dark:border-[#22222C] dark:bg-[#0E0E13]">
            <button
              type="button"
              onClick={() => setShopsMode('list')}
              className={`rounded-full px-2.5 py-1 cursor-pointer ${
                shopsMode === 'list' ? 'bg-[#13111C] text-white dark:bg-[#6E65F6]' : 'text-[#5E5C70]'
              }`}
            >
              List
            </button>
            <button
              type="button"
              onClick={() => setShopsMode('map')}
              className={`rounded-full px-2.5 py-1 cursor-pointer ${
                shopsMode === 'map' ? 'bg-[#13111C] text-white dark:bg-[#6E65F6]' : 'text-[#5E5C70]'
              }`}
            >
              Map
            </button>
          </div>
        </div>

        {(() => {
          const filteredChannelStores = stores;
          if (shopsMode === 'map') {
            return (
                <ElOuedMap
                  stores={filteredChannelStores}
                  areas={areas}
                  selectedLocation={activeCoords}
                  onSelectStore={onOpenStore}
                  lang={lang}
                />
              );
            }
            return (
              <div className="space-y-2">
                {filteredChannelStores.map((store, idx) => {
                  const isOnline = store.storeType === 'online_page';
                  return (
                    <button
                      key={store.id}
                      type="button"
                      onClick={() => onOpenStore(store.slug)}
                      className="flex w-full items-center justify-between gap-3 rounded-2xl border border-[#E4DCF7] bg-white p-3 text-start transition hover:border-[#4A3894] dark:border-[#22222C] dark:bg-[#0E0E13] cursor-pointer"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-[#F5F0FC] text-[#4A3894] dark:bg-[#15151C] dark:text-[#C5B2EA]">
                          {store.logoUrl ? (
                            <img
                              src={store.logoUrl}
                              alt={store.name}
                              referrerPolicy="no-referrer"
                              className="h-full w-full object-cover"
                            />
                          ) : isOnline ? (
                            <Globe className="h-5 w-5" />
                          ) : (
                            <StoreIcon className="h-5 w-5" />
                          )}
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5">
                            <span className="truncate font-display text-sm font-bold text-[#1E1438] dark:text-white">
                              {store.name}
                            </span>
                            {idx === 0 && (
                              <span className="shrink-0 rounded-md bg-[#4A3894] px-1.5 py-0.5 text-[9px] font-extrabold text-white">
                                #1 Top
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-1.5 text-[11px] text-[#5E5C70] dark:text-[#B9B0D8]">
                            <span className="font-semibold text-[#4A3894] dark:text-[#E794C9]">
                              {isOnline
                                ? isAr
                                  ? 'صفحة أونلاين'
                                  : 'Online Page'
                                : isAr
                                  ? 'متجر فعلي'
                                  : 'Physical'}
                            </span>
                            <span>·</span>
                            <span>{getAreaDisplayName(store.area, lang)}</span>
                            <span>·</span>
                            <span className="inline-flex items-center gap-0.5">
                              <Star className="h-3 w-3 fill-amber-400 text-amber-400" />
                              {store.rating} ({store.reviewCount})
                            </span>
                          </div>
                        <div className="text-[10px] text-[#5E5C70] dark:text-[#9D9BB0]">
                          {store.productCount || 0} products · {store.openingHours}
                          {store.deliveryFee !== undefined && ` · Delivery ${formatDzd(store.deliveryFee, lang)}`}
                        </div>
                      </div>
                    </div>

                    <span
                      className={`shrink-0 rounded-lg px-2.5 py-1 text-[11px] font-bold ${
                        store.isOpen
                          ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400'
                          : 'bg-[#F4F5FB] text-[#5E5C70] dark:bg-[#15151C] dark:text-[#9D9BB0]'
                      }`}
                    >
                      {store.isOpen ? dict.openStatus : dict.closedStatus}
                    </span>
                  </button>
                );
              })}
            </div>
          );
        })()}
      </section>

      {/* 6. Compact 2-Column Product Comparison Grid */}
      <section id="phone-products-section" className="space-y-2.5 pt-1">
        <div className="flex items-center justify-between">
          <h3 className="font-display text-sm font-extrabold">
            Products &amp; Price Compare ({listings.length})
          </h3>
        </div>

        {loadingMarket ? (
          <div className="grid grid-cols-2 gap-2.5">
            {[1, 2, 3, 4].map((n) => (
              <div key={n} className="h-48 animate-pulse rounded-2xl bg-white dark:bg-[#0E0E13]" />
            ))}
          </div>
        ) : listings.length === 0 ? (
          <div className="rounded-2xl border border-[#E4E4F0] bg-white p-6 text-center text-xs text-[#5E5C70] dark:border-[#22222C] dark:bg-[#0E0E13]">
            No matching products found. Try clearing filters.
          </div>
        ) : (
          <LayoutGroup id="phone-product-grid">
            <div className="grid grid-cols-2 gap-2.5">
              <AnimatePresence mode="popLayout">
                {listings.map((item) => {
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
                      className="flex flex-col justify-between rounded-2xl border border-[#E4E4F0] bg-white p-2.5 dark:border-[#22222C] dark:bg-[#0E0E13]"
                    >
                  <div>
                    <button
                      type="button"
                      onClick={() => onCompareProduct(item.productSlug)}
                      className="relative flex h-24 w-full items-center justify-center rounded-xl bg-[#F4F5FB] dark:bg-[#15151C] overflow-hidden cursor-pointer"
                    >
                      <ProductArtwork
                        imageKey={item.imageKey}
                        imageUrl={item.imageUrl}
                        categoryId={item.categoryId}
                        alt={item.productName}
                        className="h-20 w-20"
                      />
                      {item.isLowestPrice && (
                        <span className="absolute start-2 top-1.5 rounded bg-white/90 px-1 text-[9px] font-extrabold uppercase text-[#4A3894]">
                          {dict.lowestPriceTag}
                        </span>
                      )}
                    </button>

                    <div className="mt-2 truncate text-[10px] font-medium text-[#5E5C70] dark:text-[#B9B0D8]">
                      {item.storeName}
                      {item.distanceKm !== null ? ` · ${item.distanceKm} km` : ''}
                    </div>
                    <button
                      type="button"
                      onClick={() => onCompareProduct(item.productSlug)}
                      className="mt-0.5 block w-full truncate text-start font-display text-xs font-bold text-[#1E1438] dark:text-white cursor-pointer"
                    >
                      {item.productName}
                    </button>
                    <div
                      className={`text-[10px] font-semibold ${
                        item.availabilityStatus === 'in_stock'
                          ? 'text-emerald-600 dark:text-emerald-400'
                          : item.availabilityStatus === 'unconfirmed'
                            ? 'text-amber-600 dark:text-amber-400'
                            : 'text-rose-600 dark:text-rose-400'
                      }`}
                    >
                      {item.availabilityStatus === 'in_stock'
                        ? dict.inStock
                        : item.availabilityStatus === 'unconfirmed'
                          ? dict.unconfirmed
                          : dict.outOfStock}{' '}
                      · {formatRelativeTime(item.availabilityUpdatedAt, lang)}
                    </div>
                  </div>

                  <div className="mt-2.5 flex items-center justify-between gap-1">
                    <span className="font-display text-sm font-extrabold tabular-nums">
                      {formatDzd(item.price, lang)}
                    </span>
                    <button
                      type="button"
                      disabled={disabled}
                      onClick={() => onAddToCart(item)}
                      aria-label={`Add ${item.productName}`}
                      className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#4A3894] text-white disabled:opacity-35 cursor-pointer"
                    >
                      {item.storeOfferCount > 1 ? (
                        <Plus className="h-3.5 w-3.5" />
                      ) : (
                        <ShoppingBag className="h-3.5 w-3.5" />
                      )}
                    </button>
                  </div>
                    </motion.article>
                  );
                })}
              </AnimatePresence>
            </div>
          </LayoutGroup>
        )}
      </section>
    </div>
  );
};
