import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";

import {
  getCurrentLegalDocument,
  getLegalDocumentVersion,
  type LegalDocType,
} from "@/lib/legal/getLegalDocument";
import { PAGE_TITLE } from "@/lib/ui-presets";

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

/** "2026-06-20" → "20 June 2026" (parts-based, so no timezone shift). Falls back
 *  to the raw value if it isn't a YYYY-MM-DD date. */
function formatEffectiveDate(value: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!m) return value;
  return `${Number(m[3])} ${MONTHS[Number(m[2]) - 1]} ${m[1]}`;
}

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
        <h3 key={i} className="pt-2 text-base font-medium text-foreground">
          {renderInline(t.slice(4))}
        </h3>,
      );
      return;
    }
    // Top-level section heading: "## 1. …" (new) or a bare "1. …" (older docs).
    if (t.startsWith("## ") || /^\d+\.\s+\S/.test(t)) {
      flushBullets();
      nodes.push(
        <h2 key={i} className="pt-3 text-lg font-medium text-foreground">
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
 * Renders a legal document straight from the DB (legal_documents, public read).
 *
 * Used by /terms, /privacy, and /medical-disclaimer — the same documents the
 * 18+/ToS gate links to and records acceptance of.
 *
 * ⚠️ `version` IS OPTIONAL AND CHANGES WHICH QUESTION IS ASKED.
 *
 * Omitted, this renders whatever is CURRENT, which is what the four public
 * pages want. Given, it renders THAT version whether it is in force or not,
 * which is what `/terms/1.3` and its siblings want: `consent_records` stores a
 * version number, and a version somebody is recorded as having accepted has to
 * stay readable after it stops being current. See `getLegalDocumentVersion`.
 *
 * Nothing else branches on it. The header already prints `doc.version` and
 * `doc.effective_date` off the row itself, so a superseded document names its
 * own version and its own effective date without a word of new copy.
 */
export async function LegalDocument({
  docType,
  version,
}: {
  docType: LegalDocType;
  version?: string;
}) {
  const doc = version
    ? await getLegalDocumentVersion(docType, version)
    : await getCurrentLegalDocument(docType);

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

      <h1 className={`mt-12 ${PAGE_TITLE}`}>
        {doc.title.replace(/^Trackd Co\s*[—-]\s*/, "")}
      </h1>
      <p className="mt-2 text-xs uppercase tracking-[0.18em] text-text-subtle">
        Version {doc.version}
        {doc.is_beta ? " · Beta draft" : ""}
        {doc.effective_date
          ? ` · Effective ${formatEffectiveDate(String(doc.effective_date))}`
          : ""}
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
