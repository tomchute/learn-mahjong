/**
 * Tutorial content, adapted from Tea Base's Mahjong Instruction Booklet
 * (Hong Kong style). Shown in the toggleable tutorial panel.
 */

export interface GuideSection {
  title: string;
  paragraphs: string[];
}

export const GUIDE: GuideSection[] = [
  {
    title: 'The goal',
    paragraphs: [
      'Build a "dragon" of 14 tiles: 4 sets of 3, plus 1 pair (the eyes).',
      'A set is either a run of 3 ascending numbers in one suit (a seung 上, e.g. 4-5-6 of Circles) or 3 matching tiles (a pong 碰). Honour tiles (winds and dragons) cannot form runs — only 3 or 4 of a kind.',
      'The nicer the hand, the more points (fan 番) it scores when you win.',
    ],
  },
  {
    title: 'The tiles',
    paragraphs: [
      'Hong Kong mahjong uses 144 tiles: three suits numbered 1–9 (Circles "tung", Bamboo "sok", and 10,000s "maan" — 4 of each), the four winds (East, South, West, North), three dragons (Red 中, Green 發, White), and 8 flower tiles.',
      'Flowers are not played in your hand. When you draw one it is set aside face up and you draw a replacement from the back of the wall. Flowers score bonus points when you win.',
    ],
  },
  {
    title: 'Taking a turn',
    paragraphs: [
      'On your turn you draw a tile from the wall, then discard one tile face up — so your hand always stays at 13 tiles between turns.',
      'Play moves counter-clockwise: you, then the player to your right, and so on. On screen: You → right player → top player → left player.',
      'You win by completing 4 sets + a pair, either by drawing your winning tile yourself (self-draw, "zi mo" 自摸) or by claiming another player\'s discard ("sik wu" 食糊).',
    ],
  },
  {
    title: 'Claiming discards',
    paragraphs: [
      'When someone discards a tile you need, you may be able to claim it instead of drawing:',
      'SEUNG 上 (chow): take the discard to complete a run of 3 — but ONLY from the player right before you (the player on your left on screen).',
      'PONG 碰: take the discard to complete 3 matching tiles — from ANY player. This interrupts the turn order; play continues to your right afterwards.',
      'GONG 槓: take the discard to complete 4 matching tiles — from any player. You draw a replacement tile from the back of the wall, and it earns a fan.',
      'WIN 食: if the discard completes your whole hand, claim it and win! Winning beats every other claim.',
      'You canNOT claim a discard just to make a pair — your eyes must come from your own draws. The one exception: if the pair is the last thing your hand needs, completing it IS your winning tile, so you claim it as a WIN.',
      'Claim priority: WIN beats pong/gong, and pong/gong beat seung. If you ask for a seung and another player pongs the same tile, their claim wins — the coach will tell you when that happens.',
      'Claimed sets are placed face up beside your hand. They still count toward your 4 sets, but your hand is no longer "concealed" (concealed hands earn a bonus fan).',
    ],
  },
  {
    title: 'Gongs from your own hand',
    paragraphs: [
      'If you hold all four of a tile, you can declare a CONCEALED gong on your turn: the four tiles are set aside (shown face down) and you draw a replacement from the back of the wall. It keeps your hand concealed and earns a fan.',
      'If you drew the 4th tile matching a pong you already claimed, you can ADD it to that pong (an added gong) — but beware: if another player needs that exact tile to win, they can ROB your gong and take the win.',
    ],
  },
  {
    title: 'Ready ("ting" 聽牌)',
    paragraphs: [
      'When you are one tile away from a complete hand, you are "ready". The coach tells you which tiles complete your hand — try to keep the widest wait you can.',
      'If the wall runs out before anyone wins, the hand is a draw: nobody scores and the same dealer deals again.',
    ],
  },
  {
    title: 'Scoring & the match',
    paragraphs: [
      'Winning hands score fan (番). Payouts double with every fan: 1 fan = 2 chips, 3 fan = 8, 10 fan = 1024… capped at the 13-fan limit. A "chicken hand" (gai wu 鸡糊 — mixed runs and triplets with no pattern) scores 0 fan and wins just 1 chip.',
      'If you win from a discard, only the discarder pays you. If you win by self-draw, all three opponents pay — and self-draw itself is worth a fan.',
      'A full match is 4 rounds — East, South, West, North. The deal passes to the right whenever the dealer neither wins nor the hand ends in a draw (the dealer keeps the deal in both of those cases); when everyone has dealt, the round wind changes. That makes 16 hands minimum. Highest chips at the end wins the match!',
    ],
  },
  {
    title: 'House rules in this app',
    paragraphs: [
      'These rules follow Tea Base\'s Hong Kong style booklet:',
      'Seat winds matter: a pong of YOUR seat wind scores a fan (other winds score nothing). Your seat flower (matching your seat number from the dealer) scores a fan; no flowers at all also scores a fan.',
      'Honour eyes: if your pair is winds or dragons, the hand cannot count the "common hand" (all runs) fan — a plain hand with honour eyes scores 0.',
      'Collecting all 8 flowers is an instant 8-fan win, even with an incomplete hand.',
    ],
  },
];

