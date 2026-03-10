import { describe, it, expect } from 'vitest';
import { simulateStep } from './useForceLayout';
import type { ConceptEdge } from './useConceptMap';

interface LayoutNode {
  id: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
}

function makeNode(id: string, x: number, y: number): LayoutNode {
  return { id, x, y, vx: 0, vy: 0 };
}

const BOUNDS = { width: 800, height: 600 };

describe('simulateStep', () => {
  it('nodes without edges spread apart (repulsion)', () => {
    // Two nodes close together with no edges should repel
    const nodes: LayoutNode[] = [
      makeNode('a', 400, 300),
      makeNode('b', 405, 300),
    ];
    const edges: ConceptEdge[] = [];

    const initialDistance = Math.abs(nodes[0]!.x - nodes[1]!.x);

    // Run multiple steps to let forces accumulate
    for (let i = 0; i < 50; i++) {
      simulateStep(nodes, edges, BOUNDS);
    }

    const finalDistance = Math.abs(nodes[0]!.x - nodes[1]!.x);
    expect(finalDistance).toBeGreaterThan(initialDistance);
  });

  it('connected nodes cluster together (attraction)', () => {
    // Two nodes far apart with a strong edge should attract
    const nodes: LayoutNode[] = [
      makeNode('a', 100, 300),
      makeNode('b', 700, 300),
    ];
    const edges: ConceptEdge[] = [{ source: 'a', target: 'b', weight: 5 }];

    const initialDistance = Math.abs(nodes[0]!.x - nodes[1]!.x);

    for (let i = 0; i < 100; i++) {
      simulateStep(nodes, edges, BOUNDS);
    }

    const finalDistance = Math.abs(nodes[0]!.x - nodes[1]!.x);
    expect(finalDistance).toBeLessThan(initialDistance);
  });

  it('nodes stay within bounds', () => {
    const nodes: LayoutNode[] = [
      makeNode('a', 10, 10),
      makeNode('b', 790, 590),
    ];
    const edges: ConceptEdge[] = [];

    for (let i = 0; i < 100; i++) {
      simulateStep(nodes, edges, BOUNDS);
    }

    for (const node of nodes) {
      expect(node.x).toBeGreaterThanOrEqual(60);  // PADDING
      expect(node.x).toBeLessThanOrEqual(740);     // width - PADDING
      expect(node.y).toBeGreaterThanOrEqual(60);
      expect(node.y).toBeLessThanOrEqual(540);
    }
  });

  it('adding a node triggers meaningful simulation', () => {
    const nodes: LayoutNode[] = [
      makeNode('a', 400, 300),
    ];
    const edges: ConceptEdge[] = [];

    // Run steps with one node
    for (let i = 0; i < 10; i++) {
      simulateStep(nodes, edges, BOUNDS);
    }

    // Add second node nearby
    nodes.push(makeNode('b', 405, 305));

    // Position should change
    const xBefore = nodes[1]!.x;
    for (let i = 0; i < 20; i++) {
      simulateStep(nodes, edges, BOUNDS);
    }
    expect(nodes[1]!.x).not.toBe(xBefore);
  });

  it('empty node list is handled gracefully', () => {
    const nodes: LayoutNode[] = [];
    const edges: ConceptEdge[] = [];

    // Should not throw
    expect(() => {
      simulateStep(nodes, edges, BOUNDS);
    }).not.toThrow();
  });
});
