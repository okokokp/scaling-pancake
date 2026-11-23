import React, { useState } from 'react';
import { Download, Share, WifiOff, X } from 'lucide-react';
import type { LanguageCode } from '../../shared/types.ts';
import { useOnlineStatus, usePWAInstall } from '../hooks/usePWAInstall.ts';

export const PWAInstallButton: React.FC<{ compact?: boolean; lang?: LanguageCode }> = ({
  compact = false,
  lang = 'en',
}) => {
  const isAr = lang === 'ar';
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();
  const [showIOSGuide, setShowIOSGuide] = useState(false);

  if (isInstalled) return null;

  if (isInstallable) {
    return (
      <button
        type="button"
        onClick={install}
        className="inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full bg-[#4A3894] px-3.5 py-1.5 text-xs font-semibold text-white transition hover:bg-[#3A2B78] cursor-pointer"
      >
        <Download className="h-3.5 w-3.5" />
        <span>
          {compact
            ? isAr
              ? 'تثبيت'
              : 'Install'
            : isAr
              ? 'تثبيت التطبيق'
              : 'Install App'}
        </span>
      </button>
    );
  }

  if (isIOS) {
    return (
      <>
        <button
          type="button"
          onClick={() => setShowIOSGuide(true)}
          className="inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border border-[#E4DCF7] bg-white px-3 py-1.5 text-xs font-medium text-[#1E1438] transition hover:bg-[#F5F0FC] dark:border-[#22222C] dark:bg-[#15151C] dark:text-white cursor-pointer"
        >
          <Download className="h-3.5 w-3.5" />
          <span>{isAr ? 'تثبيت على iOS' : 'Install on iOS'}</span>
        </button>

        {showIOSGuide && (
          <div
            dir={isAr ? 'rtl' : 'ltr'}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-xs"
          >
            <div className="modal-enter w-full max-w-sm rounded-2xl border border-[#E4DCF7] bg-white p-6 shadow-xl dark:border-[#22222C] dark:bg-[#0E0E13]">
              <div className="flex items-center justify-between">
                <h3 className="font-display text-lg font-bold text-[#1E1438] dark:text-white">
                  {isAr ? 'تثبيت ماركتلي على iOS' : 'Install Marketly on iOS'}
                </h3>
                <button
                  type="button"
                  onClick={() => setShowIOSGuide(false)}
                  aria-label={isAr ? 'إغلاق' : 'Close'}
                  className="rounded-full p-1.5 text-[#5E5C70] hover:bg-[#F5F0FC] dark:text-[#B9B0D8] dark:hover:bg-[#15151C]"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
              <ol className="mt-3 space-y-2 text-sm text-[#5E5C70] dark:text-[#B9B0D8]">
                <li className="flex items-center gap-2">
                  <Share className="h-4 w-4 shrink-0 text-[#4A3894] dark:text-[#9678CE]" />
                  <span>
                    {isAr
                      ? '1. اضغط على زر المشاركة في متصفح Safari.'
                      : '1. Tap the Share button in Safari.'}
                  </span>
                </li>
                <li>
                  {isAr
                    ? '2. مرر للأسفل واختر "إضافة إلى الشاشة الرئيسية".'
                    : '2. Scroll down and tap “Add to Home Screen”.'}
                </li>
              </ol>
              <button
                type="button"
                onClick={() => setShowIOSGuide(false)}
                className="mt-5 w-full rounded-full bg-[#4A3894] py-2.5 text-sm font-semibold text-white hover:bg-[#3A2B78]"
              >
                {isAr ? 'فهمت' : 'Got it'}
              </button>
            </div>
          </div>
        )}
      </>
    );
  }

  return null;
};

export const OfflineIndicator: React.FC<{ lang?: LanguageCode }> = ({ lang = 'en' }) => {
  const isAr = lang === 'ar';
  const isOnline = useOnlineStatus();
  if (isOnline) return null;

  return (
    <div
      dir={isAr ? 'rtl' : 'ltr'}
      role="status"
      className="fixed bottom-20 start-4 z-50 flex items-center gap-2 rounded-full border border-[#4A3894] bg-[#2A1F4D] px-4 py-2 text-xs font-medium text-white shadow-lg md:bottom-5"
    >
      <WifiOff className="h-3.5 w-3.5 text-[#E794C9]" />
      <span>
        {isAr
          ? 'وضع عدم الاتصال — يتم عرض البيانات المخزنة مؤقتاً'
          : 'Offline mode — showing cached marketplace data'}
      </span>
    </div>
  );
};
