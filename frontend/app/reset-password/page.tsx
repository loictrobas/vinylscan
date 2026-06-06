"use client";
import { useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Disc3, Loader2, CheckCircle2 } from "lucide-react";
import { api } from "@/lib/api";

function ResetForm() {
  const router = useRouter();
  const params = useSearchParams();
  const token = params.get("token") ?? "";

  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (password !== confirm) { setError("Passwords don't match"); return; }
    if (password.length < 8) { setError("Password must be at least 8 characters"); return; }
    setLoading(true);
    setError(null);
    try {
      await api.resetPassword(token, password);
      setDone(true);
      setTimeout(() => router.push("/login"), 2000);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Reset failed — link may have expired");
    } finally {
      setLoading(false);
    }
  }

  if (!token) {
    return <p className="text-vs-danger text-sm text-center">Invalid reset link. Ask your admin for a new one.</p>;
  }

  if (done) {
    return (
      <div className="card p-8 flex flex-col items-center gap-3 text-center">
        <CheckCircle2 size={40} className="text-vs-success" />
        <p className="text-vs-text font-medium">Password updated! Redirecting to login…</p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="card p-6 flex flex-col gap-4">
      <div>
        <label className="text-xs text-vs-text-2 mb-1 block">New password</label>
        <input type="password" autoComplete="new-password" required className="input w-full"
          value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Min. 8 characters" />
      </div>
      <div>
        <label className="text-xs text-vs-text-2 mb-1 block">Confirm password</label>
        <input type="password" autoComplete="new-password" required className="input w-full"
          value={confirm} onChange={(e) => setConfirm(e.target.value)} placeholder="Repeat password" />
      </div>
      {error && <p className="text-vs-danger text-xs">{error}</p>}
      <button type="submit" disabled={loading} className="btn-primary w-full flex items-center justify-center gap-2 disabled:opacity-50">
        {loading && <Loader2 size={16} className="animate-spin" />}
        {loading ? "Saving…" : "Set new password"}
      </button>
    </form>
  );
}

function ResetPasswordPageInner() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-vs-bg p-4">
      <div className="w-full max-w-sm">
        <div className="flex flex-col items-center mb-8 gap-2">
          <Disc3 size={40} className="text-vs-accent" />
          <h1 className="text-xl font-bold text-vs-text">Reset password</h1>
        </div>
        <Suspense fallback={<div className="card p-6 text-center text-vs-muted text-sm">Loading…</div>}>
          <ResetForm />
        </Suspense>
      </div>
    </div>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense>
      <ResetPasswordPageInner />
    </Suspense>
  );
}
