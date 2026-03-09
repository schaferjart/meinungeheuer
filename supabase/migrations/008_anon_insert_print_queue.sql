-- Allow tablet to insert print jobs directly via anon key
CREATE POLICY "tablet_insert_print_queue"
  ON print_queue
  FOR INSERT
  TO anon
  WITH CHECK (true);
