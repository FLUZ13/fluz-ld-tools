import type { BuilderState, RuneTier } from "../model";

export const MAX_SCAN_FILES = 10;
export const MAX_SCAN_IMAGE_BYTES = 12 * 1024 * 1024;
export const MAX_SCAN_TOTAL_BYTES = 50 * 1024 * 1024;

export type ScanCrop = { top: number; bottom: number };
export type ScannedTier = RuneTier;

export interface ScanDetection {
  id: string;
  runeId: string;
  tier: ScannedTier;
  confidence: number;
  imageId: string;
  x: number;
  y: number;
}

export interface ScanImageResult {
  id: string;
  name: string;
  detections: ScanDetection[];
  lowerTierCount: number;
  warnings: string[];
}

export interface ScanResult {
  images: ScanImageResult[];
  warnings: string[];
}

export interface ScanTemplate {
  id: string;
  image: string;
}

type WorkerRequest = {
  type: "scan";
  images: Array<{ id: string; name: string; bytes: ArrayBuffer }>;
  crop: ScanCrop;
  templates: ScanTemplate[];
};

type WorkerResponse =
  | { type: "progress"; completed: number; total: number }
  | { type: "complete"; result: ScanResult }
  | { type: "error"; message: string };

export function isSupportedScanFile(file: File) {
  return ["image/jpeg", "image/png", "image/webp"].includes(file.type)
    || /\.(jpe?g|png|webp)$/i.test(file.name);
}

export function validateScanFiles(files: File[]) {
  const errors: string[] = [];
  if (files.length > MAX_SCAN_FILES) errors.push(`Choose up to ${MAX_SCAN_FILES} screenshots at once.`);
  const selected = files.slice(0, MAX_SCAN_FILES);
  if (selected.some((file) => !isSupportedScanFile(file))) errors.push("Use PNG, JPG, or WebP screenshots only.");
  if (selected.some((file) => file.size > MAX_SCAN_IMAGE_BYTES)) errors.push("Each screenshot must be 12 MB or smaller.");
  if (selected.reduce((total, file) => total + file.size, 0) > MAX_SCAN_TOTAL_BYTES) errors.push("This batch is larger than 50 MB. Choose fewer screenshots.");
  return errors;
}

export async function fingerprintFile(file: File) {
  const digest = await crypto.subtle.digest("SHA-256", await file.arrayBuffer());
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function deduplicateFiles(files: File[]) {
  const seen = new Set<string>();
  const unique: File[] = [];
  for (const file of files) {
    const fingerprint = await fingerprintFile(file);
    if (!seen.has(fingerprint)) {
      seen.add(fingerprint);
      unique.push(file);
    }
  }
  return unique;
}

export async function scanInventoryScreenshots(
  files: Array<{ id: string; file: File }>,
  crop: ScanCrop,
  templates: ScanTemplate[],
  onProgress: (completed: number, total: number) => void,
): Promise<ScanResult> {
  const worker = new Worker(new URL("./inventory-scanner.worker.ts", import.meta.url), { type: "module" });
  try {
    const images = await Promise.all(files.map(async ({ id, file }) => ({ id, name: file.name, bytes: await file.arrayBuffer() })));
    return await new Promise<ScanResult>((resolve, reject) => {
      worker.onmessage = (event: MessageEvent<WorkerResponse>) => {
        if (event.data.type === "progress") onProgress(event.data.completed, event.data.total);
        if (event.data.type === "complete") resolve(event.data.result);
        if (event.data.type === "error") reject(new Error(event.data.message));
      };
      worker.onerror = () => reject(new Error("The screenshot scanner could not start in this browser."));
      const request: WorkerRequest = { type: "scan", images, crop, templates };
      worker.postMessage(request, images.map((image) => image.bytes));
    });
  } finally {
    worker.terminate();
  }
}

export function scanResultToInventory(images: ScanImageResult[]) {
  const inventory: Record<string, Partial<Record<RuneTier, number>>> = {};
  for (const detection of images.flatMap((image) => image.detections)) {
    if (detection.tier < 3) continue;
    inventory[detection.runeId] ??= {};
    inventory[detection.runeId][detection.tier] = (inventory[detection.runeId][detection.tier] ?? 0) + 1;
  }
  return inventory;
}

export function countScannedInventory(inventory: Record<string, Partial<Record<RuneTier, number>>>) {
  return Object.values(inventory).reduce((total, tiers) => total + Object.values(tiers).reduce((sum, count) => sum + (count ?? 0), 0), 0);
}

export function applyScannedInventory(
  current: BuilderState["inventory"],
  scanned: BuilderState["inventory"],
  mode: "replace" | "add",
) {
  const next = mode === "replace" ? structuredClone(scanned) : structuredClone(current);
  if (mode === "replace") return next;

  for (const [runeId, tiers] of Object.entries(scanned)) {
    next[runeId] ??= {};
    for (const [tier, count] of Object.entries(tiers)) {
      const key = Number(tier) as RuneTier;
      next[runeId][key] = Math.min(99, (next[runeId][key] ?? 0) + (count ?? 0));
    }
  }
  return next;
}
