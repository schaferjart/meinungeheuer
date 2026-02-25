# MeinUngeheuer — Claude Code Agent Prompts
### One prompt per component. Each is self-contained. Execute in order.

---

## PROMPT 0: PROJECT SCAFFOLD

```
You are building an art installation called "MeinUngeheuer" — a glossary engine
that conducts spoken conversations with visitors and prints personalized definitions.

Create the monorepo structure:

meinungeheuer/
├── apps/
│   ├── tablet/              # React web app (Vite + React + TypeScript)
│   ├── backend/             # Cloud backend (Node.js + TypeScript, Express or Hono)
│   └── printer-bridge/      # Local printer service (Node.js + TypeScript)
├── packages/
│   └── shared/              # Shared types, constants, Supabase client
├── supabase/
│   └── migrations/          # SQL migration files
├── docs/
│   └── PRD.md
├── package.json             # Workspace root (pnpm workspaces)
├── pnpm-workspace.yaml
└── tsconfig.base.json

Initialize each app:
- tablet: Vite + React 18 + TypeScript + Tailwind CSS
- backend: Node.js + TypeScript + Hono (lightweight, fast) + tsx for dev
- printer-bridge: Node.js + TypeScript + tsx for dev
- shared: TypeScript library

Install these dependencies:
- tablet: @11labs/react, @11labs/client, @supabase/supabase-js, @mediapipe/tasks-vision
- backend: hono, @supabase/supabase-js, openai (for embeddings)
- printer-bridge: @supabase/supabase-js, escpos, escpos-usb (or node-thermal-printer)
- shared: @supabase/supabase-js, zod

Create a .env.example with all required keys:
ELEVENLABS_API_KEY=
OPENROUTER_API_KEY=
SUPABASE_URL=
SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
OPENAI_API_KEY=           # For embeddings only

Do NOT implement any features yet. Just the scaffold, configs, and dependencies.
Verify everything compiles with `pnpm build`.
```

---

## PROMPT 1: SUPABASE SCHEMA

```
Set up the Supabase database for MeinUngeheuer.

Create these migration files in supabase/migrations/:

### Migration 001: Enable extensions

Enable pgvector extension for embedding storage.

### Migration 002: Core tables

CREATE TABLE sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ DEFAULT now(),
  ended_at TIMESTAMPTZ,
  mode TEXT NOT NULL CHECK (mode IN ('text_term', 'term_only', 'chain')),
  term TEXT NOT NULL,
  context_text TEXT,
  parent_session_id UUID REFERENCES sessions(id),
  language_detected TEXT,
  duration_seconds INTEGER,
  turn_count INTEGER,
  card_taken BOOLEAN,
  elevenlabs_conversation_id TEXT,
  audio_url TEXT
);

CREATE TABLE turns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID REFERENCES sessions(id) ON DELETE CASCADE,
  turn_number INTEGER NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('visitor', 'agent')),
  content TEXT NOT NULL,
  language TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE definitions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID REFERENCES sessions(id) UNIQUE,
  term TEXT NOT NULL,
  definition_text TEXT NOT NULL,
  citations TEXT[],
  language TEXT NOT NULL,
  chain_depth INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  embedding VECTOR(1536)
);

CREATE TABLE print_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID REFERENCES sessions(id),
  payload JSONB NOT NULL,
  printer_config JSONB,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending','printing','done','error')),
  created_at TIMESTAMPTZ DEFAULT now(),
  printed_at TIMESTAMPTZ
);

CREATE TABLE chain_state (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  definition_id UUID REFERENCES definitions(id),
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE installation_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  mode TEXT NOT NULL DEFAULT 'term_only',
  active_term TEXT DEFAULT 'BIRD',
  active_text_id TEXT,
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE texts (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  content_de TEXT,
  content_en TEXT,
  terms TEXT[] NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

### Migration 003: Indexes

CREATE INDEX idx_sessions_created ON sessions(created_at DESC);
CREATE INDEX idx_definitions_term ON definitions(term);
CREATE INDEX idx_definitions_chain_depth ON definitions(chain_depth);
CREATE INDEX idx_print_queue_status ON print_queue(status) WHERE status = 'pending';
CREATE INDEX idx_chain_state_active ON chain_state(is_active) WHERE is_active = true;

### Migration 004: RLS policies

Enable RLS on all tables.

For the tablet app (anon key): SELECT on texts, installation_config, chain_state,
definitions (for loading chain context). INSERT on sessions, turns.
For the backend (service role): full access to all tables.
For the printer bridge (anon key): SELECT + UPDATE on print_queue.

Enable Supabase Realtime on print_queue table (for printer bridge subscription).

### Migration 005: Seed data

Insert the Kleist text:

INSERT INTO texts (id, title, content_de, content_en, terms) VALUES (
  'kleist_verfertigung',
  'Über die allmähliche Verfertigung der Gedanken beim Reden',
  'Wenn Du etwas wissen willst und es durch Meditation nicht finden kannst, so rathe ich Dir, mein lieber, sinnreicher Freund, mit dem nächsten Bekannten, der dir aufstößt, darüber zu sprechen. Es braucht nicht eben ein scharfdenkender Kopf zu sein, auch meine ich es nicht so, als ob du ihn darum befragen solltest, nein! Vielmehr sollst Du es ihm selber allererst erzählen. Ich sehe Dich zwar große Augen machen, und mir antworten, man habe Dir in früheren Jahren den Rath gegeben, von nichts zu sprechen, als nur von Dingen, die Du bereits verstehst. Damals aber sprachst Du wahrscheinlich mit dem Vorwitz, Andere, – ich will, daß Du aus der verständigen Absicht sprechest: Dich zu belehren, und so könnten, für verschiedene Fälle verschieden, beide Klugheitsregeln vielleicht gut neben einander bestehen. Der Franzose sagt, l''appétit vient en mangeant, und dieser Erfahrungssatz bleibt wahr, wenn man ihn parodirt, und sagt, l''idée vient en parlant.',
  'If you want to know something and cannot find it through meditation, I advise you, my dear, ingenious friend, to speak about it with the nearest acquaintance you encounter. It need not be a sharp-thinking mind, nor do I mean that you should ask them about it, no! Rather, you should tell them about it yourself first. I can see you making big eyes and answering me that in earlier years you were advised to speak of nothing but things you already understand. But at that time you probably spoke with the presumption of instructing others — I want you to speak with the sensible intention of instructing yourself, and so, for different cases, both rules of prudence might well coexist. The Frenchman says, l''appétit vient en mangeant, and this empirical maxim remains true when one parodies it and says, l''idée vient en parlant.',
  ARRAY['VERFERTIGUNG', 'GEDANKE', 'MEDITATION', 'SPRECHEN', 'BELEHREN']
);

INSERT INTO installation_config (mode, active_term, active_text_id) VALUES
  ('term_only', 'BIRD', NULL);

### In shared/src/types.ts:

Generate TypeScript types that mirror this schema exactly using Zod schemas.
Export both the Zod schemas and inferred TypeScript types.
Export a typed Supabase client factory function.
```

