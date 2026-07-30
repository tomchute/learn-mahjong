import { describe, it, expect } from 'vitest';
import { toCounts, ALL_KINDS, Counts, TileKind, Tile, isFlower } from '../src/engine/types';
import {
  isWinningHand, shanten, standardShanten, winningTiles,
  sevenPairsShanten, thirteenOrphansShanten,
} from '../src/engine/hand';
import { Game } from '../src/engine/game';
import { attachAi } from '../src/engine/ai';
import { Wall, buildDeck } from '../src/engine/tiles';
import { evaluateDiscard, suggestDiscard } from '../src/engine/feedback';

// ---------- deterministic rng ----------
function lcg(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}

// ---------- reference (brute force by definition) ----------
// distance = min over winning 14-multisets W (with W[k]<=4) of |W \ H|
// standard shanten_ref = distance - 1

interface SetType { needs: [number, number][] }
const SET_TYPES: SetType[] = (() => {
  const out: SetType[] = [];
  for (let k = 0; k < 34; k++) out.push({ needs: [[k, 3]] });
  for (let s = 0; s < 3; s++)
    for (let r = 0; r < 7; r++) {
      const b = s * 9 + r;
      out.push({ needs: [[b, 1], [b + 1, 1], [b + 2, 1]] });
    }
  return out;
})();

function refStandardDist(counts: Counts, needSets: number): number {
  let best = Infinity;
  const used = new Array(34).fill(0);
  const addKind = (k: number, n: number): number => {
    const excessBefore = Math.max(0, used[k] - counts[k]);
    used[k] += n;
    return Math.max(0, used[k] - counts[k]) - excessBefore;
  };
  const dfs = (si: number, remaining: number, deficit: number) => {
    if (deficit >= best) return;
    if (remaining === 0) { best = deficit; return; }
    for (let s = si; s < SET_TYPES.length; s++) {
      const st = SET_TYPES[s];
      let ok = true;
      for (const [k, n] of st.needs) if (used[k] + n > 4) { ok = false; break; }
      if (!ok) continue;
      let add = 0;
      for (const [k, n] of st.needs) add += addKind(k, n);
      dfs(s, remaining - 1, deficit + add);
      for (const [k, n] of st.needs) used[k] -= n;
    }
  };
  for (let e = 0; e < 34; e++) {
    if (used[e] + 2 > 4) continue;
    const add = addKind(e, 2);
    dfs(0, needSets, add);
    used[e] -= 2;
  }
  return best;
}

// seven pairs per the repo's OWN win rule (quad = two pairs, sevenPairsWin)
function ref7pDist(counts: Counts): number {
  const slots: number[] = [];
  for (let k = 0; k < 34; k++) {
    slots.push(Math.min(2, counts[k]));                    // 1st pair of kind k
    slots.push(Math.min(2, Math.max(0, counts[k] - 2)));   // 2nd pair (quad)
  }
  slots.sort((a, b) => b - a);
  const coverage = slots.slice(0, 7).reduce((a, b) => a + b, 0);
  return 14 - coverage;
}

const ORPHANS = ['dots-1', 'dots-9', 'bamboo-1', 'bamboo-9', 'chars-1', 'chars-9',
  'wind-E', 'wind-S', 'wind-W', 'wind-N', 'dragon-R', 'dragon-G', 'dragon-B']
  .map((k) => ALL_KINDS.indexOf(k));
function ref13oDist(counts: Counts): number {
  let cov = 0; let pair = 0;
  for (const k of ORPHANS) {
    if (counts[k] > 0) cov++;
    if (counts[k] >= 2) pair = 1;
  }
  return 14 - cov - pair;
}

function refShanten(counts: Counts, declaredMelds: number): number {
  let d = refStandardDist(counts, 4 - declaredMelds);
  if (declaredMelds === 0) d = Math.min(d, ref7pDist(counts), ref13oDist(counts));
  return d - 1;
}

