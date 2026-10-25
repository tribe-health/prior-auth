// TJ-ARCH-MOB-001 compliant
// The prototype's one outline icon family (docs/design/patient-chat/ui.js):
// 20px grid, 1.5px stroke, round caps. Static markup owned by this module.
export const ICON_PATHS = {
  plus: '<path d="M10 4v12M4 10h12"/>',
  search: '<circle cx="9" cy="9" r="5.5"/><path d="M13.2 13.2 17 17"/>',
  edit: '<path d="M4 16h3l8.5-8.5a2.1 2.1 0 0 0-3-3L4 13v3z"/><path d="M11.5 5.5l3 3"/>',
  panel: '<rect x="3" y="4" width="14" height="12" rx="2"/><path d="M8 4v12"/>',
  queue: '<path d="M4 6h12M4 10h12M4 14h8"/>',
  chevDown: '<path d="M5 8l5 5 5-5"/>',
  chevRight: '<path d="M8 5l5 5-5 5"/>',
  mic: '<rect x="7.5" y="3" width="5" height="9" rx="2.5"/><path d="M4.5 10a5.5 5.5 0 0 0 11 0M10 15.5V18"/>',
  up: '<path d="M10 16V4M5 9l5-5 5 5"/>',
  stop: '<rect x="5.5" y="5.5" width="9" height="9" rx="1.5" fill="currentColor"/>',
  x: '<path d="M5 5l10 10M15 5L5 15"/>',
  doc: '<path d="M6 3h6l3 3v11H6z"/><path d="M12 3v3h3M8.5 10h4M8.5 13h4"/>',
  clock: '<circle cx="10" cy="10" r="6.5"/><path d="M10 6.5V10l2.5 1.5"/>',
  check: '<path d="M4.5 10.5l3.5 3.5 7.5-8"/>',
  sun: '<circle cx="10" cy="10" r="3.2"/><path d="M10 2.5v2M10 15.5v2M2.5 10h2M15.5 10h2M4.7 4.7l1.4 1.4M13.9 13.9l1.4 1.4M4.7 15.3l1.4-1.4M13.9 6.1l1.4-1.4"/>',
  moon: '<path d="M16 11.5A6.5 6.5 0 1 1 8.5 4a5 5 0 0 0 7.5 7.5z"/>',
  ext: '<path d="M11 4h5v5M16 4l-7 7M14 11.5V15a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h3.5"/>',
  lock: '<rect x="5" y="9" width="10" height="7.5" rx="1.5"/><path d="M7 9V6.5a3 3 0 0 1 6 0V9"/>',
  user: '<circle cx="10" cy="7" r="3"/><path d="M4 16.5c.8-3 3.2-4.5 6-4.5s5.2 1.5 6 4.5"/>',
  arrowRight: '<path d="M4 10h12M11 5l5 5-5 5"/>',
  arrowLeft: '<path d="M16 10H4M9 5l-5 5 5 5"/>',
  folder: '<path d="M3 6.5A1.5 1.5 0 0 1 4.5 5H8l2 2h5.5A1.5 1.5 0 0 1 17 8.5v6a1.5 1.5 0 0 1-1.5 1.5h-11A1.5 1.5 0 0 1 3 14.5z"/>',
  receipt: '<path d="M5 3h10v14l-2.5-1.5L10 17l-2.5-1.5L5 17z"/><path d="M8 7.5h4M8 10.5h4"/>',
} as const

export type IconName = keyof typeof ICON_PATHS

/** State shapes: check-circle (met), barred diamond (gap), dashed ring (void). */
export const STATE_MARKS = {
  met: '<circle cx="7" cy="7" r="5.6"/><path d="M4.3 7.2l1.9 1.9 3.6-3.9"/>',
  gap: '<path d="M7 1.4 12.6 7 7 12.6 1.4 7z"/><path d="M4.8 7h4.4"/>',
  void: '<circle cx="7" cy="7" r="5.6" stroke-dasharray="2.2 2.2"/>',
} as const
