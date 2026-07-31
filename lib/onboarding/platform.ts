/**
 * Which phone we are on, for the install instructions and the notification
 * mock-up (Spec 3-01 §12).
 *
 * ONE source, because the install screen and the notification screen have to
 * agree: showing a user Safari's Share sheet and then an Android notification
 * is the sort of detail that tells them the app was not made for their phone.
 *
 * UA sniffing, deliberately, with a manual toggle over the top. There is no
 * feature test for "which OS's install instructions should I show", and the
 * cost of guessing wrong is a toggle tap.
 */

export type Platform = "ios" | "android";

export function guessPlatform(): Platform {
  if (typeof navigator === "undefined") return "ios";
  const ua = navigator.userAgent;
  if (/android/i.test(ua)) return "android";
  // iPadOS 13+ reports as a Mac, and the touch-point check is the standard way
  // to tell one from an actual desktop.
  if (/iPad|iPhone|iPod/.test(ua)) return "ios";
  if (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1) return "ios";
  return "ios";
}
