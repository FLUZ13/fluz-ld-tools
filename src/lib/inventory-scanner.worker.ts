/// <reference lib="webworker" />

import type { ScanCrop, ScanDetection, ScanImageResult, ScanResult, ScanTemplate } from "./inventory-scanner";
import { classifyRuneTier, findFiveColumnGrid, matchTemplateMask, normalizeMask, type ScanBox, type TemplateMask } from "./inventory-scanner-vision";

type ScanRequest = {
  type: "scan";
  images: Array<{ id: string; name: string; bytes: ArrayBuffer }>;
  crop: ScanCrop;
  templates: ScanTemplate[];
};

const worker = self as unknown as DedicatedWorkerGlobalScope;
const SIZE = 48;

function hsv(r: number, g: number, b: number) {
  const rr = r / 255; const gg = g / 255; const bb = b / 255;
  const max = Math.max(rr, gg, bb); const min = Math.min(rr, gg, bb); const delta = max - min;
  let hue = 0;
  if (delta) {
    if (max === rr) hue = 60 * (((gg - bb) / delta) % 6);
    else if (max === gg) hue = 60 * ((bb - rr) / delta + 2);
    else hue = 60 * ((rr - gg) / delta + 4);
  }
  if (hue < 0) hue += 360;
  return { hue, saturation: max === 0 ? 0 : delta / max, value: max };
}

function colorMatches(r: number, g: number, b: number) {
  const color = hsv(r, g, b);
  return (color.saturation > 0.48 && color.value > 0.38 && color.hue < 80)
    || (color.saturation > 0.42 && color.value > 0.35 && color.hue > 175 && color.hue < 330)
    || (color.saturation < 0.38 && color.value > 0.48);
}

function findColorBoxes(bitmap: ImageBitmap, crop: ScanCrop): ScanBox[] {
  const scale = Math.min(1, 620 / bitmap.width);
  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = new OffscreenCanvas(width, height);
  const context = canvas.getContext("2d", { willReadFrequently: true })!;
  context.drawImage(bitmap, 0, 0, width, height);
  const pixels = context.getImageData(0, 0, width, height).data;
  const top = Math.max(0, Math.floor(height * crop.top));
  const bottom = Math.min(height, Math.ceil(height * crop.bottom));
  const visited = new Uint8Array(width * height);
  const boxes: ScanBox[] = [];

  for (let y = top; y < bottom; y += 2) {
    for (let x = 0; x < width; x += 2) {
      const index = y * width + x;
      if (visited[index]) continue;
      const pixel = index * 4;
      if (!colorMatches(pixels[pixel], pixels[pixel + 1], pixels[pixel + 2])) continue;
      const stack = [index]; visited[index] = 1;
      let minX = x; let maxX = x; let minY = y; let maxY = y; let amount = 0; let hueSum = 0; let saturationSum = 0;
      while (stack.length) {
        const current = stack.pop()!; const cx = current % width; const cy = Math.floor(current / width); const p = current * 4;
        const color = hsv(pixels[p], pixels[p + 1], pixels[p + 2]);
        amount++; hueSum += color.hue; saturationSum += color.saturation;
        minX = Math.min(minX, cx); maxX = Math.max(maxX, cx); minY = Math.min(minY, cy); maxY = Math.max(maxY, cy);
        for (const [nx, ny] of [[cx - 2, cy], [cx + 2, cy], [cx, cy - 2], [cx, cy + 2]]) {
          if (nx < 0 || nx >= width || ny < top || ny >= bottom) continue;
          const next = ny * width + nx;
          if (visited[next]) continue;
          const np = next * 4;
          if (colorMatches(pixels[np], pixels[np + 1], pixels[np + 2])) { visited[next] = 1; stack.push(next); }
        }
      }
      const boxWidth = maxX - minX + 1; const boxHeight = maxY - minY + 1; const ratio = boxWidth / boxHeight;
      if (amount > 55 && boxWidth >= 20 && boxHeight >= 20 && boxWidth <= 150 && boxHeight <= 150 && ratio > .62 && ratio < 1.38) {
        boxes.push({ x: minX / scale, y: minY / scale, width: boxWidth / scale, height: boxHeight / scale, hue: hueSum / amount, saturation: saturationSum / amount });
      }
    }
  }
  return boxes;
}

