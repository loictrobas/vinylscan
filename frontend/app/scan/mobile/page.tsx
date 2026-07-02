"use client";

import { useRef, useState, useCallback, useEffect } from "react";
import { Camera, CheckCircle, Loader2, AlertCircle } from "lucide-react";
import { api, getToken, API_URL } from "@/lib/api";
import type { ScanUploadResponse } from "@/lib/api";

type CaptureState = "uploading" | "done" | "error";

interface CaptureEntry {
  id: string;
  preview: string;
  state: CaptureState;
  artist?: string;
  title?: string;
  errorMsg?: string;
  scanId?: string;
  isEnhance?: boolean;
}

export default function MobileScanPage() {
  const fileRef = useRef<HTMLInputElement>(null);
  const enhanceFileRef = useRef<HTMLInputElement>(null);
  const [entries, setEntries] = useState<CaptureEntry[]>([]);
  const [lastScanId, setLastScanId] = useState<string | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  // Resolve token client-side only (localStorage not available during SSR)
  useEffect(() => {
    setToken(getToken());
    setReady(true);
  }, []);

  const updateEntry = useCallback((id: string, patch: Partial<CaptureEntry>) => {
    setEntries((prev) => prev.map((e) => e.id === id ? { ...e, ...patch } : e));
  }, []);

  const uploadNew = useCallback(async (file: File) => {
    const id = crypto.randomUUID();
    const preview = URL.createObjectURL(file);
    setEntries((prev) => [{ id, preview, state: "uploading" }, ...prev]);
    try {
      const res: ScanUploadResponse = await api.uploadScan(file);
      const scanId = String(res.scan_id);
      updateEntry(id, {
        state: "done",
        artist: res.artist ?? undefined,
        title: res.title ?? undefined,
        scanId,
      });
      setLastScanId(scanId);
    } catch {
      updateEntry(id, { state: "error", errorMsg: "Upload failed — try again" });
    }
  }, [updateEntry]);

  const uploadEnhance = useCallback(async (file: File, scanId: string) => {
    const id = crypto.randomUUID();
    const preview = URL.createObjectURL(file);
    setEntries((prev) => [{ id, preview, state: "uploading", isEnhance: true }, ...prev]);
    try {
      const res: ScanUploadResponse = await api.enhanceScan(scanId, file);
      updateEntry(id, {
        state: "done",
        artist: res.artist ?? undefined,
        title: res.title ?? undefined,
        scanId,
        isEnhance: true,
      });
    } catch {
      updateEntry(id, { state: "error", errorMsg: "Upload failed — try again" });
    }
  }, [updateEntry]);

  // Not ready yet (SSR) — render nothing
  if (!ready) return null;

  // Not logged in
  if (!token) {
    return (
      <div className="min-h-dvh bg-vs-bg flex flex-col items-center justify-center gap-4 p-6">
        <p className="text-vs-text text-center text-sm">Sign in on desktop first, then open this page on your phone.</p>
        <a href="/login" className="text-vs-accent underline text-sm">Go to login</a>
      </div>
    );
  }

  const lastEntry = entries[0];
  const canLinkToLast = lastEntry?.state === "done" && lastScanId && !lastEntry.isEnhance;

  return (
    <div className="min-h-dvh bg-vs-bg flex flex-col" style={{ touchAction: "pan-y" }}>
      {/* Header */}
      <div className="px-4 pt-10 pb-4 border-b border-vs-border">
        <h1 className="text-vs-text font-semibold text-base">VinylScan</h1>
        <p className="text-vs-muted text-xs mt-0.5">Results appear on your desktop automatically</p>
      </div>

      {/* Camera button */}
      <div className="flex flex-col items-center gap-3 px-4 pt-8 pb-4">
        <button
          onClick={() => fileRef.current?.click()}
          className="w-20 h-20 rounded-full bg-vs-accent flex items-center justify-center shadow-lg active:scale-95 transition-transform"
        >
          <Camera size={32} className="text-white" />
        </button>
        <p className="text-vs-muted text-xs">Tap to photograph a record</p>

        {/* Primary file input — new record */}
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (!f) return;
            e.target.value = "";
            uploadNew(f);
          }}
        />

        {/* Enhance file input — same record */}
        <input
          ref={enhanceFileRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (!f || !lastScanId) return;
            e.target.value = "";
            uploadEnhance(f, lastScanId);
          }}
        />
      </div>

      {/* Same / New decision buttons — shown after a completed scan */}
      {canLinkToLast && (
        <div className="mx-4 rounded-xl border border-vs-border bg-vs-card p-4 flex flex-col gap-2">
          <p className="text-vs-muted text-xs text-center">Next photo is…</p>
          <div className="flex gap-2">
            <button
              onClick={() => enhanceFileRef.current?.click()}
              className="flex-1 py-3 rounded-lg bg-vs-accent/10 border border-vs-accent/40 text-vs-accent text-sm font-medium active:scale-95 transition-transform"
            >
              Same record
            </button>
            <button
              onClick={() => fileRef.current?.click()}
              className="flex-1 py-3 rounded-lg bg-vs-raised border border-vs-border text-vs-text text-sm font-medium active:scale-95 transition-transform"
            >
              New record
            </button>
          </div>
        </div>
      )}

      {/* Capture history */}
      <div className="flex-1 overflow-y-auto px-4 pt-4 pb-10 flex flex-col gap-3">
        {entries.map((entry) => (
          <div
            key={entry.id}
            className={`flex items-center gap-3 rounded-xl border p-3 bg-vs-card ${
              entry.isEnhance ? "border-vs-accent/30" : "border-vs-border"
            }`}
          >
            <div className="w-12 h-14 rounded-lg overflow-hidden flex-shrink-0 bg-vs-raised border border-vs-border">
              {entry.preview && <img src={entry.preview} alt="" className="w-full h-full object-cover" />}
            </div>
            <div className="flex-1 min-w-0">
              {entry.state === "uploading" && (
                <div className="flex items-center gap-1.5 text-vs-muted text-sm">
                  <Loader2 size={13} className="animate-spin" />
                  Identifying…
                </div>
              )}
              {entry.state === "done" && (
                <>
                  <p className="text-vs-text text-sm font-medium truncate">{entry.artist || "Unknown artist"}</p>
                  <p className="text-vs-muted text-xs truncate">{entry.title || "Unknown title"}</p>
                  {entry.isEnhance && <p className="text-vs-accent text-[10px] mt-0.5">+ same record</p>}
                </>
              )}
              {entry.state === "error" && (
                <div className="flex items-center gap-1.5 text-vs-danger text-sm">
                  <AlertCircle size={13} />
                  {entry.errorMsg}
                </div>
              )}
            </div>
            {entry.state === "done" && <CheckCircle size={16} className="text-vs-success flex-shrink-0" />}
          </div>
        ))}
        {entries.length === 0 && (
          <p className="text-center text-vs-muted text-sm pt-8">No photos yet</p>
        )}
      </div>
    </div>
  );
}
