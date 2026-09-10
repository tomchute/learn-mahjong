# openGym — Friends & Workout Sharing
## v4 — build plan, verified against the real parent

**Verified against `gitlab.com/DuarteSantos8/opengym` @ `acff803`, v1.3.5, 2026-09-07.**
v1–v3 were written against v1.2.4 as seen through a stale third-party fork. Every claim below
has been re-checked against actual upstream. **This is the one to build.**

> 1. I can **invite** friends to see when I have completed a workout, and they can see what I did in that workout.
> 2. I can send a completed workout routine plan to a friend, and they can **add it to their routine**.

**4 endpoints · 1 array of new stored state · 0 new dependencies · 0 new client stores · ~5 days.**

---

## What re-verification against 1.3.5 changed

**Survived intact** — every primitive the plan leans on is still there, just moved:

| Primitive | v1.2.4 (assumed) | v1.3.5 (verified) |
| --- | --- | --- |
| `sign()` / `verifySig()` | server.js | `api/server.js:252` / `:256` |
| `readState(uid)` | server.js | `api/server.js:80` |
| `presence` Map | server.js | `api/server.js:444` |
| `saveDb()` / `db` shape | server.js | `:73` / `:66` — **still `{users, creds, subs, invites}`, no `friends` key** |
| `mergePlan()` | `lib/plan-share.js` | same, **and now has `plan-share.test.js`** |
| Workout record with `bw` | `sheets.jsx:950` | **`lib/finish-workout.js:49`** (extracted to a pure, tested module) |
| Tab bar | 4 tabs + Start | unchanged — D7 holds |

**Changed, and it matters:**

| # | Finding | Effect |
| --- | --- | --- |
| V1 | **The workout record gained `note` — a free-text session note** — and `routineIds` (plural; multi-routine workouts, MR !102). | A blacklist ("drop `bw`") would have **silently leaked private session notes.** The v3 whitelist catches it for free. `note` is dropped; `routineIds` is kept and Chunk 3 offers each routine. **This is the single strongest argument for the whitelist, and it is now load-bearing rather than theoretical.** |
| V2 | **`api/test/` already exists**, with `"test": "node --test test/*.test.js"` and 16 suites. | The v3 task to introduce a server test harness is **dead work**. Write `api/test/friends.test.js` and it runs. |
| V3 | **CI already exists** (`.gitlab-ci.yml`, `.gitlab/`, `.github/`). | The "recommended, not gating" CI task is **dead work**. |
| V4 | **`api/openapi.yaml` is a hand-written spec with 27 documented paths**, and states: *"if you add a route there, add it here too."* | **New required task.** Four endpoints must be documented. Non-optional — it's a repo rule. |
| V5 | **The app already ships QR rendering and camera scanning**: `<QrCanvas value size />`, `<CameraScan onFound onCancel />`, `scanCode()`, `importCodeFromImage(file)`, with `lean-qr`, `jsqr` and `@capacitor-mlkit/barcode-scanning` already in `package.json`. | **Invite by QR is now cheaper than the copy-paste link v3 planned**, and better: you invite a gym friend by showing them a code to scan, in person, where this actually happens. Link stays as the remote fallback. **Zero new dependencies.** |
| V6 | **Optional features are gated per-profile in the house style**: `{S.checkIn !== false && <Route path="/checkin" …/>}` in `App.jsx:123`. | Adopt it verbatim for `/friends`. Amends D9: still no *env* flag, but a user can hide the feature the same way they hide check-in. ~3 lines. |
| V7 | `api/server.js` is now 1031 lines with `coach/` beside it, plus small pure modules `push-messages.js` and `verify-error.js` each with a test in `api/test/`. | The house layout for this feature is exactly `api/friends.js` (pure) + `api/test/friends.test.js` + routes in `server.js`. |

**Net: ~6 days → ~5.** Two planned tasks were already done upstream; one new one (openapi) appeared; the invite mechanism got better and cheaper.

---

## Design

