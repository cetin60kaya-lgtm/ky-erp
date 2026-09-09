// KY ERP legacy phone-approval service worker retirement stub.
// Dedicated approvals now belong only to /security/sw.js under /security/.
self.addEventListener("install", (event) => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    try {
      const notifications = await self.registration.getNotifications();
      notifications.forEach((notification) => notification.close());
    } catch {}
    try { await self.registration.unregister(); } catch {}
    try {
      const windows = await clients.matchAll({ type: "window", includeUncontrolled: true });
      await Promise.all(windows.map((client) => client.postMessage({ type: "KYERP_LEGACY_PHONE_PUSH_RETIRED" })));
    } catch {}
  })());
});
