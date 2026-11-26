import { describe, expect, it, vi } from "vitest";

vi.stubGlobal("document", { getElementById: () => null });
const { contributors, percentDone } = await import("./ui");

describe("percentDone", () => {
  it("rounds down so 100% means every tile is done", () => {
    expect(percentDone(11999, 12000)).toBe("99% done");
    expect(percentDone(12000, 12000)).toBe("100% done");
  });

  it("shows a plain percent, without a less-than sign", () => {
    expect(percentDone(9, 12000)).toBe("0% done");
    expect(percentDone(600, 12000)).toBe("5% done");
  });
});

describe("contributors", () => {
  it("counts people and stays empty when the API does not send a count", () => {
    expect(contributors(1)).toBe("1 contributor");
    expect(contributors(1200)).toBe("1,200 contributors");
    expect(contributors(undefined)).toBe("");
  });
});
