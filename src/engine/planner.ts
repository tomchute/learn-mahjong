import { TileKind, Suit, SUITS, toCounts, isHonor, suitOf } from './types';
import { unseenCount } from './insight';
import { Game } from './game';
import { tileName } from '../content/names';

/**
 * The "master player" layer of the coach: hand PLANS (what shape is this hand
 * trying to become, and is a higher-value shape within reach?), LIVE-TILE
 * counting for waits (how many of the tiles you need are actually still out
 * there?), and opponent-suit overlap (is the tile you need likely sitting in
 * a collector's hand?).
 *
 * Everything here uses ONLY the player's own tiles and public table
 * information (melds, discards, wall count) — no omniscience — so none of it
 * needs the Coach's Peek gate.
 */

export const SUIT_WORD: Record<Suit, string> = { dots: 'Circles', bamboo: 'Bamboo', chars: 'Characters' };

// ---------------------------------------------------------------------------
// Hand plans
// ---------------------------------------------------------------------------

export type PlanId = 'pure-flush' | 'mixed-flush' | 'seven-pairs' | 'all-pongs';

export interface Plan {
  id: PlanId;
  suit?: Suit;
  /** exact scoring-table name, e.g. "Mixed one suit 混一色" */
  shortName: string;
  fan: number;
  /** concealed tiles that don't fit the plan — the ones to trade away */
  offPlan: TileKind[];
  /** strong enough for the coach to proactively suggest it */
  strong: boolean;
  /** one-line opener for a coach message */
  headline: string;
  /** self-contained explanation with concrete numbers */
  detail: string;
}

const fmtKinds = (kinds: TileKind[], max = 3): string => {
  const shown = kinds.slice(0, max).map(tileName).join(', ');
  return kinds.length > max ? `${shown}…` : shown;
};

/**
 * Detect the advanced shapes the human's hand could realistically become.
 * Works on 3n+1 (between turns) and 3n+2 (your discard turn) hands.
 * Ordered by fan value, then by how close the plan is.
 */
export function detectPlans(game: Game): Plan[] {
  const p = game.players[0];
  const kinds = p.concealed.map((t) => t.kind);
  const n = kinds.length;
  if (n % 3 !== 1 && n % 3 !== 2) return [];
  const counts = toCounts(kinds);
  const melds = p.melds;
  const drawsLeft = game.wall ? Math.floor(game.wall.remaining / 4) : 0;
  const out: Plan[] = [];

  // ---- flush plans (one per suit can qualify at most) ----
  const meldGroups = melds.map((m) => suitOf(m.tiles[0].kind) ?? 'honor');
  for (const suit of SUITS) {
    const meldsFitPure = meldGroups.every((g) => g === suit);
    const meldsFitMixed = meldGroups.every((g) => g === suit || g === 'honor');
    const offPure = kinds.filter((k) => suitOf(k) !== suit);
    const offMixed = kinds.filter((k) => suitOf(k) !== suit && !isHonor(k));
    const suitTiles =
      kinds.filter((k) => suitOf(k) === suit).length +
      melds.reduce((a, m) => a + (suitOf(m.tiles[0].kind) === suit ? m.tiles.length : 0), 0);

    const mkFlush = (id: 'pure-flush' | 'mixed-flush', off: TileKind[]): Plan => {
      const pure = id === 'pure-flush';
      const fan = pure ? 7 : 3;
      const shortName = pure ? 'Pure one suit 清一色' : 'Mixed one suit 混一色';
      const inPlan = n - off.length;
      const tight = drawsLeft < off.length + 3;
      return {
        id, suit, shortName, fan,
        offPlan: off,
        strong: inPlan >= 11 && drawsLeft >= off.length + 1,
        headline: `Master idea: a ${SUIT_WORD[suit]} flush is live.`,
        detail:
          `${inPlan} of your ${n} tiles are ${SUIT_WORD[suit]}${pure ? '' : ' or honours'} — ` +
          `${shortName} is ${fan} fan. ` +
          (off.length
            ? `Trade away ${fmtKinds(off)} and every useful draw stacks value.`
            : `Every tile already fits — just finish the hand and the fan is yours.`) +
          (tight ? ` Only ~${drawsLeft} draws left for you, so decide now.` : ''),
      };
    };

    // Prefer pure only when it's basically there; otherwise mixed keeps the
    // honours (often the eyes) and is far easier to land.
    if (meldsFitPure && offPure.length <= 1 && suitTiles >= 8 && drawsLeft >= offPure.length) {
      out.push(mkFlush('pure-flush', offPure));
    } else if (meldsFitMixed && offMixed.length <= 3 && suitTiles >= 6 && drawsLeft >= offMixed.length) {
      out.push(mkFlush('mixed-flush', offMixed));
    } else if (meldsFitPure && offPure.length <= 3 && suitTiles >= 8 && drawsLeft >= offPure.length) {
      out.push(mkFlush('pure-flush', offPure));
    }
  }

  // ---- seven pairs (concealed only — a single claim kills it) ----
  if (melds.length === 0) {
    let pairSlots = 0;
    for (let i = 0; i < 34; i++) {
      if (counts[i] >= 2) pairSlots += counts[i] === 4 ? 2 : 1;
    }
    if (pairSlots >= 4) {
      out.push({
        id: 'seven-pairs', shortName: 'Seven pairs 七对子', fan: 7,
        offPlan: [],
        strong: pairSlots >= 5,
        headline: 'Master idea: Seven pairs is in sight.',
        detail:
          `You hold ${pairSlots} pairs — Seven pairs 七对子 is 7 fan and needs no runs at all. ` +
          `Pair up your singles and claim NOTHING: one pong or seung ends the plan.`,
      });
    }
  }

  // ---- all pongs (no runs claimed, hand full of pairs/triplets) ----
  if (!melds.some((m) => m.type === 'chow')) {
    let trips = 0, pairs = 0;
    for (let i = 0; i < 34; i++) {
      if (counts[i] >= 3) trips++;
      else if (counts[i] === 2) pairs++;
    }
    const setsBank = melds.length + trips;
    if (setsBank + pairs >= 4 && pairs >= 2) {
      out.push({
        id: 'all-pongs', shortName: 'All pongs 对对糊', fan: 3,
        offPlan: [],
        strong: setsBank + pairs >= 5 && setsBank >= 2,
        headline: 'Master idea: this hand wants to be All pongs.',
        detail:
          `You hold ${pairs} pair${pairs === 1 ? '' : 's'}${trips ? ` and ${trips} concealed triplet${trips === 1 ? '' : 's'}` : ''}` +
          `${melds.length ? ` plus ${melds.length} claimed set${melds.length === 1 ? '' : 's'}` : ''} — ` +
          `All pongs 对对糊 is 3 fan, and pairs can be ponged from ANY player (runs only come from your left). ` +
          `That makes it faster than it looks.`,
      });
    }
  }

  out.sort((a, b) => b.fan - a.fan || a.offPlan.length - b.offPlan.length);
  return out;
}

