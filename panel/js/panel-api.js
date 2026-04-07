// Panel API Client
const PANEL_API_URL = 'https://alwencxmlguuregmitbt.supabase.co/functions/v1/panel-api';
const SUPABASE_URL = 'https://alwencxmlguuregmitbt.supabase.co';
const SUPABASE_KEY = 'sb_publishable_rgexFD8Bzg0jAMQhsj-yAw_NBRSp9oO';

// Authenticated API call (write operations via Edge Function)
async function panelAPI(action, data = {}) {
    const token = localStorage.getItem('panel_token');
    const headers = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = 'Bearer ' + token;

    const res = await fetch(PANEL_API_URL, {
        method: 'POST',
        headers,
        body: JSON.stringify({ action, ...data }),
    });

    if (res.status === 401) {
        localStorage.removeItem('panel_token');
        localStorage.removeItem('panel_user');
        window.location.href = 'login.html';
        throw new Error('Oturum süresi doldu');
    }

    const json = await res.json();
    if (!res.ok) throw new Error(json.error || 'API hatası');
    return json;
}

// Direct Supabase REST read (anon key, no Edge Function needed)
async function supabaseRead(table, query = '') {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?${query}`, {
        headers: {
            'apikey': SUPABASE_KEY,
            'Authorization': 'Bearer ' + SUPABASE_KEY,
        },
    });
    if (!res.ok) throw new Error('Veri okunamadı');
    return res.json();
}
