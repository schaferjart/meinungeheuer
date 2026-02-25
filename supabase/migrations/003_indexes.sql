-- Performance indexes
CREATE INDEX idx_sessions_created     ON sessions(created_at DESC);
CREATE INDEX idx_definitions_term     ON definitions(term);
CREATE INDEX idx_definitions_chain_depth ON definitions(chain_depth);

-- Partial indexes — only index rows that will actually be queried by the filter
CREATE INDEX idx_print_queue_status   ON print_queue(status) WHERE status = 'pending';
CREATE INDEX idx_chain_state_active   ON chain_state(is_active) WHERE is_active = true;

-- NOTE: An ivfflat ANN index on definitions.embedding should be created once
-- the table has more than 100 rows. Run manually after seeding production data:
--
--   CREATE INDEX idx_definitions_embedding
--   ON definitions
--   USING ivfflat (embedding vector_cosine_ops)
--   WITH (lists = 100);
