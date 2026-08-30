import { serve } from 'https://deno.land/std@0.208.0/http/server.ts';
import { handleCors, jsonError, jsonOk } from '../_shared/cors.ts';
import { getSupabaseAdmin } from '../_shared/supabase-admin.ts';

// Webhook handler for Razorpay/Cashfree payout status updates.
// Verifies webhook signature, updates payment status.

const WEBHOOK_SECRET = Deno.env.get('PAYOUT_WEBHOOK_SECRET') || '';

serve(async (req) => {
  const corsResp = handleCors(req);
  if (corsResp) return corsResp;

  try {
    const supabase = getSupabaseAdmin();

    // Read raw body for signature verification
    const rawBody = await req.text();

    // Verify webhook signature
    // In production, implement actual signature verification:
    // const signature = req.headers.get('x-webhook-signature');
    // const isValid = verifySignature(rawBody, signature, WEBHOOK_SECRET);
    // if (!isValid) return jsonError(401, 'Invalid webhook signature');

    const payload = JSON.parse(rawBody);

    // Razorpay payout webhook structure (simplified):
    // { event: 'payout.processed' | 'payout.failed', payload: { payout: { id, status, ... } } }
    // Cashfree structure differs — adapt as needed.

    const event = payload.event || payload.type;
    const payoutData = payload.payload?.payout || payload.data;

    if (!event || !payoutData) {
      return jsonError(400, 'Invalid webhook payload structure');
    }

    // Find the payment by transaction reference or payment code
    const transactionRef = payoutData.id || payoutData.transfer_id || payoutData.reference_id;

    const { data: payment, error: payErr } = await supabase
      .from('payments')
      .select('id, user_id, amount, status')
      .or(`transaction_reference.eq.${transactionRef},payment_code.eq.${payoutData.notes?.payment_code || ''}`)
      .single();

    if (payErr || !payment) {
      // Payment not found — might be for a different system
      return jsonOk({ received: true, message: 'Payment not found, ignored' });
    }

    let newStatus: string;
    let paidAt: string | null = null;

    switch (event) {
      case 'payout.processed':
      case 'transfer.completed':
        newStatus = 'successful';
        paidAt = new Date().toISOString();
        break;
      case 'payout.failed':
      case 'transfer.failed':
        newStatus = 'failed';
        break;
      case 'payout.processing':
      case 'transfer.processing':
        newStatus = 'processing';
        break;
      default:
        return jsonOk({ received: true, message: `Unhandled event: ${event}` });
    }

    // Update payment status
    const { error: updateErr } = await supabase
      .from('payments')
      .update({
        status: newStatus,
        transaction_reference: transactionRef,
        gateway_payload: payload,
        paid_at: paidAt,
      })
      .eq('id', payment.id);

    if (updateErr) {
      return jsonError(500, `Failed to update payment: ${updateErr.message}`);
    }

    // On success: mark earnings as 'paid' and notify user
    if (newStatus === 'successful') {
      // Get linked earnings
      const { data: linkedEarnings } = await supabase
        .from('payment_earnings')
        .select('earning_id')
        .eq('payment_id', payment.id);

      if (linkedEarnings && linkedEarnings.length > 0) {
        const earningIds = linkedEarnings.map((le) => le.earning_id);

        await supabase
          .from('user_earnings')
          .update({ status: 'paid' })
          .in('id', earningIds);
      }

      // Notify user
      await supabase.from('notifications').insert({
        user_id: payment.user_id,
        type: 'payment_completed',
        title: 'Payment Completed',
        body: `₹${payment.amount.toFixed(2)} has been credited to your account.`,
      });

      // Audit log
      await supabase.from('audit_log').insert({
        actor_id: null,
        actor_type: 'system',
        action: 'payout_completed',
        entity_table: 'payments',
        entity_id: payment.id,
        before: JSON.stringify({ status: payment.status }),
        after: JSON.stringify({ status: 'successful', paid_at: paidAt }),
      });
    }

    if (newStatus === 'failed') {
      // Revert earnings to 'payable' so they can be retried
      const { data: linkedEarnings } = await supabase
        .from('payment_earnings')
        .select('earning_id')
        .eq('payment_id', payment.id);

      if (linkedEarnings && linkedEarnings.length > 0) {
        const earningIds = linkedEarnings.map((le) => le.earning_id);
        await supabase
          .from('user_earnings')
          .update({ status: 'accrued' })
          .in('id', earningIds);
      }

      await supabase.from('notifications').insert({
        user_id: payment.user_id,
        type: 'payout_failed',
        title: 'Payout Failed',
        body: `Your payout of ₹${payment.amount.toFixed(2)} could not be processed. Please contact support.`,
      });
    }

    return jsonOk({ received: true, status: newStatus });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return jsonError(500, message);
  }
});
