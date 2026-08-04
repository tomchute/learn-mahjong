import { TileKind, Tile } from './types';
import { Game, ClaimOptions, ChowOption } from './game';
import { shanten, winningTiles } from './hand';
import { scoreHand, WinContext } from './score';
import { evaluateDiscard, DiscardFeedback } from './feedback';
import { dangerTiles, unseenCount } from './insight';
import { tileName } from '../content/names';

/**
 * Post-hand review: a decision log recorded as the human plays, analysed at
 * hand end into ranked "key moments" and one takeaway.
 *
 * Honesty rule: counterfactuals are phrased as what a different choice would
 * have changed AT THAT MOMENT (shanten, safety, a missed win). We never claim
 * an alternate line would have won the hand — every choice changes what
 * follows, and a teaching tool shouldn't pretend otherwise.
 */

export interface DiscardLogEntry {
  kind: 'discard';
  turn: number;               // your Nth discard this hand
  hand: TileKind[];           // your 3n+2 tiles before the discard
  melds: number;
  tile: TileKind;
  fb: DiscardFeedback;
  /** the WIN button was actually available at this moment */
  couldSelfWin: boolean;
  /** ready opponents (by player index) whose waits included the tile */
  dealtInto: number[];
  /** tiles you held that no ready opponent was waiting on (at that moment) */
  safeHeld: TileKind[];
  opponentsReady: number[];
}

export interface ClaimLogEntry {
  kind: 'claim';
  turn: number;               // your discard-turn count at the time
  tile: TileKind;
  action: 'win' | 'pong' | 'gong' | 'chow' | 'pass' | 'rob' | 'rob-pass';
  /** passing gave up a completed winning hand worth this many fan */
  missedWinFan: number | null;
  /** best shanten improvement any available claim offered */
  bestClaimDelta: number | null;
  /** shanten improvement of the claim actually taken (if taken) */
  takenDelta: number | null;
  myShanten: number;
}

export type HandLogEntry = DiscardLogEntry | ClaimLogEntry;

export interface KeyMoment {
  severity: 'critical' | 'major' | 'minor' | 'praise';
  title: string;
  detail: string;
  tiles?: TileKind[];
}

export interface HandReview {
  handNumber: number;
  outcome: string;
  outcomeDetail: string;
  trajectory: string;
  moments: KeyMoment[];
  takeaway: string;
  finalHand: TileKind[];
  finalMelds: { type: string; kinds: TileKind[] }[];
}

// ---------------------------------------------------------------------------
// Recording (called from the store as the human acts)
// ---------------------------------------------------------------------------

/** Build a discard log entry. Call BEFORE game.discard() resolves claims. */
export function recordDiscard(game: Game, tile: Tile, turn: number): DiscardLogEntry {
  const me = game.players[0];
  const fb = evaluateDiscard(game, tile);
  const danger = dangerTiles(game);
  const dealtInto = danger.get(tile.kind) ?? [];
  const heldKinds = [...new Set(me.concealed.map((t) => t.kind))];
  const safeHeld = danger.size > 0 ? heldKinds.filter((k) => !danger.has(k)) : heldKinds;
  return {
    kind: 'discard',
    turn,
    hand: me.concealed.map((t) => t.kind),
    melds: me.melds.length,
    tile: tile.kind,
    fb,
    couldSelfWin: game.canSelfWin(0),
    dealtInto,
    safeHeld,
    opponentsReady: [...new Set([...danger.values()].flat())],
  };
}

