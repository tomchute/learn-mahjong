import {
  Tile, TileKind, Wind, Meld, isFlower, toCounts, KIND_INDEX,
  suitOf, rankOf,
} from './types';
import { Wall } from './tiles';
import { Rng, mulberry32 } from './rng';
import { isWinningHand, shanten, winningTiles } from './hand';
import { scoreHand, scoreEightFlowers, ScoreResult, WinContext, payoutForFan } from './score';

/**
 * Full game orchestration for a 4-player HK mahjong match.
 * Player 0 is the human (bottom of screen); play proceeds counter-clockwise
 * 0 -> 1 -> 2 -> 3, i.e. the screen-right player acts after the human, and
 * the screen-left player acts right before the human (so the human may
 * seung/chow only from player 3).
 */

export const WINDS_ORDER: Wind[] = ['E', 'S', 'W', 'N'];

export interface PlayerState {
  name: string;
  isHuman: boolean;
  concealed: Tile[];
  melds: Meld[];
  flowers: Tile[];
  discards: Tile[];
  chips: number;
}

export type Phase =
  | 'awaiting-discard'   // current player must discard (they have 3n+2 tiles)
  | 'awaiting-claims'    // waiting on human claim decision for last discard
  | 'hand-end'
  | 'match-end';

export interface ChowOption {
  kinds: TileKind[]; // the two hand kinds + discard kind, sorted run
}

export interface ClaimOptions {
  win: boolean;
  pong: boolean;
  gong: boolean;
  chows: ChowOption[]; // non-empty only for the player after the discarder
}

export type GameEvent =
  | { type: 'hand-start'; hand: number; roundWind: Wind; dealer: number }
  | { type: 'draw'; player: number; tile: Tile; fromBack: boolean }
  | { type: 'flower'; player: number; tile: Tile }
  | { type: 'discard'; player: number; tile: Tile }
  | { type: 'claim'; player: number; from: number; meld: Meld; discard: Tile }
  | { type: 'gong-concealed'; player: number; kind: TileKind }
  | { type: 'gong-added'; player: number; kind: TileKind }
  | { type: 'win'; player: number; from: number | null; score: ScoreResult; winningTile: Tile | null; selfDraw: boolean }
  | { type: 'wall-exhausted' }
  | { type: 'ready'; player: number; waits: TileKind[] } // player became ready (ting)
  | { type: 'pass-claim'; player: number };

export interface HandResult {
  winner: number | null;      // null = draw
  from: number | null;        // discarder, null on self-draw
  score: ScoreResult | null;
  payments: number[];         // chip delta per player
  winningTile: Tile | null;
  winnerHand: { concealed: Tile[]; melds: Meld[]; flowers: Tile[] } | null;
  /** the win came from robbing `from`'s added gong (not a discard) */
  robbed: boolean;
  /** seat winds during the hand (dealer rotation happens after) */
  seatWinds: Wind[];
}

interface PendingClaim {
  player: number;
  claim: 'win' | 'pong' | 'gong' | 'chow';
  chow?: ChowOption;
}

export class Game {
  players: PlayerState[];
  wall!: Wall;
  rng: Rng;
  seed: number;

  dealer = 0;
  roundWind: Wind = 'E';
  /** dealer index that started the current round wind */
  roundStartDealer = 0;
  /** how many times dealership has wrapped (round index 0..3) */
  roundIndex = 0;
  handNumber = 0; // 1-based once started

  phase: Phase = 'hand-end';
  turn = 0;
  /** tile just discarded and awaiting claims (still shown in discarder's row) */
  lastDiscard: { tile: Tile; from: number } | null = null;
  /** human claim options on lastDiscard, when phase === 'awaiting-claims' */
  humanClaimOptions: ClaimOptions | null = null;
  private aiClaims: PendingClaim[] = [];

