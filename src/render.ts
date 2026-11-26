import { VectorTile, type VectorTileFeature } from "@mapbox/vector-tile";
import { PbfReader } from "pbf";

import type { LabelClasses } from "./tiles";

const LABEL_COLOR = "#d63f40";
const CLASS_COLORS = [
  "#d63f40",
  "#00e5ff",
  "#ffd60a",
  "#ffffff",
  "#ff8c00",
  "#ff3df5",
];

// Each class keeps its own colour; a tile whose classes share one moves the later class to the next free colour.
export function classColors(
  classes: LabelClasses,
  present: string[],
): Map<string, string> {
  const taken = new Set<number>();
  return new Map(
    present.map((value) => {
      let slot = classes.values.indexOf(value) % CLASS_COLORS.length;
      while (taken.has(slot) && taken.size < CLASS_COLORS.length)
        slot = (slot + 1) % CLASS_COLORS.length;
      taken.add(slot);
      return [value, CLASS_COLORS[slot]];
    }),
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
  context.shadowColor = "rgba(0, 0, 0, 0.7)";
  context.shadowBlur = context.lineWidth;
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
