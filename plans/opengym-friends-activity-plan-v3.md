# openGym — Friends & Workout Sharing
## v3 — the build plan (final)

**Status:** locked. v1 and v2 are kept in `plans/` as the reasoning trail; **this is the one to build.**

**The two outcomes, and nothing else:**
> 1. I can **invite** friends to see when I have completed a workout, and they can see what I did in that workout.
> 2. I can send a completed workout routine plan to a friend, and they can **add it to their routine**.

**4 endpoints · 1 array of new stored state · 0 new dependencies · 0 new client stores · ~6 days.**

---

## What the third review changed

| # | Finding | Fix |
| --- | --- | --- |
| F1 | **Token confusion.** v2's invite token is `sign('inv:'+uid+':'+exp)` using the *same HMAC secret as the session cookie*. Replayed as a cookie it parses as `uid='inv'`, finds no user, and is rejected — **safe by accident, not by design.** One future change to either payload format breaks that. | Explicit domain separation: invite verify requires exactly 3 parts with a literal `inv` head; session verify rejects any payload whose first field isn't a known uid (already true, now asserted). **Two tests, both directions.** |
| F2 | **Endpoint 5 was redundant** (`GET /api/friends/routine?uid=&wid=`). The feed response can carry the routine bundles for the workouts it returns, deduped by routine id. | **4 endpoints, not 5.** The Add button needs no second fetch — and the `uid`/`wid` query params, an IDOR surface, stop existing. Chunk 3 drops from 2 days to ~1. |
| F3 | **A hedge is drift bait.** v2 said the feed's mtime cache was "optional on a household instance". Either it's in the design or it isn't. | It's in. ~10 lines, not optional. |
| F4 | **The Home card was scope creep.** Neither outcome requires it, and Home is the app's most-loved screen. | Cut to deferred. Entry point is one row in Settings. |

Also cut on review: the `lib/social.js` client helper file — `fmtDur`, `fmtVol` (`format.js`) and `setsDone`, `workoutVolume` (`history.js`) already do everything a feed card needs. **The client is one view and two sheets.**

---

## Design

### Storage — one array, in the file the server already writes
```js
db.friends = [ { a: '<uid>', b: '<uid>', since: 0 } ]   // uids sorted, so a pair is unique
```
No new files, no per-user social state, no index. Friendships change a handful of times ever, so `saveDb()`'s full rewrite is a non-issue at this frequency. **Nothing social touches the synced state blob**, so a stale device can never roll back a friendship.

### The feed is derived, never published
`GET /api/friends` reads each friend's `state-<uid>.json` — the pattern `GET /api/admin/user` already uses — via the existing `readState(uid)` helper, takes `workouts.slice(-10)`, redacts, merges by time. Nothing is written when a workout finishes; the existing sync (debounced 1.5 s, flushed on `visibilitychange`) has already put it on the server.

**Cache:** `Map<uid, {mtime, cards}>`, recomputed only when the state file's mtime changes. State files change only on sync, so the steady-state cost of a poll is a `statSync`.

### Four endpoints
All session-guarded. The one cross-user read is guarded by `areFriends(a, b)`, mirroring the existing `requireAdmin`.