### Storage — one array in the file the server already writes
```js
db.friends = [ { a: '<uid>', b: '<uid>', since: 0 } ]   // uids sorted, so a pair is unique
```
Verified no collision: `db` is `{users, creds, subs, invites}` at `server.js:66`. Nothing social touches the synced state blob, so a stale device can never roll back a friendship.

### The feed is derived, never published
`GET /api/friends` reads each friend's state via the existing `readState(uid)` (`server.js:80`) — the pattern `GET /api/admin/user` already uses — takes `workouts.slice(-10)`, redacts, merges by time. Nothing is written when a workout finishes; the existing sync already put it on the server.

**Cache:** `Map<uid, {mtime, cards}>`, recomputed only when the state file's mtime changes.

### Four endpoints — and they go in `openapi.yaml` too (V4)
| Method + path | Does |
| --- | --- |
| `POST /api/friends/invite` | → `{ token, link }`. `sign('inv:'+uid+':'+exp)`, 7-day expiry, **nothing stored** |
| `POST /api/friends/accept` | `{ token }` → adds the sorted pair |
| `GET  /api/friends` | → `{ friends:[{id,name}], cards:[…], routines:{ rid:{routine,customEx} } }` — list, feed, and the bundles Add needs, in one call |
| `POST /api/friends/remove` | `{ id }` — symmetric by construction |

### Invite by QR (V5), link as fallback
Alice: **Invite** → `<QrCanvas value={token} />`. Bob: **Scan** → `<CameraScan onFound={accept} />` or `scanCode()` on mobile. Remote friend: the same token as a link, shared through the `navigator.share` path already in `exportFile`. One token, three ways in, no new dependencies.

### Redaction — the one non-negotiable, now with teeth
The record built at `lib/finish-workout.js:49`:
```js
{ id, d, start, end, routineIds, routineId, name, bw, entries, prs,
  ...(allNoProg ? { excludeFromProgression: true } : {}),
  ...(sessionNote ? { note: sessionNote } : {}) }
//     ^^ bw: the body weight the session was logged at
//     ^^ note: free text the user wrote about the session
```
The response is a **top-level key whitelist** — `id, d, start, end, name, routineIds, routineId, entries, prs, vol` — which drops **`bw` and `note`**. Exercises, sets, reps and loads **are** "what I did in that workout" and are shared (D2).

**The test asserts on the response, not the function**, and asserts absence by whitelist: any key not on the list fails. That way the next field someone adds to a workout record fails the test instead of leaking — which is exactly what `note` would have done.

### Files touched
```
api/friends.js             NEW  ~40 lines, PURE: pairKey, areFriends, redactWorkout,
                                parseInvitePayload. Matches push-messages.js / verify-error.js.
api/test/friends.test.js   NEW  runs under the existing `npm test` (V2)
api/server.js              +~80 lines: four handlers + the mtime cache
api/openapi.yaml           +4 paths — repo rule, not optional (V4)
frontend/src/views/Friends.jsx  NEW  useState + api(), like Admin.jsx — no new store
frontend/src/sheets.jsx         +2 sheets: invite (QrCanvas + share) and add-routine
                                (reuses the PlanImport sheet as-is)
frontend/src/App.jsx            +1 gated route, matching App.jsx:123's checkIn pattern (V6)
frontend/src/views/Settings.jsx +1 row
```

---

## Three chunks, each testable in two browser windows

### Chunk 1 — Invite a friend · ~2 days
Endpoints 1, 2, 4 · `api/friends.js` + tests · `Friends.jsx` · invite sheet (QR + link) · gated route · Settings row · openapi entries.

> **Test.** Alice in Chrome, Bob in a private window. Alice → Friends → **Invite** → QR on screen; Bob → **Scan** (or paste the link) → both lists show the other. Alice → **Remove** → both empty. Same code again → works (reusable). Clock +8 days → refused. **Paste Alice's invite token in as her `gymsid` cookie → she is signed out, not signed in.** Alice scans her own code → refused. Scan twice → one friendship. Toggle Friends off in Settings → the route is gone, like check-in.

### Chunk 2 — See what a friend did · ~2 days
Endpoint 3 · redaction + whitelist test · mtime cache · feed UI.

