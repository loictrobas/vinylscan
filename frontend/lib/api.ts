const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

export interface User {
  id: string;
  discogs_username: string | null;
  email: string | null;
  display_name: string | null;
  is_admin: boolean;
  is_active: boolean;
  credits: number;
  account_type: "collector" | "store" | "both";
  subscription_status: "free" | "trialing" | "active" | "past_due" | "canceled";
  subscription_current_period_end: string | null;
  trial_ends_at: string | null;
  created_at: string;
  scans_this_month: number;
}

export function isSubscribed(user: User | null | undefined): boolean {
  return user?.subscription_status === "active" || user?.subscription_status === "trialing";
}

export function isStore(user: User | null | undefined): boolean {
  return user?.account_type === "store" || user?.account_type === "both";
}

export function isCollector(user: User | null | undefined): boolean {
  return user?.account_type === "collector" || user?.account_type === "both";
}

export interface AdminUser {
  id: string;
  email: string | null;
  display_name: string | null;
  discogs_username: string | null;
  credits: number;
  is_admin: boolean;
  is_active: boolean;
  created_at: string;
  record_count: number;
  scan_count: number;
  last_discogs_sync: string | null;
}

export interface AdminInvite {
  id: string;
  email: string;
  note: string | null;
  token: string;
  invite_url: string;
  used_at: string | null;
  expires_at: string | null;
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
  artist_alt?: string | null;
  title_alt?: string | null;
}

export interface ResearchResponse {
  artist: string | null;
  title: string | null;
  label: string | null;
  catalog_number: string | null;
  matches: DiscogsMatch[];
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
  styles: string | null;
  country: string | null;
  condition: string;
  discogs_release_id: number | null;
  discogs_instance_id: number | null;
  discogs_listing_id: number | null;
  discogs_synced: boolean;
  discogs_url: string | null;
  discogs_lowest_price: number | null;
  discogs_num_for_sale: number | null;
  discogs_suggested_price: number | null;
  cover_image_url: string | null;
  status: "in_stock" | "sold";
  cost_price: number | null;
  asking_price: number | null;
  sold_price: number | null;
  sold_at: string | null;
  tags: string | null;
  notes: string | null;
  store_listed: boolean;
  created_at: string;
}

export interface RecordEvent {
  id: number;
  record_id: string;
  event_type: string;
  detail: string | null;
  created_at: string;
}

export interface StoreSettings {
  store_slug: string | null;
  store_name: string | null;
  store_description: string | null;
  store_contact: string | null;
  store_public: boolean;
  store_info_banner: string | null;
  store_instagram: string | null;
  store_location: string | null;
  store_accent_color: string | null;
  store_facebook: string | null;
  store_website: string | null;
}

export interface PublicRecord {
  id: string;
  artist: string | null;
  title: string | null;
  year: number | null;
  label: string | null;
  format: string | null;
  genre: string | null;
  styles: string | null;
  condition: string;
  asking_price: number | null;
  cover_image_url: string | null;
}

export interface PublicStore {
  store_name: string | null;
  store_description: string | null;
  store_contact: string | null;
  store_info_banner: string | null;
  store_instagram: string | null;
  store_location: string | null;
  store_accent_color: string | null;
  store_facebook: string | null;
  store_website: string | null;
  records: PublicRecord[];
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
  added_this_month: number;
  daily_revenue_7d: { date: string; revenue: number }[];
  recent_sales_today: { artist: string | null; title: string | null; sold_price: number | null; sold_at: string | null }[];
}

