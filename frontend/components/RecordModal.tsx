"use client";

import { useEffect, useState, useRef } from "react";
import { X, ExternalLink, Wand2, Loader2, Clock, Search } from "lucide-react";
import { toast } from "sonner";
import { api, type CatalogRecord, type Lot, type RecordEvent, type DiscogsMatch, type User, type Consignor } from "@/lib/api";
import { CoverThumb } from "./CoverThumb";

const CONDITIONS = ["M", "NM", "VG+", "VG", "G"] as const;
const FORMATS = ["LP", "EP", "7\"", "12\"", "CD", "Cassette", "Box Set", "Other"];

const HISTORY_LABEL: Record<string, string> = {
  added: "Added to catalog",
  price_changed: "Price changed",
  condition_changed: "Condition changed",
  lot_changed: "Lot assignment changed",
  store_listed: "Store listing changed",
  notes_updated: "Notes updated",
  sold: "Sold",
  linked_discogs: "Linked to Discogs",
  listed_on_discogs: "Listed on Discogs",
  delisted_from_discogs: "Delisted from Discogs",
};

interface RecordModalProps {
  record?: CatalogRecord;
  lots: Lot[];
  onClose: () => void;
  onSaved: (r: CatalogRecord) => void;
  discogsConnected?: boolean;
  user?: User | null;
}

