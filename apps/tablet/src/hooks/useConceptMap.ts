import { useRef, useCallback, useEffect } from 'react';
import { useSyncExternalStore } from 'react';
import { extractConcepts } from '../lib/conceptExtractor';
import type { TranscriptEntry } from '../components/screens/ConversationScreen';

// --- Public types ---

export interface ConceptNode {
  id: string;              // normalized concept text
  label: string;           // display text (original casing)
  firstSeen: number;       // timestamp ms
  lastSeen: number;        // timestamp ms (updated on re-mention)
  mentionCount: number;    // how many times mentioned
  opacity: number;         // 0-1, managed by lifecycle
  x: number;              // position from force layout
  y: number;
  sourceRole: 'visitor' | 'agent' | 'both';
}

export interface ConceptEdge {
  source: string;          // node id
  target: string;          // node id
  weight: number;          // co-occurrence count
}

export interface ConceptMapState {
  nodes: ConceptNode[];
  edges: ConceptEdge[];
  definitionDraft: string;
}

// --- Constants ---

const MAX_VISIBLE_NODES = 30;
const FADE_AFTER_MS = 60_000;     // 60 seconds
const FADE_RATE = 0.02;           // opacity reduction per tick
const LIFECYCLE_TICK_MS = 1000;   // 1 second between lifecycle ticks
const MIN_DEFINITION_LENGTH = 50; // agent statement must be this long to count

// --- Core logic (pure, testable) ---

export function createInitialState(): ConceptMapState {
  return { nodes: [], edges: [], definitionDraft: '' };
}

/**
 * Process a single transcript entry into the concept map state.
 * Pure function: returns new state (or mutates in place for performance).
 */
export function processTranscriptEntry(
  state: ConceptMapState,
  entry: TranscriptEntry,
  now: number
): ConceptMapState {
  const { concepts } = extractConcepts(entry.content);
  const role = entry.role === 'visitor' ? 'visitor' as const : 'agent' as const;

  // Create a mutable copy of nodes and edges
  const nodes = [...state.nodes];
  const edges = [...state.edges];

  // Track concept IDs from this turn (for edge creation)
  const turnConceptIds: string[] = [];

  for (const concept of concepts) {
    const existingIndex = nodes.findIndex((n) => n.id === concept.normalized);
    const existing = existingIndex >= 0 ? nodes[existingIndex] : undefined;

    if (existingIndex >= 0 && existing) {
      // Update existing node
      nodes[existingIndex] = {
        ...existing,
        lastSeen: now,
        mentionCount: existing.mentionCount + 1,
        opacity: Math.min(1, existing.opacity + 0.3), // re-boost opacity on re-mention
        sourceRole:
          existing.sourceRole === role || existing.sourceRole === 'both'
            ? existing.sourceRole
            : 'both',
      };
    } else {
      // Create new node — position near center with jitter
      const jitterX = (Math.random() - 0.5) * 200;
      const jitterY = (Math.random() - 0.5) * 200;
      nodes.push({
        id: concept.normalized,
        label: concept.display,
        firstSeen: now,
        lastSeen: now,
        mentionCount: 1,
        opacity: 1,
        x: 0.5 + jitterX,  // Will be overridden by force layout
        y: 0.5 + jitterY,
        sourceRole: role,
      });
    }

    turnConceptIds.push(concept.normalized);
  }

  // Create/strengthen edges for co-occurring concepts in this turn
  for (let i = 0; i < turnConceptIds.length; i++) {
    for (let j = i + 1; j < turnConceptIds.length; j++) {
      const source = turnConceptIds[i]!;
      const target = turnConceptIds[j]!;
      const edgeIndex = edges.findIndex(
        (e) =>
          (e.source === source && e.target === target) ||
          (e.source === target && e.target === source)
      );
      const existingEdge = edgeIndex >= 0 ? edges[edgeIndex] : undefined;
      if (edgeIndex >= 0 && existingEdge) {
        edges[edgeIndex] = {
          ...existingEdge,
          weight: existingEdge.weight + 1,
        };
      } else {
        edges.push({ source, target, weight: 1 });
      }
    }
  }

  // Enforce max visible nodes cap
  const capped = enforceNodeCap(nodes, edges);

  // Update definition draft from agent statements
  const definitionDraft = updateDefinitionDraft(
    state.definitionDraft,
    entry
  );

  return {
    nodes: capped.nodes,
    edges: capped.edges,
    definitionDraft,
  };
}

