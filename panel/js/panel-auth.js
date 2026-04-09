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

function requirePermission(permission) {
    const user = checkAuth();
    if (!user) return null;
    const permissions = user.permissions || [];
    if (!permissions.includes(permission)) {
        window.location.href = user.default_page || 'durum.html';
        return null;
    }
    return user;
}

function requireAdmin() {
    const user = checkAuth();
    if (!user) return null;
    if (user.role !== 'admin') {
        window.location.href = user.default_page || 'durum.html';
        return null;
    }
    return user;
}

async function login(username, password) {
    const result = await panelAPI('login', { username, password });
    localStorage.setItem('panel_token', result.token);
    localStorage.setItem('panel_user', JSON.stringify(result.user));
    window.location.href = result.user.default_page || 'durum.html';
}

function logout() {
    localStorage.removeItem('panel_token');
    localStorage.removeItem('panel_user');
    window.location.href = 'login.html';
}
