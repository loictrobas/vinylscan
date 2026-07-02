"use client";

const COND_COLORS: Record<string, string> = {
  M: "bg-purple-500/15 text-purple-700 dark:text-purple-300 border-purple-500/30",
  NM: "bg-vs-success/15 text-vs-success border-vs-success/30",
  "VG+": "bg-vs-accent/15 text-vs-accent border-vs-accent/30",
  VG: "bg-vs-warning/15 text-vs-warning border-vs-warning/30",
  G: "bg-vs-danger/15 text-vs-danger border-vs-danger/30",
};

function singleColor(c: string) {
  return COND_COLORS[c] ?? "bg-vs-raised text-vs-text-2 border-vs-border";
}

interface CondBadgeProps {
  c: string;
  discCond?: string | null;
  coverCond?: string | null;
  unverified?: boolean;
}

export function CondBadge({ c, discCond, coverCond, unverified }: CondBadgeProps) {
  const disc = discCond ?? c;
  const cover = coverCond ?? null;

  if (cover) {
    // Dual grading: NM/VG+
    const discColor = singleColor(disc);
    const coverColor = singleColor(cover);
    return (
      <span className="inline-flex items-center gap-0.5" title={`Disc: ${disc} / Cover: ${cover}`}>
        <span className={`text-2xs font-medium px-1.5 py-0.5 rounded-l border ${discColor}`}>{disc}</span>
        <span className="text-2xs text-vs-muted">/</span>
        <span className={`text-2xs font-medium px-1.5 py-0.5 rounded-r border ${coverColor}`}>{cover}</span>
      </span>
    );
  }

  const base = singleColor(disc);
  if (unverified) {
    return (
      <span
        title="Default condition — not verified after import"
        aria-label={`${disc} — default condition, not verified after Discogs import`}
        className={`text-2xs font-medium px-1.5 py-0.5 rounded border border-dashed opacity-60 cursor-help ${base}`}
      >
        {disc}?
      </span>
    );
  }
  return (
    <span className={`text-2xs font-medium px-1.5 py-0.5 rounded border ${base}`}>
      {disc}
    </span>
  );
}
