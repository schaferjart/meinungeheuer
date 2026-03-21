-- Create storage bucket for print-ready portrait images.
-- The cloud print-renderer uploads processed images here;
-- the printer-bridge downloads them via public URL.

INSERT INTO storage.buckets (id, name, public)
VALUES ('prints', 'prints', true)
ON CONFLICT (id) DO NOTHING;

-- Public read: printer-bridge downloads images via public URL
CREATE POLICY "prints_public_read"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'prints');

-- Service role upload: print-renderer uploads via service role key
CREATE POLICY "prints_service_upload"
  ON storage.objects FOR INSERT
  TO service_role
  WITH CHECK (bucket_id = 'prints');

-- Service role delete: cleanup old portraits
CREATE POLICY "prints_service_delete"
  ON storage.objects FOR DELETE
  TO service_role
  USING (bucket_id = 'prints');
