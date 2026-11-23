import React, { useEffect, useMemo, useState } from 'react';
import QRCode from 'qrcode';
import {
  Check,
  Copy,
  Download,
  ExternalLink,
  Printer,
  QrCode,
  RotateCcw,
  Smartphone,
  Store as StoreIcon,
  X,
} from 'lucide-react';
import type { Store } from '../../shared/types.ts';

interface SellerQRPrintModalProps {
  open: boolean;
  stores: Store[];
  initialStoreId?: string | null;
  onClose: () => void;
  onPreviewStore: (slug: string) => void;
  notify: (msg: string, type?: 'success' | 'error') => void;
}

type PosterTemplate = 'stand' | 'poster' | 'sticker';

export const SellerQRPrintModal: React.FC<SellerQRPrintModalProps> = ({
  open,
  stores,
  initialStoreId,
  onClose,
  onPreviewStore,
  notify,
}) => {
  const [selectedStoreId, setSelectedStoreId] = useState<string>('');
  const [template, setTemplate] = useState<PosterTemplate>('stand');
  const [headline, setHeadline] = useState('Scan to Browse & Order');
  const [subline, setSubline] = useState('Live DZD prices · Check stock · Install Shop App (PWA)');
  const [baseUrl, setBaseUrl] = useState<string>(() =>
    typeof window !== 'undefined' ? window.location.origin : ''
  );
  const [qrDataUrl, setQrDataUrl] = useState<string>('');
  const [qrSvg, setQrSvg] = useState<string>('');
  const [copied, setCopied] = useState(false);
  const [downloadingPng, setDownloadingPng] = useState(false);

  // Sync default store when modal opens
  useEffect(() => {
    if (!open) return;
    if (initialStoreId && stores.some((s) => s.id === initialStoreId)) {
      setSelectedStoreId(initialStoreId);
    } else if (stores.length > 0 && !stores.some((s) => s.id === selectedStoreId)) {
      setSelectedStoreId(stores[0].id);
    }
  }, [open, initialStoreId, stores, selectedStoreId]);

  // Mark body for clean @media print isolation while QR studio is open
  useEffect(() => {
    if (!open) return;
    document.body.classList.add('printing-qr-sheet');
    return () => {
      document.body.classList.remove('printing-qr-sheet');
    };
  }, [open]);

  const activeStore = useMemo(
    () => stores.find((s) => s.id === selectedStoreId) || stores[0] || null,
    [stores, selectedStoreId]
  );

  const normalizedBaseUrl = useMemo(() => {
    const fallback = typeof window !== 'undefined' ? window.location.origin : 'https://marketly.dz';
    const trimmed = baseUrl.trim().replace(/\/+$/, '');
    return trimmed || fallback;
  }, [baseUrl]);

  const targetUrl = useMemo(() => {
    if (!activeStore) return normalizedBaseUrl;
    const slug = encodeURIComponent(activeStore.slug);
    return `${normalizedBaseUrl}/?store=${slug}#store/${slug}`;
  }, [activeStore, normalizedBaseUrl]);

  // Generate crisp QR DataURL & SVG locally (100% offline-capable)
  useEffect(() => {
    if (!open || !activeStore) return;
    let cancelled = false;

    Promise.all([
      QRCode.toDataURL(targetUrl, {
        width: 640,
        margin: 2,
        errorCorrectionLevel: 'H',
        color: {
          dark: '#1E1438',
          light: '#FFFFFF',
        },
      }),
      QRCode.toString(targetUrl, {
        type: 'svg',
        margin: 1,
        errorCorrectionLevel: 'H',
        color: {
          dark: '#1E1438',
          light: '#FFFFFF',
        },
      }),
    ])
      .then(([dataUrl, svgStr]) => {
        if (cancelled) return;
        setQrDataUrl(dataUrl);
        setQrSvg(svgStr);
      })
      .catch(() => {
        if (!cancelled) {
          notify('Could not generate QR code for this URL.', 'error');
        }
      });

    return () => {
      cancelled = true;
    };
  }, [open, activeStore, targetUrl, notify]);

  if (!open || !activeStore) return null;

  const isDevOrigin =
    typeof window !== 'undefined' && window.location.origin.includes('ais-dev-');

  const handleCopyUrl = async () => {
    try {
      await navigator.clipboard.writeText(targetUrl);
      setCopied(true);
      notify('Direct seller QR link copied.');
      setTimeout(() => setCopied(false), 2000);
    } catch {
      notify(`Link: ${targetUrl}`);
    }
  };

  const handlePrint = () => {
    window.print();
  };

  const handleDownloadSvg = () => {
    if (!qrSvg) return;
    const blob = new Blob([qrSvg], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${activeStore.slug}-qr.svg`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    notify(`Downloaded ${activeStore.slug}-qr.svg`);
  };

  const handleDownloadPosterPng = async () => {
    if (!qrDataUrl) return;
    setDownloadingPng(true);
    try {
      const canvas = document.createElement('canvas');
      const W = 1200;
      const H = template === 'sticker' ? 1200 : 1560;
      canvas.width = W;
      canvas.height = H;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('Canvas not supported.');

      // Background
      ctx.fillStyle = template === 'poster' ? '#2A1F4D' : '#FFFFFF';
      ctx.fillRect(0, 0, W, H);

      // Top awning stripe for stand/poster
      if (template !== 'sticker') {
        const stripeW = 48;
        for (let x = 0; x < W; x += stripeW * 2) {
          ctx.fillStyle = '#4A3894';
          ctx.fillRect(x, 0, stripeW, 28);
          ctx.fillStyle = template === 'poster' ? '#E794C9' : '#FBEFFB';
          ctx.fillRect(x + stripeW, 0, stripeW, 28);
        }
      }

      const ink = template === 'poster' ? '#FFFFFF' : '#1E1438';
      const muted = template === 'poster' ? '#D6C8F2' : '#5E5C70';

      ctx.textAlign = 'center';

      // Brand header
      ctx.fillStyle = template === 'poster' ? '#E794C9' : '#4A3894';
      ctx.font = 'bold 30px "Outfit", system-ui, sans-serif';
      ctx.fillText('MARKETLY · DJELFA', W / 2, template === 'sticker' ? 96 : 120);

      // Store name
      ctx.fillStyle = ink;
      ctx.font = '800 58px "Outfit", system-ui, sans-serif';
      ctx.fillText(activeStore.name.slice(0, 32), W / 2, template === 'sticker' ? 175 : 205);

      // Area & hours
      if (template !== 'sticker') {
        ctx.fillStyle = muted;
        ctx.font = '600 28px "Outfit", system-ui, sans-serif';
        ctx.fillText(
          `${activeStore.area}, ${activeStore.city}  ·  ${activeStore.openingHours}`,
          W / 2,
          260
        );
      }

      // QR card container
      const qrBoxSize = template === 'sticker' ? 720 : 740;
      const qrBoxX = (W - qrBoxSize) / 2;
      const qrBoxY = template === 'sticker' ? 235 : 330;

      ctx.fillStyle = '#FFFFFF';
      ctx.beginPath();
      ctx.roundRect(qrBoxX, qrBoxY, qrBoxSize, qrBoxSize, 42);
      ctx.fill();

      ctx.lineWidth = template === 'poster' ? 12 : 4;
      ctx.strokeStyle = template === 'poster' ? '#E794C9' : '#4A3894';
      ctx.stroke();

      // Draw QR image inside
      const qrImg = new Image();
      await new Promise<void>((resolve, reject) => {
        qrImg.onload = () => resolve();
        qrImg.onerror = () => reject(new Error('Failed to load QR image.'));
        qrImg.src = qrDataUrl;
      });
      const pad = 44;
      ctx.drawImage(qrImg, qrBoxX + pad, qrBoxY + pad, qrBoxSize - pad * 2, qrBoxSize - pad * 2);

      // Headline below QR
      const textStartY = qrBoxY + qrBoxSize + 86;
      ctx.fillStyle = ink;
      ctx.font = '800 44px "Outfit", system-ui, sans-serif';
      ctx.fillText(headline.slice(0, 38), W / 2, textStartY);

      if (template !== 'sticker') {
        ctx.fillStyle = muted;
        ctx.font = '500 26px "Outfit", system-ui, sans-serif';
        ctx.fillText(subline.slice(0, 62), W / 2, textStartY + 54);

        // Step pill box at bottom
        ctx.fillStyle = template === 'poster' ? '#4A3894' : '#FBEFFB';
        ctx.beginPath();
        ctx.roundRect(120, H - 235, W - 240, 120, 28);
        ctx.fill();

        ctx.fillStyle = template === 'poster' ? '#FFFFFF' : '#4A3894';
        ctx.font = '700 25px "Outfit", system-ui, sans-serif';
        ctx.fillText(
          '1. Scan Camera   ·   2. View Storefront   ·   3. Tap "Install App" (PWA)',
          W / 2,
          H - 165
        );
      }

      // Direct URL footer
      ctx.fillStyle = muted;
      ctx.font = '500 20px monospace';
      ctx.fillText(targetUrl.slice(0, 68), W / 2, H - 48);

      const pngUrl = canvas.toDataURL('image/png');
      const a = document.createElement('a');
      a.href = pngUrl;
      a.download = `${activeStore.slug}-qr-poster.png`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      notify(`Downloaded printable ${activeStore.slug}-qr-poster.png`);
    } catch (err) {
      notify(err instanceof Error ? err.message : 'PNG export failed.', 'error');
    } finally {
      setDownloadingPng(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Printable Store QR Code Studio"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 p-4 backdrop-blur-xs"
    >
      <div className="modal-enter max-h-[94vh] w-full max-w-4xl overflow-y-auto rounded-3xl border border-[#E4DCF7] bg-white shadow-2xl dark:border-[#22222C] dark:bg-[#0E0E13]">
        <div className="marketly-awning" />

        {/* Header */}
        <div className="sticky top-0 z-10 flex items-center justify-between gap-3 border-b border-[#E4DCF7] bg-white/95 px-6 py-4 backdrop-blur-xs dark:border-[#22222C] dark:bg-[#0E0E13]/95">
          <div className="flex items-center gap-3 min-w-0">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#4A3894]/12 text-[#4A3894] dark:text-[#C5B2EA]">
              <QrCode className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <h2 className="font-display truncate text-lg sm:text-xl font-bold text-[#13111C] dark:text-white">
                Printable Store QR &amp; PWA Poster
              </h2>
              <p className="truncate text-xs text-[#5E5C70] dark:text-[#9D9BB0]">
                Customers scan to open {activeStore.name}&apos;s dedicated shop page &amp; install the PWA.
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Close QR studio"
            className="rounded-full p-2 text-[#5E5C70] hover:bg-[#F4F5FB] dark:text-[#9D9BB0] dark:hover:bg-[#15151C] cursor-pointer"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="grid gap-6 p-6 lg:grid-cols-12">
          {/* Left Column: Controls & Print Actions */}
          <div className="space-y-4 lg:col-span-6">
            {stores.length > 1 && (
              <div>
                <label className="block text-xs font-bold text-[#13111C] dark:text-white">
                  Select Store Profile
                </label>
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  {stores.map((st) => (
                    <button
                      key={st.id}
                      type="button"
                      onClick={() => setSelectedStoreId(st.id)}
                      className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold transition cursor-pointer ${
                        st.id === activeStore.id
                          ? 'bg-[#4A3894] text-white'
                          : 'border border-[#E4DCF7] bg-[#FBF9FE] text-[#5E5C70] dark:border-[#22222C] dark:bg-[#15151C] dark:text-[#B9B0D8]'
                      }`}
                    >
                      <StoreIcon className="h-3 w-3" />
                      <span>{st.name}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Print Template Selector */}
            <div>
              <label className="block text-xs font-bold text-[#13111C] dark:text-white">
                Print Layout Style
              </label>
              <div className="mt-1.5 grid grid-cols-3 gap-2">
                {(
                  [
                    { id: 'stand', label: 'Counter Stand', desc: 'Clean table card' },
                    { id: 'poster', label: 'Window Poster', desc: 'Bold dark A4' },
                    { id: 'sticker', label: 'Bag Sticker', desc: 'Compact B&W' },
                  ] as const
                ).map((opt) => (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => setTemplate(opt.id)}
                    className={`rounded-2xl border p-2.5 text-left transition cursor-pointer ${
                      template === opt.id
                        ? 'border-[#6E65F6] bg-[#6E65F6]/8 text-[#13111C] dark:text-white'
                        : 'border-[#E4E4F0] bg-white text-[#5E5C70] hover:border-[#6E65F6]/40 dark:border-[#22222C] dark:bg-[#15151C] dark:text-[#9D9BB0]'
                    }`}
                  >
                    <div className="text-xs font-bold">{opt.label}</div>
                    <div className="text-[10px] opacity-80">{opt.desc}</div>
                  </button>
                ))}
              </div>
            </div>

            {/* Editable Poster Copy */}
            <div className="grid gap-3">
              <div>
                <label className="block text-xs font-bold text-[#13111C] dark:text-white">
                  Card Headline
                </label>
                <input
                  value={headline}
                  onChange={(e) => setHeadline(e.target.value)}
                  maxLength={48}
                  placeholder="Scan to Browse & Order"
                  className="mt-1 w-full rounded-xl border border-[#E4E4F0] bg-white px-3 py-2 text-xs dark:border-[#22222C] dark:bg-[#15151C]"
                />
              </div>

              {template !== 'sticker' && (
                <div>
                  <label className="block text-xs font-bold text-[#13111C] dark:text-white">
                    Subtitle / Offer Note
                  </label>
                  <input
                    value={subline}
                    onChange={(e) => setSubline(e.target.value)}
                    maxLength={70}
                    placeholder="Live DZD prices · Check stock · Install Shop App"
                    className="mt-1 w-full rounded-xl border border-[#E4E4F0] bg-white px-3 py-2 text-xs dark:border-[#22222C] dark:bg-[#15151C]"
                  />
                </div>
              )}

              <div>
                <div className="flex items-center justify-between">
                  <label className="block text-xs font-bold text-[#13111C] dark:text-white">
                    Site Base URL (for QR Link)
                  </label>
                  {typeof window !== 'undefined' && baseUrl !== window.location.origin && (
                    <button
                      type="button"
                      onClick={() => setBaseUrl(window.location.origin)}
                      className="inline-flex items-center gap-1 text-[11px] font-semibold text-[#6E65F6] hover:underline cursor-pointer"
                    >
                      <RotateCcw className="h-3 w-3" />
                      <span>Reset</span>
                    </button>
                  )}
                </div>
                <input
                  value={baseUrl}
                  onChange={(e) => setBaseUrl(e.target.value)}
                  placeholder="https://your-public-app-url.run.app"
                  className="mt-1 w-full rounded-xl border border-[#E4E4F0] bg-white px-3 py-2 font-mono text-[11px] dark:border-[#22222C] dark:bg-[#15151C]"
                />
                {isDevOrigin && (
                  <p className="mt-1 text-[11px] text-amber-700 dark:text-amber-400">
                    Tip: For public customer printing, you can paste your 24/7 Shared App URL above before printing.
                  </p>
                )}
              </div>
            </div>

            {/* Direct URL Preview & Actions */}
            <div className="rounded-2xl border border-[#E4E4F0] bg-[#F8F8FC] p-3.5 space-y-2.5 dark:border-[#22222C] dark:bg-[#0E0E13]/85">
              <div className="flex items-center justify-between text-[11px] font-semibold text-[#5E5C70] dark:text-[#9D9BB0]">
                <span className="inline-flex items-center gap-1">
                  <Smartphone className="h-3.5 w-3.5 text-[#6E65F6]" />
                  Dedicated Seller Page + PWA Link
                </span>
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    onPreviewStore(activeStore.slug);
                  }}
                  className="inline-flex items-center gap-1 font-bold text-[#6E65F6] hover:underline cursor-pointer"
                >
                  <span>Open seller page</span>
                  <ExternalLink className="h-3 w-3" />
                </button>
              </div>

              <div className="flex items-center gap-2">
                <code className="flex-1 truncate rounded-xl border border-[#E4E4F0] bg-white px-3 py-2 text-[11px] text-[#13111C] dark:border-[#22222C] dark:bg-[#15151C] dark:text-white">
                  {targetUrl}
                </code>
                <button
                  type="button"
                  onClick={handleCopyUrl}
                  className="inline-flex shrink-0 items-center gap-1.5 rounded-xl border border-[#E4E4F0] bg-white px-3 py-2 text-xs font-semibold hover:border-[#6E65F6] dark:border-[#22222C] dark:bg-[#15151C] cursor-pointer"
                >
                  {copied ? (
                    <>
                      <Check className="h-3.5 w-3.5 text-emerald-600" />
                      <span>Copied</span>
                    </>
                  ) : (
                    <>
                      <Copy className="h-3.5 w-3.5" />
                      <span>Copy</span>
                    </>
                  )}
                </button>
              </div>
            </div>

            {/* Print & Download CTA Row */}
            <div className="flex flex-wrap items-center gap-2.5 pt-1">
              <button
                type="button"
                onClick={handlePrint}
                className="inline-flex flex-1 items-center justify-center gap-2 rounded-full bg-[#4A3894] px-5 py-2.5 text-xs font-extrabold text-white shadow-xs transition hover:bg-[#3A2B78] cursor-pointer"
              >
                <Printer className="h-4 w-4" />
                <span>Print QR Poster</span>
              </button>

              <button
                type="button"
                disabled={downloadingPng || !qrDataUrl}
                onClick={handleDownloadPosterPng}
                className="inline-flex items-center justify-center gap-1.5 rounded-full bg-[#9678CE] px-4 py-2.5 text-xs font-bold text-white transition hover:brightness-105 disabled:opacity-50 cursor-pointer"
              >
                <Download className="h-3.5 w-3.5" />
                <span>{downloadingPng ? 'Saving...' : 'Save PNG'}</span>
              </button>

              <button
                type="button"
                disabled={!qrSvg}
                onClick={handleDownloadSvg}
                className="inline-flex items-center justify-center gap-1.5 rounded-full border border-[#E4E4F0] bg-white px-4 py-2.5 text-xs font-semibold text-[#13111C] hover:border-[#6E65F6] disabled:opacity-50 dark:border-[#22222C] dark:bg-[#15151C] dark:text-white cursor-pointer"
              >
                <Download className="h-3.5 w-3.5" />
                <span>SVG</span>
              </button>
            </div>
          </div>

          {/* Right Column: Live Print Preview Sheet */}
          <div className="flex items-center justify-center rounded-3xl border border-dashed border-[#DFD7F4] bg-[#FBF9FE] p-5 dark:border-[#22222C] dark:bg-[#050507] lg:col-span-6">
            <div
              id="seller-qr-print-sheet"
              className={`w-full max-w-[360px] overflow-hidden rounded-3xl shadow-lg transition-colors ${
                template === 'poster'
                  ? 'border border-[#4A3894] bg-[#2A1F4D] text-white'
                  : template === 'sticker'
                    ? 'border-2 border-[#4A3894] bg-white text-[#1E1438]'
                    : 'border border-[#E4DCF7] bg-white text-[#1E1438]'
              }`}
            >
              {template !== 'sticker' && <div className="marketly-awning" />}

              <div className="p-6 text-center space-y-4">
                <div>
                  {activeStore.logoUrl && (
                    <div className="mx-auto mb-2.5 h-14 w-14 overflow-hidden rounded-2xl border border-[#DFD7F4] bg-white shadow-xs">
                      <img
                        src={activeStore.logoUrl}
                        alt={activeStore.name}
                        referrerPolicy="no-referrer"
                        className="h-full w-full object-cover"
                      />
                    </div>
                  )}
                  <div
                    className={`text-[10px] font-extrabold uppercase tracking-widest ${
                      template === 'poster'
                        ? 'text-[#E794C9]'
                        : template === 'sticker'
                          ? 'text-[#5E5C70]'
                          : 'text-[#4A3894]'
                    }`}
                  >
                    Marketly · {activeStore.city || 'Djelfa'}
                  </div>
                  <h3 className="font-display mt-1 text-2xl font-extrabold leading-tight text-balance">
                    {activeStore.name}
                  </h3>
                  {template !== 'sticker' && (
                    <div
                      className={`mt-1 text-xs ${
                        template === 'poster' ? 'text-[#D6C8F2]' : 'text-[#5E5C70]'
                      }`}
                    >
                      {activeStore.area} · {activeStore.openingHours}
                    </div>
                  )}
                </div>

                {/* High-contrast Scannable QR Box */}
                <div
                  className={`mx-auto w-fit rounded-2xl bg-white p-3.5 ${
                    template === 'poster'
                      ? 'ring-4 ring-[#E794C9]'
                      : 'border border-[#E4DCF7] shadow-xs'
                  }`}
                >
                  {qrDataUrl ? (
                    <img
                      src={qrDataUrl}
                      alt={`QR code for ${activeStore.name}`}
                      className="h-48 w-48 sm:h-52 sm:w-52 block"
                    />
                  ) : (
                    <div className="flex h-48 w-48 items-center justify-center text-xs text-[#5E5C70]">
                      Generating QR...
                    </div>
                  )}
                </div>

                <div className="space-y-1">
                  <div className="font-display text-lg font-extrabold leading-snug">
                    {headline || 'Scan to Browse & Order'}
                  </div>
                  {template !== 'sticker' && (
                    <p
                      className={`text-xs ${
                        template === 'poster' ? 'text-[#D6C8F2]' : 'text-[#5E5C70]'
                      }`}
                    >
                      {subline}
                    </p>
                  )}
                </div>

                {template !== 'sticker' && (
                  <div
                    className={`rounded-2xl px-3.5 py-2.5 text-[11px] font-semibold ${
                      template === 'poster'
                        ? 'bg-white/10 text-[#FBEFFB]'
                        : 'bg-[#FBEFFB] text-[#4A3894]'
                    }`}
                  >
                    1. Scan camera · 2. Open {activeStore.name} · 3. Install App (PWA)
                  </div>
                )}

                <div
                  className={`truncate font-mono text-[10px] ${
                    template === 'poster' ? 'text-[#A09FB1]' : 'text-[#5E5C70]'
                  }`}
                >
                  {targetUrl.replace(/^https?:\/\//, '')}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
