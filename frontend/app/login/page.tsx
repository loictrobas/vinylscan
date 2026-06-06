"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Disc3, Loader2 } from "lucide-react";
import { api, setToken } from "@/lib/api";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const res = await api.emailLogin(email, password);
      setToken(res.token);
      router.push(res.is_admin ? "/admin" : "/dashboard");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Login failed";
      setError(msg.includes("401") || msg.includes("Invalid") ? "Invalid email or password" : msg);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-vs-bg p-4">
      <div className="w-full max-w-sm">
        <div className="flex flex-col items-center mb-8 gap-2">
          <Disc3 size={40} className="text-vs-accent" />
          <h1 className="text-2xl font-bold text-vs-text">VinylScan</h1>
          <p className="text-vs-muted text-sm">Sign in to your account</p>
        </div>

        <form onSubmit={handleSubmit} className="card p-6 flex flex-col gap-4">
          <div>
            <label className="text-xs text-vs-text-2 mb-1 block">Email</label>
            <input
              type="email"
              autoComplete="email"
              required
              className="input w-full"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
            />
          </div>
          <div>
            <label className="text-xs text-vs-text-2 mb-1 block">Password</label>
            <input
              type="password"
              autoComplete="current-password"
              required
              className="input w-full"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
            />
          </div>

          {error && <p className="text-vs-danger text-xs">{error}</p>}

          <button type="submit" disabled={loading} className="btn-primary w-full flex items-center justify-center gap-2 disabled:opacity-50">
            {loading && <Loader2 size={16} className="animate-spin" />}
            {loading ? "Signing in…" : "Sign in"}
          </button>
        </form>

        <p className="text-center text-xs text-vs-muted mt-6">
          No account yet? Ask your administrator for an invite link.
        </p>

        <div className="mt-8 border-t border-vs-border pt-6">
          <p className="text-center text-xs text-vs-muted mb-3">Have a Discogs account?</p>
          <a
            href={`${process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000"}/auth/discogs/login`}
            className="btn-secondary w-full flex items-center justify-center gap-2 text-sm"
          >
            <Disc3 size={16} />
            Connect with Discogs
          </a>
        </div>
      </div>
    </div>
  );
}
