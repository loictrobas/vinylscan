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

type ItemPhase = "queued" | "uploading" | "result" | "confirming" | "done" | "error";

const CONDITIONS = ["M", "NM", "VG+", "VG", "G"] as const;
type Condition = typeof CONDITIONS[number];

const FORMATS = ["LP", "EP", '7"', '12"', "CD", "Cassette", "Box Set", "Other"];

interface QueueItem {
  id: string;
  file: File;
  file2?: File;
  preview: string;
  preview2?: string;
  extraPreviews?: string[];   // previews of enhance photos (3rd, 4th)
  phase: ItemPhase;
  result?: ScanUploadResponse;
  errorMsg?: string;
  retryable?: boolean;
  confirmedReleaseId?: number;
  listedForSale?: boolean;
  skipped?: boolean;
  condition: Condition;
  coverCondition?: Condition;  // defaults to `condition` (disc) until explicitly set differently
  researching?: boolean;
  slowUpload?: boolean;
  enhancing?: boolean;        // extra photo being processed
  photoCount?: number;        // total photos attached (1–4)
  // Visual matching (P1-P3)
  lowInfoSearchDone?: boolean;
  visualMatching?: boolean;
  visualMatchReleaseId?: number;
  visualMatchReason?: string;
}

function parseDiscogsReleaseId(input: string): number | null {
  const trimmed = input.trim();
  // Plain number
  const asNum = parseInt(trimmed, 10);
  if (!isNaN(asNum) && String(asNum) === trimmed) return asNum;
  // URL: discogs.com/release/12345 or discogs.com/*/release/12345-...
  const match = trimmed.match(/\/release\/(\d+)/);
  if (match) return parseInt(match[1], 10);
  return null;
}

function fuzzyKey(artist: string, title: string): string {
  const stripDisambig = (s: string) => s.replace(/\s*\(\d+\)\s*$/, "");
  const norm = (s: string) => stripDisambig(s).toLowerCase().replace(/[^a-z0-9]+/g, "");
  return `${norm(artist)}::${norm(title)}`;
}

// ── Confidence label ─────────────────────────────────────────────────────────
function ConfidenceLabel({ confidence }: { confidence: number }) {
  if (confidence >= 80) {
    return (
      <span className="flex items-center gap-1.5 text-xs text-vs-success">
        <span className="w-2 h-2 rounded-full bg-vs-success flex-shrink-0" />
        High confidence
      </span>
    );
  }
  if (confidence >= 50) {
    return (
      <span className="flex items-center gap-1.5 text-xs text-vs-warning">
        <span className="w-2 h-2 rounded-full bg-vs-warning flex-shrink-0" />
        Verify matches below
      </span>
    );
  }
  return (
    <span className="flex items-center gap-1.5 text-xs text-vs-danger">
      <span className="w-2 h-2 rounded-full bg-vs-danger flex-shrink-0" />
      Low confidence — check matches
    </span>
  );
}

// ── Condition Picker ─────────────────────────────────────────────────────────
function ConditionPicker({
  value, onChange, showLabel = true, label = "Condition:",
}: {
  value: Condition; onChange: (c: Condition) => void; showLabel?: boolean; label?: string;
}) {
  return (
    <div className="flex items-center gap-1.5 flex-wrap">
      {showLabel && <span className="text-xs text-vs-muted mr-0.5">{label}</span>}
      {CONDITIONS.map((c) => (
        <button
          key={c}
          onClick={() => onChange(c)}
          className={`text-xs px-2 py-1 rounded font-medium transition-colors ${
            value === c
              ? "bg-vs-accent text-white"
              : "bg-vs-raised border border-vs-border text-vs-muted hover:text-vs-text hover:border-vs-border-2"
          }`}
        >
          {c}
        </button>
      ))}
    </div>
  );
}

// ── Help modal — step-by-step "how this section works" ─────────────────────
const HELP_STEPS = [
  { icon: Smartphone, title: "Shoot from your phone", body: "Open the VinylScan app and take photos of record labels — as many as you want, back to back. No need to wait between shots." },
  { icon: Search, title: "AI reads each one", body: "Each photo streams here automatically. Claude identifies artist, title, label and catalog number, then Discogs finds matching releases — all in the background." },
  { icon: Tag, title: "Pick the right pressing", body: "When matches show up, check label, catalog number, year and country to pick the exact pressing you have — prices and editions can differ a lot." },
  { icon: CheckCircle, title: "Grade and add", body: "Set disc and cover condition separately, optionally set a price, then Add — it goes straight into your catalog." },
];

