"use client";

import { useRef, useState, useCallback, useEffect } from "react";
import {
  Camera, Upload, CheckCircle, AlertCircle, Loader2, Plus,
  ExternalLink, Music, Barcode, WifiOff, ClipboardList, X, Layers,
  ChevronDown, ChevronRight, Zap, Trash2, HelpCircle, Smartphone, Search, Tag,
} from "lucide-react";
import {
  api, isLikelyColdStart, getToken, API_URL,
  type ScanUploadResponse, type DiscogsMatch, type User, type Lot,
  type AdminDebugSearchResult,
} from "@/lib/api";
import {
  isOnline, getOfflineQueue, addToOfflineQueue,
  removeFromOfflineQueue, fileToDataUrl, dataUrlToFile,
} from "@/lib/offline";
import dynamic from "next/dynamic";

const BarcodeScanner = dynamic(() => import("./BarcodeScanner"), { ssr: false });

import {
  CONDITIONS, FORMATS, type Condition, type ItemPhase, type QueueItem,
  fuzzyKey, parseDiscogsReleaseId, ConditionPicker, HelpModal, ImageLightbox,
} from "./scan/shared";
import { MatchCard } from "./scan/MatchCard";
import { LowInfoSearchForm, ManualAddForm } from "./scan/forms";
import { DebugSidePanel } from "./scan/DebugPanel";
import { ScanItem } from "./scan/ScanItem";

