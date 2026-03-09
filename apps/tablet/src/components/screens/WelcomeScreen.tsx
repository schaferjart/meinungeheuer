import { useEffect, useCallback, useRef } from 'react';
import { TIMERS } from '@meinungeheuer/shared';
import { unlockAudio, isAudioUnlocked } from '../../lib/audioUnlock';
import type { InstallationAction } from '../../hooks/useInstallationMachine';

interface WelcomeScreenProps {
  dispatch: React.Dispatch<InstallationAction>;
  language: 'de' | 'en';
}

export function WelcomeScreen({ dispatch, language }: WelcomeScreenProps) {
  const advancedRef = useRef(false);

  const advance = useCallback(() => {
    if (advancedRef.current) return;
    advancedRef.current = true;
    dispatch({ type: 'TIMER_3S' });
  }, [dispatch]);

  // Auto-advance after 3s (standard behavior)
  useEffect(() => {
    const id = setTimeout(advance, TIMERS.WELCOME_DURATION_MS);
    return () => clearTimeout(id);
  }, [advance]);

  // Tap anywhere: unlock audio (if first time) + advance immediately
  const handleTap = useCallback(() => {
    unlockAudio();
    advance();
  }, [advance]);

  const text = language === 'de' ? 'Nähern Sie sich.' : 'Come closer.';
  const needsUnlock = !isAudioUnlocked();

  return (
    <div
      className="flex flex-col items-center justify-center w-full h-full bg-black select-none"
      onClick={handleTap}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') handleTap();
      }}
      aria-label="Tap to continue"
    >
      <p
        style={{
          fontFamily: "Georgia, 'Times New Roman', serif",
          fontSize: 'clamp(2rem, 6vw, 4rem)',
          fontWeight: 400,
          color: '#ffffff',
          letterSpacing: '0.02em',
          textAlign: 'center',
          margin: 0,
          padding: '0 2rem',
        }}
      >
        {text}
      </p>

      {/* Subtle hint only shown when audio needs unlocking (first visitor) */}
      {needsUnlock && (
        <p
          style={{
            fontFamily: 'system-ui, sans-serif',
            fontSize: '0.7rem',
            color: 'rgba(255,255,255,0.15)',
            letterSpacing: '0.12em',
            marginTop: '3rem',
            textTransform: 'uppercase',
            animation: 'fadeIn 2s ease-in forwards',
            opacity: 0,
          }}
        >
          {language === 'de' ? 'Berühren Sie den Bildschirm' : 'Touch the screen'}
        </p>
      )}

      <style>{`
        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 0.15; }
        }
      `}</style>
    </div>
  );
}
