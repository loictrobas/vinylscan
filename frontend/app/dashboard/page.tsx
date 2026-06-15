"use client";

import { useEffect, Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import {
  Disc3, TrendingUp, DollarSign, Package, BarChart3,
  ShoppingCart, Camera, ArrowRight, Layers, Zap, Plus, CheckCircle2, Heart,
} from "lucide-react";
import { api, setToken, getToken, isStore, isCollector, isSubscribed, type CatalogStats, type User } from "@/lib/api";

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

function DashboardPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [stats, setStats] = useState<CatalogStats | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [upgrading, setUpgrading] = useState(false);
  const [subscribeSuccess, setSubscribeSuccess] = useState(false);

  useEffect(() => {
    const urlToken = searchParams.get("token");
    if (urlToken) {
      setToken(urlToken);
      router.replace("/dashboard");
      return;
    }
    if (!getToken()) { router.replace("/"); return; }

    if (searchParams.get("subscribed") === "1") {
      setSubscribeSuccess(true);
      router.replace("/dashboard");
    }

    Promise.all([
      api.catalogStats().catch(() => null),
      api.me().catch(() => null),
    ]).then(([s, u]) => {
      if (s) setStats(s);
      if (u) setUser(u);
    }).finally(() => setLoading(false));
  }, [searchParams, router]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Disc3 size={28} className="animate-spin text-vs-muted" />
      </div>
    );
  }

  const s = stats ?? {
    total_in_stock: 0, total_sold: 0, total_revenue: 0,
    revenue_today: 0, revenue_this_week: 0, revenue_this_month: 0,
    inventory_value: 0, total_cost: 0, avg_margin_pct: null,
    added_this_month: 0, daily_revenue_7d: [], recent_sales_today: [],
  };

  const storeMode = isStore(user);
  const collectorMode = isCollector(user);
  const pureCollector = collectorMode && !storeMode;
  const subscribed = isSubscribed(user);

  async function handleUpgrade() {
    setUpgrading(true);
    try {
      const { url } = await api.checkoutSubscribe();
      window.location.href = url;
    } catch { setUpgrading(false); }
  }

  async function handlePortal() {
    try {
      const { url } = await api.billingPortal();
      window.location.href = url;
    } catch {}
  }

  const hasRevenue = s.total_revenue > 0;
  const roi = s.total_cost > 0
    ? ((s.total_revenue - s.total_cost) / s.total_cost * 100)
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
          {storeMode && (
            <Link href="/sales" className="btn-primary flex items-center gap-2">
              <ShoppingCart size={14} />
              New sale
            </Link>
          )}
          <Link href="/scan" className="btn-secondary flex items-center gap-2">
            <Camera size={14} />
            Scan
          </Link>
        </div>
      </div>

      {/* Subscription banner */}
      {subscribeSuccess && (
        <div className="mb-5 px-4 py-3 rounded-xl bg-vs-success/10 border border-vs-success/30 flex items-center gap-3">
          <CheckCircle2 size={16} className="text-vs-success flex-shrink-0" />
          <p className="text-sm text-vs-success font-medium">Subscription activated! Welcome to VinylScan Pro.</p>
        </div>
      )}
      {!subscribed && user && (
        <div className="mb-5 px-4 py-3.5 rounded-xl bg-vs-accent/8 border border-vs-accent/25 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Zap size={16} className="text-vs-accent flex-shrink-0" />
            <div>
              <p className="text-sm font-medium">Start your 14-day free trial</p>
              <p className="text-xs text-vs-muted mt-0.5">$29/month after trial · cancel anytime</p>
            </div>
          </div>
          <button
            onClick={handleUpgrade}
            disabled={upgrading}
            className="btn-primary text-xs px-3 py-1.5 flex-shrink-0 disabled:opacity-60"
          >
            {upgrading ? "Loading…" : "Upgrade"}
          </button>
        </div>
      )}
      {subscribed && user?.subscription_status === "trialing" && user.trial_ends_at && (
        <div className="mb-5 px-4 py-3 rounded-xl bg-vs-gold/8 border border-vs-gold/25 flex items-center justify-between gap-4">
          <p className="text-xs text-vs-muted">
            Trial ends {new Date(user.trial_ends_at).toLocaleDateString("en-US", { month: "long", day: "numeric" })}
          </p>
          <button onClick={handlePortal} className="text-xs text-vs-accent hover:underline">Manage billing</button>
        </div>
      )}

      {/* Store: Revenue section */}
      {storeMode && <>
      <div className="mb-2">
        <p className="text-xs text-vs-muted uppercase tracking-widest font-medium mb-3">Revenue</p>
      </div>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
        <MetricCard label="Today" value={`$${fmt(s.revenue_today)}`} icon={<DollarSign size={14} />} accent />
        <MetricCard label="This week" value={`$${fmt(s.revenue_this_week)}`} icon={<TrendingUp size={14} />} />
        <MetricCard label="This month" value={`$${fmt(s.revenue_this_month)}`} icon={<BarChart3 size={14} />} />
        <MetricCard label="All time" value={`$${fmt(s.total_revenue)}`} sub={`${s.total_sold} records sold`} icon={<TrendingUp size={14} />} />
      </div>
      </>}

      {/* Collector: Collection stats */}
      {pureCollector && <>
      <div className="mb-2">
        <p className="text-xs text-vs-muted uppercase tracking-widest font-medium mb-3">Collection</p>
      </div>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
        <MetricCard label="In collection" value={String(s.total_in_stock)} sub="records" icon={<Disc3 size={14} />} accent />
        <MetricCard label="Estimated value" value={`$${fmt(s.inventory_value)}`} sub="asking prices" icon={<Package size={14} />} />
        <MetricCard label="Total paid" value={`$${fmt(s.total_cost)}`} sub="cost prices" icon={<DollarSign size={14} />} />
        <MetricCard label="Added this month" value={String(s.added_this_month ?? 0)} sub="records" icon={<BarChart3 size={14} />} />
      </div>
      </>}

      {/* Store: 7-day revenue chart */}
      {storeMode && s.daily_revenue_7d.length > 0 && (() => {
        const max = Math.max(...s.daily_revenue_7d.map(d => d.revenue), 0.01);
        return (
          <div className="card p-5 mb-6">
            <p className="text-xs text-vs-muted uppercase tracking-widest font-medium mb-4">Last 7 days</p>
            <div className="flex items-end gap-2 h-20">
              {s.daily_revenue_7d.map((d) => {
                const pct = (d.revenue / max) * 100;
                const label = new Date(d.date + "T12:00:00").toLocaleDateString("en-US", { weekday: "short" });
                return (
                  <div key={d.date} className="flex-1 flex flex-col items-center gap-1.5 group">
                    <div className="w-full flex items-end" style={{ height: "60px" }}>
                      <div
                        className="w-full rounded-t bg-vs-accent/30 group-hover:bg-vs-accent transition-colors"
                        style={{ height: `${Math.max(pct, 3)}%` }}
                        title={`$${d.revenue.toFixed(2)}`}
                      />
                    </div>
                    <p className="text-2xs text-vs-muted">{label}</p>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })()}

      {/* Store: Inventory section */}
      {storeMode && <>
      <div className="mb-2">
        <p className="text-xs text-vs-muted uppercase tracking-widest font-medium mb-3">Inventory</p>
      </div>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
        <MetricCard label="In stock" value={String(s.total_in_stock)} sub="records" icon={<Disc3 size={14} />} accent />
        <MetricCard label="Stock value" value={`$${fmt(s.inventory_value)}`} sub="asking prices" icon={<Package size={14} />} />
        <MetricCard label="Total invested" value={`$${fmt(s.total_cost)}`} sub="cost prices" icon={<DollarSign size={14} />} />
        <MetricCard
          label="Avg margin"
          value={s.avg_margin_pct != null ? `${s.avg_margin_pct.toFixed(1)}%` : "—"}
          sub={roi != null ? `${roi.toFixed(1)}% overall ROI` : "no data yet"}
          icon={<BarChart3 size={14} />}
        />
      </div>
      </>}

      {/* Two-column bottom row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Store: Recent sales today */}
        {storeMode && (
          <div className="card p-5">
            <div className="flex items-center justify-between mb-4">
              <p className="text-sm font-medium text-vs-text">Sales today</p>
              <Link href="/sales/history" className="text-xs text-vs-muted hover:text-vs-text flex items-center gap-1">
                View all <ArrowRight size={11} />
              </Link>
            </div>
            {s.recent_sales_today.length > 0 ? (
              <div className="flex flex-col gap-0">
                {s.recent_sales_today.map((sale, i) => (
                  <div key={i} className="flex items-center justify-between py-2.5 border-b border-vs-border/50 last:border-0">
                    <div className="min-w-0">
                      <p className="text-sm text-vs-text truncate">
                        {sale.artist && sale.title ? `${sale.artist} — ${sale.title}` : sale.title || sale.artist || "Unknown"}
                      </p>
                      <p className="text-xs text-vs-muted">
                        {sale.sold_at ? new Date(sale.sold_at).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" }) : ""}
                      </p>
                    </div>
                    <span className="text-sm font-medium text-vs-gold ml-4">
                      {sale.sold_price != null ? `$${fmt(sale.sold_price)}` : "—"}
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
        )}

        {/* Quick actions */}
        <div className="card p-5">
          <p className="text-sm font-medium text-vs-text mb-4">Quick actions</p>
          <div className="flex flex-col gap-1">
            {(pureCollector ? [
              { href: "/scan",         icon: <Camera size={15} />,       label: "Scan a record",       sub: "Vision + Discogs" },
              { href: "/catalog",      icon: <Disc3 size={15} />,         label: "Browse collection",   sub: `${s.total_in_stock} records` },
              { href: "/wantlist",     icon: <Heart size={15} />,         label: "Wantlist",            sub: "Records to find" },
              { href: "/catalog/lots", icon: <Layers size={15} />,        label: "Hauls",               sub: "Track acquisitions" },
            ] : [
              { href: "/scan",         icon: <Camera size={15} />,        label: "Scan a record",       sub: "Vision + Discogs" },
              { href: "/sales",        icon: <ShoppingCart size={15} />,  label: "Point of sale",       sub: "Search & sell" },
              { href: "/catalog",      icon: <Disc3 size={15} />,         label: "Browse catalog",      sub: `${s.total_in_stock} in stock` },
              { href: "/catalog/lots", icon: <Layers size={15} />,        label: "Manage lots",         sub: "Track purchases" },
            ]).map((item) => (
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

export default function DashboardPage() {
  return (
    <Suspense>
      <DashboardPageInner />
    </Suspense>
  );
}
