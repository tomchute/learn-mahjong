/** Scoring reference shown in the tutorial panel — from the booklet's 得分表. */

export interface ScoreRow {
  fan: string;
  name: string;
  cantonese?: string;
  note: string;
}

export const SCORING_TABLE: ScoreRow[] = [
  { fan: '0', name: 'Chicken hand', cantonese: 'gai wu 鸡糊', note: 'A mix of runs and triplets across suits with no pattern. Also: any plain hand using winds/dragons as the pair.' },
  { fan: '1', name: 'Common hand (all runs)', cantonese: 'ping wu 平糊', note: 'Every set is a run of ascending numbers (pair must not be honours).' },
  { fan: '1', name: 'Concealed hand', cantonese: 'mun ching 门前清', note: 'No claimed sets before winning.' },
  { fan: '1', name: 'Self draw', cantonese: 'zi mo 自摸', note: 'You drew the winning tile yourself.' },
  { fan: '1', name: 'Dragon pong / Seat wind pong', cantonese: 'faan pai 番牌', note: 'A pong/gong of any dragon, or of your own seat wind.' },
  { fan: '1', name: 'Gong', note: 'Each four-of-a-kind.' },
  { fan: '1', name: 'Seat flower', note: 'A flower whose number matches your seat (dealer is 1).' },
  { fan: '1', name: 'No flowers', note: 'Finishing with no flower tiles at all.' },
  { fan: '1', name: 'Robbing the gong', cantonese: 'cheung gong 搶槓', note: 'Winning on the tile someone adds to their pong.' },
  { fan: '1', name: 'Win after gong', cantonese: 'gong seung zi mo 槓上自摸', note: 'Winning on the replacement tile drawn after a gong.' },
  { fan: '1', name: 'Last tile win', cantonese: 'hoi dai lao yuet 海底捞月', note: 'Winning on the final tile of the wall.' },
  { fan: '1', name: 'Mixed terminals', cantonese: 'wun yiu gau 混幺九', note: 'Only 1s, 9s and honour tiles.' },
  { fan: '2', name: 'Full flower set', cantonese: 'yut toi fa 一台花', note: 'All four flowers of one kind (1-2-3-4).' },
  { fan: '3', name: 'All pongs', cantonese: 'dou dou wu 对对糊', note: 'Every set is a pong/gong (all triplets).' },
  { fan: '3', name: 'Mixed one suit', cantonese: 'wun yut sik 混一色', note: 'One suit plus honour tiles only.' },
  { fan: '5', name: 'Small dragons', cantonese: 'siu saam yuen 小三元', note: 'Pongs of two dragons + pair of the third.' },
  { fan: '6', name: 'Small winds', cantonese: 'siu sei hei 小四喜', note: 'Pongs of three winds + pair of the fourth.' },
  { fan: '7', name: 'Pure one suit', cantonese: 'ching yut sik 清一色', note: 'One suit only, no honours.' },
  { fan: '7', name: 'Seven pairs', cantonese: '七对子', note: 'Seven pairs, fully concealed.' },
  { fan: '8', name: 'Great dragons', cantonese: 'dai saam yuen 大三元', note: 'Pongs of all three dragons.' },
  { fan: '8', name: 'Gong on gong win', cantonese: '槓上槓自摸', note: 'Two gongs in a row, winning on the second replacement tile.' },
  { fan: '8', name: 'All eight flowers', cantonese: 'dai fa wu 大花糊', note: 'Collect all 8 flowers — instant win, even with an incomplete hand.' },
  { fan: '8', name: 'Concealed all pongs', cantonese: 'kan kan wu 坎坎糊', note: 'Fully concealed hand of triplets only.' },
  { fan: '10', name: 'All honours', cantonese: 'zi yut sik 字一色', note: 'Winds and dragons only.' },
  { fan: '10', name: 'Pure terminals', cantonese: 'ching yiu gau 清幺九', note: 'Only 1s and 9s.' },
  { fan: '13 (limit)', name: 'Heavenly hand', cantonese: 'tin wu 天糊', note: 'Dealer wins with the opening hand.' },
  { fan: '13 (limit)', name: 'Earthly hand', cantonese: 'dei wu 地糊', note: 'Winning on the first discard of the hand.' },
  { fan: '13 (limit)', name: 'Great winds', cantonese: 'dai sei hei 大四喜', note: 'Pongs of all four winds.' },
  { fan: '13 (limit)', name: 'Thirteen orphans', cantonese: 'sup sam yew 十三幺', note: 'One of each 1, 9 and honour + a pair of any of them.' },
];

export const PAYOUT_NOTE =
  'Payouts double per fan: 0 fan = 1 chip, 1 fan = 2, 2 = 4, 3 = 8… capped at the 13-fan limit (8192). ' +
  'Discard winner: the discarder pays. Self-draw: all three opponents pay.';
