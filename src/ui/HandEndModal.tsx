import React from 'react';
import { GameStore } from '../store';
import { Tile } from './Tile';
import { MeldView } from './Table';
import { WIND_LABEL } from '../content/names';

/** End-of-hand screen: winning hand, fan breakdown, payments. */
export function HandEndModal({ store }: { store: GameStore }) {
  const g = store.game;
  const r = g.handResult;
  if (!r) return null;

  return (
    <div className="modal-backdrop">
      <div className="modal hand-end-modal">
        {r.winner === null ? (
          <>
            <h2>Draw 流局</h2>
            <p>The wall ran out with no winner. Nobody scores — the same dealer deals again.</p>
          </>
        ) : (
          <>
            <h2>
              {r.winner === 0 ? '🎉 You won!' : `${g.players[r.winner].name} wins`}
              <span className="fan-total"> {r.score!.fan} fan {r.score!.limit ? '(LIMIT!)' : ''}</span>
            </h2>
            <p className="win-how">
              {r.from === null
                ? 'Won by self-draw — all three opponents pay.'
                : r.from === 0
                  ? 'Won off YOUR discard — you pay the full amount.'
                  : `Won off ${g.players[r.from].name}'s discard — only ${g.players[r.from].name} pays.`}
            </p>

            {r.winnerHand && (
              <div className="win-hand">
                <div className="win-tiles">
                  {r.winnerHand.concealed.map((t) => (
                    <Tile key={t.id} kind={t.kind} size={26} highlight={r.winningTile?.id === t.id ? 'win' : null} />
                  ))}
                </div>
                <div className="win-melds">
                  {r.winnerHand.melds.map((m, i) => <MeldView key={i} meld={m} size={22} />)}
                  {r.winnerHand.flowers.map((f) => <Tile key={f.id} kind={f.kind} size={18} className="tile-flower" />)}
                </div>
              </div>
            )}

            <table className="fan-table">
              <tbody>
                {r.score!.items.map((item, i) => (
                  <tr key={i}>
                    <td>
                      {item.name}
                      {item.cantonese && <span className="canto"> {item.cantonese}</span>}
                      {item.detail && <div className="fan-detail">{item.detail}</div>}
                    </td>
                    <td className="fan-cell">+{item.fan}</td>
                  </tr>
                ))}
                <tr className="fan-total-row">
                  <td>Total {r.score!.rawFan > r.score!.fan ? `(capped at limit)` : ''}</td>
                  <td className="fan-cell">
                    {r.score!.fan} fan = {r.score!.payout} {r.score!.payout === 1 ? 'chip' : 'chips'}
                    {r.from === null ? ' from each player' : ''}
                  </td>
                </tr>
              </tbody>
            </table>
          </>
        )}

        <table className="pay-table">
          <tbody>
            {g.players.map((p, i) => (
              <tr key={i} className={r.winner === i ? 'pay-winner' : ''}>
                <td>{i === 0 ? 'You' : p.name} <span className="opp-wind">{WIND_LABEL[r.seatWinds[i]].split(' ')[1]}</span></td>
                <td className={r.payments[i] > 0 ? 'pay-pos' : r.payments[i] < 0 ? 'pay-neg' : ''}>
                  {r.payments[i] > 0 ? '+' : ''}{r.payments[i]}
                </td>
                <td className="pay-chips">{p.chips} chips</td>
              </tr>
            ))}
          </tbody>
        </table>

        <button className="btn btn-primary" onClick={() => store.proceed()}>
          {g.matchWillEnd ? 'See final results' : 'Next hand'}
        </button>
      </div>
    </div>
  );
}