// ---------- hand generators ----------
function randomHand(rng: () => number, size: number): TileKind[] {
  const c = new Array(34).fill(0);
  const out: TileKind[] = [];
  while (out.length < size) {
    const k = Math.floor(rng() * 34);
    if (c[k] < 4) { c[k]++; out.push(ALL_KINDS[k]); }
  }
  return out;
}
function biasedHand(rng: () => number, size: number): TileKind[] {
  // build from random fragments (sets, partials, pairs) then trim/fill
  const c = new Array(34).fill(0);
  const out: TileKind[] = [];
  const tryAdd = (ks: number[]) => {
    const tmp: Record<number, number> = {};
    for (const k of ks) tmp[k] = (tmp[k] ?? 0) + 1;
    for (const k of ks) if (k < 0 || k >= 34 || c[k] + tmp[k] > 4) return;
    for (const k of ks) { c[k]++; out.push(ALL_KINDS[k]); }
  };
  while (out.length < size) {
    const roll = rng();
    if (roll < 0.35) {
      const s = Math.floor(rng() * 3), r = Math.floor(rng() * 7);
      tryAdd([s * 9 + r, s * 9 + r + 1, s * 9 + r + 2]);
    } else if (roll < 0.55) {
      const k = Math.floor(rng() * 34);
      tryAdd([k, k, k]);
    } else if (roll < 0.8) {
      const k = Math.floor(rng() * 34);
      tryAdd([k, k]);
    } else {
      const k = Math.floor(rng() * 34);
      tryAdd([k]);
    }
  }
  while (out.length > size) { const k = out.pop()!; c[ALL_KINDS.indexOf(k)]--; }
  return out;
}
function randomWinningStandard(rng: () => number): TileKind[] | null {
  const c = new Array(34).fill(0);
  const out: TileKind[] = [];
  for (let tries = 0; tries < 50; tries++) {
    c.fill(0); out.length = 0;
    let ok = true;
    for (let s = 0; s < 4 && ok; s++) {
      if (rng() < 0.5) {
        const k = Math.floor(rng() * 34);
        if (c[k] + 3 > 4) { ok = false; break; }
        c[k] += 3; out.push(ALL_KINDS[k], ALL_KINDS[k], ALL_KINDS[k]);
      } else {
        const su = Math.floor(rng() * 3), r = Math.floor(rng() * 7);
        const b = su * 9 + r;
        if (c[b] >= 4 || c[b + 1] >= 4 || c[b + 2] >= 4) { ok = false; break; }
        c[b]++; c[b + 1]++; c[b + 2]++;
        out.push(ALL_KINDS[b], ALL_KINDS[b + 1], ALL_KINDS[b + 2]);
      }
    }
    if (!ok) continue;
    const e = Math.floor(rng() * 34);
    if (c[e] + 2 > 4) continue;
    out.push(ALL_KINDS[e], ALL_KINDS[e]);
    return out;
  }
  return null;
}

// ---------- TESTS ----------

