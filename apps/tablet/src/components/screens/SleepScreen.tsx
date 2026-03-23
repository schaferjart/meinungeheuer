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
          width: '10px',
          height: '10px',
          borderRadius: '50%',
          backgroundColor: '#ffffff',
          animation: 'breathe 6s ease-in-out infinite',
        }}
      />
      <style>{`
        @keyframes breathe {
          0%, 100% {
            opacity: 0.08;
            transform: scale(1);
            box-shadow: 0 0 0px rgba(255,255,255,0);
          }
          40% {
            opacity: 0.6;
            transform: scale(2.2);
            box-shadow: 0 0 18px rgba(255,255,255,0.35);
          }
          50% {
            opacity: 1;
            transform: scale(2.8);
            box-shadow: 0 0 28px rgba(255,255,255,0.55);
          }
          60% {
            opacity: 0.6;
            transform: scale(2.2);
            box-shadow: 0 0 18px rgba(255,255,255,0.35);
          }
        }
      `}</style>
    </div>
  );
}
