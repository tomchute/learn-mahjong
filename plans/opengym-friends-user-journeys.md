# Friends & workout sharing — user journeys

The two core journeys, end to end, as a human reads them. Companion to
`friends-v4-build-plan.md` (the engineering plan) — this is the *what happens on screen*.

**UI copy below is a draft**, written to be the English i18n keys. Wording is open; the flow,
the states and the edge cases are the specification.

**Cast:** **Alice** and **Bob**, who train at the same gym and use the same self-hosted openGym
instance. Both have a profile and a passkey.

**One limitation to state up front, because it shapes everything:** friends live on the *same
instance*. openGym is self-hosted — Bob having his own server somewhere else is a different
feature (federation, explicitly deferred). If Bob isn't on Alice's instance, he creates a profile
on it first. In practice this is a household, a couple, or a gym crew sharing one box.

---

# Journey A — "Invite a friend, and they see my workouts"

> *I can invite friends to see when I have completed a workout, and they can see what I did in that workout.*

## A1. Alice finds the feature

| | |
| --- | --- |
| **Where** | Settings → **Friends** |
| **Sees** | A row, *"Friends"*, with a count once she has any. Tapping opens `/friends`. |
| **Why here** | The tab bar is full (Home · Plan · **Start** · Stats · Exercises) and the Start button is the core loop. A social feature does not earn a tab before anyone uses it. |

Alice can hide the feature entirely with a **Friends** toggle in Settings — the same per-profile
pattern check-in already uses. Off means the row and the route are simply gone.

## A2. The Friends screen, empty

| | |
| --- | --- |
| **Sees** | *"No friends yet."* — *"Invite someone you train with. You'll see each other's workouts, and can borrow each other's routines."* |
| **Actions** | **Invite a friend** (primary) · **Scan a code** (secondary) |

## A3. Alice invites Bob — in person

Alice taps **Invite a friend**. A sheet opens:

| | |
| --- | --- |
| **Sees** | A **QR code**, filling most of the sheet. Under it: *"Have them scan this in their openGym → Friends → Scan a code."* Below that: *"Expires in 7 days · anyone who scans it can see your workouts"* and a **Share a link instead** button. |
| **Mechanism** | The QR encodes the **invite link** — Alice's instance URL plus a signed token carrying her id and an expiry. Nothing is stored server-side. Encoding the whole link, not a bare token, is what lets a scanner on a *different* server recognise the mismatch and say so (see *Different servers*). |
| **Reusable** | One code works for the whole gym crew until it expires. Alice can show it to three people in a row. |

Bob, standing next to her, opens **Settings → Friends → Scan a code**. The camera opens.

| | |
| --- | --- |
| **Bob sees** | Camera view with a frame. On finding a code: a confirm sheet — *"Add Alice as a friend?"* — *"You'll each see when the other completes a workout, and what was in it. Either of you can remove this at any time."* **Add friend** / **Cancel** |
| **On confirm** | *"Alice added."* Bob lands on the Friends screen with Alice in his list. |
| **Alice** | Sees Bob next time her Friends screen loads (it refreshes when she opens it or returns to the tab). There is no notification — see *What deliberately does not happen*. |

**Friendship is mutual and symmetric.** One action creates it in both directions; there is no
request to approve, no pending state, no inbox.

## A4. Alice invites Bob — remotely

Same sheet, **Share a link instead**. The phone's share sheet opens (WhatsApp, Messages, email —
whatever Bob uses). Bob taps the link, his openGym opens on the same *"Add Alice as a friend?"*
confirm, and the rest is identical. Bob can also scan a **screenshot** of the QR from his photos
if that's easier than a link.

## A5. Bob trains. Alice sees it.

Bob finishes a workout as he always has — nothing about the finish flow changes, no extra step,
no "share this" prompt.

| | |
| --- | --- |
| **When** | Bob's app syncs a second or two after he finishes (and again when he backgrounds the app). Alice sees it **the next time she opens the Friends screen**, or returns to the tab with it open. |
| **Alice sees** | Bob's workout at the top of her feed, grouped under **Today**: <br>**Bob** · *Push A* · **45 min** · **18 sets** · *2 PRs* |
| **Tapping the card** | Expands to what he actually did — each exercise with its sets, reps and weights. *Bench Press — 60 kg × 8, 60 × 8, 62.5 × 6*. |
| **Also on the card** | **Add to my plan** — that's Journey B. |