  /** true while the current player has just drawn (their turn to discard) */
  drawnTile: Tile | null = null;
  /** number of first-turn actions; used for heavenly/earthly detection */
  private discardsThisHand = 0;
  private lastActionWasGongReplacement = false;
  private consecutiveGongReplacements = 0;
  /** set when a player declares an added gong that others might rob */
  private robbable: { player: number; kind: TileKind; tile: Tile } | null = null;

  events: GameEvent[] = [];
  handResult: HandResult | null = null;
  version = 0; // bumped on every mutation for UI subscription

  constructor(seed: number, names: string[] = ['You', 'Mei', 'Ken', 'Priya']) {
    this.seed = seed;
    this.rng = mulberry32(seed);
    this.players = names.map((name, i) => ({
      name,
      isHuman: i === 0,
      concealed: [], melds: [], flowers: [], discards: [],
      chips: 500,
    }));
  }

  // ------------------------------------------------------------------
  // Seat helpers
  // ------------------------------------------------------------------
  seatWind(player: number): Wind {
    return WINDS_ORDER[(player - this.dealer + 4) % 4];
  }
  get matchOver(): boolean {
    return this.phase === 'match-end';
  }

  private emit(e: GameEvent) {
    this.events.push(e);
    this.version++;
  }

  // ------------------------------------------------------------------
  // Hand lifecycle
  // ------------------------------------------------------------------
  startHand() {
    if (this.phase === 'match-end') return;
    this.handNumber++;
    this.wall = Wall.create(this.rng);
    for (const p of this.players) {
      p.concealed = []; p.melds = []; p.flowers = []; p.discards = [];
    }
    this.lastDiscard = null;
    this.humanClaimOptions = null;
    this.aiClaims = [];
    this.handResult = null;
    this.drawnTile = null;
    this.discardsThisHand = 0;
    this.lastActionWasGongReplacement = false;
    this.consecutiveGongReplacements = 0;
    this.robbable = null;

    this.emit({ type: 'hand-start', hand: this.handNumber, roundWind: this.roundWind, dealer: this.dealer });

    // Deal 13 to everyone, 14th to dealer, replacing flowers from the back.
    for (let n = 0; n < 13; n++) {
      for (let i = 0; i < 4; i++) {
        const p = (this.dealer + i) % 4;
        this.dealOne(p);
      }
    }
    this.dealOne(this.dealer);
    for (const p of this.players) this.sortHand(p);

    this.turn = this.dealer;
    this.phase = 'awaiting-discard';
    this.drawnTile = null;

    // all eight flowers in the opening deal is an instant win too
    for (let i = 0; i < 4; i++) {
      const p = (this.dealer + i) % 4;
      if (this.players[p].flowers.length === 8) {
        this.finishWithEightFlowers(p);
        return;
      }
    }
    this.version++;
  }

  private dealOne(player: number) {
    let t = this.wall.drawFront();
    while (t && isFlower(t.kind)) {
      this.players[player].flowers.push(t);
      this.emit({ type: 'flower', player, tile: t });
      t = this.wall.drawBack();
    }
    if (t) this.players[player].concealed.push(t);
  }

  sortHand(p: PlayerState) {
    p.concealed.sort((a, b) => KIND_INDEX[a.kind] - KIND_INDEX[b.kind]);
  }

  // ------------------------------------------------------------------
  // Queries
  // ------------------------------------------------------------------
  concealedKinds(player: number): TileKind[] {
    return this.players[player].concealed.map((t) => t.kind);
  }

  /**
   * Self-draw wins and gong declarations require an ACTUAL draw this turn
   * (or the dealer's untouched opening 14). A turn gained by claiming a
   * pong/seung comes with no draw: you must simply discard — otherwise a
   * claim could be laundered into a "self-draw" (triple payment) or into a
   * gong's free replacement tile.
   */
  private hasDrawnOrOpeningHand(player: number): boolean {
    if (this.drawnTile !== null) return true;
    return player === this.dealer && this.discardsThisHand === 0 &&
      this.players[player].melds.length === 0;
  }

