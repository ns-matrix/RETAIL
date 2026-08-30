// components/status-badge.js — statusBadgeHTML(status) -> string

function statusBadgeHTML(status) {
  const classMap = {
    active: 'badge-green',
    suspended: 'badge-red',
    pending_verification: 'badge-yellow',
    created: 'badge-gray',
    assigned: 'badge-blue',
    accepted: 'badge-blue',
    in_progress: 'badge-blue',
    submitted: 'badge-yellow',
    verified: 'badge-green',
    completed: 'badge-green',
    rejected: 'badge-red',
    correction_required: 'badge-red',
    resubmitted: 'badge-yellow',
    payment_pending: 'badge-yellow',
    paid: 'badge-green',
    cancelled: 'badge-gray',
    initiated: 'badge-gray',
    processing: 'badge-blue',
    successful: 'badge-green',
    failed: 'badge-red',
    not_submitted: 'badge-gray',
    under_review: 'badge-yellow',
  };

  const label = status.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
  const cls = classMap[status] || 'badge-gray';

  return `<span class="badge ${cls}">${label}</span>`;
}
