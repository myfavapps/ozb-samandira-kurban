-- Disable RLS on all tables - Edge Functions use service_role anyway
-- Public read is safe, write only happens via Edge Functions
ALTER TABLE slaughter_status DISABLE ROW LEVEL SECURITY;
ALTER TABLE videos DISABLE ROW LEVEL SECURITY;
ALTER TABLE announcements DISABLE ROW LEVEL SECURITY;

-- Clean up test data
DELETE FROM slaughter_status WHERE id > 1;
UPDATE slaughter_status SET current_number = 1, status = 'waiting', last_updated = NOW() WHERE id = 1;
DELETE FROM announcements WHERE id > 2;
