import Image from "next/image";
import { ExternalLink } from "lucide-react";
import type { DiscogsMatch } from "@/lib/api";

interface Props {
  match: DiscogsMatch;
  onSelect: () => void;
  disabled?: boolean;
  confidence?: number | null;
}

function ConfidenceBadge({ confidence }: { confidence: number | null | undefined }) {
  if (confidence == null) return null;
  const label =
    confidence >= 95 ? "Auto-add" : confidence >= 70 ? "Review match" : "Low confidence";
  const color =
    confidence >= 95
      ? "bg-green-500/20 text-green-400 border border-green-500/30"
      : confidence >= 70
      ? "bg-yellow-500/20 text-yellow-400 border border-yellow-500/30"
      : "bg-red-500/20 text-red-400 border border-red-500/30";
  return (
    <span className={`text-xs px-2 py-0.5 rounded-full ${color}`}>
      {label} ({confidence}%)
    </span>
  );
}

export function RecordCard({ match, onSelect, disabled, confidence }: Props) {
  return (
    <div className="card p-4 flex gap-4 hover:border-vinyl-accent transition-colors">
      <div className="flex-shrink-0 w-20 h-20 bg-vinyl-border rounded-lg overflow-hidden relative">
        {match.cover_image ? (
          <Image
            src={match.cover_image}
            alt={match.title}
            fill
            className="object-cover"
            unoptimized
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-vinyl-muted text-xs">
            No image
          </div>
        )}
      </div>

      <div className="flex-1 min-w-0">
        <p className="font-semibold text-vinyl-text truncate">{match.title}</p>
        <p className="text-vinyl-muted text-sm truncate">{match.artist}</p>
        <div className="flex flex-wrap gap-1.5 mt-1.5">
          {match.year && (
            <span className="bg-vinyl-border text-xs px-1.5 py-0.5 rounded">{match.year}</span>
          )}
          {match.format && (
            <span className="bg-vinyl-border text-xs px-1.5 py-0.5 rounded">{match.format}</span>
          )}
          {match.country && (
            <span className="bg-vinyl-border text-xs px-1.5 py-0.5 rounded">{match.country}</span>
          )}
          {match.label && (
            <span className="bg-vinyl-border text-xs px-1.5 py-0.5 rounded truncate max-w-[120px]">
              {match.label}
            </span>
          )}
        </div>
        <div className="mt-2">
          <ConfidenceBadge confidence={confidence} />
        </div>
      </div>

      <div className="flex-shrink-0 flex flex-col gap-2">
        <button
          onClick={onSelect}
          disabled={disabled}
          className="btn-primary text-sm py-2 px-3 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Add this one
        </button>
        {match.resource_url && (
          <a
            href={`https://www.discogs.com/release/${match.release_id}`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1 text-vinyl-muted hover:text-vinyl-text text-xs transition-colors justify-center"
          >
            <ExternalLink size={12} />
            Discogs
          </a>
        )}
      </div>
    </div>
  );
}
