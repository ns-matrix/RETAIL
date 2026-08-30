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
    const { order_id, quantity, proof_path, notes } = body;

    if (!order_id || !quantity) {
      return jsonError(400, 'Missing required fields: order_id, quantity');
    }

    if (quantity <= 0) {
      return jsonError(400, 'Quantity must be positive');
    }

    // Fetch the order
    const { data: order, error: orderErr } = await supabase
      .from('orders')
      .select('id, user_id, status, assigned_quantity, submitted_quantity')
      .eq('id', order_id)
      .single();

    if (orderErr || !order) {
      return jsonError(404, 'Order not found');
    }

    // Verify ownership
    if (order.user_id !== userId) {
      return jsonError(403, 'You can only submit for your own orders');
    }

    // Validate status: must be in_progress or correction_required (resubmit path)
    // TRD §A5.6: in_progress → submitted, correction_required → resubmitted → submitted
    const validStatuses = ['in_progress', 'correction_required'];
    if (!validStatuses.includes(order.status)) {
      return jsonError(400, `Cannot submit order in status '${order.status}'. Must be 'in_progress' or 'correction_required'`);
    }

    // Check quantity doesn't exceed remaining
    const remaining = order.assigned_quantity - order.submitted_quantity;
    if (quantity > remaining) {
      return jsonError(400, `Quantity ${quantity} exceeds remaining ${remaining}`);
    }

    // Create the submission
    const { data: submission, error: subErr } = await supabase
      .from('order_submissions')
      .insert({
        order_id,
        submitted_quantity: quantity,
        proof_storage_path: proof_path || null,
        notes: notes || null,
        verification_status: 'submitted',
      })
      .select('id')
      .single();

    if (subErr) {
      return jsonError(500, `Failed to create submission: ${subErr.message}`);
    }

    // Update order: status → submitted, increment submitted_quantity
    const newSubmittedQty = order.submitted_quantity + quantity;
    const newStatus = order.status === 'correction_required' ? 'resubmitted' : 'submitted';

    const { error: updateErr } = await supabase
      .from('orders')
      .update({
        status: newStatus,
        submitted_quantity: newSubmittedQty,
      })
      .eq('id', order_id);

    if (updateErr) {
      return jsonError(500, `Failed to update order: ${updateErr.message}`);
    }

    // Audit log
    await supabase.from('audit_log').insert({
      actor_id: userId,
      actor_type: 'user',
      action: 'order_submitted',
      entity_table: 'orders',
      entity_id: order_id,
      before: JSON.stringify({ status: order.status, submitted_quantity: order.submitted_quantity }),
      after: JSON.stringify({ status: newStatus, submitted_quantity: newSubmittedQty }),
    });

    return jsonOk({ submission_id: submission.id, status: newStatus });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return jsonError(500, message);
  }
});