---

## PROMPT 2: TEXT READER COMPONENT (Karaoke Highlighting)

```
Build a React component called TextReader that displays a text and reads it aloud
with word-by-word highlighting synchronized to audio playback — like Apple Podcasts
transcript following or karaoke lyrics.

FILE: apps/tablet/src/components/TextReader.tsx

TECHNICAL APPROACH:
Use the ElevenLabs TTS API with timestamps endpoint:
POST https://api.elevenlabs.io/v1/text-to-speech/{voice_id}/with-timestamps

This returns:
{
  "audio_base64": "...",
  "alignment": {
    "characters": ["W","e","n","n"," ","D","u",...],
    "character_start_times_seconds": [0.0, 0.05, 0.1, ...],
    "character_end_times_seconds": [0.05, 0.1, 0.15, ...]
  }
}

IMPLEMENTATION STEPS:

1. PREPROCESSING:
   - Accept props: { text: string; voiceId: string; apiKey: string; language: 'de' | 'en'; onComplete: () => void }
   - On mount (or when triggered), call the ElevenLabs TTS-with-timestamps endpoint
   - Parse the response to extract audio (base64 → Blob → URL) and character-level timestamps
   - Convert character timestamps to WORD timestamps:
     * Split text into words (preserving whitespace positions)
     * For each word, find its start time (first character's start_time) and end time (last character's end_time)
     * Build array: [{ word: string, startTime: number, endTime: number, charIndex: number }]

2. TEXT RENDERING:
   - Render the full text on screen
   - Each word is wrapped in a <span> with a data attribute for its index
   - Typography: large (clamp(1.2rem, 3vw, 1.8rem)), generous line-height (1.8),
     max-width 700px, centered, black background, white text
   - The CURRENTLY SPOKEN word gets class "active":
     * Slightly larger scale (transform: scale(1.05))
     * Brighter white or a subtle highlight color (e.g., warm amber #F5A623)
     * Smooth transition (transition: all 0.15s ease)
   - ALREADY SPOKEN words: slightly dimmer (opacity 0.6)
   - UPCOMING words: full white (opacity 1.0)
   - This creates a "wave" effect moving through the text

3. AUDIO PLAYBACK + SYNC:
   - Create an Audio element from the base64 audio
   - On play: start a requestAnimationFrame loop
   - Each frame: check audio.currentTime against word timestamps
   - Find the word whose startTime <= currentTime < endTime → set as active
   - Update React state (use useRef for current word index to avoid re-renders;
     use a CSS class toggle via direct DOM manipulation for performance)

4. AUTO-SCROLL:
   - As the active word moves down the screen, smoothly scroll to keep it
     vertically centered (or in the top third)
   - Use scrollIntoView({ behavior: 'smooth', block: 'center' }) on the active word span
   - Only scroll when the active word is outside the visible viewport area

5. CONTROLS:
   - "Tap when ready" button appears AFTER the text finishes being read
   - If the user taps the screen DURING reading, pause audio and show
     "Continue reading" / "Skip to conversation" buttons
   - On complete: call onComplete callback

6. LOADING STATE:
   - While TTS-with-timestamps API call is in progress, show a subtle loading
     indicator (pulsing dots, not a spinner)
   - Pre-generate the audio before showing it to the visitor if possible
     (call API when entering TEXT_DISPLAY state, show text immediately,
     start audio when ready)

7. LONG TEXT HANDLING:
   - For texts longer than ~500 words, split into chunks of ~200 words
   - Call TTS API for each chunk sequentially
   - Stitch audio blobs together and merge timestamp arrays (offset subsequent
     chunks by cumulative duration)
   - Display full text at once, but audio plays chunk by chunk seamlessly

EDGE CASES:
- If TTS API fails: display text without audio, show "Read at your own pace"
  message, and keep the "Tap when ready" button visible immediately
- If text contains special characters (German umlauts, quotes): ensure they
  render correctly and timestamps align
- If visitor leaves during reading (face detection SLEEP): pause audio

PERFORMANCE:
- Do NOT re-render the entire text on every frame
- Use refs and direct DOM class manipulation for the active word highlight
- requestAnimationFrame for sync, not setInterval
- Memoize the word-timestamp array

STYLING (Tailwind + custom CSS):
- Container: min-h-screen bg-black flex items-center justify-center p-8
- Text: text-white font-serif leading-relaxed tracking-wide
- Active word: text-amber-300 scale-105 transition-all duration-150
- Spoken words: opacity-60 transition-opacity duration-300
- Unspoken words: opacity-100

EXPORTS:
- TextReader component
- useTextToSpeechWithTimestamps hook (reusable)

Write comprehensive tests for the timestamp-to-word conversion logic.
```

