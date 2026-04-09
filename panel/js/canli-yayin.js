// Canli Yayin Panel JS

const HLS_URL = 'https://stream.samandirakurban.com/live/stream/index.m3u8';
let streamActive = false;
let hlsPlayer = null;

document.addEventListener('DOMContentLoaded', async () => {
    if (!requirePermission('canli_yayin')) return;
    renderNav('canli-yayin');
    await loadStreamStatus();
});

async function loadStreamStatus() {
    try {
        const result = await panelAPI('get-settings');
        const settings = result.settings || {};
        streamActive = settings.live_stream_active === 'true';
        updateUI();
        if (streamActive) initPreview();
    } catch (e) {
        console.error('Stream status load error:', e);
    }
}

function updateUI() {
    const dot = document.getElementById('statusDot');
    const label = document.getElementById('statusLabel');
    const btn = document.getElementById('toggleBtn');

    if (streamActive) {
        dot.style.background = '#27ae60';
        label.textContent = 'YAYIN ACIK';
        label.style.color = '#27ae60';
        btn.textContent = 'Yayini Durdur';
        btn.className = 'btn btn-danger';
    } else {
        dot.style.background = '#e74c3c';
        label.textContent = 'YAYIN KAPALI';
        label.style.color = '#e74c3c';
        btn.textContent = 'Yayini Baslat';
        btn.className = 'btn btn-primary';
    }
}

async function toggleStream() {
    const btn = document.getElementById('toggleBtn');
    btn.disabled = true;
    btn.textContent = 'Isleniyor...';

    try {
        const result = await panelAPI('toggle-stream', { active: !streamActive });
        streamActive = result.active;
        updateUI();
        if (streamActive) {
            initPreview();
            showToast('Yayin aktif edildi');
        } else {
            destroyPreview();
            showToast('Yayin durduruldu');
        }
    } catch (e) {
        showToast('Hata: ' + (e.message || 'Bilinmeyen hata'), true);
    } finally {
        btn.disabled = false;
    }
}

function initPreview() {
    const video = document.getElementById('previewVideo');
    const placeholder = document.getElementById('previewPlaceholder');

    if (hlsPlayer) hlsPlayer.destroy();

    if (Hls.isSupported()) {
        hlsPlayer = new Hls({ enableWorker: true, lowLatencyMode: true });
        hlsPlayer.loadSource(HLS_URL);
        hlsPlayer.attachMedia(video);
        hlsPlayer.on(Hls.Events.MANIFEST_PARSED, () => {
            placeholder.style.display = 'none';
            video.play().catch(() => {});
        });
        hlsPlayer.on(Hls.Events.ERROR, (_event, data) => {
            if (data.fatal) {
                placeholder.style.display = 'block';
                placeholder.textContent = 'Yayin bulunamadi - RTMP yayini baslatilmamis olabilir';
            }
        });
    } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
        video.src = HLS_URL;
        video.addEventListener('loadedmetadata', () => {
            placeholder.style.display = 'none';
            video.play().catch(() => {});
        });
    }
}

function destroyPreview() {
    const video = document.getElementById('previewVideo');
    const placeholder = document.getElementById('previewPlaceholder');
    if (hlsPlayer) {
        hlsPlayer.destroy();
        hlsPlayer = null;
    }
    video.src = '';
    video.load();
    placeholder.style.display = 'block';
    placeholder.textContent = 'Yayin basladiginda burada gorunecek';
}

function showToast(msg, isError) {
    const t = document.getElementById('toast');
    t.textContent = msg;
    t.className = 'toast show' + (isError ? ' error' : '');
    setTimeout(() => t.className = 'toast', 3000);
}
