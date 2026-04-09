// Durum Dashboard Logic
let kesimChart = null;
let parcalamaChart = null;
let pollTimer = null;

// Plugin: show total in center of doughnut
const centerTextPlugin = {
    id: 'centerText',
    afterDraw(chart) {
        const { ctx, chartArea: { width, height, top } } = chart;
        const total = chart.data.datasets[0].data.reduce((a, b) => a + b, 0);
        ctx.save();
        ctx.font = 'bold 28px Inter';
        ctx.fillStyle = '#2d3436';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(total, width / 2 + chart.chartArea.left, top + height / 2 - 8);
        ctx.font = '12px Inter';
        ctx.fillStyle = '#636e72';
        ctx.fillText('Toplam', width / 2 + chart.chartArea.left, top + height / 2 + 16);
        ctx.restore();
    }
};

// Plugin: show count on each slice
const dataLabelsPlugin = {
    id: 'sliceLabels',
    afterDraw(chart) {
        const { ctx } = chart;
        chart.data.datasets.forEach((dataset, di) => {
            const meta = chart.getDatasetMeta(di);
            meta.data.forEach((arc, i) => {
                const val = dataset.data[i];
                if (val === 0) return;
                const { x, y } = arc.tooltipPosition();
                ctx.save();
                ctx.font = 'bold 14px Inter';
                ctx.fillStyle = '#fff';
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.fillText(val, x, y);
                ctx.restore();
            });
        });
    }
};

const chartPlugins = [centerTextPlugin, dataLabelsPlugin];

const chartTooltip = {
    callbacks: {
        label: function(c) {
            const t = c.dataset.data.reduce((a, b) => a + b, 0);
            const p = t ? Math.round(c.raw / t * 100) : 0;
            return ` ${c.label}: ${c.raw} (%${p})`;
        }
    }
};

document.addEventListener('DOMContentLoaded', async () => {
    const user = requirePermission('kesim');
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
        const parcalamaWaiting = Math.max(0, kesim.completed - (parcalama.processing + parcalama.completed));

        // Summary cards
        document.getElementById('totalKurban').textContent = totalKurban;
        document.getElementById('kesilen').textContent = kesim.completed;
        document.getElementById('kalan').textContent = kesim.waiting + kesim.in_progress;
        document.getElementById('islenen').textContent = parcalama.completed;
        document.getElementById('isleniyor').textContent = parcalama.processing;
        document.getElementById('parcaBekliyor').textContent = parcalamaWaiting;
        document.getElementById('masaSayisi').textContent = s.masa_count || '0';

        renderKesimChart(kesim);
        renderParcalamaChart(parcalama, parcalamaWaiting);

        // Actual averages from real data
        const kesimAvg = calcKesimAverage(slaughter);
        const parcalamaAvg = calcParcalamaAverage(processing);

        // Performance
        renderPerformance(s, kesim, parcalama, parcalamaWaiting, totalKurban, kesimAvg, parcalamaAvg);

    } catch (e) {
        console.error('Dashboard error:', e);
    }
}

// ---- Performance ----

function timeToMinutes(timeStr) {
    if (!timeStr || !timeStr.includes(':')) return null;
    const [h, m] = timeStr.split(':').map(Number);
    return h * 60 + m;
}

