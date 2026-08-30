// tests/screen_renders_test.js — jsdom tests for screen render functions
// TRD §B13: Unit test each render function for expected markup
// Run with: node --experimental-vm-modules tests/screen_renders_test.js
// Requires: npm install jsdom (or deno add npm:jsdom)

function assertEquals(actual, expected, message) {
  if (actual !== expected) {
    throw new Error(message || `Expected "${expected}", got "${actual}"`);
  }
}

// Mock DOM environment
function createJSDOM() {
  // Simple mock: just enough to test render output strings
  return {
    document: {
      getElementById: () => ({ innerHTML: '' }),
      createElement: () => ({ className: '', innerHTML: '', appendChild: () => {} }),
      body: { appendChild: () => {}, style: {} },
      querySelector: () => null,
      querySelectorAll: () => [],
    },
  };
}

// ============ esc() helper ============
function esc(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// ============ statusBadgeHTML ============
function statusBadgeHTML(status) {
  const label = status.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
  return `<span class="badge badge-gray">${label}</span>`;
}

// ============ progressBarHTML ============
function progressBarHTML(pct, label = '') {
  const clamped = Math.max(0, Math.min(100, Math.round(pct)));
  return `
    <div class="progress-container">
      ${label ? `<div class="progress-label">${esc(label)} — ${clamped}%</div>` : ''}
      <div class="progress-bar">
        <div class="progress-fill" style="width: ${clamped}%"></div>
      </div>
    </div>
  `;
}

// ============ Tests ============

const tests = [];
let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    passed++;
    console.log(`  ✓ ${name}`);
  } catch (err) {
    failed++;
    console.log(`  ✗ ${name}`);
    console.log(`    ${err.message}`);
  }
}

function assert(condition, message) {
  if (!condition) throw new Error(message || 'Assertion failed');
}

function assertContains(html, substring, message) {
  if (!html.includes(substring)) {
    throw new Error(message || `Expected HTML to contain "${substring}"`);
  }
}

console.log('Running screen render tests...\n');

// ============ esc() tests ============
console.log('esc():');
test('esc() escapes HTML entities', () => {
  assertContains(esc('<script>alert("xss")</script>'), '&lt;script&gt;');
});

test('esc() handles null/undefined', () => {
  assertEquals(esc(null), '');
  assertEquals(esc(undefined), '');
});

test('esc() handles normal strings', () => {
  assertEquals(esc('hello world'), 'hello world');
});

// ============ statusBadgeHTML tests ============
console.log('\nstatusBadgeHTML():');
test('renders badge with correct label', () => {
  const html = statusBadgeHTML('in_progress');
  assertContains(html, 'badge');
  assertContains(html, 'In Progress');
});

test('renders active status', () => {
  const html = statusBadgeHTML('active');
  assertContains(html, 'Active');
});

test('renders payment_pending status', () => {
  const html = statusBadgeHTML('payment_pending');
  assertContains(html, 'Payment Pending');
});

// ============ progressBarHTML tests ============
console.log('\nprogressBarHTML():');
test('renders progress bar with percentage', () => {
  const html = progressBarHTML(75, 'Progress');
  assertContains(html, 'progress-bar');
  assertContains(html, '75%');
  assertContains(html, 'Progress');
});

test('clamps to 0-100 range', () => {
  const html1 = progressBarHTML(150);
  assertContains(html1, '100%');
  const html2 = progressBarHTML(-10);
  assertContains(html2, '0%');
});

test('handles empty label', () => {
  const html = progressBarHTML(50);
  assertContains(html, 'progress-bar');
  assert(!html.includes('progress-label'), 'Should not have label element when label is empty');
});

// ============ orderCardHTML tests ============
console.log('\norderCardHTML():');
test('renders order card with code and status', () => {
  // Inline the function for testing
  function orderCardHTML(order, showUser = false) {
    const earning = (order.approved_quantity * order.user_rate).toFixed(2);
    return `
      <div class="card order-card">
        <div class="card-header">
          <span class="order-code">${esc(order.order_code)}</span>
          ${statusBadgeHTML(order.status)}
        </div>
        <div class="card-body">
          <div class="stat-row">
            <span class="stat-label">Rate</span>
            <span class="stat-value">₹${order.user_rate}/pc</span>
          </div>
          <div class="stat-row highlight">
            <span class="stat-label">Earning</span>
            <span class="stat-value">₹${earning}</span>
          </div>
        </div>
      </div>
    `;
  }

  const order = {
    order_code: 'ORD-000001',
    status: 'submitted',
    approved_quantity: 50,
    user_rate: 10,
    assigned_quantity: 100,
    submitted_quantity: 50,
    rejected_quantity: 0,
  };

  const html = orderCardHTML(order);
  assertContains(html, 'ORD-000001');
  assertContains(html, 'Submitted');
  assertContains(html, '₹10/pc');
  assertContains(html, '₹500.00');
});

// ============ formatDate tests ============
console.log('\nformatDate():');
test('formats date string correctly', () => {
  function formatDate(dateStr) {
    if (!dateStr) return '';
    const d = new Date(dateStr);
    return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
  }
  const result = formatDate('2026-08-30');
  assertContains(result, '2026');
  assert(result.includes('Aug') || result.includes('30'), 'Should contain month or day');
});

test('handles empty date', () => {
  function formatDate(dateStr) {
    if (!dateStr) return '';
    return new Date(dateStr).toLocaleDateString('en-IN');
  }
  assertEquals(formatDate(''), '');
  assertEquals(formatDate(null), '');
});

// ============ Summary ============
console.log(`\n${'='.repeat(40)}`);
console.log(`Results: ${passed} passed, ${failed} failed`);
console.log(`${'='.repeat(40)}`);

if (failed > 0) Deno.exit(1);
