"use client";

import { useEffect, useRef, useState } from "react";
import {
  AlertCircle, CheckCircle, ChevronDown, ChevronRight, ExternalLink,
  Layers, Loader2, Music, Plus, Search, Tag, Trash2, X, Zap,
} from "lucide-react";
import { api, type DiscogsMatch, type Lot, type ScanUploadResponse, type User } from "@/lib/api";
import {
  CONDITIONS, type Condition, type ItemPhase, type QueueItem,
  ConfidenceLabel, ConditionPicker, ImageLightbox, parseDiscogsReleaseId,
} from "./shared";
import { MatchCard } from "./MatchCard";
import { LowInfoSearchForm, ManualAddForm } from "./forms";
import { DebugSidePanel } from "./DebugPanel";

export function ScanItem({
  item, queuePosition,
  onConfirm, onSkip, onConditionChange, onCoverConditionChange, onResearch, onRetry, onRemove, onManualAdd, onEnhance,
  onSaveToEval,
  ownedReleaseIds, ownedFuzzyKeys, discogsConnected, sessionCondition,
  showDebug, priceStep,
}: {
  item: QueueItem;
  queuePosition: number;
  onConfirm: (itemId: string, releaseId: number, listForSale: boolean, matchIndex: number, askingPrice?: string, costPrice?: string) => void;
  onSkip: (itemId: string) => void;
  onConditionChange: (itemId: string, condition: Condition) => void;
  onCoverConditionChange: (itemId: string, condition: Condition) => void;
  onResearch: (itemId: string, fields: { artist?: string; title?: string; label?: string; catalog_number?: string; year?: number }) => void;
  onRetry: (itemId: string) => void;
  onRemove: (itemId: string) => void;
  onManualAdd: (itemId: string, data: { artist?: string; title?: string; year?: number; label?: string; format?: string; condition: Condition; asking_price?: number; cost_price?: number }) => void;
  onEnhance: (itemId: string, file: File) => void;
  onSaveToEval?: (scanId: string, releaseId: number) => Promise<void>;
  ownedReleaseIds: Set<number>;
  ownedFuzzyKeys: Set<string>;
  discogsConnected: boolean;
  sessionCondition: Condition;
  showDebug?: boolean;
  priceStep: number;
}) {
  const [showAllMatches, setShowAllMatches] = useState(false);
  const [editingSearch, setEditingSearch] = useState(false);
  const [editArtist, setEditArtist] = useState("");
  const [editTitle, setEditTitle] = useState("");
  const [editLabel, setEditLabel] = useState("");
  const [editCatNo, setEditCatNo] = useState("");
  const [listForSale, setListForSale] = useState(false);
  const [showManualForm, setShowManualForm] = useState(false);
  const [manualSubmitting, setManualSubmitting] = useState(false);
  const [matchPrices, setMatchPrices] = useState<Record<number, { asking: string; cost: string }>>({});
  const [uploadSeconds, setUploadSeconds] = useState(0);
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);
  const enhanceFileRef = useRef<HTMLInputElement>(null);
  // Manual Discogs link
  const [showDiscogsLink, setShowDiscogsLink] = useState(false);
  const [discogsLinkInput, setDiscogsLinkInput] = useState("");
  const [discogsLinkError, setDiscogsLinkError] = useState<string | null>(null);
  // Eval save (admin only)
  const [saveToEval, setSaveToEval] = useState(false);
  const [evalSaved, setEvalSaved] = useState(false);

  const result = item.result;

  async function confirmAndMaybeSaveEval(releaseId: number, lfs: boolean, idx: number, asking?: string, cost?: string) {
    onConfirm(item.id, releaseId, lfs, idx, asking, cost);
    if (saveToEval && result?.scan_id && onSaveToEval) {
      try {
        await onSaveToEval(result.scan_id, releaseId);
        setEvalSaved(true);
      } catch { /* non-fatal */ }
    }
  }

  useEffect(() => {
    if (item.phase !== "uploading") { setUploadSeconds(0); return; }
    const interval = setInterval(() => setUploadSeconds((s) => s + 1), 1000);
    return () => clearInterval(interval);
  }, [item.phase]);

  function getMP(releaseId: number) { return matchPrices[releaseId] ?? { asking: "", cost: "" }; }
  function setMP(releaseId: number, patch: Partial<{ asking: string; cost: string }>) {
    setMatchPrices((prev) => ({ ...prev, [releaseId]: { ...getMP(releaseId), ...patch } }));
  }

  // ── queued ─────────────────────────────────────────────────────────────────
  if (item.phase === "queued") {
    return (
      <div className="card p-3.5 flex items-center gap-3 opacity-50">
        <img src={item.preview} alt="" loading="lazy" className="w-10 h-10 object-cover rounded-lg flex-shrink-0" />
        <p className="text-vs-muted text-sm">
          {queuePosition === 1 ? "Up next…" : `#${queuePosition} in queue`}
        </p>
      </div>
    );
  }

  // ── uploading ──────────────────────────────────────────────────────────────
  if (item.phase === "uploading") {
    return (
      <div className="card p-3.5 flex items-center gap-3">
        <div className="relative flex-shrink-0">
          <img src={item.preview} alt="" loading="lazy" className="w-10 h-10 object-cover rounded-lg" />
          <div className="absolute inset-0 rounded-lg bg-vs-bg/60 flex items-center justify-center">
            <Loader2 size={14} className="text-vs-accent animate-spin" />
          </div>
        </div>
        <div className="flex-1 flex flex-col gap-0.5">
          <p className="text-sm text-vs-text">Identifying…</p>
          {item.slowUpload && uploadSeconds > 3 && (
            <p className="text-xs text-vs-muted">Server warming up ({uploadSeconds}s)…</p>
          )}
          {item.slowUpload && uploadSeconds <= 3 && (
            <p className="text-xs text-vs-muted">May take ~30s on first scan</p>
          )}
          {!item.slowUpload && (
            <div className="flex gap-1 mt-0.5">
              <div className="h-1 w-16 rounded-full bg-vs-border overflow-hidden">
                <div className="h-full bg-vs-accent/60 animate-pulse rounded-full" style={{ width: "60%" }} />
              </div>
            </div>
          )}
        </div>
        {/* Skeleton */}
        <div className="flex flex-col gap-1.5 flex-shrink-0 w-24">
          <div className="h-2.5 bg-vs-border animate-pulse rounded w-full" />
          <div className="h-2 bg-vs-border/60 animate-pulse rounded w-3/4" />
        </div>
      </div>
    );
  }

  // ── error ──────────────────────────────────────────────────────────────────
  if (item.phase === "error") {
    return (
      <div className="card p-3.5 flex items-center gap-3">
        <img src={item.preview} alt="" loading="lazy" className="w-10 h-10 object-cover rounded-lg flex-shrink-0" />
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <AlertCircle size={15} className="text-vs-danger flex-shrink-0" />
          <p className="text-sm text-vs-muted flex-1">{item.errorMsg}</p>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          {item.retryable && (
            <button onClick={() => onRetry(item.id)} className="text-xs text-vs-accent hover:underline">Retry</button>
          )}
          <button onClick={() => onRemove(item.id)} className="p-1 text-vs-muted hover:text-vs-danger rounded" title="Dismiss">
            <X size={13} />
          </button>
        </div>
      </div>
    );
  }

  // ── done ───────────────────────────────────────────────────────────────────
  if (item.phase === "done") {
    const r = item.result;
    const addedLabel = "Added to catalog";
    const doneLabel = item.skipped
      ? "Skipped"
      : item.listedForSale
        ? `${addedLabel} · Listed on Discogs`
        : addedLabel;
    return (
      <div className="card p-3.5 flex items-center gap-3">
        <div className="relative flex-shrink-0">
          <img src={item.preview} alt="" loading="lazy" className="w-10 h-10 object-cover rounded-lg" />
          {!item.skipped && (
            <div className="absolute -bottom-1 -right-1 w-4 h-4 rounded-full bg-vs-success flex items-center justify-center">
              <CheckCircle size={9} className="text-white" />
            </div>
          )}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium truncate">{r?.artist} — {r?.title}</p>
          <p className="text-xs text-vs-muted">{doneLabel}</p>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          {item.confirmedReleaseId && (
            <a href={`https://www.discogs.com/release/${item.confirmedReleaseId}`} target="_blank" rel="noopener noreferrer"
              className="text-vs-muted hover:text-vs-text">
              <ExternalLink size={13} />
            </a>
          )}
          <button onClick={() => onRemove(item.id)} className="p-1 text-vs-muted hover:text-vs-danger rounded" title="Dismiss">
            <X size={13} />
          </button>
        </div>
      </div>
    );
  }

  // ── result / confirming ────────────────────────────────────────────────────
  if ((item.phase === "result" || item.phase === "confirming") && result) {
    const isConfirming = item.phase === "confirming";
    const isLowInfo = result.low_information;
    const showLowInfoForm = isLowInfo && !item.lowInfoSearchDone && !editingSearch;
    const hasDebug = showDebug && !!result.scan_id;

    // Reorder matches: visual match result first
    const orderedMatches = item.visualMatchReleaseId
      ? [
          ...result.matches.filter((m) => m.release_id === item.visualMatchReleaseId),
          ...result.matches.filter((m) => m.release_id !== item.visualMatchReleaseId),
        ]
      : result.matches;
    const visibleMatches = showAllMatches ? orderedMatches : orderedMatches.slice(0, 2);

    // Same catalog # across multiple matches means the catalog number alone can't
    // tell them apart — country/year/label (printed on the actual item) are what
    // distinguishes these pressings, so surface them instead of burying the lede.
    const catnoCounts = new Map<string, number>();
    for (const m of orderedMatches) {
      if (m.catno) catnoCounts.set(m.catno, (catnoCounts.get(m.catno) ?? 0) + 1);
    }
    const hasAmbiguousCatno = [...catnoCounts.values()].some((c) => c > 1);

    return (
      <>
        {lightboxUrl && <ImageLightbox url={lightboxUrl} onClose={() => setLightboxUrl(null)} />}
        <div className={`card overflow-hidden${hasDebug ? " grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_320px] items-start" : ""}`}>
          {/* Left column: all scan content */}
          <div className="min-w-0">
            {/* Header: scan photo + confidence + condition */}
            <div className="p-4 border-b border-vs-border">
              <div className="flex items-start gap-3 mb-3">
                <div className="flex gap-1 flex-shrink-0 items-start">
                  {/* All photos as a strip */}
                  {[item.preview, item.preview2, ...(item.extraPreviews ?? [])].filter(Boolean).map((src, i) => (
                    <div
                      key={i}
                      className="w-12 h-14 rounded-lg overflow-hidden border border-vs-border cursor-zoom-in hover:opacity-90 transition-opacity flex-shrink-0"
                      onClick={() => setLightboxUrl(src!)}
                      title="Click to enlarge"
                    >
                      <img src={src!} alt="" loading="lazy" className="w-full h-full object-cover" />
                    </div>
                  ))}
                  {/* Add photo button — always shown while in result phase, up to 4 total */}
                  {(item.photoCount ?? 1) < 4 && (
                    <>
                      <button
                        onClick={() => enhanceFileRef.current?.click()}
                        disabled={item.enhancing}
                        title="Add another photo of this record (free)"
                        className="w-12 h-14 rounded-lg border border-dashed border-vs-border-2 flex flex-col items-center justify-center gap-0.5 text-vs-muted hover:text-vs-accent hover:border-vs-accent transition-colors flex-shrink-0 disabled:opacity-40"
                      >
                        {item.enhancing
                          ? <Loader2 size={13} className="animate-spin" />
                          : <><Plus size={13} /><span className="text-[9px]">photo</span></>
                        }
                      </button>
                      <input
                        ref={enhanceFileRef}
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={(e) => {
                          const f = e.target.files?.[0];
                          if (f) onEnhance(item.id, f);
                          e.target.value = "";
                        }}
                      />
                    </>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-sm text-vs-text leading-tight">
                    {result.artist} — {result.title}
                  </p>
                  <div className="flex items-center gap-3 mt-1.5 flex-wrap">
                    <ConfidenceLabel confidence={result.confidence} />
                    {result.year && <span className="text-xs text-vs-muted">{result.year}</span>}
                    {result.label && <span className="text-xs text-vs-muted truncate max-w-[100px]">{result.label}</span>}
                  </div>
                </div>
              </div>

              {/* Condition — disc and cover graded separately, since they often differ */}
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <div className="flex flex-col gap-1.5">
                  <ConditionPicker
                    value={item.condition}
                    onChange={(c) => onConditionChange(item.id, c)}
                    showLabel={true}
                    label="Disc:"
                  />
                  <ConditionPicker
                    value={item.coverCondition ?? item.condition}
                    onChange={(c) => onCoverConditionChange(item.id, c)}
                    showLabel={true}
                    label="Cover:"
                  />
                </div>
                <button
                  onClick={() => {
                    if (!editingSearch) {
                      setEditArtist(result.artist ?? "");
                      setEditTitle(result.title ?? "");
                      setEditLabel(result.label ?? "");
                      setEditCatNo(result.catalog_number ?? "");
                    }
                    setEditingSearch(!editingSearch);
                    setShowManualForm(false);
                  }}
                  className={`text-xs flex-shrink-0 transition-colors ${
                    editingSearch ? "text-vs-accent" : "text-vs-muted hover:text-vs-text"
                  }`}
                >
                  {editingSearch ? "Cancel" : "Edit search"}
                </button>
              </div>
            </div>

            {/* Edit search */}
            {editingSearch && (
              <div className="p-4 border-b border-vs-border bg-vs-raised/40 flex flex-col gap-2">
                <p className="text-xs text-vs-muted">
                  Fix search terms if AI misread the record — no extra credit used.
                </p>
                <div className="grid grid-cols-2 gap-2">
                  {([
                    ["Artist", editArtist, setEditArtist],
                    ["Title", editTitle, setEditTitle],
                    ["Label", editLabel, setEditLabel],
                    ["Catalog #", editCatNo, setEditCatNo],
                  ] as [string, string, (v: string) => void][]).map(([lbl, val, set]) => (
                    <label key={lbl} className="flex flex-col gap-1 text-xs text-vs-muted">
                      {lbl}
                      <input
                        value={val}
                        onChange={(e) => set(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            onResearch(item.id, { artist: editArtist, title: editTitle, label: editLabel, catalog_number: editCatNo });
                            setEditingSearch(false);
                          }
                        }}
                        className="px-2 py-1.5 rounded border border-vs-border bg-transparent text-sm text-vs-text focus:outline-none focus:border-vs-accent"
                      />
                    </label>
                  ))}
                </div>
                <button
                  onClick={() => {
                    onResearch(item.id, { artist: editArtist, title: editTitle, label: editLabel, catalog_number: editCatNo });
                    setEditingSearch(false);
                  }}
                  disabled={item.researching}
                  className="self-start text-xs px-3 py-1.5 rounded bg-vs-accent text-white font-medium disabled:opacity-50 flex items-center gap-1.5"
                >
                  {item.researching && <Loader2 size={12} className="animate-spin" />}
                  Search again
                </button>
              </div>
            )}

            {/* Low-info search form */}
            {showLowInfoForm && (
              <LowInfoSearchForm
                searching={item.researching}
                onSearch={(fields) => onResearch(item.id, fields)}
                onManualAdd={() => { setShowManualForm(true); setEditingSearch(false); }}
              />
            )}

            {/* Matches */}
            <div className="p-4 flex flex-col gap-3">
              {item.visualMatching && (
                <div className="flex items-center gap-2 text-xs text-vs-muted py-1">
                  <Loader2 size={12} className="animate-spin text-vs-accent flex-shrink-0" />
                  Comparing artwork against your photo…
                </div>
              )}

              {!showLowInfoForm && result.matches.length > 0 ? (
                <>
                  <p className="text-xs text-vs-muted font-medium uppercase tracking-wider">
                    {result.matches.length} match{result.matches.length !== 1 ? "es" : ""} — pick the right pressing:
                  </p>
                  {hasAmbiguousCatno && (
                    <div className="flex items-start gap-2 px-3 py-2 rounded-lg bg-vs-warning/10 border border-vs-warning/30">
                      <AlertCircle size={13} className="text-vs-warning flex-shrink-0 mt-0.5" />
                      <p className="text-xs text-vs-warning">
                        Several of these share the same catalog # — that alone won&apos;t tell them apart.
                        Check what country and label are actually printed on your copy.
                      </p>
                    </div>
                  )}
                  {visibleMatches.map((m, idx) => {
                    const mp = getMP(m.release_id);
                    const isVMatch = m.release_id === item.visualMatchReleaseId;
                    const ambiguous = !!m.catno && (catnoCounts.get(m.catno) ?? 0) > 1;
                    return (
                      <MatchCard
                        key={m.release_id}
                        match={m}
                        onAdd={() => confirmAndMaybeSaveEval(m.release_id, listForSale, idx, mp.asking, mp.cost)}
                        disabled={isConfirming}
                        isAdding={isConfirming}
                        ownedReleaseIds={ownedReleaseIds}
                        ownedFuzzyKeys={ownedFuzzyKeys}
                        highlightDisambiguation={ambiguous}
                        askingPrice={mp.asking}
                        costPrice={mp.cost}
                        onAskingPriceChange={(v) => setMP(m.release_id, { asking: v })}
                        onCostPriceChange={(v) => setMP(m.release_id, { cost: v })}
                        isFirst={idx === 0}
                        matchReason={m.match_reason}
                        isVisualMatch={isVMatch}
                        onImageClick={setLightboxUrl}
                        priceStep={priceStep}
                      />
                    );
                  })}
                  {orderedMatches.length > 2 && (
                    <button
                      onClick={() => setShowAllMatches(!showAllMatches)}
                      className="text-xs text-vs-accent hover:underline text-center py-1"
                    >
                      {showAllMatches
                        ? "Show fewer"
                        : `${orderedMatches.length - 2} more match${orderedMatches.length - 2 !== 1 ? "es" : ""}…`}
                    </button>
                  )}
                </>
              ) : !showLowInfoForm ? (
                <div className="text-center py-4 text-vs-muted text-sm">
                  No Discogs matches found.
                </div>
              ) : null}

              {/* Manual Discogs link */}
              <div>
                <button
                  onClick={() => { setShowDiscogsLink(!showDiscogsLink); setDiscogsLinkError(null); }}
                  className="text-xs text-vs-muted hover:text-vs-text transition-colors"
                >
                  {showDiscogsLink ? "Hide" : "Link to specific Discogs release →"}
                </button>
                {showDiscogsLink && (
                  <div className="mt-2 flex items-center gap-2">
                    <input
                      type="text"
                      value={discogsLinkInput}
                      onChange={(e) => { setDiscogsLinkInput(e.target.value); setDiscogsLinkError(null); }}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          const id = parseDiscogsReleaseId(discogsLinkInput);
                          if (!id) { setDiscogsLinkError("Couldn't parse release ID"); return; }
                          onConfirm(item.id, id, listForSale, -1);
                          setShowDiscogsLink(false);
                        }
                      }}
                      placeholder="https://www.discogs.com/release/12345 or just 12345"
                      className="input flex-1 text-xs"
                      autoFocus
                    />
                    <button
                      onClick={() => {
                        const id = parseDiscogsReleaseId(discogsLinkInput);
                        if (!id) { setDiscogsLinkError("Couldn't parse release ID"); return; }
                        confirmAndMaybeSaveEval(id, listForSale, -1);
                        setShowDiscogsLink(false);
                      }}
                      disabled={isConfirming}
                      className="btn-primary text-xs py-1.5 px-3 flex-shrink-0 disabled:opacity-50"
                    >
                      Confirm
                    </button>
                  </div>
                )}
                {discogsLinkError && <p className="text-vs-danger text-xs mt-1">{discogsLinkError}</p>}
              </div>

              {/* Discogs marketplace checkbox */}
              {discogsConnected && result.scan_id && (
                <label className="flex items-center gap-2 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={listForSale}
                    onChange={(e) => setListForSale(e.target.checked)}
                    className="w-3.5 h-3.5 accent-[color:var(--vs-accent)]"
                  />
                  <span className="text-xs text-vs-muted">Also list on Discogs Marketplace</span>
                </label>
              )}

              {/* Save to eval set (admin only) */}
              {showDebug && result.scan_id && (
                <label className="flex items-center gap-2 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={saveToEval}
                    onChange={(e) => setSaveToEval(e.target.checked)}
                    className="w-3.5 h-3.5 accent-[color:var(--vs-accent)]"
                  />
                  <span className="text-xs text-vs-muted">
                    Save to eval dataset
                    {evalSaved && <span className="text-vs-success ml-1">✓ saved</span>}
                  </span>
                </label>
              )}

              {/* Manual add form */}
              {showManualForm && (
                <ManualAddForm
                  defaults={{ artist: result.artist, title: result.title, year: result.year, label: result.label }}
                  sessionCondition={item.condition}
                  submitting={manualSubmitting}
                  priceStep={priceStep}
                  onSubmit={async (data) => {
                    setManualSubmitting(true);
                    await onManualAdd(item.id, data);
                    setManualSubmitting(false);
                  }}
                  onCancel={() => setShowManualForm(false)}
                />
              )}

              {/* Action footer */}
              {!showManualForm && (
                <div className="flex items-center justify-between pt-2 border-t border-vs-border">
                  <p className="text-xs text-vs-muted">1 credit on add or skip</p>
                  <div className="flex items-center gap-3">
                    <button
                      onClick={() => { setShowManualForm(true); setEditingSearch(false); }}
                      disabled={isConfirming}
                      className="text-xs text-vs-muted hover:text-vs-text transition-colors disabled:opacity-50"
                    >
                      Add manually
                    </button>
                    <button
                      onClick={() => onSkip(item.id)}
                      disabled={isConfirming}
                      className="text-xs text-vs-danger/70 hover:text-vs-danger transition-colors disabled:opacity-50"
                    >
                      Skip [S]
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Right column: per-card debug panel */}
          {hasDebug && (
            <div className="border-l border-vs-border self-stretch bg-vs-raised/20 overflow-y-auto max-h-[70vh]">
              <DebugSidePanel scanId={result.scan_id} result={result} />
            </div>
          )}
        </div>
      </>
    );
  }

  return null;
}

// ── Main ScanInterface ───────────────────────────────────────────────────────