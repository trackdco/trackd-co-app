# DROP THE v2 LEGAL DOCUMENTS HERE

Adrian: put the finished documents in this folder. Any of `.md`, `.txt`, `.docx`
or `.pdf` — I will read whichever arrives. **Do not edit anything else**; this
folder is the only input I need.

## Filenames I will look for

    terms.md                 -> doc_type `terms_of_service`
    privacy.md               -> doc_type `privacy_policy`
    medical-disclaimer.md    -> doc_type `medical_disclaimer`
    <the new US document>.md -> a NEW doc_type, which needs a database migration

If the names differ that is fine — I will read what is here and match it up, and
ask if anything is ambiguous rather than guessing which document is which.

## What I need to know alongside them

1. **The version number** to stamp (currently everything is at `v1.3`). Every
   `consent_records` row records the version a person agreed to, so this decides
   what the audit trail says.
2. **The effective date** (currently `2026-06-20`).
3. **The new document's name and URL slug** — e.g. "Consumer Health Data Privacy
   Policy" at `/consumer-health-data`. It needs its own route and its own value
   in the `legal_doc_type` enum.
4. **Whether the new document needs its own consent tick**, or is notice-only.
   These are different: a tick is an agreement, a notice is something shown.

## ⚠️ Two things worth knowing before you write

- **Bodies are stored as PLAIN TEXT, not Markdown.** The renderer prints text.
  Existing documents were written in Markdown and converted in-migration:
  `#`/`##`/`###` stripped, `**`/`*` stripped, `- ` turned into `• `. Write in
  whatever is comfortable — I apply the same transform and then diff the result
  against your source so nothing is silently mangled.
- **The health-data consent sentence is currently quoted live on two screens**
  (`/welcome` and onboarding), word for word from the Privacy Policy. If v2
  changes that sentence, both screens change with it and it is a re-signing, not
  an edit. Flag it if you touch it.
