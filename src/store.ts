import { useSyncExternalStore, useRef, useCallback, useEffect } from 'react';
import { Game, GameEvent, ChowOption } from './engine/game';
import { attachAi } from './engine/ai';
import { evaluateDiscard, DiscardFeedback, suggestDiscard, Hint, describeShanten } from './engine/feedback';
import { explainMyHand, explainWinStructure, fanSummaryLine } from './engine/explain';
import { shanten as shantenFn } from './engine/hand';
import { pickRandomSeed } from './engine/rng';
import { Tile, TileKind } from './engine/types';
import { tileName } from './content/names';

/**
 * App-level store around a Game instance. Handles:
 *  - pacing AI turns with a ticker so the human can follow the action
 *  - translating engine events into coach commentary
 *  - move feedback on human discards
 *  - settings persisted to localStorage
 */

export interface CoachMessage {
  id: number;
  tone: 'info' | 'action' | 'good' | 'ok' | 'risky' | 'bad' | 'event' | 'win';
  text: string;
  details?: string[];
}

export interface Settings {
  coachEnabled: boolean;
  speed: 'slow' | 'normal' | 'fast';
  soundEnabled: boolean;
}

const SETTINGS_KEY = 'learn-mahjong-settings';
const STATS_KEY = 'learn-mahjong-stats';

export function loadSettings(): Settings {
  try {
    const s = localStorage.getItem(SETTINGS_KEY);
    if (s) return { coachEnabled: true, speed: 'normal', soundEnabled: false, ...JSON.parse(s) };
  } catch { /* ignore */ }
  return { coachEnabled: true, speed: 'normal', soundEnabled: false };
}
export function saveSettings(s: Settings) {
  try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(s)); } catch { /* ignore */ }
}

export interface Stats {
  matchesPlayed: number;
  handsWon: number;
  bestFan: number;
}
export function loadStats(): Stats {
  try {
    const s = localStorage.getItem(STATS_KEY);
    if (s) return JSON.parse(s);
  } catch { /* ignore */ }
  return { matchesPlayed: 0, handsWon: 0, bestFan: 0 };
}
export function saveStats(s: Stats) {
  try { localStorage.setItem(STATS_KEY, JSON.stringify(s)); } catch { /* ignore */ }
}

const SPEED_MS: Record<Settings['speed'], number> = { slow: 1400, normal: 850, fast: 450 };

export class GameStore {
  game: Game;
  coach: CoachMessage[] = [];
  lastFeedback: DiscardFeedback | null = null;
  hint: Hint | null = null;
  settings: Settings = loadSettings();
  /** index into game.events already narrated */
  private narrated = 0;
  private msgId = 1;
  private listeners = new Set<() => void>();
  private timer: ReturnType<typeof setInterval> | null = null;
  version = 0;
  started = false;

  constructor() {
    this.game = new Game(pickRandomSeed());
    attachAi(this.game);
  }

  subscribe = (fn: () => void) => {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  };
  private bump() {
    this.version++;
    this.listeners.forEach((fn) => fn());
  }

  startMatch() {
    this.game = new Game(pickRandomSeed());
    attachAi(this.game);
    this.coach = [];
    this.narrated = 0;
    this.lastFeedback = null;
    this.hint = null;
    this.started = true;
    this.game.startHand();
    const youDeal = this.game.dealer === 0;
    this.say('info',
      `New match! You are ${seatLabel(this.game.seatWind(0))}${youDeal ? ' — and the dealer, so you start' : ''}. Build 4 sets and a pair.`,
      youDeal ? ['You begin with 14 tiles: discard one to start the hand (tap it twice).'] : undefined);
    this.narrateNewEvents();
    this.ensureTicker();
    this.bump();
  }

  ensureTicker() {
    if (this.timer) clearInterval(this.timer);
    this.timer = setInterval(() => this.tick(), SPEED_MS[this.settings.speed]);
  }

  private tick() {
    const g = this.game;
    if (!this.started || g.phase === 'hand-end' || g.phase === 'match-end' || g.phase === 'awaiting-claims') {
      this.narrateNewEvents();
      return;
    }
    const acted = g.step();
    this.narrateNewEvents();
    if (acted) this.bump();
  }

  // ------------------------------------------------------------------
  // Human actions
  // ------------------------------------------------------------------
  humanDiscard(tile: Tile) {
    const g = this.game;
    if (g.phase !== 'awaiting-discard' || g.turn !== 0) return;
    this.hint = null;
    const fb = this.settings.coachEnabled ? evaluateDiscard(g, tile) : null;
    g.discard(tile.id);
    if (fb) {
      this.lastFeedback = fb;
      this.say(fb.verdict === 'good' ? 'good' : fb.verdict === 'ok' ? 'ok' : fb.verdict === 'risky' ? 'risky' : 'bad',
        fb.headline, fb.details);
    }
    this.narrateNewEvents();
    this.bump();
  }

