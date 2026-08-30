# WorkFlow Pay — Order, Earnings & Payments Platform
## Product Requirements Document (PRD) + Technical Requirements Document (TRD)
**Version:** 2.0 (Production — Mobile Web / Vanilla JS / Supabase / GitHub Pages) | **Date:** 30 Aug 2026 | **Owner:** Nitin Kumar

> **v2.0 change note:** platform target is now a **mobile-first responsive web app** (not a React SPA). Frontend is hand-written HTML + CSS + vanilla JS (no build step, no framework), talking directly to Supabase via `supabase-js` loaded from CDN, and deployed as a static site on **GitHub Pages**. Backend remains 100% Supabase (Postgres, Auth, Storage, Realtime, Edge Functions). This mirrors the single-file app pattern already proven in the `ledger_diary.html` prototype (hash-based nav, render-to-`#content`, localStorage) — same pattern, with `localStorage` swapped for Supabase as the source of truth.

---

# PART A — PRODUCT REQUIREMENTS DOCUMENT (PRD)

## A1. Overview

WorkFlow Pay is a two-sided platform connecting a **Business/Supplier (Admin)** side, which sources and assigns piece-rate work orders, to an **End-User (Worker)** side, which accepts orders, completes quantity-based work, and gets paid per approved unit.

The system has one governing principle: **the end user never touches business economics.** They see only what they were assigned, what they finished, what got approved, what they earn, and when they get paid. All pricing, margins, commissions, and supplier costs live exclusively on the Admin side, enforced at the data layer — not just hidden in the UI.

## A2. Goals

| Goal | Success Signal |
|---|---|
| Give end users a dead-simple order → earn → get-paid loop | < 3 taps from dashboard to viewing "why I earned ₹X" |
| Give admins/suppliers full control over pricing, assignment, and verification without user-side leakage | Zero business-cost fields reachable via any user-facing API/RLS path |
| Make payment trustworthy and auditable | Every rupee paid traces to an approved order line; full reconciliation report |
| Work identically on mobile and desktop | Single responsive codebase, no feature gaps between breakpoints |
| Be safe to run in production with real bank data | PCI/DPDP-aligned handling of bank + KYC data (masking, encryption, access control) |

## A3. Non-Goals (v1)

- No open marketplace / bidding — orders are admin-assigned, not user-claimed from a public pool (can be added later as "Available Orders" pool).
- No multi-currency (INR only for v1).
- No sub-user hierarchies (team leads managing other workers) — flagged as a fast-follow.
- No in-app chat/dispute messaging beyond structured rejection reasons.

## A4. Personas

1. **End User / Worker** — receives orders, performs physical/digital piece-rate work, submits completed quantities, tracks earnings, receives payouts.
2. **Admin / Business Owner** — creates products, sets rates, assigns orders, verifies submissions, approves quantities, triggers payouts, manages the user base.
3. **Ops/Verifier (Admin sub-role)** — reviews submitted proof and approves/rejects quantities; may not have pricing or payout permissions.
4. **Finance (Admin sub-role)** — initiates and reconciles payments; sees payment data, not necessarily order-assignment tools.

## A5. End-User Functional Requirements

### A5.1 Registration & Onboarding
- Register with name, mobile (OTP-verified), optional email, DOB, gender, password.
- Auto-generated human-readable `user_code` (e.g. `USR-000124`).
- Guided, resumable multi-step profile completion with a visible progress bar: **Profile → Contact → Address → Bank → Documents**. Each step is independently save-able (no all-or-nothing wizard).
- Mobile and, where provided, alternate contact are OTP-verified before being marked complete.

### A5.2 Profile, Address, Bank, KYC
- Structured address (not free text) with multiple saved addresses and a default flag.
- Bank details captured once, validated (name-match via penny-drop or bank API where available), and **never redisplayed in full** — always masked (`XXXX XXXX 4521`) after save. Full number is never sent to the client again post-save.
- Document upload for identity/address/bank proof; document *types required* are **admin-configurable**, not hardcoded, since different businesses need different KYC sets.
- Verification state machine: `not_submitted → submitted → under_review → verified | rejected (→ resubmit)`.
- Account cannot receive live orders until required KYC steps admin has marked mandatory are `verified` (configurable — some businesses may allow orders pre-verification and hold payment instead).

