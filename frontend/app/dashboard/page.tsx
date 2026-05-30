import { redirect } from "next/navigation";
import Link from "next/link";
import { Disc3, Camera, CheckCircle, Clock } from "lucide-react";
import { cookies } from "next/headers";
import { CreditBalance } from "@/components/CreditBalance";
import { StatsCard } from "@/components/StatsCard";
import type { DashboardStats, Scan } from "@/lib/api";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

async function fetchWithCookie<T>(path: string, cookieHeader: string): Promise<T | null> {
  try {
    const res = await fetch(`${API_URL}${path}`, {
      headers: { Cookie: cookieHeader },
      cache: "no-store",
    });
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}

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

export default async function DashboardPage() {
  const cookieStore = await cookies();
  const cookieHeader = cookieStore.toString();

  const [stats, recentScans] = await Promise.all([
    fetchWithCookie<DashboardStats>("/dashboard/stats", cookieHeader),
    fetchWithCookie<Scan[]>("/scan/history?page=1&per_page=10", cookieHeader),
  ]);

  if (!stats) redirect("/");

  return (
    <div className="max-w-6xl mx-auto px-4 py-10 flex flex-col gap-8">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold">Dashboard</h1>
        <Link href="/scan" className="btn-primary flex items-center gap-2">
          <Camera size={18} />
          Scan a Record
        </Link>
      </div>

      {/* Stats row */}
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

      {/* Recent scans */}
      <div className="card p-6 flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold">Recent Scans</h2>
          <Link href="/history" className="text-vinyl-muted hover:text-vinyl-text text-sm transition-colors">
            View all →
          </Link>
        </div>
        {recentScans && recentScans.length > 0 ? (
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

      {/* Recent credit transactions */}
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
