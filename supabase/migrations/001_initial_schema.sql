-- Samandira Kurban - Initial Database Schema

-- Slaughter status table
CREATE TABLE IF NOT EXISTS slaughter_status (
    id SERIAL PRIMARY KEY,
    current_number INTEGER,
    status VARCHAR(20) CHECK (status IN ('waiting', 'in_progress', 'completed', 'cancelled')),
    announcement TEXT,
    last_updated TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Videos table
CREATE TABLE IF NOT EXISTS videos (
    id SERIAL PRIMARY KEY,
    kurban_number INTEGER UNIQUE NOT NULL,
    cloudinary_url TEXT NOT NULL,
    uploaded_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Announcements table
CREATE TABLE IF NOT EXISTS announcements (
    id SERIAL PRIMARY KEY,
    message TEXT NOT NULL,
    type VARCHAR(20) DEFAULT 'info' CHECK (type IN ('info', 'warning', 'success')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Insert initial data
INSERT INTO slaughter_status (current_number, status, announcement) 
VALUES (1, 'waiting', 'Kurban Bayramı hazırlıkları devam ediyor...')
ON CONFLICT DO NOTHING;

-- Enable Row Level Security
ALTER TABLE slaughter_status ENABLE ROW LEVEL SECURITY;
ALTER TABLE videos ENABLE ROW LEVEL SECURITY;
ALTER TABLE announcements ENABLE ROW LEVEL SECURITY;

-- Public read policies
CREATE POLICY "Public read slaughter_status" 
    ON slaughter_status FOR SELECT 
    USING (true);

CREATE POLICY "Public read videos" 
    ON videos FOR SELECT 
    USING (true);

CREATE POLICY "Public read announcements" 
    ON announcements FOR SELECT 
    USING (true);

-- Service role write policies (for Edge Functions)
CREATE POLICY "Service role write slaughter_status" 
    ON slaughter_status FOR ALL 
    USING (auth.role() = 'service_role');

CREATE POLICY "Service role write videos" 
    ON videos FOR ALL 
    USING (auth.role() = 'service_role');

CREATE POLICY "Service role write announcements" 
    ON announcements FOR ALL 
    USING (auth.role() = 'service_role');

-- Enable realtime
ALTER PUBLICATION supabase_realtime ADD TABLE slaughter_status;
ALTER PUBLICATION supabase_realtime ADD TABLE announcements;