### A5.3 Dashboard
- Greeting, total earnings, orders/pending/paid summary tiles.
- Quick links: New Orders, Earnings, Payments, Order History.
- Recent orders list with earning-per-order shown inline.

### A5.4 Orders
- Order card shows: order code, product, assigned quantity, **user rate** (never base/admin price), computed earning, due date, status badge.
- Order detail page shows full quantity breakdown (assigned / completed / approved / rejected / remaining) and a transparent earnings computation (`qty × rate = ₹`) for expected, completed, and remaining.
- Order status lifecycle (see A5.6) drives available actions (Accept, Submit, view rejection reason, Resubmit).
- Submission includes quantity claimed + optional proof (photo/file) + notes.

### A5.5 Earnings
- Aggregate: total earned, paid, pending.
- Per-order breakdown table (qty, rate, earned, status).
- Earnings are generated **only from approved quantity**, never from assigned or submitted-but-unverified quantity.

### A5.6 Order Status Lifecycle
```
Created → Assigned → Accepted → In Progress → Submitted → Verified → Completed
                                                   │
                                                   └→ Rejected → Correction Required → Resubmitted → (back to Submitted)
Completed → Payment Pending → Paid
```

### A5.7 Payments
- Available balance, pending, processing, paid — all sourced from the earnings ledger, never a manually-editable balance field.
- Payment history list; each payment expands to show amount, the exact order codes it settled, method, transaction reference, status, date.

