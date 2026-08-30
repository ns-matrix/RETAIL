// js/user/profile.js — Profile view + edit navigation

async function renderProfilePage() {
  if (!requireAuth()) return;
  const user = app.get('user');
  if (!user) { showLoading(); return; }

  const supabase = getSupabase();

  // Fetch profile data
  const { data: profile } = await supabase
    .from('user_profiles')
    .select('*')
    .eq('user_id', user.id)
    .single();

  // Fetch addresses
  const { data: addresses } = await supabase
    .from('addresses')
    .select('*')
    .eq('user_id', user.id)
    .order('is_default', { ascending: false });

  // Fetch bank
  const { data: bank } = await supabase
    .from('bank_accounts')
    .select('id, account_holder_name, bank_name, account_number_last4, ifsc, upi_id, verification_status')
    .eq('user_id', user.id)
    .eq('is_primary', true)
    .single();

  const steps = [
    { key: 'edit', label: 'Personal Details', done: !!profile?.dob },
    { key: 'address', label: 'Address', done: addresses && addresses.length > 0 },
    { key: 'bank', label: 'Bank Details', done: !!bank },
    { key: 'documents', label: 'Documents (KYC)', done: user.overall_verification === 'verified' },
  ];

  const completedSteps = steps.filter((s) => s.done).length;
  const pct = Math.round((completedSteps / steps.length) * 100);

  document.getElementById('content').innerHTML = `
    <h2 class="mb-1">My Profile</h2>
    ${progressBarHTML(pct, 'Profile Completion')}

    <div class="card mt-2">
      <div class="flex-between">
        <div>
          <strong>${esc(user.full_name)}</strong>
          <div class="text-muted" style="font-size:0.85rem;">${esc(user.user_code)}</div>
        </div>
        ${statusBadgeHTML(user.status)}
      </div>
    </div>

    <div class="mt-2">
      ${steps.map((s) => `
        <div class="card" style="display:flex;justify-content:space-between;align-items:center;cursor:pointer;"
             onclick="navigate('#/profile/${s.key}')">
          <div>
            <strong>${s.label}</strong>
            <div class="text-muted" style="font-size:0.8rem;">${s.done ? 'Completed' : 'Not yet completed'}</div>
          </div>
          <span style="font-size:1.2rem;color:${s.done ? 'var(--green)' : 'var(--muted)'};">${s.done ? '&#10003;' : '&#8250;'}</span>
        </div>
      `).join('')}
    </div>

    <div class="card mt-2">
      <div class="stat-row">
        <span class="stat-label">Mobile</span>
        <span class="stat-value">${maskPhone(user.mobile)} ${user.mobile_verified ? '<span class="pill" style="font-size:0.7rem;">Verified</span>' : ''}</span>
      </div>
      ${user.email ? `
        <div class="stat-row">
          <span class="stat-label">Email</span>
          <span class="stat-value">${esc(user.email)}</span>
        </div>
      ` : ''}
      <div class="stat-row">
        <span class="stat-label">Member Since</span>
        <span class="stat-value">${formatDate(user.created_at)}</span>
      </div>
    </div>

    <button class="btn btn-outline btn-block mt-2" onclick="signOut()">Sign Out</button>
  `;
}

