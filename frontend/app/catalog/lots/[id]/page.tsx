"use client";

import { useEffect, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft, TrendingUp, TrendingDown, DollarSign, Package,
  AlertCircle, ExternalLink, Disc3, Loader2,
} from "lucide-react";
import { api, getToken, type LotSummary, type CatalogRecord } from "@/lib/api";
import { CoverThumb } from "@/components/CoverThumb";
import { CondBadge } from "@/components/CondBadge";

function fmt(n: number) { return `$${n.toFixed(2)}`; }

const CONDITION_ORDER = ["M", "NM", "VG+", "VG", "G"];
const CONDITION_COLORS: Record<string, string> = {
  M: "bg-emerald-500",
  NM: "bg-green-500",
  "VG+": "bg-yellow-400",
  VG: "bg-orange-400",
  G: "bg-red-400",
};

function MetricCard({
  label, value, sub, accent, icon,
}: {
  label: string; value: string; sub?: string; accent?: "positive" | "negative" | "neutral"; icon?: React.ReactNode;
}) {
  const valueColor = accent === "positive" ? "text-vs-success" : accent === "negative" ? "text-vs-danger" : "text-vs-text";
  return (
    <div className="metric-card">
      <div className="flex items-start justify-between mb-2">
        <p className="text-xs text-vs-text-2">{label}</p>
        {icon && <span className="p-1.5 rounded-lg bg-vs-raised text-vs-muted">{icon}</span>}
      </div>
      <p className={`text-2xl font-medium ${valueColor}`}>{value}</p>
      {sub && <p className="text-xs text-vs-muted mt-0.5">{sub}</p>}
    </div>
  );
}

function RecordRow({ r }: { r: CatalogRecord }) {
  return (
    <div className="flex items-center gap-3 py-2.5 border-b border-vs-border/50 last:border-0">
      <CoverThumb url={r.cover_image_url} />
      <div className="flex-1 min-w-0">
        <p className="text-xs text-vs-muted leading-tight truncate">{r.artist || "Unknown"}</p>
        <p className="text-sm font-medium text-vs-text leading-snug truncate">{r.title || "Untitled"}</p>
      </div>
      <CondBadge c={r.condition} />
      <div className="text-right min-w-[60px]">
        {r.status === "sold"
          ? <span className="text-xs text-vs-teal font-medium">{r.sold_price != null ? fmt(r.sold_price) : "Sold"}</span>
          : r.asking_price != null
            ? <span className="text-sm font-medium text-vs-gold">{fmt(r.asking_price)}</span>
            : <span className="text-xs text-vs-muted italic">No price</span>
        }
      </div>
      {r.discogs_release_id && (
        <a
          href={`https://www.discogs.com/release/${r.discogs_release_id}`}
          target="_blank" rel="noopener noreferrer"
          className="text-vs-muted hover:text-vs-text flex-shrink-0"
          onClick={(e) => e.stopPropagation()}
        >
          <ExternalLink size={12} />
        </a>
      )}
    </div>
  );
}

