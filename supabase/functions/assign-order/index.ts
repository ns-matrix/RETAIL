import { serve } from 'https://deno.land/std@0.208.0/http/server.ts';
import { handleCors, jsonError, jsonOk, corsHeaders } from '../_shared/cors.ts';
import { getSupabaseAdmin, verifyAuth } from '../_shared/supabase-admin.ts';
import { validateTransition } from '../_shared/state-machine.ts';

serve(async (req) => {
  const corsResp = handleCors(req);
  if (corsResp) return corsResp;

  try {
    const { userId } = await verifyAuth(req);
    const supabase = getSupabaseAdmin();

    // Verify caller is an admin
    const { data: adminUser, error: adminErr } = await supabase
      .from('admin_users')
      .select('id, role')
      .eq('id', userId)
      .eq('active', true)
      .single();

    if (adminErr || !adminUser) {
      return jsonError(403, 'Only admins can assign orders');
    }

    const body = await req.json();
    const { user_id, product_id, assigned_quantity, due_date } = body;

    if (!user_id || !product_id || !assigned_quantity) {
      return jsonError(400, 'Missing required fields: user_id, product_id, assigned_quantity');
    }

    if (assigned_quantity <= 0) {
      return jsonError(400, 'assigned_quantity must be positive');
    }

    // Verify user exists
    const { data: targetUser, error: userErr } = await supabase
      .from('users')
      .select('id')
      .eq('id', user_id)
      .single();

    if (userErr || !targetUser) {
      return jsonError(404, 'Target user not found');
    }

    // Get product and determine user rate
    // NOTE: Products table is admin-only via RLS; we read via service role.
    const { data: product, error: prodErr } = await supabase
      .from('products')
      .select('id, default_user_rate, active')
      .eq('id', product_id)
      .single();

    if (prodErr || !product) {
      return jsonError(404, 'Product not found');
    }

    if (!product.active) {
      return jsonError(400, 'Product is not active');
    }

    // Check for per-user rate override
    const { data: override } = await supabase
      .from('user_rate_overrides')
      .select('rate')
      .eq('user_id', user_id)
      .eq('product_id', product_id)
      .lte('effective_from', new Date().toISOString())
      .order('effective_from', { ascending: false })
      .limit(1)
      .single();

    const userRate = override?.rate ?? product.default_user_rate;

    // Create the order with status 'assigned' (skipping 'created')
    const { data: order, error: orderErr } = await supabase
      .from('orders')
      .insert({
        user_id,
        product_id,
        assigned_quantity,
        user_rate: userRate,
        status: 'assigned',
        assigned_at: new Date().toISOString(),
        due_date: due_date || null,
        created_by: adminUser.id,
      })
      .select('id, order_code, status')
      .single();

    if (orderErr) {
      return jsonError(500, `Failed to create order: ${orderErr.message}`);
    }

    // Write notification
    await supabase.from('notifications').insert({
      user_id,
      type: 'order_assigned',
      title: 'New Order Assigned',
      body: `You have a new order ${order.order_code} assigned to you.`,
    });

    // Write audit log
    await supabase.from('audit_log').insert({
      actor_id: adminUser.id,
      actor_type: 'admin',
      action: 'order_assigned',
      entity_table: 'orders',
      entity_id: order.id,
      after: JSON.stringify({
        user_id,
        product_id,
        assigned_quantity,
        user_rate: userRate,
        status: 'assigned',
      }),
    });

    return jsonOk({ order });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (message.includes('Invalid status transition')) {
      return jsonError(400, message);
    }
    return jsonError(500, message);
  }
});
