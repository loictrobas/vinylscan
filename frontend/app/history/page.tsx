"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Disc3, ExternalLink } from "lucide-react";
import { api, getToken, type Scan } from "@/lib/api";

const STATUS_LABELS: Record<string, string> = {
  auto_added: "Auto-added",
  manually_added: "Confirmed",
  skipped: "Skipped",
  pending: "Pending",
};

const STATUS_COLORS: Record<string, string> = {
  auto_added: "bg-green-500/20 text-green-400 border border-green-500/30",
  manually_added: "bg-blue-500/20 text-blue-400 border border-blue-500/30",
  skipped: "bg-gray-500/20 text-gray-400 border border-gray-500/30",
  pending: "bg-yellow-500/20 text-yellow-400 border border-yellow-500/30",
};

export default function HistoryPage() {
  const router = useRouter();
  const [scans, setScans] = useState<Scan[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!getToken()) { router.replace("/"); return; }
    api.scanHistory(1, 50)
      .then(setScans)
      .catch(() => router.replace("/"))
      .finally(() => setLoading(false));
  }, [router]);

  if (loading) return (
    <div className="flex items-center justify-center min-h-screen">
      <Disc3 size={32} className="animate-spin text-vinyl-muted" />
    </div>
  );

  return (
    <div className="max-w-4xl mx-auto px-4 py-10 flex flex-col gap-8">
      <h1 className="text-3xl font-bold">Scan History</h1>

      {scans.length === 0 ? (
        <div className="card p-12 text-center">
          <Disc3 size={48} className="text-vinyl-muted mx-auto mb-4" />
          <p className="text-vinyl-muted">No scans yet.</p>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {scans.map((scan) => (
            <div key={scan.id} className="card p-5 flex gap-4">
              <div className="flex-1 min-w-0">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-semibold truncate">
                      {scan.artist || "Unknown Artist"} — {scan.title || "Unknown Title"}
                    </p>
                    <div className="flex items-center gap-2 mt-1 flex-wrap">
                      {scan.year && <span className="text-vinyl-muted text-xs">{scan.year}</span>}
                      {scan.label && <span className="text-vinyl-muted text-xs">{scan.label}</span>}
                      {scan.catalog_number && (
                        <span className="text-vinyl-muted text-xs font-mono">{scan.catalog_number}</span>
                      )}
                    </div>
                  </div>
                  <span className={`flex-shrink-0 text-xs px-2 py-1 rounded-full ${STATUS_COLORS[scan.status]}`}>
                    {STATUS_LABELS[scan.status]}
                  </span>
                </div>
                <div className="flex items-center gap-4 mt-3">
                  {scan.confidence != null && (
                    <span className="text-xs text-vinyl-muted">
                      Confidence: <span className={scan.confidence >= 80 ? "text-green-400" : scan.confidence >= 50 ? "text-yellow-400" : "text-vinyl-accent"}>{scan.confidence}%</span>
                    </span>
                  )}
                  {scan.discogs_release_id && (
                    <a href={`https://www.discogs.com/release/${scan.discogs_release_id}`} target="_blank" rel="noopener noreferrer"
                      className="flex items-center gap-1 text-vinyl-muted hover:text-vinyl-text text-xs transition-colors">
                      <ExternalLink size={12} />Discogs
                    </a>
                  )}
                  <span className="text-vinyl-muted text-xs ml-auto">{new Date(scan.created_at).toLocaleString()}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
