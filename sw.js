const CACHE = 'mirror-burger-v7';
const APP_SHELL = ['/', '/index.html', '/manifest.json', '/kitchen-manifest.json'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE)
      .then((cache) => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting())
      .catch(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('push', (event) => {
  let data = { title: 'Mirror Burger', body: '你有新訂單', url: '/kitchen.html' };
  try {
    if (event.data) data = { ...data, ...event.data.json() };
  } catch (_) {
    try {
      data.body = event.data.text();
    } catch (_) {}
  }

  event.waitUntil(
    self.registration.showNotification(data.title || 'Mirror Burger 新單', {
      body: data.body || '你有新訂單',
      icon: 'https://res.cloudinary.com/dnuhe2uwy/image/upload/c_pad,w_192,h_192,b_black/v1777801810/logo_only_kqxyfg.png',
      badge: 'https://res.cloudinary.com/dnuhe2uwy/image/upload/c_pad,w_192,h_192,b_black/v1777801810/logo_only_kqxyfg.png',
      data: { url: data.url || '/kitchen.html', orderNo: data.orderNo },
      vibrate: [200, 100, 200, 100, 200],
      requireInteraction: true,
      tag: data.orderNo ? `order-${data.orderNo}` : 'mirror-burger-order',
      renotify: true,
    })
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const target = (event.notification.data && event.notification.data.url) || '/kitchen.html';
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      for (const client of list) {
        if (client.url.includes('kitchen') && 'focus' in client) return client.focus();
      }
      if (clients.openWindow) return clients.openWindow(target);
    })
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);

  if (url.origin !== self.location.origin || url.pathname.startsWith('/api/')) {
    return;
  }

  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          const key = url.pathname.includes('kitchen') ? '/kitchen.html' : '/index.html';
          caches.open(CACHE).then((cache) => cache.put(key, copy));
          return res;
        })
        .catch(() => caches.match(url.pathname.includes('kitchen') ? '/kitchen.html' : '/index.html'))
    );
    return;
  }

  if (url.pathname.startsWith('/js/') || url.pathname.endsWith('.css') || url.pathname.endsWith('.js')) {
    event.respondWith(
      fetch(req)
        .then((res) => {
          if (res && res.status === 200 && res.type === 'basic') {
            const copy = res.clone();
            caches.open(CACHE).then((cache) => cache.put(req, copy));
          }
          return res;
        })
        .catch(() => caches.match(req))
    );
    return;
  }

  event.respondWith(
    caches.match(req).then((cached) => {
      if (cached) return cached;
      return fetch(req).then((res) => {
        if (res && res.status === 200 && res.type === 'basic') {
          const copy = res.clone();
          caches.open(CACHE).then((cache) => cache.put(req, copy));
        }
        return res;
      });
    })
  );
});