---

## PROMPT 3: FRONTEND STATE MACHINE + UI SHELL

```
Build the main tablet application UI with a state machine that controls
the entire installation flow.

FILE: apps/tablet/src/App.tsx and related components

STATE MACHINE:
Use a simple useReducer-based state machine (no external library needed).

States and transitions:

SLEEP
  → WELCOME          (on: face detected OR screen tap)

WELCOME
  → TEXT_DISPLAY      (on: 3s timer, if mode is 'text_term' or 'chain')
  → TERM_PROMPT       (on: 3s timer, if mode is 'term_only')

TEXT_DISPLAY
  → TERM_PROMPT       (on: user taps "Ready" button)

TERM_PROMPT
  → CONVERSATION      (on: 2s timer, auto-start ElevenLabs conversation)

CONVERSATION
  → SYNTHESIZING      (on: ElevenLabs agent calls save_definition tool / conversation ends)

SYNTHESIZING
  → DEFINITION        (on: definition received from backend webhook confirmation)

DEFINITION
  → PRINTING          (on: 10s timer)

PRINTING
  → FAREWELL          (on: print_queue status changes to 'done', or 30s timeout)

FAREWELL
  → SLEEP             (on: 15s timer OR face detection lost)

State context object:
{
  state: StateName,
  mode: 'text_term' | 'term_only' | 'chain',
  term: string,
  contextText: string | null,         // The text to display (Mode A/C)
  parentSessionId: string | null,     // Mode C: previous session
  sessionId: string | null,
  definition: Definition | null,
  conversationId: string | null,
  language: 'de' | 'en' | null,
}

SCREEN COMPONENTS:

1. SleepScreen
   - Full black screen with a subtle CSS animation: a single dot that slowly
     pulses (opacity 0.2 → 0.5, 4s cycle). Nothing else.
   - On tap or face detection: dispatch WAKE

2. WelcomeScreen
   - Black background
   - Text fades in: "Nähern Sie sich." (large, centered, white, serif font)
   - After 3s: auto-transition to next state
   - If installation language preference is known, show in that language;
     otherwise default to German

3. TextDisplayScreen
   - Uses the TextReader component from PROMPT 2
   - Loads the text from Supabase (texts table for Mode A, or latest
     definition from chain_state for Mode C)
   - TextReader handles audio playback + word highlighting
   - On TextReader complete: show "Bereit? / Ready?" button (fade in)
   - On button tap: dispatch READY → transition to TERM_PROMPT

4. TermPromptScreen
   - Term appears large, centered, bold, caps: e.g., "BIRD"
   - Below: "Was bedeutet das für Sie? / What does this mean to you?"
   - This screen is visible for 2 seconds, then auto-transitions
   - The ElevenLabs conversation starts automatically in the next state

5. ConversationScreen
   - THIS IS THE CORE INTERACTION SCREEN
   - Top area: the term stays visible (smaller, top-left corner)
   - Center area: conversation transcript
     * Agent messages: white, large, appear word-by-word (typewriter effect,
       synced to TTS audio if possible; otherwise just animated)
     * Visitor messages: gray (#666), smaller, appear as real-time STT transcript
   - Bottom area: visual mic indicator
     * When visitor is speaking: animated waveform or pulsing circle (green)
     * When AI is speaking: static or subtle animation (amber)
     * When processing: three dots pulsing
   - The conversation is handled entirely by ElevenLabs SDK
   - When the agent calls save_definition tool → the frontend receives the
     conversation_ended event → dispatch SYNTHESIZE

6. SynthesizingScreen
   - "Einen Moment..." / "One moment..." (language matches conversation)
   - Subtle animation (three dots or a line that draws itself)
   - Backend processes the definition → frontend polls or listens for completion
   - On definition ready: dispatch DEFINITION_READY

7. DefinitionScreen
   - The generated definition displayed in the same typography as the printed card
   - Term: large, bold, caps
   - Definition text: serif, 1.4rem, warm white
   - Citations: italic, smaller, gray
   - Fade in animation (0.5s)
   - After 10s: auto-transition to PRINTING

8. PrintingScreen
   - "Ihr Beitrag wird gedruckt." / "Your contribution is printing."
   - Small animation (a line drawing from left to right, like a receipt printing)
   - Listen to Supabase Realtime for print_queue status update
   - On 'done': dispatch PRINT_DONE → FAREWELL
   - Timeout 30s: transition anyway (printer might have issues)

9. FarewellScreen
   - "Danke." / "Thank you." (large, centered, fade in)
   - Below (smaller, after 3s fade in): "Nehmen Sie Ihren Beitrag mit — oder lassen Sie ihn hier."
     / "Take your contribution — or leave it here."
   - After 15s OR face detection lost: dispatch TIMEOUT → SLEEP

GLOBAL UI RULES:
- All transitions use CSS fade (opacity 0→1, 0.5s ease)
- Background always black (#000000)
- Text always white or near-white
- Font: system serif for body text (Georgia, 'Times New Roman', serif)
- Font: system sans for UI elements (system-ui, sans-serif)
- No scrollbars visible (overflow: hidden on body, custom scroll in TextReader only)
- No browser chrome: the app should be run in fullscreen/kiosk mode
- Responsive: works on any tablet size (10" to 13"), use viewport units

CONFIGURATION LOADING:
On app start:
1. Fetch installation_config from Supabase → get current mode, term, text_id
2. If mode is 'chain': fetch latest active chain_state → get the previous
   definition → set as contextText
3. If mode is 'text_term': fetch the text from texts table by active_text_id
4. Store in state context

ENVIRONMENT VARIABLES (from .env):
VITE_SUPABASE_URL=
VITE_SUPABASE_ANON_KEY=
VITE_ELEVENLABS_API_KEY=
VITE_ELEVENLABS_AGENT_ID=
VITE_ELEVENLABS_VOICE_ID=

NO routing library needed. This is a single-screen app controlled by state machine.
```

