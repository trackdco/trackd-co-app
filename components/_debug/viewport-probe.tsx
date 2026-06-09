"use client";

/**
 * TEMPORARY diagnostic overlay — REMOVE once the bottom-bar geometry is captured.
 * Renders live viewport numbers in the corner so we can read ground truth off an
 * installed iOS PWA (which has no address bar / console). The decisive value is
 * `screenH - innerH`: if it's ~62, the web view is genuinely shorter than the
 * screen (viewport-fit=cover not expanding it → the OS paints the uncovered band);
 * if it's ~0, the web view is full-screen and the gap is an in-page positioning
 * issue. `safe-bottom` reads the resolved env(safe-area-inset-bottom).
 */
import { useEffect, useState } from "react";

export function ViewportProbe() {
  const [, tick] = useState(0);
  const [safeBottom, setSafeBottom] = useState("?");

  useEffect(() => {
    // env() can't be read directly in JS — measure it via a hidden element.
    const probe = document.createElement("div");
    probe.style.cssText =
      "position:fixed;bottom:0;left:0;width:0;height:env(safe-area-inset-bottom,0px);visibility:hidden;pointer-events:none";
    document.body.appendChild(probe);
    const read = () => {
      setSafeBottom(String(probe.offsetHeight));
      tick((x) => x + 1);
    };
    read();
    const raf = requestAnimationFrame(read);
    const timers = [setTimeout(read, 150), setTimeout(read, 600), setTimeout(read, 1500)];
    window.visualViewport?.addEventListener("resize", read);
    window.visualViewport?.addEventListener("scroll", read);
    return () => {
      cancelAnimationFrame(raf);
      timers.forEach(clearTimeout);
      window.visualViewport?.removeEventListener("resize", read);
      window.visualViewport?.removeEventListener("scroll", read);
      probe.remove();
    };
  }, []);

  if (typeof window === "undefined") return null;
  const vv = window.visualViewport;
  const innerH = window.innerHeight;
  const screenH = window.screen.height;
  const standalone =
    window.matchMedia?.("(display-mode: standalone)").matches ||
    (window.navigator as unknown as { standalone?: boolean }).standalone === true;

  return (
    <pre
      style={{
        position: "fixed",
        left: 6,
        bottom: 6,
        zIndex: 60,
        margin: 0,
        padding: "6px 8px",
        fontSize: 10,
        lineHeight: 1.35,
        fontFamily: "ui-monospace,monospace",
        background: "rgba(0,0,0,0.85)",
        color: "#4ade80",
        border: "1px solid #2e2e2c",
        borderRadius: 6,
        pointerEvents: "none",
        whiteSpace: "pre",
      }}
    >
      {`standalone ${standalone}
innerH ${innerH}  screenH ${screenH}
screenH-innerH ${screenH - innerH}
vv.h ${vv ? Math.round(vv.height) : "-"}  vv.oT ${vv ? Math.round(vv.offsetTop) : "-"}
safe-bottom ${safeBottom}px  dpr ${window.devicePixelRatio}`}
    </pre>
  );
}
