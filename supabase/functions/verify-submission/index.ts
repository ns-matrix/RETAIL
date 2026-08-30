import { serve } from 'https://deno.land/std@0.208.0/http/server.ts';
import { handleCors, jsonError, jsonOk } from '../_shared/cors.ts';
import { getSupabaseAdmin, verifyAuth } from '../_shared/supabase-admin.ts';
import { validateTransition } from '../_shared/state-machine.ts';

// CRITICAL: This is the ONLY writer of user_earnings.
// Earnings are created only on approval (verified quantity).

serve(async (req) => {
  const corsResp = handleCors(req);
  if (corsResp) return corsResp;

  try {
    const { userId } = await verifyAuth(req);
    const supabase = getSupabaseAdmin();

    // Verify caller is a verifier or admin
    const { data: adminUser, error: adminErr } = await supabase
      .from('admin_users')
      .select('id, role')
      .eq('id', userId)
      .eq('active', true)
      .single();

    if (adminErr || !adminUser) {
      return jsonError(403, 'Only verifiers/admins can verify submissions');
    }

    const allowedRoles = ['super_admin', 'admin', 'verifier'];
    if (!allowedRoles.includes(adminUser.role)) {
      return jsonError(403, 'Insufficient permissions to verify submissions');
    }

    const body = await req.json();
    const { submission_id, approved_quantity, decision, reason } = body;

    if (!submission_id || !decision) {
      return jsonError(400, 'Missing required fields: submission_id, decision');
    }

    if (!['approved', 'rejected'].includes(decision)) {
      return jsonError(400, 'Decision must be "approved" or "rejected"');
    }

    if (decision === 'rejected' && !reason) {
      return jsonError(400, 'Rejection reason is required');
    }

    if (decision === 'approved' && (approved_quantity === undefined || approved_quantity < 0)) {
      return jsonError(400, 'Approved quantity is required and must be non-negative for approval');
    }

    // Fetch the submission with order details
    const { data: submission, error: subErr } = await supabase
      .from('order_submissions')
      .select('id, order_id, submitted_quantity, verification_status')
      .eq('id', submission_id)
      .single();

    if (subErr || !submission) {
      return jsonError(404, 'Submission not found');
    }

    if (submission.verification_status !== 'submitted') {
      return jsonError(400, `Submission already reviewed (status: ${submission.verification_status})`);
    }

    // Fetch the order
    const { data: order, error: orderErr } = await supabase
      .from('orders')
      .select('id, user_id, status, assigned_quantity, submitted_quantity, approved_quantity, user_rate')
      .eq('id', submission.order_id)
      .single();

    if (orderErr || !order) {
      return jsonError(404, 'Order not found');
    }

    // Validate order is in a submittable state
    const validOrderStatuses = ['submitted', 'resubmitted'];
    if (!validOrderStatuses.includes(order.status)) {
      return jsonError(400, `Order is in status '${order.status}', expected 'submitted' or 'resubmitted'`);
    }

    let newOrderStatus: string;
    let earnedQuantity: number;

    if (decision === 'approved') {
      earnedQuantity = approved_quantity;

      // Validate approved_quantity doesn't exceed submitted
      if (earnedQuantity > submission.submitted_quantity) {
        return jsonError(400, `Approved quantity ${earnedQuantity} exceeds submitted ${submission.submitted_quantity}`);
      }

      // Update order: increment approved_quantity
      const newApprovedQty = order.approved_quantity + earnedQuantity;

      // Check if fully approved (all submitted quantity approved)
      if (newApprovedQty >= order.submitted_quantity) {
        newOrderStatus = 'verified';
      } else {
        newOrderStatus = 'in_progress'; // partial approval — user can submit more
      }

      const { error: updateErr } = await supabase
        .from('orders')
        .update({
          status: newOrderStatus,
          approved_quantity: newApprovedQty,
        })
        .eq('id', order.id);

      if (updateErr) {
        return jsonError(500, `Failed to update order: ${updateErr.message}`);
      }

      // Create earnings row — THIS IS THE ONLY WRITER of user_earnings
      // (structurally enforced: no other function or policy inserts here)
      const { error: earnErr } = await supabase
        .from('user_earnings')
        .insert({
          user_id: order.user_id,
          order_id: order.id,
          approved_quantity: earnedQuantity,
          rate: order.user_rate,
          status: 'accrued',
        });

      if (earnErr) {
        return jsonError(500, `Failed to create earnings: ${earnErr.message}`);
      }

      // If fully verified, check if we should move to completed
      if (newOrderStatus === 'verified') {
        // Check if all assigned quantity is accounted for
        const totalApproved = newApprovedQty;
        if (totalApproved >= order.assigned_quantity) {
          await supabase
            .from('orders')
            .update({ status: 'completed' })
            .eq('id', order.id);
          newOrderStatus = 'completed';
        }
      }

    } else {
      // Rejected
      earnedQuantity = 0;
      newOrderStatus = 'correction_required';

      const { error: updateErr } = await supabase
        .from('orders')
        .update({
          status: newOrderStatus,
          rejected_quantity: order.rejected_quantity + submission.submitted_quantity,
        })
        .eq('id', order.id);

      if (updateErr) {
        return jsonError(500, `Failed to update order: ${updateErr.message}`);
      }
    }

    // Update submission status
    const { error: subUpdateErr } = await supabase
      .from('order_submissions')
      .update({
        verification_status: decision === 'approved' ? 'verified' : 'rejected',
        rejection_reason: reason || null,
        reviewed_by: userId,
        reviewed_at: new Date().toISOString(),
      })
      .eq('id', submission_id);

    if (subUpdateErr) {
      return jsonError(500, `Failed to update submission: ${subUpdateErr.message}`);
    }

    // Write notification to user
    const notificationType = decision === 'approved' ? 'submission_verified' : 'submission_rejected';
    const notificationBody = decision === 'approved'
      ? `Your submission for order ${order.id.slice(0, 8)} has been approved. ${earnedQuantity} units credited.`
      : `Your submission was rejected. Reason: ${reason}`;

    await supabase.from('notifications').insert({
      user_id: order.user_id,
      type: notificationType,
      title: decision === 'approved' ? 'Submission Approved' : 'Submission Rejected',
      body: notificationBody,
    });

    // Audit log
    await supabase.from('audit_log').insert({
      actor_id: userId,
      actor_type: 'admin',
      action: decision === 'approved' ? 'quantity_approved' : 'quantity_rejected',
      entity_table: 'order_submissions',
      entity_id: submission_id,
      before: JSON.stringify({ verification_status: 'submitted' }),
      after: JSON.stringify({
        verification_status: decision === 'approved' ? 'verified' : 'rejected',
        approved_quantity: earnedQuantity,
        order_status: newOrderStatus,
      }),
    });

    return jsonOk({
      success: true,
      decision,
      approved_quantity: earnedQuantity,
      order_status: newOrderStatus,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (message.includes('Invalid status transition')) {
      return jsonError(400, message);
    }
    return jsonError(500, message);
  }
});