  humanClaim(claim: 'win' | 'pong' | 'gong' | 'chow' | 'pass', chow?: ChowOption) {
    const g = this.game;
    const opts = g.humanClaimOptions;
    const wasConcealed = g.players[0].melds.length === 0;
    const evCount = g.events.length;
    g.humanClaim(claim, chow);

    if (claim === 'pass' && opts?.win) {
      this.say('bad', 'You passed on a WINNING tile!', [
        'That tile completed your hand — claiming it would have won the hand. Winning beats every other option.',
      ]);
    } else if (claim !== 'pass' && claim !== 'win') {
      // did the human actually get the meld, or were they outranked?
      const claimEv = g.events.slice(evCount).find((e) => e.type === 'claim');
      if (claimEv && claimEv.type === 'claim' && claimEv.player !== 0) {
        this.say('info', `Your ${claim === 'chow' ? 'seung' : claim} was outranked.`, [
          'Claim priority: win beats pong/gong, and pong/gong beat seung. When two players want the same discard, the stronger claim takes it.',
        ]);
      } else if (claimEv && claimEv.type === 'claim' && claimEv.player === 0) {
        const details: string[] = [];
        if (wasConcealed) details.push('Your hand is now open — you give up the concealed-hand fan, and opponents can see part of your plan.');
        // after a claim the hand is 3n+2: measure the best shanten after discarding
        const sh = bestShantenAfterDiscard(g);
        if (sh !== null) {
          details.push(sh <= 0 ? 'Discard carefully — you can be ready to win!' : `After your discard you'll be ${describeShanten(sh)}.`);
        }
        this.say('ok', `You claimed the ${claim === 'chow' ? 'seung' : claim}. Now discard a tile.`, details);
      }
    }
    this.narrateNewEvents();
    this.bump();
  }

  humanSelfWin() {
    this.game.declareSelfWin(0);
    this.narrateNewEvents();
    this.bump();
  }

  humanGong(kind: TileKind, added: boolean) {
    if (added) this.game.declareAddedGong(0, kind);
    else this.game.declareConcealedGong(0, kind);
    this.narrateNewEvents();
    this.bump();
  }

  askHint() {
    this.hint = suggestDiscard(this.game);
    if (this.hint) this.say('action', `Coach suggests: discard ${tileName(this.hint.kind)}.`, [this.hint.reason]);
    this.bump();
  }

  /** "Explain my hand": structure, progress, and fan opportunities. */
  explainHand() {
    const ex = explainMyHand(this.game);
    if (!ex) return;
    this.say('action', ex.headline, ex.details);
    this.bump();
  }

  proceed() {
    const g = this.game;
    if (g.phase !== 'hand-end') return;
    const willEnd = g.matchWillEnd;
    g.proceed();
    if (!willEnd) {
      this.say('info', `Hand ${g.handNumber}: ${seatLabel(g.roundWind)} round. You are ${seatLabel(g.seatWind(0))}${g.dealer === 0 ? ' — you deal (14 tiles, discard first)' : ''}.`);
    } else {
      const stats = loadStats();
      stats.matchesPlayed++;
      saveStats(stats);
    }
    this.narrateNewEvents();
    this.bump();
  }

  setSettings(patch: Partial<Settings>) {
    this.settings = { ...this.settings, ...patch };
    saveSettings(this.settings);
    this.ensureTicker();
    this.bump();
  }

  /** re-render on viewport changes (rack tile sizing reads window width) */
  notifyResize() {
    this.bump();
  }

  // ------------------------------------------------------------------
  // Coach narration
  // ------------------------------------------------------------------
  private say(tone: CoachMessage['tone'], text: string, details?: string[]) {
    this.coach.push({ id: this.msgId++, tone, text, details });
    if (this.coach.length > 60) this.coach.splice(0, this.coach.length - 60);
  }

  private narrateNewEvents() {
    const g = this.game;
    const evs = g.events;
    let changed = false;
    for (; this.narrated < evs.length; this.narrated++) {
      const e = evs[this.narrated];
      const msg = this.describeEvent(e);
      if (msg) { this.say(msg.tone, msg.text, msg.details); changed = true; }
    }
    // status prompts after narration
    if (g.phase === 'awaiting-claims' && g.humanClaimOptions) {
      const o = g.humanClaimOptions;
      const opts: string[] = [];
      if (o.win) opts.push('WIN (sik wu!)');
      if (o.pong) opts.push('pong (three of a kind)');
      if (o.gong) opts.push('gong (four of a kind)');
      if (o.chows.length) opts.push('seung (run of three)');
      if (opts.length && !this.lastPromptWas('claim')) {
        this.sayPrompt('claim', 'action', `You can claim that tile: ${opts.join(', ')} — or pass.`);
        changed = true;
      }
    }
    // symmetric prompt for a self-drawn win — beginners miss the button
    if (g.phase === 'awaiting-discard' && g.turn === 0 && g.canSelfWin(0) && !this.lastPromptWas('selfwin')) {
      this.sayPrompt('selfwin', 'action', 'Your hand is complete — press WIN 食糊 to take the self-draw win!');
      changed = true;
    }
    if (changed) this.bump();
  }

