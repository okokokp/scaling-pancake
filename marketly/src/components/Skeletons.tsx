import React from 'react';

export const ProductCardSkeleton: React.FC = () => (
  <div className="rounded-[18px] border border-[#E5DDF5] dark:border-[#22222C] bg-white dark:bg-[#0E0E13] p-4 shadow-sm">
    <div className="h-40 w-full rounded-[14px] marketly-shimmer" />
    <div className="mt-4 flex items-center justify-between gap-2">
      <div className="h-3.5 w-20 rounded-full marketly-shimmer" />
      <div className="h-5 w-16 rounded-full marketly-shimmer" />
    </div>
    <div className="mt-3 h-5 w-3/4 rounded-md marketly-shimmer" />
    <div className="mt-2 h-3.5 w-full rounded-md marketly-shimmer" />
    <div className="mt-1.5 h-3.5 w-2/3 rounded-md marketly-shimmer" />
    <div className="mt-5 flex items-center justify-between border-t border-[#F2EBF9] dark:border-[#22222C] pt-3">
      <div className="h-6 w-24 rounded-md marketly-shimmer" />
      <div className="h-9 w-24 rounded-xl marketly-shimmer" />
    </div>
  </div>
);

export const CatalogGridSkeleton: React.FC<{ count?: number }> = ({ count = 8 }) => (
  <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
    {Array.from({ length: count }).map((_, idx) => (
      <ProductCardSkeleton key={idx} />
    ))}
  </div>
);

export const BannerSkeleton: React.FC = () => (
  <div className="rounded-[24px] border border-[#E5DDF5] dark:border-[#22222C] bg-white dark:bg-[#0E0E13] p-6 sm:p-10">
    <div className="grid gap-6 lg:grid-cols-12 items-center">
      <div className="lg:col-span-6 space-y-4">
        <div className="h-4 w-32 rounded-full marketly-shimmer" />
        <div className="h-9 w-5/6 rounded-lg marketly-shimmer" />
        <div className="h-4 w-full rounded-md marketly-shimmer" />
        <div className="h-11 w-44 rounded-xl marketly-shimmer" />
      </div>
      <div className="lg:col-span-6">
        <div className="h-56 w-full rounded-[18px] marketly-shimmer" />
      </div>
    </div>
  </div>
);

export const DashboardTableSkeleton: React.FC<{ rows?: number }> = ({ rows = 5 }) => (
  <div className="space-y-3 rounded-[18px] border border-[#E5DDF5] dark:border-[#22222C] bg-white dark:bg-[#0E0E13] p-5">
    <div className="h-5 w-44 rounded-md marketly-shimmer" />
    {Array.from({ length: rows }).map((_, idx) => (
      <div key={idx} className="flex items-center justify-between gap-4 border-t border-[#F2EBF9] dark:border-[#22222C] pt-3">
        <div className="h-4 w-1/3 rounded-md marketly-shimmer" />
        <div className="h-4 w-1/4 rounded-md marketly-shimmer" />
        <div className="h-8 w-24 rounded-lg marketly-shimmer" />
      </div>
    ))}
  </div>
);
