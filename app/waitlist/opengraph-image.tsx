import { ImageResponse } from "next/og";

/**
 * Social share card for /waitlist (1200×630). Next's file convention auto-wires
 * this as og:image; the page's summary_large_image Twitter card falls back to
 * og:image, so shared links unfurl with a real preview.
 *
 * Rendered by Satori (next/og), which can't read CSS vars / Tailwind — the hex
 * literals below mirror the ui-context tokens: bg #111110, text #F0EFE9, muted
 * #7A7A74, amber #C8861A. Every container declares an explicit flex layout
 * (Satori requirement).
 */
export const alt = "Trackd Co — Track the whole protocol. Join the waitlist.";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          backgroundColor: "#111110",
          padding: "80px",
          fontFamily: "sans-serif",
        }}
      >
        {/* Eyebrow */}
        <div style={{ display: "flex", flexDirection: "row", alignItems: "center" }}>
          <div
            style={{
              width: "14px",
              height: "14px",
              borderRadius: "9999px",
              backgroundColor: "#C8861A",
              display: "flex",
            }}
          />
          <div
            style={{
              marginLeft: "16px",
              fontSize: "26px",
              letterSpacing: "7px",
              color: "#7A7A74",
              textTransform: "uppercase",
              display: "flex",
            }}
          >
            Private beta · invite only
          </div>
        </div>

        {/* Headline + subhead */}
        <div style={{ display: "flex", flexDirection: "column" }}>
          <div
            style={{
              fontSize: "92px",
              fontWeight: 600,
              color: "#F0EFE9",
              lineHeight: 1.04,
              letterSpacing: "-2px",
              display: "flex",
            }}
          >
            Track the whole protocol.
          </div>
          <div
            style={{
              marginTop: "30px",
              fontSize: "34px",
              color: "#7A7A74",
              lineHeight: 1.3,
              display: "flex",
            }}
          >
            Gear, peptides, supps, bloodwork, outcomes — one private place.
          </div>
        </div>

        {/* Footer: wordmark + CTA */}
        <div
          style={{
            display: "flex",
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <div style={{ display: "flex", flexDirection: "row", fontSize: "40px", fontWeight: 600 }}>
            <div style={{ color: "#F0EFE9", display: "flex" }}>trackd</div>
            <div style={{ color: "#C8861A", display: "flex" }}>&nbsp;co</div>
          </div>
          <div style={{ fontSize: "32px", color: "#C8861A", display: "flex" }}>
            Join the waitlist →
          </div>
        </div>
      </div>
    ),
    { ...size },
  );
}
