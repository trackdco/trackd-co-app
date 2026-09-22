"use client"

import { QRCodeSVG } from "qrcode.react"

import { SHEET_TITLE } from "@/lib/ui-presets"
import { CANONICAL_HOST, CANONICAL_ORIGIN } from "@/lib/brand";

/**
 * The one part of the retired desktop interstitial worth keeping.
 *
 * That screen existed to turn a laptop visitor away. This does the opposite: the
 * app works here, and this is simply the fastest way to also have it in your
 * pocket, offered from Profile where somebody would go looking for it rather
 * than thrown in front of the app.
 *
 * The copy carries that difference. Nothing here says Trakabl needs a phone or
 * works better on one, because neither is true any more.
 */

/** The URL the code encodes. The only place this string lives. */
const APP_URL = CANONICAL_ORIGIN

export function PhoneHandoffPrompt() {
  return (
    <div className="pb-2">
      <h2 className={SHEET_TITLE}>Get it on your phone</h2>
      <p className="mt-2 text-sm leading-relaxed text-text-muted">
        Scan this with your phone camera. Trakabl opens signed out, so sign in
        once and add it to your Home Screen for reminders.
      </p>

      {/* The code and the address rise in as the sheet lands (feel pass §4).
          This prompt only ever renders in Profile's install sheet. */}
      <div data-sheet-body>
        <div className="mt-5 flex justify-center">
          {/* Light plate on purpose. A QR code inverted onto a near-black surface
              is within spec but scans badly in a dim room, which is exactly where
              somebody sits at a laptop. `--text-primary` rather than pure white
              keeps the plate in the palette's warm family. */}
          <div className="rounded-2xl bg-text-primary p-4">
            <QRCodeSVG
              value={APP_URL}
              size={168}
              bgColor="transparent"
              fgColor="var(--bg-base)"
              level="M"
              aria-label={`QR code linking to ${APP_URL}`}
            />
          </div>
        </div>

        <p className="mt-5 text-center font-mono text-xs tracking-[0.08em] text-text-muted">
          {CANONICAL_HOST}
        </p>
      </div>
    </div>
  )
}
