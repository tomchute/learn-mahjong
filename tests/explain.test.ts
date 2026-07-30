import { describe, it, expect } from 'vitest';
import { ALL_KINDS, Tile, TileKind, toCounts } from '../src/engine/types';
import { standardShanten, decomposeStandard, sevenPairsWin } from '../src/engine/hand';
import { bestStructure, explainWinStructure, explainMyHand } from '../src/engine/explain';
import { mulberry32, shuffle } from '../src/engine/rng';
import { Game } from '../src/engine/game';

function tiles(kinds: TileKind[], startId = 1000): Tile[] {
  return kinds.map((kind, i) => ({ id: startId + i, kind }));
}

describe('bestStructure', () => {
  it('matches standardShanten and conserves tiles on random hands', () => {
    const rng = mulberry32(20260730);
    const fullSet: TileKind[] = [];
    for (const k of ALL_KINDS) for (let i = 0; i < 4; i++) fullSet.push(k);

    for (let trial = 0; trial < 150; trial++) {
      const melds = trial % 3; // 0, 1 or 2 declared melds
      const handSize = 13 - melds * 3;
      const hand = shuffle(fullSet, rng).slice(0, handSize);
      const counts = toCounts(hand);
      const st = bestStructure(counts, melds);
      expect(st.shanten).toBe(standardShanten(counts, melds));
      const used =
        st.sets.length * 3 +
        st.partials.reduce((a, p) => a + p.kinds.length, 0) +
        (st.pair ? 2 : 0) +
        st.floaters.length;
      expect(used).toBe(handSize);
    }
  });

  it('reads a near-ready hand sensibly', () => {
    // 123 dots + 456 dots + 77 bamboo (eyes) + 89 bamboo partial + 11 chars partial
    const hand = [
      'dots-1', 'dots-2', 'dots-3', 'dots-4', 'dots-5', 'dots-6',
      'bamboo-7', 'bamboo-7', 'bamboo-8', 'bamboo-9',
      'chars-1', 'chars-1', 'wind-E',
    ];
    const st = bestStructure(toCounts(hand), 0);
    expect(st.shanten).toBe(1);
    // tie-break prefers the reading with the most complete sets:
    // 123 dots + 456 dots + 789 bamboo, chars-1 pair as eyes
    expect(st.sets.length).toBe(3);
    expect(st.pair).not.toBeNull();
  });
});

describe('explainWinStructure', () => {
  it('groups a standard win into 4 sets + the eyes', () => {
    const kinds = [
      'dots-1', 'dots-2', 'dots-3', 'dots-4', 'dots-5', 'dots-6',
      'bamboo-7', 'bamboo-8', 'bamboo-9',
      'chars-1', 'chars-1', 'chars-1', 'chars-9', 'chars-9',
    ];
    const hand = { concealed: tiles(kinds), melds: [], flowers: [] };
    const decomp = decomposeStandard(toCounts(kinds), 4)[0];
    const winTile = hand.concealed[hand.concealed.length - 1]; // a chars-9 (the eyes)
    const ex = explainWinStructure(hand, decomp, winTile);

    expect(ex.groups.length).toBe(5);
    expect(ex.groups.filter((g) => g.type === 'pair').length).toBe(1);
    const total = ex.groups.reduce((a, g) => a + (g.tiles?.length ?? 0), 0);
    expect(total).toBe(14);
    expect(ex.summary[0]).toContain('4 sets + a pair');
    expect(ex.summary.some((s) => s.includes('winning tile'))).toBe(true);
  });

  it('groups a seven-pairs win into 7 pairs', () => {
    const kinds = [
      'dots-1', 'dots-1', 'dots-3', 'dots-3', 'bamboo-5', 'bamboo-5',
      'chars-2', 'chars-2', 'chars-8', 'chars-8',
      'wind-E', 'wind-E', 'dragon-R', 'dragon-R',
    ];
    const decomp = sevenPairsWin(toCounts(kinds))!;
    const ex = explainWinStructure({ concealed: tiles(kinds), melds: [], flowers: [] }, decomp, null);
    expect(ex.groups.length).toBe(7);
    expect(ex.groups.every((g) => g.tiles!.length === 2)).toBe(true);
    expect(ex.summary[0]).toContain('Seven pairs');
  });
});

describe('explainMyHand', () => {
  function gameWithHand(kinds: TileKind[]): Game {
    const g = new Game(7);
    g.startHand();
    g.players[0].concealed = tiles(kinds);
    g.players[0].melds = [];
    g.players[0].flowers = [];
    return g;
  }

  it('recognises a ready hand and lists the waits', () => {
    const g = gameWithHand([
      'dots-1', 'dots-2', 'dots-3', 'dots-4', 'dots-5', 'dots-6',
      'bamboo-7', 'bamboo-8', 'bamboo-9',
      'chars-1', 'chars-1', 'chars-1', 'chars-9',
    ]);
    const ex = explainMyHand(g)!;
    expect(ex.headline).toContain('READY');
    expect(ex.details.some((d) => d.includes('Win on'))).toBe(true);
  });

  it('describes structure and opportunities for a developing hand', () => {
    const g = gameWithHand([
      'dots-1', 'dots-2', 'dots-3', 'dots-5', 'dots-6', 'dots-9',
      'dots-4', 'dots-4', 'dragon-R', 'dragon-R',
      'bamboo-2', 'wind-N', 'chars-7',
    ]);
    const ex = explainMyHand(g)!;
    expect(ex.headline).toMatch(/\d+ steps? from ready/);
    // structure line names the completed run
    expect(ex.details.some((d) => d.includes('run 1-2-3 of Circles'))).toBe(true);
    // dragon pair opportunity is surfaced
    expect(ex.details.some((d) => d.includes('Red 中'))).toBe(true);
  });

  it('suggests the seven-pairs route when it is clearly better', () => {
    const g = gameWithHand([
      'dots-1', 'dots-1', 'dots-4', 'dots-4', 'bamboo-2', 'bamboo-2',
      'chars-5', 'chars-5', 'wind-W', 'wind-W',
      'dragon-G', 'dragon-G', 'bamboo-8',
    ]);
    const ex = explainMyHand(g)!;
    expect(ex.details.some((d) => d.includes('Seven pairs'))).toBe(true);
  });
});
