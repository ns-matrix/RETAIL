-- ============================================================
-- Migration 002: Add otp_codes table for OTP verification
-- ============================================================

create table if not exists otp_codes (
  id uuid primary key default gen_random_uuid(),
  phone text not null,
  otp_code text not null,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

create index idx_otp_codes_phone on otp_codes(phone, created_at);

-- Auto-cleanup expired OTPs (run periodically via pg_cron or application logic)
-- delete from otp_codes where expires_at < now();
