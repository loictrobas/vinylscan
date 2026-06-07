"use client";

import { useEffect, useState, useRef } from "react";
import { useRouter } from "next/navigation";
import {
  ShoppingCart, Search, X, Disc3, Tag, Check,
  Trash2, Receipt, ChevronRight,
} from "lucide-react";
import { api, getToken, type CatalogRecord } from "@/lib/api";

function fmt(n: number) { return `$${n.toFixed(2)}`; }

const COND_COLORS: Record<string, string> = {
  M: "bg-purple-500/15 text-purple-300",
  NM: "bg-vs-success/15 text-vs-success",
  "VG+": "bg-vs-accent/15 text-vs-accent",
  VG: "bg-vs-warning/15 text-vs-warning",
  G: "bg-vs-danger/15 text-vs-danger",
};

interface CartItem {
  record: CatalogRecord;
  price: number;
}

interface ReceiptModal {
  items: CartItem[];
  total: number;
  payment: string;
}

function ReceiptView({ data, onClose }: { data: ReceiptModal; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-vs-card border border-vs-border rounded-2xl w-full max-w-sm">
        <div className="p-6">
          <div className="text-center mb-5">
            <div className="w-10 h-10 rounded-full bg-vs-success/15 flex items-center justify-center mx-auto mb-3">
              <Check size={18} className="text-vs-success" />
            </div>
            <h2 className="text-base font-medium">Sale complete</h2>
            <p className="text-xs text-vs-text-2 mt-0.5">{new Date().toLocaleString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}</p>
          </div>

          <div className="border-t border-vs-border pt-4 mb-4">
            {data.items.map((item) => (
              <div key={item.record.id} className="flex items-center justify-between py-2">
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-vs-text truncate">
                    {item.record.artist && item.record.title
                      ? `${item.record.artist} — ${item.record.title}`
                      : item.record.artist || item.record.title || "Unknown"}
                  </p>
                  <p className="text-xs text-vs-muted">{item.record.format ?? ""} · {item.record.condition}</p>
                </div>
                <span className="text-sm font-medium text-vs-gold ml-3">{fmt(item.price)}</span>
              </div>
            ))}
          </div>

          <div className="border-t border-vs-border pt-4 space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-vs-text-2">Total</span>
              <span className="font-medium text-vs-gold">{fmt(data.total)}</span>
            </div>
            <div className="flex justify-between text-xs">
              <span className="text-vs-muted">Payment</span>
              <span className="text-vs-text-2 capitalize">{data.payment}</span>
            </div>
          </div>
        </div>
        <div className="px-6 pb-4 flex justify-end">
          <button onClick={onClose} className="btn-primary w-full text-center">Done</button>
        </div>
      </div>
    </div>
  );
}

