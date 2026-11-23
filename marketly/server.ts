import crypto from 'crypto';
import dotenv from 'dotenv';
import express, { type NextFunction, type Request, type Response } from 'express';
import fs from 'fs';
import http from 'http';
import path from 'path';
import { createServer as createViteServer } from 'vite';
import { z } from 'zod';
import {
  EL_OUED_AREAS,
  getDb,
  hashConfirmationCode,
  hashPassword,
  haversineKm,
  recomputeStoreRating,
  saveDb,
  verifyPassword,
} from './server/db.ts';
import { buildEditableProjectZip } from './server/zip.ts';
import type {
  ApprovalStatus,
  AvailabilityStatus,
  EnrichedListing,
  OrderStatus,
  PriceHistoryPoint,
  PublicUser,
  SupportTicket,
  UserAccount,
  UserRole,
} from './shared/types.ts';
import { normalizeCategoryId } from './shared/taxonomy.ts';
import { DJELFA_AREAS, normalizeDjelfaArea } from './shared/locationConfig.ts';

dotenv.config();

const PORT = Number(process.env.PORT || 3000);
const SESSION_SECRET =
  process.env.SESSION_SECRET && process.env.SESSION_SECRET !== 'CHANGE_ME_IN_PRODUCTION'
    ? process.env.SESSION_SECRET
    : crypto.createHash('sha256').update('marketly-local-session-key-v1').digest('hex');

const STALE_THRESHOLD_MS = 24 * 60 * 60 * 1000;
const UPLOAD_DIR = path.resolve(process.cwd(), 'data', 'uploads');

const FIREBASE_CONFIG = (() => {
  try {
    const raw = fs.readFileSync(path.resolve(process.cwd(), 'firebase-applet-config.json'), 'utf-8');
    return JSON.parse(raw) as { projectId?: string; apiKey?: string };
  } catch {
    return {};
  }
})();

async function verifyFirebaseGoogleIdToken(idToken: string): Promise<{
  uid: string;
  email: string;
  displayName: string;
  emailVerified: boolean;
}> {
  if (!FIREBASE_CONFIG.apiKey || !FIREBASE_CONFIG.projectId) {
    throw new Error('Firebase configuration is missing on the server.');
  }

  // Validate JWT structure and audience/issuer before remote verification
  const segments = idToken.split('.');
  if (segments.length !== 3) {
    throw new Error('Invalid Google ID token.');
  }
  const claims = JSON.parse(Buffer.from(segments[1], 'base64url').toString('utf-8')) as {
    aud?: string;
    iss?: string;
    exp?: number;
  };
  if (
    claims.aud !== FIREBASE_CONFIG.projectId ||
    claims.iss !== `https://securetoken.google.com/${FIREBASE_CONFIG.projectId}`
  ) {
    throw new Error('Token project mismatch.');
  }
  if (!claims.exp || claims.exp * 1000 < Date.now()) {
    throw new Error('Google sign-in session expired. Please try again.');
  }

  const verifyRes = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${encodeURIComponent(FIREBASE_CONFIG.apiKey)}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ idToken }),
    }
  );
  if (!verifyRes.ok) {
    throw new Error('Could not verify your Google account token.');
  }
  const data = (await verifyRes.json()) as {
    users?: Array<{
      localId?: string;
      email?: string;
      displayName?: string;
      emailVerified?: boolean;
      disabled?: boolean;
    }>;
  };
  const fbUser = data.users?.[0];
  if (!fbUser || fbUser.disabled || !fbUser.localId || !fbUser.email) {
    throw new Error('Google account could not be verified.');
  }
  return {
    uid: fbUser.localId,
    email: fbUser.email.toLowerCase(),
    displayName: fbUser.displayName?.trim() || fbUser.email.split('@')[0] || 'Marketly User',
    emailVerified: Boolean(fbUser.emailVerified),
  };
}

function sanitizeImageUrl(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  if (/^\/uploads\/[a-zA-Z0-9._-]+$/.test(trimmed)) {
    return trimmed;
  }
  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol === 'https:') {
      return parsed.toString();
    }
  } catch {
    return null;
  }
  return null;
}

function sanitizeExternalUrl(
  raw: string | null | undefined,
  kind: 'facebook' | 'instagram' | 'maps'
): string | null {
  if (!raw) return null;
  let trimmed = raw.trim();
  if (!trimmed) return null;

  if (kind === 'maps' && /^-?\d+(\.\d+)?\s*,\s*-?\d+(\.\d+)?$/.test(trimmed)) {
    const coords = trimmed.replace(/\s+/g, '');
    return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(coords)}`;
  }

  if (!/^https?:\/\//i.test(trimmed)) {
    const cleanHandle = trimmed.replace(/^[@/]+/, '');
    if (!cleanHandle) return null;
    if (kind === 'facebook') {
      trimmed = cleanHandle.includes('facebook.com') || cleanHandle.includes('fb.com')
        ? `https://${cleanHandle}`
        : `https://facebook.com/${cleanHandle}`;
    } else if (kind === 'instagram') {
      trimmed = cleanHandle.includes('instagram.com')
        ? `https://${cleanHandle}`
        : `https://instagram.com/${cleanHandle}`;
    } else {
      trimmed = `https://${cleanHandle}`;
    }
  }

  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol === 'https:') {
      return parsed.toString().slice(0, kind === 'maps' ? 500 : 300);
    }
    if (parsed.protocol === 'http:') {
      parsed.protocol = 'https:';
      return parsed.toString().slice(0, kind === 'maps' ? 500 : 300);
    }
  } catch {
    return null;
  }
  return null;
}

function appendPriceHistory(
  existing: PriceHistoryPoint[] | undefined,
  newPrice: number,
  recordedAt: string
): PriceHistoryPoint[] {
  const list = Array.isArray(existing) ? [...existing] : [];
  const last = list[list.length - 1];
  if (!last || last.price !== newPrice) {
    list.push({ price: newPrice, recordedAt });
  }
  return list.slice(-30);
}

interface AuthedRequest extends Request {
  user?: UserAccount;
}

function signToken(userId: string): string {
  const payload = Buffer.from(
    JSON.stringify({ uid: userId, iat: Date.now() }),
    'utf-8'
  ).toString('base64url');
  const sig = crypto.createHmac('sha256', SESSION_SECRET).update(payload).digest('base64url');
  return `${payload}.${sig}`;
}

function verifyToken(token: string): string | null {
  const parts = token.split('.');
  if (parts.length !== 2) return null;
  const [payload, sig] = parts;
  const expected = crypto.createHmac('sha256', SESSION_SECRET).update(payload).digest('base64url');
  if (sig.length !== expected.length) return null;
  if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
  try {
    const parsed = JSON.parse(Buffer.from(payload, 'base64url').toString('utf-8')) as { uid?: string };
    return parsed.uid || null;
  } catch {
    return null;
  }
}

function toPublicUser(u: UserAccount): PublicUser {
  return {
    id: u.id,
    fullName: u.fullName,
    email: u.email,
    phone: u.phone,
    roles: u.roles,
    ...(u.sellerType ? { sellerType: u.sellerType } : {}),
    isDemo: u.isDemo,
  };
}

function attachUser(req: AuthedRequest, _res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;
  let token: string | null = null;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    token = authHeader.slice(7).trim();
  }
  if (token) {
    const uid = verifyToken(token);
    if (uid) {
      const db = getDb();
      const user = db.users.find((u) => u.id === uid);
      if (user) {
        req.user = user;
      }
    }
  }
  next();
}

function requireAuth(req: AuthedRequest, res: Response, next: NextFunction): void {
  if (!req.user) {
    res.status(401).json({ error: 'Authentication required.' });
    return;
  }
  next();
}

function requireRole(role: UserRole) {
  return (req: AuthedRequest, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({ error: 'Authentication required.' });
      return;
    }
    if (!req.user.roles.includes(role)) {
      res.status(403).json({ error: `Role '${role}' is required for this action.` });
      return;
    }
    next();
  };
}

function requireAnyRole(...roles: UserRole[]) {
  return (req: AuthedRequest, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({ error: 'Authentication required.' });
      return;
    }
    if (!roles.some((r) => req.user!.roles.includes(r))) {
      res.status(403).json({ error: `One of roles [${roles.join(', ')}] is required for this action.` });
      return;
    }
    next();
  };
}

function computeEnrichedListings(originLat?: number | null, originLng?: number | null): EnrichedListing[] {
  const db = getDb();
  const approvedStores = new Map(
    db.stores.filter((s) => s.approvalStatus === 'approved').map((s) => [s.id, s])
  );
  const productsMap = new Map(db.products.map((p) => [p.id, p]));
  const categoriesMap = new Map(db.categories.map((c) => [c.id, c]));

  // Find lowest active in-stock price per product across approved stores
  const lowestPriceByProduct = new Map<string, number>();
  const offerCountByProduct = new Map<string, number>();

  for (const sp of db.storeProducts) {
    if (!sp.isActive || !approvedStores.has(sp.storeId)) continue;
    offerCountByProduct.set(sp.productId, (offerCountByProduct.get(sp.productId) || 0) + 1);
    if (sp.availabilityStatus === 'in_stock') {
      const current = lowestPriceByProduct.get(sp.productId);
      if (current === undefined || sp.price < current) {
        lowestPriceByProduct.set(sp.productId, sp.price);
      }
    }
  }

  const nowMs = Date.now();
  const results: EnrichedListing[] = [];

  for (const sp of db.storeProducts) {
    if (!sp.isActive) continue;
    const store = approvedStores.get(sp.storeId);
    const product = productsMap.get(sp.productId);
    if (!store || !product) continue;
    const cat = categoriesMap.get(product.categoryId);
    const updatedMs = new Date(sp.availabilityUpdatedAt).getTime();
    const isStale = Number.isNaN(updatedMs) ? true : nowMs - updatedMs > STALE_THRESHOLD_MS;
    const lowest = lowestPriceByProduct.get(product.id);
    const distanceKm =
      originLat != null && originLng != null ? haversineKm(originLat, originLng, store.lat, store.lng) : null;

    results.push({
      listingId: sp.id,
      productId: product.id,
      storeId: store.id,
      productName: product.name,
      productSlug: product.slug,
      brand: product.brand,
      description: product.description,
      categoryId: product.categoryId,
      categoryName: cat?.name || 'General',
      imageKey: product.imageKey,
      imageUrl: sp.imageUrl || product.imageUrl || null,
      popularity: product.popularity,
      soldCount: product.soldCount ?? 0,
      price: sp.price,
      priceHistory:
        Array.isArray(sp.priceHistory) && sp.priceHistory.length > 0
          ? sp.priceHistory
          : [{ price: sp.price, recordedAt: sp.updatedAt }],
      currency: sp.currency,
      stockQuantity: sp.stockQuantity,
      availabilityStatus: isStale && sp.availabilityStatus === 'in_stock' ? 'unconfirmed' : sp.availabilityStatus,
      availabilityUpdatedAt: sp.availabilityUpdatedAt,
      isStale,
      isActive: sp.isActive,
      isLowestPrice:
        sp.availabilityStatus === 'in_stock' &&
        lowest !== undefined &&
        sp.price === lowest &&
        (offerCountByProduct.get(product.id) || 0) > 1,
      storeOfferCount: offerCountByProduct.get(product.id) || 1,
      storeName: store.name,
      storeSlug: store.slug,
      storeType: store.storeType || 'physical_store',
      storeArea: store.area,
      storeAddress: store.address,
      storePhone: store.phone,
      storeWhatsapp: store.whatsapp,
      storeIsOpen: store.isOpen,
      storeRating: store.rating,
      storeDeliveryZones: store.deliveryZones || [store.area],
      storeDeliveryFee: store.deliveryFee ?? 200,
      storeDeliveryRadiusKm: store.deliveryRadiusKm ?? 10,
      distanceKm,
    });
  }

  return results;
}

function sanitizeOrderForViewer(order: ReturnType<typeof getDb>['orders'][number], viewerId?: string) {
  const { confirmationCodeHash: _hash, customerConfirmationCode, ...rest } = order;
  if (viewerId && order.customerId === viewerId) {
    return { ...rest, customerConfirmationCode };
  }
  return rest;
}

