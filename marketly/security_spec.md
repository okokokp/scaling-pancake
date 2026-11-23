# Security Specification: Shopfront Product & Best-Seller Firestore Database

## 1. Data Invariants
1. **Identity Integrity**: Every user, store, product, and best-seller record created by a client MUST enforce `ownerUid == request.auth.uid` / `sellerUid == request.auth.uid` and require `request.auth.token.email_verified == true`.
2. **Master Gate (Store -> Seller Product)**: A seller cannot create a `seller_products/{productId}` document unless the referenced parent `stores/{storeId}` exists AND `stores/{storeId}.ownerUid == request.auth.uid`.
3. **Atomic Best-Seller Sync**: A `best_selling_products/{bestSellerId}` document MUST match its `productId == bestSellerId` and reference an active `seller_products/{productId}` belonging to `request.auth.uid` via `getAfter(...)`.
4. **PII Isolation**: User email and phone are isolated in `users/{userId}/private/{docId}`, readable and writable only by `isOwner(userId)` or `isAdmin()`. Public catalog collections (`stores`, `seller_products`, `best_selling_products`) contain zero PII.
5. **Temporal Integrity & Immortal Fields**: All `createdAt` fields must equal `request.time` on creation and remain immutable forever. All `updatedAt` fields must equal `request.time` on create and update. `sellerUid`, `ownerUid`, `storeId`, `id`, and `productId` are immutable after creation.
6. **Admin Privilege Hardening**: Only verified admin documents in `/admins/{uid}` or the bootstrapped admin (`sadi.marwan.omar@gmail.com` with `email_verified == true`) hold `isAdmin()`. Users cannot self-assign admin privileges.

## 2. The "Dirty Dozen" Attack Payloads (Expected: PERMISSION_DENIED)
1. **Unauthenticated Write**: Creating `seller_products/prod-1` with `request.auth == null`.
2. **Unverified Email Write**: Creating `seller_products/prod-1` with `email_verified: false`.
3. **Identity Spoofing**: Creating `seller_products/prod-1` with `sellerUid: "victim-uid"` while authenticated as `"attacker-uid"`.
4. **Shadow / Ghost Field Injection**: Creating or updating `seller_products/prod-1` with an extra undeclared field `isVerified: true` or `adminOverride: true`.
5. **Orphaned Product Creation**: Creating `seller_products/prod-1` with a non-existent `storeId: "fake-store-999"`.
6. **Cross-Seller Store Hijack**: Creating `seller_products/prod-1` referencing another seller's `storeId` where `ownerUid != request.auth.uid`.
7. **ID Poisoning**: Creating `seller_products/invalid..id$$` or a 200-char document ID failing `isValidId()`.
8. **Value Poisoning**: Updating `seller_products/prod-1` with `price: -500`, `price: "free"`, or `name` exceeding 100 characters.
9. **Client Timestamp Tampering**: Creating `seller_products/prod-1` with a forged past `createdAt` instead of `request.time`.
10. **Immutable Field Mutation**: Updating `seller_products/prod-1` to change `sellerUid`, `storeId`, or `createdAt`.
11. **PII Scraping / Blanket List**: Reading or listing `users/{otherUid}/private/info` as a non-owner non-admin user.
12. **Privilege Escalation**: Writing to `/admins/{attackerUid}` from client SDK or forging `email_verified: false` with the admin email.
