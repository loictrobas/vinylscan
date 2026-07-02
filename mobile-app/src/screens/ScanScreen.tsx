import { useState, useCallback, useEffect, useRef } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Camera, Disc3, Wifi, WifiOff, Settings, Check, Trash2, Loader2 } from "lucide-react";
import { api, clearToken, getApiUrl, setApiUrl, clearApiUrl, _BUILT_IN_URL, type PendingScan } from "../lib/api";
import CameraScreen, { type CaptureMode, type CaptureStatus } from "./CameraScreen";

interface Props {
  onLogout: () => void;
}

export default function ScanScreen({ onLogout }: Props) {
  const [cameraOpen, setCameraOpen] = useState(false);
  const [lastScanId, setLastScanId] = useState<string | null>(null);
  const [sentCount, setSentCount] = useState(0);
  const [lastSessionCount, setLastSessionCount] = useState<number | null>(null);
  const [status, setStatus] = useState<CaptureStatus | null>(null);
  const [backendReachable, setBackendReachable] = useState<boolean | null>(null);
  const [showServerConfig, setShowServerConfig] = useState(false);
  const [serverInput, setServerInput] = useState(getApiUrl());
  const [serverSaved, setServerSaved] = useState(false);
  const [pending, setPending] = useState<PendingScan[]>([]);
  const [clearingHistory, setClearingHistory] = useState(false);
  const statusTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function ping() {
      try {
        const res = await fetch(`${getApiUrl()}/health`, { method: "GET" });
        if (!cancelled) setBackendReachable(res.ok);
      } catch {
        if (!cancelled) setBackendReachable(false);
      }
    }
    ping();
    const interval = setInterval(ping, 15000);
    return () => { cancelled = true; clearInterval(interval); };
  }, []);

  // Same /scan/pending the desktop polls — mirrors it exactly, no separate mobile
  // history to drift out of sync. Confirms a shot actually made it to the backend
  // even before you sit down at the computer.
  useEffect(() => {
    let cancelled = false;
    function load() {
      api.pendingScans().then((p) => { if (!cancelled) setPending(p); }).catch((e: unknown) => {
        // A 401 here means the session already went bad in the background — bounce
        // to login now, visibly, instead of leaving a dead token in place that only
        // surfaces as a confusing failure the next time you try to do something.
        if (!cancelled && (e as { status?: number }).status === 401) onLogout();
      });
    }
    load();
    const interval = setInterval(load, 8000);
    return () => { cancelled = true; clearInterval(interval); };
  }, [onLogout]);

  async function handleClearHistory() {
    if (!pending.length) return;
    if (!window.confirm(`Clear ${pending.length} item${pending.length !== 1 ? "s" : ""}? Not-yet-added scans will be skipped (1 credit each).`)) return;
    setClearingHistory(true);
    const results = await Promise.allSettled(pending.map((p) => api.skipScan(p.scan_id)));
    if (results.some((r) => r.status === "rejected" && (r.reason as { status?: number })?.status === 401)) {
      onLogout();
      return;
    }
    setPending([]);
    setClearingHistory(false);
  }

  useEffect(() => () => { if (statusTimer.current) clearTimeout(statusTimer.current); }, []);

  function flashStatus(next: CaptureStatus, holdMs: number) {
    setStatus(next);
    if (statusTimer.current) clearTimeout(statusTimer.current);
    statusTimer.current = setTimeout(() => setStatus(null), holdMs);
  }

  // Fire-and-forget: never blocks capture. The phone doesn't wait on Claude/Discogs —
  // it just needs scan_id back fast enough to chain a "same record" follow-up photo.
  // Mode comes straight from which button was tapped, not a separate toggle.
  const handleCapture = useCallback((file: File, _preview: string, mode: CaptureMode) => {
    flashStatus({ kind: "sending", text: "Sending…" }, 10000);
    const useEnhance = mode === "same" && lastScanId != null;

    const req = useEnhance
      ? api.enhanceScan(lastScanId!, file)
      : api.uploadScan(file);

    req.then((ack) => {
      setLastScanId(ack.scan_id);
      setSentCount((n) => n + 1);
      flashStatus({ kind: "sent", text: "Sent ✓" }, 1500);
    }).catch((e: unknown) => {
      if ((e as { status?: number }).status === 401) { clearToken(); onLogout(); return; }
      const msg = (e instanceof Error ? e.message : null) || "Upload failed";
      flashStatus({ kind: "error", text: msg }, 4000);
    });
  }, [lastScanId, onLogout]);

  function openCamera() {
    setLastScanId(null);
    setSentCount(0);
    setLastSessionCount(null);
    setStatus(null);
    setCameraOpen(true);
  }

  function endSession() {
    setCameraOpen(false);
    setLastSessionCount(sentCount);
    setLastScanId(null);
    setStatus(null);
  }

  return (
    <>
      <AnimatePresence>
        {cameraOpen && (
          <CameraScreen
            key="camera"
            onCapture={handleCapture}
            onDone={endSession}
            canUseSameMode={lastScanId != null}
            sentCount={sentCount}
            status={status}
          />
        )}
      </AnimatePresence>

      <div className="fixed inset-0 bg-vs-bg flex flex-col" style={{ paddingTop: "env(safe-area-inset-top)", paddingBottom: "env(safe-area-inset-bottom)" }}>
        {/* Header */}
        <div className="border-b border-vs-border shadow-sm shadow-black/10">
          <div className="flex items-center justify-between px-5 pt-4 pb-3">
            <div className="flex items-center gap-2.5">
              <div
                className="w-8 h-8 rounded-xl flex items-center justify-center ring-1 ring-white/10"
                style={{
                  background: "linear-gradient(135deg, var(--vs-accent), var(--vs-accent-dark))",
                  boxShadow: "inset 0 1px 0 rgba(255,255,255,0.3), 0 2px 8px -1px rgba(79,110,247,0.5)",
                }}
              >
                <Disc3 size={15} className="text-white" />
              </div>
              <span className="font-semibold text-vs-text tracking-tight">VinylScan</span>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => { setServerInput(getApiUrl()); setShowServerConfig((v) => !v); }}
                className={`flex items-center gap-1.5 text-xs font-medium active:opacity-60 ${
                  backendReachable === true ? "text-vs-success" :
                  backendReachable === false ? "text-vs-danger" : "text-vs-muted"
                }`}
              >
                {backendReachable === true ? (
                  <><span className="w-2 h-2 rounded-full bg-vs-success animate-pulse" /><Wifi size={12} /></>
                ) : backendReachable === false ? (
                  <><span className="w-2 h-2 rounded-full bg-vs-danger" /><WifiOff size={12} /></>
                ) : (
                  <Wifi size={12} className="opacity-30" />
                )}
                <Settings size={11} className="opacity-50" />
              </button>
              <button
                onClick={() => { clearToken(); onLogout(); }}
                className="text-vs-muted text-xs px-3 py-1.5 rounded-lg border border-vs-border active:opacity-60"
              >
                Sign out
              </button>
            </div>
          </div>

          {/* Server config panel */}
          {showServerConfig && (
            <div className="px-5 pb-3 flex flex-col gap-2">
              <p className="text-vs-muted/50 text-xs">Default: {_BUILT_IN_URL}</p>
              <div className="flex gap-2">
                <input
                  type="url"
                  autoCapitalize="none"
                  autoCorrect="off"
                  value={serverInput}
                  onChange={(e) => setServerInput(e.target.value)}
                  placeholder={_BUILT_IN_URL}
                  className="flex-1 rounded-xl bg-vs-raised border border-vs-border px-3 py-2.5 text-vs-text text-sm placeholder:text-vs-muted/30 outline-none focus:border-vs-accent"
                />
                <button
                  type="button"
                  onClick={() => {
                    if (serverInput.trim()) setApiUrl(serverInput.trim());
                    else { clearApiUrl(); setServerInput(getApiUrl()); }
                    setServerSaved(true);
                    setShowServerConfig(false);
                    setTimeout(() => setServerSaved(false), 2000);
                    setBackendReachable(null);
                  }}
                  className="px-4 py-2.5 rounded-xl bg-vs-raised border border-vs-border text-vs-text text-sm font-medium active:opacity-60 flex items-center gap-1.5"
                >
                  {serverSaved ? <Check size={14} className="text-vs-success" /> : "Save"}
                </button>
              </div>
              <button
                type="button"
                onClick={() => { clearApiUrl(); setServerInput(getApiUrl()); setBackendReachable(null); }}
                className="text-vs-muted/60 text-xs underline self-start active:opacity-60"
              >
                Reset to default
              </button>
            </div>
          )}
        </div>

        {/* Scan button */}
        <div className="flex flex-col items-center gap-4 px-8 py-9 flex-shrink-0">
          <motion.button
            onClick={openCamera}
            className="relative w-28 h-28"
            whileTap={{ scale: 0.92 }}
            transition={{ duration: 0.12, ease: "easeOut" }}
          >
            <span className="absolute inset-0 rounded-full bg-vs-accent/30 animate-ping" style={{ animationDuration: "2.5s" }} />
            <span
              className="absolute inset-0 rounded-full flex items-center justify-center ring-1 ring-white/15"
              style={{
                background: "linear-gradient(160deg, var(--vs-accent), var(--vs-accent-dark))",
                boxShadow: "inset 0 2px 0 rgba(255,255,255,0.3), inset 0 -3px 8px rgba(0,0,0,0.25), 0 10px 24px -6px rgba(79,110,247,0.55)",
              }}
            >
              <Camera size={38} className="text-white" strokeWidth={2} />
            </span>
          </motion.button>
          <p className="text-vs-text/80 text-sm font-medium text-center">Tap to start scanning</p>
          {lastSessionCount != null && (
            <span className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-vs-raised border border-vs-border text-xs text-vs-muted">
              <Check size={11} className="text-vs-success" />
              Last session: {lastSessionCount} sent
            </span>
          )}
        </div>

        {/* History — mirrors the desktop scan page exactly: same pending list, same clear */}
        <div className="flex-1 overflow-y-auto px-5 pb-6">
          <div className="flex items-center justify-between mb-3">
            <p className="text-xs font-semibold text-vs-muted uppercase tracking-wide">
              {pending.length > 0 ? `${pending.length} waiting on desktop` : "History"}
            </p>
            {pending.length > 0 && (
              <button
                onClick={handleClearHistory}
                disabled={clearingHistory}
                className="flex items-center gap-1 text-xs text-vs-danger/80 active:opacity-60 disabled:opacity-50"
              >
                {clearingHistory ? <Loader2 size={11} className="animate-spin" /> : <Trash2 size={11} />}
                Clear
              </button>
            )}
          </div>

          {pending.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-12 opacity-60">
              <Disc3 size={32} className="text-vs-muted/40" />
              <p className="text-vs-muted/50 text-xs text-center">Nothing scanned yet</p>
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              {pending.map((p) => (
                <div key={p.scan_id} className="relative flex items-center gap-3 px-3 py-2.5 rounded-xl bg-vs-raised border border-vs-border shadow-sm shadow-black/5 overflow-hidden">
                  <span className={`absolute left-0 top-0 bottom-0 w-0.5 ${p.artist || p.title ? "bg-vs-success/60" : "bg-vs-accent/60"}`} />
                  <img
                    src={p.image_url}
                    alt=""
                    className="w-11 h-11 rounded-lg object-cover bg-vs-border border border-vs-border/50 flex-shrink-0"
                  />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-vs-text truncate">
                      {p.artist || p.title ? (p.artist && p.title ? `${p.artist} — ${p.title}` : p.artist || p.title) : "Identifying…"}
                    </p>
                    <p className="text-xs text-vs-muted/60">Waiting on desktop</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