const ZOD_FIELD_LABELS: Record<string, string> = {
  fullName: 'Full name',
  email: 'Email address',
  phone: 'Phone / WhatsApp',
  whatsapp: 'WhatsApp number',
  password: 'Password',
  storeName: 'Store / Page name',
  name: 'Name',
  description: 'Description',
  area: 'Area',
  address: 'Street address',
  openingHours: 'Working hours',
  price: 'Price',
  brand: 'Brand',
  categoryId: 'Category',
  categories: 'Categories',
};

function formatZodError(error: z.ZodError, fallback = 'Invalid input.'): string {
  const issue = error.issues[0];
  if (!issue) return fallback;
  const fieldKey = issue.path[0] ? String(issue.path[0]) : '';
  const label = ZOD_FIELD_LABELS[fieldKey] || (fieldKey ? fieldKey : '');
  if (issue.message && !issue.message.startsWith('Too small:') && !issue.message.startsWith('Too big:') && !issue.message.startsWith('Invalid input')) {
    return label && !issue.message.toLowerCase().includes(label.toLowerCase())
      ? `${label}: ${issue.message}`
      : issue.message;
  }
  if (issue.code === 'too_small') {
    const min = 'minimum' in issue ? Number(issue.minimum) : undefined;
    if (fieldKey === 'phone' || fieldKey === 'whatsapp') {
      return `${label} must be at least ${min || 8} characters (e.g. 0661 24 88 10).`;
    }
    return `${label || 'Field'} must be at least ${min ?? 1} characters.`;
  }
  if (issue.code === 'too_big') {
    const max = 'maximum' in issue ? Number(issue.maximum) : undefined;
    return `${label || 'Field'} must be at most ${max ?? 100} characters.`;
  }
  return label ? `${label}: ${issue.message}` : issue.message || fallback;
}

const VALID_DELIVERY_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  new: ['accepted', 'rejected'],
  accepted: ['looking', 'rejected'],
  looking: ['onway'],
  onway: ['done'],
  ready: [],
  done: [],
  rejected: [],
};

const VALID_PICKUP_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  new: ['accepted', 'rejected'],
  accepted: ['ready', 'rejected'],
  ready: ['done'],
  looking: [],
  onway: [],
  done: [],
  rejected: [],
};