function minutesToTime(mins) {
    if (mins >= 24 * 60) {
        const days = Math.floor(mins / (24 * 60));
        const rem = mins % (24 * 60);
        const h = Math.floor(rem / 60);
        const m = Math.round(rem % 60);
        return `+${days}gun ${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
    }
    const h = Math.floor(mins / 60);
    const m = Math.round(mins % 60);
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

function formatDuration(mins) {
    if (mins < 1) return '< 1 dk';
    const m = Math.round(mins);
    return `${m} dk`;
}

function getBreaks(settings) {
    const breaks = [];
    const m1s = timeToMinutes(settings.mola_1_start);
    const m1e = timeToMinutes(settings.mola_1_end);
    if (m1s !== null && m1e !== null && m1e > m1s) breaks.push({ start: m1s, end: m1e });
    const m2s = timeToMinutes(settings.mola_2_start);
    const m2e = timeToMinutes(settings.mola_2_end);
    if (m2s !== null && m2e !== null && m2e > m2s) breaks.push({ start: m2s, end: m2e });
    return breaks;
}

function getElapsedBreakMinutes(nowMin, startMin, breaks) {
    let total = 0;
    for (const b of breaks) {
        if (b.start < startMin) continue;
        if (nowMin <= b.start) continue;
        const bEnd = Math.min(nowMin, b.end);
        const bStart = Math.max(b.start, startMin);
        if (bEnd > bStart) total += bEnd - bStart;
    }
    return total;
}

function getFutureBreakMinutes(nowMin, endMin, breaks) {
    let total = 0;
    for (const b of breaks) {
        if (b.end <= nowMin) continue;
        if (b.start >= endMin) continue;
        const bStart = Math.max(b.start, nowMin);
        const bEnd = Math.min(b.end, endMin);
        if (bEnd > bStart) total += bEnd - bStart;
    }
    return total;
}

// Calculate actual average kesim duration from completed slaughter timestamps
function calcKesimAverage(slaughterData) {
    const completed = slaughterData
        .filter(r => r.status === 'completed' && r.last_updated)
        .map(r => new Date(r.last_updated).getTime())
        .sort((a, b) => a - b);

    if (completed.length < 2) return null;

    // Average gap between consecutive completions
    let totalGap = 0;
    for (let i = 1; i < completed.length; i++) {
        totalGap += completed[i] - completed[i - 1];
    }
    const avgMs = totalGap / (completed.length - 1);
    return avgMs / 60000; // convert to minutes
}

// Calculate actual average parcalama duration from started_at/completed_at
function calcParcalamaAverage(processingData) {
    const durations = processingData
        .filter(r => r.status === 'completed' && r.started_at && r.completed_at)
        .map(r => {
            const start = new Date(r.started_at).getTime();
            const end = new Date(r.completed_at).getTime();
            return (end - start) / 60000; // minutes
        })
        .filter(d => d > 0);

    if (durations.length === 0) return null;
    return durations.reduce((a, b) => a + b, 0) / durations.length;
}

function calcPerformance(nowMin, startMin, unitDuration, totalCount, completedCount, breaks, parallelCount) {
    if (nowMin < startMin) return { started: false };
    const p = parallelCount || 1;

    const elapsed = nowMin - startMin;
    const breakElapsed = getElapsedBreakMinutes(nowMin, startMin, breaks);
    const effectiveMinutes = Math.max(0, elapsed - breakElapsed);

    // With parallel masas: every unitDuration minutes, p kurbans complete
    const planned = Math.min(Math.floor(effectiveMinutes / unitDuration) * p, totalCount);
    const diff = completedCount - planned;

    const remaining = totalCount - completedCount;
    // ETA: remaining kurbans / parallel count * duration per kurban
    const workMinutes = Math.ceil(remaining / p) * unitDuration;
    const futureBreaks = getFutureBreakMinutes(nowMin, nowMin + workMinutes + 120, breaks);
    const etaTotal = workMinutes + futureBreaks;
    const etaTime = minutesToTime(nowMin + etaTotal);

    const pct = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;

    return { started: true, planned, diff, remaining, etaTime, pct, effectiveMinutes };
}

function renderPerformance(settings, kesim, parcalama, parcalamaWaiting, totalKurban, kesimAvg, parcalamaAvg) {
    const startMin = timeToMinutes(settings.kesim_start_time);
    const kesimDur = parseInt(settings.kesim_suresi) || 0;
    const parcDur = parseInt(settings.parcalama_suresi) || 0;
    const masaCount = parseInt(settings.masa_count) || 1;

    if (startMin === null || kesimDur <= 0 || parcDur <= 0 || totalKurban <= 0) {
        document.getElementById('perfSection').style.display = 'none';
        return;
    }

    document.getElementById('perfSection').style.display = '';
    const breaks = getBreaks(settings);
    const now = new Date();
    const nowMin = now.getHours() * 60 + now.getMinutes();
    const nowStr = minutesToTime(nowMin);

    // Kesim perf (sequential - one at a time)
    const activeKesim = totalKurban - kesim.cancelled;
    const kp = calcPerformance(nowMin, startMin, kesimDur, activeKesim, kesim.completed, breaks, 1);
    const kesimEl = document.getElementById('kesimPerf');

    // Kesim ETA with actual average
    let kesimEta = kp.etaTime;
    if (kesimAvg && kp.started && kp.remaining > 0) {
        const workMin = kp.remaining * kesimAvg;
        const fb = getFutureBreakMinutes(nowMin, nowMin + workMin + 120, breaks);
        kesimEta = minutesToTime(nowMin + workMin + fb);
    }

    if (!kp.started) {
        kesimEl.innerHTML = `<div class="perf-not-started">Kesim henuz baslamadi (baslama: ${settings.kesim_start_time})</div>`;
    } else {
        const diffClass = kp.diff >= 0 ? 'perf-ahead' : 'perf-behind';
        const diffText = kp.diff >= 0 ? `+${kp.diff} ileride` : `${kp.diff} geride`;
        const barColor = kp.diff >= 0 ? '#4caf50' : '#ff9800';
        const avgRow = kesimAvg
            ? `<div class="perf-row"><span class="perf-label">Ort. kesim suresi</span><span class="perf-value">${formatDuration(kesimAvg)} (plan: ${kesimDur} dk)</span></div>`
            : '';
        kesimEl.innerHTML = `
            <div class="perf-row"><span class="perf-label">Saat</span><span class="perf-value">${nowStr}</span></div>
            <div class="perf-row"><span class="perf-label">Planlanan</span><span class="perf-value">${kp.planned} / ${activeKesim}</span></div>
            <div class="perf-row"><span class="perf-label">Gerceklesen</span><span class="perf-value">${kesim.completed} / ${activeKesim}</span></div>
            <div class="perf-row"><span class="perf-label">Fark</span><span class="${diffClass}">${diffText}</span></div>
            ${avgRow}
            <div class="perf-row"><span class="perf-label">Kalan</span><span class="perf-value">${kesim.waiting} kesilecek, ${kesim.cancelled} iptal</span></div>
            <div class="perf-row"><span class="perf-label">Tahmini bitis</span><span class="perf-value">${kp.remaining > 0 ? kesimEta : 'Tamamlandi'}</span></div>
            <div class="perf-bar-container"><div class="perf-bar" style="width:${Math.max(kp.pct, 2)}%; background:${barColor};">${kp.pct}%</div></div>
        `;
    }

    // Parcalama perf - parallel masas, starts after first kurban is slaughtered
    const parcStartMin = startMin + kesimDur;
    const parcTotal = totalKurban - kesim.cancelled;
    const parcCompleted = parcalama.completed;
    const pp = calcPerformance(nowMin, parcStartMin, parcDur, parcTotal, parcCompleted, breaks, masaCount);
    const parcEl = document.getElementById('parcalamaPerf');

    // Parcalama ETA with actual average
    let parcEta = pp.etaTime;
    if (parcalamaAvg && pp.started && pp.remaining > 0) {
        const workMin = Math.ceil(pp.remaining / masaCount) * parcalamaAvg;
        const fb = getFutureBreakMinutes(nowMin, nowMin + workMin + 120, breaks);
        parcEta = minutesToTime(nowMin + workMin + fb);
    }

    if (!pp.started) {
        parcEl.innerHTML = `<div class="perf-not-started">Parcalama henuz baslamadi (baslama: ${minutesToTime(parcStartMin)})</div>`;
    } else {
        const diffClass = pp.diff >= 0 ? 'perf-ahead' : 'perf-behind';
        const diffText = pp.diff >= 0 ? `+${pp.diff} ileride` : `${pp.diff} geride`;
        const barColor = pp.diff >= 0 ? '#4caf50' : '#ff9800';
        const avgRow = parcalamaAvg
            ? `<div class="perf-row"><span class="perf-label">Ort. isleme suresi</span><span class="perf-value">${formatDuration(parcalamaAvg)} (plan: ${parcDur} dk)</span></div>`
            : '';
        parcEl.innerHTML = `
            <div class="perf-row"><span class="perf-label">Saat</span><span class="perf-value">${nowStr}</span></div>
            <div class="perf-row"><span class="perf-label">Planlanan</span><span class="perf-value">${pp.planned} / ${parcTotal}</span></div>
            <div class="perf-row"><span class="perf-label">Gerceklesen</span><span class="perf-value">${parcCompleted} / ${parcTotal}</span></div>
            <div class="perf-row"><span class="perf-label">Fark</span><span class="${diffClass}">${diffText}</span></div>
            ${avgRow}
            <div class="perf-row"><span class="perf-label">Kalan</span><span class="perf-value">${parcalama.processing} isleniyor, ${parcalamaWaiting} bekliyor (${masaCount} masa)</span></div>
            <div class="perf-row"><span class="perf-label">Tahmini bitis</span><span class="perf-value">${pp.remaining > 0 ? parcEta : 'Tamamlandi'}</span></div>
            <div class="perf-bar-container"><div class="perf-bar" style="width:${Math.max(pp.pct, 2)}%; background:${barColor};">${pp.pct}%</div></div>
        `;
    }
}

// ---- Charts ----

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
                    tooltip: chartTooltip,
                }
            },
            plugins: chartPlugins
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
                    tooltip: chartTooltip,
                }
            },
            plugins: chartPlugins
        });
    }
}

function startPolling() {
    pollTimer = setInterval(loadDashboard, 10000);
}

window.addEventListener('beforeunload', () => { if (pollTimer) clearInterval(pollTimer); });