function HelpModal({ onClose }: { onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div className="card max-w-md w-full p-5" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <p className="text-sm font-semibold text-vs-text">How scanning works</p>
          <button onClick={onClose} className="text-vs-muted hover:text-vs-text">
            <X size={16} />
          </button>
        </div>
        <div className="flex flex-col gap-4">
          {HELP_STEPS.map((step, i) => (
            <div key={step.title} className="flex gap-3">
              <div className="w-8 h-8 rounded-lg bg-vs-accent/15 flex items-center justify-center flex-shrink-0">
                <step.icon size={15} className="text-vs-accent" />
              </div>
              <div>
                <p className="text-sm text-vs-text font-medium">{i + 1}. {step.title}</p>
                <p className="text-xs text-vs-muted mt-0.5">{step.body}</p>
              </div>
            </div>
          ))}
        </div>
        <button onClick={onClose} className="btn-primary w-full mt-5 text-sm py-2">Got it</button>
      </div>
    </div>
  );
}

// ── Match Card ───────────────────────────────────────────────────────────────
function MatchCard({
  match, onAdd, disabled, isAdding,
  ownedReleaseIds, ownedFuzzyKeys,
  askingPrice, costPrice, onAskingPriceChange, onCostPriceChange,
  isFirst, matchReason, isVisualMatch, onImageClick, priceStep, highlightDisambiguation,
}: {
  match: DiscogsMatch;
  onAdd: () => void;
  disabled: boolean;
  isAdding: boolean;
  ownedReleaseIds: Set<number>;
  ownedFuzzyKeys: Set<string>;
  askingPrice: string;
  costPrice: string;
  onAskingPriceChange: (v: string) => void;
  onCostPriceChange: (v: string) => void;
  isFirst: boolean;
  matchReason?: string | null;
  isVisualMatch?: boolean;
  onImageClick?: (url: string) => void;
  priceStep: number;
  highlightDisambiguation?: boolean;
}) {
  const exactOwned = ownedReleaseIds.has(match.release_id);
  const fuzzyOwned = !exactOwned && ownedFuzzyKeys.has(fuzzyKey(match.artist, match.title));
  const [price, setPrice] = useState<{ lowest: number; currency: string; num_for_sale: number } | null | "loading">("loading");

  useEffect(() => {
    api.getPricing(match.release_id)
      .then((d) => setPrice(d.pricing))
      .catch(() => setPrice(null));
  }, [match.release_id]);

  return (
    <div className={`rounded-xl border p-3.5 transition-colors ${isVisualMatch ? "border-vs-success/40 bg-vs-success/5" : exactOwned ? "border-vs-accent/40 bg-vs-accent/5" : "border-vs-border bg-vs-card"}`}>
      {isVisualMatch && (
        <div className="flex items-center gap-1.5 text-xs text-vs-success font-medium mb-2.5">
          <Camera size={11} />
          Visual match — artwork resembles your photo
        </div>
      )}
      <div className="flex gap-3 items-start">
        {/* Cover */}
        <div
          className={`w-14 h-14 flex-shrink-0 rounded-lg overflow-hidden bg-vs-raised border border-vs-border ${
            match.cover_image && onImageClick ? "cursor-zoom-in hover:opacity-90 transition-opacity" : ""
          }`}
          onClick={() => {
            if (match.cover_image && onImageClick && !match.cover_image.includes("spacer")) {
              onImageClick(match.cover_image);
            }
          }}
        >
          {match.cover_image ? (
            <img src={match.cover_image} alt={match.title} className="w-full h-full object-cover"
              onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }} />
          ) : (
            <div className="w-full h-full flex items-center justify-center">
              <Music size={18} className="text-vs-muted" />
            </div>
          )}
        </div>

        {/* Info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="font-medium text-sm text-vs-text leading-tight">{match.artist}</p>
              <p className="text-vs-muted text-sm truncate">{match.title}</p>
            </div>
            {exactOwned && (
              <span className="text-2xs px-1.5 py-0.5 rounded-full bg-vs-accent/20 text-vs-accent font-medium flex-shrink-0 whitespace-nowrap">Owned</span>
            )}
            {!exactOwned && fuzzyOwned && (
              <span className="text-2xs px-1.5 py-0.5 rounded-full bg-vs-muted/20 text-vs-muted font-medium flex-shrink-0 whitespace-nowrap">Different pressing</span>
            )}
          </div>
          <div className="grid grid-cols-2 gap-x-6 gap-y-1 mt-2 text-xs">
            <div className="flex flex-col gap-1">
              {match.label && (
                <div className="flex gap-1.5">
                  <span className="text-vs-muted/70 font-medium uppercase tracking-wide text-2xs w-12 flex-shrink-0 pt-px">Label</span>
                  <span className="text-vs-text">{match.label}</span>
                </div>
              )}
              {match.catno && (
                <div className="flex gap-1.5">
                  <span className="text-vs-muted/70 font-medium uppercase tracking-wide text-2xs w-12 flex-shrink-0 pt-px">Catalog</span>
                  <span className="text-vs-text font-mono">{match.catno}</span>
                </div>
              )}
            </div>
            <div className="flex flex-col gap-1">
              {match.format && (
                <div className="flex gap-1.5">
                  <span className="text-vs-muted/70 font-medium uppercase tracking-wide text-2xs w-12 flex-shrink-0 pt-px">Format</span>
                  <span className="text-vs-text">{match.format}</span>
                </div>
              )}
              {match.year && (
                <div className="flex gap-1.5 items-baseline">
                  <span className={`font-medium uppercase tracking-wide text-2xs w-12 flex-shrink-0 ${highlightDisambiguation ? "text-vs-warning" : "text-vs-muted/70"}`}>Year</span>
                  <span className={highlightDisambiguation ? "text-vs-warning font-semibold" : "text-vs-text"}>{match.year}</span>
                </div>
              )}
              {match.country && (
                <div className="flex gap-1.5 items-baseline">
                  <span className={`font-medium uppercase tracking-wide text-2xs w-12 flex-shrink-0 ${highlightDisambiguation ? "text-vs-warning" : "text-vs-muted/70"}`}>From</span>
                  <span className={highlightDisambiguation ? "text-vs-warning font-semibold" : "text-vs-text"}>{match.country}</span>
                </div>
              )}
            </div>
          </div>
          {(matchReason?.includes("Catalog") || matchReason === "Artist & title match") && (
            <div className="mt-1.5">
              <span className={`flex items-center gap-1 text-2xs font-medium w-fit ${matchReason?.includes("Catalog") ? "text-vs-success" : "text-vs-accent"}`}>
                <span className={`w-1.5 h-1.5 rounded-full inline-block ${matchReason?.includes("Catalog") ? "bg-vs-success" : "bg-vs-accent"}`} />
                {matchReason}
              </span>
            </div>
          )}
          <div className="flex items-center gap-3 mt-1.5">
            {price === "loading" ? (
              <span className="text-xs text-vs-muted flex items-center gap-1">
                <Loader2 size={10} className="animate-spin" />price…
              </span>
            ) : price ? (
              <span className="text-xs text-vs-gold font-semibold">
                {price.currency} {price.lowest.toFixed(2)}
                <span className="text-vs-muted font-normal ml-1">({price.num_for_sale} for sale)</span>
              </span>
            ) : null}
            <a
              href={`https://www.discogs.com/release/${match.release_id}`}
              target="_blank" rel="noopener noreferrer"
              className="flex items-center gap-1 text-xs text-vs-muted hover:text-vs-text transition-colors"
              onClick={(e) => e.stopPropagation()}
            >
              <ExternalLink size={10} />Discogs
            </a>
          </div>
        </div>
      </div>

      {/* Price inputs + Add */}
      <div className="flex items-center gap-2 mt-3 pt-3 border-t border-vs-border">
        <div className="flex items-center gap-1">
          <span className="text-vs-muted text-xs flex-shrink-0">Price $</span>
          <input
            type="number" min="0" step={priceStep} placeholder="0.00"
            value={askingPrice}
            onChange={(e) => onAskingPriceChange(e.target.value)}
            onClick={(e) => e.stopPropagation()}
            className="w-[4.5rem] bg-vs-raised border border-vs-border-2 rounded px-2 py-1 text-xs text-vs-text focus:outline-none focus:border-vs-accent"
          />
        </div>
        <div className="flex items-center gap-1">
          <span className="text-vs-muted text-xs flex-shrink-0">Cost $</span>
          <input
            type="number" min="0" step={priceStep} placeholder="0.00"
            value={costPrice}
            onChange={(e) => onCostPriceChange(e.target.value)}
            onClick={(e) => e.stopPropagation()}
            className="w-[4.5rem] bg-vs-raised border border-vs-border-2 rounded px-2 py-1 text-xs text-vs-text focus:outline-none focus:border-vs-accent"
          />
        </div>
        <button
          onClick={onAdd}
          disabled={disabled}
          className="btn-primary text-sm py-1.5 px-3.5 flex items-center gap-1.5 disabled:opacity-50 flex-shrink-0 ml-auto"
        >
          {isAdding ? <Loader2 size={13} className="animate-spin" /> : <Plus size={13} />}
          {exactOwned ? "Add copy" : "Add"}
          {isFirst && <span className="text-2xs opacity-60 ml-0.5">[↵]</span>}
        </button>
      </div>
    </div>
  );
}

