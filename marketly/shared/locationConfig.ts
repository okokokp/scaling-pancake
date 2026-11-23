import type { ElOuedArea } from './types.ts';

export interface CityLocationConfig {
  id: string;
  cityEn: string;
  cityAr: string;
  countryEn: string;
  countryAr: string;
  center: { lat: number; lng: number };
  defaultZoom: number;
  areas: (ElOuedArea & { streetEn: string; streetAr: string })[];
}

/**
 * Temporary Geographical Scope Configuration.
 * Change this single module when expanding Marketly beyond Djelfa, Algeria.
 * Street names and coordinates reference Google Maps landmarks in Djelfa.
 */
export const TEMPORARY_CITY_CONFIG: CityLocationConfig = {
  id: 'djelfa-dz',
  cityEn: 'Djelfa',
  cityAr: 'الجلفة',
  countryEn: 'Algeria',
  countryAr: 'الجزائر',
  center: { lat: 34.6728, lng: 3.263 },
  defaultZoom: 14,
  areas: [
    {
      id: 'centre-ville',
      name: 'Rue de la République · Centre-Ville',
      nameFr: 'Rue de la République · Centre-Ville',
      nameAr: 'شارع الجمهورية · وسط المدينة',
      streetEn: 'Rue de la République, Centre-Ville, Djelfa',
      streetAr: 'شارع الجمهورية، وسط المدينة، الجلفة',
      lat: 34.6728,
      lng: 3.263,
    },
    {
      id: 'bd-aln',
      name: "Boulevard de l'ALN",
      nameFr: "Boulevard de l'ALN",
      nameAr: 'شارع جيش التحرير الوطني',
      streetEn: "Boulevard de l'ALN, Djelfa",
      streetAr: 'شارع جيش التحرير الوطني، الجلفة',
      lat: 34.6761,
      lng: 3.2584,
    },
    {
      id: 'cite-05-juillet',
      name: 'Cité 05 Juillet · Rue Emir Abdelkader',
      nameFr: 'Cité 05 Juillet · Rue Emir Abdelkader',
      nameAr: 'حي 05 جويلية · شارع الأمير عبد القادر',
      streetEn: 'Rue Emir Abdelkader, Cité 05 Juillet, Djelfa',
      streetAr: 'شارع الأمير عبد القادر، حي 05 جويلية، الجلفة',
      lat: 34.6689,
      lng: 3.2712,
    },
    {
      id: 'ain-chih',
      name: 'Cité Ain Chih · Route Nationale 1',
      nameFr: 'Cité Ain Chih · Route Nationale 1',
      nameAr: 'حي عين الشيح · الطريق الوطني رقم 1',
      streetEn: 'Route Nationale 1, Cité Ain Chih, Djelfa',
      streetAr: 'الطريق الوطني رقم 1، حي عين الشيح، الجلفة',
      lat: 34.6825,
      lng: 3.2508,
    },
    {
      id: 'berbih',
      name: 'Quartier Berbih · Bd Si El Haouès',
      nameFr: 'Quartier Berbih · Bd Si El Haouès',
      nameAr: 'حي بربيح · شارع سي الحواس',
      streetEn: 'Boulevard Si El Haouès, Quartier Berbih, Djelfa',
      streetAr: 'شارع سي الحواس، حي بربيح، الجلفة',
      lat: 34.6634,
      lng: 3.2665,
    },
  ],
};

export const DJELFA_AREAS = TEMPORARY_CITY_CONFIG.areas;

const LEGACY_AREA_MAP: Record<string, string> = {
  'old market': 'Rue de la République · Centre-Ville',
  'main street': "Boulevard de l'ALN",
  'north quarter': 'Cité Ain Chih · Route Nationale 1',
  riverside: 'Quartier Berbih · Bd Si El Haouès',
  university: 'Cité 05 Juillet · Rue Emir Abdelkader',
  'centre-ville': 'Rue de la République · Centre-Ville',
  "boulevard de l'aln": "Boulevard de l'ALN",
  'cite 05 juillet': 'Cité 05 Juillet · Rue Emir Abdelkader',
  'ain chih': 'Cité Ain Chih · Route Nationale 1',
  berbih: 'Quartier Berbih · Bd Si El Haouès',
};

export function normalizeDjelfaArea(rawArea: string | undefined | null): {
  area: ElOuedArea & { streetEn: string; streetAr: string };
} {
  const trimmed = (rawArea || '').trim();
  const lower = trimmed.toLowerCase();

  const exact = DJELFA_AREAS.find(
    (a) =>
      a.id.toLowerCase() === lower ||
      a.name.toLowerCase() === lower ||
      a.nameAr === trimmed
  );
  if (exact) return { area: exact };

  const mappedName = LEGACY_AREA_MAP[lower];
  if (mappedName) {
    const found = DJELFA_AREAS.find((a) => a.name === mappedName);
    if (found) return { area: found };
  }

  // Partial substring check
  for (const [legacyKey, targetName] of Object.entries(LEGACY_AREA_MAP)) {
    if (lower.includes(legacyKey)) {
      const found = DJELFA_AREAS.find((a) => a.name === targetName);
      if (found) return { area: found };
    }
  }

  return { area: DJELFA_AREAS[0] };
}

export function getAreaDisplayName(
  areaName: string | undefined | null,
  lang: 'en' | 'ar' = 'en'
): string {
  if (!areaName) {
    return lang === 'ar' ? DJELFA_AREAS[0].nameAr : DJELFA_AREAS[0].name;
  }
  const lower = areaName.trim().toLowerCase();
  const matched = DJELFA_AREAS.find(
    (a) =>
      a.name.toLowerCase() === lower ||
      a.id.toLowerCase() === lower ||
      a.nameAr === areaName.trim()
  );
  if (matched) return lang === 'ar' ? matched.nameAr : matched.name;
  const normalized = normalizeDjelfaArea(areaName).area;
  if (LEGACY_AREA_MAP[lower]) {
    return lang === 'ar' ? normalized.nameAr : normalized.name;
  }
  return areaName;
}
