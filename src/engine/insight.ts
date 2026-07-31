import {
  TileKind, KIND_INDEX, ALL_KINDS, Suit,
  isDragonKind, isWindKind, isHonor, suitOf, windOf,
} from './types';
import { shanten, winningTiles } from './hand';
import { scoreHand, WinContext } from './score';
import { Game } from './game';

/**
 * Strategic insight for the coach: opponent reads, danger tiles, wait
 * analysis. Two layers on purpose:
 *  - "visible" facts a player at the table could infer (melds, discards)
 *  - the coach's omniscient "peek" (actual shanten/waits), used to confirm
 *    or correct the visible read — teaching inference, not dependence.
 */

export type HandShape =
  | 'pure-flush'   // one suit only, no honours visible
  | 'mixed-flush'  // one suit + honours
  | 'all-pongs'
  | 'honors'
  | 'unclear';

export interface OpponentProfile {
  player: number;
  name: string;
  // ---- visible evidence ----
  meldCount: number;
  chowCount: number;
  pongCount: number; // incl. gongs
  meldSuits: Suit[]; // suits present in exposed melds
  visibleFan: number; // fan already on the table (dragon/seat-wind pongs, gongs)
  shape: HandShape;
  shapeEvidence: string; // one-line human explanation of the visible read
  /** fraction of their discards in their apparent flush suit (low = hoarding) */
  discardCount: number;
  // ---- coach's peek (omniscient) ----
  shanten: number;
  ready: boolean;
  waits: TileKind[];
  /** max fan they'd score over their waits (0 if not ready) */
  potentialFan: number;
}

export function opponentProfile(game: Game, player: number): OpponentProfile {
  const p = game.players[player];
  const melds = p.melds;
  const chowCount = melds.filter((m) => m.type === 'chow').length;
  const pongCount = melds.length - chowCount;
  const exposed = melds.filter((m) => !m.concealed);

  const meldSuits: Suit[] = [];
  let honorMelds = 0;
  let visibleFan = 0;
  for (const m of exposed) {
    const k = m.tiles[0].kind;
    const s = suitOf(k);
    if (s && !meldSuits.includes(s)) meldSuits.push(s);
    if (isHonor(k)) honorMelds++;
    if (isDragonKind(k)) visibleFan++;
    if (isWindKind(k) && windOf(k) === game.seatWind(player)) visibleFan++;
  }
  visibleFan += melds.filter((m) => m.type === 'gong').length;

  // discard suit distribution: are they visibly avoiding a suit?
  const discardsBySuit: Record<string, number> = { dots: 0, bamboo: 0, chars: 0, honor: 0 };
  for (const t of p.discards) {
    const s = suitOf(t.kind);
    discardsBySuit[s ?? 'honor']++;
  }

  let shape: HandShape = 'unclear';
  let shapeEvidence = 'Not enough visible information yet.';
  if (exposed.length >= 2) {
    if (meldSuits.length === 1 && honorMelds === 0) {
      const suit = meldSuits[0];
      const offSuit = p.discards.filter((t) => suitOf(t.kind) !== suit).length;
      const avoidance = p.discards.length > 0 ? offSuit / p.discards.length : 0;
      if (avoidance >= 0.6) {
        shape = 'pure-flush';
        shapeEvidence = `All exposed sets are ${suit}, and they mostly discard other suits — classic flush build. ${suit} tiles are risky against them.`;
      } else {
        shape = 'unclear';
        shapeEvidence = `Their sets are all ${suit}, but their discards don't avoid other suits yet.`;
      }
    } else if (meldSuits.length === 1 && honorMelds > 0) {
      shape = 'mixed-flush';
      shapeEvidence = `One suit plus honour sets — this smells like mixed one suit (3 fan). Their suit and honours are risky.`;
    } else if (honorMelds >= 2) {
      shape = 'honors';
      shapeEvidence = 'Multiple honour sets exposed — every remaining honour tile is dangerous, and their hand is already worth fan.';
    } else if (chowCount === 0 && pongCount >= 2) {
      shape = 'all-pongs';
      shapeEvidence = 'Only triplets exposed — likely going for all pongs (3 fan). Tiles they hold in pairs are what they want.';
    } else {
      shapeEvidence = 'Mixed runs and sets across suits — probably a quick, cheap hand.';
    }
  } else if (exposed.length === 1) {
    shapeEvidence = 'One exposed set — too early to read their plan; watch their next claims and discards.';
  }

  const kinds = p.concealed.map((t) => t.kind);
  const sh = kinds.length % 3 === 1 ? shanten(kinds, melds.length) : 99;
  const waits = sh === 0 ? winningTiles(kinds, melds.length) : [];

  let potentialFan = 0;
  if (waits.length > 0) {
    const ctx: WinContext = {
      seatWind: game.seatWind(player),
      selfDraw: false,
      concealed: melds.every((m) => m.concealed),
      robbingGong: false, afterGong: false, afterDoubleGong: false,
      lastTile: false, heavenly: false, earthly: false,
    };
    for (const w of waits) {
      const r = scoreHand([...kinds, w], melds, p.flowers.map((f) => f.kind), ctx);
      if (r.fan > potentialFan) potentialFan = r.fan;
    }
  }

  return {
    player, name: p.name,
    meldCount: melds.length, chowCount, pongCount, meldSuits, visibleFan,
    shape, shapeEvidence,
    discardCount: p.discards.length,
    shanten: sh, ready: sh === 0, waits, potentialFan,
  };
}