// ── Low Info Search Form (P1/P2) ─────────────────────────────────────────────
function LowInfoSearchForm({
  onSearch, onManualAdd, searching,
}: {
  onSearch: (fields: { artist?: string; label?: string; year?: number; catalog_number?: string }) => void;
  onManualAdd: () => void;
  searching?: boolean;
}) {
  const [artist, setArtist] = useState("");
  const [label, setLabel] = useState("");
  const [year, setYear] = useState("");
  const [catno, setCatno] = useState("");
  const hasAny = !!(artist || label || year || catno);

  function handleSubmit() {
    if (!hasAny) return;
    onSearch({
      artist: artist || undefined,
      label: label || undefined,
      year: year ? parseInt(year) : undefined,
      catalog_number: catno || undefined,
    });
  }

  return (
    <div className="p-4 bg-vs-warning/5 border-t border-vs-warning/20">
      <div className="flex items-start gap-2 mb-3">
        <AlertCircle size={14} className="text-vs-warning flex-shrink-0 mt-0.5" />
        <div>
          <p className="text-sm font-medium text-vs-text">No legible text detected</p>
          <p className="text-xs text-vs-muted mt-0.5">
            White label or no visible info. Enter anything you know — we'll search Discogs and compare the artwork visually.
          </p>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2 mb-3">
        {([
          ["Artist / hint", artist, setArtist, "text", "e.g. DJ Sprinkles"],
          ["Label", label, setLabel, "text", "e.g. Warp"],
          ["Year", year, setYear, "number", "e.g. 1994"],
          ["Catalog #", catno, setCatno, "text", "e.g. WARP 001"],
        ] as [string, string, (v: string) => void, string, string][]).map(([lbl, val, set, type, ph]) => (
          <div key={lbl}>
            <label className="text-xs text-vs-muted">{lbl}</label>
            <input
              type={type}
              value={val}
              onChange={(e) => set(e.target.value)}
              placeholder={ph}
              onKeyDown={(e) => { if (e.key === "Enter") handleSubmit(); }}
              className="input mt-1 text-sm w-full"
            />
          </div>
        ))}
      </div>
      <div className="flex items-center justify-between">
        <button onClick={onManualAdd} className="text-xs text-vs-muted hover:text-vs-text transition-colors">
          Add manually instead
        </button>
        <button
          onClick={handleSubmit}
          disabled={searching || !hasAny}
          className="btn-primary text-xs py-1.5 px-3 flex items-center gap-1.5 disabled:opacity-50"
        >
          {searching && <Loader2 size={12} className="animate-spin" />}
          <Camera size={11} />
          Search + match visually
        </button>
      </div>
    </div>
  );
}

