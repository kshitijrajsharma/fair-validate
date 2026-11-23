import { describe, expect, it } from "vitest";

import { gridLayout } from "./results";
import type { Tile } from "./tiles";

const tile = (x: number, y: number, index: number): Tile => ({
  id: index,
  index,
  z: 19,
  x,
  y,
});

describe("gridLayout", () => {
  it("keeps tiles in their map positions when they fit", () => {
    const grid = gridLayout([tile(10, 20, 0), tile(12, 21, 1)], 300, 200);

    expect([grid.columns, grid.rows]).toEqual([3, 2]);
    expect(grid.cells.map((cell) => [cell.column, cell.row])).toEqual([
      [0, 0],
      [2, 1],
    ]);
  });

  it("packs tiles from far-apart areas into a compact grid", () => {
    const grid = gridLayout(
      [tile(0, 0, 0), tile(90000, 70000, 1), tile(5, 5, 2)],
      300,
      200,
    );

    expect(grid.columns * grid.rows).toBeGreaterThanOrEqual(3);
    expect(grid.columns * grid.rows).toBeLessThan(9);
    expect(
      new Set(grid.cells.map((cell) => `${cell.column},${cell.row}`)).size,
    ).toBe(3);
  });
});
