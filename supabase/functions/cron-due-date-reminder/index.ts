import { serve } from 'https://deno.land/std@0.208.0/http/server.ts';
import { handleCors, jsonError, jsonOk } from '../_shared/cors.ts';
import { getSupabaseAdmin } from '../_shared/supabase-admin.ts';

// Cron job: sends due-date reminders for orders due tomorrow.
// Scheduled via pg_cron or Supabase's cron extension.

serve(async (req) => {
  const corsResp = handleCors(req);
  if (corsResp) return corsResp;

  try {
    const supabase = getSupabaseAdmin();

    // Calculate tomorrow's date
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const tomorrowStr = tomorrow.toISOString().split('T')[0];

    // Find all orders due tomorrow that are not yet completed/paid/cancelled
    const { data: orders, error: ordersErr } = await supabase
      .from('orders')
      .select('id, order_code, user_id, due_date, status')
      .eq('due_date', tomorrowStr)
      .not('status', 'in', '("completed","paid","cancelled")');

    if (ordersErr) {
      return jsonError(500, `Failed to fetch orders: ${ordersErr.message}`);
    }

    if (!orders || orders.length === 0) {
      return jsonOk({ message: 'No orders due tomorrow', count: 0 });
    }

    let notified = 0;
    for (const order of orders) {
      // Check if reminder already sent today
      const todayStart = new Date().toISOString().split('T')[0];
      const { count } = await supabase
        .from('notifications')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', order.user_id)
        .eq('type', 'due_date_reminder')
        .like('body', `%${order.id}%`)
        .gte('created_at', todayStart);

      if (count && count > 0) {
        continue; // Already reminded today
      }

      await supabase.from('notifications').insert({
        user_id: order.user_id,
        type: 'due_date_reminder',
        title: 'Order Due Tomorrow',
        body: `Order ${order.order_code} is due tomorrow (${order.due_date}). Please complete and submit your work.`,
      });

      notified++;
    }

    return jsonOk({
      message: `Due-date reminders sent`,
      total_orders_due: orders.length,
      notifications_sent: notified,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return jsonError(500, message);
  }
});
