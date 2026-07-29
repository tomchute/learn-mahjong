import { describe, it, expect } from 'vitest';
import { scoreHand, payoutForFan, LIMIT_FAN } from '../src/engine/score';
import { Meld, Tile } from '../src/engine/types';

let nextId = 1000;
function meld(type: 'chow' | 'pong' | 'gong', kinds: string[], concealed = false, from: number | null = 1): Meld {
  return {
    type,
    tiles: kinds.map((kind) => ({ id: nextId++, kind })),
    claimedFrom: concealed ? null : from,
    concealed,
  };
}

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

describe('scoring per the booklet', () => {
  it('chicken hand scores 0 fan', () => {
    // mixed suits, mixed chows+pong, has a flower (no "no flowers" point), open hand
    const concealed = [
      'dots-1', 'dots-2', 'dots-3',
      'bamboo-4', 'bamboo-5', 'bamboo-6',
      'chars-2', 'chars-2', 'chars-2',
      'dots-7', 'dots-8', 'dots-9',
      'bamboo-2', 'bamboo-2',
    ];
    const r = scoreHand(concealed, [], ['flower-2'], baseCtx);
    expect(r.fan).toBe(0);
    expect(r.payout).toBe(1);
  });

  it('common hand (all chows) = 1 fan, voided by honour eyes', () => {
    const allChows = [
      'dots-1', 'dots-2', 'dots-3',
      'bamboo-4', 'bamboo-5', 'bamboo-6',
      'chars-1', 'chars-2', 'chars-3',
      'dots-7', 'dots-8', 'dots-9',
      'bamboo-2', 'bamboo-2',
    ];
    const r1 = scoreHand(allChows, [], ['flower-2'], baseCtx);
    expect(r1.items.some((i) => i.name === 'Common hand')).toBe(true);
    expect(r1.fan).toBe(1);

    const honourEyes = [
      'dots-1', 'dots-2', 'dots-3',
      'bamboo-4', 'bamboo-5', 'bamboo-6',
      'chars-1', 'chars-2', 'chars-3',
      'dots-7', 'dots-8', 'dots-9',
      'wind-N', 'wind-N',
    ];
    const r2 = scoreHand(honourEyes, [], ['flower-2'], baseCtx);
    expect(r2.items.some((i) => i.name === 'Common hand')).toBe(false);
    expect(r2.fan).toBe(0);
  });

  it('all pongs = 3 fan', () => {
    const concealed = [
      'dots-2', 'dots-2', 'dots-2',
      'bamboo-4', 'bamboo-4', 'bamboo-4',
      'chars-6', 'chars-6', 'chars-6',
      'dots-9', 'dots-9', 'dots-9',
      'bamboo-1', 'bamboo-1',
    ];
    const r = scoreHand(concealed, [], ['flower-2'], baseCtx);
    expect(r.items.some((i) => i.name === 'All pongs')).toBe(true);
    expect(r.fan).toBe(3);
  });

  it('mixed one suit = 3 fan, pure one suit = 7 fan', () => {
    const mixed = [
      'dots-1', 'dots-2', 'dots-3',
      'dots-4', 'dots-5', 'dots-6',
      'wind-N', 'wind-N', 'wind-N',
      'dots-7', 'dots-8', 'dots-9',
      'dragon-R', 'dragon-R',
    ];
    const rm = scoreHand(mixed, [], ['flower-2'], baseCtx);
    expect(rm.items.some((i) => i.name === 'Mixed one suit')).toBe(true);

    const pure = [
      'dots-1', 'dots-2', 'dots-3',
      'dots-4', 'dots-5', 'dots-6',
      'dots-7', 'dots-8', 'dots-9',
      'dots-2', 'dots-3', 'dots-4',
      'dots-9', 'dots-9',
    ];
    const rp = scoreHand(pure, [], ['flower-2'], baseCtx);
    expect(rp.items.some((i) => i.name === 'Pure one suit')).toBe(true);
    // 7 (pure one suit) + 1 (all chows / common hand) = 8
    expect(rp.fan).toBe(8);
  });

  it('dragon pong + seat wind pong score a fan each', () => {
    const concealed = [
      'dragon-R', 'dragon-R', 'dragon-R',
      'wind-E', 'wind-E', 'wind-E',
      'dots-4', 'dots-5', 'dots-6',
      'bamboo-2', 'bamboo-3', 'bamboo-4',
      'chars-5', 'chars-5',
    ];
    const r = scoreHand(concealed, [], ['flower-2'], { ...baseCtx, seatWind: 'E' });
    expect(r.items.filter((i) => i.name.startsWith('Dragon pong')).length).toBe(1);
    expect(r.items.filter((i) => i.name.startsWith('Seat wind pong')).length).toBe(1);
    // non-seat wind scores nothing
    const r2 = scoreHand(concealed, [], ['flower-2'], { ...baseCtx, seatWind: 'S' });
    expect(r2.items.filter((i) => i.name.startsWith('Seat wind pong')).length).toBe(0);
  });

  it('small dragons = 5, great dragons = 8', () => {
    const small = [
      'dragon-R', 'dragon-R', 'dragon-R',
      'dragon-G', 'dragon-G', 'dragon-G',
      'dragon-B', 'dragon-B',
      'dots-4', 'dots-5', 'dots-6',
      'bamboo-2', 'bamboo-3', 'bamboo-4',
    ];
    const rs = scoreHand(small, [], ['flower-2'], baseCtx);
    expect(rs.items.some((i) => i.name === 'Small dragons')).toBe(true);
    // 5 (small dragons) + 2 dragon pongs = 7
    expect(rs.fan).toBe(7);

    const great = [
      'dragon-R', 'dragon-R', 'dragon-R',
      'dragon-G', 'dragon-G', 'dragon-G',
      'dragon-B', 'dragon-B', 'dragon-B',
      'dots-4', 'dots-5', 'dots-6',
      'chars-2', 'chars-2',
    ];
    const rg = scoreHand(great, [], ['flower-2'], baseCtx);
    expect(rg.items.some((i) => i.name === 'Great dragons')).toBe(true);
    // 8 + 3 dragon pongs = 11
    expect(rg.fan).toBe(11);
  });

  it('seven pairs = 7 fan', () => {
    const hand = [
      'dots-1', 'dots-1', 'dots-3', 'dots-3', 'bamboo-5', 'bamboo-5',
      'chars-7', 'chars-7', 'wind-E', 'wind-E', 'wind-N', 'wind-N',
      'dragon-G', 'dragon-G',
    ];
    const r = scoreHand(hand, [], ['flower-2'], baseCtx);
    expect(r.items.some((i) => i.name === 'Seven pairs')).toBe(true);
  });

  it('thirteen orphans is a 13-fan limit hand', () => {
    const hand = [
      'dots-1', 'dots-9', 'bamboo-1', 'bamboo-9', 'chars-1', 'chars-9',
      'wind-E', 'wind-S', 'wind-W', 'wind-N',
      'dragon-R', 'dragon-G', 'dragon-B', 'dragon-B',
    ];
    const r = scoreHand(hand, [], [], baseCtx);
    expect(r.fan).toBe(LIMIT_FAN);
    expect(r.limit).toBe(true);
    expect(r.payout).toBe(2 ** 13);
  });

  it('bonus fans: self-draw, concealed, no flowers stack', () => {
    const concealed = [
      'dots-1', 'dots-2', 'dots-3',
      'bamboo-4', 'bamboo-5', 'bamboo-6',
      'chars-2', 'chars-2', 'chars-2',
      'dots-7', 'dots-8', 'dots-9',
      'bamboo-2', 'bamboo-2',
    ];
    const r = scoreHand(concealed, [], [], { ...baseCtx, selfDraw: true, concealed: true });
    expect(r.items.some((i) => i.name === 'Self draw')).toBe(true);
    expect(r.items.some((i) => i.name === 'Concealed hand')).toBe(true);
    expect(r.items.some((i) => i.name === 'No flowers')).toBe(true);
    expect(r.fan).toBe(3);
    expect(r.payout).toBe(8);
  });

  it('seat flowers and full flower set', () => {
    const concealed = [
      'dots-1', 'dots-2', 'dots-3',
      'bamboo-4', 'bamboo-5', 'bamboo-6',
      'chars-2', 'chars-2', 'chars-2',
      'dots-7', 'dots-8', 'dots-9',
      'bamboo-2', 'bamboo-2',
    ];
    // East seat = number 1: flower-1 and flower-5 both match
    const r = scoreHand(concealed, [], ['flower-1', 'flower-5'], { ...baseCtx, seatWind: 'E' });
    expect(r.items.filter((i) => i.name === 'Seat flower').length).toBe(2);

    const r2 = scoreHand(concealed, [], ['flower-1', 'flower-2', 'flower-3', 'flower-4'], { ...baseCtx, seatWind: 'E' });
    expect(r2.items.some((i) => i.name === 'Full flower set')).toBe(true);
  });

  it('gongs score a fan each', () => {
    const melds = [
      meld('gong', ['dots-2', 'dots-2', 'dots-2', 'dots-2']),
      meld('gong', ['wind-N', 'wind-N', 'wind-N', 'wind-N']),
    ];
    const concealed = [
      'bamboo-4', 'bamboo-5', 'bamboo-6',
      'chars-3', 'chars-4', 'chars-5',
      'dots-8', 'dots-8',
    ];
    const r = scoreHand(concealed, melds, ['flower-2'], baseCtx);
    expect(r.items.some((i) => i.name === '2 gongs' && i.fan === 2)).toBe(true);
  });

  it('heavenly hand is a limit hand', () => {
    const concealed = [
      'dots-1', 'dots-2', 'dots-3',
      'bamboo-4', 'bamboo-5', 'bamboo-6',
      'chars-2', 'chars-2', 'chars-2',
      'dots-7', 'dots-8', 'dots-9',
      'bamboo-2', 'bamboo-2',
    ];
    const r = scoreHand(concealed, [], [], { ...baseCtx, selfDraw: true, concealed: true, heavenly: true });
    expect(r.fan).toBe(LIMIT_FAN);
  });

  it('all honours = 10 fan minimum', () => {
    const concealed = [
      'wind-E', 'wind-E', 'wind-E',
      'wind-S', 'wind-S', 'wind-S',
      'dragon-R', 'dragon-R', 'dragon-R',
      'dragon-G', 'dragon-G', 'dragon-G',
      'wind-N', 'wind-N',
    ];
    const r = scoreHand(concealed, [], ['flower-2'], baseCtx);
    expect(r.items.some((i) => i.name === 'All honours')).toBe(true);
    expect(r.fan).toBeGreaterThanOrEqual(10);
  });

  it('payout doubles per fan', () => {
    expect(payoutForFan(0)).toBe(1);
    expect(payoutForFan(1)).toBe(2);
    expect(payoutForFan(3)).toBe(8);
    expect(payoutForFan(20)).toBe(2 ** 13); // capped at limit
  });
});
