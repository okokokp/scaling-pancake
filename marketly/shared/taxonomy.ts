import type { Category, LanguageCode } from './types.ts';

export type CanonicalCategoryId =
  | 'cat-pc-parts'
  | 'cat-phones'
  | 'cat-consoles'
  | 'cat-peripherals';

export type StoreThemeVariant = 'consoles' | 'pc_parts' | 'phones';

export interface SubPartDefinition {
  id: string;
  categoryId: CanonicalCategoryId;
  label: string;
  labelFr: string;
  labelAr: string;
}

export const CANONICAL_CATEGORIES: Category[] = [
  {
    id: 'cat-pc-parts',
    name: 'PC Parts',
    nameFr: 'Composants PC',
    nameAr: 'قطع الحاسوب',
    slug: 'pc-parts',
    iconKey: 'cpu',
  },
  {
    id: 'cat-phones',
    name: 'Phones & Gear',
    nameFr: 'Téléphones & Accessoires',
    nameAr: 'الهواتف وملحقاتها',
    slug: 'phones-gear',
    iconKey: 'smartphone',
  },
  {
    id: 'cat-consoles',
    name: 'Consoles',
    nameFr: 'Consoles & Gaming',
    nameAr: 'أجهزة الألعاب',
    slug: 'consoles',
    iconKey: 'gamepad',
  },
  {
    id: 'cat-peripherals',
    name: 'Peripherals',
    nameFr: 'Périphériques & Réseau',
    nameAr: 'الشاشات والملحقات',
    slug: 'peripherals',
    iconKey: 'monitor',
  },
];

export const CATEGORY_SUBPARTS: Record<CanonicalCategoryId, SubPartDefinition[]> = {
  'cat-pc-parts': [
    { id: 'gpu', categoryId: 'cat-pc-parts', label: 'GPUs', labelFr: 'Cartes Graphiques', labelAr: 'بطاقات الرسوميات' },
    { id: 'cpu', categoryId: 'cat-pc-parts', label: 'CPUs', labelFr: 'Processeurs', labelAr: 'المعالجات' },
    { id: 'ssd-ram', categoryId: 'cat-pc-parts', label: 'SSD & RAM', labelFr: 'SSD & RAM', labelAr: 'أقراص SSD والرام' },
    { id: 'cooling-cases', categoryId: 'cat-pc-parts', label: 'Cooling & Cases', labelFr: 'Refroidissement & Boîtiers', labelAr: 'التبريد والصناديق' },
    { id: 'psu', categoryId: 'cat-pc-parts', label: 'PSUs', labelFr: 'Alimentations PC', labelAr: 'مزودات الطاقة' },
  ],
  'cat-phones': [
    { id: 'smartphones', categoryId: 'cat-phones', label: 'Smartphones', labelFr: 'Smartphones', labelAr: 'الهواتف الذكية' },
    { id: 'chargers-power', categoryId: 'cat-phones', label: 'Chargers & Power', labelFr: 'Chargeurs & Batteries', labelAr: 'الشواحن والبطاريات' },
    { id: 'cases-glass', categoryId: 'cat-phones', label: 'Cases & Glass', labelFr: 'Coques & Verres', labelAr: 'الحافظات والزجاج' },
    { id: 'earbuds', categoryId: 'cat-phones', label: 'Audio & Earbuds', labelFr: 'Écouteurs & Audio', labelAr: 'السماعات' },
  ],
  'cat-consoles': [
    { id: 'consoles', categoryId: 'cat-consoles', label: 'Consoles', labelFr: 'Consoles', labelAr: 'أجهزة الكونسول' },
    { id: 'controllers', categoryId: 'cat-consoles', label: 'Controllers', labelFr: 'Manettes', labelAr: 'أذرع التحكم' },
    { id: 'gaming-headsets', categoryId: 'cat-consoles', label: 'Gaming Headsets', labelFr: 'Casques Gaming', labelAr: 'سماعات الألعاب' },
  ],
  'cat-peripherals': [
    { id: 'monitors', categoryId: 'cat-peripherals', label: 'Monitors', labelFr: 'Écrans', labelAr: 'الشاشات' },
    { id: 'keyboards', categoryId: 'cat-peripherals', label: 'Keyboards', labelFr: 'Claviers', labelAr: 'لوحات المفاتيح' },
    { id: 'mice', categoryId: 'cat-peripherals', label: 'Mice', labelFr: 'Souris', labelAr: 'الفأرات' },
    { id: 'routers', categoryId: 'cat-peripherals', label: 'Wi-Fi & Routers', labelFr: 'Routeurs Wi-Fi', labelAr: 'أجهزة الراوتر' },
  ],
};