  /** Can `player` declare a self-draw win right now (it's their discard turn)? */
  canSelfWin(player: number): boolean {
    if (this.phase !== 'awaiting-discard' || this.turn !== player) return false;
    if (!this.hasDrawnOrOpeningHand(player)) return false;
    return isWinningHand(this.concealedKinds(player), this.players[player].melds.length);
  }

  /** Concealed gong kinds available to the player on their turn. */
  concealedGongOptions(player: number): TileKind[] {
    if (this.phase !== 'awaiting-discard' || this.turn !== player) return [];
    if (!this.hasDrawnOrOpeningHand(player)) return [];
    if (this.wall.remaining === 0) return []; // no replacement tile → no gong
    const counts = toCounts(this.concealedKinds(player));
    const out: TileKind[] = [];
    counts.forEach((n, i) => {
      if (n === 4) out.push(Object.keys(KIND_INDEX).find((k) => KIND_INDEX[k] === i)!);
    });
    return out;
  }

  /** Added gong: a 4th tile in hand matching an exposed pong. */
  addedGongOptions(player: number): TileKind[] {
    if (this.phase !== 'awaiting-discard' || this.turn !== player) return [];
    if (!this.hasDrawnOrOpeningHand(player)) return [];
    if (this.wall.remaining === 0) return []; // no replacement tile → no gong
    const kinds = this.concealedKinds(player);
    return this.players[player].melds
      .filter((m) => m.type === 'pong' && kinds.includes(m.tiles[0].kind))
      .map((m) => m.tiles[0].kind);
  }

  claimOptionsFor(player: number, discard: Tile, from: number): ClaimOptions {
    const p = this.players[player];
    const kinds = this.concealedKinds(player);
    const counts = toCounts(kinds);
    const ki = KIND_INDEX[discard.kind];

    const win = isWinningHand([...kinds, discard.kind], p.melds.length);
    const pong = counts[ki] >= 2;
    // no gong when the wall has no replacement tile left (standard table rule;
    // it would also end the hand instantly, skipping the final claim window)
    const gong = counts[ki] >= 3 && this.wall.remaining > 0;

    const chows: ChowOption[] = [];
    if ((from + 1) % 4 === player) {
      const suit = suitOf(discard.kind);
      if (suit) {
        const r = rankOf(discard.kind);
        const has = (rr: number) => rr >= 1 && rr <= 9 && counts[KIND_INDEX[`${suit}-${rr}`]] > 0;
        const mk = (a: number, b: number, c: number): ChowOption => ({
          kinds: [`${suit}-${a}`, `${suit}-${b}`, `${suit}-${c}`],
        });
        if (has(r - 2) && has(r - 1)) chows.push(mk(r - 2, r - 1, r));
        if (has(r - 1) && has(r + 1)) chows.push(mk(r - 1, r, r + 1));
        if (has(r + 1) && has(r + 2)) chows.push(mk(r, r + 1, r + 2));
      }
    }
    return { win, pong, gong, chows };
  }

  shantenOf(player: number): number {
    return shanten(this.concealedKinds(player), this.players[player].melds.length);
  }

  waitsOf(player: number): TileKind[] {
    return winningTiles(this.concealedKinds(player), this.players[player].melds.length);
  }

  // ------------------------------------------------------------------
  // Actions
  // ------------------------------------------------------------------

  /** Current player discards a tile (by instance id). */
  discard(tileId: number) {
    const p = this.players[this.turn];
    const idx = p.concealed.findIndex((t) => t.id === tileId);
    if (idx < 0 || this.phase !== 'awaiting-discard') return;
    const [tile] = p.concealed.splice(idx, 1);
    p.discards.push(tile);
    this.sortHand(p);
    this.drawnTile = null;
    this.lastActionWasGongReplacement = false;
    this.consecutiveGongReplacements = 0;
    this.discardsThisHand++;
    this.emit({ type: 'discard', player: this.turn, tile });
    this.lastDiscard = { tile, from: this.turn };
    this.collectClaims();
  }

