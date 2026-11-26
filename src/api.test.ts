import { afterEach, describe, expect, it, vi } from "vitest";

import { doneBits, getProject, listProjects, saveListForOffline } from "./api";

const saved = new Map<string, ArrayBuffer>();
let storageFull = false;

vi.mock("./store", () => ({
  getFile: async (url: string) => saved.get(url),
  putFile: async (url: string, data: ArrayBuffer) => {
    if (storageFull) throw new DOMException("full", "QuotaExceededError");
    saved.set(url, data);
  },
}));

const body = (value: unknown) =>
  new TextEncoder().encode(JSON.stringify(value));
const offline = () => Promise.reject(new TypeError("Failed to fetch"));
const json = (value: unknown) =>
  new Response(body(value), {
    headers: { "Content-Type": "application/json" },
  });
const projects = { results: [{ id: 2, title: "Stellenbosch" }] };

describe("reads", () => {
  afterEach(() => {
    storageFull = false;
    saved.clear();
    vi.unstubAllGlobals();
  });

  it("serve the copy saved online when the network is gone", async () => {
    vi.stubGlobal("fetch", async () => json(projects));
    await listProjects();

    vi.stubGlobal("fetch", offline);

    expect(await listProjects()).toEqual(projects.results);
  });

  it("explain that a page was never saved when offline without a copy", async () => {
    vi.stubGlobal("fetch", offline);

    await expect(getProject("p2")).rejects.toThrow("not saved yet");
  });

  it("turn a 429 into a wait time in minutes", async () => {
    vi.stubGlobal(
      "fetch",
      async () =>
        new Response(null, { status: 429, headers: { "Retry-After": "363" } }),
    );

    await expect(getProject("p2")).rejects.toThrow("Try again in 7 minutes");
  });

  it("read a missing done.bin as nothing done", async () => {
    vi.stubGlobal("fetch", async () => new Response(null, { status: 404 }));

    expect(await doneBits("p2")).toEqual(new Uint8Array());
  });

  it("serve the saved copy when the server is rate limiting", async () => {
    vi.stubGlobal("fetch", async () => json(projects));
    await listProjects();
    vi.stubGlobal("fetch", async () => new Response(null, { status: 429 }));

    expect(await listProjects()).toEqual(projects.results);
  });

  it("explain a Wi-Fi sign-in page instead of failing to parse it", async () => {
    vi.stubGlobal(
      "fetch",
      async () =>
        new Response("<html>Login</html>", {
          headers: { "Content-Type": "text/html" },
        }),
    );

    await expect(getProject("p2")).rejects.toThrow("sign-in page");
  });

  it("serve the saved copy when the body download times out", async () => {
    vi.stubGlobal("fetch", async () => json(projects));
    await listProjects();
    const stalled = new ReadableStream({
      start(controller) {
        controller.error(new DOMException("signal timed out", "TimeoutError"));
      },
    });
    vi.stubGlobal(
      "fetch",
      async () =>
        new Response(stalled, {
          headers: { "Content-Type": "application/json" },
        }),
    );

    expect(await listProjects()).toEqual(projects.results);
  });

  it("keep the saved done.bin when a proxy answers with an HTML page", async () => {
    const bits = new Uint8Array([0b101]);
    vi.stubGlobal("fetch", async () => new Response(bits));
    await doneBits("p2");
    vi.stubGlobal(
      "fetch",
      async () =>
        new Response("<html>Login</html>", {
          headers: { "Content-Type": "text/html" },
        }),
    );

    expect(await doneBits("p2")).toEqual(bits);
  });

  it("still show what the network returned when the device is full", async () => {
    storageFull = true;
    vi.stubGlobal("fetch", async () => json(projects));

    expect(await listProjects()).toEqual(projects.results);
  });

  it("leave drafts out of the project list", async () => {
    const page = {
      results: [
        { id: 2, title: "Open", status: "published" },
        { id: 3, title: "Owner's draft", status: "draft" },
      ],
    };
    vi.stubGlobal("fetch", async () => json(page));

    expect((await listProjects()).map((project) => project.id)).toEqual([2]);
  });

  it("save the list and each project's page and progress for offline in one go", async () => {
    const bits = new Uint8Array([1]);
    const ids = new DataView(new ArrayBuffer(8));
    const open = {
      id: 2,
      slug: "p2",
      title: "Open",
      status: "published",
      description: "",
    };
    vi.stubGlobal("fetch", async (url: string) =>
      url.includes("tiles.bin")
        ? new Response(ids.buffer)
        : url.includes("done.bin")
          ? new Response(bits)
          : url.endsWith("/projects/p2/")
            ? json(open)
            : json({ results: [open] }),
    );
    await saveListForOffline();
    vi.stubGlobal("fetch", offline);

    expect((await listProjects()).map((project) => project.id)).toEqual([2]);
    expect(await getProject("p2")).toEqual(open);
    expect(await doneBits("p2")).toEqual(bits);
  });

  it("load each project's description images so the service worker keeps them", async () => {
    const loaded: string[] = [];
    vi.stubGlobal(
      "Image",
      class {
        set src(url: string) {
          loaded.push(url);
        }
      },
    );
    const described = {
      id: 2,
      slug: "p2",
      title: "Roofs",
      status: "published",
      description:
        'Is the roof right?\n\n| Yes | No |\n| :-: | :-: |\n| ![A metal roof](https://cdn.example.org/yes.webp) | ![A wrong roof](https://cdn.example.org/no.webp "Wrong") |\n\n[A link](https://tasks.example.org/projects/1)',
    };
    vi.stubGlobal("fetch", async (url: string) =>
      url.endsWith(".bin/")
        ? new Response(new ArrayBuffer(0))
        : json({ results: [described] }),
    );

    await saveListForOffline();

    expect(loaded).toEqual([
      "https://cdn.example.org/yes.webp",
      "https://cdn.example.org/no.webp",
    ]);
  });

  it("serve the saved copy when Safari aborts a timed-out read", async () => {
    vi.stubGlobal("fetch", async () => json(projects));
    await listProjects();
    vi.stubGlobal("fetch", () =>
      Promise.reject(new DOMException("Fetch is aborted", "AbortError")),
    );

    expect(await listProjects()).toEqual(projects.results);
  });
});
