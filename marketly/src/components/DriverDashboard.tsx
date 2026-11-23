import React, { useCallback, useEffect, useState } from 'react';
import { Bike, Car, CheckCircle2, MapPin, Navigation, Power, ShieldCheck } from 'lucide-react';
import type { CityArea, DriverProfile, LanguageCode, Order, PublicUser } from '../../shared/types.ts';
import { getAreaDisplayName } from '../../shared/locationConfig.ts';
import { apiFetch } from '../lib/api.ts';
import { formatDzd } from '../lib/format.ts';
import { DashboardTableSkeleton } from './Skeletons.tsx';

interface DriverDashboardProps {
  user: PublicUser | null;
  lang: LanguageCode;
  notify: (msg: string, type?: 'success' | 'error') => void;
}

export const DriverDashboard: React.FC<DriverDashboardProps> = ({ user, lang, notify }) => {
  const isAr = lang === 'ar';
  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState<DriverProfile | null>(null);
  const [availableJobs, setAvailableJobs] = useState<Order[]>([]);
  const [activeJobs, setActiveJobs] = useState<Order[]>([]);
  const [completedJobs, setCompletedJobs] = useState<Order[]>([]);
  const [areas, setAreas] = useState<CityArea[]>([]);
  const [codeInputs, setCodeInputs] = useState<Record<string, string>>({});

  const loadDriver = useCallback(async () => {
    if (!user || !user.roles.includes('driver')) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const data = await apiFetch<{
        profile: DriverProfile;
        availableJobs: Order[];
        activeJobs: Order[];
        completedJobs: Order[];
        areas: CityArea[];
      }>('/api/driver/dashboard');
      setProfile(data.profile);
      setAvailableJobs(data.availableJobs);
      setActiveJobs(data.activeJobs);
      setCompletedJobs(data.completedJobs);
      setAreas(data.areas);
    } catch (err) {
      notify(
        err instanceof Error
          ? err.message
          : isAr
            ? 'تعذر تحميل لوحة السائق.'
            : 'Could not load driver dashboard.',
        'error'
      );
    } finally {
      setLoading(false);
    }
  }, [user, notify, isAr]);

  useEffect(() => {
    loadDriver();
  }, [loadDriver]);

  if (!user || !user.roles.includes('driver')) {
    return (
      <div
        dir={isAr ? 'rtl' : 'ltr'}
        className="mx-auto max-w-2xl rounded-3xl border border-[#E4DCF7] bg-white p-10 text-center dark:border-[#22222C] dark:bg-[#0E0E13]"
      >
        <Bike className="mx-auto h-10 w-10 text-[#9678CE]" />
        <h2 className="font-display mt-3 text-xl font-bold text-[#1E1438] dark:text-white">
          {isAr ? 'بوابة السائق' : 'Driver Portal'}
        </h2>
        <p className="mt-1 text-sm text-[#5E5C70] dark:text-[#B9B0D8]">
          {isAr
            ? 'سجل حساب سائق أو بدّل إلى حساب السائق التجريبي لقبول طلبات التوصيل في الجلفة.'
            : 'Switch to the Driver demo persona or register a Driver account to accept local delivery jobs in Djelfa.'}
        </p>
      </div>
    );
  }

  const updateProfile = async (
    patch: Partial<Pick<DriverProfile, 'isOnline' | 'vehicleType' | 'serviceArea'>>
  ) => {
    try {
      const res = await apiFetch<{ profile: DriverProfile }>('/api/driver/profile', {
        method: 'PATCH',
        body: JSON.stringify(patch),
      });
      setProfile(res.profile);
      notify(
        patch.isOnline !== undefined
          ? isAr
            ? `حالة السائق: ${res.profile.isOnline ? 'متصل' : 'غير متصل'}`
            : `Driver status: ${res.profile.isOnline ? 'Online' : 'Offline'}`
          : isAr
            ? 'تم تحديث ملف السائق.'
            : 'Driver profile updated.'
      );
      await loadDriver();
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Update failed.', 'error');
    }
  };

  const acceptJob = async (orderId: string) => {
    try {
      await apiFetch(`/api/driver/jobs/${orderId}/accept`, { method: 'POST' });
      notify(
        isAr
          ? 'تم إسناد التوصيل إليك! توجه إلى المتجر للاستلام.'
          : 'Delivery job assigned to you! Head to the shop for pickup.'
      );
      await loadDriver();
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Could not accept job.', 'error');
    }
  };

  const completeDelivery = async (orderId: string) => {
    const code = (codeInputs[orderId] || '').trim();
    try {
      await apiFetch(`/api/driver/jobs/${orderId}/complete`, {
        method: 'POST',
        body: JSON.stringify({ code }),
      });
      notify(isAr ? 'تم التحقق وإتمام التوصيل!' : 'Delivery verified and completed!');
      setCodeInputs((prev) => ({ ...prev, [orderId]: '' }));
      await loadDriver();
    } catch (err) {
      notify(
        err instanceof Error
          ? err.message
          : isAr
            ? 'رمز التأكيد غير صحيح.'
            : 'Invalid confirmation code.',
        'error'
      );
    }
  };

  return (
    <section dir={isAr ? 'rtl' : 'ltr'} className="mx-auto max-w-4xl space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold text-[#1E1438] sm:text-3xl dark:text-white">
            {isAr ? 'بوابة التوصيل · الجلفة' : 'Djelfa Driver Portal'}
          </h1>
          <p className="text-sm text-[#5E5C70] dark:text-[#B9B0D8]">
            {isAr
              ? 'اقبل طلبات التوصيل المحلية وأكد التسليم برمز الزبون المكون من 4 أرقام.'
              : "Accept neighborhood delivery requests and confirm drop-offs with the customer's 4-digit code."}
          </p>
        </div>

        {profile && (
          <button
            type="button"
            onClick={() => updateProfile({ isOnline: !profile.isOnline })}
            className={`inline-flex items-center gap-2 rounded-full px-5 py-2.5 text-xs font-bold transition cursor-pointer ${
              profile.isOnline
                ? 'bg-[#4A3894] text-white shadow-sm'
                : 'border border-[#E4DCF7] bg-white text-[#5E5C70] dark:border-[#22222C] dark:bg-[#15151C] dark:text-white'
            }`}
          >
            <Power className="h-4 w-4" />
            <span>
              {profile.isOnline
                ? isAr
                  ? 'متصل · يستقبل الطلبات'
                  : 'Online · Receiving Jobs'
                : isAr
                  ? 'غير متصل · اضغط للاتصال'
                  : 'Offline · Tap to Go Online'}
            </span>
          </button>
        )}
      </div>

      {loading || !profile ? (
        <DashboardTableSkeleton rows={4} />
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="rounded-2xl border border-[#E4DCF7] bg-white p-4 dark:border-[#22222C] dark:bg-[#0E0E13]">
              <div className="text-xs text-[#5E5C70] dark:text-[#B9B0D8]">
                {isAr ? 'المركبة ومنطقة الخدمة' : 'Vehicle & Area'}
              </div>
              <div className="mt-2 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => updateProfile({ vehicleType: 'motorcycle' })}
                  className={`inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-semibold cursor-pointer ${
                    profile.vehicleType === 'motorcycle'
                      ? 'bg-[#4A3894] text-white'
                      : 'bg-[#F5F0FC] text-[#5E5C70] dark:bg-[#15151C] dark:text-[#B9B0D8]'
                  }`}
                >
                  <Bike className="h-3.5 w-3.5" />
                  <span>{isAr ? 'دراجة (200 دج)' : 'Moto (200 DA)'}</span>
                </button>
                <button
                  type="button"
                  onClick={() => updateProfile({ vehicleType: 'car' })}
                  className={`inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-semibold cursor-pointer ${
                    profile.vehicleType === 'car'
                      ? 'bg-[#4A3894] text-white'
                      : 'bg-[#F5F0FC] text-[#5E5C70] dark:bg-[#15151C] dark:text-[#B9B0D8]'
                  }`}
                >
                  <Car className="h-3.5 w-3.5" />
                  <span>{isAr ? 'سيارة (300 دج)' : 'Car (300 DA)'}</span>
                </button>
              </div>
              <select
                value={profile.serviceArea}
                onChange={(e) => updateProfile({ serviceArea: e.target.value })}
                aria-label={isAr ? 'منطقة الخدمة' : 'Service area'}
                className="mt-3 w-full rounded-xl border border-[#E4DCF7] bg-white px-3 py-1.5 text-xs dark:border-[#22222C] dark:bg-[#15151C]"
              >
                {areas.map((a) => (
                  <option key={a.id} value={a.name}>
                    {isAr ? `منطقة الخدمة: ${a.nameAr}` : `Service area: ${a.name}`}
                  </option>
                ))}
              </select>
            </div>

            <div className="rounded-2xl border border-[#E4DCF7] bg-white p-4 dark:border-[#22222C] dark:bg-[#0E0E13]">
              <div className="text-xs text-[#5E5C70] dark:text-[#B9B0D8]">
                {isAr ? 'التوصيلات المكتملة' : 'Completed Deliveries'}
              </div>
              <div className="font-display mt-2 text-3xl font-extrabold text-[#1E1438] tabular-nums dark:text-white">
                {profile.completedDeliveries}
              </div>
              <div className="mt-1 text-xs font-medium text-emerald-600">
                {isAr ? `التقييم ${profile.rating} / 5.0` : `Rating ${profile.rating} / 5.0`}
              </div>
            </div>

            <div className="rounded-2xl bg-[#4A3894] p-4 text-white">
              <div className="text-xs text-[#E9DFF9]">
                {isAr ? 'إجمالي الأرباح' : 'Total Earnings'}
              </div>
              <div className="font-display mt-2 text-3xl font-extrabold text-[#FBEFFB] tabular-nums">
                {formatDzd(profile.totalEarnings, lang)}
              </div>
              <div className="mt-1 text-xs text-[#E9DFF9]">
                {isAr ? 'تحصيل نقدي عند كل تسليم' : 'Cash collected per drop-off'}
              </div>
            </div>
          </div>

          {activeJobs.length > 0 && (
            <div className="space-y-3">
              <h2 className="font-display text-lg font-bold text-[#1E1438] dark:text-white">
                {isAr ? 'توصيل نشط' : 'Active Delivery'}
              </h2>
              {activeJobs.map((job) => (
                <div
                  key={job.id}
                  className="space-y-4 rounded-3xl border-2 border-[#4A3894] bg-white p-5 dark:bg-[#0E0E13]"
                >
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div>
                      <div className="text-xs font-bold uppercase text-[#9678CE]">
                        {job.orderNumber} · {isAr ? 'في الطريق' : 'On the way'}
                      </div>
                      <h3 className="font-display mt-1 text-lg font-bold text-[#1E1438] dark:text-white">
                        {isAr ? 'الاستلام من:' : 'Pickup:'} {job.storeName}
                      </h3>
                      <div className="mt-1 flex items-center gap-1.5 text-xs text-[#5E5C70] dark:text-[#B9B0D8]">
                        <MapPin className="h-3.5 w-3.5 text-[#9678CE]" />
                        <span>{job.storeAddress}</span>
                      </div>
                      <div className="mt-1 flex items-center gap-1.5 text-xs font-medium">
                        <Navigation className="h-3.5 w-3.5 text-emerald-600" />
                        <span>
                          {isAr ? 'التسليم إلى:' : 'Deliver to:'} {job.deliveryAddress} ({job.customerName} ·{' '}
                          {job.customerPhone})
                        </span>
                      </div>
                    </div>
                    <div className="text-end">
                      <div className="text-xs text-[#5E5C70] dark:text-[#B9B0D8]">
                        {isAr ? 'المبلغ المطلوب تحصيله' : 'Collect cash total'}
                      </div>
                      <div className="font-display text-xl font-extrabold tabular-nums">
                        {formatDzd(job.total, lang)}
                      </div>
                      <div className="text-xs font-semibold text-emerald-600">
                        {isAr ? 'أجرتك:' : 'Your fee:'} {formatDzd(job.deliveryFee, lang)}
                      </div>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2 border-t border-[#E4DCF7] pt-4 dark:border-[#22222C]">
                    <ShieldCheck className="h-4 w-4 text-[#9678CE]" />
                    <input
                      value={codeInputs[job.id] || ''}
                      onChange={(e) =>
                        setCodeInputs((prev) => ({ ...prev, [job.id]: e.target.value }))
                      }
                      maxLength={4}
                      placeholder={isAr ? 'رمز الزبون (4 أرقام)' : '4-digit customer code'}
                      className="w-44 rounded-xl border border-[#E4DCF7] px-3 py-2 text-sm font-bold tracking-widest tabular-nums dark:border-[#22222C] dark:bg-[#15151C]"
                    />
                    <button
                      type="button"
                      onClick={() => completeDelivery(job.id)}
                      className="rounded-full bg-[#4A3894] px-5 py-2 text-xs font-bold text-white hover:bg-[#3A2B78] cursor-pointer"
                    >
                      {isAr ? 'تأكيد وإتمام التسليم' : 'Verify & Complete Delivery'}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          <div className="space-y-3">
            <h2 className="font-display text-lg font-bold text-[#1E1438] dark:text-white">
              {isAr
                ? `طلبات التوصيل المتاحة (${availableJobs.length})`
                : `Available Delivery Requests (${availableJobs.length})`}
            </h2>
            {!profile.isOnline ? (
              <div className="rounded-2xl border border-[#E4DCF7] bg-white p-6 text-center text-sm text-[#5E5C70] dark:border-[#22222C] dark:bg-[#0E0E13] dark:text-[#B9B0D8]">
                {isAr
                  ? 'فعّل حالة الاتصال أعلاه لعرض وقبول طلبات التوصيل.'
                  : 'Switch to Online above to view and accept local delivery requests.'}
              </div>
            ) : availableJobs.length === 0 ? (
              <div className="rounded-2xl border border-[#E4DCF7] bg-white p-6 text-center text-sm text-[#5E5C70] dark:border-[#22222C] dark:bg-[#0E0E13] dark:text-[#B9B0D8]">
                {isAr
                  ? 'لا توجد طلبات توصيل متاحة حالياً.'
                  : 'No open delivery requests right now. Merchants will dispatch orders here when ready.'}
              </div>
            ) : (
              availableJobs.map((job) => (
                <div
                  key={job.id}
                  className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-[#E4DCF7] bg-white p-5 dark:border-[#22222C] dark:bg-[#0E0E13]"
                >
                  <div>
                    <div className="text-xs font-semibold text-[#9678CE]">
                      {job.orderNumber} · {getAreaDisplayName(job.storeArea, lang)}
                    </div>
                    <h3 className="font-display text-base font-bold text-[#1E1438] dark:text-white">
                      {job.storeName} → {job.deliveryAddress}
                    </h3>
                    <div className="text-xs text-[#5E5C70] dark:text-[#B9B0D8]">
                      {isAr ? 'الدفع عند الاستلام · إجمالي الطلب' : 'Cash on delivery · Order total'}{' '}
                      {formatDzd(job.total, lang)}
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="text-end">
                      <div className="text-[11px] text-[#5E5C70] dark:text-[#B9B0D8]">
                        {isAr ? 'رسوم التوصيل' : 'Delivery Fee'}
                      </div>
                      <div className="font-display text-lg font-extrabold text-emerald-600 tabular-nums">
                        {formatDzd(job.deliveryFee, lang)}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => acceptJob(job.id)}
                      className="rounded-full bg-[#4A3894] px-5 py-2.5 text-xs font-bold text-white hover:bg-[#3A2B78] cursor-pointer"
                    >
                      {isAr ? 'قبول الطلب' : 'Accept Job'}
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>

          {completedJobs.length > 0 && (
            <div className="space-y-2">
              <h3 className="font-display text-base font-bold text-[#1E1438] dark:text-white">
                {isAr ? 'أحدث التوصيلات المكتملة' : 'Recent Completed Jobs'}
              </h3>
              {completedJobs.map((job) => (
                <div
                  key={job.id}
                  className="flex items-center justify-between rounded-2xl border border-[#E4DCF7] bg-white px-4 py-3 text-xs dark:border-[#22222C] dark:bg-[#0E0E13]"
                >
                  <span className="inline-flex items-center gap-1.5 font-semibold">
                    <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                    {job.orderNumber} · {job.storeName}
                  </span>
                  <span className="font-bold text-emerald-600 tabular-nums">
                    +{formatDzd(job.deliveryFee, lang)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </section>
  );
};