// ── Manual Add Form ──────────────────────────────────────────────────────────
function ManualAddForm({
  defaults, sessionCondition, onSubmit, onCancel, submitting, priceStep,
}: {
  defaults: { artist?: string | null; title?: string | null; year?: number | null; label?: string | null };
  sessionCondition: Condition;
  onSubmit: (data: {
    artist?: string; title?: string; year?: number; label?: string;
    format?: string; condition: Condition; asking_price?: number; cost_price?: number;
  }) => void;
  onCancel: () => void;
  submitting: boolean;
  priceStep: number;
}) {
  const [artist, setArtist] = useState(defaults.artist ?? "");
  const [title, setTitle] = useState(defaults.title ?? "");
  const [year, setYear] = useState(defaults.year ? String(defaults.year) : "");
  const [label, setLabel] = useState(defaults.label ?? "");
  const [format, setFormat] = useState("");
  const [condition, setCondition] = useState<Condition>(sessionCondition);
  const [askingPrice, setAskingPrice] = useState("");
  const [costPrice, setCostPrice] = useState("");

  function handleSubmit() {
    if (!artist && !title) return;
    onSubmit({
      artist: artist || undefined,
      title: title || undefined,
      year: year ? parseInt(year) : undefined,
      label: label || undefined,
      format: format || undefined,
      condition,
      asking_price: askingPrice ? parseFloat(askingPrice) : undefined,
      cost_price: costPrice ? parseFloat(costPrice) : undefined,
    });
  }

  return (
    <div className="p-4 border-t border-vs-border bg-vs-raised/30 flex flex-col gap-3">
      <p className="text-xs text-vs-muted font-medium">Add without Discogs match</p>
      <div className="grid grid-cols-2 gap-2">
        {([
          ["Artist", artist, setArtist],
          ["Title", title, setTitle],
          ["Year", year, setYear],
          ["Label", label, setLabel],
        ] as [string, string, (v: string) => void][]).map(([lbl, val, set]) => (
          <div key={lbl}>
            <label className="text-xs text-vs-muted">{lbl}</label>
            <input
              type={lbl === "Year" ? "number" : "text"}
              value={val}
              onChange={(e) => set(e.target.value)}
              placeholder={lbl === "Year" ? "e.g. 1973" : ""}
              className="input mt-1 text-sm w-full"
            />
          </div>
        ))}
        <div>
          <label className="text-xs text-vs-muted">Format</label>
          <select value={format} onChange={(e) => setFormat(e.target.value)} className="input mt-1 text-sm w-full">
            <option value="">—</option>
            {FORMATS.map((f) => <option key={f} value={f}>{f}</option>)}
          </select>
        </div>
        <div>
          <label className="text-xs text-vs-muted block mb-1">Condition</label>
          <ConditionPicker value={condition} onChange={setCondition} showLabel={false} />
        </div>
        <div>
          <label className="text-xs text-vs-muted">Asking price</label>
          <div className="relative mt-1">
            <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-vs-muted text-xs">$</span>
            <input type="number" min="0" step={priceStep} value={askingPrice} onChange={(e) => setAskingPrice(e.target.value)}
              className="input pl-5 text-sm w-full" placeholder="0.00" />
          </div>
        </div>
        <div>
          <label className="text-xs text-vs-muted">Cost</label>
          <div className="relative mt-1">
            <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-vs-muted text-xs">$</span>
            <input type="number" min="0" step={priceStep} value={costPrice} onChange={(e) => setCostPrice(e.target.value)}
              className="input pl-5 text-sm w-full" placeholder="0.00" />
          </div>
        </div>
      </div>
      <div className="flex gap-2 justify-end">
        <button onClick={onCancel} className="btn-secondary text-xs py-1.5 px-3">Cancel</button>
        <button
          onClick={handleSubmit}
          disabled={submitting || (!artist && !title)}
          className="btn-primary text-xs py-1.5 px-3 flex items-center gap-1.5 disabled:opacity-50"
        >
          {submitting && <Loader2 size={12} className="animate-spin" />}
          Add to catalog
        </button>
      </div>
    </div>
  );
}

