import {
  Tile, TileKind, Meld, Counts, toCounts, ALL_KINDS,
  isHonor, isDragonKind, isSuited, suitOf, rankOf, windOf,
} from './types';
import {
  WinDecomp, DecompSet, shanten, sevenPairsShanten, thirteenOrphansShanten, winningTiles,
} from './hand';
import { Game } from './game';
import { flowerSeatNumber, seatNumber } from './score';
import { tileName } from '../content/names';

/**
 * Plain-English explanations of hands, for the coach and the win screen.
 * Everything here is presentation-side analysis: it never mutates game state.
 */

// ---------------------------------------------------------------------------
// Winning hand structure ("why did that hand win?")
// ---------------------------------------------------------------------------

export interface WinGroup {
  /** short label rendered under the tile group */
  label: string;
  type: 'run' | 'triplet' | 'gong' | 'pair' | 'orphans';
  /** tiles from the concealed portion (absent for declared melds) */
  tiles?: Tile[];
  /** a declared meld (rendered with its face-down ends if concealed gong) */
  meld?: Meld;
}

export interface WinExplanation {
  groups: WinGroup[];
  /** one or two sentences describing the structure + winning tile */
  summary: string[];
}

const SUIT_WORD: Record<string, string> = { dots: 'Circles', bamboo: 'Bamboo', chars: 'Characters' };

function runDesc(kinds: TileKind[]): string {
  const suit = suitOf(kinds[0])!;
  return `${kinds.map(rankOf).join('-')} of ${SUIT_WORD[suit]}`;
}

function groupDesc(g: WinGroup): string {
  const kinds = g.meld ? g.meld.tiles.map((t) => t.kind) : g.tiles!.map((t) => t.kind);
  if (g.type === 'run') return `run ${runDesc(kinds)}`;
  if (g.type === 'pair') return `pair of ${tileName(kinds[0])}`;
  return `${g.type} of ${tileName(kinds[0])}`;
}

/**
 * Break a winning hand into its labeled groups (declared melds, concealed
 * sets, and the pair) and describe the structure in beginner terms.
 * Tiles of the same kind are interchangeable, so any assignment of concrete
 * tiles to the decomposition's groups is valid.
 */
export function explainWinStructure(
  hand: { concealed: Tile[]; melds: Meld[]; flowers: Tile[] },
  decomp: WinDecomp,
  winningTile: Tile | null,
): WinExplanation {
  const pool = hand.concealed.slice();
  const take = (kind: TileKind): Tile => {
    const i = pool.findIndex((t) => t.kind === kind);
    if (i < 0) throw new Error(`explainWinStructure: missing ${kind}`);
    return pool.splice(i, 1)[0];
  };

  const groups: WinGroup[] = [];
  const summary: string[] = [];

  if (decomp.kind === 'sevenPairs') {
    for (const k of decomp.pairs) groups.push({ label: 'pair', type: 'pair', tiles: [take(k), take(k)] });
    summary.push(
      'A special hand: Seven pairs 七对子 — instead of the usual 4 sets + a pair, the whole hand is seven pairs, kept fully concealed.',
    );
  } else if (decomp.kind === 'thirteenOrphans') {
    groups.push({ label: 'the thirteen orphans', type: 'orphans', tiles: hand.concealed.slice() });
    summary.push(
      'The rarest hand: Thirteen orphans 十三幺 — one of every 1, 9, wind and dragon, plus a second copy of any of them. No sets at all!',
    );
  } else {
    for (const m of hand.melds) {
      const label = m.type === 'chow' ? 'run · claimed'
        : m.type === 'pong' ? 'triplet · claimed'
        : m.concealed ? 'gong · concealed' : 'gong · claimed';
      groups.push({ label, type: m.type === 'chow' ? 'run' : m.type === 'pong' ? 'triplet' : 'gong', meld: m });
    }
    for (const s of decomp.sets) {
      groups.push(s.type === 'chow'
        ? { label: 'run', type: 'run', tiles: s.kinds.map(take) }
        : { label: 'triplet', type: 'triplet', tiles: s.kinds.map(take) });
    }
    groups.push({ label: 'pair · the eyes', type: 'pair', tiles: [take(decomp.eyes), take(decomp.eyes)] });

    const runs = groups.filter((g) => g.type === 'run').length;
    const trips = groups.filter((g) => g.type === 'triplet' || g.type === 'gong').length;
    const claimed = hand.melds.filter((m) => !m.concealed).length;
    const parts: string[] = [];
    if (runs) parts.push(`${runs} run${runs > 1 ? 's' : ''}`);
    if (trips) parts.push(`${trips} triplet${trips > 1 ? 's' : ''}`);
    summary.push(
      `Every winning hand is 4 sets + a pair. This one: ${parts.join(' and ')}` +
      `${claimed ? ` (${claimed} claimed from discards)` : ' (fully concealed)'}, ` +
      `with a pair of ${tileName(decomp.eyes)} as the eyes.`,
    );
  }

  if (winningTile && decomp.kind !== 'thirteenOrphans') {
    const winGroup = groups.find((g) => g.tiles?.some((t) => t.id === winningTile.id));
    if (winGroup) {
      summary.push(`The winning tile (${tileName(winningTile.kind)}, highlighted) completed the ${groupDesc(winGroup)}.`);
    }
  }
  return { groups, summary };
}

