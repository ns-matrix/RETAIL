// js/user/earnings.js — Earnings list and breakdown

async function renderEarnings() {
  if (!requireAuth()) return;
  const user = app.get('user');
  const supabase = getSupabase();

  const { data: earnings } = await supabase
    .from('user_earnings')
    .select('id, approved_quantity, rate, amount, status, created_at, order_id, orders(order_code)')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false });

  const totalEarned = (earnings || []).reduce((sum, e) => sum + Number(e.amount), 0);
  const paidAmount = (earnings || []).filter((e) => e.status === 'paid').reduce((sum, e) => sum + Number(e.amount), 0);
  const pendingAmount = (earnings || []).filter((e) => e.status === 'accrued').reduce((sum, e) => sum + Number(e.amount), 0);

  document.getElementById('content').innerHTML = `
    <h2 class="mb-1">My Earnings</h2>

    <div class="stat-grid mb-2">
      <div class="stat-tile">
        <div class="stat-value">${formatCurrency(totalEarned)}</div>
        <div class="stat-label">Total Earned</div>
      </div>
      <div class="stat-tile">
        <div class="stat-value">${formatCurrency(paidAmount)}</div>
        <div class="stat-label">Paid</div>
      </div>
      <div class="stat-tile">
        <div class="stat-value">${formatCurrency(pendingAmount)}</div>
        <div class="stat-label">Pending</div>
      </div>
    </div>

    ${!earnings || earnings.length === 0
      ? '<div class="empty-state"><p>No earnings yet. Complete and get orders approved to start earning.</p></div>'
      : `
        <h3 class="mb-1">Per-Order Breakdown</h3>
        <table class="data-table">
          <thead>
            <tr>
              <th>Order</th>
              <th>Qty</th>
              <th>Rate</th>
              <th>Earned</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            ${earnings.map((e) => `
              <tr>
                <td>${esc(e.orders?.order_code || '—')}</td>
                <td>${e.approved_quantity}</td>
                <td>${formatCurrency(e.rate)}</td>
                <td>${formatCurrency(e.amount)}</td>
                <td>${statusBadgeHTML(e.status)}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      `}
  `;
}
