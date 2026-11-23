import React, { useMemo, useState } from 'react';
import type { User as FirebaseUser } from 'firebase/auth';
import {
  ArrowLeft,
  ArrowRight,
  Check,
  Eye,
  EyeOff,
  Globe,
  Mail,
  MapPin,
  Store as StoreIcon,
} from 'lucide-react';
import type { LanguageCode, PublicUser, SellerBusinessType, Store } from '../../shared/types.ts';
import { DJELFA_AREAS } from '../../shared/locationConfig.ts';
import { apiFetch, setAuthToken } from '../lib/api.ts';
import { signInWithGoogleGmail } from '../lib/firebase.ts';
import { ensureFirebaseUserProfile, saveStoreProfileToFirestore } from '../lib/firestoreProducts.ts';

interface SellerSignUpPageProps {
  initialSellerType?: SellerBusinessType;
  existingUser?: PublicUser | null;
  lang?: LanguageCode;
  onSuccess: (user: PublicUser, meta?: { storeSlug?: string }) => void;
  onAuthSynced?: (user: PublicUser) => void;
  onBack: () => void;
  onOpenLogin: () => void;
  onOpenMerchantPortal?: () => void;
  notify: (msg: string, type?: 'success' | 'error') => void;
}

export const SellerSignUpPage: React.FC<SellerSignUpPageProps> = ({
  initialSellerType = 'online_page',
  existingUser,
  lang = 'en',
  onSuccess,
  onAuthSynced,
  onBack,
  onOpenLogin,
  onOpenMerchantPortal,
  notify,
}) => {
  const isAr = lang === 'ar';
  const [sellerType, setSellerType] = useState<SellerBusinessType>(initialSellerType);
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [storeName, setStoreName] = useState('');
  const [phone, setPhone] = useState('');
  const [area, setArea] = useState(DJELFA_AREAS[0].name);
  const [address, setAddress] = useState('');
  const [instagramUrl, setInstagramUrl] = useState('');
  const [facebookUrl, setFacebookUrl] = useState('');
  const [googleMapsUrl, setGoogleMapsUrl] = useState('');
  const [openingHours, setOpeningHours] = useState(
    initialSellerType === 'online_page' ? 'Online Orders · 09:00 - 23:00' : '08:30 - 22:00'
  );
  const [description, setDescription] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [googleSession, setGoogleSession] = useState<{
    user: PublicUser;
    store: Store | null;
    fbUser: FirebaseUser;
    fbEmail: string;
  } | null>(null);

  const handleSelectSellerType = (nextType: SellerBusinessType) => {
    setSellerType(nextType);
    if (!openingHours || openingHours === 'Online Orders · 09:00 - 23:00' || openingHours === '08:30 - 22:00') {
      setOpeningHours(
        nextType === 'online_page' ? 'Online Orders · 09:00 - 23:00' : '08:30 - 22:00'
      );
    }
  };

  const handleGoogleSignUp = async () => {
    setError(null);
    setGoogleLoading(true);
    try {
      const { user: fbUser, idToken } = await signInWithGoogleGmail();
      try {
        await ensureFirebaseUserProfile(fbUser, 'merchant', sellerType, phone.trim() || undefined);
      } catch {
        // Firestore profile sync is best-effort; backend session auth proceeds cleanly
      }
      const res = await apiFetch<{
        user: PublicUser;
        token: string;
        store: Store | null;
        isNewUser?: boolean;
      }>('/api/auth/google', {
        method: 'POST',
        body: JSON.stringify({
          idToken,
          mode: 'register',
          role: 'merchant',
          sellerType,
          storeName: storeName.trim() || undefined,
          phone: phone.trim() || undefined,
          area,
          address: sellerType === 'physical_store' ? address.trim() || undefined : undefined,
          instagramUrl:
            sellerType === 'online_page' ? instagramUrl.trim() || undefined : undefined,
          facebookUrl:
            sellerType === 'online_page' ? facebookUrl.trim() || undefined : undefined,
          description: description.trim() || undefined,
        }),
      });
      setAuthToken(res.token);
      onAuthSynced?.(res.user);

      // Pre-fill Step 2 fields from Google + created/existing store so seller can complete remaining details
      const nameParts = (res.user.fullName || fbUser.displayName || '').trim().split(/\s+/);
      if (!firstName.trim() && nameParts[0]) setFirstName(nameParts[0]);
      if (!lastName.trim() && nameParts.length > 1) setLastName(nameParts.slice(1).join(' '));
      if (res.store) {
        if (!storeName.trim()) setStoreName(res.store.name);
        if (!phone.trim() && res.store.phone && res.store.phone !== '0661 00 00 00') {
          setPhone(res.store.phone);
        }
        if (res.store.area) setArea(res.store.area);
        if (res.store.storeType) setSellerType(res.store.storeType);
        if (
          res.store.address &&
          !res.store.address.startsWith('Online Storefront') &&
          !address.trim()
        ) {
          setAddress(res.store.address);
        }
        if (res.store.instagramUrl && !instagramUrl.trim()) setInstagramUrl(res.store.instagramUrl);
        if (res.store.facebookUrl && !facebookUrl.trim()) setFacebookUrl(res.store.facebookUrl);
        if (res.store.googleMapsUrl && !googleMapsUrl.trim()) setGoogleMapsUrl(res.store.googleMapsUrl);
        if (res.store.openingHours) setOpeningHours(res.store.openingHours);
        if (res.store.description && !description.trim()) setDescription(res.store.description);
      }

      setGoogleSession({
        user: res.user,
        store: res.store,
        fbUser,
        fbEmail: fbUser.email || res.user.email,
      });
      notify(
        `Gmail connected (${fbUser.email || res.user.email})! Add the rest of your store details to open your storefront.`
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Google sign-up failed.');
    } finally {
      setGoogleLoading(false);
    }
  };

  const handleCompleteGoogleStore = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!googleSession) return;
    setError(null);

    const trimmedName = storeName.trim();
    if (trimmedName.length < 2) {
      setError(
        sellerType === 'online_page'
          ? 'Please enter your online page or brand name.'
          : 'Please enter your physical shop name.'
      );
      return;
    }
    const cleanPhone = phone.trim();
    if (cleanPhone.length < 8 || cleanPhone.replace(/\D/g, '').length < 8) {
      setError('Phone / WhatsApp must be a valid number with at least 8 digits (e.g. 0661 24 88 10).');
      return;
    }
    if (sellerType === 'physical_store' && address.trim().length < 4) {
      setError('Please enter your physical shop street address.');
      return;
    }

    setSubmitting(true);
    try {
      const digitsOnly = cleanPhone.replace(/\D/g, '');
      const normalizedWa = digitsOnly.startsWith('0') ? `213${digitsOnly.slice(1)}` : digitsOnly;
      const resolvedDesc =
        description.trim().length >= 4
          ? description.trim()
          : sellerType === 'online_page'
            ? `Verified online seller page delivering PC gear, smartphones & accessories across Djelfa via Instagram, Facebook & WhatsApp.`
            : `Local physical electronics & PC shop in ${area}, Djelfa offering in-store pickup and local delivery.`;

      let targetStore = googleSession.store;
      if (targetStore) {
        const updated = await apiFetch<{ store: Store }>(`/api/merchant/stores/${targetStore.id}`, {
          method: 'PATCH',
          body: JSON.stringify({
            name: trimmedName,
            storeType: sellerType,
            description: resolvedDesc,
            area,
            address:
              sellerType === 'physical_store'
                ? address.trim()
                : `Online Storefront · ${area}, Djelfa`,
            phone: cleanPhone,
            whatsapp: normalizedWa || cleanPhone,
            openingHours:
              openingHours.trim() ||
              (sellerType === 'online_page' ? 'Online Orders · 09:00 - 23:00' : '08:30 - 22:00'),
            instagramUrl: instagramUrl.trim() || null,
            facebookUrl: facebookUrl.trim() || null,
            googleMapsUrl:
              sellerType === 'physical_store' ? googleMapsUrl.trim() || null : null,
          }),
        });
        targetStore = updated.store;
      } else {
        const created = await apiFetch<{ store: Store }>('/api/merchant/stores', {
          method: 'POST',
          body: JSON.stringify({
            name: trimmedName,
            storeType: sellerType,
            description: resolvedDesc,
            area,
            address:
              sellerType === 'physical_store'
                ? address.trim()
                : `Online Storefront · ${area}, Djelfa`,
            phone: cleanPhone,
            whatsapp: normalizedWa || cleanPhone,
            openingHours:
              openingHours.trim() ||
              (sellerType === 'online_page' ? 'Online Orders · 09:00 - 23:00' : '08:30 - 22:00'),
            categories: ['cat-pc-parts', 'cat-phones'],
            instagramUrl: instagramUrl.trim() || null,
            facebookUrl: facebookUrl.trim() || null,
            googleMapsUrl:
              sellerType === 'physical_store' ? googleMapsUrl.trim() || null : null,
          }),
        });
        targetStore = created.store;
      }

      try {
        await saveStoreProfileToFirestore(googleSession.fbUser, targetStore);
      } catch {
        // Best-effort Firestore cloud mirror
      }

      notify(
        `${targetStore.name} is ready! Opening your dedicated storefront page so you can add products & logo.`
      );
      onSuccess(googleSession.user, { storeSlug: targetStore.slug });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save store details.');
    } finally {
      setSubmitting(false);
    }
  };

  const activeStep = useMemo(() => {
    const phoneOk = phone.trim().length >= 8 && phone.replace(/\D/g, '').length >= 8;
    if (googleSession) {
      const hasReadyBusiness =
        storeName.trim().length >= 2 &&
        phoneOk &&
        (sellerType === 'online_page' || address.trim().length >= 4);
      return hasReadyBusiness ? 3 : 2;
    }
    const hasPersonal = firstName.trim().length >= 2 && email.includes('@') && password.length >= 6;
    const hasBusiness =
      storeName.trim().length >= 2 &&
      phoneOk &&
      (sellerType === 'online_page' || address.trim().length >= 4);
    if (hasPersonal && hasBusiness) return 3;
    if (firstName.trim().length > 0 || storeName.trim().length > 0 || email.trim().length > 0) {
      return 2;
    }
    return 1;
  }, [googleSession, firstName, email, password, storeName, phone, sellerType, address]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const fullName = `${firstName.trim()} ${lastName.trim()}`.trim();
    if (fullName.length < 2) {
      setError('Please enter your first and last name (at least 2 characters).');
      return;
    }
    if (storeName.trim().length < 2) {
      setError(
        sellerType === 'online_page'
          ? 'Online Page Name must be at least 2 characters.'
          : 'Shop Name must be at least 2 characters.'
      );
      return;
    }
    const cleanPhone = phone.trim();
    if (cleanPhone.length < 8 || cleanPhone.replace(/\D/g, '').length < 8) {
      setError('Phone / WhatsApp must be a valid number with at least 8 digits (e.g. 0661 24 88 10).');
      return;
    }
    if (password.length < 6) {
      setError('Password must be at least 6 characters.');
      return;
    }
    if (sellerType === 'physical_store' && address.trim().length < 4) {
      setError('Please enter your physical shop street address (at least 4 characters).');
      return;
    }

    setSubmitting(true);
    try {
      const payload = {
        fullName,
        email: email.trim(),
        phone: phone.trim(),
        password,
        role: 'merchant' as const,
        sellerType,
        storeName: storeName.trim(),
        area,
        ...(sellerType === 'physical_store'
          ? { address: address.trim() }
          : {
              instagramUrl: instagramUrl.trim() || undefined,
              facebookUrl: facebookUrl.trim() || undefined,
            }),
      };

      const res = await apiFetch<{ user: PublicUser; token: string; store?: Store | null }>(
        '/api/auth/register',
        {
          method: 'POST',
          body: JSON.stringify(payload),
        }
      );
      setAuthToken(res.token);
      onSuccess(res.user, { storeSlug: res.store?.slug });
      notify(
        `Welcome, ${res.user.fullName}! Your ${
          sellerType === 'online_page' ? 'Online Seller Page' : 'Physical Store'
        } storefront is live.`
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create seller account.');
    } finally {
      setSubmitting(false);
    }
  };

  const steps = googleSession
    ? [
        {
          num: 1,
          title: 'Gmail connected & verified',
        },
        {
          num: 2,
          title:
            sellerType === 'online_page'
              ? 'Add your online page & social links'
              : 'Add your shop address & hours',
        },
        {
          num: 3,
          title: 'Open Storefront & add products',
        },
      ]
    : [
        {
          num: 1,
          title:
            sellerType === 'online_page'
              ? 'Online Seller selected (IG / FB)'
              : 'Physical Store selected (Map + Pickup)',
        },
        {
          num: 2,
          title:
            sellerType === 'online_page'
              ? 'Set up your online page & channels'
              : 'Set up your shop address & workspace',
        },
        {
          num: 3,
          title: 'Open Storefront & QR profile',
        },
      ];

  return (
    <div dir={isAr ? 'rtl' : 'ltr'} className="min-h-screen bg-[#FAF8FE] px-3 py-4 sm:px-6 sm:py-8 dark:bg-[#050507]">
      <div className="mx-auto max-w-6xl">
        <div className="overflow-hidden rounded-[28px] border border-[#22222C] bg-[#0B0B10] p-3 sm:p-4 text-white shadow-2xl">
          <div className="grid gap-4 lg:grid-cols-12 items-stretch">
            <div
              className="relative flex flex-col justify-between overflow-hidden rounded-[22px] border border-white/10 p-6 sm:p-10 lg:col-span-5 min-h-[420px] lg:min-h-[680px]"
              style={{
                background:
                  'radial-gradient(125% 78% at 50% -6%, #FBEFFB 0%, #9678CE 28%, #4A3894 56%, #1D1438 84%, #140E26 100%)',
              }}
            >
              <div className="relative z-10 flex items-center justify-between gap-2">
                <button
                  type="button"
                  onClick={onBack}
                  className="inline-flex items-center gap-1.5 rounded-full border border-white/20 bg-black/25 px-3.5 py-1.5 text-xs font-semibold text-white backdrop-blur-xs transition hover:bg-black/45 cursor-pointer"
                >
                  <ArrowLeft className="h-3.5 w-3.5 rtl:rotate-180" />
                  <span>{isAr ? 'العودة إلى ماركتلي' : 'Back to Marketly'}</span>
                </button>

                {existingUser?.roles.includes('merchant') && onOpenMerchantPortal && (
                  <button
                    type="button"
                    onClick={onOpenMerchantPortal}
                    className="inline-flex items-center gap-1 rounded-full bg-[#FBEFFB] px-3 py-1.5 text-[11px] font-extrabold text-[#4A3894] hover:brightness-95 cursor-pointer"
                  >
                    <span>{isAr ? 'بوابة التاجر' : 'Seller Studio'}</span>
                    <ArrowRight className="h-3 w-3 rtl:rotate-180" />
                  </button>
                )}
              </div>

              <div className="relative z-10 mt-12 flex flex-col items-center text-center">
                <div className="inline-flex items-center gap-2 text-sm font-bold tracking-tight text-white/95">
                  <span className="flex h-6 w-6 items-center justify-center rounded-full border border-white/70 bg-white/15">
                    <StoreIcon className="h-3.5 w-3.5 text-white" />
                  </span>
                  <span className="font-display">{isAr ? 'ماركتلي' : 'Marketly'}</span>
                </div>

                <h1 className="font-display mt-4 text-3xl sm:text-4xl font-bold tracking-tight text-white text-balance">
                  {googleSession
                    ? isAr
                      ? 'متجرك جاهز تقريباً'
                      : 'Almost Ready to Sell'
                    : isAr
                      ? 'ابدأ البيع في الجلفة معنا'
                      : 'Get Started with Us'}
                </h1>
                <p className="mt-2 max-w-xs text-xs sm:text-sm leading-relaxed text-[#E9DFF9]">
                  {googleSession
                    ? isAr
                      ? 'أكمل بيانات متجرك أدناه، ثم أضف شعارك ومنتجاتك في واجهة المتجر.'
                      : 'Finish your store details below, then customize your dedicated storefront page with logo & products.'
                    : isAr
                      ? 'اتبع هذه الخطوات البسيطة لإنشاء حساب بائع على ماركتلي الجلفة.'
                      : 'Complete these easy steps to register your Marketly Djelfa seller account today.'}
                </p>

                <div className="mt-7 w-full max-w-xs space-y-2.5 text-start">
                  {steps.map((step) => {
                    const isActive = activeStep === step.num;
                    const isCompleted = activeStep > step.num;
                    return (
                      <div
                        key={step.num}
                        className={`flex items-center gap-3 rounded-xl px-4 py-3 text-xs font-semibold transition-all duration-200 ${
                          isActive
                            ? 'bg-white text-[#1E1438] shadow-lg'
                            : 'border border-white/10 bg-white/[0.08] text-[#E9DFF9]'
                        }`}
                      >
                        <span
                          className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-extrabold tabular-nums ${
                            isActive
                              ? 'bg-[#4A3894] text-white'
                              : isCompleted
                                ? 'bg-[#E794C9] text-[#1E1438]'
                                : 'bg-white/15 text-[#E9DFF9]'
                          }`}
                        >
                          {isCompleted ? <Check className="h-3.5 w-3.5" /> : step.num}
                        </span>
                        <span className="truncate">{step.title}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* RIGHT HALF: Dark Sign Up Panel OR Post-Gmail "Complete Your Store Info" Step */}
            <div className="flex flex-col justify-center px-3 py-6 sm:px-8 lg:col-span-7 lg:py-8">
              {googleSession ? (
                <div className="mx-auto w-full max-w-md space-y-5">
                  {/* Verified Gmail Badge Strip */}
                  <div className="flex items-center justify-between gap-3 rounded-2xl border border-emerald-500/35 bg-emerald-950/35 px-4 py-3 text-xs">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#E794C9] text-[#1E1438]">
                        <Check className="h-4 w-4" />
                      </span>
                      <div className="min-w-0">
                        <div className="font-bold text-white truncate">
                          Signed in with Google Gmail
                        </div>
                        <div className="flex items-center gap-1 text-[11px] text-emerald-300 truncate">
                          <Mail className="h-3 w-3 shrink-0" />
                          <span className="truncate">{googleSession.fbEmail}</span>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="text-center sm:text-left">
                    <h2 className="font-display text-2xl sm:text-[26px] font-bold tracking-tight text-white">
                      Complete Your Store Info
                    </h2>
                    <p className="mt-1.5 text-xs sm:text-sm text-[#9D9BB0]">
                      Add the rest of your business details, then we will open your dedicated storefront page to upload your logo &amp; products.
                    </p>
                  </div>

                  {/* Business Type Toggle (still editable post-Gmail!) */}
                  <div
                    role="radiogroup"
                    aria-label="Choose seller type"
                    className="grid grid-cols-2 gap-3"
                  >
                    <button
                      type="button"
                      role="radio"
                      aria-checked={sellerType === 'online_page'}
                      onClick={() => handleSelectSellerType('online_page')}
                      className={`flex items-center gap-2.5 rounded-xl border p-3 text-left transition cursor-pointer ${
                        sellerType === 'online_page'
                          ? 'border-[#9A8CFF] bg-[#6E65F6]/20 text-white'
                          : 'border-[#262436] bg-[#121119] text-[#A09FB1] hover:border-white/30 hover:text-white'
                      }`}
                    >
                      <span
                        className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${
                          sellerType === 'online_page'
                            ? 'bg-[#6E65F6] text-white'
                            : 'bg-white/5 text-[#B6B5C7]'
                        }`}
                      >
                        <Globe className="h-4 w-4" />
                      </span>
                      <div className="min-w-0">
                        <div className="font-display text-xs font-bold text-white">
                          Online Seller
                        </div>
                        <div className="truncate text-[10px] text-[#9D9BB0]">IG · FB · WhatsApp</div>
                      </div>
                    </button>

                    <button
                      type="button"
                      role="radio"
                      aria-checked={sellerType === 'physical_store'}
                      onClick={() => handleSelectSellerType('physical_store')}
                      className={`flex items-center gap-2.5 rounded-xl border p-3 text-start transition cursor-pointer ${
                        sellerType === 'physical_store'
                          ? 'border-[#E794C9] bg-[#E794C9]/15 text-white'
                          : 'border-[#22222C] bg-[#0E0E13] text-[#B9B0D8] hover:border-white/30 hover:text-white'
                      }`}
                    >
                      <span
                        className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${
                          sellerType === 'physical_store'
                            ? 'bg-[#E794C9] text-[#1E1438]'
                            : 'bg-white/5 text-[#B9B0D8]'
                        }`}
                      >
                        <StoreIcon className="h-4 w-4" />
                      </span>
                      <div className="min-w-0">
                        <div className="font-display text-xs font-bold text-white">
                          Physical Store
                        </div>
                        <div className="truncate text-[10px] text-[#B9B0D8]">Shop · Map · Pickup</div>
                      </div>
                    </button>
                  </div>

                  <form onSubmit={handleCompleteGoogleStore} className="space-y-3.5">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label
                          htmlFor="post-gmail-store-name"
                          className="block text-xs font-medium text-[#E4E4F0]"
                        >
                          {sellerType === 'online_page' ? 'Online Page Name *' : 'Shop Name *'}
                        </label>
                        <input
                          id="post-gmail-store-name"
                          required
                          value={storeName}
                          onChange={(e) => setStoreName(e.target.value)}
                          placeholder={
                            sellerType === 'online_page'
                              ? 'eg. Souf Gadgets IG'
                              : 'eg. Sahara PC Store'
                          }
                          className="mt-1.5 w-full rounded-xl border border-[#252334] bg-[#15141E] px-3.5 py-2.5 text-sm text-white placeholder:text-[#68667A] focus:border-[#8B7BFF] focus:outline-none"
                        />
                      </div>
                      <div>
                        <label
                          htmlFor="post-gmail-phone"
                          className="block text-xs font-medium text-[#E4E4F0]"
                        >
                          Phone / WhatsApp *
                        </label>
                        <input
                          id="post-gmail-phone"
                          required
                          value={phone}
                          onChange={(e) => setPhone(e.target.value)}
                          placeholder="eg. 0661 24 88 10"
                          className="mt-1.5 w-full rounded-xl border border-[#252334] bg-[#15141E] px-3.5 py-2.5 text-sm text-white placeholder:text-[#68667A] focus:border-[#8B7BFF] focus:outline-none"
                        />
                        <p className="mt-1 text-[10px] text-[#8A879E]">
                          At least 8 digits (e.g. 0661 24 88 10)
                        </p>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label
                          htmlFor="post-gmail-area"
                          className="block text-xs font-medium text-[#E4E4F0]"
                        >
                          Djelfa Area
                        </label>
                        <select
                          id="post-gmail-area"
                          value={area}
                          onChange={(e) => setArea(e.target.value)}
                          className="mt-1.5 w-full rounded-xl border border-[#252334] bg-[#15141E] px-3 py-2.5 text-xs text-white focus:border-[#9678CE] focus:outline-none"
                        >
                          {DJELFA_AREAS.map((a) => (
                            <option key={a.name} value={a.name}>
                              {isAr ? a.nameAr : a.name}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label
                          htmlFor="post-gmail-hours"
                          className="block text-xs font-medium text-[#E4E4F0]"
                        >
                          Working Hours
                        </label>
                        <input
                          id="post-gmail-hours"
                          value={openingHours}
                          onChange={(e) => setOpeningHours(e.target.value)}
                          placeholder="08:30 - 22:00"
                          className="mt-1.5 w-full rounded-xl border border-[#252334] bg-[#15141E] px-3 py-2.5 text-xs text-white placeholder:text-[#68667A] focus:border-[#9678CE] focus:outline-none"
                        />
                      </div>
                    </div>

                    {sellerType === 'physical_store' ? (
                      <div className="space-y-3">
                        <div>
                          <label
                            htmlFor="post-gmail-address"
                            className="block text-xs font-medium text-[#E4E4F0]"
                          >
                            Physical Shop Street Address *
                          </label>
                          <input
                            id="post-gmail-address"
                            required
                            value={address}
                            onChange={(e) => setAddress(e.target.value)}
                            placeholder="eg. 14 Boulevard de l'ALN, Djelfa"
                            className="mt-1.5 w-full rounded-xl border border-[#252334] bg-[#15141E] px-3.5 py-2.5 text-sm text-white placeholder:text-[#68667A] focus:border-[#9678CE] focus:outline-none"
                          />
                        </div>
                        <div>
                          <label
                            htmlFor="post-gmail-maps"
                            className="flex items-center gap-1.5 text-xs font-medium text-[#E4E4F0]"
                          >
                            <MapPin className="h-3.5 w-3.5 text-[#E794C9]" />
                            <span>Google Maps Link (optional)</span>
                          </label>
                          <input
                            id="post-gmail-maps"
                            value={googleMapsUrl}
                            onChange={(e) => setGoogleMapsUrl(e.target.value)}
                            placeholder="https://maps.google.com/?q=34.6728,3.2630"
                            className="mt-1.5 w-full rounded-xl border border-[#252334] bg-[#15141E] px-3.5 py-2.5 text-xs text-white placeholder:text-[#68667A] focus:border-[#9678CE] focus:outline-none"
                          />
                        </div>
                      </div>
                    ) : (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div>
                          <label
                            htmlFor="post-gmail-instagram"
                            className="block text-xs font-medium text-[#E4E4F0]"
                          >
                            Instagram Handle / Link
                          </label>
                          <input
                            id="post-gmail-instagram"
                            value={instagramUrl}
                            onChange={(e) => setInstagramUrl(e.target.value)}
                            placeholder="@yourpage.dz"
                            className="mt-1.5 w-full rounded-xl border border-[#252334] bg-[#15141E] px-3.5 py-2.5 text-xs text-white placeholder:text-[#68667A] focus:border-[#8B7BFF] focus:outline-none"
                          />
                        </div>
                        <div>
                          <label
                            htmlFor="post-gmail-facebook"
                            className="block text-xs font-medium text-[#E4E4F0]"
                          >
                            Facebook Page Link
                          </label>
                          <input
                            id="post-gmail-facebook"
                            value={facebookUrl}
                            onChange={(e) => setFacebookUrl(e.target.value)}
                            placeholder="fb.com/yourpage"
                            className="mt-1.5 w-full rounded-xl border border-[#252334] bg-[#15141E] px-3.5 py-2.5 text-xs text-white placeholder:text-[#68667A] focus:border-[#8B7BFF] focus:outline-none"
                          />
                        </div>
                      </div>
                    )}

                    <div>
                      <label
                        htmlFor="post-gmail-desc"
                        className="block text-xs font-medium text-[#E4E4F0]"
                      >
                        Short Store Bio
                      </label>
                      <textarea
                        id="post-gmail-desc"
                        rows={2}
                        maxLength={320}
                        value={description}
                        onChange={(e) => setDescription(e.target.value)}
                        placeholder="Describe what you sell (PC components, smartphones, fast delivery in Djelfa...)"
                        className="mt-1.5 w-full rounded-xl border border-[#252334] bg-[#15141E] px-3.5 py-2 text-xs text-white placeholder:text-[#68667A] focus:border-[#9678CE] focus:outline-none"
                      />
                    </div>

                    {error && (
                      <div
                        role="alert"
                        className="rounded-xl border border-rose-500/40 bg-rose-950/50 px-3.5 py-2.5 text-xs font-medium text-rose-200"
                      >
                        {error}
                      </div>
                    )}

                    <button
                      type="submit"
                      disabled={submitting}
                      className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-[#9678CE] py-3 text-sm font-extrabold text-white shadow-md transition hover:bg-[#4A3894] disabled:opacity-50 cursor-pointer"
                    >
                      <span>
                        {submitting
                          ? 'Saving & opening your storefront...'
                          : 'Save & Open My Storefront Page'}
                      </span>
                      <ArrowRight className="h-4 w-4" />
                    </button>

                    {googleSession.store?.slug && (
                      <button
                        type="button"
                        onClick={() =>
                          onSuccess(googleSession.user, {
                            storeSlug: googleSession.store?.slug,
                          })
                        }
                        className="w-full py-1.5 text-center text-xs font-medium text-[#9D9BB0] hover:text-white cursor-pointer"
                      >
                        Add the rest later — go straight to my storefront page &rarr;
                      </button>
                    )}
                  </form>
                </div>
              ) : (
                <div className="mx-auto w-full max-w-md space-y-5">
                  <div className="text-center">
                    <h2 className="font-display text-2xl sm:text-[26px] font-bold tracking-tight text-white">
                      Sign Up Account
                    </h2>
                    <p className="mt-1.5 text-xs sm:text-sm text-[#9D9BB0]">
                      Choose your seller half below and enter your data to start selling.
                    </p>
                  </div>

                  {/* 2 EQUAL HALVES SELECTOR: Half 1 = Online Seller | Half 2 = Physical Store */}
                  <div
                    role="radiogroup"
                    aria-label="Choose seller type"
                    className="grid grid-cols-2 gap-3"
                  >
                    <button
                      type="button"
                      role="radio"
                      aria-checked={sellerType === 'online_page'}
                      onClick={() => handleSelectSellerType('online_page')}
                      className={`group flex flex-col items-start rounded-xl border p-3.5 text-left transition cursor-pointer ${
                        sellerType === 'online_page'
                          ? 'border-[#9A8CFF] bg-[#6E65F6]/18 text-white shadow-sm'
                          : 'border-[#262436] bg-[#121119] text-[#A09FB1] hover:border-white/30 hover:text-white'
                      }`}
                    >
                      <div className="flex w-full items-center justify-between gap-2">
                        <span
                          className={`flex h-8 w-8 items-center justify-center rounded-lg ${
                            sellerType === 'online_page'
                              ? 'bg-[#6E65F6] text-white'
                              : 'bg-white/5 text-[#B6B5C7]'
                          }`}
                        >
                          <Globe className="h-4 w-4" />
                        </span>
                        {sellerType === 'online_page' && (
                          <span className="text-[10px] font-bold uppercase tracking-wider text-[#D9C4FF]">
                            Selected
                          </span>
                        )}
                      </div>
                      <div className="mt-2.5 font-display text-sm font-bold text-white">
                        Online Seller
                      </div>
                      <div className="mt-0.5 text-[11px] text-[#9D9BB0]">
                        Instagram · Facebook · WhatsApp
                      </div>
                    </button>

                    <button
                      type="button"
                      role="radio"
                      aria-checked={sellerType === 'physical_store'}
                      onClick={() => handleSelectSellerType('physical_store')}
                      className={`group flex flex-col items-start rounded-xl border p-3.5 text-start transition cursor-pointer ${
                        sellerType === 'physical_store'
                          ? 'border-[#E794C9] bg-[#E794C9]/15 text-white shadow-sm'
                          : 'border-[#22222C] bg-[#0E0E13] text-[#B9B0D8] hover:border-white/30 hover:text-white'
                      }`}
                    >
                      <div className="flex w-full items-center justify-between gap-2">
                        <span
                          className={`flex h-8 w-8 items-center justify-center rounded-lg ${
                            sellerType === 'physical_store'
                              ? 'bg-[#E794C9] text-[#1E1438]'
                              : 'bg-white/5 text-[#B9B0D8]'
                          }`}
                        >
                          <StoreIcon className="h-4 w-4" />
                        </span>
                        {sellerType === 'physical_store' && (
                          <span className="text-[10px] font-bold uppercase tracking-wider text-[#E794C9]">
                            Selected
                          </span>
                        )}
                      </div>
                      <div className="mt-2.5 font-display text-sm font-bold text-white">
                        Physical Store
                      </div>
                      <div className="mt-0.5 text-[11px] text-[#B9B0D8]">
                        Walk-in Shop · Map Pin · Pickup
                      </div>
                    </button>
                  </div>

                  {/* Google (Gmail) One-Click Seller Sign Up -> leads into Complete Store Info -> Storefront Page */}
                  <button
                    type="button"
                    disabled={googleLoading || submitting}
                    onClick={handleGoogleSignUp}
                    className="flex w-full items-center justify-center gap-2.5 rounded-xl border border-[#2C293D] bg-[#15141E] px-4 py-2.5 text-xs sm:text-sm font-semibold text-white transition hover:border-white/40 hover:bg-[#1C1A28] disabled:opacity-50 cursor-pointer"
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
                      {googleLoading
                        ? 'Connecting Google Gmail...'
                        : `Continue with Google (Gmail) — ${
                            sellerType === 'online_page' ? 'Online Seller' : 'Physical Store'
                          }`}
                    </span>
                  </button>

                  {/* Hairline Divider */}
                  <div className="flex items-center gap-3 text-[11px] text-[#6E6B80]">
                    <div className="h-px flex-1 bg-[#222030]" />
                    <span>
                      Or fill {sellerType === 'online_page' ? 'online page' : 'physical shop'} details
                    </span>
                    <div className="h-px flex-1 bg-[#222030]" />
                  </div>

                  {/* Form */}
                  <form onSubmit={handleSubmit} className="space-y-3.5">
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label
                          htmlFor="seller-first-name"
                          className="block text-xs font-medium text-[#E4E4F0]"
                        >
                          First Name
                        </label>
                        <input
                          id="seller-first-name"
                          required
                          value={firstName}
                          onChange={(e) => setFirstName(e.target.value)}
                          placeholder="eg. Amina"
                          className="mt-1.5 w-full rounded-xl border border-[#252334] bg-[#15141E] px-3.5 py-2.5 text-sm text-white placeholder:text-[#68667A] focus:border-[#8B7BFF] focus:outline-none"
                        />
                      </div>
                      <div>
                        <label
                          htmlFor="seller-last-name"
                          className="block text-xs font-medium text-[#E4E4F0]"
                        >
                          Last Name
                        </label>
                        <input
                          id="seller-last-name"
                          required
                          value={lastName}
                          onChange={(e) => setLastName(e.target.value)}
                          placeholder="eg. Benali"
                          className="mt-1.5 w-full rounded-xl border border-[#252334] bg-[#15141E] px-3.5 py-2.5 text-sm text-white placeholder:text-[#68667A] focus:border-[#8B7BFF] focus:outline-none"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label
                          htmlFor="seller-store-name"
                          className="block text-xs font-medium text-[#E4E4F0]"
                        >
                          {sellerType === 'online_page' ? 'Online Page Name' : 'Shop Name'}
                        </label>
                        <input
                          id="seller-store-name"
                          required
                          value={storeName}
                          onChange={(e) => setStoreName(e.target.value)}
                          placeholder={
                            sellerType === 'online_page'
                              ? 'eg. Souf Gadgets IG'
                              : 'eg. Sahara PC Store'
                          }
                          className="mt-1.5 w-full rounded-xl border border-[#252334] bg-[#15141E] px-3.5 py-2.5 text-sm text-white placeholder:text-[#68667A] focus:border-[#8B7BFF] focus:outline-none"
                        />
                      </div>
                      <div>
                        <label
                          htmlFor="seller-phone"
                          className="block text-xs font-medium text-[#E4E4F0]"
                        >
                          Phone / WhatsApp
                        </label>
                        <input
                          id="seller-phone"
                          required
                          value={phone}
                          onChange={(e) => setPhone(e.target.value)}
                          placeholder="eg. 0661 24 88 10"
                          className="mt-1.5 w-full rounded-xl border border-[#252334] bg-[#15141E] px-3.5 py-2.5 text-sm text-white placeholder:text-[#68667A] focus:border-[#8B7BFF] focus:outline-none"
                        />
                        <p className="mt-1 text-[10px] text-[#8A879E]">
                          At least 8 digits (e.g. 0661 24 88 10)
                        </p>
                      </div>
                    </div>

                    {sellerType === 'online_page' ? (
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                        <div>
                          <label
                            htmlFor="seller-instagram"
                            className="block text-xs font-medium text-[#E4E4F0]"
                          >
                            Instagram
                          </label>
                          <input
                            id="seller-instagram"
                            value={instagramUrl}
                            onChange={(e) => setInstagramUrl(e.target.value)}
                            placeholder="@yourpage.dz"
                            className="mt-1.5 w-full rounded-xl border border-[#252334] bg-[#15141E] px-3 py-2.5 text-xs text-white placeholder:text-[#68667A] focus:border-[#8B7BFF] focus:outline-none"
                          />
                        </div>
                        <div>
                          <label
                            htmlFor="seller-facebook"
                            className="block text-xs font-medium text-[#E4E4F0]"
                          >
                            Facebook Page
                          </label>
                          <input
                            id="seller-facebook"
                            value={facebookUrl}
                            onChange={(e) => setFacebookUrl(e.target.value)}
                            placeholder="fb.com/yourpage"
                            className="mt-1.5 w-full rounded-xl border border-[#252334] bg-[#15141E] px-3 py-2.5 text-xs text-white placeholder:text-[#68667A] focus:border-[#8B7BFF] focus:outline-none"
                          />
                        </div>
                        <div>
                          <label
                            htmlFor="seller-area-online"
                            className="block text-xs font-medium text-[#E4E4F0]"
                          >
                            Base Area
                          </label>
                          <select
                            id="seller-area-online"
                            value={area}
                            onChange={(e) => setArea(e.target.value)}
                            className="mt-1.5 w-full rounded-xl border border-[#252334] bg-[#15141E] px-2.5 py-2.5 text-xs text-white focus:border-[#8B7BFF] focus:outline-none"
                          >
                            {DJELFA_AREAS.map((a) => (
                              <option key={a.name} value={a.name}>
                                {isAr ? a.nameAr : a.name}
                              </option>
                            ))}
                          </select>
                        </div>
                      </div>
                    ) : (
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                        <div className="sm:col-span-2">
                          <label
                            htmlFor="seller-address"
                            className="block text-xs font-medium text-[#E4E4F0]"
                          >
                            Physical Shop Address
                          </label>
                          <input
                            id="seller-address"
                            required
                            value={address}
                            onChange={(e) => setAddress(e.target.value)}
                            placeholder="eg. 14 Boulevard de l'ALN, Djelfa"
                            className="mt-1.5 w-full rounded-xl border border-[#252334] bg-[#15141E] px-3.5 py-2.5 text-sm text-white placeholder:text-[#68667A] focus:border-[#9678CE] focus:outline-none"
                          />
                        </div>
                        <div>
                          <label
                            htmlFor="seller-area-physical"
                            className="block text-xs font-medium text-[#E4E4F0]"
                          >
                            Area
                          </label>
                          <select
                            id="seller-area-physical"
                            value={area}
                            onChange={(e) => setArea(e.target.value)}
                            className="mt-1.5 w-full rounded-xl border border-[#252334] bg-[#15141E] px-2.5 py-2.5 text-xs text-white focus:border-[#9678CE] focus:outline-none"
                          >
                            {DJELFA_AREAS.map((a) => (
                              <option key={a.name} value={a.name}>
                                {isAr ? a.nameAr : a.name}
                              </option>
                            ))}
                          </select>
                        </div>
                      </div>
                    )}

                    <div>
                      <label htmlFor="seller-email" className="block text-xs font-medium text-[#E4E4F0]">
                        Email
                      </label>
                      <input
                        id="seller-email"
                        required
                        type="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder="eg. amina@marketly.dz"
                        className="mt-1.5 w-full rounded-xl border border-[#252334] bg-[#15141E] px-3.5 py-2.5 text-sm text-white placeholder:text-[#68667A] focus:border-[#8B7BFF] focus:outline-none"
                      />
                    </div>

                    <div>
                      <label
                        htmlFor="seller-password"
                        className="block text-xs font-medium text-[#E4E4F0]"
                      >
                        Password
                      </label>
                      <div className="relative mt-1.5">
                        <input
                          id="seller-password"
                          required
                          type={showPassword ? 'text' : 'password'}
                          value={password}
                          onChange={(e) => setPassword(e.target.value)}
                          placeholder="Enter your password"
                          className="w-full rounded-xl border border-[#252334] bg-[#15141E] pl-3.5 pr-10 py-2.5 text-sm text-white placeholder:text-[#68667A] focus:border-[#8B7BFF] focus:outline-none"
                        />
                        <button
                          type="button"
                          onClick={() => setShowPassword((v) => !v)}
                          aria-label={showPassword ? 'Hide password' : 'Show password'}
                          className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded-lg p-1.5 text-[#8A879E] hover:text-white cursor-pointer"
                        >
                          {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                        </button>
                      </div>
                      <p className="mt-1.5 text-[11px] text-[#8A879E]">
                        Must be at least 6 characters.
                      </p>
                    </div>

                    {error && (
                      <div
                        role="alert"
                        className="rounded-xl border border-rose-500/40 bg-rose-950/50 px-3.5 py-2.5 text-xs font-medium text-rose-200"
                      >
                        {error}
                      </div>
                    )}

                    <button
                      type="submit"
                      disabled={submitting}
                      className="mt-1 w-full rounded-xl bg-white py-3 text-sm font-bold text-[#09080E] shadow-md transition hover:bg-[#ECEAF7] disabled:opacity-50 cursor-pointer"
                    >
                      {submitting
                        ? 'Creating your storefront...'
                        : sellerType === 'online_page'
                          ? 'Sign Up — Online Seller'
                          : 'Sign Up — Physical Store'}
                    </button>
                  </form>

                  <div className="pt-1 text-center text-xs text-[#8A879E]">
                    Already have an account?{' '}
                    <button
                      type="button"
                      onClick={onOpenLogin}
                      className="font-bold text-white hover:text-[#E794C9] cursor-pointer"
                    >
                      Log in
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