export const ALL_SUBPARTS: SubPartDefinition[] = [
  ...CATEGORY_SUBPARTS['cat-pc-parts'],
  ...CATEGORY_SUBPARTS['cat-phones'],
  ...CATEGORY_SUBPARTS['cat-consoles'],
  ...CATEGORY_SUBPARTS['cat-peripherals'],
];

export function getCanonicalCategoryName(
  categoryId: string,
  lang: LanguageCode = 'en'
): string {
  const found = CANONICAL_CATEGORIES.find((c) => c.id === categoryId);
  if (!found) return lang === 'ar' ? 'قطع الحاسوب' : 'PC Parts';
  if (lang === 'ar') return found.nameAr;
  return found.name;
}

export function normalizeCategoryId(
  rawCategoryId: string | undefined | null,
  context?: { imageKey?: string; name?: string; slug?: string; description?: string }
): CanonicalCategoryId {
  const id = (rawCategoryId || '').trim().toLowerCase();
  const hay = `${context?.imageKey || ''} ${context?.name || ''} ${context?.slug || ''} ${context?.description || ''}`.toLowerCase();

  // Direct canonical matches
  if (id === 'cat-consoles' || context?.imageKey === 'console' || context?.imageKey === 'controller' || context?.imageKey === 'headset') {
    if (id === 'cat-consoles' || hay.includes('playstation') || hay.includes('ps5') || hay.includes('xbox') || hay.includes('dualsense') || hay.includes('console')) {
      return 'cat-consoles';
    }
  }
  if (id === 'cat-consoles') return 'cat-consoles';

  // Legacy SSD & RAM -> merged into PC Parts
  if (id === 'cat-storage') return 'cat-pc-parts';

  // Legacy Chargers & Power -> merged into Phones & Gear (except PC PSU if ever tagged cat-power)
  if (id === 'cat-power') {
    if (context?.imageKey === 'psu' || /\bpsu\b|modular.*watt|80\+\s*gold/i.test(hay)) {
      return 'cat-pc-parts';
    }
    return 'cat-phones';
  }

  // Legacy Cases, Cooling & Wi-Fi split cleanly by actual product type
  if (id === 'cat-accessories') {
    if (
      context?.imageKey === 'cooler' ||
      context?.imageKey === 'pc-case' ||
      /cooler|thermal|radiator|heatsink|atx\s*case|pc\s*case|airflow.*case|tower/i.test(hay)
    ) {
      return 'cat-pc-parts';
    }
    if (context?.imageKey === 'router' || /router|wi-?fi|cat6|modem|mesh/i.test(hay)) {
      return 'cat-peripherals';
    }
    return 'cat-phones';
  }

  if (id === 'cat-pc-parts') return 'cat-pc-parts';
  if (id === 'cat-phones') {
    return 'cat-phones';
  }
  if (id === 'cat-peripherals') {
    // Move earbuds to Phones & Gear per mobile gear grouping unless gaming headset
    if (context?.imageKey === 'earbuds' || /\bearbuds?\b|airpods/i.test(hay)) {
      return 'cat-phones';
    }
    return 'cat-peripherals';
  }

  // Heuristic fallback for free-text / legacy category strings
  if (/console|ps5|xbox|nintendo|switch|dualsense|gamepad/i.test(hay)) return 'cat-consoles';
  if (/gpu|rtx|rx\s*\d|cpu|ryzen|intel|nvme|ssd|ddr4|ddr5|ram|psu|cooler|pc\s*case|atx/i.test(hay)) {
    return 'cat-pc-parts';
  }
  if (/iphone|galaxy|phone|charger|gan|power\s*bank|magsafe|screen\s*protector|earbud/i.test(hay)) {
    return 'cat-phones';
  }
  if (/monitor|keyboard|mouse|router|wi-?fi/i.test(hay)) return 'cat-peripherals';

  return 'cat-pc-parts';
}

