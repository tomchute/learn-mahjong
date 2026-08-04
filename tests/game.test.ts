import { describe, it, expect } from 'vitest';
import { Game } from '../src/engine/game';
import { attachAi, chooseDiscard, DEFAULT_PERSONALITIES } from '../src/engine/ai';
import { isFlower } from '../src/engine/types';

/** Make every seat AI-driven so games run to completion unattended. */
function allAiGame(seed: number): Game {
  const g = new Game(seed);
  g.players[0].isHuman = false;
  attachAi(g);
  // also route "human" seat 0 through the AI hooks
  return g;
}

function playFullHand(g: Game, maxSteps = 2000): void {
  let steps = 0;
  while (g.phase !== 'hand-end' && g.phase !== 'match-end') {
    const acted = g.step();
    if (!acted) {
      throw new Error(`game blocked in phase ${g.phase} turn ${g.turn}`);
    }
    if (++steps > maxSteps) throw new Error('hand did not terminate');
  }
}

describe('game flow', () => {
  it('deals 13 tiles to each player and 14 to the dealer', () => {
    const g = allAiGame(42);
    g.startHand();
    for (let i = 0; i < 4; i++) {
      const p = g.players[i];
      const expected = i === g.dealer ? 14 : 13;
      expect(p.concealed.length).toBe(expected);
      // no flowers left in any concealed hand
      expect(p.concealed.some((t) => isFlower(t.kind))).toBe(false);
    }
    expect(g.phase).toBe('awaiting-discard');
    expect(g.turn).toBe(g.dealer);
  });

  it('total tiles are conserved during a hand', () => {
    const g = allAiGame(7);
    g.startHand();
    playFullHand(g);
    const inHands = g.players.reduce(
      (a, p) => a + p.concealed.length + p.melds.reduce((b, m) => b + m.tiles.length, 0) + p.flowers.length + p.discards.length,
      0,
    );
    expect(inHands + g.wall.remaining).toBe(144);
  });

  it('plays many full hands to completion without errors', () => {
    for (let seed = 1; seed <= 30; seed++) {
      const g = allAiGame(seed);
      g.startHand();
      expect(() => playFullHand(g)).not.toThrow();
      expect(g.handResult).not.toBeNull();
      const r = g.handResult!;
      if (r.winner !== null) {
        expect(r.score).not.toBeNull();
        expect(r.score!.fan).toBeGreaterThanOrEqual(0);
        expect(r.score!.fan).toBeLessThanOrEqual(13);
        // payments zero-sum
        expect(r.payments.reduce((a, b) => a + b, 0)).toBe(0);
      }
    }
  });

  it('plays a full 4-round match to completion', () => {
    const g = allAiGame(123);
    g.startHand();
    let hands = 0;
    while (!g.matchOver) {
      playFullHand(g);
      hands++;
      if (hands > 200) throw new Error('match did not terminate');
      g.proceed();
    }
    expect(hands).toBeGreaterThanOrEqual(16);
    // chips conserved: started at 500 each
    expect(g.players.reduce((a, p) => a + p.chips, 0)).toBe(2000);
  });

  it('seat winds rotate with the dealer', () => {
    const g = allAiGame(5);
    g.startHand();
    expect(g.seatWind(g.dealer)).toBe('E');
    expect(g.seatWind((g.dealer + 1) % 4)).toBe('S');
    expect(g.seatWind((g.dealer + 2) % 4)).toBe('W');
    expect(g.seatWind((g.dealer + 3) % 4)).toBe('N');
  });

  it('chow is only offered to the next player', () => {
    // construct: current player discards a suited tile; ensure claimOptionsFor
    // gives chows only when (from+1)%4 === player
    const g = allAiGame(99);
    g.startHand();
    const from = g.turn;
    const tile = { id: 9999, kind: 'dots-5' };
    for (let i = 0; i < 4; i++) {
      if (i === from) continue;
      const opts = g.claimOptionsFor(i, tile as any, from);
      if (i !== (from + 1) % 4) {
        expect(opts.chows.length).toBe(0);
      }
    }
  });

  it('gongs and self-wins require an actual draw (not a claim-gained turn)', () => {
    const g = allAiGame(77);
    g.startHand();
    // dealer's untouched opening hand: gong/self-win gates open
    expect((g as any).hasDrawnOrOpeningHand(g.dealer)).toBe(true);

    // simulate a claim-gained turn: it's my discard turn but nothing was drawn
    const p = (g.dealer + 1) % 4;
    g.turn = p;
    g.phase = 'awaiting-discard';
    (g as any).drawnTile = null;
    (g as any).discardsThisHand = 1; // past the opening
    // rig four of a kind in hand + an exposed pong with the 4th in hand
    g.players[p].concealed = [
      { id: 9001, kind: 'dots-5' }, { id: 9002, kind: 'dots-5' },
      { id: 9003, kind: 'dots-5' }, { id: 9004, kind: 'dots-5' },
      { id: 9005, kind: 'bamboo-2' },
    ] as any;
    g.players[p].melds = [{
      type: 'pong',
      tiles: [{ id: 9101, kind: 'bamboo-2' }, { id: 9102, kind: 'bamboo-2' }, { id: 9103, kind: 'bamboo-2' }] as any,
      claimedFrom: (p + 1) % 4,
      concealed: false,
    }, {
      type: 'pong',
      tiles: [{ id: 9104, kind: 'chars-3' }, { id: 9105, kind: 'chars-3' }, { id: 9106, kind: 'chars-3' }] as any,
      claimedFrom: (p + 1) % 4,
      concealed: false,
    }];
    expect(g.concealedGongOptions(p)).toEqual([]);
    expect(g.addedGongOptions(p)).toEqual([]);
    expect(g.canSelfWin(p)).toBe(false);
    // declares are no-ops without the draw
    const meldsBefore = g.players[p].melds.length;
    g.declareConcealedGong(p, 'dots-5');
    g.declareAddedGong(p, 'bamboo-2');
    expect(g.players[p].melds.length).toBe(meldsBefore);

    // after an actual draw, the same holdings unlock the options
    (g as any).drawnTile = g.players[p].concealed[4];
    expect(g.concealedGongOptions(p)).toEqual(['dots-5']);
    expect(g.addedGongOptions(p)).toEqual(['bamboo-2']);
  });

  it('humanClaim validates against the offered options', () => {
    const g = allAiGame(55);
    g.players[0].isHuman = true;
    g.startHand();
    // force a claim window where the human can only pass
    (g as any).phase = 'awaiting-claims';
    (g as any).lastDiscard = { tile: { id: 8888, kind: 'dots-5' }, from: 3 };
    g.humanClaimOptions = { win: false, pong: false, gong: false, chows: [] };
    const chipsBefore = g.players.map((p) => p.chips);
    const meldsBefore = g.players[0].melds.length;

    g.humanClaim('win');   // phantom win must be rejected
    expect(g.handResult).toBeNull();
    g.humanClaim('gong');  // undersized gong must be rejected
    expect(g.players[0].melds.length).toBe(meldsBefore);
    g.humanClaim('chow', { kinds: ['dots-4', 'dots-5', 'dots-6'] });
    expect(g.players[0].melds.length).toBe(meldsBefore);
    expect(g.players.map((p) => p.chips)).toEqual(chipsBefore);
    expect(g.phase).toBe('awaiting-claims'); // window still open, only pass proceeds
  });

  it('gongs are not offered when the wall is empty', () => {
    const g = allAiGame(66);
    g.startHand();
    const p = g.turn;
    // give the current player a quad + drain the wall
    g.players[p].concealed = [
      { id: 9601, kind: 'dots-5' }, { id: 9602, kind: 'dots-5' },
      { id: 9603, kind: 'dots-5' }, { id: 9604, kind: 'dots-5' },
      { id: 9605, kind: 'bamboo-2' },
    ] as any;
    (g as any).drawnTile = g.players[p].concealed[4];
    while (g.wall.remaining > 0) g.wall.drawFront();
    expect(g.concealedGongOptions(p)).toEqual([]);
    // claim-gong from a discard is also blocked (holder has 3 copies)
    const q = (p + 1) % 4;
    g.players[q].concealed = [
      { id: 9611, kind: 'chars-2' }, { id: 9612, kind: 'chars-2' },
      { id: 9613, kind: 'chars-2' }, { id: 9614, kind: 'wind-N' },
    ] as any;
    const opts = g.claimOptionsFor(q, { id: 9700, kind: 'chars-2' } as any, p);
    expect(opts.pong).toBe(true);   // pong needs no replacement — still legal
    expect(opts.gong).toBe(false);  // gong blocked with no wall
  });

  it('ai discard choice always returns a real tile', () => {
    const g = allAiGame(11);
    g.startHand();
    const id = chooseDiscard(g, g.turn, DEFAULT_PERSONALITIES[1]);
    expect(g.players[g.turn].concealed.some((t) => t.id === id)).toBe(true);
  });
});
