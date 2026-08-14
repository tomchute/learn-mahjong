import { describe, it, expect } from 'vitest';
import { Game } from '../src/engine/game';
import { attachAi } from '../src/engine/ai';
import {
  detectPlans, annotateWaits, waitLine, waitWarnings, waitOverlapWarnings, suitCollectors,
} from '../src/engine/planner';
import { suggestDiscard, evaluateDiscard } from '../src/engine/feedback';
import { Tile } from '../src/engine/types';

let nextId = 9000;
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

/** Remove every copy of `kind` from all hands/discards so counts start clean. */
function purge(g: Game, kind: string) {
  for (const p of g.players) {
    p.concealed = p.concealed.filter((x) => x.kind !== kind);
    p.discards = p.discards.filter((x) => x.kind !== kind);
  }
}

describe('planner: hand plans', () => {
  it('detects a mixed one-suit plan and lists the off-plan tiles', () => {
    const g = freshGame();
    rig(g, 0, [
      'chars-1', 'chars-2', 'chars-3', 'chars-5', 'chars-5', 'chars-7', 'chars-8', 'chars-9',
      'wind-E', 'wind-E', 'dragon-R',
      'dots-4', 'bamboo-6',
    ]);
    const mixed = detectPlans(g).find((p) => p.id === 'mixed-flush');
    expect(mixed).toBeDefined();
    expect(mixed!.suit).toBe('chars');
    expect(mixed!.fan).toBe(3);
    expect(mixed!.offPlan.sort()).toEqual(['bamboo-6', 'dots-4']);
    expect(mixed!.strong).toBe(true); // 11 of 13 fit
    expect(mixed!.detail).toContain('11 of your 13 tiles');
  });

  it('prefers pure one suit when the hand is nearly single-suited', () => {
    const g = freshGame();
    rig(g, 0, [
      'dots-1', 'dots-2', 'dots-3', 'dots-4', 'dots-4', 'dots-5', 'dots-6', 'dots-7',
      'dots-8', 'dots-8', 'dots-9', 'dots-9',
      'bamboo-2',
    ]);
    const plans = detectPlans(g);
    const pure = plans.find((p) => p.id === 'pure-flush');
    expect(pure).toBeDefined();
    expect(pure!.fan).toBe(7);
    expect(pure!.offPlan).toEqual(['bamboo-2']);
    expect(pure!.strong).toBe(true);
  });

  it('offers no flush plan for a scattered hand', () => {
    const g = freshGame();
    rig(g, 0, [
      'dots-1', 'dots-5', 'dots-9', 'bamboo-2', 'bamboo-6', 'chars-3', 'chars-7',
      'wind-E', 'wind-S', 'wind-W', 'dragon-R', 'dots-3', 'bamboo-4',
    ]);
    const plans = detectPlans(g);
    expect(plans.find((p) => p.id === 'mixed-flush' || p.id === 'pure-flush')).toBeUndefined();
  });

  it('an off-suit meld kills the flush plans', () => {
    const g = freshGame();
    rig(g, 0, [
      'chars-1', 'chars-2', 'chars-3', 'chars-5', 'chars-5', 'chars-7', 'chars-8', 'chars-9',
      'wind-E', 'wind-E',
    ], [{ type: 'chow', kinds: ['dots-4', 'dots-5', 'dots-6'] }]);
    const plans = detectPlans(g);
    expect(plans.find((p) => p.id === 'mixed-flush' || p.id === 'pure-flush')).toBeUndefined();
  });

  it('suggests seven pairs from five pairs, but never once melded', () => {
    const g = freshGame();
    const hand = [
      'dots-1', 'dots-1', 'dots-4', 'dots-4', 'bamboo-2', 'bamboo-2',
      'chars-8', 'chars-8', 'wind-N', 'wind-N',
      'chars-1', 'dots-9', 'bamboo-5',
    ];
    rig(g, 0, hand);
    const sp = detectPlans(g).find((p) => p.id === 'seven-pairs');
    expect(sp).toBeDefined();
    expect(sp!.strong).toBe(true);
    expect(sp!.detail).toContain('5 pairs');

    rig(g, 0, hand.slice(0, 10), [{ type: 'pong', kinds: ['dragon-G', 'dragon-G', 'dragon-G'] }]);
    expect(detectPlans(g).find((p) => p.id === 'seven-pairs')).toBeUndefined();
  });

  it('suggests all pongs from pairs + pong melds, but not past a chow', () => {
    const g = freshGame();
    const hand = [
      'dots-3', 'dots-3', 'dots-3', 'bamboo-7', 'bamboo-7',
      'chars-2', 'chars-2', 'wind-W', 'wind-W', 'dots-8',
    ];
    rig(g, 0, hand, [{ type: 'pong', kinds: ['dragon-R', 'dragon-R', 'dragon-R'] }]);
    const ap = detectPlans(g).find((p) => p.id === 'all-pongs');
    expect(ap).toBeDefined();
    expect(ap!.strong).toBe(true);

    rig(g, 0, hand, [{ type: 'chow', kinds: ['chars-4', 'chars-5', 'chars-6'] }]);
    expect(detectPlans(g).find((p) => p.id === 'all-pongs')).toBeUndefined();
  });
});