  private lastPromptKey: string | null = null;
  private lastPromptWas(key: string) {
    return this.lastPromptKey === key;
  }
  private sayPrompt(key: string, tone: CoachMessage['tone'], text: string, details?: string[]) {
    this.lastPromptKey = key;
    this.say(tone, text, details);
  }

  private describeEvent(e: GameEvent): { tone: CoachMessage['tone']; text: string; details?: string[] } | null {
    const g = this.game;
    const name = (p: number) => (p === 0 ? 'You' : g.players[p].name);
    this.lastPromptKey = null;
    switch (e.type) {
      case 'hand-start':
        return null; // narrated in proceed/startMatch
      case 'flower':
        return {
          tone: 'event',
          text: `${name(e.player)} drew a flower (${tileName(e.tile.kind)}) — set aside, replacement drawn from the back of the wall.`,
        };
      case 'discard':
        return e.player === 0 ? null : { tone: 'event', text: `${g.players[e.player].name} discarded ${tileName(e.tile.kind)}.` };
      case 'draw':
        return null; // too noisy; the rack shows your draw
      case 'claim': {
        const meldName = e.meld.type === 'chow' ? 'seung (run)' : e.meld.type === 'pong' ? 'pong (triplet)' : 'gong (four of a kind)';
        const suffix = e.from === 0 ? ' from YOUR discard' : ` from ${g.players[e.from].name}`;
        return {
          tone: e.from === 0 ? 'risky' : 'event',
          text: `${name(e.player)} claimed ${meldName}${suffix}: ${e.meld.tiles.map((t) => tileName(t.kind)).join(' ')}.`,
          details: e.player !== 0 ? [openHandNote(e.meld.tiles[0].kind, meldName)] : undefined,
        };
      }
      case 'gong-concealed':
        return { tone: 'event', text: `${name(e.player)} declared a concealed gong — four of a kind kept face down (worth a fan).` };
      case 'gong-added':
        return { tone: 'event', text: `${name(e.player)} added a 4th ${tileName(e.kind)} to their pong, making a gong.` };
      case 'ready':
        return null;
      case 'pass-claim':
        return null;
      case 'wall-exhausted':
        return { tone: 'info', text: 'The wall is empty — this hand is a draw. No points change; the same dealer deals again.' };
      case 'win': {
        const how = e.selfDraw ? 'self-draw (zi mo)' : e.from !== null ? `off ${name(e.from)}${e.from === 0 ? 'r' : "'s"} discard` : '';
        const details: string[] = [];
        const hr = g.handResult;
        if (hr?.winnerHand && e.score.decomp) {
          details.push(...explainWinStructure(hr.winnerHand, e.score.decomp, hr.winningTile).summary);
        }
        const fanLine = fanSummaryLine(e.score.items);
        if (fanLine) details.push(fanLine);
        return {
          tone: e.player === 0 ? 'win' : 'bad',
          text: `${name(e.player)} won the hand ${how} — ${e.score.fan} fan!`,
          details,
        };
      }
    }
    return null;
  }
}

function openHandNote(kind: TileKind, meldName: string): string {
  return `Their hand is now more open — you can see what they're collecting. Watch what they discard next.`;
}

function seatLabel(w: string): string {
  return { E: 'East 東', S: 'South 南', W: 'West 西', N: 'North 北' }[w] ?? w;
}

/** Best achievable shanten over all discards from a 3n+2 hand. */
function bestShantenAfterDiscard(g: Game): number | null {
  const p = g.players[0];
  if (p.concealed.length % 3 !== 2) return null;
  const kinds = p.concealed.map((t) => t.kind);
  let best = Infinity;
  const tried = new Set<string>();
  for (const k of kinds) {
    if (tried.has(k)) continue;
    tried.add(k);
    const rest = kinds.slice();
    rest.splice(rest.indexOf(k), 1);
    const sh = shantenFn(rest, p.melds.length);
    if (sh < best) best = sh;
  }
  return Number.isFinite(best) ? best : null;
}

// ------------------------------------------------------------------
// React binding
// ------------------------------------------------------------------
let storeSingleton: GameStore | null = null;
export function getStore(): GameStore {
  if (!storeSingleton) storeSingleton = new GameStore();
  return storeSingleton;
}

export function useGameStore(): GameStore {
  const store = getStore();
  // snapshot must be monotonic: store.version alone (every mutation path calls
  // bump()); summing in game.version could collide across new-game resets.
  useSyncExternalStore(store.subscribe, () => store.version);
  useEffect(() => {
    store.ensureTicker();
    const onResize = () => store.notifyResize();
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [store]);
  return store;
}
