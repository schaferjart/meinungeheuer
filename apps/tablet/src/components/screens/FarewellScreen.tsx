import { useEffect, useRef } from 'react';
import QRCode from 'qrcode';
import { TIMERS } from '@meinungeheuer/shared';
import type { Definition } from '@meinungeheuer/shared';
import type { InstallationAction } from '../../hooks/useInstallationMachine';

interface FarewellScreenProps {
  dispatch: React.Dispatch<InstallationAction>;
  language: 'de' | 'en';
  definition: Definition | null;
}

const ARCHIVE_BASE = 'https://archive.baufer.beauty/#/definition';

export function FarewellScreen({ dispatch, definition }: FarewellScreenProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Transition to SLEEP after FAREWELL_DURATION_MS
  useEffect(() => {
    const id = setTimeout(() => {
      dispatch({ type: 'TIMER_15S' });
    }, TIMERS.FAREWELL_DURATION_MS);
    return () => clearTimeout(id);
  }, [dispatch]);

  // Generate QR code on canvas once definition ID is known
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const url = definition?.id
      ? `${ARCHIVE_BASE}/${definition.id}`
      : ARCHIVE_BASE;

    QRCode.toCanvas(canvas, url, {
      width: 220,
      margin: 2,
      color: {
        dark: '#ffffff',
        light: '#000000',
      },
      errorCorrectionLevel: 'M',
    }).catch((err) => {
      console.warn('[FarewellScreen] QR generation failed:', err);
    });
  }, [definition]);

  return (
    <div className="flex items-center justify-center w-full h-full bg-black select-none">
      <canvas
        ref={canvasRef}
        style={{
          display: 'block',
          imageRendering: 'pixelated',
        }}
      />
    </div>
  );
}
