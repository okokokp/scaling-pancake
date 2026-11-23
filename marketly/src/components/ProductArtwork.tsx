import React, { useEffect, useState } from 'react';
import { resolveProductPhoto } from '../lib/productMedia.ts';

interface ProductArtworkProps {
  imageKey: string;
  imageUrl?: string | null;
  categoryId?: string;
  alt?: string;
  className?: string;
}

function isSafeImageSrc(src: string | null | undefined): src is string {
  if (!src) return false;
  const trimmed = src.trim();
  if (/^\/uploads\/[a-zA-Z0-9._-]+$/.test(trimmed)) return true;
  if (trimmed.startsWith('data:image/')) return true;
  try {
    const parsed = new URL(trimmed);
    return parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

export const ProductArtwork: React.FC<ProductArtworkProps> = ({
  imageKey,
  imageUrl,
  categoryId,
  alt = 'Product photo',
  className = 'h-28 w-28',
}) => {
  const safeCustomUrl = isSafeImageSrc(imageUrl) ? imageUrl : null;
  const resolvedPhoto = resolveProductPhoto({
    imageUrl: safeCustomUrl,
    imageKey,
    categoryId,
    productName: alt,
  });

  const [imgFailed, setImgFailed] = useState(false);

  useEffect(() => {
    setImgFailed(false);
  }, [resolvedPhoto]);

  if (resolvedPhoto && !imgFailed) {
    return (
      <div
        className={`${className} overflow-hidden rounded-xl bg-[#F9F5FD] shadow-xs dark:bg-[#15151C]`}
      >
        <img
          src={resolvedPhoto}
          alt={alt}
          loading="lazy"
          onError={() => setImgFailed(true)}
          className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
        />
      </div>
    );
  }

  switch (imageKey) {
    case 'gpu':
      return (
        <svg viewBox="0 0 120 120" className={className} aria-hidden="true">
          <ellipse cx="60" cy="96" rx="42" ry="7" fill="#4A3894" fillOpacity="0.1" />
          <rect x="16" y="34" width="88" height="48" rx="10" fill="#2A1F4D" stroke="#4A3894" strokeWidth="2" />
          <rect x="20" y="38" width="80" height="40" rx="7" fill="#1E1438" />
          <circle cx="42" cy="58" r="14" fill="#2A1F4D" stroke="#9678CE" strokeWidth="2.5" />
          <circle cx="78" cy="58" r="14" fill="#2A1F4D" stroke="#9678CE" strokeWidth="2.5" />
          <circle cx="42" cy="58" r="4" fill="#E794C9" />
          <circle cx="78" cy="58" r="4" fill="#E794C9" />
          <rect x="26" y="82" width="44" height="6" rx="2" fill="#E794C9" />
          <rect x="74" y="82" width="14" height="6" rx="2" fill="#9678CE" />
        </svg>
      );
    case 'phone':
    case 'phone-android':
      return (
        <svg viewBox="0 0 120 120" className={className} aria-hidden="true">
          <ellipse cx="60" cy="102" rx="24" ry="6" fill="#4A3894" fillOpacity="0.1" />
          <rect x="35" y="16" width="50" height="82" rx="12" fill="#1E1438" stroke="#9678CE" strokeWidth="2.5" />
          <rect x="40" y="22" width="40" height="68" rx="8" fill="#2A1F4D" />
          <circle cx="60" cy="54" r="14" fill="#9678CE" fillOpacity="0.3" />
          <circle cx="60" cy="54" r="7" fill="#E794C9" />
        </svg>
      );
    default:
      return (
        <svg viewBox="0 0 120 120" className={className} aria-hidden="true">
          <ellipse cx="60" cy="96" rx="40" ry="7" fill="#4A3894" fillOpacity="0.1" />
          <rect x="22" y="28" width="76" height="58" rx="12" fill="#2A1F4D" stroke="#9678CE" strokeWidth="2.5" />
          <circle cx="60" cy="57" r="16" fill="#4A3894" />
          <circle cx="60" cy="57" r="6" fill="#E794C9" />
        </svg>
      );
  }
};