export default function POSPage() {
  const router = useRouter();
  const [searchInput, setSearchInput] = useState("");
  const [results, setResults] = useState<CatalogRecord[]>([]);
  const [searching, setSearching] = useState(false);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [discount, setDiscount] = useState("");
  const [payment, setPayment] = useState<"cash" | "card" | "transfer">("cash");
  const [selling, setSelling] = useState(false);
  const [receipt, setReceipt] = useState<ReceiptModal | null>(null);
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!getToken()) { router.replace("/"); return; }
    // Pre-populate cart from catalog multi-select "Add to cart"
    const stored = localStorage.getItem("vinylscan_pos_cart");
    if (stored) {
      try {
        const items = JSON.parse(stored) as CatalogRecord[];
        setCart(items.map((r) => ({ record: r, price: r.asking_price ?? 0 })));
      } catch { /* ignore */ }
      localStorage.removeItem("vinylscan_pos_cart");
    }
  }, [router]);

  async function doSearch(q: string) {
    if (!q.trim()) { setResults([]); return; }
    setSearching(true);
    try {
      const res = await api.listCatalog({ search: q, status: "in_stock", per_page: 10 });
      setResults(res.records);
    } finally { setSearching(false); }
  }

  function handleSearchInput(v: string) {
    setSearchInput(v);
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => doSearch(v), 250);
  }

  function addToCart(r: CatalogRecord) {
    if (cart.some((c) => c.record.id === r.id)) return;
    setCart((prev) => [...prev, { record: r, price: r.asking_price ?? 0 }]);
    setSearchInput("");
    setResults([]);
  }

  function removeFromCart(id: string) {
    setCart((prev) => prev.filter((c) => c.record.id !== id));
  }

  function updatePrice(id: string, v: string) {
    setCart((prev) => prev.map((c) => c.record.id === id ? { ...c, price: parseFloat(v) || 0 } : c));
  }

  const subtotal = cart.reduce((s, c) => s + c.price, 0);
  const discountAmt = parseFloat(discount) || 0;
  const total = Math.max(0, subtotal - discountAmt);

  async function completeSale() {
    if (cart.length === 0 || selling) return;
    setSelling(true);
    try {
      const results = await Promise.allSettled(cart.map((c) => api.sellRecord(c.record.id, c.price)));
      const succeeded = cart.filter((_, i) => results[i].status === "fulfilled");
      const failed = cart.filter((_, i) => results[i].status === "rejected");
      if (succeeded.length > 0) {
        const soldSubtotal = succeeded.reduce((s, c) => s + c.price, 0);
        const r: ReceiptModal = {
          items: succeeded,
          total: Math.max(0, soldSubtotal - (parseFloat(discount) || 0)),
          payment,
        };
        setReceipt(r);
        if (succeeded.length > 0) setDiscount("");
      }
      setCart(failed);
    } finally { setSelling(false); }
  }

  return (
    <div className="px-6 py-6">
      <div className="mb-5">
        <h1 className="text-xl font-medium">Point of sale</h1>
        <p className="text-sm text-vs-text-2 mt-0.5">Search and sell records</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-5">
        {/* Left: search */}
        <div className="lg:col-span-3 flex flex-col gap-4">
          <div className="card p-4">
            <div className="relative mb-3">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-vs-muted" />
              <input
                value={searchInput}
                onChange={(e) => handleSearchInput(e.target.value)}
                placeholder="Search by artist or title…"
                className="input pl-9"
                autoFocus
              />
              {searchInput && (
                <button onClick={() => { setSearchInput(""); setResults([]); }} className="absolute right-3 top-1/2 -translate-y-1/2 text-vs-muted hover:text-vs-text">
                  <X size={12} />
                </button>
              )}
            </div>

            {searching && (
              <div className="flex items-center justify-center py-6">
                <Disc3 size={18} className="animate-spin text-vs-muted" />
              </div>
            )}

            {!searching && results.length > 0 && (
              <div className="flex flex-col gap-1">
                {results.map((r) => (
                  <button
                    key={r.id}
                    onClick={() => addToCart(r)}
                    disabled={cart.some((c) => c.record.id === r.id)}
                    className="flex items-center gap-3 p-3 rounded-lg hover:bg-vs-raised transition-colors text-left disabled:opacity-40 group"
                  >
                    <div className="w-8 h-8 rounded-lg bg-vs-raised border border-vs-border flex items-center justify-center flex-shrink-0 group-hover:border-vs-border-2">
                      <Disc3 size={13} className="text-vs-muted" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">
                        {r.artist && r.title ? `${r.artist} — ${r.title}` : r.artist || r.title || "Unknown"}
                      </p>
                      <p className="text-xs text-vs-muted">{[r.year, r.format].filter(Boolean).join(" · ")}</p>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <span className={`text-2xs font-medium px-1.5 py-0.5 rounded ${COND_COLORS[r.condition] ?? "bg-vs-raised text-vs-text-2"}`}>
                        {r.condition}
                      </span>
                      <span className="text-sm font-medium text-vs-gold">
                        {r.asking_price != null ? fmt(r.asking_price) : "—"}
                      </span>
                      <ChevronRight size={12} className="text-vs-muted group-hover:text-vs-accent" />
                    </div>
                  </button>
                ))}
              </div>
            )}

            {!searching && searchInput && results.length === 0 && (
              <p className="text-center text-sm text-vs-muted py-6">No in-stock records found.</p>
            )}

            {!searchInput && (
              <div className="flex flex-col items-center gap-2 py-8 text-center">
                <Search size={24} className="text-vs-muted" />
                <p className="text-sm text-vs-muted">Type to search in-stock records</p>
              </div>
            )}
          </div>
        </div>

        {/* Right: cart */}
        <div className="lg:col-span-2 flex flex-col gap-4">
          <div className="card p-4 flex flex-col gap-3">
            <div className="flex items-center gap-2">
              <ShoppingCart size={15} className="text-vs-muted" />
              <span className="text-sm font-medium">Cart</span>
              {cart.length > 0 && (
                <span className="ml-auto text-xs text-vs-muted">{cart.length} item{cart.length !== 1 ? "s" : ""}</span>
              )}
            </div>

            {cart.length === 0 ? (
              <div className="py-8 text-center">
                <p className="text-sm text-vs-muted">Cart is empty</p>
              </div>
            ) : (
              <div className="flex flex-col gap-2">
                {cart.map((item) => (
                  <div key={item.record.id} className="flex items-center gap-2 py-2 border-b border-vs-border/50 last:border-0">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm truncate">
                        {item.record.artist && item.record.title
                          ? `${item.record.artist} — ${item.record.title}`
                          : item.record.artist || item.record.title || "Unknown"}
                      </p>
                      <p className="text-xs text-vs-muted">{item.record.condition} · {item.record.format}</p>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs text-vs-muted">$</span>
                      <input
                        type="number" min="0" step="0.01"
                        value={item.price}
                        onChange={(e) => updatePrice(item.record.id, e.target.value)}
                        className="w-16 bg-vs-raised border border-vs-border-2 rounded px-1.5 py-1 text-xs text-vs-text focus:outline-none focus:border-vs-accent"
                      />
                      <button onClick={() => removeFromCart(item.record.id)} className="text-vs-muted hover:text-vs-danger">
                        <Trash2 size={12} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {cart.length > 0 && (
              <>
                {/* Discount */}
                <div className="flex items-center gap-2 pt-1">
                  <Tag size={12} className="text-vs-muted flex-shrink-0" />
                  <span className="text-xs text-vs-text-2">Discount</span>
                  <div className="relative ml-auto">
                    <span className="absolute left-2 top-1/2 -translate-y-1/2 text-vs-muted text-xs">$</span>
                    <input type="number" min="0" step="0.01" value={discount} onChange={(e) => setDiscount(e.target.value)}
                      className="w-20 bg-vs-raised border border-vs-border-2 rounded pl-5 pr-2 py-1 text-xs text-vs-text focus:outline-none focus:border-vs-accent"
                      placeholder="0.00"
                    />
                  </div>
                </div>

                {/* Total */}
                <div className="border-t border-vs-border pt-3 flex flex-col gap-1.5">
                  {discountAmt > 0 && (
                    <div className="flex justify-between text-xs">
                      <span className="text-vs-muted">Subtotal</span>
                      <span className="text-vs-text-2">{fmt(subtotal)}</span>
                    </div>
                  )}
                  {discountAmt > 0 && (
                    <div className="flex justify-between text-xs">
                      <span className="text-vs-muted">Discount</span>
                      <span className="text-vs-danger">-{fmt(discountAmt)}</span>
                    </div>
                  )}
                  <div className="flex justify-between text-sm font-medium">
                    <span>Total</span>
                    <span className="text-vs-gold text-base">{fmt(total)}</span>
                  </div>
                </div>

                {/* Payment method */}
                <div>
                  <p className="text-xs text-vs-text-2 mb-2">Payment method</p>
                  <div className="flex gap-1.5">
                    {(["cash", "card", "transfer"] as const).map((p) => (
                      <button key={p} onClick={() => setPayment(p)}
                        className={`flex-1 py-1.5 text-xs font-medium rounded-lg border capitalize transition-colors ${
                          payment === p
                            ? "bg-vs-accent text-vs-bg border-vs-accent"
                            : "border-vs-border-2 text-vs-text-2 hover:border-vs-accent"
                        }`}
                      >
                        {p}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Complete */}
                <button
                  onClick={completeSale}
                  disabled={selling || total === 0}
                  className="btn-primary w-full flex items-center justify-center gap-2 py-2.5 disabled:opacity-50"
                >
                  <Receipt size={14} />
                  {selling ? "Processing…" : `Complete sale · ${fmt(total)}`}
                </button>
              </>
            )}
          </div>
        </div>
      </div>

      {receipt && (
        <ReceiptView data={receipt} onClose={() => setReceipt(null)} />
      )}
    </div>
  );
}
