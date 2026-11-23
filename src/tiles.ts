import { PMTiles, tileIdToZxy, type RangeResponse, type Source } from "pmtiles";

import { getTile, putTile } from "./store";

export type Tile = {
  id: number;
  index: number;
  z: number;
  x: number;
  y: number;
};
export type Layer = "imagery" | "labels";

export type LabelClasses = { property: string; values: string[] };

// tippecanoe writes each attribute's distinct values into the PMTiles metadata as tilestats.
export type LabelsMetadata = {
  tilestats?: {
    layers: { attributes: { attribute: string; values: unknown[] }[] }[];
  };
};

const SIGNED_URL_LIFETIME_MS = 10 * 60 * 1000;
const READ_TIMEOUT_MS = 10_000;

const withTimeout = (signal?: AbortSignal) =>
  signal
    ? AbortSignal.any([signal, AbortSignal.timeout(READ_TIMEOUT_MS)])
    : AbortSignal.timeout(READ_TIMEOUT_MS);

// Safari reports an AbortSignal.timeout expiry as AbortError, other browsers as TimeoutError.
export const unreachable = (error: unknown) =>
  error instanceof TypeError ||
  (error instanceof DOMException &&
    (error.name === "TimeoutError" || error.name === "AbortError"));

// A dataset keeps one class property per label; labels with several properties (OSM tags) stay one colour.
export function labelClasses(metadata: LabelsMetadata): LabelClasses {
  if (!metadata.tilestats) throw new Error("labels.pmtiles has no tilestats");
  const attributes = metadata.tilestats.layers[0]?.attributes ?? [];
  return attributes.length === 1
    ? {
        property: attributes[0].attribute,
        values: attributes[0].values.map(String).sort(),
      }
    : { property: "", values: [] };
}

class ProjectFileSource implements Source {
  private signed?: { url: string; at: number };

  constructor(private readonly url: string) {}

  getKey(): string {
    return this.url;
  }

  private async signedUrl(fresh = false): Promise<string> {
    if (
      !fresh &&
      this.signed &&
      Date.now() - this.signed.at < SIGNED_URL_LIFETIME_MS
    )
      return this.signed.url;
    const probe = await fetch(this.url, { headers: { Range: "bytes=0-0" } });
    if (!probe.ok) throw new Error(`${this.url} answered ${probe.status}`);
    this.signed = { url: probe.url, at: Date.now() };
    return probe.url;
  }

  async getBytes(
    offset: number,
    length: number,
    signal?: AbortSignal,
  ): Promise<RangeResponse> {
    const range = { Range: `bytes=${offset}-${offset + length - 1}` };
    let response = await fetch(await this.signedUrl(), {
      headers: range,
      signal: withTimeout(signal),
    });
    if (response.status === 403)
      response = await fetch(await this.signedUrl(true), {
        headers: range,
        signal: withTimeout(signal),
      });
    if (!response.ok)
      throw new Error(`This tile could not load (error ${response.status})`);
    return {
      data: await response.arrayBuffer(),
      etag: response.headers.get("ETag") ?? undefined,
    };
  }
}

export class ProjectTiles {
  private readonly files: Record<Layer, PMTiles>;

  constructor(
    private readonly projectId: number,
    fileUrl: (name: string) => string,
  ) {
    this.files = {
      imagery: new PMTiles(new ProjectFileSource(fileUrl("imagery.pmtiles"))),
      labels: new PMTiles(new ProjectFileSource(fileUrl("labels.pmtiles"))),
    };
  }

  private key(layer: Layer, tile: Tile): string {
    return `${this.projectId}/${layer}/${tile.id}`;
  }

  async get(layer: Layer, tile: Tile): Promise<ArrayBuffer | undefined> {
    const cached = await getTile(this.key(layer, tile));
    if (cached) return cached;
    const fetched = await this.files[layer].getZxy(tile.z, tile.x, tile.y);
    if (!fetched) return undefined;
    try {
      await putTile(this.key(layer, tile), fetched.data);
    } catch (error) {
      if (
        !(error instanceof DOMException && error.name === "QuotaExceededError")
      )
        throw error;
    }
    return fetched.data;
  }

  async classes(): Promise<LabelClasses> {
    const key = `${this.projectId}/classes`;
    const saved = await getTile(key);
    if (saved) return JSON.parse(new TextDecoder().decode(saved));
    const found = labelClasses(
      (await this.files.labels.getMetadata()) as LabelsMetadata,
    );
    try {
      await putTile(
        key,
        new TextEncoder().encode(JSON.stringify(found)).buffer,
      );
    } catch (error) {
      if (
        !(error instanceof DOMException && error.name === "QuotaExceededError")
      )
        throw error;
    }
    return found;
  }

  async save(tile: Tile): Promise<boolean> {
    await this.classes();
    const imagery = await this.get("imagery", tile);
    if (!imagery) return false;
    await this.get("labels", tile);
    return true;
  }
}

function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function readTileList(data: ArrayBuffer): Tile[] {
  const view = new DataView(data);
  return Array.from({ length: data.byteLength / 8 }, (_, index) => {
    const id = Number(view.getBigUint64(index * 8, true));
    const [z, x, y] = tileIdToZxy(id);
    return { id, index, z, x, y };
  });
}

export function tileOrder(list: Tile[], seed: number): Tile[] {
  const tiles = [...list];
  const random = mulberry32(seed);
  for (let i = tiles.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [tiles[i], tiles[j]] = [tiles[j], tiles[i]];
  }
  return tiles;
}

export function isDone(bits: Uint8Array, tile: Tile): boolean {
  return ((bits[tile.index >> 3] ?? 0) >> (tile.index & 7)) % 2 === 1;
}

export function countDone(bits: Uint8Array): number {
  let count = 0;
  for (const byte of bits) for (let b = byte; b; b >>= 1) count += b & 1;
  return count;
}

export function countProgress(
  bits: Uint8Array,
  list: Tile[],
  answered: Iterable<number>,
): number {
  const byId = new Map(list.map((tile) => [tile.id, tile]));
  let mine = 0;
  for (const tileId of answered) {
    const tile = byId.get(tileId);
    if (tile && !isDone(bits, tile)) mine++;
  }
  return countDone(bits) + mine;
}
