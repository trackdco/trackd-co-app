/**
 * THE SEVEN FEATURE ICONS (spec 3-03 §3.4: "a small custom icon").
 *
 * Drawn for this list rather than taken from Phosphor, so they read as a set
 * about THIS product: a vial with a level in it, a torso with a site on it, a
 * syringe with a draw in it. One grid (24), one stroke (1.4), round joins, and
 * `currentColor` throughout so the row decides the colour. The single filled
 * accent in each is the thing the feature is about.
 */

const common = {
  width: 22,
  height: 22,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.4,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  "aria-hidden": true,
  focusable: false,
};

export function StockIcon() {
  return (
    <svg {...common}>
      <path d="M9.5 2.8h5v2.6h-5z" />
      <path d="M8.2 5.4h7.6a1 1 0 0 1 1 1V19a2.4 2.4 0 0 1-2.4 2.4H9.6A2.4 2.4 0 0 1 7.2 19V6.4a1 1 0 0 1 1-1z" />
      <path d="M8.6 12.6h6.8V19a1 1 0 0 1-1 1H9.6a1 1 0 0 1-1-1z" fill="currentColor" fillOpacity="0.3" stroke="none" />
      <path d="M8.6 12.6h6.8" />
      <path d="M17.4 9h1.6M17.4 12h1.6M17.4 15h1.6" strokeWidth="1.1" />
    </svg>
  );
}

export function SitesIcon() {
  return (
    <svg {...common}>
      <circle cx="12" cy="4.4" r="2.1" />
      <path d="M8.2 8.2h7.6l1.7 6.3-2.1.6-.6 7.1H9.2l-.6-7.1-2.1-.6z" />
      <circle cx="10.4" cy="13.6" r="1.35" fill="currentColor" stroke="none" />
      <circle cx="13.9" cy="13.6" r="1.35" fill="currentColor" fillOpacity="0.35" stroke="none" />
    </svg>
  );
}

export function ProgressIcon() {
  return (
    <svg {...common}>
      <path d="M3 17.5c3.2-.4 4.4-4.2 7.4-4.6 2.7-.3 3.4 1.9 5.8.4 1.9-1.2 2.4-4.4 4.8-5.8" />
      <path d="M3 17.5c3.2-.4 4.4-4.2 7.4-4.6 2.7-.3 3.4 1.9 5.8.4 1.9-1.2 2.4-4.4 4.8-5.8V21H3z" fill="currentColor" fillOpacity="0.14" stroke="none" />
      <circle cx="21" cy="7.5" r="1.5" fill="currentColor" stroke="none" />
      <path d="M3 21h18" strokeWidth="1.1" />
    </svg>
  );
}

export function BlocksIcon() {
  return (
    <svg {...common}>
      <rect x="2.8" y="9.2" width="18.4" height="5.6" rx="2.8" />
      <rect x="4.2" y="10.6" width="8.6" height="2.8" rx="1.4" fill="currentColor" stroke="none" />
      <path d="M12.8 9.2V4.2l4.2 1.6-4.2 1.6" />
      <path d="M6 18.4h3M11 18.4h3M16 18.4h2.6" strokeWidth="1.1" />
    </svg>
  );
}

export function StacksIcon() {
  return (
    <svg {...common}>
      <path d="M19.2 12a7.2 7.2 0 1 1-2.1-5.1" />
      <path d="M17.6 3.6l-.4 3.4-3.4-.4" />
      <rect x="8.2" y="9" width="3" height="6.6" rx="1" />
      <rect x="12.8" y="9" width="3" height="6.6" rx="1" />
      <path d="M8.9 12.4h1.6v2.4H8.9z" fill="currentColor" stroke="none" />
      <path d="M13.5 12.4h1.6v2.4h-1.6z" fill="currentColor" stroke="none" />
    </svg>
  );
}

export function LibraryIcon() {
  return (
    <svg {...common}>
      <path d="M3.4 5.6c2.9-.9 5.8-.6 8.6 1.2v13.4c-2.8-1.8-5.7-2.1-8.6-1.2z" />
      <path d="M20.6 5.6c-2.9-.9-5.8-.6-8.6 1.2v13.4c2.8-1.8 5.7-2.1 8.6-1.2z" />
      <rect x="14.2" y="9.4" width="4.4" height="2.2" rx="1.1" transform="rotate(-18 16.4 10.5)" fill="currentColor" stroke="none" />
      <path d="M5.6 10h4M5.6 13h4" strokeWidth="1.1" />
    </svg>
  );
}

export function CalculatorIcon() {
  return (
    <svg {...common}>
      <path d="M2.6 15.6l3.2-1.8" />
      <path d="M5.2 12.2l9.6-5.5 2.4 4.2-9.6 5.5z" />
      <path d="M6.2 14l4-2.3 1.2 2.1-4 2.3z" fill="currentColor" stroke="none" />
      <path d="M16 8.8l2.6-1.5M17.3 6.4l1.4 2.4M18.6 7.3l2-1.2" />
      <path d="M8.8 10.1l.7 1.2M11.2 8.7l.7 1.2M13.6 7.4l.7 1.2" strokeWidth="1" />
      <path d="M8 19.8h5M15.5 19.8h1.5M19 19.8h1.2" strokeWidth="1.1" />
    </svg>
  );
}
