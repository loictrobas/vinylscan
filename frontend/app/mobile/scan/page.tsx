"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Camera, Barcode, X, Check, ChevronDown, Zap, WifiOff,
  RotateCcw, Loader2, AlertCircle, CheckCircle2
} from "lucide-react";
import { BrowserMultiFormatReader } from "@zxing/browser";
import { NotFoundException } from "@zxing/library";
import { api, getToken, type ScanUploadResponse, type Lot } from "@/lib/api";
import {
  addToOfflineQueue, getOfflineQueue, removeFromOfflineQueue,
  fileToDataUrl, dataUrlToFile, isOnline
} from "@/lib/offline";

type Mode = "idle" | "camera" | "barcode" | "processing" | "result" | "barcode-results" | "done";

const CONDITIONS = ["M", "NM", "VG+", "VG", "G"] as const;

export default function MobileScanPage() {
  const router = useRouter();
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const readerRef = useRef<BrowserMultiFormatReader | null>(null);
  const scanningRef = useRef(false);

  const [mode, setMode] = useState<Mode>("idle");
  const [scanResult, setScanResult] = useState<ScanUploadResponse | null>(null);
  const [barcodeMatches, setBarcodeMatches] = useState<ScanUploadResponse["matches"]>([]);
  const [condition, setCondition] = useState<string>("VG+");
  const [lots, setLots] = useState<Lot[]>([]);
  const [lotId, setLotId] = useState<string>("");
  const [confirming, setConfirming] = useState(false);
  const [credits, setCredits] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [queueCount, setQueueCount] = useState(0);
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<{ ok: number; fail: number } | null>(null);
  const [flashConfirm, setFlashConfirm] = useState(false);

  useEffect(() => {
    if (!getToken()) { router.replace("/login"); return; }
    api.me().then((u) => setCredits(u.credits)).catch(() => {});
    api.listLots().then(setLots).catch(() => {});
    refreshQueue();
  }, [router]);

  function refreshQueue() {
    setQueueCount(getOfflineQueue().length);
  }

  // ── Camera ────────────────────────────────────────────────────────────────

  async function startCamera() {
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment", width: { ideal: 1280 }, height: { ideal: 720 } },
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
    } catch {
      setError("Camera access denied. Allow camera in browser settings.");
      setMode("idle");
    }
  }

  function stopCamera() {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    scanningRef.current = false;
    if (readerRef.current) {
      try { BrowserMultiFormatReader.releaseAllStreams(); } catch { /* ignore */ }
      readerRef.current = null;
    }
  }

  async function openCamera() {
    setMode("camera");
    await startCamera();
  }

  async function openBarcode() {
    setMode("barcode");
    setError(null);
    await startCamera();
    startBarcodeLoop();
  }

  // ── Barcode scanning ──────────────────────────────────────────────────────

  function startBarcodeLoop() {
    if (!videoRef.current) return;
    scanningRef.current = true;
    const reader = new BrowserMultiFormatReader();
    readerRef.current = reader;
    reader.decodeFromVideoElement(videoRef.current, (result, err) => {
      if (!scanningRef.current) return;
      if (result) {
        scanningRef.current = false;
        void handleBarcode(result.getText());
      } else if (err && !(err instanceof NotFoundException)) {
        scanningRef.current = false;
        setError("Barcode reader error");
        setMode("idle");
      }
    }).catch(() => {/* stream ended cleanly */});
  }

  async function handleBarcode(barcode: string) {
    stopCamera();
    setMode("processing");
    setError(null);
    try {
      const data = await api.barcodeSearch(barcode);
      if (data.matches.length === 0) {
        setError(`No Discogs releases found for barcode ${barcode}`);
        setMode("idle");
        return;
      }
      setBarcodeMatches(data.matches);
      setMode("barcode-results");
    } catch {
      setError("Barcode search failed. Check connection.");
      setMode("idle");
    }
  }

  async function confirmBarcodeRelease(releaseId: number) {
    setConfirming(true);
    setError(null);
    try {
      await api.barcodeAdd(releaseId, condition, lotId || undefined);
      setFlashConfirm(true);
      setTimeout(() => setFlashConfirm(false), 1500);
      setMode("done");
      api.me().then((u) => setCredits(u.credits)).catch(() => {});
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to add record");
    } finally {
      setConfirming(false);
    }
  }

  // ── Photo capture ─────────────────────────────────────────────────────────

  async function capturePhoto() {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext("2d")?.drawImage(video, 0, 0);
    stopCamera();
    setMode("processing");
    setError(null);

    const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/jpeg", 0.9));
    if (!blob) { setError("Failed to capture image"); setMode("idle"); return; }
    const file = new File([blob], "scan.jpg", { type: "image/jpeg" });

    if (!isOnline()) {
      const dataUrl = await fileToDataUrl(file);
      const result = addToOfflineQueue({ id: crypto.randomUUID(), fileName: file.name, fileDataUrl: dataUrl, queuedAt: new Date().toISOString() });
      if (!result.ok) { setError(result.reason ?? "Queue failed"); setMode("idle"); return; }
      refreshQueue();
      setMode("done");
      return;
    }

    try {
      const result = await api.uploadScan(file);
      setScanResult(result);
      setCredits((c) => (c != null ? c - 1 : c));
      setMode("result");
    } catch (e: unknown) {
      const err = e as { status?: number; message?: string };
      if (err.status === 402) {
        setError("No scan credits remaining");
        setMode("idle");
      } else if (!isOnline()) {
        const dataUrl = await fileToDataUrl(file);
        const qResult = addToOfflineQueue({ id: crypto.randomUUID(), fileName: file.name, fileDataUrl: dataUrl, queuedAt: new Date().toISOString() });
        if (!qResult.ok) { setError(qResult.reason ?? "Queue failed"); setMode("idle"); return; }
        refreshQueue();
        setMode("done");
      } else {
        setError(err.message ?? "Scan failed");
        setMode("idle");
      }
    }
  }

  // ── Confirm result ────────────────────────────────────────────────────────

  async function confirmResult() {
    if (!scanResult?.scan_id || !scanResult.discogs_release_id) return;
    setConfirming(true);
    try {
      await api.confirmScan(scanResult.scan_id, scanResult.discogs_release_id, condition, lotId || undefined);
      setFlashConfirm(true);
      setTimeout(() => setFlashConfirm(false), 1500);
      setMode("done");
      api.me().then((u) => setCredits(u.credits)).catch(() => {});
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to confirm");
    } finally {
      setConfirming(false);
    }
  }

  async function skipResult() {
    if (!scanResult?.scan_id) return;
    try { await api.skipScan(scanResult.scan_id); } catch { /* non-fatal */ }
    reset();
  }

  // ── Offline queue flush ───────────────────────────────────────────────────

  async function flushQueue() {
    if (syncing) return;
    setSyncing(true);
    setSyncResult(null);
    const queue = getOfflineQueue();
    let ok = 0; let fail = 0;
    for (const item of queue) {
      try {
        const file = dataUrlToFile(item.fileDataUrl, item.fileName);
        await api.uploadScan(file);
        removeFromOfflineQueue(item.id);
        ok++;
      } catch {
        fail++;
      }
    }
    setSyncing(false);
    setSyncResult({ ok, fail });
    refreshQueue();
  }

  // ── Cleanup ───────────────────────────────────────────────────────────────

  useEffect(() => {
    return () => stopCamera();
  }, []);

  function reset() {
    stopCamera();
    setScanResult(null);
    setBarcodeMatches([]);
    setCondition("VG+");
    setLotId("");
    setError(null);
    setMode("idle");
  }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-full">
      <canvas ref={canvasRef} className="hidden" />

      {/* Camera full-screen overlay */}
      {(mode === "camera" || mode === "barcode") && (
        <div className="fixed inset-0 z-50 bg-black flex flex-col">
          <video
            ref={videoRef}
            className="flex-1 w-full object-cover"
            playsInline
            muted
          />
          {/* Barcode aim guide */}
          {mode === "barcode" && (
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <div className="w-64 h-32 border-2 border-vs-accent rounded-lg opacity-80" />
            </div>
          )}
          {/* Controls */}
          <div className="absolute bottom-0 left-0 right-0 p-6 flex items-center justify-center gap-8"
               style={{ paddingBottom: "calc(1.5rem + env(safe-area-inset-bottom))" }}>
            <button onClick={reset}
              className="w-12 h-12 rounded-full bg-white/20 flex items-center justify-center text-white">
              <X size={22} />
            </button>
            {mode === "camera" && (
              <button onClick={capturePhoto}
                className="w-18 h-18 rounded-full border-4 border-white bg-white/30 flex items-center justify-center active:scale-95 transition-transform"
                style={{ width: 72, height: 72 }}>
                <div className="w-14 h-14 rounded-full bg-white" />
              </button>
            )}
            {mode === "barcode" && (
              <div className="flex flex-col items-center gap-1 text-white">
                <Barcode size={28} className="animate-pulse" />
                <span className="text-xs opacity-70">Point at barcode</span>
              </div>
            )}
            <div className="w-12 h-12" />
          </div>
        </div>
      )}

      {/* Main content */}
      <div className="px-4 pt-10">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-xl font-bold">Scan</h1>
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-vs-raised border border-vs-border">
            <Zap size={13} className="text-vs-accent" />
            <span className="text-sm font-medium">{credits ?? "—"}</span>
          </div>
        </div>

        {/* Offline queue banner */}
        {queueCount > 0 && (
          <div className="mb-4 px-4 py-3 rounded-xl bg-vs-gold/10 border border-vs-gold/30 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <WifiOff size={14} className="text-vs-gold flex-shrink-0" />
              <span className="text-xs text-vs-gold font-medium">{queueCount} scan{queueCount > 1 ? "s" : ""} queued offline</span>
            </div>
            <button
              onClick={flushQueue}
              disabled={syncing || !isOnline()}
              className="text-xs text-vs-gold font-semibold disabled:opacity-40"
            >
              {syncing ? <Loader2 size={13} className="animate-spin" /> : "Sync now"}
            </button>
          </div>
        )}

        {syncResult && (
          <div className={`mb-4 px-4 py-3 rounded-xl border text-xs font-medium flex items-center gap-2 ${
            syncResult.fail === 0 ? "bg-vs-success/10 border-vs-success/30 text-vs-success" : "bg-vs-danger/10 border-vs-danger/30 text-vs-danger"
          }`}>
            {syncResult.fail === 0
              ? <><CheckCircle2 size={14} /> {syncResult.ok} scan{syncResult.ok > 1 ? "s" : ""} synced successfully</>
              : <><AlertCircle size={14} /> {syncResult.ok} synced, {syncResult.fail} failed</>
            }
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="mb-4 px-4 py-3 rounded-xl bg-vs-danger/10 border border-vs-danger/30 text-xs text-vs-danger flex items-center gap-2">
            <AlertCircle size={14} className="flex-shrink-0" />
            {error}
          </div>
        )}

        {/* Idle — action buttons */}
        {mode === "idle" && (
          <div className="flex flex-col gap-3">
            <button onClick={openCamera}
              className="flex items-center gap-4 px-4 py-5 rounded-2xl bg-vs-accent text-white active:opacity-80 transition-opacity"
            >
              <div className="w-12 h-12 rounded-xl bg-white/20 flex items-center justify-center flex-shrink-0">
                <Camera size={24} />
              </div>
              <div className="text-left">
                <p className="text-sm font-semibold">Photo scan</p>
                <p className="text-xs opacity-70">AI identifies artist & title from label photo</p>
              </div>
            </button>
            <button onClick={openBarcode}
              className="flex items-center gap-4 px-4 py-5 rounded-2xl bg-vs-raised border border-vs-border active:opacity-70 transition-opacity"
            >
              <div className="w-12 h-12 rounded-xl bg-vs-accent/10 flex items-center justify-center flex-shrink-0">
                <Barcode size={24} className="text-vs-accent" />
              </div>
              <div className="text-left">
                <p className="text-sm font-semibold">Barcode scan</p>
                <p className="text-xs text-vs-muted">Point camera at barcode — auto finds release</p>
              </div>
            </button>
          </div>
        )}

        {/* Processing */}
        {mode === "processing" && (
          <div className="flex flex-col items-center gap-4 py-16">
            <div className="w-16 h-16 rounded-2xl bg-vs-accent/10 flex items-center justify-center">
              <Loader2 size={32} className="text-vs-accent animate-spin" />
            </div>
            <p className="text-sm font-medium text-vs-text">Identifying record…</p>
            <p className="text-xs text-vs-muted">AI is reading the label</p>
          </div>
        )}

        {/* Barcode results — choose release */}
        {mode === "barcode-results" && barcodeMatches.length > 0 && (
          <div>
            <p className="text-sm font-medium mb-4">Select release</p>
            <ConditionAndLot condition={condition} setCondition={setCondition} lots={lots} lotId={lotId} setLotId={setLotId} />
            <div className="flex flex-col gap-2 mt-4">
              {barcodeMatches.map((m) => (
                <button key={m.release_id}
                  onClick={() => confirmBarcodeRelease(m.release_id)}
                  disabled={confirming}
                  className="flex items-center gap-3 px-4 py-3 rounded-xl bg-vs-raised border border-vs-border text-left active:bg-vs-border transition-colors disabled:opacity-50"
                >
                  {m.cover_image && (
                    <img src={m.cover_image} alt="" loading="lazy" className="w-12 h-12 rounded-lg object-cover flex-shrink-0" />
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium truncate">{m.artist}</p>
                    <p className="text-xs text-vs-muted truncate">{m.title}</p>
                    {m.year && <p className="text-xs text-vs-muted/60">{m.year} · {m.format}</p>}
                  </div>
                  {confirming ? <Loader2 size={16} className="animate-spin flex-shrink-0 text-vs-muted" /> : <Check size={16} className="flex-shrink-0 text-vs-accent" />}
                </button>
              ))}
            </div>
            <button onClick={reset} className="mt-4 w-full py-3 text-xs text-vs-muted">Cancel</button>
          </div>
        )}

        {/* AI scan result */}
        {mode === "result" && scanResult && (
          <div>
            <ResultCard result={scanResult} />
            <ConditionAndLot condition={condition} setCondition={setCondition} lots={lots} lotId={lotId} setLotId={setLotId} />
            <div className="flex gap-3 mt-5">
              <button onClick={skipResult} className="flex-1 py-3.5 rounded-xl border border-vs-border text-sm font-medium text-vs-muted active:opacity-70 transition-opacity">
                Skip
              </button>
              <button
                onClick={confirmResult}
                disabled={confirming || !scanResult.discogs_release_id}
                className="flex-1 py-3.5 rounded-xl bg-vs-accent text-white text-sm font-semibold active:opacity-80 transition-opacity disabled:opacity-40 flex items-center justify-center gap-2"
              >
                {confirming ? <Loader2 size={15} className="animate-spin" /> : <Check size={15} />}
                Add to catalog
              </button>
            </div>
            {!scanResult.discogs_release_id && (
              <p className="text-xs text-vs-muted text-center mt-2">No Discogs match found — record skipped</p>
            )}
          </div>
        )}

        {/* Done */}
        {mode === "done" && (
          <div className="flex flex-col items-center gap-5 py-12">
            <div className={`w-20 h-20 rounded-full flex items-center justify-center transition-all ${
              flashConfirm ? "bg-vs-success/20 scale-110" : "bg-vs-success/10"
            }`}>
              <CheckCircle2 size={40} className="text-vs-success" />
            </div>
            <div className="text-center">
              <p className="text-lg font-semibold">
                {queueCount > 0 ? "Queued for sync" : "Added to catalog"}
              </p>
              <p className="text-xs text-vs-muted mt-1">
                {queueCount > 0 ? "Will sync when back online" : "Record saved successfully"}
              </p>
            </div>
            <div className="flex gap-3 w-full">
              <button onClick={reset}
                className="flex-1 flex items-center justify-center gap-2 py-3.5 rounded-xl bg-vs-accent text-white text-sm font-semibold active:opacity-80 transition-opacity">
                <Camera size={15} />
                Scan another
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Sub-components ─────────────────────────────────────────────────────────

function ResultCard({ result }: { result: ScanUploadResponse }) {
  const conf = result.confidence ?? 0;
  return (
    <div className="mb-5 px-4 py-4 rounded-2xl bg-vs-raised border border-vs-border">
      <div className="flex items-start gap-3">
        {result.matches?.[0]?.cover_image && (
          <img src={result.matches[0].cover_image} alt="" loading="lazy" className="w-16 h-16 rounded-xl object-cover flex-shrink-0" />
        )}
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold truncate">{result.artist ?? "Unknown artist"}</p>
          <p className="text-xs text-vs-muted truncate mt-0.5">{result.title ?? "Unknown title"}</p>
          {result.year && <p className="text-xs text-vs-muted/60 mt-0.5">{result.year}{result.label ? ` · ${result.label}` : ""}</p>}
        </div>
      </div>
      <div className="mt-3">
        <div className="flex items-center justify-between mb-1">
          <span className="text-xs text-vs-muted">AI confidence</span>
          <span className={`text-xs font-medium ${conf >= 70 ? "text-vs-success" : conf >= 40 ? "text-vs-gold" : "text-vs-danger"}`}>{conf}%</span>
        </div>
        <div className="h-1.5 rounded-full bg-vs-border overflow-hidden">
          <div
            className={`h-full rounded-full ${conf >= 70 ? "bg-vs-success" : conf >= 40 ? "bg-vs-gold" : "bg-vs-danger"}`}
            style={{ width: `${conf}%` }}
          />
        </div>
      </div>
    </div>
  );
}

function ConditionAndLot({
  condition, setCondition, lots, lotId, setLotId
}: {
  condition: string;
  setCondition: (c: string) => void;
  lots: Lot[];
  lotId: string;
  setLotId: (id: string) => void;
}) {
  return (
    <div className="flex flex-col gap-3">
      <div>
        <p className="text-xs text-vs-muted mb-2">Condition</p>
        <div className="flex gap-2">
          {CONDITIONS.map((c) => (
            <button key={c} onClick={() => setCondition(c)}
              className={`flex-1 py-2.5 rounded-xl text-xs font-semibold border transition-colors ${
                condition === c
                  ? "bg-vs-accent text-white border-vs-accent"
                  : "border-vs-border text-vs-text-2 bg-vs-raised"
              }`}
            >
              {c}
            </button>
          ))}
        </div>
      </div>
      {lots.length > 0 && (
        <div>
          <p className="text-xs text-vs-muted mb-2">Lot (optional)</p>
          <div className="relative">
            <select
              value={lotId}
              onChange={(e) => setLotId(e.target.value)}
              className="w-full appearance-none input pr-8 text-sm"
            >
              <option value="">No lot</option>
              {lots.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
            </select>
            <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-vs-muted pointer-events-none" />
          </div>
        </div>
      )}
    </div>
  );
}
