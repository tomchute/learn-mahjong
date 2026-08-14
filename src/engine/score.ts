import {
  TileKind, Wind, Meld,
  isWindKind, isDragonKind, isHonor, isSuited, isTerminal, suitOf, rankOf, windOf,
} from './types';
import { WinDecomp, Decomposition, allWinDecomps } from './hand';

/**
 * Fan scoring per Tea Base's HK mahjong booklet.
 * Payout = 2^fan chips (fan capped at the 13-fan limit).
 */

export const LIMIT_FAN = 13;

export interface WinContext {
  seatWind: Wind;           // this player's seat wind for the hand
  selfDraw: boolean;
  concealed: boolean;       // no chow/pong/exposed-gong claimed before winning
  robbingGong: boolean;
  afterGong: boolean;       // won on the replacement tile drawn after a gong
  afterDoubleGong: boolean; // two gongs in a row, replacement tile wins
  lastTile: boolean;        // won on the very last wall tile
  heavenly: boolean;        // dealer wins with opening hand
  earthly: boolean;         // non-dealer wins on dealer's first discard
}

export interface FanItem {
  name: string;
  cantonese?: string;
  fan: number;
  detail?: string;
}

export interface ScoreResult {
  fan: number;        // capped at LIMIT_FAN
  rawFan: number;
  items: FanItem[];
  limit: boolean;
  payout: number;     // chips owed by EACH payer: 2^fan
  decomp: WinDecomp | null;
}

const SEAT_ORDER: Wind[] = ['E', 'S', 'W', 'N'];

/** Flower numbers 1-4 belong to each of the two flower groups (1-4 and 5-8). */
export function flowerSeatNumber(kind: TileKind): number {
  const n = Number(kind.split('-')[1]);
  return n <= 4 ? n : n - 4;
}
export function seatNumber(seatWind: Wind): number {
  return SEAT_ORDER.indexOf(seatWind) + 1;
}

export function payoutForFan(fan: number): number {
  return Math.pow(2, Math.min(fan, LIMIT_FAN));
}

/**
 * Score a winning hand. `concealedTiles` is the 14-tile-equivalent concealed
 * portion INCLUDING the winning tile; melds are the declared sets.
 */
export function scoreHand(
  concealedTiles: TileKind[],
  melds: Meld[],
  flowers: TileKind[],
  ctx: WinContext,
): ScoreResult {
  const decomps = allWinDecomps(concealedTiles, melds.length);
  let best: ScoreResult | null = null;
  for (const d of decomps) {
    const r = scoreDecomp(d, concealedTiles, melds, flowers, ctx);
    if (!best || r.fan > best.fan || (r.fan === best.fan && r.rawFan > best.rawFan)) best = r;
  }
  if (!best) {
    // Shouldn't happen for a verified win; return a defensive zero result.
    best = { fan: 0, rawFan: 0, items: [], limit: false, payout: payoutForFan(0), decomp: null };
  }
  return best;
}

/** Score the special all-8-flowers instant win (hand may be incomplete). */
export function scoreEightFlowers(flowers: TileKind[], ctx: WinContext): ScoreResult {
  const items: FanItem[] = [
    { name: 'All eight flowers', cantonese: 'dai fa wu 大花糊', fan: 8, detail: 'Collecting all 8 flower tiles is an instant win.' },
  ];
  const fan = 8;
  return { fan, rawFan: fan, items, limit: false, payout: payoutForFan(fan), decomp: null };
}

