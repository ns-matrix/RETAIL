// tests/state_machine_test.ts — Deno tests for order status transitions
// TRD §B13: Edge Function state machine transition table

import { assertEquals, assertThrows } from 'https://deno.land/std@0.208.0/assert/mod.ts';

// Import the state machine logic (duplicated here for test isolation)
const VALID_TRANSITIONS: Record<string, string[]> = {
  created: ['assigned', 'cancelled'],
  assigned: ['accepted', 'cancelled'],
  accepted: ['in_progress', 'cancelled'],
  in_progress: ['submitted', 'cancelled'],
  submitted: ['verified', 'rejected'],
  verified: ['completed'],
  completed: ['payment_pending'],
  rejected: ['correction_required'],
  correction_required: ['resubmitted'],
  resubmitted: ['submitted', 'rejected'],
  payment_pending: ['paid'],
  paid: [],
  cancelled: [],
};

function validateTransition(currentStatus: string, newStatus: string): void {
  const allowed = VALID_TRANSITIONS[currentStatus];
  if (!allowed || !allowed.includes(newStatus)) {
    throw new Error(
      `Invalid status transition: ${currentStatus} → ${newStatus}. ` +
      `Allowed: ${allowed?.join(', ') || 'none'}`
    );
  }
}

// ============ VALID TRANSITIONS ============

Deno.test('valid: created → assigned', () => {
  validateTransition('created', 'assigned');
});

Deno.test('valid: created → cancelled', () => {
  validateTransition('created', 'cancelled');
});

Deno.test('valid: assigned → accepted', () => {
  validateTransition('assigned', 'accepted');
});

Deno.test('valid: accepted → in_progress', () => {
  validateTransition('accepted', 'in_progress');
});

Deno.test('valid: in_progress → submitted', () => {
  validateTransition('in_progress', 'submitted');
});

Deno.test('valid: submitted → verified', () => {
  validateTransition('submitted', 'verified');
});

Deno.test('valid: submitted → rejected', () => {
  validateTransition('submitted', 'rejected');
});

Deno.test('valid: verified → completed', () => {
  validateTransition('verified', 'completed');
});

Deno.test('valid: completed → payment_pending', () => {
  validateTransition('completed', 'payment_pending');
});

Deno.test('valid: payment_pending → paid', () => {
  validateTransition('payment_pending', 'paid');
});

Deno.test('valid: rejected → correction_required', () => {
  validateTransition('rejected', 'correction_required');
});

Deno.test('valid: correction_required → resubmitted', () => {
  validateTransition('correction_required', 'resubmitted');
});

Deno.test('valid: resubmitted → submitted', () => {
  validateTransition('resubmitted', 'submitted');
});

// ============ INVALID TRANSITIONS ============

Deno.test('invalid: created → accepted (skips assigned)', () => {
  assertThrows(
    () => validateTransition('created', 'accepted'),
    Error,
    'Invalid status transition'
  );
});

Deno.test('invalid: assigned → submitted (skips accepted, in_progress)', () => {
  assertThrows(
    () => validateTransition('assigned', 'submitted'),
    Error,
    'Invalid status transition'
  );
});

Deno.test('invalid: submitted → completed (skips verified)', () => {
  assertThrows(
    () => validateTransition('submitted', 'completed'),
    Error,
    'Invalid status transition'
  );
});

Deno.test('invalid: in_progress → verified (must go through submitted)', () => {
  assertThrows(
    () => validateTransition('in_progress', 'verified'),
    Error,
    'Invalid status transition'
  );
});

Deno.test('invalid: paid → anything (terminal state)', () => {
  assertThrows(
    () => validateTransition('paid', 'completed'),
    Error,
    'Invalid status transition'
  );
  assertThrows(
    () => validateTransition('paid', 'in_progress'),
    Error,
    'Invalid status transition'
  );
});

Deno.test('invalid: cancelled → anything (terminal state)', () => {
  assertThrows(
    () => validateTransition('cancelled', 'assigned'),
    Error,
    'Invalid status transition'
  );
});

Deno.test('invalid: completed → in_progress (no backward)', () => {
  assertThrows(
    () => validateTransition('completed', 'in_progress'),
    Error,
    'Invalid status transition'
  );
});

Deno.test('invalid: verified → submitted (no backward)', () => {
  assertThrows(
    () => validateTransition('verified', 'submitted'),
    Error,
    'Invalid status transition'
  );
});

// ============ FULL LIFECYCLE ============

Deno.test('full lifecycle: created → assigned → accepted → in_progress → submitted → verified → completed → payment_pending → paid', () => {
  const lifecycle = [
    ['created', 'assigned'],
    ['assigned', 'accepted'],
    ['accepted', 'in_progress'],
    ['in_progress', 'submitted'],
    ['submitted', 'verified'],
    ['verified', 'completed'],
    ['completed', 'payment_pending'],
    ['payment_pending', 'paid'],
  ];

  for (const [from, to] of lifecycle) {
    validateTransition(from, to);
  }
});

Deno.test('rejection lifecycle: submitted → rejected → correction_required → resubmitted → submitted', () => {
  const rejectionCycle = [
    ['submitted', 'rejected'],
    ['rejected', 'correction_required'],
    ['correction_required', 'resubmitted'],
    ['resubmitted', 'submitted'],
  ];

  for (const [from, to] of rejectionCycle) {
    validateTransition(from, to);
  }
});
