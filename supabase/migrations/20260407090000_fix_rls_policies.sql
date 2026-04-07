-- Fix RLS policies - allow service_role full access
-- Drop existing restrictive policies
DROP POLICY IF EXISTS "Service role write slaughter_status" ON slaughter_status;
DROP POLICY IF EXISTS "Service role write videos" ON videos;
DROP POLICY IF EXISTS "Service role write announcements" ON announcements;

-- Recreate with proper USING + WITH CHECK for all operations
CREATE POLICY "Service role all slaughter_status"
    ON slaughter_status FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);

CREATE POLICY "Service role all videos"
    ON videos FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);

CREATE POLICY "Service role all announcements"
    ON announcements FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);

-- Clean up test data - keep only latest
DELETE FROM slaughter_status WHERE id > 1;
UPDATE slaughter_status SET current_number = 1, status = 'waiting', last_updated = NOW() WHERE id = 1;
DELETE FROM announcements;
INSERT INTO announcements (message, type) VALUES ('Kurban Bayrami hazirliklari devam ediyor...', 'info');
