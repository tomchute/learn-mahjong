import { TileKind, isFlower } from '../engine/types';

/**
 * Display names & Cantonese romanisations from the Tea Base booklet:
 * numbers yut/yee/saam/sei/mm/luk/ts'at/ba'at/gau, suits tung/sok/maan,
 * winds dung/naam/sai/buk, dragons hung zung/faat choi/baak baan.
 */

const NUM_CANTO = ['', 'yut', 'yee', 'saam', 'sei', 'mm', 'luk', "ts'at", "ba'at", 'gau'];
const NUM_CHAR = ['', '一', '二', '三', '四', '五', '六', '七', '八', '九'];

export function tileName(kind: TileKind): string {
  const [group, v] = kind.split('-');
  switch (group) {
    case 'dots': return `${v}○`;
    case 'bamboo': return `${v}🎋`;
    case 'chars': return `${v}萬`;
    case 'wind':
      return v === 'E' ? 'East 東' : v === 'S' ? 'South 南' : v === 'W' ? 'West 西' : 'North 北';
    case 'dragon':
      return v === 'R' ? 'Red 中' : v === 'G' ? 'Green 發' : 'White ▢';
    case 'flower': {
      const n = Number(v);
      return n <= 4 ? `Flower ${n}` : `Season ${n - 4}`;
    }
  }
  return kind;
}

export function tileLongName(kind: TileKind): string {
  const [group, v] = kind.split('-');
  const n = Number(v);
  switch (group) {
    case 'dots': return `${n} of Circles (${NUM_CANTO[n]} tung)`;
    case 'bamboo': return `${n} of Bamboo (${NUM_CANTO[n]} sok)`;
    case 'chars': return `${n} of Characters (${NUM_CANTO[n]} maan)`;
    case 'wind':
      return v === 'E' ? 'East wind (dung 東)' : v === 'S' ? 'South wind (naam 南)'
        : v === 'W' ? 'West wind (sai 西)' : 'North wind (buk 北)';
    case 'dragon':
      return v === 'R' ? 'Red dragon (hung zung 中)' : v === 'G' ? 'Green dragon (faat choi 發)'
        : 'White dragon (baak baan)';
    case 'flower':
      return n <= 4 ? `Flower tile ${n}` : `Season tile ${n - 4}`;
  }
  return kind;
}

export function numChar(n: number): string {
  return NUM_CHAR[n] ?? String(n);
}

export const WIND_LABEL: Record<string, string> = {
  E: 'East 東', S: 'South 南', W: 'West 西', N: 'North 北',
};