  /**
   * Gather claim decisions. AI decisions are computed immediately via the
   * attached ai hook; if the human has options we stop and wait.
   */
  aiDecideClaim:
    | ((game: Game, player: number, options: ClaimOptions, discard: Tile, from: number) => PendingClaim | null)
    | null = null;

  private collectClaims() {
    const { tile, from } = this.lastDiscard!;
    this.aiClaims = [];
    this.humanClaimOptions = null;
    let humanHas = false;

    for (let i = 0; i < 4; i++) {
      if (i === from) continue;
      const opts = this.claimOptionsFor(i, tile, from);
      const any = opts.win || opts.pong || opts.gong || opts.chows.length > 0;
      if (!any) continue;
      if (this.players[i].isHuman) {
        humanHas = true;
        this.humanClaimOptions = opts;
      } else if (this.aiDecideClaim) {
        const c = this.aiDecideClaim(this, i, opts, tile, from);
        if (c) this.aiClaims.push(c);
      }
    }

    if (humanHas) {
      this.phase = 'awaiting-claims';
      this.version++;
    } else {
      this.resolveClaims('none');
    }
  }

  /** Human resolves their claim opportunity. */
  humanClaim(claim: 'win' | 'pong' | 'gong' | 'chow' | 'pass', chow?: ChowOption) {
    if (this.phase !== 'awaiting-claims') return;
    if (this.pendingAddedGong) {
      // this claim window is a robbing-the-gong prompt: win robs, anything else declines
      this.resolveRob(claim === 'win');
      return;
    }
    // validate against the offered options — a stale or malformed claim must
    // never fabricate a phantom win, an undersized "gong", or a wrong-seat chow
    const o = this.humanClaimOptions;
    if (claim !== 'pass') {
      if (!o) return;
      if (claim === 'win' && !o.win) return;
      if (claim === 'pong' && !o.pong) return;
      if (claim === 'gong' && !o.gong) return;
      if (claim === 'chow' && !o.chows.some((c) => c.kinds.join() === chow?.kinds.join())) return;
    }
    this.phase = 'awaiting-discard'; // will be corrected by resolveClaims
    if (claim === 'pass') {
      this.emit({ type: 'pass-claim', player: 0 });
      this.resolveClaims('none');
    } else {
      this.resolveClaims('human', { player: 0, claim, chow });
    }
  }

  private resolveClaims(mode: 'none' | 'human', humanClaim?: PendingClaim) {
    const { tile, from } = this.lastDiscard!;
    // the window is closing: clear the human's options so a stale second
    // tap (before the UI unmounts) can't re-enter this path
    this.humanClaimOptions = null;
    const candidates: PendingClaim[] = [...this.aiClaims];
    this.aiClaims = [];
    if (mode === 'human' && humanClaim) candidates.push(humanClaim);

    const priority = (c: PendingClaim) =>
      c.claim === 'win' ? 3 : c.claim === 'pong' || c.claim === 'gong' ? 2 : 1;
    // among equal priority (only possible for wins), nearest after discarder
    const seatDist = (p: number) => (p - from + 4) % 4;
    candidates.sort((a, b) => priority(b) - priority(a) || seatDist(a.player) - seatDist(b.player));

    const winner = candidates[0];
    if (!winner) {
      // nobody claimed: tile stays in the discard row, next player draws
      this.advanceTurn((from + 1) % 4);
      return;
    }

    const p = this.players[winner.player];
    // remove the tile from the discarder's row (it gets claimed)
    const dp = this.players[from];
    const di = dp.discards.findIndex((t) => t.id === tile.id);
    if (di >= 0) dp.discards.splice(di, 1);

    if (winner.claim === 'win') {
      this.finishWithWin(winner.player, from, tile, { selfDraw: false, robbing: false });
      return;
    }

    // build the meld
    const takeFromHand = (kind: TileKind, n: number): Tile[] => {
      const taken: Tile[] = [];
      for (let i = p.concealed.length - 1; i >= 0 && taken.length < n; i--) {
        if (p.concealed[i].kind === kind) taken.push(...p.concealed.splice(i, 1));
      }
      return taken;
    };

    let meld: Meld;
    if (winner.claim === 'pong') {
      meld = { type: 'pong', tiles: [...takeFromHand(tile.kind, 2), tile], claimedFrom: from, concealed: false };
    } else if (winner.claim === 'gong') {
      meld = { type: 'gong', tiles: [...takeFromHand(tile.kind, 3), tile], claimedFrom: from, concealed: false };
    } else {
      const chow = winner.chow!;
      const need = chow.kinds.filter((k) => k !== tile.kind);
      // if the run contains the discard kind twice... impossible; take the two others
      const t1 = takeFromHand(need[0], 1);
      const t2 = takeFromHand(need[1] ?? need[0], 1);
      meld = { type: 'chow', tiles: [...t1, ...t2, tile].sort((a, b) => KIND_INDEX[a.kind] - KIND_INDEX[b.kind]), claimedFrom: from, concealed: false };
    }
    p.melds.push(meld);
    this.sortHand(p);
    this.emit({ type: 'claim', player: winner.player, from, meld, discard: tile });
    this.lastDiscard = null;

    if (winner.claim === 'gong') {
      // draw replacement from the back
      this.turn = winner.player;
      this.phase = 'awaiting-discard';
      this.drawReplacement(winner.player);
    } else {
      this.turn = winner.player;
      this.phase = 'awaiting-discard';
      this.drawnTile = null;
      this.version++;
    }
  }

