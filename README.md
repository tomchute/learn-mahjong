# Learn Mahjong 🀄

A mobile-first web app that teaches you to play **Hong Kong–style mahjong** by
playing it — a full game from your seat at the table, with a coach that
explains every rule, every opponent move, and every choice you make.

The rules follow *Tea Base's Mahjong Instruction Booklet* (Hong Kong style).
See [RULES.md](./RULES.md) for the exact ruleset and interpretation notes.

## Features

- **Play a complete match** against three AI opponents: 4 wind rounds
  (East → South → West → North), 16+ hands, dealer rotation, draws, and a
  final standings screen.
- **Full HK rules**: 144 tiles with flowers, seung/pong/gong claims,
  robbing the gong, concealed & added gongs, self-draw, last-tile and
  after-gong wins, heavenly/earthly hands.
- **Fan scoring with exponential payouts** (2^fan chips, 13-fan limit), with a
  per-hand breakdown of every fan you earned.
- **A coach that watches everything** *(toggleable)*:
  - narrates what opponents do and why it matters,
  - offers your claim options in plain language,
  - grades every discard (good / ok / risky / bad) — including
    "that let Mei pong" and "Ken was waiting on that tile" style feedback,
    powered by full knowledge of all hands,
  - tells you when you're ready (聽) and which tiles win.
- **Tutorial panel** available at any time (ⓘ): how to play, a tile glossary
  with Cantonese names (yut/yee/saam…, tung/sok/maan, dung/naam/sai/buk), and
  the full scoring table.
- **Mobile-first**: designed for a phone in portrait, works up to desktop.

## Run it

```bash
npm install
npm run dev        # dev server
npm test           # engine test suite (win detection, scoring, full-game fuzz)
npm run build      # production build in dist/
npm run preview    # serve the production build
```

Optional: `node scripts/playtest.mjs` drives a full automated game in a
headless mobile-sized browser and saves screenshots to `shots/` (requires the
preview server running on port 4173).

## Deploying

The app is a static site (`dist/` after `npm run build`) and runs anywhere.
A GitHub Actions workflow (`.github/workflows/deploy.yml`) publishes to
GitHub Pages on every push (tests must pass first) and enables Pages
automatically on first run.

## Playing offline (e.g. on a flight)

No server is needed — the game runs entirely in your browser and two offline
modes are built in:

- **Install it as an app (recommended)**: open the GitHub Pages site once
  while online, then use *Add to Home Screen* (iOS Safari: Share → Add to
  Home Screen; Android Chrome: menu → Add to Home screen / Install app).
  A service worker precaches the whole game, so it launches and plays fully
  offline in airplane mode. Revisit once while online to pick up updates.
- **Single file**: every build also produces `learn-mahjong-offline.html`
  (~220 KB, everything inlined). A copy is committed at the repo root, and
  the deployed site serves it at `learn-mahjong-offline.html` — download it,
  save it anywhere (phone, laptop, USB stick) and open it in a browser; it
  works from `file://` with no network at all. Best on Android/desktop —
  iOS makes opening local HTML awkward, so prefer the installed app there.
  Note: settings/stats persistence (localStorage) may not survive across
  openings in this mode on some browsers; the installed-app mode keeps them.

## Project structure

```
src/
  engine/     pure TypeScript game engine (no UI dependencies)
    types.ts     tile & meld types, kind encoding
    tiles.ts     the 144-tile deck and the wall
    hand.ts      win detection, decomposition, shanten
    score.ts     fan scoring per the booklet
    game.ts      turns, claims, dealer rotation, match flow
    ai.ts        opponent decision-making (3 personalities)
    feedback.ts  move grading & hints for the coach
  ui/         React components (table, tiles as SVG, modals, coach)
  content/    tutorial text, scoring table, tile names/glossary
tests/        Vitest suite for the engine
```

The engine is deterministic given a seed, and the AI plays complete games —
the test suite fuzzes dozens of full matches to verify invariants
(tile conservation, zero-sum payments, termination).
