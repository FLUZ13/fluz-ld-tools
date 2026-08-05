import type { RuneTier } from "../model";

export type ScanBox = { x: number; y: number; width: number; height: number; hue: number; saturation?: number };
export type TemplateMask = { id: string; mask: Uint8Array };

function overlapsMostly(inner: ScanBox, outer: ScanBox) {
  const left = Math.max(inner.x, outer.x);
  const top = Math.max(inner.y, outer.y);
  const right = Math.min(inner.x + inner.width, outer.x + outer.width);
  const bottom = Math.min(inner.y + inner.height, outer.y + outer.height);
  const overlap = Math.max(0, right - left) * Math.max(0, bottom - top);
  const smallerArea = Math.min(inner.width * inner.height, outer.width * outer.height);
  return smallerArea > 0 && overlap / smallerArea > .7;
}

export function normalizeMask(mask: Uint8Array) {
  const side = Math.sqrt(mask.length);
  if (!Number.isInteger(side)) return mask;

  let minX = side;
  let minY = side;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < side; y++) {
    for (let x = 0; x < side; x++) {
      if (!mask[y * side + x]) continue;
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
    }
  }
  if (maxX < 0) return new Uint8Array(mask.length);

  const width = maxX - minX + 1;
  const height = maxY - minY + 1;
  const target = Math.max(1, side - 6);
  const scale = Math.min(target / width, target / height);
  const normalized = new Uint8Array(mask.length);
  for (let y = minY; y <= maxY; y++) {
    for (let x = minX; x <= maxX; x++) {
      if (!mask[y * side + x]) continue;
      const targetX = Math.round((x - minX) * scale + (side - (width - 1) * scale) / 2);
      const targetY = Math.round((y - minY) * scale + (side - (height - 1) * scale) / 2);
      for (let offsetY = -1; offsetY <= 1; offsetY++) {
        for (let offsetX = -1; offsetX <= 1; offsetX++) {
          const xAt = targetX + offsetX;
          const yAt = targetY + offsetY;
          if (xAt >= 0 && xAt < side && yAt >= 0 && yAt < side) normalized[yAt * side + xAt] = 1;
        }
      }
    }
  }
  return normalized;
}

export function classifyRuneTier(hue: number): RuneTier {
  if (hue >= 340 || hue < 14) return 6;
  if (hue < 34) return 5;
  if (hue < 78) return 4;
  if (hue >= 245 && hue <= 325) return 3;
  if (hue >= 180 && hue < 245) return 2;
  return 1;
}

export function findFiveColumnGrid(boxes: ScanBox[], minimumColumns = 5) {
  // Rune frames contain smaller coloured decorations that can look like a tile to
  // the colour pass. Keep the largest overlapping box before finding grid rows.
  const candidates = [...boxes]
    .sort((a, b) => b.width * b.height - a.width * a.height)
    .reduce<ScanBox[]>((kept, box) => {
      if (!kept.some((candidate) => overlapsMostly(box, candidate))) kept.push(box);
      return kept;
    }, [])
    .sort((a, b) => a.y - b.y || a.x - b.x);
  const rows: ScanBox[][] = [];
  for (const box of candidates) {
    const center = box.y + box.height / 2;
    const row = rows.find((item) => Math.abs((item[0].y + item[0].height / 2) - center) < Math.max(item[0].height, box.height) * .45);
    if (row) row.push(box); else rows.push([box]);
  }
  const gridRows: ScanBox[][] = [];
  for (const row of rows) {
    const sorted = row.sort((a, b) => a.x - b.x);
    let found: ScanBox[] | undefined;
    for (let length = Math.min(5, sorted.length); length >= minimumColumns && !found; length--) {
      for (let start = 0; start <= sorted.length - length; start++) {
        const sequence = sorted.slice(start, start + length);
        const gaps = sequence.slice(1).map((box, index) => box.x - sequence[index].x);
        const average = gaps.reduce((sum, gap) => sum + gap, 0) / gaps.length;
        const widths = sequence.map((box) => box.width);
        const heights = sequence.map((box) => box.height);
        const dimensionsMatch = Math.max(...widths) < Math.min(...widths) * 1.28
          && Math.max(...heights) < Math.min(...heights) * 1.28;
        if (dimensionsMatch && average > Math.max(...widths) * .75 && Math.max(...gaps) - Math.min(...gaps) < average * .34) {
          found = sequence;
          break;
        }
      }
    }
    if (found) gridRows.push(found);
  }
  return gridRows;
}

export function matchTemplateMask(mask: Uint8Array, templates: TemplateMask[]) {
  let best = { id: "", confidence: 0 };
  for (const template of templates) {
    let intersection = 0;
    let union = 0;
    for (let index = 0; index < mask.length; index++) {
      if (mask[index] || template.mask[index]) union++;
      if (mask[index] && template.mask[index]) intersection++;
    }
    const confidence = union ? intersection / union : 0;
    if (confidence > best.confidence) best = { id: template.id, confidence };
  }
  return best;
}