/** Build a claim log entry. Call BEFORE game.humanClaim() mutates state. */
export function recordClaim(
  game: Game,
  opts: ClaimOptions,
  discard: Tile,
  action: 'win' | 'pong' | 'gong' | 'chow' | 'pass',
  chow: ChowOption | undefined,
  turn: number,
  robbing: boolean,
): ClaimLogEntry {
  const me = game.players[0];
  const kinds = me.concealed.map((t) => t.kind);
  const before = kinds.length % 3 === 1 ? shanten(kinds, me.melds.length) : 99;

  // ANY non-win action past an offered win is a missed win — passing it,
  // or worse, claiming the same tile as a mere pong/gong/chow.
  let missedWinFan: number | null = null;
  if (opts.win && action !== 'win') {
    const ctx: WinContext = {
      seatWind: game.seatWind(0), selfDraw: false,
      concealed: me.melds.every((m) => m.concealed),
      robbingGong: robbing, afterGong: false, afterDoubleGong: false,
      lastTile: false, heavenly: false, earthly: false,
    };
    missedWinFan = scoreHand([...kinds, discard.kind], me.melds, me.flowers.map((f) => f.kind), ctx).fan;
  }

  const deltaFor = (used: TileKind[], meldGain: number): number => {
    const rest = kinds.slice();
    for (const k of used) {
      const i = rest.indexOf(k);
      if (i >= 0) rest.splice(i, 1);
    }
    return before - shanten(rest, me.melds.length + meldGain);
  };
  const deltas: { action: string; delta: number }[] = [];
  if (opts.pong) deltas.push({ action: 'pong', delta: deltaFor([discard.kind, discard.kind], 1) });
  if (opts.gong) deltas.push({ action: 'gong', delta: deltaFor([discard.kind, discard.kind, discard.kind], 1) });
  for (const c of opts.chows) {
    deltas.push({ action: 'chow', delta: deltaFor(c.kinds.filter((k) => k !== discard.kind), 1) });
  }
  const best = deltas.length ? Math.max(...deltas.map((d) => d.delta)) : null;
  const taken = action === 'pong' || action === 'gong' || action === 'chow'
    ? deltas.find((d) => d.action === action)?.delta ?? null
    : null;

  return {
    kind: 'claim',
    turn,
    tile: discard.kind,
    action: robbing ? (action === 'win' ? 'rob' : 'rob-pass') : action,
    missedWinFan,
    bestClaimDelta: best,
    takenDelta: taken,
    myShanten: before,
  };
}

// ---------------------------------------------------------------------------
// Analysis
// ---------------------------------------------------------------------------

