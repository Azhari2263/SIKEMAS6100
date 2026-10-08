/**
 * SIKEMAS Service Worker (sw.js)
 * Hak Cipta 2026 BPS Provinsi Kalimantan Barat
 * Caching app-shell statis dan bypass permintaan API eksternal (network-only)
 */

const CACHE_VERSION = 'sikemas-pwa-v1.0.2';
const STATIC_CACHE_NAME = `${CACHE_VERSION}-static`;
const RUNTIME_CACHE_NAME = `${CACHE_VERSION}-runtime`;

// Aset app-shell inti yang di-precache saat instalasi
const APP_SHELL_ASSETS = [
  '/',
  '/index.html',
  '/offline.html',
  '/manifest.json',
  '/manifest.webmanifest',
  '/favicon.ico',
  '/apple-touch-icon.png',
  '/icons/icon.svg',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/icons/icon-maskable-512.png',
  '/icons/apple-touch-icon.png',
  '/icons/favicon-32.png'
];

// Host CDN statis untuk pustaka tampilan & font
const CDN_STATIC_HOSTS = [
  'fonts.googleapis.com',
  'fonts.gstatic.com',
  'cdnjs.cloudflare.com',
  'cdn.tailwindcss.com'
];

// 1. Install event: Simpan aset app-shell ke dalam cache
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE_NAME)
      .then((cache) => {
        return cache.addAll(APP_SHELL_ASSETS);
      })
      .then(() => {
        return self.skipWaiting();
      })
      .catch((error) => {
        console.warn('[SW] Gagal melakukan precache app-shell:', error);
      })
  );
});

// 2. Activate event: Hapus cache versi usang & ambil alih kontrol client
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (!cacheName.startsWith(CACHE_VERSION)) {
            console.log('[SW] Menghapus cache versi lama:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => {
      return self.clients.claim();
    })
  );
});

// 3. Listener pesan SKIP_WAITING dari aplikasi
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

// Helper: Cek apakah permintaan harus di-bypass (Network-Only)
function isBypassApiRequest(url, request) {
  // Semua method non-GET (POST, PUT, DELETE, PATCH, dll) adalah API/mutasi data
  if (request.method !== 'GET') {
    return true;
  }

  // Permintaan ke endpoint API lokal /api
  if (url.pathname.startsWith('/api')) {
    return true;
  }

  // Permintaan ke API eksternal (Google Apps Script / Sheets / Cloud Functions)
  if (url.hostname.includes('script.google.com') ||
      url.hostname.includes('googleusercontent.com') ||
      (url.hostname.includes('googleapis.com') && !url.hostname.includes('fonts.googleapis.com'))) {
    return true;
  }

  return false;
}

// 4. Fetch event: Penanganan permintaan jaringan & strategi cache
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // A. BYPASS API EKSTERNAL & NON-GET (NETWORK-ONLY TANPA CACHE)
  if (isBypassApiRequest(url, request)) {
    // Return langsung tanpa event.respondWith() agar browser memproses request
    // menggunakan network stack native (mematuhi CORS redirect 302 Google Apps Script)
    return;
  }

  // B. NAVIGASI HALAMAN (HTML): Network-First, fallback ke cache, lalu offline.html
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200) {
            const responseClone = networkResponse.clone();
            caches.open(STATIC_CACHE_NAME).then((cache) => {
              cache.put(request, responseClone);
            });
          }
          return networkResponse;
        })
        .catch(async () => {
          const cachedResponse = await caches.match(request);
          if (cachedResponse) {
            return cachedResponse;
          }
          const offlinePage = await caches.match('/offline.html');
          if (offlinePage) {
            return offlinePage;
          }
          return new Response('Aplikasi SIKEMAS sedang offline.', {
            headers: { 'Content-Type': 'text/plain; charset=utf-8' }
          });
        })
    );
    return;
  }

  // C. APP-SHELL STATIS & CDN ASSETS: Cache-First dengan validasi latar belakang
  const isCdn = CDN_STATIC_HOSTS.some((host) => url.hostname.includes(host));
  const isStaticAsset = url.pathname.match(/\.(png|jpg|jpeg|svg|gif|ico|webp|woff|woff2|ttf|css|js|json|webmanifest)$/i);

  if (isCdn || isStaticAsset) {
    event.respondWith(
      caches.match(request).then((cachedResponse) => {
        if (cachedResponse) {
          // Revalidasi di latar belakang jika koneksi tersedia
          fetch(request).then((networkResponse) => {
            if (networkResponse && (networkResponse.status === 200 || networkResponse.type === 'opaque')) {
              caches.open(RUNTIME_CACHE_NAME).then((cache) => cache.put(request, networkResponse));
            }
          }).catch(() => {});
          return cachedResponse;
        }

        return fetch(request)
          .then((networkResponse) => {
            if (networkResponse && (networkResponse.status === 200 || networkResponse.type === 'opaque')) {
              const responseClone = networkResponse.clone();
              caches.open(RUNTIME_CACHE_NAME).then((cache) => {
                cache.put(request, responseClone);
              });
            }
            return networkResponse;
          })
          .catch(() => {
            if (request.destination === 'image') {
              return caches.match('/icons/icon-192.png');
            }
            return new Response('', { status: 408, statusText: 'Request timed out' });
          });
      })
    );
    return;
  }

  // D. DEFAULT: Network dengan Fallback Cache
  event.respondWith(
    fetch(request)
      .then((networkResponse) => {
        if (networkResponse && networkResponse.status === 200) {
          const responseClone = networkResponse.clone();
          caches.open(RUNTIME_CACHE_NAME).then((cache) => {
            cache.put(request, responseClone);
          });
        }
        return networkResponse;
      })
      .catch(() => caches.match(request))
  );
});
