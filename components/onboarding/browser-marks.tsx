/**
 * Chrome's and Safari's marks, drawn rather than imported.
 *
 * They sit on a button telling somebody to switch browsers, and people
 * recognise a browser by its face long before they read its name — which is
 * the entire reason the button carries one.
 *
 * Both are built the way each vendor's really is, so they hold at 18px:
 * Chrome is three 120° sectors with a white ring and a blue centre; Safari is
 * a blue dial with a red-and-white needle. No gradients — at this size they
 * only muddy the shape.
 */

export function ChromeMark({ className }: { className?: string }) {
  // Sectors from the same geometry as the recreated app icon: red over the
  // top, yellow right, green lower-left.
  return (
    <svg viewBox="0 0 100 100" className={className} aria-hidden="true">
      <path d="M50,50 L20.56,33.00 A34,34 0 0 1 79.44,33.00 Z" fill="#EA4335" />
      <path d="M50,50 L79.44,33.00 A34,34 0 0 1 50.00,84.00 Z" fill="#FBBC04" />
      <path d="M50,50 L50.00,84.00 A34,34 0 0 1 20.56,33.00 Z" fill="#34A853" />
      <circle cx="50" cy="50" r="13.6" fill="#FFFFFF" />
      <circle cx="50" cy="50" r="10.4" fill="#4285F4" />
    </svg>
  );
}

export function SafariMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
      <circle cx="12" cy="12" r="10.5" fill="#3B8FF3" />
      <circle cx="12" cy="12" r="8.6" fill="#F7F7F8" />
      <path d="M16.9 7.1 10.6 10.6 7.1 16.9 13.4 13.4Z" fill="#F4453C" />
      <path d="M10.6 10.6 13.4 13.4 7.1 16.9Z" fill="#D8D8DC" />
    </svg>
  );
}
