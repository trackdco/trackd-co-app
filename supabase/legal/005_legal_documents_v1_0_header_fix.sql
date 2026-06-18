-- ============================================================
--  Legal documents v1.0 — collapse the title→version blank line.
--  Applied as migration `legal_documents_v1_0_header_fix`.
--
--  WHY: the renderer drops exactly the first two body lines (title + "Version …",
--  both shown in the page header). The Markdown source put a blank line between
--  them, so after 003/004 the "Version …" line sat on line 3 and leaked into the
--  visible body. This removes that single blank line so line 1 = title and
--  line 2 = "Version …" again.
--
--  Idempotent: with no double newline before "Version " left, a re-run is a no-op.
-- ============================================================

UPDATE legal_documents
SET body = regexp_replace(body, E'^([^\n]*)\n\n(Version )', E'\\1\n\\2')
WHERE version = '1.0';
