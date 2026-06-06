"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import {
  Disc3, TrendingUp, DollarSign, Package, BarChart3,
  ShoppingCart, Camera, ArrowRight, Layers,
} from "lucide-react";
import { api, setToken, getToken, type CatalogStats } from "@/lib/api";

function fmt(n: number) {
  return n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

interface MetricCardProps {
  label: string;
  value: string;
  sub?: string;
  icon: React.ReactNode;
  accent?: boolean;
}
function MetricCard({ label, value, sub, icon, accent }: MetricCardProps) {
  return (
    <div className="metric-card">
      <div className="flex items-start justify-between">
        <p className="text-xs text-vs-text-2 font-medium">{label}</p>
        <span className={`p-1.5 rounded-lg ${accent ? "bg-vs-accent/15 text-vs-accent" : "bg-vs-raised text-vs-muted"}`}>
          {icon}
        </span>
      </div>
      <div>
        <p className="text-2xl font-medium text-vs-text">{value}</p>
        {sub && <p className="text-xs text-vs-text-2 mt-0.5">{sub}</p>}
      </div>
    </div>
  );
}

export default function DashboardPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [stats, setStats] = useState<CatalogStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const urlToken = searchParams.get("token");
    if (urlToken) {
      setToken(urlToken);
      router.replace("/dashboard");
      return;
    }
    if (!getToken()) { router.replace("/"); return; }

    api.catalogStats()
      .then(setStats)
      .catch(() => router.replace("/"))
      .finally(() => setLoading(false));
  }, [searchParams, router]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Disc3 size={28} className="animate-spin text-vs-muted" />
      </div>
    );
  }

  if (!stats) return null;

  const hasRevenue = stats.total_revenue > 0;
  const roi = stats.total_cost > 0
    ? ((stats.total_revenue - stats.total_cost) / stats.total_cost * 100)
    : null;

  return (
    <div className="px-6 py-6 max-w-5xl">
      {/* Page header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-medium text-vs-text">Home</h1>
          <p className="text-sm text-vs-text-2 mt-0.5">
            {new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link href="/sales" className="btn-primary flex items-center gap-2">
            <ShoppingCart size={14} />
            New sale
          </Link>
          <Link href="/scan" className="btn-secondary flex items-center gap-2">
            <Camera size={14} />
            Scan
          </Link>
        </div>
      </div>

      {/* Revenue section */}
      <div className="mb-2">
        <p className="text-xs text-vs-muted uppercase tracking-widest font-medium mb-3">Revenue</p>
      </div>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
        <MetricCard
          label="Today"
          value={`$${fmt(stats.revenue_today)}`}
          icon={<DollarSign size={14} />}
          accent
        />
        <MetricCard
          label="This week"
          value={`$${fmt(stats.revenue_this_week)}`}
          icon={<TrendingUp size={14} />}
        />
        <MetricCard
          label="This month"
          value={`$${fmt(stats.revenue_this_month)}`}
          icon={<BarChart3 size={14} />}
        />
        <MetricCard
          label="All time"
          value={`$${fmt(stats.total_revenue)}`}
          sub={`${stats.total_sold} records sold`}
          icon={<TrendingUp size={14} />}
        />
      </div>

      {/* Inventory section */}
      <div className="mb-2">
        <p className="text-xs text-vs-muted uppercase tracking-widest font-medium mb-3">Inventory</p>
      </div>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
        <MetricCard
          label="In stock"
          value={String(stats.total_in_stock)}
          sub="records"
          icon={<Disc3 size={14} />}
          accent
        />
        <MetricCard
          label="Stock value"
          value={`$${fmt(stats.inventory_value)}`}
          sub="asking prices"
          icon={<Package size={14} />}
        />
        <MetricCard
          label="Total invested"
          value={`$${fmt(stats.total_cost)}`}
          sub="cost prices"
          icon={<DollarSign size={14} />}
        />
        <MetricCard
          label="Avg margin"
          value={stats.avg_margin_pct != null ? `${stats.avg_margin_pct.toFixed(1)}%` : "—"}
          sub={roi != null ? `${roi.toFixed(1)}% overall ROI` : "no data yet"}
          icon={<BarChart3 size={14} />}
        />
      </div>

      {/* Two-column bottom row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Recent sales today */}
        <div className="card p-5">
          <div className="flex items-center justify-between mb-4">
            <p className="text-sm font-medium text-vs-text">Sales today</p>
            <Link href="/sales/history" className="text-xs text-vs-muted hover:text-vs-text flex items-center gap-1">
              View all <ArrowRight size={11} />
            </Link>
          </div>
          {stats.recent_sales_today.length > 0 ? (
            <div className="flex flex-col gap-0">
              {stats.recent_sales_today.map((s, i) => (
                <div key={i} className="flex items-center justify-between py-2.5 border-b border-vs-border/50 last:border-0">
                  <div className="min-w-0">
                    <p className="text-sm text-vs-text truncate">
                      {s.artist && s.title ? `${s.artist} — ${s.title}` : s.title || s.artist || "Unknown"}
                    </p>
                    <p className="text-xs text-vs-muted">
                      {s.sold_at ? new Date(s.sold_at).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" }) : ""}
                    </p>
                  </div>
                  <span className="text-sm font-medium text-vs-gold ml-4">
                    {s.sold_price != null ? `$${fmt(s.sold_price)}` : "—"}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <div className="py-8 text-center">
              <p className="text-sm text-vs-muted">No sales yet today</p>
              <Link href="/sales" className="text-xs text-vs-accent hover:underline mt-1 block">
                Open POS →
              </Link>
            </div>
          )}
        </div>

        {/* Quick actions */}
        <div className="card p-5">
          <p className="text-sm font-medium text-vs-text mb-4">Quick actions</p>
          <div className="flex flex-col gap-1">
            {[
              { href: "/scan",     icon: <Camera size={15} />,     label: "Scan a record",         sub: "Vision + Discogs" },
              { href: "/sales",    icon: <ShoppingCart size={15} />, label: "Point of sale",        sub: "Search & sell" },
              { href: "/catalog",  icon: <Disc3 size={15} />,       label: "Browse catalog",        sub: `${stats.total_in_stock} in stock` },
              { href: "/catalog/lots", icon: <Layers size={15} />,  label: "Manage lots",           sub: "Track purchases" },
            ].map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-vs-raised transition-colors group"
              >
                <span className="text-vs-muted group-hover:text-vs-accent transition-colors">{item.icon}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-vs-text">{item.label}</p>
                  <p className="text-xs text-vs-muted">{item.sub}</p>
                </div>
                <ArrowRight size={13} className="text-vs-muted opacity-0 group-hover:opacity-100 transition-opacity" />
              </Link>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
