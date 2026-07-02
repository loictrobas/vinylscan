"use client";

import { useEffect } from "react";
import { CheckCircle, Search, Smartphone, Tag, X } from "lucide-react";
import { type ScanUploadResponse } from "@/lib/api";

export type ItemPhase = "queued" | "uploading" | "result" | "confirming" | "done" | "error";

export const CONDITIONS = ["M", "NM", "VG+", "VG", "G"] as const;
export type Condition = typeof CONDITIONS[number];

export const FORMATS = ["LP", "EP", '7"', '12"', "CD", "Cassette", "Box Set", "Other"];

export interface QueueItem {
  id: string;
  file: File;
  file2?: File;
  preview: string;
  preview2?: string;
  extraPreviews?: string[];   // previews of enhance photos (3rd, 4th)
  phase: ItemPhase;
  result?: ScanUploadResponse;
  errorMsg?: string;
  retryable?: boolean;
  confirmedReleaseId?: number;
  listedForSale?: boolean;
  skipped?: boolean;
  condition: Condition;
  coverCondition?: Condition;  // defaults to `condition` (disc) until explicitly set differently
  researching?: boolean;
  slowUpload?: boolean;
  enhancing?: boolean;        // extra photo being processed
  photoCount?: number;        // total photos attached (1–4)
  // Visual matching (P1-P3)
  lowInfoSearchDone?: boolean;
  visualMatching?: boolean;
  visualMatchReleaseId?: number;
  visualMatchReason?: string;
}

export function parseDiscogsReleaseId(input: string): number | null {
  const trimmed = input.trim();
  // Plain number
  const asNum = parseInt(trimmed, 10);
  if (!isNaN(asNum) && String(asNum) === trimmed) return asNum;
  // URL: discogs.com/release/12345 or discogs.com/*/release/12345-...
  const match = trimmed.match(/\/release\/(\d+)/);
  if (match) return parseInt(match[1], 10);
  return null;
}

export function fuzzyKey(artist: string, title: string): string {
  const stripDisambig = (s: string) => s.replace(/\s*\(\d+\)\s*$/, "");
  const norm = (s: string) => stripDisambig(s).toLowerCase().replace(/[^a-z0-9]+/g, "");
  return `${norm(artist)}::${norm(title)}`;
}

// ── Confidence label ─────────────────────────────────────────────────────────
export function ConfidenceLabel({ confidence }: { confidence: number }) {
  if (confidence >= 80) {
    return (
      <span className="flex items-center gap-1.5 text-xs text-vs-success">
        <span className="w-2 h-2 rounded-full bg-vs-success flex-shrink-0" />
        High confidence
      </span>
    );
  }
  if (confidence >= 50) {
    return (
      <span className="flex items-center gap-1.5 text-xs text-vs-warning">
        <span className="w-2 h-2 rounded-full bg-vs-warning flex-shrink-0" />
        Verify matches below
      </span>
    );
  }
  return (
    <span className="flex items-center gap-1.5 text-xs text-vs-danger">
      <span className="w-2 h-2 rounded-full bg-vs-danger flex-shrink-0" />
      Low confidence — check matches
    </span>
  );
}

// ── Condition Picker ─────────────────────────────────────────────────────────
export function ConditionPicker({
  value, onChange, showLabel = true, label = "Condition:",
}: {
  value: Condition; onChange: (c: Condition) => void; showLabel?: boolean; label?: string;
}) {
  return (
    <div className="flex items-center gap-1.5 flex-wrap">
      {showLabel && <span className="text-xs text-vs-muted mr-0.5">{label}</span>}
      {CONDITIONS.map((c) => (
        <button
          key={c}
          onClick={() => onChange(c)}
          className={`text-xs px-2 py-1 rounded font-medium transition-colors ${
            value === c
              ? "bg-vs-accent text-white"
              : "bg-vs-raised border border-vs-border text-vs-muted hover:text-vs-text hover:border-vs-border-2"
          }`}
        >
          {c}
        </button>
      ))}
    </div>
  );
}

// ── Help modal — step-by-step "how this section works" ─────────────────────
const HELP_STEPS = [
  { icon: Smartphone, title: "Shoot from your phone", body: "Open the VinylScan app and take photos of record labels — as many as you want, back to back. No need to wait between shots." },
  { icon: Search, title: "AI reads each one", body: "Each photo streams here automatically. Claude identifies artist, title, label and catalog number, then Discogs finds matching releases — all in the background." },
  { icon: Tag, title: "Pick the right pressing", body: "When matches show up, check label, catalog number, year and country to pick the exact pressing you have — prices and editions can differ a lot." },
  { icon: CheckCircle, title: "Grade and add", body: "Set disc and cover condition separately, optionally set a price, then Add — it goes straight into your catalog." },
];

export function HelpModal({ onClose }: { onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div className="card max-w-md w-full p-5" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <p className="text-sm font-semibold text-vs-text">How scanning works</p>
          <button onClick={onClose} className="text-vs-muted hover:text-vs-text">
            <X size={16} />
          </button>
        </div>
        <div className="flex flex-col gap-4">
          {HELP_STEPS.map((step, i) => (
            <div key={step.title} className="flex gap-3">
              <div className="w-8 h-8 rounded-lg bg-vs-accent/15 flex items-center justify-center flex-shrink-0">
                <step.icon size={15} className="text-vs-accent" />
              </div>
              <div>
                <p className="text-sm text-vs-text font-medium">{i + 1}. {step.title}</p>
                <p className="text-xs text-vs-muted mt-0.5">{step.body}</p>
              </div>
            </div>
          ))}
        </div>
        <button onClick={onClose} className="btn-primary w-full mt-5 text-sm py-2">Got it</button>
      </div>
    </div>
  );
}

// ── Match Card ───────────────────────────────────────────────────────────────
export function ImageLightbox({ url, onClose }: { url: string; onClose: () => void }) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === "Escape") onClose(); }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center"
      onClick={onClose}
    >
      <button
        className="absolute top-4 right-4 p-2 rounded-full bg-black/50 text-white hover:bg-black/70 transition-colors"
        onClick={onClose}
        aria-label="Close"
      >
        <X size={20} />
      </button>
      <img
        src={url}
        alt=""
        className="max-w-[90vw] max-h-[90vh] object-contain rounded-xl shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      />
    </div>
  );
}

// Strategy weight tiers for color coding