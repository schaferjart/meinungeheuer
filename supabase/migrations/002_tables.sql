-- Core session tracking. One row per visitor interaction.
CREATE TABLE sessions (
  id                        UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at                TIMESTAMPTZ DEFAULT now(),
  ended_at                  TIMESTAMPTZ,
  mode                      TEXT        NOT NULL CHECK (mode IN ('text_term', 'term_only', 'chain')),
  term                      TEXT        NOT NULL,
  context_text              TEXT,
  parent_session_id         UUID        REFERENCES sessions(id),
  language_detected         TEXT,
  duration_seconds          INTEGER,
  turn_count                INTEGER,
  card_taken                BOOLEAN,
  elevenlabs_conversation_id TEXT,
  audio_url                 TEXT
);

-- Conversation transcript. Multiple rows per session.
CREATE TABLE turns (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id  UUID        REFERENCES sessions(id) ON DELETE CASCADE,
  turn_number INTEGER     NOT NULL,
  role        TEXT        NOT NULL CHECK (role IN ('visitor', 'agent')),
  content     TEXT        NOT NULL,
  language    TEXT,
  created_at  TIMESTAMPTZ DEFAULT now()
);

-- The generated output. One per session.
CREATE TABLE definitions (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id      UUID        REFERENCES sessions(id) UNIQUE,
  term            TEXT        NOT NULL,
  definition_text TEXT        NOT NULL,
  citations       TEXT[],
  language        TEXT        NOT NULL,
  chain_depth     INTEGER     DEFAULT 0,
  created_at      TIMESTAMPTZ DEFAULT now(),
  embedding       VECTOR(1536)
);

-- Print jobs for the printer bridge.
CREATE TABLE print_queue (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id     UUID        REFERENCES sessions(id),
  payload        JSONB       NOT NULL,
  printer_config JSONB,
  status         TEXT        DEFAULT 'pending' CHECK (status IN ('pending', 'printing', 'done', 'error')),
  created_at     TIMESTAMPTZ DEFAULT now(),
  printed_at     TIMESTAMPTZ
);

-- Tracks the active chain for Mode C.
CREATE TABLE chain_state (
  id            UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  definition_id UUID    REFERENCES definitions(id),
  is_active     BOOLEAN DEFAULT true,
  created_at    TIMESTAMPTZ DEFAULT now()
);

-- Operator-configurable settings.
CREATE TABLE installation_config (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  mode           TEXT        NOT NULL DEFAULT 'term_only',
  active_term    TEXT        DEFAULT 'BIRD',
  active_text_id TEXT,
  updated_at     TIMESTAMPTZ DEFAULT now()
);

-- Curated source texts for Mode A.
CREATE TABLE texts (
  id         TEXT        PRIMARY KEY,
  title      TEXT        NOT NULL,
  content_de TEXT,
  content_en TEXT,
  terms      TEXT[]      NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);
