"use client";

import { useEffect, useState } from "react";
import { Loader2, ChevronDown, ChevronRight, ExternalLink, Zap } from "lucide-react";
import {
  api,
  type ScanUploadResponse,
  type AdminDebugSearchResult,
} from "@/lib/api";

function confidenceColor(c: number | null | undefined) {
  if (!c) return "text-vs-danger";
  if (c >= 80) return "text-vs-success";
  if (c >= 50) return "text-vs-warning";
  return "text-vs-danger";
}

function FieldRow({ label, value, warn }: { label: string; value: unknown; warn?: boolean }) {
  if (value === null || value === undefined) return null;
  return (
    <div className={`flex gap-2 text-xs ${warn ? "text-vs-warning" : ""}`}>
      <span className="text-vs-muted font-mono w-24 flex-shrink-0">{label}</span>
      <span className="font-medium break-all">{String(value)}</span>
    </div>
  );
}

function StrategyRow({ s }: { s: AdminDebugSearchResult["strategies"][number] }) {
  const [open, setOpen] = useState(s.result_count > 0);
  const hit = s.result_count > 0;
  const paramStr = Object.entries(s.params).map(([k, v]) => `${k}=${v}`).join(" · ");

  return (
    <div className={`rounded border ${hit ? "border-vs-border" : "border-vs-border/30 opacity-50"}`}>
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center gap-1.5 px-2.5 py-1.5 text-left"
      >
        {open ? <ChevronDown size={10} /> : <ChevronRight size={10} />}
        <span className={`font-mono font-semibold text-2xs w-32 flex-shrink-0 ${hit ? "text-vs-accent" : "text-vs-muted"}`}>
          {s.name}
        </span>
        <span className="text-vs-muted/70 truncate flex-1 text-2xs">{paramStr}</span>
        <span className={`flex-shrink-0 text-xs font-medium ${hit ? "text-vs-success" : "text-vs-muted"}`}>
          {s.result_count}
        </span>
      </button>
      {open && s.top_results.length > 0 && (
        <div className="border-t border-vs-border/30 px-2.5 py-1.5 flex flex-col gap-1">
          {s.top_results.slice(0, 3).map((r) => (
            <div key={r.id} className="flex items-center gap-1.5 text-2xs">
              {r.cover_image && !r.cover_image.includes("spacer") ? (
                <img src={r.cover_image} alt="" className="w-5 h-5 rounded object-cover flex-shrink-0" />
              ) : (
                <div className="w-5 h-5 rounded bg-vs-raised border border-vs-border flex-shrink-0" />
              )}
              <span className="truncate flex-1 text-vs-text">{r.title}</span>
              {r.catno && <span className="font-mono text-vs-accent/70 flex-shrink-0">{r.catno}</span>}
              <span className="text-vs-muted/60 flex-shrink-0">{r._score}</span>
              <a
                href={`https://www.discogs.com/release/${r.id}`}
                target="_blank" rel="noopener noreferrer"
                className="text-vs-muted hover:text-vs-text flex-shrink-0"
              >
                <ExternalLink size={9} />
              </a>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function ScanDebugPanel({
  scanId,
  result,
}: {
  scanId: string | null;
  result: ScanUploadResponse | null;
}) {
  const [debug, setDebug] = useState<AdminDebugSearchResult | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!scanId) { setDebug(null); return; }
    setDebug(null);
    setLoading(true);
    api.adminDebugSearch(scanId)
      .then(setDebug)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [scanId]);

  if (!scanId && !result) {
    return (
      <div className="card p-5 flex flex-col items-center justify-center gap-3 text-center h-48">
        <Zap size={20} className="text-vs-muted/40" />
        <div>
          <p className="text-sm font-medium text-vs-text">Debug panel</p>
          <p className="text-xs text-vs-muted mt-0.5">
            Upload a record — Claude output and search strategies appear here.
          </p>
        </div>
      </div>
    );
  }

  const claudeRaw = debug?.claude_raw ?? null;
  const tracklist = (claudeRaw?.tracklist as Array<{ position: string; title: string }> | null) ?? [];
  const hitCount = debug?.strategies.filter((s) => s.result_count > 0).length ?? 0;
  const totalCount = debug?.strategies.length ?? 0;

  return (
    <div className="flex flex-col gap-3">
      {/* Scan ID + loading indicator */}
      <div className="flex items-center justify-between px-0.5">
        {scanId && (
          <span className="text-2xs font-mono text-vs-muted/50">scan {scanId.slice(0, 8)}…</span>
        )}
        {loading && (
          <span className="flex items-center gap-1 text-2xs text-vs-muted ml-auto">
            <Loader2 size={10} className="animate-spin" />
            searching…
          </span>
        )}
      </div>

      {/* Claude detected */}
      {result && (
        <div className="card p-3.5">
          <p className="text-2xs text-vs-muted font-medium uppercase tracking-wider mb-2">Claude detected</p>
          <div className="flex flex-col gap-0.5">
            <FieldRow label="artist" value={result.artist} />
            <FieldRow label="title" value={result.title} />
            <FieldRow label="year" value={result.year} />
            <FieldRow label="label" value={result.label} />
            <FieldRow label="catalog_no" value={result.catalog_number} />
            <FieldRow
              label="confidence"
              value={`${result.confidence}%`}
              warn={result.confidence < 70}
            />
            <FieldRow
              label="low_info"
              value={result.low_information ? "true ⚠️" : "false"}
              warn={result.low_information}
            />
            {/* alt readings from scan result */}
            {result.artist_alt && <FieldRow label="artist_alt" value={result.artist_alt} />}
            {result.title_alt && <FieldRow label="title_alt" value={result.title_alt} />}
            {/* extras from full claude_raw (only after debug search) */}
            {claudeRaw?.reasoning ? (
              <p className="text-2xs text-vs-muted italic mt-1.5">
                &ldquo;{String(claudeRaw.reasoning)}&rdquo;
              </p>
            ) : null}
          </div>

          {/* Tracklist — only available after debug search returns claude_raw */}
          {tracklist.length > 0 && (
            <div className="mt-2.5 pt-2.5 border-t border-vs-border/40">
              <p className="text-2xs text-vs-muted font-mono mb-1">tracklist ({tracklist.length})</p>
              <div className="flex flex-col gap-0.5">
                {tracklist.map((t, i) => (
                  <div key={`${t.position}-${i}`} className="flex gap-2 text-xs">
                    <span className="text-vs-muted font-mono w-6 flex-shrink-0">{t.position}</span>
                    <span className="text-vs-text">{t.title}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Search strategies */}
      {debug && (
        <div className="card p-3.5">
          <p className="text-2xs text-vs-muted font-medium uppercase tracking-wider mb-2">
            Strategies <span className="normal-case font-mono text-vs-accent">({hitCount}/{totalCount} hit)</span>
          </p>
          <div className="flex flex-col gap-1">
            {debug.strategies.map((s) => (
              <StrategyRow key={s.name + JSON.stringify(s.params)} s={s} />
            ))}
          </div>
        </div>
      )}

      {/* Final ranking */}
      {debug && debug.ranked.length > 0 && (
        <div className="card p-3.5">
          <p className="text-2xs text-vs-muted font-medium uppercase tracking-wider mb-2">Final ranking</p>
          <div className="flex flex-col gap-1.5">
            {debug.ranked.map((r, i) => (
              <div key={r.id} className="flex items-center gap-2 text-xs">
                <span className="text-vs-muted font-mono w-4 text-center flex-shrink-0">{i + 1}</span>
                {r.cover_image && !r.cover_image.includes("spacer") ? (
                  <img src={r.cover_image} alt="" className="w-6 h-6 rounded object-cover flex-shrink-0" />
                ) : (
                  <div className="w-6 h-6 rounded bg-vs-raised border border-vs-border flex-shrink-0" />
                )}
                <div className="flex-1 min-w-0">
                  <p className="text-vs-text truncate">{r.title}</p>
                  <div className="flex gap-1.5 text-2xs text-vs-muted flex-wrap">
                    {r.catno && <span className="font-mono">{r.catno}</span>}
                    {r._match_reason && <span className="text-vs-accent">{r._match_reason}</span>}
                    <span>score {r._score}</span>
                    {r._hit_strategies.length > 0 && (
                      <span className="text-vs-muted/50">{r._hit_strategies.join(", ")}</span>
                    )}
                  </div>
                </div>
                <a
                  href={`https://www.discogs.com/release/${r.id}`}
                  target="_blank" rel="noopener noreferrer"
                  className="text-vs-muted hover:text-vs-text flex-shrink-0"
                >
                  <ExternalLink size={10} />
                </a>
              </div>
            ))}
          </div>
        </div>
      )}

      {debug && debug.ranked.length === 0 && (
        <div className="card p-3 text-center">
          <p className="text-xs text-vs-muted">No results in final ranking.</p>
        </div>
      )}
    </div>
  );
}
