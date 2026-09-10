# openGym — Friends Activity & Workout Sharing
## Codebase review + phased execution plan

**Target repo:** `arvids-unavailable/openGym` (fork of `DuarteSantos8/openGym`, v1.2.4, AGPL-3.0)
**Reviewed at:** commit `c42ba6b`
**Scope:** see friends' training activity; send workouts/routines to each other.

---

# Part 1 — What you're building on

## 1.1 Architecture as it stands

| Layer | Reality |
| --- | --- |
| `api/server.js` | **554 lines, no framework**, raw `node:http`, a hand-rolled route table. Two dependencies total (`@simplewebauthn/server`, `web-push`). |
| Storage | **JSON files on disk.** `data/db.json` holds users/creds/push-subs/invites; each profile's app state is one opaque blob at `data/state-<uid>.json`. No database, no queries, no indexes. |
| Sync | `GET /api/data` / `PUT /api/data` push and pull the **entire state object**, last-write-wins on a client `_ts`. The server never inspects or merges it. |
| Auth | WebAuthn passkeys → HMAC-signed session cookie `gymsid` (`uid:exp:sv`). A `sv` counter gives "sign out everywhere". |
| Identity | A user is `{ id, name, created }`. **No email, no username uniqueness, no rename, no discovery.** |
| Frontend | React 19 + Router + Zustand and nothing else. `src/views` (screens), `src/lib` (pure helpers + vitest), `src/store` (2 zustand stores), `sheets.jsx` (a 60 KB file of bottom-sheet flows). |
| i18n | Dependency-free; **English source strings are the keys**, 12 lazy-loaded locale packs. Untranslated strings fall back to English automatically. |
| Builds | **Three targets**, gated by build-time constants: self-hosted web (has the API), `VITE_DEMO=1` (GitHub Pages, *no backend*, guest mode + seeded data), `VITE_MOBILE=1` (Capacitor APK, *no backend*, file-mirrored local state). |
| CI / server tests | **None.** No `.github/`, no test runner in `api/`. Frontend has 7 vitest files, all over `src/lib`. |

## 1.2 Five things already in the codebase that this feature should stand on

These are the difference between a 3-week build and a 6-week one.

1. **`presence` (server.js ~L225)** — an in-memory `Map` of who is mid-workout, fed by a 20 s client heartbeat to `POST /api/activity`, 70 s TTL, never persisted. It is *already* "who's training right now", built and shipped — it's just wired only to the admin dashboard. Friends' live status is an authorization change, not a new subsystem.
2. **`sendPush(userId, payload)` (server.js ~L64)** — VAPID keys self-generate on first run, subscriptions are stored per user, dead endpoints are pruned on 404/410. Friend notifications are ~5 lines each.
3. **`lib/plan-share.js`** — `buildPlanBundle()` / `parsePlan()` / `mergePlan()`. A versioned (`opengym_plan: 1`), self-contained routine bundle that carries referenced custom exercises, remaps IDs on import, drops unresolvable exercises, and **merges rather than overwrites**. It already exists precisely because people wanted to send routines to friends — over a file. "Send a workout to a friend" is *this payload over the wire instead of a file*. Do not invent a second format.
4. **`views/Admin.jsx`** — the working template for a server-fed, polled, cross-user screen (fetch → state → render, no websockets). Copy the shape.
5. **The admin endpoints** — proof that reading another user's state file server-side is an established, reviewed pattern with a guard function (`requireAdmin`). You need the equivalent `requireFriend`.

## 1.3 The five things that will actually bite you

**A. The state blob is the wrong place for social data.**
`PUT /api/data` is last-write-wins over the whole object. If the friend graph or inbox lives inside `S`, a phone that was offline for a week will silently roll back a friendship or delete a received workout when it syncs. **Social state must live outside the synced blob, in server-owned files, mutated only through purpose-built endpoints.** This is the single most important design decision in the plan.

