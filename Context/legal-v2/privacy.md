Privacy Policy
VERSION 2.0 · EFFECTIVE 27 August 2026
Supersedes v1.4.

This Privacy Policy explains how Trackd Co Pty Ltd (ACN 698 405 462, ABN 35 698 405 462), an Australian private company based in the Australian Capital Territory, Australia ("Trackd Co", "Trackd", "we", "us", "our"), collects, uses, stores, and shares your personal information when you use the Trackd Co application and the website at trackdco.app (the "Service"). It forms part of, and should be read with, our Terms of Service and Medical Disclaimer.

Trackd is available to users worldwide. Depending on where you live, additional rights and protections may apply to you. See Sections 14 (EU and UK), 15 (United States), and 16 (Consumer Health Data).

Two people operate Trackd, the two founders. Both have administrative access to our systems, within the limits described in Section 6.

## 1. The sensitivity of your data, and your consent

Trackd handles health-related information: the substances you track, your doses, the bloodwork images you upload, your body metrics, and your journal notes. Under Australia's Privacy Act 1988 (Cth) this is sensitive information, and in many other places it counts as "special category" or "consumer health" data that gets extra legal protection. We treat all of your protocol, bloodwork, body-metric, journal, and uploaded-image data as sensitive.

The Service cannot work without processing this information, so when you create your account we ask for your explicit, specific consent through a separate consent step, distinct from accepting our Terms of Service. You give this consent by ticking a dedicated box that reads: "I explicitly consent to Trackd processing my health-related data (compounds, doses, bloodwork, body metrics, photos and journal entries) to provide the Service, as described in the Privacy Policy." We record the version of this policy you consented to, the date and time you did so, and the browser you used (its user agent). You can withdraw this consent at any time, as described in Section 10.

## 2. Information we collect

### Information you give us

- **Account information:** your email address and password, handled through Supabase Auth. We do not store your password in readable form. If you choose to sign in with Google instead, we receive your email address and basic profile information from Google rather than a password.
- **Date of birth and age:** we collect your date of birth and use it to confirm you are at least 18. We record your 18+ confirmation.
- **Onboarding answers:** the answers you give during setup, including your name, date of birth, sex, your goals, and how you heard about us.
- **Profile and settings:** preferences and configuration you set in the app, including an optional profile photo (avatar).
- **Protocol data:** cycles, the compounds you add, inventory items, doses you log, injection sites, and schedules.
- **Journal and subjective markers:** daily journal entries, any photos you attach to them, and the markers you record, including side-effect markers. These markers are your own self-ratings on a scale you choose; we do not assess them.
- **Body metrics:** measurements you choose to record, such as bodyweight.
- **Bloodwork:** images of laboratory reports that you choose to upload, together with the draw date and any note you add. We do not read, extract, interpret, or store the values inside those images. The Service stores them as dated pictures for you to look back on.
- **Progress photos:** any progress photos you choose to upload, which are stored in a private, access-controlled bucket.
- **Feedback and requests:** anything you send us through the in-app feedback form, including refund requests, together with the email address it came from, the page in the app you sent it from, and your browser's description (its user agent). These are stored in our database and read by the founders. Please do not include health details in a message to us that you would not want us to read.
- **Waitlist information:** if you joined our waitlist before signing up, the email address you gave us and, where the link you arrived through included one, a short tag identifying which channel you came from.

### Billing information

If you subscribe, we and Stripe each hold part of the picture.

- **Stripe holds:** your card details, your billing address if you provide one, your payment and invoice history, and the email address on your account. Your card details go from your browser to Stripe directly. They never reach our servers, and we never see or store your card number.
- **We hold:** your Stripe customer and subscription identifiers, your plan and billing period, your subscription status, your trial and free-period end dates, and a record of whether a retention offer has been shown to or claimed by you. We also keep a copy of the billing events Stripe sends us, so that we can check what actually happened if a charge goes wrong. Those events are Stripe's own records of each charge and can include details such as your billing country and the last four digits of your card.