> **Test.** Bob completes a workout **with a session note**. Alice opens Friends → "Bob · Push A · 45 min · 18 sets", expandable to exercises, sets and reps. **DevTools → Network → `GET /api/friends` → search for `bw` and for the note's text. Zero hits.** Alice removes Bob → gone. Signed out → 401. Carol, nobody's friend → empty state, no other user's data in the response. Disable Bob in Admin → he vanishes.

### Chunk 3 — Add their routine · ~1 day
The Add button + confirm sheet. No new endpoint.

> **Test.** Alice taps **Add to my plan** on Bob's card → confirm sheet in the same format as the existing plan-file import → confirm → Plan shows the routine, Alice's existing routines byte-identical. A multi-routine workout (`routineIds` has two) offers both. Tap again → a second copy, nothing overwritten. Bob deletes the routine → button gone, card still reads fine.

**~5 days** for someone who knows this repo; **7–9** meeting it fresh.

---

## Locked decisions

| | Decision | Why |
| --- | --- | --- |
| D1 | **Pull, not push.** No inbox, no send endpoint | Friends already see the workout; "sending" is a button on it. Kills the publish path, accept lifecycle, caps, rate limiting and the whole abuse surface |
| D2 | **One share level.** Loads shared; `bw` and `note` never | The privacy control is *who you invited* |
| D3 | **Invite by QR** (link as fallback), reusable, 7-day expiry, zero stored state | Components already ship (V5). In-person is where gym friendships are made |
| D4 | **No blocking** | Nobody reaches you without a code you showed them. Remove-friend is the undo |
| D5 | **No live presence**, though `presence` is right there | "when I have **completed** a workout" is past tense |
| D6 | **No push notifications** | "See" is satisfied by opening the app |
| D7 | **No Home card, no tab-bar change** | Neither outcome needs it; the bar is full |
| D8 | **Fetch on mount + window focus. No interval.** | A poll loop is a lifecycle to manage |
| D9 | **No env flag. Per-profile visibility toggle in the house style** (V6) | `{S.friends !== false && …}` — the pattern `/checkin` already uses |
| D10 | **Routine deleted → hide the Add button** | Reconstructing from logged sets is a rare case; add it if it matters |
| D11 | **Hidden for guests and in DEMO/MOBILE builds** | Those targets have no backend. A condition, not a flag |
| D12 | **Whitelist, never blacklist, and the test asserts on the response** | `note` proved this: it appeared after the plan was written and a blacklist would have leaked it |

---

## Drift tripwires

| Mid-build thought | Answer |
| --- | --- |
| "`presence` exists, live status is basically free" | **No** (D5). Free to build, not free to own |
| "Feeds auto-refresh; I'll add a 30 s poll" | **No** (D8) |
| "A share-level toggle is one field" | **No** (D2) |
| "Notify them when a friend trains" | **No** (D6) |
| "I'll paginate the feed" | **No.** Last 10 per friend, hard cap, no cursor |
| "`db.friends` deserves a storage layer" | **No.** It's an array; `saveDb()` writes it |
| "Friends should be a tab" | **No** (D7) |
| "The coach could summarise a friend's training" | **No.** Nothing social goes near `coach/`; that's a different feature with a different privacy question |
| "I'll skip the openapi entries and do them at the end" | **No** (V4). The repo rule says same change |
| "I'll cache the feed in localStorage for offline" | **No.** Empty state on no network is honest |

---

## Deferred
Live presence · push on friend activity · share levels · blocking · Home card · reactions · groups · leaderboards · cross-instance federation · offline feed cache.

---

## Still the one thing I'd push back on
v4 delivers outcome 2 as **pull**: friends see your workouts and tap Add. Same end state, no inbox, and no way for anyone to write into your account. If you want push semantics — an inbox, unread badge, "3 workouts waiting" — that's ~3 extra days for the endpoint, the array, the accept/dismiss lifecycle and the abuse limits that necessarily follow. Right for *coach sends programme to client*; wrong for *mates copying each other's leg day*.
