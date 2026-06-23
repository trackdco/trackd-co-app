# Push Notifications — Spec (Phase 1: Transport & Subscription)

*Trackd PWA · cross-platform Web Push (Android/Chrome + iOS/Safari). This phase proves the delivery pipeline end-to-end. Reminder scheduling is the next spec.*

---

## 1. Goal

Get a user's device subscribed to Web Push and able to receive a **real** push notification on both Android (Chrome) and an **installed** iPhone PWA. Permission is requested from a Settings toggle and an Onboarding step, both backed by one shared hook. Outcome: tapping "Send test notification" delivers a notification to the user's physical device(s) on both platforms.

---

## 2. Out of Scope

- Do **NOT** build the reminder scheduling engine, `pg_cron`/`pg_net` jobs, or the reminders data model — that is the next spec. Build `send-push` so the scheduler can call it unchanged.
- Do **NOT** implement per-protocol notification preferences, quiet hours, or grouping.
- Do **NOT** add notification action buttons beyond tap-to-open.
- Do **NOT** use the Notification Triggers API or any client-side / local scheduling — it is unreliable and unsupported on iOS.
- Do **NOT** add a second service worker. Extend the existing one.
- Do **NOT** introduce FCM, APNs, or any native push SDK. Web Push + VAPID only.
- Do **NOT** request notification permission on app load or without a user gesture — you get one shot, especially on iOS.
- Do **NOT** add client-side push libraries. The only new dependency is `web-push` (server-side).

---

## 3. Design Decisions

> Context files referenced: `architecture.md`, `code-standards.md`, `ui-context.md`. Confirm conventions against these before writing — do not assume paths or table names.

- **D1 — Transport.** Web Push Protocol signed with VAPID. This is the one universal path that covers Chrome/Android and Safari/iOS (Apple implements the standard for installed PWAs — no Apple Developer cert or APNs setup needed). Single PWA codebase per `architecture.md`.

- **D2 — Server send path.** A Supabase Edge Function `send-push`. Rationale: the Postgres layer (per `architecture.md`) is the Supabase instance, so Edge Functions need no extra infra, and `pg_cron`/`pg_net` are already available for the Phase-2 scheduler. ⚠️ **If that Postgres is not Supabase**, swap the send path to a Node service using the `web-push` library plus a worker scheduler — the client contract and DB schema below stay identical.

- **D3 — Service worker.** Extend the **existing** SW source already handling offline-first sync (per `architecture.md`). It must be the **`injectManifest`** strategy with a custom `src/sw.ts` so the `push` and `notificationclick` handlers survive the build. If the project is currently on `generateSW`, migrate it to `injectManifest`. `push`/`notificationclick` are independent listeners from the sync handlers — no conflict is expected, but verify sync still works after editing.

- **D4 — iOS gate.** iOS only delivers Web Push to a PWA that has been **installed to the Home Screen and launched standalone**. Detect iOS + non-standalone and render an Add-to-Home-Screen prompt instead of a dead permission button. Detection uses the `(display-mode: standalone)` media query **and** legacy `navigator.standalone`; iOS/iPadOS detection uses UA plus the `MacIntel` + `maxTouchPoints > 1` check.

- **D5 — Permission UX.** Two entry points — a **Settings toggle** and an **Onboarding step** — both backed by **one** `usePushNotifications` hook over a single `pushService`. Never request permission outside a user gesture. Handle the `denied` state with re-enable guidance (you cannot re-prompt once denied). Style strictly per `ui-context.md` (Instrument Sans body, JetBrains Mono for any technical labels, amber `#E2A33D` used sparingly under the restraint rule).

- **D6 — Source of truth.** Subscription presence in `push_subscriptions` plus the live `Notification.permission` value are the source of truth for UI state. A `notifications_enabled` flag on the user settings/profile table records *intent*, so toggling off suppresses sends even when OS permission is still granted. **Confirm the exact settings/profile table name against `architecture.md`** — do not assume `profiles` vs `user_settings`.

- **D7 — Reusable send primitive.** `send-push` accepts `{ userId, payload }`, loads that user's subscriptions, sends to each, and prunes dead ones (HTTP 404/410). The Phase-2 scheduler will call this same function — design it that way now.

- **D8 — Build discipline.** Implement and verify each step below before starting the next, per `code-standards.md`.

---

## 4. Implementation

Build in this order. Each step ends with a verification — **do not proceed until it passes.** Match all naming (PascalCase components, camelCase hooks/services) to `code-standards.md`.

### Step 1 — Database: subscription table + intent flag

Create migration `supabase/migrations/<timestamp>_push_subscriptions.sql`:

```sql
create table public.push_subscriptions (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  endpoint    text not null,
  p256dh      text not null,
  auth        text not null,
  user_agent  text,
  created_at  timestamptz not null default now(),
  unique (user_id, endpoint)
);

alter table public.push_subscriptions enable row level security;

create policy "own subscriptions - select"
  on public.push_subscriptions for select using (auth.uid() = user_id);
create policy "own subscriptions - insert"
  on public.push_subscriptions for insert with check (auth.uid() = user_id);
create policy "own subscriptions - delete"
  on public.push_subscriptions for delete using (auth.uid() = user_id);
```

Add `notifications_enabled boolean not null default false` to the existing settings/profile table (confirm its name per **D6**). The `send-push` function reads subscriptions with the service role and is not bound by these RLS policies.

**Verify:** migration applies cleanly; an authenticated user can insert/select/delete only their own rows; the new boolean column exists with the correct default.

### Step 2 — VAPID keys + secrets

Generate a keypair once: `npx web-push generate-vapid-keys`.