describe('shanten vs brute force', () => {
  it('standardShanten matches reference on random 13-tile hands', () => {
    const rng = lcg(1234);
    const bad: string[] = [];
    for (let n = 0; n < 400; n++) {
      const hand = n % 2 === 0 ? randomHand(rng, 13) : biasedHand(rng, 13);
      const counts = toCounts(hand);
      const got = standardShanten(counts, 0);
      const want = refStandardDist(counts, 4) - 1;
      if (got !== want) bad.push(`${hand.sort().join(',')} got=${got} want=${want}`);
    }
    expect(bad, bad.slice(0, 5).join('\n')).toEqual([]);
  });

  it('standardShanten matches reference with declared melds (10/7/4/1-tile hands)', () => {
    const rng = lcg(77);
    const bad: string[] = [];
    for (let n = 0; n < 300; n++) {
      const melds = 1 + (n % 4); // 1..4? 4 melds -> 1 concealed tile
      const size = 13 - 3 * melds;
      if (size < 1) continue;
      const hand = n % 2 === 0 ? randomHand(rng, size) : biasedHand(rng, size);
      const counts = toCounts(hand);
      const got = standardShanten(counts, melds);
      const want = refStandardDist(counts, 4 - melds) - 1;
      if (got !== want) bad.push(`melds=${melds} ${hand.sort().join(',')} got=${got} want=${want}`);
    }
    expect(bad, bad.slice(0, 5).join('\n')).toEqual([]);
  });

  it('overall shanten matches reference (incl 7 pairs & orphans) on 13-tile hands', () => {
    const rng = lcg(999);
    const bad: string[] = [];
    for (let n = 0; n < 400; n++) {
      const hand = n % 2 === 0 ? randomHand(rng, 13) : biasedHand(rng, 13);
      const counts = toCounts(hand);
      const got = shanten(hand, 0);
      const want = refShanten(counts, 0);
      if (got !== want) bad.push(`${hand.sort().join(',')} got=${got} want=${want}`);
    }
    expect(bad, bad.slice(0, 8).join('\n')).toEqual([]);
  });

  it('shanten() === -1 exactly when isWinningHand() on 14-tile hands', () => {
    const rng = lcg(555);
    const bad: string[] = [];
    const check = (hand: TileKind[]) => {
      const win = isWinningHand(hand, 0);
      const sh = shanten(hand, 0);
      if (win !== (sh === -1)) {
        bad.push(`${hand.slice().sort().join(',')} win=${win} shanten=${sh}`);
      }
    };
    for (let n = 0; n < 200; n++) {
      const w = randomWinningStandard(rng);
      if (w) {
        check(w);
        // mutate one tile
        const m = w.slice();
        const c = toCounts(m);
        let k = Math.floor(rng() * 34);
        while (c[ALL_KINDS.indexOf(m[0])] === undefined) break;
        for (let t = 0; t < 20; t++) { k = Math.floor(rng() * 34); if (c[k] < 4) break; }
        if (c[k] < 4) { m[Math.floor(rng() * 14)] = ALL_KINDS[k]; check(m); }
      }
      check(randomHand(rng, 14));
      check(biasedHand(rng, 14));
    }
    // targeted: seven pairs with quads (repo's own rule says this is a WIN)
    check(['dots-1','dots-1','dots-1','dots-1','bamboo-5','bamboo-5','bamboo-5','bamboo-5',
      'chars-7','chars-7','chars-7','chars-7','wind-E','wind-E']);
    check(['dots-1','dots-1','dots-1','dots-1','bamboo-5','bamboo-5',
      'chars-7','chars-7','wind-E','wind-E','wind-N','wind-N','dragon-G','dragon-G']);
    expect(bad, bad.slice(0, 8).join('\n')).toEqual([]);
  });

  it('winningTiles non-empty iff a winning tile exists; consistent with shanten==0', () => {
    const rng = lcg(31337);
    const bad: string[] = [];
    for (let n = 0; n < 400; n++) {
      const hand = n % 2 === 0 ? randomHand(rng, 13) : biasedHand(rng, 13);
      const counts = toCounts(hand);
      const waits = winningTiles(hand, 0);
      // definition check
      const def: TileKind[] = [];
      for (let k = 0; k < 34; k++) {
        if (counts[k] >= 4) continue;
        if (isWinningHand([...hand, ALL_KINDS[k]], 0)) def.push(ALL_KINDS[k]);
      }
      if (JSON.stringify(waits) !== JSON.stringify(def)) {
        bad.push(`DEF ${hand.sort().join(',')} got=${waits} def=${def}`);
      }
      const sh = shanten(hand, 0);
      if ((waits.length > 0) !== (sh === 0)) {
        bad.push(`SH ${hand.slice().sort().join(',')} waits=${waits.length} shanten=${sh}`);
      }
    }
    // targeted: three concealed quads + one single (ready for 7-pairs-with-quads win)
    const trip4 = ['dots-1','dots-1','dots-1','dots-1','bamboo-5','bamboo-5','bamboo-5','bamboo-5',
      'chars-7','chars-7','chars-7','chars-7','wind-E'];
    const w2 = winningTiles(trip4, 0);
    const sh2 = shanten(trip4, 0);
    if ((w2.length > 0) !== (sh2 === 0)) bad.push(`QUAD13 waits=${JSON.stringify(w2)} shanten=${sh2}`);
    expect(bad, bad.slice(0, 8).join('\n')).toEqual([]);
  });
});

