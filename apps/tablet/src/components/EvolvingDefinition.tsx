import { memo, useState, useEffect, useRef } from 'react';

interface EvolvingDefinitionProps {
  text: string;
}

/**
 * Bottom-anchored definition text that crossfades when updated.
 * Shows the evolving definition draft from the conversation.
 * Memoized to avoid re-renders from parent force layout updates.
 */
export const EvolvingDefinition = memo(function EvolvingDefinition({ text }: EvolvingDefinitionProps) {
  const [displayText, setDisplayText] = useState(text);
  const [opacity, setOpacity] = useState(1);
  const timeoutRef = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    if (text === displayText) return;

    // Don't animate for initial appearance (from empty)
    if (!displayText) {
      setDisplayText(text);
      setOpacity(1);
      return;
    }

    // Crossfade: fade out, swap text, fade in
    setOpacity(0);

    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(() => {
      setDisplayText(text);
      setOpacity(1);
    }, 300); // matches CSS transition duration

    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, [text, displayText]);

  // Don't render if no definition yet
  if (!displayText) return null;

  return (
    <div
      style={{
        position: 'absolute',
        bottom: 0,
        left: 0,
        right: 0,
        padding: 'clamp(1rem, 3vw, 2rem) clamp(1.5rem, 5vw, 4rem)',
        opacity,
        transition: 'opacity 0.3s ease',
        // Gradient backdrop for readability over concept nodes
        background: 'linear-gradient(transparent, rgba(0,0,0,0.7) 30%)',
      }}
    >
      <p
        style={{
          fontFamily: "Georgia, 'Times New Roman', serif",
          fontSize: 'clamp(1.1rem, 2.6vw, 1.5rem)',
          fontWeight: 400,
          fontStyle: 'italic',
          color: 'rgba(255, 255, 255, 0.85)',
          lineHeight: 1.7,
          letterSpacing: '0.02em',
          margin: 0,
          textAlign: 'center',
          // Max 3 lines with ellipsis
          display: '-webkit-box',
          WebkitLineClamp: 3,
          WebkitBoxOrient: 'vertical',
          overflow: 'hidden',
        }}
      >
        {displayText}
      </p>
    </div>
  );
});
