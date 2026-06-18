-- ============================================================
--  Legal documents v1.0 — reformat Markdown → plain text.
--  Applied as migration `legal_documents_v1_0_plaintext`.
--
--  WHY: 003 stored the v1.0 bodies in Markdown (## / ### / ** / "- " bullets),
--  but the renderer (components/legal/legal-document.tsx) presents legal text as
--  PLAIN TEXT — it promotes "N." lines to headings and prints every other line
--  verbatim. Markdown markers would therefore show RAW on the public /terms,
--  /privacy, /medical-disclaimer pages. This converts the live v1.0 bodies in
--  place: strip heading hashes + bold markers, turn "- " bullets into "• ".
--
--  Idempotent: a re-run finds no markers left and changes nothing.
-- ============================================================

UPDATE legal_documents
SET body =
  regexp_replace(
    replace(
      regexp_replace(
        regexp_replace(
          regexp_replace(body, '^### ', '', 'ng'),
          '^## ', '', 'ng'),
        '^# ', '', 'ng'),
      '**', ''),
    '^- ', '• ', 'ng')
WHERE doc_type IN ('terms_of_service', 'privacy_policy', 'medical_disclaimer')
  AND version = '1.0';
