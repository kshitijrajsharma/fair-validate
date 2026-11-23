import { describe, expect, it } from "vitest";

import { classColors } from "./render";

const eight = {
  property: "class",
  values: ["a", "b", "c", "d", "e", "f", "g", "h"],
};

describe("classColors", () => {
  it("keeps a class's colour from tile to tile", () => {
    expect(classColors(eight, ["h"]).get("h")).toBe(
      classColors(eight, ["a", "c", "h"]).get("h"),
    );
  });

  it("gives two classes on one tile different colours when they share a palette slot", () => {
    const colors = classColors(eight, ["a", "g"]);

    expect(new Set(colors.values()).size).toBe(2);
    expect(colors.get("a")).toBe(classColors(eight, ["a"]).get("a"));
  });
});
