import React, { useEffect, useState } from 'react';
import {
  APIProvider,
  AdvancedMarker,
  InfoWindow,
  Map as GoogleMap,
  Pin,
} from '@vis.gl/react-google-maps';
import { ArrowUpRight, ExternalLink, MapPin, Navigation, Store as StoreIcon } from 'lucide-react';
import type { ElOuedArea, LanguageCode, Store } from '../../shared/types.ts';
import { getAreaDisplayName, TEMPORARY_CITY_CONFIG } from '../../shared/locationConfig.ts';

interface ElOuedMapProps {
  stores: (Store & { distanceKm?: number | null })[];
  areas: ElOuedArea[];
  selectedLocation: { lat: number; lng: number; label: string } | null;
  onSelectStore: (storeSlug: string) => void;
  activeStoreId?: string | null;
  lang?: LanguageCode;
  quotaExceeded?: boolean;
}

const MIN_LAT = 34.656;
const MAX_LAT = 34.688;
const MIN_LNG = 3.245;
const MAX_LNG = 3.278;

function projectFallback(lat: number, lng: number): { x: number; y: number } {
  const x = ((lng - MIN_LNG) / (MAX_LNG - MIN_LNG)) * 82 + 9;
  const y = (1 - (lat - MIN_LAT) / (MAX_LAT - MIN_LAT)) * 78 + 11;
  return {
    x: Math.min(91, Math.max(9, x)),
    y: Math.min(89, Math.max(11, y)),
  };
}