- Client env (`.env`): `VITE_VAPID_PUBLIC_KEY` (public key only).
- Supabase secrets: `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` (e.g. `mailto:notifications@trackd.app`).

**Verify:** the public key is readable client-side; the three secrets are set on the Supabase project; the **private key never appears in the client bundle**.

### Step 3 — Service worker handlers

In the existing SW source (`src/sw.ts` per **D3**), add:

```ts
self.addEventListener('push', (event) => {
  const data = event.data?.json() ?? {};
  event.waitUntil(
    self.registration.showNotification(data.title ?? 'Trackd', {
      body: data.body,
      icon: '/icons/icon-192.png',
      badge: '/icons/badge-72.png',
      tag: data.tag,
      data: { url: data.url ?? '/' },
    })
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = event.notification.data?.url ?? '/';
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((wins) => {
      const open = wins.find((w) => w.url.includes(url));
      return open ? open.focus() : self.clients.openWindow(url);
    })
  );
});
```

Confirm `icon`/`badge` asset paths exist in the PWA manifest set; add minimal assets if missing.

**Verify:** the SW builds under `injectManifest`; existing offline-sync behaviour is unchanged (test a sync action); in desktop Chrome DevTools → Application → Service Workers → "Push" test event, a notification appears and clicking it focuses/opens the app.

### Step 4 — Client push service + hook

Create `src/lib/push/pushService.ts` (capability detection, permission, subscribe/unsubscribe, server sync) and `src/hooks/usePushNotifications.ts` (React state over the service). The service must expose, at minimum:

- `getCapability()` → `{ supported, isIOS, isStandalone, permission }`. `supported` = `'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window`.
- `subscribe()` — request permission (must be called from a user gesture), then `registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: <VITE_VAPID_PUBLIC_KEY as Uint8Array> })`, then upsert the subscription (`endpoint`, `keys.p256dh`, `keys.auth`, `navigator.userAgent`) into `push_subscriptions`, then set `notifications_enabled = true`.
- `unsubscribe()` — `subscription.unsubscribe()`, delete the row by `endpoint`, set `notifications_enabled = false`.
- Reuse any existing subscription via `registration.pushManager.getSubscription()` rather than re-subscribing.

Include the `urlBase64ToUint8Array` helper for the VAPID key. The hook reconciles UI state on mount from `Notification.permission` + subscription presence + the stored flag (per **D6**).

**Verify:** on Android Chrome, calling `subscribe()` inserts exactly one row and toggles the flag; `unsubscribe()` removes it; `denied` and unsupported states are surfaced cleanly without throwing.

### Step 5 — UI entry points

Three components, styled per `ui-context.md`:

- `src/components/settings/NotificationsToggle.tsx` — toggle reflecting live state; off→on calls `subscribe()`, on→off calls `unsubscribe()`; when `permission === 'denied'`, show re-enable instructions instead of an active toggle.
- `src/components/onboarding/EnableNotificationsStep.tsx` — primes the user, then a button triggers `subscribe()` on tap; skippable.
- `src/components/push/AddToHomeScreenPrompt.tsx` — shown by both entry points when `isIOS && !isStandalone`: short "Add to Home Screen" instructions (Share → Add to Home Screen), no permission button.

Both entry points branch on `getCapability()`: iOS-not-installed → `AddToHomeScreenPrompt`; supported → normal flow; unsupported → quiet "not available on this browser" state.

**Verify:** Settings toggle and Onboarding step both drive subscribe/unsubscribe correctly; on **iOS Safari (not installed)** both show the Add-to-Home-Screen prompt rather than a dead button.

### Step 6 — Edge Function `send-push` + test trigger

Create `supabase/functions/send-push/index.ts`:

- Input `{ userId, payload: { title, body, url?, tag? } }`.
- Load the user's rows from `push_subscriptions` (service role).
- Send to each using `import webpush from 'npm:web-push@3.6.7'` with `setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY)`. *(If the Node-crypto path misbehaves in the Edge runtime, fall back to signing the VAPID JWT with `crypto.subtle` and POSTing to the endpoint directly — try `web-push` first.)*
- On a `404`/`410` response for an endpoint, delete that subscription row (cleanup).

Add a **"Send test notification"** affordance in Settings (next to the toggle) that invokes `send-push` for the current user. This is the verification mechanism and a genuinely useful feature — keep it.

**Verify (the proof):** with the toggle on, tapping "Send test notification" delivers a real notification to **a physical Android device** *and* **an installed iPhone PWA**; tapping the notification opens/focuses the app; an expired subscription is pruned from the table.

---

## 5. Check When Done

- [ ] No new UI components beyond `NotificationsToggle`, `EnableNotificationsStep`, `AddToHomeScreenPrompt`, and the test-send button
- [ ] No TypeScript or lint errors
- [ ] Existing offline-sync service-worker behaviour unchanged (verified)
- [ ] Permission is never requested without a user gesture
- [ ] iOS Safari (not installed) shows Add-to-Home-Screen guidance, not a permission button
- [ ] Subscribing inserts exactly one row per device in `push_subscriptions`; unsubscribing deletes it
- [ ] `notifications_enabled` flag tracks intent and suppresses sends when off
- [ ] `send-push` prunes subscriptions returning 404/410
- [ ] A real push is received on a physical Android device **and** an installed iPhone PWA
- [ ] `VAPID_PRIVATE_KEY` exists only in Supabase secrets, never in the client bundle
- [ ] On mount, UI state reconciles with live `Notification.permission` + subscription presence

---

*Next spec (Phase 2): reminders data model + `pg_cron` scheduler that expands scheduled dose/protocol reminders and user-set custom reminders into due-now sends, calling `send-push` unchanged.*