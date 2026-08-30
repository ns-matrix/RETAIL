-- ============================================================
-- WorkFlow Pay — Initial Schema Migration
-- Version: 1.0
-- Date: 2026-08-30
-- ============================================================
-- This migration implements TRD §B3 (schema), §B4 (RLS),
-- and supporting infrastructure (triggers, sequences, crypto).
-- ============================================================

-- ============ EXTENSIONS ============
create extension if not exists "pgcrypto";
create extension if not exists "pg_trgm";
-- pg_cron is typically enabled in the Supabase dashboard, not via SQL.
-- Uncomment below if your project supports it:
-- create extension if not exists "pg_cron";

-- ============ ENUMS ============
create type user_status as enum ('active','suspended','pending_verification');
create type verification_status as enum ('not_submitted','submitted','under_review','verified','rejected');
create type admin_role as enum ('super_admin','admin','verifier','finance','support');
create type order_status as enum (
  'created','assigned','accepted','in_progress','submitted',
  'verified','completed','rejected','correction_required',
  'resubmitted','payment_pending','paid','cancelled'
);
create type earning_status as enum ('accrued','payable','processing','paid');

-- ============ SEQUENCES (for human-readable codes) ============
create sequence user_code_seq start 1;
create sequence order_code_seq start 1;
create sequence payment_code_seq start 1;

-- ============ HELPER: is_admin_role() ============
-- Security definer — checks the caller's JWT against admin_users.
-- This is the ONLY way RLS policies determine admin access.
create or replace function is_admin_role(required_roles admin_role[])
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from admin_users
    where id = auth.uid() and active = true and role = any(required_roles)
  );
$$;

-- ============ HELPER: is_order_owner() ============
create or replace function is_order_owner(order_uuid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from orders
    where id = order_uuid and user_id = auth.uid()
  );
$$;

-- ============ HELPER: updated_at trigger ============
create or replace function set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ============ HELPER: bank encryption ============
-- SECURITY DEFINER so only the function owner (postgres/supabase_admin)
-- can encrypt/decrypt — the anon/authenticated roles cannot call these
-- directly because they lack EXECUTE permission (granted below).
create or replace function encrypt_bank_number(plain_text text)
returns bytea
language plpgsql
security definer
set search_path = public
as $$
begin
  return pgp_sym_encrypt(
    plain_text,
    current_setting('app.settings.bank_encryption_key', true)
  );
end;
$$;

create or replace function decrypt_bank_number(encrypted_bytea bytea)
returns text
language plpgsql
security definer
set search_path = public
as $$
begin
  return pgp_sym_decrypt(
    encrypted_bytea,
    current_setting('app.settings.bank_encryption_key', true)
  );
exception when others then
  return null;
end;
$$;

-- Revoke direct access — only Edge Functions (service role) call these
revoke execute on function encrypt_bank_number(text) from authenticated, anon;
revoke execute on function decrypt_bank_number(bytea) from authenticated, anon;

-- ============ IDENTITY ============

create table users (
  id uuid primary key references auth.users(id) on delete cascade,
  user_code text unique not null,
  full_name text not null,
  mobile text unique not null,
  mobile_verified boolean not null default false,
  email text,
  status user_status not null default 'pending_verification',
  overall_verification verification_status not null default 'not_submitted',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger users_updated_at
  before update on users
  for each row execute function set_updated_at();

create table user_profiles (
  user_id uuid primary key references users(id) on delete cascade,
  dob date,
  gender text,
  father_husband_name text,
  occupation text,
  experience text,
  preferred_work_type text,
  profile_photo_path text,
  updated_at timestamptz not null default now()
);

create trigger user_profiles_updated_at
  before update on user_profiles
  for each row execute function set_updated_at();

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
  account_number_encrypted bytea not null,
  account_number_last4 text not null,
  ifsc text not null,
  branch_name text,
  account_type text check (account_type in ('savings','current')),
  upi_id text,
  verification_status verification_status not null default 'not_submitted',
  is_primary boolean not null default true,
  created_at timestamptz not null default now()
);

-- ============ KYC ============

create table kyc_document_types (
  id uuid primary key default gen_random_uuid(),
  code text unique not null,
  label text not null,
  is_mandatory boolean not null default true,
  active boolean not null default true
);

create table kyc_documents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  document_type_id uuid not null references kyc_document_types(id),
  storage_path text not null,
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
  base_price numeric(12,2) not null,
  sale_price numeric(12,2) not null,
  default_user_rate numeric(12,2) not null,
  active boolean not null default true,
  created_by uuid references admin_users(id),
  created_at timestamptz not null default now()
);