async function startServer() {
  const app = express();
  const httpServer = http.createServer(app);
  if (!fs.existsSync(UPLOAD_DIR)) {
    fs.mkdirSync(UPLOAD_DIR, { recursive: true });
  }
  app.use(express.json({ limit: '4mb' }));
  app.use(
    '/uploads',
    express.static(UPLOAD_DIR, {
      setHeaders: (res) => {
        res.setHeader('X-Content-Type-Options', 'nosniff');
      },
    })
  );
  app.use(attachUser);

  // ==========================================
  // AUTH & DEMO ROLE SWITCHER
  // ==========================================
  app.get('/api/auth/me', (req: AuthedRequest, res) => {
    if (!req.user) {
      res.json({ user: null });
      return;
    }
    res.json({ user: toPublicUser(req.user) });
  });

  app.post('/api/auth/register', (req, res) => {
    const schema = z.object({
      fullName: z
        .string()
        .trim()
        .min(2, 'Full name must be at least 2 characters.')
        .max(80, 'Full name must be at most 80 characters.'),
      email: z.string().trim().email('Please enter a valid email address.'),
      phone: z
        .string()
        .trim()
        .min(8, 'Phone / WhatsApp must be at least 8 digits (e.g. 0661 24 88 10).')
        .max(24, 'Phone / WhatsApp must be at most 24 characters.')
        .refine(
          (val) => val.replace(/\D/g, '').length >= 8,
          'Phone / WhatsApp must be a valid number with at least 8 digits (e.g. 0661 24 88 10).'
        ),
      password: z
        .string()
        .min(6, 'Password must be at least 6 characters.')
        .max(100, 'Password must be at most 100 characters.'),
      role: z.enum(['customer', 'merchant', 'driver']).optional().default('customer'),
      sellerType: z.enum(['physical_store', 'online_page']).optional(),
      storeName: z.string().trim().max(80).optional(),
      area: z.string().trim().max(60).optional(),
      address: z.string().trim().max(160).optional(),
      instagramUrl: z.string().trim().max(300).optional(),
      facebookUrl: z.string().trim().max(300).optional(),
      description: z.string().trim().max(400).optional(),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: formatZodError(parsed.error, 'Invalid registration data.') });
      return;
    }
    const db = getDb();
    const exists = db.users.find((u) => u.email.toLowerCase() === parsed.data.email.toLowerCase());
    if (exists) {
      res.status(409).json({ error: 'An account with this email already exists.' });
      return;
    }
    const roles: UserRole[] = parsed.data.role === 'customer' ? ['customer'] : ['customer', parsed.data.role];
    const resolvedSellerType =
      parsed.data.role === 'merchant' ? parsed.data.sellerType || 'physical_store' : undefined;
    const now = new Date().toISOString();
    const newUser: UserAccount = {
      id: `user-${crypto.randomUUID().slice(0, 8)}`,
      fullName: parsed.data.fullName,
      email: parsed.data.email.toLowerCase(),
      phone: parsed.data.phone,
      passwordHash: hashPassword(parsed.data.password),
      roles,
      ...(resolvedSellerType ? { sellerType: resolvedSellerType } : {}),
      isDemo: false,
      createdAt: now,
    };
    db.users.push(newUser);

    let createdStore = null;
    if (parsed.data.role === 'merchant') {
      const storeType = resolvedSellerType || 'physical_store';
      const storeName =
        parsed.data.storeName && parsed.data.storeName.trim().length >= 2
          ? parsed.data.storeName.trim()
          : storeType === 'online_page'
            ? `${parsed.data.fullName} Online`
            : `${parsed.data.fullName} Shop`;
      const { area: areaMeta } = normalizeDjelfaArea(parsed.data.area);
      const slugBase =
        storeName
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, '-')
          .replace(/(^-|-$)/g, '') || 'marketly-seller';
      const defaultAddress =
        storeType === 'online_page'
          ? `Online Storefront · ${areaMeta.name}, Djelfa`
          : parsed.data.address && parsed.data.address.trim().length >= 4
            ? parsed.data.address.trim()
            : `${areaMeta.name}, Djelfa`;
      const rawWa = parsed.data.phone.replace(/\D/g, '');
      const normalizedWa = rawWa.startsWith('0') ? `213${rawWa.slice(1)}` : rawWa || '213662451109';
      createdStore = {
        id: `store-${crypto.randomUUID().slice(0, 8)}`,
        ownerId: newUser.id,
        name: storeName,
        slug: `${slugBase}-${crypto.randomBytes(2).toString('hex')}`,
        storeType,
        description:
          parsed.data.description && parsed.data.description.trim().length >= 4
            ? parsed.data.description.trim()
            : storeType === 'online_page'
              ? `Verified online seller page delivering PC gear, smartphones & accessories across Djelfa via Instagram, Facebook & WhatsApp.`
              : `Local physical hardware & electronics business in ${areaMeta.name}, Djelfa offering in-store pickup and local delivery.`,
        logoUrl: null,
        area: areaMeta.name,
        address: defaultAddress,
        city: 'Djelfa',
        lat: areaMeta.lat,
        lng: areaMeta.lng,
        phone: parsed.data.phone,
        whatsapp: normalizedWa,
        facebookUrl: sanitizeExternalUrl(parsed.data.facebookUrl, 'facebook'),
        instagramUrl: sanitizeExternalUrl(parsed.data.instagramUrl, 'instagram'),
        googleMapsUrl: null,
        categories: ['cat-pc-parts', 'cat-phones'],
        openingHours: storeType === 'online_page' ? 'Online Orders · 09:00 - 23:00' : '08:30 - 22:00',
        isOpen: true,
        rating: 5.0,
        reviewCount: 0,
        approvalStatus: 'approved' as const,
        accentColor: storeType === 'online_page' ? '#9678CE' : '#4A3894',
        deliveryZones: [areaMeta.name, DJELFA_AREAS[1].name],
        deliveryFee: 200,
        deliveryRadiusKm: storeType === 'online_page' ? 15 : 10,
        createdAt: now,
        updatedAt: now,
      };
      db.stores.push(createdStore);
    }

    saveDb(db);
    const token = signToken(newUser.id);
    res.status(201).json({ user: toPublicUser(newUser), token, store: createdStore });
  });

  app.post('/api/auth/login', (req, res) => {
    const schema = z.object({
      email: z.string().trim().email(),
      password: z.string().min(1),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Email and password are required.' });
      return;
    }
    const db = getDb();
    const user = db.users.find((u) => u.email.toLowerCase() === parsed.data.email.toLowerCase());
    if (!user || !verifyPassword(parsed.data.password, user.passwordHash)) {
      res.status(401).json({ error: 'Invalid email or password.' });
      return;
    }
    const token = signToken(user.id);
    res.json({ user: toPublicUser(user), token });
  });

  app.post('/api/auth/google', async (req, res) => {
    const schema = z.object({
      idToken: z.string().min(20),
      mode: z.enum(['login', 'register']).optional().default('login'),
      role: z.enum(['customer', 'merchant', 'driver']).optional().default('customer'),
      sellerType: z.enum(['physical_store', 'online_page']).optional(),
      storeName: z.string().trim().max(80).optional(),
      phone: z.string().trim().max(24).optional(),
      area: z.string().trim().max(60).optional(),
      address: z.string().trim().max(160).optional(),
      instagramUrl: z.string().trim().max(300).optional(),
      facebookUrl: z.string().trim().max(300).optional(),
      description: z.string().trim().max(400).optional(),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: formatZodError(parsed.error, 'Invalid Google auth request.') });
      return;
    }

    let verified: { uid: string; email: string; displayName: string; emailVerified: boolean };
    try {
      verified = await verifyFirebaseGoogleIdToken(parsed.data.idToken);
    } catch (err) {
      res.status(401).json({ error: err instanceof Error ? err.message : 'Google verification failed.' });
      return;
    }

    const db = getDb();
    const now = new Date().toISOString();
    let user = db.users.find((u) => u.email.toLowerCase() === verified.email);
    let isNewUser = false;
    let createdStore = null;

    const createMerchantStore = (owner: UserAccount) => {
      const storeType = owner.sellerType || parsed.data.sellerType || 'physical_store';
      const storeName =
        parsed.data.storeName && parsed.data.storeName.trim().length >= 2
          ? parsed.data.storeName.trim()
          : storeType === 'online_page'
            ? `${owner.fullName} Online`
            : `${owner.fullName} Shop`;
      const { area: areaMeta } = normalizeDjelfaArea(parsed.data.area);
      const slugBase =
        storeName
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, '-')
          .replace(/(^-|-$)/g, '') || 'marketly-seller';
      const defaultAddress =
        storeType === 'online_page'
          ? `Online Storefront · ${areaMeta.name}, Djelfa`
          : parsed.data.address && parsed.data.address.trim().length >= 4
            ? parsed.data.address.trim()
            : `${areaMeta.name}, Djelfa`;
      const rawWa = (parsed.data.phone || owner.phone || '').replace(/\D/g, '');
      const normalizedWa = rawWa.startsWith('0') ? `213${rawWa.slice(1)}` : rawWa || '213662451109';
      const store = {
        id: `store-${crypto.randomUUID().slice(0, 8)}`,
        ownerId: owner.id,
        name: storeName,
        slug: `${slugBase}-${crypto.randomBytes(2).toString('hex')}`,
        storeType,
        description:
          parsed.data.description && parsed.data.description.trim().length >= 4
            ? parsed.data.description.trim()
            : storeType === 'online_page'
              ? `Verified online seller page delivering PC gear, smartphones & accessories across Djelfa via Instagram, Facebook & WhatsApp.`
              : `Local physical hardware & electronics business in ${areaMeta.name}, Djelfa offering in-store pickup and local delivery.`,
        logoUrl: null,
        area: areaMeta.name,
        address: defaultAddress,
        city: 'Djelfa',
        lat: areaMeta.lat,
        lng: areaMeta.lng,
        phone: owner.phone,
        whatsapp: normalizedWa,
        facebookUrl: sanitizeExternalUrl(parsed.data.facebookUrl, 'facebook'),
        instagramUrl: sanitizeExternalUrl(parsed.data.instagramUrl, 'instagram'),
        googleMapsUrl: null,
        categories: ['cat-pc-parts', 'cat-phones'],
        openingHours: storeType === 'online_page' ? 'Online Orders · 09:00 - 23:00' : '08:30 - 22:00',
        isOpen: true,
        rating: 5.0,
        reviewCount: 0,
        approvalStatus: 'approved' as const,
        accentColor: storeType === 'online_page' ? '#9678CE' : '#4A3894',
        deliveryZones: [areaMeta.name, DJELFA_AREAS[1].name],
        deliveryFee: 200,
        deliveryRadiusKm: storeType === 'online_page' ? 15 : 10,
        createdAt: now,
        updatedAt: now,
      };
      db.stores.push(store);
      return store;
    };

    if (!user) {
      isNewUser = true;
      const requestedRole = parsed.data.role;
      const roles: UserRole[] = requestedRole === 'customer' ? ['customer'] : ['customer', requestedRole];
      const resolvedSellerType =
        requestedRole === 'merchant' ? parsed.data.sellerType || 'physical_store' : undefined;
      user = {
        id: `user-${crypto.randomUUID().slice(0, 8)}`,
        fullName: verified.displayName.slice(0, 80),
        email: verified.email,
        phone: parsed.data.phone?.trim() || '0661 00 00 00',
        passwordHash: hashPassword(crypto.randomBytes(24).toString('hex')),
        roles,
        ...(resolvedSellerType ? { sellerType: resolvedSellerType } : {}),
        isDemo: false,
        createdAt: now,
      };
      db.users.push(user);
      if (requestedRole === 'merchant') {
        createdStore = createMerchantStore(user);
      }
    } else if (parsed.data.mode === 'register') {
      if (parsed.data.role === 'merchant') {
        if (!user.roles.includes('merchant')) {
          user.roles = [...user.roles, 'merchant'];
        }
        if (parsed.data.sellerType) {
          user.sellerType = parsed.data.sellerType;
        }
        const existingStores = db.stores.filter((s) => s.ownerId === user!.id);
        if (existingStores.length === 0) {
          createdStore = createMerchantStore(user);
        }
      } else if (parsed.data.role === 'driver' && !user.roles.includes('driver')) {
        user.roles = [...user.roles, 'driver'];
      }
    }

    saveDb(db);
    const token = signToken(user.id);
    const activeStore = createdStore || db.stores.find((s) => s.ownerId === user!.id) || null;
    res.json({ user: toPublicUser(user), token, store: activeStore, isNewUser });
  });

  // Development-only demo persona switcher (never affects real production accounts)
  app.post('/api/demo/switch-role', (req, res) => {
    const schema = z.object({
      role: z.enum(['customer', 'merchant', 'driver', 'moderator', 'admin']),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid demo role.' });
      return;
    }
    const roleMap: Record<UserRole, string> = {
      customer: 'user-customer-1',
      merchant: 'user-merchant-1',
      driver: 'user-driver-1',
      moderator: 'user-moderator-1',
      admin: 'user-admin-1',
    };
    const db = getDb();
    const user = db.users.find((u) => u.id === roleMap[parsed.data.role] && u.isDemo);
    if (!user) {
      res.status(404).json({ error: 'Demo profile not found.' });
      return;
    }
    const token = signToken(user.id);
    res.json({ user: toPublicUser(user), token });
  });

  // ==========================================
  // PUBLIC MARKETPLACE DISCOVERY & SEARCH
  // ==========================================
  app.get('/api/marketplace/areas', (_req, res) => {
    res.json({ areas: EL_OUED_AREAS });
  });

  app.get('/api/marketplace/overview', (req, res) => {
    const db = getDb();
    const lat = req.query.lat ? Number(req.query.lat) : null;
    const lng = req.query.lng ? Number(req.query.lng) : null;
    const listings = computeEnrichedListings(
      Number.isFinite(lat) ? lat : null,
      Number.isFinite(lng) ? lng : null
    );
    const approvedStores = db.stores
      .filter((s) => s.approvalStatus === 'approved')
      .map((s) => {
        const latestReview =
          (db.storeReviews || [])
            .filter((r) => r.storeId === s.id)
            .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())[0] || null;
        return {
          ...s,
          distanceKm:
            lat != null && lng != null && Number.isFinite(lat) && Number.isFinite(lng)
              ? haversineKm(lat, lng, s.lat, s.lng)
              : null,
          productCount: listings.filter((l) => l.storeId === s.id).length,
          topReview: latestReview,
        };
      })
      .sort((a, b) => {
        if (b.rating !== a.rating) return b.rating - a.rating;
        if (b.reviewCount !== a.reviewCount) return b.reviewCount - a.reviewCount;
        return Number(b.isOpen) - Number(a.isOpen);
      });

    const highestRatedStore = approvedStores[0] || null;

    // Most selling product: pick highest soldCount product and its best in-stock listing
    const sortedBySales = [...listings].sort((a, b) => {
      if (b.soldCount !== a.soldCount) return b.soldCount - a.soldCount;
      if (a.availabilityStatus === 'in_stock' && b.availabilityStatus !== 'in_stock') return -1;
      if (b.availabilityStatus === 'in_stock' && a.availabilityStatus !== 'in_stock') return 1;
      return a.price - b.price;
    });
    const mostSellingListing = sortedBySales[0] || null;
    const seenBestProd = new Set<string>();
    const bestSellingListings = sortedBySales.filter((item) => {
      if (seenBestProd.has(item.productId)) return false;
      seenBestProd.add(item.productId);
      return true;
    }).slice(0, 6);

    const onlineDriversCount = db.drivers.filter((d) => d.isOnline && d.approvalStatus === 'approved').length;

    res.json({
      categories: db.categories,
      areas: EL_OUED_AREAS,
      stores: approvedStores,
      highestRatedStore,
      mostSellingListing,
      bestSellingListings,
      listings,
      stats: {
        activeShops: approvedStores.length,
        listedProducts: listings.length,
        onlineDrivers: onlineDriversCount,
        avgDeliveryFee: 200,
      },
    });
  });

  app.get('/api/marketplace/search', (req, res) => {
    const q = String(req.query.q || '').trim().toLowerCase();
    const categoryId = String(req.query.categoryId || '').trim();
    const availability = String(req.query.availability || '').trim();
    const openOnly = req.query.openOnly === 'true';
    const maxDistanceKm = req.query.maxDistanceKm ? Number(req.query.maxDistanceKm) : null;
    const sortBy = String(req.query.sortBy || 'relevance');
    const lat = req.query.lat ? Number(req.query.lat) : null;
    const lng = req.query.lng ? Number(req.query.lng) : null;

    let listings = computeEnrichedListings(
      lat != null && Number.isFinite(lat) ? lat : null,
      lng != null && Number.isFinite(lng) ? lng : null
    );

    if (q) {
      const tokens = q.split(/\s+/).filter(Boolean);
      listings = listings.filter((l) => {
        const hay = `${l.productName} ${l.brand} ${l.categoryName} ${l.storeName} ${l.description}`.toLowerCase();
        return tokens.every((t) => hay.includes(t) || hay.includes(t.slice(0, Math.max(3, t.length - 1))));
      });
    }

    if (categoryId && categoryId !== 'all') {
      listings = listings.filter((l) => l.categoryId === categoryId);
    }

    if (availability === 'in_stock') {
      listings = listings.filter((l) => l.availabilityStatus === 'in_stock');
    }

    if (openOnly) {
      listings = listings.filter((l) => l.storeIsOpen);
    }

    if (maxDistanceKm && Number.isFinite(maxDistanceKm)) {
      listings = listings.filter((l) => l.distanceKm === null || l.distanceKm <= maxDistanceKm);
    }

    const stockRank = (s: AvailabilityStatus) => (s === 'in_stock' ? 0 : s === 'unconfirmed' ? 1 : 2);

    listings.sort((a, b) => {
      if (sortBy === 'lowest_price') {
        const sr = stockRank(a.availabilityStatus) - stockRank(b.availabilityStatus);
        return sr !== 0 ? sr : a.price - b.price;
      }
      if (sortBy === 'highest_price') {
        return b.price - a.price;
      }
      if (sortBy === 'closest') {
        const da = a.distanceKm ?? 999;
        const db = b.distanceKm ?? 999;
        return da !== db ? da - db : stockRank(a.availabilityStatus) - stockRank(b.availabilityStatus);
      }
      if (sortBy === 'popular') {
        return b.popularity - a.popularity;
      }
      if (sortBy === 'rating') {
        return b.storeRating - a.storeRating;
      }
      // Relevance: in-stock first, then lowest price / popularity
      const sr = stockRank(a.availabilityStatus) - stockRank(b.availabilityStatus);
      if (sr !== 0) return sr;
      return b.popularity - a.popularity;
    });

    res.json({ listings });
  });

  app.get('/api/marketplace/products/:slug', (req, res) => {
    const db = getDb();
    const lat = req.query.lat ? Number(req.query.lat) : null;
    const lng = req.query.lng ? Number(req.query.lng) : null;
    const product = db.products.find((p) => p.slug === req.params.slug || p.id === req.params.slug);
    if (!product) {
      res.status(404).json({ error: 'Product not found.' });
      return;
    }
    const allListings = computeEnrichedListings(
      lat != null && Number.isFinite(lat) ? lat : null,
      lng != null && Number.isFinite(lng) ? lng : null
    );
    const offers = allListings
      .filter((l) => l.productId === product.id)
      .sort((a, b) => {
        if (a.availabilityStatus === 'in_stock' && b.availabilityStatus !== 'in_stock') return -1;
        if (b.availabilityStatus === 'in_stock' && a.availabilityStatus !== 'in_stock') return 1;
        return a.price - b.price;
      });
    const cat = db.categories.find((c) => c.id === product.categoryId);
    res.json({
      product: { ...product, categoryName: cat?.name || 'General' },
      offers,
    });
  });

  app.get('/api/marketplace/stores/:slug', (req, res) => {
    const db = getDb();
    const lat = req.query.lat ? Number(req.query.lat) : null;
    const lng = req.query.lng ? Number(req.query.lng) : null;
    const store = db.stores.find(
      (s) => (s.slug === req.params.slug || s.id === req.params.slug) && s.approvalStatus === 'approved'
    );
    if (!store) {
      res.status(404).json({ error: 'Store not found.' });
      return;
    }
    const allListings = computeEnrichedListings(
      lat != null && Number.isFinite(lat) ? lat : null,
      lng != null && Number.isFinite(lng) ? lng : null
    );
    const storeListings = allListings.filter((l) => l.storeId === store.id);
    const distanceKm =
      lat != null && lng != null && Number.isFinite(lat) && Number.isFinite(lng)
        ? haversineKm(lat, lng, store.lat, store.lng)
        : null;
    const reviews = (db.storeReviews || [])
      .filter((r) => r.storeId === store.id)
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    res.json({
      store: { ...store, distanceKm },
      listings: storeListings,
      reviews,
    });
  });

  app.post('/api/marketplace/stores/:slug/reviews', (req: AuthedRequest, res) => {
    const schema = z.object({
      rating: z.number().int().min(1).max(5),
      comment: z.string().trim().min(3, 'Please write at least 3 characters.').max(500),
      authorName: z.string().trim().min(2).max(80).optional(),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0]?.message || 'Invalid store review.' });
      return;
    }

    const db = getDb();
    const store = db.stores.find(
      (s) => (s.slug === req.params.slug || s.id === req.params.slug) && s.approvalStatus === 'approved'
    );
    if (!store) {
      res.status(404).json({ error: 'Store not found.' });
      return;
    }

    const reviewerName = req.user?.fullName || parsed.data.authorName || 'Djelfa Customer';
    const review = {
      id: `rev-${crypto.randomUUID().slice(0, 8)}`,
      storeId: store.id,
      userId: req.user?.id || null,
      authorName: reviewerName,
      rating: parsed.data.rating,
      comment: parsed.data.comment,
      createdAt: new Date().toISOString(),
    };

    if (!Array.isArray(db.storeReviews)) {
      db.storeReviews = [];
    }
    db.storeReviews.unshift(review);
    recomputeStoreRating(store, db.storeReviews);
    store.updatedAt = review.createdAt;
    saveDb(db);

    const reviews = db.storeReviews
      .filter((r) => r.storeId === store.id)
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    res.status(201).json({ review, store, reviews });
  });

  // ==========================================
  // FAVORITES, INQUIRIES & REPORTS
  // ==========================================
  app.get('/api/favorites', requireAuth, (req: AuthedRequest, res) => {
    const db = getDb();
    res.json({ favorites: db.favorites.filter((f) => f.userId === req.user!.id) });
  });

  app.post('/api/favorites/toggle', requireAuth, (req: AuthedRequest, res) => {
    const schema = z.object({
      type: z.enum(['store', 'product']),
      targetId: z.string().min(1),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid favorite request.' });
      return;
    }
    const db = getDb();
    const idx = db.favorites.findIndex(
      (f) => f.userId === req.user!.id && f.type === parsed.data.type && f.targetId === parsed.data.targetId
    );
    let saved = false;
    if (idx >= 0) {
      db.favorites.splice(idx, 1);
      saved = false;
    } else {
      db.favorites.push({
        id: `fav-${crypto.randomUUID().slice(0, 8)}`,
        userId: req.user!.id,
        type: parsed.data.type,
        targetId: parsed.data.targetId,
        createdAt: new Date().toISOString(),
      });
      saved = true;
    }
    saveDb(db);
    res.json({ saved, favorites: db.favorites.filter((f) => f.userId === req.user!.id) });
  });

  app.post('/api/inquiries', (req: AuthedRequest, res) => {
    const schema = z.object({
      storeId: z.string().min(1),
      storeProductId: z.string().min(1),
      customerName: z.string().trim().min(2).max(80),
      customerPhone: z.string().trim().min(8).max(24),
      message: z.string().trim().min(4).max(500),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0]?.message || 'Invalid inquiry.' });
      return;
    }
    const db = getDb();
    const sp = db.storeProducts.find((item) => item.id === parsed.data.storeProductId && item.storeId === parsed.data.storeId);
    if (!sp) {
      res.status(404).json({ error: 'Product listing not found.' });
      return;
    }
    const prod = db.products.find((p) => p.id === sp.productId);
    const inquiry = {
      id: `inq-${crypto.randomUUID().slice(0, 8)}`,
      customerId: req.user?.id || null,
      customerName: parsed.data.customerName,
      customerPhone: parsed.data.customerPhone,
      storeId: parsed.data.storeId,
      storeProductId: parsed.data.storeProductId,
      productName: prod?.name || 'Product',
      message: parsed.data.message,
      reply: null,
      status: 'open' as const,
      createdAt: new Date().toISOString(),
    };
    db.inquiries.unshift(inquiry);
    saveDb(db);
    res.status(201).json({ inquiry });
  });

  app.post('/api/reports', (req: AuthedRequest, res) => {
    const schema = z.object({
      targetType: z.enum(['store', 'product']),
      targetId: z.string().min(1),
      targetName: z.string().trim().min(1).max(120),
      reason: z.string().trim().min(5).max(400),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Please provide a clear reason (min 5 characters).' });
      return;
    }
    const db = getDb();
    const report = {
      id: `rep-${crypto.randomUUID().slice(0, 8)}`,
      reporterId: req.user?.id || null,
      targetType: parsed.data.targetType,
      targetId: parsed.data.targetId,
      targetName: parsed.data.targetName,
      reason: parsed.data.reason,
      status: 'open' as const,
      createdAt: new Date().toISOString(),
    };
    db.reports.unshift(report);
    saveDb(db);
    res.status(201).json({ report });
  });

  // ==========================================
  // CUSTOMER CART CHECKOUT & ORDERS
  // ==========================================
  app.get('/api/orders/my', requireAuth, (req: AuthedRequest, res) => {
    const db = getDb();
    const myOrders = db.orders
      .filter((o) => o.customerId === req.user!.id)
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .map((o) => sanitizeOrderForViewer(o, req.user!.id));
    res.json({ orders: myOrders });
  });

  app.post('/api/orders', (req: AuthedRequest, res) => {
    const schema = z.object({
      storeId: z.string().min(1),
      fulfillmentType: z.enum(['delivery', 'pickup']),
      paymentMethod: z.enum(['cash_on_delivery', 'cash_at_shop']),
      customerName: z.string().trim().min(2).max(80),
      customerPhone: z.string().trim().regex(/^[0-9+\s()-]{8,20}$/, 'Enter a valid phone number.'),
      deliveryAddress: z.string().trim().max(240).optional().default(''),
      items: z
        .array(
          z.object({
            storeProductId: z.string().min(1),
            quantity: z.number().int().min(1).max(50),
          })
        )
        .min(1),
    });

    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0]?.message || 'Invalid checkout fields.' });
      return;
    }

    const { storeId, fulfillmentType, paymentMethod, customerName, customerPhone, deliveryAddress, items } = parsed.data;
    if (fulfillmentType === 'delivery' && deliveryAddress.trim().length < 5) {
      res.status(400).json({ error: 'Delivery address is required for local delivery.' });
      return;
    }

    const db = getDb();
    const store = db.stores.find((s) => s.id === storeId && s.approvalStatus === 'approved');
    if (!store) {
      res.status(404).json({ error: 'Store not found or unavailable.' });
      return;
    }
    if (!store.isOpen) {
      res.status(400).json({ error: `${store.name} is currently closed.` });
      return;
    }

    // Revalidate every item's price and stock server-side
    const verifiedItems = [];
    let subtotal = 0;

    for (const item of items) {
      const sp = db.storeProducts.find((l) => l.id === item.storeProductId && l.storeId === store.id && l.isActive);
      if (!sp) {
        res.status(400).json({ error: 'One of the selected items is no longer available at this store.' });
        return;
      }
      if (sp.availabilityStatus === 'out_of_stock') {
        const prod = db.products.find((p) => p.id === sp.productId);
        res.status(400).json({ error: `${prod?.name || 'An item'} is currently out of stock.` });
        return;
      }
      if (sp.stockQuantity !== null && item.quantity > sp.stockQuantity) {
        const prod = db.products.find((p) => p.id === sp.productId);
        res.status(400).json({ error: `Only ${sp.stockQuantity} left for ${prod?.name || 'item'}.` });
        return;
      }
      const prod = db.products.find((p) => p.id === sp.productId);
      const lineTotal = sp.price * item.quantity;
      subtotal += lineTotal;
      verifiedItems.push({
        id: `oi-${crypto.randomUUID().slice(0, 8)}`,
        storeProductId: sp.id,
        productId: sp.productId,
        productNameSnapshot: prod?.name || 'Item',
        unitPriceSnapshot: sp.price,
        quantity: item.quantity,
        subtotal: lineTotal,
      });
    }

    const deliveryFee = fulfillmentType === 'delivery' ? (store.deliveryFee ?? 200) : 0;
    const total = subtotal + deliveryFee;
    const orderId = `order-${crypto.randomUUID().slice(0, 8)}`;
    const orderNumber = `MK-${1043 + db.orders.length}`;
    const confirmationCode = String(crypto.randomInt(1000, 9999));
    const customerId = req.user?.id || 'guest-customer';
    const now = new Date().toISOString();

    const newOrder = {
      id: orderId,
      orderNumber,
      customerId,
      storeId: store.id,
      storeName: store.name,
      storeAddress: store.address,
      storeArea: store.area,
      storePhone: store.phone,
      driverId: null,
      driverName: null,
      driverVehicle: null,
      fulfillmentType,
      paymentMethod: fulfillmentType === 'delivery' ? paymentMethod : 'cash_at_shop',
      paymentStatus: 'pending' as const,
      orderStatus: 'new' as const,
      subtotal,
      deliveryFee,
      total,
      customerName,
      customerPhone,
      deliveryAddress: fulfillmentType === 'delivery' ? deliveryAddress : `Pickup at ${store.address}`,
      confirmationCodeHash: hashConfirmationCode(confirmationCode, orderId),
      customerConfirmationCode: confirmationCode,
      items: verifiedItems,
      createdAt: now,
      updatedAt: now,
    };

    // Decrement tracked stock quantities and increment product soldCount transactionally
    for (const vi of verifiedItems) {
      const sp = db.storeProducts.find((l) => l.id === vi.storeProductId);
      if (sp && sp.stockQuantity !== null) {
        sp.stockQuantity = Math.max(0, sp.stockQuantity - vi.quantity);
        if (sp.stockQuantity === 0) {
          sp.availabilityStatus = 'out_of_stock';
        }
        sp.updatedAt = now;
      }
      const prod = db.products.find((p) => p.id === vi.productId);
      if (prod) {
        prod.soldCount = (prod.soldCount ?? 0) + vi.quantity;
        prod.popularity = Math.min(999, (prod.popularity ?? 50) + vi.quantity);
      }
    }

    db.orders.unshift(newOrder);
    saveDb(db);

    res.status(201).json({ order: sanitizeOrderForViewer(newOrder, customerId) });
  });

  // ==========================================
  // MERCHANT DASHBOARD & MANAGEMENT
  // ==========================================
  app.get('/api/merchant/dashboard', requireRole('merchant'), (req: AuthedRequest, res) => {
    const db = getDb();
    const myStores = db.stores.filter((s) => s.ownerId === req.user!.id);
    const storeIds = new Set(myStores.map((s) => s.id));
    const myListings = db.storeProducts
      .filter((sp) => storeIds.has(sp.storeId))
      .map((sp) => {
        const prod = db.products.find((p) => p.id === sp.productId);
        const cat = db.categories.find((c) => c.id === prod?.categoryId);
        const store = myStores.find((s) => s.id === sp.storeId);
        return {
          ...sp,
          productName: prod?.name || 'Product',
          productSlug: prod?.slug || sp.productId,
          brand: prod?.brand || '',
          description: prod?.description || '',
          categoryId: prod?.categoryId || '',
          categoryName: cat?.name || 'General',
          imageKey: prod?.imageKey || 'gpu',
          imageUrl: sp.imageUrl || prod?.imageUrl || null,
          soldCount: prod?.soldCount ?? 0,
          priceHistory:
            Array.isArray(sp.priceHistory) && sp.priceHistory.length > 0
              ? sp.priceHistory
              : [{ price: sp.price, recordedAt: sp.updatedAt }],
          storeName: store?.name || '',
        };
      });
    const myOrders = db.orders
      .filter((o) => storeIds.has(o.storeId))
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .map((o) => sanitizeOrderForViewer(o));
    const myInquiries = db.inquiries
      .filter((i) => storeIds.has(i.storeId))
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    res.json({
      stores: myStores,
      listings: myListings,
      orders: myOrders,
      inquiries: myInquiries,
      categories: db.categories,
      areas: EL_OUED_AREAS,
      catalogProducts: db.products,
    });
  });

  app.post('/api/merchant/upload-photo', requireRole('merchant'), (req: AuthedRequest, res) => {
    const schema = z.object({
      dataUrl: z.string().min(30).max(3_200_000),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid image payload (max 2MB PNG, JPG, or WebP).' });
      return;
    }
    const match = /^data:image\/(png|jpeg|jpg|webp);base64,([A-Za-z0-9+/=]+)$/.exec(parsed.data.dataUrl.trim());
    if (!match) {
      res.status(400).json({ error: 'Only PNG, JPEG, or WebP images are supported.' });
      return;
    }
    const buf = Buffer.from(match[2], 'base64');
    if (buf.length < 16 || buf.length > 2_200_000) {
      res.status(400).json({ error: 'Image must be between 16 bytes and 2MB.' });
      return;
    }

    // Verify magic bytes for PNG / JPEG / WebP
    const isPng = buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47;
    const isJpg = buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff;
    const isWebp =
      buf.slice(0, 4).toString('ascii') === 'RIFF' && buf.slice(8, 12).toString('ascii') === 'WEBP';
    if (!isPng && !isJpg && !isWebp) {
      res.status(400).json({ error: 'File contents do not match a valid PNG, JPEG, or WebP image.' });
      return;
    }

    const ext = isPng ? 'png' : isJpg ? 'jpg' : 'webp';
    const filename = `prod-${crypto.randomUUID().slice(0, 12)}.${ext}`;
    const resolvedPath = path.resolve(UPLOAD_DIR, filename);
    if (!resolvedPath.startsWith(UPLOAD_DIR + path.sep)) {
      res.status(400).json({ error: 'Invalid upload path.' });
      return;
    }
    fs.writeFileSync(resolvedPath, buf);
    res.status(201).json({ imageUrl: `/uploads/${filename}` });
  });

  app.post('/api/merchant/stores', requireRole('merchant'), (req: AuthedRequest, res) => {
    const schema = z.object({
      name: z.string().trim().min(2).max(80),
      storeType: z.enum(['physical_store', 'online_page']).optional().default('physical_store'),
      description: z.string().trim().min(8).max(400),
      area: z.string().trim().min(2),
      address: z.string().trim().max(160).optional().default(''),
      phone: z.string().trim().min(8).max(24),
      whatsapp: z.string().trim().min(8).max(24),
      openingHours: z.string().trim().min(3).max(60),
      categories: z.array(z.string()).min(1),
      deliveryZones: z.array(z.string().trim().min(2).max(40)).optional(),
      deliveryFee: z.number().int().min(0).max(5000).optional(),
      deliveryRadiusKm: z.number().min(1).max(100).optional(),
      logoUrl: z.string().trim().max(500).nullable().optional(),
      facebookUrl: z.string().trim().max(300).nullable().optional(),
      instagramUrl: z.string().trim().max(300).nullable().optional(),
      googleMapsUrl: z.string().trim().max(500).nullable().optional(),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: formatZodError(parsed.error, 'Invalid store details.') });
      return;
    }
    if (parsed.data.storeType === 'physical_store' && parsed.data.address.trim().length < 4) {
      res.status(400).json({ error: 'Street address is required for a physical business.' });
      return;
    }
    const db = getDb();
    const { area: areaMeta } = normalizeDjelfaArea(parsed.data.area);
    const slugBase = parsed.data.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
    const now = new Date().toISOString();
    const cleanAddress =
      parsed.data.address.trim().length >= 4
        ? parsed.data.address.trim()
        : `Online Storefront · ${areaMeta.name}, Djelfa`;
    const newStore = {
      id: `store-${crypto.randomUUID().slice(0, 8)}`,
      ownerId: req.user!.id,
      name: parsed.data.name,
      slug: `${slugBase}-${crypto.randomBytes(2).toString('hex')}`,
      storeType: parsed.data.storeType,
      description: parsed.data.description,
      logoUrl: sanitizeImageUrl(parsed.data.logoUrl),
      area: areaMeta.name,
      address: cleanAddress,
      city: 'Djelfa',
      lat: areaMeta.lat,
      lng: areaMeta.lng,
      phone: parsed.data.phone,
      whatsapp: parsed.data.whatsapp.replace(/\D/g, ''),
      facebookUrl: sanitizeExternalUrl(parsed.data.facebookUrl, 'facebook'),
      instagramUrl: sanitizeExternalUrl(parsed.data.instagramUrl, 'instagram'),
      googleMapsUrl: sanitizeExternalUrl(parsed.data.googleMapsUrl, 'maps'),
      categories: parsed.data.categories,
      openingHours: parsed.data.openingHours,
      isOpen: true,
      rating: 5.0,
      reviewCount: 0,
      approvalStatus: 'approved' as const,
      accentColor: parsed.data.storeType === 'online_page' ? '#9678CE' : '#4A3894',
      deliveryZones:
        parsed.data.deliveryZones && parsed.data.deliveryZones.length > 0
          ? parsed.data.deliveryZones
          : [areaMeta.name, DJELFA_AREAS[1].name],
      deliveryFee: parsed.data.deliveryFee ?? 200,
      deliveryRadiusKm: parsed.data.deliveryRadiusKm ?? 10,
      createdAt: now,
      updatedAt: now,
    };
    db.stores.push(newStore);
    saveDb(db);
    res.status(201).json({ store: newStore });
  });

  app.patch('/api/merchant/stores/:id', requireRole('merchant'), (req: AuthedRequest, res) => {
    const schema = z.object({
      name: z.string().trim().min(2).max(80).optional(),
      storeType: z.enum(['physical_store', 'online_page']).optional(),
      description: z.string().trim().min(4).max(400).optional(),
      area: z.string().trim().optional(),
      address: z.string().trim().min(2).max(160).optional(),
      phone: z.string().trim().min(6).max(24).optional(),
      whatsapp: z.string().trim().min(6).max(24).optional(),
      openingHours: z.string().trim().optional(),
      isOpen: z.boolean().optional(),
      deliveryZones: z.array(z.string().trim().min(2).max(40)).min(1).optional(),
      deliveryFee: z.number().int().min(0).max(5000).optional(),
      deliveryRadiusKm: z.number().min(1).max(100).optional(),
      logoUrl: z.string().trim().max(500).nullable().optional(),
      facebookUrl: z.string().trim().max(300).nullable().optional(),
      instagramUrl: z.string().trim().max(300).nullable().optional(),
      googleMapsUrl: z.string().trim().max(500).nullable().optional(),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: formatZodError(parsed.error, 'Invalid store update.') });
      return;
    }
    const db = getDb();
    const store = db.stores.find((s) => s.id === req.params.id && s.ownerId === req.user!.id);
    if (!store) {
      res.status(404).json({ error: 'Store not found or unauthorized.' });
      return;
    }
    if (parsed.data.area) {
      const { area: areaMeta } = normalizeDjelfaArea(parsed.data.area);
      store.area = areaMeta.name;
      store.city = 'Djelfa';
      store.lat = areaMeta.lat;
      store.lng = areaMeta.lng;
    }
    Object.assign(store, {
      ...(parsed.data.name !== undefined ? { name: parsed.data.name } : {}),
      ...(parsed.data.storeType !== undefined ? { storeType: parsed.data.storeType } : {}),
      ...(parsed.data.description !== undefined ? { description: parsed.data.description } : {}),
      ...(parsed.data.address !== undefined ? { address: parsed.data.address } : {}),
      ...(parsed.data.phone !== undefined ? { phone: parsed.data.phone } : {}),
      ...(parsed.data.whatsapp !== undefined ? { whatsapp: parsed.data.whatsapp.replace(/\D/g, '') } : {}),
      ...(parsed.data.openingHours !== undefined ? { openingHours: parsed.data.openingHours } : {}),
      ...(parsed.data.isOpen !== undefined ? { isOpen: parsed.data.isOpen } : {}),
      ...(parsed.data.deliveryZones !== undefined ? { deliveryZones: parsed.data.deliveryZones } : {}),
      ...(parsed.data.deliveryFee !== undefined ? { deliveryFee: parsed.data.deliveryFee } : {}),
      ...(parsed.data.deliveryRadiusKm !== undefined ? { deliveryRadiusKm: parsed.data.deliveryRadiusKm } : {}),
      ...(parsed.data.logoUrl !== undefined ? { logoUrl: sanitizeImageUrl(parsed.data.logoUrl) } : {}),
      ...(parsed.data.facebookUrl !== undefined ? { facebookUrl: sanitizeExternalUrl(parsed.data.facebookUrl, 'facebook') } : {}),
      ...(parsed.data.instagramUrl !== undefined ? { instagramUrl: sanitizeExternalUrl(parsed.data.instagramUrl, 'instagram') } : {}),
      ...(parsed.data.googleMapsUrl !== undefined ? { googleMapsUrl: sanitizeExternalUrl(parsed.data.googleMapsUrl, 'maps') } : {}),
      updatedAt: new Date().toISOString(),
    });
    saveDb(db);
    res.json({ store });
  });

  app.post('/api/merchant/listings', requireRole('merchant'), (req: AuthedRequest, res) => {
    const schema = z.object({
      storeId: z.string().min(1),
      productId: z.string().optional(),
      name: z.string().trim().min(2).max(80),
      brand: z.string().trim().min(1).max(60),
      description: z.string().trim().min(4).max(300),
      categoryId: z.string().min(1),
      imageKey: z.string().optional().default('gpu'),
      imageUrl: z.string().trim().max(500).nullable().optional(),
      price: z.number().int().min(1).max(5000000),
      stockQuantity: z.number().int().min(0).max(10000).nullable().optional(),
      availabilityStatus: z.enum(['in_stock', 'out_of_stock', 'unconfirmed']).default('in_stock'),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: formatZodError(parsed.error, 'Invalid product listing.') });
      return;
    }
    const db = getDb();
    const store = db.stores.find((s) => s.id === parsed.data.storeId && s.ownerId === req.user!.id);
    if (!store) {
      res.status(403).json({ error: 'You do not own this store.' });
      return;
    }
    const safePhoto = sanitizeImageUrl(parsed.data.imageUrl);
    if (parsed.data.imageUrl && parsed.data.imageUrl.trim() && !safePhoto) {
      res.status(400).json({ error: 'Photo URL must be an uploaded image or valid https:// URL.' });
      return;
    }

    const now = new Date().toISOString();
    let productId = parsed.data.productId;
    if (!productId) {
      const existingProd = db.products.find(
        (p) => p.name.toLowerCase() === parsed.data.name.toLowerCase()
      );
      if (existingProd) {
        productId = existingProd.id;
        if (safePhoto && !existingProd.imageUrl) {
          existingProd.imageUrl = safePhoto;
        }
      } else {
        const slugBase = parsed.data.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
        const newProd = {
          id: `prod-${crypto.randomUUID().slice(0, 8)}`,
          name: parsed.data.name,
          slug: `${slugBase}-${crypto.randomBytes(2).toString('hex')}`,
          brand: parsed.data.brand,
          description: parsed.data.description,
          categoryId: normalizeCategoryId(parsed.data.categoryId, {
            imageKey: parsed.data.imageKey,
            name: parsed.data.name,
            description: parsed.data.description,
          }),
          imageKey: parsed.data.imageKey || 'gpu',
          imageUrl: safePhoto,
          popularity: 55,
          soldCount: 0,
          createdAt: now,
        };
        db.products.push(newProd);
        productId = newProd.id;
      }
    }

    const newListing = {
      id: `sp-${crypto.randomUUID().slice(0, 8)}`,
      storeId: store.id,
      productId,
      price: parsed.data.price,
      currency: 'DZD',
      stockQuantity: parsed.data.stockQuantity ?? null,
      availabilityStatus: parsed.data.availabilityStatus,
      availabilityUpdatedAt: now,
      isActive: true,
      imageUrl: safePhoto,
      priceHistory: [{ price: parsed.data.price, recordedAt: now }],
      createdAt: now,
      updatedAt: now,
    };
    db.storeProducts.unshift(newListing);
    saveDb(db);
    res.status(201).json({ listing: newListing });
  });

  app.post('/api/merchant/listings/bulk', requireRole('merchant'), (req: AuthedRequest, res) => {
    const rowSchema = z.object({
      name: z.string().trim().min(2).max(80),
      brand: z.string().trim().min(1).max(60).default('Generic'),
      description: z.string().trim().max(300).optional().default('Verified PC / phone hardware item.'),
      category: z.string().trim().optional().default('cat-pc-parts'),
      imageKey: z.string().trim().optional().default('gpu'),
      imageUrl: z.string().trim().max(500).nullable().optional(),
      price: z.number().int().min(1).max(5000000),
      stockQuantity: z.number().int().min(0).max(10000).nullable().optional(),
      availabilityStatus: z.enum(['in_stock', 'out_of_stock', 'unconfirmed']).optional().default('in_stock'),
    });
    const schema = z.object({
      storeId: z.string().min(1),
      rows: z.array(rowSchema).min(1).max(100),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0]?.message || 'Invalid bulk import rows.' });
      return;
    }

    const db = getDb();
    const store = db.stores.find((s) => s.id === parsed.data.storeId && s.ownerId === req.user!.id);
    if (!store) {
      res.status(403).json({ error: 'You do not own this store.' });
      return;
    }

    const resolveCategoryId = (rawCat: string, rowMeta?: { imageKey?: string; name?: string }): string => {
      const q = rawCat.trim().toLowerCase();
      const direct = db.categories.find(
        (c) =>
          c.id.toLowerCase() === q ||
          c.slug.toLowerCase() === q ||
          c.name.toLowerCase() === q ||
          c.nameFr.toLowerCase() === q ||
          c.nameAr === rawCat.trim()
      );
      if (direct) return direct.id;
      return normalizeCategoryId(rawCat, {
        imageKey: rowMeta?.imageKey,
        name: `${rawCat} ${rowMeta?.name || ''}`,
      });
    };

    const now = new Date().toISOString();
    let createdCount = 0;
    let updatedCount = 0;

    for (const row of parsed.data.rows) {
      const categoryId = resolveCategoryId(row.category || 'cat-pc-parts', {
        imageKey: row.imageKey,
        name: row.name,
      });
      const safePhoto = sanitizeImageUrl(row.imageUrl);
      const desc = row.description && row.description.trim().length >= 4 ? row.description.trim() : `${row.brand} ${row.name}`;

      let product = db.products.find((p) => p.name.toLowerCase() === row.name.toLowerCase());
      if (!product) {
        const slugBase = row.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || 'item';
        product = {
          id: `prod-${crypto.randomUUID().slice(0, 8)}`,
          name: row.name,
          slug: `${slugBase}-${crypto.randomBytes(2).toString('hex')}`,
          brand: row.brand,
          description: desc,
          categoryId,
          imageKey: row.imageKey || 'gpu',
          imageUrl: safePhoto,
          popularity: 55,
          soldCount: 0,
          createdAt: now,
        };
        db.products.push(product);
      } else if (safePhoto && !product.imageUrl) {
        product.imageUrl = safePhoto;
      }

      const existingListing = db.storeProducts.find(
        (sp) => sp.storeId === store.id && sp.productId === product!.id
      );

      if (existingListing) {
        existingListing.priceHistory = appendPriceHistory(existingListing.priceHistory, row.price, now);
        existingListing.price = row.price;
        if (row.stockQuantity !== undefined) existingListing.stockQuantity = row.stockQuantity;
        existingListing.availabilityStatus = row.availabilityStatus;
        existingListing.availabilityUpdatedAt = now;
        existingListing.isActive = true;
        if (safePhoto) existingListing.imageUrl = safePhoto;
        existingListing.updatedAt = now;
        updatedCount += 1;
      } else {
        db.storeProducts.unshift({
          id: `sp-${crypto.randomUUID().slice(0, 8)}`,
          storeId: store.id,
          productId: product.id,
          price: row.price,
          currency: 'DZD',
          stockQuantity: row.stockQuantity ?? null,
          availabilityStatus: row.availabilityStatus,
          availabilityUpdatedAt: now,
          isActive: true,
          imageUrl: safePhoto,
          priceHistory: [{ price: row.price, recordedAt: now }],
          createdAt: now,
          updatedAt: now,
        });
        createdCount += 1;
      }
    }

    saveDb(db);
    res.status(201).json({ createdCount, updatedCount, totalProcessed: createdCount + updatedCount });
  });

  app.patch('/api/merchant/listings/:id', requireRole('merchant'), (req: AuthedRequest, res) => {
    const schema = z.object({
      price: z.number().int().min(1).max(5000000).optional(),
      stockQuantity: z.number().int().min(0).max(10000).nullable().optional(),
      availabilityStatus: z.enum(['in_stock', 'out_of_stock', 'unconfirmed']).optional(),
      isActive: z.boolean().optional(),
      name: z.string().trim().min(2).max(80).optional(),
      brand: z.string().trim().min(1).max(60).optional(),
      description: z.string().trim().min(4).max(300).optional(),
      categoryId: z.string().min(1).optional(),
      imageKey: z.string().trim().min(1).max(40).optional(),
      imageUrl: z.string().trim().max(500).nullable().optional(),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0]?.message || 'Invalid listing update.' });
      return;
    }
    const db = getDb();
    const sp = db.storeProducts.find((item) => item.id === req.params.id);
    if (!sp) {
      res.status(404).json({ error: 'Listing not found.' });
      return;
    }
    const store = db.stores.find((s) => s.id === sp.storeId && s.ownerId === req.user!.id);
    if (!store) {
      res.status(403).json({ error: 'Unauthorized store modification.' });
      return;
    }

    const now = new Date().toISOString();

    if (parsed.data.imageUrl !== undefined) {
      if (parsed.data.imageUrl === null || parsed.data.imageUrl === '') {
        sp.imageUrl = null;
      } else {
        const safePhoto = sanitizeImageUrl(parsed.data.imageUrl);
        if (!safePhoto) {
          res.status(400).json({ error: 'Photo URL must be an uploaded image or valid https:// URL.' });
          return;
        }
        sp.imageUrl = safePhoto;
      }
    }

    // Update product metadata (forking a copy if shared across other stores)
    const hasProdEdits =
      parsed.data.name !== undefined ||
      parsed.data.brand !== undefined ||
      parsed.data.description !== undefined ||
      parsed.data.categoryId !== undefined ||
      parsed.data.imageKey !== undefined;

    if (hasProdEdits) {
      const currentProd = db.products.find((p) => p.id === sp.productId);
      const otherStoresUseSameProd = db.storeProducts.some(
        (other) => other.id !== sp.id && other.productId === sp.productId && other.storeId !== sp.storeId
      );
      if (currentProd && otherStoresUseSameProd) {
        const nextName = parsed.data.name ?? currentProd.name;
        const slugBase = nextName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || 'item';
        const forked = {
          ...currentProd,
          id: `prod-${crypto.randomUUID().slice(0, 8)}`,
          slug: `${slugBase}-${crypto.randomBytes(2).toString('hex')}`,
          name: nextName,
          brand: parsed.data.brand ?? currentProd.brand,
          description: parsed.data.description ?? currentProd.description,
          categoryId: parsed.data.categoryId ?? currentProd.categoryId,
          imageKey: parsed.data.imageKey ?? currentProd.imageKey,
          imageUrl: sp.imageUrl ?? currentProd.imageUrl ?? null,
          soldCount: 0,
          createdAt: now,
        };
        db.products.push(forked);
        sp.productId = forked.id;
      } else if (currentProd) {
        if (parsed.data.name !== undefined) currentProd.name = parsed.data.name;
        if (parsed.data.brand !== undefined) currentProd.brand = parsed.data.brand;
        if (parsed.data.description !== undefined) currentProd.description = parsed.data.description;
        if (parsed.data.categoryId !== undefined) currentProd.categoryId = parsed.data.categoryId;
        if (parsed.data.imageKey !== undefined) currentProd.imageKey = parsed.data.imageKey;
        if (parsed.data.imageUrl !== undefined) currentProd.imageUrl = sp.imageUrl ?? null;
      }
    }

    if (parsed.data.price !== undefined) {
      sp.priceHistory = appendPriceHistory(sp.priceHistory, parsed.data.price, now);
      sp.price = parsed.data.price;
    }
    if (parsed.data.stockQuantity !== undefined) sp.stockQuantity = parsed.data.stockQuantity;
    if (parsed.data.availabilityStatus !== undefined) {
      sp.availabilityStatus = parsed.data.availabilityStatus;
      sp.availabilityUpdatedAt = now;
    }
    if (parsed.data.isActive !== undefined) sp.isActive = parsed.data.isActive;
    sp.updatedAt = now;
    saveDb(db);
    res.json({ listing: sp });
  });

  app.delete('/api/merchant/listings/:id', requireRole('merchant'), (req: AuthedRequest, res) => {
    const db = getDb();
    const idx = db.storeProducts.findIndex((item) => item.id === req.params.id);
    if (idx < 0) {
      res.status(404).json({ error: 'Listing not found.' });
      return;
    }
    const store = db.stores.find((s) => s.id === db.storeProducts[idx].storeId && s.ownerId === req.user!.id);
    if (!store) {
      res.status(403).json({ error: 'Unauthorized.' });
      return;
    }
    db.storeProducts.splice(idx, 1);
    saveDb(db);
    res.json({ deleted: true });
  });

  app.post('/api/merchant/listings/:id/duplicate', requireRole('merchant'), (req: AuthedRequest, res) => {
    const db = getDb();
    const sp = db.storeProducts.find((item) => item.id === req.params.id);
    if (!sp) {
      res.status(404).json({ error: 'Listing not found.' });
      return;
    }
    const store = db.stores.find((s) => s.id === sp.storeId && s.ownerId === req.user!.id);
    if (!store) {
      res.status(403).json({ error: 'Unauthorized.' });
      return;
    }
    const now = new Date().toISOString();
    const copy = {
      ...sp,
      id: `sp-${crypto.randomUUID().slice(0, 8)}`,
      availabilityUpdatedAt: now,
      createdAt: now,
      updatedAt: now,
    };
    db.storeProducts.unshift(copy);
    saveDb(db);
    res.status(201).json({ listing: copy });
  });

  app.post('/api/merchant/listings/:id/record-sale', requireRole('merchant'), (req: AuthedRequest, res) => {
    const schema = z.object({
      units: z.number().int().min(1).max(1000).default(1),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Units sold must be between 1 and 1000.' });
      return;
    }
    const db = getDb();
    const sp = db.storeProducts.find((item) => item.id === req.params.id);
    if (!sp) {
      res.status(404).json({ error: 'Listing not found.' });
      return;
    }
    const store = db.stores.find((s) => s.id === sp.storeId && s.ownerId === req.user!.id);
    if (!store) {
      res.status(403).json({ error: 'Unauthorized store modification.' });
      return;
    }
    const now = new Date().toISOString();
    if (sp.stockQuantity !== null) {
      sp.stockQuantity = Math.max(0, sp.stockQuantity - parsed.data.units);
      if (sp.stockQuantity === 0) {
        sp.availabilityStatus = 'out_of_stock';
      }
    }
    sp.updatedAt = now;
    const prod = db.products.find((p) => p.id === sp.productId);
    if (prod) {
      prod.soldCount = (prod.soldCount ?? 0) + parsed.data.units;
      prod.popularity = Math.min(999, (prod.popularity ?? 50) + parsed.data.units);
    }
    saveDb(db);
    res.json({ listing: sp, soldCount: prod?.soldCount ?? 0 });
  });

  app.post('/api/merchant/orders/:id/status', requireRole('merchant'), (req: AuthedRequest, res) => {
    const schema = z.object({
      nextStatus: z.enum(['accepted', 'looking', 'ready', 'done', 'rejected']),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid status.' });
      return;
    }
    const db = getDb();
    const order = db.orders.find((o) => o.id === req.params.id);
    if (!order) {
      res.status(404).json({ error: 'Order not found.' });
      return;
    }
    const store = db.stores.find((s) => s.id === order.storeId && s.ownerId === req.user!.id);
    if (!store) {
      res.status(403).json({ error: 'Unauthorized order update.' });
      return;
    }

    const allowed =
      order.fulfillmentType === 'delivery'
        ? VALID_DELIVERY_TRANSITIONS[order.orderStatus]
        : VALID_PICKUP_TRANSITIONS[order.orderStatus];

    // Merchants cannot mark delivery orders as 'onway' or 'done' directly (driver handles delivery completion)
    if (order.fulfillmentType === 'delivery' && (parsed.data.nextStatus === 'done' || parsed.data.nextStatus === 'ready')) {
      res.status(400).json({ error: 'Delivery orders must be completed by the assigned driver.' });
      return;
    }

    if (!allowed.includes(parsed.data.nextStatus)) {
      res.status(400).json({
        error: `Cannot transition ${order.fulfillmentType} order from '${order.orderStatus}' to '${parsed.data.nextStatus}'.`,
      });
      return;
    }

    order.orderStatus = parsed.data.nextStatus;
    if (parsed.data.nextStatus === 'done') {
      order.paymentStatus = 'paid';
    }
    order.updatedAt = new Date().toISOString();
    saveDb(db);
    res.json({ order: sanitizeOrderForViewer(order) });
  });

  app.post('/api/merchant/inquiries/:id/reply', requireRole('merchant'), (req: AuthedRequest, res) => {
    const schema = z.object({ reply: z.string().trim().min(2).max(500) });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Reply message is required.' });
      return;
    }
    const db = getDb();
    const inq = db.inquiries.find((i) => i.id === req.params.id);
    if (!inq) {
      res.status(404).json({ error: 'Inquiry not found.' });
      return;
    }
    const store = db.stores.find((s) => s.id === inq.storeId && s.ownerId === req.user!.id);
    if (!store) {
      res.status(403).json({ error: 'Unauthorized.' });
      return;
    }
    inq.reply = parsed.data.reply;
    inq.status = 'answered';
    saveDb(db);
    res.json({ inquiry: inq });
  });

  // ==========================================
  // DRIVER DASHBOARD & DELIVERY WORKFLOW
  // ==========================================
  app.get('/api/driver/dashboard', requireRole('driver'), (req: AuthedRequest, res) => {
    const db = getDb();
    let driver = db.drivers.find((d) => d.userId === req.user!.id);
    if (!driver) {
      driver = {
        id: `driver-${crypto.randomUUID().slice(0, 8)}`,
        userId: req.user!.id,
        name: req.user!.fullName,
        phone: req.user!.phone,
        vehicleType: 'motorcycle',
        serviceArea: DJELFA_AREAS[1].name,
        deliveryFee: 200,
        rating: 5.0,
        isOnline: false,
        approvalStatus: 'approved',
        completedDeliveries: 0,
        totalEarnings: 0,
        createdAt: new Date().toISOString(),
      };
      db.drivers.push(driver);
      saveDb(db);
    }

    const availableJobs = driver.isOnline
      ? db.orders
          .filter((o) => o.fulfillmentType === 'delivery' && o.orderStatus === 'looking' && !o.driverId)
          .map((o) => sanitizeOrderForViewer(o))
      : [];

    const activeJobs = db.orders
      .filter((o) => o.driverId === driver!.id && o.orderStatus === 'onway')
      .map((o) => sanitizeOrderForViewer(o));

    const completedJobs = db.orders
      .filter((o) => o.driverId === driver!.id && o.orderStatus === 'done')
      .map((o) => sanitizeOrderForViewer(o));

    res.json({
      profile: driver,
      availableJobs,
      activeJobs,
      completedJobs,
      areas: EL_OUED_AREAS,
    });
  });

  app.patch('/api/driver/profile', requireRole('driver'), (req: AuthedRequest, res) => {
    const schema = z.object({
      vehicleType: z.enum(['motorcycle', 'car']).optional(),
      serviceArea: z.string().trim().min(2).optional(),
      isOnline: z.boolean().optional(),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid driver profile update.' });
      return;
    }
    const db = getDb();
    const driver = db.drivers.find((d) => d.userId === req.user!.id);
    if (!driver) {
      res.status(404).json({ error: 'Driver profile not found.' });
      return;
    }
    if (parsed.data.vehicleType !== undefined) {
      driver.vehicleType = parsed.data.vehicleType;
      driver.deliveryFee = parsed.data.vehicleType === 'car' ? 300 : 200;
    }
    if (parsed.data.serviceArea !== undefined) driver.serviceArea = parsed.data.serviceArea;
    if (parsed.data.isOnline !== undefined) driver.isOnline = parsed.data.isOnline;
    saveDb(db);
    res.json({ profile: driver });
  });

  app.post('/api/driver/jobs/:orderId/accept', requireRole('driver'), (req: AuthedRequest, res) => {
    const db = getDb();
    const driver = db.drivers.find((d) => d.userId === req.user!.id);
    if (!driver) {
      res.status(404).json({ error: 'Driver profile not found.' });
      return;
    }
    if (!driver.isOnline) {
      res.status(400).json({ error: 'Switch to Online before accepting delivery jobs.' });
      return;
    }
    const order = db.orders.find((o) => o.id === req.params.orderId);
    if (!order) {
      res.status(404).json({ error: 'Order not found.' });
      return;
    }
    // Atomic check preventing duplicate acceptance
    if (order.orderStatus !== 'looking' || order.driverId !== null) {
      res.status(409).json({ error: 'This delivery request has already been accepted by another driver.' });
      return;
    }
    order.driverId = driver.id;
    order.driverName = driver.name;
    order.driverVehicle = driver.vehicleType;
    order.orderStatus = 'onway';
    order.updatedAt = new Date().toISOString();
    saveDb(db);
    res.json({ order: sanitizeOrderForViewer(order) });
  });

  app.post('/api/driver/jobs/:orderId/complete', requireRole('driver'), (req: AuthedRequest, res) => {
    const schema = z.object({
      code: z.string().trim().regex(/^\d{4}$/, 'Enter the 4-digit customer confirmation code.'),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0]?.message || 'Invalid confirmation code.' });
      return;
    }
    const db = getDb();
    const driver = db.drivers.find((d) => d.userId === req.user!.id);
    if (!driver) {
      res.status(404).json({ error: 'Driver profile not found.' });
      return;
    }
    const order = db.orders.find((o) => o.id === req.params.orderId && o.driverId === driver.id);
    if (!order) {
      res.status(404).json({ error: 'Assigned order not found.' });
      return;
    }
    if (order.orderStatus !== 'onway') {
      res.status(400).json({ error: 'Order is not currently out for delivery.' });
      return;
    }
    const candidateHash = hashConfirmationCode(parsed.data.code, order.id);
    if (candidateHash !== order.confirmationCodeHash) {
      res.status(403).json({ error: 'Confirmation code does not match the customer code.' });
      return;
    }
    order.orderStatus = 'done';
    order.paymentStatus = 'paid';
    order.updatedAt = new Date().toISOString();
    driver.completedDeliveries += 1;
    driver.totalEarnings += order.deliveryFee;
    saveDb(db);
    res.json({ order: sanitizeOrderForViewer(order), profile: driver });
  });

  // ==========================================
  // HELP CENTER & CUSTOMER / SELLER SUPPORT CHAT
  // ==========================================
  app.get('/api/support/tickets', (req: AuthedRequest, res) => {
    const db = getDb();
    const rawTokens = typeof req.query.tokens === 'string' ? req.query.tokens : '';
    const tokenPairs = new Map<string, string>();
    for (const pair of rawTokens.split(',')) {
      const idx = pair.indexOf(':');
      if (idx > 0) {
        const id = pair.slice(0, idx).trim();
        const tok = pair.slice(idx + 1).trim();
        if (id && tok) tokenPairs.set(id, tok);
      }
    }

    const matching = (db.supportTickets || [])
      .filter((t) => {
        if (req.user && t.userId === req.user.id) return true;
        if (!t.userId) {
          const providedTok = tokenPairs.get(t.id);
          return Boolean(providedTok && providedTok === t.accessToken);
        }
        return false;
      })
      .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
      .map((t) => ({
        ...t,
        accessToken:
          (!t.userId && tokenPairs.get(t.id) === t.accessToken) || (req.user && t.userId === req.user.id)
            ? t.accessToken
            : '',
      }));

    res.json({ tickets: matching });
  });

  app.post('/api/support/tickets', (req: AuthedRequest, res) => {
    const schema = z.object({
      senderRole: z.enum(['customer', 'seller']),
      senderName: z.string().trim().min(2).max(80),
      senderContact: z.string().trim().min(4).max(120),
      topic: z.string().trim().min(2).max(100),
      message: z.string().trim().min(2).max(1000),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: formatZodError(parsed.error, 'Please fill in your name, contact, and message.') });
      return;
    }

    const db = getDb();
    if (!Array.isArray(db.supportTickets)) db.supportTickets = [];
    const now = new Date().toISOString();
    const ticket: SupportTicket = {
      id: `sup-${crypto.randomUUID().slice(0, 8)}`,
      accessToken: crypto.randomBytes(16).toString('hex'),
      userId: req.user?.id || null,
      senderRole: parsed.data.senderRole,
      senderName: parsed.data.senderName,
      senderContact: parsed.data.senderContact,
      topic: parsed.data.topic,
      status: 'open',
      messages: [
        {
          id: `smsg-${crypto.randomUUID().slice(0, 8)}`,
          sender: 'visitor',
          senderName: parsed.data.senderName,
          text: parsed.data.message,
          createdAt: now,
        },
      ],
      createdAt: now,
      updatedAt: now,
    };

    db.supportTickets.unshift(ticket);
    saveDb(db);
    res.status(201).json({ ticket });
  });

  app.post('/api/support/tickets/:id/messages', (req: AuthedRequest, res) => {
    const schema = z.object({
      text: z.string().trim().min(1).max(1000),
      accessToken: z.string().optional(),
      senderName: z.string().trim().min(2).max(80).optional(),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Please enter a support message.' });
      return;
    }

    const db = getDb();
    const ticket = (db.supportTickets || []).find((t) => t.id === req.params.id);
    if (!ticket) {
      res.status(404).json({ error: 'Support ticket not found.' });
      return;
    }

    const isOwner =
      Boolean(req.user && ticket.userId === req.user.id) ||
      Boolean(!ticket.userId && parsed.data.accessToken && parsed.data.accessToken === ticket.accessToken);

    if (!isOwner) {
      res.status(403).json({ error: 'Unauthorized support conversation access.' });
      return;
    }

    const now = new Date().toISOString();
    ticket.messages.push({
      id: `smsg-${crypto.randomUUID().slice(0, 8)}`,
      sender: 'visitor',
      senderName: parsed.data.senderName || req.user?.fullName || ticket.senderName,
      text: parsed.data.text,
      createdAt: now,
    });
    ticket.status = 'open';
    ticket.updatedAt = now;
    saveDb(db);
    res.json({ ticket });
  });

  app.delete('/api/support/tickets/:id', (req: AuthedRequest, res) => {
    const db = getDb();
    const list = db.supportTickets || [];
    const idx = list.findIndex((t) => t.id === req.params.id);
    if (idx < 0) {
      res.status(404).json({ error: 'Support ticket not found.' });
      return;
    }
    const ticket = list[idx];
    const headerTok = typeof req.headers['x-ticket-token'] === 'string' ? req.headers['x-ticket-token'].trim() : '';
    const queryTok = typeof req.query.accessToken === 'string' ? req.query.accessToken.trim() : '';
    const bodyTok = typeof (req.body as { accessToken?: unknown } | undefined)?.accessToken === 'string'
      ? ((req.body as { accessToken: string }).accessToken || '').trim()
      : '';
    const providedTok = headerTok || queryTok || bodyTok;

    const isOwner =
      Boolean(req.user && ticket.userId === req.user.id) ||
      Boolean(!ticket.userId && providedTok && providedTok === ticket.accessToken);

    if (!isOwner) {
      res.status(403).json({ error: 'Only the ticket owner can delete this ticket.' });
      return;
    }

    list.splice(idx, 1);
    saveDb(db);
    res.json({ deleted: true, id: ticket.id });
  });

  // ==========================================
  // MODERATOR & ADMIN GOVERNANCE
  // ==========================================
  app.get('/api/moderator/tickets', requireAnyRole('moderator', 'admin'), (_req: AuthedRequest, res) => {
    const db = getDb();
    const supportTickets = [...(db.supportTickets || [])]
      .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
      .map(({ accessToken: _tok, ...rest }) => ({ ...rest, accessToken: '' }));
    res.json({
      stats: {
        openSupportTickets: supportTickets.filter((t) => t.status === 'open').length,
        answeredSupportTickets: supportTickets.filter((t) => t.status === 'answered').length,
        resolvedSupportTickets: supportTickets.filter((t) => t.status === 'resolved').length,
        totalSupportTickets: supportTickets.length,
      },
      supportTickets,
    });
  });

  app.get('/api/admin/dashboard', requireRole('admin'), (_req: AuthedRequest, res) => {
    const db = getDb();
    const supportTickets = [...(db.supportTickets || [])]
      .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
      .map(({ accessToken: _tok, ...rest }) => ({ ...rest, accessToken: '' }));
    res.json({
      stats: {
        totalUsers: db.users.length,
        totalStores: db.stores.length,
        pendingStores: db.stores.filter((s) => s.approvalStatus === 'pending').length,
        approvedStores: db.stores.filter((s) => s.approvalStatus === 'approved').length,
        totalListings: db.storeProducts.length,
        totalOrders: db.orders.length,
        openReports: db.reports.filter((r) => r.status === 'open').length,
        openSupportTickets: supportTickets.filter((t) => t.status === 'open').length,
      },
      stores: db.stores,
      users: db.users.map(toPublicUser),
      drivers: db.drivers,
      categories: db.categories,
      listings: db.storeProducts.map((sp) => {
        const prod = db.products.find((p) => p.id === sp.productId);
        const store = db.stores.find((s) => s.id === sp.storeId);
        return {
          ...sp,
          productName: prod?.name || 'Product',
          storeName: store?.name || 'Store',
        };
      }),
      orders: db.orders.map((o) => sanitizeOrderForViewer(o)),
      reports: db.reports,
      supportTickets,
      auditLogs: db.auditLogs,
    });
  });

  app.post('/api/admin/stores/:id/approval', requireRole('admin'), (req: AuthedRequest, res) => {
    const schema = z.object({
      approvalStatus: z.enum(['approved', 'rejected', 'suspended', 'pending']),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid approval status.' });
      return;
    }
    const db = getDb();
    const store = db.stores.find((s) => s.id === req.params.id);
    if (!store) {
      res.status(404).json({ error: 'Store not found.' });
      return;
    }
    store.approvalStatus = parsed.data.approvalStatus as ApprovalStatus;
    store.updatedAt = new Date().toISOString();
    db.auditLogs.unshift({
      id: `log-${crypto.randomUUID().slice(0, 8)}`,
      actorId: req.user!.id,
      actorName: req.user!.fullName,
      action: `STORE_${parsed.data.approvalStatus.toUpperCase()}`,
      targetType: 'store',
      targetId: store.id,
      details: `Set ${store.name} status to ${parsed.data.approvalStatus}.`,
      createdAt: new Date().toISOString(),
    });
    saveDb(db);
    res.json({ store });
  });

  app.post('/api/admin/listings/:id/toggle', requireRole('admin'), (req: AuthedRequest, res) => {
    const db = getDb();
    const sp = db.storeProducts.find((l) => l.id === req.params.id);
    if (!sp) {
      res.status(404).json({ error: 'Listing not found.' });
      return;
    }
    sp.isActive = !sp.isActive;
    sp.updatedAt = new Date().toISOString();
    db.auditLogs.unshift({
      id: `log-${crypto.randomUUID().slice(0, 8)}`,
      actorId: req.user!.id,
      actorName: req.user!.fullName,
      action: sp.isActive ? 'RESTORE_LISTING' : 'HIDE_LISTING',
      targetType: 'store_product',
      targetId: sp.id,
      details: `${sp.isActive ? 'Restored' : 'Moderated/hid'} listing ${sp.id}.`,
      createdAt: new Date().toISOString(),
    });
    saveDb(db);
    res.json({ listing: sp });
  });

  app.post('/api/admin/categories', requireRole('admin'), (req: AuthedRequest, res) => {
    const schema = z.object({
      name: z.string().trim().min(2).max(50),
      nameFr: z.string().trim().max(50).optional(),
      nameAr: z.string().trim().min(2).max(50),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'English and Arabic category names are required.' });
      return;
    }
    const db = getDb();
    const slug = parsed.data.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
    const cat = {
      id: `cat-${crypto.randomUUID().slice(0, 6)}`,
      name: parsed.data.name,
      nameFr: parsed.data.nameFr?.trim() || parsed.data.name,
      nameAr: parsed.data.nameAr,
      slug,
      iconKey: 'tag',
    };
    db.categories.push(cat);
    db.auditLogs.unshift({
      id: `log-${crypto.randomUUID().slice(0, 8)}`,
      actorId: req.user!.id,
      actorName: req.user!.fullName,
      action: 'CREATE_CATEGORY',
      targetType: 'category',
      targetId: cat.id,
      details: `Created category ${cat.name}.`,
      createdAt: new Date().toISOString(),
    });
    saveDb(db);
    res.status(201).json({ category: cat });
  });

  app.patch('/api/admin/users/:id/roles', requireRole('admin'), (req: AuthedRequest, res) => {
    const schema = z.object({
      roles: z.array(z.enum(['customer', 'merchant', 'driver', 'moderator', 'admin'])).min(1),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'At least one valid role is required.' });
      return;
    }
    const db = getDb();
    const user = db.users.find((u) => u.id === req.params.id);
    if (!user) {
      res.status(404).json({ error: 'User not found.' });
      return;
    }
    user.roles = parsed.data.roles;
    db.auditLogs.unshift({
      id: `log-${crypto.randomUUID().slice(0, 8)}`,
      actorId: req.user!.id,
      actorName: req.user!.fullName,
      action: 'UPDATE_USER_ROLES',
      targetType: 'user',
      targetId: user.id,
      details: `Updated roles for ${user.fullName}: ${user.roles.join(', ')}.`,
      createdAt: new Date().toISOString(),
    });
    saveDb(db);
    res.json({ user: toPublicUser(user) });
  });

  app.post('/api/admin/reports/:id', requireRole('admin'), (req: AuthedRequest, res) => {
    const schema = z.object({ status: z.enum(['resolved', 'dismissed']) });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid status.' });
      return;
    }
    const db = getDb();
    const report = db.reports.find((r) => r.id === req.params.id);
    if (!report) {
      res.status(404).json({ error: 'Report not found.' });
      return;
    }
    report.status = parsed.data.status;
    db.auditLogs.unshift({
      id: `log-${crypto.randomUUID().slice(0, 8)}`,
      actorId: req.user!.id,
      actorName: req.user!.fullName,
      action: `REPORT_${parsed.data.status.toUpperCase()}`,
      targetType: 'report',
      targetId: report.id,
      details: `Marked report on ${report.targetName} as ${parsed.data.status}.`,
      createdAt: new Date().toISOString(),
    });
    saveDb(db);
    res.json({ report });
  });

  app.post('/api/admin/support-tickets/:id/reply', requireAnyRole('moderator', 'admin'), (req: AuthedRequest, res) => {
    const schema = z.object({ text: z.string().trim().min(1).max(1000) });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Reply message is required.' });
      return;
    }
    const db = getDb();
    const ticket = (db.supportTickets || []).find((t) => t.id === req.params.id);
    if (!ticket) {
      res.status(404).json({ error: 'Support ticket not found.' });
      return;
    }
    const now = new Date().toISOString();
    const roleLabel = req.user!.roles.includes('admin') ? 'Admin' : 'Moderator';
    ticket.messages.push({
      id: `smsg-${crypto.randomUUID().slice(0, 8)}`,
      sender: 'support',
      senderName: `${req.user!.fullName} (${roleLabel})`,
      text: parsed.data.text,
      createdAt: now,
    });
    ticket.status = 'answered';
    ticket.updatedAt = now;
    db.auditLogs.unshift({
      id: `log-${crypto.randomUUID().slice(0, 8)}`,
      actorId: req.user!.id,
      actorName: req.user!.fullName,
      action: 'SUPPORT_REPLY',
      targetType: 'support_ticket',
      targetId: ticket.id,
      details: `${roleLabel} replied to ${ticket.senderRole} support ticket from ${ticket.senderName}.`,
      createdAt: now,
    });
    saveDb(db);
    const { accessToken: _tok, ...safeTicket } = ticket;
    res.json({ ticket: { ...safeTicket, accessToken: '' } });
  });

  app.patch('/api/admin/support-tickets/:id/status', requireAnyRole('moderator', 'admin'), (req: AuthedRequest, res) => {
    const schema = z.object({ status: z.enum(['open', 'answered', 'resolved']) });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid ticket status.' });
      return;
    }
    const db = getDb();
    const ticket = (db.supportTickets || []).find((t) => t.id === req.params.id);
    if (!ticket) {
      res.status(404).json({ error: 'Support ticket not found.' });
      return;
    }
    const now = new Date().toISOString();
    const roleLabel = req.user!.roles.includes('admin') ? 'Admin' : 'Moderator';
    ticket.status = parsed.data.status;
    ticket.updatedAt = now;
    db.auditLogs.unshift({
      id: `log-${crypto.randomUUID().slice(0, 8)}`,
      actorId: req.user!.id,
      actorName: req.user!.fullName,
      action: `SUPPORT_${parsed.data.status.toUpperCase()}`,
      targetType: 'support_ticket',
      targetId: ticket.id,
      details: `${roleLabel} marked support ticket ${ticket.id} as ${parsed.data.status}.`,
      createdAt: now,
    });
    saveDb(db);
    const { accessToken: _tok, ...safeTicket } = ticket;
    res.json({ ticket: { ...safeTicket, accessToken: '' } });
  });

  // ==========================================
  // EDITABLE SOURCE ZIP EXPORT (ADMIN / VERIFIED DEVELOPER ONLY)
  // ==========================================
  app.get('/api/export-zip', (req: AuthedRequest, res) => {
    if (!req.user) {
      res.status(401).json({ error: 'Authentication required to export source zip.' });
      return;
    }
    const isAdmin = req.user.roles.includes('admin');
    const isVerifiedDev = req.user.email.toLowerCase() === 'iimrxreports@gmail.com';
    if (!isAdmin && !isVerifiedDev) {
      res.status(403).json({ error: 'Only admins and authorized developers can export source zip.' });
      return;
    }
    try {
      const zipBuffer = buildEditableProjectZip(process.cwd());
      res.setHeader('Content-Type', 'application/zip');
      res.setHeader('Content-Disposition', 'attachment; filename="marketly-editable.zip"');
      res.setHeader('Cache-Control', 'no-store');
      res.setHeader('Content-Length', String(zipBuffer.length));
      res.end(zipBuffer);
    } catch {
      res.status(500).json({ error: 'Failed to package editable project zip.' });
    }
  });

  // ==========================================
  // VITE / STATIC SERVING
  // ==========================================
  if (process.env.NODE_ENV !== 'production') {
    const hmrDisabled = process.env.DISABLE_HMR === 'true';
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        allowedHosts: true,
        ...(hmrDisabled ? { hmr: false, ws: false } : { ws: { server: httpServer } }),
      },
      appType: 'spa',
    });

    if (hmrDisabled) {
      app.use((req: Request, res: Response, next: NextFunction) => {
        if (req.path !== '/@vite/client') {
          next();
          return;
        }
        delete req.headers['if-none-match'];
        delete req.headers['if-modified-since'];
        delete req.headers['accept-encoding'];

        const chunks: Buffer[] = [];
        const origWrite = res.write.bind(res);
        const origEnd = res.end.bind(res);

        res.write = ((
          chunk: string | Uint8Array,
          encodingOrCb?: BufferEncoding | ((error: Error | null | undefined) => void),
          cb?: (error: Error | null | undefined) => void
        ) => {
          if (chunk) {
            chunks.push(
              Buffer.isBuffer(chunk)
                ? chunk
                : typeof chunk === 'string'
                  ? Buffer.from(chunk, typeof encodingOrCb === 'string' ? encodingOrCb : 'utf8')
                  : Buffer.from(chunk)
            );
          }
          if (typeof encodingOrCb === 'function') encodingOrCb(null);
          else if (typeof cb === 'function') cb(null);
          return true;
        }) as typeof res.write;

        res.end = ((
          chunk?: string | Uint8Array | (() => void),
          encodingOrCb?: BufferEncoding | (() => void),
          cb?: () => void
        ) => {
          if (chunk && typeof chunk !== 'function') {
            chunks.push(
              Buffer.isBuffer(chunk)
                ? chunk
                : typeof chunk === 'string'
                  ? Buffer.from(chunk, typeof encodingOrCb === 'string' ? encodingOrCb : 'utf8')
                  : Buffer.from(chunk)
            );
          }
          const doneCb =
            typeof chunk === 'function'
              ? chunk
              : typeof encodingOrCb === 'function'
                ? encodingOrCb
                : cb;

          res.write = origWrite;
          res.end = origEnd;

          if (chunks.length === 0) {
            return origEnd(doneCb);
          }

          let body = Buffer.concat(chunks).toString('utf8');
          if (body.includes('createWebSocketModuleRunnerTransport')) {
            body = body.replace(
              /let wsTransport = createWebSocketModuleRunnerTransport\([\s\S]*?\}\);/,
              'let wsTransport = { connect: async () => {}, disconnect: async () => {}, send: () => {} };'
            );
            body = body.replace(
              'console.debug("[vite] connecting...");',
              'console.debug("[vite] HMR disabled (no WebSocket connection).");'
            );
            res.removeHeader('Content-Length');
            res.removeHeader('ETag');
            res.setHeader('Content-Length', String(Buffer.byteLength(body, 'utf8')));
            res.setHeader('Cache-Control', 'no-store');
          }

          return origEnd(body, 'utf8', doneCb);
        }) as typeof res.end;

        next();
      });
    }

    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  httpServer.listen(PORT, '0.0.0.0', () => {
    console.log(`Marketly server running on http://localhost:${PORT}`);
  });
}

startServer();