/** Compact "where the fan came from" line for coach messages. */
export function fanSummaryLine(items: { name: string; fan: number }[]): string {
  if (!items.length) return '';
  const shown = items.slice(0, 4).map((i) => `${i.name} +${i.fan}`);
  if (items.length > 4) shown.push('…');
  return `Fan came from: ${shown.join(', ')}.`;
}

// ---------------------------------------------------------------------------
// Best structure of a working hand (for "explain my hand")
// ---------------------------------------------------------------------------

export interface PartialSet {
  kinds: TileKind[];
  /** tile kinds that would complete this partial into a full set */
  needs: TileKind[];
}

export interface HandStructure {
  sets: DecompSet[];
  partials: PartialSet[];
  pair: TileKind | null;
  floaters: TileKind[];
  shanten: number;
}

/**
 * The best way to read a 3n+1 concealed hand: complete sets, the pair,
 * partial sets, and leftover floaters. Mirrors standardShanten's search
 * (including the 4-copies ceiling) but records the winning arrangement.
 * Tie-break: more complete sets, then a pair, then more partials.
 */
export function bestStructure(counts: Counts, declaredMelds: number): HandStructure {
  const needSets = 4 - declaredMelds;
  const c = counts.slice();
  const orig = counts.slice();
  const outside = (k: number) => k >= 0 && k < 34 && orig[k] <= 3;

  let best: HandStructure = { sets: [], partials: [], pair: null, floaters: [], shanten: 8 };
  const sets: DecompSet[] = [];
  const partials: PartialSet[] = [];
  const floaters: TileKind[] = [];
  let pair: TileKind | null = null;

  const consider = (pairableFloater: boolean) => {
    const sCap = Math.min(sets.length, needSets);
    const pCap = Math.min(partials.length, Math.max(0, needSets - sCap));
    let sh = (needSets - sCap) * 2 - pCap - (pair ? 1 : 0);
    if (!pair && !pairableFloater) sh += 1;
    const better =
      sh < best.shanten ||
      (sh === best.shanten &&
        (sets.length > best.sets.length ||
          (sets.length === best.sets.length &&
            ((pair !== null && best.pair === null) ||
              ((pair !== null) === (best.pair !== null) && partials.length > best.partials.length)))));
    if (better) {
      best = {
        sets: sets.map((s) => ({ type: s.type, kinds: s.kinds.slice() })),
        partials: partials.map((p) => ({ kinds: p.kinds.slice(), needs: p.needs.slice() })),
        pair,
        floaters: floaters.slice(),
        shanten: sh,
      };
    }
  };

  const dfs = (i0: number, pairableFloater: boolean) => {
    let i = i0;
    while (i < 34 && c[i] === 0) i++;
    if (i >= 34) { consider(pairableFloater); return; }
    const kind = ALL_KINDS[i];
    const suit = suitOf(kind);
    const r = suit ? rankOf(kind) : 0;

    if (c[i] >= 3) {
      c[i] -= 3;
      sets.push({ type: 'pong', kinds: [kind, kind, kind] });
      dfs(i, pairableFloater);
      sets.pop();
      c[i] += 3;
    }
    if (suit && r <= 7 && c[i + 1] > 0 && c[i + 2] > 0) {
      c[i]--; c[i + 1]--; c[i + 2]--;
      sets.push({ type: 'chow', kinds: [kind, ALL_KINDS[i + 1], ALL_KINDS[i + 2]] });
      dfs(i, pairableFloater);
      sets.pop();
      c[i]++; c[i + 1]++; c[i + 2]++;
    }
    if (c[i] >= 2) {
      c[i] -= 2;
      if (!pair) {
        pair = kind;
        dfs(i, pairableFloater);
        pair = null;
      }
      if (outside(i)) {
        partials.push({ kinds: [kind, kind], needs: [kind] });
        dfs(i, pairableFloater);
        partials.pop();
      }
      c[i] += 2;
    }
    if (suit && r <= 8 && c[i + 1] > 0) {
      const needs: TileKind[] = [];
      if (r >= 2 && outside(i - 1)) needs.push(ALL_KINDS[i - 1]);
      if (r <= 7 && outside(i + 2)) needs.push(ALL_KINDS[i + 2]);
      if (needs.length) {
        c[i]--; c[i + 1]--;
        partials.push({ kinds: [kind, ALL_KINDS[i + 1]], needs });
        dfs(i, pairableFloater);
        partials.pop();
        c[i]++; c[i + 1]++;
      }
    }
    if (suit && r <= 7 && c[i + 2] > 0 && outside(i + 1)) {
      c[i]--; c[i + 2]--;
      partials.push({ kinds: [kind, ALL_KINDS[i + 2]], needs: [ALL_KINDS[i + 1]] });
      dfs(i, pairableFloater);
      partials.pop();
      c[i]++; c[i + 2]++;
    }
    // treat all copies of kind i as floaters
    const n = c[i];
    c[i] = 0;
    for (let j = 0; j < n; j++) floaters.push(kind);
    dfs(i + 1, pairableFloater || outside(i));
    for (let j = 0; j < n; j++) floaters.pop();
    c[i] = n;
  };
  dfs(0, false);
  return best;
}

