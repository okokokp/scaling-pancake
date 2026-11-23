import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import type {
  ElOuedArea,
  PriceHistoryPoint,
  Product,
  ShopfrontDatabase,
  Store,
  StoreProduct,
  StoreReview,
} from '../shared/types.ts';
import { CANONICAL_CATEGORIES, normalizeCategoryId } from '../shared/taxonomy.ts';
import { DJELFA_AREAS, normalizeDjelfaArea } from '../shared/locationConfig.ts';

export const EL_OUED_AREAS = DJELFA_AREAS;

export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const derived = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${derived}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const [salt, key] = stored.split(':');
  if (!salt || !key) return false;
  const derived = crypto.scryptSync(password, salt, 64);
  const keyBuf = Buffer.from(key, 'hex');
  if (derived.length !== keyBuf.length) return false;
  return crypto.timingSafeEqual(derived, keyBuf);
}

export function hashConfirmationCode(code: string, orderId: string): string {
  return crypto
    .createHash('sha256')
    .update(`${orderId}:${code}:shopfront-el-oued`)
    .digest('hex');
}

export function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Math.round(R * c * 10) / 10;
}

const DATA_DIR = path.resolve(process.cwd(), 'data');
const DB_PATH = path.join(DATA_DIR, 'shopfront-db.json');

function minutesAgoIso(mins: number): string {
  return new Date(Date.now() - mins * 60_000).toISOString();
}

function hoursAgoIso(hours: number): string {
  return new Date(Date.now() - hours * 3_600_000).toISOString();
}

function daysAgoIso(days: number): string {
  return new Date(Date.now() - days * 86_400_000).toISOString();
}

export function recomputeStoreRating(store: Store, reviews: StoreReview[]): void {
  const list = reviews.filter((r) => r.storeId === store.id);
  store.reviewCount = list.length;
  if (list.length === 0) {
    store.rating = 0;
    return;
  }
  const sum = list.reduce((acc, r) => acc + r.rating, 0);
  store.rating = Math.round((sum / list.length) * 10) / 10;
}

const AREA_CENTRE = DJELFA_AREAS[0].name;
const AREA_ALN = DJELFA_AREAS[1].name;
const AREA_05_JUILLET = DJELFA_AREAS[2].name;
const AREA_AIN_CHIH = DJELFA_AREAS[3].name;
const AREA_BERBIH = DJELFA_AREAS[4].name;

const DEFAULT_STORE_ZONES: Record<string, { deliveryZones: string[]; deliveryFee: number; deliveryRadiusKm: number }> = {
  'store-silicon-oasis': {
    deliveryZones: [AREA_CENTRE, AREA_ALN, AREA_BERBIH, AREA_05_JUILLET],
    deliveryFee: 200,
    deliveryRadiusKm: 12,
  },
  'store-mobilezone': {
    deliveryZones: [AREA_BERBIH, AREA_CENTRE, AREA_ALN],
    deliveryFee: 200,
    deliveryRadiusKm: 8,
  },
  'store-techpoint': {
    deliveryZones: [AREA_ALN, AREA_CENTRE, AREA_AIN_CHIH, AREA_BERBIH],
    deliveryFee: 250,
    deliveryRadiusKm: 10,
  },
  'store-atlas-rig': {
    deliveryZones: [AREA_AIN_CHIH, AREA_ALN, AREA_CENTRE],
    deliveryFee: 300,
    deliveryRadiusKm: 10,
  },
  'store-souf-cyber': {
    deliveryZones: [AREA_ALN, AREA_CENTRE, AREA_AIN_CHIH, AREA_BERBIH, AREA_05_JUILLET],
    deliveryFee: 200,
    deliveryRadiusKm: 15,
  },
  'store-campus-hub': {
    deliveryZones: [AREA_05_JUILLET, AREA_ALN, AREA_CENTRE],
    deliveryFee: 150,
    deliveryRadiusKm: 8,
  },
  'store-souf-insta-tech': {
    deliveryZones: [AREA_ALN, AREA_CENTRE, AREA_AIN_CHIH, AREA_BERBIH, AREA_05_JUILLET],
    deliveryFee: 200,
    deliveryRadiusKm: 18,
  },
  'store-oasis-fb-deals': {
    deliveryZones: [AREA_ALN, AREA_CENTRE, AREA_BERBIH, AREA_05_JUILLET],
    deliveryFee: 250,
    deliveryRadiusKm: 15,
  },
  'store-souf-console': {
    deliveryZones: [AREA_ALN, AREA_CENTRE, AREA_AIN_CHIH, AREA_BERBIH, AREA_05_JUILLET],
    deliveryFee: 200,
    deliveryRadiusKm: 15,
  },
  'store-nexus-rig': {
    deliveryZones: [AREA_CENTRE, AREA_ALN, AREA_AIN_CHIH, AREA_05_JUILLET],
    deliveryFee: 200,
    deliveryRadiusKm: 14,
  },
  'store-mobilepro': {
    deliveryZones: [AREA_ALN, AREA_BERBIH, AREA_CENTRE, AREA_05_JUILLET],
    deliveryFee: 200,
    deliveryRadiusKm: 12,
  },
};

function buildSeedPriceHistory(currentPrice: number, seedIdx: number): PriceHistoryPoint[] {
  const stepUnit = currentPrice >= 20000 ? 500 : currentPrice >= 5000 ? 200 : 100;
  const pattern = seedIdx % 3;
  // Pattern 0: steady price drop; Pattern 1: slight bump then drop; Pattern 2: gradual discount
  const p21 =
    pattern === 0
      ? currentPrice + stepUnit * 3
      : pattern === 1
        ? currentPrice + stepUnit * 2
        : currentPrice + stepUnit * 4;
  const p14 =
    pattern === 0
      ? currentPrice + stepUnit * 2
      : pattern === 1
        ? currentPrice + stepUnit * 3
        : currentPrice + stepUnit * 2;
  const p7 =
    pattern === 0
      ? currentPrice + stepUnit
      : pattern === 1
        ? currentPrice + stepUnit
        : currentPrice + stepUnit;

  return [
    { price: p21, recordedAt: daysAgoIso(21) },
    { price: p14, recordedAt: daysAgoIso(14) },
    { price: p7, recordedAt: daysAgoIso(7) },
    { price: currentPrice, recordedAt: hoursAgoIso(4) },
  ];
}

function storeCoordOffset(storeId: string): { dLat: number; dLng: number } {
  let hash = 0;
  for (let i = 0; i < storeId.length; i++) {
    hash = (hash * 31 + storeId.charCodeAt(i)) | 0;
  }
  const latStep = ((hash % 11) - 5) * 0.00035;
  const lngStep = (((hash >> 4) % 11) - 5) * 0.00042;
  return { dLat: latStep, dLng: lngStep };
}

function rewriteLegacyLocationBrandText(text: string): string {
  return text
    .replace(/\bShopfront\b/gi, 'Marketly')
    .replace(/\bEl\s*Oued\b/gi, 'Djelfa')
    .replace(/\bOld Market\b/gi, AREA_CENTRE)
    .replace(/\bMain Street\b/gi, AREA_ALN)
    .replace(/\bNorth Quarter\b/gi, AREA_AIN_CHIH)
    .replace(/\bRiverside\b/gi, AREA_BERBIH)
    .replace(/\bUniversity\b/gi, AREA_05_JUILLET);
}