describe('planner: live tiles and opponent overlap', () => {
  it('annotates waits with unseen counts and flags dead/thin waits', () => {
    const g = freshGame();
    purge(g, 'dragon-G');
    // all 4 green dragons visible in discards → dead
    g.players[1].discards.push(t('dragon-G'), t('dragon-G'), t('dragon-G'), t('dragon-G'));
    expect(annotateWaits(g, ['dragon-G'])[0].unseen).toBe(0);
    expect(waitLine(annotateWaits(g, ['dragon-G']))).toContain('NONE left');
    expect(waitWarnings(g, ['dragon-G']).join(' ')).toContain('DEAD');

    purge(g, 'dragon-R');
    g.players[2].discards.push(t('dragon-R'), t('dragon-R'), t('dragon-R'));
    expect(waitWarnings(g, ['dragon-R']).join(' ')).toContain('Thin wait');
  });

  it('reads suit collectors from claimed melds and warns on overlapping waits', () => {
    const g = freshGame();
    rig(g, 1, ['dots-2', 'dots-3', 'bamboo-8', 'wind-N', 'chars-6', 'chars-7', 'dragon-B'], [
      { type: 'pong', kinds: ['chars-3', 'chars-3', 'chars-3'] },
      { type: 'chow', kinds: ['chars-5', 'chars-6', 'chars-7'] },
    ]);
    const collectors = suitCollectors(g);
    expect(collectors.some((c) => c.player === 1 && c.suit === 'chars')).toBe(true);

    const warnings = waitOverlapWarnings(g, ['chars-4']);
    expect(warnings.length).toBe(1);
    expect(warnings[0]).toContain(g.players[1].name);
    expect(warnings[0]).toContain('Characters');
    // a wait in another suit stays quiet
    expect(waitOverlapWarnings(g, ['dots-4'])).toEqual([]);
  });
});

