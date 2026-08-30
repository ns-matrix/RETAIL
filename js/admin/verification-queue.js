// js/admin/verification-queue.js — Review submitted work

async function renderVerificationQueue() {
  if (!requireAuth()) return;
  const supabase = getSupabase();

  const { data: submissions } = await supabase
    .from('order_submissions')
    .select('id, submitted_quantity, notes, verification_status, submitted_at, order_id, orders(order_code, user_id, users(full_name, user_code))')
    .eq('verification_status', 'submitted')
    .order('submitted_at', { ascending: true });

  document.getElementById('admin-page-title').textContent = 'Verification Queue';

  document.getElementById('content').innerHTML = `
    <h2 class="mb-2">Pending Verification</h2>

    ${!submissions || submissions.length === 0
      ? '<div class="empty-state"><p>No pending submissions</p></div>'
      : submissions.map((s) => `
        <div class="card" style="cursor:pointer;" onclick="navigate('#/verification/${s.id}')">
          <div class="card-header">
            <div>
              <strong>${esc(s.orders?.order_code || '—')}</strong>
              <div class="text-muted" style="font-size:0.8rem;">by ${esc(s.orders?.users?.full_name || 'Unknown')} (${esc(s.orders?.users?.user_code || '')})</div>
            </div>
            ${statusBadgeHTML(s.verification_status)}
          </div>
          <div class="card-body">
            <div class="stat-row">
              <span class="stat-label">Quantity Submitted</span>
              <span class="stat-value">${s.submitted_quantity}</span>
            </div>
            <div class="stat-row">
              <span class="stat-label">Submitted</span>
              <span class="stat-value">${formatDateTime(s.submitted_at)}</span>
            </div>
            ${s.notes ? `<div class="text-muted mt-1" style="font-size:0.85rem;">"${esc(s.notes)}"</div>` : ''}
          </div>
        </div>
      `).join('')}
  `;
}

async function renderVerificationDetail(submissionId) {
  if (!requireAuth()) return;
  const supabase = getSupabase();

  const { data: submission, error } = await supabase
    .from('order_submissions')
    .select('*, orders(order_code, user_id, assigned_quantity, submitted_quantity, approved_quantity, user_rate, users(full_name, user_code))')
    .eq('id', submissionId)
    .single();

  if (error || !submission) {
    document.getElementById('content').innerHTML = '<div class="empty-state"><p>Submission not found</p></div>';
    return;
  }

  const order = submission.orders;
  const remaining = order.assigned_quantity - order.approved_quantity;

  document.getElementById('admin-page-title').textContent = `Review: ${order.order_code}`;

  document.getElementById('content').innerHTML = `
    <div class="flex-between mb-1">
      <h2>Review Submission</h2>
      ${statusBadgeHTML(submission.verification_status)}
    </div>

    <div class="card mb-1">
      <div class="stat-row">
        <span class="stat-label">Order</span>
        <span class="stat-value">${esc(order.order_code)}</span>
      </div>
      <div class="stat-row">
        <span class="stat-label">Worker</span>
        <span class="stat-value">${esc(order.users?.full_name || '—')} (${esc(order.users?.user_code || '')})</span>
      </div>
      <div class="stat-row">
        <span class="stat-label">Rate</span>
        <span class="stat-value">${formatCurrency(order.user_rate)}/pc</span>
      </div>
    </div>

    <div class="card mb-1">
      <h3 class="mb-1">Quantity Summary</h3>
      <div class="stat-row">
        <span class="stat-label">Assigned</span>
        <span class="stat-value">${order.assigned_quantity}</span>
      </div>
      <div class="stat-row">
        <span class="stat-label">Previously Approved</span>
        <span class="stat-value">${order.approved_quantity}</span>
      </div>
      <div class="stat-row">
        <span class="stat-label">This Submission</span>
        <span class="stat-value highlight">${submission.submitted_quantity}</span>
      </div>
      <div class="stat-row">
        <span class="stat-label">Remaining After</span>
        <span class="stat-value">${remaining}</span>
      </div>
    </div>

    ${submission.notes ? `
      <div class="card mb-1">
        <strong>Worker Notes:</strong>
        <p class="text-muted mt-1">${esc(submission.notes)}</p>
      </div>
    ` : ''}

    <div class="card mb-2">
      <h3 class="mb-1">Verify Quantity</h3>
      <div class="form-group">
        <label>Approved Quantity</label>
        <input type="number" id="verify-qty" min="0" max="${submission.submitted_quantity}" value="${submission.submitted_quantity}">
        <div class="form-help">Max: ${submission.submitted_quantity} (full approval)</div>
      </div>
      <div class="form-group">
        <label>Rejection Reason (if rejecting)</label>
        <textarea id="verify-reason" placeholder="Required if rejecting..."></textarea>
      </div>
    </div>

    <div class="flex gap-1">
      <button class="btn btn-green" style="flex:1;" onclick="handleVerifyAction('${submission.id}', 'approved')">Approve</button>
      <button class="btn btn-red" style="flex:1;" onclick="handleVerifyAction('${submission.id}', 'rejected')">Reject</button>
    </div>

    <button class="btn btn-outline btn-block mt-2" onclick="navigate('#/verification')">Back to Queue</button>
  `;
}

async function handleVerifyAction(submissionId, decision) {
  const session = app.get('session');
  const approvedQty = parseInt(document.getElementById('verify-qty').value) || 0;
  const reason = document.getElementById('verify-reason').value;

  if (decision === 'rejected' && !reason) {
    showError('Rejection reason is required');
    return;
  }

  try {
    const response = await fetch(`${APP_CONFIG.SUPABASE_URL}/functions/v1/verify-submission`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${session.access_token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        submission_id: submissionId,
        approved_quantity: approvedQty,
        decision,
        reason: reason || null,
      }),
    });

    const data = await response.json();
    if (!response.ok) throw new Error(data.error);

    showToast(decision === 'approved' ? 'Submission approved!' : 'Submission rejected');
    navigate('#/verification');
  } catch (err) {
    showError(err.message || 'Failed to process verification');
  }
}