function scoreDecomp(
  decomp: WinDecomp,
  concealedTiles: TileKind[],
  melds: Meld[],
  flowers: TileKind[],
  ctx: WinContext,
): ScoreResult {
  const items: FanItem[] = [];

  // ---- 13-fan limit hands (non-stacking) ----
  if (ctx.heavenly) {
    return limitResult([{ name: 'Heavenly hand', cantonese: 'tin wu 天糊', fan: 13, detail: 'Dealer wins with their opening 14 tiles.' }], decomp);
  }
  if (ctx.earthly) {
    return limitResult([{ name: 'Earthly hand', cantonese: 'dei wu 地糊', fan: 13, detail: 'Winning on the very first discard of the hand.' }], decomp);
  }
  if (decomp.kind === 'thirteenOrphans') {
    return limitResult([{ name: 'Thirteen orphans', cantonese: 'sup sam yew 十三幺', fan: 13, detail: 'One of each 1, 9 and honour tile, plus a pair of any of them.' }], decomp);
  }

  // Collect all sets (declared melds + concealed decomposition) as kind info
  const allSets: { type: 'chow' | 'pong' | 'gong'; kind0: TileKind; concealedSet: boolean }[] = [];
  for (const m of melds) {
    allSets.push({ type: m.type, kind0: m.tiles[0].kind, concealedSet: m.concealed });
  }
  let eyes: TileKind | null = null;
  if (decomp.kind === 'standard') {
    for (const s of decomp.sets) allSets.push({ type: s.type, kind0: s.kinds[0], concealedSet: true });
    eyes = decomp.eyes;
  }

  const pongLike = allSets.filter((s) => s.type === 'pong' || s.type === 'gong');
  const windPongs = pongLike.filter((s) => isWindKind(s.kind0));
  const dragonPongs = pongLike.filter((s) => isDragonKind(s.kind0));

  // Big four winds (4 wind pongs) — 13 fan limit
  if (windPongs.length === 4) {
    return limitResult([{ name: 'Great winds', cantonese: 'dai sei hei 大四喜', fan: 13, detail: 'Pongs of all four winds.' }], decomp);
  }

  const allTileKinds: TileKind[] = concealedTiles.slice();
  for (const m of melds) for (const t of m.tiles) allTileKinds.push(t.kind);

  const suitsUsed = new Set(allTileKinds.filter(isSuited).map((k) => suitOf(k)!));
  const hasHonors = allTileKinds.some(isHonor);
  const allPongs = decomp.kind === 'standard' && allSets.every((s) => s.type !== 'chow');
  const allChows = decomp.kind === 'standard' && melds.every((m) => m.type === 'chow') && decomp.sets.every((s) => s.type === 'chow');

  // ---- 10 fan ----
  if (allTileKinds.every(isHonor)) {
    items.push({ name: 'All honours', cantonese: 'zi yut sik 字一色', fan: 10, detail: 'Every tile is a wind or dragon.' });
  } else if (allTileKinds.every((k) => isTerminal(k))) {
    items.push({ name: 'Pure terminals', cantonese: 'ching yiu gau 清幺九', fan: 10, detail: 'Every tile is a 1 or a 9.' });
  }

  // Named hands subsume their component sets: a dragon pong inside Great
  // Dragons is not ALSO worth its 1 fan (the booklet's "points stack" is
  // about combining different achievements, not double-counting one).
  const greatDragons = decomp.kind === 'standard' && dragonPongs.length === 3;
  const smallDragons = decomp.kind === 'standard' && dragonPongs.length === 2 && !!eyes && isDragonKind(eyes!);
  const smallWinds = decomp.kind === 'standard' && windPongs.length === 3 && !!eyes && isWindKind(eyes!);
  const allHonours = allTileKinds.every(isHonor);

  // ---- 8 fan ----
  if (greatDragons) {
    items.push({ name: 'Great dragons', cantonese: 'dai saam yuen 大三元', fan: 8, detail: 'Pongs of all three dragons.' });
  }
  if (ctx.afterDoubleGong) {
    items.push({ name: 'Gong on gong win', fan: 8, detail: 'Two gongs in a row, then won on the replacement tile.' });
  }
  const concealedAllPongs = allPongs && ctx.concealed && melds.every((m) => m.concealed);
  if (concealedAllPongs) {
    items.push({ name: 'Concealed all pongs', cantonese: 'kan kan wu 坎坎糊', fan: 8, detail: 'A fully concealed hand made only of triplets.' });
  }

  // ---- 7 fan ----
  const pureOneSuit = suitsUsed.size === 1 && !hasHonors;
  if (pureOneSuit) {
    items.push({ name: 'Pure one suit', cantonese: 'ching yut sik 清一色', fan: 7, detail: 'Only one suit, no honours.' });
  }
  if (decomp.kind === 'sevenPairs') {
    items.push({ name: 'Seven pairs', cantonese: 'ts’at dui zi 七对子', fan: 7, detail: 'Seven pairs in a fully concealed hand.' });
  }

  // ---- 6 fan: small winds (3 wind pongs + wind eyes) ----
  if (smallWinds) {
    items.push({ name: 'Small winds', cantonese: 'siu sei hei 小四喜', fan: 6, detail: 'Pongs of three winds and a pair of the fourth.' });
  }

  // ---- 5 fan: small dragons (2 dragon pongs + dragon eyes) ----
  if (smallDragons) {
    items.push({ name: 'Small dragons', cantonese: 'siu saam yuen 小三元', fan: 5, detail: 'Pongs of two dragons and a pair of the third.' });
  }

  // ---- 3 fan ----
  if (allPongs && !concealedAllPongs && !items.some((i) => i.name === 'All honours' || i.name === 'Pure terminals')) {
    items.push({ name: 'All pongs', cantonese: 'dou dou wu 对对糊', fan: 3, detail: 'Every set is a triplet (or gong).' });
  }
  if (suitsUsed.size === 1 && hasHonors) {
    items.push({ name: 'Mixed one suit', cantonese: 'wun yut sik 混一色', fan: 3, detail: 'One suit plus honour tiles.' });
  }

  // ---- 1 fan bonuses ----
  // Mixed terminals: every set/eyes is honours or 1s/9s (but not the pure versions above)
  if (
    decomp.kind === 'standard' &&
    !items.some((i) => i.name === 'All honours' || i.name === 'Pure terminals') &&
    allTileKinds.every((k) => isHonor(k) || isTerminal(k))
  ) {
    items.push({ name: 'Mixed terminals', cantonese: 'wun yiu gau 混幺九', fan: 1, detail: 'Only 1s, 9s and honour tiles.' });
  }

  if (!greatDragons && !smallDragons && !allHonours) {
    for (const s of dragonPongs) {
      items.push({ name: `Dragon pong (${dragonName(s.kind0)})`, cantonese: 'faan pai 番牌', fan: 1, detail: 'A triplet of a dragon.' });
    }
  }
  if (!smallWinds && !allHonours) {
    for (const s of windPongs) {
      if (windOf(s.kind0) === ctx.seatWind) {
        items.push({ name: `Seat wind pong (${windName(s.kind0)})`, cantonese: 'faan pai 番牌', fan: 1, detail: 'A triplet of your own seat wind.' });
      }
    }
  }

  const gongs = allSets.filter((s) => s.type === 'gong').length;
  if (gongs > 0) items.push({ name: gongs === 1 ? 'Gong' : `${gongs} gongs`, fan: gongs, detail: 'One fan per four-of-a-kind.' });

  // Common hand (all chows). House rule: honour eyes void this fan.
  if (allChows && eyes && !isHonor(eyes)) {
    items.push({ name: 'Common hand', cantonese: 'ping wu 平糊', fan: 1, detail: 'Every set is a run of ascending numbers.' });
  }

  // Seven pairs is concealed by definition (a claim breaks the shape), so
  // the concealed-hand fan is one of its components — subsumed, not stacked.
  if (ctx.concealed && !concealedAllPongs && decomp.kind !== 'sevenPairs') items.push({ name: 'Concealed hand', cantonese: 'mun ching 门前清', fan: 1, detail: 'No sets claimed from discards before winning.' });
  if (ctx.selfDraw) items.push({ name: 'Self draw', cantonese: 'zi mo 自摸', fan: 1, detail: 'Drew the winning tile yourself.' });
  if (ctx.robbingGong) items.push({ name: 'Robbing the gong', cantonese: 'cheung gong 搶槓', fan: 1, detail: 'Won on a tile someone added to a gong.' });
  if (ctx.afterGong && !ctx.afterDoubleGong) items.push({ name: 'Win after gong', cantonese: 'gong seung zi mo 槓上自摸', fan: 1, detail: 'Won on the replacement tile after a gong.' });
  if (ctx.lastTile) items.push({ name: 'Last tile win', cantonese: 'hoi dai lao yuet 海底捞月', fan: 1, detail: 'Won on the very last tile of the wall.' });

  // Flowers
  if (flowers.length === 0) {
    items.push({ name: 'No flowers', fan: 1, detail: 'Finishing with no flower tiles is worth a point.' });
  } else {
    const seatN = seatNumber(ctx.seatWind);
    const seatFlowers = flowers.filter((f) => flowerSeatNumber(f) === seatN);
    for (const f of seatFlowers) {
      items.push({ name: 'Seat flower', fan: 1, detail: `Flower number ${seatN} matches your seat.` });
    }
    const groupA = flowers.filter((f) => Number(f.split('-')[1]) <= 4).length;
    const groupB = flowers.filter((f) => Number(f.split('-')[1]) >= 5).length;
    if (groupA === 4) items.push({ name: 'Full flower set', cantonese: 'yut toi fa 一台花', fan: 2, detail: 'All four flowers of one kind.' });
    if (groupB === 4) items.push({ name: 'Full flower set', cantonese: 'yut toi fa 一台花', fan: 2, detail: 'All four seasons of one kind.' });
  }

  const rawFan = items.reduce((a, i) => a + i.fan, 0);
  if (rawFan === 0) {
    items.push({
      name: 'Chicken hand', cantonese: 'gai wu 鸡糊', fan: 0,
      detail: 'A win with no scoring pattern — mixed runs and triplets across suits. It still wins, but only the base 1 chip.',
    });
  }
  const fan = Math.min(rawFan, LIMIT_FAN);
  return {
    fan, rawFan, items,
    limit: fan >= LIMIT_FAN,
    payout: payoutForFan(fan),
    decomp,
  };
}

function limitResult(items: FanItem[], decomp: WinDecomp): ScoreResult {
  return { fan: LIMIT_FAN, rawFan: LIMIT_FAN, items, limit: true, payout: payoutForFan(LIMIT_FAN), decomp };
}

export function dragonName(kind: TileKind): string {
  const d = kind.split('-')[1];
  return d === 'R' ? 'Red 中' : d === 'G' ? 'Green 發' : 'White';
}
export function windName(kind: TileKind): string {
  const w = kind.split('-')[1];
  return w === 'E' ? 'East 東' : w === 'S' ? 'South 南' : w === 'W' ? 'West 西' : 'North 北';
}
