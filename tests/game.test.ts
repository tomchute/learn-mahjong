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

  it('ai discard choice always returns a real tile', () => {
    const g = allAiGame(11);
    g.startHand();
    const id = chooseDiscard(g, g.turn, DEFAULT_PERSONALITIES[1]);
    expect(g.players[g.turn].concealed.some((t) => t.id === id)).toBe(true);
  });
});
