// Durum Dashboard Logic
let kesimChart = null;
let parcalamaChart = null;
let pollTimer = null;

document.addEventListener('DOMContentLoaded', async () => {
    const user = requireRole('admin', 'kesim');
    if (!user) return;
    renderNav('durum');
    await loadDashboard();
    startPolling();
});

async function loadDashboard() {
    try {
        const [slaughter, processing, settings] = await Promise.all([
            supabaseRead('slaughter_status', 'select=*'),
            supabaseRead('processing_status', 'select=*'),
            supabaseRead('settings', 'select=key,value'),
        ]);

        const s = {};
        settings.forEach(r => s[r.key] = r.value);

        // Kesim counts
        const kesim = { waiting: 0, in_progress: 0, completed: 0, cancelled: 0 };
        slaughter.forEach(r => { if (kesim[r.status] !== undefined) kesim[r.status]++; });
        const totalKurban = slaughter.length;

        // Parcalama counts
        const parcalama = { processing: 0, completed: 0 };
        processing.forEach(r => { if (parcalama[r.status] !== undefined) parcalama[r.status]++; });
        const parcalamaWaiting = kesim.completed - (parcalama.processing + parcalama.completed);

        // Summary cards
        document.getElementById('totalKurban').textContent = totalKurban;
        document.getElementById('kesilen').textContent = kesim.completed;
        document.getElementById('kalan').textContent = kesim.waiting + kesim.in_progress;
        document.getElementById('islenen').textContent = parcalama.completed;
        document.getElementById('masaSayisi').textContent = s.masa_count || '0';

        // Kesim Chart
        renderKesimChart(kesim);
        renderParcalamaChart(parcalama, parcalamaWaiting > 0 ? parcalamaWaiting : 0);

    } catch (e) {
        console.error('Dashboard error:', e);
    }
}

function renderKesimChart(counts) {
    const ctx = document.getElementById('kesimChart').getContext('2d');

    const data = {
        labels: [
            `Kesilecek (${counts.waiting})`,
            `Kesiliyor (${counts.in_progress})`,
            `Kesildi (${counts.completed})`,
            `Iptal (${counts.cancelled})`,
        ],
        datasets: [{
            data: [counts.waiting, counts.in_progress, counts.completed, counts.cancelled],
            backgroundColor: ['#4caf50', '#ff9800', '#f44336', '#9e9e9e'],
            borderWidth: 2,
            borderColor: '#fff',
        }]
    };

    if (kesimChart) {
        kesimChart.data = data;
        kesimChart.update();
    } else {
        kesimChart = new Chart(ctx, {
            type: 'doughnut',
            data,
            options: {
                responsive: true,
                maintainAspectRatio: true,
                plugins: {
                    legend: { position: 'bottom', labels: { padding: 16, font: { size: 13, family: 'Inter' } } },
                }
            }
        });
    }
}

function renderParcalamaChart(counts, waiting) {
    const ctx = document.getElementById('parcalamaChart').getContext('2d');

    const data = {
        labels: [
            `Bekliyor (${waiting})`,
            `Isleniyor (${counts.processing})`,
            `Islendi (${counts.completed})`,
        ],
        datasets: [{
            data: [waiting, counts.processing, counts.completed],
            backgroundColor: ['#2196f3', '#ff9800', '#4caf50'],
            borderWidth: 2,
            borderColor: '#fff',
        }]
    };

    if (parcalamaChart) {
        parcalamaChart.data = data;
        parcalamaChart.update();
    } else {
        parcalamaChart = new Chart(ctx, {
            type: 'doughnut',
            data,
            options: {
                responsive: true,
                maintainAspectRatio: true,
                plugins: {
                    legend: { position: 'bottom', labels: { padding: 16, font: { size: 13, family: 'Inter' } } },
                }
            }
        });
    }
}

function startPolling() {
    pollTimer = setInterval(loadDashboard, 10000);
}

window.addEventListener('beforeunload', () => { if (pollTimer) clearInterval(pollTimer); });
