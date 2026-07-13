"use client";

import { useEffect, useState } from "react";
import { ChevronDown, ChevronRight, ExternalLink, Loader2 } from "lucide-react";
import { api, type AdminDebugSearchResult, type ScanUploadResponse } from "@/lib/api";

const _STRATEGY_WEIGHTS: Record<string, number> = {
  "matrix_code": 15, "matrix+label": 14,
  "catno+label": 12, "catno": 10, "catno+country": 9,
  "tracklist": 8, "label+title": 5,
  "q=artist_phrase": 4.5, "artist+release_title": 4,
  "artist+title+country": 3.8, "label+year": 3.5,
  "q=combined+year": 3, "artist+title+y-1": 2.8, "artist+title+y+1": 2.8,
  "q=combined": 2, "q=title": 1, "q=artist": 0.5,
};
function strategyTier(name: string): "high" | "mid" | "low" {
  const w = _STRATEGY_WEIGHTS[name] ?? 1;
  if (w >= 9) return "high";
  if (w >= 3.5) return "mid";
  return "low";
}

// ── Debug Side Panel (per-card, inline) ──────────────────────────────────────
function DebugStrategyRow({ s }: { s: AdminDebugSearchResult["strategies"][number] }) {
  const [open, setOpen] = useState(s.result_count > 0);
  const hit = s.result_count > 0;
  const tier = strategyTier(s.name);
  const tierColor = hit
    ? tier === "high" ? "text-vs-success" : tier === "mid" ? "text-vs-warning" : "text-vs-accent"
    : "text-vs-muted";
  const borderColor = hit
    ? tier === "high" ? "border-green-500/40" : tier === "mid" ? "border-amber-500/40" : "border-vs-border"
    : "border-vs-border/30 opacity-40";

  const weight = _STRATEGY_WEIGHTS[s.name];
  const paramStr = Object.entries(s.params).map(([k, v]) => `${k}=${v}`).join(" · ");

  return (
    <div className={`rounded border text-2xs ${borderColor}`}>
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center gap-1 px-2 py-1 text-left"
      >
        {open ? <ChevronDown size={9} /> : <ChevronRight size={9} />}
        <span className={`font-mono font-semibold w-28 flex-shrink-0 truncate ${tierColor}`}>
          {s.name}
        </span>
        {weight !== undefined && (
          <span className="text-vs-muted/50 text-[9px] flex-shrink-0">w{weight}</span>
        )}
        <span className="text-vs-muted/50 truncate flex-1 text-[9px] ml-1">{paramStr}</span>
        {s.error ? (
          <span className="flex-shrink-0 font-mono text-[9px] text-vs-danger" title={s.error}>
            {s.error === "rate_limited" ? "429" : s.error === "auth_error" ? "401" : "err"}
          </span>
        ) : (
          <span className={`flex-shrink-0 font-medium ${hit ? tierColor : "text-vs-muted"}`}>
            {s.result_count}
          </span>
        )}
      </button>
      {open && s.top_results.length > 0 && (
        <div className="border-t border-vs-border/30 px-2 py-1 flex flex-col gap-0.5">
          {s.top_results.slice(0, 2).map((r) => (
            <div key={r.id} className="flex items-center gap-1 text-2xs">
              {r.cover_image && !r.cover_image.includes("spacer") ? (
                <img src={r.cover_image} alt="" className="w-4 h-4 rounded object-cover flex-shrink-0" />
              ) : (
                <div className="w-4 h-4 rounded bg-vs-raised border border-vs-border flex-shrink-0" />
              )}
              <span className="truncate flex-1 text-vs-text">{r.title}</span>
              {r.catno && <span className="font-mono text-vs-accent/70 flex-shrink-0 text-[9px]">{r.catno}</span>}
              <a
                href={`https://www.discogs.com/release/${r.id}`}
                target="_blank" rel="noopener noreferrer"
                className="text-vs-muted hover:text-vs-text flex-shrink-0"
                onClick={(e) => e.stopPropagation()}
              >
                <ExternalLink size={8} />
              </a>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function DebugSidePanel({ scanId, result }: { scanId: string; result: ScanUploadResponse }) {
  const [debug, setDebug] = useState<AdminDebugSearchResult | null>(null);
  const [loading, setLoading] = useState(false);

  // Runs the full, un-short-circuited strategy set (13-24 Discogs calls) just to
  // show the breakdown — opt-in on click, not on every card render, so casually
  // looking at scans doesn't quietly burn through the rate limit.
  useEffect(() => {
    setDebug(null);
    setLoading(false);
  }, [scanId]);

  function loadDebug() {
    setLoading(true);
    api.adminDebugSearch(scanId)
      .then(setDebug)
      .catch(() => {})
      .finally(() => setLoading(false));
  }

  const claudeRaw = debug?.claude_raw ?? null;
  const tracklist = (claudeRaw?.tracklist as Array<{ position: string; title: string }> | null) ?? [];
  const hitCount = debug?.strategies.filter((s) => s.result_count > 0).length ?? 0;
  const totalCount = debug?.strategies.length ?? 0;

  return (
    <div className="p-3 flex flex-col gap-2.5 h-full overflow-y-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <span className="text-2xs font-mono text-vs-muted/50">scan {scanId.slice(0, 8)}…</span>
        {loading ? (
          <span className="flex items-center gap-1 text-2xs text-vs-muted">
            <Loader2 size={9} className="animate-spin" />searching…
          </span>
        ) : !debug ? (
          <button
            onClick={loadDebug}
            className="text-2xs text-vs-accent underline hover:opacity-70"
            title="Runs the full strategy set against Discogs — costs API calls"
          >
            Load strategies
          </button>
        ) : null}
      </div>

      {/* Claude detected */}
      <div className="bg-vs-raised/60 rounded-lg p-2.5 flex flex-col gap-0.5">
        <p className="text-2xs text-vs-muted font-medium uppercase tracking-wider mb-1">Claude detected</p>
        {([
          ["artist", result.artist],
          ["title", result.title],
          ["year", result.year],
          ["label", result.label],
          ["catalog", result.catalog_number],
          ["barcode", result.barcode],
          ["confidence", `${result.confidence}%`],
          ["int_conf", result.internal_confidence != null ? `${result.internal_confidence}%` : null],
          // extras from full claude_raw (available after debug fetch)
          ["matrix", claudeRaw?.matrix_code],
          ["country", claudeRaw?.country],
          ["genre", claudeRaw?.genre],
          ["format", claudeRaw?.format],
          ["artist_alt", result.artist_alt],
          ["title_alt", result.title_alt],
        ] as [string, unknown][]).map(([lbl, value]) => value != null && value !== "" && (
          <div key={lbl} className="flex gap-2 text-2xs">
            <span className="text-vs-muted font-mono w-16 flex-shrink-0">{lbl}</span>
            <span className={`font-medium break-all ${lbl === "confidence" && result.confidence < 70 ? "text-vs-warning" : lbl === "int_conf" && (result.internal_confidence ?? 0) < 50 ? "text-vs-warning" : ""}`}>
              {String(value)}
            </span>
          </div>
        ))}
        {result.low_information && (
          <div className="flex gap-2 text-2xs text-vs-warning">
            <span className="text-vs-muted font-mono w-16 flex-shrink-0">low_info</span>
            <span className="font-medium">true ⚠️</span>
          </div>
        )}
        {claudeRaw?.reasoning ? (
          <p className="text-2xs text-vs-muted italic mt-1">
            &ldquo;{String(claudeRaw.reasoning)}&rdquo;
          </p>
        ) : null}
        {tracklist.length > 0 && (
          <div className="mt-1.5 pt-1.5 border-t border-vs-border/40">
            <p className="text-2xs text-vs-muted font-mono mb-0.5">tracklist ({tracklist.length})</p>
            {tracklist.slice(0, 5).map((t, i) => (
              <div key={`${t.position}-${i}`} className="flex gap-1.5 text-2xs">
                <span className="text-vs-muted font-mono w-5 flex-shrink-0">{t.position}</span>
                <span className="text-vs-text truncate">{t.title}</span>
              </div>
            ))}
            {tracklist.length > 5 && (
              <p className="text-2xs text-vs-muted/50 mt-0.5">+{tracklist.length - 5} more…</p>
            )}
          </div>
        )}
      </div>

      {/* Strategies */}
      {debug && (
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-2">
            <p className="text-2xs text-vs-muted font-medium uppercase tracking-wider">
              Strategies <span className="normal-case font-mono text-vs-accent">({hitCount}/{totalCount})</span>
            </p>
            <div className="flex items-center gap-1.5 ml-auto">
              <span className="w-1.5 h-1.5 rounded-full bg-vs-success inline-block" />
              <span className="text-[9px] text-vs-muted">high</span>
              <span className="w-1.5 h-1.5 rounded-full bg-amber-400 inline-block ml-1" />
              <span className="text-[9px] text-vs-muted">mid</span>
              <span className="w-1.5 h-1.5 rounded-full bg-vs-accent inline-block ml-1" />
              <span className="text-[9px] text-vs-muted">low</span>
            </div>
          </div>
          {debug.strategies.map((s) => (
            <DebugStrategyRow key={s.name + JSON.stringify(s.params)} s={s} />
          ))}
        </div>
      )}

      {/* Final ranking */}
      {debug && debug.ranked.length > 0 && (
        <div className="flex flex-col gap-2">
          <p className="text-2xs text-vs-muted font-medium uppercase tracking-wider">Final ranking</p>
          {debug.ranked.map((r, i) => {
            const bd = r._breakdown;
            return (
              <div key={r.id} className="flex items-start gap-1.5 text-2xs">
                <span className="text-vs-muted font-mono w-3 text-center flex-shrink-0 mt-0.5">{i + 1}</span>
                {r.cover_image && !r.cover_image.includes("spacer") ? (
                  <img src={r.cover_image} alt="" className="w-5 h-5 rounded object-cover flex-shrink-0 mt-0.5" />
                ) : (
                  <div className="w-5 h-5 rounded bg-vs-raised border border-vs-border flex-shrink-0 mt-0.5" />
                )}
                <div className="flex-1 min-w-0">
                  <p className="text-vs-text truncate">{r.title}</p>
                  <div className="flex gap-1 text-2xs text-vs-muted flex-wrap mt-0.5">
                    {r.catno && <span className="font-mono">{r.catno}</span>}
                    {r._match_reason && <span className="text-vs-accent">{r._match_reason}</span>}
                  </div>
                  {/* Score breakdown */}
                  {bd && (
                    <div className="mt-0.5 flex flex-col gap-px">
                      {/* Hit strategies with weights */}
                      <div className="flex flex-wrap gap-x-1.5 gap-y-px">
                        {Object.entries(bd.hit_weights).map(([s, w]) => (
                          <span key={s} className={`font-mono text-[9px] ${strategyTier(s) === "high" ? "text-vs-success" : strategyTier(s) === "mid" ? "text-amber-400" : "text-vs-accent/70"}`}>
                            {s}(+{w})
                          </span>
                        ))}
                      </div>
                      {/* Penalties / bonuses */}
                      <div className="flex gap-2 text-[9px] text-vs-muted flex-wrap">
                        {bd.b2_factor !== null && bd.b2_factor !== undefined ? (
                          <span className="text-vs-danger">B2 sim={bd.b2_sim} ×{bd.b2_factor}</span>
                        ) : bd.b2_sim !== null && bd.b2_sim !== undefined ? (
                          <span className="text-vs-success/70">sim={bd.b2_sim} ✓</span>
                        ) : null}
                        {bd.b3_cd && <span className="text-vs-danger">B3 CD×0.05</span>}
                        {bd.b6_cover > 0 && <span className="text-vs-muted/60">cover+{bd.b6_cover}</span>}
                        <span className="font-mono text-vs-text/80">= {r._score}</span>
                      </div>
                    </div>
                  )}
                  {!bd && <span className="text-[9px] text-vs-muted font-mono">score {r._score}</span>}
                </div>
                <a
                  href={`https://www.discogs.com/release/${r.id}`}
                  target="_blank" rel="noopener noreferrer"
                  className="text-vs-muted hover:text-vs-text flex-shrink-0 mt-0.5"
                  onClick={(e) => e.stopPropagation()}
                >
                  <ExternalLink size={9} />
                </a>
              </div>
            );
          })}
        </div>
      )}

      {debug && debug.ranked.length === 0 && !loading && (
        <p className="text-2xs text-vs-muted text-center py-2">No results in final ranking.</p>
      )}
    </div>
  );
}

// ── Scan Item ────────────────────────────────────────────────────────────────