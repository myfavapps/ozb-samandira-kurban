// Panel Auth Module

function getToken() {
    return localStorage.getItem('panel_token');
}

function getUser() {
    const raw = localStorage.getItem('panel_user');
    if (!raw) return null;
    try { return JSON.parse(raw); } catch { return null; }
}

function isTokenExpired(token) {
    try {
        const payload = JSON.parse(atob(token.split('.')[1]));
        return payload.exp < Math.floor(Date.now() / 1000);
    } catch { return true; }
}

function checkAuth() {
    const token = getToken();
    const user = getUser();
    if (!token || !user || isTokenExpired(token)) {
        logout();
        return null;
    }
    return user;
}

function requireRole(...roles) {
    const user = checkAuth();
    if (!user) return null;
    if (!roles.includes(user.role)) {
        // Redirect to appropriate default page
        const defaults = { admin: 'durum.html', kesim: 'kesim.html', parcalama: 'parcalama.html', canli_yayin: 'canli-yayin.html', mesaj: 'mesajlar.html' };
        window.location.href = defaults[user.role] || 'login.html';
        return null;
    }
    return user;
}

async function login(username, password) {
    const result = await panelAPI('login', { username, password });
    localStorage.setItem('panel_token', result.token);
    localStorage.setItem('panel_user', JSON.stringify(result.user));
    // Redirect based on role
    const defaults = { admin: 'durum.html', kesim: 'kesim.html', parcalama: 'parcalama.html', canli_yayin: 'canli-yayin.html', mesaj: 'mesajlar.html' };
    window.location.href = defaults[result.user.role] || 'kesim.html';
}

function logout() {
    localStorage.removeItem('panel_token');
    localStorage.removeItem('panel_user');
    window.location.href = 'login.html';
}