describe('game state machine fuzz', () => {
  function countAllTiles(g: Game): number {
    let n = g.players.reduce(
      (a, p) => a + p.concealed.length + p.melds.reduce((b, m) => b + m.tiles.length, 0)
        + p.flowers.length + p.discards.length, 0);
    n += g.wall.remaining;
    const pag = (g as any).pendingAddedGong;
    if (pag) n += 1; // tile in limbo during rob prompt
    return n;
  }

  it('all-AI matches: many seeds, invariants each hand', () => {
    for (let seed = 100; seed < 112; seed++) {
      const g = new Game(seed);
      g.players[0].isHuman = false;
      attachAi(g);
      g.startHand();
      let hands = 0;
      while (!g.matchOver) {
        let steps = 0;
        while (g.phase !== 'hand-end' && g.phase !== 'match-end') {
          const acted = g.step();
          if (!acted) throw new Error(`seed ${seed}: blocked in ${g.phase} turn ${g.turn}`);
          if (++steps > 3000) throw new Error(`seed ${seed}: hand did not terminate`);
        }
        expect(countAllTiles(g), `seed ${seed} tile conservation`).toBe(144);
        hands++;
        if (hands > 300) throw new Error(`seed ${seed}: match did not terminate`);
        g.proceed();
      }
      expect(g.players.reduce((a, p) => a + p.chips, 0)).toBe(2000);
    }
  }, 120000);

  it('human-sim fuzz: random human claims/passes/robs/gongs, no deadlock, tiles conserved', () => {
    for (let seed = 1; seed <= 20; seed++) {
      const rng = lcg(seed * 7919);
      const g = new Game(seed);
      attachAi(g); // seat 0 stays human
      g.startHand();
      let hands = 0;
      while (!g.matchOver && hands < 60) {
        let steps = 0;
        while (g.phase !== 'hand-end' && g.phase !== 'match-end') {
          if (++steps > 5000) throw new Error(`seed ${seed}: hand did not terminate (phase ${g.phase}, turn ${g.turn})`);
          if (g.phase === 'awaiting-claims') {
            if (g.isRobbingPrompt) {
              g.humanClaim(rng() < 0.5 ? 'win' : 'pass');
            } else {
              const o = g.humanClaimOptions!;
              const choices: any[] = ['pass'];
              if (o.win) choices.push('win');
              if (o.pong) choices.push('pong');
              if (o.gong) choices.push('gong');
              for (const ch of o.chows) choices.push({ chow: ch });
              const pick = choices[Math.floor(rng() * choices.length)];
              if (typeof pick === 'string') g.humanClaim(pick as any);
              else g.humanClaim('chow', pick.chow);
            }
            const total = countAllTiles(g);
            if (total !== 144) throw new Error(`seed ${seed}: tiles=${total} after human claim`);
            continue;
          }
          const acted = g.step();
          if (!acted) {
            // must be human's discard turn
            if (g.phase !== 'awaiting-discard' || g.turn !== 0) {
              throw new Error(`seed ${seed}: deadlock in ${g.phase} turn ${g.turn}`);
            }
            const p = g.players[0];
            if (g.canSelfWin(0) && rng() < 0.7) { g.declareSelfWin(0); continue; }
            const cg = g.concealedGongOptions(0);
            if (cg.length && rng() < 0.5) { g.declareConcealedGong(0, cg[0]); continue; }
            const ag = g.addedGongOptions(0);
            if (ag.length && rng() < 0.7) { g.declareAddedGong(0, ag[0]); continue; }
            const tile = p.concealed[Math.floor(rng() * p.concealed.length)];
            // exercise feedback paths too
            evaluateDiscard(g, tile);
            suggestDiscard(g);
            g.discard(tile.id);
          }
          const total = countAllTiles(g);
          if (total !== 144) throw new Error(`seed ${seed}: tiles=${total} phase=${g.phase}`);
        }
        hands++;
        g.proceed();
      }
    }
  }, 240000);

  it('eight flowers dealt at hand start triggers the instant win', () => {
    // Rig the wall: dealer (player 0)'s first draw positions get all 8 flowers.
    // Deal order is round-robin from dealer: positions 0,4,8,... go to player 0.
    const deck = buildDeck();
    const flowers = deck.filter((t) => isFlower(t.kind));
    const rest = deck.filter((t) => !isFlower(t.kind));
    // Interleave: player 0's first 8 deal draws are flowers.
    const arranged: Tile[] = [];
    let fi = 0, ri = 0;
    for (let pos = 0; arranged.length < deck.length - 0 && (fi < flowers.length || ri < rest.length); pos++) {
      if (pos % 4 === 0 && fi < flowers.length) arranged.push(flowers[fi++]);
      else arranged.push(rest[ri++]);
    }
    const orig = Wall.create;
    (Wall as any).create = () => new Wall(arranged);
    try {
      const g = new Game(1);
      g.players[0].isHuman = false;
      attachAi(g);
      g.startHand();
      expect(g.players[0].flowers.length).toBe(8);
      // the hand must already be over with the 8-flower instant win
      expect(g.phase).toBe('hand-end');
      expect(g.handResult?.winner).toBe(0);
      expect(g.handResult?.score?.fan).toBe(8);
    } finally {
      (Wall as any).create = orig;
    }
  });
});
