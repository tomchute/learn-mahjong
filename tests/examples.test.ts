import { describe, it, expect } from 'vitest';
import { SCORING_TABLE } from '../src/content/scoringTable';
import { scoreHand } from '../src/engine/score';
import { isWinningHand } from '../src/engine/hand';
import { toCounts } from '../src/engine/types';

/**
 * The scoring reference's example hands must actually earn the fan they
 * illustrate — a wrong example would mis-teach every reader.
 */

const baseCtx = {
  seatWind: 'E' as const,
  selfDraw: false,
  concealed: false,
  robbingGong: false,
  afterGong: false,
  afterDoubleGong: false,
  lastTile: false,
  heavenly: false,
  earthly: false,
};

/** map table row names to the score.ts item name they should produce */
const EXPECTED_ITEM: Record<string, string> = {
  'Chicken hand': 'Chicken hand',
  'Common hand (all runs)': 'Common hand',
  'Mixed terminals': 'Mixed terminals',
  'All pongs': 'All pongs',
  'Mixed one suit': 'Mixed one suit',
  'Small dragons': 'Small dragons',
  'Small winds': 'Small winds',
  'Pure one suit': 'Pure one suit',
  'Seven pairs': 'Seven pairs',
  'Great dragons': 'Great dragons',
  'All honours': 'All honours',
  'Pure terminals': 'Pure terminals',
  'Great winds': 'Great winds',
  'Thirteen orphans': 'Thirteen orphans',
};

describe('scoring table example hands', () => {
  const fullHandRows = SCORING_TABLE.filter((r) => r.fullHand);

  it('covers every pattern fan with a verified example', () => {
    expect(fullHandRows.length).toBe(Object.keys(EXPECTED_ITEM).length);
  });

  for (const row of fullHandRows) {
    it(`"${row.name}" example is a valid win earning that fan`, () => {
      const tiles = row.example!.flat();
      expect(tiles.length).toBe(14);
      // legal tile counts
      for (const c of toCounts(tiles)) expect(c).toBeLessThanOrEqual(4);
      // it must be a winning hand
      expect(isWinningHand(tiles, 0)).toBe(true);
      // and it must score the item it illustrates
      const expected = EXPECTED_ITEM[row.name];
      expect(expected, `no expected item mapped for "${row.name}"`).toBeTruthy();
      const result = scoreHand(tiles, [], ['flower-2'], baseCtx);
      expect(
        result.items.map((i) => i.name),
        `"${row.name}" example scored: ${result.items.map((i) => i.name).join(', ')}`,
      ).toContain(expected);
    });
  }

  it('full-hand examples end with the eyes (a 2-tile group), except special hands', () => {
    for (const row of fullHandRows) {
      if (row.name === 'Seven pairs' || row.name === 'Thirteen orphans') continue;
      const groups = row.example!;
      expect(groups[groups.length - 1].length, `"${row.name}" last group should be the pair`).toBe(2);
    }
  });
});
