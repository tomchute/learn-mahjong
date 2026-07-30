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
      'Claimed sets are placed face up beside your hand. They still count toward your 4 sets, but your hand is no longer "concealed" (concealed hands earn a bonus fan).',
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
      'A full match is 4 rounds — East, South, West, North. The deal passes to the right whenever the dealer doesn\'t win; when everyone has dealt, the round wind changes. That makes 16 hands minimum. Highest chips at the end wins the match!',
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
    text: 'When it\'s your turn, tap a tile to select it, then tap again to discard. Good luck — sik wu! 食糊',
    anchor: 'rack',
  },
];