We do not connect your billing records to your protocol or health data for any purpose other than knowing whether your account has access.

### Information collected automatically

- **Authentication and session data:** strictly-necessary cookies and local storage used to keep you signed in.
- **Server and platform logs:** our hosting provider, Vercel, records standard server and security logs. Our billing code writes diagnostic messages into those logs so that we can trace payment problems, and those messages include your internal user identifier and Stripe identifiers. They do not include your protocol, bloodwork, journal, or photo data. These logs are held by Vercel under its own retention period.

### Notifications

If you turn on reminders, we store the push subscription your browser creates for you, which is an address your browser gives us for delivering messages, together with the encryption keys that go with it. We also store the browser and device description your browser sends (your user agent), so you can tell your devices apart when managing notifications, and your device's timezone (for example, "Europe/London"), used only to schedule reminders at the right local time. We do not collect your timezone unless you enable notifications or set your reminder preferences. Turning notifications off stops this, and we automatically remove subscriptions that stop working.

The address your browser gives us identifies which push service your browser vendor uses, which indicates the browser or operating system you are on.

Please read this part carefully. Reminders name the compound they relate to, for example "Testosterone Enanthate is due today", or "Retatrutide is running low". That text can appear on your lock screen and can be read by anyone who can see your device without unlocking it. Reminders are delivered through the push service your browser uses, operated by Google, Apple, or Mozilla depending on your browser. The content of each message is encrypted so that service cannot read it, but the fact that a message was delivered to your device passes through it. If either of these matters to you, leave reminders turned off.

### Analytics and advertising

We do not currently use any product-usage analytics provider: nothing about how you use the app is sent to an analytics service. If we ever add one, it will be named in the "Our service providers" section above before it goes live, and it will only ever receive information about how the app is used, such as which screens are opened and which steps in a flow are completed. Your protocol, bloodwork, journal, body-metric, and photo data will never be part of analytics.

We do not use advertising trackers, we do not set advertising cookies, we do not show advertising in the Service, and we do not sell or share your personal information. These commitments are firm and do not depend on which provider we use.

## 3. How we use your information

We use your information to:

- provide and operate the Service, including computing your own figures back to you, such as remaining inventory, doses remaining, next dose dates, and how consistently you have logged (these are derived live from what you enter and shown only to you);
- send the reminders you have turned on;
- authenticate you and keep your account secure;
- take payment, manage your subscription, and handle refunds and billing problems;
- respond to your support requests and read the feedback you send us; and
- meet our legal obligations, including tax and financial record-keeping.

We do not use your health data for advertising, we do not show advertising in the Service, and we do not sell or "share" (as privacy laws such as the CCPA define those terms) your personal information.

We do not operate our own email system. The emails you receive from us are sent by our providers: account and security emails (sign-up confirmation and password reset) through Supabase, and billing emails such as receipts through Stripe. We do not send marketing emails. If we introduce them in future, we will only send them with your consent, include a working unsubscribe link, and update this policy first.

## 4. Legal bases for processing (where the GDPR applies)

Where laws such as the UK or EU GDPR apply, we rely on: performance of our contract with you (to run the Service and to take payment); your explicit consent under Article 9 (for your sensitive health data); our legitimate interests (keeping the Service secure and working, and preventing abuse of free trials); and compliance with legal obligations (including tax and financial records). You can withdraw consent at any time, as described in Section 10.

## 5. How and where your data is stored

Your data is held with our infrastructure and service providers.

- **Supabase** provides our database, authentication, and file storage, in its Sydney, Australia region (ap-southeast-2).
- **Vercel** provides application hosting and content delivery. Our application servers run in Vercel's Sydney region, behind a global edge network.
- **Stripe** processes payments and holds the billing information described in Section 2.

