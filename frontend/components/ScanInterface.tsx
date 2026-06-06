"use client";

import { useRef, useState, useCallback, useEffect } from "react";
import { Camera, Upload, CheckCircle, AlertCircle, Loader2, Plus, ExternalLink, Music, Barcode, WifiOff, ClipboardList } from "lucide-react";
import { api, type ScanUploadResponse, type DiscogsMatch } from "@/lib/api";
import { isOnline, getOfflineQueue, addToOfflineQueue, removeFromOfflineQueue, fileToDataUrl, dataUrlToFile } from "@/lib/offline";
import dynamic from "next/dynamic";

const BarcodeScanner = dynamic(() => import("./BarcodeScanner"), { ssr: false });

type ItemPhase = "queued" | "uploading" | "result" | "confirming" | "done" | "error";

const CONDITIONS = ["M", "NM", "VG+", "VG", "G"] as const;
type Condition = typeof CONDITIONS[number];

interface QueueItem {
  id: string;
  file: File;
  preview: string;
  phase: ItemPhase;
  result?: ScanUploadResponse;
  errorMsg?: string;
  confirmedReleaseId?: number;
  skipped?: boolean;
  condition: Condition;
}

function ConfidenceDot({ confidence }: { confidence: number }) {
  const color = confidence >= 80 ? "bg-green-500" : confidence >= 50 ? "bg-yellow-500" : "bg-red-500";
  return (
    <span className="flex items-center gap-1.5">
      <span className={`w-2 h-2 rounded-full ${color}`} />
      <span className="text-xs text-vinyl-muted">{confidence}% confidence</span>
    </span>
  );
}

