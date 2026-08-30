// components/progress-bar.js — progressBarHTML(pct, label) -> string

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
