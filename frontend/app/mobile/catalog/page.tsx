"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Search, X, ChevronDown, Loader2, Check, DollarSign, ExternalLink, Disc3, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { api, getToken, isStore, isCollector, type CatalogRecord, type Lot, type User } from "@/lib/api";
import { CoverThumb } from "@/components/CoverThumb";

const CONDITIONS = ["M", "NM", "VG+", "VG", "G"] as const;
const CONDITION_COLOR: Record<string, string> = {
  M: "bg-vs-success/15 text-vs-success",
  NM: "bg-vs-success/10 text-vs-success",
  "VG+": "bg-vs-gold/15 text-vs-gold",
  VG: "bg-vs-gold/10 text-vs-gold",
  G: "bg-vs-danger/10 text-vs-danger",
};

const REMOVE_REASONS = [
  { value: "sold",    label: "Sold privately" },
  { value: "traded",  label: "Traded" },
  { value: "gift",    label: "Gift" },
  { value: "lost",    label: "Lost" },
  { value: "broken",  label: "Broken" },
  { value: "other",   label: "Other" },
] as const;

export default function MobileCatalogPage() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [records, setRecords] = useState<CatalogRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<CatalogRecord | null>(null);
  const [lots, setLots] = useState<Lot[]>([]);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [editPrice, setEditPrice] = useState("");
  const [editCondition, setEditCondition] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [selling, setSelling] = useState(false);
  const [sellPrice, setSellPrice] = useState("");
  const [showSell, setShowSell] = useState(false);
  const [discogsConnected, setDiscogsConnected] = useState(false);
  const [listingId, setListingId] = useState<number | null>(null);
  const [listing, setListing] = useState(false);
  // Collector remove flow
  const [showRemove, setShowRemove] = useState(false);
  const [removeReason, setRemoveReason] = useState<string>("sold");
  const [removeNote, setRemoveNote] = useState("");
  const [removing, setRemoving] = useState(false);

  useEffect(() => {
    if (!getToken()) { router.replace("/login"); return; }
    api.listLots().then(setLots).catch(() => {});
    api.me().then((u) => {
      setUser(u);
      setDiscogsConnected(!!u.discogs_username);
    }).catch(() => {});
    loadRecords(1, "");
  }, [router]);

  const storeMode = isStore(user);
  const pureCollector = isCollector(user) && !storeMode;

  async function loadRecords(p: number, q: string) {
    if (p === 1) setLoading(true); else setLoadingMore(true);
    try {
      const data = await api.listCatalog({ page: p, per_page: 20, status: "in_stock", search: q || undefined });
      if (p === 1) setRecords(data.records); else setRecords((r) => [...r, ...data.records]);
      setHasMore(data.records.length === 20);
      setPage(p);
    } catch { /* ignore */ }
    finally { setLoading(false); setLoadingMore(false); }
  }

  function handleSearch(v: string) {
    setSearch(v);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => loadRecords(1, v), 350);
  }

  function openRecord(r: CatalogRecord) {
    setSelected(r);
    setEditPrice(r.asking_price != null ? String(r.asking_price) : "");
    setEditCondition(r.condition);
    setSaved(false);
    setShowSell(false);
    setShowRemove(false);
    setRemoveReason("sold");
    setRemoveNote("");
    setListingId(r.discogs_listing_id ?? null);
    setSellPrice(r.asking_price != null ? String(r.asking_price) : "");
  }

  function closeSheet() {
    setSelected(null);
    setShowSell(false);
    setShowRemove(false);
  }

  async function saveRecord() {
    if (!selected) return;
    setSaving(true);
    try {
      const raw = editPrice === "" ? null : parseFloat(editPrice);
      const price = raw !== null && isNaN(raw) ? null : raw;
      const updated = await api.updateRecord(selected.id, {
        asking_price: price ?? undefined,
        condition: editCondition,
      });
      setRecords((rs) => rs.map((r) => r.id === updated.id ? updated : r));
      setSelected(updated);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
      toast.success("Saved");
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Save failed");
    }
    finally { setSaving(false); }
  }

  async function sellRecord() {
    if (!selected) return;
    const price = parseFloat(sellPrice);
    if (isNaN(price) || price <= 0) return;
    setSelling(true);
    try {
      const updated = await api.sellRecord(selected.id, price);
      setRecords((rs) => rs.filter((r) => r.id !== updated.id));
      closeSheet();
      toast.success(`Sold for $${price.toFixed(2)}`);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Sale failed");
    }
    finally { setSelling(false); }
  }

  async function removeRecord() {
    if (!selected || !removeReason) return;
    setRemoving(true);
    try {
      await api.catalogRemoveRecord(selected.id, { reason: removeReason, note: removeNote || undefined });
      setRecords((rs) => rs.filter((r) => r.id !== selected.id));
      closeSheet();
      toast.success("Removed from collection");
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Remove failed");
    }
    finally { setRemoving(false); }
  }

  async function toggleListing() {
    if (!selected) return;
    setListing(true);
    try {
      if (listingId) {
        await api.discogsDelistRecord(selected.id);
        setListingId(null);
        setRecords((rs) => rs.map((r) => r.id === selected.id ? { ...r, discogs_listing_id: null } : r));
        toast.success("Listing removed");
      } else {
        const res = await api.discogsListRecord(selected.id);
        setListingId(res.listing_id);
        setRecords((rs) => rs.map((r) => r.id === selected.id ? { ...r, discogs_listing_id: res.listing_id } : r));
        toast.success("Listed on Discogs");
      }
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Listing change failed");
    }
    finally { setListing(false); }
  }

  return (
    <div className="min-h-full">
      {/* Header */}
      <div className="px-4 pt-safe pb-3">
        <h1 className="text-xl font-bold mb-4">{pureCollector ? "Collection" : "Catalog"}</h1>
        <div className="relative">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-vs-muted pointer-events-none" />
          <input
            className="input pl-9 pr-9 w-full"
            placeholder="Search records…"
            value={search}
            onChange={(e) => handleSearch(e.target.value)}
          />
          {search && (
            <button onClick={() => handleSearch("")} className="absolute right-3 top-1/2 -translate-y-1/2 text-vs-muted">
              <X size={14} />
            </button>
          )}
        </div>
      </div>

      {/* List */}
      <div className="px-4">
        {loading ? (
          <div className="flex justify-center py-16">
            <Loader2 size={28} className="animate-spin text-vs-muted" />
          </div>
        ) : records.length === 0 ? (
          <div className="flex flex-col items-center gap-4 py-16 text-center">
            <Disc3 size={40} className="text-vs-muted opacity-40" />
            <div>
              <p className="text-sm font-medium text-vs-text-2">
                {pureCollector ? "Your collection is empty" : "No records found"}
              </p>
              {pureCollector && !search && (
                <p className="text-xs text-vs-muted mt-1">Scan a record to get started</p>
              )}
            </div>
            {pureCollector && !search && (
              <a href="/mobile/scan"
                className="mt-1 px-5 py-2.5 rounded-xl bg-vs-accent text-white text-sm font-semibold active:opacity-80 transition-opacity"
              >
                Scan first record
              </a>
            )}
          </div>
        ) : (
          <>
            <div className="flex flex-col gap-2 pb-4">
              {records.map((r) => (
                <button key={r.id} onClick={() => openRecord(r)}
                  className="flex items-center gap-3 px-3 py-3 rounded-xl bg-vs-raised border border-vs-border text-left active:opacity-70 transition-opacity w-full"
                >
                  <CoverThumb url={r.cover_image_url} />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium truncate">{r.artist ?? "Unknown"}</p>
                    <p className="text-xs text-vs-muted truncate">{r.title ?? "—"}</p>
                    <div className="flex items-center gap-1.5 mt-1">
                      <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${CONDITION_COLOR[r.condition] ?? "bg-vs-border text-vs-text-2"}`}>
                        {r.condition}
                      </span>
                      {r.format && <span className="text-[10px] text-vs-muted">{r.format}</span>}
                      {!pureCollector && discogsConnected && r.discogs_listing_id && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-vs-accent/15 text-vs-accent border border-vs-accent/20 font-medium">
                          Listed
                        </span>
                      )}
                    </div>
                  </div>
                  {r.asking_price != null ? (
                    <p className="text-sm font-semibold text-vs-gold flex-shrink-0">${Number(r.asking_price).toFixed(2)}</p>
                  ) : (
                    <p className="text-xs text-vs-muted flex-shrink-0">—</p>
                  )}
                </button>
              ))}
            </div>

            {hasMore && (
              <button
                onClick={() => loadRecords(page + 1, search)}
                disabled={loadingMore}
                className="w-full py-3 text-xs text-vs-muted flex items-center justify-center gap-2 mb-4"
              >
                {loadingMore ? <Loader2 size={14} className="animate-spin" /> : "Load more"}
              </button>
            )}
          </>
        )}
      </div>

      {/* Bottom sheet — record detail */}
      {selected && (
        <div className="fixed inset-0 z-50 flex flex-col justify-end">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={closeSheet} />
          <div className="relative bg-vs-card rounded-t-3xl border-t border-vs-border overflow-y-auto max-h-[85vh]"
               style={{ paddingBottom: "env(safe-area-inset-bottom)" }}>
            <div className="flex justify-center pt-3 pb-1">
              <div className="w-10 h-1 rounded-full bg-vs-border" />
            </div>

            <div className="px-5 pb-2">
              {/* Record info */}
              <div className="flex items-start gap-3 mb-5">
                <CoverThumb url={selected.cover_image_url} large />
                <div className="min-w-0 flex-1">
                  <p className="font-semibold text-sm leading-tight truncate">{selected.artist ?? "Unknown"}</p>
                  <p className="text-xs text-vs-muted truncate mt-0.5">{selected.title ?? "—"}</p>
                  {selected.year && <p className="text-xs text-vs-muted/60 mt-0.5">{selected.year}{selected.label ? ` · ${selected.label}` : ""}</p>}
                </div>
              </div>

              {/* Price edit */}
              <div className="mb-4">
                <p className="text-xs text-vs-muted mb-1.5">{pureCollector ? "Estimated value" : "Asking price"}</p>
                <div className="flex items-center gap-2">
                  <div className="relative flex-1">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-vs-muted text-sm">$</span>
                    <input
                      type="number" min="0" step="0.01"
                      value={editPrice}
                      onChange={(e) => setEditPrice(e.target.value)}
                      placeholder="0.00"
                      className="input pl-7 text-lg font-semibold w-full"
                    />
                  </div>
                </div>
              </div>

              {/* Condition */}
              <div className="mb-5">
                <p className="text-xs text-vs-muted mb-1.5">Condition</p>
                <div className="flex gap-2">
                  {CONDITIONS.map((c) => (
                    <button key={c} onClick={() => setEditCondition(c)}
                      className={`flex-1 py-2.5 rounded-xl text-xs font-semibold border transition-colors ${
                        editCondition === c
                          ? "bg-vs-accent text-white border-vs-accent"
                          : "border-vs-border text-vs-text-2 bg-vs-raised"
                      }`}
                    >
                      {c}
                    </button>
                  ))}
                </div>
              </div>

              {/* Save button */}
              <button onClick={saveRecord} disabled={saving}
                className="w-full py-3.5 rounded-xl bg-vs-accent text-white text-sm font-semibold mb-3 flex items-center justify-center gap-2 disabled:opacity-50 active:opacity-80 transition-opacity"
              >
                {saving ? <Loader2 size={15} className="animate-spin" /> : saved ? <><Check size={15} /> Saved</> : "Save changes"}
              </button>

              {/* Sell (store) or Remove (collector) */}
              {pureCollector ? (
                !showRemove ? (
                  <button onClick={() => setShowRemove(true)}
                    className="w-full py-3.5 rounded-xl border border-vs-danger/40 text-vs-danger text-sm font-semibold flex items-center justify-center gap-2 active:opacity-70 transition-opacity mb-3"
                  >
                    <Trash2 size={15} />
                    Remove from collection
                  </button>
                ) : (
                  <div className="border border-vs-danger/30 rounded-xl p-4 mb-3">
                    <p className="text-xs text-vs-muted mb-2">Reason</p>
                    <div className="flex flex-wrap gap-1.5 mb-3">
                      {REMOVE_REASONS.map(({ value, label }) => (
                        <button
                          key={value}
                          onClick={() => setRemoveReason(value)}
                          className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                            removeReason === value
                              ? "bg-vs-danger text-white border-vs-danger"
                              : "border-vs-border text-vs-text-2 bg-vs-raised"
                          }`}
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                    <input
                      type="text"
                      value={removeNote}
                      onChange={(e) => setRemoveNote(e.target.value)}
                      placeholder="Note (optional)"
                      className="input w-full text-sm mb-3"
                    />
                    <div className="flex gap-2">
                      <button onClick={() => setShowRemove(false)} className="flex-1 py-2.5 rounded-xl border border-vs-border text-vs-text-2 text-sm font-medium">
                        Cancel
                      </button>
                      <button onClick={removeRecord} disabled={removing}
                        className="flex-1 py-2.5 rounded-xl bg-vs-danger text-white text-sm font-semibold flex items-center justify-center gap-1.5 disabled:opacity-50 active:opacity-80 transition-opacity"
                      >
                        {removing ? <Loader2 size={14} className="animate-spin" /> : "Confirm remove"}
                      </button>
                    </div>
                  </div>
                )
              ) : (
                !showSell ? (
                  <button onClick={() => setShowSell(true)}
                    className="w-full py-3.5 rounded-xl border border-vs-success/40 text-vs-success text-sm font-semibold flex items-center justify-center gap-2 active:opacity-70 transition-opacity mb-3"
                  >
                    <DollarSign size={15} />
                    Sell this record
                  </button>
                ) : (
                  <div className="border border-vs-success/30 rounded-xl p-4 mb-3">
                    <p className="text-xs text-vs-muted mb-2">Sold price</p>
                    <div className="flex gap-2">
                      <div className="relative flex-1">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-vs-muted text-sm">$</span>
                        <input
                          type="number" min="0" step="0.01"
                          value={sellPrice}
                          onChange={(e) => setSellPrice(e.target.value)}
                          className="input pl-7 w-full"
                          placeholder="0.00"
                          autoFocus
                        />
                      </div>
                      <button onClick={sellRecord} disabled={selling}
                        className="px-4 rounded-xl bg-vs-success text-white text-sm font-semibold flex items-center gap-1.5 disabled:opacity-50 active:opacity-80 transition-opacity"
                      >
                        {selling ? <Loader2 size={14} className="animate-spin" /> : "Confirm"}
                      </button>
                    </div>
                    <button onClick={() => setShowSell(false)} className="mt-2 text-xs text-vs-muted w-full text-center">Cancel</button>
                  </div>
                )
              )}

              {/* Discogs listing — store only */}
              {!pureCollector && discogsConnected && selected.discogs_release_id && (
                <div className="border border-vs-border rounded-xl p-4 mb-2">
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
                          {selected.asking_price ? "Not listed" : "Set a price to list"}
                        </p>
                      )}
                    </div>
                    <button
                      onClick={toggleListing}
                      disabled={listing || (!listingId && !selected.asking_price)}
                      className={`text-xs px-3 py-1.5 rounded-lg border transition-colors disabled:opacity-40 flex items-center gap-1.5 ${
                        listingId
                          ? "border-vs-border text-vs-text-2 hover:bg-vs-raised hover:text-vs-text"
                          : "border-vs-accent/40 text-vs-accent hover:bg-vs-accent/10"
                      }`}
                    >
                      {listing && <Loader2 size={12} className="animate-spin" />}
                      {!listing && (listingId ? "Remove listing" : "List for sale")}
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
