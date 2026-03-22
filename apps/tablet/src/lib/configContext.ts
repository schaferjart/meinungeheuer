import { createContext, useContext } from 'react';
import { FACE_DETECTION, TIMERS } from '@meinungeheuer/shared';

export interface RuntimeConfig {
  faceDetection: {
    enabled: boolean;
    wakeMs: number;
    sleepMs: number;
    intervalMs: number;
    minConfidence: number;
  };
  timers: {
    welcomeMs: number;
    termPromptMs: number;
    definitionDisplayMs: number;
    farewellMs: number;
    printTimeoutMs: number;
  };
  voice: {
    stability: number;
    similarityBoost: number;
    style: number;
    speakerBoost: boolean;
  };
  portrait: {
    captureDelayMs: number;
    jpegQuality: number;
    minBlobSize: number;
    blurRadiusCss: number;
  };
  display: {
    highlightColor: string;
    spokenOpacity: number;
    upcomingOpacity: number;
    fontSize: string;
    lineHeight: number;
    letterSpacing: string;
    maxWidth: string;
  };
}

export const DEFAULT_RUNTIME_CONFIG: RuntimeConfig = {
  faceDetection: {
    enabled: true,
    wakeMs: FACE_DETECTION.WAKE_THRESHOLD_MS,
    sleepMs: FACE_DETECTION.SLEEP_THRESHOLD_MS,
    intervalMs: FACE_DETECTION.DETECTION_INTERVAL_MS,
    minConfidence: FACE_DETECTION.MIN_CONFIDENCE,
  },
  timers: {
    welcomeMs: TIMERS.WELCOME_DURATION_MS,
    termPromptMs: TIMERS.TERM_PROMPT_DURATION_MS,
    definitionDisplayMs: TIMERS.DEFINITION_DISPLAY_MS,
    farewellMs: TIMERS.FAREWELL_DURATION_MS,
    printTimeoutMs: TIMERS.PRINT_TIMEOUT_MS,
  },
  voice: {
    stability: 0.35,
    similarityBoost: 0.65,
    style: 0.6,
    speakerBoost: true,
  },
  portrait: {
    captureDelayMs: 5000,
    jpegQuality: 0.85,
    minBlobSize: 1024,
    blurRadiusCss: 25,
  },
  display: {
    highlightColor: '#fcd34d',
    spokenOpacity: 0.4,
    upcomingOpacity: 0.9,
    fontSize: 'clamp(1.2rem, 3vw, 1.8rem)',
    lineHeight: 1.8,
    letterSpacing: '0.02em',
    maxWidth: '700px',
  },
};

export const RuntimeConfigContext = createContext<RuntimeConfig>(DEFAULT_RUNTIME_CONFIG);

export function useRuntimeConfig(): RuntimeConfig {
  return useContext(RuntimeConfigContext);
}