// ---------------------------------------------------------------------------
// "Explain my hand" for the coach panel
// ---------------------------------------------------------------------------

export interface HandExplanation {
  headline: string;
  details: string[];
}

function partialDesc(p: PartialSet): string {
  if (p.kinds[0] === p.kinds[1]) return `two ${tileName(p.kinds[0])} (a third makes a pong)`;
  return `${p.kinds.map(tileName).join(' + ')} (finish with ${p.needs.map(tileName).join(' or ')})`;
}

export function explainMyHand(game: Game): HandExplanation | null {
  const p = game.players[0];
  const n = p.concealed.length;
  const meldCount = p.melds.length;
  let kinds = p.concealed.map((t) => t.kind);
  let preface = '';

  if (n % 3 === 2) {
    if (game.canSelfWin(0)) {
      return {
        headline: 'Your hand is COMPLETE!',
        details: ['Your 14 tiles already form 4 sets and a pair — press WIN 食糊.'],
      };
    }
    // mid-discard-turn: analyse the hand as it stands after the best discard
    const best = bestDiscard(kinds, meldCount);
    kinds = best.rest;
    preface = `Counting past your weakest tile (${tileName(best.kind)}): `;
  } else if (n % 3 !== 1) {
    return null;
  }

  const counts = toCounts(kinds);
  const st = bestStructure(counts, meldCount);
  const spShanten = meldCount === 0 ? sevenPairsShanten(counts) : 99;
  const toShanten = meldCount === 0 ? thirteenOrphansShanten(counts) : 99;
  const details: string[] = [];
  const overall = Math.min(st.shanten, spShanten, toShanten);

  const headline = overall <= 0
    ? 'Your hand: READY 聽 — one tile from winning!'
    : `Your hand: ${overall} step${overall > 1 ? 's' : ''} from ready.`;

  if (overall <= 0) {
    const waits = winningTiles(kinds, meldCount);
    if (waits.length) details.push(`Win on: ${waits.map(tileName).join(' or ')} — claim it from a discard or draw it yourself.`);
  }

  if (toShanten < st.shanten && toShanten < spShanten) {
    const have = new Set(kinds.filter((k) => isHonor(k) || (isSuited(k) && (rankOf(k) === 1 || rankOf(k) === 9)))).size;
    details.push(
      `${preface}Best plan: Thirteen orphans 十三幺 — a LIMIT hand! You hold ${have} of the 13 needed 1s, 9s and honours; ` +
      'collect one of each plus a second copy of any.',
    );
  } else if (spShanten < st.shanten) {
    // seven-pairs route reads better than the standard one
    const pairs: TileKind[] = [];
    for (let i = 0; i < 34; i++) {
      if (counts[i] >= 2) pairs.push(ALL_KINDS[i]);
      if (counts[i] === 4) pairs.push(ALL_KINDS[i]);
    }
    details.push(
      `${preface}Best plan: Seven pairs 七对子 (7 fan). You hold ${pairs.length} pair${pairs.length === 1 ? '' : 's'} ` +
      `(${pairs.map(tileName).join(', ')}) — every other tile needs its twin.`,
    );
  } else {
    const parts: string[] = [];
    for (const m of p.melds) {
      parts.push(`claimed ${m.type === 'chow' ? `run ${runDesc(m.tiles.map((t) => t.kind))}` : `${m.type} of ${tileName(m.tiles[0].kind)}`}`);
    }
    for (const s of st.sets) {
      parts.push(s.type === 'chow' ? `run ${runDesc(s.kinds)}` : `triplet of ${tileName(s.kinds[0])}`);
    }
    if (st.pair) parts.push(`a pair of ${tileName(st.pair)} (your eyes)`);
    details.push(
      parts.length
        ? `${preface}You have ${parts.join(' · ')}. A full hand needs 4 sets + a pair.`
        : `${preface}No complete sets yet — you need 4 sets (runs or triplets) plus a pair.`,
    );
    if (st.partials.length) {
      details.push(`In progress: ${st.partials.map(partialDesc).join(' · ')}.`);
    }
    if (st.floaters.length && overall > 0) {
      const shown = st.floaters.slice(0, 4).map(tileName).join(', ');
      details.push(`Not pulling their weight: ${shown}${st.floaters.length > 4 ? '…' : ''} — good discard candidates.`);
    }
  }

  const specialRoute = spShanten < st.shanten || (toShanten < st.shanten && toShanten < spShanten);
  details.push(...fanOpportunities(game, kinds, meldCount, specialRoute).slice(0, 3));
  return { headline, details };
}

