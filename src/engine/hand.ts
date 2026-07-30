import {
  Counts, TileKind, ALL_KINDS, KIND_INDEX, toCounts,
  isHonor, isWindKind, isDragonKind, suitOf, rankOf,
} from './types';

/**
 * Hand analysis: win detection, decomposition into sets, and shanten
 * (number of tile-swaps away from being ready to win).
 *
 * Terminology used throughout:
 *  - set: a complete run of 3 ascending suited tiles (chow/seung) or a
 *    triplet (pong). Declared melds count as sets already made.
 *  - eyes: the pair that completes the hand (4 sets + eyes = win).
 *  - shanten: -1 = winning hand, 0 = ready ("ting", one tile from winning).
 */

export interface DecompSet {
  type: 'chow' | 'pong';
  kinds: TileKind[]; // 3 kinds (chow) or same kind x3 (pong)
}
export interface Decomposition {
  sets: DecompSet[];
  eyes: TileKind;
  kind: 'standard';
}
export interface SevenPairsDecomp {
  kind: 'sevenPairs';
  pairs: TileKind[];
}
export interface ThirteenOrphansDecomp {
  kind: 'thirteenOrphans';
  pairKind: TileKind;
}
export type WinDecomp = Decomposition | SevenPairsDecomp | ThirteenOrphansDecomp;

const ORPHAN_KINDS: TileKind[] = [
  'dots-1', 'dots-9', 'bamboo-1', 'bamboo-9', 'chars-1', 'chars-9',
  'wind-E', 'wind-S', 'wind-W', 'wind-N', 'dragon-R', 'dragon-G', 'dragon-B',
];

/** Can `counts` (a multiple-of-3 plus 2 tiles) form `nSets` sets + one pair? */
export function isStandardWin(counts: Counts, nSets: number): boolean {
  return decomposeStandard(counts, nSets).length > 0;
}

/**
 * All distinct decompositions of `counts` into `nSets` sets + eyes.
 * Used by scoring to pick the highest-fan interpretation.
 */
export function decomposeStandard(counts: Counts, nSets: number): Decomposition[] {
  const results: Decomposition[] = [];
  const c = counts.slice();
  for (let eye = 0; eye < 34; eye++) {
    if (c[eye] < 2) continue;
    c[eye] -= 2;
    const seen = new Set<string>();
    collectSets(c, 0, nSets, [], (sets) => {
      const key = sets.map((s) => s.kinds.join(',')).sort().join('|');
      if (!seen.has(key)) {
        seen.add(key);
        results.push({ kind: 'standard', sets: sets.map((s) => ({ ...s, kinds: s.kinds.slice() })), eyes: ALL_KINDS[eye] });
      }
    });
    c[eye] += 2;
  }
  return results;
}

function collectSets(
  c: Counts, start: number, need: number,
  acc: DecompSet[], emit: (sets: DecompSet[]) => void,
): void {
  if (need === 0) {
    if (c.every((n) => n === 0)) emit(acc);
    return;
  }
  // find first non-empty kind at/after start; earlier kinds must be consumed already
  let i = start;
  while (i < 34 && c[i] === 0) i++;
  if (i >= 34) return;

  // pong
  if (c[i] >= 3) {
    c[i] -= 3;
    acc.push({ type: 'pong', kinds: [ALL_KINDS[i], ALL_KINDS[i], ALL_KINDS[i]] });
    collectSets(c, i, need - 1, acc, emit);
    acc.pop();
    c[i] += 3;
  }
  // chow starting at i (suited only, rank <= 7)
  const kind = ALL_KINDS[i];
  const suit = suitOf(kind);
  if (suit) {
    const r = rankOf(kind);
    if (r <= 7 && c[i + 1] > 0 && c[i + 2] > 0) {
      c[i]--; c[i + 1]--; c[i + 2]--;
      acc.push({ type: 'chow', kinds: [ALL_KINDS[i], ALL_KINDS[i + 1], ALL_KINDS[i + 2]] });
      collectSets(c, i, need - 1, acc, emit);
      acc.pop();
      c[i]++; c[i + 1]++; c[i + 2]++;
    }
  }
}

