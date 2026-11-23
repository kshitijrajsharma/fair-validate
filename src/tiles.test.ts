import { zxyToTileId } from "pmtiles";
import { describe, expect, it } from "vitest";

import {
  countDone,
  countProgress,
  isDone,
  labelClasses,
  readTileList,
  tileOrder,
} from "./tiles";

const ids = [
  zxyToTileId(19, 233651, 245320),
  zxyToTileId(19, 233652, 245320),
  zxyToTileId(19, 280000, 300000),
].sort((a, b) => a - b);

function tilesBin(values: number[]): ArrayBuffer {
  const view = new DataView(new ArrayBuffer(values.length * 8));
  values.forEach((value, index) =>
    view.setBigUint64(index * 8, BigInt(value), true),
  );
  return view.buffer;
}

describe("readTileList", () => {
  it("reads little-endian tile ids in order with their place and position", () => {
    const tiles = readTileList(tilesBin(ids));

    expect(tiles.map((t) => t.id)).toEqual(ids);
    expect(tiles.map((t) => t.index)).toEqual([0, 1, 2]);
    for (const tile of tiles)
      expect(zxyToTileId(tile.z, tile.x, tile.y)).toBe(tile.id);
  });
});

describe("tileOrder", () => {
  const tiles = readTileList(tilesBin([...ids, ...ids.map((id) => id + 1e6)]));
  const order = (seed: number) => tileOrder(tiles, seed).map((t) => t.id);

  it("keeps every tile once", () => {
    const ascending = (values: number[]) => [...values].sort((a, b) => a - b);

    expect(ascending(order(42))).toEqual(ascending(tiles.map((t) => t.id)));
  });

  it("is stable for one seed and differs between seeds", () => {
    expect(order(7)).toEqual(order(7));
    expect(order(7)).not.toEqual(order(8));
  });
});

describe("done.bin", () => {
  const tiles = readTileList(tilesBin([...ids, ...ids.map((id) => id + 1e6)]));

  it("reads bit i as the i-th tile of tiles.bin, least significant bit first", () => {
    const bits = new Uint8Array([0b00101010]);

    expect(tiles.map((tile) => isDone(bits, tile))).toEqual([
      false,
      true,
      false,
      true,
      false,
      true,
    ]);
  });

  it("treats a missing or short file as nothing done", () => {
    expect(isDone(new Uint8Array(), tiles[5])).toBe(false);
  });

  it("counts the set bits", () => {
    expect(countDone(new Uint8Array([0b00101010, 0b1]))).toBe(4);
  });
});

describe("countProgress", () => {
  const tiles = readTileList(tilesBin(ids));
  const firstDone = new Uint8Array([0b001]);

  it("adds this device's answers on tiles the server has not counted yet", () => {
    expect(countProgress(firstDone, tiles, [ids[1]])).toBe(2);
  });

  it("does not count a tile twice or count tiles outside the project", () => {
    expect(countProgress(firstDone, tiles, [ids[0], 12345])).toBe(1);
  });
});

describe("labelClasses", () => {
  const stats = (attributes: { attribute: string; values: unknown[] }[]) => ({
    tilestats: { layers: [{ attributes }] },
  });

  it("returns the single label property and its values, sorted as text", () => {
    expect(
      labelClasses(
        stats([{ attribute: "class", values: ["metal", 3, "concrete"] }]),
      ),
    ).toEqual({ property: "class", values: ["3", "concrete", "metal"] });
  });

  it("returns no classes when labels carry several properties", () => {
    expect(
      labelClasses(
        stats([
          { attribute: "building", values: ["yes"] },
          { attribute: "class", values: ["a", "b"] },
        ]),
      ),
    ).toEqual({ property: "", values: [] });
  });

  it("returns no classes for a layer without properties", () => {
    expect(labelClasses(stats([]))).toEqual({ property: "", values: [] });
  });

  it("fails when the file has no tile stats", () => {
    expect(() => labelClasses({})).toThrow("no tilestats");
  });
});
