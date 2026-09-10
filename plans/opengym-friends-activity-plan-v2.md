# openGym — Friends & Workout Sharing
## v2: the lean plan

**Supersedes v1.** Same codebase review, ~⅓ the work. v1 planned a social product; the brief is two user stories.

**The two outcomes, verbatim:**
> 1. I can **invite** friends to see when I have completed a workout, and they can see what I did in that workout.
> 2. I can send a completed workout routine plan to a friend, and they can **add it to their routine**.

---

## 1. Honest verdict on v1

| v1 proposed | Was it in the brief? |
| --- | --- |
| 13 endpoints | No |
| Friend **codes** + rotation + request/accept queue | No — the brief says *invite* |
| Three share levels (`off`/`minimal`/`summary`) | No |
| Live "training now" presence | No — "when I have **completed** a workout" is past tense |
| An **inbox** with per-sender caps, accept/dismiss lifecycle | No |
| Publish-on-finish + offline retry queue | No |
| Blocking, rate limiting, per-event push prefs | No |
| A third zustand store | No |
| `SOCIAL` env flag + config plumbing + docs | No |
| **~26 days** | — |

The architecture review in v1 was right. The *scope* was a product manager's roadmap wearing an engineer's clothes. A senior dev reading it would ask one question that collapses most of it:

> **Why is there an inbox at all? If my friends can already see my workouts, "sending" one is just a button on the thing they're already looking at.**

That question is the whole of this document.

---

## 2. The one design change: **pull, not push**

v1 had two subsystems — a *feed* (I publish cards, you read them) and an *inbox* (I send you a bundle, you accept it). They carry the same data twice.

**v2 has one:** the server derives a friend's recent workouts from the state file it already stores, on read. Outcome 2 becomes a button on the card from outcome 1.

Everything below falls out of that single decision.