export const ElOuedMap: React.FC<ElOuedMapProps> = ({
  stores,
  areas,
  selectedLocation,
  onSelectStore,
  activeStoreId,
  lang = 'en',
  quotaExceeded = false,
}) => {
  const apiKey = (import.meta.env.VITE_GOOGLE_MAPS_API_KEY || '').trim();
  const [mapsError, setMapsError] = useState(quotaExceeded);
  const [selectedPinStore, setSelectedPinStore] = useState<(Store & { distanceKm?: number | null }) | null>(null);

  useEffect(() => {
    setMapsError(quotaExceeded);
  }, [quotaExceeded]);

  useEffect(() => {
    const handleQuota = () => setMapsError(true);
    window.addEventListener('gmp-quota-exceeded', handleQuota);
    return () => window.removeEventListener('gmp-quota-exceeded', handleQuota);
  }, []);

  const isAr = lang === 'ar';
  const cityLabel = isAr ? TEMPORARY_CITY_CONFIG.cityAr : TEMPORARY_CITY_CONFIG.cityEn;
  const countryLabel = isAr ? TEMPORARY_CITY_CONFIG.countryAr : TEMPORARY_CITY_CONFIG.countryEn;
  const centerCoords = selectedLocation
    ? { lat: selectedLocation.lat, lng: selectedLocation.lng }
    : TEMPORARY_CITY_CONFIG.center;

  const canRenderGoogleMaps = Boolean(apiKey) && !mapsError;

  if (!canRenderGoogleMaps) {
    const userPos = selectedLocation ? projectFallback(selectedLocation.lat, selectedLocation.lng) : null;
    return (
      <div className="relative h-80 min-h-[320px] w-full overflow-hidden rounded-[22px] border border-[#E5DDF5] bg-[#F9F5FD] dark:border-[#22222C] dark:bg-[#0E0E13]">
        <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="absolute inset-0 h-full w-full opacity-65">
          <defs>
            <pattern id="djelfaGrid" width="12.5" height="12.5" patternUnits="userSpaceOnUse">
              <path d="M 12.5 0 L 0 0 0 12.5" fill="none" stroke="#E5DDF5" strokeWidth="0.35" />
            </pattern>
          </defs>
          <rect width="100" height="100" fill="url(#djelfaGrid)" />
          <path d="M 10 85 Q 45 50 88 22" fill="none" stroke="#D9CBF2" strokeWidth="1.6" />
          <path d="M 18 20 Q 52 55 85 78" fill="none" stroke="#D9CBF2" strokeWidth="1.2" />
          {stores.map((s) => {
            const p = projectFallback(s.lat, s.lng);
            const isActive = activeStoreId === s.id;
            const r = Math.min(20, Math.max(6, (s.deliveryRadiusKm ?? 10) * 1.05));
            return (
              <circle
                key={`zone-${s.id}`}
                cx={p.x}
                cy={p.y}
                r={r}
                fill="#9678CE"
                fillOpacity={isActive ? 0.16 : 0.06}
                stroke="#9678CE"
                strokeWidth={isActive ? 0.55 : 0.3}
                strokeDasharray="1.5 1.5"
                strokeOpacity={isActive ? 0.8 : 0.4}
              />
            );
          })}
        </svg>

        {areas.map((area) => {
          const pos = projectFallback(area.lat, area.lng);
          return (
            <div
              key={area.id}
              style={{ left: `${pos.x}%`, top: `${pos.y}%` }}
              className="pointer-events-none absolute -translate-x-1/2 -translate-y-1/2 text-[10px] font-semibold text-[#60567E]/85 dark:text-[#AEA2CB]/80"
            >
              {isAr ? area.nameAr : area.name}
            </div>
          );
        })}

        {userPos && (
          <div
            style={{ left: `${userPos.x}%`, top: `${userPos.y}%` }}
            className="absolute z-10 -translate-x-1/2 -translate-y-1/2"
            title={selectedLocation?.label}
          >
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-[#E794C9] text-[#1D1538] shadow-md ring-4 ring-[#9678CE]/30">
              <Navigation className="h-3.5 w-3.5" />
            </div>
          </div>
        )}

        {stores.map((store) => {
          const pos = projectFallback(store.lat, store.lng);
          const isActive = activeStoreId === store.id;
          return (
            <button
              key={store.id}
              type="button"
              onClick={() => onSelectStore(store.slug)}
              style={{ left: `${pos.x}%`, top: `${pos.y}%` }}
              className={`group absolute z-20 -translate-x-1/2 -translate-y-1/2 cursor-pointer transition-transform hover:scale-105 ${
                isActive ? 'z-30 scale-110' : ''
              }`}
            >
              <div
                className={`flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold shadow-md transition ${
                  isActive
                    ? 'bg-[#4A3894] text-white'
                    : 'bg-white text-[#1D1538] border border-[#E5DDF5] hover:bg-[#4A3894] hover:text-white dark:bg-[#15151C] dark:text-[#F5F2FC] dark:border-[#22222C]'
                }`}
              >
                <MapPin className="h-3 w-3 shrink-0 text-[#9678CE] group-hover:text-white" />
                <span className="max-w-[120px] truncate">{store.name}</span>
                {store.distanceKm !== null && store.distanceKm !== undefined && (
                  <span className="opacity-75 tabular-nums">{store.distanceKm} km</span>
                )}
              </div>
            </button>
          );
        })}

        <div className="absolute bottom-3 start-3 flex flex-wrap items-center gap-2 rounded-xl border border-[#E5DDF5] bg-white/95 px-3 py-1.5 text-[11px] font-medium text-[#60567E] backdrop-blur-xs dark:border-[#22222C] dark:bg-[#0E0E13]/95 dark:text-[#AEA2CB]">
          <span>
            {cityLabel} · {countryLabel} — {isAr ? 'بيانات الشوارع مرجعية عبر خرائط Google' : 'Street names referenced via Google Maps'}
          </span>
          <a
            href={`https://www.google.com/maps/search/?api=1&query=${centerCoords.lat},${centerCoords.lng}`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 font-semibold text-[#4A3894] hover:underline dark:text-[#C49BF5]"
          >
            {isAr ? 'فتح في خرائط Google' : 'Open in Google Maps'}
            <ExternalLink className="h-3 w-3" />
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="relative h-80 min-h-[320px] w-full overflow-hidden rounded-[22px] border border-[#E5DDF5] bg-[#F9F5FD] dark:border-[#22222C] dark:bg-[#0E0E13]">
      <APIProvider
        apiKey={apiKey}
        language={isAr ? 'ar' : 'en'}
        region="DZ"
      >
        <GoogleMap
          mapId="DEMO_MAP_ID"
          internalUsageAttributionIds={['gmp_mcp_codeassist_v1_aistudio']}
          defaultCenter={centerCoords}
          defaultZoom={TEMPORARY_CITY_CONFIG.defaultZoom}
          gestureHandling="greedy"
          streetViewControl={false}
          mapTypeControl={false}
          fullscreenControl={true}
          className="h-full w-full"
        >
          {selectedLocation && (
            <AdvancedMarker
              position={{ lat: selectedLocation.lat, lng: selectedLocation.lng }}
              title={selectedLocation.label}
            >
              <Pin background="#E794C9" borderColor="#4A3894" glyphColor="#1D1538" />
            </AdvancedMarker>
          )}

          {stores.map((store) => {
            const isActive = activeStoreId === store.id || selectedPinStore?.id === store.id;
            return (
              <AdvancedMarker
                key={store.id}
                position={{ lat: store.lat, lng: store.lng }}
                title={store.name}
                onClick={() => setSelectedPinStore(store)}
              >
                <Pin
                  background={isActive ? '#9678CE' : '#4A3894'}
                  borderColor="#FFFFFF"
                  glyphColor="#FFFFFF"
                  scale={isActive ? 1.15 : 1}
                />
              </AdvancedMarker>
            );
          })}

          {selectedPinStore && (
            <InfoWindow
              position={{ lat: selectedPinStore.lat, lng: selectedPinStore.lng }}
              onCloseClick={() => setSelectedPinStore(null)}
            >
              <div className="min-w-[190px] max-w-[240px] p-1 text-[#1D1538]" dir={isAr ? 'rtl' : 'ltr'}>
                <div className="flex items-center gap-1.5 text-xs font-bold text-[#4A3894]">
                  <StoreIcon className="h-3.5 w-3.5 shrink-0" />
                  <span className="truncate">{selectedPinStore.name}</span>
                </div>
                <p className="mt-1 text-[11px] font-medium text-[#60567E]">
                  {getAreaDisplayName(selectedPinStore.area, lang)}
                </p>
                <div className="mt-2 flex items-center justify-between gap-2">
                  <span
                    className={`rounded-md px-1.5 py-0.5 text-[10px] font-semibold ${
                      selectedPinStore.isOpen
                        ? 'bg-[#FBEFFB] text-[#4A3894]'
                        : 'bg-slate-100 text-slate-600'
                    }`}
                  >
                    {selectedPinStore.isOpen ? (isAr ? 'مفتوح الآن' : 'Open now') : isAr ? 'مغلق' : 'Closed'}
                  </span>
                  <button
                    type="button"
                    onClick={() => onSelectStore(selectedPinStore.slug)}
                    className="inline-flex cursor-pointer items-center gap-1 rounded-lg bg-[#4A3894] px-2.5 py-1 text-[11px] font-semibold text-white transition hover:bg-[#3A2B78]"
                  >
                    {isAr ? 'زيارة المتجر' : 'Visit Store'}
                    <ArrowUpRight className="h-3 w-3 rtl:rotate-270" />
                  </button>
                </div>
              </div>
            </InfoWindow>
          )}
        </GoogleMap>
      </APIProvider>

      <div className="pointer-events-none absolute top-3 start-3 z-10 rounded-xl border border-[#E5DDF5] bg-white/92 px-3 py-1.5 text-[11px] font-semibold text-[#1D1538] shadow-sm backdrop-blur-xs dark:border-[#22222C] dark:bg-[#0E0E13]/95 dark:text-[#F5F2FC]">
        {cityLabel} · {countryLabel} — {isAr ? 'انقر على أي متجر لعرض التفاصيل' : 'Click any store pin for details'}
      </div>
    </div>
  );
};
