import { describe, expect, it } from "vitest";
import { MAX_SCAN_IMAGE_BYTES, applyScannedInventory, countScannedInventory, deduplicateFiles, scanResultToInventory, validateScanFiles } from "./inventory-scanner";
import { classifyRuneTier, findFiveColumnGrid, matchTemplateMask } from "./inventory-scanner-vision";

describe("inventory screenshot scanner helpers", () => {
  it("keeps only Builder-supported tiers when composing a scan", () => {
    const inventory = scanResultToInventory([
      {
        id: "one", name: "one.png", lowerTierCount: 3, warnings: [],
        detections: [
          { id: "a", runeId: "strength", tier: 2, confidence: .9, imageId: "one", x: 0, y: 0 },
          { id: "b", runeId: "strength", tier: 3, confidence: .9, imageId: "one", x: 0, y: 0 },
          { id: "c", runeId: "strength", tier: 3, confidence: .9, imageId: "one", x: 0, y: 0 },
          { id: "d", runeId: "magic", tier: 5, confidence: .9, imageId: "one", x: 0, y: 0 },
        ],
      },
    ]);
    expect(inventory).toEqual({ strength: { 3: 2 }, magic: { 5: 1 } });
    expect(countScannedInventory(inventory)).toBe(3);
  });

  it("rejects unsupported and oversized screenshot batches", () => {
    const png = new File([new Uint8Array(3)], "runes.png", { type: "image/png" });
    const text = new File(["not an image"], "runes.txt", { type: "text/plain" });
    expect(validateScanFiles([png])).toEqual([]);
    expect(validateScanFiles([text])[0]).toContain("PNG, JPG, or WebP");
    const large = new File([new Uint8Array(MAX_SCAN_IMAGE_BYTES + 1)], "large.png", { type: "image/png" });
    expect(validateScanFiles([large])[0]).toContain("12 MB");
  });

  it("deduplicates identical local screenshot bytes", async () => {
    const first = new File([new Uint8Array([1, 2, 3])], "first.png", { type: "image/png" });
    const duplicate = new File([new Uint8Array([1, 2, 3])], "second.png", { type: "image/png" });
    const unique = new File([new Uint8Array([1, 2, 4])], "third.png", { type: "image/png" });
    await expect(deduplicateFiles([first, duplicate, unique])).resolves.toEqual([first, unique]);
  });

  it("replaces or adds scanned inventory without exceeding the Builder cap", () => {
    const current = { strength: { 3: 98 }, magic: { 4: 1 } };
    const scanned = { strength: { 3: 4 }, power: { 5: 2 } };
    expect(applyScannedInventory(current, scanned, "replace")).toEqual(scanned);
    expect(applyScannedInventory(current, scanned, "add")).toEqual({
      strength: { 3: 99 }, magic: { 4: 1 }, power: { 5: 2 },
    });
  });

  it("finds only regular five-column inventory rows", () => {
    const row = Array.from({ length: 5 }, (_, index) => ({ x: 20 + index * 56, y: 400, width: 48, height: 48, hue: 20 }));
    const noisy = [...row, { x: 360, y: 400, width: 48, height: 48, hue: 20 }, { x: 40, y: 500, width: 90, height: 18, hue: 20 }];
    expect(findFiveColumnGrid(noisy)).toEqual([row]);
    expect(findFiveColumnGrid(noisy.slice(0, 4))).toEqual([]);
  });

  it("classifies visible frame colors and accepts only a clear icon match", () => {
    expect(classifyRuneTier(275)).toBe(3);
    expect(classifyRuneTier(52)).toBe(4);
    expect(classifyRuneTier(26)).toBe(5);
    expect(classifyRuneTier(4)).toBe(6);
    const mask = new Uint8Array([1, 1, 0, 0]);
    expect(matchTemplateMask(mask, [{ id: "match", mask }, { id: "other", mask: new Uint8Array([0, 0, 1, 1]) }])).toEqual({ id: "match", confidence: 1 });
    expect(matchTemplateMask(mask, [{ id: "weak", mask: new Uint8Array([1, 0, 1, 1]) }]).confidence).toBeLessThan(.5);
  });
});
