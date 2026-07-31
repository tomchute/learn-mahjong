import { describe, it, expect } from 'vitest';
import { Game } from '../src/engine/game';
import { attachAi } from '../src/engine/ai';
import {
  opponentProfile, dangerTiles, unseenCount, provablySafeKinds, myWaitAnalysis,
} from '../src/engine/insight';
import { Tile } from '../src/engine/types';

let nextId = 5000;
const t = (kind: string): Tile => ({ id: nextId++, kind });

/** Force a specific concealed hand onto a player (test rigging). */
function rig(g: Game, player: number, kinds: string[], melds: { type: 'chow' | 'pong' | 'gong'; kinds: string[]; concealed?: boolean }[] = []) {
  const p = g.players[player];
  p.concealed = kinds.map(t);
  p.melds = melds.map((m) => ({
    type: m.type,
    tiles: m.kinds.map(t),
    claimedFrom: m.concealed ? null : (player + 1) % 4,
    concealed: !!m.concealed,
  }));
}

function freshGame(): Game {
  const g = new Game(42);
  attachAi(g);
  g.startHand();
  return g;
}

describe('insight', () => {
  it('flags a ready opponent and their waits as danger tiles', () => {
    const g = freshGame();
    // Priya (3): ready, waiting on chars-9 (pair wait on 4 sets)
    rig(g, 3, ['chars-9'], [
      { type: 'pong', kinds: ['dots-2', 'dots-2', 'dots-2'] },
      { type: 'pong', kinds: ['bamboo-3', 'bamboo-3', 'bamboo-3'] },
      { type: 'chow', kinds: ['chars-1', 'chars-2', 'chars-3'] },
      { type: 'chow', kinds: ['dots-5', 'dots-6', 'dots-7'] },
    ]);
    const danger = dangerTiles(g);
    expect(danger.has('chars-9')).toBe(true);
    expect(danger.get('chars-9')).toContain(3);

    const prof = opponentProfile(g, 3);
    expect(prof.ready).toBe(true);
    expect(prof.waits).toContain('chars-9');
    expect(prof.potentialFan).toBeGreaterThanOrEqual(0);
  });

  it('reads a flush build from melds + discards', () => {
    const g = freshGame();
    rig(g, 1, ['dots-1', 'dots-2', 'dots-3', 'dots-7', 'dots-7', 'bamboo-2', 'bamboo-9'], [
      { type: 'pong', kinds: ['dots-4', 'dots-4', 'dots-4'] },
      { type: 'chow', kinds: ['dots-5', 'dots-6', 'dots-7'] },
    ]);
    // discards mostly off-suit
    g.players[1].discards = [t('bamboo-5'), t('chars-2'), t('wind-N'), t('chars-8'), t('dots-9')];
    const prof = opponentProfile(g, 1);
    expect(prof.shape).toBe('pure-flush');
    expect(prof.shapeEvidence).toContain('dots');
  });

  it('reads all-pongs and counts visible fan for dragons/seat wind', () => {
    const g = freshGame();
    const seatWind = g.seatWind(2);
    rig(g, 2, ['chars-5', 'chars-5', 'bamboo-1', 'bamboo-2', 'bamboo-4', 'dots-8', 'dots-8'], [
      { type: 'pong', kinds: ['dragon-R', 'dragon-R', 'dragon-R'] },
      { type: 'gong', kinds: [`wind-${seatWind}`, `wind-${seatWind}`, `wind-${seatWind}`, `wind-${seatWind}`] },
    ]);
    const prof = opponentProfile(g, 2);
    expect(prof.shape).toBe('honors');
    // dragon pong (1) + seat wind (1) + gong (1)
    expect(prof.visibleFan).toBe(3);
  });

  it('unseenCount respects own hand, discards and exposed melds', () => {
    const g = freshGame();
    // count what the human can see of a kind we fully control
    const kind = 'dragon-G';
    // clear all sightings of dragon-G everywhere first
    for (const p of g.players) {
      p.concealed = p.concealed.filter((x) => x.kind !== kind);
      p.discards = p.discards.filter((x) => x.kind !== kind);
    }
    expect(unseenCount(g, kind)).toBe(4);
    g.players[0].concealed.push(t(kind));
    g.players[2].discards.push(t(kind));
    expect(unseenCount(g, kind)).toBe(2);
  });

  it('provablySafeKinds: only honours with all 4 accounted for', () => {
    const g = freshGame();
    const me = g.players[0];
    // give me 2 wind-N, put 2 in discards -> provably safe
    me.concealed = me.concealed.filter((x) => x.kind !== 'wind-N' && x.kind !== 'dots-5');
    for (const p of g.players) {
      p.concealed = p.concealed.filter((x) => x.kind !== 'wind-N' && x.kind !== 'dots-5');
      p.discards = p.discards.filter((x) => x.kind !== 'wind-N' && x.kind !== 'dots-5');
    }
    me.concealed.push(t('wind-N'), t('wind-N'));
    g.players[1].discards.push(t('wind-N'), t('wind-N'));
    // suited tile with all 4 visible must NOT count as provably safe (chow waits)
    me.concealed.push(t('dots-5'), t('dots-5'));
    g.players[2].discards.push(t('dots-5'), t('dots-5'));

    const safe = provablySafeKinds(g);
    expect(safe).toContain('wind-N');
    expect(safe).not.toContain('dots-5');
  });

  it('myWaitAnalysis reports waits with unseen counts and fan', () => {
    const g = freshGame();
    rig(g, 0, ['chars-9'], [
      { type: 'chow', kinds: ['dots-1', 'dots-2', 'dots-3'] },
      { type: 'chow', kinds: ['bamboo-4', 'bamboo-5', 'bamboo-6'] },
      { type: 'chow', kinds: ['chars-1', 'chars-2', 'chars-3'] },
      { type: 'chow', kinds: ['dots-5', 'dots-6', 'dots-7'] },
    ]);
    const waits = myWaitAnalysis(g);
    expect(waits.length).toBe(1);
    expect(waits[0].kind).toBe('chars-9');
    expect(waits[0].unseen).toBeGreaterThanOrEqual(0);
    expect(waits[0].unseen).toBeLessThanOrEqual(3);
    expect(waits[0].fan).toBeGreaterThanOrEqual(0);
    expect(waits[0].payout).toBe(2 ** Math.min(waits[0].fan, 13));
  });

  it('profiles never throw across full simulated games', () => {
    for (let seed = 1; seed <= 5; seed++) {
      const g = new Game(seed);
      g.players[0].isHuman = false;
      attachAi(g);
      g.startHand();
      let steps = 0;
      while (g.phase !== 'hand-end' && g.phase !== 'match-end' && steps++ < 2000) {
        g.step();
        for (let i = 1; i < 4; i++) opponentProfile(g, i);
        dangerTiles(g);
      }
    }
  });
});
