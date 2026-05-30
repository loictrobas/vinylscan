"use client";

import { useRef, useState } from "react";
import { Camera, Upload, CheckCircle, AlertCircle, Loader2, Plus, ExternalLink, Music } from "lucide-react";
import { api, type ScanUploadResponse, type DiscogsMatch } from "@/lib/api";

type ItemPhase = "queued" | "uploading" | "result" | "confirming" | "done" | "error";

interface QueueItem {
  id: string;
  file: File;
  preview: string;
  phase: ItemPhase;
  result?: ScanUploadResponse;
  errorMsg?: string;
  confirmedReleaseId?: number;
  skipped?: boolean;
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

function ScanItem({
  item,
  onConfirm,
  onSkip,
}: {
  item: QueueItem;
  onConfirm: (itemId: string, releaseId: number) => void;
  onSkip: (itemId: string) => void;
}) {
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
              {result.matches.map((m) => (
                <MatchCard
                  key={m.release_id}
                  match={m}
                  onAdd={() => onConfirm(item.id, m.release_id)}
                  disabled={isConfirming}
                  isAdding={isConfirming}
                />
              ))}
            </>
          ) : (
            <div className="text-center py-4 text-vinyl-muted text-sm">
              No Discogs matches found for this record.
            </div>
          )}

          <div className="flex items-center justify-between pt-1 border-t border-vinyl-border mt-1">
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
    const newItems: QueueItem[] = Array.from(files).map((file) => ({
      id: `${Date.now()}-${Math.random()}`,
      file,
      preview: URL.createObjectURL(file),
      phase: "queued" as ItemPhase,
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
    try {
      await api.confirmScan(item.result.scan_id, releaseId);
      updateItem(itemId, { phase: "done", confirmedReleaseId: releaseId });
    } catch {
      updateItem(itemId, { phase: "result", errorMsg: "Failed to add. Try again." });
    }
  }

  async function handleSkip(itemId: string) {
    const item = queue.find((i) => i.id === itemId);
    if (!item?.result) return;
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

  const doneCount = queue.filter((i) => i.phase === "done").length;
  const pendingCount = queue.filter((i) => !["done", "error"].includes(i.phase)).length;

  return (
    <div className="max-w-xl mx-auto flex flex-col gap-4">
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
            disabled={processing}
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
            disabled={processing}
          >
            <Upload size={16} />
            Upload {queue.length > 0 ? "More" : "Files"}
          </button>
        </div>
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
              <button onClick={clearDone} className="text-xs text-vinyl-muted hover:text-vinyl-text transition-colors">
                Clear done
              </button>
            </div>
          )}
          {queue.map((item) => (
            <ScanItem
              key={item.id}
              item={item}
              onConfirm={handleConfirm}
              onSkip={handleSkip}
            />
          ))}
        </div>
      )}
    </div>
  );
}
