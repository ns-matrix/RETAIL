import { serve } from 'https://deno.land/std@0.208.0/http/server.ts';
import { handleCors, jsonError, jsonOk } from '../_shared/cors.ts';
import { getSupabaseAdmin, verifyAuth } from '../_shared/supabase-admin.ts';
import { validateTransition } from '../_shared/state-machine.ts';

serve(async (req) => {
  const corsResp = handleCors(req);
  if (corsResp) return corsResp;

  try {
    const { userId } = await verifyAuth(req);
    const supabase = getSupabaseAdmin();

    const body = await req.json();
    const { order_id } = body;

    if (!order_id) {
      return jsonError(400, 'Missing required field: order_id');
    }

    // Fetch the order
    const { data: order, error: orderErr } = await supabase
      .from('orders')
      .select('id, user_id, status')
      .eq('id', order_id)
      .single();

    if (orderErr || !order) {
      return jsonError(404, 'Order not found');
    }

    // Verify the caller owns this order
    if (order.user_id !== userId) {
      return jsonError(403, 'You can only accept your own orders');
    }

    // Validate status transition: assigned → accepted
    validateTransition(order.status, 'accepted');

    // Update status
    const { error: updateErr } = await supabase
      .from('orders')
      .update({ status: 'accepted' })
      .eq('id', order_id);

    if (updateErr) {
      return jsonError(500, `Failed to update order: ${updateErr.message}`);
    }

    // Audit log
    await supabase.from('audit_log').insert({
      actor_id: userId,
      actor_type: 'user',
      action: 'order_accepted',
      entity_table: 'orders',
      entity_id: order_id,
      before: JSON.stringify({ status: order.status }),
      after: JSON.stringify({ status: 'accepted' }),
    });

    return jsonOk({ success: true, status: 'accepted' });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (message.includes('Invalid status transition')) {
      return jsonError(400, message);
    }
    return jsonError(500, message);
  }
});