The feed shows the **last 10 workouts per friend**, newest first, merged across friends and
grouped by day. No pagination, no infinite scroll.

## A6. What Alice can and cannot see

This is the part worth being able to explain to a user in one breath.

| Alice sees | Alice never sees |
| --- | --- |
| That Bob trained, and when | **Bob's body weight** — not the session weigh-in, not his weight history, not his goal |
| The routine name and duration | **Bob's session notes** — anything he wrote about how it went |
| Exercises, sets, reps, weights | Anything from Bob's profile, settings or check-in cards |
| PR count | Anything at all until Bob is her friend |

There is **one visibility level**, not a set of toggles. The control that matters is *who you
invited* — and **Remove friend** is instant and symmetric.

## A7. Alice removes Bob

**Friends → Bob → Remove.** Confirm: *"Remove Bob? You'll stop seeing each other's workouts.
Neither of you keeps anything the other shared."* Both lists empty, both feeds empty, immediately
and in both directions. Alice can invite him again later; nothing is remembered.

---

# Journey B — "Take a friend's routine"

> *I can send a completed workout routine plan to a friend, and they can add it to their routine.*

## B1. Where it starts

Alice is looking at Bob's *Push A* card in her feed (A5). She likes the look of it.

**Note on direction.** In the build, Bob doesn't push a routine at Alice — his workouts are
already visible to her, and she pulls what she wants. The end state is identical (Alice's plan
gains Bob's routine) with no inbox, no pending items, and no way for anyone to write into
someone else's plan. If Bob wants to nudge her — *"try my push day"* — he shares a link to that
card through his phone's share sheet, and it opens on this same screen.

## B2. Alice adds it

| | |
| --- | --- |
| **Taps** | **Add to my plan** on the card |
| **Sees** | A confirm sheet, in the same format openGym already uses for importing a plan file: <br>**Add "Push A"** — *from Bob* <br>*1 routine · 6 exercises* <br>*"This is added as a new routine — nothing you already have is changed."* <br>**Add routine** / **Cancel** |
| **If an exercise doesn't exist on her side** | The existing warning appears: *"1 exercise couldn't be matched and was left out."* (Bob's custom exercises travel with the routine, so this is rare.) |
| **On confirm** | *"Push A added to your plan."* She lands on the **Plan** tab with the new routine in her list. |

## B3. What she got

- A **new routine**, with its own id. Nothing of hers was overwritten, renamed or merged into.
- The exercises, in order, with sets, target reps, and the progression rule Bob set.
- Bob's custom exercises, if the routine used any, added to her library.
- **Not** scheduled onto any weekday — she puts it in her week herself, or trains it ad-hoc.
- **Not** Bob's weights. Her first session prompts for working weight as it would for any new
  routine. She is borrowing his programme, not his numbers.

Adding twice makes two copies. That's the existing plan-import behaviour and it is deliberate:
nothing is ever silently replaced.

## B4. If Bob's workout used two routines

openGym supports multiple routines in one session. The card then offers each one, named, and
Alice picks — or takes both.

## B5. If Bob has since deleted the routine

The **Add to my plan** button isn't on that card. The card still reads normally — she can still
see what he did. (Rebuilding a routine from the logged sets is possible and deliberately left
out until someone asks for it.)

---

# What deliberately does not happen

Worth reading as a list, because each one is a decision rather than an omission:

| | |
| --- | --- |
| **No notification when a friend trains** | Nothing buzzes. You see it when you look. The outcome is *"they can see what I did"*, not *"they are told"*. |
| **No live "training now"** | The server knows — it powers the admin dashboard — and it is deliberately not shown to friends. Both journeys are past-tense. |
| **No inbox, no pending items, no unread badges** | Nobody can put anything into your account. |
| **No friend requests to approve** | One scan, mutual, done. **Remove** is the undo. |
| **No blocking** | Nobody can reach you without a code you showed them. |
| **No likes, comments or reactions** | Not in the outcomes. Comments are moderation, and moderation is a product. |
| **No leaderboards or challenges** | Same. |
| **No feed while offline** | The screen says *"Can't reach the server."* rather than showing a stale cache that might be wrong. |

Each is cheap to add **later, against a shipped feature people are using** — and expensive to
design for speculatively now.

---

# Edge cases, in flow terms

| Situation | What the user gets |
| --- | --- |
| Alice scans her own code | *"That's your own invite code."* Nothing happens. |
| Bob scans the same code twice | Still one friendship. No duplicate, no error. |
| Code is over 7 days old | *"This invite has expired — ask for a new one."* |
| Code is edited or fabricated | *"That code isn't valid."* Indistinguishable from expired, on purpose. |
| Bob is browsing as a guest | *"Create a profile to add friends."* → the existing profile flow. |
| Bob is on a different openGym instance | It cannot work — see **Different servers** below, which is a section rather than a row because it is the most likely surprise. |
| Friend has never trained | *"Bob hasn't logged a workout yet."* |
| Friend's account is disabled by the admin | They disappear from the feed and the friend list. |
| Alice is on the demo site, or the Android app | The feature isn't there at all — neither has a backend to sync through. |
| Alice turns **Friends** off in Settings | The row and the screen disappear. Friendships are untouched and come back when she turns it on. |

---

# Different servers

openGym is self-hosted, so "same instance" is a real constraint and worth being straight about.

## What happens today

Alice's invite link points at **her** server. If Bob has his own openGym, opening it takes him to
Alice's instance, where he has no profile — he'd be asked to create one. Scanning the QR inside
his own app fails verification, because the token is signed with Alice's server secret and his
server has a different one.

Because the QR carries the full link, his app can tell the difference between *"this is for
another openGym"* and *"this code is broken"*, and say the accurate thing:

> **This invite is for another openGym server** — `gym.alice.example`.
> Friends only work between profiles on the same server.
> **Alice can send you her plan as a file instead** →

That last line matters: **it is not a dead end.** Which brings us to the split.

## Half of this already works across servers, today

| Outcome | Same server | Different servers |
| --- | --- | --- |
| **1. See when a friend trained, and what they did** | ✅ the feed | ❌ nothing |
| **2. Take a friend's routine into your plan** | ✅ the Add button | ✅ **already works** — *Export plan file*, send it any way you like, they import it |

openGym has shipped routine sharing across instances since before this feature existed
(`plan-share.js` → **Settings → Share your plan → Export plan file**). It travels over WhatsApp,
email, AirDrop, anything. The friends feature makes that *two taps instead of six* when you share
a server; it does not unlock something otherwise impossible.

So the honest framing: **cross-server costs you the activity feed, not the routine sharing.**

## Why not just build federation

Three reasons, and the first one is fatal on its own:

1. **Most instances aren't reachable.** The quick start is `docker compose up` on
   `localhost:8080`. Real deployments sit on a LAN, behind Tailscale, or on a home box with no
   public DNS and no TLS. Alice's server would need to accept inbound connections from Bob's.
   A perfect protocol still wouldn't work for the majority of users — you'd build it and most
   people couldn't switch it on.
2. **Passkeys are origin-bound.** Auth is `RP_ID`/`ORIGIN`-scoped by design, so Bob's browser
   session means nothing to Alice's server. Every call has to be server-to-server with a
   long-lived bearer capability — which then needs revocation, so the invite token stops being
   free (`sign()` with nothing stored) and starts needing a token store.
3. **It inverts the product's promise.** Solving reachability with a central relay — the only
   approach that works for people behind NAT — puts everyone's training data back on someone
   else's server, which is the exact thing openGym's README exists to reject.

Rough cost: **2–3 weeks**, for a feature the majority of self-hosters couldn't enable, on a
project whose pitch it undercuts. Against ~5 days for the same-server version that covers the
common case completely.

## What would change this

If openGym ever grows an official hosted instance, or an opt-in relay the project itself runs,
federation becomes worth revisiting — the reachability problem disappears and the trust question
has a single, documented answer. Until then, the honest answer to *"can I follow my mate on his
own server?"* is **no, and here's his plan file.**

## The cheap thing to build instead

When an invite is for another instance, don't just refuse it. Offer the path that works:

- **On Bob's side:** the message above, with a link to the import screen he'd use for a plan file.
- **On Alice's side:** in the invite sheet, a quiet second line — *"Friend on their own server?
  Send them your plan as a file instead"* — linking to the existing export.

That's a handful of lines and one string each. It turns the most likely disappointment into the
feature that already ships.

---

# Reading this as acceptance criteria

Journey A is done when: **A3** (two devices, one QR, mutual friendship), **A5** (Bob trains,
Alice sees it with exercises and sets) and **A6** (his body weight and his session note are not
in the response — checked on the wire, not just on screen) all hold.

Journey B is done when: **B2** puts Bob's routine in Alice's plan in two taps, and **B3** holds —
her existing routines are byte-identical afterwards.
