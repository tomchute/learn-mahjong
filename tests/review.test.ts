import { describe, it, expect } from 'vitest';
import { Game } from '../src/engine/game';
import { attachAi } from '../src/engine/ai';
import { recordDiscard, recordClaim, buildHandReview, HandLogEntry } from '../src/engine/review';
import { Tile } from '../src/engine/types';

let nextId = 7000;
const t = (kind: string): Tile => ({ id: nextId++, kind });

function freshGame(): Game {
  const g = new Game(11);
  attachAi(g);
  g.startHand();
  return g;
}

describe('hand review', () => {
  it('flags a passed win as critical with its fan value', () => {
    const g = freshGame();
    const me = g.players[0];
    // ready pair-wait hand: 4 chows + lone chars-9
    me.concealed = ['dots-1', 'dots-2', 'dots-3', 'bamboo-4', 'bamboo-5', 'bamboo-6',
      'chars-1', 'chars-2', 'chars-3', 'dots-7', 'dots-8', 'dots-9', 'chars-9'].map(t);
    me.melds = [];
    const opts = g.claimOptionsFor(0, t('chars-9'), 3);
    expect(opts.win).toBe(true);
    const entry = recordClaim(g, opts, t('chars-9'), 'pass', undefined, 3, false);
    expect(entry.missedWinFan).not.toBeNull();

    const log: HandLogEntry[] = [entry];
    (g as any).phase = 'hand-end';
    (g as any).handResult = {
      winner: 2, from: 1, score: { fan: 1, payout: 2, items: [], rawFan: 1, limit: false, decomp: null },
      payments: [0, -2, 2, 0], winningTile: null, winnerHand: null, seatWinds: ['E', 'S', 'W', 'N'],
    };
    const review = buildHandReview(g, log);
    const critical = review.moments.find((m) => m.severity === 'critical');
    expect(critical).toBeTruthy();
    expect(critical!.title).toContain('passed a winning tile');
  });

  it('flags dealing into the winner and lists safe alternatives held', () => {
    const g = freshGame();
    const me = g.players[0];
    // rig an opponent to be ready waiting on chars-9 (pair wait)
    g.players[2].concealed = [t('chars-9')];
    g.players[2].melds = [
      { type: 'pong', tiles: ['dots-2', 'dots-2', 'dots-2'].map(t), claimedFrom: 1, concealed: false },
      { type: 'pong', tiles: ['bamboo-3', 'bamboo-3', 'bamboo-3'].map(t), claimedFrom: 1, concealed: false },
      { type: 'chow', tiles: ['chars-1', 'chars-2', 'chars-3'].map(t), claimedFrom: 1, concealed: false },
      { type: 'chow', tiles: ['dots-5', 'dots-6', 'dots-7'].map(t), claimedFrom: 1, concealed: false },
    ];
    // human hand holds the dangerous chars-9 and some safe tiles
    me.concealed = ['chars-9', 'dots-1', 'dots-2', 'dots-3', 'bamboo-7', 'bamboo-8', 'bamboo-9',
      'wind-E', 'wind-E', 'dragon-R', 'dragon-R', 'chars-5', 'chars-6', 'chars-7'].map(t);
    const tile = me.concealed[0];
    const entry = recordDiscard(g, tile, 5);
    expect(entry.dealtInto).toContain(2);
    expect(entry.safeHeld.length).toBeGreaterThan(0);

    (g as any).phase = 'hand-end';
    (g as any).handResult = {
      winner: 2, from: 0, score: { fan: 3, payout: 8, items: [], rawFan: 3, limit: false, decomp: null },
      payments: [-8, 0, 8, 0], winningTile: tile, winnerHand: null, seatWinds: ['E', 'S', 'W', 'N'],
    };
    const review = buildHandReview(g, [entry]);
    const dealIn = review.moments.find((m) => m.title.includes('fed'));
    expect(dealIn).toBeTruthy();
    expect(dealIn!.severity).toBe('critical');
    expect(dealIn!.detail).toContain('you also held');
    expect(review.takeaway.length).toBeGreaterThan(10);
  });

  it('flags an efficiency loss with the better discard named', () => {
    const g = freshGame();
    const me = g.players[0];
    // 14 tiles where discarding a joint tile is clearly worse than the floater
    me.concealed = ['dots-1', 'dots-2', 'dots-3', 'bamboo-4', 'bamboo-5', 'bamboo-6',
      'chars-1', 'chars-2', 'chars-3', 'dots-7', 'dots-8', 'dots-9', 'bamboo-2', 'wind-N'].map(t);
    // discarding bamboo-2... actually discard dots-8 (breaks a finished run)
    const tile = me.concealed.find((x) => x.kind === 'dots-8')!;
    const entry = recordDiscard(g, tile, 2);
    expect(entry.fb.shantenAfter).toBeGreaterThan(entry.fb.bestAfter);

    (g as any).phase = 'hand-end';
    (g as any).handResult = {
      winner: 1, from: 3, score: { fan: 0, payout: 1, items: [], rawFan: 0, limit: false, decomp: null },
      payments: [0, 1, 0, -1], winningTile: null, winnerHand: null, seatWinds: ['E', 'S', 'W', 'N'],
    };
    const review = buildHandReview(g, [entry]);
    const loss = review.moments.find((m) => m.title.includes('cost you tempo'));
    expect(loss).toBeTruthy();
  });

  it('builds reviews without throwing across simulated games with random human logs', () => {
    for (let seed = 30; seed < 36; seed++) {
      const g = new Game(seed);
      attachAi(g);
      g.startHand();
      const log: HandLogEntry[] = [];
      let turn = 0;
      let steps = 0;
      const rng = () => Math.abs(Math.sin(seed * 997 + steps));
      while (g.phase !== 'hand-end' && g.phase !== 'match-end' && steps++ < 3000) {
        if (g.phase === 'awaiting-claims') {
          const opts = g.humanClaimOptions!;
          if (g.lastDiscard) log.push(recordClaim(g, opts, g.lastDiscard.tile, 'pass', undefined, turn, g.isRobbingPrompt));
          g.humanClaim('pass');
          continue;
        }
        const acted = g.step();
        if (!acted && g.phase === 'awaiting-discard' && g.turn === 0) {
          if (g.canSelfWin(0) && rng() < 0.5) { g.declareSelfWin(0); continue; }
          const p = g.players[0];
          const tile = p.concealed[Math.floor(rng() * p.concealed.length)];
          log.push(recordDiscard(g, tile, ++turn));
          g.discard(tile.id);
        }
      }
      if (g.phase === 'hand-end') {
        const review = buildHandReview(g, log);
        expect(review.outcome.length).toBeGreaterThan(0);
        expect(review.takeaway.length).toBeGreaterThan(0);
      }
    }
  });
});