// ---------------------------------------------------------------------------
// Live-tile counting for waits
// ---------------------------------------------------------------------------

export interface WaitNote {
  kind: TileKind;
  /** copies not visible from the human's seat (could be in the wall OR in opponents' hands) */
  unseen: number;
}

export function annotateWaits(game: Game, waits: TileKind[]): WaitNote[] {
  return waits.map((k) => ({ kind: k, unseen: unseenCount(game, k) }));
}

/** "4 Characters (only 1 left), 7 Circles (3 left)" */
export function waitLine(notes: WaitNote[]): string {
  return notes
    .map((w) =>
      `${tileName(w.kind)} (${w.unseen === 0 ? 'NONE left' : w.unseen === 1 ? 'only 1 left' : `${w.unseen} left`})`)
    .join(', ');
}

/**
 * Public-evidence read: which opponents look to be collecting a suit?
 * Evidence: all their suited exposed melds are one suit, and either they have
 * two such melds, or one meld plus a discard pile that never lets that suit go.
 */
export interface SuitCollector {
  player: number;
  name: string;
  suit: Suit;
  /** short evidence clause, e.g. "two claimed sets of Characters" */
  why: string;
}

export function suitCollectors(game: Game): SuitCollector[] {
  const out: SuitCollector[] = [];
  for (let i = 1; i < 4; i++) {
    const p = game.players[i];
    const exposed = p.melds.filter((m) => !m.concealed);
    const suitMelds = exposed.filter((m) => suitOf(m.tiles[0].kind) !== null);
    const suits = new Set(suitMelds.map((m) => suitOf(m.tiles[0].kind)!));
    if (suits.size !== 1) continue;
    const suit = [...suits][0];
    const suitDiscards = p.discards.filter((t) => suitOf(t.kind) === suit).length;
    if (suitMelds.length >= 2) {
      out.push({ player: i, name: p.name, suit, why: `${suitMelds.length} claimed sets of ${SUIT_WORD[suit]}` });
    } else if (suitMelds.length === 1 && p.discards.length >= 5 && suitDiscards === 0) {
      out.push({ player: i, name: p.name, suit, why: `a claimed ${SUIT_WORD[suit]} set and not one ${SUIT_WORD[suit]} discard` });
    }
  }
  return out;
}

/**
 * Opponent-overlap warnings for a set of waits: "Ken looks to be collecting
 * Characters — the 4 Characters you need may be sitting in their hand."
 * Public evidence only.
 */
export function waitOverlapWarnings(game: Game, waits: TileKind[]): string[] {
  const collectors = suitCollectors(game);
  if (!collectors.length) return [];
  const out: string[] = [];
  const warned = new Set<string>();
  for (const w of waits) {
    const s = suitOf(w);
    if (!s) continue;
    for (const c of collectors) {
      if (c.suit !== s) continue;
      const key = `${c.player}:${s}`;
      if (warned.has(key)) continue;
      warned.add(key);
      out.push(
        `${c.name} looks to be collecting ${SUIT_WORD[s]} (${c.why}) — the ${tileName(w)} you need may be sitting in their hand.`,
      );
    }
  }
  return out;
}

/**
 * Full master read on a set of waits: dead-wait alarm, thin-wait warning,
 * then opponent overlaps. For coach messages after a ready discard.
 */
export function waitWarnings(game: Game, waits: TileKind[]): string[] {
  const notes = annotateWaits(game, waits);
  const live = notes.reduce((a, w) => a + w.unseen, 0);
  const out: string[] = [];
  if (live === 0) {
    out.push('⚠ Every copy of your winning tile is already visible on the table — this wait is DEAD. Reshape toward a different wait.');
  } else if (live <= 2) {
    out.push(`Thin wait: only ${live} winning tile${live === 1 ? '' : 's'} unseen. A master counts before committing — a wider wait often beats a prettier one.`);
  }
  out.push(...waitOverlapWarnings(game, waits.filter((w) => notes.find((x) => x.kind === w)!.unseen > 0)));
  return out;
}
