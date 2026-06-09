"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Search, X, DollarSign, Loader2, CheckCircle2, RotateCcw } from "lucide-react";
import { toast } from "sonner";
import { api, getToken, isStore, isCollector, type CatalogRecord } from "@/lib/api";
import { CoverThumb } from "@/components/CoverThumb";

type Stage = "search" | "confirm" | "done";

const CONDITION_COLOR: Record<string, string> = {
  M: "bg-vs-success/15 text-vs-success",
  NM: "bg-vs-success/10 text-vs-success",
  "VG+": "bg-vs-gold/15 text-vs-gold",
  VG: "bg-vs-gold/10 text-vs-gold",
  G: "bg-vs-danger/10 text-vs-danger",
};

export default function MobileSellPage() {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [results, setResults] = useState<CatalogRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<CatalogRecord | null>(null);
  const [soldPrice, setSoldPrice] = useState("");
  const [selling, setSelling] = useState(false);
  const [stage, setStage] = useState<Stage>("search");
  const [lastSold, setLastSold] = useState<{ artist: string | null; title: string | null; price: number } | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const priceRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!getToken()) { router.replace("/login"); return; }
    api.me().then((u) => {
      if (isCollector(u) && !isStore(u)) router.replace("/mobile/catalog");
    }).catch(() => {});
  }, [router]);

  function handleSearch(v: string) {
    setSearch(v);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!v.trim()) { setResults([]); return; }
    debounceRef.current = setTimeout(async () => {
      setLoading(true);
      try {
        const data = await api.listCatalog({ search: v, status: "in_stock", per_page: 20 });
        setResults(data.records);
      } catch { /* ignore */ }
      finally { setLoading(false); }
    }, 300);
  }

  function selectRecord(r: CatalogRecord) {
    setSelected(r);
    setSoldPrice(r.asking_price != null ? String(r.asking_price) : "");
    setStage("confirm");
    setTimeout(() => priceRef.current?.focus(), 100);
  }

  async function confirmSell() {
    if (!selected) return;
    const price = parseFloat(soldPrice);
    if (isNaN(price) || price <= 0) return;
    setSelling(true);
    try {
      await api.sellRecord(selected.id, price);
      setLastSold({ artist: selected.artist, title: selected.title, price });
      setStage("done");
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Sale failed");
    }
    finally { setSelling(false); }
  }

  function reset() {
    setSelected(null);
    setSoldPrice("");
    setSearch("");
    setResults([]);
    setStage("search");
  }

  return (
    <div className="min-h-full px-4 pt-safe">
      <h1 className="text-xl font-bold mb-6">Sell</h1>

      {/* Search stage */}
      {stage === "search" && (
        <>
          <div className="relative mb-4">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-vs-muted pointer-events-none" />
            <input
              className="input pl-9 pr-9 w-full"
              placeholder="Search by artist or title…"
              value={search}
              onChange={(e) => handleSearch(e.target.value)}
              autoFocus
            />
            {search && (
              <button onClick={() => { setSearch(""); setResults([]); }} className="absolute right-3 top-1/2 -translate-y-1/2 text-vs-muted">
                <X size={14} />
              </button>
            )}
          </div>

          {loading && (
            <div className="flex justify-center py-8">
              <Loader2 size={24} className="animate-spin text-vs-muted" />
            </div>
          )}

          {!loading && results.length === 0 && search && (
            <p className="text-center py-8 text-vs-muted text-sm">No records found</p>
          )}

          {!loading && results.length === 0 && !search && (
            <div className="flex flex-col items-center gap-3 py-16 text-vs-muted">
              <Search size={40} className="opacity-20" />
              <p className="text-sm">Search your catalog to sell</p>
            </div>
          )}

          <div className="flex flex-col gap-2">
            {results.map((r) => (
              <button key={r.id} onClick={() => selectRecord(r)}
                className="flex items-center gap-3 px-3 py-3 rounded-xl bg-vs-raised border border-vs-border text-left active:opacity-70 transition-opacity w-full"
              >
                <CoverThumb url={r.cover_image_url} />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium truncate">{r.artist ?? "Unknown"}</p>
                  <p className="text-xs text-vs-muted truncate">{r.title ?? "—"}</p>
                  <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded mt-1 inline-block ${CONDITION_COLOR[r.condition] ?? "bg-vs-border text-vs-text-2"}`}>
                    {r.condition}
                  </span>
                </div>
                {r.asking_price != null ? (
                  <p className="text-base font-bold text-vs-gold flex-shrink-0">${Number(r.asking_price).toFixed(2)}</p>
                ) : (
                  <p className="text-xs text-vs-muted flex-shrink-0">No price</p>
                )}
              </button>
            ))}
          </div>
        </>
      )}

      {/* Confirm stage */}
      {stage === "confirm" && selected && (
        <div className="flex flex-col gap-5">
          {/* Record card */}
          <div className="flex items-center gap-4 px-4 py-4 rounded-2xl bg-vs-raised border border-vs-border">
            <CoverThumb url={selected.cover_image_url} large />
            <div className="min-w-0 flex-1">
              <p className="font-semibold truncate">{selected.artist ?? "Unknown"}</p>
              <p className="text-sm text-vs-muted truncate">{selected.title ?? "—"}</p>
              <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded mt-1 inline-block ${CONDITION_COLOR[selected.condition] ?? "bg-vs-border text-vs-text-2"}`}>
                {selected.condition}
              </span>
            </div>
          </div>

          {/* Price input */}
          <div>
            <p className="text-xs text-vs-muted mb-2">Sold price</p>
            <div className="relative">
              <span className="absolute left-4 top-1/2 -translate-y-1/2 text-vs-muted text-xl font-semibold">$</span>
              <input
                ref={priceRef}
                type="number" min="0" step="0.01"
                value={soldPrice}
                onChange={(e) => setSoldPrice(e.target.value)}
                placeholder="0.00"
                className="input pl-10 w-full text-3xl font-bold py-4"
              />
            </div>
          </div>

          {/* Buttons */}
          <button onClick={confirmSell}
            disabled={selling || !soldPrice || parseFloat(soldPrice) <= 0}
            className="w-full py-4 rounded-2xl bg-vs-success text-white text-base font-bold flex items-center justify-center gap-2 disabled:opacity-40 active:opacity-80 transition-opacity"
          >
            {selling
              ? <Loader2 size={18} className="animate-spin" />
              : <><DollarSign size={18} /> Confirm sale</>
            }
          </button>

          <button onClick={reset}
            className="w-full py-3 text-sm text-vs-muted flex items-center justify-center gap-1.5"
          >
            <X size={14} /> Cancel
          </button>
        </div>
      )}

      {/* Done stage */}
      {stage === "done" && lastSold && (
        <div className="flex flex-col items-center gap-6 py-12">
          <div className="w-24 h-24 rounded-full bg-vs-success/10 flex items-center justify-center">
            <CheckCircle2 size={48} className="text-vs-success" />
          </div>
          <div className="text-center">
            <p className="text-xs text-vs-muted mb-1">Sold for</p>
            <p className="text-4xl font-bold text-vs-success">${lastSold.price.toFixed(2)}</p>
            <p className="text-sm text-vs-muted mt-2 truncate max-w-xs">
              {lastSold.artist ?? "Unknown"}{lastSold.title ? ` — ${lastSold.title}` : ""}
            </p>
          </div>
          <button onClick={reset}
            className="flex items-center gap-2 px-6 py-3.5 rounded-xl bg-vs-accent text-white text-sm font-semibold active:opacity-80 transition-opacity"
          >
            <RotateCcw size={15} />
            Sell another
          </button>
        </div>
      )}
    </div>
  );
}
