import { useRef, useEffect } from 'react';
import type { ConceptNode } from '../hooks/useConceptMap';

interface ConceptNodeElementProps {
  node: ConceptNode;
}

/**
 * A positioned DOM element for a single concept label.
 * Uses GPU-accelerated transform for positioning.
 * Font size scales with mentionCount, opacity animated via CSS transition.
 */
export function ConceptNodeElement({ node }: ConceptNodeElementProps) {
  const ref = useRef<HTMLSpanElement>(null);
  const isNew = useRef(true);

  // Entry animation: scale from 0 to 1
  useEffect(() => {
    const el = ref.current;
    if (!el || !isNew.current) return;

    // Force a reflow so the initial scale(0) is applied
    el.getBoundingClientRect();
    // Then transition to scale(1)
    requestAnimationFrame(() => {
      el.style.transform = `translate(-50%, -50%) translate(${node.x}px, ${node.y}px) scale(1)`;
      isNew.current = false;
    });
  }, [node.x, node.y]);

  // Font size: base 0.85rem, grows to 1.3rem with mention count
  const fontSize = Math.min(1.3, 0.85 + node.mentionCount * 0.05);

  // Color varies by source role
  const color =
    node.sourceRole === 'visitor'
      ? 'rgba(255, 255, 255, 0.7)'
      : node.sourceRole === 'agent'
        ? 'rgba(255, 255, 255, 0.9)'
        : 'rgba(255, 255, 255, 0.8)';

  return (
    <span
      ref={ref}
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        transform: isNew.current
          ? `translate(-50%, -50%) translate(${node.x}px, ${node.y}px) scale(0)`
          : `translate(-50%, -50%) translate(${node.x}px, ${node.y}px) scale(1)`,
        fontFamily: "Georgia, 'Times New Roman', serif",
        fontSize: `${fontSize}rem`,
        fontWeight: node.mentionCount > 3 ? 600 : 400,
        color,
        opacity: node.opacity,
        transition: 'opacity 0.5s ease, transform 0.3s cubic-bezier(0.34, 1.56, 0.64, 1)',
        textShadow: '0 0 8px rgba(255,255,255,0.15), 0 1px 2px rgba(0,0,0,0.5)',
        pointerEvents: 'none',
        willChange: 'transform, opacity',
        whiteSpace: 'nowrap',
        userSelect: 'none',
        letterSpacing: '0.04em',
      }}
    >
      {node.label}
    </span>
  );
}
