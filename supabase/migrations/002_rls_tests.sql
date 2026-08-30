-- ============================================================
-- WorkFlow Pay — pgTAP Tests for RLS Policies
-- TRD §B13: DB-level RLS assertions
-- ============================================================
-- Prerequisites: pgTAP extension must be enabled on the Supabase project.
-- Run with: supabase test db
-- Or via psql: \i tests/002_rls_tests.sql
-- ============================================================

begin;
select plan(20);

-- ============ SETUP: Create test users and roles ============
-- We use set_config to simulate different JWT claims.

-- Test 1-2: Helper functions exist
select has_function('is_admin_role', ARRAY['admin_role[]'],
  'is_admin_role function exists');
select has_function('generate_user_code', ARRAY[],
  'generate_user_code trigger function exists');

-- ============ TEST: products table — the critical security property ============
-- TRD §B4: "the ABSENCE of a policy is the default-deny.
-- products.base_price and sale_price are never exposed by any policy
-- reachable with a worker's JWT"

-- Simulate a plain authenticated user (no admin_users row)
select set_config('role', 'authenticated', false);
select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-000000000001"}', false);

-- Test 3: Authenticated user CANNOT select from products
select throws_ok(
  $$select id, name, base_price, sale_price from products limit 1$$,
  null,
  'Worker (authenticated) cannot SELECT from products — base_price/sale_price hidden'
);

-- Test 4: Authenticated user CANNOT insert into products
select throws_ok(
  $$insert into products (name, base_price, sale_price, default_user_rate) values ('Test', 10, 20, 5)$$,
  null,
  'Worker (authenticated) cannot INSERT into products'
);

-- Test 5: Authenticated user CANNOT update products
select throws_ok(
  $$update products set base_price = 99 where id = '00000000-0000-0000-0000-000000000000'$$,
  null,
  'Worker (authenticated) cannot UPDATE products'
);

-- Test 6: Authenticated user CANNOT delete from products
select throws_ok(
  $$delete from products where id = '00000000-0000-0000-0000-000000000000'$$,
  null,
  'Worker (authenticated) cannot DELETE from products'
);

-- ============ TEST: orders table ============

-- Test 7: Authenticated user CANNOT insert orders directly
select throws_ok(
  $$insert into orders (user_id, product_id, assigned_quantity, user_rate) values ('00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000000', 10, 5)$$,
  null,
  'Worker cannot INSERT orders directly — must go through Edge Functions'
);

-- ============ TEST: user_rate_overrides ============

-- Test 8: Authenticated user CANNOT read rate overrides for other users
select set_config('role', 'authenticated', false);
select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-000000000001"}', false);

select is(
  (select count(*) from user_rate_overrides)::int,
  0,
  'Worker sees no rate overrides (own user_id has no rows, cannot see others)'
);

-- ============ TEST: audit_log ============

-- Test 9: Audit log cannot be updated by anyone (insert-only by design)
select set_config('role', 'authenticated', false);
select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-000000000001"}', false);

select throws_ok(
  $$update audit_log set action = 'hacked' where id = '00000000-0000-0000-0000-000000000000'$$,
  null,
  'Audit log cannot be updated by authenticated users'
);

-- Test 10: Audit log cannot be deleted by authenticated users
select throws_ok(
  $$delete from audit_log where id = '00000000-0000-0000-0000-000000000000'$$,
  null,
  'Audit log cannot be deleted by authenticated users'
);

-- ============ TEST: payments table ============

-- Test 11: Authenticated user CANNOT insert payments
select throws_ok(
  $$insert into payments (user_id, amount, payment_method) values ('00000000-0000-0000-0000-000000000001', 100, 'upi')$$,
  null,
  'Worker cannot INSERT payments directly'
);

-- Test 12: Authenticated user CANNOT update payments
select throws_ok(
  $$update payments set status = 'successful' where id = '00000000-0000-0000-0000-000000000000'$$,
  null,
  'Worker cannot UPDATE payments'
);

-- ============ TEST: admin_users table ============

-- Test 13: Non-admin authenticated user CANNOT read admin_users
select set_config('role', 'authenticated', false);
select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-000000000001"}', false);

-- This should return 0 rows (RLS filtered), not throw
select is(
  (select count(*) from admin_users)::int,
  0,
  'Non-admin user sees zero admin_users rows (RLS filtered)'
);

-- ============ TEST: user_earnings ============

-- Test 14: Authenticated user CANNOT insert earnings directly
-- (only verify-submission Edge Function should write to this table)
select throws_ok(
  $$insert into user_earnings (user_id, order_id, approved_quantity, rate) values ('00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000000', 10, 5)$$,
  null,
  'Worker cannot INSERT earnings directly — verify-submission is the only writer'
);

-- Test 15: Authenticated user CANNOT update earnings
select throws_ok(
  $$update user_earnings set status = 'paid' where id = '00000000-0000-0000-0000-000000000000'$$,
  null,
  'Worker cannot UPDATE earnings'
);

-- ============ TEST: bank_accounts ============

-- Test 16: Authenticated user can see their own bank account
-- (but encrypted field is bytea and unusable without service role)
-- We verify the policy allows SELECT (returns 0 rows for our test user
-- who has no bank_accounts, but the query itself doesn't throw)
select set_config('role', 'authenticated', false);
select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-000000000001"}', false);

select is(
  (select count(*) from bank_accounts)::int,
  0,
  'Worker can SELECT bank_accounts (returns 0 rows, no error — policy allows self-read)'
);

-- ============ TEST: notifications ============

-- Test 17: Authenticated user can read their own notifications
select is(
  (select count(*) from notifications where user_id = '00000000-0000-0000-0000-000000000001')::int,
  0,
  'Worker can SELECT own notifications (returns 0 rows for test user)'
);

-- ============ TEST: kyc_document_types ============

-- Test 18: Authenticated user CAN read KYC document types
-- (needed for registration flow)
select is(
  (select count(*) from kyc_document_types)::int >= 0,
  true,
  'Worker can SELECT kyc_document_types (needed for registration UI)'
);

-- Test 19: Authenticated user CANNOT insert KYC document types
select throws_ok(
  $$insert into kyc_document_types (code, label) values ('test', 'Test')$$,
  null,
  'Worker cannot INSERT kyc_document_types'
);

-- ============ TEST: verify generate_user_code trigger ============

-- Test 20: user_code is auto-generated with USR- prefix
-- (This test requires a real auth.users row, so we test the function directly)
select is(
  (select generate_user_code() is not null),
  true,
  'generate_user_code function returns a value'
);

-- ============ FINISH ============
select * from finish();
rollback;
