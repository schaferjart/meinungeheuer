import { useEffect } from 'react';
import { TIMERS } from '@meinungeheuer/shared';
import type { InstallationAction } from '../../hooks/useInstallationMachine';

interface TermPromptScreenProps {
  dispatch: React.Dispatch<InstallationAction>;
  term: string;
  language: 'de' | 'en';
}

export function TermPromptScreen({ dispatch, term, language }: TermPromptScreenProps) {
  useEffect(() => {
    const id = setTimeout(() => {
      dispatch({ type: 'TIMER_2S' });
    }, TIMERS.TERM_PROMPT_DURATION_MS);
    return () => clearTimeout(id);
  }, [dispatch]);

  const subtitle =
    language === 'de' ? 'Was bedeutet das für Sie?' : 'What does this mean to you?';

  return (
    <div className="flex flex-col items-center justify-center w-full h-full bg-black select-none">
      <p
        style={{
          fontFamily: 'system-ui, sans-serif',
          fontSize: 'clamp(3rem, 10vw, 7rem)',
          fontWeight: 700,
          color: '#ffffff',
          letterSpacing: '0.18em',
          textTransform: 'uppercase',
          margin: 0,
          textAlign: 'center',
          padding: '0 2rem',
        }}
      >
        {term}
      </p>

      <p
        style={{
          fontFamily: "Georgia, 'Times New Roman', serif",
          fontSize: 'clamp(1rem, 2.2vw, 1.4rem)',
          fontWeight: 400,
          color: 'rgba(255,255,255,0.6)',
          marginTop: 'clamp(1.5rem, 3vw, 2rem)',
          letterSpacing: '0.04em',
          textAlign: 'center',
          padding: '0 2rem',
        }}
      >
        {subtitle}
      </p>
    </div>
  );
}
