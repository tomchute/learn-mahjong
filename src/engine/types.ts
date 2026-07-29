// Core tile & game types for Hong Kong style mahjong (Tea Base booklet rules).

export type Suit = 'dots' | 'bamboo' | 'chars';
export type Wind = 'E' | 'S' | 'W' | 'N';
export type Dragon = 'R' | 'G' | 'B'; // Red (中), Green (發), White (blank)

/**
 * TileKind is the identity of a tile face, e.g. "dots-5", "wind-E", "dragon-R",
 * "flower-1".."flower-8". There are 34 playable kinds + 8 unique flowers.
 */
export type TileKind = string;

export interface Tile {
  /** unique instance id, stable for the whole game (React keys, animation) */
  id: number;
  kind: TileKind;
}

export const SUITS: Suit[] = ['dots', 'bamboo', 'chars'];
export const WINDS: Wind[] = ['E', 'S', 'W', 'N'];
export const DRAGONS: Dragon[] = ['R', 'G', 'B'];

export function suitedKind(suit: Suit, rank: number): TileKind {
  return `${suit}-${rank}`;
}
export function windKind(w: Wind): TileKind {
  return `wind-${w}`;
}
export function dragonKind(d: Dragon): TileKind {
  return `dragon-${d}`;
}
export function flowerKind(n: number): TileKind {
  return `flower-${n}`;
}

export function isFlower(kind: TileKind): boolean {
  return kind.startsWith('flower-');
}
export function isWindKind(kind: TileKind): boolean {
  return kind.startsWith('wind-');
}
export function isDragonKind(kind: TileKind): boolean {
  return kind.startsWith('dragon-');
}
export function isHonor(kind: TileKind): boolean {
  return isWindKind(kind) || isDragonKind(kind);
}
export function isSuited(kind: TileKind): boolean {
  return kind.startsWith('dots-') || kind.startsWith('bamboo-') || kind.startsWith('chars-');
}
export function suitOf(kind: TileKind): Suit | null {
  const s = kind.split('-')[0];
  return s === 'dots' || s === 'bamboo' || s === 'chars' ? (s as Suit) : null;
}
export function rankOf(kind: TileKind): number {
  return Number(kind.split('-')[1]);
}
export function windOf(kind: TileKind): Wind | null {
  return isWindKind(kind) ? (kind.split('-')[1] as Wind) : null;
}
export function isTerminal(kind: TileKind): boolean {
  if (!isSuited(kind)) return false;
  const r = rankOf(kind);
  return r === 1 || r === 9;
}

/** Meld exposed (or concealed gong) on the table. */
export type MeldType = 'chow' | 'pong' | 'gong';
export interface Meld {
  type: MeldType;
  tiles: Tile[];
  /** seat index the claimed discard came from; null for concealed gong / self */
  claimedFrom: number | null;
  /** concealed gong (drawn 4th tile from own hand, all self-drawn) */
  concealed: boolean;
}

/** The 34 playable kinds in canonical order (for counting arrays). */
export const ALL_KINDS: TileKind[] = (() => {
  const out: TileKind[] = [];
  for (const s of SUITS) for (let r = 1; r <= 9; r++) out.push(suitedKind(s, r));
  for (const w of WINDS) out.push(windKind(w));
  for (const d of DRAGONS) out.push(dragonKind(d));
  return out;
})();

export const KIND_INDEX: Record<TileKind, number> = (() => {
  const m: Record<TileKind, number> = {};
  ALL_KINDS.forEach((k, i) => (m[k] = i));
  return m;
})();

/** counts: length-34 array of tile counts by KIND_INDEX */
export type Counts = number[];

export function toCounts(kinds: TileKind[]): Counts {
  const c = new Array(34).fill(0);
  for (const k of kinds) {
    const i = KIND_INDEX[k];
    if (i === undefined) throw new Error(`not a playable kind: ${k}`);
    c[i]++;
  }
  return c;
}
