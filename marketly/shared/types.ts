export type UserRole = 'customer' | 'merchant' | 'driver' | 'moderator' | 'admin';

export type SellerBusinessType = 'physical_store' | 'online_page';

export type ApprovalStatus = 'pending' | 'approved' | 'rejected' | 'suspended';

export type AvailabilityStatus = 'in_stock' | 'out_of_stock' | 'unconfirmed';

export type FulfillmentType = 'delivery' | 'pickup';

export type PaymentMethod = 'cash_on_delivery' | 'cash_at_shop';

export type OrderStatus =
  | 'new'
  | 'accepted'
  | 'looking'
  | 'onway'
  | 'ready'
  | 'done'
  | 'rejected';

export type LanguageCode = 'en' | 'ar';

export interface CityArea {
  id: string;
  name: string;
  nameAr: string;
  nameFr?: string;
  streetEn?: string;
  streetAr?: string;
  lat: number;
  lng: number;
}

export type ElOuedArea = CityArea;

export interface UserAccount {
  id: string;
  fullName: string;
  email: string;
  phone: string;
  passwordHash: string;
  roles: UserRole[];
  sellerType?: SellerBusinessType;
  isDemo?: boolean;
  createdAt: string;
}

export interface PublicUser {
  id: string;
  fullName: string;
  email: string;
  phone: string;
  roles: UserRole[];
  sellerType?: SellerBusinessType;
  isDemo?: boolean;
}

export interface Category {
  id: string;
  name: string;
  nameFr: string;
  nameAr: string;
  slug: string;
  iconKey: string;
}

export interface Store {
  id: string;
  ownerId: string;
  storeType?: SellerBusinessType;
  name: string;
  slug: string;
  description: string;
  logoUrl?: string | null;
  area: string;
  address: string;
  city: string;
  lat: number;
  lng: number;
  phone: string;
  whatsapp: string;
  facebookUrl?: string | null;
  instagramUrl?: string | null;
  googleMapsUrl?: string | null;
  categories: string[];
  openingHours: string;
  isOpen: boolean;
  rating: number;
  reviewCount: number;
  approvalStatus: ApprovalStatus;
  accentColor: string;
  deliveryZones?: string[];
  deliveryFee?: number;
  deliveryRadiusKm?: number;
  createdAt: string;
  updatedAt: string;
}

export interface PriceHistoryPoint {
  price: number;
  recordedAt: string;
}

export interface Product {
  id: string;
  name: string;
  slug: string;
  brand: string;
  description: string;
  categoryId: string;
  imageKey: string;
  imageUrl?: string | null;
  popularity: number;
  soldCount: number;
  createdAt: string;
}

export interface StoreProduct {
  id: string;
  storeId: string;
  productId: string;
  price: number;
  currency: string;
  stockQuantity: number | null;
  availabilityStatus: AvailabilityStatus;
  availabilityUpdatedAt: string;
  isActive: boolean;
  imageUrl?: string | null;
  priceHistory?: PriceHistoryPoint[];
  createdAt: string;
  updatedAt: string;
}

export interface EnrichedListing {
  listingId: string;
  productId: string;
  storeId: string;
  storeType?: SellerBusinessType;
  productName: string;
  productSlug: string;
  brand: string;
  description: string;
  categoryId: string;
  categoryName: string;
  imageKey: string;
  imageUrl?: string | null;
  popularity: number;
  soldCount: number;
  price: number;
  priceHistory?: PriceHistoryPoint[];
  currency: string;
  stockQuantity: number | null;
  availabilityStatus: AvailabilityStatus;
  availabilityUpdatedAt: string;
  isStale: boolean;
  isActive: boolean;
  isLowestPrice: boolean;
  storeOfferCount: number;
  storeName: string;
  storeSlug: string;
  storeArea: string;
  storeAddress: string;
  storePhone: string;
  storeWhatsapp: string;
  storeIsOpen: boolean;
  storeRating: number;
  storeDeliveryZones?: string[];
  storeDeliveryFee?: number;
  storeDeliveryRadiusKm?: number;
  distanceKm: number | null;
}

export interface OrderItem {
  id: string;
  storeProductId: string;
  productId: string;
  productNameSnapshot: string;
  unitPriceSnapshot: number;
  quantity: number;
  subtotal: number;
}

export interface Order {
  id: string;
  orderNumber: string;
  customerId: string;
  storeId: string;
  storeName: string;
  storeAddress: string;
  storeArea: string;
  storePhone: string;
  driverId: string | null;
  driverName: string | null;
  driverVehicle: 'motorcycle' | 'car' | null;
  fulfillmentType: FulfillmentType;
  paymentMethod: PaymentMethod;
  paymentStatus: 'pending' | 'paid';
  orderStatus: OrderStatus;
  subtotal: number;
  deliveryFee: number;
  total: number;
  customerName: string;
  customerPhone: string;
  deliveryAddress: string;
  confirmationCodeHash: string;
  customerConfirmationCode?: string;
  items: OrderItem[];
  createdAt: string;
  updatedAt: string;
}

export interface DriverProfile {
  id: string;
  userId: string;
  name: string;
  phone: string;
  vehicleType: 'motorcycle' | 'car';
  serviceArea: string;
  deliveryFee: number;
  rating: number;
  isOnline: boolean;
  approvalStatus: ApprovalStatus;
  completedDeliveries: number;
  totalEarnings: number;
  createdAt: string;
}

export interface Inquiry {
  id: string;
  customerId: string | null;
  customerName: string;
  customerPhone: string;
  storeId: string;
  storeProductId: string;
  productName: string;
  message: string;
  reply: string | null;
  status: 'open' | 'answered';
  createdAt: string;
}

export interface AbuseReport {
  id: string;
  reporterId: string | null;
  targetType: 'store' | 'product';
  targetId: string;
  targetName: string;
  reason: string;
  status: 'open' | 'resolved' | 'dismissed';
  createdAt: string;
}

export interface AuditLog {
  id: string;
  actorId: string;
  actorName: string;
  action: string;
  targetType: string;
  targetId: string;
  details: string;
  createdAt: string;
}

export interface StoreReview {
  id: string;
  storeId: string;
  userId: string | null;
  authorName: string;
  rating: number;
  comment: string;
  createdAt: string;
}

export interface Favorite {
  id: string;
  userId: string;
  type: 'store' | 'product';
  targetId: string;
  createdAt: string;
}

export interface SupportMessage {
  id: string;
  sender: 'visitor' | 'support';
  senderName: string;
  text: string;
  createdAt: string;
}

export interface SupportTicket {
  id: string;
  accessToken: string;
  userId: string | null;
  senderRole: 'customer' | 'seller';
  senderName: string;
  senderContact: string;
  topic: string;
  status: 'open' | 'answered' | 'resolved';
  messages: SupportMessage[];
  createdAt: string;
  updatedAt: string;
}

export interface ShopfrontDatabase {
  users: UserAccount[];
  categories: Category[];
  stores: Store[];
  products: Product[];
  storeProducts: StoreProduct[];
  drivers: DriverProfile[];
  orders: Order[];
  inquiries: Inquiry[];
  reports: AbuseReport[];
  auditLogs: AuditLog[];
  favorites: Favorite[];
  storeReviews: StoreReview[];
  supportTickets: SupportTicket[];
}