// ── Image Lightbox ───────────────────────────────────────────────────────────
function ImageLightbox({ url, onClose }: { url: string; onClose: () => void }) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === "Escape") onClose(); }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center"
      onClick={onClose}
    >
      <button
        className="absolute top-4 right-4 p-2 rounded-full bg-black/50 text-white hover:bg-black/70 transition-colors"
        onClick={onClose}
        aria-label="Close"
      >
        <X size={20} />
      </button>
      <img
        src={url}
        alt=""
        className="max-w-[90vw] max-h-[90vh] object-contain rounded-xl shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      />
    </div>
  );
}

// Strategy weight tiers for color coding
const _STRATEGY_WEIGHTS: Record<string, number> = {
  "matrix_code": 15, "matrix+label": 14,
  "catno+label": 12, "catno": 10, "catno+country": 9,
  "tracklist": 8, "label+title": 5,
  "q=artist_phrase": 4.5, "artist+release_title": 4,
  "artist+title+country": 3.8, "label+year": 3.5,
  "q=combined+year": 3, "artist+title+y-1": 2.8, "artist+title+y+1": 2.8,
  "q=combined": 2, "q=title": 1, "q=artist": 0.5,
};
function strategyTier(name: string): "high" | "mid" | "low" {
  const w = _STRATEGY_WEIGHTS[name] ?? 1;
  if (w >= 9) return "high";
  if (w >= 3.5) return "mid";
  return "low";
}

