import React from 'react';
import { HandReview } from '../engine/review';
import { Tile } from './Tile';

/**
 * Post-hand review: what decided the hand, how close you got, and the
 * ranked moments where a different choice would have mattered.
 */
export function HandReviewModal({ review, onClose }: { review: HandReview; onClose: () => void }) {
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal review-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h2>Hand {review.handNumber} review</h2>
          <button className="icon-btn" onClick={onClose} aria-label="Close">✕</button>
        </div>

        <p className="review-outcome"><strong>{review.outcome}</strong> {review.outcomeDetail}</p>
        <p className="review-trajectory">{review.trajectory}</p>

        <div className="review-final">
          <span className="review-final-label">Your final tiles:</span>
          <span className="review-final-tiles">
            {review.finalHand.map((k, i) => <Tile key={i} kind={k} size={20} />)}
          </span>
          {review.finalMelds.map((m, i) => (
            <span key={i} className="score-example-group">
              {m.kinds.map((k, j) => <Tile key={j} kind={k} size={18} />)}
            </span>
          ))}
        </div>

        {review.moments.length > 0 && <h3>Key moments</h3>}
        {review.moments.map((m, i) => (
          <div key={i} className={`review-moment review-${m.severity}`}>
            <div className="review-moment-head">
              <span className={`sev-chip sev-${m.severity}`}>
                {m.severity === 'critical' ? 'Critical' : m.severity === 'major' ? 'Costly' : m.severity === 'minor' ? 'Small leak' : 'Well played'}
              </span>
              <strong>{m.title}</strong>
            </div>
            {m.tiles && m.tiles.length > 0 && (
              <div className="review-moment-tiles">
                {m.tiles.map((k, j) => <Tile key={j} kind={k} size={22} />)}
              </div>
            )}
            <p>{m.detail}</p>
          </div>
        ))}

        <div className="review-takeaway">
          <strong>Takeaway:</strong> {review.takeaway}
        </div>

        <button className="btn btn-primary" onClick={onClose}>Close</button>
      </div>
    </div>
  );
}