  /** Move to `player`'s turn and draw from the wall front. */
  private advanceTurn(player: number) {
    this.turn = player;
    this.phase = 'awaiting-discard';
    const t = this.wall.drawFront();
    if (!t) {
      this.endHandInDraw();
      return;
    }
    this.handleDrawnTile(player, t, false);
  }

  private drawReplacement(player: number) {
    const t = this.wall.drawBack();
    if (!t) {
      this.endHandInDraw();
      return;
    }
    this.lastActionWasGongReplacement = true;
    this.consecutiveGongReplacements++;
    this.handleDrawnTile(player, t, true);
  }

  private handleDrawnTile(player: number, t: Tile, fromBack: boolean) {
    const p = this.players[player];
    if (isFlower(t.kind)) {
      p.flowers.push(t);
      this.emit({ type: 'flower', player, tile: t });
      if (p.flowers.length === 8) {
        this.finishWithEightFlowers(player);
        return;
      }
      const r = this.wall.drawBack();
      if (!r) {
        this.endHandInDraw();
        return;
      }
      this.handleDrawnTile(player, r, true);
      return;
    }
    p.concealed.push(t);
    this.drawnTile = t;
    this.emit({ type: 'draw', player, tile: t, fromBack });
  }

  /** current player declares self-draw win */
  declareSelfWin(player: number) {
    if (!this.canSelfWin(player)) return;
    const heavenly = player === this.dealer && this.discardsThisHand === 0 && this.players[player].melds.length === 0;
    this.finishWithWin(player, null, this.drawnTile, {
      selfDraw: true, robbing: false, heavenly,
    });
  }

  /** current player declares a concealed gong */
  declareConcealedGong(player: number, kind: TileKind) {
    if (!this.concealedGongOptions(player).includes(kind)) return;
    const p = this.players[player];
    const tiles = p.concealed.filter((t) => t.kind === kind);
    if (tiles.length !== 4) return;
    p.concealed = p.concealed.filter((t) => t.kind !== kind);
    p.melds.push({ type: 'gong', tiles, claimedFrom: null, concealed: true });
    this.emit({ type: 'gong-concealed', player, kind });
    this.drawReplacement(player);
  }

