// js/user/orders.js — Order list + detail + submit form

async function renderOrdersList() {
  if (!requireAuth()) return;
  const user = app.get('user');
  const supabase = getSupabase();

  const { data: orders } = await supabase
    .from('orders')
    .select('id, order_code, status, assigned_quantity, submitted_quantity, approved_quantity, user_rate, due_date')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false });

  document.getElementById('content').innerHTML = `
    <h2 class="mb-1">My Orders</h2>
    ${!orders || orders.length === 0
      ? '<div class="empty-state"><p>No orders assigned yet</p></div>'
      : orders.map((o) => orderCardHTML(o)).join('')}
  `;
}

async function renderOrderDetail(orderId) {
  if (!requireAuth()) return;
  const supabase = getSupabase();

  const { data: order, error } = await supabase
    .from('orders')
    .select('*, products(name, sku)')
    .eq('id', orderId)
    .single();

  if (error || !order) {
    document.getElementById('content').innerHTML = '<div class="empty-state"><p>Order not found</p></div>';
    return;
  }

  const remaining = order.assigned_quantity - order.approved_quantity;
  const expectedEarning = order.assigned_quantity * order.user_rate;
  const earnedSoFar = order.approved_quantity * order.user_rate;
  const remainingEarning = remaining * order.user_rate;
  const progress = order.assigned_quantity > 0
    ? Math.round((order.approved_quantity / order.assigned_quantity) * 100)
    : 0;

  // Determine available actions
  let actionButtons = '';
  if (order.status === 'assigned') {
    actionButtons = `<button class="btn btn-green btn-block" onclick="handleAcceptOrder('${order.id}')">Accept Order</button>`;
  } else if (order.status === 'in_progress' || order.status === 'correction_required') {
    actionButtons = `
      <button class="btn btn-primary btn-block" onclick="handleShowSubmitForm('${order.id}', ${remaining})">
        Submit Work
      </button>
    `;
  }

  document.getElementById('content').innerHTML = `
    <div class="flex-between mb-1">
      <h2>${esc(order.order_code)}</h2>
      ${statusBadgeHTML(order.status)}
    </div>

    <div class="card mb-1">
      <div class="stat-row">
        <span class="stat-label">Product</span>
        <span class="stat-value">${esc(order.products?.name || 'N/A')}</span>
      </div>
      <div class="stat-row">
        <span class="stat-label">SKU</span>
        <span class="stat-value">${esc(order.products?.sku || 'N/A')}</span>
      </div>
      ${order.due_date ? `
        <div class="stat-row">
          <span class="stat-label">Due Date</span>
          <span class="stat-value">${formatDate(order.due_date)}</span>
        </div>
      ` : ''}
    </div>

    <div class="card mb-1">
      <h3 class="mb-1">Quantity Breakdown</h3>
      <div class="stat-row">
        <span class="stat-label">Assigned</span>
        <span class="stat-value">${order.assigned_quantity}</span>
      </div>
      <div class="stat-row">
        <span class="stat-label">Submitted</span>
        <span class="stat-value">${order.submitted_quantity}</span>
      </div>
      <div class="stat-row">
        <span class="stat-label">Approved</span>
        <span class="stat-value">${order.approved_quantity}</span>
      </div>
      <div class="stat-row">
        <span class="stat-label">Rejected</span>
        <span class="stat-value">${order.rejected_quantity}</span>
      </div>
      <div class="stat-row highlight">
        <span class="stat-label">Remaining</span>
        <span class="stat-value">${remaining}</span>
      </div>
    </div>

    <div class="card mb-1">
      <h3 class="mb-1">Earnings Breakdown</h3>
      <div class="stat-row">
        <span class="stat-label">Rate per piece</span>
        <span class="stat-value">${formatCurrency(order.user_rate)}</span>
      </div>
      <div class="stat-row">
        <span class="stat-label">Expected (if all approved)</span>
        <span class="stat-value">${formatCurrency(expectedEarning)}</span>
      </div>
      <div class="stat-row highlight">
        <span class="stat-label">Earned so far</span>
        <span class="stat-value">${formatCurrency(earnedSoFar)}</span>
      </div>
      <div class="stat-row">
        <span class="stat-label">Remaining potential</span>
        <span class="stat-value">${formatCurrency(remainingEarning)}</span>
      </div>
    </div>

    ${progressBarHTML(progress, 'Completion')}

    <div class="mt-2">${actionButtons}</div>

    <button class="btn btn-outline btn-block mt-2" onclick="navigate('#/orders')">Back to Orders</button>
  `;
}

async function handleAcceptOrder(orderId) {
  const supabase = getSupabase();
  const session = app.get('session');

  try {
    const response = await fetch(`${APP_CONFIG.SUPABASE_URL}/functions/v1/accept-order`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${session.access_token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ order_id: orderId }),
    });

    const data = await response.json();
    if (!response.ok) throw new Error(data.error);

    showToast('Order accepted!');
    renderOrderDetail(orderId);
  } catch (err) {
    showError(err.message || 'Failed to accept order');
  }
}

function handleShowSubmitForm(orderId, maxQuantity) {
  showModal('Submit Work', `
    <form onsubmit="handleSubmitOrder(event, '${orderId}')">
      <div class="form-group">
        <label>Quantity Completed</label>
        <input type="number" id="submit-qty" min="1" max="${maxQuantity}" value="${maxQuantity}" required>
        <div class="form-help">Max: ${maxQuantity} units</div>
      </div>
      <div class="form-group">
        <label>Notes (optional)</label>
        <textarea id="submit-notes" placeholder="Any notes about this submission..."></textarea>
      </div>
      <div class="form-group">
        <label>Proof Photo (optional)</label>
        <input type="file" id="submit-proof" accept="image/*">
      </div>
      <button type="submit" class="btn btn-primary btn-block">Submit</button>
    </form>
  `);
}

async function handleSubmitOrder(e, orderId) {
  e.preventDefault();
  const session = app.get('session');
  const quantity = parseInt(document.getElementById('submit-qty').value);
  const notes = document.getElementById('submit-notes').value;

  // Handle proof upload if present
  let proofPath = null;
  const proofFile = document.getElementById('submit-proof').files[0];
  if (proofFile) {
    const supabase = getSupabase();
    const user = app.get('user');
    const fileName = `${user.id}/${orderId}/${Date.now()}_${proofFile.name}`;
    const { data: uploadData, error: uploadErr } = await supabase.storage
      .from('submission-proofs')
      .upload(fileName, proofFile);
    if (!uploadErr) proofPath = uploadData?.path;
  }

  try {
    const response = await fetch(`${APP_CONFIG.SUPABASE_URL}/functions/v1/submit-order`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${session.access_token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        order_id: orderId,
        quantity,
        proof_path: proofPath,
        notes: notes || null,
      }),
    });

    const data = await response.json();
    if (!response.ok) throw new Error(data.error);

    closeModal();
    showToast('Work submitted for review!');
    renderOrderDetail(orderId);
  } catch (err) {
    showError(err.message || 'Failed to submit');
  }
}
