import type { RuneTier } from "../model";

export type ScanBox = { x: number; y: number; width: number; height: number; hue: number };
export type TemplateMask = { id: string; mask: Uint8Array };

export function classifyRuneTier(hue: number): RuneTier {
  if (hue >= 340 || hue < 14) return 6;
  if (hue < 43) return 5;
  if (hue < 78) return 4;
  if (hue >= 245 && hue <= 325) return 3;
  if (hue >= 180 && hue < 245) return 2;
  return 1;
}

export function findFiveColumnGrid(boxes: ScanBox[]) {
  const candidates = [...boxes].sort((a, b) => a.y - b.y || a.x - b.x);
  const rows: ScanBox[][] = [];
  for (const box of candidates) {
    const center = box.y + box.height / 2;
    const row = rows.find((item) => Math.abs((item[0].y + item[0].height / 2) - center) < Math.max(item[0].height, box.height) * .45);
    if (row) row.push(box); else rows.push([box]);
  }
  const gridRows: ScanBox[][] = [];
  for (const row of rows) {
    const sorted = row.sort((a, b) => a.x - b.x);
    for (let start = 0; start <= sorted.length - 5; start++) {
      const sequence = sorted.slice(start, start + 5);
      const gaps = sequence.slice(1).map((box, index) => box.x - sequence[index].x);
      const average = gaps.reduce((sum, gap) => sum + gap, 0) / gaps.length;
      const widths = sequence.map((box) => box.width);
      if (average > Math.max(...widths) * .75 && Math.max(...gaps) - Math.min(...gaps) < average * .34) {
        gridRows.push(sequence);
        break;
      }
    }
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
