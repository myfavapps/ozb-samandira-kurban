-- Info messages table (bilgi mesajlari)
CREATE TABLE IF NOT EXISTS info_messages (
  id SERIAL PRIMARY KEY,
  message TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Public read access
ALTER TABLE info_messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public read info_messages" ON info_messages FOR SELECT USING (true);
CREATE POLICY "Service write info_messages" ON info_messages FOR ALL USING (true);
