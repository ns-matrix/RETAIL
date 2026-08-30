// js/user/dashboard.js — Worker dashboard

async function renderDashboard() {
  if (!requireAuth()) return;
  const user = app.get('user');
  if (!user) { showLoading(); return; }

  document.getElementById('app-title').textContent = `Hi, ${user.full_name?.split(' ')[0] || 'there'}`;

  const supabase = getSupabase();

  // Fetch summary data in parallel
  const [ordersRes, earningsRes, notificationsRes] = await Promise.all([
    supabase.from('orders').select('id, order_code, status, approved_quantity, user_rate, due_date, assigned_quantity, submitted_quantity, product_id').eq('user_id', user.id).order('created_at', { ascending: false }).limit(5),
    supabase.from('user_earnings').select('amount, status').eq('user_id', user.id),
    supabase.from('notifications').select('id, title, body, read, created_at').eq('user_id', user.id).order('created_at', { ascending: false }).limit(5),
  ]);

  const orders = ordersRes.data || [];
  const earnings = earningsRes.data || [];
  const notifications = notificationsRes.data || [];

  const totalEarned = earnings.reduce((sum, e) => sum + Number(e.amount), 0);
  const paidAmount = earnings.filter((e) => e.status === 'paid').reduce((sum, e) => sum + Number(e.amount), 0);
  const pendingAmount = earnings.filter((e) => e.status === 'accrued').reduce((sum, e) => sum + Number(e.amount), 0);
  const activeOrders = orders.filter((o) => !['completed', 'paid', 'cancelled'].includes(o.status));
  const unreadNotifs = notifications.filter((n) => !n.read).length;

  document.getElementById('content').innerHTML = `
    <div class="stat-grid">
      <div class="stat-tile">
        <div class="stat-value">${formatCurrency(totalEarned)}</div>
        <div class="stat-label">Total Earned</div>
      </div>
      <div class="stat-tile">
        <div class="stat-value">${activeOrders.length}</div>
        <div class="stat-label">Active Orders</div>
      </div>
      <div class="stat-tile">
        <div class="stat-value">${formatCurrency(pendingAmount)}</div>
        <div class="stat-label">Pending</div>
      </div>
      <div class="stat-tile">
        <div class="stat-value">${formatCurrency(paidAmount)}</div>
        <div class="stat-label">Paid</div>
      </div>
    </div>

    <div class="flex-between mb-1">
      <h2>Recent Orders</h2>
      <a href="#/orders" class="btn btn-sm btn-outline">View All</a>
    </div>

    ${orders.length === 0
      ? '<div class="empty-state"><p>No orders yet</p></div>'
      : orders.map((o) => orderCardHTML(o)).join('')}

    ${notifications.length > 0 ? `
      <h2 class="mt-2 mb-1">Notifications ${unreadNotifs > 0 ? `<span class="pill">${unreadNotifs} new</span>` : ''}</h2>
      ${notifications.map((n) => `
        <div class="card" style="opacity:${n.read ? '0.6' : '1'};">
          <strong style="font-size:0.9rem;">${esc(n.title)}</strong>
          <p class="text-muted" style="font-size:0.8rem;margin:4px 0 0;">${esc(n.body)}</p>
        </div>
      `).join('')}
    ` : ''}
  `;

  // Subscribe to live updates
  subscribeToOrders(user.id, () => renderDashboard());
  subscribeToNotifications(user.id, () => renderDashboard());
}
