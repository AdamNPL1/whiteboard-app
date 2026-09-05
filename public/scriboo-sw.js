self.addEventListener("push", (event) => {
  const payload = event.data ? event.data.json() : {};
  const tag = payload.callId ? `scriboo-call-${payload.callId}` : "scriboo-call";
  if (payload.type === "dismiss-call") {
    event.waitUntil(self.registration.getNotifications({ tag }).then((notifications) => notifications.forEach((notification) => notification.close())));
    return;
  }
  const missed = payload.type === "missed-call";
  const title = missed ? "Missed Scriboo call" : `Incoming call from ${payload.callerName || "Scriboo user"}`;
  const body = missed ? `${payload.callerName || "Someone"} called about ${payload.boardName || "a board"}.` : payload.boardName || "Scriboo call";
  event.waitUntil(self.registration.showNotification(title, {
    body,
    tag,
    icon: "/icon.png",
    badge: "/favicon-48.png",
    renotify: !missed,
    requireInteraction: !missed,
    silent: payload.ringingEnabled === false,
    data: { callId: payload.callId, boardId: payload.boardId, url: `/custom?call=${encodeURIComponent(payload.callId || "")}&board=${encodeURIComponent(payload.boardId || "")}` },
    actions: missed ? [{ action: "open", title: "Open board" }] : [{ action: "answer", title: "Open call" }, { action: "dismiss", title: "Dismiss" }],
  }));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  if (event.action === "dismiss") return;
  const target = new URL(event.notification.data?.url || "/custom", self.location.origin).href;
  event.waitUntil(clients.matchAll({ type: "window", includeUncontrolled: true }).then(async (windows) => {
    const existing = windows.find((client) => client.url.startsWith(self.location.origin));
    if (existing) {
      await existing.focus();
      if ("navigate" in existing) await existing.navigate(target);
      return;
    }
    await clients.openWindow(target);
  }));
});
