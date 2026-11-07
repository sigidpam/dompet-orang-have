const CACHE_NAME = 'wealth-pwa-v1';
const ASSETS_TO_CACHE = [
    '/',
    '/index.html',
    'https://cdn.jsdelivr.net/npm/tailwindcss@2.2.19/dist/tailwind.min.css', // atau CDN Tailwind yang dipakai
    'https://cdn.tailwindcss.com',
    'https://unpkg.com/alpinejs@3.x.x/dist/cdn.min.js',
    'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500;700&display=swap'
];

// Install Service Worker & Cache Aset Statis
self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => {
            return cache.addAll(ASSETS_TO_CACHE);
        })
    );
    self.skipWaiting();
});

// Activate & Cleanup Old Caches
self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((keys) => {
            return Promise.all(
                keys.map((key) => {
                    if (key !== CACHE_NAME) {
                        return caches.delete(key);
                    }
                })
            );
        })
    );
    self.clients.claim();
});

// Fetch Strategy: Stale-While-Revalidate untuk API, Cache-First untuk Aset
self.addEventListener('fetch', (event) => {
    const url = new URL(event.request.url);
    
    // Jika request ke API backend atau Kurs Eksternal
    if (url.pathname.startsWith('/api/') || url.hostname.includes('exchangerate') || url.hostname.includes('bi.go.id')) {
        event.respondWith(
            fetch(event.request)
                .catch(() => {
                    // Fallback jika offline saat panggil API
                    return new Response(JSON.stringify({ error: "Offline mode: Menggunakan data lokal terakhir." }), {
                        headers: { 'Content-Type': 'application/json' }
                    });
                })
        );
        return;
    }

    // Untuk aset statis / halaman utama
    event.respondWith(
        caches.match(event.request).then((cachedResponse) => {
            return cachedResponse || fetch(event.request).then((response) => {
                return caches.open(CACHE_NAME).then((cache) => {
                    cache.put(event.request, response.clone());
                    return response;
                });
            });
        }).catch(() => {
            // Jika benar-benar offline dan belum ada di cache
            if (event.request.mode === 'navigate') {
                return caches.match('/');
            }
        })
    );
});