---

## PROMPT 4: ELEVENLABS CONVERSATION INTEGRATION

```
Integrate the ElevenLabs Conversational AI SDK into the ConversationScreen component.

FILE: apps/tablet/src/components/ConversationScreen.tsx
FILE: apps/tablet/src/hooks/useConversation.ts

OVERVIEW:
The ElevenLabs Conversational AI SDK handles the entire voice loop:
STT (visitor speech → text) → LLM (generates response) → TTS (speaks response).
The frontend connects via WebSocket using the @11labs/react SDK.

IMPLEMENTATION:

1. HOOK: useConversation.ts
   - Use the @11labs/react SDK's useConversation hook
   - On mount: call startSession with:
     * agentId: from env
     * overrides: {
         agent: {
           prompt: {
             prompt: systemPrompt (constructed from mode, term, contextText)
           },
           first_message: constructFirstMessage(term, language)
         }
       }
   - The systemPrompt is constructed dynamically based on:
     * mode ('text_term' | 'term_only' | 'chain')
     * term (e.g., "BIRD")
     * contextText (the text the visitor just read, for Mode A/C)
   - See PROMPT 4A below for the exact system prompt templates

   - Event handlers:
     * onConnect: log, update UI state to 'connected'
     * onDisconnect: log, check if definition was saved
     * onMessage: receive agent/user transcript messages
       - Append to conversation transcript array
       - If message contains tool_call for save_definition:
         → Extract definition payload
         → Call backend API to save definition
         → Dispatch SYNTHESIZE to state machine
     * onError: log, show error state, attempt reconnect once
     * onModeChange: track if agent is speaking or listening
       → Update mic indicator UI

   - Expose:
     * status: 'connecting' | 'connected' | 'disconnected' | 'error'
     * isSpeaking: boolean (agent is speaking)
     * transcript: Array<{role: 'agent'|'visitor', content: string, timestamp: Date}>
     * definition: Definition | null (set when agent calls save_definition)

2. SYSTEM PROMPT CONSTRUCTION:
   Create a function buildSystemPrompt(mode, term, contextText, language):

   For mode 'term_only':
   ```
   You are an interviewer in an art installation called "MeinUngeheuer."
   You will explore the concept: {term}

   YOUR GOAL is to understand how THIS PERSON thinks about {term}.
   Not the textbook definition. Not what they think you want to hear.
   Their personal understanding — their metaphors, examples, contradictions.

   RULES:
   1. Ask ONE question at a time. 1-2 sentences max.
   2. Match the visitor's language. If they switch, you switch.
   3. Never lecture. Never define the term yourself. Never correct them.
   4. Surface-level answer? Push deeper: ask for an example, a memory.
   5. Something original? Acknowledge briefly and dig into that thread.
   6. "I don't know" → "What comes to mind first?" or "What does the word sound like to you?"
   7. They ask you to explain? Brief note, then: "But what matters is how YOU think about it."

   STOP WHEN:
   - They've expressed a genuinely personal perspective
   - You've found a contradiction or unexpected connection
   - They're repeating themselves or seem done
   - 5-7 exchanges have passed
   - They ask to end

   WHEN STOPPING:
   Call the save_definition tool with your synthesis.
   The definition should sound like THEM, not a dictionary.
   Preserve their metaphors. Make it memorable.

   TONE: Warm, curious, precise. Like the best dinner party conversation.
   ```

   For mode 'text_term':
   Same as above but prepend:
   ```
   A visitor has just read the following text:
   ---
   {contextText}
   ---
   The concept you will explore is: {term}
   This concept appeared in the text they just read.
   ```

   For mode 'chain':
   Same as text_term but replace the text introduction with:
   ```
   The following text was written by a previous visitor to this installation.
   It represents how they think about a concept:
   ---
   {contextText}
   ---
   Pick ONE concept from this text that is worth exploring with the current visitor.
   State the concept clearly, then begin your conversation about it.
   ```

3. SAVE_DEFINITION TOOL:
   The ElevenLabs agent is configured with a custom tool called save_definition.
   This tool is defined in the ElevenLabs dashboard with webhook URL pointing
   to the backend. When the agent calls this tool, ElevenLabs sends a webhook
   to the backend with the tool arguments.

   However, the frontend also needs to know when the conversation is "done."
   Listen for the conversation end event from the SDK, then check if a
   definition was received. If the conversation ends without a definition
   (visitor left, timeout), create a partial session record.

4. TRANSCRIPT UI:
   - Show conversation messages in a vertically scrolling container
   - Agent messages: appear with typewriter animation (CSS @keyframes,
     reveal characters over 50ms intervals)
   - Visitor messages: appear in real-time as STT processes them
   - Auto-scroll to latest message
   - Messages alternate sides (agent left-aligned, visitor right-aligned)
   - Between messages: brief "..." thinking indicator when agent is processing

5. MIC INDICATOR:
   - Fixed at bottom center of screen
   - When visitor is speaking: green pulsing circle with audio waveform bars
   - When agent is speaking: amber static circle
   - When processing: three dots animation
   - Use the isSpeaking status from the SDK to toggle

6. FIRST MESSAGE:
   The agent's first message should be contextual:
   - Mode B: "Was ist für dich [TERM]?" / "What is [TERM] to you?"
   - Mode A: "Du hast gerade einen Text über [topic] gelesen. Was denkst du über [TERM]?"
   - Mode C: "Jemand vor dir hat geschrieben: '[first line of previous def]...' — was denkst du darüber?"

   This is configured in the agent overrides when starting the session.

CRITICAL: The @11labs/react SDK manages the WebSocket connection, audio capture,
and playback automatically. You do NOT need to manually handle Web Audio API,
microphone permissions, or audio playback. The SDK does all of this.

Read the ElevenLabs React SDK docs carefully before implementing:
https://elevenlabs.io/docs/conversational-ai/guides/conversational-ai-sdk/react
```

