import React, { useState } from 'react';
import { CheckCircle2, Minus, Plus, ShoppingBag, Store, Trash2, Truck, X } from 'lucide-react';
import type { FulfillmentType, LanguageCode, Order, PaymentMethod, PublicUser } from '../../shared/types.ts';
import { apiFetch } from '../lib/api.ts';
import { formatDzd } from '../lib/format.ts';
import { t } from '../lib/i18n.ts';
import { ProductArtwork } from './ProductArtwork.tsx';

export interface CartItem {
  listingId: string;
  productId: string;
  productName: string;
  brand: string;
  imageKey: string;
  imageUrl?: string | null;
  categoryId?: string;
  price: number;
  quantity: number;
  storeId: string;
  storeName: string;
  storeDeliveryFee?: number;
  storeDeliveryZones?: string[];
}

interface CartCheckoutDrawerProps {
  open: boolean;
  onClose: () => void;
  cart: CartItem[];
  onUpdateQty: (listingId: string, delta: number) => void;
  onRemoveItem: (listingId: string) => void;
  onClearCart: () => void;
  user: PublicUser | null;
  lang: LanguageCode;
  onOrderCreated: (order: Order) => void;
  notify: (msg: string, type?: 'success' | 'error') => void;
}

export const CartCheckoutDrawer: React.FC<CartCheckoutDrawerProps> = ({
  open,
  onClose,
  cart,
  onUpdateQty,
  onRemoveItem,
  onClearCart,
  user,
  lang,
  onOrderCreated,
  notify,
}) => {
  const isAr = lang === 'ar';
  const dict = t(lang);
  const [fulfillment, setFulfillment] = useState<FulfillmentType>('delivery');
  const [customerName, setCustomerName] = useState(user?.fullName || '');
  const [customerPhone, setCustomerPhone] = useState(user?.phone || '');
  const [deliveryAddress, setDeliveryAddress] = useState(
    isAr
      ? '28 شارع جيش التحرير الوطني، الجلفة'
      : "28 Boulevard de l'ALN, Centre-Ville, Djelfa"
  );
  const [submitting, setSubmitting] = useState(false);
  const [confirmedOrder, setConfirmedOrder] = useState<Order | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  React.useEffect(() => {
    if (user) {
      setCustomerName((prev) => prev || user.fullName);
      setCustomerPhone((prev) => prev || user.phone);
    }
  }, [user]);

  if (!open) return null;

  const storeId = cart[0]?.storeId || '';
  const storeName = cart[0]?.storeName || '';
  const storeZones = cart[0]?.storeDeliveryZones || [];
  const configuredFee = cart[0]?.storeDeliveryFee ?? 200;
  const subtotal = cart.reduce((sum, item) => sum + item.price * item.quantity, 0);
  const deliveryFee = fulfillment === 'delivery' && cart.length > 0 ? configuredFee : 0;
  const total = subtotal + deliveryFee;

  const handleCheckout = async (e: React.FormEvent) => {
    e.preventDefault();
    if (cart.length === 0) return;
    setErrorMsg(null);
    setSubmitting(true);
    try {
      const paymentMethod: PaymentMethod =
        fulfillment === 'delivery' ? 'cash_on_delivery' : 'cash_at_shop';
      const res = await apiFetch<{ order: Order }>('/api/orders', {
        method: 'POST',
        body: JSON.stringify({
          storeId,
          fulfillmentType: fulfillment,
          paymentMethod,
          customerName: customerName.trim(),
          customerPhone: customerPhone.trim(),
          deliveryAddress: fulfillment === 'delivery' ? deliveryAddress.trim() : '',
          items: cart.map((c) => ({
            storeProductId: c.listingId,
            quantity: c.quantity,
          })),
        }),
      });
      setConfirmedOrder(res.order);
      onClearCart();
      onOrderCreated(res.order);
      notify(
        isAr
          ? `تم تأكيد الطلب ${res.order.orderNumber}!`
          : `Order ${res.order.orderNumber} confirmed!`
      );
    } catch (err) {
      setErrorMsg(
        err instanceof Error
          ? err.message
          : isAr
            ? 'تعذر إتمام الطلب.'
            : 'Checkout failed.'
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      dir={isAr ? 'rtl' : 'ltr'}
      className="fixed inset-0 z-50 flex justify-end bg-black/45 backdrop-blur-xs"
    >
      <div className="flex h-full w-full max-w-md flex-col border-s border-[#E4DCF7] bg-white shadow-2xl dark:border-[#22222C] dark:bg-[#0E0E13]">
        <div className="marketly-awning shrink-0" />
        <div className="flex items-center justify-between border-b border-[#E4DCF7] px-6 py-4 dark:border-[#22222C]">
          <div className="flex items-center gap-2.5">
            <ShoppingBag className="h-5 w-5 text-[#4A3894] dark:text-[#9678CE]" />
            <h2 className="font-display text-lg font-bold text-[#1E1438] dark:text-white">
              {confirmedOrder
                ? isAr
                  ? `الطلب ${confirmedOrder.orderNumber}`
                  : `Order ${confirmedOrder.orderNumber}`
                : dict.cartButton}
            </h2>
          </div>
          <button
            type="button"
            onClick={() => {
              setConfirmedOrder(null);
              onClose();
            }}
            aria-label={isAr ? 'إغلاق السلة' : 'Close cart'}
            className="rounded-full p-2 text-[#5E5C70] hover:bg-[#F5F0FC] dark:text-[#B9B0D8] dark:hover:bg-[#15151C] cursor-pointer"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6">
          {confirmedOrder ? (
            <div className="space-y-5">
              <div className="rounded-3xl bg-[#4A3894] p-6 text-white">
                <div className="flex items-center gap-2 text-[#FBEFFB]">
                  <CheckCircle2 className="h-5 w-5" />
                  <span className="text-xs font-bold uppercase tracking-wider">
                    {isAr ? 'تم التأكيد' : 'Confirmed'}
                  </span>
                </div>
                <h3 className="font-display mt-2 text-2xl font-bold tabular-nums">
                  {confirmedOrder.orderNumber}
                </h3>
                <p className="mt-1 text-sm text-[#E9DFF9]">
                  {isAr
                    ? `تم الإرسال إلى ${confirmedOrder.storeName}. شارك هذا الرمز فقط عند استلام طلبك:`
                    : `Sent to ${confirmedOrder.storeName}. Share this 4-digit code only when you receive your order:`}
                </p>
                {confirmedOrder.customerConfirmationCode && (
                  <div className="mt-4 inline-flex items-center gap-3 rounded-2xl bg-white/15 px-4 py-2.5">
                    <span className="text-xs text-[#E9DFF9]">
                      {isAr ? 'رمز الاستلام / التوصيل' : 'Delivery / Pickup Code'}
                    </span>
                    <span className="font-display text-2xl font-extrabold tracking-widest text-[#FBEFFB] tabular-nums">
                      {confirmedOrder.customerConfirmationCode}
                    </span>
                  </div>
                )}
              </div>

              <div className="rounded-2xl border border-[#E4DCF7] p-4 dark:border-[#22222C]">
                <div className="text-xs font-semibold uppercase tracking-wider text-[#5E5C70] dark:text-[#B9B0D8]">
                  {isAr ? 'ملخص الفاتورة' : 'Receipt Summary'}
                </div>
                <div className="mt-3 space-y-2 text-sm">
                  {confirmedOrder.items.map((item) => (
                    <div key={item.id} className="flex justify-between">
                      <span>
                        {item.quantity} × {item.productNameSnapshot}
                      </span>
                      <span className="font-semibold tabular-nums">
                        {formatDzd(item.subtotal, lang)}
                      </span>
                    </div>
                  ))}
                  {confirmedOrder.deliveryFee > 0 && (
                    <div className="flex justify-between text-[#5E5C70] dark:text-[#B9B0D8]">
                      <span>{isAr ? 'رسوم التوصيل المحلي' : 'Local delivery fee'}</span>
                      <span className="tabular-nums">{formatDzd(confirmedOrder.deliveryFee, lang)}</span>
                    </div>
                  )}
                  <div className="font-display flex justify-between border-t border-[#E4DCF7] pt-2 text-base font-bold dark:border-[#22222C]">
                    <span>
                      {isAr ? 'الإجمالي' : 'Total'} (
                      {confirmedOrder.paymentMethod === 'cash_on_delivery'
                        ? dict.cashOnDelivery
                        : dict.cashAtShop}
                      )
                    </span>
                    <span className="tabular-nums">{formatDzd(confirmedOrder.total, lang)}</span>
                  </div>
                </div>
              </div>

              <button
                type="button"
                onClick={() => {
                  setConfirmedOrder(null);
                  onClose();
                }}
                className="w-full rounded-full bg-[#4A3894] py-3 text-sm font-bold text-white transition hover:bg-[#3A2B78] cursor-pointer"
              >
                {isAr ? 'متابعة في الطلبات' : 'Track in Orders'}
              </button>
            </div>
          ) : cart.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <div className="flex h-16 w-16 items-center justify-center rounded-full bg-[#F5F0FC] text-[#4A3894] dark:bg-[#15151C] dark:text-[#9678CE]">
                <ShoppingBag className="h-7 w-7" />
              </div>
              <h3 className="font-display mt-4 text-lg font-bold text-[#1E1438] dark:text-white">
                {isAr ? 'سلة التسوق فارغة' : 'Your cart is empty'}
              </h3>
              <p className="mt-1 max-w-xs text-sm text-[#5E5C70] dark:text-[#B9B0D8]">
                {isAr
                  ? 'ابحث عن المنتجات عبر متاجر الجلفة وأضف منتجات من متجر واحد لكل طلب.'
                  : 'Search local products across Djelfa shops and add items from a single store per order.'}
              </p>
            </div>
          ) : (
            <form onSubmit={handleCheckout} className="space-y-6">
              <div className="flex items-center justify-between rounded-2xl bg-[#F5F0FC] px-4 py-3 dark:bg-[#15151C]">
                <div>
                  <div className="text-xs text-[#5E5C70] dark:text-[#B9B0D8]">
                    {isAr ? 'الطلب من متجر' : 'Ordering from'}
                  </div>
                  <div className="font-display text-sm font-bold text-[#1E1438] dark:text-white">
                    {storeName}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={onClearCart}
                  className="text-xs font-semibold text-rose-600 hover:underline cursor-pointer"
                >
                  {isAr ? 'إفراغ السلة' : 'Clear'}
                </button>
              </div>

              <div className="space-y-3">
                {cart.map((item) => (
                  <div
                    key={item.listingId}
                    className="flex items-center gap-3 rounded-2xl border border-[#E4DCF7] p-3 dark:border-[#22222C]"
                  >
                    <div className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-[#F9F5FD] dark:bg-[#15151C]">
                      <ProductArtwork
                        imageKey={item.imageKey}
                        imageUrl={item.imageUrl}
                        categoryId={item.categoryId}
                        alt={item.productName}
                        className="h-12 w-12"
                      />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-semibold text-[#1E1438] dark:text-white">
                        {item.productName}
                      </div>
                      <div className="text-xs text-[#5E5C70] tabular-nums dark:text-[#B9B0D8]">
                        {formatDzd(item.price, lang)}
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => onUpdateQty(item.listingId, -1)}
                        aria-label={isAr ? 'إنقاص الكمية' : 'Decrease quantity'}
                        className="flex h-7 w-7 items-center justify-center rounded-full border border-[#E4DCF7] hover:bg-[#F5F0FC] dark:border-[#22222C] dark:hover:bg-[#15151C] cursor-pointer"
                      >
                        <Minus className="h-3 w-3" />
                      </button>
                      <span className="w-6 text-center text-sm font-semibold tabular-nums">
                        {item.quantity}
                      </span>
                      <button
                        type="button"
                        onClick={() => onUpdateQty(item.listingId, 1)}
                        aria-label={isAr ? 'زيادة الكمية' : 'Increase quantity'}
                        className="flex h-7 w-7 items-center justify-center rounded-full border border-[#E4DCF7] hover:bg-[#F5F0FC] dark:border-[#22222C] dark:hover:bg-[#15151C] cursor-pointer"
                      >
                        <Plus className="h-3 w-3" />
                      </button>
                      <button
                        type="button"
                        onClick={() => onRemoveItem(item.listingId)}
                        aria-label={isAr ? 'إزالة المنتج' : 'Remove item'}
                        className="ms-1 p-1 text-[#5E5C70] hover:text-rose-600 cursor-pointer"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>

              <div>
                <label className="text-xs font-semibold uppercase tracking-wider text-[#5E5C70] dark:text-[#B9B0D8]">
                  {isAr ? 'طريقة الاستلام' : 'Fulfillment'}
                </label>
                <div className="mt-2 grid grid-cols-2 gap-2 rounded-2xl bg-[#F5F0FC] p-1.5 dark:bg-[#15151C]">
                  <button
                    type="button"
                    onClick={() => setFulfillment('delivery')}
                    className={`flex items-center justify-center gap-2 rounded-xl py-2.5 text-xs font-semibold transition cursor-pointer ${
                      fulfillment === 'delivery'
                        ? 'bg-[#4A3894] text-white'
                        : 'text-[#5E5C70] dark:text-[#B9B0D8]'
                    }`}
                  >
                    <Truck className="h-3.5 w-3.5" />
                    <span>{dict.delivery}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setFulfillment('pickup')}
                    className={`flex items-center justify-center gap-2 rounded-xl py-2.5 text-xs font-semibold transition cursor-pointer ${
                      fulfillment === 'pickup'
                        ? 'bg-[#4A3894] text-white'
                        : 'text-[#5E5C70] dark:text-[#B9B0D8]'
                    }`}
                  >
                    <Store className="h-3.5 w-3.5" />
                    <span>{dict.pickup}</span>
                  </button>
                </div>
              </div>

              <div className="space-y-3">
                <div>
                  <label className="block text-xs font-medium text-[#5E5C70] dark:text-[#B9B0D8]">
                    {isAr ? 'الاسم الكامل' : 'Full name'}
                  </label>
                  <input
                    required
                    value={customerName}
                    onChange={(e) => setCustomerName(e.target.value)}
                    placeholder={isAr ? 'مثال: أمينة بن علي' : 'e.g. Amina Benali'}
                    className="mt-1 w-full rounded-xl border border-[#E4DCF7] bg-white px-3.5 py-2.5 text-sm dark:border-[#22222C] dark:bg-[#15151C]"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-[#5E5C70] dark:text-[#B9B0D8]">
                    {isAr ? 'رقم الهاتف' : 'Phone number'}
                  </label>
                  <input
                    required
                    value={customerPhone}
                    onChange={(e) => setCustomerPhone(e.target.value)}
                    placeholder="0661 24 88 10"
                    className="mt-1 w-full rounded-xl border border-[#E4DCF7] bg-white px-3.5 py-2.5 text-sm dark:border-[#22222C] dark:bg-[#15151C]"
                  />
                </div>
                {fulfillment === 'delivery' && (
                  <div>
                    <label className="block text-xs font-medium text-[#5E5C70] dark:text-[#B9B0D8]">
                      {isAr ? 'عنوان التوصيل في الجلفة' : 'Delivery address in Djelfa'}
                    </label>
                    <input
                      required
                      value={deliveryAddress}
                      onChange={(e) => setDeliveryAddress(e.target.value)}
                      placeholder={
                        isAr ? 'الشارع، الحي، معلم قريب' : 'Street, neighborhood, landmark'
                      }
                      className="mt-1 w-full rounded-xl border border-[#E4DCF7] bg-white px-3.5 py-2.5 text-sm dark:border-[#22222C] dark:bg-[#15151C]"
                    />
                    {storeZones.length > 0 && (
                      <div className="mt-1.5 text-[11px] text-[#5E5C70] dark:text-[#B9B0D8]">
                        {isAr ? `نطاق توصيل ${storeName}:` : `${storeName} delivery zones:`}{' '}
                        <strong className="text-[#1E1438] dark:text-white">
                          {storeZones.join(', ')}
                        </strong>
                      </div>
                    )}
                  </div>
                )}
              </div>

              <div className="rounded-2xl bg-[#F5F0FC] p-4 text-sm dark:bg-[#15151C]">
                <div className="flex justify-between text-[#5E5C70] dark:text-[#B9B0D8]">
                  <span>{isAr ? 'المجموع الفرعي' : 'Subtotal'}</span>
                  <span className="tabular-nums">{formatDzd(subtotal, lang)}</span>
                </div>
                <div className="mt-1 flex justify-between text-[#5E5C70] dark:text-[#B9B0D8]">
                  <span>{isAr ? 'رسوم التوصيل' : 'Delivery fee'}</span>
                  <span className="tabular-nums">{formatDzd(deliveryFee, lang)}</span>
                </div>
                <div className="mt-1 flex justify-between text-[#5E5C70] dark:text-[#B9B0D8]">
                  <span>{isAr ? 'طريقة الدفع' : 'Payment'}</span>
                  <span>
                    {fulfillment === 'delivery' ? dict.cashOnDelivery : dict.cashAtShop}
                  </span>
                </div>
                <div className="font-display mt-3 flex justify-between border-t border-[#E4DCF7] pt-2.5 text-base font-bold dark:border-[#22222C]">
                  <span>{isAr ? 'الإجمالي' : 'Total'}</span>
                  <span className="tabular-nums">{formatDzd(total, lang)}</span>
                </div>
              </div>

              {errorMsg && (
                <div className="rounded-xl bg-rose-50 px-3.5 py-2.5 text-xs font-medium text-rose-700 dark:bg-rose-950/50 dark:text-rose-300">
                  {errorMsg}
                </div>
              )}

              <button
                type="submit"
                disabled={submitting}
                className="w-full rounded-full bg-[#4A3894] py-3.5 text-sm font-bold text-white shadow-sm transition hover:bg-[#3A2B78] disabled:opacity-50 cursor-pointer"
              >
                {submitting
                  ? isAr
                    ? 'جاري تأكيد الطلب...'
                    : 'Confirming order...'
                  : `${dict.placeOrder} · ${formatDzd(total, lang)}`}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
};
