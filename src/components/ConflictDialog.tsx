import type { BuilderState } from "../model";
import { countOwnedRunes } from "../model";
import { Modal } from "./Modal";

interface ConflictDialogProps {
  device: BuilderState;
  cloud: BuilderState;
  onResolve: (choice: "device" | "cloud" | "newest") => Promise<void>;
}

export function ConflictDialog({ device, cloud, onResolve }: ConflictDialogProps) {
  return (
    <Modal title="Choose saved version" onClose={() => undefined}>
      <div className="conflict-grid">
        <button onClick={() => void onResolve("device")}><strong>This device</strong><span>{countOwnedRunes(device)} runes</span><time>{new Date(device.updatedAt).toLocaleString()}</time></button>
        <button onClick={() => void onResolve("cloud")}><strong>Other device</strong><span>{countOwnedRunes(cloud)} runes</span><time>{new Date(cloud.updatedAt).toLocaleString()}</time></button>
      </div>
      <button className="primary-button full-button" onClick={() => void onResolve("newest")}>Use newest version</button>
    </Modal>
  );
}