---

## PROMPT 5: CLOUD BACKEND

```
Build the cloud backend that receives webhooks from ElevenLabs, saves data
to Supabase, manages chain state, generates embeddings, and serves the
printer queue.

FILE: apps/backend/src/index.ts (main server)
FILE: apps/backend/src/routes/webhook.ts
FILE: apps/backend/src/routes/session.ts
FILE: apps/backend/src/routes/config.ts
FILE: apps/backend/src/services/embeddings.ts
FILE: apps/backend/src/services/chain.ts

FRAMEWORK: Hono (lightweight, fast, TypeScript-first)
DEPLOY TO: Vercel (as edge function) or Railway (as Node.js service)

ENDPOINTS:

### POST /webhook/definition
Called by ElevenLabs when the agent invokes the save_definition tool.

Request body (from ElevenLabs tool webhook):
{
  "tool_call_id": "...",
  "tool_name": "save_definition",
  "parameters": {
    "term": "BIRD",
    "definition_text": "A bird is...",
    "citations": ["...", "..."],
    "language": "en"
  },
  "conversation_id": "..."
}

Actions:
1. Find or create the session record by elevenlabs_conversation_id
2. Insert the definition into the definitions table
3. Insert a print job into print_queue with the definition payload
4. If mode is 'chain': update chain_state (deactivate old, activate new)
5. Trigger async embedding generation (do not block the response)
6. Return 200 with { success: true, session_id, definition_id }

### POST /webhook/conversation-data
Called by ElevenLabs post-conversation webhook (configure in ElevenLabs dashboard).
Contains the full conversation transcript.

Request body:
{
  "conversation_id": "...",
  "transcript": [
    { "role": "agent", "message": "..." },
    { "role": "user", "message": "..." },
    ...
  ],
  "metadata": { "duration_seconds": 180 }
}

Actions:
1. Find session by elevenlabs_conversation_id
2. Insert all turns into the turns table
3. Update session with duration_seconds and turn_count
4. If audio_url is available (ElevenLabs stores recordings), save it

### POST /api/session/start
Called by the tablet frontend when a new session begins.

Request body:
{
  "mode": "term_only" | "text_term" | "chain",
  "term": "BIRD",
  "context_text": "..." | null,
  "parent_session_id": "..." | null,
  "elevenlabs_conversation_id": "..."
}

Actions:
1. Create session record in Supabase
2. Return { session_id }

### GET /api/config
Called by the tablet on startup to get current installation config.

Returns:
{
  "mode": "chain",
  "term": "BIRD",
  "text": { "id": "kleist_verfertigung", "content_de": "...", "content_en": "..." } | null,
  "chain_context": {
    "definition_text": "A bird is...",
    "term": "BIRD",
    "session_id": "...",
    "chain_depth": 5
  } | null
}

Actions:
1. Read installation_config
2. If mode is text_term: fetch the text
3. If mode is chain: fetch the latest active chain_state → join with definitions
4. Return assembled config

### POST /api/config/update
Called by an admin interface to change mode, term, or text.

Request body: { mode?, term?, active_text_id? }
Actions: Update installation_config

### GET /api/definitions
Returns all definitions, optionally filtered by term.
Query params: ?term=BIRD&limit=50&offset=0
Used for admin dashboard / post-exhibition review.

### GET /api/chain
Returns the full chain for Mode C visualization.
Returns: Array of definitions with chain_depth, ordered by chain_depth ascending.
Include parent_session links for graph visualization.

EMBEDDING SERVICE (services/embeddings.ts):
- After a definition is saved, generate an embedding
- Use OpenAI text-embedding-3-small (1536 dimensions)
- Store in the embedding column of the definitions table (pgvector)
- This is async — fire and forget, do not block the webhook response
- Handle errors gracefully (log, do not crash)

CHAIN SERVICE (services/chain.ts):
- getActiveChainContext(): Fetch the latest active chain_state + definition
- advanceChain(definitionId): Deactivate all current chain_state entries,
  create new chain_state entry pointing to the new definition
- getChainHistory(): Fetch all definitions in current chain, ordered by depth
- resetChain(): Deactivate all chain_state entries (for operator reset)

SECURITY:
- Webhook endpoints: verify ElevenLabs webhook signature if available,
  otherwise use a shared secret in query param (?secret=...)
- API endpoints: no auth needed for tablet (uses Supabase anon key),
  admin endpoints protected by a simple bearer token from env

ERROR HANDLING:
- All endpoints return proper HTTP status codes
- Log all errors with context (conversation_id, session_id)
- Never crash on bad input — return 400 with description
```