create table user_rate_overrides (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  product_id uuid not null references products(id) on delete cascade,
  rate numeric(12,2) not null,
  effective_from timestamptz not null default now(),
  created_by uuid references admin_users(id),
  unique (user_id, product_id)
);

-- ============ ORDERS ============

create table orders (
  id uuid primary key default gen_random_uuid(),
  order_code text unique not null,
  user_id uuid not null references users(id),
  product_id uuid not null references products(id),
  assigned_quantity int not null check (assigned_quantity > 0),
  submitted_quantity int not null default 0,
  approved_quantity int not null default 0,
  rejected_quantity int not null default 0,
  user_rate numeric(12,2) not null,
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

create trigger orders_updated_at
  before update on orders
  for each row execute function set_updated_at();

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

create table user_earnings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id),
  order_id uuid not null references orders(id) unique,
  approved_quantity int not null,
  rate numeric(12,2) not null,
  amount numeric(12,2) generated always as (approved_quantity * rate) stored,
  status earning_status not null default 'accrued',
  created_at timestamptz not null default now()
);

create table payments (
  id uuid primary key default gen_random_uuid(),
  payment_code text unique not null,
  user_id uuid not null references users(id),
  amount numeric(12,2) not null,
  payment_method text not null check (payment_method in ('upi','bank_transfer')),
  transaction_reference text,
  gateway_payload jsonb,
  status text not null default 'initiated'
    check (status in ('initiated','processing','successful','failed')),
  initiated_by uuid references admin_users(id),
  paid_at timestamptz,
  created_at timestamptz not null default now()
);

create table payment_earnings (
  payment_id uuid not null references payments(id) on delete cascade,
  earning_id uuid not null references user_earnings(id) on delete cascade,
  primary key (payment_id, earning_id)
);

-- ============ NOTIFICATIONS & AUDIT ============

create table notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references users(id),
  admin_user_id uuid references admin_users(id),
  type text not null,
  title text not null,
  body text not null,
  read boolean not null default false,
  created_at timestamptz not null default now()
);

create table audit_log (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid,
  actor_type text not null check (actor_type in ('admin','user','system')),
  action text not null,
  entity_table text not null,
  entity_id uuid not null,
  before jsonb,
  after jsonb,
  created_at timestamptz not null default now()
);

-- ============ INDEXES ============
create index idx_users_mobile on users(mobile);
create index idx_users_user_code on users(user_code);
create index idx_orders_user_id on orders(user_id);
create index idx_orders_status on orders(status);
create index idx_orders_order_code on orders(order_code);
create index idx_orders_due_date on orders(due_date);
create index idx_order_submissions_order_id on order_submissions(order_id);
create index idx_user_earnings_user_id on user_earnings(user_id);
create index idx_user_earnings_status on user_earnings(status);
create index idx_payments_user_id on payments(user_id);
create index idx_payments_status on payments(status);
create index idx_notifications_user_id on notifications(user_id);
create index idx_notifications_read on notifications(user_id, read);
create index idx_kyc_documents_user_id on kyc_documents(user_id);
create index idx_audit_log_entity on audit_log(entity_table, entity_id);
create index idx_audit_log_actor on audit_log(actor_id);
create index idx_bank_accounts_user_id on bank_accounts(user_id);

-- ============ ROW-LEVEL SECURITY ============
-- TRD §B4: enable RLS on all data tables.

alter table users enable row level security;
alter table user_profiles enable row level security;
alter table addresses enable row level security;
alter table bank_accounts enable row level security;
alter table kyc_documents enable row level security;
alter table orders enable row level security;
alter table order_submissions enable row level security;
alter table user_earnings enable row level security;
alter table payments enable row level security;
alter table notifications enable row level security;
alter table admin_users enable row level security;
alter table products enable row level security;
alter table user_rate_overrides enable row level security;
alter table kyc_document_types enable row level security;
alter table payment_earnings enable row level security;
alter table audit_log enable row level security;

-- ============ RLS POLICIES: USERS ============

-- Users can only read/write their own rows
create policy "user_self_select" on users
  for select using (auth.uid() = id);

create policy "user_self_update" on users
  for update using (auth.uid() = id)
  with check (auth.uid() = id);

-- Admins can read all users
create policy "admin_read_users" on users
  for select using (is_admin_role(array['super_admin','admin','verifier','finance','support']::admin_role[]));

-- Admins can update users
create policy "admin_update_users" on users
  for update using (is_admin_role(array['super_admin','admin']::admin_role[]));