**B. There is no way to find a person.**
Names aren't unique and aren't verified; there is no email and no rename endpoint. A "search friends by name" box would be both useless and an enumeration leak. The precedent to follow is already in the repo: invite codes, deliberately widened to 64 bits with the comment *"the app has no rate limiting by design (that's the reverse proxy's job)… so the code itself has to be the thing that isn't worth guessing."* **Friend codes/links, not search.**

**C. Two of the three build targets have no server.**
The GitHub Pages demo and the Android APK have no backend at all. Every social surface must be behind the same kind of build-time/config gate as `DEMO` and `MOBILE`, or the demo grows a Friends tab that 404s. Follow the existing convention exactly: `ADMIN_UIDS` and `INVITE_ONLY` both **default off "so a fresh self-hosted instance stays open"** — a new `SOCIAL` flag should default off for the same reason, plus a stronger one: this is the first feature in openGym that shows one person's data to another.

**D. Friends only exist within one instance.**
Self-hosted means your friend is on *their* box, not yours. Same-instance friends (family/household/gym crew sharing one deployment) is a real, common case and is ~3 weeks of work. Cross-instance is federation: identity, transport, key exchange, trust, abuse — a different project. **Ship intra-instance; design the payloads so federation is possible later; don't build it now.**

**E. `saveDb()` rewrites `data/db.json` in full on every call.**
Fine at invite-code frequency. Not fine if an activity feed writes through it. Keep high-frequency social writes in per-user files (`social-<uid>.json`), mirroring the existing `state-<uid>.json` pattern, and let `db.json` hold only the tiny, rarely-written friend-code index.

## 1.4 The scope ambiguity worth settling on day one

"Send workouts to each other" reads two ways:

- **(a) Send a routine** — "here's my push day, try it." Actionable, reuses `plan-share.js` wholesale, merges into the recipient's plan.
- **(b) Send a completed session** — "look what I just lifted." That's a *feed post*, not a transfer; there's nothing for the recipient to do with it except read it.

**Recommendation, assumed throughout this plan:** v1 does **(a)** as the send feature, and **(b)** falls out of the activity feed for free — with a **"save this session as a routine"** action on a feed card as the bridge between them. That gives you one payload format, one accept flow, and no dead-end "received" objects. Flagged in Open Questions if you want it the other way.

---

# Part 2 — Target design

## 2.1 Data model

**New server file per user — `data/social-<uid>.json`** (never touched by `PUT /api/data`):

```jsonc
{
  "code": "7F3A9C21D4E80B65",      // 64-bit hex friend code, rotatable
  "friends":  [ { "id": "<uid>", "since": 1730000000000 } ],
  "requests": { "in":  [ { "from": "<uid>", "at": 0 } ],
                "out": [ { "to":   "<uid>", "at": 0 } ] },
  "blocked":  [ "<uid>" ],
  "share":    { "feed": "summary", "live": true, "notify": { "req": true, "recv": true, "done": false } },
  "cards":    [ /* my last 30 activity cards, newest last */ ],
  "inbox":    [ { "id": "...", "from": "<uid>", "at": 0, "kind": "routine", "bundle": { /* plan bundle */ } } ]
}
```

**Index in `db.json`** (small, rarely written): `db.codes = { "<CODE>": "<uid>" }`.

**Activity card** — built client-side on workout finish, redacted by share level, then published:

```jsonc
{ "id": "w_...", "at": 1730000000000, "d": "2026-09-10",
  "name": "Push A", "emoji": "🏋️",
  "dur": 3480, "sets": 18,          // 'minimal' stops here
  "vol": 12450, "prs": 2, "top": ["Bench Press", "Overhead Press"] }   // 'summary' adds these
```

**Share levels:** `off` (nothing leaves the device) · `minimal` (that you trained, what it was called, how long, set count) · `summary` (adds volume, PR count, top exercises).
**Never shared at any level: body weight, weigh-in history, per-set loads, effort ratings, goals.** Body weight is the most personal number in the app and is the one thing a gym-social feature must not leak. Bake this into a pure, unit-tested redaction function so it can't drift.

