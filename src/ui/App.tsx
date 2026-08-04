import React, { useState } from 'react';
import { useGameStore } from '../store';
import { TileDefs } from './Tile';
import { Table } from './Table';
import { CoachPanel } from './CoachPanel';
import { TutorialModal } from './TutorialModal';
import { HandEndModal } from './HandEndModal';
import { MatchEndModal } from './MatchEndModal';
import { StartScreen } from './StartScreen';
import { Onboarding, hasOnboarded } from './Onboarding';
import { HandReviewModal } from './HandReviewModal';
import { WIND_LABEL } from '../content/names';

/**
 * Landscape phones lack the vertical room the table needs (a full landscape
 * layout is a known limitation) — nudge toward portrait, dismissably.
 */
function RotateHint() {
  const [dismissed, setDismissed] = useState(false);
  const cramped = window.innerHeight < 480 && window.innerWidth > window.innerHeight;
  if (!cramped || dismissed) return null;
  return (
    <div className="rotate-hint">
      <span className="rotate-hint-icon">📱</span>
      <p>The mahjong table needs vertical room — rotate your phone upright for the full view.</p>
      <button className="btn btn-secondary" onClick={() => setDismissed(true)}>Play sideways anyway</button>
    </div>
  );
}

/** two-tap confirmation (window.confirm is unreliable in webviews) */
function NewMatchButton({ onConfirm }: { onConfirm: () => void }) {
  const [arming, setArming] = useState(false);
  return arming ? (
    <button className="btn btn-secondary" onClick={onConfirm}>
      Abandon match — sure?
    </button>
  ) : (
    <button className="btn btn-secondary" onClick={() => setArming(true)}>
      New match
    </button>
  );
}

export default function App() {
  const store = useGameStore();
  const [tutorialOpen, setTutorialOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [onboarding, setOnboarding] = useState(false);
  const [reviewOpen, setReviewOpen] = useState(false);
  const g = store.game;

  if (!store.started) {
    return (
      <div className="app">
        <TileDefs />
        <StartScreen
          onStart={() => {
            store.startMatch();
            if (!hasOnboarded()) setOnboarding(true);
          }}
          onTutorial={() => setTutorialOpen(true)}
        />
        {tutorialOpen && <TutorialModal onClose={() => setTutorialOpen(false)} />}
      </div>
    );
  }

  return (
    <div className="app">
      <TileDefs />
      <header className="topbar">
        <div className="topbar-left">
          <span className="round-chip">{WIND_LABEL[g.roundWind].split(' ')[1]}</span>
          <span className="topbar-title">
            {WIND_LABEL[g.roundWind].split(' ')[0]} round · Hand {g.handNumber}
          </span>
        </div>
        <div className="topbar-right">
          <button className="icon-btn" onClick={() => setTutorialOpen(true)} aria-label="Rules & tutorial">ⓘ</button>
          <button className="icon-btn" onClick={() => setMenuOpen(!menuOpen)} aria-label="Menu">☰</button>
        </div>
      </header>

      {menuOpen && (
        <div className="menu-sheet" onClick={() => setMenuOpen(false)}>
          <div className="menu-card" onClick={(e) => e.stopPropagation()}>
            <h3>Settings</h3>
            <label className="menu-row">
              <span>Coach panel</span>
              <input
                type="checkbox"
                checked={store.settings.coachEnabled}
                onChange={(e) => store.setSettings({ coachEnabled: e.target.checked })}
              />
            </label>
            <label className="menu-row">
              <span>Game speed</span>
              <select
                value={store.settings.speed}
                onChange={(e) => store.setSettings({ speed: e.target.value as any })}
              >
                <option value="slow">Relaxed</option>
                <option value="normal">Normal</option>
                <option value="fast">Fast</option>
              </select>
            </label>
            {store.lastReview && (
              <button
                className="btn btn-secondary"
                onClick={() => { setReviewOpen(true); setMenuOpen(false); }}
              >
                🔍 Review last hand
              </button>
            )}
            <NewMatchButton
              onConfirm={() => { store.startMatch(); setMenuOpen(false); }}
            />
            <button className="btn" onClick={() => setMenuOpen(false)}>Close</button>
          </div>
        </div>
      )}

      <Table store={store} />

      {store.settings.coachEnabled && <CoachPanel store={store} />}

      {tutorialOpen && <TutorialModal onClose={() => setTutorialOpen(false)} />}
      {onboarding && <Onboarding onDone={() => setOnboarding(false)} />}
      {reviewOpen && store.lastReview && (
        <HandReviewModal review={store.lastReview} onClose={() => setReviewOpen(false)} />
      )}
      {g.phase === 'hand-end' && !onboarding && <HandEndModal store={store} />}
      {g.phase === 'match-end' && <MatchEndModal store={store} />}
      <RotateHint />
    </div>
  );
}