### A5.8 Notifications
Order assigned, due-date reminder, submission verified/rejected, earnings credited, payment completed. Delivered in-app (always) + push (if opted in) + SMS for payment completion (recommended default-on, since it's money).

### A5.9 Profile / Settings
- View/edit personal, contact, address, bank, documents.
- Notification preferences, security (change password, active sessions), logout.
- Profile completion percentage.

## A6. Admin/Supplier Functional Requirements

- **Product & Rate Management:** create products, set base price, sale price, and the **user rate per piece** (the only figure exposed to workers); rates can be versioned per product/user-tier without mutating historical order rates (an order snapshots its rate at assignment time).
- **User Management:** view/search users, verification queue (approve/reject documents with a reason), suspend/reactivate accounts, per-user rate overrides.
- **Order Management:** create/bulk-assign orders to one or many users, set due dates, monitor status across the fleet, bulk reassign overdue orders.
- **Verification Queue:** review submitted quantity + proof, approve full/partial quantity or reject with a required reason (drives the Correction Required state).
- **Earnings & Payables:** see a rollup of what's owed across all users, drill into any user's earnings ledger.
- **Payments:** batch-initiate payouts (UPI/bank transfer), see success/failure per transaction, retry failed payouts, full reconciliation export.
- **Business Analytics (admin-only):** margin per product (sale price − user rate − supplier cost), completion rates, on-time rates, per-user productivity — none of this is ever reachable from a user-scoped API key/session.
- **Configuration:** which KYC documents are mandatory, whether orders can be issued pre-verification, notification templates, payout method priority.
- **RBAC:** Admin, Verifier, Finance, Support roles with distinct permission sets (see TRD §B7).

## A7. Non-Functional Requirements

| Category | Requirement |
|---|---|
| Availability | 99.5% for the API/DB layer (Supabase managed Postgres + PgBouncer) |
| Performance | Dashboard/API P95 < 400ms; order list pagination, not full loads |
| Security | RLS on every table; bank data encrypted at rest; masked in all read paths except a single admin-audited decrypt path |
| Compliance | DPDP Act (India) consent + data-minimization; financial data handling aligned with RBI data-localization guidance for payment data |
| Auditability | Immutable audit log for: rate changes, quantity approvals, payment initiation/status changes |
| Responsiveness | One static codebase (HTML/CSS/JS, no framework, no build step), mobile-first fluid layout — bottom-tab nav under 900px, sidebar/nav rail above it, identical feature set at every width |
| Offline resilience | Submission form queues in `localStorage` and retries against Supabase on reconnect (mobile field-work use case); installable as a PWA via a manifest + service worker |
| Hosting | Fully static — deployable as-is to **GitHub Pages**; no server process to run or scale, since all logic lives in Supabase (Postgres/RLS/Edge Functions) |

## A8. Release Plan

- **Phase 1 (MVP):** Registration→KYC, order assign/accept/submit/verify, earnings ledger, manual/batch payout marking, core notifications.
- **Phase 2:** Automated payout via payment gateway (Razorpay Payouts/Cashfree), penny-drop bank verification, push notifications, admin analytics.
- **Phase 3:** Available-orders pool (self-claim), team-lead hierarchy, multi-business/tenant support.

---

# PART B — TECHNICAL REQUIREMENTS DOCUMENT (TRD)

## B1. Architecture Overview

```
┌─────────────────────┐        ┌─────────────────────┐
│  user.html (worker)  │        │  admin.html          │
│  Plain HTML+CSS+JS    │        │  Plain HTML+CSS+JS    │
│  mobile-first,         │        │  same pattern,         │
│  bottom-tab nav        │        │  sidebar/nav rail      │
│  supabase-js via CDN   │        │  supabase-js via CDN   │
│  hosted on GitHub Pages│        │  hosted on GitHub Pages│
└──────────┬───────────┘        └──────────┬───────────┘
           │  supabase-js (Auth, Realtime, Storage, RPC)
           │  anon key only — every write goes through RLS
           │  or an Edge Function, never trusts the client
           ▼
┌────────────────────────────────────────────────────┐
│                     Supabase                        │
│  ┌───────────┐ ┌───────────┐ ┌───────────────────┐ │
│  │  Auth      │ │ Postgres   │ │ Edge Functions      │ │
│  │  (OTP/JWT) │ │ + RLS      │ │ (Deno) — payouts,   │ │
│  │            │ │            │ │ webhooks, cron       │ │
│  └───────────┘ └───────────┘ └───────────────────┘ │
│  ┌───────────┐ ┌───────────┐ ┌───────────────────┐ │
│  │  Storage   │ │ Realtime   │ │ Vault / pgsodium    │ │
│  │  (KYC docs)│ │ (order     │ │ (bank data encrypt) │ │
│  │            │ │ status)    │ │                     │ │
│  └───────────┘ └───────────┘ └───────────────────┘ │
└──────────────────────┬───────────────────────────────┘
                        │
          ┌─────────────┼─────────────┐
          ▼             ▼             ▼
     SMS/OTP        Push (FCM)    Payout Gateway
     (MSG91/         + Email       (Razorpay
      Twilio)        (Resend)      Payouts /
                                    Cashfree)
```

**Why Supabase fits this domain:** Postgres RLS gives row-level, role-aware isolation between admin and user data with no application-layer trust required; `pgsodium`/Vault gives column-level encryption for bank details; Edge Functions host the payout state machine and webhook handlers server-side, outside client trust; Realtime pushes order-status changes to the worker's dashboard live.

**Why a static vanilla frontend is safe here (no backend of its own):** because *all* business rules already live in Postgres RLS + Edge Functions (§B4–B6), the frontend is inherently untrusted and stateless — it only ever holds the public `anon` key. A static HTML/JS bundle on GitHub Pages has exactly the same security posture as a React SPA on Vercel for this architecture: neither can be trusted with secrets, and neither needs to be, because the database itself refuses unauthorized reads/writes regardless of what the client sends. This is what makes GitHub Pages (free, static-only, no server) a legitimate production choice instead of a corner cut.

## B2. Tech Stack

- **Frontend (both apps):** Plain **HTML + CSS + vanilla JavaScript**, no framework, no bundler/build step — same architecture pattern as the provided `ledger_diary.html` prototype: a single shell page per app (`index.html` for the worker app, `admin.html` for the admin app) with a `render()` dispatcher, a `#content` mount node, hash-based routing (`#orders`, `#earnings`, …), and small `xxxForm()`/`xxxTable()` template-string functions instead of components.
  - `supabase-js` (UMD build) loaded straight from `https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2` — no npm install, no build tooling, matching the "open `index.html`, it just runs" spirit of the prototype.
  - CSS: a single `styles.css` (lift the prototype's design tokens — CSS variables for `--bg/--card/--accent` etc. — directly; they already carry mobile breakpoints at 900px/560px, which line up with §A7's mobile-first requirement).
  - State: a small in-memory `app.state` object (current page, current session, cached lookups) rather than a framework store; Supabase is the real source of truth, re-fetched on navigation and kept live via Realtime subscriptions.
  - Mobile-first layout: bottom tab bar under 900px (as in the prototype's `.user-nav`/sidebar-collapse pattern), sidebar/nav rail above it — identical markup, CSS-only layout switch, no JS branching needed.
- **PWA layer:** `manifest.json` (installable, standalone display) + a minimal service worker caching the app shell (HTML/CSS/JS) so the UI loads offline; data itself is Supabase-backed, so the service worker caches *assets*, while `localStorage` queues pending writes (order submissions) for retry per §A7.
- **Backend:** Supabase (Postgres 15, GoTrue Auth, PostgREST, Realtime, Storage, Edge Functions on Deno) — unchanged from v1.
- **Payments:** Razorpay Payouts (or Cashfree Payouts) via Edge Function, webhook-verified.
- **OTP/SMS:** MSG91 or Twilio Verify, invoked from an Edge Function (never call third-party secrets from the client).
- **Push:** Firebase Cloud Messaging (Web Push, called from the service worker).
- **File storage:** Supabase Storage, private buckets, signed URLs with short TTL for KYC documents.
- **Observability:** Supabase logs + a lightweight client-side error hook (`window.onerror` → a `client_errors` table or Sentry's browser SDK via CDN) + the `audit_log` table for business-critical events.
- **CI/CD:** GitHub Actions — one job lints/deploys the static `docs/` (or `gh-pages` branch) folder straight to GitHub Pages on push to `main`; a second job runs `supabase db push` against a staging project, promoted to prod on tag.

## B3. Database Schema (Postgres / Supabase)

All monetary values stored as `numeric(12,2)`. All tables have `created_at timestamptz default now()`; mutable tables also get `updated_at` maintained by a trigger. `id` is `uuid default gen_random_uuid()` throughout.

```sql
-- ============ IDENTITY ============
create type user_status as enum ('active','suspended','pending_verification');
create type verification_status as enum ('not_submitted','submitted','under_review','verified','rejected');
create type admin_role as enum ('super_admin','admin','verifier','finance','support');

create table users (
  id uuid primary key references auth.users(id) on delete cascade,
  user_code text unique not null,              -- USR-000124, generated by trigger/sequence
  full_name text not null,
  mobile text unique not null,
  mobile_verified boolean not null default false,
  email text,
  status user_status not null default 'pending_verification',
  overall_verification verification_status not null default 'not_submitted',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table user_profiles (
  user_id uuid primary key references users(id) on delete cascade,
  dob date,
  gender text,
  father_husband_name text,
  occupation text,
  experience text,
  preferred_work_type text,
  profile_photo_path text,                     -- storage path, not public URL
  updated_at timestamptz not null default now()
);

create table addresses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  type text not null check (type in ('home','work','other')),
  address_line_1 text not null,
  address_line_2 text,
  area text not null,
  city text not null,
  district text not null,
  state text not null,
  pincode text not null,
  landmark text,
  is_default boolean not null default false,
  created_at timestamptz not null default now()
);
create unique index one_default_address_per_user
  on addresses(user_id) where is_default;

-- ============ BANK (ENCRYPTED) ============
create table bank_accounts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  account_holder_name text not null,
  bank_name text not null,
  account_number_encrypted bytea not null,      -- pgsodium/Vault secret-box
  account_number_last4 text not null,           -- for display: XXXX XXXX 4521
  ifsc text not null,
  branch_name text,
  account_type text check (account_type in ('savings','current')),
  upi_id text,
  verification_status verification_status not null default 'not_submitted',
  is_primary boolean not null default true,
  created_at timestamptz not null default now()
);
-- Only decrypted via a SECURITY DEFINER function invoked from a
-- payout Edge Function, service-role only. Never exposed via PostgREST directly.

create table kyc_document_types (           -- ADMIN-CONFIGURABLE, not hardcoded
  id uuid primary key default gen_random_uuid(),
  code text unique not null,                     -- 'identity','address_proof','bank_proof'
  label text not null,
  is_mandatory boolean not null default true,
  active boolean not null default true
);

create table kyc_documents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  document_type_id uuid not null references kyc_document_types(id),
  storage_path text not null,                    -- private bucket path
  status verification_status not null default 'submitted',
  rejection_reason text,
  reviewed_by uuid references admin_users(id),
  reviewed_at timestamptz,
  created_at timestamptz not null default now()
);

-- ============ ADMIN SIDE ============
create table admin_users (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null,
  role admin_role not null,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table products (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  sku text unique,
  base_price numeric(12,2) not null,             -- admin-only: cost/supplier price
  sale_price numeric(12,2) not null,              -- admin-only: what customer pays
  default_user_rate numeric(12,2) not null,       -- exposed to users, per piece
  active boolean not null default true,
  created_by uuid references admin_users(id),
  created_at timestamptz not null default now()
);

create table user_rate_overrides (               -- per-user custom rate, optional
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  product_id uuid not null references products(id) on delete cascade,
  rate numeric(12,2) not null,
  effective_from timestamptz not null default now(),
  created_by uuid references admin_users(id),
  unique (user_id, product_id)
);

-- ============ ORDERS ============
create type order_status as enum (
  'created','assigned','accepted','in_progress','submitted',
  'verified','completed','rejected','correction_required',
  'resubmitted','payment_pending','paid','cancelled'
);

create table orders (
  id uuid primary key default gen_random_uuid(),
  order_code text unique not null,               -- ORD-00241
  user_id uuid not null references users(id),
  product_id uuid not null references products(id),
  assigned_quantity int not null check (assigned_quantity > 0),
  submitted_quantity int not null default 0,
  approved_quantity int not null default 0,
  rejected_quantity int not null default 0,
  user_rate numeric(12,2) not null,               -- SNAPSHOT at assignment time
  status order_status not null default 'created',
  assigned_at timestamptz,
  due_date date,
  completed_at timestamptz,
  created_by uuid references admin_users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint approved_le_submitted check (approved_quantity <= submitted_quantity),
  constraint submitted_le_assigned check (submitted_quantity <= assigned_quantity)
);

create table order_submissions (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references orders(id) on delete cascade,
  submitted_quantity int not null check (submitted_quantity > 0),
  proof_storage_path text,
  notes text,
  verification_status verification_status not null default 'submitted',
  rejection_reason text,
  reviewed_by uuid references admin_users(id),
  reviewed_at timestamptz,
  submitted_at timestamptz not null default now()
);

-- ============ EARNINGS & PAYMENTS ============
create type earning_status as enum ('accrued','payable','processing','paid');

create table user_earnings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id),
  order_id uuid not null references orders(id) unique,  -- one earning row per order
  approved_quantity int not null,
  rate numeric(12,2) not null,
  amount numeric(12,2) generated always as (approved_quantity * rate) stored,
  status earning_status not null default 'accrued',
  created_at timestamptz not null default now()
);

create table payments (
  id uuid primary key default gen_random_uuid(),
  payment_code text unique not null,             -- PAY-00031
  user_id uuid not null references users(id),
  amount numeric(12,2) not null,
  payment_method text not null check (payment_method in ('upi','bank_transfer')),
  transaction_reference text,
  gateway_payload jsonb,                          -- raw gateway response, admin-only
  status text not null default 'initiated'
    check (status in ('initiated','processing','successful','failed')),
  initiated_by uuid references admin_users(id),
  paid_at timestamptz,
  created_at timestamptz not null default now()
);

create table payment_earnings (                  -- many-to-many: one payout settles many earnings
  payment_id uuid not null references payments(id) on delete cascade,
  earning_id uuid not null references user_earnings(id) on delete cascade,
  primary key (payment_id, earning_id)
);

-- ============ NOTIFICATIONS & AUDIT ============
create table notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references users(id),
  admin_user_id uuid references admin_users(id),
  type text not null,                              -- 'order_assigned','payment_completed', etc.
  title text not null,
  body text not null,
  read boolean not null default false,
  created_at timestamptz not null default now()
);

create table audit_log (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid,                                    -- admin_users.id or users.id
  actor_type text not null check (actor_type in ('admin','user','system')),
  action text not null,                             -- 'rate_changed','quantity_approved','payout_initiated'
  entity_table text not null,
  entity_id uuid not null,
  before jsonb,
  after jsonb,
  created_at timestamptz not null default now()
);
```

## B4. Row-Level Security (the core of the admin/user data segregation)

```sql
alter table users, user_profiles, addresses, bank_accounts, kyc_documents,
      orders, order_submissions, user_earnings, payments, notifications
  enable row level security;

-- Users can only read/write their own rows
create policy "user_self_select" on users
  for select using (auth.uid() = id);
create policy "user_self_update" on users
  for update using (auth.uid() = id)
  with check (auth.uid() = id);

create policy "user_own_orders" on orders
  for select using (auth.uid() = user_id);
-- Users may NOT insert/update orders directly at all — no policy = no access;
-- all order mutation goes through Edge Functions / RPC using the service role.

create policy "user_own_earnings" on user_earnings
  for select using (auth.uid() = user_id);
-- amount/rate are visible; base_price/sale_price live only in `products`,
-- which has NO select policy for the `authenticated` role at all — so a
-- worker's JWT can never read products.base_price, full stop, regardless
-- of what the client app does.

create policy "user_own_payments" on payments
  for select using (auth.uid() = user_id);

create policy "user_own_bank" on bank_accounts
  for select using (auth.uid() = user_id);
-- account_number_encrypted is bytea and useless without the Vault key held
-- only by the service role, so even this self-select can't leak the number.

-- Admin roles: bypass via a security-definer helper checked against admin_users
create or replace function is_admin_role(required_roles admin_role[])
returns boolean language sql stable security definer as $$
  select exists (
    select 1 from admin_users
    where id = auth.uid() and active and role = any(required_roles)
  );
$$;

create policy "admin_full_orders" on orders
  for all using (is_admin_role(array['super_admin','admin']::admin_role[]));

create policy "verifier_read_update_submissions" on order_submissions
  for select using (is_admin_role(array['super_admin','admin','verifier']::admin_role[]));
create policy "verifier_update_submissions" on order_submissions
  for update using (is_admin_role(array['super_admin','admin','verifier']::admin_role[]));

create policy "finance_payments" on payments
  for all using (is_admin_role(array['super_admin','admin','finance']::admin_role[]));

-- products: admin-only, no policy at all for plain `authenticated` role
create policy "admin_products" on products
  for all using (is_admin_role(array['super_admin','admin']::admin_role[]));
```

**Key design point:** the *absence* of a policy is the default-deny. `products.base_price` and `sale_price`, `orders.created_by`, and `payments.gateway_payload` are never exposed by any policy reachable with a worker's JWT — this is enforced at the database, so even a compromised or buggy frontend cannot leak it. This directly implements the PRD's "proper data segregation" requirement (A6, A5.6) at the strongest layer available.

## B5. Business Logic — Edge Functions (Deno, service-role)

All quantity/earning/payment mutations run through Edge Functions, never direct client writes, so invariants are enforced once, centrally:

| Function | Trigger | Responsibility |
|---|---|---|
| `assign-order` | Admin action | Validates product/rate, snapshots `user_rate` onto the order, sets `status='assigned'`, writes `notifications` + `audit_log` |
| `accept-order` | User action | `assigned → accepted`, only if `auth.uid() = orders.user_id` |
| `submit-order` | User action | Inserts `order_submissions`, sets `orders.status='submitted'`, `submitted_quantity` |
| `verify-submission` | Verifier action | Sets `approved_quantity`/`rejected_quantity`, transitions order to `verified`/`correction_required`; on full approval, **inserts the `user_earnings` row** (this is the only writer of that table) |
| `initiate-payout` | Finance action, batch | Selects `payable` earnings for chosen users, groups by user, calls Razorpay/Cashfree Payouts API using the **decrypted** bank details (via a Vault-key security-definer call, never returned to any client), creates `payments` + `payment_earnings` rows, sets earnings to `processing` |
| `payout-webhook` | Gateway callback | Verifies webhook signature, updates `payments.status`, on success sets earnings `paid` and fires the "payment completed" notification |
| `otp-send` / `otp-verify` | Registration/login | Calls SMS provider; never exposes provider secret to client |
| `cron-due-date-reminder` | Scheduled (pg_cron → Edge Function) | Notifies users of orders due tomorrow |

## B6. Earnings Calculation (single source of truth)

```
user_earnings.amount = approved_quantity × rate   -- generated column, cannot drift
orders.remaining_quantity (view)  = assigned_quantity − approved_quantity
payable_amount (per user)          = sum(user_earnings.amount) where status = 'payable'
```
Earnings are **only** created by `verify-submission` on approval — never by order assignment, never by user submission alone. This directly encodes PRD §A5.5/A6's "no payment without approval" rule as an insert-path guarantee, not a UI rule.

## B7. RBAC Summary

| Role | Products/Rates | Assign Orders | Verify Submissions | Initiate Payouts | View Business Analytics |
|---|---|---|---|---|---|
| super_admin | ✓ | ✓ | ✓ | ✓ | ✓ |
| admin | ✓ | ✓ | ✓ | ✓ | ✓ |
| verifier | – | – | ✓ | – | – |
| finance | – | – | – | ✓ | Payment reports only |
| support | – | – | – | – | Read-only user/order lookup |

## B8. API Surface (via PostgREST + RPC, consumed by supabase-js)

- `GET /rest/v1/orders?user_id=eq.{self}` — user's orders (RLS-scoped, no admin filter needed client-side)
- `GET /rest/v1/user_earnings?user_id=eq.{self}&select=*,orders(order_code,product_id)`
- `POST /functions/v1/submit-order` `{order_id, quantity, proof_path, notes}`
- `POST /functions/v1/verify-submission` `{submission_id, approved_quantity, decision, reason?}`
- `POST /functions/v1/initiate-payout` `{user_ids[]}`
- Realtime channel `orders:user_id=eq.{self}` for live status badges without polling.

## B9. UI/Code Architecture (responsive, static, one repo — mirrors `ledger_diary.html`)

```
/ (repo root — this whole tree is what GitHub Pages serves)
├── index.html            # worker (end-user) app shell — <div id="content"> + bottom nav
├── admin.html             # admin/supplier app shell — <div id="content"> + sidebar
├── manifest.json          # PWA manifest (worker app; installable on mobile)
├── sw.js                  # service worker — caches app shell for offline
├── /assets
│   ├── styles.css          # shared design tokens + both layouts (prototype's :root vars)
│   └── icons/…             # PWA icons, favicons
├── /js
│   ├── supabase-client.js  # createClient(url, anonKey); one shared instance
│   ├── auth.js              # login/OTP/session guard, shared by both shells
│   ├── router.js            # hash-router: reads location.hash, calls the matching render fn
│   ├── state.js              # small app.state object + pub-sub for re-render on change
│   ├── realtime.js           # subscribes to `orders`/`notifications` channels, triggers re-render
│   ├── /user                 # worker-app render functions (one file per screen, like ledger_diary.html's page fns)
│   │   ├── onboarding.js      # register → profile → contact → address → bank → documents
│   │   ├── dashboard.js
│   │   ├── orders.js           # list + detail + submit form
│   │   ├── earnings.js
│   │   ├── payments.js
│   │   └── profile.js
│   └── /admin                 # admin-app render functions
│       ├── products.js
│       ├── orders.js
│       ├── verification-queue.js
│       ├── payouts.js
│       ├── users.js
│       └── analytics.js
└── /components               # reusable template-string builders (not framework components)
    ├── order-card.js          # orderCardHTML(order) -> string, used by both apps
    ├── status-badge.js
    ├── progress-bar.js
    └── modal.js                # showModal(title, bodyHTML), closeModal() — lifted straight from the prototype
```
- **Pattern, concretely:** each screen module exports a function like `renderOrders()` that fetches from Supabase, builds an HTML string (template literals, exactly as `ledger_diary.html`'s `settings()`/`saleForm()` do today), and assigns it to `document.getElementById('content').innerHTML`. `router.js` maps `location.hash` (`#orders`, `#earnings/PAY-00031`) to the right render function — no framework, no virtual DOM, same mental model the prototype already uses for `page` + `render()`.
- **Breakpoint strategy:** CSS-only, mobile-first — the prototype's existing `@media(max-width:900px)`/`@media(max-width:560px)` blocks are the template: bottom tab bar under 900px, sidebar/nav rail above it, same markup either way (`.user-nav` collapses instead of being replaced).
- **State/data:** `app.state` holds the current session + small caches; every screen re-fetches from Supabase on navigation (source of truth is the DB, not client memory, unlike the prototype's `localStorage`-as-source-of-truth). `realtime.js` subscribes to `postgres_changes` on `orders`/`notifications` filtered to `user_id=eq.{self}` and calls the current screen's render function again on change — this replaces React Query's cache-invalidation role with a one-line Realtime callback.
- **Forms:** plain `<form onsubmit="...">` + `FormData`, exactly the prototype's `addPerson`/`addSale` pattern; client-side checks are UX-only, the same validation is re-enforced server-side in the Edge Function/RLS (bank/KYC fields especially — never trust the browser).
- **Reused from the prototype almost verbatim:** the modal system (`showModal`/`closeModal`), the `.pill`/`.card`/`.progress` CSS components, the `esc()` HTML-escaping helper, and the `id("PREFIX")`-style human-readable code generation pattern (now generated server-side by a Postgres trigger/sequence instead of client-side, since codes must be unique across all users, not just one browser's `localStorage`).

## B10. Deployment — GitHub Pages + Supabase

**Repo layout:** a single GitHub repo, static site served either from the repo root or a `/docs` folder (Settings → Pages → Source). No server, no container, no build artifact — `git push` to `main` *is* the deploy.

```
1. Create the Supabase project (prod) + a second project (staging).
2. Run the schema migrations (§B3) via `supabase db push` against staging first.
3. Copy the project's `SUPABASE_URL` and `anon` public key into /js/supabase-client.js
   — the anon key is meant to be public; it grants nothing by itself, RLS does
   the enforcing (§B4). NEVER put the `service_role` key in any file in this repo.
4. Enable GitHub Pages: Settings → Pages → Deploy from branch → main → / (root).
5. Add a repo secret `SUPABASE_STAGING_DB_URL` / `SUPABASE_PROD_DB_URL`
   (connection string, service-role — used only inside GitHub Actions, never
   shipped to the browser) for the migration-deploy workflow.
6. Custom domain (optional): CNAME file in repo root + DNS CNAME record.
```

**GitHub Actions — two workflows:**

```yaml
# .github/workflows/deploy-pages.yml — deploys the static site itself
on: { push: { branches: [main] } }
jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/configure-pages@v5
      - uses: actions/upload-pages-artifact@v3
        with: { path: '.' }
      - uses: actions/deploy-pages@v4

# .github/workflows/db-migrate.yml — pushes schema/RLS changes to Supabase
on: { push: { branches: [main], paths: ['supabase/migrations/**'] } }
jobs:
  migrate:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: supabase/setup-cli@v1
      - run: supabase db push --db-url ${{ secrets.SUPABASE_PROD_DB_URL }}
```

**Edge Functions deploy separately** (`supabase functions deploy verify-submission`, etc.) since GitHub Pages cannot host server code — this is the one piece that genuinely lives outside the static bundle, and it's already Supabase-hosted, not something this repo needs to run.

**Environments:** `index.html`/`admin.html` read the Supabase URL/key from a small `config.js` that differs between a `staging` branch (deployed to a separate Pages environment or a `/staging` path) and `main` (prod), so QA never touches production data.

## B11. Security & Compliance Checklist

- [ ] Bank account numbers stored via `pgsodium`/Vault column encryption; only `account_number_last4` ever leaves the database in plaintext.
- [ ] KYC documents in a **private** Storage bucket; access only via short-TTL signed URLs generated server-side after an RLS-equivalent ownership check.
- [ ] All money-moving Edge Functions verify JWT role server-side (never trust a client-sent role claim).
- [ ] Payout webhook signatures verified against the gateway's shared secret before any DB write.
- [ ] `audit_log` is insert-only (no update/delete policy) for rate changes, approvals, and payouts.
- [ ] Rate limiting on `otp-send` (per mobile number, per IP) to prevent SMS-bombing abuse.
- [ ] DPDP consent capture at registration; data export/delete-my-account flow for compliance.

## B12. Observability & Ops

- Sentry browser SDK via CDN `<script>` tag on both shells (no build step needed to use it) + Sentry on every Edge Function.
- Structured logs from Edge Functions → Supabase log drains → (optional) shipped to a log sink (Logtail/Axiom).
- Daily reconciliation job: sum(`payments.amount` where `status='successful'`) must equal sum(`user_earnings.amount` where `status='paid'`) — alert on mismatch.
- Staging Supabase project mirrors prod schema; migrations applied via `supabase db push` in CI before promotion.

## B13. Testing Strategy

- **DB-level:** pgTAP tests asserting RLS policies (a `verifier`-only JWT cannot read `products.base_price`; a user JWT cannot insert into `orders`).
- **Edge Functions:** Deno test suite per function, including the full state-machine transition table (illegal transitions must throw).
- **E2E:** Playwright driving the static pages directly (no dev server needed — `npx http-server .` or just open `index.html`) covering the full A6.9 journey (register → OTP → profile steps → order assigned via seeded admin API → accept → submit → admin approves → earning appears → payout marked paid → user sees "Paid").
- **No framework = no component test layer needed:** since screens are plain functions returning HTML strings, unit-test them directly in Node with `jsdom` (assert the returned string contains the expected markup/values) rather than a component-testing library.
