# Multi-Vendor Marketplace — Project Scope (v2)

## 0. Context & Reference Analysis

Two references were analyzed to expand this scope:

**1. Thaimart (thaimart.com)** — Thai multi-vendor marketplace.
- Live-streaming shopping embedded directly in the storefront (sellers go live, users tap in and buy).
- Separate **seller subdomain** (`seller.thaimart.com`) for shop registration/onboarding, decoupled from the buyer app.
- QR-based local payment (PromptPay-style) shown as a first-class payment option.
- Multiple delivery partners integrated and shown as trust badges (Flash Express, Thailand Post, KEX).
- Native iOS + Android apps in addition to the web app.
- Social channel integration (Line, Facebook, TikTok, Instagram, YouTube) — used for marketing/support, not just footer links.
- Legal/trust pages: Terms & Conditions, Privacy Policy, business registration badge (DBD-verified).

**2. "Lazhop" (package `tgsoft.dev.tgshop`, Google Play)** — Laos-focused all-in-one shopping & video marketplace.
- Local marketplace positioning ("support local businesses").
- **Video feed + live streaming** as a core discovery mechanic, not an add-on.
- **AI chat assistant** for 24/7 automated customer support.
- Discount coupons / vouchers as a first-class feature.
- **Real-time parcel tracking** from dispatch to delivery.
- Dedicated IT/technical support channel for both buyers and sellers.
- Recently shipped: buyer-side control to extend payment deadline and auto-confirmation deadline on an order (up to 2 extensions of 2 days each) — a small but telling UX detail around reducing accidental cancellations/disputes.

**Implication for your scope:** both references are less "generic catalog marketplace" and more "social commerce" platforms (video, live, chat-driven). I've kept your original 3-role structure intact but expanded each module, and flagged the video/live/AI-chat pieces as **Phase 2** so your MVP stays shippable.

---

## 1. Actors

| Actor | Description |
|---|---|
| **Platform Admin** | Owns the marketplace. Can have sub-roles (Super Admin, Support Staff, Finance Staff) via RBAC. |
| **Shop (Vendor)** | Registers, sells products, manages own orders/finances. |
| **Customer** | Browses, buys, tracks orders, earns/redeems points. |
| **Guest** | Unauthenticated visitor — can browse/search but must register to buy. |

---

## 2. Admin Module

### 2.1 Authentication & Access
- Login / logout, session/token expiry, forced logout on password change.
- **Role-based access control (RBAC)**: Super Admin vs scoped staff (e.g. Support can view orders but not payouts; Finance can see reports but not edit products).
- Audit log: who changed what, when (critical for a multi-admin team).

### 2.2 Dashboard
- KPI cards: GMV, order count, active shops, active customers, new signups, refund rate.
- Trend charts: sales over time, top categories, top shops, top products.
- Alerts: shops pending approval, disputes open, low-stock flags across platform.

### 2.3 Shop Management
- Approve/reject shop registration; KYC document review (business license/ID upload from shop).
- Suspend/ban shop; view shop's product catalog, order history, and rating.
- Commission rate configuration (global default + per-shop or per-category override).
- Shop payout/settlement schedule and history (view, not just report).

### 2.4 Customer Management
- Search/view/suspend customer accounts.
- View a customer's order + support history.
- Manage loyalty **point rules** globally (earn rate, expiry, redemption rules) — since points touch both admin policy and customer-facing balance.

### 2.5 Product Oversight
- Read access to all shop products; ability to flag/unpublish inappropriate listings.
- Approve new product listings if you want pre-moderation (configurable: pre-moderate vs post-moderate).
- Moderate uploaded video/images (content policy compliance).
- Fields per product: id, name, SKU, description, price, compare-at price, stock, unit, category/subcategory, attributes/variants (size/color/etc.), 1 short video, multiple images, status (draft/pending/published/rejected).

### 2.6 Category & Unit Management
- Multi-level category tree (Category → Subcategory), with icon/image per category (for the landing page category section).
- Unit CRUD (kg, pcs, box, litre, etc.), attachable per product.