-- ============ RLS POLICIES: USER_PROFILES ============

create policy "user_own_profile_select" on user_profiles
  for select using (auth.uid() = user_id);

create policy "user_own_profile_update" on user_profiles
  for update using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "user_own_profile_insert" on user_profiles
  for insert with check (auth.uid() = user_id);

create policy "admin_read_profiles" on user_profiles
  for select using (is_admin_role(array['super_admin','admin','verifier']::admin_role[]));

-- ============ RLS POLICIES: ADDRESSES ============

create policy "user_own_addresses_select" on addresses
  for select using (auth.uid() = user_id);

create policy "user_own_addresses_insert" on addresses
  for insert with check (auth.uid() = user_id);

create policy "user_own_addresses_update" on addresses
  for update using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "user_own_addresses_delete" on addresses
  for delete using (auth.uid() = user_id);

create policy "admin_read_addresses" on addresses
  for select using (is_admin_role(array['super_admin','admin']::admin_role[]));

-- ============ RLS POLICIES: BANK_ACCOUNTS ============

-- Users can read their own bank accounts (last4 only; encrypted field is bytea, unusable client-side)
create policy "user_own_bank" on bank_accounts
  for select using (auth.uid() = user_id);

create policy "user_own_bank_insert" on bank_accounts
  for insert with check (auth.uid() = user_id);

create policy "user_own_bank_update" on bank_accounts
  for update using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "admin_read_bank" on bank_accounts
  for select using (is_admin_role(array['super_admin','admin','finance']::admin_role[]));

-- ============ RLS POLICIES: KYC_DOCUMENT_TYPES ============

-- All authenticated users can read document types (needed for registration)
create policy "authenticated_read_doc_types" on kyc_document_types
  for select using (auth.role() = 'authenticated');

-- Only admins can modify document types
create policy "admin_manage_doc_types" on kyc_document_types
  for all using (is_admin_role(array['super_admin','admin']::admin_role[]));

-- ============ RLS POLICIES: KYC_DOCUMENTS ============

create policy "user_own_kyc_select" on kyc_documents
  for select using (auth.uid() = user_id);

create policy "user_own_kyc_insert" on kyc_documents
  for insert with check (auth.uid() = user_id);

create policy "admin_read_kyc" on kyc_documents
  for select using (is_admin_role(array['super_admin','admin','verifier']::admin_role[]));

create policy "admin_update_kyc" on kyc_documents
  for update using (is_admin_role(array['super_admin','admin','verifier']::admin_role[]));

-- ============ RLS POLICIES: ADMIN_USERS ============

-- Only admins can see the admin_users table
create policy "admin_read_admin_users" on admin_users
  for select using (is_admin_role(array['super_admin','admin','verifier','finance','support']::admin_role[]));

create policy "super_admin_manage_admin_users" on admin_users
  for all using (is_admin_role(array['super_admin']::admin_role[]));

-- ============ RLS POLICIES: PRODUCTS ============
-- CRITICAL: NO policy for plain `authenticated` role.
-- base_price and sale_price are ONLY visible to admin roles.
-- This is the core security property of the platform.

create policy "admin_products" on products
  for all using (is_admin_role(array['super_admin','admin']::admin_role[]));

-- ============ RLS POLICIES: USER_RATE_OVERRIDES ============

create policy "admin_rate_overrides" on user_rate_overrides
  for all using (is_admin_role(array['super_admin','admin']::admin_role[]));

create policy "user_read_own_rate_override" on user_rate_overrides
  for select using (auth.uid() = user_id);

-- ============ RLS POLICIES: ORDERS ============

-- Users can only read their own orders
create policy "user_own_orders" on orders
  for select using (auth.uid() = user_id);

-- Users may NOT insert/update orders directly — all order mutation
-- goes through Edge Functions using the service role.
-- (No insert/update/delete policy for `authenticated` role = default deny)

-- Admins have full access
create policy "admin_full_orders" on orders
  for all using (is_admin_role(array['super_admin','admin']::admin_role[]));

-- ============ RLS POLICIES: ORDER_SUBMISSIONS ============

-- Users can read their own submissions (via order ownership)
create policy "user_own_submissions_select" on order_submissions
  for select using (
    exists (
      select 1 from orders
      where orders.id = order_submissions.order_id
        and orders.user_id = auth.uid()
    )
  );

-- Users can insert submissions for their own orders
create policy "user_own_submissions_insert" on order_submissions
  for insert with check (
    exists (
      select 1 from orders
      where orders.id = order_submissions.order_id
        and orders.user_id = auth.uid()
    )
  );

