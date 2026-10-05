/* SShedule notification service worker.

   Mobile browsers (Android Chrome, Capacitor WebView, iOS Safari) throw a
   TypeError from the Notification() constructor, so system notifications on
   mobile MUST be displayed through ServiceWorkerRegistration.showNotification()
   from this worker. Tapping a notification focuses (or opens) the app. */

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    (async () => {
      const clientList = await self.clients.matchAll({
        type: 'window',
        includeUncontrolled: true,
      });
      for (const client of clientList) {
        if ('focus' in client) return client.focus();
      }
      return (await self.clients.openWindow('/')) || undefined;
    })()
  );
});