Uploaded files (bloodwork images, journal photos, progress photos, and avatars) are kept in private, access-controlled storage buckets and are only ever served to you through short-lived signed links that expire after about an hour. Database access is enforced row by row so that one user cannot read another user's data.

All data is encrypted at rest (AES-256) and in transit (TLS), including the database, the storage buckets, and our database backups. We keep encrypted database backups so that we can recover after a failure.

### Our service providers

These are our sub-processors: the companies that handle your information on our behalf. We use the following providers to operate the Service. Each acts on our instructions and is bound by a data-processing agreement. They may only use your information to provide their service to us, and we do not sell your personal information to any of them.

- **Supabase:** database, authentication, and file storage (Sydney, Australia).
- **Vercel:** application hosting, content delivery, and server logs (United States company; our compute runs in Sydney).
- **Stripe:** payment processing and billing records.

These are our only active service providers. If we add another, including a different analytics or an email provider, we will add it to this list before that provider goes live. We treat the addition of a new service provider that handles your sensitive data as a material change (see Section 17).

### Other recipients

Three other parties may receive limited information, but only because of a choice you make or because of how the checkout screen is built, and none of them processes your protocol or health data on our behalf:

- **Google,** if you choose to sign in with your Google account. Google will know that you authenticated with Trackd, and passes us your email address and basic profile information.
- **The push service your browser uses** (Google, Apple, or Mozilla), if you turn on reminders. It relays notifications to your device as described in Section 2.

- **Google Fonts,** on the payment screen only. Our payment form is provided by Stripe and displayed inside a frame from Stripe. To make it match the rest of the app, we ask Stripe to load one font from Google's font service, so on that screen your browser makes a request to Google. Google receives your IP address, your browser's user agent, and the fact that the request came from a payment form. It receives nothing else, and no billing or health data. The rest of the app does not contact Google for fonts.

## 6. Sharing and disclosure

We do not sell or rent your personal information. We share it only: with the sub-processors listed above, so they can help us run the Service; where we are required to by law or valid legal process; or as part of a business transfer (such as a merger or sale). In a business transfer involving your sensitive health data, we will require the recipient to be bound by privacy protections at least as protective as this policy, and we will take reasonable steps to notify you. If we receive a request for your data from law enforcement or a government agency, we will check that the request is legally valid, disclose only what we are legally compelled to disclose, and, unless the law prohibits us from doing so, take reasonable steps to tell you about the request.

**Who at Trackd can see your data.** Our systems are built so that your protocol, bloodwork, journal, body-metric, and photo data is readable only by you. Neither founder can read it through the app. There are three narrow exceptions, all limited to our two founder accounts: the feedback and refund requests you send us through the in-app form (which include your email address and whatever you write), waitlist sign-ups, and billing and subscription records, which we need in order to answer questions about charges. In an emergency, or where the law requires it, we may need direct database access to fix a fault or comply with a legal obligation.

## 7. Data on your own device

Trackd stores a working copy of your data in your browser on the device you use, so the app stays fast and keeps working when you are offline. This copy includes real health information: the compounds in your protocol, your schedules, the doses you have logged, one-off logs, custom compounds you create, and your onboarding answers, which include your date of birth and sex.

Three things about that copy matter, and we would rather you know them than not:

- It is not encrypted by us. Anyone with access to an unlocked device or to your browser profile could read it.
- **Signing out does not remove it.** It stays in that browser under your account, and is read again if you sign in on the same device. Another person signing in with a different account will not see your data through the app, but your data is still physically present in that browser's storage.
- **Deleting your account does not remove it either.** Account deletion happens on our servers and cannot reach your browser's storage.

To remove the on-device copy, clear the site data for trackdco.app in your browser, or delete the app from your device if you installed it to your home screen. If you share a device with anyone, do this when you have finished.

## 8. Data retention and deletion