## 2.2 API surface (all session-guarded; all 404 when `SOCIAL` is off)

| Method + path | Purpose |
| --- | --- |
| `GET  /api/social/me` | my code, share settings, counts (friends / pending / inbox) |
| `POST /api/social/code/rotate` | new code; old one stops working immediately |
| `POST /api/social/request` | `{ code }` → outgoing request |
| `POST /api/social/respond` | `{ from, accept }` |
| `POST /api/social/unfriend` | `{ id }` — symmetric removal |
| `POST /api/social/block` | `{ id }` — removes + blocks future requests |
| `GET  /api/social/friends` | friends: name, live presence (if permitted), latest card |
| `GET  /api/social/feed?since=` | merged, time-ordered cards from friends |
| `POST /api/social/card` | publish my card (called once on workout finish) |
| `PUT  /api/social/share` | share level, live toggle, per-event notification prefs |
| `POST /api/social/send` | `{ to, bundle }` — routine bundle into their inbox |
| `GET  /api/social/inbox` | pending received bundles |
| `POST /api/social/inbox/ack` | `{ id, action: "accept" \| "dismiss" }` |

Extend `GET /api/config` with `social: <bool>` so the client can gate before sign-in.

## 2.3 Client surface

- `src/lib/social.js` — **pure** helpers: `cardFromWorkout(w, S)`, `redactCard(card, level)`, `routineBundle(S, routineId)`, `feedLine(card, unit)`. + `social.test.js`.
- `src/store/useSocial.js` — third zustand store: friends, feed, inbox, poll lifecycle. Kept out of `useStore` so the synced blob stays untouched.
- `src/views/Friends.jsx` — the feed + friend list + requests. New route `/friends`.
- `sheets.jsx` — add-friend sheet (code + QR-free copy/share link), send-to-friend picker, inbox accept sheet (reuses the existing `PlanImport` shape).
- `views/Home.jsx` — a compact "Friends" card: who's training now, latest activity, inbox badge.
- `views/Settings.jsx` — Friends section: share level, live toggle, notifications, code rotation, block list.
- `components/Icon.jsx` — 2–3 new glyphs (the app uses a hand-drawn icon set, **not emoji** — match it).

**Tab bar placement:** the bar is full (Home · Plan · Start · Stats · Exercises) and the middle Start button is the product's core loop. **Don't touch it.** Enter `/friends` from the Home card and from Settings. Revisit only if the feature earns it.

---

# Part 3 — Phased execution plan

Sizes: **S** ≈ ½–1 day · **M** ≈ 1–3 days · **L** ≈ 3–5 days (one developer, familiar with the repo).
Every phase ends shippable and off by default until Phase 6.

---

## Phase 0 — Foundations (no user-visible change)
**Goal:** the flag, the storage layer, and a server test harness exist; nothing else changes.
**Size: M · Depends on: —**

| ID | Task | Files | Size |
| --- | --- | --- | --- |
| P0-T1 | Write `docs/SOCIAL.md`: intra-instance only, opt-in, what a friend can and cannot see, why social state sits outside the synced blob. This is the contract the rest of the plan is checked against. | `docs/SOCIAL.md` | S |
| P0-T2 | `SOCIAL` env flag (default **off**), parsed like `INVITE_ONLY`; surface as `social` in `GET /api/config`; document in `.env.example` + `docs/SELF_HOSTING.md`. | `api/server.js`, `docs/` | S |
| P0-T3 | `api/social.js`: read/write `social-<uid>.json` via the existing `atomicWrite`, defaulted shape, code generation (`crypto.randomBytes(8).toString('hex')` — matches the invite-code precedent), code→uid index in `db.json`, caps enforcement. **Pure logic separated from file I/O.** | `api/social.js` | M |
| P0-T4 | `api/social.test.js` using **`node --test`** (zero new dependencies — respects the "keep it near two deps" rule); add `"test": "node --test"` to `api/package.json`. | `api/social.test.js`, `api/package.json` | S |
| P0-T5 | GitHub Actions workflow: `frontend/npm test` + `api/npm test` on PR. The repo currently has no CI; a feature that exposes one user's data to another shouldn't be the first thing merged without it. | `.github/workflows/ci.yml` | S |

