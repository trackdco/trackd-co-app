Through each of these prompts complete each one at a time and report back once it's successful. This is a way that I can check/confirm any of these. Do that as well, but mainly we just want to make sure we get all of these other things done. 

1.Compress API responses in transit
“Check whether my API responses are compressed in transit. Enable gzip or brotli compression on the server or edge for JSON and text responses above a small size threshold, and confirm the client negotiates it via Accept-Encoding. Avoid double-compressing already-compressed payloads. Verify response transfer sizes drop significantly and responses still parse correctly on the client.”

2.Batch inserts and updates
“Find code that performs many individual INSERT or UPDATE statements in a loop where a single batched operation would work. Replace them with bulk/batched writes (multi-row inserts, batch updates, or a single statement) inside an appropriate transaction. Chunk very large batches to avoid oversized statements or long locks. Verify write-heavy operations complete far faster with fewer round trips.”

3.Add a circuit breaker for slow deps
“Identify external dependencies whose slowness or failures could cascade into my app, exhausting threads or connections while everyone waits. Add a circuit breaker that trips when a dependency is failing or too slow, fast-failing or serving a fallback until it recovers, with timeouts and limited concurrency to that dependency. Verify that a degraded dependency no longer drags down unrelated parts of the app and recovers cleanly.”

4.Apply optimistic UI updates
“Identify user actions (toggles, adds, edits, deletes) that currently wait for the server response before updating the screen. Make them optimistic: update the UI immediately as if the action succeeded, then reconcile with the server result and roll back gracefully if it fails. Include clear error handling and a visible rollback so users aren't misled. Verify the happy path feels instant and failures restore the correct state.”

5.Cache rendered pages or fragments
“Find server-rendered pages or fragments whose output is identical (or nearly so) across many users and changes infrequently. Cache the rendered output and serve it directly, regenerating on a schedule or on content change, while keeping personalized regions dynamic via holes or client-side hydration. Ensure cache keys account for meaningful variations like locale. Verify these pages serve much faster and rendering load decreases.”


second set of things to do more protection side
	1	Close ORM-level injection vectors
“Review how my ORM or query builder is used and find places where its raw-query, raw-fragment, or dynamic-condition features are fed user input unsafely. Replace unsafe raw fragments with parameterized equivalents, validate any user input used to choose column names, sort fields, or operators against an allowlist, and ensure dynamic filters cannot be manipulated into unintended queries. Summarize the unsafe ORM usage you found and how you fixed it.”

2. Trim over-exposed fields in responses
“Audit my API responses for excessive data exposure, where endpoints return more fields than the client needs. For each endpoint, define an explicit output shape that includes only the fields required, and strip internal flags, security-relevant fields, and other users' data rather than serializing whole database records. Pay special attention to user, account, and nested related objects, and report which endpoints were over-sharing and what you removed.”

3. Prevent server-side request forgery
“Audit any feature where my server fetches a URL or makes a request based on user input — webhooks, link previews, importers, or image fetchers — for server-side request forgery. Validate and restrict the target so it cannot reach internal addresses, the loopback interface, or cloud metadata endpoints, using an allowlist of permitted hosts where possible and blocking redirects to disallowed targets. Confirm the checks survive DNS and redirect tricks, and report each fetch you secured.”

4.Prevent stored XSS in content
“Audit the paths where user-submitted content is saved and later displayed to other users for stored cross-site scripting. Ensure content is validated and sanitized appropriately when stored and consistently encoded when rendered, so a payload saved by one user cannot execute in another user's browser. Check less obvious surfaces too — usernames, file names, notification text, and admin views — and report each stored-content flow you secured.”

5.Configure CORS without dangerous wildcards
“Review my Cross-Origin Resource Sharing configuration for unsafe settings. Replace any wildcard origin — especially when combined with credentials — with an explicit allowlist of trusted origins, allow only the methods and headers actually needed, and never reflect the incoming Origin header back without validating it against the allowlist. Confirm that credentials are only permitted for trusted origins, and explain the final CORS policy you set.”