We keep your data while your account is active. If your account becomes read only because a subscription ended, we keep it in exactly the same way. Nothing is deleted, hidden, or withheld because you stopped paying, and you can still delete your own data or close your account at any time.

**Deleting things inside the app.** When you delete a compound or a cycle, it stops appearing in your protocol and no further doses are scheduled for it, but the doses you have already logged are kept, so your history stays intact. The underlying record is marked inactive in our database rather than erased, and it stays there until you delete your account. Deleting an individual logged dose, a journal entry, a body-metric entry, a bloodwork image, or a progress photo removes it permanently, including the underlying file where there is one.

**Full account deletion.** You can request full deletion of your account at any time, including while your account is read only, using the in-app "Delete my account" control, which opens a pre-filled email to support@trackdco.app for you to send. One-tap self-service deletion is planned. Your right to delete is absolute: it does not depend on your subscription, on paying us, or on anything else.

When you ask, we delete your account data and remove your uploaded files as part of processing your request. We do this as soon as reasonably practicable, and typically within 30 days. Your uploaded files (bloodwork images, progress photos, journal photos, and avatars) are held in private storage that only you can reach, and removing them is a step we carry out when we process your request rather than something that happens automatically the moment you send it. Records we are required to keep are retained for as long as the law requires, including payment and transaction records, some of which are held by our payment processor rather than by us. Those are listed immediately below.

**What deletion does not reach.** We would rather be exact about this than reassuring:

- **Payment records.** Stripe keeps its own records of your payments, invoices, and the email address on your customer record. We are required to keep financial and tax records for a period set by law, so payment records are retained even after your account is deleted. They are not connected to your protocol or health data.
- **Billing event records.** We keep the billing events our payment processor sent us, so that we can investigate a charge that turns out to be wrong. They contain payment identifiers, amounts, and details Stripe includes with a charge, such as billing country and the last four digits of a card, but never any health data.
- **Backups.** Residual copies of database records may remain in our encrypted backups until those backups are overwritten in the normal cycle.
- **Server logs.** Diagnostic log lines held by our hosting provider may contain your internal user identifier until they age out of that provider's retention period.
- **Waitlist records.** If you joined the waitlist, the email address you gave us there is stored separately from your account and is not removed by account deletion. Ask us at support@trackdco.app and we will delete it too.
- **Your own device.** As described in Section 7, the copy in your browser is not affected by account deletion.

## 9. Security

We take reasonable technical and organisational measures to protect your information, including:

- encryption of data in transit (HTTPS/TLS) and at rest (AES-256), covering the database, storage, and backups;
- row-level security on every table, so each user can only reach their own data;
- private, access-controlled storage buckets for bloodwork, journal photos, progress photos, and avatars, served only via short-lived signed links; and
- least-privilege key handling, so no secret or service-role key is exposed in the app and only the public, publishable key is used in the browser.

No method of storage or transmission is perfectly secure. Please help protect your account by keeping your password confidential, and see Section 7 for the copy of your data held on your own device.

If a data breach occurs that is likely to result in serious harm to you, we will notify you and the relevant regulator, including the Office of the Australian Information Commissioner under Australia's Notifiable Data Breaches scheme, as required by law, and we will tell you what happened, what data was involved, and what we are doing about it. Where the GDPR applies, we will notify the relevant supervisory authority within 72 hours of becoming aware of a qualifying breach, and affected individuals without undue delay.

## 10. Your rights

Depending on where you live, you may have rights to access, correct, export (in a portable form), or delete your personal information, to restrict or object to certain processing, and to withdraw consent. You may also have the right to complain to a data-protection regulator.

**How to exercise your rights, and how to complain.** To exercise any of these rights, or to make a privacy complaint, contact us at support@trackdco.app. We will acknowledge a complaint within 5 business days and aim to resolve it within 30 days. If you are not satisfied with our response, in Australia you can complain to the Office of the Australian Information Commissioner (OAIC, oaic.gov.au), and elsewhere to your local data-protection regulator.

