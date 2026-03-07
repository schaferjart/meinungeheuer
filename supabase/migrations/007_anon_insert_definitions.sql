-- Allow tablet to insert definitions directly via anon key
CREATE POLICY "tablet_insert_definitions"
  ON definitions
  FOR INSERT
  TO anon
  WITH CHECK (true);