export function RecordModal({ record, lots, onClose, onSaved, discogsConnected = false, user }: RecordModalProps) {
  const isNew = !record;
  const [lightbox, setLightbox] = useState(false);
  const [listing, setListing] = useState(false);
  const [listingId, setListingId] = useState<number | null>(record?.discogs_listing_id ?? null);
  const [storeListed, setStoreListed] = useState(record?.store_listed ?? false);
  const [storeToggling, setStoreToggling] = useState(false);

  const [askingPrice, setAskingPrice] = useState(
    record?.asking_price != null ? String(record.asking_price) : ""
  );
  const [autoSaved, setAutoSaved] = useState(false);
  const [autoSaveError, setAutoSaveError] = useState(false);
  const autoSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [autoPricing, setAutoPricing] = useState(false);

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
    disc_condition: record?.disc_condition ?? (record?.condition ?? "VG+"),
    cover_condition: record?.cover_condition ?? "VG+",
    lot_id: record?.lot_id ?? "",
    cost_price: record?.cost_price != null ? String(record.cost_price) : "",
    tags: record?.tags ?? "",
    notes: record?.notes ?? "",
    record_section: record?.record_section ?? "vinyl",
  });
  const [tracklist, setTracklist] = useState<{ position: string; title: string; duration: string }[]>(
    record?.tracklist ?? []
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [history, setHistory] = useState<RecordEvent[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  const [findDiscogsOpen, setFindDiscogsOpen] = useState(false);
  const [findDiscogsSearching, setFindDiscogsSearching] = useState(false);
  const [findDiscogsMatches, setFindDiscogsMatches] = useState<DiscogsMatch[]>([]);
  const [findDiscogsArtist, setFindDiscogsArtist] = useState(record?.artist ?? "");
  const [findDiscogsTitle, setFindDiscogsTitle] = useState(record?.title ?? "");
  const [findDiscogsLinking, setFindDiscogsLinking] = useState<number | null>(null);

  const [consignors, setConsignors] = useState<Consignor[]>([]);
  const [consignorOpen, setConsignorOpen] = useState(false);
  const [consignorSaving, setConsignorSaving] = useState(false);
  const [selectedConsignorId, setSelectedConsignorId] = useState<number | null>(record?.consignor_id ?? null);
  const [consignorAgreedPrice, setConsignorAgreedPrice] = useState(
    record?.consignor_agreed_price != null ? String(record.consignor_agreed_price) : ""
  );
  const [consignorCommissionPct, setConsignorCommissionPct] = useState(
    record?.consignor_commission_pct != null ? String(record.consignor_commission_pct) : ""
  );

  useEffect(() => {
    if (!isNew) {
      api.listConsignors().then(setConsignors).catch(() => {});
    }
  }, [isNew]);

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

  // Fetch record history for existing records
  useEffect(() => {
    if (isNew || !record) return;
    setHistoryLoading(true);
    api.recordHistory(record.id)
      .then(setHistory)
      .catch(() => {})
      .finally(() => setHistoryLoading(false));
  }, [record?.id, isNew]);

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
          setAutoSaveError(false);
          setTimeout(() => setAutoSaved(false), 2000);
        } catch (e: unknown) {
          setAutoSaveError(true);
          setTimeout(() => setAutoSaveError(false), 4000);
          toast.error(e instanceof Error ? e.message : "Price save failed");
        }
      }, 600);
    }
  }

  async function applyAutoPrice() {
    if (autoPricing || !record?.discogs_release_id) return;
    let price = record.discogs_suggested_price ?? record.discogs_lowest_price ?? null;
    if (price == null) {
      setAutoPricing(true);
      try {
        const data = await api.fetchDiscogsPrices([record.discogs_release_id]);
        price = data[String(record.discogs_release_id)]?.lowest ?? null;
      } catch { /* ignore */ }
      finally { setAutoPricing(false); }
    }
    if (price != null && price > 0) handlePriceChange(String(price));
  }

  function buildBody() {
    return {
      artist: form.artist || null,
      title: form.title || null,
      year: form.year ? parseInt(form.year) : null,
      label: form.label || null,
      catalog_number: form.catalog_number || null,
      format: form.format || null,
      genre: form.genre || null,
      country: form.country || null,
      condition: form.disc_condition || form.condition,
      disc_condition: form.disc_condition || null,
      cover_condition: form.cover_condition || null,
      lot_id: form.lot_id || null,
      cost_price: form.cost_price ? parseFloat(form.cost_price) : null,
      asking_price: askingPrice ? parseFloat(askingPrice) : null,
      tags: form.tags || null,
      notes: form.notes || null,
      record_section: form.record_section || "vinyl",
      tracklist: tracklist.filter((t) => t.title.trim()).length > 0
        ? tracklist.filter((t) => t.title.trim())
        : null,
    };
  }

  function resetForm() {
    setFormState({ artist: "", title: "", year: "", label: "", catalog_number: "", format: "", genre: "", country: "", condition: "VG+", disc_condition: "VG+", cover_condition: "VG+", lot_id: form.lot_id, cost_price: "", tags: "", notes: "", record_section: "vinyl" });
    setAskingPrice("");
    setTracklist([]);
    setError("");
  }

  async function save() {
    if (!form.artist && !form.title) { setError("Artist or title required."); return; }
    setSaving(true);
    setError("");
    try {
      const body = buildBody();
      const saved = isNew
        ? await api.createRecord(body as Parameters<typeof api.createRecord>[0])
        : await api.updateRecord(record!.id, body as Parameters<typeof api.updateRecord>[1]);
      onSaved(saved);
      toast.success(isNew ? "Record added" : "Changes saved");
      onClose();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Save failed";
      setError(msg);
      toast.error(msg);
    } finally {
      setSaving(false);
    }
  }

  async function saveAndAddAnother() {
    if (!form.artist && !form.title) { setError("Artist or title required."); return; }
    setSaving(true);
    setError("");
    try {
      const body = buildBody();
      const saved = await api.createRecord(body as Parameters<typeof api.createRecord>[0]);
      onSaved(saved);
      toast.success("Record added");
      resetForm();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Save failed";
      setError(msg);
      toast.error(msg);
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
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
                <span className={`text-2xs transition-opacity duration-300 ${autoSaveError ? "opacity-100 text-vs-danger" : "opacity-0"}`}>
                  Save failed — try again
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
                  <button
                    type="button"
                    onClick={applyAutoPrice}
                    disabled={autoPricing}
                    title="Fill with Discogs suggested price"
                    className="flex items-center gap-1 px-2 py-1 rounded-lg bg-vs-accent/10 hover:bg-vs-accent/20 text-vs-accent text-xs font-medium transition-colors border border-vs-accent/20 disabled:opacity-50"
                  >
                    {autoPricing ? <Loader2 size={11} className="animate-spin" /> : <Wand2 size={11} />}
                    Auto
                  </button>
                )}
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

          {/* Market price range */}
          {record && (record.discogs_lowest_price != null || record.discogs_suggested_price != null) && (
            <div className="mt-3 flex items-center gap-4 text-xs text-vs-muted">
              {record.discogs_lowest_price != null && (
                <span title="Lowest current Discogs listing">
                  <span className="text-vs-text-2 font-medium">${record.discogs_lowest_price.toFixed(2)}</span>
                  <span className="ml-1 text-2xs">mkt low</span>
                </span>
              )}
              {record.discogs_suggested_price != null && (
                <span title="Discogs suggested price based on recent sales">
                  <span className="text-vs-text-2 font-medium">${record.discogs_suggested_price.toFixed(2)}</span>
                  <span className="ml-1 text-2xs">suggested</span>
                </span>
              )}
              {record.discogs_num_for_sale != null && (
                <span>{record.discogs_num_for_sale} for sale</span>
              )}
            </div>
          )}
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
          <div className="col-span-2 grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-vs-text-2 mb-1 block">Disc condition</label>
              <div className="flex gap-1">
                {CONDITIONS.map((c) => (
                  <button
                    key={c} type="button" onClick={() => { set("disc_condition", c); set("condition", c); }}
                    className={`flex-1 py-1.5 text-xs font-medium rounded-lg border transition-colors ${
                      form.disc_condition === c
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
              <label className="text-xs text-vs-text-2 mb-1 block">Cover condition</label>
              <div className="flex gap-1">
                {CONDITIONS.map((c) => (
                  <button
                    key={c} type="button" onClick={() => set("cover_condition", c)}
                    className={`flex-1 py-1.5 text-xs font-medium rounded-lg border transition-colors ${
                      form.cover_condition === c
                        ? "bg-vs-accent text-vs-bg border-vs-accent"
                        : "border-vs-border-2 text-vs-text-2 hover:border-vs-accent hover:text-vs-text"
                    }`}
                  >
                    {c}
                  </button>
                ))}
              </div>
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
            <label className="text-xs text-vs-text-2 mb-1 block">Section</label>
            <select className="input" value={form.record_section} onChange={(e) => set("record_section", e.target.value)}>
              <option value="vinyl">Vinyl</option>
              <option value="accessory">Accessory</option>
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

          <div className="col-span-2">
            <div className="flex items-center justify-between mb-1">
              <label className="text-xs text-vs-text-2">Tracklist</label>
              <p className="text-2xs text-vs-muted">
                {record?.discogs_release_id ? "Pulled from Discogs on confirm — edit if needed" : "No Discogs release — add tracks manually"}
              </p>
            </div>
            <div className="space-y-1.5">
              {tracklist.map((t, i) => (
                <div key={i} className="flex items-center gap-1.5">
                  <input
                    className="input text-xs py-1.5 w-14 flex-shrink-0"
                    placeholder="A1"
                    value={t.position}
                    onChange={(e) => setTracklist((ts) => ts.map((x, j) => j === i ? { ...x, position: e.target.value } : x))}
                  />
                  <input
                    className="input text-xs py-1.5 flex-1"
                    placeholder="Track title"
                    value={t.title}
                    onChange={(e) => setTracklist((ts) => ts.map((x, j) => j === i ? { ...x, title: e.target.value } : x))}
                  />
                  <input
                    className="input text-xs py-1.5 w-16 flex-shrink-0"
                    placeholder="3:45"
                    value={t.duration}
                    onChange={(e) => setTracklist((ts) => ts.map((x, j) => j === i ? { ...x, duration: e.target.value } : x))}
                  />
                  <button
                    type="button"
                    onClick={() => setTracklist((ts) => ts.filter((_, j) => j !== i))}
                    className="text-vs-muted hover:text-vs-danger flex-shrink-0"
                  >
                    <X size={14} />
                  </button>
                </div>
              ))}
            </div>
            <button
              type="button"
              onClick={() => setTracklist((ts) => [...ts, { position: "", title: "", duration: "" }])}
              className="text-2xs text-vs-accent hover:underline mt-1.5"
            >
              + Add track
            </button>
          </div>
        </div>

        {/* Store listing toggle */}
        {!isNew && (
          <div className="px-6 pb-4 border-t border-vs-border pt-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-medium text-vs-text-2">Store listing</p>
                <p className={`text-xs mt-0.5 ${storeListed ? "text-vs-success" : "text-vs-muted"}`}>
                  {storeListed ? "Visible in your store" : "Hidden from store"}
                </p>
              </div>
              <button
                onClick={async () => {
                  if (storeToggling || !record) return;
                  setStoreToggling(true);
                  try {
                    const updated = await api.updateRecord(record.id, { store_listed: !storeListed });
                    setStoreListed(!storeListed);
                    onSaved(updated);
                    toast.success(storeListed ? "Removed from store" : "Listed in store");
                  } catch (e: unknown) {
                    toast.error(e instanceof Error ? e.message : "Store toggle failed");
                  }
                  finally { setStoreToggling(false); }
                }}
                disabled={storeToggling}
                className={`text-xs px-3 py-1.5 rounded-lg border transition-colors disabled:opacity-40 ${
                  storeListed
                    ? "border-vs-danger/40 text-vs-danger hover:bg-vs-danger/10"
                    : "border-vs-accent/40 text-vs-accent hover:bg-vs-accent/10"
                }`}
              >
                {storeToggling ? "…" : storeListed ? "Hide from store" : "Show in store"}
              </button>
            </div>
          </div>
        )}

        {/* Consignor assignment */}
        {!isNew && record && record.status !== "sold" && (
          <div className="px-6 pb-4 border-t border-vs-border pt-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-medium text-vs-text-2">Consignment</p>
                {record.consignor_id ? (
                  <p className="text-xs text-vs-accent mt-0.5">
                    {consignors.find(c => c.id === record.consignor_id)?.name ?? `Consignor #${record.consignor_id}`}
                    {record.consignor_agreed_price != null && ` · agreed $${record.consignor_agreed_price.toFixed(2)}`}
                    {record.consignor_commission_pct != null && ` · ${record.consignor_commission_pct}%`}
                  </p>
                ) : (
                  <p className="text-xs text-vs-muted mt-0.5">Not consigned</p>
                )}
              </div>
              <button
                onClick={() => setConsignorOpen(v => !v)}
                className="text-xs px-3 py-1.5 rounded-lg border border-vs-border text-vs-text-2 hover:bg-vs-raised transition-colors"
              >
                {consignorOpen ? "Cancel" : record.consignor_id ? "Edit" : "Assign"}
              </button>
            </div>
            {consignorOpen && (
              <div className="mt-3 space-y-3">
                <div>
                  <label className="text-xs text-vs-text-2 mb-1 block">Consignor</label>
                  <select
                    className="input text-xs"
                    value={selectedConsignorId ?? ""}
                    onChange={e => setSelectedConsignorId(e.target.value ? Number(e.target.value) : null)}
                  >
                    <option value="">None (remove consignor)</option>
                    {consignors.map(c => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-xs text-vs-text-2 mb-1 block">Agreed price</label>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-vs-muted text-xs">$</span>
                      <input
                        className="input pl-6 text-xs"
                        type="number" min="0" step="0.01"
                        placeholder="0.00"
                        value={consignorAgreedPrice}
                        onChange={e => setConsignorAgreedPrice(e.target.value)}
                      />
                    </div>
                  </div>
                  <div>
                    <label className="text-xs text-vs-text-2 mb-1 block">Commission %</label>
                    <input
                      className="input text-xs"
                      type="number" min="0" max="100" step="0.1"
                      placeholder={consignors.find(c => c.id === selectedConsignorId)?.default_commission_pct?.toFixed(0) ?? "30"}
                      value={consignorCommissionPct}
                      onChange={e => setConsignorCommissionPct(e.target.value)}
                    />
                  </div>
                </div>
                <button
                  onClick={async () => {
                    if (consignorSaving) return;
                    setConsignorSaving(true);
                    try {
                      const updated = await api.assignConsignor(record.id, {
                        consignor_id: selectedConsignorId,
                        consignor_agreed_price: consignorAgreedPrice ? parseFloat(consignorAgreedPrice) : null,
                        consignor_commission_pct: consignorCommissionPct ? parseFloat(consignorCommissionPct) : null,
                      });
                      onSaved({ ...record, ...updated } as CatalogRecord);
                      setConsignorOpen(false);
                      toast.success(selectedConsignorId ? "Consignor assigned" : "Consignor removed");
                    } catch (e: unknown) {
                      toast.error(e instanceof Error ? e.message : "Save failed");
                    } finally { setConsignorSaving(false); }
                  }}
                  disabled={consignorSaving}
                  className="btn-primary text-xs px-3 py-1.5 disabled:opacity-40 flex items-center gap-1.5"
                >
                  {consignorSaving ? <Loader2 size={12} className="animate-spin" /> : null}
                  {consignorSaving ? "Saving…" : "Save consignor"}
                </button>
              </div>
            )}
          </div>
        )}

        {/* Find on Discogs — shown when record has no discogs_release_id */}
        {!isNew && discogsConnected && !record?.discogs_release_id && (
          <div className="px-6 pb-4 border-t border-vs-border pt-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-medium text-vs-text-2">Discogs Link</p>
                <p className="text-xs text-vs-muted mt-0.5">No Discogs release linked</p>
              </div>
              <button
                onClick={() => setFindDiscogsOpen((v) => !v)}
                className="text-xs px-3 py-1.5 rounded-lg border border-vs-accent/40 text-vs-accent hover:bg-vs-accent/10 transition-colors flex items-center gap-1.5"
              >
                <Search size={12} />
                Search Discogs
              </button>
            </div>
            {findDiscogsOpen && (
              <div className="mt-3 space-y-3">
                <div className="flex gap-2">
                  <input
                    className="input flex-1 text-xs"
                    placeholder="Artist"
                    value={findDiscogsArtist}
                    onChange={(e) => setFindDiscogsArtist(e.target.value)}
                  />
                  <input
                    className="input flex-1 text-xs"
                    placeholder="Title"
                    value={findDiscogsTitle}
                    onChange={(e) => setFindDiscogsTitle(e.target.value)}
                  />
                  <button
                    onClick={async () => {
                      if (findDiscogsSearching) return;
                      setFindDiscogsSearching(true);
                      setFindDiscogsMatches([]);
                      try {
                        const res = await api.catalogFindDiscogs(record.id, {
                          artist: findDiscogsArtist || undefined,
                          title: findDiscogsTitle || undefined,
                        });
                        setFindDiscogsMatches(res.matches);
                        if (res.matches.length === 0) toast.error("No matches found");
                      } catch (e: unknown) {
                        toast.error(e instanceof Error ? e.message : "Search failed");
                      } finally {
                        setFindDiscogsSearching(false);
                      }
                    }}
                    disabled={findDiscogsSearching || (!findDiscogsArtist && !findDiscogsTitle)}
                    className="btn-primary text-xs px-3 py-1.5 flex items-center gap-1 disabled:opacity-40"
                  >
                    {findDiscogsSearching ? <Loader2 size={12} className="animate-spin" /> : <Search size={12} />}
                    {findDiscogsSearching ? "" : "Search"}
                  </button>
                </div>
                {findDiscogsMatches.length > 0 && (
                  <div className="space-y-2 max-h-64 overflow-y-auto">
                    {findDiscogsMatches.map((m) => (
                      <div key={m.release_id} className="flex items-center gap-3 p-2 rounded-lg bg-vs-raised border border-vs-border hover:border-vs-accent/40 transition-colors">
                        {m.cover_image && (
                          <img src={m.cover_image} alt="" className="w-10 h-10 rounded object-cover flex-shrink-0" />
                        )}
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-medium text-vs-text truncate">{m.artist} – {m.title}</p>
                          <p className="text-2xs text-vs-muted truncate">
                            {[m.year, m.label, m.format, m.country].filter(Boolean).join(" · ")}
                          </p>
                        </div>
                        <button
                          onClick={async () => {
                            if (findDiscogsLinking !== null) return;
                            setFindDiscogsLinking(m.release_id);
                            try {
                              const updated = await api.catalogLinkDiscogs(record.id, m.release_id);
                              onSaved(updated);
                              toast.success("Linked to Discogs");
                              setFindDiscogsOpen(false);
                            } catch (e: unknown) {
                              toast.error(e instanceof Error ? e.message : "Link failed");
                            } finally {
                              setFindDiscogsLinking(null);
                            }
                          }}
                          disabled={findDiscogsLinking !== null}
                          className="text-xs px-2.5 py-1 rounded border border-vs-accent/40 text-vs-accent hover:bg-vs-accent/10 transition-colors disabled:opacity-40 flex-shrink-0"
                        >
                          {findDiscogsLinking === m.release_id ? <Loader2 size={11} className="animate-spin" /> : "Link"}
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Discogs marketplace listing */}
        {!isNew && discogsConnected && record?.discogs_release_id && (
          <div className="px-6 pb-4 border-t border-vs-border pt-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-medium text-vs-text-2">Discogs Marketplace</p>
                {listingId ? (
                  <p className="text-xs text-vs-success mt-0.5 flex items-center gap-1">
                    Listed for sale
                    <a
                      href={`https://www.discogs.com/sell/item/${listingId}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center text-vs-success hover:opacity-70"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <ExternalLink size={11} />
                    </a>
                  </p>
                ) : (
                  <p className="text-xs text-vs-muted mt-0.5">
                    {record.asking_price ? "Not listed" : "Set a price to list"}
                  </p>
                )}
              </div>
              <button
                onClick={async () => {
                  if (listing) return;
                  setListing(true);
                  try {
                    if (listingId) {
                      await api.discogsDelistRecord(record.id);
                      setListingId(null);
                      onSaved({ ...record, discogs_listing_id: null });
                      toast.success("Listing removed");
                    } else {
                      const res = await api.discogsListRecord(record.id);
                      setListingId(res.listing_id);
                      onSaved({ ...record, discogs_listing_id: res.listing_id });
                      toast.success("Listed on Discogs");
                    }
                  } catch (e: unknown) {
                    toast.error(e instanceof Error ? e.message : "Listing change failed");
                  }
                  finally { setListing(false); }
                }}
                disabled={listing || (!listingId && !record.asking_price)}
                className={`text-xs px-3 py-1.5 rounded-lg border transition-colors disabled:opacity-40 flex items-center gap-1.5 ${
                  listingId
                    ? "border-vs-border text-vs-text-2 hover:bg-vs-raised hover:text-vs-text"
                    : "border-vs-accent/40 text-vs-accent hover:bg-vs-accent/10"
                }`}
              >
                {listing ? <Loader2 size={12} className="animate-spin" /> : null}
                {!listing && (listingId ? "Remove listing" : "List for sale")}
              </button>
            </div>
          </div>
        )}

        {/* Record history */}
        {!isNew && (
          <div className="px-6 pb-6 border-t border-vs-border pt-4">
            <div className="flex items-center gap-1.5 mb-3">
              <Clock size={13} className="text-vs-muted" />
              <p className="text-xs font-medium text-vs-text-2">History</p>
            </div>
            {historyLoading ? (
              <p className="text-xs text-vs-muted">Loading…</p>
            ) : history.length === 0 ? (
              <p className="text-xs text-vs-muted">No history yet.</p>
            ) : (
              <div className="flex flex-col gap-3">
                {history.map((ev, i) => (
                  <div key={ev.id} className="flex items-start gap-3">
                    <div className="flex flex-col items-center flex-shrink-0">
                      <div className="w-2 h-2 rounded-full border-2 border-vs-accent bg-vs-card mt-1" />
                      {i < history.length - 1 && <div className="w-px flex-1 min-h-[12px] bg-vs-border mt-1" />}
                    </div>
                    <div className="min-w-0 pb-1">
                      <p className="text-xs font-medium text-vs-text">{HISTORY_LABEL[ev.event_type] ?? ev.event_type.replace(/_/g, " ")}</p>
                      {ev.detail && <p className="text-2xs text-vs-muted mt-0.5 leading-snug">{ev.detail}</p>}
                      <p className="text-2xs text-vs-muted/60 mt-0.5">{new Date(ev.created_at).toLocaleString()}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {error && <p className="px-6 pb-2 text-xs text-vs-danger">{error}</p>}

        <div className="sticky bottom-0 bg-vs-card border-t border-vs-border px-6 py-4 flex justify-end gap-2 rounded-b-2xl">
          <button onClick={onClose} className="btn-secondary">Cancel</button>
          {isNew && (
            <button onClick={saveAndAddAnother} disabled={saving} className="btn-secondary disabled:opacity-50">
              {saving ? "Saving…" : "Add & continue"}
            </button>
          )}
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
    </>
  );
}
