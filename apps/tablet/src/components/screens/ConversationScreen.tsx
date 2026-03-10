import { useRef, useState, useEffect, useCallback } from 'react';
import type { Role } from '@meinungeheuer/shared';
import type { InstallationAction } from '../../hooks/useInstallationMachine';
import { useConceptMap } from '../../hooks/useConceptMap';
import { useForceLayout } from '../../hooks/useForceLayout';
import { ConceptMapCanvas } from '../ConceptMapCanvas';
import { ConceptNodeElement } from '../ConceptNode';
import { EvolvingDefinition } from '../EvolvingDefinition';

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
  const mapAreaRef = useRef<HTMLDivElement>(null);
  const [bounds, setBounds] = useState({ width: 800, height: 600 });

  // Observe container size for force layout bounds
  const updateBounds = useCallback(() => {
    const el = mapAreaRef.current;
    if (el) {
      setBounds({ width: el.clientWidth, height: el.clientHeight });
    }
  }, []);

  useEffect(() => {
    updateBounds();
    const el = mapAreaRef.current;
    if (!el) return;

    const observer = new ResizeObserver(() => updateBounds());
    observer.observe(el);
    return () => observer.disconnect();
  }, [updateBounds]);

  // Concept map state from transcript
  const { nodes, edges, definitionDraft } = useConceptMap(transcript);

  // Force-directed layout for positioning
  const positionedNodes = useForceLayout(nodes, edges, bounds);

  // Mic indicator styling
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
      {/* Term badge -- top-left */}
      <div
        style={{
          padding: 'clamp(1rem, 2.5vw, 1.5rem) clamp(1.5rem, 3vw, 2rem)',
          flexShrink: 0,
          position: 'relative',
          zIndex: 10,
        }}
      >
        <span
          style={{
            fontFamily: 'system-ui, sans-serif',
            fontSize: 'clamp(0.75rem, 1.4vw, 0.95rem)',
            fontWeight: 600,
            color: 'rgba(255,255,255,0.4)',
            letterSpacing: '0.2em',
            textTransform: 'uppercase',
          }}
        >
          {term}
        </span>
      </div>

      {/* Concept map area */}
      <div
        ref={mapAreaRef}
        className="flex-1"
        style={{
          position: 'relative',
          overflow: 'hidden',
        }}
      >
        {/* Canvas layer: connection lines */}
        <ConceptMapCanvas edges={edges} nodes={positionedNodes} />

        {/* DOM layer: concept node labels */}
        {positionedNodes.map((node) => (
          <ConceptNodeElement key={node.id} node={node} />
        ))}

        {/* Evolving definition anchored at bottom */}
        <EvolvingDefinition text={definitionDraft} />
      </div>

      {/* Mic indicator -- bottom */}
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
