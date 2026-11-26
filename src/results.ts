import type { Tile } from "./tiles";

export type Cell = { tile: Tile; column: number; row: number };
export type Grid = { columns: number; rows: number; cells: Cell[] };

const MIN_CELL_PX = 3;

export function gridLayout(
  list: Tile[],
  widthPx: number,
  maxHeightPx: number,
): Grid {
  const xs = list.map((tile) => tile.x);
  const ys = list.map((tile) => tile.y);
  const x0 = Math.min(...xs);
  const y0 = Math.min(...ys);
  const columns = Math.max(...xs) - x0 + 1;
  const rows = Math.max(...ys) - y0 + 1;
  if (Math.min(widthPx / columns, maxHeightPx / rows) >= MIN_CELL_PX)
    return {
      columns,
      rows,
      cells: list.map((tile) => ({
        tile,
        column: tile.x - x0,
        row: tile.y - y0,
      })),
    };
  const compact = Math.max(
    1,
    Math.ceil(Math.sqrt((list.length * widthPx) / maxHeightPx)),
  );
  return {
    columns: compact,
    rows: Math.ceil(list.length / compact),
    cells: list.map((tile, index) => ({
      tile,
      column: index % compact,
      row: Math.floor(index / compact),
    })),
  };
}

const COLORS = {
  done: "#198155",
  open: "#ffffff",
  edge: "#687075",
};

export function drawResults(
  canvas: HTMLCanvasElement,
  list: Tile[],
  isDone: (tile: Tile) => boolean,
  maxHeight = 200,
): void {
  const context = canvas.getContext("2d");
  if (!context || !list.length) return;
  const ratio = window.devicePixelRatio || 1;
  const width = canvas.clientWidth;
  const grid = gridLayout(list, width, maxHeight);
  const cell = Math.min(width / grid.columns, maxHeight / grid.rows);
  canvas.width = Math.round(grid.columns * cell * ratio);
  canvas.height = Math.round(grid.rows * cell * ratio);
  canvas.style.height = `${grid.rows * cell}px`;
  canvas.style.width = `${grid.columns * cell}px`;
  context.scale(ratio, ratio);
  const gap = cell >= 6 ? 1 : 0;
  const size = cell - gap;
  context.lineWidth = 1;
  for (const { tile, column, row } of grid.cells) {
    const done = isDone(tile);
    const left = column * cell;
    const top = row * cell;
    context.fillStyle = done ? COLORS.done : COLORS.open;
    context.fillRect(left, top, size, size);
    if (!done) {
      context.strokeStyle = COLORS.edge;
      context.strokeRect(left + 0.5, top + 0.5, size - 1, size - 1);
    }
  }
}
