// Parcalama Panel Logic
let processingData = [];
let slaughterData = [];
let settingsData = {};
let pollTimer = null;

document.addEventListener('DOMContentLoaded', async () => {
    const user = requirePermission('parcalama');
    if (!user) return;
    renderNav('parcalama');
    await loadData();
    startPolling();
});

async function loadData() {
    try {
        [processingData, slaughterData, settingsData] = await Promise.all([
            supabaseRead('processing_status', 'select=*&order=kurban_number.asc'),
            supabaseRead('slaughter_status', 'select=*&order=kurban_number.asc'),
            supabaseRead('settings', 'select=key,value'),
        ]);

        const settings = {};
        settingsData.forEach(s => settings[s.key] = s.value);
        settingsData = settings;

        renderAssignForm();
        renderTable();
    } catch (e) {
        showToast(e.message, 'error');
    }
}

function renderAssignForm() {
    // Find completed kurban that haven't been assigned yet
    const assignedNumbers = new Set(processingData.map(p => p.kurban_number));
    const available = slaughterData.filter(s => s.status === 'completed' && !assignedNumbers.has(s.kurban_number));
    const masaCount = parseInt(settingsData.masa_count) || 4;

    const kurbanSelect = document.getElementById('assignKurban');
    kurbanSelect.innerHTML = '<option value="">Kurban sec...</option>' +
        available.map(s => `<option value="${s.kurban_number}">#${s.kurban_number}</option>`).join('');

    const masaSelect = document.getElementById('assignMasa');
    masaSelect.innerHTML = '<option value="">Masa sec...</option>';
    for (let i = 1; i <= masaCount; i++) {
        masaSelect.innerHTML += `<option value="${i}">${i}. Masa</option>`;
    }

    document.getElementById('availableCount').textContent = available.length;
}

function renderTable() {
    const tbody = document.getElementById('parcalamaBody');

    if (processingData.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;padding:20px;color:var(--text-light);">Henuz parcalama islemi yok.</td></tr>';
        updateCounters();
        return;
    }

    tbody.innerHTML = processingData.map(row => {
        const time = row.started_at ? new Date(row.status === 'completed' && row.completed_at ? row.completed_at : row.started_at)
            .toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' }) : '--:--';
        return `
            <tr class="row-${row.status}">
                <td style="font-weight:700;">${row.kurban_number}</td>
                <td>${row.masa_number}. Masa</td>
                <td>
                    ${row.status === 'processing'
                        ? '<span style="color:#e65100;font-weight:600;">Isleniyor</span>'
                        : '<span style="color:#2e7d32;font-weight:600;">Islendi</span>'}
                </td>
                <td>${time}</td>
                <td>
                    ${row.status === 'processing'
                        ? `<button class="btn btn-success btn-sm" onclick="completeProcessing(${row.kurban_number})">Islendi Yap</button>`
                        : '-'}
                </td>
            </tr>`;
    }).join('');

    updateCounters();
}

function updateCounters() {
    const processing = processingData.filter(r => r.status === 'processing').length;
    const completed = processingData.filter(r => r.status === 'completed').length;
    document.getElementById('countProcessing').textContent = processing;
    document.getElementById('countDone').textContent = completed;
    document.getElementById('countParcalamaTotal').textContent = processingData.length;
}

async function assignToMasa() {
    const kurbanNumber = parseInt(document.getElementById('assignKurban').value);
    const masaNumber = parseInt(document.getElementById('assignMasa').value);
    if (!kurbanNumber || !masaNumber) {
        showToast('Kurban ve masa secin', 'error');
        return;
    }

    try {
        await panelAPI('assign-to-masa', { kurban_number: kurbanNumber, masa_number: masaNumber });
        showToast(`Kurban #${kurbanNumber} ${masaNumber}. masaya atandi`, 'success');
        await loadData();
    } catch (e) {
        showToast(e.message, 'error');
    }
}

async function completeProcessing(kurbanNumber) {
    try {
        await panelAPI('complete-processing', { kurban_number: kurbanNumber });
        const row = processingData.find(r => r.kurban_number === kurbanNumber);
        if (row) {
            row.status = 'completed';
            row.completed_at = new Date().toISOString();
        }
        renderTable();
        showToast(`Kurban #${kurbanNumber} parcalama tamamlandi`, 'success');
    } catch (e) {
        showToast(e.message, 'error');
    }
}

function startPolling() {
    pollTimer = setInterval(async () => {
        try {
            const [newProcessing, newSlaughter] = await Promise.all([
                supabaseRead('processing_status', 'select=*&order=kurban_number.asc'),
                supabaseRead('slaughter_status', 'select=*&order=kurban_number.asc'),
            ]);
            const pJson = JSON.stringify(newProcessing);
            const sJson = JSON.stringify(newSlaughter);
            if (pJson !== JSON.stringify(processingData) || sJson !== JSON.stringify(slaughterData)) {
                processingData = newProcessing;
                slaughterData = newSlaughter;
                renderAssignForm();
                renderTable();
            }
        } catch (e) { console.warn('Poll error:', e); }
    }, 5000);
}

function showToast(msg, type = 'success') {
    let toast = document.getElementById('toast');
    if (!toast) { toast = document.createElement('div'); toast.id = 'toast'; toast.className = 'toast'; document.body.appendChild(toast); }
    toast.textContent = msg;
    toast.className = 'toast ' + type;
    requestAnimationFrame(() => toast.classList.add('show'));
    setTimeout(() => toast.classList.remove('show'), 3000);
}

window.addEventListener('beforeunload', () => { if (pollTimer) clearInterval(pollTimer); });
