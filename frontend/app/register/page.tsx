"use client";
import { useState, useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Disc3, Loader2, CheckCircle2 } from "lucide-react";
import { api } from "@/lib/api";

function RegisterForm() {
  const router = useRouter();
  const params = useSearchParams();
  const token = params.get("token") ?? "";

  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) setError("No invite token — ask your administrator for a fresh invite link.");
  }, [token]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (password !== confirm) { setError("Passwords don't match"); return; }
    if (password.length < 8) { setError("Password must be at least 8 characters"); return; }
    setLoading(true);
    setError(null);
    try {
      await api.registerViaInvite(token, password, displayName || undefined);
      setDone(true);
      setTimeout(() => router.push("/dashboard"), 1500);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Registration failed";
      setError(msg);
    } finally {
      setLoading(false);
    }
  }

  if (done) {
    return (
      <div className="card p-8 flex flex-col items-center gap-3 text-center">
        <CheckCircle2 size={40} className="text-vs-success" />
        <p className="text-vs-text font-medium">Account created! Redirecting…</p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="card p-6 flex flex-col gap-4">
      <div>
        <label className="text-xs text-vs-text-2 mb-1 block">Your name (optional)</label>
        <input
          type="text"
          className="input w-full"
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
          placeholder="Record Store Name"
        />
      </div>
      <div>
        <label className="text-xs text-vs-text-2 mb-1 block">Password</label>
        <input
          type="password"
          autoComplete="new-password"
          required
          className="input w-full"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Min. 8 characters"
        />
      </div>
      <div>
        <label className="text-xs text-vs-text-2 mb-1 block">Confirm password</label>
        <input
          type="password"
          autoComplete="new-password"
          required
          className="input w-full"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          placeholder="Repeat password"
        />
      </div>

      {error && <p className="text-vs-danger text-xs">{error}</p>}

      <button type="submit" disabled={loading || !token} className="btn-primary w-full flex items-center justify-center gap-2 disabled:opacity-50">
        {loading && <Loader2 size={16} className="animate-spin" />}
        {loading ? "Creating account…" : "Create account"}
      </button>
    </form>
  );
}

export default function RegisterPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-vs-bg p-4">
      <div className="w-full max-w-sm">
        <div className="flex flex-col items-center mb-8 gap-2">
          <Disc3 size={40} className="text-vs-accent" />
          <h1 className="text-2xl font-bold text-vs-text">VinylScan</h1>
          <p className="text-vs-muted text-sm">Create your account</p>
        </div>
        <Suspense fallback={<div className="card p-6 text-center text-vs-muted text-sm">Loading…</div>}>
          <RegisterForm />
        </Suspense>
        <p className="text-center text-xs text-vs-muted mt-4">
          Already have an account?{" "}
          <a href="/login" className="text-vs-accent hover:underline">Sign in</a>
        </p>
      </div>
    </div>
  );
}
