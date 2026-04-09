// Masalar Panel Logic
let masaDetailsData = [];
let processingData = [];
let masaCount = 0;
let pollTimer = null;
let saveTimers = {};

document.addEventListener('DOMContentLoaded', async () => {
    const user = requirePermission('masalar');
    if (!user) return;
    renderNav('masalar');
    await loadData();
    startPolling();
});

async function loadData() {
    try {
        const [details, processing, settings] = await Promise.all([
            supabaseRead('masa_details', 'select=*&order=kurban_number.asc'),
            supabaseRead('processing_status', 'select=*&order=kurban_number.asc'),
            supabaseRead('settings', 'select=key,value'),
        ]);

        masaDetailsData = details;
        processingData = processing;

        const s = {};
        settings.forEach(r => s[r.key] = r.value);
        masaCount = parseInt(s.masa_count) || 4;

        renderMasas();
    } catch (e) {
        showToast(e.message, 'error');
    }
}

function renderMasas() {
    const container = document.getElementById('masaContainer');

    if (masaCount === 0) {
        container.innerHTML = '<div class="panel-card"><p style="color:var(--text-light);text-align:center;">Masa sayisi ayarlanmamis. Admin panelinden ayarlayin.</p></div>';
        return;
    }

    let html = '';
    for (let m = 1; m <= masaCount; m++) {
        // Find kurban assigned to this masa
        const masaProcessing = processingData.filter(p => p.masa_number === m);
        const masaDetails = masaDetailsData.filter(d => d.masa_number === m);

        html += `
        <div class="panel-card">
            <div class="panel-card-header">${m}. NOLU MASA</div>
            ${masaProcessing.length === 0
                ? '<p style="color:var(--text-light);font-size:0.9rem;">Bu masada henuz kurban yok.</p>'
                : `<div class="panel-table-wrapper">
                    <table class="panel-table">
                        <thead>
                            <tr>
                                <th>Kurban No</th>
                                <th>Hisse Adedi</th>
                                <th>Et KG</th>
                                <th>Kemik KG</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${masaProcessing.map(p => {
                                const detail = masaDetails.find(d => d.kurban_number === p.kurban_number) || {};
                                const key = `${p.kurban_number}_${m}`;
                                return `
                                <tr>
                                    <td style="font-weight:700;">${p.kurban_number}</td>
                                    <td><input type="text" inputmode="numeric" class="table-input" data-kurban="${p.kurban_number}" data-masa="${m}" data-field="hisse_count" value="${detail.hisse_count || ''}" placeholder="0" onchange="saveMasaDetail(this)" onblur="saveMasaDetail(this)"></td>
                                    <td><input type="text" inputmode="decimal" class="table-input" data-kurban="${p.kurban_number}" data-masa="${m}" data-field="et_kg" value="${detail.et_kg || ''}" placeholder="0,0" onchange="saveMasaDetail(this)" onblur="saveMasaDetail(this)"></td>
                                    <td><input type="text" inputmode="decimal" class="table-input" data-kurban="${p.kurban_number}" data-masa="${m}" data-field="kemik_kg" value="${detail.kemik_kg || ''}" placeholder="0,0" onchange="saveMasaDetail(this)" onblur="saveMasaDetail(this)"></td>
                                </tr>`;
                            }).join('')}
                        </tbody>
                    </table>
                </div>`
            }
        </div>`;
    }

    container.innerHTML = html;
}

function saveMasaDetail(el) {
    const kurbanNumber = parseInt(el.dataset.kurban);
    const masaNumber = parseInt(el.dataset.masa);
    const key = `${kurbanNumber}_${masaNumber}`;

    // Debounce: clear previous timer for this key
    if (saveTimers[key]) clearTimeout(saveTimers[key]);

    saveTimers[key] = setTimeout(async () => {
        // Gather all values for this kurban+masa
        const row = el.closest('tr');
        const inputs = row.querySelectorAll('.table-input');
        const data = { kurban_number: kurbanNumber, masa_number: masaNumber };
        inputs.forEach(inp => {
            const val = inp.value.trim().replace(',', '.');
            data[inp.dataset.field] = val === '' ? null : parseFloat(val);
        });

        try {
            await panelAPI('update-masa-details', data);
            // Visual feedback
            inputs.forEach(inp => {
                inp.classList.add('saved');
                setTimeout(() => inp.classList.remove('saved'), 1500);
            });
        } catch (e) {
            showToast(e.message, 'error');
        }
    }, 500);
}

function startPolling() {
    pollTimer = setInterval(async () => {
        try {
            const [newDetails, newProcessing] = await Promise.all([
                supabaseRead('masa_details', 'select=*&order=kurban_number.asc'),
                supabaseRead('processing_status', 'select=*&order=kurban_number.asc'),
            ]);
            // Only re-render if no input is focused (avoid disrupting user input)
            const active = document.activeElement;
            if (active && active.classList && active.classList.contains('table-input')) return;

            if (JSON.stringify(newProcessing) !== JSON.stringify(processingData) ||
                JSON.stringify(newDetails) !== JSON.stringify(masaDetailsData)) {
                processingData = newProcessing;
                masaDetailsData = newDetails;
                renderMasas();
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
