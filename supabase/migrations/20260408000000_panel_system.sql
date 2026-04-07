-- Panel System: users, settings, processing_status, masa_details tables
-- + slaughter_status multi-row support

-- Users table
CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    username VARCHAR(50) UNIQUE NOT NULL,
    password_hash VARCHAR(128) NOT NULL,
    salt VARCHAR(32) NOT NULL,
    role VARCHAR(20) NOT NULL CHECK (role IN ('admin', 'kesim', 'parcalama')),
    display_name VARCHAR(100) NOT NULL,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Settings table (key-value)
CREATE TABLE IF NOT EXISTS settings (
    id SERIAL PRIMARY KEY,
    key VARCHAR(50) UNIQUE NOT NULL,
    value TEXT NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
INSERT INTO settings (key, value) VALUES ('kurban_count', '0'), ('masa_count', '0')
ON CONFLICT (key) DO NOTHING;

-- Processing status (parcalama)
CREATE TABLE IF NOT EXISTS processing_status (
    id SERIAL PRIMARY KEY,
    kurban_number INTEGER NOT NULL,
    masa_number INTEGER NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'processing' CHECK (status IN ('processing', 'completed')),
    started_at TIMESTAMPTZ DEFAULT NOW(),
    completed_at TIMESTAMPTZ,
    updated_by INTEGER REFERENCES users(id),
    UNIQUE(kurban_number)
);

-- Masa details (hisse, et kg, kemik kg)
CREATE TABLE IF NOT EXISTS masa_details (
    id SERIAL PRIMARY KEY,
    kurban_number INTEGER NOT NULL,
    masa_number INTEGER NOT NULL,
    hisse_count INTEGER,
    et_kg DECIMAL(6,2),
    kemik_kg DECIMAL(6,2),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    updated_by INTEGER REFERENCES users(id),
    UNIQUE(kurban_number, masa_number)
);

-- Modify slaughter_status for multi-row support
ALTER TABLE slaughter_status ADD COLUMN IF NOT EXISTS kurban_number INTEGER;

-- Remove old data and add unique constraint
DELETE FROM slaughter_status;
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'unique_kurban_number'
    ) THEN
        ALTER TABLE slaughter_status ADD CONSTRAINT unique_kurban_number UNIQUE (kurban_number);
    END IF;
END
$$;

-- Disable RLS on new tables (consistent with existing approach)
ALTER TABLE users DISABLE ROW LEVEL SECURITY;
ALTER TABLE settings DISABLE ROW LEVEL SECURITY;
ALTER TABLE processing_status DISABLE ROW LEVEL SECURITY;
ALTER TABLE masa_details DISABLE ROW LEVEL SECURITY;

-- Enable realtime on new tables
ALTER PUBLICATION supabase_realtime ADD TABLE processing_status;
ALTER PUBLICATION supabase_realtime ADD TABLE masa_details;

-- Seed default admin user (password: admin123, salt: a1b2c3d4e5f6a7b8)
-- SHA-256 of "a1b2c3d4e5f6a7b8admin123" = 45a296a168cf98a7fd8957e24d5ad7ce2aef31a7933d82560f6fb188cc6d915f
INSERT INTO users (username, password_hash, salt, role, display_name)
VALUES ('admin', '45a296a168cf98a7fd8957e24d5ad7ce2aef31a7933d82560f6fb188cc6d915f', 'a1b2c3d4e5f6a7b8', 'admin', 'Yonetici')
ON CONFLICT (username) DO NOTHING;