### 2.7 Delivery / Logistics Management
- CRUD delivery providers: name, logo, coverage area, base pricing rule, API credentials (if integrated) or manual-assignment mode.
- Zone-based shipping fee configuration.
- Delivery status codes shown consistently to shop + customer (mirrors Lazhop's real-time tracking).

### 2.8 Promotions & Payments (platform-level)
- Manage platform-wide banners for the landing page (image, link target, schedule).
- Configure accepted payment methods (COD, bank transfer, mobile wallet e.g. BCEL One/LAPNet/U-Money, card via gateway) and their availability per region.

### 2.9 Reports
- Sales (platform-wide, by shop, by category, by product).
- Financial: platform revenue vs. shop payouts, commission collected, refunds issued.
- Customer acquisition & retention.
- Exportable as CSV/Excel/PDF; scheduled email reports (nice-to-have).

### 2.10 Disputes & Refunds
- Central queue for order disputes/refund requests escalated from shops or raised by customers, with resolution workflow and audit trail.

### 2.11 CMS & System Settings
- Editable pages: About, Terms & Conditions, Privacy Policy, FAQ (mirrors Thaimart's legal pages).
- Platform settings: currency (LAK default), tax rate, supported languages (Lao / Thai / English), timezone.
- Push/broadcast announcements to all shops or all customers.

---

## 3. Shop Module

### 3.1 Authentication
- Register (with business info + KYC document upload), login, logout.
- Forgot-password / reset-password (email or OTP-based).
- **2FA**: TOTP (authenticator app) or SMS OTP — configurable per shop.
- Login/device history for security review.

### 3.2 Shop Profile
- Name, logo, cover image, description, address/map pin, business hours, contact channels, social links.
- Verification status badge once admin-approved (trust signal like Thaimart's DBD badge).

### 3.3 Product Management
- Full CRUD with: id, name, SKU, price, compare-at price, stock, unit, category, variants/attributes, **1 short video + multiple images**, status.
- Bulk import/export via CSV/Excel.
- Inventory tracking with low-stock threshold alerts.
- Product review/moderation status visibility (why a listing was rejected, if applicable).

### 3.4 Discounts & Promotions
- Percentage/fixed-amount discounts, coupon codes (shop-scoped), scheduled flash sales, bundle/combo deals.
- Usage limits (per customer, total uses, date range).

### 3.5 Shop Customer Management
- List of customers who've purchased from the shop; basic CRM notes.
- Direct messaging to customers (order-related).
- Blacklist capability for abusive buyers (subject to platform policy).

### 3.6 Order Management
- Order queue by status: pending → confirmed → packed → shipped → delivered → completed / cancelled / return-requested.
- Assign delivery partner, print packing slip/invoice/shipping label.
- Handle return/refund requests within policy limits (escalate to admin if over threshold).
- **Order deadline logic** (inspired by Lazhop): configurable payment window and auto-confirmation window, with limited buyer-initiated extensions — reduces disputes from both sides.

### 3.7 Shop Financials
- Daily / weekly / monthly sales dashboards.
- Payout/settlement history, commission breakdown, downloadable statements.

### 3.8 Reviews
- View and respond to product/shop reviews.

### 3.9 (Phase 2) Live Selling & Video
- Go-live capability with product pinning during stream, live chat, and post-stream replay — matches both references' live-commerce focus.
- Staff sub-accounts per shop (multiple employees, scoped permissions) for larger vendors.

---

## 4. Customer Module

### 4.1 Authentication
- Register (email/phone, optional social login), login, logout.
- Forgot/reset password, **2FA** (optional, encouraged for high-value accounts).

### 4.2 Profile
- Personal info, avatar, multiple saved addresses with a default, saved payment methods.

### 4.3 Discovery
- Search with autocomplete; **image/barcode scan search** (per your landing-page requirement — client-side barcode via device camera, optional AI reverse-image search as a stretch goal).
- Filters: category, price range, rating, shop, delivery availability.
- Product detail: image gallery, short video, variants, stock, reviews/Q&A, related products, shop link.

### 4.4 Cart & Checkout
- Multi-shop cart (auto-split into per-shop sub-orders at checkout, since each shop fulfills independently).
- Coupon application, delivery method selection, payment method selection, order summary/confirmation.

### 4.5 Orders
- Order history, **real-time tracking** (status + delivery partner tracking reference), reorder, cancel (within window), return/refund request, rate & review post-delivery.
- Extend payment/auto-confirm deadline (Phase 2, mirrors Lazhop).

### 4.6 Points / Loyalty
- Earn points per completed order (rate set by admin), point balance, redemption at checkout, expiry visibility, transaction history.

### 4.7 Wishlist & Notifications
- Wishlist/favorites.
- Push/email notifications: order status changes, promotions, price drops on wishlist items, chat messages.

### 4.8 (Phase 2) Support & Social
- In-app chat to shop; **AI chat assistant** for common FAQs/order status (mirrors Lazhop) with human handoff.
- Video feed browsing / live stream viewing and buying.

---

## 5. Landing Page (Public Storefront)

- **Header**: logo, search bar (autocomplete), image/barcode scan icon, cart icon with live item count, account/login icon, language switcher (Lao/Thai/English).
- **Hero/banner carousel**: admin-managed promotional banners, clickable to category/product/shop, scheduled start/end dates.
- **Category section**: icon or image grid, horizontal scroll on mobile.
- **Popular products** section (algorithm: best-selling / most-viewed, admin can pin/override).
- **New arrivals** and **flash sale/deals** (countdown timer) sections — small additions that noticeably lift engagement on similar platforms.
- **Featured shops** carousel.
- **(Phase 2) Live now / video feed** strip — mirrors Thaimart's "ไลฟ์สดตอนนี้" (live now) section.
- **Footer**: About, Terms, Privacy, payment method logos, delivery partner logos, social links, app store badges, business verification badge (if applicable in Laos), contact/support info.

---

## 6. Cross-Cutting Requirements

- **Localization**: Lao, Thai, English at minimum; currency LAK.
- **Payments**: local mobile wallets/QR (e.g., BCEL One, LAPNet, U-Money), bank transfer, COD, and a card gateway (e.g., 2C2P or Stripe) for card acceptance.
- **Notifications**: push (mobile), email, SMS/OTP for 2FA and order alerts.
- **Search**: dedicated search engine (not just DB `LIKE` queries) for autocomplete and relevance ranking at scale.
- **Media pipeline**: image optimization/CDN; video upload with transcoding for the "1 short video per product" requirement; separate, more demanding pipeline if live streaming is added in Phase 2.
- **Security**: encrypted secrets, rate limiting on auth endpoints, input validation on all uploads (file type/size), HTTPS everywhere, PDPA-style data handling given personal data collected (location, contact info — same categories Lazhop itself discloses collecting).
- **Reviews & ratings** apply to both products and shops.
- **Analytics**: event tracking (funnel: view → cart → checkout → purchase) for both admin BI and shop-level insight.

---

## 7. Suggested Phasing

**MVP (Phase 1)**
- All 3 auth flows (Admin/Shop/Customer) incl. 2FA and password reset.
- Shop onboarding + approval workflow.
- Product CRUD with image + 1 video upload.
- Category/unit management.
- Cart, checkout, multi-shop order splitting.
- Manual or single-partner delivery assignment + status tracking.
- Discounts/coupons (basic).
- Points (basic earn/redeem).
- Landing page as specified (without live section).
- Admin dashboard + core reports.
- Shop financial reports (daily/weekly/monthly).

**Phase 2**
- Live streaming + video feed discovery.
- AI chat assistant for support.
- Advanced image/reverse-image search.
- Multi-delivery-partner API integrations with live tracking webhooks.
- Referral program, staff sub-accounts per shop, scheduled/automated reports.

---

## 8. Tech Stack Analysis

Both references point toward a modern, SEO-friendly storefront with heavy media (video/live) needs and native mobile apps — that shapes the recommendation below. Presented as a default recommendation with alternatives, since team skill set should have the final say.

### 8.1 Frontend

| Layer | Recommendation | Why |
|---|---|---|
| Customer web + Landing page | **Next.js (React) + Tailwind CSS** | Server-side rendering for SEO (product/category pages need to be indexable, like Thaimart's site), good image/video handling, PWA-capable so it doubles as an installable app early on. |
| Admin dashboard | **React (Vite) + a component library** (Ant Design or shadcn/ui) | Data-dense CRUD/reporting UI; doesn't need SSR/SEO. |
| Shop dashboard | Same stack as Admin | Shares components/design system with Admin, speeds up build. |
| Mobile apps (Customer + Shop) | **Flutter** *or* **React Native** — pick one | Flutter: single codebase, strong performance for video/live UI, but a separate language (Dart) from your web team. React Native: shares logic/TypeScript with the React web/admin code, easier for a JS-only team, slightly more native-module friction for live streaming SDKs. **Recommendation: React Native if your team is JS-first; Flutter if you're optimizing purely for app performance and video-heavy UX.** |

### 8.2 Backend

| Concern | Recommendation | Alternative |
|---|---|---|
| API framework | **NestJS (Node.js + TypeScript)** — modular monolith to start, split into services later (catalog, orders, payments, media) as load grows | **Laravel (PHP)** — very common in SEA e-commerce builds, faster to find local developers/agencies in Thailand/Laos region, strong ecosystem for e-commerce (Spatie packages, admin scaffolding) |
| Primary database | **PostgreSQL** | MySQL/MariaDB (fine, especially if pairing with Laravel) |
| Caching / queues | **Redis** (cache, session store, job queue via BullMQ or Laravel Queues) | — |
| Search | **Meilisearch** (self-hostable, fast to set up) or **Elasticsearch** (more powerful, heavier ops) | Algolia (managed, costs scale with usage) |
| Object storage | **S3-compatible** (AWS S3, DigitalOcean Spaces, or self-hosted MinIO if data residency in Laos matters) | — |
| CDN | **CloudFront or Cloudflare** in front of storage | — |
| Video transcoding | **Mux** or **AWS MediaConvert** for the "1 short video per product" requirement | Self-hosted FFmpeg pipeline (cheaper, more ops work) |
| Live streaming (Phase 2) | **Ant Media Server** (self-hosted, popular/cost-effective in SEA) or **Agora/Mux Live** (managed, faster to integrate) | — |
| Real-time (chat, live order updates) | **Socket.io** (Node) or **Laravel Echo + Pusher/self-hosted WebSockets** | — |
| Payments | Integrate local gateways: **BCEL One Pay, LAPNet, JDB, U-Money**; card acceptance via **2C2P** (strong SEA coverage) or **Stripe** if cross-border cards needed | — |
| SMS/OTP | Local telecom SMS gateway (for Laos delivery reliability) or **Twilio** as fallback | — |
| AI chat assistant (Phase 2) | Claude or OpenAI API behind a support-scoped prompt + order-lookup tool calls | — |
| Barcode/image scan (customer search) | Client-side barcode scanning (ZXing / ML Kit) in the app; optional server-side reverse-image search via a vision API for the stretch goal | — |

### 8.3 Infrastructure & DevOps
- **Containerization**: Docker for all services; Docker Compose for local dev.
- **Orchestration**: start with a managed container platform (e.g., AWS ECS/Fargate or DigitalOcean App Platform) rather than full Kubernetes until scale justifies the ops overhead.
- **CI/CD**: GitHub Actions (build, test, deploy).
- **Monitoring/Errors**: Sentry for error tracking; Grafana + Prometheus (or a managed APM) once traffic grows.
- **Hosting region**: consider proximity to Laos/Thailand (e.g., AWS ap-southeast-1 Singapore) for latency, and check any local data-residency expectations before finalizing.

### 8.4 Suggested repo/service split for Claude Code
1. `apps/web` — Next.js customer + landing storefront
2. `apps/admin` — React admin dashboard
3. `apps/shop` — React shop dashboard (can share a component package with admin)
4. `apps/mobile` — React Native or Flutter customer/shop app
5. `services/api` — NestJS or Laravel backend (modular: auth, catalog, orders, payments, media, notifications modules)
6. `packages/ui` — shared design system/components (if using React across web+admin+shop)
7. `infra/` — Docker, CI/CD, IaC (Terraform, optional at MVP stage)

---

*Prepared from your original scope plus feature analysis of thaimart.com and the Lazhop app (Google Play id: tgsoft.dev.tgshop).*
