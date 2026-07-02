"use client";

import { useState } from "react";
import { AlertCircle, Camera, Loader2, Search } from "lucide-react";
import { api, type Lot } from "@/lib/api";
import { CONDITIONS, FORMATS, type Condition, ConditionPicker } from "./shared";

export function LowInfoSearchForm({
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
export function ManualAddForm({
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