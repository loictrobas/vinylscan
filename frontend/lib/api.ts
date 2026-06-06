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

export interface CatalogRecord {
  id: string;
  lot_id: string | null;
  scan_id: string | null;
  artist: string | null;
  title: string | null;
  year: number | null;
  label: string | null;
  catalog_number: string | null;
  format: string | null;
  genre: string | null;
  country: string | null;
  condition: string;
  discogs_release_id: number | null;
  discogs_instance_id: number | null;
  discogs_synced: boolean;
  discogs_url: string | null;
  cover_image_url: string | null;
  status: "in_stock" | "sold";
  cost_price: number | null;
  asking_price: number | null;
  sold_price: number | null;
  sold_at: string | null;
  tags: string | null;
  notes: string | null;
  created_at: string;
}

export interface CatalogStats {
  total_in_stock: number;
  total_sold: number;
  total_revenue: number;
  revenue_today: number;
  revenue_this_week: number;
  revenue_this_month: number;
  inventory_value: number;
  total_cost: number;
  avg_margin_pct: number | null;
  recent_sales_today: { artist: string | null; title: string | null; sold_price: number | null; sold_at: string | null }[];
}

export interface CreateRecordBody {
  artist?: string;
  title?: string;
  year?: number;
  label?: string;
  catalog_number?: string;
  format?: string;
  genre?: string;
  country?: string;
  condition?: string;
  lot_id?: string;
  cost_price?: number;
  asking_price?: number;
  discogs_release_id?: number;
  tags?: string;
  notes?: string;
}

export interface DiscogsSyncStatus {
  status: "idle" | "running" | "done" | "error";
  total: number;
  imported: number;
  skipped: number;
  error: string | null;
  last_sync: string | null;
  finished_at: string | null;
}

export interface CatalogListResponse {
  records: CatalogRecord[];
  total: number;
  page: number;
  per_page: number;
}

export interface Lot {
  id: string;
  name: string;
  purchase_price: number | null;
  notes: string | null;
  record_count: number;
  in_stock_count: number;
  sold_count: number;
  total_asking: number | null;
  total_sold: number | null;
  created_at: string;
}

export interface CreditPack {
  id: string;
  name: string;
  credits: number;
  price_cents: number;
  price_display: string;
}

// Token stored in localStorage for cross-domain auth (API on onrender.com, frontend on vercel.app)
export const TOKEN_KEY = "vinylscan_token";

export function getToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string) {
  localStorage.setItem(TOKEN_KEY, token);
}

export function clearToken() {
  localStorage.removeItem(TOKEN_KEY);
}

let _creditBalance: number | null = null;
const _creditListeners: Array<(n: number) => void> = [];

// Cache /auth/me so multiple components don't each fire a request on mount.
// Cleared on logout so next login fetches fresh data.
let _meCache: Promise<User> | null = null;
export function clearMeCache() { _meCache = null; }

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

function authHeaders(extra: Record<string, string> = {}): Record<string, string> {
  const token = getToken();
  return {
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...extra,
  };
}

async function apiFetch<T>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...authHeaders(),
      ...(options.headers || {}),
    },
  });
  _updateCreditBalance(res.headers.get("X-Credit-Balance"));
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw Object.assign(new Error(err.detail || res.statusText), { status: res.status, data: err });
  }
  return res.json();
}

