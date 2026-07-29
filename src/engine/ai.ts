import { TileKind, KIND_INDEX, ALL_KINDS, toCounts, isHonor, suitOf, rankOf, Tile } from './types';
import { shanten, winningTiles } from './hand';
import { Game, ClaimOptions, ChowOption } from './game';

/**
 * Simple but plausible opponents: they pursue the lowest shanten,
 * prefer keeping connected tiles, claim discards when it advances them,
 * and always take a win. A little seeded randomness keeps them varied.
 */

export interface AiPersonality {
  /** 0..1 how eagerly they claim pong/chow (opens the hand) */
  claimEagerness: number;
  /** small noise added to discard evaluation */
  noise: number;
}

export const DEFAULT_PERSONALITIES: Record<number, AiPersonality> = {
  1: { claimEagerness: 0.9, noise: 0.05 },  // Mei: aggressive claimer
  2: { claimEagerness: 0.5, noise: 0.15 },  // Ken: loose, a bit random
  3: { claimEagerness: 0.25, noise: 0.02 }, // Priya: patient, stays concealed
};

/** How "connected" a tile is to the rest of the hand (higher = keep). */
function usefulness(kind: TileKind, counts: number[]): number {
  const i = KIND_INDEX[kind];
  let u = 0;
  if (counts[i] >= 2) u += 3; // part of a pair/triplet
  const suit = suitOf(kind);
  if (suit) {
    const r = rankOf(kind);
    const at = (rr: number) => (rr >= 1 && rr <= 9 ? counts[KIND_INDEX[`${suit}-${rr}`]] : 0);
    if (at(r - 1) > 0) u += 2;
    if (at(r + 1) > 0) u += 2;
    if (at(r - 2) > 0) u += 1;
    if (at(r + 2) > 0) u += 1;
    // central tiles are more flexible
    u += (5 - Math.abs(5 - r)) * 0.1;
  } else {
    // lone honors are the least useful
    u -= 0.5;
  }
  return u;
}

/** Choose the best discard for the current player. Returns tile id. */
export function chooseDiscard(game: Game, player: number, personality: AiPersonality): number {
  const p = game.players[player];
  const kinds = p.concealed.map((t) => t.kind);
  const melds = p.melds.length;

  let bestScore = -Infinity;
  let bestTile: Tile = p.concealed[p.concealed.length - 1];

  // Evaluate each distinct kind once
  const tried = new Set<TileKind>();
  for (const t of p.concealed) {
    if (tried.has(t.kind)) continue;
    tried.add(t.kind);
    const rest = kinds.slice();
    rest.splice(rest.indexOf(t.kind), 1);
    const sh = shanten(rest, melds);
    const counts = toCounts(rest);
    // fewer shanten is better; among equal shanten discard the least useful tile
    let score = -sh * 100 - usefulness(t.kind, counts);
    // rough ukeire bonus when close: count winning tiles when ready
    if (sh === 0) {
      score += winningTiles(rest, melds).length * 2;
    }
    score += (game.rng() - 0.5) * personality.noise * 10;
    if (score > bestScore) {
      bestScore = score;
      bestTile = t;
    }
  }
  return bestTile.id;
}

/** AI claim decision hook for Game.aiDecideClaim. */
export function decideClaim(
  game: Game, player: number, options: ClaimOptions, discard: Tile, from: number,
  personality: AiPersonality,
): { player: number; claim: 'win' | 'pong' | 'gong' | 'chow'; chow?: ChowOption } | null {
  if (options.win) return { player, claim: 'win' };

  const p = game.players[player];
  const kinds = game.concealedKinds(player);
  const before = shanten(kinds, p.melds.length);

  if (options.gong) {
    // gong keeps hand size right and earns a fan: take it unless it wrecks shanten
    const rest = kinds.slice();
    for (let i = 0; i < 3; i++) rest.splice(rest.indexOf(discard.kind), 1);
    const after = shanten(rest, p.melds.length + 1);
    if (after <= before) return { player, claim: 'gong' };
  }
  if (options.pong) {
    const rest = kinds.slice();
    for (let i = 0; i < 2; i++) rest.splice(rest.indexOf(discard.kind), 1);
    const after = shanten(rest, p.melds.length + 1);
    if (after < before && game.rng() < personality.claimEagerness + 0.1) {
      return { player, claim: 'pong' };
    }
  }
  if (options.chows.length > 0) {
    // pick the chow that helps most
    let best: { chow: ChowOption; after: number } | null = null;
    for (const chow of options.chows) {
      const rest = kinds.slice();
      for (const k of chow.kinds) {
        if (k === discard.kind) continue;
        rest.splice(rest.indexOf(k), 1);
      }
      const after = shanten(rest, p.melds.length + 1);
      if (!best || after < best.after) best = { chow, after };
    }
    if (best && best.after < before && game.rng() < personality.claimEagerness) {
      return { player, claim: 'chow', chow: best.chow };
    }
  }
  return null;
}

/** Full AI turn: declare win/gongs when sensible, otherwise discard. */
export function takeTurn(game: Game, personalities: Record<number, AiPersonality>) {
  const player = game.turn;
  const personality = personalities[player] ?? { claimEagerness: 0.5, noise: 0.1 };

  if (game.canSelfWin(player)) {
    game.declareSelfWin(player);
    return;
  }
  // concealed gong if it doesn't hurt (usually fine, worth a fan)
  for (const kind of game.concealedGongOptions(player)) {
    const kinds = game.concealedKinds(player);
    const before = shanten(kinds, game.players[player].melds.length);
    const rest = kinds.filter((k) => k !== kind);
    const after = shanten(rest, game.players[player].melds.length + 1);
    if (after <= before) {
      game.declareConcealedGong(player, kind);
      return;
    }
  }
  for (const kind of game.addedGongOptions(player)) {
    // adding to a pong rarely hurts; small chance to hold back (rob safety)
    if (game.rng() < 0.9) {
      game.declareAddedGong(player, kind);
      return;
    }
  }
  const tileId = chooseDiscard(game, player, personality);
  game.discard(tileId);
}

/** Wire the AI hooks into a game instance. */
export function attachAi(game: Game, personalities: Record<number, AiPersonality> = DEFAULT_PERSONALITIES) {
  game.aiDecideClaim = (g, player, options, discard, from) =>
    decideClaim(g, player, options, discard, from, personalities[player] ?? { claimEagerness: 0.5, noise: 0.1 });
  game.aiTakeTurn = (g) => takeTurn(g, personalities);
}
