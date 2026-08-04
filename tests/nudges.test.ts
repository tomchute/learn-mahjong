import { describe, it, expect } from 'vitest';
import { Game } from '../src/engine/game';
import { attachAi } from '../src/engine/ai';
import { detectNudges } from '../src/engine/insight';
import { Tile } from '../src/engine/types';

let nextId = 8000;
const t = (kind: string): Tile => ({ id: nextId++, kind });

function freshGame(): Game {
  const g = new Game(21);
  attachAi(g);
  g.startHand();
  // strip natural melds/discards so rules fire only from our rigging
  for (const p of g.players) { p.melds = []; p.discards = []; }
  return g;
}

const meld = (type: 'chow' | 'pong' | 'gong', kinds: string[]) => ({
  type, tiles: kinds.map(t), claimedFrom: 0, concealed: false,
});

describe('competitor nudges (public evidence only)', () => {
  it('fires on a second exposed meld, once', () => {
    const g = freshGame();
    g.players[1].melds = [
      meld('pong', ['dots-2', 'dots-2', 'dots-2']),
      meld('chow', ['dots-4', 'dots-5', 'dots-6']),
    ];
    const fired = new Set<string>();
    const n1 = detectNudges(g, fired);
    const second = n1.find((n) => n.key === '1:second-meld');
    expect(second).toBeTruthy();
    expect(second!.text).toContain('Mei');
    fired.add(second!.key);
    expect(detectNudges(g, fired).some((n) => n.key === '1:second-meld')).toBe(false);
  });

  it('fires on honour claims and third melds', () => {
    const g = freshGame();
    g.players[2].melds = [
      meld('pong', ['dragon-R', 'dragon-R', 'dragon-R']),
      meld('pong', ['bamboo-3', 'bamboo-3', 'bamboo-3']),
      meld('chow', ['chars-1', 'chars-2', 'chars-3']),
    ];
    const nudges = detectNudges(g, new Set());
    expect(nudges.some((n) => n.key === '2:honour-claim')).toBe(true);
    expect(nudges.some((n) => n.key === '2:third-meld')).toBe(true);
  });

  it('spots suit hoarding from discards + claims', () => {
    const g = freshGame();
    g.players[3].melds = [meld('pong', ['dots-7', 'dots-7', 'dots-7'])];
    g.players[3].discards = ['bamboo-1', 'chars-2', 'wind-N', 'bamboo-9', 'chars-5', 'chars-8'].map(t);
    const nudges = detectNudges(g, new Set());
    const hoard = nudges.find((n) => n.key === '3:suit-hoard');
    expect(hoard).toBeTruthy();
    expect(hoard!.text).toContain('dots');
  });

  it('spots late middle-tile discards', () => {
    const g = freshGame();
    g.players[1].discards = ['wind-N', 'chars-1', 'bamboo-9', 'dots-1', 'dots-5', 'bamboo-4'].map(t);
    const nudges = detectNudges(g, new Set());
    expect(nudges.some((n) => n.key === '1:middle-discards')).toBe(true);
  });

  it('does not fire from hidden information (fresh hands are quiet)', () => {
    const g = freshGame();
    expect(detectNudges(g, new Set())).toEqual([]);
  });

  it('never mentions concealed-gong contents', () => {
    const g = freshGame();
    g.players[1].melds = [
      { type: 'gong', tiles: ['dragon-G', 'dragon-G', 'dragon-G', 'dragon-G'].map(t), claimedFrom: null, concealed: true },
    ];
    const nudges = detectNudges(g, new Set());
    // a concealed gong is not "exposed": no meld-based nudges may fire from it
    expect(nudges.some((n) => n.key.startsWith('1:'))).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// store wiring: nudges reach the coach feed; peek gating works
// ---------------------------------------------------------------------------
import { GameStore } from '../src/store';

describe('store wiring', () => {
  it('nudges reach the coach feed with the nudge tone', () => {
    const store = new GameStore();
    store.startMatch();
    const g = store.game;
    g.players[1].melds = [
      { type: 'pong', tiles: ['dots-2', 'dots-2', 'dots-2'].map(t), claimedFrom: 0, concealed: false },
      { type: 'chow', tiles: ['dots-4', 'dots-5', 'dots-6'].map(t), claimedFrom: 0, concealed: false },
    ];
    (store as any).narrateNewEvents();
    const nudge = store.coach.find((m) => m.tone === 'nudge');
    expect(nudge).toBeTruthy();
    expect(nudge!.text).toContain('Mei');
    // fires once
    const count = store.coach.filter((m) => m.tone === 'nudge').length;
    (store as any).narrateNewEvents();
    expect(store.coach.filter((m) => m.tone === 'nudge').length).toBe(count);
    (store as any).timer && clearInterval((store as any).timer);
  });

  it('peek off empties danger kinds; peek on restores them', () => {
    const store = new GameStore();
    store.startMatch();
    const g = store.game;
    // rig a ready opponent (pair wait on chars-9)
    g.players[2].concealed = [t('chars-9')];
    g.players[2].melds = [
      { type: 'pong', tiles: ['dots-2', 'dots-2', 'dots-2'].map(t), claimedFrom: 1, concealed: false },
      { type: 'pong', tiles: ['bamboo-3', 'bamboo-3', 'bamboo-3'].map(t), claimedFrom: 1, concealed: false },
      { type: 'chow', tiles: ['chars-1', 'chars-2', 'chars-3'].map(t), claimedFrom: 1, concealed: false },
      { type: 'chow', tiles: ['dots-5', 'dots-6', 'dots-7'].map(t), claimedFrom: 1, concealed: false },
    ];
    store.settings = { ...store.settings, peekEnabled: true, coachEnabled: true };
    expect(store.getDangerKinds().has('chars-9')).toBe(true);
    store.settings = { ...store.settings, peekEnabled: false };
    expect(store.getDangerKinds().size).toBe(0);
    (store as any).timer && clearInterval((store as any).timer);
  });
});
