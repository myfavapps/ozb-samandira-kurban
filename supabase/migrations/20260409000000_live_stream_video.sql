-- Expand user role constraint to include canli_yayin
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check;
ALTER TABLE users ADD CONSTRAINT users_role_check
  CHECK (role IN ('admin', 'kesim', 'parcalama', 'canli_yayin'));

-- Add live stream settings (HLS URL is fixed, just need active toggle)
INSERT INTO settings (key, value) VALUES
  ('live_stream_active', 'false')
ON CONFLICT (key) DO NOTHING;
