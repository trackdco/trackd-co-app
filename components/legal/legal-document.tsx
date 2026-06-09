import Link from "next/link";
import { notFound } from "next/navigation";

import { createClient } from "@/lib/supabase/server";

type LegalDocType =
  | "terms_of_service"
  | "privacy_policy"
  | "medical_disclaimer";

/**
 * Renders the current version of a legal document straight from the DB
 * (legal_documents, public read). The text is stored verbatim as plain text
 * with `\n` breaks; the first two lines repeat the title + version, which we
 * render separately, so we drop them and present the rest with numbered section
 * lines (e.g. "1. …") promoted to headings.
 *
 * Used by /terms, /privacy, and /medical-disclaimer — the same documents the
 * 18+/ToS gate links to and records acceptance of.
 */
export async function LegalDocument({ docType }: { docType: LegalDocType }) {
  const supabase = await createClient();
  const { data: doc } = await supabase
    .from("legal_documents")
    .select("title, version, body, is_beta, effective_date")
    .eq("doc_type", docType)
    .eq("is_current", true)
    .maybeSingle();

  if (!doc) notFound();

  const lines = String(doc.body).split("\n");
  // Drop the leading title + "Version …" lines (shown in the header instead).
  let start = 0;
  if (lines[start]?.trim() === doc.title.trim()) start++;
  if (lines[start]?.trimStart().toLowerCase().startsWith("version")) start++;
  const bodyLines = lines.slice(start);

  return (
    <div className="mx-auto flex min-h-dvh max-w-2xl flex-col px-6 py-16">
      <Link
        href="/"
        className="font-display text-lg font-medium tracking-[-0.01em] text-foreground"
      >
        trackd<span className="text-accent-amber"> co</span>
      </Link>

      <h1 className="mt-12 font-display text-3xl tracking-[-0.02em] text-foreground">
        {doc.title.replace(/^Trackd Co\s*[—-]\s*/, "")}
      </h1>
      <p className="mt-2 text-xs uppercase tracking-[0.18em] text-text-subtle">
        Version {doc.version}
        {doc.is_beta ? " · Beta draft" : ""}
        {doc.effective_date ? ` · Effective ${doc.effective_date}` : ""}
      </p>

      <article className="mt-8 space-y-4 text-[0.95rem] leading-relaxed text-text-muted">
        {bodyLines.map((line: string, i: number) => {
          const trimmed = line.trim();
          if (!trimmed) return null;
          // Top-level numbered section heading, e.g. "1. The sensitivity of…".
          if (/^\d+\.\s+\S/.test(trimmed)) {
            return (
              <h2
                key={i}
                className="pt-3 font-display text-lg text-foreground"
              >
                {trimmed}
              </h2>
            );
          }
          return <p key={i}>{trimmed}</p>;
        })}
      </article>

      <Link
        href="/"
        className="mt-12 text-sm text-text-muted transition-colors hover:text-foreground"
      >
        ← Back to home
      </Link>
    </div>
  );
}
