"use client";

import { useEffect, useState } from "react";
import { Camera, ExternalLink, Loader2, Music, Plus } from "lucide-react";
import { api, type DiscogsMatch } from "@/lib/api";
import { fuzzyKey } from "./shared";

export function MatchCard({
  match, onAdd, disabled, isAdding,
  ownedReleaseIds, ownedFuzzyKeys,
  askingPrice, costPrice, onAskingPriceChange, onCostPriceChange,
  isFirst, matchReason, isVisualMatch, onImageClick, priceStep, highlightDisambiguation,
}: {
  match: DiscogsMatch;
  onAdd: () => void;
  disabled: boolean;
  isAdding: boolean;
  ownedReleaseIds: Set<number>;
  ownedFuzzyKeys: Set<string>;
  askingPrice: string;
  costPrice: string;
  onAskingPriceChange: (v: string) => void;
  onCostPriceChange: (v: string) => void;
  isFirst: boolean;
  matchReason?: string | null;
  isVisualMatch?: boolean;
  onImageClick?: (url: string) => void;
  priceStep: number;
  highlightDisambiguation?: boolean;
}) {
  const exactOwned = ownedReleaseIds.has(match.release_id);
  const fuzzyOwned = !exactOwned && ownedFuzzyKeys.has(fuzzyKey(match.artist, match.title));
  const [price, setPrice] = useState<{ lowest: number; currency: string; num_for_sale: number } | null | "loading">("loading");

  useEffect(() => {
    api.getPricing(match.release_id)
      .then((d) => setPrice(d.pricing))
      .catch(() => setPrice(null));
  }, [match.release_id]);

  return (
    <div className={`rounded-xl border p-3.5 transition-colors ${isVisualMatch ? "border-vs-success/40 bg-vs-success/5" : exactOwned ? "border-vs-accent/40 bg-vs-accent/5" : "border-vs-border bg-vs-card"}`}>
      {isVisualMatch && (
        <div className="flex items-center gap-1.5 text-xs text-vs-success font-medium mb-2.5">
          <Camera size={11} />
          Visual match — artwork resembles your photo
        </div>
      )}
      <div className="flex gap-3 items-start">
        {/* Cover */}
        <div
          className={`w-14 h-14 flex-shrink-0 rounded-lg overflow-hidden bg-vs-raised border border-vs-border ${
            match.cover_image && onImageClick ? "cursor-zoom-in hover:opacity-90 transition-opacity" : ""
          }`}
          onClick={() => {
            if (match.cover_image && onImageClick && !match.cover_image.includes("spacer")) {
              onImageClick(match.cover_image);
            }
          }}
        >
          {match.cover_image ? (
            <img src={match.cover_image} alt={match.title} className="w-full h-full object-cover"
              onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }} />
          ) : (
            <div className="w-full h-full flex items-center justify-center">
              <Music size={18} className="text-vs-muted" />
            </div>
          )}
        </div>

        {/* Info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="font-medium text-sm text-vs-text leading-tight">{match.artist}</p>
              <p className="text-vs-muted text-sm truncate">{match.title}</p>
            </div>
            {exactOwned && (
              <span className="text-2xs px-1.5 py-0.5 rounded-full bg-vs-accent/20 text-vs-accent font-medium flex-shrink-0 whitespace-nowrap">Owned</span>
            )}
            {!exactOwned && fuzzyOwned && (
              <span className="text-2xs px-1.5 py-0.5 rounded-full bg-vs-muted/20 text-vs-muted font-medium flex-shrink-0 whitespace-nowrap">Different pressing</span>
            )}
          </div>
          <div className="grid grid-cols-2 gap-x-6 gap-y-1 mt-2 text-xs">
            <div className="flex flex-col gap-1">
              {match.label && (
                <div className="flex gap-1.5">
                  <span className="text-vs-muted/70 font-medium uppercase tracking-wide text-2xs w-12 flex-shrink-0 pt-px">Label</span>
                  <span className="text-vs-text">{match.label}</span>
                </div>
              )}
              {match.catno && (
                <div className="flex gap-1.5">
                  <span className="text-vs-muted/70 font-medium uppercase tracking-wide text-2xs w-12 flex-shrink-0 pt-px">Catalog</span>
                  <span className="text-vs-text font-mono">{match.catno}</span>
                </div>
              )}
            </div>
            <div className="flex flex-col gap-1">
              {match.format && (
                <div className="flex gap-1.5">
                  <span className="text-vs-muted/70 font-medium uppercase tracking-wide text-2xs w-12 flex-shrink-0 pt-px">Format</span>
                  <span className="text-vs-text">{match.format}</span>
                </div>
              )}
              {match.year && (
                <div className="flex gap-1.5 items-baseline">
                  <span className={`font-medium uppercase tracking-wide text-2xs w-12 flex-shrink-0 ${highlightDisambiguation ? "text-vs-warning" : "text-vs-muted/70"}`}>Year</span>
                  <span className={highlightDisambiguation ? "text-vs-warning font-semibold" : "text-vs-text"}>{match.year}</span>
                </div>
              )}
              {match.country && (
                <div className="flex gap-1.5 items-baseline">
                  <span className={`font-medium uppercase tracking-wide text-2xs w-12 flex-shrink-0 ${highlightDisambiguation ? "text-vs-warning" : "text-vs-muted/70"}`}>From</span>
                  <span className={highlightDisambiguation ? "text-vs-warning font-semibold" : "text-vs-text"}>{match.country}</span>
                </div>
              )}
            </div>
          </div>
          {(matchReason?.includes("Catalog") || matchReason === "Artist & title match") && (
            <div className="mt-1.5">
              <span className={`flex items-center gap-1 text-2xs font-medium w-fit ${matchReason?.includes("Catalog") ? "text-vs-success" : "text-vs-accent"}`}>
                <span className={`w-1.5 h-1.5 rounded-full inline-block ${matchReason?.includes("Catalog") ? "bg-vs-success" : "bg-vs-accent"}`} />
                {matchReason}
              </span>
            </div>
          )}
          <div className="flex items-center gap-3 mt-1.5">
            {price === "loading" ? (
              <span className="text-xs text-vs-muted flex items-center gap-1">
                <Loader2 size={10} className="animate-spin" />price…
              </span>
            ) : price ? (
              <span className="text-xs text-vs-gold font-semibold">
                {price.currency} {price.lowest.toFixed(2)}
                <span className="text-vs-muted font-normal ml-1">({price.num_for_sale} for sale)</span>
              </span>
            ) : null}
            <a
              href={`https://www.discogs.com/release/${match.release_id}`}
              target="_blank" rel="noopener noreferrer"
              className="flex items-center gap-1 text-xs text-vs-muted hover:text-vs-text transition-colors"
              onClick={(e) => e.stopPropagation()}
            >
              <ExternalLink size={10} />Discogs
            </a>
          </div>
        </div>
      </div>

      {/* Price inputs + Add */}
      <div className="flex items-center gap-2 mt-3 pt-3 border-t border-vs-border">
        <div className="flex items-center gap-1">
          <span className="text-vs-muted text-xs flex-shrink-0">Price $</span>
          <input
            type="number" min="0" step={priceStep} placeholder="0.00"
            value={askingPrice}
            onChange={(e) => onAskingPriceChange(e.target.value)}
            onClick={(e) => e.stopPropagation()}
            className="w-[4.5rem] bg-vs-raised border border-vs-border-2 rounded px-2 py-1 text-xs text-vs-text focus:outline-none focus:border-vs-accent"
          />
        </div>
        <div className="flex items-center gap-1">
          <span className="text-vs-muted text-xs flex-shrink-0">Cost $</span>
          <input
            type="number" min="0" step={priceStep} placeholder="0.00"
            value={costPrice}
            onChange={(e) => onCostPriceChange(e.target.value)}
            onClick={(e) => e.stopPropagation()}
            className="w-[4.5rem] bg-vs-raised border border-vs-border-2 rounded px-2 py-1 text-xs text-vs-text focus:outline-none focus:border-vs-accent"
          />
        </div>
        <button
          onClick={onAdd}
          disabled={disabled}
          className="btn-primary text-sm py-1.5 px-3.5 flex items-center gap-1.5 disabled:opacity-50 flex-shrink-0 ml-auto"
        >
          {isAdding ? <Loader2 size={13} className="animate-spin" /> : <Plus size={13} />}
          {exactOwned ? "Add copy" : "Add"}
          {isFirst && <span className="text-2xs opacity-60 ml-0.5">[↵]</span>}
        </button>
      </div>
    </div>
  );
}

// ── Low Info Search Form (P1/P2) ─────────────────────────────────────────────