import { VectorTile } from "@mapbox/vector-tile";
import { PbfReader } from "pbf";

const LABEL_COLOR = "#d63f40";
const CLASS_COLORS = [
  "#d63f40",
  "#0065d0",
  "#c69102",
  "#ffffff",
  "#198155",
  "#2c3038",
];

export type ClassColors = { property: string; colors: Map<string, string> };

export function classColors(property: string, values: string[]): ClassColors {
  return {
    property,
    colors: new Map(
      values.map((value, index) => [
        value,
        CLASS_COLORS[index % CLASS_COLORS.length],
      ]),
    ),
  };
}

export async function drawTile(
  canvas: HTMLCanvasElement,
  imagery: ArrayBuffer,
  labels: ArrayBuffer | undefined,
  showLabels: boolean,
  classes?: ClassColors,
): Promise<Set<string>> {
  const drawn = new Set<string>();
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Canvas 2D is not available");
  const bitmap = await createImageBitmap(
    new Blob([imagery], { type: "image/webp" }),
  );
  context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  if (!showLabels || !labels) return drawn;
  context.lineWidth = Math.max(2, canvas.width / 170);
  for (const layer of Object.values(
    new VectorTile(new PbfReader(labels)).layers,
  )) {
    const scale = canvas.width / layer.extent;
    for (let i = 0; i < layer.length; i++) {
      const feature = layer.feature(i);
      const value = classes && String(feature.properties[classes.property]);
      const color = (value && classes?.colors.get(value)) || LABEL_COLOR;
      if (value) drawn.add(value);
      context.strokeStyle = color;
      context.fillStyle = color;
      for (const ring of feature.loadGeometry()) {
        if (feature.type === 1) {
          for (const point of ring) {
            context.beginPath();
            context.arc(
              point.x * scale,
              point.y * scale,
              context.lineWidth * 2,
              0,
              Math.PI * 2,
            );
            context.fill();
          }
          continue;
        }
        context.beginPath();
        ring.forEach((point, index) =>
          index
            ? context.lineTo(point.x * scale, point.y * scale)
            : context.moveTo(point.x * scale, point.y * scale),
        );
        if (feature.type === 3) context.closePath();
        context.stroke();
      }
    }
  }
  return drawn;
}