describe('planner-aware hints and feedback', () => {
  it('suggestDiscard keeps the LIVE wait, not the dead one', () => {
    const g = freshGame();
    rig(g, 0, ['dots-4', 'dots-7'], [
      { type: 'chow', kinds: ['dots-1', 'dots-2', 'dots-3'] },
      { type: 'chow', kinds: ['bamboo-1', 'bamboo-2', 'bamboo-3'] },
      { type: 'chow', kinds: ['bamboo-4', 'bamboo-5', 'bamboo-6'] },
      { type: 'chow', kinds: ['chars-1', 'chars-2', 'chars-3'] },
    ]);
    purge(g, 'dots-7');
    g.players[0].concealed.push(t('dots-7')); // restore after purge
    g.players[2].discards.push(t('dots-7'), t('dots-7'), t('dots-7')); // dots-7 wait would be dead
    // discarding dots-7 → pair-wait on dots-4 (3 live); discarding dots-4 → wait dots-7 (0 live)
    const hint = suggestDiscard(g)!;
    expect(hint.kind).toBe('dots-7');
    expect(hint.reason).toContain('ready');
  });

  it('suggestDiscard steers off a tile that deals into a ready opponent', () => {
    const g = freshGame();
    rig(g, 0, ['dots-4', 'bamboo-8'], [
      { type: 'chow', kinds: ['dots-1', 'dots-2', 'dots-3'] },
      { type: 'chow', kinds: ['bamboo-1', 'bamboo-2', 'bamboo-3'] },
      { type: 'chow', kinds: ['chars-1', 'chars-2', 'chars-3'] },
      { type: 'chow', kinds: ['chars-4', 'chars-5', 'chars-6'] },
    ]);
    // opponent 3 is ready, pair-waiting on dots-4
    rig(g, 3, ['dots-4'], [
      { type: 'pong', kinds: ['dots-8', 'dots-8', 'dots-8'] },
      { type: 'pong', kinds: ['bamboo-6', 'bamboo-6', 'bamboo-6'] },
      { type: 'pong', kinds: ['chars-9', 'chars-9', 'chars-9'] },
      { type: 'chow', kinds: ['dots-5', 'dots-6', 'dots-7'] },
    ]);
    // both discards keep the human ready (waiting to pair the kept tile)
    const cautious = suggestDiscard(g, { avoidDanger: true })!;
    expect(cautious.kind).toBe('bamboo-8');
    expect(cautious.reason).toContain('deals straight into');
  });

  it('evaluateDiscard annotates a ready discard with live counts', () => {
    const g = freshGame();
    rig(g, 0, ['chars-9', 'chars-9', 'dots-4', 'bamboo-7', 'bamboo-8'], [
      { type: 'chow', kinds: ['dots-1', 'dots-2', 'dots-3'] },
      { type: 'chow', kinds: ['bamboo-1', 'bamboo-2', 'bamboo-3'] },
      { type: 'chow', kinds: ['chars-1', 'chars-2', 'chars-3'] },
    ]);
    const tile = g.players[0].concealed.find((x) => x.kind === 'dots-4')!;
    const fb = evaluateDiscard(g, tile);
    expect(fb.shantenAfter).toBe(0);
    const joined = fb.details.join(' ');
    expect(joined).toContain('left');
  });

  it('evaluateDiscard grades an off-plan discard as a value trade, not a mistake', () => {
    const g = freshGame();
    // 14 tiles: strong Characters flush plan; the dots run is complete, so
    // shedding a dots tile costs a step of speed but feeds the flush.
    rig(g, 0, [
      'chars-1', 'chars-1', 'chars-2', 'chars-3', 'chars-4', 'chars-5', 'chars-6', 'chars-7', 'chars-9',
      'wind-E', 'wind-E',
      'dots-5', 'dots-6', 'dots-7',
    ]);
    const tile = g.players[0].concealed.find((x) => x.kind === 'dots-5')!;
    const fb = evaluateDiscard(g, tile);
    expect(fb.verdict).toBe('ok');
    expect(fb.headline).toBe('Trading speed for value.');
    expect(fb.details.join(' ')).toContain('混一色');
  });

  it('store surfaces a strong plan as a Master idea, once per hand', async () => {
    const { GameStore } = await import('../src/store');
    const store = new GameStore();
    store.startMatch();
    const g = store.game;
    // the randomly dealt hand may itself contain a strong plan and announce
    // it during startMatch — clear feed + dedup state so only the rigged
    // hand's announcement is observed (this was a real CI flake)
    store.coach.length = 0;
    (store as any).planAnnounced = new Set();
    rig(g, 0, [
      'chars-1', 'chars-2', 'chars-3', 'chars-5', 'chars-5', 'chars-7', 'chars-8', 'chars-9',
      'wind-E', 'wind-E', 'dragon-R',
      'dots-4', 'bamboo-6', 'chars-6',
    ]);
    (g as any).phase = 'awaiting-discard';
    (g as any).turn = 0;
    (store as any).narrateNewEvents();
    const idea = store.coach.find((m) => m.text.startsWith('Master idea'));
    expect(idea).toBeTruthy();
    expect(idea!.details!.join(' ')).toContain('混一色');
    const count = store.coach.filter((m) => m.text.startsWith('Master idea')).length;
    (store as any).narrateNewEvents();
    expect(store.coach.filter((m) => m.text.startsWith('Master idea')).length).toBe(count);
    (store as any).timer && clearInterval((store as any).timer);
  });

  it('planner functions never throw across simulated games', () => {
    for (let seed = 1; seed <= 3; seed++) {
      const g = new Game(seed);
      g.players[0].isHuman = false;
      attachAi(g);
      g.startHand();
      let steps = 0;
      while (g.phase !== 'hand-end' && g.phase !== 'match-end' && steps++ < 2000) {
        g.step();
        detectPlans(g);
        suitCollectors(g);
      }
    }
  });
});
