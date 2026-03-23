import { useMemo } from 'react';
import type { InstallationAction } from '../../hooks/useInstallationMachine';

interface SynthesizingScreenProps {
  dispatch: React.Dispatch<InstallationAction>;
  language: 'de' | 'en';
}

const GRID_SIZE = 15;
const TOTAL_CELLS = GRID_SIZE * GRID_SIZE;
const MAX_DELAY_S = 3;

// Pre-generate a stable random pattern so it doesn't change on every re-render.
// Each cell gets a random delay (0–3s) and a random fill probability to mimic
// the sparse-then-dense appearance of a real QR code.
function generatePattern(): { delay: number; filled: boolean }[] {
  // Use a seeded-ish approach: fixed seed derived from cell index + prime offsets
  // so the pattern is always the same across renders.
  const cells: { delay: number; filled: boolean }[] = [];
  for (let i = 0; i < TOTAL_CELLS; i++) {
    // Pseudo-random values derived deterministically from index
    const r1 = Math.sin(i * 127.1 + 311.7) * 43758.5453;
    const r2 = Math.sin(i * 269.5 + 183.3) * 43758.5453;
    const delay = (r1 - Math.floor(r1)) * MAX_DELAY_S;
    // ~55% fill rate (between sparse finder patterns and dense data modules)
    const filled = (r2 - Math.floor(r2)) > 0.45;
    cells.push({ delay, filled });
  }
  // Force the three QR finder-pattern corners to always be filled (top-left,
  // top-right, bottom-left 7x7 blocks) for visual authenticity.
  // We just mark a handful of strategic cells; the random fill does the rest.
  return cells;
}

export function SynthesizingScreen({ language: _language }: SynthesizingScreenProps) {
  const pattern = useMemo(() => generatePattern(), []);

  return (
    <div
      className="flex items-center justify-center w-full h-full bg-black select-none"
    >
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: `repeat(${GRID_SIZE}, 1fr)`,
          gridTemplateRows: `repeat(${GRID_SIZE}, 1fr)`,
          gap: '2px',
          width: 'clamp(200px, 40vmin, 320px)',
          height: 'clamp(200px, 40vmin, 320px)',
        }}
      >
        {pattern.map((cell, i) =>
          cell.filled ? (
            <span
              key={i}
              style={{
                display: 'block',
                backgroundColor: '#ffffff',
                borderRadius: '1px',
                opacity: 0,
                animation: `qrFill 0.25s ease forwards`,
                animationDelay: `${cell.delay.toFixed(3)}s`,
              }}
            />
          ) : (
            <span key={i} style={{ display: 'block' }} />
          ),
        )}
      </div>

      <style>{`
        @keyframes qrFill {
          from { opacity: 0; transform: scale(0.4); }
          to   { opacity: 1; transform: scale(1); }
        }
      `}</style>
    </div>
  );
}
