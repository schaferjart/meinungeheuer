# Reading Companion — Design Document

## Pivot

MeinUngeheuer started as an art installation: visitors had spoken AI conversations about concepts, producing printed glossary cards. The installation is over. This document describes the pivot: a **personal reading companion** that helps a single reader deepen their understanding of texts through conversation, building a persistent wiki of accumulated knowledge over time.

The core insight carries over: genuine understanding begins when you can express a concept in your own words. But the frame shifts from provocation (installation) to learning (companion). The reader isn't a stranger passing through — they're returning, accumulating, progressing.

---

## The Three Layers

Everything in the system belongs to one of three layers. All three are persistent, all three are indexable, and all three feed into each other.

### 1. Sources (immutable)

Texts the reader has read or is reading. Book chapters, articles, essays, excerpts. Once ingested, a source doesn't change. It is the ground truth.

Each source gets an **agnostic concept extraction pass** — the system identifies concepts in the text that are interesting enough to warrant their own wiki page, like hyperlinks in a Wikipedia article. This pass is reader-independent: it's about what's *in the text*, not what the reader knows.

Examples of sources:
- A chapter from Kleist's *Über die allmähliche Verfertigung der Gedanken beim Reden*
- A paper on Socratic dialogue in AI education
- An article on epistemology
- Notes from a lecture

### 2. Conversations (append-only)

Spoken dialogues between the reader and the AI about a source (or about concepts more broadly). Each conversation is a document: timestamped, transcribed, indexable. After a conversation ends, the system extracts what was discussed — which concepts were touched, what new understanding emerged, what connections were made.

The conversation style is Socratic but friendly. Not the installation's philosophical destabilization — instead: "What did you take from this? What struck you? How does this connect to what you read last week?" The goal is to help the reader articulate and consolidate, not to provoke aporia.

The AI calibrates to the reader's existing knowledge. If the reader has engaged with a concept across five prior sources and conversations, the AI doesn't ask beginner questions. It pushes deeper, makes connections, surfaces contradictions between what the reader said before and what the current text suggests.

### 3. Concepts (the wiki — LLM-maintained)

The compounding layer. Each concept gets a wiki page: a term, a summary, a longer body, cross-references to other concepts, links back to the sources and conversations where it appeared. The reader never writes these pages — the LLM maintains them. After every ingest and every conversation, the LLM updates the relevant concept pages: adding nuance, noting contradictions, strengthening cross-references.

Over time, this becomes the reader's personal knowledge base — a structured, interlinked map of everything they've read and discussed, in a form that's browsable (Obsidian), searchable (embeddings), and usable as context for future conversations.

**Key constraint:** concept pages evolve, but they track their own history. Every update is logged with a rationale. The reader can see how their understanding of "appropriation" changed from the first time they encountered it to the tenth.

---

## Reader Profile

Unlike the installation (anonymous visitors), this system knows its reader. The profile tracks:

- **Reading history:** which sources have been read, when, how far
- **Concept engagement:** which concepts the reader has encountered, discussed, how many times, across which sources
- **Mastery estimation:** per-concept score reflecting depth of engagement (not a test grade — a heuristic based on: how many sources touched it, how many conversations discussed it, how articulately the reader spoke about it)
- **Interests and patterns:** emergent from the data — which clusters of concepts does the reader gravitate toward?

This profile feeds into conversation context. The AI knows what the reader has read, what they've discussed, and where their understanding is strong or thin. It uses this to calibrate: skip what's well-understood, probe what's shaky, connect what's fragmented.

---

## Core Flows

### Ingest a Source

1. Reader adds a text (paste, upload, or clip via Obsidian Web Clipper)
2. System stores it as an immutable source
3. LLM does concept extraction: identifies ~5–20 concepts worth tracking
4. For each concept:
   - If it already exists in the wiki: link the source, update the concept page with new context from this source
   - If it's new: create a concept page with an initial draft (summary, body, links to related existing concepts via embeddings)
5. Update the index
6. Log the ingest

