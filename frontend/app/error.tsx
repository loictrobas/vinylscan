"use client";

import { useEffect } from "react";
import { AlertTriangle, RotateCcw } from "lucide-react";

export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="min-h-screen flex items-center justify-center p-8">
      <div className="max-w-sm w-full text-center">
        <div className="w-14 h-14 rounded-2xl bg-vs-danger/10 flex items-center justify-center mx-auto mb-4">
          <AlertTriangle size={26} className="text-vs-danger" />
        </div>
        <h1 className="text-lg font-semibold mb-1">Something went wrong</h1>
        <p className="text-sm text-vs-muted mb-6">{error.message || "An unexpected error occurred."}</p>
        <button onClick={reset} className="btn-primary flex items-center gap-2 mx-auto">
          <RotateCcw size={14} />
          Try again
        </button>
      </div>
    </div>
  );
}