export const api = {
  me: () => {
    if (!getToken()) return Promise.reject(new Error("Not authenticated"));
    if (!_meCache) _meCache = apiFetch<User>("/auth/me");
    return _meCache;
  },
  logout: () => { clearToken(); clearMeCache(); return apiFetch<void>("/auth/logout", { method: "POST" }); },

  uploadScan: async (file: File): Promise<ScanUploadResponse> => {
    const form = new FormData();
    form.append("file", file);
    const res = await fetch(`${API_URL}/scan/upload`, {
      method: "POST",
      headers: authHeaders(),
      body: form,
    });
    _updateCreditBalance(res.headers.get("X-Credit-Balance"));
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw Object.assign(new Error(err.detail || res.statusText), { status: res.status, data: err });
    }
    return res.json();
  },

  confirmScan: (scanId: string, releaseId: number, condition = "VG+", lotId?: string) =>
    apiFetch<{ ok: boolean; credits_remaining: number; record_id: string }>(`/scan/${scanId}/confirm`, {
      method: "POST",
      body: JSON.stringify({ release_id: releaseId, condition, lot_id: lotId ?? null }),
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

  getPricing: (releaseId: number) =>
    apiFetch<{ release_id: number; pricing: { lowest: number; currency: string; num_for_sale: number } | null }>(
      `/scan/pricing/${releaseId}`
    ),

  barcodeSearch: (barcode: string) =>
    apiFetch<{ barcode: string; matches: DiscogsMatch[] }>(`/scan/barcode?barcode=${encodeURIComponent(barcode)}`),

  barcodeAdd: (releaseId: number, condition = "VG+", lotId?: string) =>
    apiFetch<{ ok: boolean; record_id: string }>("/scan/barcode/add", {
      method: "POST",
      body: JSON.stringify({ release_id: releaseId, condition, lot_id: lotId ?? null }),
    }),

  listCatalog: (params?: { page?: number; per_page?: number; status?: string; lot_id?: string; no_lot?: boolean; search?: string; genre?: string; format?: string; condition?: string }) => {
    const p = new URLSearchParams();
    if (params?.page) p.set("page", String(params.page));
    if (params?.per_page) p.set("per_page", String(params.per_page));
    if (params?.status) p.set("status", params.status);
    if (params?.no_lot) p.set("no_lot", "true");
    else if (params?.lot_id) p.set("lot_id", params.lot_id);
    if (params?.search) p.set("search", params.search);
    if (params?.genre) p.set("genre", params.genre);
    if (params?.format) p.set("format", params.format);
    if (params?.condition) p.set("condition", params.condition);
    return apiFetch<CatalogListResponse>(`/catalog?${p}`);
  },

  catalogStats: () => apiFetch<CatalogStats>("/catalog/stats"),

  createRecord: (body: CreateRecordBody) =>
    apiFetch<CatalogRecord>("/catalog", { method: "POST", body: JSON.stringify(body) }),

  deleteRecord: (id: string) =>
    apiFetch<void>(`/catalog/${id}`, { method: "DELETE" }),

  getRecord: (id: string) => apiFetch<CatalogRecord>(`/catalog/${id}`),

  listLots: () => apiFetch<Lot[]>("/catalog/lots/list"),

  createLot: (body: { name: string; purchase_price?: number; notes?: string }) =>
    apiFetch<Lot>("/catalog/lots", { method: "POST", body: JSON.stringify(body) }),

  updateRecord: (id: string, body: Partial<CreateRecordBody & { asking_price?: number | null; condition?: string; lot_id?: string | null }>) =>
    apiFetch<CatalogRecord>(`/catalog/${id}`, { method: "PATCH", body: JSON.stringify(body) }),

  sellRecord: (id: string, sold_price: number) =>
    apiFetch<CatalogRecord>(`/catalog/${id}/sell`, { method: "POST", body: JSON.stringify({ sold_price }) }),

  getPriceMarkup: () => apiFetch<{ price_markup_pct: number | null }>("/catalog/settings/price-markup"),

  setPriceMarkup: (pct: number | null) =>
    apiFetch<{ price_markup_pct: number | null }>("/catalog/settings/price-markup", {
      method: "PUT",
      body: JSON.stringify({ price_markup_pct: pct }),
    }),

  loginUrl: () => `${API_URL}/auth/discogs/login`,

  discogsStartSync: () =>
    apiFetch<DiscogsSyncStatus>("/discogs/sync", { method: "POST" }),

  discogsSyncStatus: () =>
    apiFetch<DiscogsSyncStatus>("/discogs/sync/status"),

  discogsPushRecord: (recordId: string) =>
    apiFetch<{ ok: boolean; instance_id: number | null; message: string }>(
      `/discogs/collection/add/${recordId}`, { method: "POST" }
    ),

  discogsBackfillCovers: () =>
    apiFetch<{ status: string; total: number; checked: number; updated: number; error: string | null }>(
      "/discogs/backfill-covers", { method: "POST" }
    ),

  discogsBackfillStatus: () =>
    apiFetch<{ status: string; total: number; checked: number; updated: number; error: string | null }>(
      "/discogs/backfill-covers/status"
    ),

  fetchDiscogsPrices: (releaseIds: number[]) =>
    apiFetch<Record<string, { lowest: number; currency: string; num_for_sale: number } | null>>(
      `/discogs/prices?release_ids=${releaseIds.join(",")}`
    ),
};
