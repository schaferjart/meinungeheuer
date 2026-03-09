import { useCallback } from 'react';
import { requestFullscreen } from '../../lib/fullscreen';
import { unlockAudio } from '../../lib/audioUnlock';
import type { InstallationAction } from '../../hooks/useInstallationMachine';

interface SleepScreenProps {
  dispatch: React.Dispatch<InstallationAction>;
}

export function SleepScreen({ dispatch }: SleepScreenProps) {
  const handleInteraction = useCallback(() => {
    unlockAudio();
    requestFullscreen();
    dispatch({ type: 'WAKE' });
  }, [dispatch]);

  return (
    <div
      className="flex items-center justify-center w-full h-full bg-black cursor-none select-none"
      onClick={handleInteraction}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') handleInteraction();
      }}
      aria-label="Tap to begin"
    >
      {/* Breathing dot — pure CSS animation, no JS */}
      <span
        style={{
          display: 'block',
          width: '8px',
          height: '8px',
          borderRadius: '50%',
          backgroundColor: '#ffffff',
          animation: 'breathe 4s ease-in-out infinite',
        }}
      />
      <style>{`
        @keyframes breathe {
          0%, 100% { opacity: 0.2; transform: scale(1); }
          50%       { opacity: 0.5; transform: scale(1.3); }
        }
      `}</style>
    </div>
  );
}
