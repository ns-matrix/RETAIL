// js/admin/payouts.js — Payout management

async function renderPayouts() {
  if (!requireAuth()) return;
  const supabase = getSupabase();

  const { data: payments } = await supabase
    .from('payments')
    .select('id, payment_code, amount, payment_method, status, paid_at, created_at, user_id, users(full_name, user_code)')
    .order('created_at', { ascending: false });

  document.getElementById('admin-page-title').textContent = 'Payouts';

  document.getElementById('content').innerHTML = `
    <div class="flex-between mb-2">
      <h2>Payouts</h2>
      <a href="#/payouts/new" class="btn btn-primary btn-sm">+ New Payout</a>
    </div>

    ${!payments || payments.length === 0
      ? '<div class="empty-state"><p>No payouts yet</p></div>'
      : `<table class="data-table">
          <thead>
            <tr>
              <th>Code</th>
              <th>User</th>
              <th>Amount</th>
              <th>Method</th>
              <th>Status</th>
              <th>Date</th>
            </tr>
          </thead>
          <tbody>
            ${payments.map((p) => `
              <tr>
                <td><strong>${esc(p.payment_code)}</strong></td>
                <td>${esc(p.users?.full_name || '—')}</td>
                <td>${formatCurrency(p.amount)}</td>
                <td>${p.payment_method === 'upi' ? 'UPI' : 'Bank'}</td>
                <td>${statusBadgeHTML(p.status)}</td>
                <td>${formatDate(p.created_at)}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>`}
  `;
}

async function renderPayoutForm() {
  if (!requireAuth()) return;
  const supabase = getSupabase();

  // Fetch users with payable earnings
  const { data: payableUsers } = await supabase
    .from('user_earnings')
    .select('user_id, amount, users(full_name, user_code)')
    .eq('status', 'accrued');

  // Group by user
  const userMap = {};
  (payableUsers || []).forEach((e) => {
    if (!userMap[e.user_id]) {
      userMap[e.user_id] = {
        user_id: e.user_id,
        full_name: e.users?.full_name || 'Unknown',
        user_code: e.users?.user_code || '',
        total: 0,
      };
    }
    userMap[e.user_id].total += Number(e.amount);
  });

  const usersWithPayable = Object.values(userMap);

  document.getElementById('admin-page-title').textContent = 'Initiate Payout';

  document.getElementById('content').innerHTML = `
    <h2 class="mb-2">Initiate Payout</h2>

    ${usersWithPayable.length === 0
      ? '<div class="empty-state"><p>No users with payable earnings</p></div>'
      : `
        <form onsubmit="handlePayoutCreate(event)">
          <div class="card mb-2">
            <h3 class="mb-1">Select Users</h3>
            <div class="form-group">
              <label><input type="checkbox" id="select-all-users" onchange="toggleAllUsers(this.checked)"> Select All</label>
            </div>
            ${usersWithPayable.map((u) => `
              <div class="stat-row" style="padding:8px 0;">
                <label style="display:flex;align-items:center;gap:8px;cursor:pointer;">
                  <input type="checkbox" class="payout-user" value="${u.user_id}" data-amount="${u.total}">
                  <div>
                    <strong>${esc(u.full_name)}</strong>
                    <div class="text-muted" style="font-size:0.8rem;">${esc(u.user_code)}</div>
                  </div>
                </label>
                <span class="stat-value">${formatCurrency(u.total)}</span>
              </div>
            `).join('')}
          </div>
          <button type="submit" class="btn btn-primary btn-block">Initiate Payout</button>
        </form>
      `}
  `;
}

function toggleAllUsers(checked) {
  document.querySelectorAll('.payout-user').forEach((cb) => {
    cb.checked = checked;
  });
}

async function handlePayoutCreate(e) {
  e.preventDefault();
  const session = app.get('session');
  const userIds = Array.from(document.querySelectorAll('.payout-user:checked')).map((cb) => cb.value);

  if (userIds.length === 0) {
    showError('Select at least one user');
    return;
  }

  try {
    const response = await fetch(`${APP_CONFIG.SUPABASE_URL}/functions/v1/initiate-payout`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${session.access_token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ user_ids: userIds }),
    });

    const data = await response.json();
    if (!response.ok) throw new Error(data.error);

    showToast(`Payout initiated for ${userIds.length} user(s)`);
    navigate('#/payouts');
  } catch (err) {
    showError(err.message || 'Failed to initiate payout');
  }
}
