// Supabase Client Configuration
const SUPABASE_URL = 'https://alwencxmlguuregmitbt.supabase.co';
const SUPABASE_KEY = 'sb_publishable_rgexFD8Bzg0jAMQhsj-yAw_NBRSp9oO';

let supabase;

try {
    supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
    console.log('Supabase client initialized');
} catch (error) {
    console.error('Supabase initialization error:', error);
}

async function getCurrentStatus() {
    try {
        const { data, error } = await supabase
            .from('slaughter_status')
            .select('*')
            .order('last_updated', { ascending: false })
            .limit(1)
            .single();
        if (error) throw error;
        return data;
    } catch (error) {
        console.error('Error fetching status:', error);
        return null;
    }
}

async function getVideoByNumber(kurbanNumber) {
    try {
        const { data, error } = await supabase
            .from('videos')
            .select('*')
            .eq('kurban_number', kurbanNumber)
            .single();
        if (error) throw error;
        return data;
    } catch (error) {
        console.error('Error fetching video:', error);
        return null;
    }
}

async function getAnnouncements() {
    try {
        const { data, error } = await supabase
            .from('announcements')
            .select('*')
            .order('created_at', { ascending: false })
            .limit(1);
        if (error) throw error;
        return data;
    } catch (error) {
        console.error('Error fetching announcements:', error);
        return [];
    }
}

function subscribeToStatus(callback) {
    return supabase
        .channel('slaughter_status')
        .on('postgres_changes', 
            { event: '*', schema: 'public', table: 'slaughter_status' },
            (payload) => callback(payload.new)
        )
        .subscribe();
}

function subscribeToAnnouncements(callback) {
    return supabase
        .channel('announcements')
        .on('postgres_changes',
            { event: '*', schema: 'public', table: 'announcements' },
            (payload) => callback(payload.new)
        )
        .subscribe();
}