**Acceptance:** `SOCIAL` unset → `/api/config` returns `social:false`, no new routes resolve, every existing flow behaves identically. `npm test` green in both packages in CI.

---

## Phase 1 — The friend graph
**Goal:** two people on one instance can become friends, and un-become them.
**Size: L · Depends on: Phase 0**

| ID | Task | Notes | Size |
| --- | --- | --- | --- |
| P1-T1 | Endpoints: `me`, `code/rotate`, `request`, `respond`, `unfriend`, `block`. | Every handler: session → `SOCIAL` gate → validate → mutate → save. | M |
| P1-T2 | `requireFriend(a, b)` guard, used by **every** later endpoint that returns another user's data. Mirror `requireAdmin`'s shape. | The single most security-critical function in the feature. | S |
| P1-T3 | Rate limiting for `request` + `send`: in-process token bucket keyed by uid (a `Map`, ~15 lines, no dependency). The repo delegates rate limiting to the reverse proxy, but *per-account* abuse limits can't live there. | | S |
| P1-T4 | Blocked-user and `user.disabled` enforcement at every read/write path. Disabled accounts must vanish from friend lists at once (`presence.delete` already does this for live). | | S |
| P1-T5 | `useSocial.js` store + `/friends` route + `Friends.jsx` with friend list, incoming/outgoing requests, empty state. | | M |
| P1-T6 | Add-friend sheet: show my code, copy button, `navigator.share` on mobile, paste-a-code field. Deep link `#/friends?add=<CODE>` prefilling the confirm step. | Reuse `MOBILE` share path from `exportFile`. | M |
| P1-T7 | Settings → Friends section: code, rotate, block list, "leave all" (removes every friendship). | | S |
| P1-T8 | Server tests: request→accept happy path; self-request rejected; duplicate request idempotent; unknown code returns a *generic* error (no "that user exists" oracle); blocked requester rejected; unfriend is symmetric; rotate invalidates the old code. | | M |

**Acceptance:** two profiles on one instance can add each other by code and remove each other; an unknown/rotated code is indistinguishable from a valid-but-blocked one; nothing about the friend graph passes through `PUT /api/data`; friend state survives a stale client syncing an old blob.

---

## Phase 2 — Activity feed
**Goal:** see what friends have been training, and who's training right now.
**Size: L · Depends on: Phase 1**

