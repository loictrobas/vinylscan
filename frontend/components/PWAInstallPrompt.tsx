"use client";

import { useEffect, useState } from "react";
import { X, Share2 } from "lucide-react";

const DISMISSED_KEY = "vs-pwa-dismissed";
const DISMISSED_TTL = 30 * 24 * 60 * 60 * 1000; // 30 days

function isIOS() {
  return /iPad|iPhone|iPod/.test(navigator.userAgent);
}

function isStandalone() {
  return (
    (navigator as { standalone?: boolean }).standalone === true ||
    window.matchMedia("(display-mode: standalone)").matches
  );
}

function wasDismissed(): boolean {
  try {
    const ts = localStorage.getItem(DISMISSED_KEY);
    return !!ts && Date.now() - parseInt(ts) < DISMISSED_TTL;
  } catch { return false; }
}

function dismiss() {
  try { localStorage.setItem(DISMISSED_KEY, String(Date.now())); } catch {}
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type BeforeInstallPromptEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> };

export default function PWAInstallPrompt() {
  const [show, setShow] = useState(false);
  const [ios, setIos] = useState(false);
  const [prompt, setPrompt] = useState<BeforeInstallPromptEvent | null>(null);

  useEffect(() => {
    if (isStandalone() || wasDismissed()) return;

    const iosDevice = isIOS();
    setIos(iosDevice);

    if (iosDevice) {
      const t = setTimeout(() => setShow(true), 3000);
      return () => clearTimeout(t);
    }

    const handler = (e: Event) => {
      e.preventDefault();
      setPrompt(e as BeforeInstallPromptEvent);
      setTimeout(() => setShow(true), 3000);
    };
    window.addEventListener("beforeinstallprompt", handler);
    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);

  function close() {
    dismiss();
    setShow(false);
  }

  async function install() {
    if (!prompt) return;
    await prompt.prompt();
    const { outcome } = await prompt.userChoice;
    if (outcome === "accepted") setShow(false);
    setPrompt(null);
  }

  if (!show) return null;

  return (
    <div
      className="fixed left-4 right-4 z-40 bg-vs-card border border-vs-border-2 rounded-2xl shadow-2xl p-4 flex items-center gap-3 animate-in slide-in-from-bottom-4 duration-300"
      style={{ bottom: "calc(64px + env(safe-area-inset-bottom) + 12px)" }}
    >
      <img
        src="/icons/icon-192.png"
        alt="VinylScan"
        className="w-10 h-10 rounded-xl flex-shrink-0"
      />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-vs-text">Add to Home Screen</p>
        {ios ? (
          <p className="text-xs text-vs-muted mt-0.5 leading-snug">
            Tap <Share2 size={10} className="inline-block mx-0.5 align-text-bottom" /> then
            {" "}<span className="font-medium text-vs-text-2">Add to Home Screen</span>
          </p>
        ) : (
          <p className="text-xs text-vs-muted mt-0.5">Install for faster access, works offline</p>
        )}
      </div>
      {!ios && (
        <button
          onClick={install}
          className="btn-primary text-xs px-3 py-1.5 flex-shrink-0"
        >
          Install
        </button>
      )}
      <button onClick={close} className="p-1 text-vs-muted hover:text-vs-text flex-shrink-0">
        <X size={15} />
      </button>
    </div>
  );
}
