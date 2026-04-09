// Kesim Panel Logic
let kesimData = [];
let pollTimer = null;

document.addEventListener('DOMContentLoaded', async () => {
    const user = requirePermission('kesim');
    if (!user) return;
    renderNav('kesim');
    await loadKesimData();
    startPolling();
});

async function loadKesimData() {
    try {
        const data = await supabaseRead('slaughter_status', 'select=*&order=kurban_number.asc');
        if (!data || data.length === 0) {
            document.getElementById('kesimBody').innerHTML =
                '<tr><td colspan="3" style="text-align:center;padding:20px;color:var(--text-light);">Henuz kurban olusturulmamis. Admin panelinden kurban sayisini ayarlayin.</td></tr>';
            return;
        }
        kesimData = data;
        renderTable();
    } catch (e) {
        showToast(e.message, 'error');
    }
}

function renderTable() {
    const tbody = document.getElementById('kesimBody');
    const activeEl = document.activeElement;
    const activeKurban = activeEl && activeEl.dataset ? activeEl.dataset.kurban : null;

    tbody.innerHTML = kesimData.map(row => {
        const status = row.status || 'waiting';
        const time = (status === 'waiting') ? '' : (row.last_updated ? new Date(row.last_updated).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' }) : '');
        return `
            <tr class="row-${status}">
                <td style="font-weight:700; font-size:1.1rem;">${row.kurban_number || row.current_number}</td>
                <td>
                    <select class="status-select s-${status}" data-kurban="${row.kurban_number}" onchange="changeStatus(this)">
                        <option value="waiting" ${status === 'waiting' ? 'selected' : ''}>Kesilecek</option>
                        <option value="in_progress" ${status === 'in_progress' ? 'selected' : ''}>Kesiliyor</option>
                        <option value="completed" ${status === 'completed' ? 'selected' : ''}>Kesildi</option>
                        <option value="cancelled" ${status === 'cancelled' ? 'selected' : ''}>Iptal</option>
                    </select>
                </td>
                <td>${time}</td>
            </tr>`;
    }).join('');

    // Restore focus if user was interacting
    if (activeKurban) {
        const el = tbody.querySelector(`[data-kurban="${activeKurban}"]`);
        if (el) el.focus();
    }

    // Update counters
    const counts = { waiting: 0, in_progress: 0, completed: 0, cancelled: 0 };
    kesimData.forEach(r => { if (counts[r.status] !== undefined) counts[r.status]++; });
    document.getElementById('countWaiting').textContent = counts.waiting;
    document.getElementById('countProgress').textContent = counts.in_progress;
    document.getElementById('countCompleted').textContent = counts.completed;
    document.getElementById('countCancelled').textContent = counts.cancelled;
    document.getElementById('countTotal').textContent = kesimData.length;
}

async function changeStatus(el) {
    const kurbanNumber = parseInt(el.dataset.kurban);
    const newStatus = el.value;

    el.disabled = true;
    try {
        await panelAPI('update-kesim-status', { kurban_number: kurbanNumber, status: newStatus });
        // Update local data immediately
        const row = kesimData.find(r => r.kurban_number === kurbanNumber);
        if (row) {
            row.status = newStatus;
            row.last_updated = new Date().toISOString();
        }
        renderTable();
    } catch (e) {
        showToast(e.message, 'error');
        // Revert
        await loadKesimData();
    }
    el.disabled = false;
}

function startPolling() {
    pollTimer = setInterval(async () => {
        try {
            const data = await supabaseRead('slaughter_status', 'select=*&order=kurban_number.asc');
            if (data && data.length > 0) {
                const newJson = JSON.stringify(data);
                const oldJson = JSON.stringify(kesimData);
                if (newJson !== oldJson) {
                    kesimData = data;
                    renderTable();
                }
            }
        } catch (e) {
            console.warn('Poll error:', e);
        }
    }, 5000);
}

// Toast (shared)
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

window.addEventListener('beforeunload', () => { if (pollTimer) clearInterval(pollTimer); });