  /** current player adds 4th tile to an exposed pong (robbable!) */
  declareAddedGong(player: number, kind: TileKind) {
    if (!this.addedGongOptions(player).includes(kind)) return;
    const p = this.players[player];
    const meld = p.melds.find((m) => m.type === 'pong' && m.tiles[0].kind === kind);
    const ti = p.concealed.findIndex((t) => t.kind === kind);
    if (!meld || ti < 0) return;
    const [tile] = p.concealed.splice(ti, 1);
    this.emit({ type: 'gong-added', player, kind });

    // Robbing the gong: players who can win on this tile, in seat order after
    // the declarer. The nearest AI robs immediately; if the human is nearest
    // they get a prompt, and declining falls through to later eligible winners.
    const robbers: number[] = [];
    for (let i = 1; i < 4; i++) {
      const other = (player + i) % 4;
      const o = this.players[other];
      if (isWinningHand([...this.concealedKinds(other), kind], o.melds.length)) robbers.push(other);
    }
    if (robbers.length > 0) {
      if (!this.players[robbers[0]].isHuman) {
        this.finishWithWin(robbers[0], player, tile, { selfDraw: false, robbing: true });
        return;
      }
      this.robbable = { player, kind, tile };
      this.phase = 'awaiting-claims';
      this.humanClaimOptions = { win: true, pong: false, gong: false, chows: [] };
      this.lastDiscard = { tile, from: player };
      // stash the tile out of the meld until resolved
      this.pendingAddedGong = { meld, tile, player, laterWinners: robbers.slice(1) };
      this.version++;
      return;
    }
    meld.type = 'gong';
    meld.tiles.push(tile);
    this.drawReplacement(player);
  }

  private pendingAddedGong: { meld: Meld; tile: Tile; player: number; laterWinners: number[] } | null = null;

  /** Human decision on robbing a gong. */
  resolveRob(rob: boolean) {
    if (!this.pendingAddedGong) return;
    const { meld, tile, player, laterWinners } = this.pendingAddedGong;
    this.pendingAddedGong = null;
    this.robbable = null;
    this.humanClaimOptions = null;
    this.lastDiscard = null;
    if (rob) {
      this.finishWithWin(0, player, tile, { selfDraw: false, robbing: true });
    } else if (laterWinners.length > 0) {
      // the human declined, but a later eligible winner still robs the gong
      this.finishWithWin(laterWinners[0], player, tile, { selfDraw: false, robbing: true });
    } else {
      meld.type = 'gong';
      meld.tiles.push(tile);
      this.phase = 'awaiting-discard';
      this.drawReplacement(player);
    }
  }

  get isRobbingPrompt(): boolean {
    return this.pendingAddedGong !== null;
  }

  // ------------------------------------------------------------------
  // Hand end
  // ------------------------------------------------------------------
  private finishWithWin(
    player: number, from: number | null, winningTile: Tile | null,
    flags: { selfDraw: boolean; robbing: boolean; heavenly?: boolean },
  ) {
    const p = this.players[player];
    // For a discard/rob win, the winning tile joins the concealed portion.
    if (!flags.selfDraw && winningTile) {
      p.concealed.push(winningTile);
      this.sortHand(p);
    }
    const earthly = !flags.selfDraw && !flags.robbing && this.discardsThisHand === 1 &&
      player !== this.dealer && p.melds.length === 0;

    const ctx: WinContext = {
      seatWind: this.seatWind(player),
      selfDraw: flags.selfDraw,
      concealed: p.melds.every((m) => m.concealed),
      robbingGong: flags.robbing,
      afterGong: flags.selfDraw && this.lastActionWasGongReplacement,
      afterDoubleGong: flags.selfDraw && this.consecutiveGongReplacements >= 2,
      lastTile: flags.selfDraw && this.wall.remaining === 0,
      heavenly: !!flags.heavenly,
      earthly,
    };
    const score = scoreHand(this.concealedKinds(player), p.melds, p.flowers.map((f) => f.kind), ctx);
    this.applyWin(player, from, score, winningTile, flags.selfDraw, flags.robbing);
  }