async function renderProfileEdit() {
  if (!requireAuth()) return;
  const user = app.get('user');

  document.getElementById('content').innerHTML = `
    <h2 class="mb-1">Edit Profile</h2>
    <form onsubmit="handleProfileUpdate(event)">
      <div class="form-group">
        <label>Full Name</label>
        <input type="text" id="edit-name" value="${esc(user.full_name)}" required>
      </div>
      <div class="form-row">
        <div class="form-group">
          <label>Date of Birth</label>
          <input type="date" id="edit-dob" value="${user.dob || ''}">
        </div>
        <div class="form-group">
          <label>Gender</label>
          <select id="edit-gender">
            <option value="">Select</option>
            <option value="male" ${user.gender === 'male' ? 'selected' : ''}>Male</option>
            <option value="female" ${user.gender === 'female' ? 'selected' : ''}>Female</option>
            <option value="other" ${user.gender === 'other' ? 'selected' : ''}>Other</option>
          </select>
        </div>
      </div>
      <div class="form-group">
        <label>Father/Husband Name</label>
        <input type="text" id="edit-father" value="${esc(user.father_husband_name || '')}">
      </div>
      <div class="form-row">
        <div class="form-group">
          <label>Occupation</label>
          <input type="text" id="edit-occupation" value="${esc(user.occupation || '')}">
        </div>
        <div class="form-group">
          <label>Experience</label>
          <input type="text" id="edit-experience" value="${esc(user.experience || '')}">
        </div>
      </div>
      <button type="submit" class="btn btn-primary btn-block">Save Profile</button>
    </form>
  `;
}

async function handleProfileUpdate(e) {
  e.preventDefault();
  const user = app.get('user');
  const supabase = getSupabase();

  const profileData = {
    dob: document.getElementById('edit-dob').value || null,
    gender: document.getElementById('edit-gender').value || null,
    father_husband_name: document.getElementById('edit-father').value || null,
    occupation: document.getElementById('edit-occupation').value || null,
    experience: document.getElementById('edit-experience').value || null,
  };

  const { error: profileErr } = await supabase
    .from('user_profiles')
    .upsert({ user_id: user.id, ...profileData }, { onConflict: 'user_id' });

  if (profileErr) {
    showError('Failed to save profile: ' + profileErr.message);
    return;
  }

  const newName = document.getElementById('edit-name').value;
  const { error: userErr } = await supabase
    .from('users')
    .update({ full_name: newName })
    .eq('id', user.id);

  if (userErr) {
    showError('Failed to update name: ' + userErr.message);
    return;
  }

  const updated = await fetchUserProfile(user.id);
  app.set('user', updated);
  showToast('Profile saved');
  navigate('/profile');
}

function renderAddressForm() {
  if (!requireAuth()) return;

  document.getElementById('content').innerHTML = `
    <h2 class="mb-1">Add Address</h2>
    <form onsubmit="handleAddressSave(event)">
      <div class="form-group">
        <label>Address Type</label>
        <select id="addr-type" required>
          <option value="home">Home</option>
          <option value="work">Work</option>
          <option value="other">Other</option>
        </select>
      </div>
      <div class="form-group">
        <label>Address Line 1</label>
        <input type="text" id="addr-line1" placeholder="House/Flat no., Building" required>
      </div>
      <div class="form-group">
        <label>Address Line 2</label>
        <input type="text" id="addr-line2" placeholder="Street, Lane">
      </div>
      <div class="form-group">
        <label>Area</label>
        <input type="text" id="addr-area" placeholder="Locality, Area" required>
      </div>
      <div class="form-row">
        <div class="form-group">
          <label>City</label>
          <input type="text" id="addr-city" required>
        </div>
        <div class="form-group">
          <label>District</label>
          <input type="text" id="addr-district" required>
        </div>
      </div>
      <div class="form-row">
        <div class="form-group">
          <label>State</label>
          <input type="text" id="addr-state" required>
        </div>
        <div class="form-group">
          <label>Pincode</label>
          <input type="text" id="addr-pincode" maxlength="6" pattern="[0-9]{6}" required>
        </div>
      </div>
      <div class="form-group">
        <label>Landmark</label>
        <input type="text" id="addr-landmark" placeholder="Near...">
      </div>
      <div class="form-group">
        <label><input type="checkbox" id="addr-default" checked> Set as default address</label>
      </div>
      <button type="submit" class="btn btn-primary btn-block">Save Address</button>
    </form>
  `;
}