The reader can optionally read the source with TTS (text-to-speech with karaoke word highlighting — this carries over directly from the installation's text reader).

### Have a Conversation

1. Reader opens a source (or picks a concept) and starts a conversation
2. System assembles context for the AI:
   - The source text (or relevant excerpts)
   - Concepts extracted from the source, with their current wiki page summaries
   - Reader profile: prior engagement with these concepts, mastery scores
   - Relevant prior conversations (semantic search)
3. AI conducts a Socratic dialogue — asks what the reader thought, probes understanding, makes connections to prior reading, challenges surface-level takes
4. Conversation ends. Transcript is saved.
5. Post-conversation extraction:
   - Which concepts were discussed?
   - Did new concepts emerge?
   - For each touched concept: update the wiki page incorporating new insights from the conversation
   - Update reader's mastery scores
   - Log the conversation

### Browse the Wiki

The wiki is a directory of markdown files, browsable in Obsidian (or any markdown viewer). The reader can:
- Follow cross-references between concepts
- See which sources and conversations contributed to a concept page
- View the graph of concept relationships
- Track their own reading progress and mastery over time

### Query

The reader can ask questions against the wiki:
- "What have I learned about epistemology?"
- "Where do Kleist and Socrates agree?"
- "What concepts have I encountered but never discussed?"
- "What should I read next based on my gaps?"

Good answers get filed back into the wiki as new pages — the reader's explorations compound just like ingested sources do.

### Lint

Periodic health check:
- Orphan concepts (no inbound links)
- Contradictions between concept pages
- Concepts mentioned frequently in conversations but lacking a wiki page
- Stale pages that newer sources have superseded
- Suggested next sources based on gaps in the knowledge graph

---

## Data Model

### Tables

```
readers
  id              uuid primary key
  name            text
  preferences     jsonb (language, voice settings, etc.)
  created_at      timestamptz

sources
  id              uuid primary key
  reader_id       uuid references readers
  title           text
  author          text
  content         text
  language        text ('de' | 'en')
  source_type     text ('book_chapter' | 'article' | 'essay' | 'excerpt' | 'notes')
  reading_status  text ('unread' | 'reading' | 'read')
  added_at        timestamptz

concepts
  id              uuid primary key
  reader_id       uuid references readers
  term            text
  summary         text (one-line definition)
  body            text (full markdown wiki page)
  language        text
  embedding       vector(1536)
  mastery_score   real (0.0–1.0)
  first_seen_at   timestamptz
  last_updated_at timestamptz

source_concepts
  id              uuid primary key
  source_id       uuid references sources
  concept_id      uuid references concepts
  span_start      integer (char offset in source)
  span_end        integer (char offset in source)
  snippet         text (surrounding context)

concept_links
  id                uuid primary key
  from_concept_id   uuid references concepts
  to_concept_id     uuid references concepts
  kind              text ('semantic' | 'co_occurs' | 'contradicts' | 'elaborates')
  weight            real
  note              text

conversations
  id              uuid primary key
  reader_id       uuid references readers
  source_id       uuid references sources (nullable)
  transcript      jsonb (array of {role, text, timestamp})
  summary         text (LLM-generated post-conversation)
  embedding       vector(1536) (of the summary)
  started_at      timestamptz
  ended_at        timestamptz

conversation_concepts
  id              uuid primary key
  conversation_id uuid references conversations
  concept_id      uuid references concepts
  mastery_delta   real (how much this conversation moved the needle)

concept_updates
  id              uuid primary key
  concept_id      uuid references concepts
  trigger_type    text ('source_ingest' | 'conversation' | 'query' | 'lint')
  trigger_id      uuid (references sources or conversations)
  before_body     text
  after_body      text
  rationale       text
  created_at      timestamptz

wiki_log
  id              uuid primary key
  entry_type      text ('ingest' | 'conversation' | 'query' | 'lint' | 'update')
  title           text
  details         text
  created_at      timestamptz
```

### Index and Log (Markdown)

Following the LLM Wiki pattern, two special files are maintained as markdown:

- **index.md** — catalog of all concept pages, organized by cluster/topic, with one-line summaries. The LLM reads this first when answering queries.
- **log.md** — chronological append-only record: `## [2026-04-19] ingest | Kleist Chapter 3`. Parseable with grep.

These are derived views of the database, regenerated on each write operation.

---

## What Carries Over from the Installation

| Component | Status | Notes |
|-----------|--------|-------|
| Supabase + pgvector | **Reuse** | New schema, same infrastructure |
| Hono backend | **Reuse** | New routes for sources, concepts, conversations |
| React/Vite frontend | **Reuse** | New screens; drop kiosk/installation patterns |
| ElevenLabs Conversational AI | **Reuse** | New system prompts calibrated for learning |
| TTS with timestamps (karaoke) | **Reuse** | Core feature — reading a text aloud with highlighting |
| Shared types package | **Reuse** | New types for the new domain |
| OpenAI embeddings | **Reuse** | Same model, applied to concepts + conversation summaries |
| Socratic agent research | **Reuse** | Conversation design patterns carry over directly |
| Printer bridge | **Remove** | No longer needed |
| Face detection | **Remove** | Single user, no wake/sleep |
| Chain mode | **Remove** | Replaced by the wiki's cross-referencing |
| Installation config | **Remove** | Replaced by reader profile |
| Session numbering | **Remove** | No anonymous visitors |

---

## What's New

1. **Source library** — multiple texts, managed over time
2. **Concept extraction pipeline** — LLM identifies "hyperlinks" in a source
3. **Wiki pages** — LLM-maintained concept entries that evolve
4. **Cross-reference graph** — concepts linked by co-occurrence, semantics, contradiction
5. **Reader profile + mastery tracking** — the system knows what you know
6. **Conversation-to-wiki pipeline** — every dialogue enriches the wiki
7. **Query interface** — ask questions against accumulated knowledge
8. **Obsidian compatibility** — wiki as markdown files, browsable in Obsidian graph view
9. **Lint/health-check** — periodic wiki maintenance suggestions

---

## Implementation Sequence

### Phase 1: Foundation

New Supabase schema (readers, sources, concepts, conversations). Shared types. Backend CRUD for sources and concepts. Basic frontend: source list, source viewer (reuse text reader with highlighting). No conversations yet — just ingesting and browsing.

**Gate:** Can add a source, see extracted concepts highlighted in the text, browse concept pages.

### Phase 2: Conversations

ElevenLabs integration with new system prompts. Context assembly (source + concepts + reader profile). Post-conversation extraction pipeline (transcript → concept updates). Mastery score updates.

**Gate:** Can have a voice conversation about a source, see concept pages updated afterward.

### Phase 3: Wiki Intelligence

Semantic search across concepts (wake up the embeddings). Cross-reference graph (concept_links). Query interface ("What do I know about X?"). Index and log generation. Obsidian-compatible markdown export.

**Gate:** Can query the wiki, browse the concept graph, open in Obsidian.

### Phase 4: Polish

Lint pass. Reading progress tracking. Mastery dashboard. Suggested next sources. Conversation history browser. Mobile-friendly UI.

---

## Open Questions

- **Voice vs. text conversations?** The installation was voice-only. For a reading companion, text chat might sometimes be more natural (especially for quick queries). Support both?
- **Multi-language?** The installation supported DE/EN. Keep both, or simplify to one?
- **Source formats?** Start with plain text/markdown. Add PDF, EPUB later? Or rely on Obsidian Web Clipper to convert everything to markdown first?
- **Obsidian-first or web-first?** The wiki could live as files on disk (Obsidian) or in Supabase (web UI). Or both, with sync. Which is primary?
- **How much autonomy in wiki updates?** Should the LLM update concept pages automatically after every conversation, or propose changes for the reader to approve?
- **Naming.** This project needs a name that isn't MeinUngeheuer.
