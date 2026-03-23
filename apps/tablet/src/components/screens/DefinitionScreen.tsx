import { useEffect, useRef } from 'react';
import QRCode from 'qrcode';
import { TIMERS } from '@meinungeheuer/shared';
import type { Definition } from '@meinungeheuer/shared';
import type { InstallationAction } from '../../hooks/useInstallationMachine';

interface DefinitionScreenProps {
  dispatch: React.Dispatch<InstallationAction>;
  definition: Definition;
}

const ARCHIVE_BASE = 'https://archive.baufer.beauty/#/definition';

export function DefinitionScreen({ dispatch, definition }: DefinitionScreenProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const id = setTimeout(() => {
      dispatch({ type: 'TIMER_10S' });
    }, TIMERS.DEFINITION_DISPLAY_MS);
    return () => clearTimeout(id);
  }, [dispatch]);

  // Generate QR code once definition ID is known
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const url = definition.id
      ? `${ARCHIVE_BASE}/${definition.id}`
      : ARCHIVE_BASE;

    QRCode.toCanvas(canvas, url, {
      width: 120,
      margin: 1,
      color: {
        dark: '#ffffff',
        light: '#000000',
      },
      errorCorrectionLevel: 'M',
    }).catch((err) => {
      console.warn('[DefinitionScreen] QR generation failed:', err);
    });
  }, [definition.id]);

  const citations = definition.citations ?? [];

  return (
    <div
      className="flex flex-col w-full h-full bg-black"
      style={{ padding: 'clamp(2rem, 6vw, 5rem) clamp(2.5rem, 8vw, 7rem)' }}
    >
      {/* Term */}
      <p
        style={{
          fontFamily: 'system-ui, sans-serif',
          fontSize: 'clamp(1.8rem, 4vw, 3rem)',
          fontWeight: 700,
          color: '#ffffff',
          letterSpacing: '0.18em',
          textTransform: 'uppercase',
          margin: '0 0 clamp(1.2rem, 3vw, 2rem) 0',
          flexShrink: 0,
        }}
      >
        {definition.term}
      </p>

      {/* Divider */}
      <div
        style={{
          width: '3rem',
          height: '1px',
          backgroundColor: 'rgba(255,255,255,0.25)',
          marginBottom: 'clamp(1.2rem, 3vw, 2rem)',
          flexShrink: 0,
        }}
      />

      {/* Definition text */}
      <p
        style={{
          fontFamily: "Georgia, 'Times New Roman', serif",
          fontSize: 'clamp(1.1rem, 2.4vw, 1.6rem)',
          fontWeight: 400,
          color: 'rgba(255,255,255,0.95)',
          lineHeight: '1.75',
          margin: '0 0 clamp(2rem, 4vw, 3rem) 0',
          maxWidth: '65ch',
          flexShrink: 0,
        }}
      >
        {definition.definition_text}
      </p>

      {/* Citations */}
      {citations.length > 0 && (
        <div
          style={{
            borderLeft: '1px solid rgba(255,255,255,0.15)',
            paddingLeft: 'clamp(1rem, 2vw, 1.5rem)',
            flexShrink: 0,
          }}
        >
          {citations.map((citation, i) => (
            <p
              key={i}
              style={{
                fontFamily: "Georgia, 'Times New Roman', serif",
                fontSize: 'clamp(0.85rem, 1.6vw, 1.05rem)',
                fontStyle: 'italic',
                color: 'rgba(255,255,255,0.45)',
                margin: i === 0 ? '0' : 'clamp(0.6rem, 1.2vw, 0.9rem) 0 0 0',
                lineHeight: '1.6',
              }}
            >
              {'\u201e'}{citation}{'\u201c'}
            </p>
          ))}
        </div>
      )}

      {/* Spacer */}
      <div style={{ flex: 1 }} />

      {/* QR code */}
      <canvas
        ref={canvasRef}
        style={{
          display: 'block',
          imageRendering: 'pixelated',
          flexShrink: 0,
        }}
      />
    </div>
  );
}
