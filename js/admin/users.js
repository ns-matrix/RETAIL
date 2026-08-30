// js/admin/users.js — User management + detail

async function renderUsers() {
  if (!requireAuth()) return;
  const supabase = getSupabase();

  const { data: users } = await supabase
    .from('users')
    .select('id, user_code, full_name, mobile, status, overall_verification, created_at')
    .order('created_at', { ascending: false });

  document.getElementById('admin-page-title').textContent = 'Users';

  document.getElementById('content').innerHTML = `
    <h2 class="mb-2">Users</h2>

    <div class="form-group mb-2">
      <input type="text" id="user-search" placeholder="Search by name, code, or mobile..." oninput="filterUsers(this.value)">
    </div>

    <div id="users-list">
      ${!users || users.length === 0
        ? '<div class="empty-state"><p>No users yet</p></div>'
        : users.map((u) => userListItemHTML(u)).join('')}
    </div>
  `;
}

function userListItemHTML(u) {
  return `
    <div class="card" style="cursor:pointer;" onclick="navigate('#/users/${u.id}')" data-search="${(u.full_name + ' ' + u.user_code + ' ' + u.mobile).toLowerCase()}">
      <div class="flex-between">
        <div>
          <strong>${esc(u.full_name)}</strong>
          <div class="text-muted" style="font-size:0.85rem;">${esc(u.user_code)} · ${maskPhone(u.mobile)}</div>
        </div>
        <div style="display:flex;gap:4px;">
          ${statusBadgeHTML(u.status)}
          ${statusBadgeHTML(u.overall_verification)}
        </div>
      </div>
    </div>
  `;
}

function filterUsers(query) {
  const q = query.toLowerCase();
  document.querySelectorAll('#users-list .card').forEach((card) => {
    const match = card.dataset.search.includes(q);
    card.style.display = match ? '' : 'none';
  });
}

async function renderUserDetail(userId) {
  if (!requireAuth()) return;
  const supabase = getSupabase();

  const { data: user, error } = await supabase
    .from('users')
    .select('*')
    .eq('id', userId)
    .single();

  if (error || !user) {
    document.getElementById('content').innerHTML = '<div class="empty-state"><p>User not found</p></div>';
    return;
  }

  const { data: profile } = await supabase.from('user_profiles').select('*').eq('user_id', userId).single();
  const { data: addresses } = await supabase.from('addresses').select('*').eq('user_id', userId);
  const { data: bank } = await supabase.from('bank_accounts').select('id, bank_name, account_number_last4, ifsc, verification_status').eq('user_id', userId).eq('is_primary', true).single();
  const { data: orders } = await supabase.from('orders').select('id, order_code, status, assigned_quantity, approved_quantity').eq('user_id', userId).order('created_at', { ascending: false }).limit(10);
  const { data: earnings } = await supabase.from('user_earnings').select('amount, status').eq('user_id', userId);

  const totalEarned = (earnings || []).reduce((s, e) => s + Number(e.amount), 0);

  document.getElementById('admin-page-title').textContent = user.full_name;

  document.getElementById('content').innerHTML = `
    <div class="flex-between mb-1">
      <h2>${esc(user.full_name)}</h2>
      <div style="display:flex;gap:4px;">
        ${statusBadgeHTML(user.status)}
      </div>
    </div>

    <div class="card mb-1">
      <div class="stat-row"><span class="stat-label">User Code</span><span class="stat-value">${esc(user.user_code)}</span></div>
      <div class="stat-row"><span class="stat-label">Mobile</span><span class="stat-value">${maskPhone(user.mobile)} ${user.mobile_verified ? '&#10003;' : ''}</span></div>
      ${user.email ? `<div class="stat-row"><span class="stat-label">Email</span><span class="stat-value">${esc(user.email)}</span></div>` : ''}
      <div class="stat-row"><span class="stat-label">KYC Status</span><span class="stat-value">${statusBadgeHTML(user.overall_verification)}</span></div>
      <div class="stat-row"><span class="stat-label">Joined</span><span class="stat-value">${formatDate(user.created_at)}</span></div>
    </div>

    ${profile ? `
      <div class="card mb-1">
        <h3 class="mb-1">Profile</h3>
        <div class="stat-row"><span class="stat-label">DOB</span><span class="stat-value">${profile.dob || '—'}</span></div>
        <div class="stat-row"><span class="stat-label">Gender</span><span class="stat-value">${profile.gender || '—'}</span></div>
        <div class="stat-row"><span class="stat-label">Occupation</span><span class="stat-value">${profile.occupation || '—'}</span></div>
      </div>
    ` : ''}

    ${bank ? `
      <div class="card mb-1">
        <h3 class="mb-1">Bank</h3>
        <div class="stat-row"><span class="stat-label">Bank</span><span class="stat-value">${esc(bank.bank_name)}</span></div>
        <div class="stat-row"><span class="stat-label">Account</span><span class="stat-value">${maskAccount(bank.account_number_last4)}</span></div>
        <div class="stat-row"><span class="stat-label">IFSC</span><span class="stat-value">${esc(bank.ifsc)}</span></div>
        <div class="stat-row"><span class="stat-label">Verification</span><span class="stat-value">${statusBadgeHTML(bank.verification_status)}</span></div>
      </div>
    ` : ''}

    <div class="card mb-1">
      <h3 class="mb-1">Earnings Summary</h3>
      <div class="stat-row"><span class="stat-label">Total Earned</span><span class="stat-value highlight">${formatCurrency(totalEarned)}</span></div>
    </div>

    <div class="card mb-1">
      <h3 class="mb-1">Recent Orders</h3>
      ${(orders || []).length === 0 ? '<p class="text-muted">No orders</p>' : (orders || []).map((o) => `
        <div class="stat-row">
          <span class="stat-label">${esc(o.order_code)}</span>
          <span class="stat-value">${statusBadgeHTML(o.status)} · ${o.approved_quantity}/${o.assigned_quantity}</span>
        </div>
      `).join('')}
    </div>

    <div class="flex gap-1 mt-2">
      <button class="btn ${user.status === 'active' ? 'btn-red' : 'btn-green'}" style="flex:1;" onclick="handleToggleUserStatus('${user.id}', '${user.status}')">
        ${user.status === 'active' ? 'Suspend' : 'Reactivate'}
      </button>
    </div>
  `;
}

async function handleToggleUserStatus(userId, currentStatus) {
  const session = app.get('session');
  const newStatus = currentStatus === 'active' ? 'suspended' : 'active';

  if (!confirm(`Are you sure you want to ${newStatus === 'suspended' ? 'suspend' : 'reactivate'} this user?`)) return;

  const supabase = getSupabase();
  const { error } = await supabase.from('users').update({ status: newStatus }).eq('id', userId);

  if (error) {
    showError('Failed to update user status: ' + error.message);
    return;
  }

  showToast(`User ${newStatus === 'suspended' ? 'suspended' : 'reactivated'}`);
  renderUserDetail(userId);
}
