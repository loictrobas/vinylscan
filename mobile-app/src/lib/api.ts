const API_URL_KEY = "vs_api_url";
const TOKEN_KEY = "vs_token";

export const _BUILT_IN_URL = (import.meta.env.VITE_API_URL || "http://localhost:8000").replace(/\/+$/, "");

export function getApiUrl(): string {
  try {
    const stored = localStorage.getItem(API_URL_KEY);
    if (stored) return stored;
  } catch { /* ignore */ }
  return _BUILT_IN_URL;
}

export function setApiUrl(url: string) {
  const clean = url.trim().replace(/\/+$/, "");
  localStorage.setItem(API_URL_KEY, clean);
}

export function clearApiUrl() {
  localStorage.removeItem(API_URL_KEY);
}

// Static snapshot used in places that need a constant (health ping interval etc.)
// Callers that need the live value should call getApiUrl() directly.
export const API_URL = _BUILT_IN_URL;

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}
export function setToken(t: string) {
  localStorage.setItem(TOKEN_KEY, t);
}
export function clearToken() {
  localStorage.removeItem(TOKEN_KEY);
}

function authHeaders(): Record<string, string> {
  const t = getToken();
  return t ? { Authorization: `Bearer ${t}` } : {};
}

async function apiFetch<T>(path: string, opts: RequestInit = {}): Promise<T> {
  const res = await fetch(`${getApiUrl()}${path}`, {
    ...opts,
    headers: {
      "Content-Type": "application/json",
      ...authHeaders(),
      ...(opts.headers || {}),
    },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    if (res.status === 401) {
      const hadToken = !!getToken();
      clearToken();
      // Wrong credentials on /auth/login has no prior session to "expire" — show
      // the backend's real reason. Only call it a session expiry when a token
      // actually existed and got rejected.
      const msg = err.detail || (hadToken ? "Session expired" : "Invalid email or password");
      throw Object.assign(new Error(msg), { status: 401 });
    }
    throw Object.assign(new Error(err.detail || res.statusText), { status: res.status });
  }
  return res.json();
}

export interface LoginResponse {
  ok: boolean;
  token: string;
  user_id: string;
  is_admin: boolean;
}

export interface ScanResult {
  scan_id: string;
  artist: string | null;
  title: string | null;
  year: number | null;
  label: string | null;
  confidence: number | null;
  discogs_release_id: number | null;
  matches: Array<{
    release_id: number;
    artist: string;
    title: string;
    year: number | null;
    format: string | null;
    cover_image: string | null;
  }>;
}

// Fast-ack response from the mobile upload endpoints — no analysis happens on the
// phone. Claude Vision + Discogs run server-side in the background and the result
// is delivered to the desktop over SSE, not back to the phone.
export interface MobileUploadAck {
  scan_id: string;
  status: string;
}

// Same /scan/pending the desktop uses, so phone and desktop always show the exact
// same list — no separate mobile-only history to drift out of sync. Deliberately
// thin: no confidence/matches/Discogs info here, just enough to confirm a shot made
// it to the backend and to see what's still waiting to be sorted on desktop.
export interface PendingScan {
  scan_id: string;
  status: string;
  artist: string | null;
  title: string | null;
  image_url: string;
}

export const api = {
  login: (email: string, password: string) =>
    apiFetch<LoginResponse>("/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    }),

  // Fast-ack: backend saves the image and returns immediately (scan_id only).
  // Claude Vision + Discogs run in the background and reach the desktop via SSE —
  // the phone never waits on analysis, so shots can be fired back-to-back.
  uploadScan: async (file: File): Promise<MobileUploadAck> => {
    const form = new FormData();
    form.append("file", file);
    const res = await fetch(`${getApiUrl()}/scan/upload-mobile`, {
      method: "POST",
      headers: authHeaders(),
      body: form,
    });
    if (!res.ok) {
      if (res.status === 401) { clearToken(); throw Object.assign(new Error("Session expired"), { status: 401 }); }
      const err = await res.json().catch(() => ({}));
      throw Object.assign(new Error(err.detail || res.statusText), { status: res.status });
    }
    return res.json();
  },

  enhanceScan: async (scanId: string, file: File): Promise<MobileUploadAck> => {
    const form = new FormData();
    form.append("file", file);
    const res = await fetch(`${getApiUrl()}/scan/${scanId}/enhance-mobile`, {
      method: "POST",
      headers: authHeaders(),
      body: form,
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw Object.assign(new Error(err.detail || res.statusText), { status: res.status });
    }
    return res.json();
  },

  confirmScan: (scanId: string, releaseId: number, condition: string) =>
    apiFetch(`/scan/${scanId}/confirm`, {
      method: "POST",
      body: JSON.stringify({ release_id: releaseId, condition }),
    }),

  skipScan: (scanId: string) =>
    apiFetch(`/scan/${scanId}/skip`, { method: "POST" }),

  pendingScans: () => apiFetch<PendingScan[]>("/scan/pending"),
};

export function openScanStream(
  onScanResult: (data: ScanResult & { type: string }) => void,
  onError?: (e: Event) => void
): () => void {
  const token = getToken();
  if (!token) return () => {};
  const es = new EventSource(`${getApiUrl()}/scan/stream?token=${encodeURIComponent(token)}`);
  es.onmessage = (e) => {
    try { onScanResult(JSON.parse(e.data)); } catch { /* ignore */ }
  };
  if (onError) es.onerror = onError;
  return () => es.close();
}
