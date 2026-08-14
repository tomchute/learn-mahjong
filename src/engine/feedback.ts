import { TileKind, Tile, toCounts, KIND_INDEX } from './types';
import { shanten, winningTiles } from './hand';
import { Game } from './game';
import { detectPlans, annotateWaits, waitLine, waitWarnings, Plan } from './planner';
import { dangerTiles } from './insight';
import { tileName } from '../content/names';

/**
 * Move feedback for the learner. The coach can see everyone's hands, so it
 * can tell the player exactly what a discard risked or enabled.
 */

export type Verdict = 'good' | 'ok' | 'risky' | 'bad';

export interface DiscardFeedback {
  verdict: Verdict;
  headline: string;
  details: string[];
  shantenBefore: number;
  shantenAfter: number;
  /** best achievable shanten over all possible discards at this moment */
  bestAfter: number;
  /** the discards that achieve bestAfter */
  bestKinds: TileKind[];
}

/**
 * Evaluate a human discard. Call BEFORE game.discard() so opponent hands are
 * still in their pre-claim state (the tile is still in the player's hand).
 */
export function evaluateDiscard(game: Game, tile: Tile): DiscardFeedback {
  const p = game.players[0];
  const kindsBefore = p.concealed.map((t) => t.kind); // includes the tile
  const kindsAfter = kindsBefore.slice();
  kindsAfter.splice(kindsAfter.indexOf(tile.kind), 1);
  const melds = p.melds.length;

  const before = shanten(kindsBefore, melds); // shanten of the 14-tile hand pre-discard...
  const after = shanten(kindsAfter, melds);

  // best achievable shanten over all possible discards
  let bestAfter = Infinity;
  const tried = new Set<TileKind>();
  const bestKinds: TileKind[] = [];
  for (const k of kindsBefore) {
    if (tried.has(k)) continue;
    tried.add(k);
    const rest = kindsBefore.slice();
    rest.splice(rest.indexOf(k), 1);
    const sh = shanten(rest, melds);
    if (sh < bestAfter) {
      bestAfter = sh;
      bestKinds.length = 0;
      bestKinds.push(k);
    } else if (sh === bestAfter) {
      bestKinds.push(k);
    }
  }

  const details: string[] = [];
  let verdict: Verdict;
  let headline: string;

  const efficient = after === bestAfter;

  if (before === -1) {
    // Complete hand. Two very different situations:
    //  - they could have pressed WIN and didn't → the worst possible mistake
    //  - the turn came from a claim (no draw), so no WIN existed → the
    //    discard is FORCED; the mistake happened back at the claim.
    if (game.canSelfWin(0)) {
      return {
        verdict: 'bad',
        headline: 'You had a winning hand!',
        details: [
          'Your 14 tiles already formed 4 sets and a pair — press WIN 食糊 instead of discarding.',
          'Keep an eye out: when the WIN button appears, your hand is complete.',
        ],
        shantenBefore: before, shantenAfter: after, bestAfter, bestKinds,
      };
    }
    return {
      verdict: 'ok',
      headline: 'Forced discard from a complete hand.',
      details: [
        'Your tiles form a winning shape, but a turn gained by claiming has no draw — so no self-draw win exists, and you must discard.',
        'The win chance was at the claim itself: when a discard both completes your hand and fits a meld, take the WIN, not the meld.',
      ],
      shantenBefore: before, shantenAfter: after, bestAfter, bestKinds,
    };
  }

  if (after === 0) {
    const waits = winningTiles(kindsAfter, melds);
    const notes = annotateWaits(game, waits);
    const live = notes.reduce((a, w) => a + w.unseen, 0);
    headline = live === 0 ? 'Ready — but your wait is dead!' : 'You are ready to win! 聽牌';
    details.push(`You can now win on: ${waitLine(notes)}.`);
    details.push(...waitWarnings(game, waits));
    verdict = live === 0 ? 'risky' : 'good';
    // master note: was there an equally-fast discard with a wider LIVE wait?
    if (bestAfter === 0) {
      let alt: { kind: TileKind; live: number; line: string } | null = null;
      for (const k of bestKinds) {
        if (k === tile.kind) continue;
        const rest = kindsBefore.slice();
        rest.splice(rest.indexOf(k), 1);
        const altNotes = annotateWaits(game, winningTiles(rest, melds));
        const altLive = altNotes.reduce((a, w) => a + w.unseen, 0);
        if (!alt || altLive > alt.live) alt = { kind: k, live: altLive, line: waitLine(altNotes) };
      }
      if (alt && alt.live > live && (live === 0 || alt.live - live >= 2)) {
        details.push(`Master note: discarding ${tileName(alt.kind)} instead also makes you ready, with more live tiles to win on — ${alt.line}.`);
      }
    }
  } else if (efficient) {
    headline = after < 2 ? 'Good discard — almost there.' : 'Fine discard.';
    details.push(`You are ${describeShanten(after)}.`);
    verdict = 'good';
  } else {
    headline = 'That set you back.';
    details.push(
      `Discarding ${tileName(tile.kind)} leaves you ${describeShanten(after)}, ` +
      `but discarding ${bestKinds.slice(0, 2).map(tileName).join(' or ')} would leave you ${describeShanten(bestAfter)}.`,
    );
    verdict = after - bestAfter >= 2 ? 'bad' : 'risky';
  }

  // Plan awareness: a "slow" discard that sheds an off-plan tile while a
  // high-value shape is live isn't a mistake — it's trading speed for value.
  if ((verdict === 'risky' || verdict === 'bad') && after - bestAfter <= 2) {
    const plan = detectPlans(game).find((pl) => pl.strong && pl.offPlan.includes(tile.kind));
    if (plan) {
      verdict = 'ok';
      headline = 'Trading speed for value.';
      details.unshift(
        `This slows your fastest route, but ${tileName(tile.kind)} doesn't fit your ${plan.shortName} plan (${plan.fan} fan) — ` +
        'shedding it keeps the big hand alive. A deliberate master trade.',
      );
    }
  }

  // Danger analysis: does this tile help an opponent right now?
  for (let i = 1; i < 4; i++) {
    const o = game.players[i];
    const oKinds = o.concealed.map((t) => t.kind);
    if (winningTiles(oKinds, o.melds.length).includes(tile.kind)) {
      details.push(`⚠ ${o.name} is waiting on ${tileName(tile.kind)} — they can win from this!`);
      verdict = 'bad';
      headline = 'Dangerous discard!';
    } else {
      const counts = toCounts(oKinds);
      if (counts[KIND_INDEX[tile.kind]] >= 2) {
        details.push(`${o.name} holds a pair of ${tileName(tile.kind)} — they could pong it.`);
        if (verdict === 'good') verdict = 'ok';
      }
    }
  }

  return { verdict, headline, details, shantenBefore: before, shantenAfter: after, bestAfter, bestKinds };
}