export default function LotDetailPage() {
  const router = useRouter();
  const params = useParams();
  const id = params.id as string;
  const [lot, setLot] = useState<LotSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<"in_stock" | "sold">("in_stock");

  useEffect(() => {
    if (!getToken()) { router.replace("/"); return; }
    api.lotSummary(id)
      .then(setLot)
      .catch(() => router.replace("/catalog/lots"))
      .finally(() => setLoading(false));
  }, [id, router]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 size={28} className="animate-spin text-vs-muted" />
      </div>
    );
  }

  if (!lot) return null;

  const invested = lot.purchase_price ?? 0;
  const earned = lot.total_sold_revenue ?? 0;
  const remaining = lot.total_asking ?? 0;
  const profit = earned - invested;
  const roiPct = invested > 0 ? (profit / invested) * 100 : null;
  const soldPct = lot.record_count > 0 ? Math.round((lot.sold_count / lot.record_count) * 100) : 0;

  const inStockRecords = lot.records.filter((r) => r.status === "in_stock");
  const soldRecords = lot.records.filter((r) => r.status === "sold");
  const totalConditions = Object.values(lot.condition_breakdown).reduce((s, n) => s + n, 0);

  return (
    <div className="px-6 py-6 max-w-3xl mx-auto pb-16">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <Link href="/catalog/lots" className="text-vs-muted hover:text-vs-text transition-colors">
          <ArrowLeft size={18} />
        </Link>
        <div className="flex-1 min-w-0">
          <h1 className="text-xl font-medium truncate">{lot.name}</h1>
          <p className="text-xs text-vs-muted mt-0.5">
            {new Date(lot.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
            {" · "}{lot.record_count} record{lot.record_count !== 1 ? "s" : ""}
          </p>
        </div>
        <Link
          href={`/catalog?lot_id=${lot.id}`}
          className="btn-secondary text-xs py-1.5 px-3"
        >
          View in catalog
        </Link>
      </div>

      {/* P&L metrics */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
        <MetricCard
          label="Invested"
          value={invested > 0 ? fmt(invested) : "—"}
          sub={lot.total_cost ? `${fmt(lot.total_cost)} item costs` : undefined}
          icon={<DollarSign size={13} />}
        />
        <MetricCard
          label="Earned"
          value={earned > 0 ? fmt(earned) : "—"}
          sub={lot.sold_count > 0 ? `${lot.sold_count} sold` : "Nothing sold yet"}
          accent={earned > 0 ? "positive" : undefined}
          icon={<TrendingUp size={13} />}
        />
        <MetricCard
          label={profit >= 0 ? "Profit" : "Loss"}
          value={invested > 0 ? `${profit >= 0 ? "+" : ""}${fmt(profit)}` : "—"}
          sub={roiPct != null ? `${roiPct >= 0 ? "+" : ""}${roiPct.toFixed(1)}% ROI` : undefined}
          accent={invested > 0 ? (profit >= 0 ? "positive" : "negative") : undefined}
          icon={profit >= 0 ? <TrendingUp size={13} /> : <TrendingDown size={13} />}
        />
        <MetricCard
          label="In stock value"
          value={remaining > 0 ? fmt(remaining) : "—"}
          sub={lot.in_stock_count > 0 ? `${lot.in_stock_count} records` : "All sold"}
          icon={<Package size={13} />}
        />
      </div>

      {/* Sell-through progress */}
      <div className="card p-4 mb-4">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs text-vs-text-2">Sell-through</span>
          <span className="text-xs font-medium text-vs-text">{soldPct}% · {lot.sold_count}/{lot.record_count}</span>
        </div>
        <div className="h-2 bg-vs-raised rounded-full overflow-hidden">
          <div
            className="h-full bg-vs-teal rounded-full transition-all"
            style={{ width: `${soldPct}%` }}
          />
        </div>
      </div>

      {/* Unpriced alert */}
      {lot.unpriced_count > 0 && (
        <div className="flex items-center gap-3 p-3 mb-4 rounded-xl border border-vs-gold/30 bg-vs-gold/5">
          <AlertCircle size={14} className="text-vs-gold flex-shrink-0" />
          <p className="text-xs text-vs-text-2 flex-1">
            {lot.unpriced_count} in-stock record{lot.unpriced_count !== 1 ? "s" : ""} without asking price
          </p>
          <Link
            href={`/catalog?lot_id=${lot.id}&status=in_stock`}
            className="text-xs text-vs-gold hover:underline flex-shrink-0"
          >
            Set prices →
          </Link>
        </div>
      )}

      {/* Condition breakdown */}
      {totalConditions > 0 && (
        <div className="card p-4 mb-4">
          <p className="text-xs text-vs-text-2 mb-3">In-stock condition breakdown</p>
          <div className="flex gap-1 h-3 rounded-full overflow-hidden mb-2">
            {CONDITION_ORDER.filter((c) => lot.condition_breakdown[c]).map((c) => (
              <div
                key={c}
                className={`${CONDITION_COLORS[c] ?? "bg-vs-muted"}`}
                style={{ width: `${(lot.condition_breakdown[c] / totalConditions) * 100}%` }}
              />
            ))}
          </div>
          <div className="flex flex-wrap gap-3">
            {CONDITION_ORDER.filter((c) => lot.condition_breakdown[c]).map((c) => (
              <div key={c} className="flex items-center gap-1.5">
                <span className={`w-2 h-2 rounded-full ${CONDITION_COLORS[c] ?? "bg-vs-muted"}`} />
                <span className="text-xs text-vs-text-2">{c}</span>
                <span className="text-xs font-medium text-vs-text">{lot.condition_breakdown[c]}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Records list */}
      <div className="card overflow-hidden">
        <div className="flex border-b border-vs-border">
          {(["in_stock", "sold"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`flex-1 py-2.5 text-sm font-medium transition-colors ${
                tab === t ? "text-vs-text border-b-2 border-vs-accent" : "text-vs-muted hover:text-vs-text"
              }`}
            >
              {t === "in_stock" ? `In stock (${inStockRecords.length})` : `Sold (${soldRecords.length})`}
            </button>
          ))}
        </div>

        <div className="px-4">
          {tab === "in_stock" ? (
            inStockRecords.length === 0 ? (
              <div className="flex flex-col items-center gap-2 py-10 text-center">
                <Disc3 size={28} className="text-vs-muted" />
                <p className="text-sm text-vs-text-2">All records sold</p>
              </div>
            ) : (
              inStockRecords.map((r) => <RecordRow key={r.id} r={r} />)
            )
          ) : (
            soldRecords.length === 0 ? (
              <div className="flex flex-col items-center gap-2 py-10 text-center">
                <Disc3 size={28} className="text-vs-muted" />
                <p className="text-sm text-vs-text-2">Nothing sold yet</p>
              </div>
            ) : (
              soldRecords.map((r) => <RecordRow key={r.id} r={r} />)
            )
          )}
        </div>
      </div>

      {lot.notes && (
        <p className="text-xs text-vs-muted mt-4 px-1">{lot.notes}</p>
      )}
    </div>
  );
}
