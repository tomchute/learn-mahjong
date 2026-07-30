import React from 'react';
import { TileKind } from '../engine/types';
import { numChar } from '../content/names';

/**
 * SVG tile faces drawn programmatically: dots as circle patterns, bamboo as
 * stick patterns (1-bamboo is traditionally a bird — we draw a simple one),
 * characters/winds/dragons with CJK glyphs.
 *
 * All faces are drawn in a 60x84 viewBox.
 */

export const TILE_W = 60;
export const TILE_H = 84;

const RED = '#c0392b';
const GREEN = '#1e7d43';
const BLUE = '#20558a';

export function TileFace({ kind }: { kind: TileKind }) {
  const [group, v] = kind.split('-');
  switch (group) {
    case 'dots': return <Dots n={Number(v)} />;
    case 'bamboo': return <Bamboo n={Number(v)} />;
    case 'chars': return <Chars n={Number(v)} />;
    case 'wind': return <BigGlyph text={{ E: '東', S: '南', W: '西', N: '北' }[v]!} color="#2c3e50" />;
    case 'dragon':
      return v === 'R' ? <BigGlyph text="中" color={RED} />
        : v === 'G' ? <BigGlyph text="發" color={GREEN} />
        : <WhiteDragon />;
    case 'flower': return <Flower n={Number(v)} />;
  }
  return null;
}

function Dots({ n }: { n: number }) {
  const layouts: Record<number, [number, number][]> = {
    1: [[30, 42]],
    2: [[30, 24], [30, 60]],
    3: [[16, 20], [30, 42], [44, 64]],
    4: [[18, 24], [42, 24], [18, 60], [42, 60]],
    5: [[16, 20], [44, 20], [30, 42], [16, 64], [44, 64]],
    6: [[18, 20], [42, 20], [18, 42], [42, 42], [18, 64], [42, 64]],
    7: [[14, 16], [28, 22], [42, 28], [18, 46], [42, 46], [18, 66], [42, 66]],
    8: [[18, 14], [42, 14], [18, 33], [42, 33], [18, 52], [42, 52], [18, 71], [42, 71]],
    9: [[15, 20], [30, 20], [45, 20], [15, 42], [30, 42], [45, 42], [15, 64], [30, 64], [45, 64]],
  };
  const pts = layouts[n] ?? [];
  const r = n === 1 ? 14 : n <= 4 ? 8 : 6.2;
  const colors = [BLUE, GREEN, RED];
  return (
    <g>
      {pts.map(([x, y], i) => (
        <g key={i}>
          <circle cx={x} cy={y} r={r} fill="none" stroke={colors[i % 3]} strokeWidth={n === 1 ? 3 : 2} />
          <circle cx={x} cy={y} r={r * 0.45} fill={colors[(i + 1) % 3]} />
          {n === 1 && <circle cx={x} cy={y} r={r + 5} fill="none" stroke={RED} strokeWidth={2} strokeDasharray="4 3" />}
        </g>
      ))}
    </g>
  );
}

function BambooStick({ x, y, color }: { x: number; y: number; color: string }) {
  return (
    <g transform={`translate(${x},${y})`}>
      <rect x={-3} y={-9} width={6} height={18} rx={2.5} fill={color} />
      <line x1={-3.6} y1={-3} x2={3.6} y2={-3} stroke="#fffdf5" strokeWidth={1.6} />
      <line x1={-3.6} y1={3} x2={3.6} y2={3} stroke="#fffdf5" strokeWidth={1.6} />
    </g>
  );
}

