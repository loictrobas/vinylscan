"use client";

import { useRef, useState } from "react";
import { Camera, Upload, CheckCircle, AlertCircle, Loader2, X } from "lucide-react";
import { api, type ScanUploadResponse } from "@/lib/api";
import { RecordCard } from "./RecordCard";

type Phase = "idle" | "uploading" | "result" | "confirming" | "done" | "error";

interface DoneInfo {
  artist: string | null;
  title: string | null;
  releaseId: number | null;
  wasAuto: boolean;
  skipped?: boolean;
}

export function ScanInterface() {
  const fileRef = useRef<HTMLInputElement>(null);
  const [phase, setPhase] = useState<Phase>("idle");
  const [preview, setPreview] = useState<string | null>(null);
  const [result, setResult] = useState<ScanUploadResponse | null>(null);
  const [done, setDone] = useState<DoneInfo | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [confirmingId, setConfirmingId] = useState<number | null>(null);

  function reset() {
    setPhase("idle");
    setPreview(null);
    setResult(null);
    setDone(null);
    setErrorMsg(null);
    setConfirmingId(null);
  }

  async function handleFile(file: File) {
    setPreview(URL.createObjectURL(file));
    setPhase("uploading");
    setErrorMsg(null);
    try {
      const res = await api.uploadScan(file);
      if (res.error === "identification_failed") {
        setErrorMsg("Could not identify the record. Please try a clearer photo.");
        setPhase("error");
        return;
      }
      setResult(res);
      if (res.auto_added) {
        setDone({ artist: res.artist, title: res.title, releaseId: res.discogs_release_id, wasAuto: true });
        setPhase("done");
      } else {
        setPhase("result");
      }
    } catch (err: unknown) {
      const e = err as { status?: number; data?: { error?: string } };
      if (e?.status === 403 || e?.data?.error === "no_credits") {
        setErrorMsg("No credits remaining. Purchase more credits to continue scanning.");
      } else {
        setErrorMsg("Upload failed. Please try again.");
      }
      setPhase("error");
    }
  }

  async function handleConfirm(releaseId: number) {
    if (!result) return;
    setConfirmingId(releaseId);
    setPhase("confirming");
    try {
      await api.confirmScan(result.scan_id, releaseId);
      setDone({ artist: result.artist, title: result.title, releaseId, wasAuto: false });
      setPhase("done");
    } catch {
      setErrorMsg("Failed to add to Discogs. Please try again.");
      setPhase("result");
    } finally {
      setConfirmingId(null);
    }
  }

  async function handleSkip() {
    if (!result) return;
    setPhase("confirming");
    try {
      await api.skipScan(result.scan_id);
      setDone({ artist: result.artist, title: result.title, releaseId: null, wasAuto: false, skipped: true });
      setPhase("done");
    } catch {
      setErrorMsg("Skip failed. Please try again.");
      setPhase("result");
    }
  }

  return (
    <div className="max-w-xl mx-auto">
      {phase === "idle" && (
        <div className="card p-8 flex flex-col items-center gap-6 text-center">
          <div className="w-20 h-20 rounded-full bg-vinyl-border flex items-center justify-center">
            <Camera size={36} className="text-vinyl-accent" />
          </div>
          <div>
            <h2 className="text-xl font-bold mb-1">Scan a Record</h2>
            <p className="text-vinyl-muted text-sm">Take a photo or upload an image of the cover or label</p>
          </div>
          <div className="flex flex-col sm:flex-row gap-3 w-full">
            <button
              onClick={() => fileRef.current?.click()}
              className="btn-primary flex-1 flex items-center justify-center gap-2"
            >
              <Camera size={18} />
              Use Camera
            </button>
            <button
              onClick={() => {
                if (fileRef.current) {
                  fileRef.current.removeAttribute("capture");
                  fileRef.current.click();
                }
              }}
              className="btn-secondary flex-1 flex items-center justify-center gap-2"
            >
              <Upload size={18} />
              Upload File
            </button>
          </div>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) handleFile(f);
              e.target.value = "";
            }}
          />
        </div>
      )}

      {phase === "uploading" && (
        <div className="card p-8 flex flex-col items-center gap-6 text-center">
          {preview && (
            <img src={preview} alt="preview" className="w-40 h-40 object-cover rounded-xl" />
          )}
          <Loader2 size={36} className="text-vinyl-accent animate-spin" />
          <div>
            <p className="text-lg font-semibold">Identifying your record...</p>
            <p className="text-vinyl-muted text-sm mt-1">Claude AI is analyzing the image</p>
          </div>
        </div>
      )}

      {phase === "result" && result && (
        <div className="flex flex-col gap-4">
          <div className="card p-4 flex items-center gap-4">
            {preview && (
              <img src={preview} alt="preview" className="w-16 h-16 object-cover rounded-lg flex-shrink-0" />
            )}
            <div>
              <p className="font-semibold">{result.artist} — {result.title}</p>
              {result.year && <p className="text-vinyl-muted text-sm">{result.year}</p>}
              <div className="flex items-center gap-1.5 mt-1">
                <div className={`w-2 h-2 rounded-full ${result.confidence >= 80 ? "bg-green-500" : result.confidence >= 50 ? "bg-yellow-500" : "bg-red-500"}`} />
                <span className="text-xs text-vinyl-muted">Confidence: {result.confidence}%</span>
              </div>
            </div>
          </div>

          {result.matches.length > 0 ? (
            <>
              <p className="text-sm text-vinyl-muted px-1">Select the correct release to add to your Discogs collection:</p>
              {result.matches.map((m) => (
                <RecordCard
                  key={m.release_id}
                  match={m}
                  onSelect={() => handleConfirm(m.release_id)}
                  disabled={(phase as Phase) === "confirming"}
                  confidence={result.confidence}
                />
              ))}
            </>
          ) : (
            <div className="card p-4 text-center text-vinyl-muted">
              No matches found on Discogs for this record.
            </div>
          )}

          <div className="flex items-center justify-between pt-2">
            <p className="text-xs text-vinyl-muted">1 credit will be used on confirmation or skip</p>
            <button
              onClick={handleSkip}
              disabled={(phase as Phase) === "confirming"}
              className="text-vinyl-muted hover:text-vinyl-text text-sm transition-colors disabled:opacity-50"
            >
              None of these / Skip
            </button>
          </div>
        </div>
      )}

      {phase === "confirming" && (
        <div className="card p-8 flex flex-col items-center gap-4">
          <Loader2 size={32} className="text-vinyl-accent animate-spin" />
          <p className="text-vinyl-muted">Adding to your Discogs collection...</p>
        </div>
      )}

      {phase === "done" && done && (
        <div className="card p-8 flex flex-col items-center gap-4 text-center">
          <CheckCircle size={48} className="text-green-500" />
          {done.skipped ? (
            <>
              <h3 className="text-xl font-bold">Skipped</h3>
              <p className="text-vinyl-muted text-sm">1 credit used</p>
            </>
          ) : (
            <>
              <h3 className="text-xl font-bold">
                {done.wasAuto ? "Auto-added to Discogs!" : "Added to Discogs!"}
              </h3>
              <p className="font-medium">{done.artist} — {done.title}</p>
              {done.releaseId && (
                <a
                  href={`https://www.discogs.com/release/${done.releaseId}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-vinyl-accent hover:underline text-sm"
                >
                  View on Discogs →
                </a>
              )}
              <p className="text-vinyl-muted text-sm">1 credit used</p>
            </>
          )}
          <button onClick={reset} className="btn-primary mt-2">
            Scan Another
          </button>
        </div>
      )}

      {phase === "error" && (
        <div className="card p-8 flex flex-col items-center gap-4 text-center">
          <AlertCircle size={48} className="text-vinyl-accent" />
          <h3 className="text-xl font-bold">Something went wrong</h3>
          <p className="text-vinyl-muted text-sm">{errorMsg}</p>
          <div className="flex gap-3">
            <button onClick={reset} className="btn-secondary">Try Again</button>
            {errorMsg?.includes("credits") && (
              <a href="/credits" className="btn-primary">Buy Credits</a>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
