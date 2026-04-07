const statusConfig = {
    waiting: { text: 'Bekliyor', icon: '⏳', class: 'status-waiting' },
    in_progress: { text: 'Kesiliyor', icon: '🔪', class: 'status-in-progress' },
    completed: { text: 'Tamamlandı', icon: '✅', class: 'status-completed' },
    cancelled: { text: 'İptal Edildi', icon: '❌', class: 'status-cancelled' }
};

let statusSubscription;
let announcementSubscription;
let pollInterval;
let lastStatusJson = '';
let lastAnnouncementJson = '';
let lastStreamActive = null;
let streamHls = null;
const STREAM_HLS_URL = 'https://stream.samandirakurban.com/live/stream/index.m3u8';

document.addEventListener('DOMContentLoaded', async () => {
    await loadInitialData();
    setupRealtimeSubscriptions();
    startPolling();
});

async function loadInitialData() {
    const status = await getCurrentStatus();
    if (status) {
        updateStatusDisplay(status);
        lastStatusJson = JSON.stringify(status);
    }

    const announcements = await getAnnouncements();
    if (announcements && announcements.length > 0) {
        updateAnnouncement(announcements[0]);
        lastAnnouncementJson = JSON.stringify(announcements[0]);
    }

    // Load stream status
    const streamStatus = await getStreamStatus();
    updateStreamDisplay(streamStatus.active);
}

function setupRealtimeSubscriptions() {
    try {
        statusSubscription = subscribeToStatus((newStatus) => {
            updateStatusDisplay(newStatus);
            lastStatusJson = JSON.stringify(newStatus);
        });
        announcementSubscription = subscribeToAnnouncements((newAnnouncement) => {
            updateAnnouncement(newAnnouncement);
            lastAnnouncementJson = JSON.stringify(newAnnouncement);
        });
    } catch (e) {
        console.warn('Realtime subscription failed, polling active:', e);
    }
}

function startPolling() {
    pollInterval = setInterval(async () => {
        try {
            const status = await getCurrentStatus();
            if (status) {
                const json = JSON.stringify(status);
                if (json !== lastStatusJson) {
                    updateStatusDisplay(status);
                    lastStatusJson = json;
                }
            }

            const announcements = await getAnnouncements();
            if (announcements && announcements.length > 0) {
                const json = JSON.stringify(announcements[0]);
                if (json !== lastAnnouncementJson) {
                    updateAnnouncement(announcements[0]);
                    lastAnnouncementJson = json;
                }
            }

            // Poll stream status
            const streamStatus = await getStreamStatus();
            if (streamStatus.active !== lastStreamActive) {
                updateStreamDisplay(streamStatus.active);
            }
        } catch (e) {
            console.warn('Poll error:', e);
        }
    }, 5000);
}

function updateStatusDisplay(status) {
    const numberEl = document.getElementById('current-number');
    const statusTextEl = document.getElementById('status-text');
    const statusBadgeEl = document.getElementById('status-badge');
    const lastUpdatedEl = document.getElementById('last-updated');

    if (!status) return;

    numberEl.textContent = status.current_number || '--';
    const config = statusConfig[status.status] || statusConfig.waiting;
    statusTextEl.textContent = config.text;
    statusBadgeEl.querySelector('.status-icon').textContent = config.icon;
    statusBadgeEl.className = 'status-badge ' + config.class;

    if (status.last_updated) {
        lastUpdatedEl.textContent = new Date(status.last_updated).toLocaleTimeString('tr-TR');
    }
}

function updateAnnouncement(announcement) {
    const announcementEl = document.getElementById('announcement-text');
    if (announcement && announcement.message) {
        announcementEl.textContent = announcement.message;
    }
}

window.addEventListener('beforeunload', () => {
    if (statusSubscription) statusSubscription.unsubscribe();
    if (announcementSubscription) announcementSubscription.unsubscribe();
    if (pollInterval) clearInterval(pollInterval);
    if (streamHls) streamHls.destroy();
});

// ---- Live Stream Display ----

function updateStreamDisplay(active) {
    lastStreamActive = active;
    const section = document.getElementById('canli-yayin');
    const video = document.getElementById('live-stream-video');
    if (!section || !video) return;

    if (active) {
        section.style.display = 'block';
        initStreamPlayer(video);
    } else {
        section.style.display = 'none';
        destroyStreamPlayer(video);
    }
}

function initStreamPlayer(video) {
    if (streamHls) return; // Already initialized

    if (typeof Hls !== 'undefined' && Hls.isSupported()) {
        streamHls = new Hls({ enableWorker: true, lowLatencyMode: true });
        streamHls.loadSource(STREAM_HLS_URL);
        streamHls.attachMedia(video);
        streamHls.on(Hls.Events.MANIFEST_PARSED, () => {
            video.play().catch(() => {});
        });
        streamHls.on(Hls.Events.ERROR, (_event, data) => {
            if (data.fatal && data.type === Hls.ErrorTypes.NETWORK_ERROR) {
                // Stream not available yet, retry after delay
                setTimeout(() => {
                    if (streamHls) streamHls.loadSource(STREAM_HLS_URL);
                }, 5000);
            }
        });
    } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
        // Safari native HLS
        video.src = STREAM_HLS_URL;
        video.addEventListener('loadedmetadata', () => {
            video.play().catch(() => {});
        });
    }
}

function destroyStreamPlayer(video) {
    if (streamHls) {
        streamHls.destroy();
        streamHls = null;
    }
    video.src = '';
    video.load();
}

function toggleStreamFullscreen() {
    const video = document.getElementById('live-stream-video');
    if (!video) return;
    if (video.requestFullscreen) {
        video.requestFullscreen();
    } else if (video.webkitRequestFullscreen) {
        video.webkitRequestFullscreen();
    } else if (video.webkitEnterFullscreen) {
        video.webkitEnterFullscreen(); // iOS
    }
}
