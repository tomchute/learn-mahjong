# CLAUDE.md — working context for this repo

Mobile-first web app teaching Hong Kong-style mahjong (per *Tea Base's Mahjong
Instruction Booklet*, a 12-page scanned PDF supplied by the owner). Single
human player vs 3 AI opponents, full 4-round match, coach panel that explains
everything. See `STATUS.md` for product state + refinement backlog, `RULES.md`
for the exact ruleset and interpretation decisions. Read both before changing
engine behavior.

## Commands

```bash
npm run dev          # dev server
npm test             # vitest suite (~35s; property.test.ts is the slow one)
npm run build        # tsc -b && vite build → dist/
npm run preview      # serve dist on :4173
node scripts/playtest.mjs   # headless Playwright drive-through (needs :4173 up)
                            # chromium at /opt/pw-browsers/chromium-*/chrome-linux/chrome
```

Branch: work on `claude/mahjong-learning-app-mdiiej` unless told otherwise.

## Shipping

The site is LIVE at https://tomchute.github.io/learn-mahjong/ (public repo).
CI (`.github/workflows/deploy.yml`): every push builds + tests; only pushes
to `main` deploy — the auto-created `github-pages` environment rejects
deploys from other branches (its deploy job is also `if:`-gated to main so
branch pushes stay green). Ship flow: finish work on the working branch,
then merge to `main` and push — the owner granted standing permission for
deployment merges to main (2026-07-30). Don't touch Pages settings: the
Source: GitHub Actions switch was a one-time manual step (workflow tokens
cannot create a Pages site, only deploy to one).

## Architecture

- `src/engine/` — pure TS, no React imports. Deterministic given a seed
  (`rng.ts` mulberry32). UI-facing mutations bump `game.version`.
  - `types.ts` — tile kinds are strings `"dots-5"`, `"wind-E"`, `"dragon-R"`,
    `"flower-1..8"`; 34 playable kinds indexed by `KIND_INDEX`; counts arrays
    are `number[34]`.
  - `hand.ts` — win decomposition (backtracking), shanten (DFS), waits.
  - `score.ts` — fan items per the booklet; payout = 2^fan capped at 13.
  - `game.ts` — the state machine (see invariants below).
  - `ai.ts` — 3 personalities; hooks attach via `attachAi(game)`.
  - `feedback.ts` — discard grading + hints for the coach (may inspect ALL
    hands — the coach is omniscient by design).
- `src/store.ts` — `GameStore` singleton: paces AI turns with a ticker,
  translates engine events → coach messages, persists settings/stats to
  localStorage. React binds via `useSyncExternalStore`.
- `src/ui/` — components; tiles are programmatic SVG (`TileFace.tsx`).
- `src/content/` — tutorial text, scoring reference table, tile names.
  **Scoring-table names must match `score.ts` item names exactly** (a past
  review found drift; don't reintroduce it).
- `tests/property.test.ts` — brute-force reference implementations of shanten
  + state-machine fuzz (random human behavior). If you touch `hand.ts` or
  `game.ts`, this suite is the safety net; keep it passing and extend it.

## Engine invariants (violating these = bug)

- Hand sizes: concealed tiles ≡ 3n+1 between turns, 3n+2 when it's your
  discard turn. `shanten()`/`winningTiles()` are only meaningful for 3n+1.
- Total tiles across hands + melds + flowers + discards + wall = 144, ALWAYS
  (during a rob prompt, one tile sits in `pendingAddedGong` limbo — the fuzz
  test's `countAllTiles` accounts for it).
- Shanten must respect the 4-copies ceiling: a wait on a 5th copy of a kind
  is impossible. `standardShanten` tracks `orig[]` and `pairableFloater` for
  this; `sevenPairsShanten` uses pair-slots (quad = two pairs, consistent
  with `sevenPairsWin`). Verified against brute force in property tests.
- `canSelfWin` requires an actual draw (`drawnTile !== null`) or the dealer's
  untouched opening hand — otherwise pong→instant-"self-draw" milks triple
  payment.
- Claim priority: win > pong/gong > chow; among wins, nearest after
  discarder. Chow only for `(from+1)%4`. Declined gong-robs fall through to
  later eligible winners (`pendingAddedGong.laterWinners`).
- Turn order is counter-clockwise = ascending player index. Player 0 =
  human, bottom of screen; 1 = right; 2 = top; 3 = left (human chows from 3).
- Seat winds: `WINDS_ORDER[(player - dealer + 4) % 4]`. Dealer repeats on
  dealer win AND on wall-exhaustion draw. Round advances when dealership
  wraps to `roundStartDealer`; after North round → `matchWillEnd` (phase
  stays `hand-end` so the result screen shows; `proceed()` finishes).
- Flower/gong replacement draws come from the BACK of the wall
  (`wall.drawBack`); normal draws from the front.

## Offline / PWA (don't break these)

- `vite.config.ts` generates `dist/sw.js` at build: precaches all built
  files, content-hashed cache name. Asset matching needs `ignoreVary: true`
  (Pages sends `Vary: Origin`, which otherwise breaks module-script cache
  hits — this was a real production-class bug). Navigations are
  network-first with a 3s timeout for captive portals.
- `npm run build` also emits `learn-mahjong-offline.html` (single file,
  everything inlined, works from `file://`) into dist/ AND the repo root —
  the root copy is committed on purpose; don't gitignore it.
- Any new static asset must end up in dist/ to be precached; verify offline
  behavior if you touch the build (load site, kill network, reload).

## Store/UI contracts

- `useSyncExternalStore` snapshot is `store.version` ONLY and must stay
  monotonic — every mutation path must call `bump()`. Do not sum in
  `game.version` (collides across new-game resets).
- Rack tap targets are the `.rack-slot` wrappers (stationary), NOT the tile
  SVG (it translates up when selected — putting onClick on it creates a
  dead zone). Selection clears on `game.version` change via effect.
- Coach feed is capped at 60 messages; auto-scroll keys on the latest
  message ID, not array length.
- The claim bar is an absolute overlay anchored to `.table` — keep it out of
  normal flow or the table reflows every claim window.
- Discard zones must never paint over the compass at 320px (`overflow:
  hidden` on `.discards`).

## Review protocol used here

Changes of any substance: run `npm test` + `npm run build` + a playtest
(`scripts/playtest.mjs`, then Read the screenshots). For larger work the
owner likes parallel adversarial review (rules fidelity / algorithms / UI /
learning-experience) with findings verified by execution before fixing —
findings that can't be reproduced get discarded.

## Owner preferences

- Auto mode: make decisions without asking; this is a low-risk project.
- Commit and push to the working branch as you go (a stop-hook nags about
  untracked files).
- The teaching mission outranks realism: when a rule interpretation is
  ambiguous, pick what's clearest for a beginner and document it in RULES.md.
