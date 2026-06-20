/**
 * The one-time founder welcome shown on first sign-in (see
 * `components/welcome/WelcomeVideoPopup.tsx`). EDIT THIS FILE to switch it on.
 *
 * The popup ONLY appears once `WELCOME_VIDEO_EMBED_URL` is set — until then it
 * never shows, so the "seen once" flag (`profiles.welcome_seen_at`) isn't spent
 * before the video exists. Set it to an UNLISTED video's *embed* URL:
 *   - YouTube: https://www.youtube.com/embed/<VIDEO_ID>
 *   - Vimeo:   https://player.vimeo.com/video/<VIDEO_ID>
 * (Use the embed URL, not the watch/share URL.)
 */
export const WELCOME_VIDEO_EMBED_URL: string | null = null

export const WELCOME_TITLE = "Welcome to Trackd"

export const WELCOME_MESSAGE =
  "A quick hello from the founders, and a short tour to get you started. " +
  "Thanks for testing the beta — your feedback shapes what we build next."

/** Whether the welcome popup is live (a video link has been configured). */
export const WELCOME_VIDEO_READY = WELCOME_VIDEO_EMBED_URL !== null
