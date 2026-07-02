import { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { X, RotateCcw, ZapOff, Zap, Check, Loader2, AlertCircle, Plus, Copy } from "lucide-react";

export type CaptureMode = "new" | "same";

export interface CaptureStatus {
  kind: "sending" | "sent" | "error";
  text: string;
}

interface Props {
  onCapture: (file: File, preview: string, mode: CaptureMode) => void;
  onDone: () => void;
  canUseSameMode: boolean;
  sentCount: number;
  status: CaptureStatus | null;
}

export default function CameraScreen({
  onCapture, onDone, canUseSameMode, sentCount, status,
}: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [facingMode, setFacingMode] = useState<"environment" | "user">("environment");
  const [torch, setTorch] = useState(false);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [flash, setFlash] = useState(false);

  async function startCamera(facing: "environment" | "user") {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    setReady(false);
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: facing,
          width: { ideal: 1920 },
          height: { ideal: 1080 },
        },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.onloadedmetadata = () => {
          videoRef.current?.play();
          setReady(true);
        };
      }
    } catch (e) {
      setError("Camera unavailable. Check permissions in Settings.");
    }
  }

  useEffect(() => {
    startCamera(facingMode);
    return () => {
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  async function flipCamera() {
    const next = facingMode === "environment" ? "user" : "environment";
    setFacingMode(next);
    await startCamera(next);
  }

  async function toggleTorch() {
    const track = streamRef.current?.getVideoTracks()[0];
    if (!track) return;
    const newVal = !torch;
    try {
      await (track as MediaStreamTrack & { applyConstraints: (c: object) => Promise<void> })
        .applyConstraints({ advanced: [{ torch: newVal } as MediaTrackConstraintSet] });
      setTorch(newVal);
    } catch { /* torch not supported */ }
  }

  // Each button captures AND decides the mode in one tap — no separate toggle step.
  function capture(mode: CaptureMode) {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas || !ready) return;

    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.drawImage(video, 0, 0);

    // Flash effect
    setFlash(true);
    setTimeout(() => setFlash(false), 150);

    canvas.toBlob((blob) => {
      if (!blob) return;
      const file = new File([blob], `scan-${Date.now()}.jpg`, { type: "image/jpeg" });
      const preview = canvas.toDataURL("image/jpeg", 0.8);
      onCapture(file, preview, mode);
    }, "image/jpeg", 0.9);
  }

  return (
    <motion.div
      className="fixed inset-0 bg-black z-50 flex flex-col"
      style={{ paddingTop: "env(safe-area-inset-top)" }}
      initial={{ y: "100%" }}
      animate={{ y: 0, transition: { type: "spring", damping: 34, stiffness: 300 } }}
      exit={{ y: "100%", transition: { duration: 0.22, ease: [0.4, 0, 1, 1] } }}
    >
      {/* Viewfinder */}
      <div className="relative flex-1 overflow-hidden">
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          className="absolute inset-0 w-full h-full object-cover"
          style={{ transform: facingMode === "user" ? "scaleX(-1)" : "none" }}
        />
        <canvas ref={canvasRef} className="hidden" />

        {/* Flash overlay */}
        {flash && <div className="absolute inset-0 bg-white opacity-80 pointer-events-none" />}

        {/* Error */}
        {error && (
          <div className="absolute inset-0 flex items-center justify-center px-8 text-center">
            <p className="text-white text-sm">{error}</p>
          </div>
        )}

        {/* Top controls */}
        <div className="absolute top-0 left-0 right-0 flex items-center justify-between px-4 pt-3 pb-4"
          style={{ background: "linear-gradient(to bottom, rgba(0,0,0,0.5), transparent)" }}>
          <motion.button
            onClick={onDone}
            whileTap={{ scale: 0.85 }}
            transition={{ duration: 0.12, ease: "easeOut" }}
            className="w-11 h-11 rounded-full bg-black/40 flex items-center justify-center backdrop-blur-sm"
          >
            <X size={20} className="text-white" />
          </motion.button>

          <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-black/40 backdrop-blur-sm">
            <span className="text-white text-xs font-semibold">{sentCount}</span>
            <span className="text-white/60 text-xs">sent</span>
          </div>

          <motion.button
            onClick={toggleTorch}
            whileTap={{ scale: 0.85 }}
            transition={{ duration: 0.12, ease: "easeOut" }}
            className={`w-11 h-11 rounded-full flex items-center justify-center backdrop-blur-sm transition-colors ${
              torch ? "bg-yellow-400/25 ring-1 ring-yellow-400/50" : "bg-black/40"
            }`}
          >
            {torch ? <Zap size={18} className="text-yellow-400" /> : <ZapOff size={18} className="text-white/60" />}
          </motion.button>
        </div>

        {/* Vignette where the feed meets the bottom bar */}
        <div className="absolute bottom-0 left-0 right-0 h-24 pointer-events-none"
          style={{ background: "linear-gradient(to bottom, transparent, rgba(0,0,0,0.55))" }} />

        {/* Focus guide — corner brackets, camera-app style */}
        {ready && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="relative w-60 h-60" style={{ boxShadow: "0 0 0 9999px rgba(0,0,0,0.22)" }}>
              {([
                ["top-0 left-0", "border-t-[3px] border-l-[3px] rounded-tl-xl"],
                ["top-0 right-0", "border-t-[3px] border-r-[3px] rounded-tr-xl"],
                ["bottom-0 left-0", "border-b-[3px] border-l-[3px] rounded-bl-xl"],
                ["bottom-0 right-0", "border-b-[3px] border-r-[3px] rounded-br-xl"],
              ] as const).map(([pos, border]) => (
                <div key={pos} className={`absolute w-8 h-8 ${pos} ${border} border-white/70`} />
              ))}
            </div>
          </div>
        )}

        {/* Status pill — sending/sent/error feedback for the last shot, never blocks capture */}
        <div className="absolute bottom-4 left-0 right-0 flex justify-center pointer-events-none">
          {status && (
            <div className={`flex items-center gap-1.5 px-3.5 py-2 rounded-full backdrop-blur-md text-xs font-medium shadow-lg transition-all duration-300 ${
              status.kind === "error" ? "bg-red-500/90 text-white shadow-red-900/40" :
              status.kind === "sent" ? "bg-black/60 text-vs-success shadow-black/40" :
              "bg-black/60 text-white/90 shadow-black/40"
            }`}>
              {status.kind === "sending" && <Loader2 size={12} className="animate-spin" />}
              {status.kind === "sent" && <Check size={12} />}
              {status.kind === "error" && <AlertCircle size={12} />}
              {status.text}
            </div>
          )}
        </div>
      </div>

      {/* Bottom controls — flip + two direct capture buttons, always visible */}
      <div
        className="flex items-center gap-3 px-5 py-6 backdrop-blur-xl border-t border-white/5"
        style={{
          paddingBottom: "calc(env(safe-area-inset-bottom) + 24px)",
          background: "linear-gradient(to bottom, rgba(0,0,0,0.85), rgba(0,0,0,0.97))",
        }}
      >
        <motion.button
          onClick={flipCamera}
          whileTap={{ scale: 0.85, rotate: -25 }}
          transition={{ duration: 0.15, ease: "easeOut" }}
          className="w-12 h-12 rounded-full bg-white/10 border border-white/10 backdrop-blur-md flex items-center justify-center flex-shrink-0"
        >
          <RotateCcw size={18} className="text-white" />
        </motion.button>

        <motion.button
          onClick={() => capture("same")}
          disabled={!ready || !canUseSameMode}
          whileTap={{ scale: 0.93 }}
          transition={{ duration: 0.12, ease: "easeOut" }}
          className="flex-1 py-4 rounded-2xl bg-white/10 border border-white/15 backdrop-blur-md text-white text-sm font-semibold disabled:opacity-30 flex items-center justify-center gap-1.5 shadow-lg shadow-black/30"
        >
          <Copy size={15} />
          Same record
        </motion.button>

        <motion.button
          onClick={() => capture("new")}
          disabled={!ready}
          whileTap={{ scale: 0.93 }}
          transition={{ duration: 0.12, ease: "easeOut" }}
          className="flex-1 py-4 rounded-2xl text-white text-sm font-semibold disabled:opacity-40 flex items-center justify-center gap-1.5 ring-1 ring-white/10"
          style={{
            background: "linear-gradient(to bottom, var(--vs-accent), var(--vs-accent-dark))",
            boxShadow: "inset 0 1px 0 rgba(255,255,255,0.25), 0 6px 16px -2px rgba(79,110,247,0.45)",
          }}
        >
          <Plus size={16} strokeWidth={2.5} />
          New record
        </motion.button>
      </div>
    </motion.div>
  );
}
