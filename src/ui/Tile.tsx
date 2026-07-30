import React from 'react';
import { TileKind } from '../engine/types';
import { TileFace, TILE_W, TILE_H } from './TileFace';

/**
 * A mahjong tile. `size` is the rendered width in px; height keeps ratio.
 * Variants:
 *  - face up (default)
 *  - back (opponent hand tiles)
 *  - sideways (claimed tile in a meld — visual nod to real play)
 */

export interface TileProps {
  kind?: TileKind;
  size?: number;
  back?: boolean;
  selected?: boolean;
  highlight?: 'discard' | 'win' | 'new' | 'hint' | null;
  dimmed?: boolean;
  onClick?: () => void;
  className?: string;
}

export function Tile({ kind, size = 40, back, selected, highlight, dimmed, onClick, className }: TileProps) {
  const h = Math.round((size * TILE_H) / TILE_W);
  return (
    <svg
      viewBox={`0 0 ${TILE_W} ${TILE_H}`}
      width={size}
      height={h}
      className={[
        'tile',
        selected ? 'tile-selected' : '',
        highlight ? `tile-hl-${highlight}` : '',
        dimmed ? 'tile-dimmed' : '',
        onClick ? 'tile-tappable' : '',
        className ?? '',
      ].join(' ')}
      onClick={onClick}
      role={onClick ? 'button' : undefined}
    >
      {back ? (
        <g>
          <rect x={1} y={1} width={58} height={82} rx={8} fill="#2e7d5b" stroke="#1d5a40" strokeWidth={2} />
          <rect x={6} y={6} width={48} height={72} rx={5} fill="#3b9270" />
        </g>
      ) : (
        <g>
          <rect x={1} y={1} width={58} height={82} rx={8} fill="#fffdf5" stroke="#b9b0a0" strokeWidth={2} />
          <rect x={1} y={1} width={58} height={82} rx={8} fill="url(#tileShine)" opacity={0.5} />
          {kind && <TileFace kind={kind} />}
        </g>
      )}
    </svg>
  );
}

/** One-off defs element rendered once at app root so gradients resolve. */
export function TileDefs() {
  return (
    <svg width={0} height={0} style={{ position: 'absolute' }}>
      <defs>
        <linearGradient id="tileShine" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#ffffff" stopOpacity="0.9" />
          <stop offset="0.25" stopColor="#ffffff" stopOpacity="0" />
          <stop offset="1" stopColor="#d8cfbc" stopOpacity="0.35" />
        </linearGradient>
      </defs>
    </svg>
  );
}