/** Kinds that would deal into ANY ready opponent right now, with who wins. */
export function dangerTiles(game: Game): Map<TileKind, number[]> {
  const danger = new Map<TileKind, number[]>();
  for (let i = 1; i < 4; i++) {
    const p = game.players[i];
    const kinds = p.concealed.map((t) => t.kind);
    if (kinds.length % 3 !== 1) continue;
    if (shanten(kinds, p.melds.length) !== 0) continue;
    for (const w of winningTiles(kinds, p.melds.length)) {
      const arr = danger.get(w) ?? [];
      arr.push(i);
      danger.set(w, arr);
    }
  }
  return danger;
}

/**
 * Count copies of `kind` NOT visible from the human's seat: 4 minus their own
 * hand/melds/discard-pool sightings. Concealed gongs stay hidden on purpose —
 * this is table knowledge, not the coach's peek.
 */
export function unseenCount(game: Game, kind: TileKind): number {
  let seen = 0;
  const me = game.players[0];
  for (const t of me.concealed) if (t.kind === kind) seen++;
  for (const p of game.players) {
    for (const t of p.discards) if (t.kind === kind) seen++;
    for (const m of p.melds) {
      if (m.concealed) continue;
      for (const t of m.tiles) if (t.kind === kind) seen++;
    }
  }
  return Math.max(0, 4 - seen);
}

export interface WaitInfo {
  kind: TileKind;
  unseen: number;
  fan: number;
  payout: number;
}

/** The human's attack picture when ready: each wait, its width and value. */
export function myWaitAnalysis(game: Game): WaitInfo[] {
  const me = game.players[0];
  const kinds = me.concealed.map((t) => t.kind);
  if (kinds.length % 3 !== 1) return [];
  if (shanten(kinds, me.melds.length) !== 0) return [];
  const ctx: WinContext = {
    seatWind: game.seatWind(0),
    selfDraw: false,
    concealed: me.melds.every((m) => m.concealed),
    robbingGong: false, afterGong: false, afterDoubleGong: false,
    lastTile: false, heavenly: false, earthly: false,
  };
  return winningTiles(kinds, me.melds.length).map((w) => {
    const r = scoreHand([...kinds, w], me.melds, me.flowers.map((f) => f.kind), ctx);
    return { kind: w, unseen: unseenCount(game, w), fan: r.fan, payout: r.payout };
  });
}

/**
 * Tiles in the human's hand that are PROVABLY safe by table counting alone.
 * Only HONOURS qualify: if opponents can hold zero copies (all four are in
 * your hand or visible), nobody can be pair- or pong-waiting on it, and
 * honours can't sit in runs. A suited tile is never provably safe by
 * counting — someone can chow-wait on it while holding none. Used to teach
 * safe-tile thinking honestly: everything else is only "safer", never safe.
 */
export function provablySafeKinds(game: Game): TileKind[] {
  const me = game.players[0];
  const out: TileKind[] = [];
  const held = new Set(me.concealed.map((t) => t.kind));
  for (const k of held) {
    if (isHonor(k) && unseenCount(game, k) === 0) out.push(k);
  }
  return out;
}
