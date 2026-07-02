import { useState } from "react";
import { Disc3, Loader2, Settings, Check } from "lucide-react";
import { api, setToken, getApiUrl, setApiUrl, clearApiUrl, _BUILT_IN_URL } from "../lib/api";

interface Props {
  onLogin: () => void;
}

export default function LoginScreen({ onLogin }: Props) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [showServer, setShowServer] = useState(false);
  const [serverInput, setServerInput] = useState(getApiUrl());
  const [serverSaved, setServerSaved] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const res = await api.login(email, password);
      setToken(res.token);
      onLogin();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Login failed";
      setError(msg.includes("401") || msg.includes("Invalid") ? "Wrong email or password" : msg);
    } finally {
      setLoading(false);
    }
  }

  function handleSaveServer() {
    if (serverInput.trim()) {
      setApiUrl(serverInput.trim());
    } else {
      clearApiUrl();
      setServerInput(getApiUrl());
    }
    setServerSaved(true);
    setTimeout(() => setServerSaved(false), 2000);
  }

  return (
    <div className="fixed inset-0 bg-vs-bg flex flex-col items-center justify-center p-6 overflow-y-auto">
      <div className="w-full max-w-sm flex flex-col gap-6">
        <div className="flex flex-col items-center gap-3">
          <div className="w-16 h-16 rounded-2xl bg-vs-accent flex items-center justify-center">
            <Disc3 size={32} className="text-white" />
          </div>
          <div className="text-center">
            <h1 className="text-2xl font-bold text-vs-text">VinylScan</h1>
            <p className="text-vs-muted text-sm mt-1">Sign in to scan records</p>
          </div>
        </div>

        {error && (
          <div className="rounded-xl bg-red-500/10 border border-red-500/30 px-4 py-3">
            <p className="text-red-400 text-sm">{error}</p>
          </div>
        )}

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <label className="text-vs-muted text-xs font-medium">Email</label>
            <input
              type="email"
              autoComplete="email"
              autoCapitalize="none"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              className="w-full rounded-xl bg-vs-raised border border-vs-border px-4 py-3 text-vs-text text-base placeholder:text-vs-muted/50 outline-none focus:border-vs-accent"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-vs-muted text-xs font-medium">Password</label>
            <input
              type="password"
              autoComplete="current-password"
              autoCorrect="off"
              autoCapitalize="none"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              className="w-full rounded-xl bg-vs-raised border border-vs-border px-4 py-3 text-vs-text text-base placeholder:text-vs-muted/50 outline-none focus:border-vs-accent"
            />
          </div>
          <button
            type="submit"
            disabled={loading}
            className="w-full py-4 rounded-xl bg-vs-accent text-white font-semibold text-base flex items-center justify-center gap-2 active:opacity-80 disabled:opacity-50 transition-opacity mt-2"
          >
            {loading && <Loader2 size={18} className="animate-spin" />}
            {loading ? "Signing in…" : "Sign in"}
          </button>
        </form>

        {/* Server config */}
        <div className="flex flex-col gap-2">
          <button
            type="button"
            onClick={() => setShowServer((v) => !v)}
            className="flex items-center gap-1.5 text-vs-muted/50 text-xs mx-auto active:opacity-60"
          >
            <Settings size={11} />
            Server
          </button>

          {showServer && (
            <div className="flex flex-col gap-2 px-1">
              <p className="text-vs-muted/50 text-xs text-center">
                Default: {_BUILT_IN_URL}
              </p>
              <div className="flex gap-2">
                <input
                  type="url"
                  autoCapitalize="none"
                  autoCorrect="off"
                  value={serverInput}
                  onChange={(e) => setServerInput(e.target.value)}
                  placeholder={_BUILT_IN_URL}
                  className="flex-1 rounded-xl bg-vs-raised border border-vs-border px-3 py-2.5 text-vs-text text-sm placeholder:text-vs-muted/30 outline-none focus:border-vs-accent"
                />
                <button
                  type="button"
                  onClick={handleSaveServer}
                  className="px-4 py-2.5 rounded-xl bg-vs-raised border border-vs-border text-vs-text text-sm font-medium active:opacity-60 flex items-center gap-1.5"
                >
                  {serverSaved ? <Check size={14} className="text-vs-success" /> : "Save"}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
