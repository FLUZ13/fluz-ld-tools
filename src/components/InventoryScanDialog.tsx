import { ImageUp, LoaderCircle, LockKeyhole, Minus, Plus, ScanLine, Trash2, TriangleAlert, Unlock, Upload } from "lucide-react";
import { useMemo, useRef, useState } from "react";
import { DATA, TIER_NAMES, type BuilderState, type RuneTier } from "../model";
import { Modal } from "./Modal";
import {
  applyScannedInventory,
  countScannedInventory,
  deduplicateFiles,
  scanInventoryScreenshots,
  scanResultToInventory,
  validateScanFiles,
  type ScanCrop,
  type ScanImageResult,
} from "../lib/inventory-scanner";

type SelectedFile = { id: string; file: File; preview: string };
type ApplyMode = "replace" | "add";

interface InventoryScanDialogProps {
  state: BuilderState;
  mutate: (recipe: (draft: BuilderState) => void) => void;
  onClose: () => void;
}

const initialCrop: ScanCrop = { top: .24, bottom: .94 };

export function InventoryScanDialog({ state, mutate, onClose }: InventoryScanDialogProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [files, setFiles] = useState<SelectedFile[]>([]);
  const [crop, setCrop] = useState(initialCrop);
  const [images, setImages] = useState<ScanImageResult[] | null>(null);
  const [applyMode, setApplyMode] = useState<ApplyMode>("replace");
  const [progress, setProgress] = useState<{ completed: number; total: number } | null>(null);
  const [message, setMessage] = useState("");
  const [editing, setEditing] = useState<Record<string, number>>({});
  const [cropUnlocked, setCropUnlocked] = useState(false);
  const [unlockConfirm, setUnlockConfirm] = useState(false);

  const templates = useMemo(() => DATA.runes.map((rune) => ({ id: rune.id, image: rune.image })), []);
  const activeImages = images ?? [];
  const detectedInventory = useMemo(() => {
    const result = scanResultToInventory(activeImages);
    for (const [key, count] of Object.entries(editing)) {
      const [runeId, tierString] = key.split(":"); const tier = Number(tierString) as RuneTier;
      result[runeId] ??= {};
      result[runeId][tier] = Math.max(0, Math.min(99, count));
    }
    return result;
  }, [activeImages, editing]);
  const reviewRows = useMemo(() => Object.entries(detectedInventory).flatMap(([runeId, tiers]) =>
    Object.entries(tiers).filter(([, count]) => (count ?? 0) > 0).map(([tier, count]) => ({ rune: DATA.runes.find((item) => item.id === runeId)!, tier: Number(tier) as RuneTier, count: count ?? 0 })),
  ), [detectedInventory]);
  const lowerTierCount = activeImages.reduce((total, image) => total + image.lowerTierCount, 0);
  const close = () => {
    files.forEach((item) => URL.revokeObjectURL(item.preview));
    onClose();
  };

  const selectFiles = async (incoming: File[]) => {
    const validation = validateScanFiles(incoming);
    if (validation.length) { setMessage(validation[0]); return; }
    try {
      const unique = await deduplicateFiles(incoming);
      const limited = unique.slice(0, 10).map((file) => ({ id: crypto.randomUUID(), file, preview: URL.createObjectURL(file) }));
      files.forEach((item) => URL.revokeObjectURL(item.preview));
      setFiles(limited); setImages(null); setEditing({});
      setMessage(unique.length !== incoming.length ? "Duplicate files were removed before scanning." : "");
    } catch { setMessage("Those screenshots could not be prepared in this browser."); }
  };

  const scan = async () => {
    if (!files.length) { setMessage("Choose at least one Rune inventory screenshot first."); return; }
    setMessage(""); setProgress({ completed: 0, total: files.length });
    try {
      const result = await scanInventoryScreenshots(files, crop, templates, (completed, total) => setProgress({ completed, total }));
      setImages(result.images);
      setEditing({});
      if (result.warnings.length) setMessage(result.warnings[0]);
    } catch (error) { setMessage(error instanceof Error ? error.message : "Could not scan those screenshots."); }
    finally { setProgress(null); }
  };

  const removeResultImage = (id: string) => {
    setImages((current) => current?.filter((image) => image.id !== id) ?? null);
    setEditing({});
  };

  const setReviewCount = (runeId: string, tier: RuneTier, value: number) => {
    setEditing((current) => ({ ...current, [`${runeId}:${tier}`]: Math.max(0, Math.floor(value) || 0) }));
  };

  const apply = () => {
    const next = applyScannedInventory(state.inventory, detectedInventory, applyMode);
    mutate((draft) => {
      draft.inventory = next;
    });
    close();
  };

  return (
    <Modal title="Scan rune screenshots" wide onClose={close}>
      {!images ? <>
        <p className="scanner-intro">Choose clean screenshots from the <strong>Rune</strong> tab. Only the lower five-column inventory grid is read; equipped runes above it are ignored.</p>
        <button className="scanner-dropzone" onClick={() => inputRef.current?.click()} onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.preventDefault(); void selectFiles(Array.from(event.dataTransfer.files)); }}>
          <ImageUp /><strong>Add screenshots</strong><span>PNG, JPG, or WebP. Up to 10 files, 12 MB each.</span>
        </button>
        <input ref={inputRef} className="visually-hidden" type="file" accept="image/jpeg,image/png,image/webp" multiple onChange={(event) => { void selectFiles(Array.from(event.target.files ?? [])); event.target.value = ""; }} />
        {files.length > 0 && <div className="scanner-file-list">{files.map((item) => <figure key={item.id} className="scanner-file-preview"><div className="scanner-preview-image"><img src={item.preview} alt="Selected screenshot preview" /><i className="scanner-scan-window" style={{ top: `${crop.top * 100}%`, bottom: `${(1 - crop.bottom) * 100}%` }} /></div><figcaption><span>{item.file.name}</span><button className="icon-button quiet" onClick={() => setFiles((current) => { const removed = current.find((entry) => entry.id === item.id); if (removed) URL.revokeObjectURL(removed.preview); return current.filter((entry) => entry.id !== item.id); })} title="Remove this screenshot" aria-label={`Remove ${item.file.name}`}><Trash2 /></button></figcaption></figure>)}</div>}
        <div className="scanner-crop-controls">
          <div><strong>Scan area</strong><span>{cropUnlocked ? "Custom scan area enabled for this review." : "Locked to the tested 24%–94% range."}</span></div>
          <label>Start at {Math.round(crop.top * 100)}%<input disabled={!cropUnlocked} type="range" min="10" max="55" value={Math.round(crop.top * 100)} onChange={(event) => setCrop((value) => ({ ...value, top: Math.min(value.bottom - .15, Number(event.target.value) / 100) }))} /></label>
          <label>End at {Math.round(crop.bottom * 100)}%<input disabled={!cropUnlocked} type="range" min="60" max="99" value={Math.round(crop.bottom * 100)} onChange={(event) => setCrop((value) => ({ ...value, bottom: Math.max(value.top + .15, Number(event.target.value) / 100) }))} /></label>
          <div className="scanner-unlock-row">{cropUnlocked ? <button className="text-button" onClick={() => { setCrop(initialCrop); setCropUnlocked(false); setUnlockConfirm(false); }}><LockKeyhole />Lock tested settings</button> : unlockConfirm ? <><span>Unlock custom crop controls for this scan?</span><button className="secondary-button" onClick={() => setUnlockConfirm(false)}>Cancel</button><button className="primary-button" onClick={() => { setCropUnlocked(true); setUnlockConfirm(false); }}><Unlock />Yes, unlock</button></> : <button className="text-button" onClick={() => setUnlockConfirm(true)}><LockKeyhole />Unlock scan area</button>}</div>
        </div>
        <div className="scanner-note"><TriangleAlert /><span>Pop-ups, Merge screenshots, or overlapping scroll rows are not reliable. The review will leave uncertain tiles out instead of guessing.</span></div>
        {message && <p className="form-error">{message}</p>}
        <button className="primary-button full-button" disabled={!files.length || !!progress} onClick={() => { void scan(); }}>{progress ? <><LoaderCircle className="spin" />Reading {progress.completed}/{progress.total}</> : <><ScanLine />Scan locally</>}</button>
      </> : <>
        <p className="scanner-intro">Review the local result before applying it. {lowerTierCount > 0 && <strong> {lowerTierCount} Common/Rare tile{lowerTierCount === 1 ? " was" : "s were"} found and skipped.</strong>}</p>
        <div className="scanner-result-images">{activeImages.map((image) => <div key={image.id}><span>{image.name}</span><strong>{image.detections.length} imported</strong><button className="icon-button quiet" onClick={() => removeResultImage(image.id)} title="Remove this screenshot" aria-label={`Remove ${image.name}`}><Trash2 /></button></div>)}</div>
        {message && <p className="form-error">{message}</p>}
        <div className="scanner-review-list">{reviewRows.length ? reviewRows.map(({ rune, tier, count }) => <div key={`${rune.id}:${tier}`} className="scanner-review-row"><img src={rune.image} alt="" /><strong>{rune.name.replace("Rune of ", "")}</strong><span className={`tier-${tier}`}>{TIER_NAMES[tier]}</span><div className="scanner-count"><button onClick={() => setReviewCount(rune.id, tier, count - 1)} aria-label={`Remove one ${rune.name}`}><Minus /></button><input type="number" min="0" max="99" value={count} onChange={(event) => setReviewCount(rune.id, tier, Number(event.target.value))} /><button onClick={() => setReviewCount(rune.id, tier, count + 1)} aria-label={`Add one ${rune.name}`}><Plus /></button></div></div>) : <p className="muted-copy">No eligible rune tiles were recognized. Try a clean Rune-tab screenshot or adjust the scan area.</p>}</div>
        <div className="scanner-apply"><strong>{countScannedInventory(detectedInventory)} runes ready to apply</strong><label><input type="radio" checked={applyMode === "replace"} onChange={() => setApplyMode("replace")} />Replace current inventory</label><label><input type="radio" checked={applyMode === "add"} onChange={() => setApplyMode("add")} />Add to current inventory</label></div>
        <div className="button-row"><button className="secondary-button" onClick={() => setImages(null)}><Upload />Scan again</button><button className="primary-button" disabled={!reviewRows.length} onClick={apply}><ScanLine />Apply scan</button></div>
      </>}
    </Modal>
  );
}