/** Strategy lessons: reading opponents, defence, attack. Shown in their own tab. */
export const STRATEGY: GuideSection[] = [
  {
    title: 'Reading opponents',
    paragraphs: [
      'You can\'t see their hands — but three things are public: what they CLAIM (every claimed set is face up), what they DISCARD (tiles they decided they don\'t need), and what they never discard.',
      'Two exposed sets in one suit, and no discards of that suit? They\'re likely building a flush — every tile of that suit you discard is a gift. Only triplet claims? They\'re chasing all pongs. Dragon or seat-wind pongs on the table mean their hand already has fan — feeding them is expensive.',
      'Tap any opponent\'s name during play for the coach\'s read: the visible evidence first, then the coach\'s peek so you can check your own reasoning.',
    ],
  },
  {
    title: 'Defence: when and how to fold',
    paragraphs: [
      'The biggest chip losses come from DISCARDING a winner\'s tile — you alone pay. When someone looks ready and your own hand is 2+ tiles away, stop pushing and start defending: winning this hand is no longer your best outcome; not paying is.',
      'What\'s safe? Only one thing is provable at a real table: an honour tile where all four copies are visible can\'t win for anyone (honours can\'t sit in runs). Everything else is only SAFER: tiles the threatening player has discarded themselves, tiles many copies of which are visible, and terminal tiles (1s and 9s fit fewer runs than a 5 does).',
      'A suited tile is never fully safe — someone can wait on it for a run while holding none of them. Middle tiles (4-5-6) are the most dangerous tiles in the game: they complete the most runs.',
      'In this app, when an opponent is ready the coach marks truly dangerous tiles in your rack with a red dot — use it to check your instincts, not to replace them.',
    ],
  },
  {
    title: 'Attack: building value and waits',
    paragraphs: [
      'A wide wait wins more. Waiting on 3-or-6 after 4-5 beats waiting on a single tile: count the copies you can\'t see — the coach shows this count when you\'re ready.',
      'Cheap and fast, or big and slow? A quick chicken hand wins 1 chip; the same tiles steered toward one suit or all pongs can be worth 8+ chips. Early in the hand, lean toward value; once others claim melds, speed matters more.',
      'Claiming opens your hand: you gain speed but lose the concealed-hand fan and show everyone your plan. Strong players claim when it completes their shape, not just because they can.',
      'Self-draw is worth an extra fan AND everyone pays — when you\'re ready with a wide wait, patience often outscores claiming a cheap win... but never pass a win you actually need.',
      'Watch the seat winds: a pong of YOUR seat wind scores; other winds are worthless to you but may be gold to their seat-holder — holding the 4th copy of a claimed wind is free defence.',
    ],
  },
];

export interface OnboardingStep {
  id: string;
  text: string;
  /** what to visually anchor to, used for a gentle highlight */
  anchor: 'rack' | 'discards' | 'compass' | 'opponents' | 'coach' | 'none';
}

export const ONBOARDING: OnboardingStep[] = [
  {
    id: 'welcome',
    text: 'Welcome to the table! This is Hong Kong mahjong from your seat. Your 13 tiles are at the bottom — tap the ⓘ button any time for the full rules.',
    anchor: 'rack',
  },
  {
    id: 'goal',
    text: 'Your goal: collect 4 sets (runs of 3 like 4-5-6, or triplets) plus a pair. The coach panel below will guide every move.',
    anchor: 'rack',
  },
  {
    id: 'explain',
    text: 'Feeling lost? Tap "Explain my hand" on the coach bar any time — the coach breaks down what you have, what to keep building, and which bonus points (fan) are within reach.',
    anchor: 'coach',
  },
  {
    id: 'table',
    text: 'The other three players are around the table. Play moves counter-clockwise; watch their discards appear in the middle.',
    anchor: 'discards',
  },
  {
    id: 'compass',
    text: 'The centre shows the round wind, whose turn it is, and how many tiles are left in the wall.',
    anchor: 'compass',
  },
  {
    id: 'go',
    text: 'When it\'s your turn, tap a tile to select it, then tap again to discard. Your newly drawn tile glows and sits slightly apart on the right. Good luck — sik wu! 食糊',
    anchor: 'rack',
  },
];
