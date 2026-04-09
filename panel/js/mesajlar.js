// Mesajlar Panel Page
requireRole('admin', 'mesaj');
renderNav('mesajlar');

loadDuyuru();
loadInfoMessages();

// ---- Duyuru ----

async function loadDuyuru() {
    try {
        const res = await panelAPI('get-announcement');
        if (res.announcement && res.announcement.message) {
            document.getElementById('duyuruText').value = res.announcement.message;
        }
    } catch (e) {
        console.warn('Duyuru yuklenemedi:', e);
    }
}

async function saveDuyuru() {
    const message = document.getElementById('duyuruText').value.trim();
    try {
        await panelAPI('update-announcement', { message });
        showToast('Duyuru kaydedildi');
    } catch (e) {
        showToast('Hata: ' + e.message, true);
    }
}

// ---- Bilgi Mesajlari ----

async function loadInfoMessages() {
    try {
        const res = await panelAPI('list-info-messages');
        const tbody = document.getElementById('infoBody');
        if (!res.messages || res.messages.length === 0) {
            tbody.innerHTML = '<tr><td colspan="4" style="text-align:center; color:#999;">Henuz bilgi mesaji yok</td></tr>';
            return;
        }
        tbody.innerHTML = res.messages.map(function(m) {
            var date = new Date(m.created_at).toLocaleString('tr-TR', {
                day: '2-digit', month: '2-digit', year: 'numeric',
                hour: '2-digit', minute: '2-digit'
            });
            var escaped = (m.message || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
            return '<tr>' +
                '<td>' + m.id + '</td>' +
                '<td>' + escaped + '</td>' +
                '<td style="white-space:nowrap; font-size:0.8rem;">' + date + '</td>' +
                '<td style="white-space:nowrap;">' +
                    '<button class="btn btn-sm" onclick="openEditModal(' + m.id + ',\'' + escaped.replace(/'/g, "\\'") + '\')" style="background:#3498db; color:#fff; margin-right:6px;">Duzenle</button>' +
                    '<button class="btn btn-sm btn-danger" onclick="deleteInfoMessage(' + m.id + ')">Sil</button>' +
                '</td>' +
                '</tr>';
        }).join('');
    } catch (e) {
        showToast('Hata: ' + e.message, true);
    }
}

async function addInfoMessage() {
    var input = document.getElementById('newInfoMessage');
    var message = input.value.trim();
    if (!message) return showToast('Mesaj bos olamaz', true);
    try {
        await panelAPI('add-info-message', { message: message });
        input.value = '';
        showToast('Bilgi mesaji eklendi');
        loadInfoMessages();
    } catch (e) {
        showToast('Hata: ' + e.message, true);
    }
}

async function deleteInfoMessage(id) {
    if (!confirm('Bu mesaji silmek istediginize emin misiniz?')) return;
    try {
        await panelAPI('delete-info-message', { id: id });
        showToast('Mesaj silindi');
        loadInfoMessages();
    } catch (e) {
        showToast('Hata: ' + e.message, true);
    }
}

// ---- Edit Modal ----

function openEditModal(id, message) {
    document.getElementById('editId').value = id;
    document.getElementById('editMessage').value = message;
    document.getElementById('editModal').style.display = 'flex';
}

function closeEditModal() {
    document.getElementById('editModal').style.display = 'none';
}

async function saveEdit() {
    var id = parseInt(document.getElementById('editId').value);
    var message = document.getElementById('editMessage').value.trim();
    if (!message) return showToast('Mesaj bos olamaz', true);
    try {
        await panelAPI('update-info-message', { id: id, message: message });
        closeEditModal();
        showToast('Mesaj guncellendi');
        loadInfoMessages();
    } catch (e) {
        showToast('Hata: ' + e.message, true);
    }
}

// ---- Toast ----

function showToast(msg, isError) {
    var t = document.getElementById('toast');
    t.textContent = msg;
    t.className = 'toast show' + (isError ? ' error' : '');
    setTimeout(function() { t.className = 'toast'; }, 3000);
}
