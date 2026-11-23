import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { Answer } from "./store";

const pending: Answer[] = [
  { projectId: 1, tileId: 7, valid: true, at: 1, guest: "g" },
];
const postAnswers = vi.fn(async () => 204);

vi.mock("./send", () => ({ postAnswers }));
vi.mock("./store", () => ({
  pendingAnswers: async () => [...pending],
  removeSent: async () => undefined,
}));

function withBackgroundSync(register: () => Promise<void>) {
  vi.stubGlobal("navigator", {
    serviceWorker: {
      controller: {},
      ready: Promise.resolve({ sync: { register } }),
    },
  });
}

describe("answered", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    postAnswers.mockClear();
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it.each(["UnknownError", "NotAllowedError"])(
    "still sends in the foreground when Background Sync rejects with %s",
    async (name) => {
      withBackgroundSync(() =>
        Promise.reject(new DOMException("Background Sync is disabled.", name)),
      );
      const { answered } = await import("./sync");

      await answered();
      await vi.advanceTimersByTimeAsync(5_000);

      expect(postAnswers).toHaveBeenCalledWith(1, pending, false);
    },
  );

  it("surfaces any other Background Sync failure after scheduling the send", async () => {
    withBackgroundSync(() => Promise.reject(new TypeError("broken")));
    const { answered } = await import("./sync");

    await expect(answered()).rejects.toThrow("broken");
    await vi.advanceTimersByTimeAsync(5_000);

    expect(postAnswers).toHaveBeenCalledWith(1, pending, false);
  });
});