export function getSubPartId(item: {
  categoryId?: string;
  imageKey?: string;
  productName?: string;
  name?: string;
  description?: string;
}): string {
  const key = (item.imageKey || '').toLowerCase();
  const hay = `${item.productName || item.name || ''} ${item.description || ''}`.toLowerCase();
  const cat = normalizeCategoryId(item.categoryId, { imageKey: key, name: hay });

  if (cat === 'cat-pc-parts') {
    if (key === 'gpu' || /rtx|radeon|geforce|graphics|gpu|rx\s*\d/i.test(hay)) return 'gpu';
    if (key === 'cpu' || /ryzen|core\s*i\d|processor|cpu|am5|lga/i.test(hay)) return 'cpu';
    if (key === 'ssd' || key === 'ram' || /nvme|ssd|ddr4|ddr5|ram|memory|storage/i.test(hay)) return 'ssd-ram';
    if (key === 'psu' || /\bpsu\b|power\s*supply|80\+|modular/i.test(hay)) return 'psu';
    if (key === 'cooler' || key === 'pc-case' || /cooler|thermal|paste|aio|case|chassis|airflow|atx/i.test(hay)) {
      return 'cooling-cases';
    }
    return 'gpu';
  }

  if (cat === 'cat-phones') {
    if (key === 'phone' || key === 'phone-android' || /iphone|galaxy|xiaomi|redmi|pixel|smartphone/i.test(hay)) {
      return 'smartphones';
    }
    if (key === 'charger' || key === 'powerbank' || /charger|gan|power\s*bank|cable|usb-c|pd\s*\d+w/i.test(hay)) {
      return 'chargers-power';
    }
    if (key === 'earbuds' || /earbud|airpod|bluetooth\s*audio|tws/i.test(hay)) {
      return 'earbuds';
    }
    if (key === 'case' || /case|glass|magsafe|protector|armor|cover/i.test(hay)) {
      return 'cases-glass';
    }
    return 'smartphones';
  }

  if (cat === 'cat-consoles') {
    if (key === 'controller' || /controller|dualsense|gamepad|joystick/i.test(hay)) return 'controllers';
    if (key === 'headset' || /headset|pulse|cloud|headphone/i.test(hay)) return 'gaming-headsets';
    return 'consoles';
  }

  if (key === 'monitor' || /monitor|display|hz|qhd|4k|ips|oled/i.test(hay)) return 'monitors';
  if (key === 'keyboard' || /keyboard|keychron|mechanical|keycap/i.test(hay)) return 'keyboards';
  if (key === 'mouse' || /mouse|logitech|dpi|wireless\s*pro/i.test(hay)) return 'mice';
  if (key === 'router' || /router|wi-?fi|cat6|mesh/i.test(hay)) return 'routers';
  return 'monitors';
}

export function matchesSubPart(
  item: {
    categoryId?: string;
    imageKey?: string;
    productName?: string;
    name?: string;
    description?: string;
  },
  subPartId: string
): boolean {
  if (!subPartId || subPartId === 'all') return true;
  return getSubPartId(item) === subPartId;
}

export function getSubPartLabel(subPartId: string, lang: LanguageCode = 'en'): string {
  const found = ALL_SUBPARTS.find((sp) => sp.id === subPartId);
  if (!found) return subPartId;
  if (lang === 'ar') return found.labelAr;
  return found.label;
}

export function resolveStoreThemeVariant(
  store: { slug?: string; name?: string; categories?: string[]; description?: string } | null | undefined,
  listings: { categoryId?: string; imageKey?: string; productName?: string }[] = []
): StoreThemeVariant {
  if (!store) return 'pc_parts';
  const identity = `${store.slug || ''} ${store.name || ''} ${store.description || ''}`.toLowerCase();

  // Explicit specialty stores or unambiguous branding
  if (/console|arena|playstation|ps5|xbox|gaming\s*only/i.test(identity)) {
    return 'consoles';
  }
  if (/mobilepro|mobilezone|techpoint|phone|smartphone|gadgets\s*ig/i.test(identity)) {
    return 'phones';
  }
  if (/nexus\s*rig|silicon\s*oasis|atlas\s*rig|pc\s*parts|campus\s*tech|cyber\s*gear/i.test(identity)) {
    return 'pc_parts';
  }

  // Otherwise tally listed products + store categories
  const counts: Record<StoreThemeVariant, number> = {
    consoles: 0,
    pc_parts: 0,
    phones: 0,
  };

  for (const item of listings) {
    const cat = normalizeCategoryId(item.categoryId, {
      imageKey: item.imageKey,
      name: item.productName,
    });
    if (cat === 'cat-consoles') counts.consoles += 2;
    else if (cat === 'cat-phones') counts.phones += 2;
    else counts.pc_parts += 2;
  }

  for (const rawCat of store.categories || []) {
    const cat = normalizeCategoryId(rawCat);
    if (cat === 'cat-consoles') counts.consoles += 1;
    else if (cat === 'cat-phones') counts.phones += 1;
    else counts.pc_parts += 1;
  }

  if (counts.consoles > counts.pc_parts && counts.consoles >= counts.phones) return 'consoles';
  if (counts.phones > counts.pc_parts && counts.phones > counts.consoles) return 'phones';
  return 'pc_parts';
}
