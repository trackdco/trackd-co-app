# `.well-known`

## `apple-developer-merchantid-domain-association`

Apple Pay domain verification, for Stripe. Apple requires the domain serving an
Apple Pay button to prove it controls itself, and it proves it by serving this
file at exactly

    https://<domain>/.well-known/apple-developer-merchantid-domain-association

**It is not a secret and it is not per-account.** Stripe publishes one file for
every merchant using its Apple Pay integration
(https://stripe.com/files/apple-pay/apple-developer-merchantid-domain-association);
this is a copy of it, committed so the check cannot fail on a deploy where
somebody forgot to upload something.

No extension, and the name is exact — Apple fetches that literal path.

## Why it is here even though Stripe already says "active"

`trackdco.app` is registered on the sandbox account (`pmd_1U1q10Em…`) and reads
`apple_pay: active` — but that object is `livemode: false`, and **test mode does
not actually enforce domain verification**. The live-mode registration does, and
it fails immediately if this file is not already being served. Committing it
means live registration is a single click rather than a deploy cycle.

## Preview deploys

Apple Pay will NOT work on a Vercel preview URL: each deploy gets a new hostname
and every one of them would have to be registered with Stripe separately. Apple
Pay is a production check, or a check against a stable preview alias. **Google
Pay has no such requirement** and works on any HTTPS origin, which makes it the
one to test a preview with.
