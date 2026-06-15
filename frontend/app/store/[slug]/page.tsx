"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams } from "next/navigation";
import {
  Search, X, ShoppingCart, Disc3, Loader2, Music,
  Instagram, MessageCircle, Plus, Check, SlidersHorizontal,
  MapPin, Globe, Facebook, ArrowUpDown, ExternalLink,
} from "lucide-react";
import { api, type PublicRecord, type PublicStore } from "@/lib/api";

const CONDITIONS = ["M", "NM", "VG+", "VG", "G"] as const;
type SortKey = "newest" | "price_asc" | "price_desc" | "az";

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
    return `https://wa.me/${contact.replace(/\D/g, "")}?text=${encodeURIComponent(msg)}`;
  }
  return `mailto:${contact}?subject=${encodeURIComponent("Record order")}&body=${encodeURIComponent(msg)}`;
}

function sortRecords(records: PublicRecord[], sort: SortKey): PublicRecord[] {
  const copy = [...records];
  switch (sort) {
    case "price_asc":
      return copy.sort((a, b) => (a.asking_price ?? Infinity) - (b.asking_price ?? Infinity));
    case "price_desc":
      return copy.sort((a, b) => (b.asking_price ?? -Infinity) - (a.asking_price ?? -Infinity));
    case "az":
      return copy.sort((a, b) => (a.artist ?? "").localeCompare(b.artist ?? ""));
    default:
      return copy; // newest = server order
  }
}

