import { describe, expect, it } from "vitest";

import { BATCH_SIZE, backoff, flush } from "./outbox";
import type { Answer } from "./store";

const answer = (projectSlug: string, tileId: number): Answer => ({
  projectSlug,
  tileId,
  valid: true,
  at: 1,
  guest: "g",
});

function harness(answers: Answer[], statuses: (number | Error)[]) {
  const pending = [...answers];
  const posted: Answer[][] = [];
  return {
    pending,
    posted,
    deps: {
      pending: async () => [...pending],
      removeSent: async (sent: Answer) => {
        pending.splice(pending.indexOf(sent), 1);
      },
      post: async (_projectSlug: string, batch: Answer[]) => {
        posted.push(batch);
        const status = statuses.shift() ?? 204;
        if (status instanceof Error) throw status;
        return status;
      },
    },
  };
}

describe("flush", () => {
  it("sends each project in batches of at most 50 and empties the outbox", async () => {
    const answers = [
      ...Array.from({ length: BATCH_SIZE + 3 }, (_, i) => answer("p1", i)),
      answer("p2", 0),
    ];
    const { deps, pending, posted } = harness(answers, []);

    const result = await flush(deps);

    expect(posted.map((batch) => batch.length)).toEqual([BATCH_SIZE, 3, 1]);
    expect(result).toEqual({
      sent: BATCH_SIZE + 4,
      rejected: 0,
      finished: [],
      retry: false,
    });
    expect(pending).toEqual([]);
  });

  it("keeps everything and asks to retry when the network fails", async () => {
    const { deps, pending } = harness(
      [answer("p1", 1)],
      [new TypeError("Failed to fetch")],
    );

    expect((await flush(deps)).retry).toBe(true);
    expect(pending).toHaveLength(1);
  });

  it("keeps answers and retries on a server error or a throttle", async () => {
    for (const status of [429, 500]) {
      const { deps, pending } = harness([answer("p1", 1)], [status]);
      expect((await flush(deps)).retry).toBe(true);
      expect(pending).toHaveLength(1);
    }
  });

  it("drops every answer of a finished project and reports it", async () => {
    const answers = Array.from({ length: BATCH_SIZE + 1 }, (_, i) =>
      answer("p3", i),
    );
    const { deps, pending, posted } = harness(answers, [410]);

    const result = await flush(deps);

    expect(posted).toHaveLength(1);
    expect(result.finished).toEqual(["p3"]);
    expect(result.rejected).toBe(BATCH_SIZE + 1);
    expect(pending).toEqual([]);
  });

  it("counts a rejected batch and still sends the next one", async () => {
    const answers = Array.from({ length: BATCH_SIZE + 1 }, (_, i) =>
      answer("p1", i),
    );
    const { deps } = harness(answers, [400, 204]);

    expect(await flush(deps)).toEqual({
      sent: 1,
      rejected: BATCH_SIZE,
      finished: [],
      retry: false,
    });
  });

  it("rethrows errors that are not network failures", async () => {
    const { deps } = harness([answer("p1", 1)], [new RangeError("bug")]);

    await expect(flush(deps)).rejects.toThrow("bug");
  });
});

describe("backoff", () => {
  it("doubles from 5 seconds and stops at 5 minutes", () => {
    expect([0, 1, 2, 10].map(backoff)).toEqual([
      5_000, 10_000, 20_000, 300_000,
    ]);
  });
});
