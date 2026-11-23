import React, { useEffect, useState } from 'react';
import { CheckCircle2, Clock, Heart, Package, Store as StoreIcon, Truck } from 'lucide-react';
import type { EnrichedListing, Favorite, LanguageCode, Order, PublicUser, Store } from '../../shared/types.ts';
import { getAreaDisplayName } from '../../shared/locationConfig.ts';
import { apiFetch } from '../lib/api.ts';
import { formatDzd, formatRelativeTime } from '../lib/format.ts';

interface OrdersFavoritesViewProps {
  user: PublicUser | null;
  orders: Order[];
  favorites: Favorite[];
  stores: Store[];
  listings: EnrichedListing[];
  lang: LanguageCode;
  onRefreshOrders: () => void;
  onOpenStore: (slug: string) => void;
  onCompareProduct: (slug: string) => void;
  onOpenAuth: () => void;
}

const DELIVERY_STEPS = ['new', 'accepted', 'looking', 'onway', 'done'] as const;
const PICKUP_STEPS = ['new', 'accepted', 'ready', 'done'] as const;

export const OrdersFavoritesView: React.FC<OrdersFavoritesViewProps> = ({
  user,
  orders: propOrders,
  favorites,
  stores,
  listings,
  lang,
  onRefreshOrders,
  onOpenStore,
  onCompareProduct,
  onOpenAuth,
}) => {
  const isAr = lang === 'ar';
  const [serverOrders, setServerOrders] = useState<Order[]>([]);
  const [tab, setTab] = useState<'orders' | 'favorites'>('orders');

  useEffect(() => {
    if (!user) return;
    apiFetch<{ orders: Order[] }>('/api/orders/my')
      .then((res) => setServerOrders(res.orders))
      .catch(() => {});
  }, [user, propOrders]);

  const mergedOrders = React.useMemo(() => {
    const map = new Map<string, Order>();
    for (const o of propOrders) map.set(o.id, o);
    for (const o of serverOrders) map.set(o.id, o);
    return Array.from(map.values()).sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
  }, [propOrders, serverOrders]);

  const favStores = stores.filter((s) =>
    favorites.some((f) => f.type === 'store' && f.targetId === s.id)
  );
  const favProductIds = new Set(
    favorites.filter((f) => f.type === 'product').map((f) => f.targetId)
  );
  const favProducts = Array.from(
    new Map(listings.filter((l) => favProductIds.has(l.productId)).map((l) => [l.productId, l])).values()
  );

  const stepLabel = (step: string) => {
    if (!isAr) {
      if (step === 'looking') return 'Finding driver';
      if (step === 'onway') return 'On the way';
      return step;
    }
    switch (step) {
      case 'new':
        return 'جديد';
      case 'accepted':
        return 'تم القبول';
      case 'looking':
        return 'بحث عن سائق';
      case 'onway':
        return 'في الطريق';
      case 'ready':
        return 'جاهز للاستلام';
      case 'done':
        return 'مكتمل';
      default:
        return step;
    }
  };

  return (
    <section dir={isAr ? 'rtl' : 'ltr'} className="mx-auto max-w-4xl space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold text-[#1E1438] sm:text-3xl dark:text-white">
            {isAr ? 'الطلبات والمفضلة' : 'Orders & Saved Items'}
          </h1>
          <p className="text-sm text-[#5E5C70] dark:text-[#B9B0D8]">
            {isAr
              ? 'تتبع التحضير المباشر وتعيين السائق ورمز التأكيد المكون من 4 أرقام.'
              : 'Track live preparation, driver assignment, and 4-digit confirmation codes.'}
          </p>
        </div>

        <div className="flex items-center gap-2 rounded-full border border-[#E4DCF7] bg-white p-1 dark:border-[#22222C] dark:bg-[#0E0E13]">
          <button
            type="button"
            onClick={() => setTab('orders')}
            className={`rounded-full px-4 py-1.5 text-xs font-semibold transition cursor-pointer ${
              tab === 'orders'
                ? 'bg-[#4A3894] text-white'
                : 'text-[#5E5C70] dark:text-[#B9B0D8]'
            }`}
          >
            {isAr ? `الطلبات (${mergedOrders.length})` : `Orders (${mergedOrders.length})`}
          </button>
          <button
            type="button"
            onClick={() => setTab('favorites')}
            className={`rounded-full px-4 py-1.5 text-xs font-semibold transition cursor-pointer ${
              tab === 'favorites'
                ? 'bg-[#4A3894] text-white'
                : 'text-[#5E5C70] dark:text-[#B9B0D8]'
            }`}
          >
            {isAr
              ? `المفضلة (${favStores.length + favProducts.length})`
              : `Favorites (${favStores.length + favProducts.length})`}
          </button>
        </div>
      </div>

      {tab === 'orders' ? (
        <div className="space-y-4">
          <div className="flex justify-end">
            <button
              type="button"
              onClick={onRefreshOrders}
              className="text-xs font-semibold text-[#4A3894] hover:underline dark:text-[#C5B2EA] cursor-pointer"
            >
              {isAr ? 'تحديث الحالة' : 'Refresh status'}
            </button>
          </div>

          {mergedOrders.length === 0 ? (
            <div className="rounded-3xl border border-[#E4DCF7] bg-white p-10 text-center dark:border-[#22222C] dark:bg-[#0E0E13]">
              <Package className="mx-auto h-10 w-10 text-[#9678CE]" />
              <h3 className="font-display mt-3 text-lg font-bold text-[#1E1438] dark:text-white">
                {isAr ? 'لا توجد طلبات بعد' : 'No orders yet'}
              </h3>
              <p className="mt-1 text-sm text-[#5E5C70] dark:text-[#B9B0D8]">
                {user
                  ? isAr
                    ? 'أضف منتجات إلى سلتك من متاجر الجلفة القريبة لإتمام أول طلب.'
                    : 'Add products to your cart from nearby Djelfa stores to place your first order.'
                  : isAr
                    ? 'اطلب منتجاً أو سجل الدخول لعرض سجل طلباتك المحفوظ.'
                    : 'Place an order or sign in to view your saved order history.'}
              </p>
              {!user && (
                <button
                  type="button"
                  onClick={onOpenAuth}
                  className="mt-4 rounded-full bg-[#4A3894] px-5 py-2.5 text-xs font-bold text-white hover:bg-[#3A2B78] cursor-pointer"
                >
                  {isAr ? 'تسجيل الدخول' : 'Sign In'}
                </button>
              )}
            </div>
          ) : (
            mergedOrders.map((order) => {
              const steps = order.fulfillmentType === 'delivery' ? DELIVERY_STEPS : PICKUP_STEPS;
              const currentIdx = steps.indexOf(order.orderStatus as never);

              return (
                <div
                  key={order.id}
                  className="rounded-3xl border border-[#E4DCF7] bg-white p-6 dark:border-[#22222C] dark:bg-[#0E0E13]"
                >
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div>
                      <div className="flex items-center gap-2 text-xs text-[#5E5C70] dark:text-[#B9B0D8]">
                        <span className="font-display font-bold text-[#1E1438] tabular-nums dark:text-white">
                          {order.orderNumber}
                        </span>
                        <span>·</span>
                        <span>{formatRelativeTime(order.createdAt, lang)}</span>
                        <span>·</span>
                        <span className="inline-flex items-center gap-1 font-medium text-[#4A3894] dark:text-[#C5B2EA]">
                          {order.fulfillmentType === 'delivery' ? (
                            <Truck className="h-3.5 w-3.5" />
                          ) : (
                            <StoreIcon className="h-3.5 w-3.5" />
                          )}
                          {order.fulfillmentType === 'delivery'
                            ? isAr
                              ? 'توصيل محلي'
                              : 'Local Delivery'
                            : isAr
                              ? 'استلام من المتجر'
                              : 'In-Store Pickup'}
                        </span>
                      </div>
                      <h3 className="font-display mt-1 text-lg font-bold text-[#1E1438] dark:text-white">
                        {order.storeName}
                      </h3>
                      <p className="text-xs text-[#5E5C70] dark:text-[#B9B0D8]">
                        {order.deliveryAddress}
                      </p>
                    </div>

                    <div className="text-end">
                      <div className="font-display text-xl font-extrabold text-[#1E1438] tabular-nums dark:text-white">
                        {formatDzd(order.total, lang)}
                      </div>
                      <div className="text-xs text-[#5E5C70] dark:text-[#B9B0D8]">
                        {order.paymentMethod === 'cash_on_delivery'
                          ? isAr
                            ? 'الدفع عند الاستلام'
                            : 'Cash on delivery'
                          : isAr
                            ? 'الدفع في المتجر'
                            : 'Cash at shop'}
                      </div>
                    </div>
                  </div>

                  {/* Lifecycle stepper */}
                  {order.orderStatus === 'rejected' ? (
                    <div className="mt-4 rounded-xl bg-rose-50 px-4 py-2.5 text-xs font-semibold text-rose-700 dark:bg-rose-950/40 dark:text-rose-300">
                      {isAr ? 'تم رفض الطلب من قبل التاجر' : 'Order declined by merchant'}
                    </div>
                  ) : (
                    <div className="mt-5 grid grid-cols-4 gap-2 sm:grid-cols-5">
                      {steps.map((step, idx) => {
                        const active = idx <= currentIdx;
                        return (
                          <div key={step} className="space-y-1.5">
                            <div
                              className={`h-1.5 rounded-full transition-colors ${
                                active ? 'bg-[#4A3894] dark:bg-[#9678CE]' : 'bg-[#E4DCF7] dark:bg-[#22222C]'
                              }`}
                            />
                            <div
                              className={`text-[11px] font-semibold capitalize ${
                                active
                                  ? 'text-[#1E1438] dark:text-white'
                                  : 'text-[#5E5C70]/60 dark:text-[#B9B0D8]/50'
                              }`}
                            >
                              {stepLabel(step)}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  <div className="mt-4 flex flex-wrap items-center justify-between gap-4 border-t border-[#E4DCF7] pt-4 text-xs dark:border-[#22222C]">
                    <div className="space-y-1 text-[#5E5C70] dark:text-[#B9B0D8]">
                      {order.items.map((item) => (
                        <div key={item.id}>
                          {item.quantity} × {item.productNameSnapshot} ({formatDzd(item.subtotal, lang)})
                        </div>
                      ))}
                      {order.driverName && (
                        <div className="font-semibold text-[#4A3894] dark:text-[#C5B2EA]">
                          {isAr ? 'السائق' : 'Driver'}: {order.driverName} ({order.driverVehicle})
                        </div>
                      )}
                    </div>

                    {order.customerConfirmationCode &&
                      order.orderStatus !== 'done' &&
                      order.orderStatus !== 'rejected' && (
                        <div className="rounded-2xl bg-[#4A3894] px-4 py-2 text-white">
                          <span className="me-2 text-[11px] text-[#E9DFF9]">
                            {isAr ? 'رمز التأكيد' : 'Confirmation Code'}
                          </span>
                          <span className="font-display text-base font-extrabold tracking-widest text-[#FBEFFB] tabular-nums">
                            {order.customerConfirmationCode}
                          </span>
                        </div>
                      )}

                    {order.orderStatus === 'done' && (
                      <span className="inline-flex items-center gap-1.5 font-semibold text-emerald-700 dark:text-emerald-400">
                        <CheckCircle2 className="h-4 w-4" />
                        <span>{isAr ? 'مكتمل' : 'Completed'}</span>
                      </span>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>
      ) : (
        <div className="space-y-6">
          {!user ? (
            <div className="rounded-3xl border border-[#E4DCF7] bg-white p-8 text-center dark:border-[#22222C] dark:bg-[#0E0E13]">
              <Heart className="mx-auto h-8 w-8 text-[#9678CE]" />
              <p className="mt-2 text-sm text-[#5E5C70] dark:text-[#B9B0D8]">
                {isAr
                  ? 'سجل الدخول لحفظ المتاجر والمنتجات المفضلة.'
                  : 'Sign in or select a demo profile to save favorite stores and products.'}
              </p>
              <button
                type="button"
                onClick={onOpenAuth}
                className="mt-4 rounded-full bg-[#4A3894] px-5 py-2 text-xs font-bold text-white hover:bg-[#3A2B78] cursor-pointer"
              >
                {isAr ? 'تسجيل الدخول' : 'Sign In'}
              </button>
            </div>
          ) : (
            <>
              <div>
                <h3 className="font-display mb-3 text-base font-bold text-[#1E1438] dark:text-white">
                  {isAr ? `المتاجر المحفوظة (${favStores.length})` : `Saved Shops (${favStores.length})`}
                </h3>
                {favStores.length === 0 ? (
                  <p className="text-xs text-[#5E5C70] dark:text-[#B9B0D8]">
                    {isAr ? 'لا توجد متاجر محفوظة بعد.' : 'No saved shops yet.'}
                  </p>
                ) : (
                  <div className="grid gap-3 sm:grid-cols-2">
                    {favStores.map((s) => (
                      <button
                        key={s.id}
                        type="button"
                        onClick={() => onOpenStore(s.slug)}
                        className="flex items-center justify-between rounded-2xl border border-[#E4DCF7] bg-white p-4 text-start transition hover:border-[#4A3894] dark:border-[#22222C] dark:bg-[#0E0E13] cursor-pointer"
                      >
                        <div>
                          <div className="font-display font-bold text-[#1E1438] dark:text-white">
                            {s.name}
                          </div>
                          <div className="text-xs text-[#5E5C70] dark:text-[#B9B0D8]">
                            {getAreaDisplayName(s.area, lang)} · {s.openingHours}
                          </div>
                        </div>
                        <Clock className="h-4 w-4 text-[#9678CE]" />
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <div>
                <h3 className="font-display mb-3 text-base font-bold text-[#1E1438] dark:text-white">
                  {isAr ? `المنتجات المحفوظة (${favProducts.length})` : `Saved Products (${favProducts.length})`}
                </h3>
                {favProducts.length === 0 ? (
                  <p className="text-xs text-[#5E5C70] dark:text-[#B9B0D8]">
                    {isAr ? 'لا توجد منتجات محفوظة بعد.' : 'No saved products yet.'}
                  </p>
                ) : (
                  <div className="grid gap-3 sm:grid-cols-2">
                    {favProducts.map((p) => (
                      <button
                        key={p.productId}
                        type="button"
                        onClick={() => onCompareProduct(p.productSlug)}
                        className="flex items-center justify-between rounded-2xl border border-[#E4DCF7] bg-white p-4 text-start transition hover:border-[#4A3894] dark:border-[#22222C] dark:bg-[#0E0E13] cursor-pointer"
                      >
                        <div>
                          <div className="font-display font-bold text-[#1E1438] dark:text-white">
                            {p.productName}
                          </div>
                          <div className="text-xs text-[#5E5C70] dark:text-[#B9B0D8]">
                            {p.brand} · {isAr ? 'ابتداءً من' : 'From'} {formatDzd(p.price, lang)}
                          </div>
                        </div>
                        <span className="text-xs font-semibold text-[#4A3894] dark:text-[#E794C9]">
                          {isAr ? 'مقارنة' : 'Compare'}
                        </span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      )}
    </section>
  );
};
