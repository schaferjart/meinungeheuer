import type { InstallationAction } from '../../hooks/useInstallationMachine';

interface SynthesizingScreenProps {
  dispatch: React.Dispatch<InstallationAction>;
  language: 'de' | 'en';
}

// dispatch is available for future use (e.g. timeout fallback)
export function SynthesizingScreen({ language }: SynthesizingScreenProps) {
  const text = language === 'de' ? 'Einen Moment' : 'One moment';

  return (
    <div className="flex items-center justify-center w-full h-full bg-black select-none">
      <div className="flex items-baseline gap-1">
        <p
          style={{
            fontFamily: "Georgia, 'Times New Roman', serif",
            fontSize: 'clamp(1.2rem, 2.8vw, 1.8rem)',
            fontWeight: 400,
            color: 'rgba(255,255,255,0.8)',
            margin: 0,
            letterSpacing: '0.04em',
          }}
        >
          {text}
        </p>
        {/* Three pulsing dots */}
        {[0, 1, 2].map((i) => (
          <span
            key={i}
            style={{
              display: 'inline-block',
              width: '5px',
              height: '5px',
              borderRadius: '50%',
              backgroundColor: 'rgba(255,255,255,0.8)',
              animation: `dotPulse 1.4s ease-in-out ${i * 0.2}s infinite`,
              marginLeft: i === 0 ? '4px' : '0',
            }}
          />
        ))}
      </div>
      <style>{`
        @keyframes dotPulse {
          0%, 80%, 100% { opacity: 0.2; transform: scale(0.8); }
          40%           { opacity: 1;   transform: scale(1); }
        }
      `}</style>
    </div>
  );
}
