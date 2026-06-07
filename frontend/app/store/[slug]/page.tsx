"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams } from "next/navigation";
import {
  Search, X, ShoppingCart, Disc3, Send, Loader2, Music, ChevronDown, ChevronUp,
} from "lucide-react";
import { api, type PublicRecord, type PublicStore } from "@/lib/api";

const CONDITIONS = ["M", "NM", "VG+", "VG", "G"] as const;

function fmt(n: number) { return `$${n.toFixed(2)}`; }

function isPhone(s: string) { return /^[+\d\s\-().]{7,}$/.test(s.trim()); }

function buildShareLink(contact: string, items: PublicRecord[], storeName: string | null) {
  const lines = items.map(
    (r) => `• ${r.artist ?? "Unknown"} — ${r.title ?? "Untitled"} (${r.condition})${r.asking_price != null ? ` — ${fmt(r.asking_price)}` : ""}`
  );
  const total = items.reduce((s, r) => s + (r.asking_price ?? 0), 0);
  const msg = [
    `Hi${storeName ? ` ${storeName}` : ""}! I'd like to buy:`,
    "",
    ...lines,
    "",
    `Total: ${fmt(total)}`,
  ].join("\n");

  if (isPhone(contact)) {
    const phone = contact.replace(/\D/g, "");
    return `https://wa.me/${phone}?text=${encodeURIComponent(msg)}`;
  }
  return `mailto:${contact}?subject=${encodeURIComponent("Record order")}&body=${encodeURIComponent(msg)}`;
}

function RecordCard({ record, inCart, onToggle }: { record: PublicRecord; inCart: boolean; onToggle: () => void }) {
  return (
    <div className={`bg-vs-card border rounded-xl overflow-hidden transition-colors ${inCart ? "border-vs-accent" : "border-vs-border hover:border-vs-border-2"}`}>
      <div className="aspect-square bg-vs-raised relative">
        {record.cover_image_url ? (
          <img src={record.cover_image_url} alt={record.title ?? ""} className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <Music size={32} className="text-vs-muted" />
          </div>
        )}
        {inCart && (
          <div className="absolute top-2 right-2 w-6 h-6 rounded-full bg-vs-accent flex items-center justify-center">
            <span className="text-vs-bg text-xs font-bold">✓</span>
          </div>
        )}
      </div>
      <div className="p-3">
        <p className="text-xs text-vs-muted truncate">{record.artist || "Unknown artist"}</p>
        <p className="text-sm font-medium text-vs-text leading-snug truncate mt-0.5">{record.title || "Untitled"}</p>
        <div className="flex items-center justify-between mt-2">
          <div className="flex items-center gap-1.5">
            <span className="text-2xs px-1.5 py-0.5 rounded bg-vs-raised border border-vs-border text-vs-text-2 font-medium">{record.condition}</span>
            {record.format && <span className="text-2xs text-vs-muted">{record.format}</span>}
          </div>
          {record.asking_price != null && (
            <span className="text-sm font-medium text-vs-gold">{fmt(record.asking_price)}</span>
          )}
        </div>
        <button
          onClick={onToggle}
          className={`mt-2.5 w-full py-1.5 text-xs font-medium rounded-lg border transition-colors ${
            inCart
              ? "border-vs-danger/40 text-vs-danger hover:bg-vs-danger/10"
              : "border-vs-accent/40 text-vs-accent hover:bg-vs-accent/10"
          }`}
        >
          {inCart ? "Remove" : "Add to cart"}
        </button>
      </div>
    </div>
  );
}

