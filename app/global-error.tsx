"use client";

import { useEffect } from "react";

/**
 * Last-resort boundary for errors thrown in the ROOT layout itself. It replaces
 * the entire document, so it renders its own <html>/<body> and uses inline
 * styles (the app stylesheet may not be available at this point). Kept
 * deliberately minimal — this only fires on catastrophic failures.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: "100dvh",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: "1rem",
          padding: "1.5rem",
          textAlign: "center",
          // Inline styles can't use the CSS-var tokens here (the app stylesheet
          // may be gone), so these literals MUST mirror app/globals.css exactly.
          backgroundColor: "#111110", // --bg-base
          color: "#f0efe9", // --text-primary
          fontFamily:
            "ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, sans-serif",
        }}
      >
        <h1 style={{ fontSize: "1.5rem", fontWeight: 500, margin: 0 }}>
          Something went wrong
        </h1>
        <p style={{ fontSize: "0.9rem", color: "#7a7a74", maxWidth: "24rem" }}>
          The app hit an unexpected error. Your data is safe. Please try again.
        </p>
        <button
          onClick={() => reset()}
          style={{
            marginTop: "0.5rem",
            height: "3rem",
            padding: "0 1.5rem",
            borderRadius: "0.75rem",
            border: "none",
            backgroundColor: "#ffffff", // --accent-primary
            color: "#111110", // --primary-foreground (→ --bg-base)
            fontSize: "0.95rem",
            fontWeight: 500,
            cursor: "pointer",
          }}
        >
          Try again
        </button>
      </body>
    </html>
  );
}
