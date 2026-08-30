// js/admin/analytics.js — Admin dashboard + analytics

function renderAdminLogin() {
  document.getElementById('content').innerHTML = `
    <div class="card" style="margin-top:2rem;">
      <h2 class="text-center mb-2">Admin Login</h2>
      <form onsubmit="handleAdminLogin(event)">
        <div class="form-group">
          <label for="admin-phone">Mobile Number</label>
          <input type="tel" id="admin-phone" placeholder="10-digit mobile" maxlength="10" pattern="[0-9]{10}" required>
        </div>
        <button type="submit" class="btn btn-primary btn-block">Send OTP</button>
      </form>
      <div id="admin-otp-section" style="display:none;margin-top:1rem;">
        <div class="form-group">
          <label for="admin-otp">Enter OTP</label>
          <input type="text" id="admin-otp" placeholder="6-digit code" maxlength="6" pattern="[0-9]{6}">
        </div>
        <button class="btn btn-green btn-block" onclick="handleAdminVerifyOTP()">Verify & Sign In</button>
      </div>
    </div>
  `;
}

async function handleAdminLogin(e) {
  e.preventDefault();
  const phone = document.getElementById('admin-phone').value;
  try {
    await sendOTP(phone);
    document.getElementById('admin-otp-section').style.display = 'block';
    showToast('OTP sent');
  } catch (err) {
    showError(err.message);
  }
}

async function handleAdminVerifyOTP() {
  const phone = document.getElementById('admin-phone').value;
  const otp = document.getElementById('admin-otp').value;
  try {
    await verifyOTP(phone, otp);
    showToast('Signed in');
  } catch (err) {
    showError(err.message);
  }
}

async function renderAdminDashboard() {
  if (!requireAuth()) return;
  const adminUser = app.get('adminUser');
  const supabase = getSupabase();

  const [ordersRes, usersRes, earningsRes, payoutsRes] = await Promise.all([
    supabase.from('orders').select('id, status', { count: 'exact' }),
    supabase.from('users').select('id', { count: 'exact' }),
    supabase.from('user_earnings').select('amount, status'),
    supabase.from('payments').select('id, status', { count: 'exact' }),
  ]);

  const orders = ordersRes.data || [];
  const totalOrders = orders.length;
  const activeOrders = orders.filter((o) => !['completed', 'paid', 'cancelled'].includes(o.status)).length;
  const totalUsers = usersRes.count || 0;
  const earnings = earningsRes.data || [];
  const totalPayable = earnings.filter((e) => e.status === 'accrued').reduce((s, e) => s + Number(e.amount), 0);
  const totalPaid = earnings.filter((e) => e.status === 'paid').reduce((s, e) => s + Number(e.amount), 0);

  document.getElementById('admin-page-title').textContent = 'Dashboard';

  document.getElementById('content').innerHTML = `
    <h2 class="mb-1">Overview</h2>

    <div class="stat-grid">
      <div class="stat-tile">
        <div class="stat-value">${totalUsers}</div>
        <div class="stat-label">Users</div>
      </div>
      <div class="stat-tile">
        <div class="stat-value">${totalOrders}</div>
        <div class="stat-label">Total Orders</div>
      </div>
      <div class="stat-tile">
        <div class="stat-value">${activeOrders}</div>
        <div class="stat-label">Active Orders</div>
      </div>
      <div class="stat-tile">
        <div class="stat-value">${formatCurrency(totalPayable)}</div>
        <div class="stat-label">Payable</div>
      </div>
    </div>

    <div class="card mt-2">
      <h3 class="mb-1">Quick Links</h3>
      <a href="#/products" class="list-item">Products & Rates</a>
      <a href="#/orders/new" class="list-item">Create New Order</a>
      <a href="#/verification" class="list-item">Verification Queue</a>
      <a href="#/payouts/new" class="list-item">Initiate Payout</a>
    </div>

    <div class="card mt-2">
      <h3 class="mb-1">Revenue Summary</h3>
      <div class="stat-row">
        <span class="stat-label">Total Paid Out</span>
        <span class="stat-value">${formatCurrency(totalPaid)}</span>
      </div>
      <div class="stat-row">
        <span class="stat-label">Currently Payable</span>
        <span class="stat-value highlight">${formatCurrency(totalPayable)}</span>
      </div>
    </div>
  `;
}

async function renderAnalytics() {
  if (!requireAuth()) return;
  const supabase = getSupabase();

  const { data: orders } = await supabase.from('orders').select('status, assigned_quantity, approved_quantity, user_rate');
  const { data: earnings } = await supabase.from('user_earnings').select('amount, status');
  const { data: payments } = await supabase.from('payments').select('amount, status');

  const totalOrders = orders?.length || 0;
  const completedOrders = orders?.filter((o) => o.status === 'completed' || o.status === 'paid').length || 0;
  const completionRate = totalOrders > 0 ? Math.round((completedOrders / totalOrders) * 100) : 0;

  const totalRevenue = earnings?.filter((e) => e.status === 'paid').reduce((s, e) => s + Number(e.amount), 0) || 0;
  const pendingPayouts = earnings?.filter((e) => e.status === 'accrued').reduce((s, e) => s + Number(e.amount), 0) || 0;

  document.getElementById('admin-page-title').textContent = 'Analytics';

  document.getElementById('content').innerHTML = `
    <h2 class="mb-1">Business Analytics</h2>

    <div class="stat-grid">
      <div class="stat-tile">
        <div class="stat-value">${completionRate}%</div>
        <div class="stat-label">Completion Rate</div>
      </div>
      <div class="stat-tile">
        <div class="stat-value">${formatCurrency(totalRevenue)}</div>
        <div class="stat-label">Revenue Paid</div>
      </div>
      <div class="stat-tile">
        <div class="stat-value">${formatCurrency(pendingPayouts)}</div>
        <div class="stat-label">Pending Payouts</div>
      </div>
    </div>

    <div class="card mt-2">
      <h3 class="mb-1">Order Status Distribution</h3>
      ${renderOrderStatusBreakdown(orders || [])}
    </div>

    <div class="card mt-2">
      <h3 class="mb-1">Earnings by Status</h3>
      ${renderEarningsBreakdown(earnings || [])}
    </div>
  `;
}

function renderOrderStatusBreakdown(orders) {
  const statusCounts = {};
  orders.forEach((o) => {
    statusCounts[o.status] = (statusCounts[o.status] || 0) + 1;
  });

  return Object.entries(statusCounts).map(([status, count]) => `
    <div class="stat-row">
      <span class="stat-label">${statusBadgeHTML(status)}</span>
      <span class="stat-value">${count}</span>
    </div>
  `).join('');
}

function renderEarningsBreakdown(earnings) {
  const statusCounts = {};
  earnings.forEach((e) => {
    if (!statusCounts[e.status]) statusCounts[e.status] = { count: 0, amount: 0 };
    statusCounts[e.status].count++;
    statusCounts[e.status].amount += Number(e.amount);
  });

  return Object.entries(statusCounts).map(([status, data]) => `
    <div class="stat-row">
      <span class="stat-label">${statusBadgeHTML(status)} (${data.count})</span>
      <span class="stat-value">${formatCurrency(data.amount)}</span>
    </div>
  `).join('');
}
