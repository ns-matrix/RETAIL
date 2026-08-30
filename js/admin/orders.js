// js/admin/orders.js — Admin order management

async function renderAdminOrders() {
  if (!requireAuth()) return;
  const supabase = getSupabase();

  const { data: orders } = await supabase
    .from('orders')
    .select('id, order_code, status, assigned_quantity, submitted_quantity, approved_quantity, user_rate, due_date, user_id, users(full_name, user_code)')
    .order('created_at', { ascending: false });

  document.getElementById('admin-page-title').textContent = 'Orders';

  document.getElementById('content').innerHTML = `
    <div class="flex-between mb-2">
      <h2>Orders</h2>
      <a href="#/orders/new" class="btn btn-primary btn-sm">+ New Order</a>
    </div>

    ${!orders || orders.length === 0
      ? '<div class="empty-state"><p>No orders yet</p></div>'
      : orders.map((o) => orderCardHTML(o, true)).join('')}
  `;
}

async function renderAdminOrderForm() {
  if (!requireAuth()) return;
  const supabase = getSupabase();

  const [productsRes, usersRes] = await Promise.all([
    supabase.from('products').select('id, name, default_user_rate').eq('active', true),
    supabase.from('users').select('id, full_name, user_code').eq('status', 'active'),
  ]);

  const products = productsRes.data || [];
  const users = usersRes.data || [];

  document.getElementById('admin-page-title').textContent = 'Create Order';

  document.getElementById('content').innerHTML = `
    <h2 class="mb-2">Create New Order</h2>
    <form onsubmit="handleAdminOrderCreate(event)">
      <div class="form-group">
        <label>User</label>
        <select id="order-user" required>
          <option value="">Select user...</option>
          ${users.map((u) => `<option value="${u.id}">${esc(u.full_name)} (${esc(u.user_code)})</option>`).join('')}
        </select>
      </div>
      <div class="form-group">
        <label>Product</label>
        <select id="order-product" required onchange="updateOrderRatePreview()">
          <option value="">Select product...</option>
          ${products.map((p) => `<option value="${p.id}" data-rate="${p.default_user_rate}">${esc(p.name)} — ₹${p.default_user_rate}/pc</option>`).join('')}
        </select>
      </div>
      <div class="form-row">
        <div class="form-group">
          <label>Quantity</label>
          <input type="number" id="order-qty" min="1" required>
        </div>
        <div class="form-group">
          <label>Due Date</label>
          <input type="date" id="order-due">
        </div>
      </div>
      <div id="order-rate-preview" class="card mb-2" style="display:none;">
        <div class="stat-row">
          <span class="stat-label">User Rate</span>
          <span class="stat-value" id="order-rate-value">₹0/pc</span>
        </div>
        <div class="stat-row">
          <span class="stat-label">Expected Earning</span>
          <span class="stat-value highlight" id="order-earning-value">₹0</span>
        </div>
      </div>
      <button type="submit" class="btn btn-primary btn-block">Assign Order</button>
    </form>
  `;
}

function updateOrderRatePreview() {
  const select = document.getElementById('order-product');
  const option = select.selectedOptions[0];
  const rate = option?.dataset?.rate || 0;
  const qty = parseInt(document.getElementById('order-qty')?.value) || 0;

  document.getElementById('order-rate-value').textContent = `₹${rate}/pc`;
  document.getElementById('order-earning-value').textContent = formatCurrency(rate * qty);
  document.getElementById('order-rate-preview').style.display = rate > 0 ? 'block' : 'none';

  document.getElementById('order-qty')?.addEventListener('input', () => {
    const q = parseInt(document.getElementById('order-qty').value) || 0;
    document.getElementById('order-earning-value').textContent = formatCurrency(rate * q);
  });
}

async function handleAdminOrderCreate(e) {
  e.preventDefault();
  const session = app.get('session');

  const data = {
    user_id: document.getElementById('order-user').value,
    product_id: document.getElementById('order-product').value,
    assigned_quantity: parseInt(document.getElementById('order-qty').value),
    due_date: document.getElementById('order-due').value || null,
  };

  try {
    const response = await fetch(`${APP_CONFIG.SUPABASE_URL}/functions/v1/assign-order`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${session.access_token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(data),
    });

    const result = await response.json();
    if (!response.ok) throw new Error(result.error);

    showToast('Order assigned successfully!');
    navigate('#/orders');
  } catch (err) {
    showError(err.message || 'Failed to create order');
  }
}
