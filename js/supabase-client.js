// Supabase Client Configuration
const SUPABASE_URL = 'https://alwencxmlguuregmitbt.supabase.co';
const SUPABASE_KEY = 'sb_publishable_rgexFD8Bzg0jAMQhsj-yAw_NBRSp9oO';

var supabaseClient;

try {
    supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
    console.log('Supabase client initialized');
} catch (error) {
    console.error('Supabase initialization error:', error);
}

async function getCurrentStatus() {
    try {
        // Multi-row: first try in_progress, then latest completed, then first waiting
        let { data, error } = await supabaseClient
            .from('slaughter_status')
            .select('*')
            .eq('status', 'in_progress')
            .order('last_updated', { ascending: false })
            .limit(1);
        if (error) throw error;
        if (data && data.length > 0) return data[0];

        ({ data, error } = await supabaseClient
            .from('slaughter_status')
            .select('*')
            .eq('status', 'completed')
            .order('last_updated', { ascending: false })
            .limit(1));
        if (error) throw error;
        if (data && data.length > 0) return data[0];

        ({ data, error } = await supabaseClient
            .from('slaughter_status')
            .select('*')
            .eq('status', 'waiting')
            .order('kurban_number', { ascending: true })
            .limit(1));
        if (error) throw error;
        if (data && data.length > 0) return data[0];

        return null;
    } catch (error) {
        console.error('Error fetching status:', error);
        return null;
    }
}

async function getVideoByNumber(kurbanNumber) {
    try {
        const { data, error } = await supabaseClient
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
        const { data, error } = await supabaseClient
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

async function getStreamStatus() {
    try {
        const { data, error } = await supabaseClient
            .from('settings')
            .select('key,value')
            .eq('key', 'live_stream_active');
        if (error) throw error;
        if (data && data.length > 0) {
            return { active: data[0].value === 'true' };
        }
        return { active: false };
    } catch (error) {
        console.error('Error fetching stream status:', error);
        return { active: false };
    }
}

async function getInfoMessages() {
    try {
        const { data, error } = await supabaseClient
            .from('info_messages')
            .select('id,message,created_at')
            .order('created_at', { ascending: false });
        if (error) throw error;
        return data || [];
    } catch (error) {
        console.error('Error fetching info messages:', error);
        return [];
    }
}

function subscribeToStatus(callback) {
    return supabaseClient
        .channel('slaughter_status')
        .on('postgres_changes', 
            { event: '*', schema: 'public', table: 'slaughter_status' },
            (payload) => callback(payload.new)
        )
        .subscribe();
}

function subscribeToAnnouncements(callback) {
    return supabaseClient
        .channel('announcements')
        .on('postgres_changes',
            { event: '*', schema: 'public', table: 'announcements' },
            (payload) => callback(payload.new)
        )
        .subscribe();
}
