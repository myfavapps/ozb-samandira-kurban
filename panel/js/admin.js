// Admin page logic: settings + user management + role management

const ALL_PERMISSIONS = ['kesim', 'parcalama', 'canli_yayin', 'mesaj', 'videolar'];
let rolesCache = [];

document.addEventListener('DOMContentLoaded', async () => {
    const user = requireAdmin();
    if (!user) return;
    renderNav('admin');
    await loadRoles();
    await loadSettings();
    await loadUsers();
    renderPermissionCheckboxes('newRolePermissions', []);
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

// ---- Roles ----

async function loadRoles() {
    try {
        const { roles } = await panelAPI('list-roles');
        rolesCache = roles;
        renderRolesTable(roles);
        populateRoleDropdown(roles);
    } catch (e) {
        showToast(e.message, 'error');
    }
}

function renderRolesTable(roles) {
    const tbody = document.getElementById('rolesBody');
    if (!tbody) return;
    tbody.innerHTML = roles.map(r => `
        <tr>
            <td><strong>${r.name}</strong></td>
            <td>${r.display_name}</td>
            <td>${(r.permissions || []).map(p => `<span class="permission-badge">${p}</span>`).join(' ')}</td>
            <td>${r.default_page}</td>
            <td>${r.is_system ? 'Evet' : 'Hayir'}</td>
            <td>
                <button class="btn btn-primary btn-sm" onclick="openRoleEdit('${r.name}')">Duzenle</button>
                ${!r.is_system ? `<button class="btn btn-danger btn-sm" onclick="deleteRole('${r.name}')">Sil</button>` : ''}
            </td>
        </tr>
    `).join('');
}

function populateRoleDropdown(roles) {
    const select = document.getElementById('newRole');
    if (!select) return;
    select.innerHTML = roles.map(r => `<option value="${r.name}">${r.display_name}</option>`).join('');
}

function renderPermissionCheckboxes(containerId, selected) {
    const container = document.getElementById(containerId);
    if (!container) return;
    container.innerHTML = ALL_PERMISSIONS.map(p => `
        <label style="display:flex; align-items:center; gap:4px; cursor:pointer;">
            <input type="checkbox" value="${p}" ${selected.includes(p) ? 'checked' : ''}>
            ${p}
        </label>
    `).join('');
}

function getCheckedPermissions(containerId) {
    const container = document.getElementById(containerId);
    if (!container) return [];
    return Array.from(container.querySelectorAll('input[type="checkbox"]:checked')).map(cb => cb.value);
}

async function createRole() {
    const name = document.getElementById('newRoleName').value.trim();
    const display_name = document.getElementById('newRoleDisplayName').value.trim();
    const default_page = document.getElementById('newRoleDefaultPage').value.trim() || 'durum.html';
    const permissions = getCheckedPermissions('newRolePermissions');

    if (!name || !display_name) {
        showToast('Rol kodu ve gorunen ad gerekli', 'error');
        return;
    }

    const btn = document.getElementById('createRoleBtn');
    btn.disabled = true;
    try {
        await panelAPI('create-role', { name, display_name, permissions, default_page });
        showToast('Rol olusturuldu', 'success');
        document.getElementById('newRoleName').value = '';
        document.getElementById('newRoleDisplayName').value = '';
        document.getElementById('newRoleDefaultPage').value = 'durum.html';
        renderPermissionCheckboxes('newRolePermissions', []);
        await loadRoles();
    } catch (e) {
        showToast(e.message, 'error');
    }
    btn.disabled = false;
}

function openRoleEdit(name) {
    const role = rolesCache.find(r => r.name === name);
    if (!role) return;

    document.getElementById('editRoleName').value = role.name;
    document.getElementById('editRoleDisplayName').value = role.display_name;
    document.getElementById('editRoleDefaultPage').value = role.default_page;
    renderPermissionCheckboxes('editRolePermissions', role.permissions || []);
    document.getElementById('roleEditModal').style.display = 'block';
}

function closeRoleModal() {
    document.getElementById('roleEditModal').style.display = 'none';
}

async function saveRole() {
    const name = document.getElementById('editRoleName').value;
    const display_name = document.getElementById('editRoleDisplayName').value.trim();
    const default_page = document.getElementById('editRoleDefaultPage').value.trim();
    const permissions = getCheckedPermissions('editRolePermissions');

    if (!display_name) {
        showToast('Gorunen ad gerekli', 'error');
        return;
    }

    try {
        await panelAPI('update-role', { name, display_name, permissions, default_page });
        showToast('Rol guncellendi', 'success');
        closeRoleModal();
        await loadRoles();
    } catch (e) {
        showToast(e.message, 'error');
    }
}

async function deleteRole(name) {
    if (!confirm(`"${name}" rolu silinecek. Devam?`)) return;
    try {
        await panelAPI('delete-role', { name });
        showToast('Rol silindi', 'success');
        await loadRoles();
    } catch (e) {
        showToast(e.message, 'error');
    }
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
                    ${u.is_active ? `<button class="btn btn-primary btn-sm" onclick="changePassword(${u.id}, '${u.username}')">Sifre</button> <button class="btn btn-danger btn-sm" onclick="deleteUser(${u.id}, '${u.username}')">Sil</button>` : '-'}
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

async function changePassword(id, username) {
    const password = prompt(`"${username}" icin yeni sifre:`);
    if (!password) return;
    if (password.length < 4) {
        showToast('Sifre en az 4 karakter olmali', 'error');
        return;
    }
    try {
        await panelAPI('update-user-password', { user_id: id, password });
        showToast('Sifre guncellendi', 'success');
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
