import type { InstallationAction } from '../../hooks/useInstallationMachine';

interface SynthesizingScreenProps {
  dispatch: React.Dispatch<InstallationAction>;
  language: 'de' | 'en';
}

export function SynthesizingScreen({ dispatch: _dispatch, language: _language }: SynthesizingScreenProps) {
  return (
    <div className="flex items-center justify-center w-full h-full bg-black select-none">
      <div
        style={{
          width: '30vw',
          height: '1px',
          backgroundColor: 'rgba(255,255,255,0.12)',
          position: 'relative',
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            position: 'absolute',
            inset: 0,
            backgroundColor: '#ffffff',
            transformOrigin: 'left center',
            animation: 'synthLoad 5s ease-in-out infinite',
          }}
        />
      </div>

      <style>{`
        @keyframes synthLoad {
          0%   { transform: scaleX(0); }
          80%  { transform: scaleX(1); }
          100% { transform: scaleX(1); }
        }
      `}</style>
    </div>
  );
}