function backfillMarketplaceEnhancements(db: ShopfrontDatabase): boolean {
  let changed = false;
  const now = new Date().toISOString();

  // Seed Moderator demo user if missing and migrate @shopfront.dz demo emails
  if (!db.users.some((u) => u.id === 'user-moderator-1')) {
    db.users.push({
      id: 'user-moderator-1',
      fullName: 'Tariq Mansour',
      email: 'moderator@marketly.dz',
      phone: '0660 11 22 33',
      passwordHash: hashPassword('DemoPass2026!'),
      roles: ['moderator', 'customer'],
      isDemo: true,
      createdAt: now,
    });
    changed = true;
  }

  for (const user of db.users) {
    if (/@shopfront\.dz$/i.test(user.email)) {
      user.email = user.email.replace(/@shopfront\.dz$/i, '@marketly.dz');
      changed = true;
    }
  }

  for (const store of db.stores) {
    if (!store.storeType) {
      store.storeType = 'physical_store';
      changed = true;
    }
    const preset = DEFAULT_STORE_ZONES[store.id];
    if (!Array.isArray(store.deliveryZones) || store.deliveryZones.length === 0) {
      store.deliveryZones = preset ? [...preset.deliveryZones] : [store.area, AREA_ALN].filter(Boolean);
      changed = true;
    }
    if (typeof store.deliveryFee !== 'number') {
      store.deliveryFee = preset ? preset.deliveryFee : 200;
      changed = true;
    }
    if (typeof store.deliveryRadiusKm !== 'number') {
      store.deliveryRadiusKm = preset ? preset.deliveryRadiusKm : 10;
      changed = true;
    }

    // Normalize store location to Djelfa streets & coordinates
    const { area: djelfaArea } = normalizeDjelfaArea(store.area);
    const offset = storeCoordOffset(store.id);
    const outOfDjelfaBounds =
      typeof store.lat !== 'number' ||
      typeof store.lng !== 'number' ||
      store.lat < 34.4 ||
      store.lat > 34.9 ||
      store.lng < 3.0 ||
      store.lng > 3.5;

    if (store.area !== djelfaArea.name || store.city !== 'Djelfa' || outOfDjelfaBounds) {
      store.area = djelfaArea.name;
      store.city = 'Djelfa';
      store.lat = Number((djelfaArea.lat + offset.dLat).toFixed(4));
      store.lng = Number((djelfaArea.lng + offset.dLng).toFixed(4));
      changed = true;
    }

    const normZones = Array.from(
      new Set((store.deliveryZones || []).map((z) => normalizeDjelfaArea(z).area.name))
    );
    if (
      normZones.length !== (store.deliveryZones || []).length ||
      normZones.some((z, idx) => store.deliveryZones?.[idx] !== z)
    ) {
      store.deliveryZones = normZones.length > 0 ? normZones : [AREA_CENTRE, AREA_ALN];
      changed = true;
    }

    const updatedName = rewriteLegacyLocationBrandText(store.name);
    if (updatedName !== store.name) {
      store.name = updatedName;
      changed = true;
    }
    const updatedDesc = rewriteLegacyLocationBrandText(store.description);
    if (updatedDesc !== store.description) {
      store.description = updatedDesc;
      changed = true;
    }
    const updatedAddr = rewriteLegacyLocationBrandText(store.address);
    if (updatedAddr !== store.address) {
      store.address = updatedAddr;
      changed = true;
    }

    if (store.accentColor === '#13111C' || store.accentColor === '#D9F54B') {
      store.accentColor = '#4A3894';
      changed = true;
    } else if (store.accentColor === '#6E65F6') {
      store.accentColor = '#9678CE';
      changed = true;
    }
  }

  for (const driver of db.drivers || []) {
    const { area: djelfaArea } = normalizeDjelfaArea(driver.serviceArea);
    if (driver.serviceArea !== djelfaArea.name) {
      driver.serviceArea = djelfaArea.name;
      changed = true;
    }
  }

  for (const order of db.orders || []) {
    if (order.orderNumber.startsWith('SF-')) {
      order.orderNumber = order.orderNumber.replace(/^SF-/, 'MK-');
      changed = true;
    }
    const nextStoreAddr = rewriteLegacyLocationBrandText(order.storeAddress);
    const nextDelAddr = rewriteLegacyLocationBrandText(order.deliveryAddress);
    const nextStoreArea = normalizeDjelfaArea(order.storeArea).area.name;
    if (nextStoreAddr !== order.storeAddress || nextDelAddr !== order.deliveryAddress || nextStoreArea !== order.storeArea) {
      order.storeAddress = nextStoreAddr;
      order.deliveryAddress = nextDelAddr;
      order.storeArea = nextStoreArea;
      changed = true;
    }
  }

  // Ensure at least two approved online-only IG / FB seller storefronts exist
  const hasOnlineSeller = db.stores.some((s) => s.storeType === 'online_page');
  if (!hasOnlineSeller) {
    const demoPass = hashPassword('DemoPass2026!');
    if (!db.users.some((u) => u.id === 'user-merchant-ig')) {
      db.users.push({
        id: 'user-merchant-ig',
        fullName: 'Meriem Djelfa Gadgets',
        email: 'ig@marketly.dz',
        phone: '0667 82 14 30',
        passwordHash: demoPass,
        roles: ['merchant', 'customer'],
        sellerType: 'online_page',
        isDemo: true,
        createdAt: now,
      });
    }
    if (!db.users.some((u) => u.id === 'user-merchant-fb')) {
      db.users.push({
        id: 'user-merchant-fb',
        fullName: 'Riadh Atlas Deals',
        email: 'fb@marketly.dz',
        phone: '0554 19 66 88',
        passwordHash: demoPass,
        roles: ['merchant', 'customer'],
        sellerType: 'online_page',
        isDemo: true,
        createdAt: now,
      });
    }

    const onlineStores: Store[] = [
      {
        id: 'store-souf-insta-tech',
        ownerId: 'user-merchant-ig',
        name: 'Djelfa Gadgets IG',
        slug: 'djelfa-gadgets-ig',
        storeType: 'online_page',
        description:
          'Verified Djelfa Instagram tech page specializing in ANC earbuds, MagSafe accessories, 65W GaN chargers, and fast same-day COD delivery.',
        area: AREA_ALN,
        address: "Online Storefront · Boulevard de l'ALN, Djelfa",
        city: 'Djelfa',
        lat: 34.6761,
        lng: 3.2584,
        phone: '0667 82 14 30',
        whatsapp: '213667821430',
        instagramUrl: 'https://instagram.com/djelfagadgets',
        facebookUrl: 'https://facebook.com/djelfagadgetsdz',
        categories: ['cat-phones', 'cat-peripherals'],
        openingHours: 'Online Orders · 09:00 - 23:30',
        isOpen: true,
        rating: 4.8,
        reviewCount: 2,
        approvalStatus: 'approved',
        accentColor: '#9678CE',
        deliveryZones: [AREA_ALN, AREA_CENTRE, AREA_AIN_CHIH, AREA_BERBIH, AREA_05_JUILLET],
        deliveryFee: 200,
        deliveryRadiusKm: 18,
        createdAt: now,
        updatedAt: now,
      },
      {
        id: 'store-oasis-fb-deals',
        ownerId: 'user-merchant-fb',
        name: 'Atlas Tech Drops FB',
        slug: 'atlas-tech-drops-fb',
        storeType: 'online_page',
        description:
          'Popular Facebook Marketplace tech seller offering Galaxy smartphones, Keychron mechanical keyboards, power banks, and sealed PC accessories with cash on delivery across Djelfa.',
        area: AREA_CENTRE,
        address: 'Online Storefront · Facebook & WhatsApp · Djelfa',
        city: 'Djelfa',
        lat: 34.6728,
        lng: 3.263,
        phone: '0554 19 66 88',
        whatsapp: '213554196688',
        facebookUrl: 'https://facebook.com/atlastechdrops',
        instagramUrl: 'https://instagram.com/atlastechdrops',
        categories: ['cat-phones', 'cat-peripherals'],
        openingHours: 'Online DM · 10:00 - 23:00',
        isOpen: true,
        rating: 4.7,
        reviewCount: 2,
        approvalStatus: 'approved',
        accentColor: '#4A3894',
        deliveryZones: [AREA_ALN, AREA_CENTRE, AREA_BERBIH, AREA_05_JUILLET],
        deliveryFee: 250,
        deliveryRadiusKm: 15,
        createdAt: now,
        updatedAt: now,
      },
    ];

    for (const os of onlineStores) {
      if (!db.stores.some((s) => s.id === os.id)) {
        db.stores.push(os);
      }
    }

    const onlineListings: StoreProduct[] = [
      { id: 'sp-ig-earbuds', storeId: 'store-souf-insta-tech', productId: 'prod-earbuds', price: 5600, currency: 'DZD', stockQuantity: 18, availabilityStatus: 'in_stock', availabilityUpdatedAt: minutesAgoIso(14), isActive: true, createdAt: now, updatedAt: now },
      { id: 'sp-ig-charger', storeId: 'store-souf-insta-tech', productId: 'prod-gan-charger', price: 3150, currency: 'DZD', stockQuantity: 22, availabilityStatus: 'in_stock', availabilityUpdatedAt: minutesAgoIso(20), isActive: true, createdAt: now, updatedAt: now },
      { id: 'sp-ig-case', storeId: 'store-souf-insta-tech', productId: 'prod-magsafe-case', price: 1350, currency: 'DZD', stockQuantity: 40, availabilityStatus: 'in_stock', availabilityUpdatedAt: minutesAgoIso(25), isActive: true, createdAt: now, updatedAt: now },
      { id: 'sp-ig-powerbank', storeId: 'store-souf-insta-tech', productId: 'prod-powerbank', price: 4750, currency: 'DZD', stockQuantity: 11, availabilityStatus: 'in_stock', availabilityUpdatedAt: minutesAgoIso(18), isActive: true, createdAt: now, updatedAt: now },
      { id: 'sp-fb-a55', storeId: 'store-oasis-fb-deals', productId: 'prod-galaxy-a55', price: 61500, currency: 'DZD', stockQuantity: 5, availabilityStatus: 'in_stock', availabilityUpdatedAt: minutesAgoIso(22), isActive: true, createdAt: now, updatedAt: now },
      { id: 'sp-fb-kbd', storeId: 'store-oasis-fb-deals', productId: 'prod-mech-kbd', price: 12100, currency: 'DZD', stockQuantity: 7, availabilityStatus: 'in_stock', availabilityUpdatedAt: minutesAgoIso(29), isActive: true, createdAt: now, updatedAt: now },
      { id: 'sp-fb-mouse', storeId: 'store-oasis-fb-deals', productId: 'prod-mouse', price: 9500, currency: 'DZD', stockQuantity: 9, availabilityStatus: 'in_stock', availabilityUpdatedAt: minutesAgoIso(31), isActive: true, createdAt: now, updatedAt: now },
    ];
    for (const sp of onlineListings) {
      if (!db.storeProducts.some((x) => x.id === sp.id)) {
        db.storeProducts.push(sp);
      }
    }

    if (!Array.isArray(db.storeReviews)) db.storeReviews = [];
    const onlineReviews: StoreReview[] = [
      {
        id: 'rev-ig-1',
        storeId: 'store-souf-insta-tech',
        userId: null,
        authorName: 'Imene K.',
        rating: 5,
        comment: 'Ordered via their Instagram page and got my 65W GaN charger delivered to University in 35 minutes!',
        createdAt: hoursAgoIso(5),
      },
      {
        id: 'rev-ig-2',
        storeId: 'store-souf-insta-tech',
        userId: null,
        authorName: 'Rami B.',
        rating: 5,
        comment: 'Lowest DZD price on MagSafe armor cases and SoundCore earbuds, zero physical trip needed.',
        createdAt: daysAgoIso(2),
      },
      {
        id: 'rev-fb-1',
        storeId: 'store-oasis-fb-deals',
        userId: null,
        authorName: 'Sami L.',
        rating: 5,
        comment: 'Messaged their Facebook page for a Keychron K2 Pro keyboard—factory sealed with COD.',
        createdAt: hoursAgoIso(10),
      },
      {
        id: 'rev-fb-2',
        storeId: 'store-oasis-fb-deals',
        userId: null,
        authorName: 'Nora A.',
        rating: 4,
        comment: 'Great prices on Galaxy A55 and mice, courier called before arriving.',
        createdAt: daysAgoIso(3),
      },
    ];
    for (const rev of onlineReviews) {
      if (!db.storeReviews.some((r) => r.id === rev.id)) {
        db.storeReviews.push(rev);
      }
    }
    for (const st of db.stores) {
      recomputeStoreRating(st, db.storeReviews);
    }
    changed = true;
  }

  // Migrate categories to the 4 canonical categories (PC Parts, Phones & Gear, Consoles, Peripherals)
  const currentCatIds = (db.categories || []).map((c) => c.id);
  const needsCategoryUpgrade =
    currentCatIds.length !== CANONICAL_CATEGORIES.length ||
    CANONICAL_CATEGORIES.some((cc) => !currentCatIds.includes(cc.id)) ||
    currentCatIds.some((id) => ['cat-storage', 'cat-power', 'cat-accessories'].includes(id));
  if (needsCategoryUpgrade) {
    db.categories = CANONICAL_CATEGORIES.map((c) => ({ ...c }));
    changed = true;
  }

  for (const prod of db.products) {
    const normalized = normalizeCategoryId(prod.categoryId, {
      imageKey: prod.imageKey,
      name: prod.name,
      slug: prod.slug,
      description: prod.description,
    });
    if (prod.categoryId !== normalized) {
      prod.categoryId = normalized;
      changed = true;
    }
  }

  for (const store of db.stores) {
    const normCats = Array.from(
      new Set((store.categories || []).map((c) => normalizeCategoryId(c)))
    );
    if (
      normCats.length !== (store.categories || []).length ||
      normCats.some((c, i) => store.categories?.[i] !== c)
    ) {
      store.categories = normCats.length > 0 ? normCats : ['cat-pc-parts'];
      changed = true;
    }
  }

  // Ensure the 3 Flagship Specialty Stores + their catalogs exist alongside existing shops
  const flagshipStores: Store[] = [
    {
      id: 'store-souf-console',
      ownerId: 'user-merchant-1',
      name: 'Djelfa Console Arena',
      slug: 'djelfa-console-arena',
      storeType: 'physical_store',
      description:
        'Consoles & Gaming Only — PlayStation 5 Slim, Xbox Series S|X, DualSense Edge controllers, and pro gaming headsets in Djelfa.',
      area: AREA_ALN,
      address: "62 Boulevard de l'ALN, Djelfa",
      city: 'Djelfa',
      lat: 34.6768,
      lng: 3.2579,
      phone: '0663 40 91 22',
      whatsapp: '213663409122',
      instagramUrl: 'https://instagram.com/djelfaconsolearena',
      categories: ['cat-consoles'],
      openingHours: '10:00 - 23:30',
      isOpen: true,
      rating: 4.8,
      reviewCount: 4,
      approvalStatus: 'approved',
      accentColor: '#4A3894',
      deliveryZones: [AREA_ALN, AREA_CENTRE, AREA_AIN_CHIH, AREA_BERBIH, AREA_05_JUILLET],
      deliveryFee: 200,
      deliveryRadiusKm: 15,
      createdAt: now,
      updatedAt: now,
    },
    {
      id: 'store-nexus-rig',
      ownerId: 'user-merchant-2',
      name: 'Nexus Rig & Parts',
      slug: 'nexus-rig-parts',
      storeType: 'physical_store',
      description:
        'PC & PC Parts Only — GeForce RTX GPUs, Ryzen CPUs, NVMe Gen4 SSDs, DDR5 RAM, dual-tower coolers, airflow ATX cases, and modular PSUs.',
      area: AREA_CENTRE,
      address: '29 Rue de la République, Centre-Ville, Djelfa',
      city: 'Djelfa',
      lat: 34.6722,
      lng: 3.2624,
      phone: '0551 82 33 70',
      whatsapp: '213551823370',
      instagramUrl: 'https://instagram.com/nexusrigparts',
      categories: ['cat-pc-parts'],
      openingHours: '09:00 - 22:00',
      isOpen: true,
      rating: 4.9,
      reviewCount: 4,
      approvalStatus: 'approved',
      accentColor: '#9678CE',
      deliveryZones: [AREA_CENTRE, AREA_ALN, AREA_AIN_CHIH, AREA_05_JUILLET],
      deliveryFee: 200,
      deliveryRadiusKm: 14,
      createdAt: now,
      updatedAt: now,
    },
    {
      id: 'store-mobilepro',
      ownerId: 'user-merchant-2',
      name: 'MobilePro Djelfa',
      slug: 'mobilepro-djelfa',
      storeType: 'physical_store',
      description:
        'Phones & Mobile Gear Only — Factory-unlocked iPhones & Galaxy flagships, 65W GaN chargers, MagSafe armor cases, power banks, and ANC earbuds.',
      area: AREA_BERBIH,
      address: '11 Boulevard Si El Haouès, Quartier Berbih, Djelfa',
      city: 'Djelfa',
      lat: 34.6639,
      lng: 3.2669,
      phone: '0772 54 19 80',
      whatsapp: '213772541980',
      instagramUrl: 'https://instagram.com/mobilepro.djelfa',
      facebookUrl: 'https://facebook.com/mobileprodjelfa',
      categories: ['cat-phones'],
      openingHours: '09:00 - 22:30',
      isOpen: true,
      rating: 4.8,
      reviewCount: 4,
      approvalStatus: 'approved',
      accentColor: '#4A3894',
      deliveryZones: [AREA_ALN, AREA_BERBIH, AREA_CENTRE, AREA_05_JUILLET],
      deliveryFee: 200,
      deliveryRadiusKm: 12,
      createdAt: now,
      updatedAt: now,
    },
  ];

  const flagshipProducts: Product[] = [
    {
      id: 'prod-ps5-slim',
      name: 'PlayStation 5 Slim 1TB Console',
      slug: 'ps5-slim-1tb',
      brand: 'Sony PlayStation',
      description: 'Ultra-high speed 1TB NVMe SSD console with DualSense wireless controller and 4K 120Hz HDR output.',
      categoryId: 'cat-consoles',
      imageKey: 'console',
      popularity: 97,
      soldCount: 118,
      createdAt: now,
    },
    {
      id: 'prod-xbox-series-s',
      name: 'Xbox Series S 512GB Console',
      slug: 'xbox-series-s-512gb',
      brand: 'Microsoft Xbox',
      description: 'Compact all-digital next-gen console running 1440p up to 120fps with Quick Resume.',
      categoryId: 'cat-consoles',
      imageKey: 'console',
      popularity: 90,
      soldCount: 84,
      createdAt: now,
    },
    {
      id: 'prod-dualsense',
      name: 'DualSense Wireless Controller',
      slug: 'dualsense-controller',
      brand: 'Sony',
      description: 'PS5 & PC haptic feedback wireless controller with adaptive triggers and USB-C charging.',
      categoryId: 'cat-consoles',
      imageKey: 'controller',
      popularity: 92,
      soldCount: 142,
      createdAt: now,
    },
    {
      id: 'prod-gaming-headset',
      name: 'Cloud III Wireless Gaming Headset',
      slug: 'cloud-iii-gaming-headset',
      brand: 'HyperX',
      description: '53mm angled drivers, DTS Spatial Audio, memory foam ear cushions, and detachable noise-cancelling mic.',
      categoryId: 'cat-consoles',
      imageKey: 'headset',
      popularity: 88,
      soldCount: 79,
      createdAt: now,
    },
    {
      id: 'prod-pc-case',
      name: 'Lancool 216 Mesh ATX PC Case',
      slug: 'lancool-216-atx-case',
      brand: 'Lian Li',
      description: 'High-airflow mid-tower PC case with tempered glass side panel and dual 160mm front PWM fans.',
      categoryId: 'cat-pc-parts',
      imageKey: 'pc-case',
      popularity: 86,
      soldCount: 63,
      createdAt: now,
    },
  ];

  const flagshipStoreProducts: StoreProduct[] = [
    // Souf Console Arena (Consoles & Gaming Only)
    { id: 'sp-sca-ps5', storeId: 'store-souf-console', productId: 'prod-ps5-slim', price: 89500, currency: 'DZD', stockQuantity: 5, availabilityStatus: 'in_stock', availabilityUpdatedAt: minutesAgoIso(10), isActive: true, createdAt: now, updatedAt: now },
    { id: 'sp-sca-xbox', storeId: 'store-souf-console', productId: 'prod-xbox-series-s', price: 52500, currency: 'DZD', stockQuantity: 4, availabilityStatus: 'in_stock', availabilityUpdatedAt: minutesAgoIso(14), isActive: true, createdAt: now, updatedAt: now },
    { id: 'sp-sca-ds', storeId: 'store-souf-console', productId: 'prod-dualsense', price: 11800, currency: 'DZD', stockQuantity: 12, availabilityStatus: 'in_stock', availabilityUpdatedAt: minutesAgoIso(8), isActive: true, createdAt: now, updatedAt: now },
    { id: 'sp-sca-hs', storeId: 'store-souf-console', productId: 'prod-gaming-headset', price: 14500, currency: 'DZD', stockQuantity: 7, availabilityStatus: 'in_stock', availabilityUpdatedAt: minutesAgoIso(19), isActive: true, createdAt: now, updatedAt: now },

    // Nexus Rig & Parts (PC & PC Parts Only)
    { id: 'sp-nr-rtx', storeId: 'store-nexus-rig', productId: 'prod-rtx4060', price: 54900, currency: 'DZD', stockQuantity: 6, availabilityStatus: 'in_stock', availabilityUpdatedAt: minutesAgoIso(9), isActive: true, createdAt: now, updatedAt: now },
    { id: 'sp-nr-ryzen', storeId: 'store-nexus-rig', productId: 'prod-ryzen5', price: 34400, currency: 'DZD', stockQuantity: 8, availabilityStatus: 'in_stock', availabilityUpdatedAt: minutesAgoIso(13), isActive: true, createdAt: now, updatedAt: now },
    { id: 'sp-nr-nvme', storeId: 'store-nexus-rig', productId: 'prod-nvme-1tb', price: 11600, currency: 'DZD', stockQuantity: 18, availabilityStatus: 'in_stock', availabilityUpdatedAt: minutesAgoIso(7), isActive: true, createdAt: now, updatedAt: now },
    { id: 'sp-nr-ddr5', storeId: 'store-nexus-rig', productId: 'prod-ddr5-32', price: 16900, currency: 'DZD', stockQuantity: 9, availabilityStatus: 'in_stock', availabilityUpdatedAt: minutesAgoIso(15), isActive: true, createdAt: now, updatedAt: now },
    { id: 'sp-nr-case', storeId: 'store-nexus-rig', productId: 'prod-pc-case', price: 13500, currency: 'DZD', stockQuantity: 5, availabilityStatus: 'in_stock', availabilityUpdatedAt: minutesAgoIso(17), isActive: true, createdAt: now, updatedAt: now },
    { id: 'sp-nr-cooler', storeId: 'store-nexus-rig', productId: 'prod-cooler', price: 6300, currency: 'DZD', stockQuantity: 11, availabilityStatus: 'in_stock', availabilityUpdatedAt: minutesAgoIso(20), isActive: true, createdAt: now, updatedAt: now },
    { id: 'sp-nr-psu', storeId: 'store-nexus-rig', productId: 'prod-psu-750', price: 15200, currency: 'DZD', stockQuantity: 6, availabilityStatus: 'in_stock', availabilityUpdatedAt: minutesAgoIso(24), isActive: true, createdAt: now, updatedAt: now },

    // MobilePro El Oued (Phones & Mobile Gear Only)
    { id: 'sp-mp-iphone', storeId: 'store-mobilepro', productId: 'prod-iphone15', price: 138900, currency: 'DZD', stockQuantity: 5, availabilityStatus: 'in_stock', availabilityUpdatedAt: minutesAgoIso(11), isActive: true, createdAt: now, updatedAt: now },
    { id: 'sp-mp-a55', storeId: 'store-mobilepro', productId: 'prod-galaxy-a55', price: 61200, currency: 'DZD', stockQuantity: 9, availabilityStatus: 'in_stock', availabilityUpdatedAt: minutesAgoIso(12), isActive: true, createdAt: now, updatedAt: now },
    { id: 'sp-mp-charger', storeId: 'store-mobilepro', productId: 'prod-gan-charger', price: 3100, currency: 'DZD', stockQuantity: 26, availabilityStatus: 'in_stock', availabilityUpdatedAt: minutesAgoIso(6), isActive: true, createdAt: now, updatedAt: now },
    { id: 'sp-mp-case', storeId: 'store-mobilepro', productId: 'prod-magsafe-case', price: 1300, currency: 'DZD', stockQuantity: 45, availabilityStatus: 'in_stock', availabilityUpdatedAt: minutesAgoIso(16), isActive: true, createdAt: now, updatedAt: now },
    { id: 'sp-mp-pb', storeId: 'store-mobilepro', productId: 'prod-powerbank', price: 4800, currency: 'DZD', stockQuantity: 14, availabilityStatus: 'in_stock', availabilityUpdatedAt: minutesAgoIso(18), isActive: true, createdAt: now, updatedAt: now },
    { id: 'sp-mp-earbuds', storeId: 'store-mobilepro', productId: 'prod-earbuds', price: 5700, currency: 'DZD', stockQuantity: 15, availabilityStatus: 'in_stock', availabilityUpdatedAt: minutesAgoIso(21), isActive: true, createdAt: now, updatedAt: now },
  ];

  const flagshipReviews: StoreReview[] = [
    { id: 'rev-sca-1', storeId: 'store-souf-console', userId: null, authorName: 'Fares D.', rating: 5, comment: 'Picked up a sealed PS5 Slim and extra DualSense controller—tested HDMI 2.1 in store.', createdAt: hoursAgoIso(4) },
    { id: 'rev-sca-2', storeId: 'store-souf-console', userId: null, authorName: 'Yasser K.', rating: 5, comment: 'Best console shop in El Oued. HyperX Cloud III works great on both PS5 and PC.', createdAt: daysAgoIso(2) },
    { id: 'rev-sca-3', storeId: 'store-souf-console', userId: null, authorName: 'Mounir B.', rating: 5, comment: 'Genuine controllers with warranty sticker and same-day courier.', createdAt: daysAgoIso(4) },
    { id: 'rev-sca-4', storeId: 'store-souf-console', userId: null, authorName: 'Ayoub L.', rating: 4, comment: 'Clean Xbox Series S stock and fair DZD pricing.', createdAt: daysAgoIso(6) },

    { id: 'rev-nr-1', storeId: 'store-nexus-rig', userId: null, authorName: 'Anis G.', rating: 5, comment: 'Built my whole Ryzen 5 + RTX 4060 rig inside the Lancool 216 case here. Cable management was immaculate.', createdAt: hoursAgoIso(2) },
    { id: 'rev-nr-2', storeId: 'store-nexus-rig', userId: null, authorName: 'Chakib R.', rating: 5, comment: 'Lowest DZD bundle on 32GB DDR5 + 1TB NVMe + Dual-Tower cooler.', createdAt: daysAgoIso(1) },
    { id: 'rev-nr-3', storeId: 'store-nexus-rig', userId: null, authorName: 'Nassim Z.', rating: 5, comment: 'Real PC specialists—updated BIOS and ran stress test before handoff.', createdAt: daysAgoIso(3) },
    { id: 'rev-nr-4', storeId: 'store-nexus-rig', userId: null, authorName: 'Reda M.', rating: 5, comment: 'Authentic Seasonic Gold PSUs and thermal paste always ready.', createdAt: daysAgoIso(5) },

    { id: 'rev-mp-1', storeId: 'store-mobilepro', userId: null, authorName: 'Lina S.', rating: 5, comment: 'Got my iPhone 15 with MagSafe armor case and 65W GaN charger installed in 10 minutes.', createdAt: hoursAgoIso(3) },
    { id: 'rev-mp-2', storeId: 'store-mobilepro', userId: null, authorName: 'Omar T.', rating: 5, comment: 'Original Anker & Baseus mobile gear, zero counterfeits.', createdAt: daysAgoIso(2) },
    { id: 'rev-mp-3', storeId: 'store-mobilepro', userId: null, authorName: 'Kenza H.', rating: 5, comment: 'Lowest price in El Oued for Galaxy A55 256GB with official seal.', createdAt: daysAgoIso(4) },
    { id: 'rev-mp-4', storeId: 'store-mobilepro', userId: null, authorName: 'Djalal A.', rating: 4, comment: 'Fast Riverside pickup and helpful tempered glass installation.', createdAt: daysAgoIso(7) },
  ];

  for (const fp of flagshipProducts) {
    if (!db.products.some((p) => p.id === fp.id)) {
      db.products.push(fp);
      changed = true;
    }
  }
  for (const fs of flagshipStores) {
    if (!db.stores.some((s) => s.id === fs.id)) {
      db.stores.push(fs);
      changed = true;
    }
  }
  for (const fsp of flagshipStoreProducts) {
    if (!db.storeProducts.some((sp) => sp.id === fsp.id)) {
      db.storeProducts.push(fsp);
      changed = true;
    }
  }
  if (!Array.isArray(db.storeReviews)) db.storeReviews = [];
  for (const frev of flagshipReviews) {
    if (!db.storeReviews.some((r) => r.id === frev.id)) {
      db.storeReviews.push(frev);
      changed = true;
    }
  }

  for (const st of db.stores) {
    recomputeStoreRating(st, db.storeReviews);
  }

  db.storeProducts.forEach((sp: StoreProduct, idx: number) => {
    if (!Array.isArray(sp.priceHistory) || sp.priceHistory.length === 0) {
      sp.priceHistory = buildSeedPriceHistory(sp.price, idx);
      changed = true;
    }
  });

  if (!Array.isArray(db.supportTickets)) {
    db.supportTickets = [
      {
        id: 'sup-seed-buyer-1',
        accessToken: 'seed-token-buyer-1',
        userId: 'user-customer-1',
        senderRole: 'customer',
        senderName: 'Amina Benali',
        senderContact: '0661 24 88 10',
        topic: 'Order status & COD',
        status: 'answered',
        messages: [
          {
            id: 'smsg-seed-1',
            sender: 'visitor',
            senderName: 'Amina Benali',
            text: 'Hello! If I place a COD order from Centre-Ville before 4 PM, does it arrive the same day?',
            createdAt: hoursAgoIso(3),
          },
          {
            id: 'smsg-seed-2',
            sender: 'support',
            senderName: 'Nadia Khelifi (Admin)',
            text: 'Yes! Orders confirmed before 17:00 inside Djelfa usually arrive same day within 1–3 hours with courier tracking.',
            createdAt: hoursAgoIso(2),
          },
        ],
        createdAt: hoursAgoIso(3),
        updatedAt: hoursAgoIso(2),
      },
      {
        id: 'sup-seed-seller-1',
        accessToken: 'seed-token-seller-1',
        userId: 'user-merchant-1',
        senderRole: 'seller',
        senderName: 'Youssef Mansouri',
        senderContact: '0662 45 11 09',
        topic: 'Store verification & catalog',
        status: 'open',
        messages: [
          {
            id: 'smsg-seed-3',
            sender: 'visitor',
            senderName: 'Youssef Mansouri',
            text: 'Hi team, can we add extra GPU watercooling fittings under PC Parts & Elements?',
            createdAt: minutesAgoIso(40),
          },
        ],
        createdAt: minutesAgoIso(40),
        updatedAt: minutesAgoIso(40),
      },
    ];
    changed = true;
  } else {
    for (const ticket of db.supportTickets) {
      for (const msg of ticket.messages) {
        const nextText = rewriteLegacyLocationBrandText(msg.text);
        if (nextText !== msg.text) {
          msg.text = nextText;
          changed = true;
        }
      }
    }
  }
  return changed;
}

