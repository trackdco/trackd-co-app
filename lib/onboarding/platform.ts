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
      // The screen now carries an "Open in Safari" button and a copy button, so
      // step one no longer asks them to select a URL by hand.
      return [
        {
          icon: "menu",
          text: `Open this page in Safari. ${BROWSER_LABEL[browser]} cannot install it`,
        },
        { icon: null, text: "Sign in there if it asks you to" },
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

/* ------------------------------------------------------------------ *
 * The visual walkthrough
 * ------------------------------------------------------------------ */

/**
 * Which set of drawn step frames applies here.
 *
 * `null` means there is no walkthrough to show: on iOS outside Safari the
 * install is not possible at all, and drawing a Share sheet for a browser that
 * does not have one is the exact failure `canInstallHere` exists to prevent.
 */
export type InstallFlowId =
  | "ios-safari"
  | "android-chrome"
  | "android-samsung"
  | "android-firefox";

export function installFlowId({ platform, browser }: DeviceGuess): InstallFlowId | null {
  if (platform === "ios") return browser === "safari" ? "ios-safari" : null;
  if (browser === "samsung") return "android-samsung";
  if (browser === "firefox") return "android-firefox";
  // Chrome and Edge share a menu. This is the MENU path, not the one-tap
  // prompt: the walkthrough only ever appears once the automatic route has
  // failed, so showing "Chrome offers to install it for you" here would be
  // describing the thing that just did not happen.
  return "android-chrome";
}

export interface WalkthroughStep {
  text: string;
  /** The exact substring naming the control, emphasised in the caption. */
  strong?: string;
}

/**
 * One caption per drawn frame in `public/onboarding/install/<flow>/`.
 *
 * ⚠️ THESE ARE PAIRED WITH IMAGES BY INDEX. Caption 3 sits under frame `03`.
 * Both are generated from the same step data in
 * `scratchpad/icon-harness/install-build.html`, so re-render the frames and
 * re-extract these together or a caption will describe the wrong picture.
 *
 * Longer and more specific than `installSteps` above, which stays as the terse
 * text-only list for the case with no walkthrough. The two describe the same
 * journey at different resolutions; this one is written against a drawing of
 * the actual screen, so it can afford to name where on the screen to look.
 */
export const INSTALL_WALKTHROUGH: Record<InstallFlowId, WalkthroughStep[]> = {
  "ios-safari": [
    { text: "Tap ⋯ at the right-hand end of the address bar", strong: "⋯" },
    { text: "Tap Share…", strong: "Share…" },
    { text: "The sheet opens part-way. Tap View More", strong: "View More" },
    { text: "The list grows. Tap Add to Home Screen", strong: "Add to Home Screen" },
    { text: "Check the name, then tap Add", strong: "Add" },
    { text: "Trackd is on the Home Screen" },
  ],
  "android-chrome": [
    { text: "Tap ⋮ at the top right", strong: "⋮" },
    { text: "Tap Install and create shortcut", strong: "Install and create shortcut" },
    { text: "Tap Add", strong: "Add" },
    { text: "Trackd is on the home screen" },
  ],
  "android-samsung": [
    { text: "Tap the menu, bottom right", strong: "menu" },
    { text: "Tap Add page to", strong: "Add page to" },
    { text: "Tap Home screen", strong: "Home screen" },
    { text: "Tap Add", strong: "Add" },
    { text: "Trackd is on the home screen" },
  ],
  "android-firefox": [
    { text: "Tap ⋮, bottom right", strong: "⋮" },
    { text: "It isn’t top level. Tap More", strong: "More" },
    { text: "Tap Add to Home screen", strong: "Add to Home screen" },
    { text: "Tap Add", strong: "Add" },
    { text: "Trackd is on the home screen" },
  ],
};