---

## PROMPT 6: PRINTER BRIDGE

```
Build the local printer bridge service that runs on the same network as the
thermal printer, listens for print jobs via Supabase Realtime, and sends
ESC/POS commands to the printer.

FILE: apps/printer-bridge/src/index.ts
FILE: apps/printer-bridge/src/printer.ts
FILE: apps/printer-bridge/src/layout.ts
FILE: apps/printer-bridge/src/config.ts

THIS SERVICE RUNS LOCALLY (on a Raspberry Pi, the tablet itself, or a laptop).
It is the only component that talks directly to the physical printer.

### config.ts — Printer Configuration

interface PrinterConfig {
  connection: 'usb' | 'bluetooth' | 'network';
  // USB:
  vendorId?: number;
  productId?: number;
  // Network:
  host?: string;
  port?: number;
  // Bluetooth:
  address?: string;
  // Layout:
  maxWidthChars: number;       // e.g., 48 for 80mm, 32 for 58mm
  maxWidthMm: number;          // e.g., 72 for 80mm, 48 for 58mm
  charset: string;             // 'UTF-8' or printer-specific codepage
  autoCut: boolean;
}

Load config from .env or a local config.json file.

### printer.ts — Printer Abstraction

Use the `escpos` npm package (or `node-thermal-printer` as fallback).

Functions:
- connect(): Establish connection to printer, verify it's online
- printCard(definition: Definition, config: PrinterConfig): Format and print
- disconnect(): Clean up
- getStatus(): Returns { connected: boolean, paperLow?: boolean }
- testPrint(): Print a test card with sample data

### layout.ts — Card Layout Engine

Takes a Definition object and PrinterConfig, produces ESC/POS commands.

The layout adapts to maxWidthChars. All spacing calculated dynamically.

CARD LAYOUT:

Line 1: Empty line (spacing)
Line 2: "M E I N U N G E H E U E R" (centered, spaced out, normal weight)
Line 3: Empty line
Line 4: Dashed divider: "─ ─ ─ ─ ─ ─ ─ ─ ─" (centered, fits maxWidthChars)
Line 5: Empty line
Line 6: TERM in bold, large (double-height if printer supports), left-aligned
Line 7: Empty line
Lines 8-N: Definition text, word-wrapped to maxWidthChars, normal size
Line N+1: Empty line
Line N+2: Dashed divider
Line N+3: Empty line
Lines N+4-M: Citations, each prefixed with „ and suffixed with "
            Italic if printer supports, otherwise normal
            Word-wrapped to maxWidthChars
Line M+1: Empty line
Line M+2: Dashed divider
Line M+3: Empty line
Line M+4: Timestamp: "DD.MM.YYYY — HH:MM" (left-aligned)
Line M+5: Session number: "#0047" (left-aligned)
Line M+6: Chain reference (Mode C only): "↳ from #0046 \"FLIGHT\"" (left-aligned)
Line M+7: Empty line
Line M+8: Paper cut

WORD WRAPPING:
- Implement proper word-wrap that respects maxWidthChars
- Never break mid-word
- Handle German compound words (can be very long) — break at hyphens if needed
- Handle UTF-8: ä, ö, ü, ß, „, " must print correctly
  If printer doesn't support UTF-8 natively, implement transliteration
  fallback (ä→ae, ö→oe, ü→ue, ß→ss)

### index.ts — Main Service

1. ON STARTUP:
   - Load config
   - Connect to printer (retry 3 times, 5s between attempts)
   - Connect to Supabase Realtime, subscribe to print_queue table:
     * Filter: status = 'pending'
     * On INSERT: process print job

2. ON NEW PRINT JOB:
   - Update status to 'printing' (claim the job)
   - Extract definition from payload
   - Call layout.formatCard() to generate ESC/POS commands
   - Send to printer
   - On success: update status to 'done', set printed_at
   - On error: update status to 'error', log error details
   - If printer disconnected: attempt reconnect, retry once

3. HEARTBEAT:
   - Every 30 seconds: check printer connection
   - If disconnected: attempt reconnect
   - Log status to console

4. GRACEFUL SHUTDOWN:
   - On SIGINT/SIGTERM: disconnect printer, close Supabase connection

5. RESILIENCE:
   - If Supabase connection drops: auto-reconnect (built into Supabase client)
   - If printer jams: mark job as 'error', continue listening for next jobs
   - Never crash the process — catch all errors, log, continue

ENVIRONMENT VARIABLES:
SUPABASE_URL=
SUPABASE_ANON_KEY=
PRINTER_CONNECTION=usb     # or bluetooth, network
PRINTER_VENDOR_ID=         # for USB
PRINTER_PRODUCT_ID=        # for USB
PRINTER_MAX_WIDTH_CHARS=48
PRINTER_MAX_WIDTH_MM=72
PRINTER_CHARSET=UTF-8
PRINTER_AUTO_CUT=true

TESTING:
- Include a CLI command: `pnpm run test-print` that prints a sample card
  with hardcoded test data (no Supabase needed)
- Include a CLI command: `pnpm run listen` that starts the Realtime listener
```

---

## PROMPT 7: FACE DETECTION (Wake/Sleep)