export function buildHandReview(game: Game, log: HandLogEntry[]): HandReview {
  const r = game.handResult;
  const me = game.players[0];
  const name = (p: number) => (p === 0 ? 'You' : game.players[p].name);
  const moments: KeyMoment[] = [];

  // ---- outcome ----
  let outcome: string;
  let outcomeDetail: string;
  if (!r || r.winner === null) {
    outcome = 'The hand ended in a draw.';
    outcomeDetail = 'The wall ran out with nobody winning. No chips moved.';
  } else if (r.winner === 0) {
    outcome = `You WON — ${r.score!.fan} fan (${r.score!.payout} chips${r.from === null ? ' from each player' : ''}).`;
    outcomeDetail = r.from === null
      ? 'Won by self-draw, so all three opponents paid.'
      : `Won off ${name(r.from)}'s discard.`;
  } else {
    outcome = `${name(r.winner)} won — ${r.score!.fan} fan.`;
    outcomeDetail = r.from === null
      ? `${name(r.winner)} drew the winning tile themselves; everyone paid ${r.score!.payout} chips.`
      : r.robbed
        ? r.from === 0
          ? `They ROBBED your added gong — the 4th tile you added completed their hand, and you paid the full ${r.score!.payout} chips.`
          : `They won by robbing ${name(r.from)}'s added gong.`
        : r.from === 0
          ? `They won off YOUR discard — you paid the full ${r.score!.payout} chips.`
          : `They won off ${name(r.from)}'s discard.`;
  }

  const discards = log.filter((e): e is DiscardLogEntry => e.kind === 'discard');
  const claims = log.filter((e): e is ClaimLogEntry => e.kind === 'claim');

  // ---- trajectory ----
  const finalKinds = me.concealed.map((t) => t.kind);
  const finalShanten = finalKinds.length % 3 === 1 ? shanten(finalKinds, me.melds.length) : null;
  let best = Infinity;
  let bestTurn = 0;
  for (const d of discards) {
    if (d.fb.shantenAfter < best) { best = d.fb.shantenAfter; bestTurn = d.turn; }
  }
  let trajectory: string;
  if (discards.length === 0) {
    trajectory = 'The hand ended before you made a discard.';
  } else if (r?.winner === 0) {
    trajectory = `You took ${discards.length} turns and completed your hand.`;
  } else if (best <= 0) {
    trajectory = `You reached READY on your discard #${bestTurn}${finalShanten !== null && finalShanten > 0 ? ', but drifted back out of it' : ' and stayed there'}.`;
  } else if (Number.isFinite(best)) {
    trajectory = `Closest you got: ${best} tile${best === 1 ? '' : 's'} from ready (discard #${bestTurn} of ${discards.length}).`;
  } else {
    trajectory = `You made ${discards.length} discards this hand.`;
  }

  // ---- critical moments ----
  for (const c of claims) {
    if (c.missedWinFan !== null) {
      const claimedInstead = c.action === 'pong' || c.action === 'gong' || c.action === 'chow';
      moments.push({
        severity: 'critical',
        title: c.action === 'rob-pass' ? 'You declined to rob a gong — that was a win'
          : claimedInstead ? `You claimed a ${c.action} on a tile that WON`
          : 'You passed a winning tile',
        detail: `${tileName(c.tile)} completed your hand for ${c.missedWinFan} fan (${2 ** Math.min(c.missedWinFan, 13)} chips). ` +
          (claimedInstead
            ? 'When a discard both completes your hand and fits a meld, WIN outranks everything — the meld locks you out of the win (a claimed turn has no draw, so no self-draw exists).'
            : 'Winning immediately is almost always right — a bigger hand later usually never comes.'),
        tiles: [c.tile],
      });
    }
  }
  for (const d of discards) {
    if (d.fb.shantenBefore === -1 && d.couldSelfWin) {
      moments.push({
        severity: 'critical',
        title: 'You discarded from a complete hand',
        detail: `Before discarding ${tileName(d.tile)} (turn ${d.turn}), your 14 tiles already formed a winning hand — the WIN button was lit.`,
        tiles: [d.tile],
      });
    }
  }
  // the winner robbed YOUR added gong (not a discard — don't blame one)
  if (r && r.winner !== null && r.winner !== 0 && r.from === 0 && r.robbed) {
    moments.push({
      severity: 'critical',
      title: `${name(r.winner)} robbed your added gong`,
      detail: `The 4th ${r.winningTile ? tileName(r.winningTile.kind) : 'tile'} you added to your pong was exactly ${name(r.winner)}'s winning tile. ` +
        'Adding to a pong is the one move another player can steal a win from — when someone looks ready, the extra fan is rarely worth the robbery risk.',
      tiles: r.winningTile ? [r.winningTile.kind] : undefined,
    });
  }
  // dealt into the winner by discard?
  if (r && r.winner !== null && r.winner !== 0 && r.from === 0 && !r.robbed) {
    const last = discards[discards.length - 1];
    if (last) {
      const safe = last.safeHeld.filter((k) => k !== last.tile).slice(0, 4);
      moments.push({
        severity: 'critical',
        title: `Your ${tileName(last.tile)} fed ${name(r.winner)}'s win`,
        detail: safe.length > 0
          ? `At that moment you also held ${safe.map(tileName).join(', ')} — none of which any ready player was waiting on. ` +
            `When a ready opponent is visible and your hand is behind, reach for the safest tile, not the most convenient one.`
          : 'Every tile in your hand at that point dealt into a ready player — you were trapped, and sometimes mahjong does that. The earlier lesson is to start folding a turn or two sooner.',
        tiles: [last.tile],
      });
    }
  }

  // ---- major: efficiency losses & missed accelerating claims ----
  for (const d of discards) {
    const loss = d.fb.shantenAfter - d.fb.bestAfter;
    if (d.fb.shantenBefore !== -1 && loss >= 1 && d.dealtInto.length === 0) {
      // don't double-report the deal-in discard
      const isFinalDealIn = r?.from === 0 && !r?.robbed && d === discards[discards.length - 1];
      if (!isFinalDealIn) {
        moments.push({
          severity: loss >= 2 ? 'major' : 'minor',
          title: `Turn ${d.turn}: ${tileName(d.tile)} cost you tempo`,
          detail: `Discarding ${d.fb.bestKinds.slice(0, 2).map(tileName).join(' or ')} instead would have left you ` +
            `${d.fb.bestAfter <= 0 ? 'READY' : `${d.fb.bestAfter} from ready`} rather than ${d.fb.shantenAfter}. ` +
            (d.opponentsReady.length > 0 ? '(Unless you were folding on purpose — then safety beats speed.)' : ''),
          tiles: [d.tile, ...d.fb.bestKinds.slice(0, 2)],
        });
      }
    }
  }
  for (const c of claims) {
    if (c.action === 'pass' && c.missedWinFan === null && c.bestClaimDelta !== null && c.bestClaimDelta >= 1 && c.myShanten >= 2) {
      moments.push({
        severity: 'minor',
        title: `You passed a useful claim on ${tileName(c.tile)}`,
        detail: `Claiming would have moved you ${c.bestClaimDelta} step${c.bestClaimDelta > 1 ? 's' : ''} closer. ` +
          'Passing keeps your hand concealed (worth a fan) — a fair trade if it was deliberate, a leak if it wasn\'t.',
        tiles: [c.tile],
      });
    }
  }

  // ---- dead wait detection at hand end ----
  if (finalShanten === 0 && r && r.winner !== 0) {
    const waits = winningTiles(finalKinds, me.melds.length);
    // the tile that just won moved into the winner's revealed hand, which
    // unseenCount doesn't inspect — don't count it as "still out there"
    const wonKind = r.winningTile?.kind ?? null;
    const live = waits.map((w) => ({
      w,
      n: Math.max(0, unseenCount(game, w) - (w === wonKind ? 1 : 0)),
    }));
    const totalLive = live.reduce((a, x) => a + x.n, 0);
    if (totalLive === 0) {
      moments.push({
        severity: 'major',
        title: 'Your wait was DEAD',
        detail: `You ended ready on ${waits.map(tileName).join(' / ')}, but every remaining copy was already visible on the table. ` +
          'Count your winning tiles when you reach ready — a dead wait can only be fixed by reshaping your hand.',
        tiles: waits,
      });
    } else {
      moments.push({
        severity: 'praise',
        title: 'You were ready with a live wait',
        detail: `${totalLive} winning ${totalLive === 1 ? 'copy was' : 'copies were'} still out there (${live.map((x) => `${tileName(x.w)}: ${x.n}`).join(', ')}). ` +
          'Nothing wrong with your play — the tiles just fell elsewhere this time.',
        tiles: waits,
      });
    }
  }

  // ---- praise ----
  if (r?.winner === 0 && r.score) {
    moments.push({
      severity: 'praise',
      title: `A ${r.score.fan}-fan win`,
      detail: r.score.items.map((i) => `${i.name} +${i.fan}`).join(' · ') || 'Chicken hand — a win is a win!',
    });
  }
  const anyLoss = discards.some((d) => d.fb.shantenBefore !== -1 && d.fb.shantenAfter - d.fb.bestAfter >= 1);
  if (!anyLoss && discards.length >= 4 && moments.every((m) => m.severity === 'praise')) {
    moments.push({
      severity: 'praise',
      title: 'Maximally efficient discards',
      detail: 'Every discard you made kept your hand as close to ready as possible. Textbook.',
    });
  }

  const order = { critical: 0, major: 1, minor: 2, praise: 3 };
  moments.sort((a, b) => order[a.severity] - order[b.severity]);

  // cap the small stuff so the real lessons stay prominent
  const minors = moments.filter((m) => m.severity === 'minor');
  if (minors.length > 3) {
    const rebuilt: KeyMoment[] = [
      ...moments.filter((m) => m.severity === 'critical' || m.severity === 'major'),
      ...minors.slice(0, 3),
      {
        severity: 'minor',
        title: `…and ${minors.length - 3} more small leak${minors.length - 3 > 1 ? 's' : ''}`,
        detail: 'Lots of small efficiency losses usually mean one habit: keep tiles that work together (neighbours and pairs), discard isolated tiles first.',
      },
      ...moments.filter((m) => m.severity === 'praise'),
    ];
    moments.length = 0;
    moments.push(...rebuilt);
  }

  // ---- takeaway ----
  let takeaway: string;
  const first = moments[0];
  if (!first) {
    takeaway = discards.length === 0
      ? 'Too quick to judge — nothing you did shaped this hand.'
      : 'A clean hand from your side. Sometimes the wall just favours someone else.';
  } else if (first.severity === 'critical' || first.severity === 'major') {
    takeaway = `Biggest lesson: ${first.title.toLowerCase()}. ${first.detail.split('. ')[0]}.`;
  } else {
    takeaway = 'No significant mistakes — keep counting waits and watching what opponents claim.';
  }

  return {
    handNumber: game.handNumber,
    outcome,
    outcomeDetail,
    trajectory,
    moments,
    takeaway,
    finalHand: r?.winner === 0 && r.winnerHand ? r.winnerHand.concealed.map((t) => t.kind) : finalKinds,
    finalMelds: me.melds.map((m) => ({ type: m.type, kinds: m.tiles.map((t) => t.kind) })),
  };
}
