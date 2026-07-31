/** Scoring reference shown in the tutorial panel — from the booklet's 得分表. */

export interface ScoreRow {
  fan: string;
  name: string;
  cantonese?: string;
  note: string;
  /**
   * Example tiles, grouped set-by-set for display (last group = the eyes for
   * full hands). Full 14-tile examples are verified by tests/examples.test.ts
   * to actually score the fan they illustrate. Set-level examples (a lone
   * pong/gong/flowers) illustrate just the scoring element.
   */
  example?: string[][];
  /** marks a full 14-tile winning hand (test-verified) vs an illustrative fragment */
  fullHand?: boolean;
}

export const SCORING_TABLE: ScoreRow[] = [
  {
    fan: '0', name: 'Chicken hand', cantonese: 'gai wu 鸡糊',
    note: 'A mix of runs and triplets across suits with no pattern. Also: any plain hand using winds/dragons as the pair.',
    fullHand: true,
    example: [
      ['dots-1', 'dots-2', 'dots-3'],
      ['bamboo-4', 'bamboo-5', 'bamboo-6'],
      ['chars-2', 'chars-2', 'chars-2'],
      ['dots-7', 'dots-8', 'dots-9'],
      ['bamboo-2', 'bamboo-2'],
    ],
  },
  {
    fan: '1', name: 'Common hand (all runs)', cantonese: 'ping wu 平糊',
    note: 'Every set is a run of ascending numbers (pair must not be honours).',
    fullHand: true,
    example: [
      ['dots-1', 'dots-2', 'dots-3'],
      ['bamboo-4', 'bamboo-5', 'bamboo-6'],
      ['chars-1', 'chars-2', 'chars-3'],
      ['dots-7', 'dots-8', 'dots-9'],
      ['bamboo-2', 'bamboo-2'],
    ],
  },
  { fan: '1', name: 'Concealed hand', cantonese: 'mun ching 门前清', note: 'No claimed sets before winning.' },
  { fan: '1', name: 'Self draw', cantonese: 'zi mo 自摸', note: 'You drew the winning tile yourself.' },
  {
    fan: '1', name: 'Dragon pong / Seat wind pong', cantonese: 'faan pai 番牌',
    note: 'A pong/gong of any dragon, or of your own seat wind. One fan per set.',
    example: [
      ['dragon-R', 'dragon-R', 'dragon-R'],
      ['wind-E', 'wind-E', 'wind-E'],
    ],
  },
  {
    fan: '1', name: 'Gong', note: 'Each four-of-a-kind.',
    example: [['dots-5', 'dots-5', 'dots-5', 'dots-5']],
  },
  {
    fan: '1', name: 'Seat flower', note: 'A flower whose number matches your seat (dealer is 1).',
    example: [['flower-1'], ['flower-5']],
  },
  { fan: '1', name: 'No flowers', note: 'Finishing with no flower tiles at all.' },
  { fan: '1', name: 'Robbing the gong', cantonese: 'cheung gong 搶槓', note: 'Winning on the tile someone adds to their pong.' },
  { fan: '1', name: 'Win after gong', cantonese: 'gong seung zi mo 槓上自摸', note: 'Winning on the replacement tile drawn after a gong.' },
  { fan: '1', name: 'Last tile win', cantonese: 'hoi dai lao yuet 海底捞月', note: 'Winning on the final tile of the wall.' },
  {
    fan: '1', name: 'Mixed terminals', cantonese: 'wun yiu gau 混幺九',
    note: 'Only 1s, 9s and honour tiles.',
    fullHand: true,
    example: [
      ['dots-1', 'dots-1', 'dots-1'],
      ['bamboo-9', 'bamboo-9', 'bamboo-9'],
      ['chars-1', 'chars-1', 'chars-1'],
      ['wind-E', 'wind-E', 'wind-E'],
      ['dragon-G', 'dragon-G'],
    ],
  },
  {
    fan: '2', name: 'Full flower set', cantonese: 'yut toi fa 一台花',
    note: 'All four flowers of one kind (1-2-3-4).',
    example: [['flower-1', 'flower-2', 'flower-3', 'flower-4']],
  },
  {
    fan: '3', name: 'All pongs', cantonese: 'dou dou wu 对对糊',
    note: 'Every set is a pong/gong (all triplets).',
    fullHand: true,
    example: [
      ['dots-2', 'dots-2', 'dots-2'],
      ['bamboo-4', 'bamboo-4', 'bamboo-4'],
      ['chars-6', 'chars-6', 'chars-6'],
      ['dots-9', 'dots-9', 'dots-9'],
      ['bamboo-1', 'bamboo-1'],
    ],
  },
  {
    fan: '3', name: 'Mixed one suit', cantonese: 'wun yut sik 混一色',
    note: 'One suit plus honour tiles only.',
    fullHand: true,
    example: [
      ['dots-1', 'dots-2', 'dots-3'],
      ['dots-4', 'dots-5', 'dots-6'],
      ['wind-N', 'wind-N', 'wind-N'],
      ['dots-7', 'dots-8', 'dots-9'],
      ['dragon-R', 'dragon-R'],
    ],
  },
  {
    fan: '5', name: 'Small dragons', cantonese: 'siu saam yuen 小三元',
    note: 'Pongs of two dragons + pair of the third.',
    fullHand: true,
    example: [
      ['dragon-R', 'dragon-R', 'dragon-R'],
      ['dragon-G', 'dragon-G', 'dragon-G'],
      ['dots-4', 'dots-5', 'dots-6'],
      ['bamboo-2', 'bamboo-3', 'bamboo-4'],
      ['dragon-B', 'dragon-B'],
    ],
  },
  {
    fan: '6', name: 'Small winds', cantonese: 'siu sei hei 小四喜',
    note: 'Pongs of three winds + pair of the fourth.',
    fullHand: true,
    example: [
      ['wind-E', 'wind-E', 'wind-E'],
      ['wind-S', 'wind-S', 'wind-S'],
      ['wind-W', 'wind-W', 'wind-W'],
      ['dots-3', 'dots-4', 'dots-5'],
      ['wind-N', 'wind-N'],
    ],
  },
  {
    fan: '7', name: 'Pure one suit', cantonese: 'ching yut sik 清一色',
    note: 'One suit only, no honours.',
    fullHand: true,
    example: [
      ['dots-1', 'dots-2', 'dots-3'],
      ['dots-3', 'dots-4', 'dots-5'],
      ['dots-6', 'dots-7', 'dots-8'],
      ['dots-9', 'dots-9', 'dots-9'],
      ['dots-5', 'dots-5'],
    ],
  },
  {
    fan: '7', name: 'Seven pairs', cantonese: '七对子',
    note: 'Seven pairs, fully concealed.',
    fullHand: true,
    example: [
      ['dots-1', 'dots-1'], ['dots-3', 'dots-3'], ['bamboo-5', 'bamboo-5'],
      ['chars-7', 'chars-7'], ['wind-E', 'wind-E'], ['wind-N', 'wind-N'],
      ['dragon-G', 'dragon-G'],
    ],
  },
  {
    fan: '8', name: 'Great dragons', cantonese: 'dai saam yuen 大三元',
    note: 'Pongs of all three dragons.',
    fullHand: true,
    example: [
      ['dragon-R', 'dragon-R', 'dragon-R'],
      ['dragon-G', 'dragon-G', 'dragon-G'],
      ['dragon-B', 'dragon-B', 'dragon-B'],
      ['dots-4', 'dots-5', 'dots-6'],
      ['chars-2', 'chars-2'],
    ],
  },
  { fan: '8', name: 'Gong on gong win', cantonese: '槓上槓自摸', note: 'Two gongs in a row, winning on the second replacement tile.' },
  {
    fan: '8', name: 'All eight flowers', cantonese: 'dai fa wu 大花糊',
    note: 'Collect all 8 flowers — instant win, even with an incomplete hand.',
    example: [[
      'flower-1', 'flower-2', 'flower-3', 'flower-4',
      'flower-5', 'flower-6', 'flower-7', 'flower-8',
    ]],
  },
  { fan: '8', name: 'Concealed all pongs', cantonese: 'kan kan wu 坎坎糊', note: 'Fully concealed hand of triplets only — like All pongs above, but with no sets claimed from discards.' },
  {
    fan: '10', name: 'All honours', cantonese: 'zi yut sik 字一色',
    note: 'Winds and dragons only.',
    fullHand: true,
    example: [
      ['wind-E', 'wind-E', 'wind-E'],
      ['wind-S', 'wind-S', 'wind-S'],
      ['dragon-R', 'dragon-R', 'dragon-R'],
      ['dragon-G', 'dragon-G', 'dragon-G'],
      ['wind-N', 'wind-N'],
    ],
  },
  {
    fan: '10', name: 'Pure terminals', cantonese: 'ching yiu gau 清幺九',
    note: 'Only 1s and 9s.',
    fullHand: true,
    example: [
      ['dots-1', 'dots-1', 'dots-1'],
      ['dots-9', 'dots-9', 'dots-9'],
      ['bamboo-1', 'bamboo-1', 'bamboo-1'],
      ['chars-9', 'chars-9', 'chars-9'],
      ['bamboo-9', 'bamboo-9'],
    ],
  },
  { fan: '13 (limit)', name: 'Heavenly hand', cantonese: 'tin wu 天糊', note: 'Dealer wins with the opening hand.' },
  { fan: '13 (limit)', name: 'Earthly hand', cantonese: 'dei wu 地糊', note: 'Winning on the first discard of the hand.' },
  {
    fan: '13 (limit)', name: 'Great winds', cantonese: 'dai sei hei 大四喜',
    note: 'Pongs of all four winds.',
    fullHand: true,
    example: [
      ['wind-E', 'wind-E', 'wind-E'],
      ['wind-S', 'wind-S', 'wind-S'],
      ['wind-W', 'wind-W', 'wind-W'],
      ['wind-N', 'wind-N', 'wind-N'],
      ['dots-5', 'dots-5'],
    ],
  },
  {
    fan: '13 (limit)', name: 'Thirteen orphans', cantonese: 'sup sam yew 十三幺',
    note: 'One of each 1, 9 and honour + a pair of any of them.',
    fullHand: true,
    example: [[
      'dots-1', 'dots-9', 'bamboo-1', 'bamboo-9', 'chars-1', 'chars-9',
      'wind-E', 'wind-S', 'wind-W', 'wind-N',
      'dragon-R', 'dragon-G', 'dragon-B', 'dragon-B',
    ]],
  },
];

export const PAYOUT_NOTE =
  'Payouts double per fan: 0 fan = 1 chip, 1 fan = 2, 2 = 4, 3 = 8… capped at the 13-fan limit (8192). ' +
  'Discard winner: the discarder pays. Self-draw: all three opponents pay. ' +
  'In the example hands below, the last group is the pair (the eyes).';
