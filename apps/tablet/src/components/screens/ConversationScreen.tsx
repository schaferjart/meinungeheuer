import { useEffect, useRef } from 'react';
import type { Role } from '@meinungeheuer/shared';
import type { InstallationAction } from '../../hooks/useInstallationMachine';

export interface TranscriptEntry {
  role: Role;
  content: string;
}

interface ConversationScreenProps {
  dispatch: React.Dispatch<InstallationAction>;
  term: string;
  transcript: TranscriptEntry[];
  /** 'idle' | 'listening' | 'speaking' */
  micState: 'idle' | 'listening' | 'speaking';
  onDefinitionReceived?: () => void;
}

export function ConversationScreen({
  term,
  transcript,
  micState,
}: ConversationScreenProps) {
  const bottomRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to the newest turn
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [transcript]);

  const micColor =
    micState === 'listening'
      ? '#4ade80' // green
      : micState === 'speaking'
        ? '#F5A623' // amber
        : 'rgba(255,255,255,0.15)';

  const micLabel =
    micState === 'listening' ? 'Listening' : micState === 'speaking' ? 'Speaking' : '';

  return (
    <div className="flex flex-col w-full h-full bg-black">
      {/* Transcript */}
      <div
        className="flex-1 overflow-y-auto"
        style={{
          padding: 'clamp(1.5rem, 3vw, 2.5rem) clamp(1.5rem, 5vw, 4rem) 0',
          scrollbarWidth: 'none',
          msOverflowStyle: 'none',
        }}
      >
        {transcript.length === 0 && (
          <p
            style={{
              fontFamily: "Georgia, 'Times New Roman', serif",
              fontSize: 'clamp(1.2rem, 2.6vw, 1.6rem)',
              color: 'rgba(255,255,255,0.25)',
              textAlign: 'center',
              marginTop: '4rem',
            }}
          />
        )}
        {transcript.map((entry, i) => (
          <div
            key={i}
            style={{
              marginBottom: 'clamp(1rem, 2vw, 1.5rem)',
              textAlign: entry.role === 'visitor' ? 'right' : 'left',
            }}
          >
            <p
              style={{
                display: 'inline-block',
                maxWidth: '80%',
                fontFamily: "Georgia, 'Times New Roman', serif",
                fontSize: 'clamp(1.1rem, 2.8vw, 1.6rem)',
                fontWeight: 400,
                fontStyle: entry.role === 'visitor' ? 'italic' : 'normal',
                color: entry.role === 'agent' ? '#ffffff' : 'rgba(255,255,255,0.55)',
                lineHeight: '1.8',
                letterSpacing: '0.02em',
                margin: 0,
                textAlign: entry.role === 'visitor' ? 'right' : 'left',
              }}
            >
              {entry.content}
            </p>
          </div>
        ))}
        <div ref={bottomRef} />
        <style>{`
          ::-webkit-scrollbar { display: none; }
        `}</style>
      </div>

      {/* Mic indicator */}
      <div
        className="flex items-center justify-center gap-3"
        style={{
          padding: 'clamp(1rem, 3vw, 2rem)',
          flexShrink: 0,
        }}
      >
        <span
          style={{
            width: '10px',
            height: '10px',
            borderRadius: '50%',
            backgroundColor: micColor,
            display: 'inline-block',
            transition: 'background-color 0.3s ease',
            animation: micState !== 'idle' ? 'micPulse 1.5s ease-in-out infinite' : 'none',
          }}
        />
        {micLabel && (
          <span
            style={{
              fontFamily: 'system-ui, sans-serif',
              fontSize: '0.75rem',
              color: 'rgba(255,255,255,0.4)',
              letterSpacing: '0.12em',
              textTransform: 'uppercase',
            }}
          >
            {micLabel}
          </span>
        )}
        <style>{`
          @keyframes micPulse {
            0%, 100% { opacity: 1; transform: scale(1); }
            50%       { opacity: 0.5; transform: scale(1.4); }
          }
        `}</style>
      </div>
    </div>
  );
}