function Bamboo({ n }: { n: number }) {
  if (n === 1) {
    // stylised bird on a branch
    return (
      <g>
        <ellipse cx={30} cy={40} rx={11} ry={14} fill={GREEN} />
        <circle cx={30} cy={22} r={7.5} fill={GREEN} />
        <circle cx={33} cy={20} r={1.7} fill="#fffdf5" />
        <path d="M37 22 l8 -2 -7 5 z" fill={RED} />
        <path d="M30 52 q-2 10 -8 14 M30 52 q2 10 8 14" stroke={RED} strokeWidth={2.5} fill="none" />
        <path d="M19 38 q-8 4 -10 12" stroke={GREEN} strokeWidth={2.5} fill="none" />
        <path d="M41 38 q8 4 10 12" stroke={GREEN} strokeWidth={2.5} fill="none" />
      </g>
    );
  }
  const layouts: Record<number, [number, number, string][]> = {
    2: [[30, 24, GREEN], [30, 58, BLUE]],
    3: [[30, 20, GREEN], [20, 58, BLUE], [40, 58, GREEN]],
    4: [[20, 24, BLUE], [40, 24, GREEN], [20, 58, GREEN], [40, 58, BLUE]],
    5: [[18, 22, GREEN], [42, 22, BLUE], [30, 42, RED], [18, 62, BLUE], [42, 62, GREEN]],
    6: [[16, 26, GREEN], [30, 26, BLUE], [44, 26, GREEN], [16, 58, BLUE], [30, 58, GREEN], [44, 58, BLUE]],
    7: [[30, 16, RED], [18, 40, GREEN], [30, 40, BLUE], [42, 40, GREEN], [18, 66, BLUE], [30, 66, GREEN], [42, 66, BLUE]],
    8: [[18, 18, GREEN], [42, 18, GREEN], [24, 38, BLUE], [36, 38, BLUE], [24, 54, BLUE], [36, 54, BLUE], [18, 72, GREEN], [42, 72, GREEN]],
    9: [[16, 20, RED], [30, 20, BLUE], [44, 20, GREEN], [16, 42, GREEN], [30, 42, RED], [44, 42, BLUE], [16, 64, BLUE], [30, 64, GREEN], [44, 64, RED]],
  };
  return <g>{(layouts[n] ?? []).map(([x, y, c], i) => <BambooStick key={i} x={x} y={y} color={c} />)}</g>;
}

function Chars({ n }: { n: number }) {
  return (
    <g>
      <text x={30} y={36} textAnchor="middle" fontSize={30} fontFamily="'Noto Serif TC', 'PingFang TC', 'Microsoft JhengHei', serif" fill={BLUE} fontWeight={700}>
        {numChar(n)}
      </text>
      <text x={30} y={72} textAnchor="middle" fontSize={30} fontFamily="'Noto Serif TC', 'PingFang TC', 'Microsoft JhengHei', serif" fill={RED} fontWeight={700}>
        萬
      </text>
    </g>
  );
}

function BigGlyph({ text, color }: { text: string; color: string }) {
  return (
    <text x={30} y={56} textAnchor="middle" fontSize={40} fontFamily="'Noto Serif TC', 'PingFang TC', 'Microsoft JhengHei', serif" fill={color} fontWeight={700}>
      {text}
    </text>
  );
}

function WhiteDragon() {
  return (
    <rect x={12} y={14} width={36} height={56} rx={5} fill="none" stroke={BLUE} strokeWidth={3.5} />
  );
}

function Flower({ n }: { n: number }) {
  const isSeason = n > 4;
  const num = isSeason ? n - 4 : n;
  const glyphs = isSeason ? ['春', '夏', '秋', '冬'] : ['梅', '蘭', '菊', '竹'];
  return (
    <g>
      <text x={14} y={22} textAnchor="middle" fontSize={16} fill={isSeason ? RED : BLUE} fontWeight={700} fontFamily="sans-serif">
        {num}
      </text>
      <text x={32} y={62} textAnchor="middle" fontSize={34} fontFamily="'Noto Serif TC', 'PingFang TC', 'Microsoft JhengHei', serif" fill={isSeason ? RED : GREEN} fontWeight={700}>
        {glyphs[num - 1]}
      </text>
    </g>
  );
}