  private finishWithEightFlowers(player: number) {
    const p = this.players[player];
    const score = scoreEightFlowers(p.flowers.map((f) => f.kind), {
      seatWind: this.seatWind(player), selfDraw: true, concealed: false,
      robbingGong: false, afterGong: false, afterDoubleGong: false,
      lastTile: false, heavenly: false, earthly: false,
    });
    this.applyWin(player, null, score, null, true, false);
  }

  private applyWin(player: number, from: number | null, score: ScoreResult, winningTile: Tile | null, selfDraw: boolean, robbed = false) {
    const payments = [0, 0, 0, 0];
    if (selfDraw || from === null) {
      for (let i = 0; i < 4; i++) {
        if (i !== player) {
          payments[i] = -score.payout;
          payments[player] += score.payout;
        }
      }
    } else {
      payments[from] = -score.payout;
      payments[player] += score.payout;
    }
    for (let i = 0; i < 4; i++) this.players[i].chips += payments[i];

    const p = this.players[player];
    this.handResult = {
      winner: player, from, score, payments,
      winningTile,
      winnerHand: {
        concealed: p.concealed.slice(),
        melds: p.melds.map((m) => ({ ...m, tiles: m.tiles.slice() })),
        flowers: p.flowers.slice(),
      },
      seatWinds: [0, 1, 2, 3].map((i) => this.seatWind(i)),
      robbed,
    };
    this.emit({ type: 'win', player, from, score, winningTile, selfDraw });
    this.phase = 'hand-end';
    this.rotateDealership(player);
  }

  private endHandInDraw() {
    this.emit({ type: 'wall-exhausted' });
    this.handResult = {
      winner: null, from: null, score: null,
      payments: [0, 0, 0, 0], winningTile: null, winnerHand: null,
      seatWinds: [0, 1, 2, 3].map((i) => this.seatWind(i)),
      robbed: false,
    };
    this.phase = 'hand-end';
    // draw: dealer stays ("the dice roll goes back to the same person")
    this.version++;
  }

  /** true once the final hand of the match has been played */
  matchWillEnd = false;

  /** After a decided hand: dealer repeats on dealer win, else passes CCW. */
  private rotateDealership(winner: number) {
    if (winner === this.dealer) return; // dealer keeps the deal
    const next = (this.dealer + 1) % 4;
    if (next === this.roundStartDealer) {
      // everyone has dealt this round: advance the round wind
      if (this.roundIndex === 3) {
        this.matchWillEnd = true; // hand result still shows; UI ends match after
        return;
      }
      this.roundIndex++;
      this.roundWind = WINDS_ORDER[this.roundIndex];
    }
    this.dealer = next;
  }

  /** Advance past the hand-end screen: next hand, or finish the match. */
  proceed() {
    if (this.phase !== 'hand-end') return;
    if (this.matchWillEnd) {
      this.phase = 'match-end';
      this.version++;
    } else {
      this.startHand();
    }
  }

  /** Called by UI to advance one AI action; returns false if blocked on human. */
  aiTakeTurn:
    | ((game: Game) => void)
    | null = null;

  /**
   * Perform the next automatic step:
   *  - if it's an AI player's discard turn, let the AI act
   *  - if it's the human's turn but they haven't drawn (start of turn), draw
   * Returns true if something happened.
   */
  step(): boolean {
    if (this.phase === 'awaiting-discard') {
      const p = this.players[this.turn];
      // beginning of a normal turn: current player needs 3n+2 tiles; if they
      // have 3n+1 it means they still need to draw (dealer starts with 14).
      const size = p.concealed.length + 3 * p.melds.length;
      if (size % 3 !== 2) {
        // they need to draw — this happens only via advanceTurn, which draws
        // automatically; defensive fallback:
        const t = this.wall.drawFront();
        if (!t) { this.endHandInDraw(); return true; }
        this.handleDrawnTile(this.turn, t, false);
        return true;
      }
      if (!p.isHuman && this.aiTakeTurn) {
        this.aiTakeTurn(this);
        return true;
      }
      return false; // waiting for human discard
    }
    return false; // awaiting-claims (human), hand-end, match-end
  }
}
