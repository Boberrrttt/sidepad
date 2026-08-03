'use client';

import { useEffect, useState } from 'react';
import { Cat } from 'react-kawaii';

export type MascotMood = 'idle' | 'happy' | 'worried' | 'empty';

type MascotProps = {
  mood?: MascotMood;
  size?: 'sm' | 'md' | 'lg';
  tone?: 'paper' | 'sidebar';
};

const SIZE_PX = {
  sm: 40,
  md: 64,
  lg: 112,
} as const;

const KAWAII_MOOD = {
  idle: 'happy',
  happy: 'blissful',
  worried: 'sad',
  empty: 'sad',
} as const;

export function Mascot({
  mood = 'idle',
  size = 'md',
  tone = 'paper',
}: MascotProps) {
  const pixels = SIZE_PX[size];
  const color = tone === 'sidebar' ? '#8fbfa3' : '#5a9a76';
  const [pose, setPose] = useState<MascotMood>(mood);

  useEffect(() => {
    setPose(mood);

    if (mood !== 'happy' && mood !== 'worried') return;

    const settleMs = mood === 'happy' ? 780 : 560;
    const settleTimer = window.setTimeout(() => setPose('idle'), settleMs);

    return () => window.clearTimeout(settleTimer);
  }, [mood]);

  return (
    <div
      className={`mascot mascot--${pose}`}
      style={{ width: pixels, height: pixels }}
      aria-hidden="true"
    >
      <Cat
        size={pixels}
        mood={KAWAII_MOOD[pose]}
        color={color}
        uniqueId={`sidepad-${tone}-${size}-${pose}`}
      />
    </div>
  );
}
