import React, { useState } from 'react';
import { GameStore } from '../store';
import { Tile } from './Tile';
import { MeldView } from './Table';
import { WIND_LABEL } from '../content/names';
import { explainWinStructure } from '../engine/explain';
import { WinDecomp } from '../engine/hand';
import { Tile as TileT, Meld } from '../engine/types';
import { HandReviewModal } from './HandReviewModal';

/** End-of-hand screen: winning hand, fan breakdown, payments. */
export function HandEndModal({ store }: { store: GameStore }) {
  const g = store.game;
  const r = g.handResult;
  const [showReview, setShowReview] = useState(false);
  const review = store.getHandReview();
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
                : r.robbed
                  ? r.from === 0
                    ? 'Won by ROBBING your added gong — the tile you added completed their hand, and you pay the full amount.'
                    : `Won by robbing ${g.players[r.from].name}'s added gong — ${g.players[r.from].name} pays.`
                  : r.from === 0
                    ? 'Won off YOUR discard — you pay the full amount.'
                    : `Won off ${g.players[r.from].name}'s discard — only ${g.players[r.from].name} pays.`}
            </p>

            {r.winnerHand && (
              r.score!.decomp
                ? <WinStructure
                    hand={r.winnerHand}
                    decomp={r.score!.decomp}
                    winningTile={r.winningTile}
                  />
                : (
                  <div className="win-hand">
                    <div className="win-tiles">
                      {r.winnerHand.concealed.map((t) => (
                        <Tile key={t.id} kind={t.kind} size={30} highlight={r.winningTile?.id === t.id ? 'win' : null} />
                      ))}
                    </div>
                    <div className="win-melds">
                      {r.winnerHand.melds.map((m, i) => <MeldView key={i} meld={m} size={26} />)}
                      {r.winnerHand.flowers.map((f) => <Tile key={f.id} kind={f.kind} size={20} className="tile-flower" />)}
                    </div>
                  </div>
                )
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

        <button className="btn btn-review" onClick={() => setShowReview(true)}>
          🔍 Review hand — what could you have done?
        </button>
        <button className="btn btn-primary" onClick={() => store.proceed()}>
          {g.matchWillEnd ? 'See final results' : 'Next hand'}
        </button>
        {showReview && review && (
          <HandReviewModal review={review} onClose={() => setShowReview(false)} />
        )}
      </div>
    </div>
  );
}

/**
 * The winning hand grouped into its sets + pair, each labeled, so a beginner
 * can see WHY the hand is complete — plus a sentence or two of explanation.
 */
function WinStructure({ hand, decomp, winningTile }: {
  hand: { concealed: TileT[]; melds: Meld[]; flowers: TileT[] };
  decomp: WinDecomp;
  winningTile: TileT | null;
}) {
  const { groups, summary } = explainWinStructure(hand, decomp, winningTile);
  return (
    <div className="win-hand">
      <div className="win-groups">
        {groups.map((grp, i) => (
          <div key={i} className="win-group">
            <div className="win-group-tiles">
              {grp.meld
                ? <MeldView meld={grp.meld} size={28} />
                : grp.tiles!.map((t) => (
                    <Tile key={t.id} kind={t.kind} size={28} highlight={winningTile?.id === t.id ? 'win' : null} />
                  ))}
            </div>
            <div className="win-group-label">{grp.label}</div>
          </div>
        ))}
        {hand.flowers.length > 0 && (
          <div className="win-group">
            <div className="win-group-tiles win-group-flowers">
              {hand.flowers.map((f) => <Tile key={f.id} kind={f.kind} size={20} />)}
            </div>
            <div className="win-group-label">flowers · bonus</div>
          </div>
        )}
      </div>
      {summary.map((s, i) => <div key={i} className="win-structure-note">{s}</div>)}
    </div>
  );
}