export function ScanInterface({ showDebug }: {
  showDebug?: boolean;
} = {}) {
  const fileRef = useRef<HTMLInputElement>(null);
  // Guards against double-add: the "Add" button click and the global Enter-key
  // shortcut can both fire for the same item before React re-renders the
  // "confirming" phase (state updates aren't synchronous), so the disabled prop
  // alone doesn't prevent two concurrent confirmScan requests. A ref updates
  // immediately, so this catches it even within the same tick.
  const confirmingIdsRef = useRef<Set<string>>(new Set());
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [processing, setProcessing] = useState(false);
  const [showBarcode, setShowBarcode] = useState(false);
  const [barcodeSearching, setBarcodeSearching] = useState(false);
  const [barcodeError, setBarcodeError] = useState<string | null>(null);
  const [online, setOnline] = useState(true);
  const [offlineQueueCount, setOfflineQueueCount] = useState(0);
  const [syncing, setSyncing] = useState(false);
  const [sseConnected, setSseConnected] = useState(false);
  const [ownedReleaseIds, setOwnedReleaseIds] = useState<Set<number>>(new Set());
  const [ownedFuzzyKeys, setOwnedFuzzyKeys] = useState<Set<string>>(new Set());
  const [user, setUser] = useState<User | null>(null);
  const [lots, setLots] = useState<Lot[]>([]);
  const [sessionCondition, setSessionCondition] = useState<Condition>("VG+");
  const [sessionLotId, setSessionLotId] = useState<string>("");
  const [isDragging, setIsDragging] = useState(false);
  const [addedCount, setAddedCount] = useState(0);
  const [skippedCount, setSkippedCount] = useState(0);
  const [clearingHistory, setClearingHistory] = useState(false);
  const [showHelp, setShowHelp] = useState(false);

  // Pulls whatever's pending straight from the DB and merges it in. This is the
  // source of truth — not the SSE stream, which only helps if a tab happens to be
  // open, connected, and not stuck in some silently-broken browser state (which it
  // can be even while showing "connected"). Polling this independently means results
  // always show up within one cycle no matter what state the live connection is in —
  // no refresh, no console-checking, no account-juggling required.
  const refreshPending = useCallback(() => {
    api.pendingScans().then((pending) => {
      if (!pending.length) return;
      setQueue((prev) => {
        const byId = new Map(prev.map((i) => [i.id, i] as const));
        const newItems: QueueItem[] = [];

        for (const p of pending) {
          const id = `scan-${p.scan_id}`;
          const existing = byId.get(id);

          if (existing) {
            // Already shown as a placeholder while analysis was still running —
            // upgrade it in place to the real result the moment it's ready,
            // instead of leaving a stale "0% / no matches" card sitting forever.
            if (existing.phase === "uploading" && !p.processing) {
              byId.set(id, { ...existing, phase: "result", preview: p.image_url, result: p });
            }
            continue;
          }

          newItems.push(p.processing
            ? { id, file: new File([], "scan"), preview: p.image_url, phase: "uploading", condition: sessionCondition, photoCount: 1 }
            : { id, file: new File([], "scan"), preview: p.image_url, phase: "result", condition: sessionCondition, photoCount: 1, result: p }
          );
        }

        // pendingScans is oldest-first; queue convention is newest-first
        const updatedPrev = prev.map((i) => byId.get(i.id) ?? i);
        return [...newItems.reverse(), ...updatedPrev];
      });
    }).catch(() => {});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    refreshPending();
    const interval = setInterval(refreshPending, 8000);
    return () => clearInterval(interval);
  }, [refreshPending]);

  useEffect(() => {
    api.me().then(setUser).catch(() => {});
    api.ownedReleaseIds()
      .then(({ release_ids, owned }) => {
        setOwnedReleaseIds(new Set(release_ids));
        setOwnedFuzzyKeys(new Set(owned.map((o) => fuzzyKey(o.artist, o.title))));
      })
      .catch(() => {});
    api.listLots().then(setLots).catch(() => {});

    setOnline(isOnline());
    setOfflineQueueCount(getOfflineQueue().length);

    function handleOnline() { setOnline(true); syncOfflineQueue(); }
    function handleOffline() { setOnline(false); }
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Mobile→Desktop SSE: receive scans uploaded from phone in real-time
  useEffect(() => {
    const token = getToken();
    if (!token) return;
    let es: EventSource | null = null;
    let retryTimeout: ReturnType<typeof setTimeout>;

    function connect() {
      setSseConnected(false);
      es = new EventSource(`${API_URL}/scan/stream?token=${encodeURIComponent(token!)}`);

      es.onmessage = (e) => {
        try {
          const event = JSON.parse(e.data) as { type: string } & Partial<ScanUploadResponse> & { image_url?: string };
          console.log("[SSE] event received:", event.type, event);
          if (event.type === "connected") { setSseConnected(true); return; }
          if (event.type === "scan_error") {
            // Phone-sourced scan failed during background analysis — surface it as a
            // persistent card (not a toast) so it can't be missed if no one's looking.
            const errScanId = event.scan_id ? String(event.scan_id) : null;
            if (!errScanId) return;
            const errId = `scan-${errScanId}`;
            const errItem: QueueItem = {
              id: errId,
              file: new File([], "mobile"),
              preview: (event as { image_url?: string }).image_url || "",
              phase: "error",
              errorMsg: (event as { error?: string }).error || "Scan failed to process",
              retryable: false,
              condition: sessionCondition,
              photoCount: 1,
            };
            setQueue((prev) => prev.some((i) => i.id === errId) ? prev : [errItem, ...prev]);
            return;
          }
          if (event.type !== "scan_result" && event.type !== "scan_enhanced") return;

          const scanId = event.scan_id ? String(event.scan_id) : null;
          if (!scanId) return;

          if (event.type === "scan_result") {
            // New scan from phone — add as result card (skip if already present, e.g. replayed on reconnect)
            const newItem: QueueItem = {
              id: `scan-${scanId}`,
              file: new File([], "mobile"),
              preview: event.image_url || "",
              phase: "result",
              condition: sessionCondition,
              photoCount: 1,
              result: {
                scan_id: event.scan_id!,
                status: event.status!,
                artist: event.artist ?? null,
                title: event.title ?? null,
                year: event.year ?? null,
                label: event.label ?? null,
                catalog_number: event.catalog_number ?? null,
                confidence: event.confidence ?? 0,
                internal_confidence: event.internal_confidence ?? 0,
                auto_added: event.auto_added ?? false,
                discogs_release_id: event.discogs_release_id ?? null,
                matches: event.matches ?? [],
                artist_alt: event.artist_alt ?? null,
                title_alt: event.title_alt ?? null,
                low_information: event.low_information ?? false,
                barcode: event.barcode ?? null,
                error: event.error ?? undefined,
              },
            };
            setQueue((prev) => prev.some((i) => i.id === newItem.id) ? prev : [newItem, ...prev]);
          } else if (event.type === "scan_enhanced") {
            // Enhance from phone — update existing card
            setQueue((prev) => prev.map((item) => {
              if (item.result?.scan_id && String(item.result.scan_id) === scanId) {
                return {
                  ...item,
                  extraPreviews: [...(item.extraPreviews ?? []), event.image_url ?? ""].filter(Boolean),
                  photoCount: (item.photoCount ?? 1) + 1,
                  result: {
                    ...item.result,
                    artist: event.artist ?? item.result.artist,
                    title: event.title ?? item.result.title,
                    confidence: event.confidence ?? item.result.confidence,
                    matches: event.matches ?? item.result.matches,
                    low_information: event.low_information ?? item.result.low_information,
                  },
                };
              }
              return item;
            }));
          }
        } catch {
          // malformed event — ignore
        }
      };

      es.onerror = () => {
        setSseConnected(false);
        es?.close();
        retryTimeout = setTimeout(connect, 5000);
      };
    }

    connect();
    return () => {
      es?.close();
      clearTimeout(retryTimeout);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Keyboard shortcuts: Enter = confirm first match, S = skip
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      const activeItem = queue.find((i) => i.phase === "result");
      if (!activeItem) return;
      if (e.key === "Enter" && !e.metaKey && !e.ctrlKey) {
        e.preventDefault();
        const first = activeItem.result?.matches[0];
        if (first) handleConfirm(activeItem.id, first.release_id, false, 0);
      } else if (e.key === "s" || e.key === "S") {
        handleSkip(activeItem.id);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queue]);

  async function syncOfflineQueue() {
    const q = getOfflineQueue();
    if (q.length === 0) return;
    setSyncing(true);
    for (const item of q) {
      const file = dataUrlToFile(item.fileDataUrl, item.fileName);
      const newItem: QueueItem = {
        id: item.id, file, preview: item.fileDataUrl, phase: "queued", condition: sessionCondition,
      };
      setQueue((prev) => [...prev, newItem]);
      const ok = await processItem(newItem);
      if (ok) removeFromOfflineQueue(item.id);
      setOfflineQueueCount(getOfflineQueue().length);
    }
    setSyncing(false);
  }

  function updateItem(id: string, patch: Partial<QueueItem>) {
    setQueue((q) => q.map((item) => (item.id === id ? { ...item, ...patch } : item)));
  }

  async function processItem(item: QueueItem): Promise<boolean> {
    const slowHint = isLikelyColdStart();
    updateItem(item.id, { phase: "uploading", slowUpload: slowHint });
    try {
      const res = await api.uploadScan(item.file, item.file2);
      if (res.error === "identification_failed") {
        updateItem(item.id, { phase: "error", errorMsg: "Could not identify record. Try a clearer photo." });
      } else {
        updateItem(item.id, { phase: "result", result: res });
        // Visual match for low-confidence results (not just low_information)
        if (res.scan_id && res.matches.length > 0 && (res.low_information || res.confidence < 60)) {
          handleVisualMatch(item.id, res.scan_id, res.matches);
        }
      }
      return true;
    } catch (err: unknown) {
      const e = err as { status?: number; data?: { error?: string }; name?: string };
      let msg: string;
      if (e?.name === "AbortError") {
        msg = "Request timed out. Check your connection and try again.";
      } else if (e?.status === 403 || e?.data?.error === "no_credits") {
        msg = "No credits remaining.";
      } else if (e?.status === 413) {
        msg = "File too large. Max 10 MB.";
      } else if (e?.status === 429) {
        msg = "Too many requests — wait a moment and try again.";
      } else if (e?.status === 502 || e?.status === 503) {
        msg = "Server is starting up — try again in a few seconds.";
      } else if (e?.status && e.status >= 500) {
        msg = "Server error. Try again shortly.";
      } else {
        msg = "Upload failed. Check your connection and try again.";
      }
      updateItem(item.id, {
        phase: "error", errorMsg: msg,
        retryable: e?.name === "AbortError" || !e?.status || e.status >= 500 || e.status === 429,
      });
      return false;
    }
  }

  async function handleFiles(files: FileList) {
    if (!isOnline()) {
      for (const file of Array.from(files)) {
        const dataUrl = await fileToDataUrl(file);
        addToOfflineQueue({
          id: `offline-${Date.now()}-${Math.random()}`,
          fileName: file.name, fileDataUrl: dataUrl, queuedAt: new Date().toISOString(),
        });
      }
      setOfflineQueueCount(getOfflineQueue().length);
      return;
    }
    const MAX_SIZE = 10 * 1024 * 1024;
    const newItems: QueueItem[] = Array.from(files).map((file) => {
      const tooBig = file.size > MAX_SIZE;
      return {
        id: `${Date.now()}-${Math.random()}`,
        file,
        preview: URL.createObjectURL(file),
        phase: (tooBig ? "error" : "queued") as ItemPhase,
        errorMsg: tooBig ? `File too large. Max 10 MB.` : undefined,
        condition: sessionCondition,
        photoCount: 1,
      };
    });
    setQueue((q) => [...q, ...newItems]);
    setProcessing(true);
    for (const item of newItems) {
      if (item.phase !== "error") await processItem(item);
    }
    setProcessing(false);
  }

  async function handleConfirm(
    itemId: string, releaseId: number, listForSale = false,
    matchIndex?: number,
    askingPrice?: string, costPrice?: string,
  ) {
    const item = queue.find((i) => i.id === itemId);
    if (!item?.result) return;
    if (confirmingIdsRef.current.has(itemId)) return;
    confirmingIdsRef.current.add(itemId);
    updateItem(itemId, { phase: "confirming" });
    const coverImage = item.result.matches?.find((m) => m.release_id === releaseId)?.cover_image ?? null;
    try {
      let recordId: string | undefined;
      if (item.id.startsWith("barcode-")) {
        await api.barcodeAdd(releaseId, item.condition, sessionLotId || undefined);
        updateItem(itemId, { phase: "done", confirmedReleaseId: releaseId });
      } else {
        const data = await api.confirmScan(
          item.result.scan_id, releaseId, item.condition, sessionLotId || undefined, coverImage, matchIndex,
          item.coverCondition ?? item.condition,
        );
        recordId = data.record_id;
        if (listForSale && recordId) {
          try { await api.discogsListRecord(recordId); } catch { /* non-fatal */ }
        }
        updateItem(itemId, { phase: "done", confirmedReleaseId: releaseId, listedForSale: listForSale });
      }
      // Apply prices if provided
      if (recordId) {
        const updates: { asking_price?: number; cost_price?: number } = {};
        const ap = askingPrice ? parseFloat(askingPrice) : NaN;
        const cp = costPrice ? parseFloat(costPrice) : NaN;
        if (!isNaN(ap) && ap > 0) updates.asking_price = ap;
        if (!isNaN(cp) && cp > 0) updates.cost_price = cp;
        if (Object.keys(updates).length > 0) {
          try { await api.updateRecord(recordId, updates); } catch { /* non-fatal */ }
        }
      }
      setOwnedReleaseIds((prev) => new Set([...prev, releaseId]));
      setAddedCount((n) => n + 1);
    } catch {
      updateItem(itemId, { phase: "result", errorMsg: "Failed to add. Try again." });
    } finally {
      confirmingIdsRef.current.delete(itemId);
    }
  }

  function handleConditionChange(itemId: string, condition: Condition) {
    updateItem(itemId, { condition });
  }

  function handleCoverConditionChange(itemId: string, coverCondition: Condition) {
    updateItem(itemId, { coverCondition });
  }

  async function handleRetry(itemId: string) {
    const item = queue.find((i) => i.id === itemId);
    if (!item) return;
    await processItem(item);
  }

  async function handleSkip(itemId: string) {
    const item = queue.find((i) => i.id === itemId);
    if (!item?.result) return;
    if (item.id.startsWith("barcode-")) {
      updateItem(itemId, { phase: "done", skipped: true });
      setSkippedCount((n) => n + 1);
      return;
    }
    updateItem(itemId, { phase: "confirming" });
    try {
      await api.skipScan(item.result.scan_id);
      updateItem(itemId, { phase: "done", skipped: true });
      setSkippedCount((n) => n + 1);
    } catch {
      updateItem(itemId, { phase: "result", errorMsg: "Skip failed. Try again." });
    }
  }

  async function handleClearHistory() {
    const clearable = queue.filter((i) => i.phase === "result" || i.phase === "error" || i.phase === "done");
    if (!clearable.length) return;
    const pendingCount = clearable.filter((i) => i.phase !== "done").length;
    const msg = pendingCount > 0
      ? `Clear ${clearable.length} item${clearable.length !== 1 ? "s" : ""} from this list? ${pendingCount} not yet added will be skipped (1 credit each).`
      : `Clear ${clearable.length} item${clearable.length !== 1 ? "s" : ""} from this list?`;
    if (!window.confirm(msg)) return;

    setClearingHistory(true);
    await Promise.allSettled(
      clearable
        .filter((i) => i.phase !== "done") // already confirmed — nothing to skip server-side
        .map((i) => {
          const scanId = i.result?.scan_id ? String(i.result.scan_id) : i.id.replace(/^scan-/, "");
          return api.skipScan(scanId);
        })
    );
    setQueue((prev) => prev.filter((i) => !clearable.includes(i)));
    setClearingHistory(false);
  }

  async function handleSaveToEval(scanId: string, releaseId: number) {
    await api.evalSaveImage(scanId, releaseId);
  }

  async function handleVisualMatch(itemId: string, scanId: string, matches: DiscogsMatch[]) {
    const candidates = matches
      .filter((m) => m.cover_image && !m.cover_image.includes("spacer"))
      .slice(0, 7)
      .map((m) => ({ release_id: m.release_id, cover_image_url: m.cover_image! }));
    if (candidates.length === 0) return;
    updateItem(itemId, { visualMatching: true });
    try {
      const vm = await api.visualMatch(scanId, candidates);
      updateItem(itemId, {
        visualMatching: false,
        visualMatchReleaseId: vm.best_match_release_id ?? undefined,
        visualMatchReason: vm.reasoning,
      });
    } catch {
      updateItem(itemId, { visualMatching: false });
    }
  }

  async function handleEnhance(itemId: string, file: File) {
    const item = queue.find((i) => i.id === itemId);
    if (!item?.result?.scan_id) return;
    const preview = URL.createObjectURL(file);
    updateItem(itemId, {
      enhancing: true,
      extraPreviews: [...(item.extraPreviews ?? []), preview],
      photoCount: (item.photoCount ?? 1) + 1,
    });
    try {
      const res = await api.enhanceScan(item.result.scan_id, file);
      updateItem(itemId, {
        enhancing: false,
        result: res,
        // reset visual match so it re-runs with updated matches
        visualMatchReleaseId: undefined,
        visualMatchReason: undefined,
        lowInfoSearchDone: false,
      });
      if (res.scan_id && res.matches.length > 0 && (res.low_information || res.confidence < 75)) {
        handleVisualMatch(itemId, res.scan_id, res.matches);
      }
    } catch {
      updateItem(itemId, { enhancing: false });
    }
  }

  async function handleResearch(
    itemId: string,
    fields: { artist?: string; title?: string; label?: string; catalog_number?: string; year?: number },
  ) {
    const item = queue.find((i) => i.id === itemId);
    if (!item?.result || !item.result.scan_id) return;
    const isLowInfo = item.result.low_information;
    updateItem(itemId, { researching: true });
    try {
      const res = await api.researchScan(item.result.scan_id, fields);
      const patch: Partial<QueueItem> = {
        researching: false,
        result: { ...item.result, artist: res.artist, title: res.title, label: res.label, catalog_number: res.catalog_number, matches: res.matches },
      };
      if (isLowInfo) patch.lowInfoSearchDone = true;
      updateItem(itemId, patch);
      // Trigger visual match for low-info records after search
      if (isLowInfo && res.matches.length > 0) {
        handleVisualMatch(itemId, item.result.scan_id, res.matches);
      }
    } catch {
      updateItem(itemId, { researching: false });
    }
  }

  async function handleManualAdd(
    itemId: string,
    data: { artist?: string; title?: string; year?: number; label?: string; format?: string; condition: Condition; asking_price?: number; cost_price?: number },
  ) {
    const item = queue.find((i) => i.id === itemId);
    if (!item) return;
    updateItem(itemId, { phase: "confirming" });
    try {
      await api.createRecord({
        artist: data.artist,
        title: data.title,
        year: data.year,
        label: data.label,
        format: data.format,
        condition: data.condition,
        asking_price: data.asking_price,
        cost_price: data.cost_price,
        lot_id: sessionLotId || undefined,
        record_section: "vinyl",
      });
      // Patch result for display in done state
      const updatedResult: ScanUploadResponse = item.result
        ? { ...item.result, artist: data.artist ?? null, title: data.title ?? null }
        : {
          scan_id: "", status: "manually_added" as const,
          artist: data.artist ?? null, title: data.title ?? null,
          year: data.year ?? null, label: data.label ?? null,
          catalog_number: null, confidence: 0, internal_confidence: 0,
          auto_added: false, discogs_release_id: null, matches: [], low_information: false, barcode: null,
        };
      updateItem(itemId, { phase: "done", result: updatedResult });
      setAddedCount((n) => n + 1);
    } catch {
      updateItem(itemId, { phase: "result", errorMsg: "Failed to add. Try again." });
    }
  }

  function removeItem(itemId: string) {
    setQueue((q) => q.filter((i) => i.id !== itemId));
  }

  function clearDone() {
    setQueue((q) => q.filter((i) => i.phase !== "done"));
  }

  const handleBarcodeDetected = useCallback(async (barcode: string) => {
    setShowBarcode(false);
    setBarcodeSearching(true);
    setBarcodeError(null);
    try {
      const data = await api.barcodeSearch(barcode);
      if (data.matches.length === 0) {
        setBarcodeError(`No Discogs results for barcode ${barcode}.`);
        return;
      }
      const fakeResult: ScanUploadResponse = {
        scan_id: "", status: "pending",
        artist: data.matches[0].artist, title: data.matches[0].title,
        year: data.matches[0].year, label: data.matches[0].label,
        catalog_number: null, confidence: 100, internal_confidence: 0,
        auto_added: false, discogs_release_id: null, matches: data.matches, low_information: false, barcode: null,
      };
      setQueue((q) => [...q, {
        id: `barcode-${Date.now()}`,
        file: new File([], barcode),
        preview: data.matches[0].cover_image || "",
        phase: "result",
        result: fakeResult,
        condition: sessionCondition,
      }]);
    } catch {
      setBarcodeError("Barcode lookup failed. Try again.");
    } finally {
      setBarcodeSearching(false);
    }
  }, [sessionCondition]);

  // Drag & drop handlers
  function handleDragOver(e: React.DragEvent) {
    e.preventDefault();
    setIsDragging(true);
  }
  function handleDragLeave(e: React.DragEvent) {
    if (!e.currentTarget.contains(e.relatedTarget as Node)) setIsDragging(false);
  }
  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files.length) handleFiles(e.dataTransfer.files);
  }

  const doneCount = queue.filter((i) => i.phase === "done").length;
  const pendingResultCount = queue.filter((i) => i.phase === "result").length;
  const activeCount = queue.filter((i) => !["done", "error"].includes(i.phase)).length;
  const creditsUsed = addedCount + skippedCount;
  const hasSession = addedCount > 0 || skippedCount > 0 || queue.length > 0;
  const discogsConnected = !!user?.discogs_username;
  const queuedItems = queue.filter((i) => i.phase === "queued");

  return (
    <div className="flex flex-col gap-4">
      {showBarcode && (
        <BarcodeScanner onDetected={handleBarcodeDetected} onClose={() => setShowBarcode(false)} />
      )}

      {/* Mobile SSE status */}
      <div className="flex items-center justify-between gap-2">
        <div className={`flex items-center gap-2 px-3 py-2 rounded-xl border text-xs font-medium ${
          sseConnected
            ? "bg-vs-success/10 border-vs-success/30 text-vs-success"
            : "bg-vs-warning/10 border-vs-warning/30 text-vs-warning"
        }`}>
          <span className={`w-2 h-2 rounded-full flex-shrink-0 ${sseConnected ? "bg-vs-success animate-pulse" : "bg-vs-warning"}`} />
          {sseConnected ? "Listening for phone scans" : "Connecting to phone…"}
        </div>
        <button
          onClick={() => setShowHelp(true)}
          className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-medium text-vs-muted hover:text-vs-accent hover:bg-vs-accent/10 transition-colors flex-shrink-0"
        >
          <HelpCircle size={14} />
          How this works
        </button>
        {queue.some((i) => i.phase === "result" || i.phase === "error" || i.phase === "done") && (
          <button
            onClick={handleClearHistory}
            disabled={clearingHistory}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-medium text-vs-muted hover:text-vs-danger hover:bg-vs-danger/10 transition-colors disabled:opacity-50 flex-shrink-0"
          >
            {clearingHistory ? <Loader2 size={12} className="animate-spin" /> : <Trash2 size={12} />}
            Clear history
          </button>
        )}
      </div>

      {/* Offline banner */}
      {!online && (
        <div className="card p-3 flex items-center gap-2 border-vs-warning/30 bg-vs-warning/10">
          <WifiOff size={15} className="text-vs-warning flex-shrink-0" />
          <p className="text-sm text-vs-warning">
            Offline — photos saved locally.
            {offlineQueueCount > 0 && ` ${offlineQueueCount} waiting to sync.`}
          </p>
        </div>
      )}
      {online && offlineQueueCount > 0 && (
        <div className="card p-3 flex items-center justify-between gap-2">
          <p className="text-sm text-vs-muted">
            {syncing ? "Syncing…" : `${offlineQueueCount} offline photo${offlineQueueCount > 1 ? "s" : ""} ready to sync`}
          </p>
          {!syncing && (
            <button onClick={syncOfflineQueue} className="text-xs text-vs-accent hover:underline">Sync now</button>
          )}
        </div>
      )}

      {/* Session defaults */}
      <div className="card p-3.5 flex items-center gap-4 flex-wrap">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs text-vs-muted whitespace-nowrap">Default condition:</span>
          <ConditionPicker value={sessionCondition} onChange={setSessionCondition} showLabel={false} />
        </div>
        {lots.length > 0 && (
          <div className="flex items-center gap-2">
            <Layers size={12} className="text-vs-muted flex-shrink-0" />
            <span className="text-xs text-vs-muted whitespace-nowrap">Lot:</span>
            <select
              value={sessionLotId}
              onChange={(e) => setSessionLotId(e.target.value)}
              className="text-xs bg-vs-raised border border-vs-border rounded px-2 py-1 text-vs-text focus:outline-none focus:border-vs-accent"
            >
              <option value="">None</option>
              {lots.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
            </select>
          </div>
        )}
        <span className="ml-auto text-2xs text-vs-muted/50 hidden sm:block">↵ add · S skip</span>
      </div>

      {/* Upload area — with drag & drop */}
      <div
        className={`card p-6 flex flex-col items-center gap-4 text-center transition-all cursor-default ${
          isDragging ? "border-vs-accent bg-vs-accent/5 scale-[1.01]" : ""
        }`}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        {isDragging ? (
          <>
            <div className="w-14 h-14 rounded-2xl bg-vs-accent/15 flex items-center justify-center">
              <Upload size={26} className="text-vs-accent" />
            </div>
            <p className="text-base font-medium text-vs-accent">Drop to scan</p>
          </>
        ) : (
          <>
            <div className="w-14 h-14 rounded-2xl bg-vs-raised border border-vs-border-2 flex items-center justify-center">
              <Camera size={24} className="text-vs-accent" />
            </div>
            <div>
              <p className="text-base font-medium">
                Scan records
              </p>
              <p className="text-vs-muted text-xs mt-0.5">Take a photo or drop files here</p>
            </div>
            <div className="flex gap-2.5 w-full">
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
                <Camera size={15} />Camera
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
                <Upload size={15} />{queue.length > 0 ? "Add more" : "Upload"}
              </button>
              <button
                onClick={() => { setShowBarcode(true); setBarcodeError(null); }}
                className="btn-secondary flex items-center justify-center gap-2 px-3"
                disabled={processing || barcodeSearching}
                title="Scan barcode (free — no credits)"
              >
                {barcodeSearching ? <Loader2 size={15} className="animate-spin" /> : <Barcode size={15} />}
              </button>
            </div>
          </>
        )}

        {barcodeError && (
          <div className="flex items-center gap-2 px-1">
            <AlertCircle size={13} className="text-vs-danger flex-shrink-0" />
            <p className="text-xs text-vs-muted">{barcodeError}</p>
          </div>
        )}

        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => { if (e.target.files?.length) handleFiles(e.target.files); e.target.value = ""; }}
        />
      </div>

      {/* Queue */}
      {queue.length > 0 && (
        <div className="flex flex-col gap-3">
          {doneCount > 0 && activeCount === 0 && (
            <div className="flex items-center justify-between px-1">
              <p className="text-sm text-vs-muted">{doneCount} record{doneCount !== 1 ? "s" : ""} processed</p>
              <div className="flex items-center gap-3">
                <a href="/scan/session" className="text-xs text-vs-accent hover:underline flex items-center gap-1">
                  <ClipboardList size={12} />Session summary
                </a>
                <button onClick={clearDone} className="text-xs text-vs-muted hover:text-vs-text transition-colors">
                  Clear
                </button>
              </div>
            </div>
          )}
          {queue.map((item) => {
            const pos = queuedItems.indexOf(item) + 1;
            return (
              <ScanItem
                key={item.id}
                item={item}
                queuePosition={pos}
                onConfirm={handleConfirm}
                onSkip={handleSkip}
                onConditionChange={handleConditionChange}
                onCoverConditionChange={handleCoverConditionChange}
                onResearch={handleResearch}
                onRetry={handleRetry}
                onRemove={removeItem}
                onManualAdd={handleManualAdd}
                onEnhance={handleEnhance}
                onSaveToEval={user?.is_admin ? handleSaveToEval : undefined}
                ownedReleaseIds={ownedReleaseIds}
                ownedFuzzyKeys={ownedFuzzyKeys}
                discogsConnected={discogsConnected}
                sessionCondition={sessionCondition}
                showDebug={showDebug}
                priceStep={user?.price_step ?? 0.5}
              />
            );
          })}
        </div>
      )}

      {/* Session counter — sticky bottom */}
      {hasSession && (addedCount > 0 || skippedCount > 0 || pendingResultCount > 0) && (
        <div className="sticky bottom-4 flex justify-center pointer-events-none">
          <div className="bg-vs-card border border-vs-border rounded-xl px-4 py-2 shadow-lg flex items-center gap-4 text-xs pointer-events-auto">
            {addedCount > 0 && (
              <span className="text-vs-success font-medium">{addedCount} added</span>
            )}
            {pendingResultCount > 0 && (
              <span className="text-vs-warning">{pendingResultCount} pending</span>
            )}
            {creditsUsed > 0 && (
              <span className="text-vs-muted">{creditsUsed} credit{creditsUsed !== 1 ? "s" : ""} used</span>
            )}
          </div>
        </div>
      )}
      {showHelp && <HelpModal onClose={() => setShowHelp(false)} />}
    </div>
  );
}
