import { describe, it, expect } from 'vitest';
import { toCounts } from '../src/engine/types';
import {
  isWinningHand, shanten, winningTiles, sevenPairsWin, thirteenOrphansWin,
  decomposeStandard,
} from '../src/engine/hand';

describe('win detection', () => {
  it('detects a simple standard win', () => {
    // 123 dots, 456 dots, 789 bamboo, 111 chars, 99 chars
    const hand = [
      'dots-1', 'dots-2', 'dots-3', 'dots-4', 'dots-5', 'dots-6',
      'bamboo-7', 'bamboo-8', 'bamboo-9',
      'chars-1', 'chars-1', 'chars-1', 'chars-9', 'chars-9',
    ];
    expect(isWinningHand(hand, 0)).toBe(true);
  });

  it('rejects a non-winning hand', () => {
    const hand = [
      'dots-1', 'dots-2', 'dots-4', 'dots-4', 'dots-5', 'dots-6',
      'bamboo-7', 'bamboo-8', 'bamboo-9',
      'chars-1', 'chars-1', 'chars-2', 'chars-9', 'chars-9',
    ];
    expect(isWinningHand(hand, 0)).toBe(false);
  });

  it('detects wins with melds declared', () => {
    // 1 meld declared -> concealed needs 3 sets + pair (11 tiles)
    const hand = [
      'dots-1', 'dots-2', 'dots-3',
      'bamboo-2', 'bamboo-3', 'bamboo-4',
      'wind-E', 'wind-E', 'wind-E',
      'dragon-R', 'dragon-R',
    ];
    expect(isWinningHand(hand, 1)).toBe(true);
  });

  it('detects seven pairs', () => {
    const hand = [
      'dots-1', 'dots-1', 'dots-3', 'dots-3', 'bamboo-5', 'bamboo-5',
      'chars-7', 'chars-7', 'wind-E', 'wind-E', 'wind-N', 'wind-N',
      'dragon-G', 'dragon-G',
    ];
    expect(sevenPairsWin(toCounts(hand))).toBeTruthy();
    expect(isWinningHand(hand, 0)).toBe(true);
  });

  it('allows four-of-a-kind as two pairs in seven pairs', () => {
    const hand = [
      'dots-1', 'dots-1', 'dots-1', 'dots-1', 'bamboo-5', 'bamboo-5',
      'chars-7', 'chars-7', 'wind-E', 'wind-E', 'wind-N', 'wind-N',
      'dragon-G', 'dragon-G',
    ];
    expect(sevenPairsWin(toCounts(hand))).toBeTruthy();
  });

  it('detects thirteen orphans', () => {
    const hand = [
      'dots-1', 'dots-9', 'bamboo-1', 'bamboo-9', 'chars-1', 'chars-9',
      'wind-E', 'wind-S', 'wind-W', 'wind-N',
      'dragon-R', 'dragon-G', 'dragon-B', 'dragon-B',
    ];
    expect(thirteenOrphansWin(toCounts(hand))).toBeTruthy();
    expect(isWinningHand(hand, 0)).toBe(true);
  });

  it('finds multiple decompositions for ambiguous hands', () => {
    // 111222333 dots can be three pongs or three chows
    const hand = [
      'dots-1', 'dots-1', 'dots-1', 'dots-2', 'dots-2', 'dots-2',
      'dots-3', 'dots-3', 'dots-3', 'bamboo-1', 'bamboo-2', 'bamboo-3',
      'wind-E', 'wind-E',
    ];
    const decomps = decomposeStandard(toCounts(hand), 4);
    expect(decomps.length).toBeGreaterThan(1);
  });
});

describe('shanten', () => {
  it('is 0 when one tile from winning (ready)', () => {
    const hand = [
      'dots-1', 'dots-2', 'dots-3', 'dots-4', 'dots-5', 'dots-6',
      'bamboo-7', 'bamboo-8', 'bamboo-9',
      'chars-1', 'chars-1', 'chars-1', 'chars-9',
    ];
    expect(shanten(hand, 0)).toBe(0);
    expect(winningTiles(hand, 0)).toEqual(['chars-9']);
  });

  it('counts two-sided waits', () => {
    const hand = [
      'dots-2', 'dots-3', 'dots-5', 'dots-6', 'dots-7', 'dots-8', 'dots-8',
      'bamboo-2', 'bamboo-3', 'bamboo-4',
      'chars-5', 'chars-6', 'chars-7',
    ];
    expect(shanten(hand, 0)).toBe(0);
    const waits = winningTiles(hand, 0);
    expect(waits).toContain('dots-1');
    expect(waits).toContain('dots-4');
  });

  it('is -1 for a complete hand', () => {
    const hand = [
      'dots-1', 'dots-2', 'dots-3', 'dots-4', 'dots-5', 'dots-6',
      'bamboo-7', 'bamboo-8', 'bamboo-9',
      'chars-1', 'chars-1', 'chars-1', 'chars-9', 'chars-9',
    ];
    expect(shanten(hand, 0)).toBe(-1);
  });

  it('handles a fresh awful hand sensibly', () => {
    const hand = [
      'dots-1', 'dots-5', 'dots-9', 'bamboo-2', 'bamboo-6', 'chars-3',
      'chars-7', 'wind-E', 'wind-S', 'wind-W', 'dragon-R', 'dragon-G', 'dots-2',
    ];
    const sh = shanten(hand, 0);
    expect(sh).toBeGreaterThanOrEqual(3);
    expect(sh).toBeLessThanOrEqual(6);
  });

  it('respects declared melds', () => {
    // two melds declared, concealed: 2 sets + pair needed from 7 tiles + 1
    const hand = ['dots-1', 'dots-2', 'dots-3', 'bamboo-5', 'bamboo-5', 'chars-2', 'chars-3'];
    // ready: waiting on chars-1/chars-4
    expect(shanten(hand, 2)).toBe(0);
    const waits = winningTiles(hand, 2);
    expect(waits).toContain('chars-1');
    expect(waits).toContain('chars-4');
  });

  it('seven pairs shanten', () => {
    const hand = [
      'dots-1', 'dots-1', 'dots-3', 'dots-3', 'bamboo-5', 'bamboo-5',
      'chars-7', 'chars-7', 'wind-E', 'wind-E', 'wind-N', 'dragon-G', 'dragon-R',
    ];
    // 5 pairs + 3 singles -> needs 1 more pair for ready... shanten 1
    expect(shanten(hand, 0)).toBe(1);
  });
});