```
Build a face detection module that uses the tablet's front-facing camera
to detect when a visitor is present (WAKE) and when they've left (SLEEP).

FILE: apps/tablet/src/hooks/useFaceDetection.ts
FILE: apps/tablet/src/components/CameraDetector.tsx

USE: MediaPipe Face Detection (runs entirely in-browser, no server calls).
Package: @mediapipe/tasks-vision

IMPLEMENTATION:

1. useFaceDetection hook:
   - On mount: initialize MediaPipe FaceDetector with:
     * Model: 'short_range' (optimized for faces within 2m)
     * Running mode: 'VIDEO'
     * Min detection confidence: 0.5
   - Request camera access (navigator.mediaDevices.getUserMedia)
     * Use front-facing camera (facingMode: 'user')
     * Low resolution is fine (320x240) — we only need presence, not recognition
   - Start a detection loop (requestAnimationFrame or setInterval 500ms):
     * Feed video frame to FaceDetector
     * If face(s) detected: increment presence counter
     * If no face detected: increment absence counter

2. DEBOUNCING (critical to avoid flicker):
   - WAKE: Require face detected for 3 consecutive seconds (6 frames at 2fps)
     before emitting WAKE event
   - SLEEP: Require no face for 30 consecutive seconds before emitting SLEEP
   - Reset counters on state change

3. INTERFACE:
   - Returns: {
       isPresent: boolean,        // true if face is currently detected
       isAwake: boolean,          // true after 3s of presence (debounced)
       isSleeping: boolean,       // true after 30s of absence (debounced)
       error: string | null,      // camera permission denied, etc.
       cameraReady: boolean,
     }
   - Callbacks: onWake, onSleep (passed as props)

4. CameraDetector component:
   - Renders a hidden <video> element (not visible to visitor)
   - Initializes useFaceDetection
   - Communicates wake/sleep to parent via callbacks
   - Shows nothing on screen (invisible component)

5. FALLBACK:
   - If camera permission is denied: log warning, fall back to tap-to-start
   - If MediaPipe fails to load: same fallback
   - The app must work without face detection (manual tap mode)

6. PRIVACY:
   - No video is recorded or stored
   - No facial recognition (only detection: "is there a face?" yes/no)
   - Camera feed is never sent to any server
   - Video element is hidden (display: none)

7. PERFORMANCE:
   - Run detection at 2fps max (every 500ms) — saves battery and CPU
   - Use low resolution camera feed
   - Dispose FaceDetector when component unmounts

INTEGRATION WITH STATE MACHINE:
The CameraDetector is mounted at the App level (always running).
It dispatches WAKE/SLEEP events to the state machine reducer.
During SLEEP state: only face detection is active.
During active states: face detection continues in background for SLEEP detection.
```

---

## PROMPT 8: ELEVENLABS AGENT SETUP GUIDE

```
This is NOT a code prompt. This is a step-by-step configuration guide for
setting up the ElevenLabs Conversational AI agent in the ElevenLabs dashboard.

The developer should follow these steps manually in https://elevenlabs.io:

### Step 1: Create Agent
- Go to Conversational AI → Create Agent
- Name: "MeinUngeheuer"
- Mode: Conversational

### Step 2: Configure LLM
- Select "Custom LLM"
- Server URL: https://openrouter.ai/api/v1
- Model ID: google/gemini-2.0-flash-001
  (or test with: openai/gpt-4o-mini, anthropic/claude-3.5-sonnet)
- Add Secret:
  * Type: "Custom LLM"
  * Name: "openrouter_key"
  * Value: [your OpenRouter API key]
- Temperature: 0.7
- Max tokens: 300 (keep responses short for conversation)

### Step 3: System Prompt
Paste the default system prompt for Mode B (term_only):
[Copy from PROMPT 4 above - the full system prompt]

NOTE: The system prompt will be overridden dynamically at session start
via the SDK's conversation overrides. The dashboard prompt is the fallback.

### Step 4: First Message
Set to: "What does the word BIRD mean to you?"
(This will also be overridden dynamically)

### Step 5: Configure Voice
- Browse voice library → find a warm, neutral voice
- Test with both German and English text
- Good candidates: "Rachel", "Antoni", or any voice labeled "warm" + "multilingual"
- Note the voice_id for the .env file

### Step 6: Enable System Tools
- Enable: language_detection
- Enable: end_conversation

### Step 7: Create Custom Tool: save_definition
- Name: save_definition
- Description: "Call this tool when you have finished the conversation and
  synthesized the visitor's definition. This saves the definition and triggers
  printing."
- Parameters:
  * term (string, required): "The concept that was explored"
  * definition_text (string, required): "The 2-3 sentence definition synthesized
    from the visitor's words"
  * citations (array of strings, required): "2-3 direct quotes from the visitor
    that were most revealing"
  * language (string, required): "The language of the definition: 'de' or 'en'"
- Type: Webhook
- URL: https://[your-backend-url]/webhook/definition
- Method: POST
- Headers: Authorization: Bearer [your-secret]

### Step 8: Advanced Settings
- Turn detection: Default (automatic VAD)
- Max conversation duration: 600 seconds (10 min)
- Idle timeout: 60 seconds
- Enable conversation recording (for debug phase)

### Step 9: Test
- Use the built-in test interface
- Try a conversation about "BIRD" in English
- Try switching to German mid-conversation
- Verify that save_definition is called when the agent decides to stop
- Check that the webhook reaches your backend

### Step 10: Note the Agent ID
- Copy the Agent ID from the dashboard
- Add to .env as VITE_ELEVENLABS_AGENT_ID

### Step 11: Backup Configuration
- Export the agent configuration as JSON
- Save in docs/elevenlabs-agent-config.json for version control
```

---

## PROMPT 9: ADMIN DASHBOARD (Optional, Low Priority)

