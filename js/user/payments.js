// js/user/payments.js — Payment list + detail

async function renderPayments() {
  if (!requireAuth()) return;
  const user = app.get('user');
  const supabase = getSupabase();

  const { data: payments } = await supabase
    .from('payments')
    .select('id, payment_code, amount, payment_method, status, paid_at, created_at')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false });

  const totalPaid = (payments || []).filter((p) => p.status === 'successful').reduce((sum, p) => sum + Number(p.amount), 0);
  const processingAmount = (payments || []).filter((p) => p.status === 'processing').reduce((sum, p) => sum + Number(p.amount), 0);

  document.getElementById('content').innerHTML = `
    <h2 class="mb-1">My Payments</h2>

    <div class="stat-grid mb-2">
      <div class="stat-tile">
        <div class="stat-value">${formatCurrency(totalPaid)}</div>
        <div class="stat-label">Total Paid</div>
      </div>
      <div class="stat-tile">
        <div class="stat-value">${formatCurrency(processingAmount)}</div>
        <div class="stat-label">Processing</div>
      </div>
    </div>

    ${!payments || payments.length === 0
      ? '<div class="empty-state"><p>No payments yet</p></div>'
      : payments.map((p) => `
        <div class="card" style="cursor:pointer;" onclick="navigate('#/payments/${p.id}')">
          <div class="card-header">
            <span class="order-code">${esc(p.payment_code)}</span>
            ${statusBadgeHTML(p.status)}
          </div>
          <div class="card-body">
            <div class="stat-row">
              <span class="stat-label">Amount</span>
              <span class="stat-value highlight">${formatCurrency(p.amount)}</span>
            </div>
            <div class="stat-row">
              <span class="stat-label">Method</span>
              <span class="stat-value">${p.payment_method === 'upi' ? 'UPI' : 'Bank Transfer'}</span>
            </div>
            <div class="stat-row">
              <span class="stat-label">Date</span>
              <span class="stat-value">${formatDateTime(p.created_at)}</span>
            </div>
          </div>
        </div>
      `).join('')}
  `;
}

async function renderPaymentDetail(paymentId) {
  if (!requireAuth()) return;
  const supabase = getSupabase();

  const { data: payment, error } = await supabase
    .from('payments')
    .select('*')
    .eq('id', paymentId)
    .single();

  if (error || !payment) {
    document.getElementById('content').innerHTML = '<div class="empty-state"><p>Payment not found</p></div>';
    return;
  }

  // Fetch linked earnings
  const { data: linkedEarnings } = await supabase
    .from('payment_earnings')
    .select('earning_id, user_earnings(approved_quantity, rate, amount, order_id, orders(order_code))')
    .eq('payment_id', paymentId);

  document.getElementById('content').innerHTML = `
    <div class="flex-between mb-1">
      <h2>${esc(payment.payment_code)}</h2>
      ${statusBadgeHTML(payment.status)}
    </div>

    <div class="card mb-1">
      <div class="stat-row">
        <span class="stat-label">Amount</span>
        <span class="stat-value highlight" style="font-size:1.2rem;">${formatCurrency(payment.amount)}</span>
      </div>
      <div class="stat-row">
        <span class="stat-label">Method</span>
        <span class="stat-value">${payment.payment_method === 'upi' ? 'UPI' : 'Bank Transfer'}</span>
      </div>
      <div class="stat-row">
        <span class="stat-label">Initiated</span>
        <span class="stat-value">${formatDateTime(payment.created_at)}</span>
      </div>
      ${payment.paid_at ? `
        <div class="stat-row">
          <span class="stat-label">Paid On</span>
          <span class="stat-value">${formatDateTime(payment.paid_at)}</span>
        </div>
      ` : ''}
      ${payment.transaction_reference ? `
        <div class="stat-row">
          <span class="stat-label">Transaction Ref</span>
          <span class="stat-value">${esc(payment.transaction_reference)}</span>
        </div>
      ` : ''}
    </div>

    ${linkedEarnings && linkedEarnings.length > 0 ? `
      <h3 class="mb-1">Orders Settled</h3>
      ${linkedEarnings.map((le) => {
        const e = le.user_earnings;
        return `
          <div class="card">
            <div class="stat-row">
              <span class="stat-label">Order</span>
              <span class="stat-value">${esc(e?.orders?.order_code || '—')}</span>
            </div>
            <div class="stat-row">
              <span class="stat-label">Qty × Rate</span>
              <span class="stat-value">${e?.approved_quantity || 0} × ${formatCurrency(e?.rate || 0)}</span>
            </div>
            <div class="stat-row highlight">
              <span class="stat-label">Amount</span>
              <span class="stat-value">${formatCurrency(e?.amount || 0)}</span>
            </div>
          </div>
        `;
      }).join('')}
    ` : ''}

    <button class="btn btn-outline btn-block mt-2" onclick="navigate('#/payments')">Back to Payments</button>
  `;
}
