// components/order-card.js — orderCardHTML(order) -> string

function orderCardHTML(order, showUser = false) {
  const earning = (order.approved_quantity * order.user_rate).toFixed(2);
  const remaining = order.assigned_quantity - order.approved_quantity;
  const progress = order.assigned_quantity > 0
    ? Math.round((order.approved_quantity / order.assigned_quantity) * 100)
    : 0;

  return `
    <div class="card order-card" onclick="navigate('#/orders/${order.id}')">
      <div class="card-header">
        <span class="order-code">${esc(order.order_code)}</span>
        ${statusBadgeHTML(order.status)}
      </div>
      ${showUser && order.users ? `<div class="card-subtitle">${esc(order.users.full_name || '')}</div>` : ''}
      <div class="card-body">
        <div class="stat-row">
          <span class="stat-label">Assigned</span>
          <span class="stat-value">${order.assigned_quantity}</span>
        </div>
        <div class="stat-row">
          <span class="stat-label">Approved</span>
          <span class="stat-value">${order.approved_quantity}</span>
        </div>
        <div class="stat-row">
          <span class="stat-label">Remaining</span>
          <span class="stat-value">${remaining > 0 ? remaining : '—'}</span>
        </div>
        <div class="stat-row highlight">
          <span class="stat-label">Rate</span>
          <span class="stat-value">₹${order.user_rate}/pc</span>
        </div>
        <div class="stat-row highlight">
          <span class="stat-label">Earning</span>
          <span class="stat-value">₹${earning}</span>
        </div>
      </div>
      ${order.due_date ? `<div class="card-footer">Due: ${formatDate(order.due_date)}</div>` : ''}
      ${progressBarHTML(progress, 'Progress')}
    </div>
  `;
}

function formatDate(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

function formatDateTime(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-IN', {
    day: 'numeric', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

function formatCurrency(amount) {
  return '₹' + Number(amount).toLocaleString('en-IN', { minimumFractionDigits: 2 });
}
