import React, { useState, useEffect } from 'react';
import { GameStore } from '../store';
import { Tile } from './Tile';
import { Tile as TileT, Meld } from '../engine/types';
import { WIND_LABEL, tileName } from '../content/names';
import { ClaimBar } from './ClaimBar';

/**
 * The mahjong table, player's perspective:
 *   - top: opponent across (player 2)
 *   - left: player 3 (discards to your left feed your seung)
 *   - right: player 1 (acts after you)
 *   - centre: discard zones + compass
 *   - bottom: your melds/flowers, then your rack
 */
export function Table({ store }: { store: GameStore }) {
  const g = store.game;
  const [selected, setSelected] = useState<number | null>(null);

  // clear any raised selection whenever the game state moves on (a stale
  // selection would turn a later single tap into an instant discard)
  useEffect(() => {
    setSelected(null);
  }, [g.version]);

  const myTurn = g.phase === 'awaiting-discard' && g.turn === 0;
  const me = g.players[0];
  const canWin = g.canSelfWin(0);
  const concealedGongs = g.concealedGongOptions(0);
  const addedGongs = g.addedGongOptions(0);
  const myShanten = me.concealed.length % 3 === 1 ? g.shantenOf(0) : null;
  const myWaits = myShanten === 0 ? g.waitsOf(0) : [];

  const tapTile = (t: TileT) => {
    if (!myTurn) return;
    if (selected === t.id) {
      setSelected(null);
      store.humanDiscard(t);
    } else {
      setSelected(t.id);
    }
  };

  return (
    <main className="table">
      {/* Opponent across (2) */}
      <OpponentZone g={store} player={2} orientation="top" />

      <div className="table-mid">
        <OpponentZone g={store} player={3} orientation="left" />

        <div className="center-area">
          <DiscardZone store={store} player={2} zone="top" />
          <div className="center-row">
            <DiscardZone store={store} player={3} zone="left" />
            <Compass store={store} />
            <DiscardZone store={store} player={1} zone="right" />
          </div>
          <DiscardZone store={store} player={0} zone="bottom" />
        </div>

        <OpponentZone g={store} player={1} orientation="right" />
      </div>

      {/* Your melds & flowers */}
      <div className="my-melds">
        {me.melds.map((m, i) => <MeldView key={i} meld={m} size={26} />)}
        {me.flowers.length > 0 && (
          <div className="flower-row">
            {me.flowers.map((f) => <Tile key={f.id} kind={f.kind} size={20} />)}
          </div>
        )}
      </div>

      {/* Status strip + actions share one stable-height row to avoid reflow */}
      <div className="controls-row">
        <div className="status-strip">
          {myShanten === 0 && myWaits.length > 0 && (
            <span className="ready-badge">READY 聽 — win on: {myWaits.map(tileName).join(' · ')}</span>
          )}
          {myTurn && myShanten !== 0 && <span className="turn-badge">Your turn — tap a tile twice to discard</span>}
          {!myTurn && g.phase === 'awaiting-discard' && (
            <span className="waiting-badge">{g.players[g.turn].name} is thinking…</span>
          )}
        </div>
        {myTurn && (
          <div className="action-bar">
            {canWin && (
              <button className="btn btn-win" onClick={() => store.humanSelfWin()}>WIN 食糊 (self-draw)</button>
            )}
            {concealedGongs.map((k) => (
              <button key={k} className="btn btn-claim" onClick={() => store.humanGong(k, false)}>
                Gong {tileName(k)} (concealed)
              </button>
            ))}
            {addedGongs.map((k) => (
              <button key={`a${k}`} className="btn btn-claim" onClick={() => store.humanGong(k, true)}>
                Gong {tileName(k)} (add to pong)
              </button>
            ))}
            {store.settings.coachEnabled && (
              <button className="btn btn-hint" onClick={() => store.askHint()}>Hint</button>
            )}
          </div>
        )}
      </div>

      {/* Claim bar overlays the table when a discard can be claimed */}
      {g.phase === 'awaiting-claims' && g.humanClaimOptions && <ClaimBar store={store} />}

      {/* Your rack */}
      <div className={`rack ${myTurn ? 'rack-active' : ''}`}>
        {me.concealed.map((t) => {
          const isDrawn = g.drawnTile?.id === t.id && myTurn;
          return (
            <div
              key={t.id}
              className={`rack-slot ${isDrawn ? 'rack-drawn' : ''} ${myTurn ? 'rack-slot-tappable' : ''}`}
              onClick={() => tapTile(t)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); tapTile(t); }
              }}
              tabIndex={myTurn ? 0 : -1}
              role="button"
              aria-label={`Tile ${t.kind}${selected === t.id ? ', selected — activate again to discard' : ''}`}
            >
              <Tile
                kind={t.kind}
                size={rackTileSize(me.concealed.length)}
                selected={selected === t.id}
                highlight={isDrawn ? 'new' : store.hint?.tileId === t.id ? 'hint' : null}
              />
            </div>
          );
        })}
      </div>
    </main>
  );
}

