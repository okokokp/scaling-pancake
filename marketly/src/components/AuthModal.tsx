import React, { useEffect, useState } from 'react';
import { Bike, Globe, Lock, ShoppingBag, Store as StoreIcon, X } from 'lucide-react';
import type { LanguageCode, PublicUser, SellerBusinessType, UserRole } from '../../shared/types.ts';
import { DJELFA_AREAS } from '../../shared/locationConfig.ts';
import { apiFetch, setAuthToken } from '../lib/api.ts';
import { signInWithGoogleGmail } from '../lib/firebase.ts';
import { ensureFirebaseUserProfile } from '../lib/firestoreProducts.ts';

interface AuthModalProps {
  open: boolean;
  initialMode?: 'login' | 'register';
  initialRole?: 'customer' | 'merchant' | 'driver';
  initialSellerType?: SellerBusinessType;
  lang?: LanguageCode;
  onClose: () => void;
  onSuccess: (user: PublicUser, meta?: { isRegister?: boolean }) => void;
  onSwitchDemoRole?: (role: UserRole) => Promise<void> | void;
  notify: (msg: string, type?: 'success' | 'error') => void;
}

export const AuthModal: React.FC<AuthModalProps> = ({
  open,
  initialMode = 'login',
  initialRole = 'customer',
  initialSellerType = 'physical_store',
  lang = 'en',
  onClose,
  onSuccess,
  onSwitchDemoRole,
  notify,
}) => {
  const isAr = lang === 'ar';
  const [mode, setMode] = useState<'login' | 'register'>(initialMode);
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<'customer' | 'merchant' | 'driver'>(initialRole);
  const [sellerType, setSellerType] = useState<SellerBusinessType>(initialSellerType);
  const [storeName, setStoreName] = useState('');
  const [area, setArea] = useState(DJELFA_AREAS[0].name);
  const [address, setAddress] = useState('');
  const [instagramUrl, setInstagramUrl] = useState('');
  const [facebookUrl, setFacebookUrl] = useState('');
  const [showDemoOptions, setShowDemoOptions] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [googleSubmitting, setGoogleSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setMode(initialMode);
    setRole(initialRole);
    setSellerType(initialSellerType);
    setError(null);
    setShowDemoOptions(true);
  }, [open, initialMode, initialRole, initialSellerType]);

  if (!open) return null;

  const handleGoogleAuth = async () => {
    setError(null);
    setGoogleSubmitting(true);
    try {
      const { user: fbUser, idToken } = await signInWithGoogleGmail();
      try {
        await ensureFirebaseUserProfile(
          fbUser,
          mode === 'register' ? role : 'customer',
          role === 'merchant' ? sellerType : undefined,
          phone.trim() || undefined
        );
      } catch {
        // Firestore profile sync is best-effort
      }
      const res = await apiFetch<{ user: PublicUser; token: string }>('/api/auth/google', {
        method: 'POST',
        body: JSON.stringify({
          idToken,
          mode,
          role,
          ...(role === 'merchant'
            ? {
                sellerType,
                storeName: storeName.trim() || undefined,
                phone: phone.trim() || undefined,
                area,
                address: sellerType === 'physical_store' ? address.trim() || undefined : undefined,
                instagramUrl:
                  sellerType === 'online_page' ? instagramUrl.trim() || undefined : undefined,
                facebookUrl:
                  sellerType === 'online_page' ? facebookUrl.trim() || undefined : undefined,
              }
            : { phone: phone.trim() || undefined }),
        }),
      });
      setAuthToken(res.token);
      onSuccess(res.user, { isRegister: mode === 'register' });
      notify(isAr ? `مرحباً، ${res.user.fullName}` : `Welcome, ${res.user.fullName}`);
      onClose();
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : isAr
            ? 'تعذر تسجيل الدخول عبر جوجل.'
            : 'Google sign-in failed.'
      );
    } finally {
      setGoogleSubmitting(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (mode === 'register') {
      if (fullName.trim().length < 2) {
        setError(
          isAr
            ? 'يجب أن يتكون الاسم الكامل من حرفين على الأقل.'
            : 'Full name must be at least 2 characters.'
        );
        return;
      }
      const cleanPhone = phone.trim();
      if (cleanPhone.length < 8 || cleanPhone.replace(/\D/g, '').length < 8) {
        setError(
          isAr
            ? 'رقم الهاتف أو الواتساب يجب أن يحتوي على 8 أرقام على الأقل.'
            : 'Phone / WhatsApp must be a valid number with at least 8 digits (e.g. 0661 24 88 10).'
        );
        return;
      }
      if (password.length < 6) {
        setError(
          isAr
            ? 'كلمة المرور يجب أن تكون 6 أحرف على الأقل.'
            : 'Password must be at least 6 characters.'
        );
        return;
      }
    }
    setSubmitting(true);
    try {
      const endpoint = mode === 'login' ? '/api/auth/login' : '/api/auth/register';
      const payload =
        mode === 'login'
          ? { email, password }
          : {
              fullName,
              email,
              phone,
              password,
              role,
              ...(role === 'merchant'
                ? {
                    sellerType,
                    storeName: storeName.trim() || undefined,
                    area,
                    address: sellerType === 'physical_store' ? address.trim() || undefined : undefined,
                    instagramUrl:
                      sellerType === 'online_page' ? instagramUrl.trim() || undefined : undefined,
                    facebookUrl:
                      sellerType === 'online_page' ? facebookUrl.trim() || undefined : undefined,
                  }
                : {}),
            };
      const res = await apiFetch<{ user: PublicUser; token: string }>(endpoint, {
        method: 'POST',
        body: JSON.stringify(payload),
      });
      setAuthToken(res.token);
      onSuccess(res.user, { isRegister: mode === 'register' });
      notify(
        mode === 'register' && role === 'merchant'
          ? isAr
            ? `مرحباً ${res.user.fullName}! تم إعداد واجهة متجرك على ماركتلي.`
            : `Welcome, ${res.user.fullName}! Your ${sellerType === 'online_page' ? 'Online Seller Page' : 'Physical Business'} is ready.`
          : isAr
            ? `مرحباً، ${res.user.fullName}`
            : `Welcome, ${res.user.fullName}`
      );
      onClose();
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : isAr
            ? 'تعذر إتمام المصادقة.'
            : 'Authentication failed.'
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      dir={isAr ? 'rtl' : 'ltr'}
      className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/50 p-4 backdrop-blur-xs"
    >
      <div className="my-auto w-full max-w-md rounded-3xl border border-[#E4DCF7] bg-white p-6 shadow-2xl dark:border-[#22222C] dark:bg-[#0E0E13] modal-enter">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-[#4A3894] text-white">
              <Lock className="h-4 w-4" />
            </div>
            <h2 className="font-display text-lg font-bold text-[#1E1438] dark:text-white">
              {mode === 'login'
                ? isAr
                  ? 'تسجيل الدخول إلى ماركتلي'
                  : 'Sign in to Marketly'
                : isAr
                  ? 'إنشاء حساب ماركتلي'
                  : 'Create Marketly Account'}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={isAr ? 'إغلاق نافذة الدخول' : 'Close authentication dialog'}
            className="rounded-full p-2 text-[#5E5C70] hover:bg-[#F5F0FC] dark:text-[#B9B0D8] cursor-pointer"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-1 rounded-2xl bg-[#F5F0FC] p-1 dark:bg-[#15151C]">
          <button
            type="button"
            onClick={() => setMode('login')}
            className={`rounded-xl py-2 text-xs font-semibold cursor-pointer ${
              mode === 'login'
                ? 'bg-white text-[#4A3894] shadow-xs dark:bg-[#4A3894] dark:text-white'
                : 'text-[#5E5C70] dark:text-[#B9B0D8]'
            }`}
          >
            {isAr ? 'تسجيل الدخول' : 'Sign In'}
          </button>
          <button
            type="button"
            onClick={() => setMode('register')}
            className={`rounded-xl py-2 text-xs font-semibold cursor-pointer ${
              mode === 'register'
                ? 'bg-white text-[#4A3894] shadow-xs dark:bg-[#4A3894] dark:text-white'
                : 'text-[#5E5C70] dark:text-[#B9B0D8]'
            }`}
          >
            {isAr ? 'إنشاء حساب' : 'Create Account'}
          </button>
        </div>

        <div className="mt-4">
          <button
            type="button"
            disabled={googleSubmitting || submitting}
            onClick={handleGoogleAuth}
            className="flex w-full items-center justify-center gap-2 rounded-2xl border border-[#E4DCF7] bg-[#FBF9FE] py-2.5 text-xs font-bold text-[#1E1438] transition hover:border-[#4A3894] hover:bg-white disabled:opacity-50 dark:border-[#22222C] dark:bg-[#15151C] dark:text-white cursor-pointer"
          >
            <svg className="h-4 w-4 shrink-0" viewBox="0 0 24 24" aria-hidden="true">
              <path
                fill="#EA4335"
                d="M12 10.2v3.9h5.5c-.2 1.3-1.5 3.9-5.5 3.9-3.3 0-6-2.7-6-6s2.7-6 6-6c1.9 0 3.1.8 3.8 1.5l2.6-2.5C16.7 3.4 14.6 2.5 12 2.5 6.8 2.5 2.5 6.8 2.5 12s4.3 9.5 9.5 9.5c5.5 0 9.1-3.9 9.1-9.3 0-.6-.1-1.1-.2-1.6H12z"
              />
              <path
                fill="#34A853"
                d="M3.7 7.6l3.2 2.3C7.8 7.6 9.7 6 12 6c1.9 0 3.1.8 3.8 1.5l2.6-2.5C16.7 3.4 14.6 2.5 12 2.5 8.3 2.5 5.1 4.6 3.7 7.6z"
              />
              <path
                fill="#FBBC05"
                d="M12 21.5c2.5 0 4.6-.8 6.1-2.3l-2.9-2.3c-.8.5-1.8.9-3.2.9-2.4 0-4.4-1.6-5.1-3.8l-3.2 2.5c1.5 3 4.6 5 8.3 5z"
              />
              <path
                fill="#4285F4"
                d="M21.1 12.2c0-.6-.1-1.1-.2-1.6H12v3.9h5.5c-.3 1.2-1 2.2-2.1 2.9l2.9 2.3c1.7-1.6 2.8-4 2.8-7.5z"
              />
            </svg>
            <span>
              {googleSubmitting
                ? isAr
                  ? 'جاري الاتصال بجوجل...'
                  : 'Connecting Google Gmail...'
                : mode === 'register'
                  ? isAr
                    ? 'التسجيل عبر حساب جوجل (Gmail)'
                    : 'Sign up with Google (Gmail)'
                  : isAr
                    ? 'الدخول عبر حساب جوجل (Gmail)'
                    : 'Sign in with Google (Gmail)'}
            </span>
          </button>

          <div className="my-3 flex items-center gap-2 text-[10px] font-medium uppercase tracking-wider text-[#9D9BB0]">
            <div className="h-px flex-1 bg-[#E4DCF7] dark:bg-[#22222C]" />
            <span>{isAr ? 'أو بالبريد الإلكتروني' : 'or with email'}</span>
            <div className="h-px flex-1 bg-[#E4DCF7] dark:bg-[#22222C]" />
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3">
          {mode === 'register' && (
            <>
              <div>
                <label className="block text-xs font-medium text-[#5E5C70] dark:text-[#B9B0D8]">
                  {isAr ? 'اختر نوع الحساب' : 'Choose Account Type'}
                </label>
                <div className="mt-1.5 grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setRole('customer')}
                    className={`flex items-start gap-2 rounded-2xl border p-2.5 text-start transition cursor-pointer ${
                      role === 'customer'
                        ? 'border-[#4A3894] bg-[#4A3894]/10 text-[#1E1438] dark:text-white'
                        : 'border-[#E4DCF7] bg-[#FBF9FE] text-[#5E5C70] dark:border-[#22222C] dark:bg-[#15151C] dark:text-[#B9B0D8]'
                    }`}
                  >
                    <ShoppingBag className="mt-0.5 h-4 w-4 shrink-0 text-[#4A3894] dark:text-[#9678CE]" />
                    <div className="min-w-0">
                      <div className="text-xs font-bold">{isAr ? 'مشتري' : 'Customer'}</div>
                      <div className="text-[10px] opacity-80">
                        {isAr ? 'مقارنة وشراء' : 'Compare & buy'}
                      </div>
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setRole('merchant');
                      setSellerType('physical_store');
                    }}
                    className={`flex items-start gap-2 rounded-2xl border p-2.5 text-start transition cursor-pointer ${
                      role === 'merchant' && sellerType === 'physical_store'
                        ? 'border-[#4A3894] bg-[#4A3894]/10 text-[#1E1438] dark:text-white'
                        : 'border-[#E4DCF7] bg-[#FBF9FE] text-[#5E5C70] dark:border-[#22222C] dark:bg-[#15151C] dark:text-[#B9B0D8]'
                    }`}
                  >
                    <StoreIcon className="mt-0.5 h-4 w-4 shrink-0 text-[#4A3894] dark:text-[#9678CE]" />
                    <div className="min-w-0">
                      <div className="text-xs font-bold">{isAr ? 'متجر فعلي' : 'Physical Store'}</div>
                      <div className="text-[10px] opacity-80">
                        {isAr ? 'محل + خريطة + استلام' : 'Shop + Map + Pickup'}
                      </div>
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setRole('merchant');
                      setSellerType('online_page');
                    }}
                    className={`flex items-start gap-2 rounded-2xl border p-2.5 text-start transition cursor-pointer ${
                      role === 'merchant' && sellerType === 'online_page'
                        ? 'border-[#4A3894] bg-[#4A3894]/10 text-[#1E1438] dark:text-white'
                        : 'border-[#E4DCF7] bg-[#FBF9FE] text-[#5E5C70] dark:border-[#22222C] dark:bg-[#15151C] dark:text-[#B9B0D8]'
                    }`}
                  >
                    <Globe className="mt-0.5 h-4 w-4 shrink-0 text-[#E794C9]" />
                    <div className="min-w-0">
                      <div className="text-xs font-bold">{isAr ? 'صفحة أونلاين' : 'Online Page'}</div>
                      <div className="text-[10px] opacity-80">IG / FB / WhatsApp</div>
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => setRole('driver')}
                    className={`flex items-start gap-2 rounded-2xl border p-2.5 text-start transition cursor-pointer ${
                      role === 'driver'
                        ? 'border-[#4A3894] bg-[#4A3894]/10 text-[#1E1438] dark:text-white'
                        : 'border-[#E4DCF7] bg-[#FBF9FE] text-[#5E5C70] dark:border-[#22222C] dark:bg-[#15151C] dark:text-[#B9B0D8]'
                    }`}
                  >
                    <Bike className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
                    <div className="min-w-0">
                      <div className="text-xs font-bold">{isAr ? 'سائق توصيل' : 'Driver'}</div>
                      <div className="text-[10px] opacity-80">
                        {isAr ? 'توصيل محلي' : 'Local deliveries'}
                      </div>
                    </div>
                  </button>
                </div>
              </div>

              <div className="grid gap-2.5 sm:grid-cols-2">
                <div>
                  <label className="block text-xs font-medium text-[#5E5C70] dark:text-[#B9B0D8]">
                    {isAr ? 'الاسم الكامل' : 'Full name'}
                  </label>
                  <input
                    required
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    placeholder={isAr ? 'أمينة بن علي' : 'Amina Benali'}
                    className="mt-1 w-full rounded-xl border border-[#E4DCF7] px-3 py-2 text-sm dark:border-[#22222C] dark:bg-[#15151C]"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-[#5E5C70] dark:text-[#B9B0D8]">
                    {isAr ? 'الهاتف / واتساب' : 'Phone / WhatsApp'}
                  </label>
                  <input
                    required
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="0661 24 88 10"
                    className="mt-1 w-full rounded-xl border border-[#E4DCF7] px-3 py-2 text-sm dark:border-[#22222C] dark:bg-[#15151C]"
                  />
                  <p className="mt-0.5 text-[10px] text-[#5E5C70] dark:text-[#B9B0D8]">
                    {isAr ? '8 أرقام على الأقل' : 'At least 8 digits'}
                  </p>
                </div>
              </div>

              {role === 'merchant' && (
                <div className="space-y-2.5 rounded-2xl border border-[#E4DCF7] bg-[#FBF9FE] p-3 dark:border-[#22222C] dark:bg-[#15151C]/70">
                  <div className="text-[11px] font-bold uppercase tracking-wide text-[#4A3894] dark:text-[#E794C9]">
                    {sellerType === 'online_page'
                      ? isAr
                        ? 'إعداد صفحة البائع الأونلاين'
                        : 'Online Seller Page Setup'
                      : isAr
                        ? 'إعداد المتجر الفعلي في الجلفة'
                        : 'Physical Business Store Setup'}
                  </div>

                  <div className="grid gap-2.5 sm:grid-cols-2">
                    <div>
                      <label className="block text-[11px] font-medium text-[#5E5C70] dark:text-[#B9B0D8]">
                        {sellerType === 'online_page'
                          ? isAr
                            ? 'اسم الصفحة'
                            : 'Page Name'
                          : isAr
                            ? 'اسم المتجر'
                            : 'Business / Shop Name'}
                      </label>
                      <input
                        required
                        value={storeName}
                        onChange={(e) => setStoreName(e.target.value)}
                        placeholder={
                          sellerType === 'online_page'
                            ? 'Djelfa Tech IG'
                            : isAr
                              ? 'متجر الجلفة هاردوير'
                              : 'Djelfa PC Store'
                        }
                        className="mt-1 w-full rounded-xl border border-[#E4DCF7] bg-white px-3 py-1.5 text-xs dark:border-[#22222C] dark:bg-[#0E0E13]"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-medium text-[#5E5C70] dark:text-[#B9B0D8]">
                        {sellerType === 'online_page'
                          ? isAr
                            ? 'المنطقة الأساسية في الجلفة'
                            : 'Base Area in Djelfa'
                          : isAr
                            ? 'الحي أو الشارع في الجلفة'
                            : 'Djelfa Street / Area'}
                      </label>
                      <select
                        value={area}
                        onChange={(e) => setArea(e.target.value)}
                        className="mt-1 w-full rounded-xl border border-[#E4DCF7] bg-white px-3 py-1.5 text-xs dark:border-[#22222C] dark:bg-[#0E0E13]"
                      >
                        {DJELFA_AREAS.map((a) => (
                          <option key={a.name} value={a.name}>
                            {isAr ? a.nameAr : a.name}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  {sellerType === 'physical_store' ? (
                    <div>
                      <label className="block text-[11px] font-medium text-[#5E5C70] dark:text-[#B9B0D8]">
                        {isAr ? 'عنوان الشارع في الجلفة' : 'Shop Street Address'}
                      </label>
                      <input
                        required
                        value={address}
                        onChange={(e) => setAddress(e.target.value)}
                        placeholder={
                          isAr
                            ? 'مثال: 14 شارع جيش التحرير الوطني، الجلفة'
                            : "e.g. 14 Boulevard de l'ALN, Djelfa"
                        }
                        className="mt-1 w-full rounded-xl border border-[#E4DCF7] bg-white px-3 py-1.5 text-xs dark:border-[#22222C] dark:bg-[#0E0E13]"
                      />
                    </div>
                  ) : (
                    <div className="grid gap-2.5 sm:grid-cols-2">
                      <div>
                        <label className="block text-[11px] font-medium text-[#5E5C70] dark:text-[#B9B0D8]">
                          Instagram (@handle / URL)
                        </label>
                        <input
                          value={instagramUrl}
                          onChange={(e) => setInstagramUrl(e.target.value)}
                          placeholder="@yourpage.dz"
                          className="mt-1 w-full rounded-xl border border-[#E4DCF7] bg-white px-3 py-1.5 text-xs dark:border-[#22222C] dark:bg-[#0E0E13]"
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] font-medium text-[#5E5C70] dark:text-[#B9B0D8]">
                          {isAr ? 'صفحة فيسبوك (اختياري)' : 'Facebook Page (optional)'}
                        </label>
                        <input
                          value={facebookUrl}
                          onChange={(e) => setFacebookUrl(e.target.value)}
                          placeholder="fb.com/yourpage"
                          className="mt-1 w-full rounded-xl border border-[#E4DCF7] bg-white px-3 py-1.5 text-xs dark:border-[#22222C] dark:bg-[#0E0E13]"
                        />
                      </div>
                    </div>
                  )}
                </div>
              )}
            </>
          )}

          <div>
            <label className="block text-xs font-medium text-[#5E5C70] dark:text-[#B9B0D8]">
              {isAr ? 'البريد الإلكتروني' : 'Email'}
            </label>
            <input
              required
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="amina@marketly.dz"
              className="mt-1 w-full rounded-xl border border-[#E4DCF7] px-3.5 py-2 text-sm dark:border-[#22222C] dark:bg-[#15151C]"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-[#5E5C70] dark:text-[#B9B0D8]">
              {isAr ? 'كلمة المرور' : 'Password'}
            </label>
            <input
              required
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder={isAr ? '6 أحرف على الأقل' : 'Min 6 characters'}
              className="mt-1 w-full rounded-xl border border-[#E4DCF7] px-3.5 py-2 text-sm dark:border-[#22222C] dark:bg-[#15151C]"
            />
          </div>

          {error && (
            <div className="rounded-xl bg-rose-50 px-3 py-2 text-xs font-medium text-rose-700 dark:bg-rose-950/40 dark:text-rose-300">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={submitting}
            className="w-full rounded-full bg-[#4A3894] py-3 text-sm font-bold text-white transition hover:bg-[#3A2B78] cursor-pointer"
          >
            {submitting
              ? isAr
                ? 'يرجى الانتظار...'
                : 'Please wait...'
              : mode === 'login'
                ? isAr
                  ? 'تسجيل الدخول'
                  : 'Sign In'
                : role === 'merchant'
                  ? sellerType === 'online_page'
                    ? isAr
                      ? 'إنشاء حساب صفحة بيع أونلاين'
                      : 'Create Online Seller Account'
                    : isAr
                      ? 'إنشاء حساب متجر فعلي'
                      : 'Create Physical Business Account'
                  : isAr
                    ? 'إنشاء حساب'
                    : 'Create Account'}
          </button>
        </form>

        {onSwitchDemoRole && (
          <div className="mt-4 border-t border-[#E4DCF7] pt-3 dark:border-[#22222C]">
            <button
              type="button"
              onClick={() => setShowDemoOptions((v) => !v)}
              className="w-full text-center text-[11px] font-semibold text-[#5E5C70] hover:text-[#4A3894] dark:text-[#B9B0D8] cursor-pointer"
            >
              {showDemoOptions
                ? isAr
                  ? 'مبدّل حسابات التجربة والإشراف'
                  : 'Admin & Demo Role Switcher'
                : isAr
                  ? 'إظهار حسابات التجربة'
                  : 'Show Admin & Demo Role Switcher'}
            </button>
            {showDemoOptions && (
              <div className="mt-2.5 grid grid-cols-2 gap-1.5">
                {(
                  [
                    { role: 'customer', en: 'Demo Customer', ar: 'مشتري تجريبي' },
                    { role: 'merchant', en: 'Demo Seller', ar: 'تاجر تجريبي' },
                    { role: 'driver', en: 'Demo Driver', ar: 'سائق تجريبي' },
                    { role: 'moderator', en: 'Demo Moderator', ar: 'مشرف دعم تجريبي' },
                    { role: 'admin', en: 'Demo Admin', ar: 'مدير تجريبي' },
                  ] as const
                ).map((item) => (
                  <button
                    key={item.role}
                    type="button"
                    onClick={async () => {
                      await onSwitchDemoRole(item.role);
                      onClose();
                    }}
                    className="rounded-xl border border-[#E4DCF7] bg-[#FBF9FE] px-3 py-1.5 text-[11px] font-semibold text-[#1E1438] hover:border-[#4A3894] dark:border-[#22222C] dark:bg-[#15151C] dark:text-white cursor-pointer"
                  >
                    {isAr ? item.ar : item.en}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
