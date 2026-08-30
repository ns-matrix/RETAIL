// js/user/onboarding.js — Login, Register

function renderLogin() {
  document.getElementById('content').innerHTML = `
    <div class="card" style="margin-top:2rem;">
      <h2 class="text-center mb-2">Welcome Back</h2>
      <form id="login-form" onsubmit="handleLogin(event)">
        <div class="form-group">
          <label for="login-phone">Mobile Number</label>
          <input type="tel" id="login-phone" placeholder="10-digit mobile" maxlength="10" pattern="[0-9]{10}" required>
        </div>
        <button type="submit" class="btn btn-primary btn-block" id="login-btn">Send OTP</button>
      </form>
      <div id="otp-section" style="display:none;margin-top:1rem;">
        <div class="form-group">
          <label for="login-otp">Enter OTP</label>
          <input type="text" id="login-otp" placeholder="6-digit code" maxlength="6" pattern="[0-9]{6}">
        </div>
        <button class="btn btn-green btn-block" onclick="handleVerifyOTP()">Verify & Sign In</button>
      </div>
      <p class="text-center mt-2" style="font-size:0.85rem;">
        New here? <a href="#/register" style="color:var(--accent);">Create Account</a>
      </p>
    </div>
  `;
}

async function handleLogin(e) {
  e.preventDefault();
  const phone = document.getElementById('login-phone').value;
  const btn = document.getElementById('login-btn');
  btn.disabled = true;
  btn.textContent = 'Sending...';

  try {
    await sendOTP(phone);
    document.getElementById('otp-section').style.display = 'block';
    btn.textContent = 'OTP Sent';
    showToast('OTP sent to your mobile');
  } catch (err) {
    btn.disabled = false;
    btn.textContent = 'Send OTP';
    showError(err.message || 'Failed to send OTP');
  }
}

async function handleVerifyOTP() {
  const phone = document.getElementById('login-phone').value;
  const otp = document.getElementById('login-otp').value;

  if (!otp || otp.length !== 6) {
    showError('Please enter a 6-digit OTP');
    return;
  }

  try {
    const data = await verifyOTP(phone, otp);
    showToast('Signed in successfully');
  } catch (err) {
    showError(err.message || 'Invalid OTP');
  }
}

function renderRegister() {
  document.getElementById('content').innerHTML = `
    <div class="card" style="margin-top:1rem;">
      <h2 class="text-center mb-2">Create Account</h2>
      <form onsubmit="handleRegister(event)">
        <div class="form-group">
          <label for="reg-name">Full Name</label>
          <input type="text" id="reg-name" placeholder="As per ID proof" required>
        </div>
        <div class="form-group">
          <label for="reg-phone">Mobile Number</label>
          <input type="tel" id="reg-phone" placeholder="10-digit mobile" maxlength="10" pattern="[0-9]{10}" required>
        </div>
        <div class="form-group">
          <label for="reg-email">Email (optional)</label>
          <input type="email" id="reg-email" placeholder="email@example.com">
        </div>
        <button type="submit" class="btn btn-primary btn-block">Send OTP</button>
      </form>
      <div id="reg-otp-section" style="display:none;margin-top:1rem;">
        <div class="form-group">
          <label for="reg-otp">Enter OTP</label>
          <input type="text" id="reg-otp" placeholder="6-digit code" maxlength="6">
        </div>
        <button class="btn btn-green btn-block" onclick="handleRegisterVerify()">Verify & Create Account</button>
      </div>
      <p class="text-center mt-2" style="font-size:0.85rem;">
        Already have an account? <a href="#/login" style="color:var(--accent);">Sign In</a>
      </p>
    </div>
  `;
}

async function handleRegister(e) {
  e.preventDefault();
  const phone = document.getElementById('reg-phone').value;
  try {
    await sendOTP(phone);
    document.getElementById('reg-otp-section').style.display = 'block';
    showToast('OTP sent to your mobile');
  } catch (err) {
    showError(err.message || 'Failed to send OTP');
  }
}

async function handleRegisterVerify() {
  const phone = document.getElementById('reg-phone').value;
  const otp = document.getElementById('reg-otp').value;
  const name = document.getElementById('reg-name').value;
  const email = document.getElementById('reg-email').value;

  try {
    const result = await verifyOTP(phone, otp);
    showToast('Account created! Please complete your profile.');
    navigate('/profile');
  } catch (err) {
    showError(err.message || 'Verification failed');
  }
}
