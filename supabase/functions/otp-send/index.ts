import { serve } from 'https://deno.land/std@0.208.0/http/server.ts';
import { handleCors, jsonError, jsonOk } from '../_shared/cors.ts';
import { getSupabaseAdmin } from '../_shared/supabase-admin.ts';

// Sends OTP via SMS provider (MSG91/Twilio).
// Env vars: SMS_PROVIDER, SMS_API_KEY, SMS_SENDER_ID

const SMS_API_KEY = Deno.env.get('SMS_API_KEY') || '';
const SMS_PROVIDER = Deno.env.get('SMS_PROVIDER') || 'msg91'; // 'msg91' or 'twilio'
const SMS_SENDER_ID = Deno.env.get('SMS_SENDER_ID') || '';

async function sendViaMsg91(phone: string, otp: string): Promise<boolean> {
  const response = await fetch('https://api.msg91.com/api/v5/otp', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'authkey': SMS_API_KEY,
    },
    body: JSON.stringify({
      mobile: `91${phone}`,
      otp: otp,
      sender: SMS_SENDER_ID,
    }),
  });
  return response.ok;
}

async function sendViaTwilio(phone: string, otp: string): Promise<boolean> {
  // Twilio Verify service — store OTP server-side, send verification token
  const accountSid = Deno.env.get('TWILIO_ACCOUNT_SID') || '';
  const authToken = Deno.env.get('TWILIO_AUTH_TOKEN') || '';
  const serviceSid = Deno.env.get('TWILIO_VERIFY_SERVICE_SID') || '';

  const response = await fetch(
    `https://verify.twilio.com/v2/Services/${serviceSid}/Verifications`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Authorization': `Basic ${btoa(`${accountSid}:${authToken}`)}`,
      },
      body: new URLSearchParams({
        To: `+91${phone}`,
        Channel: 'sms',
      }),
    }
  );
  return response.ok;
}

serve(async (req) => {
  const corsResp = handleCors(req);
  if (corsResp) return corsResp;

  try {
    const body = await req.json();
    const { phone } = body;

    if (!phone || !/^\d{10}$/.test(phone)) {
      return jsonError(400, 'Valid 10-digit phone number required');
    }

    // Rate limiting: check if OTP was sent recently (per phone)
    const supabase = getSupabaseAdmin();
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();

    const { count } = await supabase
      .from('notifications')
      .select('id', { count: 'exact', head: true })
      .eq('type', 'otp_sent')
      .like('body', `%${phone}%`)
      .gte('created_at', fiveMinutesAgo);

    if (count && count >= 3) {
      return jsonError(429, 'Too many OTP requests. Please wait 5 minutes.');
    }

    // Generate 6-digit OTP
    const otp = Math.floor(100000 + Math.random() * 900000).toString();

    // Store OTP in a temporary table or use Supabase's built-in OTP.
    // For simplicity, we store it in a dedicated table.
    // In production, use Supabase Auth's built-in phone OTP instead.
    await supabase.from('otp_codes').insert({
      phone,
      otp_code: await hashOTP(otp),
      expires_at: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
    }).select();

    // Send OTP via configured provider
    let sent = false;
    if (SMS_PROVIDER === 'msg91') {
      sent = await sendViaMsg91(phone, otp);
    } else if (SMS_PROVIDER === 'twilio') {
      sent = await sendViaTwilio(phone, otp);
    } else {
      // Fallback: log OTP for development (never do this in production!)
      console.log(`[DEV] OTP for ${phone}: ${otp}`);
      sent = true;
    }

    if (!sent) {
      return jsonError(502, 'Failed to send OTP via SMS provider');
    }

    return jsonOk({ success: true, message: 'OTP sent successfully' });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return jsonError(500, message);
  }
});

async function hashOTP(otp: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(otp + Deno.env.get('OTP_SALT') || 'workflow-pay-salt');
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
}
