-- ============================================================
--  Privacy Policy v1.0 — content refinement (pre-launch, Adrian, 2026-06-18).
--  Applied as migration `legal_documents_privacy_v1_0_content`.
--
--  Still version 1.0: these are PRE-LAUNCH corrections to text that was never
--  made effective (no effective_date), not a post-launch version bump. Changes
--  vs the first 1.0 cut (003):
--    • Analytics/error monitoring: PostHog + Sentry are NOT in use → say so.
--    • Sub-processors trimmed to what is actually live: Supabase + Vercel
--      (Stripe/PostHog/Sentry/Resend/ConvertKit removed; a forward-looking
--      sentence covers adding any later). Payment processing dropped from
--      current practice (no payments in beta).
--    • Backups: the "[retention window to be confirmed]" placeholder removed.
--  Stored as PLAIN TEXT (the renderer renders plain text; see 004/005). NOTE:
--  the backup sentence here is further softened by migration 007.
-- ============================================================

UPDATE legal_documents
SET body =
$legal$Trackd Co — Privacy Policy
Version 1.0 · Effective date: DD Month 2026 — set on launch

This Privacy Policy explains how Trackd Co Pty Ltd ("Trackd", "we", "us", "our") collects, uses, stores, and shares your personal information when you use the Trackd Co application and the website at trackdco.app (the "Service"). It forms part of, and should be read with, our Terms of Service and Medical Disclaimer.

1. The sensitivity of your data

Trackd handles health-related information: the substances you track, your doses, the bloodwork you upload, your body metrics, and your journal notes. In many places this counts as "sensitive" or "special-category" personal information that gets extra legal protection. We treat all of your protocol, bloodwork, body-metric, and journal data as sensitive. By entering this information into Trackd, you explicitly consent to us processing it as described here in order to provide the Service to you. You give this consent when you tick the acceptance box at signup, and we record the version of this policy you accepted and when you accepted it.

2. Information we collect

Information you give us

• Account information: your email address and password, handled through Supabase Auth. We do not store your password in readable form.
• Age confirmation: your confirmation that you are 18 or older.
• Profile and settings: preferences and configuration you set in the app.
• Protocol data: cycles, the compounds you add, inventory items, doses you log, injection sites, and schedules.
• Journal and subjective markers: daily journal entries and the markers you record, including side-effect markers.
• Body metrics: measurements you choose to record.
• Bloodwork: the lab files you upload and any biomarker values associated with them.

Information collected automatically

• Authentication and session data: strictly-necessary cookies and local storage used to keep you signed in.
• Basic technical logs: limited server and security logs from our hosting provider.
• Analytics: we do not currently use third-party product-analytics or error-monitoring services, and we do not run advertising trackers. If we add any in future, we will update this policy, list the provider in Section 5, and seek your consent where the law requires it.

3. How we use your information

We use your information to:

• provide and operate the Service, including computing your inventory figures and where your biomarkers sit relative to reference ranges (these are derived live and shown only to you);
• authenticate you and keep your account secure;
• respond to your support requests; and
• meet our legal obligations.

We do not use your health data for advertising, and we do not sell your personal information. We may send you emails needed to operate the Service, such as account, security, and support emails. We will only send you marketing emails with your consent, and every marketing email will include a working unsubscribe link.

4. Legal bases for processing (where applicable)

Where laws such as the UK or EU GDPR apply, we rely on: performance of our contract with you (to run the Service); your explicit consent (for sensitive health data, and for any optional analytics); our legitimate interests (keeping the Service secure and working); and compliance with legal obligations. You can withdraw consent at any time, as described in Section 9.

5. How and where your data is stored

Your data is held with our infrastructure and service providers. Our database, authentication, and file storage are provided by Supabase, in its Sydney, Australia region (ap-southeast-2). Our application hosting and content delivery are provided by Vercel. Bloodwork files are kept in a private, access-controlled storage bucket, and database access is enforced row-by-row so that one user cannot read another user's data.

