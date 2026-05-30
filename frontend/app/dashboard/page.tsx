"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Disc3, Camera, CheckCircle, Clock } from "lucide-react";
import { CreditBalance } from "@/components/CreditBalance";
import { StatsCard } from "@/components/StatsCard";
import { api, setToken, getToken, type DashboardStats, type Scan } from "@/lib/api";

const STATUS_LABELS: Record<string, string> = {
  auto_added: "Auto-added",
  manually_added: "Confirmed",
  skipped: "Skipped",
  pending: "Pending",
};

const STATUS_COLORS: Record<string, string> = {
  auto_added: "bg-green-500/20 text-green-400",
  manually_added: "bg-blue-500/20 text-blue-400",
  skipped: "bg-gray-500/20 text-gray-400",
  pending: "bg-yellow-500/20 text-yellow-400",
};

export default function DashboardPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [recentScans, setRecentScans] = useState<Scan[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Capture token from OAuth redirect (?token=...)
    const urlToken = searchParams.get("token");
    if (urlToken) {
      setToken(urlToken);
      // Clean URL
      router.replace("/dashboard");
      return;
    }

    if (!getToken()) {
      router.replace("/");
      return;
    }

    Promise.all([api.dashboardStats(), api.scanHistory(1, 10)])
      .then(([s, scans]) => {
        setStats(s);
        setRecentScans(scans);
      })
      .catch(() => {
        router.replace("/");
      })
      .finally(() => setLoading(false));
  }, [searchParams, router]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Disc3 size={32} className="animate-spin text-vinyl-muted" />
      </div>
    );
  }

  if (!stats) return null;

  return (
    <div className="max-w-6xl mx-auto px-4 py-10 flex flex-col gap-8">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold">Dashboard</h1>
        <Link href="/scan" className="btn-primary flex items-center gap-2">
          <Camera size={18} />
          Scan a Record
        </Link>
      </div>

      <div className="grid sm:grid-cols-3 gap-4">
        <CreditBalance initial={stats.credit_balance} />
        <StatsCard
          label="Records Scanned"
          value={stats.total_scanned}
          icon={<Disc3 size={28} />}
        />
        <StatsCard
          label="Added to Discogs"
          value={stats.total_added}
          icon={<CheckCircle size={28} />}
        />
      </div>

      <div className="card p-6 flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold">Recent Scans</h2>
          <Link href="/history" className="text-vinyl-muted hover:text-vinyl-text text-sm transition-colors">
            View all →
          </Link>
        </div>
        {recentScans.length > 0 ? (
          <div className="flex flex-col gap-2">
            {recentScans.map((scan) => (
              <div key={scan.id} className="flex items-center gap-3 py-2 border-b border-vinyl-border last:border-0">
                <Disc3 size={18} className="text-vinyl-muted flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="font-medium truncate">{scan.artist} — {scan.title || "Unknown"}</p>
                  <p className="text-vinyl-muted text-xs">{new Date(scan.created_at).toLocaleDateString()}</p>
                </div>
                <span className={`text-xs px-2 py-1 rounded-full ${STATUS_COLORS[scan.status]}`}>
                  {STATUS_LABELS[scan.status]}
                </span>
              </div>
            ))}
          </div>
        ) : (
          <div className="flex flex-col items-center gap-3 py-8 text-center">
            <Clock size={32} className="text-vinyl-muted" />
            <p className="text-vinyl-muted">No scans yet. Start by scanning a record!</p>
            <Link href="/scan" className="btn-primary text-sm py-2 px-4">Scan Now</Link>
          </div>
        )}
      </div>

      {stats.recent_transactions.length > 0 && (
        <div className="card p-6 flex flex-col gap-4">
          <h2 className="text-lg font-bold">Credit Activity</h2>
          <div className="flex flex-col gap-2">
            {stats.recent_transactions.map((t) => (
              <div key={t.id} className="flex items-center justify-between py-1.5 border-b border-vinyl-border last:border-0">
                <span className="text-sm text-vinyl-muted capitalize">{t.reason.replace("_", " ")}</span>
                <span className={`text-sm font-semibold ${t.amount > 0 ? "text-green-400" : "text-vinyl-accent"}`}>
                  {t.amount > 0 ? "+" : ""}{t.amount}
                </span>
              </div>
            ))}
          </div>
          <Link href="/credits" className="text-vinyl-muted hover:text-vinyl-text text-sm transition-colors">
            Full history →
          </Link>
        </div>
      )}
    </div>
  );
}