/** Best single discard from a 3n+2 hand (lowest resulting shanten). */
function bestDiscard(kinds: TileKind[], meldCount: number): { kind: TileKind; rest: TileKind[] } {
  let best: { kind: TileKind; rest: TileKind[]; sh: number } | null = null;
  const tried = new Set<TileKind>();
  for (const k of kinds) {
    if (tried.has(k)) continue;
    tried.add(k);
    const rest = kinds.slice();
    rest.splice(rest.indexOf(k), 1);
    const sh = shanten(rest, meldCount);
    if (!best || sh < best.sh) best = { kind: k, rest, sh };
  }
  return { kind: best!.kind, rest: best!.rest };
}

/** Which scoring patterns are within reach right now? Ordered by value. */
function fanOpportunities(game: Game, kinds: TileKind[], meldCount: number, specialRoute: boolean): string[] {
  const p = game.players[0];
  const out: string[] = [];
  const allKinds = kinds.slice();
  for (const m of p.melds) for (const t of m.tiles) allKinds.push(t.kind);

  // one-suit hands
  const bySuit: Record<string, number> = { dots: 0, bamboo: 0, chars: 0 };
  let honors = 0;
  for (const k of allKinds) {
    const s = suitOf(k);
    if (s) bySuit[s]++;
    else if (isHonor(k)) honors++;
  }
  const domSuit = (Object.keys(bySuit) as (keyof typeof bySuit)[]).reduce((a, b) => (bySuit[a] >= bySuit[b] ? a : b));
  const offSuit = allKinds.length - bySuit[domSuit] - honors;
  if (!specialRoute) {
    if (offSuit === 0 && honors === 0) {
      out.push(`Every tile is ${SUIT_WORD[domSuit]} — finish like this for Pure one suit 清一色, a huge 7 fan!`);
    } else if (offSuit === 0 && bySuit[domSuit] >= 6) {
      out.push(`All your tiles are ${SUIT_WORD[domSuit]} + honours — on track for Mixed one suit 混一色 (3 fan).`);
    } else if (offSuit > 0 && offSuit <= 2 && bySuit[domSuit] >= 8) {
      out.push(`You're nearly all ${SUIT_WORD[domSuit]}: shed the ${offSuit} off-suit tile${offSuit > 1 ? 's' : ''} and Mixed one suit (3 fan) opens up.`);
    }
  }

  // honour pongs (banked or one away)
  const counts = toCounts(kinds);
  const seat = game.seatWind(0);
  for (let i = 0; i < 34; i++) {
    const k = ALL_KINDS[i];
    const isDragon = isDragonKind(k);
    const isSeatWind = windOf(k) === seat;
    if (!isDragon && !isSeatWind) continue;
    const label = isDragon ? 'dragon' : 'seat-wind';
    const melded = p.melds.some((m) => m.type !== 'chow' && m.tiles[0].kind === k);
    if (melded || counts[i] >= 3) {
      out.push(`Banked: your triplet of ${tileName(k)} is a guaranteed +1 fan (${label} pong).`);
    } else if (counts[i] === 2) {
      out.push(`Your pair of ${tileName(k)} is one tile from a ${label} pong — pong it or draw it for +1 fan.`);
    }
  }

  // all pongs
  const anyRun = p.melds.some((m) => m.type === 'chow');
  if (!specialRoute && !anyRun) {
    const st = bestStructure(counts, meldCount);
    const tripletCount = st.sets.filter((s) => s.type === 'pong').length + meldCount;
    if (st.sets.every((s) => s.type === 'pong') && tripletCount >= 2 && st.partials.every((pt) => pt.kinds[0] === pt.kinds[1])) {
      out.push('No runs so far — if every set ends up a triplet, All pongs 对对糊 adds 3 fan.');
    }
  }

  // concealed hand
  if (meldCount === 0 && !specialRoute) {
    out.push('Still fully concealed — winning without claiming any discard is +1 fan (self-draw adds another).');
  }

  // flowers
  const seatN = seatNumber(seat);
  const seatFlowers = p.flowers.filter((f) => flowerSeatNumber(f.kind) === seatN).length;
  if (seatFlowers > 0) {
    out.push(`Banked: ${seatFlowers === 1 ? 'a flower that matches' : `${seatFlowers} flowers matching`} your seat (number ${seatN}) — +${seatFlowers} fan.`);
  } else if (p.flowers.length === 0) {
    out.push('No flowers yet — finishing with none is itself +1 fan.');
  }

  return out;
}