function rackTileSize(n: number): number {
  // fit up to 14 tiles + inter-tile gaps + the drawn-tile margin on any phone
  const count = Math.max(13, n);
  const vw = Math.min(window.innerWidth, 560);
  const available = vw - 8 /* rack padding */ - (count - 1) * 2 /* gaps */ - 10 /* drawn margin */;
  return Math.floor(Math.min(44, available / count));
}

// ------------------------------------------------------------------
function OpponentZone({ g: store, player, orientation }: { g: GameStore; player: number; orientation: 'top' | 'left' | 'right' }) {
  const g = store.game;
  const p = g.players[player];
  const active = g.phase === 'awaiting-discard' && g.turn === player;
  const n = p.concealed.length;
  return (
    <div className={`opp opp-${orientation} ${active ? 'opp-active' : ''}`}>
      <div className="opp-info">
        <span className="opp-name">{p.name}</span>
        <span className="opp-wind">{WIND_LABEL[g.seatWind(player)].split(' ')[1]}</span>
        <span className="opp-chips">{p.chips}</span>
        {g.dealer === player && <span className="dealer-chip">deal</span>}
      </div>
      <div className={`opp-tiles opp-tiles-${orientation}`}>
        {Array.from({ length: n }, (_, i) => (
          <Tile key={i} back size={orientation === 'top' ? 16 : 14} />
        ))}
      </div>
      {(p.melds.length > 0 || p.flowers.length > 0) && (
        <div className="opp-melds">
          {p.melds.map((m, i) => <MeldView key={i} meld={m} size={16} />)}
          {p.flowers.map((f) => <Tile key={f.id} kind={f.kind} size={14} className="tile-flower" />)}
        </div>
      )}
    </div>
  );
}

// ------------------------------------------------------------------
export function MeldView({ meld, size }: { meld: Meld; size: number }) {
  return (
    <span className="meld">
      {meld.tiles.map((t, i) => (
        <Tile
          key={t.id}
          kind={meld.concealed && (i === 0 || i === 3) ? undefined : t.kind}
          back={meld.concealed && (i === 0 || i === 3)}
          size={size}
        />
      ))}
    </span>
  );
}

// ------------------------------------------------------------------
function DiscardZone({ store, player, zone }: { store: GameStore; player: number; zone: 'top' | 'left' | 'right' | 'bottom' }) {
  const g = store.game;
  const p = g.players[player];
  const last = g.lastDiscard;
  return (
    <div className={`discards discards-${zone}`}>
      {p.discards.map((t) => (
        <Tile
          key={t.id}
          kind={t.kind}
          size={zone === 'left' || zone === 'right' ? 17 : 19}
          highlight={last && last.tile.id === t.id ? 'discard' : null}
        />
      ))}
    </div>
  );
}

// ------------------------------------------------------------------
function Compass({ store }: { store: GameStore }) {
  const g = store.game;
  const turnArrow = ['▼', '▶', '▲', '◀'][g.turn]; // pointing at whose turn
  return (
    <div className="compass">
      <div className="compass-wind">{WIND_LABEL[g.roundWind].split(' ')[1]}</div>
      <div className="compass-round">{WIND_LABEL[g.roundWind].split(' ')[0]}</div>
      <div className="compass-wall">{g.wall?.remaining ?? 0} left</div>
      <div className={`compass-turn compass-turn-${g.turn}`}>{turnArrow}</div>
    </div>
  );
}