function MatchCard({
  match,
  onAdd,
  disabled,
  isAdding,
}: {
  match: DiscogsMatch;
  onAdd: () => void;
  disabled: boolean;
  isAdding: boolean;
}) {
  const [price, setPrice] = useState<{ lowest: number; currency: string; num_for_sale: number } | null | "loading">("loading");

  useEffect(() => {
    api.getPricing(match.release_id)
      .then((d) => setPrice(d.pricing))
      .catch(() => setPrice(null));
  }, [match.release_id]);

  return (
    <div className="card p-4 flex gap-3 items-start">
      {/* Discogs cover image */}
      <div className="w-20 h-20 flex-shrink-0 rounded-lg overflow-hidden bg-vinyl-border">
        {match.cover_image ? (
          <img
            src={match.cover_image}
            alt={match.title}
            className="w-full h-full object-cover"
            onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <Music size={24} className="text-vinyl-muted" />
          </div>
        )}
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <p className="font-semibold text-sm leading-tight">{match.artist}</p>
        <p className="text-vinyl-muted text-sm truncate">{match.title}</p>
        <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-1.5 text-xs text-vinyl-muted">
          {match.year && <span>{match.year}</span>}
          {match.format && <span>{match.format}</span>}
          {match.label && <span>{match.label}</span>}
          {match.country && <span>{match.country}</span>}
        </div>
        <div className="flex items-center gap-3 mt-2">
          {price === "loading" ? (
            <span className="text-xs text-vinyl-muted flex items-center gap-1">
              <Loader2 size={10} className="animate-spin" /> price…
            </span>
          ) : price ? (
            <span className="text-xs text-vinyl-gold font-semibold">
              Lowest: {price.currency} {price.lowest.toFixed(2)}
              <span className="text-vinyl-muted font-normal ml-1">({price.num_for_sale} for sale)</span>
            </span>
          ) : null}
          <a
            href={`https://www.discogs.com/release/${match.release_id}`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1 text-xs text-vinyl-muted hover:text-vinyl-text transition-colors"
            onClick={(e) => e.stopPropagation()}
          >
            <ExternalLink size={11} />
            View on Discogs
          </a>
        </div>
      </div>

      {/* Add button */}
      <button
        onClick={onAdd}
        disabled={disabled}
        className="flex-shrink-0 btn-primary text-sm py-1.5 px-4 flex items-center gap-1.5 disabled:opacity-50"
      >
        {isAdding ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
        Add
      </button>
    </div>
  );
}

function ConditionPicker({ value, onChange }: { value: Condition; onChange: (c: Condition) => void }) {
  return (
    <div className="flex items-center gap-1.5">
      <span className="text-xs text-vinyl-muted mr-0.5">Condition:</span>
      {CONDITIONS.map((c) => (
        <button
          key={c}
          onClick={() => onChange(c)}
          className={`text-xs px-2 py-1 rounded font-medium transition-colors ${
            value === c
              ? "bg-vinyl-accent text-white"
              : "bg-vinyl-border text-vinyl-muted hover:text-vinyl-text"
          }`}
        >
          {c}
        </button>
      ))}
    </div>
  );
}

function ScanItem({
  item,
  onConfirm,
  onSkip,
  onConditionChange,
}: {
  item: QueueItem;
  onConfirm: (itemId: string, releaseId: number) => void;
  onSkip: (itemId: string) => void;
  onConditionChange: (itemId: string, condition: Condition) => void;
}) {
  const [showAllMatches, setShowAllMatches] = useState(false);
  const result = item.result;

  if (item.phase === "queued") {
    return (
      <div className="card p-4 flex items-center gap-3 opacity-60">
        <img src={item.preview} alt="" className="w-12 h-12 object-cover rounded-lg flex-shrink-0" />
        <p className="text-vinyl-muted text-sm">Waiting...</p>
      </div>
    );
  }

  if (item.phase === "uploading") {
    return (
      <div className="card p-4 flex items-center gap-3">
        <img src={item.preview} alt="" className="w-12 h-12 object-cover rounded-lg flex-shrink-0" />
        <div className="flex items-center gap-2">
          <Loader2 size={16} className="text-vinyl-accent animate-spin" />
          <p className="text-sm">Identifying with Claude AI...</p>
        </div>
      </div>
    );
  }

  if (item.phase === "error") {
    return (
      <div className="card p-4 flex items-center gap-3">
        <img src={item.preview} alt="" className="w-12 h-12 object-cover rounded-lg flex-shrink-0" />
        <div className="flex items-center gap-2">
          <AlertCircle size={16} className="text-vinyl-accent" />
          <p className="text-sm text-vinyl-muted">{item.errorMsg}</p>
        </div>
      </div>
    );
  }

  if (item.phase === "done") {
    const r = item.result;
    return (
      <div className="card p-4 flex items-center gap-3">
        <img src={item.preview} alt="" className="w-12 h-12 object-cover rounded-lg flex-shrink-0" />
        <div className="flex items-center gap-2 flex-1">
          <CheckCircle size={16} className="text-green-500 flex-shrink-0" />
          <div>
            <p className="text-sm font-medium">{r?.artist} — {r?.title}</p>
            <p className="text-xs text-vinyl-muted">{item.skipped ? "Skipped" : "Added to Discogs"}</p>
          </div>
        </div>
        {item.confirmedReleaseId && (
          <a href={`https://www.discogs.com/release/${item.confirmedReleaseId}`} target="_blank" rel="noopener noreferrer"
            className="text-vinyl-muted hover:text-vinyl-text">
            <ExternalLink size={14} />
          </a>
        )}
      </div>
    );
  }

  if ((item.phase === "result" || item.phase === "confirming") && result) {
    const isConfirming = item.phase === "confirming";
    return (
      <div className="card overflow-hidden">
        {/* AI identification header */}
        <div className="p-4 border-b border-vinyl-border flex items-center gap-3">
          <img src={item.preview} alt="" className="w-14 h-14 object-cover rounded-lg flex-shrink-0" />
          <div className="flex-1">
            <p className="font-semibold">{result.artist} — {result.title}</p>
            <div className="flex items-center gap-3 mt-1 flex-wrap">
              <ConfidenceDot confidence={result.confidence} />
              {result.year && <span className="text-xs text-vinyl-muted">{result.year}</span>}
              {result.label && <span className="text-xs text-vinyl-muted">{result.label}</span>}
            </div>
          </div>
        </div>

        {/* Discogs matches */}
        <div className="p-4 flex flex-col gap-3">
          {result.matches.length > 0 ? (
            <>
              <p className="text-xs text-vinyl-muted font-medium uppercase tracking-wider">
                {result.matches.length} Discogs match{result.matches.length > 1 ? "es" : ""} — pick the right one:
              </p>
              {(showAllMatches ? result.matches : result.matches.slice(0, 2)).map((m) => (
                <MatchCard
                  key={m.release_id}
                  match={m}
                  onAdd={() => onConfirm(item.id, m.release_id)}
                  disabled={isConfirming}
                  isAdding={isConfirming}
                />
              ))}
              {result.matches.length > 2 && (
                <button
                  onClick={() => setShowAllMatches(!showAllMatches)}
                  className="text-xs text-vinyl-accent hover:underline text-center py-1"
                >
                  {showAllMatches ? "Show less" : `Show ${result.matches.length - 2} more match${result.matches.length - 2 > 1 ? "es" : ""}`}
                </button>
              )}
            </>
          ) : (
            <div className="text-center py-4 text-vinyl-muted text-sm">
              No Discogs matches found for this record.
            </div>
          )}

          <div className="pt-2 border-t border-vinyl-border mt-1">
            <ConditionPicker
              value={item.condition}
              onChange={(c) => onConditionChange(item.id, c)}
            />
          </div>

          <div className="flex items-center justify-between pt-1">
            <p className="text-xs text-vinyl-muted">1 credit used on add or skip</p>
            <button
              onClick={() => onSkip(item.id)}
              disabled={isConfirming}
              className="text-xs text-vinyl-muted hover:text-vinyl-text transition-colors disabled:opacity-50"
            >
              None of these / Skip →
            </button>
          </div>
        </div>
      </div>
    );
  }

  return null;
}

export function ScanInterface() {
  const fileRef = useRef<HTMLInputElement>(null);
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [processing, setProcessing] = useState(false);
  const [showBarcode, setShowBarcode] = useState(false);
  const [barcodeSearching, setBarcodeSearching] = useState(false);
  const [online, setOnline] = useState(true);
  const [offlineQueueCount, setOfflineQueueCount] = useState(0);
  const [syncing, setSyncing] = useState(false);

  useEffect(() => {
    setOnline(isOnline());
    setOfflineQueueCount(getOfflineQueue().length);

    function handleOnline() {
      setOnline(true);
      syncOfflineQueue();
    }
    function handleOffline() { setOnline(false); }

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  async function syncOfflineQueue() {
    const q = getOfflineQueue();
    if (q.length === 0) return;
    setSyncing(true);
    for (const item of q) {
      try {
        const file = dataUrlToFile(item.fileDataUrl, item.fileName);
        const newItem: QueueItem = {
          id: item.id,
          file,
          preview: item.fileDataUrl,
          phase: "queued",
          condition: "VG+",
        };
        setQueue((prev) => [...prev, newItem]);
        removeFromOfflineQueue(item.id);
        setOfflineQueueCount(getOfflineQueue().length);
        await processItem(newItem);
      } catch {
        // leave in queue if still failing
      }
    }
    setSyncing(false);
  }

  function updateItem(id: string, patch: Partial<QueueItem>) {
    setQueue((q) => q.map((item) => (item.id === id ? { ...item, ...patch } : item)));
  }

  async function processItem(item: QueueItem) {
    updateItem(item.id, { phase: "uploading" });
    try {
      const res = await api.uploadScan(item.file);
      if (res.error === "identification_failed") {
        updateItem(item.id, { phase: "error", errorMsg: "Could not identify record. Try a clearer photo." });
      } else {
        updateItem(item.id, { phase: "result", result: res });
      }
    } catch (err: unknown) {
      const e = err as { status?: number; data?: { error?: string } };
      const msg = e?.status === 403 || e?.data?.error === "no_credits"
        ? "No credits remaining."
        : "Upload failed. Try again.";
      updateItem(item.id, { phase: "error", errorMsg: msg });
    }
  }

  async function handleFiles(files: FileList) {
    if (!isOnline()) {
      // Store files for later sync
      for (const file of Array.from(files)) {
        const dataUrl = await fileToDataUrl(file);
        addToOfflineQueue({
          id: `offline-${Date.now()}-${Math.random()}`,
          fileName: file.name,
          fileDataUrl: dataUrl,
          queuedAt: new Date().toISOString(),
        });
      }
      setOfflineQueueCount(getOfflineQueue().length);
      return;
    }

    const newItems: QueueItem[] = Array.from(files).map((file) => ({
      id: `${Date.now()}-${Math.random()}`,
      file,
      preview: URL.createObjectURL(file),
      phase: "queued" as ItemPhase,
      condition: "VG+" as Condition,
    }));
    setQueue((q) => [...q, ...newItems]);
    setProcessing(true);
    for (const item of newItems) {
      await processItem(item);
    }
    setProcessing(false);
  }

  async function handleConfirm(itemId: string, releaseId: number) {
    const item = queue.find((i) => i.id === itemId);
    if (!item?.result) return;
    updateItem(itemId, { phase: "confirming" });
    const coverImage = item.result.matches?.find((m) => m.release_id === releaseId)?.cover_image ?? null;
    try {
      if (item.id.startsWith("barcode-")) {
        await api.barcodeAdd(releaseId, item.condition);
      } else {
        await api.confirmScan(item.result.scan_id, releaseId, item.condition, undefined, coverImage);
      }
      updateItem(itemId, { phase: "done", confirmedReleaseId: releaseId });
    } catch {
      updateItem(itemId, { phase: "result", errorMsg: "Failed to add. Try again." });
    }
  }

  function handleConditionChange(itemId: string, condition: Condition) {
    updateItem(itemId, { condition });
  }

  async function handleSkip(itemId: string) {
    const item = queue.find((i) => i.id === itemId);
    if (!item?.result) return;
    if (item.id.startsWith("barcode-")) {
      updateItem(itemId, { phase: "done", skipped: true });
      return;
    }
    updateItem(itemId, { phase: "confirming" });
    try {
      await api.skipScan(item.result.scan_id);
      updateItem(itemId, { phase: "done", skipped: true });
    } catch {
      updateItem(itemId, { phase: "result", errorMsg: "Skip failed. Try again." });
    }
  }

  function clearDone() {
    setQueue((q) => q.filter((i) => i.phase !== "done"));
  }

  const handleBarcodeDetected = useCallback(async (barcode: string) => {
    setShowBarcode(false);
    setBarcodeSearching(true);
    try {
      const data = await api.barcodeSearch(barcode);
      if (data.matches.length === 0) {
        alert(`No Discogs results for barcode ${barcode}`);
        return;
      }
      // Create a synthetic result item so user can confirm via normal flow
      const fakeResult: ScanUploadResponse = {
        scan_id: "",
        status: "pending",
        artist: data.matches[0].artist,
        title: data.matches[0].title,
        year: data.matches[0].year,
        label: data.matches[0].label,
        catalog_number: null,
        confidence: 100,
        auto_added: false,
        discogs_release_id: null,
        matches: data.matches,
      };
      const newItem: QueueItem = {
        id: `barcode-${Date.now()}`,
        file: new File([], barcode),
        preview: data.matches[0].cover_image || "",
        phase: "result",
        result: fakeResult,
        condition: "VG+",
      };
      setQueue((q) => [...q, newItem]);
    } catch {
      alert("Barcode lookup failed. Try again.");
    } finally {
      setBarcodeSearching(false);
    }
  }, []);

  const doneCount = queue.filter((i) => i.phase === "done").length;
  const pendingCount = queue.filter((i) => !["done", "error"].includes(i.phase)).length;

  return (
    <div className="max-w-xl mx-auto flex flex-col gap-4">
      {showBarcode && (
        <BarcodeScanner
          onDetected={handleBarcodeDetected}
          onClose={() => setShowBarcode(false)}
        />
      )}

      {!online && (
        <div className="card p-3 flex items-center gap-2 border-yellow-500/30 bg-yellow-500/10">
          <WifiOff size={16} className="text-yellow-400 flex-shrink-0" />
          <p className="text-sm text-yellow-300">
            Offline — photos saved locally.{" "}
            {offlineQueueCount > 0 && `${offlineQueueCount} waiting to sync.`}
          </p>
        </div>
      )}

      {online && offlineQueueCount > 0 && (
        <div className="card p-3 flex items-center justify-between gap-2">
          <p className="text-sm text-vinyl-muted">
            {syncing ? "Syncing..." : `${offlineQueueCount} offline photo${offlineQueueCount > 1 ? "s" : ""} ready to sync`}
          </p>
          {!syncing && (
            <button onClick={syncOfflineQueue} className="text-xs text-vinyl-accent hover:underline">
              Sync now
            </button>
          )}
        </div>
      )}

      {/* Upload area — always visible */}
      <div className="card p-6 flex flex-col items-center gap-4 text-center">
        <div className="w-16 h-16 rounded-full bg-vinyl-border flex items-center justify-center">
          <Camera size={28} className="text-vinyl-accent" />
        </div>
        <div>
          <h2 className="text-lg font-bold">Scan Records</h2>
          <p className="text-vinyl-muted text-sm mt-0.5">Select one or more photos to identify and add to Discogs</p>
        </div>
        <div className="flex gap-3 w-full">
          <button
            onClick={() => {
              if (fileRef.current) {
                fileRef.current.setAttribute("capture", "environment");
                fileRef.current.removeAttribute("multiple");
                fileRef.current.click();
              }
            }}
            className="btn-primary flex-1 flex items-center justify-center gap-2"
            disabled={processing || barcodeSearching}
          >
            <Camera size={16} />
            Camera
          </button>
          <button
            onClick={() => {
              if (fileRef.current) {
                fileRef.current.removeAttribute("capture");
                fileRef.current.setAttribute("multiple", "true");
                fileRef.current.click();
              }
            }}
            className="btn-secondary flex-1 flex items-center justify-center gap-2"
            disabled={processing || barcodeSearching}
          >
            <Upload size={16} />
            Upload {queue.length > 0 ? "More" : "Files"}
          </button>
        </div>
        <button
          onClick={() => setShowBarcode(true)}
          className="btn-secondary w-full flex items-center justify-center gap-2"
          disabled={processing || barcodeSearching}
        >
          {barcodeSearching ? (
            <><Loader2 size={16} className="animate-spin" /> Looking up barcode...</>
          ) : (
            <><Barcode size={16} /> Scan Barcode (free, instant)</>
          )}
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => {
            if (e.target.files?.length) handleFiles(e.target.files);
            e.target.value = "";
          }}
        />
      </div>

      {/* Queue */}
      {queue.length > 0 && (
        <div className="flex flex-col gap-3">
          {doneCount > 0 && pendingCount === 0 && (
            <div className="flex items-center justify-between px-1">
              <p className="text-sm text-vinyl-muted">{doneCount} record{doneCount > 1 ? "s" : ""} processed</p>
              <div className="flex items-center gap-3">
                <a href="/scan/session" className="text-xs text-vinyl-accent hover:underline flex items-center gap-1">
                  <ClipboardList size={12} /> Session summary
                </a>
                <button onClick={clearDone} className="text-xs text-vinyl-muted hover:text-vinyl-text transition-colors">
                  Clear
                </button>
              </div>
            </div>
          )}
          {queue.map((item) => (
            <ScanItem
              key={item.id}
              item={item}
              onConfirm={handleConfirm}
              onSkip={handleSkip}
              onConditionChange={handleConditionChange}
            />
          ))}
        </div>
      )}
    </div>
  );
}
