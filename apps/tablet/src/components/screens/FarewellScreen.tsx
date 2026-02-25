import { useEffect, useState } from 'react';
import { TIMERS } from '@meinungeheuer/shared';
import type { InstallationAction } from '../../hooks/useInstallationMachine';

interface FarewellScreenProps {
  dispatch: React.Dispatch<InstallationAction>;
  language: 'de' | 'en';
}

export function FarewellScreen({ dispatch, language }: FarewellScreenProps) {
  const [subtitleVisible, setSubtitleVisible] = useState(false);

  const mainText = language === 'de' ? 'Danke.' : 'Thank you.';
  const subText =
    language === 'de'
      ? 'Ihr Beitrag ist Teil des Archivs.'
      : 'Your contribution is part of the archive.';

  // Subtitle fades in after 3s
  useEffect(() => {
    const id = setTimeout(() => setSubtitleVisible(true), 3000);
    return () => clearTimeout(id);
  }, []);

  // Transition to SLEEP after FAREWELL_DURATION_MS
  useEffect(() => {
    const id = setTimeout(() => {
      dispatch({ type: 'TIMER_15S' });
    }, TIMERS.FAREWELL_DURATION_MS);
    return () => clearTimeout(id);
  }, [dispatch]);

  return (
    <div className="flex flex-col items-center justify-center w-full h-full bg-black select-none">
      <p
        style={{
          fontFamily: "Georgia, 'Times New Roman', serif",
          fontSize: 'clamp(2.5rem, 8vw, 5.5rem)',
          fontWeight: 400,
          color: '#ffffff',
          margin: 0,
          letterSpacing: '0.02em',
          textAlign: 'center',
        }}
      >
        {mainText}
      </p>

      <p
        style={{
          fontFamily: "Georgia, 'Times New Roman', serif",
          fontSize: 'clamp(0.85rem, 1.8vw, 1.1rem)',
          fontWeight: 400,
          color: 'rgba(255,255,255,0.4)',
          marginTop: 'clamp(1.5rem, 3vw, 2.5rem)',
          letterSpacing: '0.06em',
          textAlign: 'center',
          opacity: subtitleVisible ? 1 : 0,
          transition: 'opacity 0.8s ease',
        }}
      >
        {subText}
      </p>
    </div>
  );
}
