import React, { useState } from 'react';
import { ONBOARDING } from '../content/tutorial';

const KEY = 'learn-mahjong-onboarded';

export function hasOnboarded(): boolean {
  try { return localStorage.getItem(KEY) === '1'; } catch { return false; }
}
export function markOnboarded() {
  try { localStorage.setItem(KEY, '1'); } catch { /* ignore */ }
}

/**
 * First-game walkthrough: a sequence of dismissable coach cards that point
 * at parts of the table. Skippable at any time.
 */
export function Onboarding({ onDone }: { onDone: () => void }) {
  const [step, setStep] = useState(0);
  const s = ONBOARDING[step];
  const last = step === ONBOARDING.length - 1;

  const finish = () => { markOnboarded(); onDone(); };

  return (
    <div className={`onboarding onboarding-${s.anchor}`}>
      <div className="onboarding-card">
        <div className="onboarding-text">{s.text}</div>
        <div className="onboarding-actions">
          <button className="btn btn-pass" onClick={finish}>Skip</button>
          <span className="onboarding-dots">
            {ONBOARDING.map((_, i) => (
              <span key={i} className={i === step ? 'dot dot-on' : 'dot'} />
            ))}
          </span>
          <button
            className="btn btn-primary"
            onClick={() => (last ? finish() : setStep(step + 1))}
          >
            {last ? "Let's play" : 'Next'}
          </button>
        </div>
      </div>
    </div>
  );
}
