import { useRef, useEffect, useCallback, useState } from 'react';
import type { ConceptNode, ConceptEdge } from './useConceptMap';

// --- Constants ---

const REPULSION_STRENGTH = 5000;    // Coulomb constant
const ATTRACTION_STRENGTH = 0.008;  // Spring constant
const CENTERING_STRENGTH = 0.002;   // Pull toward center
const DAMPING = 0.92;               // Velocity decay per step
const MIN_DISTANCE = 40;            // Minimum distance between nodes (prevents division by zero)
const PERTURBATION = 0.3;           // Random perturbation for organic feel
const PADDING = 60;                 // Boundary padding for labels
const THROTTLE_FRAMES = 3;          // Update React state every N frames

// --- Types ---

interface LayoutNode {
  id: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
}

interface Bounds {
  width: number;
  height: number;
}

// --- Pure simulation step ---

/**
 * Run one step of the force-directed layout simulation.
 * Mutates node positions and velocities in place for performance.
 */
export function simulateStep(
  layoutNodes: LayoutNode[],
  edges: ConceptEdge[],
  bounds: Bounds
): void {
  const n = layoutNodes.length;
  if (n === 0) return;

  const cx = bounds.width / 2;
  const cy = bounds.height / 2;

  // Accumulate forces
  for (let i = 0; i < n; i++) {
    const node = layoutNodes[i];
    let fx = 0;
    let fy = 0;

    // Repulsion from other nodes (Coulomb's law)
    for (let j = 0; j < n; j++) {
      if (i === j) continue;
      const other = layoutNodes[j];
      let dx = node.x - other.x;
      let dy = node.y - other.y;
      let dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < MIN_DISTANCE) dist = MIN_DISTANCE;
      const force = REPULSION_STRENGTH / (dist * dist);
      fx += (dx / dist) * force;
      fy += (dy / dist) * force;
    }

    // Centering force
    fx += (cx - node.x) * CENTERING_STRENGTH;
    fy += (cy - node.y) * CENTERING_STRENGTH;

    // Small random perturbation for organic feel
    fx += (Math.random() - 0.5) * PERTURBATION;
    fy += (Math.random() - 0.5) * PERTURBATION;

    // Apply accumulated force to velocity
    node.vx = (node.vx + fx) * DAMPING;
    node.vy = (node.vy + fy) * DAMPING;
  }

  // Attraction along edges (Hooke's law / spring force)
  for (const edge of edges) {
    const source = layoutNodes.find((n) => n.id === edge.source);
    const target = layoutNodes.find((n) => n.id === edge.target);
    if (!source || !target) continue;

    const dx = target.x - source.x;
    const dy = target.y - source.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist < 1) continue;

    const force = dist * ATTRACTION_STRENGTH * edge.weight;
    const fx = (dx / dist) * force;
    const fy = (dy / dist) * force;

    source.vx += fx;
    source.vy += fy;
    target.vx -= fx;
    target.vy -= fy;
  }

  // Update positions and enforce bounds
  for (const node of layoutNodes) {
    node.x += node.vx;
    node.y += node.vy;

    // Clamp to bounds with padding
    node.x = Math.max(PADDING, Math.min(bounds.width - PADDING, node.x));
    node.y = Math.max(PADDING, Math.min(bounds.height - PADDING, node.y));
  }
}

// --- React hook ---

/**
 * Force-directed layout hook. Runs simulation via requestAnimationFrame.
 * Returns positioned nodes with updated x/y coordinates.
 */
export function useForceLayout(
  nodes: ConceptNode[],
  edges: ConceptEdge[],
  bounds: Bounds = { width: 800, height: 600 }
): ConceptNode[] {
  const layoutRef = useRef<Map<string, LayoutNode>>(new Map());
  const frameCountRef = useRef(0);
  const rafIdRef = useRef<number>(0);
  const [positioned, setPositioned] = useState<ConceptNode[]>(nodes);

  // Sync layout nodes with concept nodes
  const syncNodes = useCallback(() => {
    const layout = layoutRef.current;
    const cx = bounds.width / 2;
    const cy = bounds.height / 2;

    // Add new nodes
    for (const node of nodes) {
      if (!layout.has(node.id)) {
        // New node: start near center with jitter
        layout.set(node.id, {
          id: node.id,
          x: cx + (Math.random() - 0.5) * 100,
          y: cy + (Math.random() - 0.5) * 100,
          vx: 0,
          vy: 0,
        });
      }
    }

    // Remove nodes no longer present
    const currentIds = new Set(nodes.map((n) => n.id));
    for (const id of layout.keys()) {
      if (!currentIds.has(id)) {
        layout.delete(id);
      }
    }
  }, [nodes, bounds]);

  // Animation loop
  useEffect(() => {
    if (nodes.length === 0) {
      setPositioned([]);
      return;
    }

    syncNodes();

    const tick = () => {
      const layoutNodes = Array.from(layoutRef.current.values());
      simulateStep(layoutNodes, edges, bounds);

      frameCountRef.current++;

      // Throttle React state updates
      if (frameCountRef.current % THROTTLE_FRAMES === 0) {
        const layout = layoutRef.current;
        setPositioned(
          nodes.map((node) => {
            const ln = layout.get(node.id);
            if (ln) {
              return { ...node, x: ln.x, y: ln.y };
            }
            return node;
          })
        );
      }

      rafIdRef.current = requestAnimationFrame(tick);
    };

    rafIdRef.current = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(rafIdRef.current);
    };
  }, [nodes, edges, bounds, syncNodes]);

  return positioned;
}
