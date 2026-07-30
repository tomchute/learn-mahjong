# STATUS — product & engineering state

Last updated: 2026-07-30 (post adversarial-review fixes, commit `1e6aa3c`).

## Product state: v1 complete ✅

All original outcomes are met and verified by tests + headless playtests:

| Outcome | State |
|---|---|
| Visual, game-feel table from player's perspective | ✅ SVG tiles, felt table, opponents around, discard zones, wind compass |
| Full game start→finish with scoring | ✅ 4 rounds / 16+ hands, dealer rotation, fan breakdown screens, final standings |
| Tutorial panel, toggleable, always accessible | ✅ ⓘ modal (guide / tile glossary with Cantonese names / scoring table) + first-game onboarding |
| Explains rules, opponent actions, player options | ✅ Coach panel narrates events, claim options, self-win prompts, outranked claims |
| Move feedback (good/bad, "opponent can now…") | ✅ Every discard graded via omniscient engine; claim/pass decisions evaluated; hints |
| Mobile first | ✅ Designed at 390×844, verified at 320×568, scales to desktop (max-width 560) |

Ruleset: Tea Base's HK booklet (PDF read successfully — pages rendered as
images). Interpretation decisions documented in `RULES.md`. The user also
offered https://www.wikihow.com/Play-Mah-Jongg as a fallback reference — it
was NOT needed; the app follows the booklet.

## Quality state

- 42 tests green (`npm test`, ~35s): unit tests + brute-force shanten
  reference + state-machine fuzz (all-AI matches and random-human-behavior
  matches; tile conservation, zero-sum chips, termination).
- Adversarial review completed (4 parallel reviewers: rules fidelity,
  algorithms, UI/store, learning experience). ~25 confirmed findings, all
  fixed in commit `1e6aa3c`. One reviewer (algorithms) died mid-run from a
  session limit, but its scratch test suite was recovered and is now
  `tests/property.test.ts`.
- Playtest screenshots verified after every UI change (`scripts/playtest.mjs`
  → `shots/`, gitignored).

## Deployment

Static site. `.github/workflows/deploy.yml` publishes to GitHub Pages on push
to `main` — requires the owner to enable Settings → Pages → Source: GitHub
Actions, and merging the working branch to main. Not yet done (no PR opened —
owner hasn't asked for one).

## Known gaps / accepted tradeoffs (v1)

- No mid-hand persistence: refreshing the page loses the current match
  (settings/stats do persist). Engine is seed-deterministic, so an event-log
  replay would be the clean fix.
- No sound, minimal animation (draw glow + selection raise only).
- AI plays offense only (no defense/folding); personalities differ in claim
  eagerness and noise. Good enough to teach, not to challenge experts.
- Chips can go negative (intentional — learning over survival; noted in RULES.md).
- Concealed-gong robbing (thirteen-orphans exception) not implemented (RULES.md #5).
- "Last tile win" fan only for self-draw of the final wall tile, not a win on
  the final discard (booklet ambiguous; RULES.md).
- Multiple simultaneous discard-winners: nearest-in-turn-order takes it
  (standard); no head-bump split.
- English UI only; Cantonese romanizations sprinkled for flavor.
- Rack tiles at 320px are ~20px wide — tap-friendly via padded slots, but
  cramped; landscape layout unexplored.
- `window.innerWidth` read in `rackTileSize` is render-time (resize listener
  bumps the store, so it corrects on resize).

## Refinement backlog (prioritized, none started)

1. **Match persistence/resume** — serialize seed + action log to
   localStorage; replay on load. Biggest real-user annoyance.
2. **Discard/draw animations** — tiles flying from rack to discard zone and
   wall to rack would massively help beginners track the flow the coach
   describes.
3. **Practice modes** — "claim trainer" (drills on when to pong/seung),
   "score this hand" quiz using the existing scoring engine, and a
   "defense basics" lesson once AI defense exists.
4. **AI defense** — fold when an opponent is visibly ready (their melds +
   discards); teach the concept through coach commentary.
5. **Sound** (toggle exists in settings, `soundEnabled` is stored but unused
   — wire WebAudio clicks/claims/win jingle).
6. **Coach depth setting** — beginner/intermediate verbosity; currently one
   level. The 60-message cap is also worth revisiting for a "review this
   hand" scroll-back.
7. **Landscape/tablet layout** — currently portrait-optimized with a 560px
   max width.
8. **A11y pass** — keyboard works on the rack; claim buttons/modals still
   need focus management and ARIA live regions for coach messages.

## How to pick this up in a fresh session

1. Read `CLAUDE.md` (auto-loaded), this file, and `RULES.md`.
2. `git log --oneline` — 4 substantive commits tell the build story.
3. `npm install && npm test` to confirm green, then `npm run dev`.
4. For UI work: build + preview + `node scripts/playtest.mjs`, and Read the
   screenshots in `shots/` — don't trust layout changes without looking.
5. Engine changes: extend `tests/property.test.ts`; the brute-force
   references there are the ground truth for shanten/win logic.
