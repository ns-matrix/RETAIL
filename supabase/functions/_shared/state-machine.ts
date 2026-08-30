// Order status state machine — TRD §A5.6
// Each key maps to the set of valid next statuses.

export const VALID_TRANSITIONS: Record<string, string[]> = {
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

export function validateTransition(currentStatus: string, newStatus: string): void {
  const allowed = VALID_TRANSITIONS[currentStatus];
  if (!allowed || !allowed.includes(newStatus)) {
    throw new Error(
      `Invalid status transition: ${currentStatus} → ${newStatus}. ` +
      `Allowed: ${allowed?.join(', ') || 'none'}`
    );
  }
}
