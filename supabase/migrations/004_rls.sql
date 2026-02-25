-- ============================================================
-- Row Level Security
-- ============================================================
-- The service role bypasses RLS entirely (Supabase default).
-- The anon role is used by both the tablet and the printer bridge.
-- ============================================================

-- Enable RLS on every table
ALTER TABLE sessions            ENABLE ROW LEVEL SECURITY;
ALTER TABLE turns               ENABLE ROW LEVEL SECURITY;
ALTER TABLE definitions         ENABLE ROW LEVEL SECURITY;
ALTER TABLE print_queue         ENABLE ROW LEVEL SECURITY;
ALTER TABLE chain_state         ENABLE ROW LEVEL SECURITY;
ALTER TABLE installation_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE texts               ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- Tablet policies (anon key)
-- ============================================================

-- Tablet reads source texts for Mode A display
CREATE POLICY "tablet_read_texts"
  ON texts
  FOR SELECT
  TO anon
  USING (true);

-- Tablet reads operator config to know current mode / term
CREATE POLICY "tablet_read_installation_config"
  ON installation_config
  FOR SELECT
  TO anon
  USING (true);

-- Tablet reads chain state to find the active chain definition for Mode C
CREATE POLICY "tablet_read_chain_state"
  ON chain_state
  FOR SELECT
  TO anon
  USING (true);

-- Tablet reads definitions (needed for Mode C: read the chained definition)
CREATE POLICY "tablet_read_definitions"
  ON definitions
  FOR SELECT
  TO anon
  USING (true);

-- Tablet inserts a new session row when a visitor starts
CREATE POLICY "tablet_insert_sessions"
  ON sessions
  FOR INSERT
  TO anon
  WITH CHECK (true);

-- Tablet inserts turn rows during a conversation
CREATE POLICY "tablet_insert_turns"
  ON turns
  FOR INSERT
  TO anon
  WITH CHECK (true);

-- ============================================================
-- Printer bridge policies (anon key)
-- ============================================================

-- Printer bridge reads pending / in-progress jobs
CREATE POLICY "printer_read_print_queue"
  ON print_queue
  FOR SELECT
  TO anon
  USING (status IN ('pending', 'printing'));

-- Printer bridge updates job status (pending→printing→done/error)
CREATE POLICY "printer_update_print_queue"
  ON print_queue
  FOR UPDATE
  TO anon
  USING (status IN ('pending', 'printing'))
  WITH CHECK (status IN ('pending', 'printing', 'done', 'error'));

-- ============================================================
-- Supabase Realtime
-- ============================================================
-- Enable Realtime publication on print_queue so the printer bridge
-- can subscribe to INSERT events where status = 'pending'.
ALTER PUBLICATION supabase_realtime ADD TABLE print_queue;
