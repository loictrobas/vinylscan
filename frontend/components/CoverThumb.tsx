"use client";
import { useState } from "react";
import { Disc3 } from "lucide-react";

export function CoverThumb({ url, large = false }: { url: string | null | undefined; large?: boolean }) {
  const [err, setErr] = useState(false);
  const cls = large
    ? "w-16 h-16 rounded-xl flex-shrink-0 border border-vs-border"
    : "w-10 h-10 rounded-lg flex-shrink-0 border border-vs-border";
  if (!url || err) {
    return (
      <div className={`${cls} bg-vs-raised flex items-center justify-center`}>
        <Disc3 size={large ? 22 : 14} className="text-vs-muted" />
      </div>
    );
  }
  return (
    <img src={url} alt="" loading="lazy" onError={() => setErr(true)} className={`${cls} object-cover`} />
  );
}
