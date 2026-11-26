import { postAnswers } from "./send";
import { backoff, flush, type FlushResult } from "./outbox";
import { pendingAnswers, removeSent } from "./store";

const SEND_AFTER_ANSWERS = 10;
const SEND_AFTER_MS = 5_000;

type Listener = (pending: number, result?: FlushResult) => void;

const listeners = new Set<Listener>();
let timer: ReturnType<typeof setTimeout> | undefined;
let failures = 0;
let running: Promise<void> | undefined;

async function notify(result?: FlushResult): Promise<void> {
  const pending = (await pendingAnswers()).length;
  listeners.forEach((listener) => listener(pending, result));
}

export function onSync(listener: Listener): () => void {
  listeners.add(listener);
  void notify();
  return () => listeners.delete(listener);
}

function schedule(delay: number): void {
  clearTimeout(timer);
  timer = setTimeout(() => void syncNow(), delay);
}

export function syncNow(keepalive = false): Promise<void> {
  running ??= (async () => {
    try {
      const result = await flush({
        pending: pendingAnswers,
        removeSent,
        post: (projectSlug, answers) =>
          postAnswers(projectSlug, answers, keepalive),
      });
      failures = result.retry ? failures + 1 : 0;
      if (result.retry) schedule(backoff(failures));
      await notify(result);
    } finally {
      running = undefined;
    }
  })();
  return running;
}

type SyncCapableRegistration = ServiceWorkerRegistration & {
  sync?: { register: (tag: string) => Promise<void> };
};

async function registerBackgroundSync(): Promise<void> {
  if (!("serviceWorker" in navigator && navigator.serviceWorker.controller))
    return;
  const registration = (await navigator.serviceWorker
    .ready) as SyncCapableRegistration;
  try {
    await registration.sync?.register("answers");
  } catch (error) {
    // NotAllowedError when sync is disabled (wicg.github.io/background-sync/spec); headless Chromium was seen to throw UnknownError.
    if (
      !(error instanceof DOMException) ||
      !["UnknownError", "NotAllowedError"].includes(error.name)
    )
      throw error;
  }
}

export async function answered(): Promise<void> {
  const pending = (await pendingAnswers()).length;
  if (pending >= SEND_AFTER_ANSWERS) void syncNow();
  else schedule(SEND_AFTER_MS);
  await notify();
  await registerBackgroundSync();
}

export function startSync(): void {
  window.addEventListener("online", () => void syncNow());
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") void syncNow(true);
  });
  window.addEventListener("pagehide", () => void syncNow(true));
  void syncNow();
}