Where the database is backed up for disaster recovery, those backups are handled by our infrastructure provider (Supabase) under its backup policy for our plan: they are encrypted, retained only for the limited period that policy provides, and then overwritten, and they are protected in the same way as the primary data.

Some of our sub-processors are located overseas (primarily in the United States), which means some of your information may be stored or processed outside Australia. We explain how we protect your information when this happens in Section 10.

Our sub-processors

We use the following providers to operate the Service. Each acts on our instructions and is bound by a data-processing agreement. They may only use your information to provide their service to us, and we do not sell your personal information to any of them.

• Supabase: database, authentication, and file storage (Sydney, Australia).
• Vercel: application hosting and content delivery.

If we add or change a provider that processes personal data on our behalf — for example payment processing, product analytics, error monitoring, or email — we will update this list and, where the law requires it, seek your consent.

6. Sharing and disclosure

We do not sell or rent your personal information. We share it only: with the sub-processors listed above, so they can help us run the Service; where we are required to by law or valid legal process; or as part of a business transfer (such as a merger or sale), in which case we will take reasonable steps to notify you. If we receive a request for your data from law enforcement or a government agency, we will check that the request is legally valid, disclose only what we are legally compelled to disclose, and, unless the law prohibits us from doing so, take reasonable steps to tell you about the request.

7. Data retention and deletion

We keep your data while your account is active. Within the app, cycles are archived rather than permanently deleted, so your history is preserved and longitudinal tracking keeps working. You can request full deletion of your account, which erases your personal data, including your uploaded bloodwork files, except anything we are legally required to retain for a limited period. You can request deletion at any time using the deletion control inside the app, and we will complete the deletion from our live systems within 30 days of your request. If any of your data remains in an encrypted backup after deletion, it is removed when that backup is overwritten on its normal cycle.

8. Security

We take reasonable measures to protect your information, including:

• encryption of data in transit (HTTPS);
• row-level access control so each user can only reach their own data;
• a private, access-controlled bucket for bloodwork files; and
• least-privilege handling of our service keys.

No method of storage or transmission is perfectly secure. Please help protect your account by keeping your password confidential. If a data breach occurs that is likely to result in serious harm to you, we will notify you and the relevant regulator, including the Office of the Australian Information Commissioner under Australia's Notifiable Data Breaches scheme, as required by law, and we will tell you what happened, what data was involved, and what we are doing about it.

9. Your rights

Depending on where you live, you may have rights to access, correct, export, or delete your personal information, to restrict or object to certain processing, and to withdraw consent. You may also have the right to complain to a data-protection regulator. To exercise any of these, contact us using the details in Section 14, and we will respond as the law requires. We will honour whatever privacy rights the law of your home country gives you: when you make a request, we will assess it under the law that applies to you and respond as that law requires, even if the right is not listed above. In Australia, the relevant regulator is the Office of the Australian Information Commissioner (OAIC). Because the Service cannot operate without processing the protocol and health-related information you enter, withdrawing your consent to that processing means closing your account. We will explain this to you before acting on such a request.

10. International data transfers

If your information is stored or processed in a country other than the one you live in, we will take steps required by applicable law to protect it during that transfer. Depending on where you live and where the data goes, those steps may include contractual safeguards (such as the standard contractual clauses recognised under UK and EU law, which our infrastructure providers offer in their data-processing agreements) and the requirements of Australian Privacy Principle 8 for disclosures from Australia.

11. Children

Trackd is for adults only. The Service is not directed to anyone under 18, and we do not knowingly collect personal information from minors. If we learn we have, we will delete it.

12. Cookies and local storage

We use strictly-necessary cookies and local storage, for example to keep you signed in and to operate the app. We do not use advertising cookies or third-party analytics cookies. If this changes, we will update this section and seek consent where required.

13. Changes to this policy

We may update this Privacy Policy from time to time. If we make material changes we will take reasonable steps to notify you, and we will update the effective date at the top of this document.

14. Contact

For privacy questions or to exercise your rights, contact us at legal@trackdco.app$legal$
WHERE doc_type = 'privacy_policy' AND version = '1.0';
