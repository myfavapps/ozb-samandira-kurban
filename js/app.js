async function searchVideo() {
    const numberInput = document.getElementById('video-number');
    const resultContainer = document.getElementById('video-result');
    const kurbanNumber = parseInt(numberInput.value);

    if (!kurbanNumber || kurbanNumber < 1) {
        resultContainer.innerHTML = '<p class="error">Lütfen geçerli bir kurban numarası girin.</p>';
        return;
    }

    resultContainer.innerHTML = '<p>Video aranıyor...</p>';

    try {
        const video = await getVideoByNumber(kurbanNumber);

        if (video && video.cloudinary_url) {
            resultContainer.innerHTML = `
                <div class="video-container">
                    <video controls autoplay>
                        <source src="${video.cloudinary_url}" type="video/mp4">
                        Tarayıcınız video oynatmayı desteklemiyor.
                    </video>
                </div>
                <p class="video-info">Kurban #${kurbanNumber}</p>
            `;
        } else {
            resultContainer.innerHTML = `
                <p class="not-found">
                    <strong>Kurban #${kurbanNumber}</strong> için video henüz yüklenmemiş.<br>
                    Video işleme süresi yaklaşık 15-30 dakikadır.
                </p>
            `;
        }
    } catch (error) {
        resultContainer.innerHTML = '<p class="error">Video aranırken bir hata oluştu.</p>';
    }
}

document.addEventListener('DOMContentLoaded', () => {
    const numberInput = document.getElementById('video-number');
    if (numberInput) {
        numberInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') searchVideo();
        });
    }

    // Mobile nav toggle
    const navToggle = document.querySelector('.nav-toggle');
    const nav = document.querySelector('.nav');
    if (navToggle && nav) {
        navToggle.addEventListener('click', () => nav.classList.toggle('active'));
        nav.querySelectorAll('a').forEach(a => {
            a.addEventListener('click', () => nav.classList.remove('active'));
        });
    }

    document.querySelectorAll('a[href^="#"]').forEach(anchor => {
        anchor.addEventListener('click', function (e) {
            e.preventDefault();
            const target = document.querySelector(this.getAttribute('href'));
            if (target) target.scrollIntoView({ behavior: 'smooth', block: 'start' });
        });
    });

    // Scroll animations
    const animEls = document.querySelectorAll('[data-anim]');
    if (animEls.length > 0 && 'IntersectionObserver' in window) {
        const observer = new IntersectionObserver((entries) => {
            entries.forEach((entry, i) => {
                if (entry.isIntersecting) {
                    setTimeout(() => entry.target.classList.add('visible'), i * 80);
                    observer.unobserve(entry.target);
                }
            });
        }, { threshold: 0.15, rootMargin: '0px 0px -40px 0px' });
        animEls.forEach(el => observer.observe(el));
    }

    // Header shrink on scroll
    const header = document.querySelector('.header');
    if (header) {
        let ticking = false;
        window.addEventListener('scroll', () => {
            if (!ticking) {
                requestAnimationFrame(() => {
                    header.classList.toggle('scrolled', window.scrollY > 60);
                    ticking = false;
                });
                ticking = true;
            }
        });
    }
});
