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
});