**Getting a copy of your data.** The Service does not yet include a self-service export. If you want a copy of your data in a portable, machine-readable form, email support@trackdco.app and we will produce it for you within the time the law allows. A self-service export is planned.

We will honour whatever privacy rights the law of your home country gives you: when you make a request, we will assess it under the law that applies to you and respond as that law requires, even if the right is not listed above. We do not discriminate against you for exercising any privacy right. Because the Service cannot operate without processing the protocol and health-related information you enter, withdrawing your consent to that processing means closing your account. We will explain this to you before acting on such a request.

## 11. International data transfers

Your account and health data are stored in Australia, in Supabase's Sydney region. The Service is offered worldwide, and some of our providers are companies outside the country you live in, so other information we hold, such as billing records and server logs, may be stored or processed outside it. If you sign in with Google, turn on reminders, or reach the payment screen, limited information also passes through the providers described in Section 5.

- For disclosures from Australia, we take reasonable steps to ensure overseas recipients handle your information consistently with the Australian Privacy Principles (APP 8).
- Where UK or EU law applies to a transfer outside the UK or EEA, we rely on appropriate safeguards such as the standard contractual clauses recognised under UK and EU law (which our providers offer in their data-processing agreements) or an applicable adequacy decision.
- Copies of the relevant safeguards are available on request at support@trackdco.app.

## 12. Children

Trackd is for adults only. The Service is not directed to anyone under 18, and we do not knowingly collect personal information from minors. If we learn we have, we will delete it.

## 13. Cookies and browser storage

We use only cookies that are strictly necessary or functional. We do not use analytics or advertising cookies.

- **Session cookies** set by Supabase, which keep you signed in.
- **A notice cookie** set when we show you a one-time notice about changes to our plans or terms. It records that the notice was displayed in that browser, so we do not show it to you again. It holds no information about you beyond that, it is not used for analytics or tracking of any kind, and it lasts up to a year. We record your acceptance of our documents separately on our servers; this cookie only stops the notice reappearing in this browser.
- **A trial-banner cookie** which remembers that you have dismissed the trial reminder banner. It lasts up to a month.
- **A one-shot cookie** set after sign-in that tells the app to offer you the "Add to Home Screen" prompt once, and is deleted the first time it is read.

We also use your browser's storage: for the working copy of your data described in Section 7; for small preference flags, such as a dismissed prompt or a calculator setting you chose; and, while a retention offer is open, a short-lived entry that remembers the offer for the tab you have open. Our service worker caches one static image.

If any of this changes, we will update this section and seek consent where required.

## 14. EU and UK users (GDPR)

If you are in the European Economic Area or the United Kingdom, the GDPR and UK GDPR give you the rights set out in Section 10, and in particular: the right of access to your data; the rights to rectification and erasure; the right to restrict or object to processing; the right to data portability; and the right to withdraw consent at any time without affecting processing carried out before withdrawal. Our lawful bases are described in Section 4, and for your health data we rely on your explicit consent under Article 9. You have the right to lodge a complaint with your local supervisory authority. For questions about this policy or our processing, contact us at support@trackdco.app.

## 15. United States users (including California)

Trackd is a consumer self-tracking app. We are not a HIPAA-covered entity or business associate, and HIPAA protections do not apply to the information you enter. Your information is instead protected by this policy and by the consumer-privacy laws that apply to you.

If you are a resident of California or another US state with applicable consumer-privacy laws, you may have rights to know what personal information we collect and how we use it, to access and delete it, to correct it, to limit the use and disclosure of sensitive personal information, and to not be discriminated against for exercising these rights. We do not sell or share your personal information (including as those terms are defined under the CCPA and CPRA), and we do not use your sensitive health-related information for any purpose other than providing the Service to you. To exercise any state-law right, contact us at support@trackdco.app; we will verify your request and respond as the law requires.

