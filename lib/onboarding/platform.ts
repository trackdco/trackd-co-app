/**
 * Which phone AND WHICH BROWSER we are on, for the install instructions and the
 * notification mock-up (Spec 3-01 §12).
 *
 * ONE source, because the install screen and the notification screen have to
 * agree: showing a user Safari's Share sheet and then an Android notification
 * is the sort of detail that tells them the app was not made for their phone.
 *
 * ## Why the browser matters, not just the OS (Adrian, 2026-08-05)
 *
 * The screen used to ask only iPhone-or-Android, and on iOS it always described
 * Safari. That is wrong for a large slice of real users: **on iOS, Chrome,
 * Firefox and Edge are all Safari underneath, but their menus are not Safari's**
 * — and worse, none of them can add to the home screen at all, because Apple
 * does not expose it to them. Someone following Safari's steps in Chrome hunts
 * for a control that does not exist and concludes the app is broken.
 *
 * UA sniffing, deliberately, with a manual toggle over the top. There is no
 * feature test for "which browser's menu should I describe", and the cost of
 * guessing wrong is a toggle tap. `beforeinstallprompt` is a real signal but it
 * only says the AUTOMATIC path exists; it never describes the manual one.
 *
 * ORDER MATTERS in `guessBrowser`. Every iOS browser carries "Safari" and
 * "AppleWebKit" in its UA, and Edge carries "Chrome", so the specific tokens are
 * tested before the generic ones. Getting that backwards reports everything as
 * Safari, which is exactly the bug this file exists to fix.
 */

export type Platform = "ios" | "android";
export type Browser = "safari" | "chrome" | "firefox" | "edge" | "samsung";

export interface DeviceGuess {
  platform: Platform;
  browser: Browser;
}

function readUa(): string {
  if (typeof navigator === "undefined") return "";
  return navigator.userAgent;
}

export function guessPlatform(): Platform {
  const ua = readUa();
  if (/android/i.test(ua)) return "android";
  // iPadOS 13+ reports as a Mac, and the touch-point check is the standard way
  // to tell one from an actual desktop.
  if (/iPad|iPhone|iPod/.test(ua)) return "ios";
  if (/Macintosh/.test(ua) && (navigator?.maxTouchPoints ?? 0) > 1) return "ios";
  return "ios";
}

export function guessBrowser(): Browser {
  const ua = readUa();
  // Most specific first. On iOS these are the vendor's own tokens: CriOS is
  // Chrome, FxiOS is Firefox, EdgiOS is Edge. All three also say "Safari".
  if (/EdgiOS|Edg\//i.test(ua)) return "edge";
  if (/FxiOS|Firefox\//i.test(ua)) return "firefox";
  if (/SamsungBrowser/i.test(ua)) return "samsung";
  if (/CriOS|Chrome\//i.test(ua)) return "chrome";
  return "safari";
}

export function guessDevice(): DeviceGuess {
  return { platform: guessPlatform(), browser: guessBrowser() };
}

/**
 * Can a PWA actually be installed from HERE?
 *
 * **On iOS, only Safari can.** Chrome, Firefox and Edge on iOS cannot add to the
 * home screen — Apple does not give them the capability. Telling a user to hunt
 * for a menu item that does not exist is worse than telling them to switch
 * browser, so the install screen says "open this in Safari" rather than
 * inventing steps. This is the single most useful thing browser detection buys
 * and the reason it is worth doing at all.
 *
 * On Android, Chrome / Edge / Samsung Internet / Firefox can all install.
 */
export function canInstallHere({ platform, browser }: DeviceGuess): boolean {
  if (platform === "ios") return browser === "safari";
  return true;
}

/** Human name for a browser, for copy that has to name one. */
export const BROWSER_LABEL: Record<Browser, string> = {
  safari: "Safari",
  chrome: "Chrome",
  firefox: "Firefox",
  edge: "Edge",
  samsung: "Samsung Internet",
};

export interface InstallStep {
  /** Which icon to draw beside it, or null for a step with no control. */
  icon: "share" | "menu" | "plus" | null;
  text: string;
}

/**
 * The manual steps for one platform + browser combination.
 *
 * Written out per combination rather than assembled from fragments: these are
 * instructions someone follows with a phone in their hand while looking at a
 * real menu, and a generated sentence that half-matches what they can see is
 * worse than none. There are only a handful of real cases.
 */
export function installSteps({ platform, browser }: DeviceGuess): InstallStep[] {
  if (platform === "ios") {
    if (browser !== "safari") {
      // Not possible here at all. Say so, and say what to do instead.
      return [
        {
          icon: "menu",
          text: `Copy this page's address from ${BROWSER_LABEL[browser]}`,
        },
        { icon: null, text: "Open Safari and paste it in" },
        { icon: "share", text: "Then Share, View More, Add to Home Screen" },
      ];
    }
    // Adrian's own flow on his own phone (2026-08-05). "Add to Home Screen"
    // sits below the fold of the Share sheet's action list, so the middle step
    // is really "View More" — the old copy named a row nobody could see.
    return [
      { icon: "share", text: "Tap Share in Safari" },
      { icon: "menu", text: "Tap View More" },
      { icon: "plus", text: "Tap Add to Home Screen" },
    ];
  }

  if (browser === "firefox") {
    return [
      { icon: "menu", text: "Open the Firefox menu" },
      { icon: "plus", text: "Tap Install, or Add to Home screen" },
      { icon: null, text: "Confirm" },
    ];
  }

  if (browser === "samsung") {
    return [
      { icon: "menu", text: "Open the Samsung Internet menu" },
      { icon: "plus", text: "Tap Add page to, then Home screen" },
      { icon: null, text: "Tap Add" },
    ];
  }

  return [
    { icon: "menu", text: `Open the ${BROWSER_LABEL[browser]} menu` },
    { icon: "plus", text: "Tap Add to Home screen, or Install app" },
    { icon: null, text: "Tap Install" },
  ];
}
