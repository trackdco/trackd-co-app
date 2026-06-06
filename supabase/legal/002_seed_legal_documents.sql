-- ============================================================
--  Seed legal documents — current draft versions.
--  Companion to 001_legal_documents.sql.
--  Applied as migration `seed_legal_documents`.
--
--  Text is stored VERBATIM (Adrian's instruction), with only the source
--  encoding mojibake repaired (â€" -> —, Â· -> ·, â€¢ -> •, smart quotes,
--  BOM removed). The inline "⚠ NOTE" drafting blocks are deliberately
--  KEPT — Adrian wrote "keep this here for now claude."
--
--  effective_date is NULL and the header line still reads
--  "DD Month 2026 — set on launch": both get set to the real launch day
--  at first launch, when versions also bump to 1.0 and is_beta -> false.
--
--  Idempotent: ON CONFLICT (doc_type, version) re-upserts the same row.
-- ============================================================

INSERT INTO legal_documents (doc_type, version, title, body, effective_date, is_beta, is_current)
VALUES
(
  'terms_of_service', '0.2', 'Trackd Co — Terms of Service',
$legal$Trackd Co — Terms of Service
Version 0.2 · Effective date: DD Month 2026 — set on launch
These Terms of Service ("Terms") are a legal agreement between you ("you" or "User") and Trackd Co Pty Ltd ("Trackd", "we", "us" or "our"). They govern your access to and use of the Trackd Co application, the website at trackdco.app, and all related features and services (together, the "Service").
By creating an account, ticking the acceptance box, or otherwise using the Service, you confirm that you have read, understood, and agree to be bound by these Terms, our Privacy Policy, and our Medical Disclaimer, which are incorporated into these Terms by reference. If you do not agree, do not use the Service.
1. Who can use Trackd (eligibility)
You may use Trackd only if you are at least 18 years old and have the legal capacity to enter into a binding contract. During signup you must confirm that you are 18 or older; we record that confirmation. We may suspend or close any account where we reasonably believe this is untrue.
You are responsible for ensuring your use of the Service is lawful where you live and where you access it. See Section 4.
2. What Trackd is — and what it is not
Trackd is an information and self-tracking tool for informed adults. It lets you record, organise, and review your own protocols — anabolic compounds, peptides, supplements, ancillaries, hormones — along with doses, inventory, bloodwork you upload, body metrics, and journal notes, and it computes your own figures back to you (such as remaining inventory and where a biomarker sits relative to a reference range).
Trackd is NOT a medical device, a pharmacy, a laboratory, a telehealth or healthcare provider, a source of medical advice, or a means to obtain, buy, sell, or source any substance. We do not supply, prescribe, recommend, dose, diagnose, titrate, or advise. The Service informs and records; it does not make decisions for you.
3. No medical advice
Nothing in the Service is medical advice and nothing in it should be relied on as a substitute for advice from a qualified healthcare professional. Always consult a suitably qualified professional before starting, stopping, or changing any substance, medication, or protocol. This is set out in full in our Medical Disclaimer, which forms part of these Terms.
Computed values are not instructions. Reconstitution, concentration, remaining-inventory, and similar figures shown in the Service are calculated solely from the information you enter. They are arithmetic performed on your own inputs — not dosing instructions, recommendations, or verified results. You must independently verify any calculation before relying on it, particularly before preparing or administering any substance, and you must not rely on a computed value that appears incorrect or inconsistent with your own records.
4. Substances, legality, and harm reduction
Many substances you may choose to track with Trackd — including anabolic androgenic steroids, certain peptides, hormones, and other compounds — are controlled, prescription-only, or otherwise regulated in many countries, and may be illegal to possess, use, import, or supply without authorisation.
Trackd is a record-keeping tool only. It does not sell, supply, source, promote, facilitate, or enable the acquisition or use of any substance. Recording a substance in Trackd is not a statement that it is safe, legal, effective, or appropriate for you. The built-in compound catalogue exists solely so that you can identify, label, and organise your own records; the inclusion of a substance in the catalogue is not a recommendation, promotion, advertisement, or offer to supply that substance, and the catalogue contains no information about how to obtain any substance. You alone are responsible for understanding and complying with every law that applies to you.
Trackd is built on a harm-reduction principle: adults who have already chosen to use these compounds are safer keeping accurate records than keeping none. Providing a tool to record those choices is not an endorsement of them.
5. Your account
You must give accurate information and keep it current. You are responsible for keeping your login credentials secure and for all activity under your account. Tell us promptly if you suspect unauthorised access. You may not share your account or let anyone else use it.
6. Acceptable use
You agree that you will not:
•  use the Service for any unlawful purpose, or in breach of any law that applies to you;
•  enter or manage another person's data without their authority;
•  copy, scrape, reverse-engineer, decompile, or attempt to extract the source code or underlying data of the Service, except where the law expressly permits it;
•  resell, sublicense, rent, or commercially exploit the Service without our written permission;
•  interfere with, overload, or disrupt the Service or its security, or upload malicious code;
•  use the Service to advertise, solicit, offer, buy, sell, source, or otherwise facilitate the supply of any substance, or to share sourcing information (including vendor names, links, prices, or contact details) with any other person;
•  infringe our intellectual property or anyone else's; or
•  present yourself, using Trackd, as a medical professional or as giving medical advice to others.
7. Your content and data
You own the data you enter — your cycles, doses, journal entries, body metrics, and the bloodwork files you upload ("Your Content"). You grant us a limited, non-exclusive licence to host, store, process, and display Your Content solely to operate and provide the Service to you. We do not sell Your Content. How we handle it is described in the Privacy Policy.
You are responsible for the accuracy of Your Content. You can export or request deletion of your data as described in the Privacy Policy.
8. Beta service, availability, and changes
The Service is currently in beta and is provided on an "as is" and "as available" basis. It may be incomplete, unstable, or interrupted; features may change or be removed; and data loss is possible. Keep your own copies of anything important to you, especially original bloodwork files. We do not guarantee any level of uptime or that the Service will be error-free. If you give us feedback, ideas, or suggestions about the Service, you agree that we may use them to improve the Service without restriction and without any obligation or payment to you.
9. Fees and subscriptions
The Service is free to use during the beta. We may introduce paid plans or subscriptions in future. If we do, we will show you the price, billing cycle, and cancellation and refund terms before you are charged, and you will not be charged without agreeing to them.
10. Intellectual property
The Service — including its software, design, branding, and the compound and biomarker catalogues — is owned by us or our licensors and is protected by intellectual-property laws. We grant you a personal, limited, non-transferable, revocable licence to use the Service for your own use under these Terms. No other rights are granted.
11. Third-party services
The Service runs on third-party infrastructure — including Supabase (database, authentication, and file storage) and Vercel (hosting and content delivery). We are not responsible for the acts or omissions of these providers, and their own terms may apply to the underlying infrastructure. The providers that process personal data are listed in the Privacy Policy.
12. Disclaimer of warranties
Your statutory rights come first. Nothing in these Terms excludes, restricts, or modifies any consumer guarantee, warranty, right, or remedy that you have under the Australian Consumer Law, or under any other law that applies to you (including mandatory consumer-protection laws of the country where you live, such as those of the United Kingdom or the European Union), that cannot lawfully be excluded, restricted, or modified (your "Non-Excludable Rights"). Where legislation permits us to limit our liability for a failure to comply with a Non-Excludable Right in relation to services, our liability is limited, at our option, to supplying the services again or paying the cost of having the services supplied again.
Subject to your Non-Excludable Rights, and otherwise to the fullest extent permitted by law, the Service is provided "as is" and "as available", without warranties of any kind, whether express or implied, including implied warranties of merchantability, fitness for a particular purpose, accuracy, and non-infringement. We do not warrant that the catalogue data, reference ranges, or any computed value (including reconstitution or inventory calculations) are accurate, complete, current, or suitable for you.
13. Limitation of liability
To the fullest extent permitted by law, we will not be liable for any indirect, incidental, special, consequential, or punitive damages, or for any loss of data, profits, or goodwill, arising from or related to your use of (or inability to use) the Service, or from any decision you make about any substance. Our total aggregate liability arising out of or relating to the Service is limited to the greater of AUD $100 or the total fees you paid us in the 12 months before the event giving rise to the claim. Nothing in this section, or anywhere else in these Terms, excludes or limits any liability that cannot be excluded or limited by law. In particular, we do not exclude or limit our liability for death or personal injury caused by our negligence, for fraud or fraudulent misrepresentation, or for any failure to comply with your Non-Excludable Rights — and the cap above does not apply to that liability.
14. Indemnification
You agree to indemnify us against claims, losses, liabilities, and reasonable costs (including reasonable legal fees) brought against us by a third party, or suffered by us, to the extent they arise from your breach of these Terms, your breach of any law, or Your Content. This indemnity is reduced proportionately to the extent that we caused or contributed to the relevant claim or loss, and it does not apply to anything caused by our breach of these Terms, our negligence, or our breach of law.
15. Termination
You may stop using the Service and delete your account at any time. We may suspend or terminate your access if you breach these Terms or if we reasonably need to. On termination, your right to use the Service ends; how your data is handled afterwards is described in the Privacy Policy (we archive rather than hard-delete within the app, and we erase your personal data on a full account-deletion request).
16. Changes to these Terms
We may update these Terms from time to time. If we make material changes we will notify you in advance — in the app or by email — at least 14 days before they take effect, unless an earlier change is required for legal, security, or safety reasons. Material changes will not apply retrospectively. If you do not agree to a change, you may close your account before it takes effect. The version of the Terms you accepted, and the date you accepted them, are recorded against your account. Continuing to use the Service after an update means you accept the updated Terms.
17. Governing law and disputes
These Terms are governed by the laws of the Australian Capital Territory, Australia, and you and we submit to the non-exclusive jurisdiction of the courts of the Australian Capital Territory and the courts entitled to hear appeals from them. Nothing in this section removes any mandatory consumer-protection rights you have where you live. If you use the Service as a consumer, the consumer-protection law of the country where you live may also apply to your use of the Service, and you may be entitled to bring proceedings in your local courts.
18. General
If any part of these Terms is found unenforceable, the rest stays in force. Our failure to enforce a provision is not a waiver of it. You may not assign these Terms; we may assign them to a successor (for example in a sale of the business). These Terms, together with the Privacy Policy and Medical Disclaimer, are the entire agreement between you and us about the Service. Sections that by their nature should continue after your account is closed or these Terms end — including Sections 7 (Your content and data), 10 (Intellectual property), 12 (Disclaimer of warranties), 13 (Limitation of liability), 14 (Indemnification), and 17 (Governing law and disputes) — survive termination. We are not liable for any delay or failure to perform caused by events beyond our reasonable control.
19. Contact
Questions about these Terms? Contact us at legal@trackdco.app$legal$,
  NULL, true, true
),
(
  'privacy_policy', '0.1', 'Trackd Co — Privacy Policy',
$legal$Trackd Co — Privacy Policy
Version 0.1 · Effective date: DD Month 2026 — set on launch
This Privacy Policy explains how Trackd Co Pty Ltd ("Trackd", "we", "us", "our") collects, uses, stores, and shares your personal information when you use the Trackd Co application and the website at trackdco.app (the "Service"). It forms part of, and should be read with, our Terms of Service and Medical Disclaimer.
1. The sensitivity of your data — read this first
By its nature, Trackd handles health-related information: the substances you track, your doses, the bloodwork you upload, your body metrics, and your journal notes. In many places this counts as "sensitive" or "special-category" personal information that gets extra legal protection. We treat all of your protocol, bloodwork, body-metric, and journal data as sensitive. By entering this information into Trackd, you explicitly consent to us processing it as described here in order to provide the Service to you.
⚠ NOTE — Explicit consent is the cleanest lawful basis for handling health data (GDPR Art. 9, Australian Privacy Principles for sensitive info). Note that US HIPAA most likely does NOT apply to you — you are not a healthcare provider or covered entity — but claude should confirm this for your markets and confirm the consent mechanism (the signup tick-box) is captured properly.
2. Information we collect
Information you give us
•  Account information — your email address and password, handled through Supabase Auth. We do not store your password in readable form.
•  Age confirmation — your confirmation that you are 18 or older.
•  Profile and settings — preferences and configuration you set in the app.
•  Protocol data — cycles, the compounds you add, inventory items, doses you log, injection sites, and schedules.
•  Journal and subjective markers — daily journal entries and the markers you record, including side-effect markers.
•  Body metrics — measurements you choose to record.
•  Bloodwork — the lab files you upload and any biomarker values associated with them.
Information collected automatically
•  Authentication and session data — strictly-necessary cookies / local storage used to keep you signed in.
•  Basic technical logs — limited server and security logs from our hosting provider. During beta we do not run third-party analytics or advertising trackers.
⚠ NOTE — When you add analytics (PostHog is planned) or error monitoring (Sentry) after beta, you must list them here, update the cookies section below, and obtain consent where required (especially EU/UK). Don't switch them on silently.
3. How we use your information
We use your information to:
•  provide and operate the Service, including computing your inventory figures and where your biomarkers sit relative to reference ranges (these are derived live and shown only to you);
•  authenticate you and keep your account secure;
•  respond to your support requests; and
•  meet our legal obligations.
We do not use your health data for advertising, and we do not sell your personal information.
4. Legal bases for processing (where applicable)
Where laws such as the UK or EU GDPR apply, we rely on: performance of our contract with you (to run the Service); your explicit consent (for sensitive health data, and for any optional analytics); our legitimate interests (keeping the Service secure and working); and compliance with legal obligations. You can withdraw consent at any time, as described in Section 9.
5. How and where your data is stored
Your data is held with our infrastructure providers. Our database, authentication, and file storage are provided by Supabase; our application hosting and content delivery are provided by Vercel. Bloodwork files are kept in a private, access-controlled storage bucket, and database access is enforced row-by-row so that one user cannot read another user's data.
Your data may be stored and processed in REGION(S) — e.g. your Supabase project region and Vercel's edge network — CONFIRM AND NAME.
⚠ NOTE — Find your actual Supabase project region and Vercel region and name them here — this drives the international-transfers section below. If your users and your servers are in different countries, you're making a cross-border transfer and need to say so. keep this here fro now claude because i will need to do it.
Our sub-processors
•  Supabase — database, authentication, and file storage.
•  Vercel — application hosting and content delivery.
•  To add when live: Stripe (payments), Resend / ConvertKit (email), PostHog (analytics), Sentry (error monitoring).
⚠ NOTE — Keep this list current. Every new vendor that can touch personal data belongs here, and adding one is exactly the kind of change to notify users about. keep this here too
6. Sharing and disclosure
We do not sell or rent your personal information. We share it only: with the sub-processors listed above, so they can help us run the Service; where we are required to by law or valid legal process; or as part of a business transfer (such as a merger or sale), in which case we will take reasonable steps to notify you.
7. Data retention and deletion
We keep your data while your account is active. Within the app, cycles are archived rather than permanently deleted, so your history is preserved and longitudinal tracking keeps working. You can request full deletion of your account, which erases your personal data — including your uploaded bloodwork files — except anything we are legally required to retain for a limited period.
⚠ NOTE — A user will request deletion through an in-app button. The deletion will take within 30 days. The backup retention window has not been confirmed yet, so note it down that we need to confirm that. Then I want you, Claude, to state the first two in this data retention and deletion section.
8. Security
We take reasonable measures to protect your information, including:
•  encryption of data in transit (HTTPS);
•  row-level access control so each user can only reach their own data;
•  a private, access-controlled bucket for bloodwork files; and
•  least-privilege handling of our service keys.
No method of storage or transmission is perfectly secure. Please help protect your account by keeping your password confidential.
9. Your rights
Depending on where you live, you may have rights to access, correct, export, or delete your personal information, to restrict or object to certain processing, and to withdraw consent. You may also have the right to complain to a data-protection regulator. To exercise any of these, contact us using the details in Section 14, and we will respond as the law requires.
As you can see, the note below says to tailor the exact list of rights to your markets. I think it's better off to add a clause saying that you consent that you will follow whatever the law is in that region. If that's something legally that you can do, then put that in.
⚠ NOTE — Tailor the exact list of rights to your markets (GDPR vs. California's CCPA/CPRA vs. the Australian Privacy Principles) and name the relevant regulator — for example the OAIC in Australia. Your lawyer will localise this.
10. International data transfers
If your information is stored or processed in a country other than the one you live in, we will take steps required by applicable law to protect it during that transfer.
⚠ NOTE — Fill this in once Section 5's regions are confirmed. If, say, your users are in Australia but data sits in a US/EU region, name that and the safeguard claude recommends (e.g. standard contractual clauses).
11. Children
Trackd is for adults only. The Service is not directed to anyone under 18, and we do not knowingly collect personal information from minors. If we learn we have, we will delete it.
12. Cookies and local storage
We use only strictly-necessary cookies and local storage — for example, to keep you signed in and to operate the app. During beta we do not use advertising cookies or third-party tracking. If that changes, we will update this section and seek consent where required.
13. Changes to this policy
We may update this Privacy Policy from time to time. If we make material changes we will take reasonable steps to notify you, and we will update the effective date at the top of this document.
14. Contact
For privacy questions or to exercise your rights, contact us at legal@trackdco.app$legal$,
  NULL, true, true
),
(
  'medical_disclaimer', '0.2', 'Trackd Co — Medical Disclaimer',
$legal$Trackd Co — Medical Disclaimer
Version 0.2 · Effective date: DD Month 2026 — set on launch
Please read this Medical Disclaimer carefully. It forms part of the Trackd Co Terms of Service. By using Trackd, you acknowledge and accept everything set out below.
1. Trackd is not medical advice
Everything in the Service — including catalogue information, reference ranges, calculations (such as the reconstitution calculator and inventory figures), and the categorical biomarker positions it displays — is provided for information and self-tracking purposes only. It is not medical advice and must not be relied on as a substitute for advice from a qualified healthcare professional.
2. Trackd does not diagnose, treat, or prescribe
Trackd is not a medical device, pharmacy, laboratory, or telehealth or healthcare provider. It does not diagnose, treat, cure, prevent, dose, titrate, or prescribe anything. Where Trackd shows a biomarker as below, within, or above a reference range, that is a neutral position indicator only — it is not a diagnosis and not a statement that any value is good, bad, safe, or dangerous. Trackd does not review, analyse, or interpret the bloodwork files you upload; it stores them and displays the values you enter. Only a qualified clinician can interpret your bloodwork.
3. Always consult a qualified professional
Always seek the advice of a physician or other qualified health professional with any question you have about a medical condition, medication, hormone, peptide, supplement, or other substance. Never disregard professional medical advice, or delay seeking it, because of something you have seen in Trackd.
4. No professional relationship
Using Trackd does not create a doctor–patient relationship, or any other professional or clinical relationship, between you and Trackd or anyone associated with it.
5. The substances you may track carry serious risks
Many of the substances you may choose to record — including anabolic androgenic steroids, peptides, hormones, and other performance or optimisation compounds — carry serious health risks. These can include serious, lasting, or life-threatening harm, and dangerous interactions with each other or with medications. Tracking a substance in Trackd does not make it safe, and is not a recommendation to use it. Trackd does not check for, or warn you about, interactions, contraindications, or the combined effect of anything you record. Seeing substances tracked side by side in the Service is not an indication that the combination is safe.
Trackd exists to help adults who have already decided to use these compounds keep accurate records. Accurate self-tracking is a harm-reduction measure; it is not a substitute for medical supervision, for bloodwork interpreted by a clinician, or for professional care.
6. Legality is your responsibility
You are solely responsible for the legality of any substance you choose to use or track where you live and where you access the Service. See Section 4 of the Terms of Service.
7. Accuracy, calculations, and individual variation
We try to keep catalogue and reference data reasonable, but we do not warrant that it is accurate, complete, current, or applicable to you. Reference ranges vary by laboratory and by a person's age, sex, and individual circumstances. Any calculation Trackd performs depends entirely on the figures you enter: if the inputs are wrong, the output will be wrong. Always independently verify anything that matters — for example, check reconstitution maths yourself before drawing or administering any dose.
The reconstitution calculator in particular. The calculator cannot see what is in your vial. It performs arithmetic on the figures you give it — the stated quantity of powder, the volume of liquid you say you added — and if any of those figures are wrong, every output (concentration, volume to draw, doses remaining) will be wrong with them. The calculator cannot detect mislabelled, under-dosed, or counterfeit products, and its output is never a verified concentration. Before drawing or administering any dose, independently confirm the calculation yourself, and do not inject a volume that does not match your own check. Do not rely solely on the Service to determine whether you have or have not already administered a dose; during the beta in particular, data loss and sync errors are possible.
8. In an emergency
If you think you are experiencing a medical emergency, stop and contact your local emergency services immediately — 000 in Australia, 111 in New Zealand, 911 in the United States and Canada, 999 in the United Kingdom, and 112 across the European Union and much of the rest of the world. If you are anywhere else, know your local emergency number. Do not use Trackd to manage an emergency.
9. Assumption of risk and acknowledgement
To the fullest extent permitted by law, you assume all risk arising from your use of the Service and from any decision you make in connection with it, and Trackd's liability to you is limited as set out in the Terms of Service. Nothing in this Medical Disclaimer excludes, restricts, or modifies your Non-Excludable Rights (as defined in the Terms of Service) or any liability that we cannot exclude or limit by law. By using Trackd, you confirm that you have read and understood this Medical Disclaimer.$legal$,
  NULL, true, true
)
ON CONFLICT (doc_type, version) DO UPDATE SET
    title          = EXCLUDED.title,
    body           = EXCLUDED.body,
    effective_date = EXCLUDED.effective_date,
    is_beta        = EXCLUDED.is_beta,
    is_current     = EXCLUDED.is_current;
