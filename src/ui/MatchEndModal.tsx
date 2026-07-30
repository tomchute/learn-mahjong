import React from 'react';
import { GameStore } from '../store';

/** Final standings after all four rounds. */
export function MatchEndModal({ store }: { store: GameStore }) {
  const g = store.game;
  const ranked = g.players
    .map((p, i) => ({ ...p, idx: i }))
    .sort((a, b) => b.chips - a.chips);
  const youWon = ranked[0].idx === 0;

  return (
    <div className="modal-backdrop">
      <div className="modal match-end-modal">
        <h2>{youWon ? '🏆 You won the match!' : 'Match complete'}</h2>
        <p>All four rounds played ({g.handNumber} hands). Final standings:</p>
        <table className="pay-table">
          <tbody>
            {ranked.map((p, rank) => (
              <tr key={p.idx} className={p.idx === 0 ? 'pay-winner' : ''}>
                <td>#{rank + 1}</td>
                <td>{p.idx === 0 ? 'You' : p.name}</td>
                <td className="pay-chips">{p.chips} chips</td>
              </tr>
            ))}
          </tbody>
        </table>
        <button className="btn btn-primary" onClick={() => store.startMatch()}>Play again</button>
      </div>
    </div>
  );
}
