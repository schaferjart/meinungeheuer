import { useEffect, useCallback, useRef } from 'react';
import { TIMERS } from '@denkfink/installation-core';
import { unlockAudio } from '../../lib/audioUnlock';
import type { InstallationAction } from '../../hooks/useInstallationMachine';

interface WelcomeScreenProps {
  dispatch: React.Dispatch<InstallationAction>;
  language: 'de' | 'en';
}

export function WelcomeScreen({ dispatch }: WelcomeScreenProps) {
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

  return (
    <div
      className="w-full h-full bg-black select-none"
      onClick={handleTap}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') handleTap();
      }}
      aria-label="Tap to continue"
    />
  );
}
