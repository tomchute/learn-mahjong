import React from 'react';
import { GameStore } from '../store';
import { Tile } from './Tile';
import { tileName } from '../content/names';

/** Bottom overlay offering seung/pong/gong/win/pass on the last discard. */
export function ClaimBar({ store }: { store: GameStore }) {
  const g = store.game;
  const opts = g.humanClaimOptions;
  const last = g.lastDiscard;
  if (!opts || !last) return null;

  const robbing = g.isRobbingPrompt;

  return (
    <div className="claim-bar">
      <div className="claim-context">
        <Tile kind={last.tile.kind} size={34} highlight="discard" />
        <span className="claim-text">
          {robbing
            ? `${g.players[last.from].name} is adding ${tileName(last.tile.kind)} to a gong — you can ROB it to win!`
            : `${g.players[last.from].name} discarded ${tileName(last.tile.kind)}`}
        </span>
      </div>
      <div className="claim-actions">
        {opts.win && (
          <button className="btn btn-win" onClick={() => store.humanClaim('win')}>
            WIN 食糊
          </button>
        )}
        {opts.pong && (
          <button className="btn btn-claim" onClick={() => store.humanClaim('pong')}>
            Pong 碰
          </button>
        )}
        {opts.gong && (
          <button className="btn btn-claim" onClick={() => store.humanClaim('gong')}>
            Gong 槓
          </button>
        )}
        {opts.chows.map((c, i) => (
          <button key={i} className="btn btn-claim" onClick={() => store.humanClaim('chow', c)}>
            Seung 上 <span className="chow-preview">{c.kinds.map((k) => tileName(k)).join(' ')}</span>
          </button>
        ))}
        <button className="btn btn-pass" onClick={() => store.humanClaim('pass')}>
          Pass
        </button>
      </div>
    </div>
  );
}
