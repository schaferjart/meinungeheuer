import type { InstallationAction } from '../../hooks/useInstallationMachine';

interface SleepScreenProps {
  dispatch: React.Dispatch<InstallationAction>;
}

export function SleepScreen({ dispatch }: SleepScreenProps) {
  return (
    <div
      className="flex items-center justify-center w-full h-full bg-black cursor-none select-none"
      onClick={() => dispatch({ type: 'WAKE' })}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') dispatch({ type: 'WAKE' });
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