/** Seven pairs: exactly 7 distinct-or-not pairs, concealed 14 tiles (no melds). */
export function sevenPairsWin(counts: Counts): SevenPairsDecomp | null {
  const pairs: TileKind[] = [];
  let total = 0;
  for (let i = 0; i < 34; i++) {
    total += counts[i];
    if (counts[i] === 2) pairs.push(ALL_KINDS[i]);
    else if (counts[i] === 4) { pairs.push(ALL_KINDS[i], ALL_KINDS[i]); }
    else if (counts[i] !== 0) return null;
  }
  return total === 14 && pairs.length === 7 ? { kind: 'sevenPairs', pairs } : null;
}

/** Thirteen orphans: one of each terminal+honor, plus a pair of any of them. */
export function thirteenOrphansWin(counts: Counts): ThirteenOrphansDecomp | null {
  let pairKind: TileKind | null = null;
  let total = 0;
  for (let i = 0; i < 34; i++) total += counts[i];
  if (total !== 14) return null;
  for (const k of ORPHAN_KINDS) {
    const n = counts[KIND_INDEX[k]];
    if (n === 0) return null;
    if (n === 2) {
      if (pairKind) return null;
      pairKind = k;
    }
    if (n > 2) return null;
  }
  // no non-orphan tiles allowed
  for (let i = 0; i < 34; i++) {
    if (counts[i] > 0 && !ORPHAN_KINDS.includes(ALL_KINDS[i])) return null;
  }
  return pairKind ? { kind: 'thirteenOrphans', pairKind } : null;
}

/** All winning decompositions for a 14-tile concealed portion + declared meld count. */
export function allWinDecomps(concealed: TileKind[], declaredMelds: number): WinDecomp[] {
  const counts = toCounts(concealed);
  const out: WinDecomp[] = decomposeStandard(counts, 4 - declaredMelds);
  if (declaredMelds === 0) {
    const sp = sevenPairsWin(counts);
    if (sp) out.push(sp);
    const to = thirteenOrphansWin(counts);
    if (to) out.push(to);
  }
  return out;
}

export function isWinningHand(concealed: TileKind[], declaredMelds: number): boolean {
  const counts = toCounts(concealed);
  if (isStandardWin(counts, 4 - declaredMelds)) return true;
  if (declaredMelds === 0) {
    if (sevenPairsWin(counts)) return true;
    if (thirteenOrphansWin(counts)) return true;
  }
  return false;
}

// ---------------------------------------------------------------------------
// Shanten
// ---------------------------------------------------------------------------

/**
 * Standard-hand shanten for a concealed portion that is 3n+1 tiles
 * (13, 10, 7, 4, 1) given `declaredMelds` melds on the table.
 * Returns -1 if... (never: a 3n+1 hand can't be complete; 0 = ready).
 */