```
Build a simple admin page for Jonas to monitor and control the installation.

FILE: apps/tablet/src/pages/Admin.tsx
ROUTE: Access via URL parameter: ?admin=true (or a secret URL like /admin/[secret])

This is NOT shown to visitors. It's a control panel for the operator.

FEATURES:

1. CURRENT STATUS
   - Current mode (text_term / term_only / chain)
   - Current term
   - Session count today
   - Current chain depth (Mode C)
   - Printer status (connected/disconnected, last print time)
   - Last definition generated (preview)

2. MODE SWITCH
   - Three buttons: Mode A (Text) | Mode B (Term) | Mode C (Chain)
   - Term input field (change active term)
   - Text selector (dropdown of available texts)
   - "Apply" button → calls POST /api/config/update

3. CHAIN CONTROLS (Mode C)
   - "Reset Chain" button → starts fresh
   - Current chain visualization: list of definitions in order
   - Chain depth counter

4. DEFINITION BROWSER
   - Scrollable list of all generated definitions
   - Filter by term, date, language
   - Each shows: term, definition, citations, timestamp, session#
   - Click to expand: full conversation transcript

5. PRINT TEST
   - "Print Test Card" button → inserts a test job into print_queue

STYLING:
- Can be utilitarian. White background, simple layout.
- This is a tool, not art.
- Use basic Tailwind components.
```

---

## PROMPT 10: DEPLOYMENT + KIOSK MODE

```
Create deployment configurations and a kiosk setup script.

### Backend Deployment (Vercel or Railway)

FILE: apps/backend/vercel.json (if Vercel)
FILE: apps/backend/Dockerfile (if Railway)
FILE: apps/backend/railway.toml (if Railway)

Hono on Vercel:
- Use @hono/node-server or Vercel adapter
- All routes under /api/* and /webhook/*
- Environment variables set in Vercel dashboard

### Tablet Deployment

FILE: apps/tablet/scripts/deploy.sh

The tablet web app is built as a static site (Vite build) and served via:
- Option A: Hosted on Vercel/Netlify (accessed via URL on tablet browser)
- Option B: Served locally from the backend (add static file serving to Hono)

Recommended: Option A (simplest — just open URL on tablet).

### Kiosk Mode Setup Script

FILE: scripts/kiosk-setup.sh

For iPad:
- Instructions to enable Guided Access (Settings → Accessibility → Guided Access)
- Open Safari → navigate to tablet app URL → enable Guided Access
- This locks the iPad to the web app, disables home button

For Android tablet:
- Instructions to enable screen pinning
- Or use a kiosk app (like "Fully Kiosk Browser"):
  * Set start URL to tablet app
  * Enable fullscreen
  * Disable status bar, navigation bar
  * Enable auto-restart on crash
  * Enable motion detection for wake (can replace MediaPipe)

### Printer Bridge as systemd Service (Raspberry Pi)

FILE: scripts/printer-bridge.service

Create a systemd service file so the printer bridge starts on boot:

[Unit]
Description=MeinUngeheuer Printer Bridge
After=network.target

[Service]
Type=simple
User=pi
WorkingDirectory=/home/pi/meinungeheuer/apps/printer-bridge
ExecStart=/usr/bin/node dist/index.js
Restart=always
RestartSec=10
Environment=NODE_ENV=production

[Install]
WantedBy=multi-user.target

Include setup instructions:
1. Install Node.js on Pi
2. Clone repo, pnpm install, pnpm build
3. Copy .env file with Supabase credentials
4. Install and enable systemd service
5. Connect printer via USB
6. Test with: node dist/index.js --test-print

### Environment Variables Checklist

FILE: docs/ENV_CHECKLIST.md

A complete list of every environment variable needed, where it goes,
and how to obtain it:

| Variable | Where | How to get it |
|----------|-------|---------------|
| ELEVENLABS_API_KEY | tablet .env, backend .env | elevenlabs.io → Profile → API Keys |
| ELEVENLABS_AGENT_ID | tablet .env | ElevenLabs dashboard → Agent → ID |
| ELEVENLABS_VOICE_ID | tablet .env | ElevenLabs dashboard → Voice → ID |
| OPENROUTER_API_KEY | ElevenLabs dashboard (as secret) | openrouter.ai → Keys |
| SUPABASE_URL | all .env files | Supabase dashboard → Settings → API |
| SUPABASE_ANON_KEY | tablet .env, printer-bridge .env | Supabase dashboard → Settings → API |
| SUPABASE_SERVICE_ROLE_KEY | backend .env only | Supabase dashboard → Settings → API |
| OPENAI_API_KEY | backend .env | platform.openai.com → API Keys |
| BACKEND_URL | tablet .env | Your deployed backend URL |
| WEBHOOK_SECRET | backend .env, ElevenLabs tool config | Generate: openssl rand -hex 32 |
```

---

## EXECUTION ORDER

Phase 1 (Foundation):
1. PROMPT 0: Project Scaffold
2. PROMPT 1: Supabase Schema
3. PROMPT 8: ElevenLabs Agent Setup (manual, in parallel)

Phase 2 (Core Loop):
4. PROMPT 3: Frontend State Machine (with placeholder screens)
5. PROMPT 4: ElevenLabs Conversation Integration
6. PROMPT 5: Cloud Backend
→ TEST: Full conversation loop working (no text display, no printer, no camera)

Phase 3 (Text Reader):
7. PROMPT 2: Text Reader Component (karaoke highlighting)
→ TEST: Mode A working with Kleist text + highlighting

Phase 4 (Physical Output):
8. PROMPT 6: Printer Bridge
→ TEST: Full loop through to printed card

Phase 5 (Polish):
9. PROMPT 7: Face Detection
10. PROMPT 9: Admin Dashboard
11. PROMPT 10: Deployment + Kiosk

---

*Generated from MeinUngeheuer PRD v0.3 — February 2026*
