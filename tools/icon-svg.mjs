// חיברתי icon artwork: two white phones with a small yellow "wireless" sign between them, on teal.
// Same drawing as CB.logo in www/js/core/icons.js (120x120 box). Helpers build every size/shape the app needs.
export const COLORS = { bg: '#0A8F94', wave: '#FFD27A', phone: '#FFFFFF' };

// Glyph in the 120x120 box: two phones (screens mirrored), the wireless sign centred between them.
export function glyph() {
  const p = COLORS.phone, w = COLORS.wave, t = COLORS.bg;
  return `<rect x="13" y="30" width="34" height="60" rx="9" fill="${p}"/>` +
    `<rect x="73" y="30" width="34" height="60" rx="9" fill="${p}"/>` +
    `<path d="M21 42h18M21 50h11M81 42h18M81 50h11" stroke="${t}" stroke-opacity=".38" stroke-width="4.5" stroke-linecap="round"/>` +
    `<path d="M25 80h10M85 80h10" stroke="${t}" stroke-opacity=".5" stroke-width="3.5" stroke-linecap="round"/>` +
    `<path d="M50.5 52.5q9.5-10 19 0" stroke="${w}" stroke-width="5.5" fill="none" stroke-linecap="round"/>` +
    `<path d="M54.6 60q5.4-5.6 10.8 0" stroke="${w}" stroke-width="5.5" fill="none" stroke-linecap="round"/>` +
    `<circle cx="60" cy="67.5" r="3.6" fill="${w}"/>`;
}

// shape: 'square' (rounded square), 'circle', 'none' (transparent: adaptive-icon foreground)
// scale: glyph size relative to the drawing (1 = as drawn)
export function iconSvg({ size = 1024, shape = 'square', scale = 1 } = {}) {
  let bg = '';
  if (shape === 'square') bg = `<rect width="120" height="120" rx="30" fill="${COLORS.bg}"/>`;
  else if (shape === 'circle') bg = `<circle cx="60" cy="60" r="60" fill="${COLORS.bg}"/>`;
  const g = `<g transform="translate(60 60) scale(${scale}) translate(-60 -60)">${glyph()}</g>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 120 120">${bg}${g}</svg>`;
}

// The small white icon in the status bar (Android draws it in one colour).
export function statusSvg(size) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 120 120"><g transform="translate(60 60) scale(1.18) translate(-60 -60)">` +
    `<rect x="13" y="30" width="34" height="60" rx="9" fill="#fff"/><rect x="73" y="30" width="34" height="60" rx="9" fill="#fff"/>` +
    `<path d="M50.5 52.5q9.5-10 19 0M54.6 60q5.4-5.6 10.8 0" stroke="#fff" stroke-width="6" fill="none" stroke-linecap="round"/><circle cx="60" cy="67.5" r="4" fill="#fff"/></g></svg>`;
}
