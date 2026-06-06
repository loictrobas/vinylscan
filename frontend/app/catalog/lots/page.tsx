"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Disc3, TrendingUp, TrendingDown, Package, ChevronRight } from "lucide-react";
import { api, getToken, type Lot } from "@/lib/api";

function profit(lot: Lot): number | null {
  if (lot.total_sold == null || lot.purchase_price == null) return null;
  return lot.total_sold - lot.purchase_price;
}

function ProfitBadge({ value }: { value: number | null }) {
  if (value == null) return <span className="text-xs text-vinyl-muted">—</span>;
  const pos = value >= 0;
  return (
    <span className={`flex items-center gap-1 text-sm font-semibold ${pos ? "text-green-400" : "text-red-400"}`}>
      {pos ? <TrendingUp size={13} /> : <TrendingDown size={13} />}
      {pos ? "+" : ""}${value.toFixed(2)}
    </span>
  );
}

export default function LotsPage() {
  const router = useRouter();
  const [lots, setLots] = useState<Lot[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState("");
  const [newPrice, setNewPrice] = useState("");
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    if (!getToken()) { router.replace("/"); return; }
    api.listLots().then(setLots).catch(() => router.replace("/")).finally(() => setLoading(false));
  }, [router]);

  async function createLot() {
    if (!newName.trim()) return;
    setCreating(true);
    try {
      const lot = await api.createLot({
        name: newName.trim(),
        purchase_price: newPrice ? parseFloat(newPrice) : undefined,
      });
      setLots((prev) => [lot, ...prev]);
      setNewName("");
      setNewPrice("");
      setShowCreate(false);
    } finally {
      setCreating(false);
    }
  }

  if (loading) return (
    <div className="flex items-center justify-center min-h-screen">
      <Disc3 size={32} className="animate-spin text-vinyl-muted" />
    </div>
  );

  return (
    <div className="max-w-4xl mx-auto px-4 py-8 flex flex-col gap-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2 text-vinyl-muted text-sm mb-1">
            <Link href="/catalog" className="hover:text-vinyl-text">Catalog</Link>
            <ChevronRight size={14} />
            <span>Lots & Sales</span>
          </div>
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <Package size={28} className="text-vinyl-accent" />
            Lots & Sales
          </h1>
        </div>
        <button
          onClick={() => setShowCreate(!showCreate)}
          className="btn-primary text-sm py-2 px-4"
        >
          + New Lot
        </button>
      </div>

      {/* Create lot form */}
      {showCreate && (
        <div className="card p-5 flex flex-col gap-3">
          <h3 className="font-semibold">New Lot</h3>
          <div className="flex gap-3 flex-wrap">
            <input
              autoFocus
              type="text"
              placeholder="Lot name (e.g. Estate Sale June 2026)"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && createLot()}
              className="flex-1 bg-vinyl-border rounded-xl px-3 py-2 text-sm text-vinyl-text placeholder-vinyl-muted focus:outline-none focus:ring-1 focus:ring-vinyl-accent"
            />
            <div className="flex items-center gap-1">
              <span className="text-vinyl-muted text-sm">$</span>
              <input
                type="number"
                min="0"
                step="0.01"
                placeholder="Purchase price"
                value={newPrice}
                onChange={(e) => setNewPrice(e.target.value)}
                className="w-36 bg-vinyl-border rounded-xl px-3 py-2 text-sm text-vinyl-text placeholder-vinyl-muted focus:outline-none focus:ring-1 focus:ring-vinyl-accent"
              />
            </div>
          </div>
          <div className="flex gap-2">
            <button onClick={createLot} disabled={creating || !newName.trim()} className="btn-primary text-sm py-2 px-4 disabled:opacity-50">
              {creating ? "Creating…" : "Create"}
            </button>
            <button onClick={() => setShowCreate(false)} className="btn-secondary text-sm py-2 px-4">Cancel</button>
          </div>
        </div>
      )}

      {/* Lots list */}
      {lots.length === 0 ? (
        <div className="card p-12 text-center">
          <Package size={48} className="text-vinyl-muted mx-auto mb-4" />
          <p className="text-vinyl-muted mb-2">No lots yet.</p>
          <p className="text-xs text-vinyl-muted">Lots let you group records by purchase batch and track profit.</p>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {lots.map((lot) => {
            const p = profit(lot);
            return (
              <Link
                key={lot.id}
                href={`/catalog?lot_id=${lot.id}`}
                className="card p-5 flex items-center gap-4 hover:border-vinyl-accent transition-colors"
              >
                <div className="flex-1 min-w-0">
                  <p className="font-semibold">{lot.name}</p>
                  <div className="flex items-center gap-3 mt-1 flex-wrap text-xs text-vinyl-muted">
                    <span>{lot.record_count} record{lot.record_count !== 1 ? "s" : ""}</span>
                    {lot.in_stock_count > 0 && <span className="text-blue-400">{lot.in_stock_count} in stock</span>}
                    {lot.sold_count > 0 && <span className="text-green-400">{lot.sold_count} sold</span>}
                    {lot.purchase_price != null && <span>Paid ${lot.purchase_price.toFixed(2)}</span>}
                  </div>
                </div>
                <div className="flex flex-col items-end gap-1">
                  {lot.total_asking != null && (
                    <span className="text-xs text-vinyl-muted">
                      Stock value: <span className="text-vinyl-gold">${lot.total_asking.toFixed(2)}</span>
                    </span>
                  )}
                  {lot.total_sold != null && (
                    <span className="text-xs text-vinyl-muted">
                      Revenue: <span className="text-green-400">${lot.total_sold.toFixed(2)}</span>
                    </span>
                  )}
                  <ProfitBadge value={p} />
                </div>
                <ChevronRight size={16} className="text-vinyl-muted flex-shrink-0" />
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
