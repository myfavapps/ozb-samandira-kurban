// Admin page logic: settings + user management

document.addEventListener('DOMContentLoaded', async () => {
    const user = requireRole('admin');
    if (!user) return;
    renderNav('admin');
    await loadSettings();
    await loadUsers();
    showTab('settings');
});

function showTab(tab) {
    document.querySelectorAll('.panel-tab').forEach(t => t.classList.toggle('active', t.dataset.tab === tab));
    document.querySelectorAll('.tab-content').forEach(c => c.classList.toggle('active', c.id === 'tab-' + tab));
}

// ---- Settings ----

async function loadSettings() {
    try {
        const { settings } = await panelAPI('get-settings');
        document.getElementById('kurbanCount').value = settings.kurban_count || '0';
        document.getElementById('masaCount').value = settings.masa_count || '0';
    } catch (e) {
        showToast(e.message, 'error');
    }
}

async function saveSettings() {
    const btn = document.getElementById('saveSettingsBtn');
    btn.disabled = true;
    try {
        const kurban_count = parseInt(document.getElementById('kurbanCount').value);
        const masa_count = parseInt(document.getElementById('masaCount').value);
        if (isNaN(kurban_count) || isNaN(masa_count) || kurban_count < 0 || masa_count < 0) {
            throw new Error('Gecerli sayilar girin');
        }
        await panelAPI('update-settings', { kurban_count, masa_count });
        showToast('Ayarlar kaydedildi', 'success');
    } catch (e) {
        showToast(e.message, 'error');
    }
    btn.disabled = false;
}

async function initializeKurban() {
    const count = parseInt(document.getElementById('kurbanCount').value);
    if (!count || count < 1) {
        showToast('Once kurban sayisini girin', 'error');
        return;
    }
    if (!confirm(`${count} adet kurban olusturulacak. Mevcut kesim verileri silinecek. Devam?`)) return;

    const btn = document.getElementById('initKurbanBtn');
    btn.disabled = true;
    try {
        await panelAPI('initialize-kurban', { kurban_count: count });
        showToast(`${count} kurban olusturuldu`, 'success');
    } catch (e) {
        showToast(e.message, 'error');
    }
    btn.disabled = false;
}

// ---- Users ----

async function loadUsers() {
    try {
        const { users } = await panelAPI('list-users');
        const tbody = document.getElementById('usersBody');
        tbody.innerHTML = users.map(u => `
            <tr class="${!u.is_active ? 'row-cancelled' : ''}">
                <td>${u.id}</td>
                <td>${u.username}</td>
                <td>${u.display_name}</td>
                <td><span class="panel-user-role">${u.role}</span></td>
                <td>${u.is_active ? 'Aktif' : 'Pasif'}</td>
                <td>
                    ${u.is_active ? `<button class="btn btn-danger btn-sm" onclick="deleteUser(${u.id}, '${u.username}')">Sil</button>` : '-'}
                </td>
            </tr>
        `).join('');
    } catch (e) {
        showToast(e.message, 'error');
    }
}

async function createUser() {
    const username = document.getElementById('newUsername').value.trim();
    const password = document.getElementById('newPassword').value;
    const display_name = document.getElementById('newDisplayName').value.trim();
    const role = document.getElementById('newRole').value;

    if (!username || !password || !display_name) {
        showToast('Tum alanlari doldurun', 'error');
        return;
    }

    const btn = document.getElementById('createUserBtn');
    btn.disabled = true;
    try {
        await panelAPI('create-user', { username, password, role, display_name });
        showToast('Kullanici olusturuldu', 'success');
        document.getElementById('newUsername').value = '';
        document.getElementById('newPassword').value = '';
        document.getElementById('newDisplayName').value = '';
        await loadUsers();
    } catch (e) {
        showToast(e.message, 'error');
    }
    btn.disabled = false;
}

async function deleteUser(id, username) {
    if (!confirm(`"${username}" kullanicisi silinecek. Devam?`)) return;
    try {
        await panelAPI('delete-user', { user_id: id });
        showToast('Kullanici silindi', 'success');
        await loadUsers();
    } catch (e) {
        showToast(e.message, 'error');
    }
}

// ---- Toast ----

function showToast(msg, type = 'success') {
    let toast = document.getElementById('toast');
    if (!toast) {
        toast = document.createElement('div');
        toast.id = 'toast';
        toast.className = 'toast';
        document.body.appendChild(toast);
    }
    toast.textContent = msg;
    toast.className = 'toast ' + type;
    requestAnimationFrame(() => toast.classList.add('show'));
    setTimeout(() => toast.classList.remove('show'), 3000);
}
