/* Easyclz Student Portal — service worker for Web Push. */

self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

// Show the notification when a push arrives.
self.addEventListener('push', (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch (e) {
    payload = { title: 'Easyclz', body: event.data ? event.data.text() : '' };
  }

  const title = payload.title || 'Easyclz';
  const options = {
    body: payload.body || '',
    icon: '/icon.svg',
    badge: '/icon.svg',
    tag: payload.type || 'classpay',
    data: { type: payload.type, ...(payload.data || {}) },
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

// Route the tap to the right page.
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const type = event.notification.data && event.notification.data.type;
  let path = '/dashboard';
  if (type === 'chat') path = '/chat';
  else if (type === 'exam') path = '/exams';
  else if (type === 'note') path = '/dashboard';

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      for (const client of clients) {
        if ('focus' in client) {
          client.navigate(path);
          return client.focus();
        }
      }
      if (self.clients.openWindow) return self.clients.openWindow(path);
    })
  );
});