## 16. Consumer Health Data (Washington, Nevada, Connecticut, and similar US state laws)

Some US states have consumer-health-data laws, including Washington's My Health My Data Act, Nevada's SB 370, and the Connecticut Data Privacy Act. Where one of those laws applies to you, this section is our consumer health data privacy policy. We also publish it separately, word for word, as our Consumer Health Data Privacy Policy, so that it is easy to find.

**What consumer health data we collect.** Everything you enter about your own health and your own protocols:

- the compounds you record, your doses, injection sites, cycles, and schedules;
- images of bloodwork you upload, and the draw date and notes you add to them;
- body metrics such as bodyweight;
- journal entries, the photos you attach to them, and the markers you record, including side-effect markers;
- progress photos; and
- your date of birth, sex, and goals, from your onboarding answers.

**Where it comes from.** Directly from you, and from the files you choose to upload. We do not buy consumer health data, obtain it from data brokers, or infer it from anything else.

**Why we collect it.** Only to provide the Service to you: to record, organise, compute, and display your own data back to you, and to send the reminders you turn on. We do not read or interpret your bloodwork, we do not assess your protocol, and no one at Trackd reviews what you log.

**How it is shared.** We do not sell your consumer health data. We do not share it for advertising, and we show no advertising in the Service. We disclose it only to the service providers who help us operate the Service, listed in Section 5 of the Privacy Policy, and where we are required to by law (Section 6 of the Privacy Policy). Our payment processor does not receive it, and we do not use an analytics provider.

**Who can see it.** Our systems are built so that your protocol, bloodwork, journal, body-metric, and photo data is readable only by you. Neither founder can read it through the app. In an emergency, or where the law requires it, we may need direct database access to fix a fault or comply with a legal obligation.

**The legal basis.** We collect and process your consumer health data on the basis of the explicit consent you give when you create your account, through a separate consent step distinct from accepting our Terms of Service. We do not collect or share it beyond what is necessary to provide the Service to you without asking you separately.

**Your rights.** You have the right to:

- confirm whether we are processing your consumer health data, access it, and receive a list of everyone we have disclosed it to (the service providers in Section 5 of the Privacy Policy);
- withdraw your consent to our collection and processing of it; and
- have it deleted.

To exercise any of these, use the in-app "Delete my account" control or contact us at support@trackdco.app. When you ask us to delete, we delete your account data and remove your uploaded files as part of processing your request, as soon as reasonably practicable and typically within 30 days. Our service providers do not hold separate copies of your health data, and residual copies age out of our encrypted backups on their normal cycle. Records we must keep by law are listed, with reasons, in Section 8 of the Privacy Policy; none of them contain your health data.

Withdrawing your consent means closing your account, because the Service cannot operate without processing this information. We will explain that to you before acting on your request.

You will never be charged a different price, or given a worse service, for exercising any of these rights.

**How to reach us, and how to complain.** Email support@trackdco.app. We aim to acknowledge complaints within 5 business days and to resolve them within 30 days. If we refuse a request, we will tell you why, and you can ask us to look at it again. If you are still not satisfied, you can complain to your state Attorney General; in Australia, you can complain to the Office of the Australian Information Commissioner at oaic.gov.au.

## 17. Changes to this policy

We may update this Privacy Policy from time to time. If we make material changes, including any change that expands how we collect, use, or share your sensitive data, or that adds a new service provider handling your data, we will take reasonable steps to notify you in advance, in the app and through any other channel we have, and we will update the effective date at the top of this document.

By continuing to use Trackd after we have given you clear notice, you agree to the updated policy.

There is one exception, and it is deliberate. Where a change would expand how we use your health-related data, we will ask for your fresh consent by a specific, affirmative step before it applies to you. Continued use is never treated as consent to a new or expanded use of your health data.

## 18. Contact

For privacy questions, to exercise your rights, or to make a complaint, contact us at support@trackdco.app.