export function describeShanten(sh: number): string {
  if (sh <= 0) return 'ready to win (ting / 聽牌)';
  if (sh === 1) return '1 tile away from ready';
  return `${sh} tiles away from ready`;
}

/** A hint: which discard keeps the hand best, with reasoning. */
export interface Hint {
  tileId: number;
  kind: TileKind;
  reason: string;
}

export function suggestDiscard(game: Game, opts: { avoidDanger?: boolean } = {}): Hint | null {
  const p = game.players[0];
  if (p.concealed.length % 3 !== 2) return null;
  const kinds = p.concealed.map((t) => t.kind);
  const melds = p.melds.length;
  const danger = opts.avoidDanger ? dangerTiles(game) : new Map();
  const topPlan: Plan | undefined = detectPlans(game).find((pl) => pl.strong);

  interface Cand {
    kind: TileKind;
    sh: number;
    /** total unseen copies across all waits (only meaningful at sh 0) */
    live: number;
    line: string;
    dangerous: boolean;
    offPlan: boolean;
  }
  const cands: Cand[] = [];
  const tried = new Set<TileKind>();
  for (const k of kinds) {
    if (tried.has(k)) continue;
    tried.add(k);
    const rest = kinds.slice();
    rest.splice(rest.indexOf(k), 1);
    const sh = shanten(rest, melds);
    let live = 0;
    let line = '';
    if (sh === 0) {
      const notes = annotateWaits(game, winningTiles(rest, melds));
      live = notes.reduce((a, w) => a + w.unseen, 0);
      line = waitLine(notes);
    }
    cands.push({
      kind: k, sh, live, line,
      dangerous: danger.has(k),
      offPlan: !!topPlan && topPlan.offPlan.includes(k),
    });
  }
  if (!cands.length) return null;

  // Master ordering: fastest first; among equals never deal into a waiting
  // opponent; then the wait with the most LIVE tiles; then shed off-plan
  // tiles so the high-value shape survives.
  const rank = (a: Cand, b: Cand) =>
    a.sh - b.sh || Number(a.dangerous) - Number(b.dangerous) || b.live - a.live ||
    Number(b.offPlan) - Number(a.offPlan);
  const best = cands.slice().sort(rank)[0];
  // what we'd have picked ignoring danger — to explain the detour
  const raw = cands.slice().sort((a, b) => a.sh - b.sh || b.live - a.live || Number(b.offPlan) - Number(a.offPlan))[0];

  const tile = p.concealed.find((t) => t.kind === best.kind)!;
  let reason =
    best.sh === 0
      ? `Discarding ${tileName(best.kind)} makes you ready to win — waiting on ${best.line}.`
      : `Discarding ${tileName(best.kind)} keeps you ${describeShanten(best.sh)} — your other tiles work better together.`;
  if (best.sh > 0 && best.offPlan && topPlan) {
    reason += ` It also sheds an off-plan tile, keeping your ${topPlan.shortName} plan (${topPlan.fan} fan) alive.`;
  }
  if (raw.kind !== best.kind && raw.dangerous) {
    reason += ` (${tileName(raw.kind)} looks just as fast, but it deals straight into a waiting opponent right now.)`;
  }
  return { tileId: tile.id, kind: best.kind, reason };
}
