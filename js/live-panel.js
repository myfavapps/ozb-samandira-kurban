const statusConfig = {
    waiting: { text: 'Bekliyor', icon: '⏳', class: 'status-waiting' },
    in_progress: { text: 'Kesiliyor', icon: '🔪', class: 'status-in-progress' },
    completed: { text: 'Tamamlandı', icon: '✅', class: 'status-completed' },
    cancelled: { text: 'İptal Edildi', icon: '❌', class: 'status-cancelled' }
};

let statusSubscription;
let announcementSubscription;

document.addEventListener('DOMContentLoaded', async () => {
    await loadInitialData();
    setupRealtimeSubscriptions();
});

async function loadInitialData() {
    const status = await getCurrentStatus();
    if (status) updateStatusDisplay(status);
    
    const announcements = await getAnnouncements();
    if (announcements && announcements.length > 0) {
        updateAnnouncement(announcements[0]);
    }
}

function setupRealtimeSubscriptions() {
    statusSubscription = subscribeToStatus((newStatus) => {
        updateStatusDisplay(newStatus);
    });
    announcementSubscription = subscribeToAnnouncements((newAnnouncement) => {
        updateAnnouncement(newAnnouncement);
    });
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
});
