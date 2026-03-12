# Phase 7: Live Concept Map — Context

**Gathered:** 2026-03-10
**Status:** Ready for planning
**Source:** Artist direction — replace chat transcript with generative visualization

<domain>
## Phase Boundary

Replace the current `ConversationScreen` (chat transcript blocks showing speaker: text) with a dynamic, generative concept map visualization that evolves in real-time during the AI voice conversation. The current transcript UI is unattractive and feels like a messaging app rather than an art installation.

The new visualization should feel alive, organic, and accumulative — like a mind map or knowledge graph that grows as the conversation deepens. It replaces a purely textual representation with something visual and generative.

**Scope:** `apps/tablet/` only — specifically `ConversationScreen.tsx` and a new `useConceptMap` hook. No changes to the conversation pipeline, state machine transitions, ElevenLabs integration, or backend.

</domain>

<decisions>
## Implementation Decisions

### What the visitor sees during conversation

Instead of chat bubbles, the screen shows:

1. **Concept nodes** — Terms/concepts that emerge from the conversation, rendered as text labels positioned on the screen. These appear, grow, shrink, and fade as the conversation progresses.

2. **Connections** — Lines or curves linking related concepts. Connections form as the AI draws relationships between ideas. Visual weight (thickness, opacity) indicates strength of relationship.

3. **Evolving definition** — A running definition text that is constantly being rewritten and refined. Displayed prominently (perhaps at the bottom or center). Gets richer over time. This is NOT the final `save_definition` result — it is a live working draft that the visitor watches evolve.

4. **Organic lifecycle** — Old concepts that are no longer relevant fade out. New ones emerge. The map breathes — it is never static. The overall motion should feel like watching thought happen.

### Concept extraction approach

Concepts must be extracted from the live transcript. Two viable approaches:

- **Option A: Client-side keyword extraction.** Parse each new transcript entry for nouns/concepts using simple NLP (compromise.js, or a lightweight keyword extractor). No API calls, zero latency. Less semantically rich but instant.

- **Option B: LLM-assisted extraction via system prompt.** Modify the system prompt to ask the AI to emit structured concept data alongside its conversational responses (e.g., in a hidden format or via a new client tool `update_concept_map`). More semantically accurate but adds prompt engineering complexity and may affect conversation quality.

- **Recommended: Start with Option A** for MVP. Pure client-side extraction keeps the conversation pipeline untouched and adds no latency. Can upgrade to Option B later if concept quality is insufficient.

### Visualization technology

Must run smoothly on iPad Safari in kiosk mode. Options:

- **Canvas 2D API** — Best performance on iPad. Direct pixel control. Manual hit detection. Good for organic, particle-like animations.
- **SVG + CSS animations** — Declarative, easy to style, React-friendly. May struggle with many animated elements on iPad.
- **React Flow / D3.js** — Feature-rich but heavy. React Flow alone is 150KB+. D3 adds complexity. Overkill for an art installation that needs custom aesthetics.
- **CSS transforms + requestAnimationFrame** — Lightweight, uses DOM elements (text stays crisp), animate with transforms for GPU acceleration.

- **Recommended: Canvas 2D API** for the graph/connections with an overlay div for text nodes (keeps text crisp and accessible). Hybrid approach: Canvas draws lines/particles, positioned DOM elements render concept labels. This is the Obsidian graph view approach.

### Layout algorithm

- Force-directed graph layout (simple spring simulation) to position concept nodes. Lightweight custom implementation — no need for a library. Nodes repel each other, connections pull related nodes together, the whole system gently drifts.
- New nodes spawn near the center or near related concepts, then settle into position.
- Fading nodes lose spring force and drift outward before disappearing.

### Connection determination

How to decide which concepts are connected:

- **Co-occurrence:** Two concepts mentioned in the same transcript turn are connected.
- **Temporal proximity:** Concepts mentioned within N seconds of each other are weakly connected.
- **Repetition strengthens:** Each time two concepts co-occur, their connection weight increases.
- No need for semantic similarity computation — the conversation itself provides the relationships.

### Performance constraints (iPad kiosk)

- Target: 30fps minimum on iPad Air / iPad Pro in Safari
- Maximum ~30 visible concept nodes at once (older ones fade out)
- Canvas redraws only connection lines (lightweight)
- DOM nodes for text labels (GPU-accelerated CSS transforms)
- Debounce concept extraction to once per completed transcript turn (not per character)
- Use `requestAnimationFrame` for animation loop, not `setInterval`

### Integration with existing architecture

- **State machine:** No changes. `ConversationScreen` is already rendered when `state.screen === 'conversation'`. It receives `transcript` as a prop. The concept map hook consumes this same transcript.
- **useConversation hook:** No changes. Continue providing `transcript: TranscriptEntry[]` as before.
- **New hook: `useConceptMap`** — Takes `transcript` as input, maintains concept graph state (nodes, edges, definition draft), handles extraction and layout simulation.
- **ConversationScreen.tsx:** Replaced internals — instead of mapping transcript entries to chat bubbles, renders the concept map canvas + overlaid text nodes + evolving definition.
- Mic state indicator at bottom is preserved as-is.

</decisions>

<specifics>
## Specific Ideas

- **Aesthetic direction:** Dark background (black, as current). Concept labels in white/gray monospace or serif. Connection lines thin, semi-transparent, perhaps with a subtle glow. The overall feel should be: watching a mind think. Minimal, typographic, not colorful.
- **Definition draft placement:** Bottom of screen, larger text, slightly brighter than concept labels. Updates with a typewriter or fade-crossfade effect as it gets refined.
- **Term badge:** Keep the current term badge in the top-left corner (from existing ConversationScreen).
- **Entry animation:** New concepts fade in from transparent, scale up slightly. A brief bright flash or underline when a concept is first mentioned.
- **Exit animation:** Fading concepts reduce opacity over ~2 seconds, then are removed from DOM.
- **Connection animation:** New connections draw in from one end (line grows), existing connections pulse briefly when reinforced.
- **Maximum concept lifespan:** A concept not mentioned for 60 seconds begins to fade. Keeps the map fresh and prevents clutter.
- **The evolving definition** could be seeded from the first substantive agent response, then refined/rewritten as the conversation deepens. Simple approach: take the most recent agent turn that looks like a definition or summary statement.

</specifics>

<deferred>
## Deferred Ideas

- LLM-assisted concept extraction (Option B) — upgrade path if keyword extraction is insufficient
- Semantic similarity between concepts (embeddings) — would enable smarter clustering
- 3D concept map (WebGL/Three.js) — too heavy for iPad, but could be spectacular on desktop
- Recording / playback of concept map evolution (time-lapse of a conversation)
- Connecting concept maps across visitors (chain mode visualization)
- Touch interaction — visitor can tap/drag concept nodes during conversation
- Color coding by speaker (visitor concepts vs agent concepts)

</deferred>

---

*Phase: 07-live-concept-map*
*Context gathered: 2026-03-10 via artist direction*
