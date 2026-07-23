import { Camera, Check, Clipboard, RefreshCw } from "lucide-react";
import QRCode from "qrcode";
import { useEffect, useRef, useState } from "react";
import { Modal } from "./Modal";

interface SyncDialogProps {
  syncCode: string;
  status: "local" | "saving" | "saved" | "offline" | "conflict";
  onClose: () => void;
  onImport: (code: string) => Promise<void>;
  onReset: () => Promise<void>;
}

interface BarcodeDetectorLike {
  detect(source: CanvasImageSource): Promise<Array<{ rawValue: string }>>;
}

interface BarcodeDetectorConstructor {
  new(options: { formats: string[] }): BarcodeDetectorLike;
}

export function SyncDialog({ syncCode, status, onClose, onImport, onReset }: SyncDialogProps) {
  const [qr, setQr] = useState("");
  const [copied, setCopied] = useState(false);
  const [input, setInput] = useState("");
  const [error, setError] = useState("");
  const [scanning, setScanning] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const scannerAvailable = "BarcodeDetector" in window && !!navigator.mediaDevices?.getUserMedia;

  useEffect(() => {
    const url = `${window.location.origin}/rune-builder#sync=${encodeURIComponent(syncCode)}`;
    void QRCode.toDataURL(url, { width: 240, margin: 1, color: { dark: "#352b22", light: "#d1bc9f" } }).then(setQr);
  }, [syncCode]);

  useEffect(() => {
    if (!scanning || !videoRef.current) return;
    let stream: MediaStream | null = null;
    let frame = 0;
    const Detector = (window as unknown as { BarcodeDetector: BarcodeDetectorConstructor }).BarcodeDetector;
    const detector = new Detector({ formats: ["qr_code"] });
    void navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } }).then((nextStream) => {
      stream = nextStream;
      if (!videoRef.current) return;
      videoRef.current.srcObject = stream;
      void videoRef.current.play();
      const scan = async () => {
        if (!videoRef.current || !scanning) return;
        try {
          const codes = await detector.detect(videoRef.current);
          if (codes[0]?.rawValue) {
            setInput(codes[0].rawValue);
            setScanning(false);
            return;
          }
        } catch { /* keep scanning */ }
        frame = requestAnimationFrame(scan);
      };
      frame = requestAnimationFrame(scan);
    }).catch(() => { setError("Camera access is unavailable."); setScanning(false); });
    return () => { cancelAnimationFrame(frame); stream?.getTracks().forEach((track) => track.stop()); };
  }, [scanning]);

  const link = async () => {
    setError("");
    try { await onImport(input); onClose(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Could not link that workspace."); }
  };

  return (
    <Modal title="Sync devices" onClose={onClose}>
      <div className="sync-status"><i className={status} /><span>{status === "saved" ? "Encrypted cloud copy saved" : status === "saving" ? "Saving" : status === "offline" ? "Working offline" : status === "conflict" ? "Needs review" : "Local copy ready"}</span></div>
      <div className="sync-qr">{qr && <img src={qr} alt="Anonymous workspace QR code" />}</div>
      <label className="field-label">Private sync code<textarea readOnly value={syncCode} rows={3} /></label>
      <button className="primary-button" onClick={() => void navigator.clipboard.writeText(syncCode).then(() => { setCopied(true); window.setTimeout(() => setCopied(false), 1800); })}>{copied ? <Check /> : <Clipboard />}{copied ? "Copied" : "Copy code"}</button>
      <div className="modal-divider"><span>Link this device</span></div>
      {scanning && <video className="qr-video" ref={videoRef} muted playsInline />}
      <label className="field-label">Sync code<textarea value={input} onChange={(event) => setInput(event.target.value)} rows={3} placeholder="LDRB1..." /></label>
      <div className="button-row">
        {scannerAvailable && <button className="secondary-button" onClick={() => setScanning((value) => !value)}><Camera />{scanning ? "Stop scan" : "Scan QR"}</button>}
        <button className="primary-button" onClick={() => void link()} disabled={!input.trim()}>Link device</button>
      </div>
      {error && <p className="form-error" role="alert">{error}</p>}
      <div className="modal-divider"><span>Workspace</span></div>
      <button className="danger-button" onClick={() => { if (window.confirm("Reset this anonymous workspace and invalidate its sync code?")) void onReset(); }}><RefreshCw />Reset sync code</button>
    </Modal>
  );
}
