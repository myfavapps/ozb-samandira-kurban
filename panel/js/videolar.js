// Video Yonetimi Panel JS

let videos = [];

document.addEventListener('DOMContentLoaded', async () => {
    if (!requirePermission('videolar')) return;
    renderNav('videolar');
    await loadVideos();
});

async function loadVideos() {
    try {
        const result = await panelAPI('list-videos');
        videos = result.videos || [];
        renderTable();
    } catch (e) {
        console.error('Video load error:', e);
        document.getElementById('videosBody').innerHTML =
            '<tr><td colspan="4" style="text-align:center;color:#e74c3c;">Yuklenemedi</td></tr>';
    }
}

function renderTable() {
    const tbody = document.getElementById('videosBody');
    const totalEl = document.getElementById('totalCount');
    totalEl.textContent = videos.length;

    if (videos.length === 0) {
        tbody.innerHTML = '<tr><td colspan="4" style="text-align:center;color:var(--text-light);">Henuz video yok</td></tr>';
        return;
    }

    tbody.innerHTML = videos.map(v => {
        const shortUrl = v.cloudinary_url.length > 50
            ? v.cloudinary_url.substring(0, 50) + '...'
            : v.cloudinary_url;
        const date = v.uploaded_at
            ? new Date(v.uploaded_at).toLocaleDateString('tr-TR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
            : '-';
        return `<tr>
            <td style="font-weight:600;">#${v.kurban_number}</td>
            <td><a href="${v.cloudinary_url}" target="_blank" style="color:var(--primary);text-decoration:none;">${shortUrl}</a></td>
            <td>${date}</td>
            <td><button class="btn btn-danger btn-sm" onclick="deleteVideo(${v.id}, ${v.kurban_number})">Sil</button></td>
        </tr>`;
    }).join('');
}

async function deleteVideo(id, kurbanNo) {
    if (!confirm(`Kurban #${kurbanNo} videosunu silmek istediginize emin misiniz?`)) return;

    try {
        await panelAPI('delete-video', { video_id: id });
        showToast(`Kurban #${kurbanNo} videosu silindi`);
        await loadVideos();
    } catch (e) {
        showToast('Hata: ' + (e.message || 'Silinemedi'), true);
    }
}

async function addVideo() {
    const kurbanNo = parseInt(document.getElementById('addKurbanNo').value);
    const url = document.getElementById('addVideoUrl').value.trim();

    if (!kurbanNo || kurbanNo < 1) {
        showToast('Gecerli kurban numarasi girin', true);
        return;
    }
    if (!url || !url.startsWith('http')) {
        showToast('Gecerli bir URL girin', true);
        return;
    }

    try {
        await panelAPI('add-video', { kurban_number: kurbanNo, cloudinary_url: url });
        showToast(`Kurban #${kurbanNo} videosu eklendi`);
        document.getElementById('addKurbanNo').value = '';
        document.getElementById('addVideoUrl').value = '';
        await loadVideos();
    } catch (e) {
        showToast('Hata: ' + (e.message || 'Eklenemedi'), true);
    }
}

function showToast(msg, isError) {
    const t = document.getElementById('toast');
    t.textContent = msg;
    t.className = 'toast show' + (isError ? ' error' : '');
    setTimeout(() => t.className = 'toast', 3000);
}
