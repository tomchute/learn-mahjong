import { TileKind, Tile, toCounts, KIND_INDEX, isHonor } from './types';
import { shanten, winningTiles } from './hand';
import { Game } from './game';
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
}

/** Evaluate a human discard BEFORE claims resolve (call right after discard). */
export function evaluateDiscard(game: Game, tile: Tile): DiscardFeedback {
  const p = game.players[0];
  const kindsAfter = p.concealed.map((t) => t.kind); // tile already removed
  const kindsBefore = [...kindsAfter, tile.kind];
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

  if (after === 0) {
    const waits = winningTiles(kindsAfter, melds);
    headline = 'You are ready to win! 聽牌';
    details.push(`You can now win on: ${waits.map(tileName).join(', ')}.`);
    verdict = 'good';
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

  return { verdict, headline, details, shantenBefore: before, shantenAfter: after };
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

export function suggestDiscard(game: Game): Hint | null {
  const p = game.players[0];
  if (p.concealed.length % 3 !== 2) return null;
  const kinds = p.concealed.map((t) => t.kind);
  const melds = p.melds.length;

  let best: { kind: TileKind; sh: number; waits: number } | null = null;
  const tried = new Set<TileKind>();
  for (const k of kinds) {
    if (tried.has(k)) continue;
    tried.add(k);
    const rest = kinds.slice();
    rest.splice(rest.indexOf(k), 1);
    const sh = shanten(rest, melds);
    const waits = sh === 0 ? winningTiles(rest, melds).length : 0;
    if (!best || sh < best.sh || (sh === best.sh && waits > best.waits)) {
      best = { kind: k, sh, waits };
    }
  }
  if (!best) return null;
  const tile = p.concealed.find((t) => t.kind === best!.kind)!;
  const reason =
    best.sh === 0
      ? `Discarding ${tileName(best.kind)} makes you ready to win.`
      : `Discarding ${tileName(best.kind)} keeps you ${describeShanten(best.sh)} — your other tiles work better together.`;
  return { tileId: tile.id, kind: best.kind, reason };
}