export function standardShanten(counts: Counts, declaredMelds: number): number {
  const needSets = 4 - declaredMelds;
  let best = 8;
  const c = counts.slice();
  // A partial set only helps if its completing tile can still be drawn: we
  // hold orig[k] of kind k, so 4 - orig[k] copies remain outside the hand.
  const orig = counts.slice();
  const outside = (k: number) => k >= 0 && k < 34 && orig[k] <= 3;

  const dfs = (i0: number, sets: number, partials: number, hasPair: boolean, pairableFloater: boolean) => {
    let i = i0;
    while (i < 34 && c[i] === 0) i++;
    if (i >= 34) {
      const sCap = Math.min(sets, needSets);
      const pCap = Math.min(partials, Math.max(0, needSets - sCap));
      let shanten = (needSets - sCap) * 2 - pCap - (hasPair ? 1 : 0);
      // Without eyes, the final pair must come from pairing a spare tile —
      // impossible if every spare is a 4th copy (no 5th tile exists).
      if (!hasPair && !pairableFloater) shanten += 1;
      if (shanten < best) best = shanten;
      return;
    }
    const kind = ALL_KINDS[i];
    const suit = suitOf(kind);
    const r = suit ? rankOf(kind) : 0;

    if (c[i] >= 3) {
      c[i] -= 3; dfs(i, sets + 1, partials, hasPair, pairableFloater); c[i] += 3;
    }
    if (suit && r <= 7 && c[i + 1] > 0 && c[i + 2] > 0) {
      c[i]--; c[i + 1]--; c[i + 2]--;
      dfs(i, sets + 1, partials, hasPair, pairableFloater);
      c[i]++; c[i + 1]++; c[i + 2]++;
    }
    if (c[i] >= 2) {
      c[i] -= 2;
      if (!hasPair) dfs(i, sets, partials, true, pairableFloater);
      // pair as a partial pong needs a 3rd copy from outside
      if (outside(i)) dfs(i, sets, partials + 1, hasPair, pairableFloater);
      c[i] += 2;
    }
    // partial chow (i, i+1): completes with i-1 or i+2 from outside
    if (suit && r <= 8 && c[i + 1] > 0) {
      const completable = (r >= 2 && outside(i - 1)) || (r <= 7 && outside(i + 2));
      if (completable) {
        c[i]--; c[i + 1]--; dfs(i, sets, partials + 1, hasPair, pairableFloater); c[i]++; c[i + 1]++;
      }
    }
    // partial chow (i, i+2): completes only with the middle tile
    if (suit && r <= 7 && c[i + 2] > 0 && outside(i + 1)) {
      c[i]--; c[i + 2]--; dfs(i, sets, partials + 1, hasPair, pairableFloater); c[i]++; c[i + 2]++;
    }
    // treat c[i] as floaters: drop them all and move on
    const n = c[i];
    c[i] = 0;
    dfs(i + 1, sets, partials, hasPair, pairableFloater || outside(i));
    c[i] = n;
  };
  dfs(0, 0, 0, false, false);
  return best;
}

export function sevenPairsShanten(counts: Counts): number {
  // Consistent with sevenPairsWin: four of a kind counts as two pairs.
  // Each kind offers up to two "pair slots" (2 tiles each); a slot holding a
  // single tile completes via an outside draw (always available: holding 1 or
  // 3 of a kind leaves copies outside). Cover 7 slots as fully as possible.
  const slots: number[] = [];
  for (let i = 0; i < 34; i++) {
    slots.push(Math.min(2, counts[i]));
    slots.push(Math.min(2, Math.max(0, counts[i] - 2)));
  }
  slots.sort((a, b) => b - a);
  const coverage = slots.slice(0, 7).reduce((a, b) => a + b, 0);
  return 13 - coverage;
}

export function thirteenOrphansShanten(counts: Counts): number {
  let have = 0;
  let hasPair = false;
  for (const k of ORPHAN_KINDS) {
    const n = counts[KIND_INDEX[k]];
    if (n > 0) have++;
    if (n >= 2) hasPair = true;
  }
  return 13 - have - (hasPair ? 1 : 0);
}

/**
 * Overall shanten of a 13-tile-equivalent hand (concealed 3n+1 tiles).
 * -0 = ready; special hands only considered with no declared melds.
 */
export function shanten(concealed: TileKind[], declaredMelds: number): number {
  const counts = toCounts(concealed);
  let best = standardShanten(counts, declaredMelds);
  if (declaredMelds === 0) {
    best = Math.min(best, sevenPairsShanten(counts), thirteenOrphansShanten(counts));
  }
  return best;
}

/**
 * The set of tile kinds that would complete the hand if drawn
 * (for a 3n+1 concealed portion). Empty unless shanten === 0.
 */
export function winningTiles(concealed: TileKind[], declaredMelds: number): TileKind[] {
  const out: TileKind[] = [];
  const counts = toCounts(concealed);
  for (let i = 0; i < 34; i++) {
    if (counts[i] >= 4) continue;
    counts[i]++;
    if (isStandardWin(counts, 4 - declaredMelds)) out.push(ALL_KINDS[i]);
    else if (declaredMelds === 0 && (sevenPairsWin(counts) || thirteenOrphansWin(counts))) out.push(ALL_KINDS[i]);
    counts[i]--;
  }
  return out;
}
