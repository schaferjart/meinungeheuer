import { useRef, useEffect, useCallback } from 'react';
import type { ConceptEdge, ConceptNode } from '../hooks/useConceptMap';

interface ConceptMapCanvasProps {
  edges: ConceptEdge[];
  nodes: ConceptNode[];
}

/**
 * Full-screen canvas that draws connection lines between concept nodes.
 * Uses bezier curves with weight-based opacity and thickness.
 */
export function ConceptMapCanvas({ edges, nodes }: ConceptMapCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const rafIdRef = useRef<number>(0);

  // Build a position lookup from nodes
  const getPositionMap = useCallback(() => {
    const map = new Map<string, { x: number; y: number; opacity: number }>();
    for (const node of nodes) {
      map.set(node.id, { x: node.x, y: node.y, opacity: node.opacity });
    }
    return map;
  }, [nodes]);

  // Resize canvas to match container
  useEffect(() => {
    const container = containerRef.current;
    const canvas = canvasRef.current;
    if (!container || !canvas) return;

    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        const dpr = window.devicePixelRatio || 1;
        canvas.width = width * dpr;
        canvas.height = height * dpr;
        canvas.style.width = `${width}px`;
        canvas.style.height = `${height}px`;
        const ctx = canvas.getContext('2d');
        if (ctx) ctx.scale(dpr, dpr);
      }
    });

    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  // Animation loop for drawing edges
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const draw = () => {
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      const dpr = window.devicePixelRatio || 1;
      const w = canvas.width / dpr;
      const h = canvas.height / dpr;

      // Clear
      ctx.clearRect(0, 0, w, h);

      const positions = getPositionMap();

      // Draw edges
      for (const edge of edges) {
        const source = positions.get(edge.source);
        const target = positions.get(edge.target);
        if (!source || !target) continue;

        // Both nodes must be at least partially visible
        const minOpacity = Math.min(source.opacity, target.opacity);
        if (minOpacity <= 0) continue;

        // Weight-based styling
        const alpha = Math.min(0.6, edge.weight * 0.15) * minOpacity;
        const lineWidth = Math.min(4, 1 + edge.weight * 0.5);

        ctx.strokeStyle = `rgba(255, 255, 255, ${alpha})`;
        ctx.lineWidth = lineWidth;
        ctx.lineCap = 'round';

        // Bezier curve: control points offset perpendicular to the line
        const mx = (source.x + target.x) / 2;
        const my = (source.y + target.y) / 2;
        const dx = target.x - source.x;
        const dy = target.y - source.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        // Subtle curve offset
        const offset = dist * 0.1;
        const cpx = mx + (-dy / dist) * offset;
        const cpy = my + (dx / dist) * offset;

        ctx.beginPath();
        ctx.moveTo(source.x, source.y);
        ctx.quadraticCurveTo(cpx, cpy, target.x, target.y);
        ctx.stroke();
      }

      rafIdRef.current = requestAnimationFrame(draw);
    };

    rafIdRef.current = requestAnimationFrame(draw);

    return () => {
      cancelAnimationFrame(rafIdRef.current);
    };
  }, [edges, getPositionMap]);

  return (
    <div
      ref={containerRef}
      style={{
        position: 'absolute',
        inset: 0,
        pointerEvents: 'none',
      }}
    >
      <canvas
        ref={canvasRef}
        style={{
          display: 'block',
          width: '100%',
          height: '100%',
        }}
      />
    </div>
  );
}
