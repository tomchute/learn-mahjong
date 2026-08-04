import React from 'react';
import { GameStore } from '../store';
import { Tile } from './Tile';
import { MeldView } from './Table';
import { tileName, WIND_LABEL } from '../content/names';
import { describeShanten } from '../engine/feedback';

/**
 * Tap-to-read tactics panel for one opponent. Two clearly separated layers:
 * what any player could infer from the table, and the coach's omniscient
 * peek — so learners practice the inference, then check their read.
 */
export function OpponentReadModal({ store, player, onClose }: {
  store: GameStore; player: number; onClose: () => void;
}) {
  const g = store.game;
  const p = g.players[player];
  const prof = store.getOpponentRead(player);

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal read-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h2>Reading {p.name} <span className="opp-wind">{WIND_LABEL[g.seatWind(player)].split(' ')[1]} seat</span></h2>
          <button className="icon-btn" onClick={onClose} aria-label="Close">✕</button>
        </div>

        <h3>What you can see</h3>
        <div className="read-visible">
          {p.melds.length === 0 && p.flowers.length === 0 && (
            <p>No exposed sets — their hand is fully concealed. Concealed hands are harder to read (and worth an extra fan): watch what they discard and what they never discard.</p>
          )}
          {p.melds.length > 0 && (
            <div className="read-melds">
              {p.melds.map((m, i) => <MeldView key={i} meld={m} size={24} />)}
              {p.flowers.map((f) => <Tile key={f.id} kind={f.kind} size={20} className="tile-flower" />)}
            </div>
          )}
          <p>{prof.shapeEvidence}</p>
          <p>
            {prof.visibleFan > 0
              ? `Fan already visible on the table: ${prof.visibleFan}. Feeding them multiplies a hand that's already valuable.`
              : 'No fan is visible on their table yet.'}
            {' '}They have discarded {prof.discardCount} {prof.discardCount === 1 ? 'tile' : 'tiles'} — a player's own discards are the tiles they decided they don't need.
          </p>
        </div>

        <h3>Coach's peek 👁</h3>
        <div className="read-peek">
          {!store.settings.peekEnabled ? (
            <p>
              Coach's Peek is off — form your own read from the evidence above.
              (Turn it back on any time in the ☰ menu.)
            </p>
          ) : prof.shanten >= 99 ? (
            <p>Mid-action — check back after their discard.</p>
          ) : prof.ready ? (
            <p>
              They ARE ready — waiting on {prof.waits.map(tileName).join(' / ')}, worth {prof.potentialFan} fan
              ({2 ** Math.min(prof.potentialFan, 13)} chips from the discarder, more on self-draw).
              Those tiles are the ones to hold back.
            </p>
          ) : (
            <p>They are {describeShanten(prof.shanten)}. {prof.shanten <= 1 ? 'Close — treat their wanted suits with care.' : 'Not an immediate threat.'}</p>
          )}
          <p className="read-lesson">
            Lesson: you can't see their hand at a real table — but the melds, the
            discards, and what they claim are all public. Practice forming the read
            first, then peek to check yourself.
          </p>
        </div>
      </div>
    </div>
  );
}