function RecordCard({
  record, inCart, onToggle, accent,
}: {
  record: PublicRecord; inCart: boolean; onToggle: () => void; accent: string;
}) {
  return (
    <div
      className={`group flex flex-col bg-vs-card border rounded-xl overflow-hidden transition-all duration-200 ${
        inCart ? "shadow-lg" : "border-vs-border hover:border-vs-border-2"
      }`}
      style={inCart ? { borderColor: accent } : undefined}
    >
      {/* Cover */}
      <div className="aspect-square bg-vs-raised relative overflow-hidden">
        {record.cover_image_url ? (
          <img
            src={record.cover_image_url}
            alt={record.title ?? ""}
            className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <Music size={40} className="text-vs-border" />
          </div>
        )}
        {inCart && (
          <div className="absolute inset-0 flex items-center justify-center" style={{ background: `${accent}33` }}>
            <div className="w-10 h-10 rounded-full flex items-center justify-center" style={{ background: accent }}>
              <Check size={18} className="text-white" strokeWidth={3} />
            </div>
          </div>
        )}
        {(record.styles || record.genre) && (
          <div className="absolute top-2 left-2 flex flex-wrap gap-1 max-w-[85%]">
            {(record.styles ? record.styles.split(", ").slice(0, 2) : [record.genre!]).map((tag) => (
              <span key={tag} className="px-2 py-0.5 rounded-full text-2xs font-medium bg-black/65 text-white/85 backdrop-blur-sm whitespace-nowrap">
                {tag}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Info */}
      <div className="p-3 flex flex-col flex-1">
        <p className="text-sm font-semibold text-vs-text leading-snug line-clamp-2 mb-0.5">{record.title || "Untitled"}</p>
        <p className="text-xs text-vs-muted truncate mb-1">{record.artist || "Unknown artist"}</p>
        {(record.label || record.year) && (
          <p className="text-2xs text-vs-muted/60 truncate mb-2">
            {[record.label, record.year].filter(Boolean).join(" · ")}
          </p>
        )}

        <div className="flex items-center justify-between mt-auto mb-2.5">
          <div className="flex items-center gap-1.5">
            <span className="text-2xs px-1.5 py-0.5 rounded bg-vs-raised border border-vs-border text-vs-text-2 font-medium">
              {record.condition}
            </span>
            {record.format && (
              <span className="text-2xs text-vs-muted">{record.format}</span>
            )}
          </div>
          {record.asking_price != null && (
            <span className="text-base font-bold text-vs-gold">{fmt(record.asking_price)}</span>
          )}
        </div>

        <button
          onClick={onToggle}
          className="w-full py-2 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition-all border"
          style={inCart
            ? { background: `${accent}1a`, borderColor: `${accent}66`, color: accent }
            : undefined
          }
        >
          {inCart
            ? <><Check size={12} /> In cart</>
            : <><Plus size={12} /> Add to cart</>
          }
        </button>
      </div>
    </div>
  );
}

function FilterSection({ label, options, value, onChange }: {
  label: string;
  options: string[];
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="mb-5">
      <p className="text-2xs font-bold uppercase tracking-widest text-vs-muted mb-2">{label}</p>
      <ul className="space-y-0.5">
        <li>
          <button
            onClick={() => onChange("")}
            className={`w-full text-left text-xs px-2 py-1.5 rounded-lg transition-colors ${
              value === "" ? "bg-vs-raised text-vs-text font-medium" : "text-vs-muted hover:text-vs-text hover:bg-vs-raised/50"
            }`}
          >
            All
          </button>
        </li>
        {options.map((o) => (
          <li key={o}>
            <button
              onClick={() => onChange(value === o ? "" : o)}
              className={`w-full text-left text-xs px-2 py-1.5 rounded-lg transition-colors ${
                value === o ? "bg-vs-raised text-vs-text font-medium" : "text-vs-muted hover:text-vs-text hover:bg-vs-raised/50"
              }`}
            >
              {o}
            </button>
          </li>
        ))}
      </ul>
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
  const [sort, setSort] = useState<SortKey>("newest");
  const [sidebarOpen, setSidebarOpen] = useState(false);

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
        <p className="text-sm text-vs-muted">This store doesn&apos;t exist or isn&apos;t public yet.</p>
      </div>
    );
  }

  const accent = store.store_accent_color ?? "#a855f7";

  // Derive style tags: prefer specific styles over broad genre
  const styleOptions = [...new Set(
    store.records.flatMap((r) =>
      r.styles ? r.styles.split(", ").map((s) => s.trim()) : r.genre ? [r.genre] : []
    )
  )].sort();
  const formats = [...new Set(store.records.map((r) => r.format).filter(Boolean) as string[])].sort();

  const filtered = sortRecords(
    store.records.filter((r) => {
      if (search) {
        const q = search.toLowerCase();
        if (!`${r.artist} ${r.title} ${r.label ?? ""}`.toLowerCase().includes(q)) return false;
      }
      if (genreFilter) {
        const recordStyles = r.styles ? r.styles.split(", ").map((s) => s.trim()) : r.genre ? [r.genre] : [];
        if (!recordStyles.includes(genreFilter)) return false;
      }
      if (formatFilter && r.format !== formatFilter) return false;
      if (condFilter && r.condition !== condFilter) return false;
      if (maxPrice) {
        const max = parseFloat(maxPrice);
        if (!isNaN(max) && (r.asking_price == null || r.asking_price > max)) return false;
      }
      return true;
    }),
    sort
  );

  const cartTotal = cart.reduce((s, r) => s + (r.asking_price ?? 0), 0);
  const hasFilters = genreFilter || formatFilter || condFilter || maxPrice;

  const sidebar = (
    <div className="flex flex-col gap-0">
      {styleOptions.length > 0 && (
        <FilterSection label="Genre / Style" options={styleOptions} value={genreFilter} onChange={setGenreFilter} />
      )}
      {formats.length > 0 && (
        <FilterSection label="Format" options={formats} value={formatFilter} onChange={setFormatFilter} />
      )}
      <FilterSection label="Condition" options={[...CONDITIONS]} value={condFilter} onChange={setCondFilter} />
      <div>
        <p className="text-2xs font-bold uppercase tracking-widest text-vs-muted mb-2">Max price</p>
        <div className="flex items-center gap-1">
          <span className="text-xs text-vs-muted">$</span>
          <input
            type="number" min="0" value={maxPrice}
            onChange={(e) => setMaxPrice(e.target.value)}
            placeholder="Any"
            className="input py-1.5 w-full text-xs"
          />
        </div>
      </div>
      {hasFilters && (
        <button
          onClick={() => { setGenreFilter(""); setFormatFilter(""); setCondFilter(""); setMaxPrice(""); }}
          className="mt-4 text-xs text-vs-muted hover:text-vs-danger transition-colors flex items-center gap-1"
        >
          <X size={11} /> Clear all filters
        </button>
      )}
    </div>
  );

  return (
    <div className="min-h-screen bg-vs-bg text-vs-text flex flex-col">
      {/* Header */}
      <header className="border-b border-vs-border bg-vs-card sticky top-0 z-30">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-4 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <div
              className="w-9 h-9 rounded-lg border overflow-hidden flex items-center justify-center flex-shrink-0"
              style={{ background: `${accent}1a`, borderColor: `${accent}33` }}
            >
              {store.store_logo_url ? (
                <img src={store.store_logo_url} alt="" className="w-full h-full object-cover" />
              ) : (
                <Disc3 size={16} style={{ color: accent }} />
              )}
            </div>
            <div className="min-w-0">
              <h1 className="text-base font-semibold truncate">{store.store_name ?? "Record Store"}</h1>
              <div className="flex items-center gap-3 flex-wrap">
                {store.store_location && (
                  <span className="flex items-center gap-1 text-2xs text-vs-muted">
                    <MapPin size={10} />{store.store_location}
                  </span>
                )}
                {store.store_instagram && (
                  <a
                    href={`https://instagram.com/${store.store_instagram}`}
                    target="_blank" rel="noopener noreferrer"
                    className="flex items-center gap-1 text-2xs text-vs-muted hover:text-vs-text transition-colors"
                  >
                    <Instagram size={10} />@{store.store_instagram}
                  </a>
                )}
                {store.store_facebook && (
                  <a
                    href={`https://facebook.com/${store.store_facebook}`}
                    target="_blank" rel="noopener noreferrer"
                    className="flex items-center gap-1 text-2xs text-vs-muted hover:text-vs-text transition-colors"
                  >
                    <Facebook size={10} />{store.store_facebook}
                  </a>
                )}
                {store.store_website && (
                  <a
                    href={store.store_website}
                    target="_blank" rel="noopener noreferrer"
                    className="flex items-center gap-1 text-2xs text-vs-muted hover:text-vs-text transition-colors"
                  >
                    <Globe size={10} />Website
                    <ExternalLink size={9} />
                  </a>
                )}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {store.store_contact && isPhone(store.store_contact) && (
              <a
                href={`https://wa.me/${store.store_contact.replace(/\D/g, "")}`}
                target="_blank" rel="noopener noreferrer"
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#25D366]/10 border border-[#25D366]/30 text-[#25D366] text-sm transition-colors hover:bg-[#25D366]/20"
              >
                <MessageCircle size={14} />
                <span className="hidden sm:inline text-xs font-medium">WhatsApp</span>
              </a>
            )}
            <button
              onClick={() => setCartOpen(true)}
              className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-vs-raised border border-vs-border hover:border-vs-border-2 text-sm transition-colors relative"
            >
              <ShoppingCart size={14} />
              <span className="hidden sm:inline text-xs">Cart</span>
              {cart.length > 0 && (
                <span
                  className="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full text-white text-2xs flex items-center justify-center font-bold"
                  style={{ background: accent }}
                >
                  {cart.length}
                </span>
              )}
            </button>
          </div>
        </div>
      </header>

      {/* Info banner */}
      {store.store_info_banner && (
        <div className="border-b border-vs-border px-4 py-2 text-center" style={{ background: `${accent}0d` }}>
          <p className="text-xs text-vs-text-2">{store.store_info_banner}</p>
        </div>
      )}

      {/* Store description */}
      {store.store_description && (
        <div className="max-w-7xl mx-auto px-4 sm:px-6 pt-5">
          <p className="text-sm text-vs-muted">{store.store_description}</p>
        </div>
      )}

      {/* Search + sort bar */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 pt-5 pb-4">
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-vs-muted" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search artist, title, label…"
              className="input pl-9 pr-8"
            />
            {search && (
              <button onClick={() => setSearch("")} className="absolute right-3 top-1/2 -translate-y-1/2 text-vs-muted hover:text-vs-text">
                <X size={12} />
              </button>
            )}
          </div>

          {/* Sort */}
          <div className="relative">
            <ArrowUpDown size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-vs-muted pointer-events-none" />
            <select
              value={sort}
              onChange={(e) => setSort(e.target.value as SortKey)}
              className="input pl-8 pr-2 text-xs appearance-none cursor-pointer"
            >
              <option value="newest">Newest</option>
              <option value="price_asc">Price ↑</option>
              <option value="price_desc">Price ↓</option>
              <option value="az">A–Z</option>
            </select>
          </div>

          {/* Mobile filter toggle */}
          <button
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className={`sm:hidden px-3 py-2 rounded-lg border text-sm flex items-center gap-1.5 transition-colors ${hasFilters ? "text-vs-text" : "border-vs-border text-vs-muted"}`}
            style={hasFilters ? { borderColor: accent, color: accent } : undefined}
          >
            <SlidersHorizontal size={14} />
            {hasFilters && <span className="w-1.5 h-1.5 rounded-full" style={{ background: accent }} />}
          </button>
        </div>

        {/* Mobile filter drawer */}
        {sidebarOpen && (
          <div className="sm:hidden mt-3 p-4 bg-vs-card border border-vs-border rounded-xl">
            {sidebar}
          </div>
        )}
      </div>

      {/* Body: sidebar + grid */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 pb-16 flex gap-6 flex-1">
        {/* Sidebar — desktop only */}
        <aside className="hidden sm:block w-44 flex-shrink-0 sticky top-24 self-start">
          {sidebar}
        </aside>

        {/* Main grid */}
        <div className="flex-1 min-w-0">
          <p className="text-xs text-vs-muted mb-4">
            {filtered.length} record{filtered.length !== 1 ? "s" : ""}
            {filtered.length !== store.records.length && ` of ${store.records.length}`}
          </p>

          {filtered.length === 0 ? (
            <div className="flex flex-col items-center gap-3 py-24 text-center">
              <Disc3 size={40} className="text-vs-muted" />
              <p className="text-vs-muted text-sm">
                {search || hasFilters ? "No records match your filters." : "No records available right now."}
              </p>
              {hasFilters && (
                <button
                  onClick={() => { setGenreFilter(""); setFormatFilter(""); setCondFilter(""); setMaxPrice(""); setSearch(""); }}
                  className="text-xs hover:underline"
                  style={{ color: accent }}
                >
                  Clear filters
                </button>
              )}
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
              {filtered.map((r) => (
                <RecordCard
                  key={r.id}
                  record={r}
                  inCart={!!cart.find((c) => c.id === r.id)}
                  onToggle={() => toggleCart(r)}
                  accent={accent}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Footer */}
      <footer className="border-t border-vs-border py-4 mt-auto">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 flex items-center justify-center gap-2">
          <Disc3 size={13} className="text-vs-muted" />
          <p className="text-xs text-vs-muted">
            Powered by{" "}
            <a
              href="https://vinylscan.app"
              target="_blank"
              rel="noopener noreferrer"
              className="font-medium hover:text-vs-text transition-colors"
            >
              VinylScan
            </a>
          </p>
        </div>
      </footer>

      {/* Cart drawer */}
      {cartOpen && (
        <div className="fixed inset-0 z-50 flex justify-end">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setCartOpen(false)} />
          <div className="relative bg-vs-card border-l border-vs-border w-full max-w-sm flex flex-col h-full">
            <div className="flex items-center justify-between px-5 py-4 border-b border-vs-border">
              <h2 className="text-base font-semibold">Cart ({cart.length})</h2>
              <button onClick={() => setCartOpen(false)} className="text-vs-muted hover:text-vs-text">
                <X size={16} />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto px-5 py-4 flex flex-col gap-3">
              {cart.length === 0 ? (
                <div className="flex flex-col items-center gap-3 py-12 text-center">
                  <ShoppingCart size={32} className="text-vs-muted" />
                  <p className="text-sm text-vs-muted">Your cart is empty</p>
                  <p className="text-xs text-vs-muted/60">Browse the records and add what you want</p>
                </div>
              ) : (
                cart.map((r) => (
                  <div key={r.id} className="flex items-center gap-3 py-1">
                    <div className="w-12 h-12 flex-shrink-0 rounded-lg overflow-hidden bg-vs-raised">
                      {r.cover_image_url
                        ? <img src={r.cover_image_url} alt="" loading="lazy" className="w-full h-full object-cover" />
                        : <div className="w-full h-full flex items-center justify-center"><Music size={18} className="text-vs-muted" /></div>
                      }
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs text-vs-muted truncate">{r.artist}</p>
                      <p className="text-sm font-medium truncate">{r.title}</p>
                      <p className="text-2xs text-vs-muted/60">{r.condition}{r.format ? ` · ${r.format}` : ""}</p>
                    </div>
                    <div className="text-right flex-shrink-0">
                      {r.asking_price != null && <p className="text-sm font-bold text-vs-gold">{fmt(r.asking_price)}</p>}
                      <button onClick={() => toggleCart(r)} className="text-2xs text-vs-muted hover:text-vs-danger transition-colors">Remove</button>
                    </div>
                  </div>
                ))
              )}
            </div>

            {cart.length > 0 && (
              <div className="border-t border-vs-border px-5 py-4 flex flex-col gap-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-vs-text-2">Total</span>
                  <span className="text-xl font-bold text-vs-gold">{fmt(cartTotal)}</span>
                </div>
                {store.store_contact ? (
                  <a
                    href={buildShareLink(store.store_contact, cart, store.store_name)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={`flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-semibold transition-colors text-white ${
                      isPhone(store.store_contact) ? "bg-[#25D366] hover:bg-[#1ebe5c]" : ""
                    }`}
                    style={!isPhone(store.store_contact) ? { background: accent } : undefined}
                  >
                    <MessageCircle size={16} />
                    {isPhone(store.store_contact) ? "Order via WhatsApp" : "Send order via email"}
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
