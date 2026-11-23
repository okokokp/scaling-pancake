import type { LanguageCode } from '../../shared/types.ts';

export function formatDzd(amount: number, lang: LanguageCode = 'en'): string {
  const formatted = Math.round(amount)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, '\u00A0');
  const unit = lang === 'ar' ? 'دج' : 'DA';
  return `${formatted}\u00A0${unit}`;
}

export function formatRelativeTime(isoDate: string, lang: LanguageCode = 'en'): string {
  const diffMs = Date.now() - new Date(isoDate).getTime();
  const mins = Math.max(1, Math.floor(diffMs / 60_000));
  if (mins < 60) {
    if (lang === 'ar') return `منذ ${mins} د`;
    return `${mins}m ago`;
  }
  const hours = Math.floor(mins / 60);
  if (hours < 24) {
    if (lang === 'ar') return `منذ ${hours} س`;
    return `${hours}h ago`;
  }
  const days = Math.floor(hours / 24);
  if (lang === 'ar') return `منذ ${days} ي`;
  return `${days}d ago`;
}
