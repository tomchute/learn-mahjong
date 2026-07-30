import React from 'react';
import { Tile } from './Tile';

export function StartScreen({ onStart, onTutorial }: { onStart: () => void; onTutorial: () => void }) {
  return (
    <div className="start-screen">
      <div className="start-tiles">
        <Tile kind="dragon-R" size={52} />
        <Tile kind="bamboo-1" size={52} />
        <Tile kind="dots-5" size={52} />
        <Tile kind="chars-8" size={52} />
        <Tile kind="wind-E" size={52} />
      </div>
      <h1>Learn Mahjong</h1>
      <p className="start-sub">
        Play Hong Kong–style mahjong from your seat at the table, with a coach
        that explains every rule, every opponent move, and every choice you make.
      </p>
      <button className="btn btn-primary btn-big" onClick={onStart}>Sit down &amp; play</button>
      <button className="btn btn-secondary" onClick={onTutorial}>Read the rules first</button>
      <p className="start-credit">Rules follow Tea Base's Hong Kong style booklet · 4 rounds · 16 hands</p>
    </div>
  );
}