/**
 * Enforce the maximum node cap. Evicts oldest/least-mentioned nodes.
 */
function enforceNodeCap(
  nodes: ConceptNode[],
  edges: ConceptEdge[]
): { nodes: ConceptNode[]; edges: ConceptEdge[] } {
  if (nodes.length <= MAX_VISIBLE_NODES) {
    return { nodes, edges };
  }

  // Sort by score: mentionCount * recency factor
  // Lower score = more likely to evict
  const scored = nodes.map((n) => ({
    node: n,
    score: n.mentionCount + (n.opacity > 0.5 ? 1 : 0),
  }));
  scored.sort((a, b) => b.score - a.score);

  const kept = scored.slice(0, MAX_VISIBLE_NODES).map((s) => s.node);
  const keptIds = new Set(kept.map((n) => n.id));

  // Remove edges referencing evicted nodes
  const filteredEdges = edges.filter(
    (e) => keptIds.has(e.source) && keptIds.has(e.target)
  );

  return { nodes: kept, edges: filteredEdges };
}

/**
 * Update the definition draft from agent transcript entries.
 * Prefers longer agent statements that are not questions.
 */
function updateDefinitionDraft(
  currentDraft: string,
  entry: TranscriptEntry
): string {
  if (entry.role !== 'agent') return currentDraft;
  const text = entry.content.trim();
  if (text.length < MIN_DEFINITION_LENGTH) return currentDraft;
  if (text.endsWith('?')) return currentDraft;

  // Prefer longer agent statements
  if (text.length > currentDraft.length) {
    return text;
  }
  return currentDraft;
}

/**
 * Apply lifecycle tick: fade stale nodes, remove fully faded.
 */
export function applyLifecycleTick(
  state: ConceptMapState,
  now: number
): ConceptMapState {
  let changed = false;
  const nodes = state.nodes.map((node) => {
    if (now - node.lastSeen > FADE_AFTER_MS && node.opacity > 0) {
      changed = true;
      return { ...node, opacity: Math.max(0, node.opacity - FADE_RATE) };
    }
    return node;
  });

  // Remove fully faded nodes
  const alive = nodes.filter((n) => n.opacity > 0);
  if (alive.length < nodes.length) {
    changed = true;
    const aliveIds = new Set(alive.map((n) => n.id));
    const edges = state.edges.filter(
      (e) => aliveIds.has(e.source) && aliveIds.has(e.target)
    );
    return { nodes: alive, edges, definitionDraft: state.definitionDraft };
  }

  return changed ? { ...state, nodes } : state;
}

// --- React hook ---

/**
 * React hook that manages the concept map state from transcript entries.
 * Extracts concepts, manages lifecycle, and provides evolving definition.
 */
export function useConceptMap(transcript: TranscriptEntry[]): ConceptMapState {
  const stateRef = useRef<ConceptMapState>(createInitialState());
  const processedCountRef = useRef(0);
  const listenersRef = useRef(new Set<() => void>());

  const subscribe = useCallback((listener: () => void) => {
    listenersRef.current.add(listener);
    return () => {
      listenersRef.current.delete(listener);
    };
  }, []);

  const getSnapshot = useCallback(() => stateRef.current, []);

  const notify = useCallback(() => {
    for (const listener of listenersRef.current) {
      listener();
    }
  }, []);

  // Process new transcript entries
  useEffect(() => {
    const now = Date.now();
    let updated = false;

    for (let i = processedCountRef.current; i < transcript.length; i++) {
      const entry = transcript[i];
      if (!entry) continue;
      stateRef.current = processTranscriptEntry(
        stateRef.current,
        entry,
        now
      );
      updated = true;
    }

    processedCountRef.current = transcript.length;
    if (updated) notify();
  }, [transcript, notify]);

  // Lifecycle tick for fading
  useEffect(() => {
    const interval = setInterval(() => {
      const now = Date.now();
      const next = applyLifecycleTick(stateRef.current, now);
      if (next !== stateRef.current) {
        stateRef.current = next;
        notify();
      }
    }, LIFECYCLE_TICK_MS);

    return () => clearInterval(interval);
  }, [notify]);

  return useSyncExternalStore(subscribe, getSnapshot);
}

// Re-export for convenience
export type { TranscriptEntry };
