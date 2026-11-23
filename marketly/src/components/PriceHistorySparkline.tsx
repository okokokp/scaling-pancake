import React from 'react';
import { TrendingDown, TrendingUp } from 'lucide-react';
import type { LanguageCode, PriceHistoryPoint } from '../../shared/types.ts';
import { formatDzd } from '../lib/format.ts';

interface PriceHistorySparklineProps {
  history?: PriceHistoryPoint[];
  currentPrice: number;
  lang: LanguageCode;
  compact?: boolean;
}

export const PriceHistorySparkline: React.FC<PriceHistorySparklineProps> = ({
  history,
  currentPrice,
  lang,
  compact = false,
}) => {
  const isAr = lang === 'ar';
  const points =
    history && history.length > 0
      ? history
      : [{ price: currentPrice, recordedAt: new Date().toISOString() }];

  const prices = points.map((p) => p.price);
  const minPrice = Math.min(...prices);
  const maxPrice = Math.max(...prices);
  const firstPrice = prices[0];
  const diff = currentPrice - firstPrice;
  const pct = firstPrice > 0 ? Math.round((diff / firstPrice) * 100) : 0;

  const w = 112;
  const h = 30;
  const pad = 4;
  const coords = points.map((pt, idx) => {
    const x =
      points.length === 1 ? w / 2 : pad + (idx / (points.length - 1)) * (w - pad * 2);
    const range = maxPrice - minPrice;
    const y =
      range === 0
        ? h / 2
        : h - pad - ((pt.price - minPrice) / range) * (h - pad * 2);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });

  const lastPoint = coords[coords.length - 1]?.split(',') || ['56', '15'];

  return (
    <div
      dir={isAr ? 'rtl' : 'ltr'}
      className={`rounded-xl border border-[#E4DCF7] bg-[#FBF9FE] px-3 py-2 dark:border-[#22222C] dark:bg-[#15151C]/80 ${
        compact ? 'text-[11px]' : 'text-xs'
      }`}
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <svg
            viewBox={`0 0 ${w} ${h}`}
            className="h-7 w-24 shrink-0 overflow-visible"
            aria-label={isAr ? 'مؤشر تغير السعر خلال 30 يوماً' : '30-day price trend'}
          >
            {points.length > 1 && (
              <polyline
                fill="none"
                stroke={diff <= 0 ? '#10B981' : '#F43F5E'}
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                points={coords.join(' ')}
              />
            )}
            <circle
              cx={lastPoint[0]}
              cy={lastPoint[1]}
              r="3"
              fill={diff <= 0 ? '#10B981' : '#F43F5E'}
            />
          </svg>

          <div>
            <div className="flex items-center gap-1.5 font-semibold">
              {diff < 0 ? (
                <span className="inline-flex items-center gap-1 text-emerald-700 dark:text-emerald-400">
                  <TrendingDown className="h-3.5 w-3.5" />
                  <span>
                    {isAr ? `انخفاض ${Math.abs(pct)}%` : `${Math.abs(pct)}% price drop`}
                  </span>
                </span>
              ) : diff > 0 ? (
                <span className="inline-flex items-center gap-1 text-rose-600 dark:text-rose-400">
                  <TrendingUp className="h-3.5 w-3.5" />
                  <span>
                    {isAr ? `+${pct}% عن السابق` : `+${pct}% vs earlier`}
                  </span>
                </span>
              ) : (
                <span className="text-[#5E5C70] dark:text-[#B9B0D8]">
                  {isAr ? 'سعر مستقر' : 'Stable price'}
                </span>
              )}
            </div>
            <div className="text-[11px] text-[#5E5C70] tabular-nums dark:text-[#B9B0D8]">
              {isAr ? 'أدنى 30ي:' : '30d low:'} {formatDzd(minPrice, lang)} ·{' '}
              {isAr ? 'أعلى:' : 'high:'} {formatDzd(maxPrice, lang)}
            </div>
          </div>
        </div>

        {!compact && points.length > 1 && (
          <div className="flex flex-wrap items-center gap-1.5 text-[10px] text-[#5E5C70] tabular-nums dark:text-[#B9B0D8]">
            {points.slice(-4).map((pt, idx) => (
              <span
                key={`${pt.recordedAt}-${idx}`}
                className="rounded-md border border-[#E4DCF7] bg-white px-2 py-0.5 dark:border-[#22222C] dark:bg-[#0E0E13]"
              >
                {new Date(pt.recordedAt).toLocaleDateString(isAr ? 'ar-DZ' : 'en-US', {
                  month: 'short',
                  day: 'numeric',
                })}
                : <strong>{formatDzd(pt.price, lang)}</strong>
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
