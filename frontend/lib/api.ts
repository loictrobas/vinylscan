const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

export interface User {
  id: string;
  discogs_username: string;
  credits: number;
  created_at: string;
}

export interface DiscogsMatch {
  release_id: number;
  title: string;
  artist: string;
  year: number | null;
  format: string | null;
  country: string | null;
  label: string | null;
  cover_image: string | null;
  resource_url: string | null;
}

export interface ScanUploadResponse {
  scan_id: string;
  status: "pending" | "auto_added" | "manually_added" | "skipped";
  artist: string | null;
  title: string | null;
  year: number | null;
  label: string | null;
  catalog_number: string | null;
  confidence: number;
  auto_added: boolean;
  discogs_release_id: number | null;
  matches: DiscogsMatch[];
  error?: string;
}

export interface Scan {
  id: string;
  image_url: string;
  artist: string | null;
  title: string | null;
  year: number | null;
  label: string | null;
  catalog_number: string | null;
  confidence: number | null;
  discogs_release_id: number | null;
  status: "pending" | "auto_added" | "manually_added" | "skipped";
  credit_deducted: boolean;
  created_at: string;
  claude_raw_response?: Record<string, unknown> | null;
}

export interface DashboardStats {
  total_scanned: number;
  total_added: number;
  credit_balance: number;
  recent_transactions: CreditTransaction[];
}

export interface CreditTransaction {
  id: string;
  amount: number;
  reason: "free_topup" | "purchase" | "scan_used";
  stripe_payment_intent_id: string | null;
  created_at: string;
}

export interface CreditPack {
  id: string;
  name: string;
  credits: number;
  price_cents: number;
  price_display: string;
}

let _creditBalance: number | null = null;
const _creditListeners: Array<(n: number) => void> = [];

export function subscribeCreditBalance(fn: (n: number) => void) {
  _creditListeners.push(fn);
  return () => {
    const i = _creditListeners.indexOf(fn);
    if (i >= 0) _creditListeners.splice(i, 1);
  };
}

function _updateCreditBalance(value: string | null) {
  if (!value) return;
  const n = parseInt(value, 10);
  if (!isNaN(n) && n !== _creditBalance) {
    _creditBalance = n;
    _creditListeners.forEach((fn) => fn(n));
  }
}

async function apiFetch<T>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    credentials: "include",
    headers: { "Content-Type": "application/json", ...(options.headers || {}) },
    ...options,
  });
  _updateCreditBalance(res.headers.get("X-Credit-Balance"));
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw Object.assign(new Error(err.detail || res.statusText), { status: res.status, data: err });
  }
  return res.json();
}

export const api = {
  me: () => apiFetch<User>("/auth/me"),
  logout: () => apiFetch<void>("/auth/logout", { method: "POST" }),

  uploadScan: async (file: File): Promise<ScanUploadResponse> => {
    const form = new FormData();
    form.append("file", file);
    const res = await fetch(`${API_URL}/scan/upload`, {
      method: "POST",
      credentials: "include",
      body: form,
    });
    _updateCreditBalance(res.headers.get("X-Credit-Balance"));
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw Object.assign(new Error(err.detail || res.statusText), { status: res.status, data: err });
    }
    return res.json();
  },

  confirmScan: (scanId: string, releaseId: number) =>
    apiFetch<{ ok: boolean; credits_remaining: number }>(`/scan/${scanId}/confirm`, {
      method: "POST",
      body: JSON.stringify({ release_id: releaseId }),
    }),

  skipScan: (scanId: string) =>
    apiFetch<{ ok: boolean; credits_remaining: number }>(`/scan/${scanId}/skip`, {
      method: "POST",
    }),

  scanHistory: (page = 1, perPage = 20) =>
    apiFetch<Scan[]>(`/scan/history?page=${page}&per_page=${perPage}`),

  dashboardStats: () => apiFetch<DashboardStats>("/dashboard/stats"),

  creditPacks: () => apiFetch<CreditPack[]>("/billing/packs"),

  createPayment: (packId: string) =>
    apiFetch<{ client_secret: string; pack: CreditPack }>("/billing/create-payment", {
      method: "POST",
      body: JSON.stringify({ pack_id: packId }),
    }),

  loginUrl: () => `${API_URL}/auth/discogs/login`,
};
