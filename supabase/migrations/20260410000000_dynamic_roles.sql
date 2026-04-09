-- Dynamic Roles: roles tablosu + seed + users FK

-- 1. Roles tablosu
CREATE TABLE IF NOT EXISTS roles (
  name VARCHAR(50) PRIMARY KEY,
  display_name VARCHAR(100) NOT NULL,
  permissions TEXT[] NOT NULL DEFAULT '{}',
  default_page VARCHAR(50) NOT NULL DEFAULT 'durum.html',
  is_system BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

ALTER TABLE roles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public read roles" ON roles FOR SELECT USING (true);
CREATE POLICY "Service write roles" ON roles FOR ALL USING (true);

-- 2. Seed mevcut roller
INSERT INTO roles (name, display_name, permissions, default_page, is_system) VALUES
  ('admin', 'Admin', ARRAY['kesim','parcalama','canli_yayin','mesaj','videolar'], 'durum.html', true),
  ('kesim', 'Kesim Ekibi', ARRAY['kesim'], 'kesim.html', false),
  ('parcalama', 'Parcalama Ekibi', ARRAY['parcalama'], 'parcalama.html', false),
  ('canli_yayin', 'Canli Yayin', ARRAY['canli_yayin'], 'canli-yayin.html', false),
  ('mesaj', 'Mesaj Yoneticisi', ARRAY['mesaj'], 'mesajlar.html', false)
ON CONFLICT (name) DO NOTHING;

-- 3. DROP existing CHECK constraint, add FK
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check;
ALTER TABLE users ADD CONSTRAINT users_role_fk FOREIGN KEY (role) REFERENCES roles(name);