| ID | Task | Notes | Size |
| --- | --- | --- | --- |
| P2-T1 | `lib/social.js`: `cardFromWorkout()` + `redactCard()`, with tests asserting **body weight, per-set loads, weigh-ins and effort ratings never appear at any share level**. Per CONTRIBUTING, this is exactly the "gets a unit test" category. | Write the test first. | M |
| P2-T2 | `POST /api/social/card` — validate shape server-side (whitelist keys, don't trust the client to have redacted), append, cap at 30, drop older. | Server-side whitelist is the backstop for a modified client. | S |
| P2-T3 | Publish on workout finish: one call at the end of `doFinishWorkout()` in `sheets.jsx`, fire-and-forget, queued in `localStorage` and retried on next boot if offline. Skipped entirely at share level `off`. | Must never block or fail the finish flow. | M |
| P2-T4 | `GET /api/social/feed?since=` — merge friends' cards, newest first, cap ~60, filter blocked/disabled, honour each *author's* share level at read time (so lowering your level retroactively hides detail). | | M |
| P2-T5 | Extend presence to friends: `livePresence(uid)` exposed via `GET /api/social/friends` when that user's `share.live` is on. Optionally coarsen it ("training · 25 min in") rather than exposing exercise-by-exercise progress to peers the way the admin view does. | Zero new infrastructure. | S |
| P2-T6 | `Friends.jsx` feed UI: live-now row at top, day-grouped cards, relative timestamps (`rel()` in `Admin.jsx` is the pattern), pull-to-refresh + poll on focus (~60 s; no websockets). | | L |
| P2-T7 | Home card: "2 friends trained today", live dot, tap → `/friends`. Hidden when `social` off, guest, demo, mobile, or zero friends. | | M |
| P2-T8 | Share-level control in Settings with **plain-language copy** stating exactly what each level shares. Default for a new friend graph: `minimal`. | Privacy is the product's pitch; the copy is part of the feature. | S |

**Acceptance:** A finishes a workout → appears in B's feed within one poll; A at `off` publishes nothing; a card in transit contains no body-weight or per-set data (assert on the wire, not just in the UI); feed loads offline from cache; `share.live=false` removes A from B's live row.

---

## Phase 3 — Send a workout to a friend
**Goal:** the transfer, reusing the plan-share format end to end.
**Size: M · Depends on: Phase 1 (Phase 2 not required)**

| ID | Task | Notes | Size |
| --- | --- | --- | --- |
| P3-T1 | `routineBundle(S, routineId)` in `lib/social.js` — a **single-routine** `buildPlanBundle`, same `opengym_plan` envelope, same custom-exercise inclusion, no `week`. Refactor `plan-share.js` to share the per-routine path rather than duplicating `cleanEx`. | Keeps one format for file *and* wire. | S |
| P3-T2 | `POST /api/social/send` — friendship required, bundle re-validated server-side (envelope version, byte cap ~256 KB, routine/exercise count caps), inbox capped (~20 total, ~3 pending per sender to stop spam). | The 5 MB body cap is far too generous here. | M |
| P3-T3 | `GET /api/social/inbox` + `POST /api/social/inbox/ack`. **Accept is a client-side `mergePlan` on the recipient's own state** — the server never edits a user's state file. Non-negotiable: a friend must never be able to write into your training data without a tap. | | M |
| P3-T4 | Send UI: "Send to a friend" in the existing `PlanTools` sheet and on a routine row in `Plan`/`RoutineEdit`; friend picker; confirmation toast. | | M |
| P3-T5 | Receive UI: inbox badge on Home + Friends; accept sheet reusing `PlanImport`'s exact presentation (routine count, exercise count, dropped-exercise warning), plus "from <name>". | The dropped-exercise path already exists — inherit it. | M |
| P3-T6 | "Save as routine" on a feed card (the Phase-2 bridge): asks the sender's app for that session's routine bundle, or reconstructs from the card's exercise list. Gate behind the sender's share level. | Optional if Phase 2 shipped. | M |
| P3-T7 | Tests: bundle round-trips unchanged; oversized/malformed/foreign-format payloads rejected; non-friend send rejected; accept merges without touching existing routines (reuse `mergePlan` guarantees); dismiss deletes. | | M |

**Acceptance:** A sends a routine → B sees it in the inbox → accepts → it appears as a *new* routine with fresh IDs, B's existing plan untouched; a non-friend or blocked sender gets 403; a hand-crafted 4 MB payload is rejected before it's stored.

---

## Phase 4 — Notifications & offline behaviour
**Goal:** it works when the app is closed and when the network isn't there.
**Size: M · Depends on: Phases 2–3**

| ID | Task | Size |
| --- | --- | --- |
| P4-T1 | Push on: friend request received, request accepted, workout received. Reuse `sendPush`; distinct `tag` per kind so they replace rather than stack. | S |
| P4-T2 | Optional (default **off**) "friend finished a workout" push, with a per-user daily cap so a 5-friend instance doesn't buzz all evening. | S |
| P4-T3 | Per-event notification toggles in Settings, stored in `share.notify`. | S |
| P4-T4 | Service-worker click handling routes to `/friends` or the inbox. | S |
| P4-T5 | Offline: feed + friend list cached in `localStorage`; card publish and send queued and retried on reconnect (the `gym_dirty` flag is the existing pattern to copy). | M |
| P4-T6 | Poll lifecycle: poll only when the Friends screen or Home card is mounted and the tab is visible; stop during an active workout so the session screen stays cheap. | S |

**Acceptance:** a request arrives as a push with the app closed; tapping it opens the right screen; a send made in airplane mode leaves on reconnect exactly once; no polling while a workout is running.

---

## Phase 5 — Trust, safety, operator controls
**Goal:** safe to run on an instance with more than a household on it.
**Size: M · Depends on: Phases 1–4**

| ID | Task | Size |
| --- | --- | --- |
| P5-T1 | **Adversarial pass** over every social endpoint: IDOR (can I read a non-friend's cards by guessing a uid?), code enumeration timing, missing `requireFriend`, payload injection into `mergePlan`, inbox as a storage-exhaustion vector. Write a test per finding. | M |
| P5-T2 | Account lifecycle: disabling a user drops them from friends' feeds and live rows; deleting/purging a user removes them from every peer's `social-*.json`. Add a small maintenance sweep. | M |
| P5-T3 | JSON export/import (the "yours to keep" promise) includes friends + inbox, and a re-import doesn't resurrect dead friendships. | S |
| P5-T4 | Admin dashboard: friend-count column, ability to disable social per user. Keep it English-only, matching the existing deliberate choice. | S |
| P5-T5 | Caps as config: `SOCIAL_MAX_FRIENDS` (default ~50), inbox and card caps, all documented. | S |
| P5-T6 | Security review checklist appended to `docs/SOCIAL.md`; update `SECURITY.md` if the threat model changed (it has — the app now has cross-user reads). | S |

**Acceptance:** every social endpoint has a negative test proving a non-friend gets nothing; disabling an account removes them from peers within one poll; a full export/import cycle preserves the friend graph without zombies.

---

## Phase 6 — Ship it
**Goal:** on by default where it should be, documented, demoable.
**Size: S–M · Depends on: Phase 5**

| ID | Task | Size |
| --- | --- | --- |
| P6-T1 | Decide the default: **recommend `SOCIAL` still defaults off**, with a one-line prompt in Settings for the instance owner. A self-hosted app whose pitch is "no account on someone else's server" should not grow cross-user visibility silently on upgrade. | S |
| P6-T2 | English strings audited through `t()`; add the ~60 new keys to the 12 locale packs (English fallback means this can land as a follow-up without blocking). | M |
| P6-T3 | README feature bullet, `docs/SOCIAL.md` linked, CHANGELOG entry in the house voice. | S |
| P6-T4 | Demo build: seeded fake friends + feed so the GitHub Pages shop window shows the feature (client-only, `DEMO`-gated, like `demoSeed.js`). | M |
| P6-T5 | Mobile build: the whole surface folds away behind `MOBILE` (no backend exists there) — verify the APK builds and shows no dead entry points. | S |
| P6-T6 | Manual pass per CONTRIBUTING: click the full workout flow with a friend live, on a phone, in two languages. | S |

---

## Phase 7 — Deliberately deferred

Sketch these in `docs/SOCIAL.md` so the door stays open; don't build them now.

- **Cross-instance friends (federation).** The real prize for a self-hosted app and a project in itself: instance discovery, transport, key exchange, spam and trust. The Phase-3 bundle format is already the payload it would use.
- **Challenges & leaderboards** — weekly volume/streak comparison among friends. Easy on top of Phase 2, but it changes the product's tone; decide deliberately.
- **Reactions / comments** — a 💪 on a feed card is cheap; comments are moderation, and moderation is a product.
- **Groups / clubs** — n-way sharing rather than pairwise.

---

# Part 4 — Risks and decisions register

| # | Risk / decision | Resolution baked into the plan |
| --- | --- | --- |
| R1 | Social data clobbered by last-write-wins blob sync | Social state lives in `social-<uid>.json`, server-owned, never in `PUT /api/data` (Phase 0) |
| R2 | No way to find people; names non-unique and unverified | 64-bit friend codes + share links, no name search, generic errors (Phase 1) |
| R3 | Body weight or per-set data leaking to peers | Unit-tested `redactCard()` + server-side key whitelist; never shared at any level (Phase 2) |
| R4 | A friend writing into your training data | Inbox + explicit accept; server never mutates a user's state file (Phase 3) |
| R5 | `db.json` full-rewrite amplification | Per-user social files; `db.json` holds only the code index (Phase 0) |
| R6 | Demo/mobile builds growing a broken Friends tab | Gate at config + `DEMO`/`MOBILE`, verified in Phase 6 |
| R7 | Spam / storage exhaustion via sends | Rate limits, inbox caps, per-sender pending cap, byte cap (Phases 1, 3) |
| R8 | Dependency creep (express, a DB, socket.io) | Raw `node:http` handlers, `node --test`, polling not websockets, zero new deps — matches CONTRIBUTING |
| R9 | No CI or server tests today | CI + `api/` test harness land in Phase 0, before any cross-user code |
| R10 | Permanent fork burden vs. upstream | This fork is one squashed commit off `DuarteSantos8/openGym`. Keep the work as a clean, rebasable feature branch and float the design in upstream Discussions → Ideas early — a feature this size is much cheaper merged than maintained apart |
| D1 | Same-instance only for v1 | **Decided: yes.** Federation deferred to Phase 7 |
| D2 | "Send a workout" = send a routine | **Decided: yes**, completed sessions surface as feed cards with "save as routine" |
| D3 | Tab bar placement | **Decided: no new tab.** Entry from Home card + Settings |
| D4 | Default share level | **Decided: `minimal`**, `SOCIAL` off by default at the instance level |

---

# Part 5 — Sequencing and effort

```
Phase 0  Foundations        ██          ~3 d   (blocking — do not skip P0-T5, CI)
Phase 1  Friend graph       █████       ~5 d
Phase 2  Activity feed      ██████      ~6 d   ──┐ P2 and P3 are independent
Phase 3  Send a workout     ████        ~4 d   ──┘ after P1; parallelizable
Phase 4  Notifications      ███         ~3 d
Phase 5  Trust & safety     ███         ~3 d
Phase 6  Ship               ██          ~2 d
                                        ─────
                                        ~26 d serial · ~22 d with P2‖P3
```

**Thinnest end-to-end slice, if you want something demoable fastest:** P0 → P1 (T1–T6) → P3. That's "add a friend by code, send them a routine, they accept it" in roughly 10 days, with no feed at all. The feed is the bigger, more visible half, but the send is the half that reuses the most existing code.

---

# Part 6 — Open questions for the owner

1. **Who is the instance for?** A household of 3 or a gym club of 40? Everything in Phase 5 (caps, moderation, admin controls) scales with the answer; below ~10 users, most of it is optional.
2. **Confirm D2** — is "send workouts" the routine transfer described here, or did you mean sharing completed sessions as posts? The plan assumes the former plus feed cards.
3. **Should friends see live workout progress** (exercise 3 of 6, 12 sets in — what the admin view shows today), or just "training now"? The infrastructure supports either; the plan assumes the coarser one.
4. **Upstream or fork?** If there's any intent to contribute this back, open a Discussions → Ideas thread before Phase 1 — the maintainer's view on defaults, dependency budget and privacy posture will shape Phases 0 and 6 more than anything in this document.
