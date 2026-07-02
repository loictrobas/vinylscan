"use client";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Disc3, Loader2 } from "lucide-react";
import { api, setToken, _resolveApiUrl } from "@/lib/api";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [apiUrl, setApiUrl] = useState("…");
  useEffect(() => { setApiUrl(_resolveApiUrl()); }, []);

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
    <div className="min-h-dvh bg-vs-bg p-4 flex flex-col items-center justify-center">
      <div className="w-full max-w-sm">
        <div className="flex flex-col items-center mb-8 gap-2">
          <Disc3 size={40} className="text-vs-accent" />
          <h1 className="text-2xl font-bold text-vs-text">VinylScan</h1>
          <p className="text-vs-muted text-sm">Sign in to your account</p>
        </div>

        {error && (
          <div className="mb-4 rounded-lg bg-red-500/10 border border-red-500/40 px-4 py-3">
            <p className="text-red-400 text-sm font-medium">{error}</p>
          </div>
        )}

        <form onSubmit={handleSubmit} className="card p-6 flex flex-col gap-4">
          <div>
            <label className="text-xs text-vs-text-2 mb-1 block">Email</label>
            <input
              type="email"
              autoComplete="email"
              autoCapitalize="none"
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
              autoCorrect="off"
              autoCapitalize="none"
              spellCheck={false}
              required
              className="input w-full"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
            />
          </div>

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
            href={`${apiUrl}/auth/discogs/login`}
            className="btn-secondary w-full flex items-center justify-center gap-2 text-sm"
          >
            <Disc3 size={16} />
            Connect with Discogs
          </a>
        </div>

        <p className="text-center text-[10px] text-vs-muted/40 mt-4">api: {apiUrl}</p>
      </div>
    </div>
  );
}
