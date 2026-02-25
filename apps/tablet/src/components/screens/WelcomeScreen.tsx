import { useEffect } from 'react';
import { TIMERS } from '@meinungeheuer/shared';
import type { InstallationAction } from '../../hooks/useInstallationMachine';

interface WelcomeScreenProps {
  dispatch: React.Dispatch<InstallationAction>;
  language: 'de' | 'en';
}

export function WelcomeScreen({ dispatch, language }: WelcomeScreenProps) {
  useEffect(() => {
    const id = setTimeout(() => {
      dispatch({ type: 'TIMER_3S' });
    }, TIMERS.WELCOME_DURATION_MS);
    return () => clearTimeout(id);
  }, [dispatch]);

  const text = language === 'de' ? 'Nähern Sie sich.' : 'Come closer.';

  return (
    <div className="flex items-center justify-center w-full h-full bg-black select-none">
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
    </div>
  );
}
