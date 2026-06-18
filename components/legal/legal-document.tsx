import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";

import { createClient } from "@/lib/supabase/server";

type LegalDocType =
  | "terms_of_service"
  | "privacy_policy"
  | "medical_disclaimer";

/**
 * Inline formatting: `**bold**` → <strong>, everything else verbatim. Legal
 * docs use bold only for emphasis (e.g. safety-critical warnings), so this is
 * the only inline markup we honour.
 */
function renderInline(text: string): React.ReactNode {
  const parts = text.split(/(\*\*.+?\*\*)/g);
  return parts.map((part, i) =>
    /^\*\*.+\*\*$/.test(part) ? (
      <strong key={i} className="font-medium text-foreground">
        {part.slice(2, -2)}
      </strong>
    ) : (
      part
    ),
  );
}

/**
 * Renders the document body to React nodes. The text is stored verbatim with
 * `\n` breaks and a small Markdown subset: `##`/`###` headings (or a bare
 * "1. …" numbered line, the older format), `-`/`•` bullets, and `**bold**`.
 * The first line repeats the title and the second the version — both shown in
 * the header instead, so we drop them.
 */
function renderBody(body: string, title: string): React.ReactNode[] {
  const lines = body.split("\n");
  let start = 0;
  const first = lines[start]?.trim() ?? "";
  if (first.startsWith("# ") || first === title.trim()) start++;
  if (lines[start]?.trimStart().toLowerCase().startsWith("version")) start++;

  const nodes: React.ReactNode[] = [];
  let bullets: string[] = [];
  const flushBullets = () => {
    if (!bullets.length) return;
    nodes.push(
      <ul
        key={`ul-${nodes.length}`}
        className="list-disc space-y-2 pl-5 marker:text-text-subtle"
      >
        {bullets.map((b, i) => (
          <li key={i}>{renderInline(b)}</li>
        ))}
      </ul>,
    );
    bullets = [];
  };

  lines.slice(start).forEach((line, i) => {
    const t = line.trim();
    if (!t) {
      flushBullets();
      return;
    }
    if (t.startsWith("### ")) {
      flushBullets();
      nodes.push(
        <h3 key={i} className="pt-2 font-display text-base text-foreground">
          {renderInline(t.slice(4))}
        </h3>,
      );
      return;
    }
    // Top-level section heading: "## 1. …" (new) or a bare "1. …" (older docs).
    if (t.startsWith("## ") || /^\d+\.\s+\S/.test(t)) {
      flushBullets();
      nodes.push(
        <h2 key={i} className="pt-3 font-display text-lg text-foreground">
          {renderInline(t.startsWith("## ") ? t.slice(3) : t)}
        </h2>,
      );
      return;
    }
    if (/^[-•]\s+/.test(t)) {
      bullets.push(t.replace(/^[-•]\s+/, ""));
      return;
    }
    flushBullets();
    nodes.push(<p key={i}>{renderInline(t)}</p>);
  });
  flushBullets();
  return nodes;
}

/**
 * Renders the current version of a legal document straight from the DB
 * (legal_documents, public read).
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

  return (
    <div className="mx-auto flex min-h-dvh max-w-2xl flex-col px-6 py-16">
      <Link href="/" aria-label="trackd co" className="w-fit">
        <Image
          src="/trackd-wordmark.png"
          alt="trackd co"
          width={1049}
          height={200}
          className="h-4 w-auto"
        />
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
        {renderBody(String(doc.body), doc.title)}
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