-- Verifiers and admins can read/update submissions
create policy "verifier_read_update_submissions" on order_submissions
  for select using (is_admin_role(array['super_admin','admin','verifier']::admin_role[]));

create policy "verifier_update_submissions" on order_submissions
  for update using (is_admin_role(array['super_admin','admin','verifier']::admin_role[]));

-- ============ RLS POLICIES: USER_EARNINGS ============

-- Users can only read their own earnings
create policy "user_own_earnings" on user_earnings
  for select using (auth.uid() = user_id);

-- Admins can read all earnings
create policy "admin_read_earnings" on user_earnings
  for select using (is_admin_role(array['super_admin','admin','finance']::admin_role[]));

-- No insert/update/delete for users or admins directly —
-- verify-submission Edge Function writes via service role.

-- ============ RLS POLICIES: PAYMENTS ============

-- Users can read their own payments
create policy "user_own_payments" on payments
  for select using (auth.uid() = user_id);

-- Finance/admin roles have full access
create policy "finance_payments" on payments
  for all using (is_admin_role(array['super_admin','admin','finance']::admin_role[]));

-- ============ RLS POLICIES: PAYMENT_EARNINGS ============

-- Users can read their own payment-earning links
create policy "user_own_payment_earnings" on payment_earnings
  for select using (
    exists (
      select 1 from payments
      where payments.id = payment_earnings.payment_id
        and payments.user_id = auth.uid()
    )
  );

-- Finance/admin roles have full access
create policy "admin_payment_earnings" on payment_earnings
  for all using (is_admin_role(array['super_admin','admin','finance']::admin_role[]));

-- ============ RLS POLICIES: NOTIFICATIONS ============

create policy "user_own_notifications" on notifications
  for select using (auth.uid() = user_id);

create policy "user_own_notifications_update" on notifications
  for update using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "admin_read_notifications" on notifications
  for select using (is_admin_role(array['super_admin','admin']::admin_role[]));

-- System/Edge Functions insert via service role (bypasses RLS)

-- ============ RLS POLICIES: AUDIT_LOG ============

-- Audit log is INSERT-ONLY for everyone. No update, no delete.
-- Reading is admin-only.
create policy "admin_read_audit_log" on audit_log
  for select using (is_admin_role(array['super_admin','admin']::admin_role[]));

-- No insert policy for authenticated — inserts happen via service role only.
-- No update/delete policies at all — immutable by design.

-- ============ VIEWS ============

-- Remaining quantity per order (convenience view)
create view order_remaining as
  select
    id,
    order_code,
    user_id,
    assigned_quantity,
    submitted_quantity,
    approved_quantity,
    rejected_quantity,
    (assigned_quantity - approved_quantity) as remaining_quantity,
    user_rate,
    status,
    due_date
  from orders;

-- Per-user payable amount
create view user_payable as
  select
    user_id,
    sum(amount) as total_payable
  from user_earnings
  where status = 'accrued'
  group by user_id;

-- ============ COMPLETION: set completed_at when status → completed ============
create or replace function set_completed_at()
returns trigger
language plpgsql
as $$
begin
  if new.status = 'completed' and old.status != 'completed' then
    new.completed_at = now();
  end if;
  return new;
end;
$$;

create trigger orders_completed_at
  before update on orders
  for each row execute function set_completed_at();

-- ============ SEQUENCE-BASED CODE GENERATORS ============

create or replace function generate_user_code()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  new.user_code = 'USR-' || lpad(nextval('user_code_seq')::text, 6, '0');
  return new;
end;
$$;

create trigger trg_generate_user_code
  before insert on users
  for each row execute function generate_user_code();

create or replace function generate_order_code()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  new.order_code = 'ORD-' || lpad(nextval('order_code_seq')::text, 6, '0');
  return new;
end;
$$;

create trigger trg_generate_order_code
  before insert on orders
  for each row execute function generate_order_code();

create or replace function generate_payment_code()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  new.payment_code = 'PAY-' || lpad(nextval('payment_code_seq')::text, 6, '0');
  return new;
end;
$$;

create trigger trg_generate_payment_code
  before insert on payments
  for each row execute function generate_payment_code();

-- ============ GRANT EXECUTE to service_role only ============
-- The is_admin_role function is SECURITY DEFINER and already restricted.
-- Revoke from anon/authenticated to prevent client-side invocation attempts.
revoke execute on function is_admin_role(admin_role[]) from anon, authenticated;
revoke execute on function is_order_owner(uuid) from anon, authenticated;