// ── Debug Side Panel (per-card, inline) ──────────────────────────────────────
function DebugStrategyRow({ s }: { s: AdminDebugSearchResult["strategies"][number] }) {
  const [open, setOpen] = useState(s.result_count > 0);
  const hit = s.result_count > 0;
  const tier = strategyTier(s.name);
  const tierColor = hit
    ? tier === "high" ? "text-vs-success" : tier === "mid" ? "text-vs-warning" : "text-vs-accent"
    : "text-vs-muted";
  const borderColor = hit
    ? tier === "high" ? "border-green-500/40" : tier === "mid" ? "border-amber-500/40" : "border-vs-border"
    : "border-vs-border/30 opacity-40";

  const weight = _STRATEGY_WEIGHTS[s.name];
  const paramStr = Object.entries(s.params).map(([k, v]) => `${k}=${v}`).join(" · ");

  return (
    <div className={`rounded border text-2xs ${borderColor}`}>
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center gap-1 px-2 py-1 text-left"
      >
        {open ? <ChevronDown size={9} /> : <ChevronRight size={9} />}
        <span className={`font-mono font-semibold w-28 flex-shrink-0 truncate ${tierColor}`}>
          {s.name}
        </span>
        {weight !== undefined && (
          <span className="text-vs-muted/50 text-[9px] flex-shrink-0">w{weight}</span>
        )}
        <span className="text-vs-muted/50 truncate flex-1 text-[9px] ml-1">{paramStr}</span>
        {s.error ? (
          <span className="flex-shrink-0 font-mono text-[9px] text-vs-danger" title={s.error}>
            {s.error === "rate_limited" ? "429" : s.error === "auth_error" ? "401" : "err"}
          </span>
        ) : (
          <span className={`flex-shrink-0 font-medium ${hit ? tierColor : "text-vs-muted"}`}>
            {s.result_count}
          </span>
        )}
      </button>
      {open && s.top_results.length > 0 && (
        <div className="border-t border-vs-border/30 px-2 py-1 flex flex-col gap-0.5">
          {s.top_results.slice(0, 2).map((r) => (
            <div key={r.id} className="flex items-center gap-1 text-2xs">
              {r.cover_image && !r.cover_image.includes("spacer") ? (
                <img src={r.cover_image} alt="" className="w-4 h-4 rounded object-cover flex-shrink-0" />
              ) : (
                <div className="w-4 h-4 rounded bg-vs-raised border border-vs-border flex-shrink-0" />
              )}
              <span className="truncate flex-1 text-vs-text">{r.title}</span>
              {r.catno && <span className="font-mono text-vs-accent/70 flex-shrink-0 text-[9px]">{r.catno}</span>}
              <a
                href={`https://www.discogs.com/release/${r.id}`}
                target="_blank" rel="noopener noreferrer"
                className="text-vs-muted hover:text-vs-text flex-shrink-0"
                onClick={(e) => e.stopPropagation()}
              >
                <ExternalLink size={8} />
              </a>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function DebugSidePanel({ scanId, result }: { scanId: string; result: ScanUploadResponse }) {
  const [debug, setDebug] = useState<AdminDebugSearchResult | null>(null);
  const [loading, setLoading] = useState(false);

  // Runs the full, un-short-circuited strategy set (13-24 Discogs calls) just to
  // show the breakdown — opt-in on click, not on every card render, so casually
  // looking at scans doesn't quietly burn through the rate limit.
  useEffect(() => {
    setDebug(null);
    setLoading(false);
  }, [scanId]);

  function loadDebug() {
    setLoading(true);
    api.adminDebugSearch(scanId)
      .then(setDebug)
      .catch(() => {})
      .finally(() => setLoading(false));
  }

  const claudeRaw = debug?.claude_raw ?? null;
  const tracklist = (claudeRaw?.tracklist as Array<{ position: string; title: string }> | null) ?? [];
  const hitCount = debug?.strategies.filter((s) => s.result_count > 0).length ?? 0;
  const totalCount = debug?.strategies.length ?? 0;

  return (
    <div className="p-3 flex flex-col gap-2.5 h-full overflow-y-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <span className="text-2xs font-mono text-vs-muted/50">scan {scanId.slice(0, 8)}…</span>
        {loading ? (
          <span className="flex items-center gap-1 text-2xs text-vs-muted">
            <Loader2 size={9} className="animate-spin" />searching…
          </span>
        ) : !debug ? (
          <button
            onClick={loadDebug}
            className="text-2xs text-vs-accent underline hover:opacity-70"
            title="Runs the full strategy set against Discogs — costs API calls"
          >
            Load strategies
          </button>
        ) : null}
      </div>

      {/* Claude detected */}
      <div className="bg-vs-raised/60 rounded-lg p-2.5 flex flex-col gap-0.5">
        <p className="text-2xs text-vs-muted font-medium uppercase tracking-wider mb-1">Claude detected</p>
        {([
          ["artist", result.artist],
          ["title", result.title],
          ["year", result.year],
          ["label", result.label],
          ["catalog", result.catalog_number],
          ["barcode", result.barcode],
          ["confidence", `${result.confidence}%`],
          ["int_conf", result.internal_confidence != null ? `${result.internal_confidence}%` : null],
          // extras from full claude_raw (available after debug fetch)
          ["matrix", claudeRaw?.matrix_code],
          ["country", claudeRaw?.country],
          ["genre", claudeRaw?.genre],
          ["format", claudeRaw?.format],
          ["artist_alt", result.artist_alt],
          ["title_alt", result.title_alt],
        ] as [string, unknown][]).map(([lbl, value]) => value != null && value !== "" && (
          <div key={lbl} className="flex gap-2 text-2xs">
            <span className="text-vs-muted font-mono w-16 flex-shrink-0">{lbl}</span>
            <span className={`font-medium break-all ${lbl === "confidence" && result.confidence < 70 ? "text-vs-warning" : lbl === "int_conf" && (result.internal_confidence ?? 0) < 50 ? "text-vs-warning" : ""}`}>
              {String(value)}
            </span>
          </div>
        ))}
        {result.low_information && (
          <div className="flex gap-2 text-2xs text-vs-warning">
            <span className="text-vs-muted font-mono w-16 flex-shrink-0">low_info</span>
            <span className="font-medium">true ⚠️</span>
          </div>
        )}
        {claudeRaw?.reasoning ? (
          <p className="text-2xs text-vs-muted italic mt-1">
            &ldquo;{String(claudeRaw.reasoning)}&rdquo;
          </p>
        ) : null}
        {tracklist.length > 0 && (
          <div className="mt-1.5 pt-1.5 border-t border-vs-border/40">
            <p className="text-2xs text-vs-muted font-mono mb-0.5">tracklist ({tracklist.length})</p>
            {tracklist.slice(0, 5).map((t) => (
              <div key={t.position} className="flex gap-1.5 text-2xs">
                <span className="text-vs-muted font-mono w-5 flex-shrink-0">{t.position}</span>
                <span className="text-vs-text truncate">{t.title}</span>
              </div>
            ))}
            {tracklist.length > 5 && (
              <p className="text-2xs text-vs-muted/50 mt-0.5">+{tracklist.length - 5} more…</p>
            )}
          </div>
        )}
      </div>

      {/* Strategies */}
      {debug && (
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-2">
            <p className="text-2xs text-vs-muted font-medium uppercase tracking-wider">
              Strategies <span className="normal-case font-mono text-vs-accent">({hitCount}/{totalCount})</span>
            </p>
            <div className="flex items-center gap-1.5 ml-auto">
              <span className="w-1.5 h-1.5 rounded-full bg-vs-success inline-block" />
              <span className="text-[9px] text-vs-muted">high</span>
              <span className="w-1.5 h-1.5 rounded-full bg-amber-400 inline-block ml-1" />
              <span className="text-[9px] text-vs-muted">mid</span>
              <span className="w-1.5 h-1.5 rounded-full bg-vs-accent inline-block ml-1" />
              <span className="text-[9px] text-vs-muted">low</span>
            </div>
          </div>
          {debug.strategies.map((s) => (
            <DebugStrategyRow key={s.name + JSON.stringify(s.params)} s={s} />
          ))}
        </div>
      )}

      {/* Final ranking */}
      {debug && debug.ranked.length > 0 && (
        <div className="flex flex-col gap-2">
          <p className="text-2xs text-vs-muted font-medium uppercase tracking-wider">Final ranking</p>
          {debug.ranked.map((r, i) => {
            const bd = r._breakdown;
            return (
              <div key={r.id} className="flex items-start gap-1.5 text-2xs">
                <span className="text-vs-muted font-mono w-3 text-center flex-shrink-0 mt-0.5">{i + 1}</span>
                {r.cover_image && !r.cover_image.includes("spacer") ? (
                  <img src={r.cover_image} alt="" className="w-5 h-5 rounded object-cover flex-shrink-0 mt-0.5" />
                ) : (
                  <div className="w-5 h-5 rounded bg-vs-raised border border-vs-border flex-shrink-0 mt-0.5" />
                )}
                <div className="flex-1 min-w-0">
                  <p className="text-vs-text truncate">{r.title}</p>
                  <div className="flex gap-1 text-2xs text-vs-muted flex-wrap mt-0.5">
                    {r.catno && <span className="font-mono">{r.catno}</span>}
                    {r._match_reason && <span className="text-vs-accent">{r._match_reason}</span>}
                  </div>
                  {/* Score breakdown */}
                  {bd && (
                    <div className="mt-0.5 flex flex-col gap-px">
                      {/* Hit strategies with weights */}
                      <div className="flex flex-wrap gap-x-1.5 gap-y-px">
                        {Object.entries(bd.hit_weights).map(([s, w]) => (
                          <span key={s} className={`font-mono text-[9px] ${strategyTier(s) === "high" ? "text-vs-success" : strategyTier(s) === "mid" ? "text-amber-400" : "text-vs-accent/70"}`}>
                            {s}(+{w})
                          </span>
                        ))}
                      </div>
                      {/* Penalties / bonuses */}
                      <div className="flex gap-2 text-[9px] text-vs-muted flex-wrap">
                        {bd.b2_factor !== null && bd.b2_factor !== undefined ? (
                          <span className="text-vs-danger">B2 sim={bd.b2_sim} ×{bd.b2_factor}</span>
                        ) : bd.b2_sim !== null && bd.b2_sim !== undefined ? (
                          <span className="text-vs-success/70">sim={bd.b2_sim} ✓</span>
                        ) : null}
                        {bd.b3_cd && <span className="text-vs-danger">B3 CD×0.05</span>}
                        {bd.b6_cover > 0 && <span className="text-vs-muted/60">cover+{bd.b6_cover}</span>}
                        <span className="font-mono text-vs-text/80">= {r._score}</span>
                      </div>
                    </div>
                  )}
                  {!bd && <span className="text-[9px] text-vs-muted font-mono">score {r._score}</span>}
                </div>
                <a
                  href={`https://www.discogs.com/release/${r.id}`}
                  target="_blank" rel="noopener noreferrer"
                  className="text-vs-muted hover:text-vs-text flex-shrink-0 mt-0.5"
                  onClick={(e) => e.stopPropagation()}
                >
                  <ExternalLink size={9} />
                </a>
              </div>
            );
          })}
        </div>
      )}

      {debug && debug.ranked.length === 0 && !loading && (
        <p className="text-2xs text-vs-muted text-center py-2">No results in final ranking.</p>
      )}
    </div>
  );
}

// ── Scan Item ────────────────────────────────────────────────────────────────
function ScanItem({
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
        <div className={`card overflow-hidden${hasDebug ? " grid grid-cols-[minmax(0,1fr)_320px] items-start" : ""}`}>
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