| Cut | Because |
| --- | --- |
| `POST /api/social/card` + publish-on-finish + offline queue + retry | Nothing is published. The workout is already on the server via the existing sync (debounced 1.5 s, flushed on `visibilitychange`). |
| Card storage, caps, pruning, feed/reality drift | Derived on read. No second copy to keep in step. |
| The whole inbox: send endpoint, accept/dismiss, pending caps, per-sender limits | There is nothing to send. The routine is fetched when the recipient taps **Add**. |
| Spam / storage-exhaustion mitigations | You can't push anything into someone's account, so there's nothing to flood. |
| Rate limiting | Same reason. |
| "Social data must live outside the synced blob" (v1's headline rule) | The only social state left is a friend list in `db.json`, which is server-owned by construction. The rule is now unnecessary rather than enforced. |

**That is the mark of a right-sized design: the rules you needed stop being rules and start being consequences.**

---

## 3. Four more cuts, each with its justification

**C1 — Invite *links*, not friend codes + a request queue.**
The brief says "invite." An invite link creates the friendship when opened; there is no pending state, no accept screen, no incoming/outgoing lists, no "request accepted" notification.

The token needs **no storage at all** — `server.js` already has a generic HMAC signer used for session cookies:
```js
function sign(payload) { … crypto.createHmac('sha256', SECRET) … }   // api/server.js, already there
const token = sign('inv:' + user.id + ':' + (Date.now() + 7*864e5))
```
Verify → check expiry → add the pair. Reusable for 7 days (invite three gym buddies with one link), zero new crypto, zero rows.

**C2 — No blocking.** Blocking exists to stop strangers reaching you. Nobody can reach you without a link you personally sent. **Remove friend** is the undo, and it's one line.

**C3 — One share level, not three.** The privacy control that matters is *who you invited*. Three levels triples the test matrix, the copy and the support surface for a choice nobody asked for. What must never leak isn't a setting — it's one field (see §5).

**C4 — No new store, no `SOCIAL` env flag.**
`Admin.jsx` is proof a server-fed screen needs nothing but `useState` + `api()` (verified: it imports `useStore` only for `user.name`). Copy that shape.
On the flag: **I'm reversing v1's recommendation.** I argued for an instance-level kill switch on privacy grounds, but the feature is already opt-in twice over — nothing is shared until you send a link *and* someone takes it. The flag costs env parsing, a `/api/config` field, a client gate, docs, and a support question ("why is Friends missing?"). It's ~6 lines to add later *if an operator asks*. Not now.

---

## 4. The design

**Storage — one array in `db.json`** (rewritten by the existing `saveDb()`; friendships change a handful of times ever, so write amplification is a non-issue at this frequency):
```js
db.friends = [ { a: '<uid>', b: '<uid>', since: 0 } ]   // uids sorted, so a pair is unique
```
No new files. No index. No per-user social state.

**Five endpoints** (all session-guarded; the cross-user reads guarded by `areFriends`, mirroring the existing `requireAdmin`):

| Method + path | Returns / does |
| --- | --- |
| `POST /api/friends/invite` | `{ link }` — HMAC token, 7-day expiry, nothing stored |
| `POST /api/friends/accept` | `{ token }` → adds the pair |
| `GET  /api/friends` | friend list **and** their recent redacted workouts, in one call — this *is* the feed |
| `POST /api/friends/remove` | `{ id }` — symmetric |
| `GET  /api/friends/routine?uid=&wid=` | `{ routine, customEx }` for the **Add** button |

`GET /api/friends` reads each friend's `state-<uid>.json` — the pattern `GET /api/admin/user` already uses — takes the last few workouts, redacts, merges by time. Cache `{mtime, cards}` per uid in memory and recompute only when the file changes (~10 lines); on a household instance even that is optional.

**Client — four touch points, no new store:**
- `views/Friends.jsx` — list + feed + invite button (`useState` + `api()`, like `Admin.jsx`)
- `views/Home.jsx` — one card: "2 friends trained this week" → `/friends`
- `sheets.jsx` — invite sheet (reuses the `navigator.share` path already in `exportFile`) and an add-routine confirm that **reuses the existing `PlanImport` sheet**
- `App.jsx` — one route, `/friends`. **No tab-bar change** — the bar is full and the middle Start button is the product's core loop.

**Adding a routine is the function that already exists.** `mergePlan(s, bundle)` in `lib/plan-share.js` already adds routines with fresh IDs, remaps custom exercises, drops unresolvable ones and never overwrites what you have. Outcome 2 is: fetch → wrap in the bundle shape → call it.

---

## 5. The one thing I will not cut

A finished workout record is built here (`sheets.jsx:950`):
```js
{ id, d, start, end, routineId, name, bw, entries: [{ id, sets, topW, target }], prs, vol }
//                                     ^^ the body weight the session was logged at
```

`bw` is the most personal number in the app and it rides along inside every workout. **Redaction is a top-level key whitelist on the server** — drop `bw`, pass the rest — and it gets a `node --test` test asserting `bw` never appears in a response. That's one function, one test, maybe 20 lines total, and it's the difference between a nice feature and a leak. Exercises, sets, reps and loads *are* "what I did in that workout" and are shared; weigh-in history is a separate array and is never touched.

Also kept: 7-day link expiry, remove-friend, and `user.disabled` filtering (one condition — disabled accounts already vanish from presence, feeds should match).

---

## 6. Three chunks a PM can test in a browser

Each is shippable, each is demoable, each has a two-browser script. (v1's "Phase 0 — no user-visible change" was untestable by a PM. That was a smell.)

### Chunk 1 — Invite a friend · ~2 days
Endpoints 1, 2, 4 · `Friends.jsx` list + invite sheet · route + Home entry point.

> **Test:** Sign in as Alice in Chrome, Bob in a private window. Alice → Friends → **Invite a friend** → copy link. Paste into Bob's window. Bob sees "Alice added you." Both lists show the other. Alice taps **Remove** → both lists empty. Reopen the same link after removal → works again (reusable link). Change the system clock past 7 days → link refused.

**Done when:** two accounts on one instance can become friends from a link and un-become them, and an expired or tampered token is refused.

---

### Chunk 2 — See what a friend did · ~3 days
Endpoint 3 · redaction + its test · feed UI · Home card.

> **Test:** Bob completes a workout. Alice opens Friends within ~10 s → sees "Bob · Push A · 45 min · 18 sets" and can expand to the exercises, sets and reps. Open DevTools → Network → `GET /api/friends` → **confirm no `bw` field anywhere in the JSON.** Alice removes Bob → the workout disappears. Sign out Alice, hit `/api/friends` directly → 401.

**Done when:** a completed workout appears in a friend's feed with no body-weight data on the wire, and a non-friend gets nothing.

---

### Chunk 3 — Add their routine · ~2 days
Endpoint 5 · **Add to my plan** on a feed card · confirm sheet.

> **Test:** Alice taps **Add to my plan** on Bob's Push A card → confirm sheet shows "3 routines · 14 exercises" in the same format as the existing plan-file import → confirm → Plan tab shows *Push A* as a new routine, Alice's existing routines untouched, exercise list identical to Bob's. Repeat → a second copy is added, nothing is overwritten (this is `mergePlan`'s existing, already-shipped behaviour).

**Done when:** a friend's completed workout becomes a routine in your plan in two taps, and your existing plan is provably unchanged.

*Edge case, decided:* if Bob has since deleted that routine, **hide the Add button** on that card rather than reconstructing it from the logged sets. Reconstruction is ~15 lines and can be added if it turns out to matter — deleting a routine you trained days ago is rare.

**Total: ~7 days.**

---

## 7. Evidence: v1 vs v2

| | v1 | v2 |
| --- | --- | --- |
| API endpoints | 13 | **5** |
| New server storage | per-user `social-*.json` + code index + card arrays + inboxes | **one array in `db.json`** |
| New server subsystems | publish path, inbox, rate limiter, presence-sharing, caps/pruning | **none** — one derived read |
| New client stores | 1 (`useSocial`) | **0** (`Admin.jsx` pattern) |
| New user-facing settings | share level, live toggle, 3 notification toggles, code rotation | **0** |
| New env config | `SOCIAL`, `SOCIAL_MAX_FRIENDS`, caps | **0** |
| New dependencies | 0 | **0** |
| Reused wholesale | `mergePlan` | `mergePlan`, `sign`/`verifySig`, `Admin.jsx` fetch pattern, `PlanImport` sheet, `navigator.share`, `atomicWrite`, `saveDb` |
| Estimate | ~26 days | **~7 days** |

Every v2 line of new logic is: five route handlers, one redaction whitelist, one friend-pair helper, one screen, one card, two sheets.

---

## 8. Deferred — add only when someone asks for it

Live "training now" (the `presence` map already does this — it's an authorization change whenever you want it) · push notifications on friend activity · share levels · blocking · instance-level `SOCIAL` flag · reactions · groups · leaderboards · cross-instance federation. **None of these are needed for the two outcomes**, and each one is cheaper to add against a shipped, used feature than to design for speculatively now.

CI: the repo has none. A 20-line GitHub Actions workflow running the existing vitest suite plus `node --test api/` is worth adding, but it isn't a blocker for Chunk 1 — **recommended, not gating.**

---

## 9. One small change to the brief, and why

> *"I can **send** a completed workout routine plan to a friend"*

v2 delivers this as **pull**: your friends see your workouts and tap **Add**. Same end state — their plan gains your routine — with no inbox, no accept queue and no way for anyone to put anything into your account.

If you want the directed *nudge* ("oi, try this one"), it's free and needs no server work: the invite sheet's existing `navigator.share` call plus a deep link `#/friends?w=<id>` opens that friend's card straight on the Add button. That's a share-sheet message, not a subsystem.

**If you specifically want push semantics** — an inbox, unread badge, "3 workouts waiting" — that's a genuine product choice, not an implementation detail. It's ~3 extra days (one endpoint, one array, an accept/dismiss lifecycle, and the abuse limits that follow once anyone can write into your account). Worth it *if* the social loop is "coach sends programme to client." Not worth it if it's "mates copying each other's leg day."

**My recommendation: build v2 as written, ship it in a week, and let real usage tell you whether the inbox is missing.**
