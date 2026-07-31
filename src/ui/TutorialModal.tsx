import React, { useState } from 'react';
import { GUIDE, STRATEGY } from '../content/tutorial';
import { SCORING_TABLE, PAYOUT_NOTE } from '../content/scoringTable';
import { Tile } from './Tile';
import { ALL_KINDS, flowerKind } from '../engine/types';
import { tileLongName } from '../content/names';

type Tab = 'guide' | 'strategy' | 'tiles' | 'scoring';

/** The rules & reference panel — available any time via ⓘ, fully dismissable. */
export function TutorialModal({ onClose }: { onClose: () => void }) {
  const [tab, setTab] = useState<Tab>('guide');
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal tutorial-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <div className="tabs">
            <button className={tab === 'guide' ? 'tab tab-on' : 'tab'} onClick={() => setTab('guide')}>How to play</button>
            <button className={tab === 'strategy' ? 'tab tab-on' : 'tab'} onClick={() => setTab('strategy')}>Strategy</button>
            <button className={tab === 'tiles' ? 'tab tab-on' : 'tab'} onClick={() => setTab('tiles')}>Tiles</button>
            <button className={tab === 'scoring' ? 'tab tab-on' : 'tab'} onClick={() => setTab('scoring')}>Scoring</button>
          </div>
          <button className="icon-btn" onClick={onClose} aria-label="Close">✕</button>
        </div>
        <div className="modal-body">
          {tab === 'guide' && (
            <div className="guide">
              {GUIDE.map((s) => (
                <section key={s.title}>
                  <h3>{s.title}</h3>
                  {s.paragraphs.map((p, i) => <p key={i}>{p}</p>)}
                </section>
              ))}
            </div>
          )}
          {tab === 'strategy' && (
            <div className="guide">
              {STRATEGY.map((s) => (
                <section key={s.title}>
                  <h3>{s.title}</h3>
                  {s.paragraphs.map((p, i) => <p key={i}>{p}</p>)}
                </section>
              ))}
            </div>
          )}
          {tab === 'tiles' && <TilesGlossary />}
          {tab === 'scoring' && (
            <div className="scoring">
              <p className="payout-note">{PAYOUT_NOTE}</p>
              <table className="score-table">
                <thead>
                  <tr><th>Fan</th><th>Hand</th><th>What it is</th></tr>
                </thead>
                <tbody>
                  {SCORING_TABLE.map((r, i) => (
                    <React.Fragment key={i}>
                      <tr className={r.example ? 'score-row-with-example' : ''}>
                        <td className="fan-cell">{r.fan}</td>
                        <td>
                          <strong>{r.name}</strong>
                          {r.cantonese && <div className="canto">{r.cantonese}</div>}
                        </td>
                        <td>{r.note}</td>
                      </tr>
                      {r.example && (
                        <tr className="score-example-row">
                          <td colSpan={3}>
                            <div className="score-example">
                              {r.example.map((group, gi) => (
                                <span key={gi} className="score-example-group">
                                  {group.map((k, ti) => <Tile key={ti} kind={k} size={19} />)}
                                </span>
                              ))}
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function TilesGlossary() {
  const suits = ALL_KINDS.filter((k) => !k.startsWith('wind') && !k.startsWith('dragon'));
  const honors = ALL_KINDS.filter((k) => k.startsWith('wind') || k.startsWith('dragon'));
  const flowers = Array.from({ length: 8 }, (_, i) => flowerKind(i + 1));
  return (
    <div className="glossary">
      <h3>Suits (4 of each)</h3>
      <div className="glossary-grid">
        {suits.map((k) => (
          <div key={k} className="glossary-item">
            <Tile kind={k} size={34} />
            <span>{tileLongName(k)}</span>
          </div>
        ))}
      </div>
      <h3>Honours (4 of each)</h3>
      <div className="glossary-grid">
        {honors.map((k) => (
          <div key={k} className="glossary-item">
            <Tile kind={k} size={34} />
            <span>{tileLongName(k)}</span>
          </div>
        ))}
      </div>
      <h3>Flowers (1 of each — bonus tiles)</h3>
      <div className="glossary-grid">
        {flowers.map((k) => (
          <div key={k} className="glossary-item">
            <Tile kind={k} size={34} />
            <span>{tileLongName(k)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