function createSeedDatabase(): ShopfrontDatabase {
  const now = new Date().toISOString();
  const demoPass = hashPassword('DemoPass2026!');

  const users = [
    {
      id: 'user-customer-1',
      fullName: 'Amina Benali',
      email: 'amina@marketly.dz',
      phone: '0661 24 88 10',
      passwordHash: demoPass,
      roles: ['customer' as const],
      isDemo: true,
      createdAt: now,
    },
    {
      id: 'user-merchant-1',
      fullName: 'Youssef Mansouri',
      email: 'merchant@marketly.dz',
      phone: '0662 45 11 09',
      passwordHash: demoPass,
      roles: ['merchant' as const, 'customer' as const],
      sellerType: 'physical_store' as const,
      isDemo: true,
      createdAt: now,
    },
    {
      id: 'user-merchant-2',
      fullName: 'Samir TechPoint',
      email: 'samir@techpoint.dz',
      phone: '0550 77 32 14',
      passwordHash: demoPass,
      roles: ['merchant' as const],
      sellerType: 'physical_store' as const,
      isDemo: true,
      createdAt: now,
    },
    {
      id: 'user-driver-1',
      fullName: 'Karim Ziane',
      email: 'karim.driver@marketly.dz',
      phone: '0771 39 44 21',
      passwordHash: demoPass,
      roles: ['driver' as const, 'customer' as const],
      isDemo: true,
      createdAt: now,
    },
    {
      id: 'user-driver-2',
      fullName: 'Lina Haddad',
      email: 'lina.driver@marketly.dz',
      phone: '0668 92 10 55',
      passwordHash: demoPass,
      roles: ['driver' as const],
      isDemo: true,
      createdAt: now,
    },
    {
      id: 'user-driver-3',
      fullName: 'Alex B.',
      email: 'alex.driver@marketly.dz',
      phone: '0559 18 40 33',
      passwordHash: demoPass,
      roles: ['driver' as const],
      isDemo: true,
      createdAt: now,
    },
    {
      id: 'user-moderator-1',
      fullName: 'Tariq Mansour',
      email: 'moderator@marketly.dz',
      phone: '0660 11 22 33',
      passwordHash: demoPass,
      roles: ['moderator' as const, 'customer' as const],
      isDemo: true,
      createdAt: now,
    },
    {
      id: 'user-admin-1',
      fullName: 'Nadia Khelifi',
      email: 'admin@marketly.dz',
      phone: '0660 00 11 22',
      passwordHash: demoPass,
      roles: ['admin' as const, 'customer' as const],
      isDemo: true,
      createdAt: now,
    },
  ];

  const categories = CANONICAL_CATEGORIES.map((c) => ({ ...c }));

  const storeReviews: StoreReview[] = [
    // Silicon Oasis PC -> 7 reviews: 6x5, 1x4 => 4.9 avg (Highest Rated!)
    {
      id: 'rev-1',
      storeId: 'store-silicon-oasis',
      userId: 'user-customer-1',
      authorName: 'Amina Benali',
      rating: 5,
      comment: 'Picked up a Samsung 990 EVO 1TB NVMe and thermal paste in 15 minutes. Sealed factory box and lowest DZD price in El Oued.',
      createdAt: hoursAgoIso(3),
    },
    {
      id: 'rev-2',
      storeId: 'store-silicon-oasis',
      userId: null,
      authorName: 'Riadh M.',
      rating: 5,
      comment: 'Tested my RTX 4060 on their bench before I paid. Honest advice on PSU wattage too.',
      createdAt: daysAgoIso(1),
    },
    {
      id: 'rev-3',
      storeId: 'store-silicon-oasis',
      userId: null,
      authorName: 'Walid K.',
      rating: 5,
      comment: 'Best AM5 CPU & DDR5 stock in Old Market. Fast same-day courier.',
      createdAt: daysAgoIso(2),
    },
    {
      id: 'rev-4',
      storeId: 'store-silicon-oasis',
      userId: null,
      authorName: 'Nabil S.',
      rating: 5,
      comment: 'Always accurate live stock counts. Zero wasted trips.',
      createdAt: daysAgoIso(4),
    },
    {
      id: 'rev-5',
      storeId: 'store-silicon-oasis',
      userId: null,
      authorName: 'Sarah T.',
      rating: 5,
      comment: 'Super clean shop, genuine Corsair RAM and Seasonic Gold PSUs with warranty.',
      createdAt: daysAgoIso(5),
    },
    {
      id: 'rev-6',
      storeId: 'store-silicon-oasis',
      userId: null,
      authorName: 'Hichem D.',
      rating: 5,
      comment: 'Thermalright cooler dropped my Ryzen temps by 18C. Highly recommend!',
      createdAt: daysAgoIso(6),
    },
    {
      id: 'rev-7',
      storeId: 'store-silicon-oasis',
      userId: null,
      authorName: 'Mehdi B.',
      rating: 4,
      comment: 'Great prices on GPUs and NVMe drives. Busy around 18:00 so reserve ahead.',
      createdAt: daysAgoIso(8),
    },

    // MobileZone Riverside -> 4 reviews: 3x5, 1x4 => 4.8 avg
    {
      id: 'rev-8',
      storeId: 'store-mobilezone',
      userId: 'user-customer-1',
      authorName: 'Amina Benali',
      rating: 5,
      comment: 'Original Anker 65W GaN charger charges both my laptop and phone without heating up.',
      createdAt: hoursAgoIso(6),
    },
    {
      id: 'rev-9',
      storeId: 'store-mobilezone',
      userId: null,
      authorName: 'Yacine L.',
      rating: 5,
      comment: 'Bought my iPhone 15 and Spigen MagSafe armor case here. Flawless setup.',
      createdAt: daysAgoIso(2),
    },
    {
      id: 'rev-10',
      storeId: 'store-mobilezone',
      userId: null,
      authorName: 'Ines R.',
      rating: 5,
      comment: 'Baseus 45W power bank saved me during travel. Genuine serial check on spot.',
      createdAt: daysAgoIso(3),
    },
    {
      id: 'rev-11',
      storeId: 'store-mobilezone',
      userId: null,
      authorName: 'Farid G.',
      rating: 4,
      comment: 'Good prices on Galaxy A55 and cases, quick WhatsApp replies.',
      createdAt: daysAgoIso(5),
    },

    // TechPoint Phones -> 4 reviews: 3x5, 1x4 => 4.8? Let's make 2x5, 2x4 => 4.5 avg or 3x5, 2x4 => 4.6
    {
      id: 'rev-12',
      storeId: 'store-techpoint',
      userId: null,
      authorName: 'Kamel A.',
      rating: 5,
      comment: 'SoundCore ANC earbuds sound crisp and came sealed with local warranty.',
      createdAt: hoursAgoIso(9),
    },
    {
      id: 'rev-13',
      storeId: 'store-techpoint',
      userId: null,
      authorName: 'Meriem Z.',
      rating: 5,
      comment: 'Friendly staff, helped transfer everything to my new Galaxy A55.',
      createdAt: daysAgoIso(2),
    },
    {
      id: 'rev-14',
      storeId: 'store-techpoint',
      userId: null,
      authorName: 'Sofiane N.',
      rating: 4,
      comment: 'Solid stock of MagSafe cases and screen protectors on Main Street.',
      createdAt: daysAgoIso(4),
    },
    {
      id: 'rev-15',
      storeId: 'store-techpoint',
      userId: null,
      authorName: 'Tarek H.',
      rating: 4,
      comment: 'Chargers are authentic, slightly pricier than Riverside but very convenient.',
      createdAt: daysAgoIso(7),
    },

    // Atlas Rig & GPU -> 4 reviews: 2x5, 2x4 => 4.5
    {
      id: 'rev-16',
      storeId: 'store-atlas-rig',
      userId: null,
      authorName: 'Oussama C.',
      rating: 5,
      comment: 'Zero dead pixels on my 27" 165Hz LG UltraGear monitor—they checked it before boxing!',
      createdAt: hoursAgoIso(12),
    },
    {
      id: 'rev-17',
      storeId: 'store-atlas-rig',
      userId: null,
      authorName: 'Amine F.',
      rating: 5,
      comment: 'Keychron K2 mechanical keyboard + G Pro mouse combo is awesome.',
      createdAt: daysAgoIso(3),
    },
    {
      id: 'rev-18',
      storeId: 'store-atlas-rig',
      userId: null,
      authorName: 'Adel K.',
      rating: 4,
      comment: 'Great North Quarter PC workstation shop, fast pickup.',
      createdAt: daysAgoIso(6),
    },
    {
      id: 'rev-19',
      storeId: 'store-atlas-rig',
      userId: null,
      authorName: 'Bilel M.',
      rating: 4,
      comment: 'Good motherboard and GPU variety.',
      createdAt: daysAgoIso(9),
    },

    // Campus Tech Hub -> 3 reviews: 1x5, 2x4 => 4.3
    {
      id: 'rev-20',
      storeId: 'store-campus-hub',
      userId: null,
      authorName: 'Yasmine O.',
      rating: 5,
      comment: 'Upgraded my laptop with 1TB NVMe and DDR5 RAM between university lectures!',
      createdAt: daysAgoIso(1),
    },
    {
      id: 'rev-21',
      storeId: 'store-campus-hub',
      userId: null,
      authorName: 'Ayoub S.',
      rating: 4,
      comment: 'Handy USB-C hubs, cooling stands, and wireless mice right near campus.',
      createdAt: daysAgoIso(4),
    },
    {
      id: 'rev-22',
      storeId: 'store-campus-hub',
      userId: null,
      authorName: 'Hamza T.',
      rating: 4,
      comment: 'Fair student pricing on SSDs and CPU coolers.',
      createdAt: daysAgoIso(7),
    },

    // Souf Cyber Gear -> 3 reviews: 1x5, 1x4, 1x4 => 4.3
    {
      id: 'rev-23',
      storeId: 'store-souf-cyber',
      userId: null,
      authorName: 'Noureddine B.',
      rating: 5,
      comment: 'TP-Link AX3000 Wi-Fi 6 router doubled my fiber speeds across two floors.',
      createdAt: daysAgoIso(2),
    },
    {
      id: 'rev-24',
      storeId: 'store-souf-cyber',
      userId: null,
      authorName: 'Salma K.',
      rating: 4,
      comment: 'Braided 100W USB-C cables and UPS backups always ready.',
      createdAt: daysAgoIso(5),
    },
    {
      id: 'rev-25',
      storeId: 'store-souf-cyber',
      userId: null,
      authorName: 'Zaki M.',
      rating: 4,
      comment: 'Good late evening hours for picking up networking gear.',
      createdAt: daysAgoIso(8),
    },
  ];

  const stores: Store[] = [
    {
      id: 'store-silicon-oasis',
      ownerId: 'user-merchant-1',
      name: 'Silicon Oasis PC',
      slug: 'silicon-oasis-pc',
      description: 'Djelfa’s premier PC hardware & upgrade specialist in Centre-Ville—GPUs, AM5 CPUs, NVMe SSDs, DDR5 RAM, modular PSUs, and air cooling.',
      area: AREA_CENTRE,
      address: '14 Rue de la République, Centre-Ville, Djelfa',
      city: 'Djelfa',
      lat: 34.6731,
      lng: 3.2636,
      phone: '0662 45 11 09',
      whatsapp: '213662451109',
      categories: ['cat-pc-parts'],
      openingHours: '08:30 - 22:00',
      isOpen: true,
      rating: 4.9,
      reviewCount: 7,
      approvalStatus: 'approved',
      accentColor: '#9678CE',
      createdAt: now,
      updatedAt: now,
    },
    {
      id: 'store-mobilezone',
      ownerId: 'user-merchant-1',
      name: 'MobileZone Berbih',
      slug: 'mobilezone-berbih',
      description: 'Authorized smartphones, 65W GaN fast chargers, MagSafe armor cases, power banks, and ANC earbuds on Boulevard Si El Haouès.',
      area: AREA_BERBIH,
      address: '19 Boulevard Si El Haouès, Quartier Berbih, Djelfa',
      city: 'Djelfa',
      lat: 34.6637,
      lng: 3.2662,
      phone: '0770 61 23 89',
      whatsapp: '213770612389',
      categories: ['cat-phones'],
      openingHours: '09:30 - 22:00',
      isOpen: true,
      rating: 4.8,
      reviewCount: 4,
      approvalStatus: 'approved',
      accentColor: '#4A3894',
      createdAt: now,
      updatedAt: now,
    },
    {
      id: 'store-techpoint',
      ownerId: 'user-merchant-2',
      name: 'TechPoint Phones',
      slug: 'techpoint-phones',
      description: 'Flagship Apple & Samsung smartphones, certified USB-C PD chargers, MagSafe protection, and wireless audio gear on Boulevard de l’ALN.',
      area: AREA_ALN,
      address: "42 Boulevard de l'ALN, Djelfa",
      city: 'Djelfa',
      lat: 34.6758,
      lng: 3.2589,
      phone: '0550 77 32 14',
      whatsapp: '213550773214',
      categories: ['cat-phones', 'cat-peripherals'],
      openingHours: '09:00 - 21:30',
      isOpen: true,
      rating: 4.5,
      reviewCount: 4,
      approvalStatus: 'approved',
      accentColor: '#9678CE',
      createdAt: now,
      updatedAt: now,
    },
    {
      id: 'store-atlas-rig',
      ownerId: 'user-merchant-2',
      name: 'Atlas Rig & GPU',
      slug: 'atlas-rig-gpu',
      description: 'Custom gaming & workstation PC builder in Cité Ain Chih—graphics cards, QHD 165Hz monitors, mechanical keyboards, and pro mice.',
      area: AREA_AIN_CHIH,
      address: '8 Route Nationale 1, Cité Ain Chih, Djelfa',
      city: 'Djelfa',
      lat: 34.6821,
      lng: 3.2512,
      phone: '0665 18 90 42',
      whatsapp: '213665189042',
      categories: ['cat-pc-parts', 'cat-peripherals'],
      openingHours: '09:00 - 21:30',
      isOpen: true,
      rating: 4.5,
      reviewCount: 4,
      approvalStatus: 'approved',
      accentColor: '#4A3894',
      createdAt: now,
      updatedAt: now,
    },
    {
      id: 'store-souf-cyber',
      ownerId: 'user-merchant-2',
      name: 'Djelfa Cyber Gear',
      slug: 'djelfa-cyber-gear',
      description: 'Networking, Wi-Fi 6 routers, UPS battery backups, 45W PD power banks, and mechanical peripherals on Boulevard de l’ALN.',
      area: AREA_ALN,
      address: "105 Boulevard de l'ALN, Djelfa",
      city: 'Djelfa',
      lat: 34.6764,
      lng: 3.2594,
      phone: '0552 90 14 77',
      whatsapp: '213552901477',
      categories: ['cat-peripherals', 'cat-phones'],
      openingHours: '09:00 - 23:00',
      isOpen: true,
      rating: 4.3,
      reviewCount: 3,
      approvalStatus: 'approved',
      accentColor: '#9678CE',
      createdAt: now,
      updatedAt: now,
    },
    {
      id: 'store-campus-hub',
      ownerId: 'user-merchant-1',
      name: 'Campus Tech Hub',
      slug: 'campus-tech-hub',
      description: 'Cité 05 Juillet PC & laptop upgrade shop carrying NVMe SSDs, DDR5 RAM, wireless mice, USB-C hubs, and CPU coolers.',
      area: AREA_05_JUILLET,
      address: '3 Rue Emir Abdelkader, Cité 05 Juillet, Djelfa',
      city: 'Djelfa',
      lat: 34.6692,
      lng: 3.2715,
      phone: '0664 33 78 01',
      whatsapp: '213664337801',
      categories: ['cat-pc-parts', 'cat-peripherals'],
      openingHours: '08:30 - 20:00',
      isOpen: true,
      rating: 4.3,
      reviewCount: 3,
      approvalStatus: 'approved',
      accentColor: '#4A3894',
      createdAt: now,
      updatedAt: now,
    },
    {
      id: 'store-sahara-pending',
      ownerId: 'user-merchant-2',
      name: 'Sahara Micro & Phone Repair',
      slug: 'sahara-micro-repair',
      description: 'OLED phone displays, replacement batteries, precision screwdriver kits, and thermal pads awaiting admin approval.',
      area: AREA_05_JUILLET,
      address: '21 Rue Emir Abdelkader, Cité 05 Juillet, Djelfa',
      city: 'Djelfa',
      lat: 34.6685,
      lng: 3.2704,
      phone: '0661 88 44 12',
      whatsapp: '213661884412',
      categories: ['cat-phones'],
      openingHours: '09:00 - 19:30',
      isOpen: true,
      rating: 0,
      reviewCount: 0,
      approvalStatus: 'pending',
      accentColor: '#9678CE',
      createdAt: now,
      updatedAt: now,
    },
  ];

  // Ensure every store rating & reviewCount strictly matches storeReviews
  for (const st of stores) {
    recomputeStoreRating(st, storeReviews);
  }

  const products = [
    {
      id: 'prod-nvme-1tb',
      name: '1TB NVMe M.2 SSD',
      slug: '1tb-nvme-ssd',
      brand: 'Samsung 990 EVO',
      description: 'PCIe 4.0/5.0 M.2 NVMe internal solid state drive up to 5,000 MB/s for gaming PCs and laptops.',
      categoryId: 'cat-storage',
      imageKey: 'ssd',
      popularity: 99,
      soldCount: 284,
      createdAt: now,
    },
    {
      id: 'prod-gan-charger',
      name: '65W GaN USB-C Charger',
      slug: '65w-gan-charger',
      brand: 'Anker Nano II',
      description: 'Compact 3-port 65W GaN fast charger with PPS for laptops, tablets, iPhones, and Android phones.',
      categoryId: 'cat-power',
      imageKey: 'charger',
      popularity: 95,
      soldCount: 215,
      createdAt: now,
    },
    {
      id: 'prod-magsafe-case',
      name: 'MagSafe Armor Case + Glass',
      slug: 'magsafe-armor-case',
      brand: 'Spigen Ultra',
      description: 'Shock-absorbing magnetic phone case bundled with 9H tempered glass screen protector.',
      categoryId: 'cat-accessories',
      imageKey: 'case',
      popularity: 88,
      soldCount: 192,
      createdAt: now,
    },
    {
      id: 'prod-powerbank',
      name: '20,000mAh 45W Power Bank',
      slug: '20000mah-45w-powerbank',
      brand: 'Baseus Blade PD',
      description: 'High-capacity dual USB-C PD 45W portable battery for smartphones and ultrabooks.',
      categoryId: 'cat-power',
      imageKey: 'powerbank',
      popularity: 89,
      soldCount: 165,
      createdAt: now,
    },
    {
      id: 'prod-earbuds',
      name: 'ANC Wireless Earbuds',
      slug: 'anc-wireless-earbuds',
      brand: 'SoundCore Liberty',
      description: 'Bluetooth 5.3 active noise cancelling earbuds with multipoint PC + phone pairing and 32h battery.',
      categoryId: 'cat-peripherals',
      imageKey: 'earbuds',
      popularity: 91,
      soldCount: 147,
      createdAt: now,
    },
    {
      id: 'prod-galaxy-a55',
      name: 'Galaxy A55 5G 256GB',
      slug: 'galaxy-a55-5g',
      brand: 'Samsung',
      description: '6.6" 120Hz Super AMOLED smartphone, 8GB RAM, 256GB storage, 50MP OIS camera.',
      categoryId: 'cat-phones',
      imageKey: 'phone-android',
      popularity: 94,
      soldCount: 138,
      createdAt: now,
    },
    {
      id: 'prod-mouse',
      name: 'Wireless Pro Gaming Mouse',
      slug: 'wireless-pro-mouse',
      brand: 'Logitech G Pro',
      description: '63g ultra-lightweight HERO 25K optical wireless mouse with USB-C receiver for PC setups.',
      categoryId: 'cat-peripherals',
      imageKey: 'mouse',
      popularity: 86,
      soldCount: 112,
      createdAt: now,
    },
    {
      id: 'prod-ddr5-32',
      name: '32GB DDR5 6000MHz RAM',
      slug: '32gb-ddr5-ram',
      brand: 'Corsair Vengeance',
      description: '2x16GB CL30 dual-channel desktop memory kit tuned for Intel & AMD Ryzen rigs.',
      categoryId: 'cat-storage',
      imageKey: 'ram',
      popularity: 90,
      soldCount: 96,
      createdAt: now,
    },
    {
      id: 'prod-mech-kbd',
      name: '75% Mechanical Keyboard',
      slug: '75-mechanical-keyboard',
      brand: 'Keychron K2 Pro',
      description: 'Hot-swappable wireless/wired QMK/VIA mechanical keyboard with PBT keycaps.',
      categoryId: 'cat-peripherals',
      imageKey: 'keyboard',
      popularity: 87,
      soldCount: 83,
      createdAt: now,
    },
    {
      id: 'prod-cooler',
      name: 'Dual-Tower CPU Cooler + Paste',
      slug: 'dual-tower-cpu-cooler',
      brand: 'Thermalright PA120',
      description: '6-heatpipe dual 120mm PWM tower cooler bundled with high-conductivity thermal paste.',
      categoryId: 'cat-accessories',
      imageKey: 'cooler',
      popularity: 82,
      soldCount: 74,
      createdAt: now,
    },
    {
      id: 'prod-iphone15',
      name: 'iPhone 15 128GB',
      slug: 'iphone-15-128gb',
      brand: 'Apple',
      description: '6.1" Super Retina XDR OLED, A16 Bionic chip, USB-C, 48MP main camera, factory unlocked.',
      categoryId: 'cat-phones',
      imageKey: 'phone',
      popularity: 96,
      soldCount: 64,
      createdAt: now,
    },
    {
      id: 'prod-router-wifi6',
      name: 'AX3000 Wi-Fi 6 Router + Cat6',
      slug: 'ax3000-wifi6-router',
      brand: 'TP-Link Archer',
      description: 'Dual-band gigabit Wi-Fi 6 router with 4 high-gain antennas and 5m shielded Cat6 patch cable.',
      categoryId: 'cat-accessories',
      imageKey: 'router',
      popularity: 78,
      soldCount: 61,
      createdAt: now,
    },
    {
      id: 'prod-ryzen5',
      name: 'Ryzen 5 7600X AM5 CPU',
      slug: 'ryzen-5-7600x',
      brand: 'AMD',
      description: '6-core 12-thread Zen 4 desktop processor up to 5.3GHz boost for gaming and creator builds.',
      categoryId: 'cat-pc-parts',
      imageKey: 'cpu',
      popularity: 89,
      soldCount: 58,
      createdAt: now,
    },
    {
      id: 'prod-psu-750',
      name: '750W 80+ Gold Modular PSU',
      slug: '750w-gold-psu',
      brand: 'Seasonic Focus',
      description: 'ATX 3.0 fully modular 750W PC power supply with native 12VHPWR GPU cable.',
      categoryId: 'cat-pc-parts',
      imageKey: 'psu',
      popularity: 80,
      soldCount: 51,
      createdAt: now,
    },
    {
      id: 'prod-rtx4060',
      name: 'GeForce RTX 4060 8GB GPU',
      slug: 'rtx-4060-8gb',
      brand: 'MSI Ventus 2X',
      description: 'Dual-fan NVIDIA Ada Lovelace graphics card with DLSS 3 and ray tracing for 1080p/1440p.',
      categoryId: 'cat-pc-parts',
      imageKey: 'gpu',
      popularity: 93,
      soldCount: 42,
      createdAt: now,
    },
    {
      id: 'prod-monitor',
      name: '27" QHD 165Hz IPS Monitor',
      slug: '27-qhd-165hz-monitor',
      brand: 'LG UltraGear',
      description: '2560x1440 Nano IPS 1ms gaming & productivity display with DisplayPort + HDMI 2.1.',
      categoryId: 'cat-peripherals',
      imageKey: 'monitor',
      popularity: 85,
      soldCount: 39,
      createdAt: now,
    },
  ];

  const storeProducts = [
    // 1. Silicon Oasis PC (Highest Rated Store - lowest prices on core PC components & SSD)
    { id: 'sp-so-nvme', storeId: 'store-silicon-oasis', productId: 'prod-nvme-1tb', price: 11500, currency: 'DZD', stockQuantity: 28, availabilityStatus: 'in_stock' as const, availabilityUpdatedAt: minutesAgoIso(6), isActive: true, createdAt: now, updatedAt: now },
    { id: 'sp-so-rtx', storeId: 'store-silicon-oasis', productId: 'prod-rtx4060', price: 54500, currency: 'DZD', stockQuantity: 5, availabilityStatus: 'in_stock' as const, availabilityUpdatedAt: minutesAgoIso(12), isActive: true, createdAt: now, updatedAt: now },
    { id: 'sp-so-ryzen', storeId: 'store-silicon-oasis', productId: 'prod-ryzen5', price: 34000, currency: 'DZD', stockQuantity: 7, availabilityStatus: 'in_stock' as const, availabilityUpdatedAt: minutesAgoIso(15), isActive: true, createdAt: now, updatedAt: now },
    { id: 'sp-so-ddr5', storeId: 'store-silicon-oasis', productId: 'prod-ddr5-32', price: 16800, currency: 'DZD', stockQuantity: 11, availabilityStatus: 'in_stock' as const, availabilityUpdatedAt: minutesAgoIso(19), isActive: true, createdAt: now, updatedAt: now },
    { id: 'sp-so-psu', storeId: 'store-silicon-oasis', productId: 'prod-psu-750', price: 15500, currency: 'DZD', stockQuantity: 6, availabilityStatus: 'in_stock' as const, availabilityUpdatedAt: minutesAgoIso(25), isActive: true, createdAt: now, updatedAt: now },
    { id: 'sp-so-cooler', storeId: 'store-silicon-oasis', productId: 'prod-cooler', price: 6400, currency: 'DZD', stockQuantity: 14, availabilityStatus: 'in_stock' as const, availabilityUpdatedAt: minutesAgoIso(22), isActive: true, createdAt: now, updatedAt: now },

    // 2. MobileZone Riverside
    { id: 'sp-mz-charger', storeId: 'store-mobilezone', productId: 'prod-gan-charger', price: 3200, currency: 'DZD', stockQuantity: 19, availabilityStatus: 'in_stock' as const, availabilityUpdatedAt: minutesAgoIso(9), isActive: true, createdAt: now, updatedAt: now },
    { id: 'sp-mz-iphone', storeId: 'store-mobilezone', productId: 'prod-iphone15', price: 139500, currency: 'DZD', stockQuantity: 4, availabilityStatus: 'in_stock' as const, availabilityUpdatedAt: minutesAgoIso(14), isActive: true, createdAt: now, updatedAt: now },
    { id: 'sp-mz-a55', storeId: 'store-mobilezone', productId: 'prod-galaxy-a55', price: 62000, currency: 'DZD', stockQuantity: 8, availabilityStatus: 'in_stock' as const, availabilityUpdatedAt: minutesAgoIso(11), isActive: true, createdAt: now, updatedAt: now },
    { id: 'sp-mz-case', storeId: 'store-mobilezone', productId: 'prod-magsafe-case', price: 1400, currency: 'DZD', stockQuantity: 32, availabilityStatus: 'in_stock' as const, availabilityUpdatedAt: minutesAgoIso(17), isActive: true, createdAt: now, updatedAt: now },
    { id: 'sp-mz-pb', storeId: 'store-mobilezone', productId: 'prod-powerbank', price: 4900, currency: 'DZD', stockQuantity: 13, availabilityStatus: 'in_stock' as const, availabilityUpdatedAt: minutesAgoIso(20), isActive: true, createdAt: now, updatedAt: now },
    { id: 'sp-mz-earbuds', storeId: 'store-mobilezone', productId: 'prod-earbuds', price: 6200, currency: 'DZD', stockQuantity: 0, availabilityStatus: 'out_of_stock' as const, availabilityUpdatedAt: hoursAgoIso(2), isActive: true, createdAt: now, updatedAt: now },

    // 3. TechPoint Phones
    { id: 'sp-tp-earbuds', storeId: 'store-techpoint', productId: 'prod-earbuds', price: 5800, currency: 'DZD', stockQuantity: 10, availabilityStatus: 'in_stock' as const, availabilityUpdatedAt: minutesAgoIso(16), isActive: true, createdAt: now, updatedAt: now },
    { id: 'sp-tp-charger', storeId: 'store-techpoint', productId: 'prod-gan-charger', price: 3500, currency: 'DZD', stockQuantity: 12, availabilityStatus: 'in_stock' as const, availabilityUpdatedAt: minutesAgoIso(18), isActive: true, createdAt: now, updatedAt: now },
    { id: 'sp-tp-iphone', storeId: 'store-techpoint', productId: 'prod-iphone15', price: 142000, currency: 'DZD', stockQuantity: 3, availabilityStatus: 'in_stock' as const, availabilityUpdatedAt: minutesAgoIso(24), isActive: true, createdAt: now, updatedAt: now },
    { id: 'sp-tp-a55', storeId: 'store-techpoint', productId: 'prod-galaxy-a55', price: 63500, currency: 'DZD', stockQuantity: 6, availabilityStatus: 'in_stock' as const, availabilityUpdatedAt: minutesAgoIso(28), isActive: true, createdAt: now, updatedAt: now },
    { id: 'sp-tp-case', storeId: 'store-techpoint', productId: 'prod-magsafe-case', price: 1600, currency: 'DZD', stockQuantity: 21, availabilityStatus: 'in_stock' as const, availabilityUpdatedAt: minutesAgoIso(21), isActive: true, createdAt: now, updatedAt: now },

    // 4. Atlas Rig & GPU
    { id: 'sp-ar-rtx', storeId: 'store-atlas-rig', productId: 'prod-rtx4060', price: 56000, currency: 'DZD', stockQuantity: 4, availabilityStatus: 'in_stock' as const, availabilityUpdatedAt: minutesAgoIso(26), isActive: true, createdAt: now, updatedAt: now },
    { id: 'sp-ar-ryzen', storeId: 'store-atlas-rig', productId: 'prod-ryzen5', price: 35200, currency: 'DZD', stockQuantity: 5, availabilityStatus: 'in_stock' as const, availabilityUpdatedAt: minutesAgoIso(30), isActive: true, createdAt: now, updatedAt: now },
    { id: 'sp-ar-nvme', storeId: 'store-atlas-rig', productId: 'prod-nvme-1tb', price: 12200, currency: 'DZD', stockQuantity: 14, availabilityStatus: 'in_stock' as const, availabilityUpdatedAt: minutesAgoIso(23), isActive: true, createdAt: now, updatedAt: now },
    { id: 'sp-ar-monitor', storeId: 'store-atlas-rig', productId: 'prod-monitor', price: 38500, currency: 'DZD', stockQuantity: 4, availabilityStatus: 'in_stock' as const, availabilityUpdatedAt: minutesAgoIso(32), isActive: true, createdAt: now, updatedAt: now },
    { id: 'sp-ar-kbd', storeId: 'store-atlas-rig', productId: 'prod-mech-kbd', price: 12500, currency: 'DZD', stockQuantity: 9, availabilityStatus: 'in_stock' as const, availabilityUpdatedAt: minutesAgoIso(19), isActive: true, createdAt: now, updatedAt: now },
    { id: 'sp-ar-mouse', storeId: 'store-atlas-rig', productId: 'prod-mouse', price: 9800, currency: 'DZD', stockQuantity: 11, availabilityStatus: 'in_stock' as const, availabilityUpdatedAt: minutesAgoIso(27), isActive: true, createdAt: now, updatedAt: now },

    // 5. Souf Cyber Gear
    { id: 'sp-sc-router', storeId: 'store-souf-cyber', productId: 'prod-router-wifi6', price: 9200, currency: 'DZD', stockQuantity: 8, availabilityStatus: 'in_stock' as const, availabilityUpdatedAt: minutesAgoIso(35), isActive: true, createdAt: now, updatedAt: now },
    { id: 'sp-sc-charger', storeId: 'store-souf-cyber', productId: 'prod-gan-charger', price: 3400, currency: 'DZD', stockQuantity: 15, availabilityStatus: 'in_stock' as const, availabilityUpdatedAt: minutesAgoIso(40), isActive: true, createdAt: now, updatedAt: now },
    { id: 'sp-sc-pb', storeId: 'store-souf-cyber', productId: 'prod-powerbank', price: 5200, currency: 'DZD', stockQuantity: 7, availabilityStatus: 'in_stock' as const, availabilityUpdatedAt: minutesAgoIso(44), isActive: true, createdAt: now, updatedAt: now },
    { id: 'sp-sc-kbd', storeId: 'store-souf-cyber', productId: 'prod-mech-kbd', price: 13200, currency: 'DZD', stockQuantity: 3, availabilityStatus: 'in_stock' as const, availabilityUpdatedAt: hoursAgoIso(2), isActive: true, createdAt: now, updatedAt: now },

    // 6. Campus Tech Hub
    { id: 'sp-ch-nvme', storeId: 'store-campus-hub', productId: 'prod-nvme-1tb', price: 11900, currency: 'DZD', stockQuantity: 10, availabilityStatus: 'in_stock' as const, availabilityUpdatedAt: minutesAgoIso(29), isActive: true, createdAt: now, updatedAt: now },
    { id: 'sp-ch-ddr5', storeId: 'store-campus-hub', productId: 'prod-ddr5-32', price: 17400, currency: 'DZD', stockQuantity: 6, availabilityStatus: 'in_stock' as const, availabilityUpdatedAt: minutesAgoIso(33), isActive: true, createdAt: now, updatedAt: now },
    { id: 'sp-ch-mouse', storeId: 'store-campus-hub', productId: 'prod-mouse', price: 10200, currency: 'DZD', stockQuantity: 8, availabilityStatus: 'in_stock' as const, availabilityUpdatedAt: minutesAgoIso(41), isActive: true, createdAt: now, updatedAt: now },
    { id: 'sp-ch-cooler', storeId: 'store-campus-hub', productId: 'prod-cooler', price: 6800, currency: 'DZD', stockQuantity: null, availabilityStatus: 'unconfirmed' as const, availabilityUpdatedAt: hoursAgoIso(30), isActive: true, createdAt: now, updatedAt: now },
  ];

  const drivers = [
    {
      id: 'driver-karim',
      userId: 'user-driver-1',
      name: 'Karim Ziane',
      phone: '0771 39 44 21',
      vehicleType: 'motorcycle' as const,
      serviceArea: AREA_ALN,
      deliveryFee: 200,
      rating: 4.8,
      isOnline: true,
      approvalStatus: 'approved' as const,
      completedDeliveries: 42,
      totalEarnings: 8400,
      createdAt: now,
    },
    {
      id: 'driver-lina',
      userId: 'user-driver-2',
      name: 'Lina Haddad',
      phone: '0668 92 10 55',
      vehicleType: 'car' as const,
      serviceArea: AREA_AIN_CHIH,
      deliveryFee: 300,
      rating: 4.9,
      isOnline: true,
      approvalStatus: 'approved' as const,
      completedDeliveries: 31,
      totalEarnings: 9300,
      createdAt: now,
    },
    {
      id: 'driver-alex',
      userId: 'user-driver-3',
      name: 'Alex B.',
      phone: '0559 18 40 33',
      vehicleType: 'motorcycle' as const,
      serviceArea: AREA_CENTRE,
      deliveryFee: 200,
      rating: 4.7,
      isOnline: true,
      approvalStatus: 'approved' as const,
      completedDeliveries: 19,
      totalEarnings: 3800,
      createdAt: now,
    },
  ];

  const sampleOrderId1 = 'order-seed-1041';
  const sampleOrderId2 = 'order-seed-1042';

  const orders = [
    {
      id: sampleOrderId1,
      orderNumber: 'MK-1041',
      customerId: 'user-customer-1',
      storeId: 'store-silicon-oasis',
      storeName: 'Silicon Oasis PC',
      storeAddress: '14 Rue de la République, Centre-Ville, Djelfa',
      storeArea: AREA_CENTRE,
      storePhone: '0662 45 11 09',
      driverId: null,
      driverName: null,
      driverVehicle: null,
      fulfillmentType: 'delivery' as const,
      paymentMethod: 'cash_on_delivery' as const,
      paymentStatus: 'pending' as const,
      orderStatus: 'looking' as const,
      subtotal: 17900,
      deliveryFee: 200,
      total: 18100,
      customerName: 'Amina Benali',
      customerPhone: '0661 24 88 10',
      deliveryAddress: "28 Boulevard de l'ALN, Djelfa",
      confirmationCodeHash: hashConfirmationCode('4829', sampleOrderId1),
      customerConfirmationCode: '4829',
      items: [
        {
          id: 'oi-1',
          storeProductId: 'sp-so-nvme',
          productId: 'prod-nvme-1tb',
          productNameSnapshot: '1TB NVMe M.2 SSD',
          unitPriceSnapshot: 11500,
          quantity: 1,
          subtotal: 11500,
        },
        {
          id: 'oi-2',
          storeProductId: 'sp-so-cooler',
          productId: 'prod-cooler',
          productNameSnapshot: 'Dual-Tower CPU Cooler + Paste',
          unitPriceSnapshot: 6400,
          quantity: 1,
          subtotal: 6400,
        },
      ],
      createdAt: minutesAgoIso(25),
      updatedAt: minutesAgoIso(12),
    },
    {
      id: sampleOrderId2,
      orderNumber: 'MK-1042',
      customerId: 'user-customer-1',
      storeId: 'store-mobilezone',
      storeName: 'MobileZone Berbih',
      storeAddress: '19 Boulevard Si El Haouès, Quartier Berbih, Djelfa',
      storeArea: AREA_BERBIH,
      storePhone: '0770 61 23 89',
      driverId: null,
      driverName: null,
      driverVehicle: null,
      fulfillmentType: 'pickup' as const,
      paymentMethod: 'cash_at_shop' as const,
      paymentStatus: 'pending' as const,
      orderStatus: 'new' as const,
      subtotal: 3200,
      deliveryFee: 0,
      total: 3200,
      customerName: 'Amina Benali',
      customerPhone: '0661 24 88 10',
      deliveryAddress: 'Pickup at shop',
      confirmationCodeHash: hashConfirmationCode('7315', sampleOrderId2),
      customerConfirmationCode: '7315',
      items: [
        {
          id: 'oi-3',
          storeProductId: 'sp-mz-charger',
          productId: 'prod-gan-charger',
          productNameSnapshot: '65W GaN USB-C Charger',
          unitPriceSnapshot: 3200,
          quantity: 1,
          subtotal: 3200,
        },
      ],
      createdAt: minutesAgoIso(8),
      updatedAt: minutesAgoIso(8),
    },
  ];

  const inquiries = [
    {
      id: 'inq-1',
      customerId: 'user-customer-1',
      customerName: 'Amina Benali',
      customerPhone: '0661 24 88 10',
      storeId: 'store-mobilezone',
      storeProductId: 'sp-mz-earbuds',
      productName: 'ANC Wireless Earbuds',
      message: 'When will the SoundCore ANC earbuds restock at Quartier Berbih?',
      reply: null,
      status: 'open' as const,
      createdAt: minutesAgoIso(45),
    },
  ];

  const reports = [
    {
      id: 'rep-1',
      reporterId: 'user-customer-1',
      targetType: 'product' as const,
      targetId: 'sp-ch-cooler',
      targetName: 'Dual-Tower CPU Cooler + Paste at Campus Tech Hub',
      reason: 'Availability timestamp has not been updated in over 24 hours.',
      status: 'open' as const,
      createdAt: hoursAgoIso(1),
    },
  ];

  const auditLogs = [
    {
      id: 'log-1',
      actorId: 'user-admin-1',
      actorName: 'Nadia Khelifi',
      action: 'APPROVE_STORE',
      targetType: 'store',
      targetId: 'store-silicon-oasis',
      details: 'Approved Silicon Oasis PC (Centre-Ville, Djelfa) for public Marketly marketplace listing.',
      createdAt: hoursAgoIso(5),
    },
  ];

  const favorites = [
    { id: 'fav-1', userId: 'user-customer-1', type: 'store' as const, targetId: 'store-silicon-oasis', createdAt: now },
    { id: 'fav-2', userId: 'user-customer-1', type: 'product' as const, targetId: 'prod-nvme-1tb', createdAt: now },
  ];

  const result: ShopfrontDatabase = {
    users,
    categories,
    stores,
    products,
    storeProducts,
    drivers,
    orders,
    inquiries,
    reports,
    auditLogs,
    favorites,
    storeReviews,
    supportTickets: [],
  };
  // Force backfill to seed initial support tickets too
  (result as { supportTickets?: unknown }).supportTickets = undefined;
  backfillMarketplaceEnhancements(result);
  return result;
}

let cachedDb: ShopfrontDatabase | null = null;

export function getDb(): ShopfrontDatabase {
  if (cachedDb) return cachedDb;
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  if (fs.existsSync(DB_PATH)) {
    try {
      const raw = fs.readFileSync(DB_PATH, 'utf-8');
      const parsed = JSON.parse(raw) as ShopfrontDatabase;
      // Upgrade legacy food/grocery databases to PC Parts & Phones catalog + store reviews
      const hasLegacyCategories = parsed.categories?.some((c) =>
        ['cat-grocery', 'cat-bakery', 'cat-fashion'].includes(c.id)
      );
      if (!hasLegacyCategories && Array.isArray(parsed.storeReviews)) {
        const updated = backfillMarketplaceEnhancements(parsed);
        cachedDb = parsed;
        if (updated) {
          saveDb(cachedDb);
        }
        return cachedDb;
      }
    } catch {
      // Fallback to fresh seed if corrupted
    }
  }
  cachedDb = createSeedDatabase();
  saveDb(cachedDb);
  return cachedDb;
}

export function saveDb(db: ShopfrontDatabase): void {
  cachedDb = db;
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 2), 'utf-8');
}