export default function StorePage() {
  const params = useParams();
  const slug = params.slug as string;

  const [store, setStore] = useState<PublicStore | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  const [search, setSearch] = useState("");
  const [genreFilter, setGenreFilter] = useState("");
  const [formatFilter, setFormatFilter] = useState("");
  const [condFilter, setCondFilter] = useState("");
  const [maxPrice, setMaxPrice] = useState("");
  const [showFilters, setShowFilters] = useState(false);

  const [cart, setCart] = useState<PublicRecord[]>([]);
  const [cartOpen, setCartOpen] = useState(false);

  useEffect(() => {
    api.getPublicStore(slug)
      .then(setStore)
      .catch(() => setNotFound(true))
      .finally(() => setLoading(false));
  }, [slug]);

  const toggleCart = useCallback((record: PublicRecord) => {
    setCart((prev) =>
      prev.find((r) => r.id === record.id)
        ? prev.filter((r) => r.id !== record.id)
        : [...prev, record]
    );
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen bg-vs-bg flex items-center justify-center">
        <Loader2 size={32} className="animate-spin text-vs-muted" />
      </div>
    );
  }

  if (notFound || !store) {
    return (
      <div className="min-h-screen bg-vs-bg flex flex-col items-center justify-center gap-3 px-4 text-center">
        <Disc3 size={40} className="text-vs-muted" />
        <p className="text-lg font-medium text-vs-text">Store not found</p>
        <p className="text-sm text-vs-muted">This store doesn't exist or isn't public yet.</p>
      </div>
    );
  }

  // Derive filter options from records
  const genres = [...new Set(store.records.map((r) => r.genre).filter(Boolean) as string[])].sort();
  const formats = [...new Set(store.records.map((r) => r.format).filter(Boolean) as string[])].sort();

  const filtered = store.records.filter((r) => {
    if (search) {
      const q = search.toLowerCase();
      if (!`${r.artist} ${r.title}`.toLowerCase().includes(q)) return false;
    }
    if (genreFilter && r.genre !== genreFilter) return false;
    if (formatFilter && r.format !== formatFilter) return false;
    if (condFilter && r.condition !== condFilter) return false;
    if (maxPrice) {
      const max = parseFloat(maxPrice);
      if (!isNaN(max) && (r.asking_price == null || r.asking_price > max)) return false;
    }
    return true;
  });

  const cartTotal = cart.reduce((s, r) => s + (r.asking_price ?? 0), 0);
  const hasFilters = genreFilter || formatFilter || condFilter || maxPrice;

  return (
    <div className="min-h-screen bg-vs-bg text-vs-text">
      {/* Header */}
      <header className="border-b border-vs-border bg-vs-card sticky top-0 z-30">
        <div className="max-w-5xl mx-auto px-4 py-4 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-8 h-8 rounded-lg bg-vs-raised border border-vs-border-2 flex items-center justify-center flex-shrink-0">
              <Disc3 size={14} className="text-vs-accent" />
            </div>
            <h1 className="text-base font-medium truncate">{store.store_name ?? "Record Store"}</h1>
          </div>
          <button
            onClick={() => setCartOpen(true)}
            className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-vs-raised border border-vs-border hover:border-vs-accent text-sm transition-colors relative"
          >
            <ShoppingCart size={14} />
            Cart
            {cart.length > 0 && (
              <span className="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full bg-vs-accent text-vs-bg text-2xs flex items-center justify-center font-bold">
                {cart.length}
              </span>
            )}
          </button>
        </div>
      </header>

      <div className="max-w-5xl mx-auto px-4 py-6">
        {/* Store description */}
        {store.store_description && (
          <p className="text-sm text-vs-muted mb-5">{store.store_description}</p>
        )}

        {/* Search + filters */}
        <div className="flex flex-col gap-3 mb-5">
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-vs-muted" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search artist or title…"
                className="input pl-8 pr-8"
              />
              {search && (
                <button onClick={() => setSearch("")} className="absolute right-3 top-1/2 -translate-y-1/2 text-vs-muted hover:text-vs-text">
                  <X size={12} />
                </button>
              )}
            </div>
            <button
              onClick={() => setShowFilters(!showFilters)}
              className={`px-3 py-2 rounded-lg border text-sm flex items-center gap-1.5 transition-colors ${hasFilters ? "border-vs-accent text-vs-accent" : "border-vs-border text-vs-muted hover:text-vs-text"}`}
            >
              Filters
              {showFilters ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
              {hasFilters && <span className="w-1.5 h-1.5 rounded-full bg-vs-accent" />}
            </button>
          </div>

          {showFilters && (
            <div className="flex flex-wrap gap-2">
              {genres.length > 0 && (
                <select value={genreFilter} onChange={(e) => setGenreFilter(e.target.value)} className="input py-1.5 text-sm w-auto">
                  <option value="">All genres</option>
                  {genres.map((g) => <option key={g}>{g}</option>)}
                </select>
              )}
              {formats.length > 0 && (
                <select value={formatFilter} onChange={(e) => setFormatFilter(e.target.value)} className="input py-1.5 text-sm w-auto">
                  <option value="">All formats</option>
                  {formats.map((f) => <option key={f}>{f}</option>)}
                </select>
              )}
              <select value={condFilter} onChange={(e) => setCondFilter(e.target.value)} className="input py-1.5 text-sm w-auto">
                <option value="">Any condition</option>
                {CONDITIONS.map((c) => <option key={c}>{c}</option>)}
              </select>
              <div className="flex items-center gap-1">
                <span className="text-xs text-vs-muted">Max $</span>
                <input
                  type="number" min="0" value={maxPrice}
                  onChange={(e) => setMaxPrice(e.target.value)}
                  placeholder="—"
                  className="input py-1.5 w-20 text-sm"
                />
              </div>
              {hasFilters && (
                <button
                  onClick={() => { setGenreFilter(""); setFormatFilter(""); setCondFilter(""); setMaxPrice(""); }}
                  className="text-xs text-vs-muted hover:text-vs-text px-2"
                >
                  Clear filters
                </button>
              )}
            </div>
          )}
        </div>

        {/* Record count */}
        <p className="text-xs text-vs-muted mb-4">
          {filtered.length} record{filtered.length !== 1 ? "s" : ""}
          {filtered.length !== store.records.length && ` (${store.records.length} total)`}
        </p>

        {/* Grid */}
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center gap-3 py-20 text-center">
            <Disc3 size={36} className="text-vs-muted" />
            <p className="text-vs-muted text-sm">{search || hasFilters ? "No records match your filters." : "No records available right now."}</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
            {filtered.map((r) => (
              <RecordCard
                key={r.id}
                record={r}
                inCart={!!cart.find((c) => c.id === r.id)}
                onToggle={() => toggleCart(r)}
              />
            ))}
          </div>
        )}
      </div>

      {/* Cart drawer */}
      {cartOpen && (
        <div className="fixed inset-0 z-50 flex justify-end">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setCartOpen(false)} />
          <div className="relative bg-vs-card border-l border-vs-border w-full max-w-sm flex flex-col h-full">
            <div className="flex items-center justify-between px-5 py-4 border-b border-vs-border">
              <h2 className="text-base font-medium">Your cart ({cart.length})</h2>
              <button onClick={() => setCartOpen(false)} className="text-vs-muted hover:text-vs-text">
                <X size={16} />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto px-5 py-4 flex flex-col gap-3">
              {cart.length === 0 ? (
                <p className="text-sm text-vs-muted text-center py-8">Cart is empty</p>
              ) : (
                cart.map((r) => (
                  <div key={r.id} className="flex items-center gap-3">
                    <div className="w-10 h-10 flex-shrink-0 rounded-lg overflow-hidden bg-vs-raised">
                      {r.cover_image_url
                        ? <img src={r.cover_image_url} alt="" className="w-full h-full object-cover" />
                        : <div className="w-full h-full flex items-center justify-center"><Music size={16} className="text-vs-muted" /></div>
                      }
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs text-vs-muted truncate">{r.artist}</p>
                      <p className="text-sm font-medium truncate">{r.title}</p>
                    </div>
                    <div className="text-right flex-shrink-0">
                      {r.asking_price != null && <p className="text-sm font-medium text-vs-gold">{fmt(r.asking_price)}</p>}
                      <button onClick={() => toggleCart(r)} className="text-2xs text-vs-muted hover:text-vs-danger">Remove</button>
                    </div>
                  </div>
                ))
              )}
            </div>

            {cart.length > 0 && (
              <div className="border-t border-vs-border px-5 py-4 flex flex-col gap-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-vs-text-2">Total</span>
                  <span className="text-lg font-medium text-vs-gold">{fmt(cartTotal)}</span>
                </div>
                {store.store_contact ? (
                  <a
                    href={buildShareLink(store.store_contact, cart, store.store_name)}
                    target={isPhone(store.store_contact) ? "_blank" : undefined}
                    rel="noopener noreferrer"
                    className="btn-primary flex items-center justify-center gap-2 text-sm"
                  >
                    <Send size={14} />
                    {isPhone(store.store_contact) ? "Send via WhatsApp" : "Send via email"}
                  </a>
                ) : (
                  <button
                    onClick={() => {
                      const lines = cart.map((r) => `${r.artist} — ${r.title} (${r.condition})${r.asking_price != null ? ` — ${fmt(r.asking_price)}` : ""}`).join("\n");
                      navigator.clipboard.writeText(`Hi! I'd like to buy:\n\n${lines}\n\nTotal: ${fmt(cartTotal)}`);
                    }}
                    className="btn-secondary flex items-center justify-center gap-2 text-sm"
                  >
                    Copy cart list
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
