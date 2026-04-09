// Panel Navigation Component
function renderNav(currentPage) {
    const user = getUser();
    if (!user) return;

    const permissions = user.permissions || [];

    const allLinks = [
        { id: 'kesim', label: 'Kesim', href: 'kesim.html', permission: 'kesim' },
        { id: 'parcalama', label: 'Parcalama', href: 'parcalama.html', permission: 'parcalama' },
        { id: 'masalar', label: 'Masalar', href: 'masalar.html', permission: 'masalar' },
        { id: 'durum', label: 'Durum', href: 'durum.html', permission: 'durum' },
        { id: 'canli-yayin', label: 'Canli Yayin', href: 'canli-yayin.html', permission: 'canli_yayin' },
        { id: 'mesajlar', label: 'Mesajlar', href: 'mesajlar.html', permission: 'mesaj' },
        { id: 'videolar', label: 'Videolar', href: 'videolar.html', permission: 'videolar' },
        { id: 'admin', label: 'Ayarlar', href: 'admin.html', adminOnly: true },
    ];

    const links = allLinks.filter(l => {
        if (l.adminOnly) return user.role === 'admin';
        return permissions.includes(l.permission);
    });

    const nav = document.getElementById('panel-nav');
    if (!nav) return;

    nav.innerHTML = `
        <div class="panel-header-inner">
            <a href="kesim.html" class="panel-logo">
                <img src="../assets/images/logo.png" alt="Logo" width="36" height="36">
                <span>Kurban Panel</span>
            </a>
            <div class="panel-nav-links">
                ${links.map(l => `<a href="${l.href}" class="${l.id === currentPage ? 'active' : ''}">${l.label}</a>`).join('')}
            </div>
            <div class="panel-user-info">
                <span class="panel-user-name">${user.display_name}</span>
                <span class="panel-user-role">${user.role}</span>
                <button onclick="logout()" class="panel-logout-btn">Cikis</button>
            </div>
            <button class="panel-menu-toggle" onclick="togglePanelMenu()">&#9776;</button>
        </div>
        <div class="panel-mobile-menu" id="panelMobileMenu">
            ${links.map(l => `<a href="${l.href}" class="${l.id === currentPage ? 'active' : ''}">${l.label}</a>`).join('')}
            <div class="panel-mobile-user">
                <span>${user.display_name} (${user.role})</span>
                <button onclick="logout()">Cikis</button>
            </div>
        </div>
    `;
}

function togglePanelMenu() {
    const menu = document.getElementById('panelMobileMenu');
    if (menu) menu.classList.toggle('open');
}