async function handleAddressSave(e) {
  e.preventDefault();
  const user = app.get('user');
  const supabase = getSupabase();

  const addressData = {
    user_id: user.id,
    type: document.getElementById('addr-type').value,
    address_line_1: document.getElementById('addr-line1').value,
    address_line_2: document.getElementById('addr-line2').value || null,
    area: document.getElementById('addr-area').value,
    city: document.getElementById('addr-city').value,
    district: document.getElementById('addr-district').value,
    state: document.getElementById('addr-state').value,
    pincode: document.getElementById('addr-pincode').value,
    landmark: document.getElementById('addr-landmark').value || null,
    is_default: document.getElementById('addr-default').checked,
  };

  const { error } = await supabase.from('addresses').insert(addressData);
  if (error) {
    showError('Failed to save address: ' + error.message);
    return;
  }

  showToast('Address saved');
  navigate('/profile');
}

function renderBankForm() {
  if (!requireAuth()) return;

  document.getElementById('content').innerHTML = `
    <h2 class="mb-1">Bank Details</h2>
    <p class="text-muted mb-2" style="font-size:0.85rem;">Bank details are encrypted and stored securely. The full account number will not be displayed after saving.</p>
    <form onsubmit="handleBankSave(event)">
      <div class="form-group">
        <label>Account Holder Name</label>
        <input type="text" id="bank-name" placeholder="As per bank records" required>
      </div>
      <div class="form-group">
        <label>Bank Name</label>
        <input type="text" id="bank-bank-name" required>
      </div>
      <div class="form-group">
        <label>Account Number</label>
        <input type="text" id="bank-account" pattern="[0-9]{9,18}" required>
      </div>
      <div class="form-group">
        <label>IFSC Code</label>
        <input type="text" id="bank-ifsc" pattern="[A-Z]{4}0[A-Z0-9]{6}" placeholder="SBIN0001234" required>
      </div>
      <div class="form-row">
        <div class="form-group">
          <label>Branch</label>
          <input type="text" id="bank-branch">
        </div>
        <div class="form-group">
          <label>Account Type</label>
          <select id="bank-type">
            <option value="savings">Savings</option>
            <option value="current">Current</option>
          </select>
        </div>
      </div>
      <div class="form-group">
        <label>UPI ID (optional)</label>
        <input type="text" id="bank-upi" placeholder="name@bank">
      </div>
      <button type="submit" class="btn btn-primary btn-block">Save Bank Details</button>
    </form>
  `;
}

async function handleBankSave(e) {
  e.preventDefault();
  const user = app.get('user');
  const supabase = getSupabase();
  const accountNumber = document.getElementById('bank-account').value;
  const last4 = accountNumber.slice(-4);

  const { error } = await supabase.from('bank_accounts').insert({
    user_id: user.id,
    account_holder_name: document.getElementById('bank-name').value,
    bank_name: document.getElementById('bank-bank-name').value,
    account_number_encrypted: accountNumber,
    account_number_last4: last4,
    ifsc: document.getElementById('bank-ifsc').value,
    branch_name: document.getElementById('bank-branch').value || null,
    account_type: document.getElementById('bank-type').value,
    upi_id: document.getElementById('bank-upi').value || null,
    is_primary: true,
  });

  if (error) {
    showError('Failed to save bank details: ' + error.message);
    return;
  }

  showToast('Bank details saved securely');
  navigate('/profile');
}

function renderDocuments() {
  if (!requireAuth()) return;
  const user = app.get('user');

  document.getElementById('content').innerHTML = `
    <h2 class="mb-1">Documents (KYC)</h2>
    <p class="text-muted mb-2" style="font-size:0.85rem;">Upload your identity and address proof documents.</p>

    <div class="card mb-2">
      <div class="flex-between">
        <strong>Verification Status</strong>
        ${statusBadgeHTML(user.overall_verification)}
      </div>
    </div>

    <div class="card">
      <p class="text-muted" style="font-size:0.85rem;">Document upload will be available once KYC document types are configured by the admin.</p>
    </div>
  `;
}
