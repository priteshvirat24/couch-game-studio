// Couch Game Studio icon set: one family, 24px grid, 2.2 stroke, round caps.
// Used by the TV and phone apps. Game sprites stay emoji (they're the kid's world);
// the interface chrome uses these.
//
// Usage: <span data-icon="play"></span> gets replaced by hydrateIcons(), or
// icon('play', { size: 32 }) returns an SVG string.

const P = {
  play: '<path d="M8 5.5v13l11-6.5z" fill="currentColor" stroke="none"/>',
  pause: '<path d="M8 5v14M16 5v14"/>',
  replay: '<path d="M4 12a8 8 0 1 0 2.4-5.7"/><path d="M4 4v4.5h4.5"/>',
  home: '<path d="M4 11 12 4l8 7"/><path d="M6 10v9h12v-9"/>',
  trash: '<path d="M5 7h14"/><path d="M10 4h4"/><path d="M7 7l1 12h8l1-12"/>',
  volume: '<path d="M4 10v4h4l5 4V6l-5 4z"/><path d="M16.5 9a4.5 4.5 0 0 1 0 6"/><path d="M19 6.5a8 8 0 0 1 0 11"/>',
  volumeOff: '<path d="M4 10v4h4l5 4V6l-5 4z"/><path d="m17 10 4 4m0-4-4 4"/>',
  mic: '<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M6 11a6 6 0 0 0 12 0"/><path d="M12 17v4"/>',
  camera: '<path d="M4 8h3l2-3h6l2 3h3v11H4z"/><circle cx="12" cy="13" r="3.5"/>',
  sparkles: '<path d="M12 3c.6 3.6 2.4 5.4 6 6-3.6.6-5.4 2.4-6 6-.6-3.6-2.4-5.4-6-6 3.6-.6 5.4-2.4 6-6z"/><path d="M19 15c.3 1.6 1 2.4 2.5 2.7-1.5.3-2.2 1.1-2.5 2.7-.3-1.6-1-2.4-2.5-2.7 1.5-.3 2.2-1.1 2.5-2.7z"/>',
  remix: '<path d="M4 7h11l-3-3"/><path d="M20 17H9l3 3"/><path d="M15 7a5 5 0 0 1 5 5"/><path d="M9 17a5 5 0 0 1-5-5"/>',
  gamepad: '<path d="M7 8h10a4 4 0 0 1 4 4.5l-.6 3.4a2.5 2.5 0 0 1-4.3 1.3L14.5 15h-5l-1.6 2.2a2.5 2.5 0 0 1-4.3-1.3L3 12.5A4 4 0 0 1 7 8z"/><path d="M8 11v3M6.5 12.5h3"/><path d="M15.5 12h.01M17.5 13.5h.01"/>',
  trophy: '<path d="M8 4h8v6a4 4 0 0 1-8 0z"/><path d="M8 6H5v1.5A3 3 0 0 0 8 10.5M16 6h3v1.5a3 3 0 0 1-3 3"/><path d="M12 14v4M8.5 20h7"/>',
  robot: '<rect x="5" y="8" width="14" height="11" rx="3"/><path d="M12 4v4"/><circle cx="12" cy="3.5" r="1" fill="currentColor"/><path d="M9.5 13h.01M14.5 13h.01"/><path d="M10 16h4"/><path d="M3 12v3M21 12v3"/>',
  check: '<path d="m5 12.5 4.5 4.5L19 7.5"/>',
  close: '<path d="m6 6 12 12M18 6 6 18"/>',
  left: '<path d="m15 5-7 7 7 7"/>',
  right: '<path d="m9 5 7 7-7 7"/>',
  up: '<path d="m5 15 7-7 7 7"/>',
  down: '<path d="m5 9 7 7 7-7"/>',
  star: '<path d="m12 3.5 2.6 5.4 5.9.8-4.3 4.1 1 5.8L12 16.9l-5.2 2.7 1-5.8-4.3-4.1 5.9-.8z" fill="currentColor" stroke="none"/>',
  heart: '<path d="M12 20s-7-4.4-7-9.5A4 4 0 0 1 12 8a4 4 0 0 1 7 2.5C19 15.6 12 20 12 20z" fill="currentColor" stroke="none"/>',
  dice: '<rect x="4" y="4" width="16" height="16" rx="4"/><circle cx="9" cy="9" r="1.3" fill="currentColor" stroke="none"/><circle cx="15" cy="15" r="1.3" fill="currentColor" stroke="none"/><circle cx="15" cy="9" r="1.3" fill="currentColor" stroke="none"/><circle cx="9" cy="15" r="1.3" fill="currentColor" stroke="none"/><circle cx="12" cy="12" r="1.3" fill="currentColor" stroke="none"/>',
  phone: '<rect x="7" y="3" width="10" height="18" rx="2.5"/><path d="M11 18h2"/>',
  dpad: '<path d="M9.5 3h5v6.5H21v5h-6.5V21h-5v-6.5H3v-5h6.5z"/>',
  ok: '<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="3" fill="currentColor" stroke="none"/>',
  bolt: '<path d="M13 3 5 13.5h6L10 21l8-10.5h-6z"/>',
  leaf: '<path d="M5 19c0-8 5-13 14-14-1 9-6 14-14 14z"/><path d="M5 19 13 11"/>',
  user: '<circle cx="12" cy="8" r="3.5"/><path d="M5 20a7 7 0 0 1 14 0"/>',
};

export function icon(name, { size = 24, label = '', className = '' } = {}) {
  const body = P[name] || P.sparkles;
  const a11y = label ? `role="img" aria-label="${label}"` : 'aria-hidden="true"';
  return `<svg class="ico ${className}" ${a11y} width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">${body}</svg>`;
}

// Replace every <span data-icon="name"> in a subtree with its SVG.
export function hydrateIcons(root = document) {
  for (const el of root.querySelectorAll('[data-icon]')) {
    el.innerHTML = icon(el.dataset.icon, { size: Number(el.dataset.size) || 24, label: el.dataset.label || '' });
    el.classList.add('icon');
  }
}
