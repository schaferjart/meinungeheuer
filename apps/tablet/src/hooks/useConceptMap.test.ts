import { describe, it, expect } from 'vitest';
import {
  createInitialState,
  processTranscriptEntry,
  applyLifecycleTick,
} from './useConceptMap';
import type { TranscriptEntry } from '../components/screens/ConversationScreen';

function makeEntry(role: 'visitor' | 'agent', content: string): TranscriptEntry {
  return { role, content };
}

describe('useConceptMap logic', () => {
  describe('processTranscriptEntry', () => {
    it('creates concept nodes from a transcript entry', () => {
      const state = createInitialState();
      const now = Date.now();
      const entry = makeEntry('visitor', 'Creativity requires imagination and persistence');
      const next = processTranscriptEntry(state, entry, now);
      expect(next.nodes.length).toBeGreaterThan(0);
      const ids = next.nodes.map((n) => n.id);
      expect(ids).toContain('creativity');
      expect(ids).toContain('imagination');
      expect(ids).toContain('persistence');
    });

    it('increments mentionCount on repeated concepts', () => {
      let state = createInitialState();
      const now = Date.now();
      state = processTranscriptEntry(
        state,
        makeEntry('visitor', 'Creativity is about exploration'),
        now
      );
      const countBefore = state.nodes.find((n) => n.id === 'creativity')!.mentionCount;

      state = processTranscriptEntry(
        state,
        makeEntry('agent', 'Creativity emerges through conversation'),
        now + 1000
      );
      const countAfter = state.nodes.find((n) => n.id === 'creativity')!.mentionCount;
      expect(countAfter).toBe(countBefore + 1);
    });

    it('creates edges between co-occurring concepts', () => {
      const state = createInitialState();
      const now = Date.now();
      const entry = makeEntry(
        'visitor',
        'Philosophy connects truth with existence'
      );
      const next = processTranscriptEntry(state, entry, now);

      // Should have edges between the extracted concepts
      expect(next.edges.length).toBeGreaterThan(0);
      // Verify at least one edge connects two of our concepts
      const conceptIds = next.nodes.map((n) => n.id);
      for (const edge of next.edges) {
        expect(conceptIds).toContain(edge.source);
        expect(conceptIds).toContain(edge.target);
      }
    });

    it('increases edge weight on repeated co-occurrence', () => {
      let state = createInitialState();
      const now = Date.now();
      state = processTranscriptEntry(
        state,
        makeEntry('visitor', 'Language shapes thought completely'),
        now
      );

      const edgeBefore = state.edges.find(
        (e) =>
          (e.source === 'language' && e.target === 'thought') ||
          (e.source === 'thought' && e.target === 'language')
      );
      const weightBefore = edgeBefore?.weight ?? 0;

      state = processTranscriptEntry(
        state,
        makeEntry('agent', 'Language indeed shapes thought profoundly'),
        now + 1000
      );

      const edgeAfter = state.edges.find(
        (e) =>
          (e.source === 'language' && e.target === 'thought') ||
          (e.source === 'thought' && e.target === 'language')
      );
      expect(edgeAfter!.weight).toBe(weightBefore + 1);
    });

    it('caps nodes at 30, evicting least-mentioned', () => {
      let state = createInitialState();
      const now = Date.now();

      // Add 35 unique concepts by feeding distinct words
      const words = Array.from({ length: 35 }, (_, i) => `concept${String(i).padStart(3, '0')}word`);

      for (let i = 0; i < words.length; i++) {
        state = processTranscriptEntry(
          state,
          makeEntry('visitor', words[i]!),
          now + i * 100
        );
      }

      expect(state.nodes.length).toBeLessThanOrEqual(30);
    });

    it('updates definitionDraft from agent statements (> 50 chars, not question)', () => {
      let state = createInitialState();
      const now = Date.now();

      // Short agent statement - should not update draft
      state = processTranscriptEntry(
        state,
        makeEntry('agent', 'Tell me more.'),
        now
      );
      expect(state.definitionDraft).toBe('');

      // Question - should not update draft
      state = processTranscriptEntry(
        state,
        makeEntry('agent', 'What do you think about the relationship between creativity and destruction in art?'),
        now + 1000
      );
      expect(state.definitionDraft).toBe('');

      // Long substantive agent statement - should update draft
      const longStatement =
        'Creativity is the act of bringing something new into existence through imagination and will.';
      state = processTranscriptEntry(
        state,
        makeEntry('agent', longStatement),
        now + 2000
      );
      expect(state.definitionDraft).toBe(longStatement);
    });

    it('does not update definitionDraft from visitor statements', () => {
      let state = createInitialState();
      const now = Date.now();
      state = processTranscriptEntry(
        state,
        makeEntry('visitor', 'I think creativity is the fundamental force driving all human progress and innovation.'),
        now
      );
      expect(state.definitionDraft).toBe('');
    });

    it('sets sourceRole to "both" when both roles mention same concept', () => {
      let state = createInitialState();
      const now = Date.now();
      state = processTranscriptEntry(
        state,
        makeEntry('visitor', 'Creativity drives innovation forward'),
        now
      );
      expect(state.nodes.find((n) => n.id === 'creativity')!.sourceRole).toBe('visitor');

      state = processTranscriptEntry(
        state,
        makeEntry('agent', 'Creativity indeed transforms everything around'),
        now + 1000
      );
      expect(state.nodes.find((n) => n.id === 'creativity')!.sourceRole).toBe('both');
    });
  });

  describe('applyLifecycleTick', () => {
    it('fades nodes older than 60 seconds', () => {
      let state = createInitialState();
      const past = Date.now() - 65_000; // 65 seconds ago
      state = processTranscriptEntry(
        state,
        makeEntry('visitor', 'Philosophy explores existence deeply'),
        past
      );

      expect(state.nodes.length).toBeGreaterThan(0);
      const opacityBefore = state.nodes[0]!.opacity;

      const now = Date.now();
      const next = applyLifecycleTick(state, now);

      expect(next.nodes[0]!.opacity).toBeLessThan(opacityBefore);
    });

    it('does not fade recent nodes', () => {
      let state = createInitialState();
      const now = Date.now();
      state = processTranscriptEntry(
        state,
        makeEntry('visitor', 'Philosophy explores existence deeply'),
        now
      );
      const opacityBefore = state.nodes[0]!.opacity;

      const next = applyLifecycleTick(state, now);
      // Should be the same reference (no change)
      expect(next).toBe(state);
      expect(next.nodes[0]!.opacity).toBe(opacityBefore);
    });

    it('removes fully faded nodes (opacity reaches 0)', () => {
      let state = createInitialState();
      const past = Date.now() - 120_000; // 2 minutes ago
      state = processTranscriptEntry(
        state,
        makeEntry('visitor', 'Philosophy explores meaning'),
        past
      );

      // Force opacity to near-zero
      state = {
        ...state,
        nodes: state.nodes.map((n) => ({ ...n, opacity: 0.01 })),
      };

      const now = Date.now();
      const next = applyLifecycleTick(state, now);
      // Opacity 0.01 - 0.02 = -0.01, clamped to 0, should be removed
      expect(next.nodes.length).toBe(0);
    });

    it('removes edges when their nodes are removed', () => {
      let state = createInitialState();
      const past = Date.now() - 120_000;
      state = processTranscriptEntry(
        state,
        makeEntry('visitor', 'Language shapes thought completely'),
        past
      );

      expect(state.edges.length).toBeGreaterThan(0);

      // Force all nodes to near-zero opacity
      state = {
        ...state,
        nodes: state.nodes.map((n) => ({ ...n, opacity: 0.01 })),
      };

      const now = Date.now();
      const next = applyLifecycleTick(state, now);
      expect(next.nodes.length).toBe(0);
      expect(next.edges.length).toBe(0);
    });
  });
});
