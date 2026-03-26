import { useEffect, useRef, useState } from 'react';
import { TIMERS, FONT_FAMILY } from '@meinungeheuer/shared';
import type { InstallationAction } from '../../hooks/useInstallationMachine';

interface PrintingScreenProps {
  dispatch: React.Dispatch<InstallationAction>;
  language: 'de' | 'en';
}

export function PrintingScreen({ dispatch, language }: PrintingScreenProps) {
  const [progress, setProgress] = useState(0);
  const rafRef = useRef<number | null>(null);
  const startRef = useRef<number | null>(null);

  const label =
    language === 'de' ? 'Ihr Beitrag wird gedruckt.' : 'Your contribution is being printed.';

  // Animate progress bar over PRINT_TIMEOUT_MS
  useEffect(() => {
    const duration = TIMERS.PRINT_TIMEOUT_MS;

    function tick(now: number) {
      if (startRef.current === null) startRef.current = now;
      const elapsed = now - startRef.current;
      const pct = Math.min(elapsed / duration, 1);
      setProgress(pct);
      if (pct < 1) {
        rafRef.current = requestAnimationFrame(tick);
      }
    }

    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    };
  }, []);

  // Timeout fallback
  useEffect(() => {
    const id = setTimeout(() => {
      dispatch({ type: 'PRINT_DONE' });
    }, TIMERS.PRINT_TIMEOUT_MS);
    return () => clearTimeout(id);
  }, [dispatch]);

  return (
    <div className="flex flex-col items-center justify-center w-full h-full bg-black select-none">
      <p
        style={{
          fontFamily: FONT_FAMILY,
          fontSize: 'clamp(1rem, 2.2vw, 1.4rem)',
          fontWeight: 400,
          color: 'rgba(255,255,255,0.7)',
          marginBottom: 'clamp(2rem, 4vw, 3rem)',
          letterSpacing: '0.04em',
          textAlign: 'center',
          padding: '0 2rem',
        }}
      >
        {label}
      </p>

      {/* Progress line */}
      <div
        style={{
          width: 'clamp(120px, 30vw, 240px)',
          height: '1px',
          backgroundColor: 'rgba(255,255,255,0.1)',
          position: 'relative',
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            position: 'absolute',
            left: 0,
            top: 0,
            height: '100%',
            width: `${progress * 100}%`,
            backgroundColor: 'rgba(255,255,255,0.6)',
            transition: 'width 0.1s linear',
          }}
        />
      </div>
    </div>
  );
}