| Method + path | Does |
| --- | --- |
| `POST /api/friends/invite` | → `{ link }`. Token is `sign('inv:'+uid+':'+exp)`, 7-day expiry, **nothing stored** |
| `POST /api/friends/accept` | `{ token }` → adds the sorted pair |
| `GET  /api/friends` | → `{ friends:[{id,name}], cards:[…], routines:{ rid:{routine,customEx} } }` — list **and** feed **and** the bundles Add needs, one call |
| `POST /api/friends/remove` | `{ id }` — symmetric by construction (it's one row in a pair array) |

### Redaction — the one non-negotiable
A finished workout record (`sheets.jsx:950`) is:
```js
{ id, d, start, end, routineId, name, bw, entries:[{id,sets,topW,target}], prs, vol }
//                                    ^^ the body weight the session was logged at
```
The response is a **top-level key whitelist** — `id, d, start, end, name, routineId, entries, prs, vol` — which drops `bw`. Weigh-in history is a separate array and is never read. Exercises, sets, reps and loads **are** "what I did in that workout" and are shared (D2).

### Files touched
```
api/social.js        NEW  ~40 lines, PURE only: pairKey, areFriends, redactWorkout,
                          parseInvitePayload.  No I/O, no crypto — so it's trivially testable.
api/social.test.js   NEW  node --test (built into Node, zero deps, zero config)
api/server.js        +~80 lines: four handlers + the mtime cache
frontend/src/views/Friends.jsx   NEW  useState + api(), exactly like Admin.jsx — no new store
frontend/src/sheets.jsx          +2 sheets: invite (reuses the navigator.share path already in
                                 exportFile) and add-routine (reuses the PlanImport sheet as-is)
frontend/src/App.jsx             +1 route: /friends
frontend/src/views/Settings.jsx  +1 row: Friends
```
`mergePlan()` in `lib/plan-share.js` — which already adds routines with fresh ids, remaps custom exercises, drops unresolvable ones and never overwrites — is **outcome 2's entire implementation.**

---

## Three chunks, each testable in two browser windows

### Chunk 1 — Invite a friend · ~2 days
Endpoints 1, 2, 4 · `api/social.js` + tests · `Friends.jsx` list · invite sheet · route · Settings row.

> **Test.** Alice in Chrome, Bob in a private window. Alice → Settings → Friends → **Invite** → copy link → paste in Bob's window → Bob sees "Alice added you", both lists show the other. Alice → **Remove** → both lists empty. Reopen the same link → works (reusable). Set the clock +8 days → refused. **Paste Alice's invite token in as her `gymsid` cookie → she is signed out, not signed in** (F1). Alice opens her own invite link → refused. Open it twice → one friendship, not two.

**Done when:** two accounts become friends from a link and un-become them; expired, self-issued, tampered and cross-purpose tokens are all refused, each with a test.

### Chunk 2 — See what a friend did · ~3 days
Endpoint 3 · redaction + whitelist test · mtime cache · feed UI · empty states.

> **Test.** Bob completes a workout. Alice opens Friends → "Bob · Push A · 45 min · 18 sets", expandable to exercises, sets and reps. **DevTools → Network → `GET /api/friends` → search the JSON for `bw`. Zero hits.** Alice removes Bob → gone. Sign out, hit `/api/friends` → 401. Sign in as Carol, who is nobody's friend → empty state, and no other user's data in the response. Disable Bob in Admin → he vanishes from Alice's feed.

**Done when:** a completed workout reaches a friend's feed with no body-weight data on the wire, and a non-friend gets nothing.

### Chunk 3 — Add their routine · ~1 day
The Add button + confirm sheet. No new endpoint (F2).

> **Test.** Alice taps **Add to my plan** on Bob's Push A card → confirm sheet shows "1 routine · 6 exercises" in the same format as the existing plan-file import → confirm → Plan tab shows *Push A*, Alice's existing routines byte-identical, exercise list matching Bob's. Tap again → a second copy, nothing overwritten. Bob deletes the routine → the button is gone from that card, the card still reads fine.

**Done when:** a friend's workout becomes a routine in your plan in two taps, with your existing plan provably unchanged.

**~6 days** for someone who knows this repo; **8–10** for someone meeting it for the first time. That range is the estimate — a single number would get read as a commitment.

---

## Locked decisions — do not relitigate mid-build

| | Decision | Why |
| --- | --- | --- |
| D1 | **Pull, not push.** No inbox, no send endpoint | Friends already see the workout; "sending" is a button on it. Kills the publish path, accept lifecycle, caps, rate limiting and the whole abuse surface at once |
| D2 | **One share level.** Loads shared, `bw` never | The privacy control is *who you invited*. Three levels triple the test matrix for a choice nobody asked for |
| D3 | **Invite links, reusable, 7-day expiry, zero stored state** | The brief says "invite". Reuses the existing `sign()`. One link does the whole gym crew |
| D4 | **No blocking** | Nobody reaches you without a link you sent. Remove-friend is the undo |
| D5 | **No live presence**, though `presence` is right there and does it | "when I have **completed** a workout" is past tense |
| D6 | **No push notifications** | "See" is satisfied by opening the app |
| D7 | **No Home card, no tab-bar change** | Neither outcome needs it; the bar is full and the Start button is the core loop |
| D8 | **Fetch on mount + window focus. No interval.** | A poll loop is a lifecycle to manage. Pull-to-refresh covers the rest |
| D9 | **No `SOCIAL` env flag** | Opt-in twice over already (you send a link, they take it). ~6 lines to add later *if an operator asks* |
| D10 | **Routine deleted → hide the Add button** | Reconstructing from logged sets is ~15 lines for a rare case. Add it if it turns out to matter |
| D11 | **Hidden for guests and in DEMO/MOBILE builds** | Those targets have no backend. `if (!user) return null` — a condition, not a flag |

---

## Drift tripwires

The specific temptations this build will produce, and the pre-agreed answer. **If you want to overturn one, that's a new decision with a new estimate — not a "while I'm in here".**

| Mid-build thought | Answer |
| --- | --- |
| "`presence` already exists, live status is basically free" | **No** (D5). It's free to build and not free to own: a permission question, a coarsening question, a UI that must handle staleness |
| "Feeds auto-refresh; I'll add a 30 s poll" | **No** (D8) |
| "A share-level toggle is one field" | **No** (D2). It's one field plus a settings row plus copy in 12 languages plus a branch in every response |
| "Notify them when a friend trains" | **No** (D6) |
| "I'll paginate the feed" | **No.** Last 10 workouts per friend, hard cap, no cursor |
| "`db.friends` deserves a proper storage layer" | **No.** It's an array. `saveDb()` already writes it |
| "Friends should be a tab" | **No** (D7) |
| "Let me generalise the bundle format for federation later" | **No.** It's already `plan-share`'s format; that *is* the generalisation |
| "I'll cache the feed in localStorage for offline" | **No.** Empty state on no network is correct and honest |

---

## Deferred — cheap to add against a shipped feature, expensive to design for now

Live "training now" · push on friend activity · share levels · blocking · Home card · instance-level flag · reactions · groups · leaderboards · cross-instance federation · offline feed cache.

**CI:** the repo has none. A ~20-line GitHub Actions workflow running the existing vitest suite plus `node --test api/` is worth adding and is **recommended, not gating.**

---

## The one thing I'd still push back on

v3 delivers outcome 2 as **pull**: your friends see your workouts and tap Add. Same end state, no inbox, and no way for anyone to write into your account.

If you want the directed nudge, it costs nothing: the invite sheet's existing `navigator.share` plus a deep link `#/friends?w=<id>` opens that friend's card on the Add button. A share-sheet message, not a subsystem.

If you specifically want **push semantics** — an inbox, an unread badge, "3 workouts waiting" — that is a real product choice, not an implementation detail: ~3 extra days for the endpoint, the array, the accept/dismiss lifecycle, and the abuse limits that necessarily follow once anyone can write into your account. Right for *coach sends programme to client*. Wrong for *mates copying each other's leg day*.

**Ship v3 in a week. Let usage tell you whether the inbox is missing.**
