import { VectorTile, type VectorTileFeature } from "@mapbox/vector-tile";
import { PbfReader } from "pbf";

import type { LabelClasses } from "./tiles";

const LABEL_COLOR = "#d63f40";
const CLASS_COLORS = [
  "#d63f40",
  "#0065d0",
  "#c69102",
  "#ffffff",
  "#198155",
  "#2c3038",
];

// Colours stay fixed per class while they suffice; past that, only the tile's own classes share them.
function classColors(
  classes: LabelClasses,
  present: string[],
): Map<string, string> {
  const fixed = classes.values.length <= CLASS_COLORS.length;
  return new Map(
    present.map((value, index) => [
      value,
      CLASS_COLORS[
        (fixed ? classes.values.indexOf(value) : index) % CLASS_COLORS.length
      ],
    ]),
  );
}

export async function drawTile(
  canvas: HTMLCanvasElement,
  imagery: ArrayBuffer,
  labels: ArrayBuffer | undefined,
  showLabels: boolean,
  classes?: LabelClasses,
): Promise<Map<string, string>> {
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Canvas 2D is not available");
  const bitmap = await createImageBitmap(
    new Blob([imagery], { type: "image/webp" }),
  );
  context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  if (!showLabels || !labels) return new Map();
  const features: { feature: VectorTileFeature; scale: number }[] = [];
  for (const layer of Object.values(
    new VectorTile(new PbfReader(labels)).layers,
  ))
    for (let i = 0; i < layer.length; i++)
      features.push({
        feature: layer.feature(i),
        scale: canvas.width / layer.extent,
      });
  const classOf = (feature: VectorTileFeature) =>
    classes ? String(feature.properties[classes.property]) : "";
  const present = classes
    ? classes.values.filter((value) =>
        features.some(({ feature }) => classOf(feature) === value),
      )
    : [];
  const colors = classes ? classColors(classes, present) : new Map();
  context.lineWidth = Math.max(2, canvas.width / 170);
  for (const { feature, scale } of features) {
    const color = colors.get(classOf(feature)) ?? LABEL_COLOR;
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
  return colors;
}
