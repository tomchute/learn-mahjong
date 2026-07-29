import {
  Tile, TileKind, SUITS, WINDS, DRAGONS,
  suitedKind, windKind, dragonKind, flowerKind,
} from './types';
import { Rng, shuffle } from './rng';

/** Build the full 144-tile HK set: 4x each of 34 kinds + 8 unique flowers. */
export function buildDeck(): Tile[] {
  const kinds: TileKind[] = [];
  for (const s of SUITS) for (let r = 1; r <= 9; r++) kinds.push(suitedKind(s, r));
  for (const w of WINDS) kinds.push(windKind(w));
  for (const d of DRAGONS) kinds.push(dragonKind(d));

  const tiles: Tile[] = [];
  let id = 0;
  for (const k of kinds) for (let i = 0; i < 4; i++) tiles.push({ id: id++, kind: k });
  for (let n = 1; n <= 8; n++) tiles.push({ id: id++, kind: flowerKind(n) });
  return tiles;
}

/**
 * The wall as a double-ended queue: normal draws from the front,
 * flower-replacement / gong-replacement draws from the back
 * ("take another tile from the back of the deck" — booklet step 4).
 */
export class Wall {
  private tiles: Tile[];
  constructor(shuffled: Tile[]) {
    this.tiles = shuffled.slice();
  }
  static create(rng: Rng): Wall {
    return new Wall(shuffle(buildDeck(), rng));
  }
  get remaining(): number {
    return this.tiles.length;
  }
  drawFront(): Tile | null {
    return this.tiles.shift() ?? null;
  }
  drawBack(): Tile | null {
    return this.tiles.pop() ?? null;
  }
}
