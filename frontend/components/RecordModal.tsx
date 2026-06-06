"use client";

import { useEffect, useState, useRef } from "react";
import { X, ExternalLink } from "lucide-react";
import { api, type CatalogRecord, type Lot } from "@/lib/api";
import { CoverThumb } from "./CoverThumb";

const CONDITIONS = ["M", "NM", "VG+", "VG", "G"] as const;
const FORMATS = ["LP", "EP", "7\"", "12\"", "CD", "Cassette", "Box Set", "Other"];

interface RecordModalProps {
  record?: CatalogRecord;
  lots: Lot[];
  onClose: () => void;
  onSaved: (r: CatalogRecord) => void;
}

export function RecordModal({ record, lots, onClose, onSaved }: RecordModalProps) {
  const isNew = !record;
  const [lightbox, setLightbox] = useState(false);

  const [askingPrice, setAskingPrice] = useState(
    record?.asking_price != null ? String(record.asking_price) : ""
  );
  const [autoSaved, setAutoSaved] = useState(false);
  const autoSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [form, setFormState] = useState({
    artist: record?.artist ?? "",
    title: record?.title ?? "",
    year: record?.year ? String(record.year) : "",
    label: record?.label ?? "",
    catalog_number: record?.catalog_number ?? "",
    format: record?.format ?? "",
    genre: record?.genre ?? "",
    country: record?.country ?? "",
    condition: record?.condition ?? "VG+",
    lot_id: record?.lot_id ?? "",
    cost_price: record?.cost_price != null ? String(record.cost_price) : "",
    tags: record?.tags ?? "",
    notes: record?.notes ?? "",
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  function set(k: string, v: string) { setFormState((f) => ({ ...f, [k]: v })); }

  // ESC to close
  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === "Escape") onClose(); }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  // Cancel pending auto-save on unmount (prevents state update on unmounted component)
  useEffect(() => {
    return () => { if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current); };
  }, []);

  // Auto-save price (edit mode only)
  function handlePriceChange(v: string) {
    setAskingPrice(v);
    if (!isNew && record) {
      if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current);
      autoSaveTimer.current = setTimeout(async () => {
        const n = v === "" ? null : parseFloat(v);
        if (v !== "" && (n === null || isNaN(n as number))) return;
        try {
          const updated = await api.updateRecord(record.id, { asking_price: n ?? undefined });
          onSaved(updated);
          setAutoSaved(true);
          setTimeout(() => setAutoSaved(false), 2000);
        } catch { /* silent */ }
      }, 600);
    }
  }

  async function save() {
    if (!form.artist && !form.title) { setError("Artist or title required."); return; }
    setSaving(true);
    setError("");
    try {
      const body: Record<string, unknown> = {
        artist: form.artist || null,
        title: form.title || null,
        year: form.year ? parseInt(form.year) : null,
        label: form.label || null,
        catalog_number: form.catalog_number || null,
        format: form.format || null,
        genre: form.genre || null,
        country: form.country || null,
        condition: form.condition,
        lot_id: form.lot_id || null,
        cost_price: form.cost_price ? parseFloat(form.cost_price) : null,
        asking_price: askingPrice ? parseFloat(askingPrice) : null,
        tags: form.tags || null,
        notes: form.notes || null,
      };
      const saved = isNew
        ? await api.createRecord(body as Parameters<typeof api.createRecord>[0])
        : await api.updateRecord(record!.id, body as Parameters<typeof api.updateRecord>[1]);
      onSaved(saved);
      onClose();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-vs-card border border-vs-border rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">

        {/* Sticky header */}
        <div className="sticky top-0 bg-vs-card border-b border-vs-border px-6 py-4 flex items-center justify-between rounded-t-2xl z-10">
          <h2 className="text-base font-medium">{isNew ? "Add record" : "Edit record"}</h2>
          <button onClick={onClose} className="btn-ghost p-1.5"><X size={15} /></button>
        </div>

        {/* Price hero */}
        <div className="px-6 pt-5 pb-4 border-b border-vs-border/60 bg-vs-raised/30">
          <div className="flex items-center gap-4">
            {record?.cover_image_url ? (
              <button
                type="button"
                onClick={() => setLightbox(true)}
                className="flex-shrink-0 rounded-xl overflow-hidden border border-vs-border hover:opacity-80 transition-opacity focus:outline-none focus:ring-2 focus:ring-vs-accent"
                title="Click to enlarge"
              >
                <CoverThumb url={record.cover_image_url} large />
              </button>
            ) : (
              <CoverThumb url={null} large />
            )}
            <div className="flex-1 min-w-0">
              {record && (
                <p className="text-sm font-medium text-vs-text mb-0.5 truncate">
                  {record.artist && record.title
                    ? `${record.artist} — ${record.title}`
                    : record.artist || record.title || "Record"}
                </p>
              )}
              <label className="text-xs text-vs-muted flex items-center gap-2">
                Asking price
                <span className={`text-2xs transition-opacity duration-300 ${autoSaved ? "opacity-100 text-vs-success" : "opacity-0"}`}>
                  ✓ Saved
                </span>
              </label>
              <div className="flex items-center gap-2 mt-0.5">
                <span className="text-2xl font-medium text-vs-muted">$</span>
                <input
                  type="number" min="0" step="0.01"
                  value={askingPrice}
                  onChange={(e) => handlePriceChange(e.target.value)}
                  placeholder="0.00"
                  className="text-3xl font-bold bg-transparent border-none outline-none text-vs-gold w-40 placeholder:text-vs-muted/40 focus:text-vs-gold"
                />
                {record?.discogs_release_id && (
                  <a
                    href={`https://www.discogs.com/release/${record.discogs_release_id}`}
                    target="_blank" rel="noopener noreferrer"
                    className="ml-auto flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-vs-raised hover:bg-vs-border text-vs-text-2 hover:text-vs-text text-xs font-medium transition-colors border border-vs-border"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <ExternalLink size={11} />Discogs
                  </a>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Fields */}
        <div className="p-6 grid grid-cols-2 gap-4">
          <div className="col-span-2 grid grid-cols-2 gap-4">
            <div>
              <label className="text-xs text-vs-text-2 mb-1 block">Artist</label>
              <input className="input" value={form.artist} onChange={(e) => set("artist", e.target.value)} placeholder="e.g. Pink Floyd" />
            </div>
            <div>
              <label className="text-xs text-vs-text-2 mb-1 block">Title</label>
              <input className="input" value={form.title} onChange={(e) => set("title", e.target.value)} placeholder="e.g. The Wall" />
            </div>
          </div>

          <div>
            <label className="text-xs text-vs-text-2 mb-1 block">Year</label>
            <input className="input" type="number" value={form.year} onChange={(e) => set("year", e.target.value)} placeholder="1979" />
          </div>
          <div>
            <label className="text-xs text-vs-text-2 mb-1 block">Label</label>
            <input className="input" value={form.label} onChange={(e) => set("label", e.target.value)} placeholder="Columbia" />
          </div>

          <div>
            <label className="text-xs text-vs-text-2 mb-1 block">Format</label>
            <select className="input" value={form.format} onChange={(e) => set("format", e.target.value)}>
              <option value="">— select —</option>
              {FORMATS.map((f) => <option key={f}>{f}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs text-vs-text-2 mb-1 block">Condition</label>
            <div className="flex gap-1">
              {CONDITIONS.map((c) => (
                <button
                  key={c} type="button" onClick={() => set("condition", c)}
                  className={`flex-1 py-1.5 text-xs font-medium rounded-lg border transition-colors ${
                    form.condition === c
                      ? "bg-vs-accent text-vs-bg border-vs-accent"
                      : "border-vs-border-2 text-vs-text-2 hover:border-vs-accent hover:text-vs-text"
                  }`}
                >
                  {c}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="text-xs text-vs-text-2 mb-1 block">Genre</label>
            <input className="input" value={form.genre} onChange={(e) => set("genre", e.target.value)} placeholder="Rock" />
          </div>
          <div>
            <label className="text-xs text-vs-text-2 mb-1 block">Country</label>
            <input className="input" value={form.country} onChange={(e) => set("country", e.target.value)} placeholder="US" />
          </div>

          <div>
            <label className="text-xs text-vs-text-2 mb-1 block">Catalog number</label>
            <input className="input" value={form.catalog_number} onChange={(e) => set("catalog_number", e.target.value)} />
          </div>
          <div>
            <label className="text-xs text-vs-text-2 mb-1 block">Lot</label>
            <select className="input" value={form.lot_id} onChange={(e) => set("lot_id", e.target.value)}>
              <option value="">None</option>
              {lots.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
            </select>
          </div>

          <div>
            <label className="text-xs text-vs-text-2 mb-1 block">Cost price</label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-vs-muted text-xs">$</span>
              <input className="input pl-6" type="number" min="0" step="0.01" value={form.cost_price} onChange={(e) => set("cost_price", e.target.value)} placeholder="0.00" />
            </div>
          </div>

          <div className="col-span-2">
            <label className="text-xs text-vs-text-2 mb-1 block">Tags (comma-separated)</label>
            <input className="input" value={form.tags} onChange={(e) => set("tags", e.target.value)} placeholder="jazz, original pressing, promo" />
          </div>
          <div className="col-span-2">
            <label className="text-xs text-vs-text-2 mb-1 block">Notes</label>
            <textarea className="input resize-none" rows={2} value={form.notes} onChange={(e) => set("notes", e.target.value)} />
          </div>
        </div>

        {error && <p className="px-6 pb-2 text-xs text-vs-danger">{error}</p>}

        <div className="sticky bottom-0 bg-vs-card border-t border-vs-border px-6 py-4 flex justify-end gap-2 rounded-b-2xl">
          <button onClick={onClose} className="btn-secondary">Cancel</button>
          <button onClick={save} disabled={saving} className="btn-primary disabled:opacity-50">
            {saving ? "Saving…" : isNew ? "Add record" : "Save changes"}
          </button>
        </div>
      </div>
    </div>

    {/* Lightbox */}
    {lightbox && record?.cover_image_url && (
      <div
        className="fixed inset-0 z-[200] flex items-center justify-center bg-black/85 backdrop-blur-sm"
        onClick={() => setLightbox(false)}
      >
        <button
          type="button"
          onClick={() => setLightbox(false)}
          className="absolute top-4 right-4 text-white/70 hover:text-white"
          aria-label="Close image"
        >
          <X size={28} />
        </button>
        <img
          src={record.cover_image_url}
          alt={record.title ?? "Cover"}
          className="max-w-[90vw] max-h-[90vh] rounded-2xl shadow-2xl object-contain"
          onClick={(e) => e.stopPropagation()}
        />
      </div>
    )}
  );
}
