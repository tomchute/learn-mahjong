import React, { useEffect, useRef, useState } from 'react';
import { GameStore } from '../store';

/**
 * The coach: a collapsible feed of commentary and move feedback.
 * Collapsed, it shows the latest message as a single bubble.
 */
export function CoachPanel({ store }: { store: GameStore }) {
  const [expanded, setExpanded] = useState(false);
  const feedRef = useRef<HTMLDivElement>(null);
  const msgs = store.coach;
  const latest = msgs[msgs.length - 1];

  // key on the latest message ID, not length — the feed is capped at 60
  // messages, so length stops changing but IDs keep growing
  const latestId = msgs.length ? msgs[msgs.length - 1].id : 0;
  useEffect(() => {
    if (expanded && feedRef.current) {
      feedRef.current.scrollTop = feedRef.current.scrollHeight;
    }
  }, [expanded, latestId]);

  if (!latest) return null;

  return (
    <div className={`coach ${expanded ? 'coach-expanded' : ''}`}>
      <button className="coach-toggle" onClick={() => setExpanded(!expanded)}>
        <span className="coach-avatar">🀄</span>
        <span className="coach-label">Coach</span>
        <span className="coach-caret">{expanded ? '▾' : '▴'}</span>
      </button>
      {expanded ? (
        <div className="coach-feed" ref={feedRef}>
          {msgs.map((m) => (
            <div key={m.id} className={`coach-msg tone-${m.tone}`}>
              <div className="coach-msg-text">{m.text}</div>
              {m.details?.map((d, i) => (
                <div key={i} className="coach-msg-detail">{d}</div>
              ))}
            </div>
          ))}
        </div>
      ) : (
        <div className={`coach-bubble tone-${latest.tone}`} onClick={() => setExpanded(true)}>
          <div className="coach-msg-text">{latest.text}</div>
          {latest.details && latest.details.length > 0 && (
            <div className="coach-msg-detail">{latest.details[0]}</div>
          )}
        </div>
      )}
    </div>
  );
}
