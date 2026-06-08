"use client";

const COND_COLORS: Record<string, string> = {
  M: "bg-purple-500/15 text-purple-700 dark:text-purple-300 border-purple-500/30",
  NM: "bg-vs-success/15 text-vs-success border-vs-success/30",
  "VG+": "bg-vs-accent/15 text-vs-accent border-vs-accent/30",
  VG: "bg-vs-warning/15 text-vs-warning border-vs-warning/30",
  G: "bg-vs-danger/15 text-vs-danger border-vs-danger/30",
};

export function CondBadge({ c, unverified }: { c: string; unverified?: boolean }) {
  const base = COND_COLORS[c] ?? "bg-vs-raised text-vs-text-2 border-vs-border";
  if (unverified) {
    return (
      <span
        title="Default condition — not verified after import"
        aria-label={`${c} — default condition, not verified after Discogs import`}
        className={`text-2xs font-medium px-1.5 py-0.5 rounded border border-dashed opacity-60 cursor-help ${base}`}
      >
        {c}?
      </span>
    );
  }
  return (
    <span className={`text-2xs font-medium px-1.5 py-0.5 rounded border ${base}`}>
      {c}
    </span>
  );
}
