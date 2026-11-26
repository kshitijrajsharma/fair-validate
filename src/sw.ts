import { CacheableResponsePlugin } from "workbox-cacheable-response";
import { ExpirationPlugin } from "workbox-expiration";
import { cleanupOutdatedCaches, precacheAndRoute } from "workbox-precaching";
import { registerRoute } from "workbox-routing";
import { NetworkFirst } from "workbox-strategies";

import { flush } from "./outbox";
import { postAnswers } from "./send";
import { pendingAnswers, removeSent } from "./store";

declare const self: ServiceWorkerGlobalScope & {
  __WB_MANIFEST: Parameters<typeof precacheAndRoute>[0];
};

type SyncEvent = ExtendableEvent & { tag: string };

void self.skipWaiting();
self.addEventListener("activate", (event) =>
  event.waitUntil(self.clients.claim()),
);

cleanupOutdatedCaches();
precacheAndRoute(self.__WB_MANIFEST);
registerRoute(
  ({ request, url }) =>
    request.destination === "image" && url.origin !== self.location.origin,
  new NetworkFirst({
    cacheName: "description-images",
    plugins: [
      new CacheableResponsePlugin({ statuses: [0, 200] }),
      new ExpirationPlugin({ maxEntries: 30, purgeOnQuotaError: true }),
    ],
  }),
);

self.addEventListener("sync", (event) => {
  const sync = event as SyncEvent;
  if (sync.tag !== "answers") return;
  sync.waitUntil(
    flush({
      pending: pendingAnswers,
      removeSent,
      post: (projectSlug, answers) => postAnswers(projectSlug, answers),
    }).then((result) => {
      if (result.retry)
        throw new Error(
          "Answers not sent yet; the browser retries the sync later.",
        );
    }),
  );
});