export interface WantlistItem {
  id: number;
  artist: string;
  title: string;
  year: number | null;
  label: string | null;
  notes: string | null;
  discogs_release_id: number | null;
  created_at: string;
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

export interface LotSummary {
  id: string;
  name: string;
  purchase_price: number | null;
  notes: string | null;
  record_count: number;
  in_stock_count: number;
  sold_count: number;
  total_asking: number | null;
  total_sold_revenue: number | null;
  total_cost: number | null;
  profit: number | null;
  unpriced_count: number;
  condition_breakdown: Record<string, number>;
  created_at: string;
  records: CatalogRecord[];
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
// TTL: 5 minutes. Cleared on logout so next login fetches fresh data.
let _meCache: Promise<User> | null = null;
let _meCacheAt = 0;
const ME_CACHE_TTL = 5 * 60 * 1000;
export function clearMeCache() { _meCache = null; _meCacheAt = 0; }

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

const LAST_API_OK_KEY = "vinylscan_last_api_ok";

export function recordApiSuccess() {
  if (typeof localStorage !== "undefined") {
    localStorage.setItem(LAST_API_OK_KEY, Date.now().toString());
  }
}

export function isLikelyColdStart(): boolean {
  if (typeof localStorage === "undefined") return false;
  const last = localStorage.getItem(LAST_API_OK_KEY);
  if (!last) return true;
  return Date.now() - parseInt(last, 10) > 15 * 60 * 1000;
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
  options: RequestInit = {},
  timeoutMs = 65000,
  _isRetry = false
): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`${API_URL}${path}`, {
      ...options,
      signal: options.signal ?? controller.signal,
      headers: {
        "Content-Type": "application/json",
        ...authHeaders(),
        ...(options.headers || {}),
      },
    });
    _updateCreditBalance(res.headers.get("X-Credit-Balance"));
    if (!res.ok) {
      if (res.status === 401) {
        clearToken();
        clearMeCache();
        if (typeof window !== "undefined") {
          window.location.href = "/login";
        }
        throw Object.assign(new Error("Session expired"), { status: 401 });
      }
      const err = await res.json().catch(() => ({}));
      throw Object.assign(new Error(err.detail || res.statusText), { status: res.status, data: err });
    }
    recordApiSuccess();
    return res.json();
  } catch (err: unknown) {
    if (!_isRetry && err instanceof Error && err.name === "AbortError") {
      // Backend cold-start (Render free tier): retry once after brief delay
      await new Promise((r) => setTimeout(r, 2000));
      return apiFetch<T>(path, options, timeoutMs, true);
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

export const api = {
  me: () => {
    if (!getToken()) return Promise.reject(new Error("Not authenticated"));
    if (!_meCache || Date.now() - _meCacheAt > ME_CACHE_TTL) {
      _meCache = apiFetch<User>("/auth/me");
      _meCacheAt = Date.now();
    }
    return _meCache;
  },
  logout: () => { clearToken(); clearMeCache(); return apiFetch<void>("/auth/logout", { method: "POST" }); },

  uploadScan: async (file: File): Promise<ScanUploadResponse> => {
    const form = new FormData();
    form.append("file", file);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 60000);
    try {
      const res = await fetch(`${API_URL}/scan/upload`, {
        method: "POST",
        headers: authHeaders(),
        body: form,
        signal: controller.signal,
      });
      _updateCreditBalance(res.headers.get("X-Credit-Balance"));
      if (!res.ok) {
        if (res.status === 401) {
          clearToken();
          clearMeCache();
          if (typeof window !== "undefined") window.location.href = "/login";
          throw Object.assign(new Error("Session expired"), { status: 401 });
        }
        const err = await res.json().catch(() => ({}));
        throw Object.assign(new Error(err.detail || res.statusText), { status: res.status, data: err });
      }
      recordApiSuccess();
      return res.json();
    } finally {
      clearTimeout(timer);
    }
  },

  confirmScan: (scanId: string, releaseId: number, condition = "VG+", lotId?: string, coverImage?: string | null) =>
    apiFetch<{ ok: boolean; credits_remaining: number; record_id: string }>(`/scan/${scanId}/confirm`, {
      method: "POST",
      body: JSON.stringify({ release_id: releaseId, condition, lot_id: lotId ?? null, cover_image: coverImage ?? null }),
    }),

  researchScan: (scanId: string, fields: { artist?: string; title?: string; label?: string; catalog_number?: string }) =>
    apiFetch<ResearchResponse>(`/scan/${scanId}/research`, {
      method: "POST",
      body: JSON.stringify(fields),
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

  checkoutSubscribe: () =>
    apiFetch<{ url: string }>("/billing/checkout/subscribe", { method: "POST" }),

  checkoutCredits: () =>
    apiFetch<{ url: string }>("/billing/checkout/credits", { method: "POST" }),

  billingPortal: () =>
    apiFetch<{ url: string }>("/billing/portal", { method: "POST" }),

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

  listCatalog: (params?: { page?: number; per_page?: number; status?: string; lot_id?: string; no_lot?: boolean; no_discogs?: boolean; search?: string; genre?: string; format?: string; condition?: string }) => {
    const p = new URLSearchParams();
    if (params?.page) p.set("page", String(params.page));
    if (params?.per_page) p.set("per_page", String(params.per_page));
    if (params?.no_discogs) p.set("no_discogs", "true");
    else if (params?.status) p.set("status", params.status);
    if (params?.no_lot) p.set("no_lot", "true");
    else if (params?.lot_id) p.set("lot_id", params.lot_id);
    if (params?.search) p.set("search", params.search);
    if (params?.genre) p.set("genre", params.genre);
    if (params?.format) p.set("format", params.format);
    if (params?.condition) p.set("condition", params.condition);
    return apiFetch<CatalogListResponse>(`/catalog?${p}`);
  },

  catalogStats: () => apiFetch<CatalogStats>("/catalog/stats"),
  checkDuplicate: (discogsReleaseId: number) =>
    apiFetch<{ in_collection: boolean; in_wantlist: boolean }>(`/catalog/check-duplicate?discogs_release_id=${discogsReleaseId}`),
  ownedReleaseIds: () =>
    apiFetch<{ release_ids: number[]; owned: { artist: string; title: string }[] }>("/catalog/owned-release-ids"),

  createRecord: (body: CreateRecordBody) =>
    apiFetch<CatalogRecord>("/catalog", { method: "POST", body: JSON.stringify(body) }),

  deleteRecord: (id: string) =>
    apiFetch<void>(`/catalog/${id}`, { method: "DELETE" }),

  getRecord: (id: string) => apiFetch<CatalogRecord>(`/catalog/${id}`),

  listLots: () => apiFetch<Lot[]>("/catalog/lots/list"),

  lotSummary: (id: string) => apiFetch<LotSummary>(`/catalog/lots/${id}/summary`),

  createLot: (body: { name: string; purchase_price?: number; notes?: string }) =>
    apiFetch<Lot>("/catalog/lots", { method: "POST", body: JSON.stringify(body) }),

  updateRecord: (id: string, body: Partial<CreateRecordBody & { asking_price?: number | null; condition?: string; lot_id?: string | null; store_listed?: boolean }>) =>
    apiFetch<CatalogRecord>(`/catalog/${id}`, { method: "PATCH", body: JSON.stringify(body) }),

  sellRecord: (id: string, sold_price: number) =>
    apiFetch<CatalogRecord>(`/catalog/${id}/sell`, { method: "POST", body: JSON.stringify({ sold_price }) }),

  catalogRemoveRecord: (id: string, body: { reason: string; note?: string }) =>
    apiFetch<CatalogRecord>(`/catalog/${id}/remove`, { method: "POST", body: JSON.stringify(body) }),

  recordHistory: (id: string) =>
    apiFetch<RecordEvent[]>(`/catalog/${id}/history`),

  catalogFindDiscogs: (id: string, body: { artist?: string; title?: string; label?: string; catalog_number?: string }) =>
    apiFetch<{ artist: string | null; title: string | null; label: string | null; catalog_number: string | null; matches: DiscogsMatch[] }>(
      `/catalog/${id}/find-discogs`, { method: "POST", body: JSON.stringify(body) }
    ),

  catalogLinkDiscogs: (id: string, releaseId: number) =>
    apiFetch<CatalogRecord>(`/catalog/${id}/link-discogs`, { method: "PATCH", body: JSON.stringify({ release_id: releaseId }) }),

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

  discogsBackfillMarket: () =>
    apiFetch<{ status: string; total: number; processed: number; updated: number; error: string | null }>(
      "/discogs/backfill-market", { method: "POST" }
    ),

  discogsBackfillMarketStatus: () =>
    apiFetch<{ status: string; total: number; processed: number; updated: number; error: string | null }>(
      "/discogs/backfill-market/status"
    ),

  discogsListRecord: (id: string) =>
    apiFetch<{ ok: boolean; listing_id: number | null; message: string }>(
      `/discogs/marketplace/${id}`, { method: "POST" }
    ),

  discogsDelistRecord: (id: string) =>
    apiFetch<{ ok: boolean; listing_id: null; message: string }>(
      `/discogs/marketplace/${id}`, { method: "DELETE" }
    ),

  // ── Store ────────────────────────────────────────────────────────────────
  getStoreSettings: () => apiFetch<StoreSettings>("/store/settings"),

  updateStoreSettings: (body: Partial<StoreSettings>) =>
    apiFetch<StoreSettings>("/store/settings", { method: "PATCH", body: JSON.stringify(body) }),

  getPublicStore: (slug: string) => apiFetch<PublicStore>(`/store/${slug}`),

  // ── Email/password auth ─────────────────────────────────────────────────
  claimAdmin: () =>
    apiFetch<{ ok: boolean; message: string }>("/auth/claim-admin", { method: "POST" }),

  emailLogin: (email: string, password: string) =>
    apiFetch<{ ok: boolean; token: string; user_id: string; is_admin: boolean }>(
      "/auth/login", { method: "POST", body: JSON.stringify({ email, password }) }
    ),

  registerViaInvite: (token: string, password: string, displayName?: string, accountType?: string) =>
    apiFetch<{ ok: boolean; token: string; user_id: string }>(
      "/auth/register", { method: "POST", body: JSON.stringify({ token, password, display_name: displayName ?? null, account_type: accountType ?? "collector" }) }
    ),

  updateMe: (body: { account_type?: string; display_name?: string }) =>
    apiFetch<User>("/auth/me", { method: "PATCH", body: JSON.stringify(body) }),

  changePassword: (currentPassword: string, newPassword: string) =>
    apiFetch<{ ok: boolean }>(
      "/auth/change-password", { method: "POST", body: JSON.stringify({ current_password: currentPassword, new_password: newPassword }) }
    ),

  resetPassword: (token: string, newPassword: string) =>
    apiFetch<{ ok: boolean }>(
      "/auth/reset-password", { method: "POST", body: JSON.stringify({ token, new_password: newPassword }) }
    ),

  // ── Admin ───────────────────────────────────────────────────────────────
  adminListUsers: () =>
    apiFetch<AdminUser[]>("/admin/users"),

  adminGetUser: (userId: string) =>
    apiFetch<AdminUser>(`/admin/users/${userId}`),

  adminPatchUser: (userId: string, patch: { display_name?: string; credits?: number; is_active?: boolean; is_admin?: boolean }) =>
    apiFetch<AdminUser>(`/admin/users/${userId}`, { method: "PATCH", body: JSON.stringify(patch) }),

  adminGenerateResetLink: (userId: string) =>
    apiFetch<{ reset_url: string; expires_in: string }>(`/admin/users/${userId}/reset-link`, { method: "POST" }),

  adminClearDiscogs: (userId: string) =>
    apiFetch<{ ok: boolean }>(`/admin/users/${userId}/clear-discogs`, { method: "POST" }),

  adminListInvites: () =>
    apiFetch<AdminInvite[]>("/admin/invites"),

  adminCreateInvite: (email: string, note?: string, expiresDays = 7) =>
    apiFetch<AdminInvite>("/admin/invites", {
      method: "POST",
      body: JSON.stringify({ email, note: note ?? null, expires_days: expiresDays }),
    }),

  adminRevokeInvite: (inviteId: string) =>
    apiFetch<void>(`/admin/invites/${inviteId}`, { method: "DELETE" }),

  // ── Wantlist ─────────────────────────────────────────────────────────────
  listWantlist: () => apiFetch<WantlistItem[]>("/wantlist"),

  addWantlistItem: (body: { artist: string; title: string; year?: number | null; label?: string | null; notes?: string | null; discogs_release_id?: number | null }) =>
    apiFetch<WantlistItem>("/wantlist", { method: "POST", body: JSON.stringify(body) }),

  deleteWantlistItem: (id: number) =>
    apiFetch<void>(`/wantlist/${id}`, { method: "DELETE" }),

  syncDiscogsWantlist: () =>
    apiFetch<WantlistItem[]>("/wantlist/sync-discogs", { method: "POST" }),
};
