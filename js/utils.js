// utils.js — Shared helper functions

function esc(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function $(selector) {
  return document.querySelector(selector);
}

function $$(selector) {
  return document.querySelectorAll(selector);
}

function showLoading() {
  const el = document.getElementById('content');
  if (el) {
    el.innerHTML = `
      <div class="loading">
        <div class="spinner"></div>
        <p>Loading...</p>
      </div>
    `;
  }
}

function showError(message) {
  showModal('Error', `<p class="text-red">${esc(message)}</p><button class="btn" onclick="closeModal()">OK</button>`);
}

function showSuccess(message) {
  showModal('Success', `<p class="text-green">${esc(message)}</p><button class="btn" onclick="closeModal()">OK</button>`);
}

function showToast(message, duration = 3000) {
  let container = document.getElementById('toast-container');
  if (!container) {
    container = document.createElement('div');
    container.id = 'toast-container';
    document.body.appendChild(container);
  }

  const toast = document.createElement('div');
  toast.className = 'toast';
  toast.textContent = message;
  container.appendChild(toast);

  setTimeout(() => {
    toast.classList.add('toast-exit');
    setTimeout(() => toast.remove(), 300);
  }, duration);
}

// Phone number masking for display
function maskPhone(phone) {
  if (!phone || phone.length < 10) return phone;
  return phone.slice(0, 2) + '****' + phone.slice(-4);
}

// Bank account masking
function maskAccount(accountLast4) {
  return 'XXXX XXXX ' + (accountLast4 || '****');
}