async function buildTemplates(templates: ScanTemplate[]) {
  const result: TemplateMask[] = [];
  for (const template of templates) {
    const response = await fetch(template.image);
    if (!response.ok) continue;
    const bitmap = await createImageBitmap(await response.blob());
    const canvas = new OffscreenCanvas(SIZE, SIZE); const context = canvas.getContext("2d", { willReadFrequently: true })!;
    context.drawImage(bitmap, 0, 0, SIZE, SIZE);
    const data = context.getImageData(0, 0, SIZE, SIZE).data; const mask = new Uint8Array(SIZE * SIZE);
    for (let index = 0; index < mask.length; index++) {
      const r = data[index * 4]; const g = data[index * 4 + 1]; const b = data[index * 4 + 2];
      mask[index] = data[index * 4 + 3] > 100 && r > 175 && g > 175 && b > 175 && Math.max(r, g, b) - Math.min(r, g, b) < 95 ? 1 : 0;
    }
    result.push({ id: template.id, mask: normalizeMask(mask) });
  }
  return result;
}

function tileMask(bitmap: ImageBitmap, box: ScanBox) {
  const canvas = new OffscreenCanvas(SIZE, SIZE); const context = canvas.getContext("2d", { willReadFrequently: true })!;
  // The rune symbol sits well inside the coloured frame. Ignoring the frame keeps
  // its highlights from overpowering the actual white rune icon.
  const inset = Math.min(box.width, box.height) * .26;
  context.drawImage(bitmap, box.x + inset, box.y + inset, box.width - inset * 2, box.height - inset * 2, 0, 0, SIZE, SIZE);
  const data = context.getImageData(0, 0, SIZE, SIZE).data; const mask = new Uint8Array(SIZE * SIZE);
  for (let index = 0; index < mask.length; index++) {
    const r = data[index * 4]; const g = data[index * 4 + 1]; const b = data[index * 4 + 2];
    mask[index] = r > 175 && g > 175 && b > 175 && Math.max(r, g, b) - Math.min(r, g, b) < 95 ? 1 : 0;
  }
  return normalizeMask(mask);
}

async function scanOne(image: ScanRequest["images"][number], crop: ScanCrop, templates: TemplateMask[]): Promise<ScanImageResult> {
  const bitmap = await createImageBitmap(new Blob([image.bytes]));
  try {
    // The equipped-Immortal strip is also a regular row of coloured squares.
    // Inventory tiles begin lower on every supported Rune screen, so exclude
    // that strip before reconstructing rows. A final row may contain fewer
    // than five tiles, and gray Common frames must not invalidate the row.
    const inventoryBoxes = findColorBoxes(bitmap, crop).filter((box) => box.y >= bitmap.height * .35);
    const rows = findFiveColumnGrid(inventoryBoxes, 2);
    const warnings: string[] = [];
    if (!rows.length) warnings.push("No rune inventory grid was found. Use a clean Rune-tab screenshot or adjust the scan area.");
    const detections: ScanDetection[] = []; let lowerTierCount = 0;
    for (const row of rows) {
      for (const box of row) {
        const tier = (box.saturation ?? 1) < .32 ? 1 : classifyRuneTier(box.hue);
        if (tier < 3) { lowerTierCount++; continue; }
        const match = matchTemplateMask(tileMask(bitmap, box), templates);
        if (match.confidence < .22) {
          warnings.push("One or more tiles were unclear or covered and were left out.");
          continue;
        }
        detections.push({ id: `${image.id}:${Math.round(box.x)}:${Math.round(box.y)}`, runeId: match.id, tier, confidence: match.confidence, imageId: image.id, x: box.x, y: box.y });
      }
    }
    if (detections.length === 0 && rows.length) warnings.push("The grid was found, but its rune symbols did not match clearly enough. Try a sharper screenshot without a pop-up.");
    return { id: image.id, name: image.name, detections, lowerTierCount, warnings: [...new Set(warnings)] };
  } finally { bitmap.close(); }
}

worker.onmessage = async (event: MessageEvent<ScanRequest>) => {
  if (event.data.type !== "scan") return;
  try {
    const templates = await buildTemplates(event.data.templates);
    if (!templates.length) throw new Error("Rune icon templates could not be loaded.");
    const images: ScanImageResult[] = [];
    for (let index = 0; index < event.data.images.length; index++) {
      images.push(await scanOne(event.data.images[index], event.data.crop, templates));
      worker.postMessage({ type: "progress", completed: index + 1, total: event.data.images.length });
    }
    const warnings = images.flatMap((image) => image.warnings);
    const result: ScanResult = { images, warnings: [...new Set(warnings)] };
    worker.postMessage({ type: "complete", result });
  } catch (error) {
    worker.postMessage({ type: "error", message: error instanceof Error ? error.message : "Could not read those screenshots." });
  }
};
