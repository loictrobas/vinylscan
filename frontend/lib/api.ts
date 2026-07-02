// In local dev, resolve at call time (not module init) so phone on LAN gets the right IP.
// Module-level eval runs on the server during SSR where window is undefined → always localhost.
// Production: set NEXT_PUBLIC_API_URL explicitly.
export function _resolveApiUrl(): string {
  if (process.env.NEXT_PUBLIC_API_URL) return process.env.NEXT_PUBLIC_API_URL;
  if (typeof window !== "undefined" && window.location.hostname !== "localhost") {
    return `http://${window.location.hostname}:8000`;
  }
  return "http://localhost:8000";
}
// API_URL used for display/href attributes (may be localhost on SSR — that's OK for links)
export const API_URL = _resolveApiUrl();

export interface User {
  id: string;
  discogs_username: string | null;
  email: string | null;
  display_name: string | null;
  is_admin: boolean;
  is_active: boolean;
  credits: number;
  subscription_status: "free" | "trialing" | "active" | "past_due" | "canceled";
  subscription_current_period_end: string | null;
  trial_ends_at: string | null;
  created_at: string;
  scans_this_month: number;
  price_step: number;
}

export function isSubscribed(user: User | null | undefined): boolean {
  return user?.subscription_status === "active" || user?.subscription_status === "trialing";
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

// ── Eval types ───────────────────────────────────────────────────────────────

export interface EvalDatasetMeta {
  version: string;
  created_at: string;
  hash: string;
  count: number;
  difficulty_distribution: Record<string, number>;
  genre_distribution: Record<string, number>;
}

export interface EvalRunSummaryStats {
  total: number;
  skipped: number;
  real_top1_pct: number;
  real_top5_pct: number;
  real_mean_rank: number | null;
  ideal_top1_pct: number;
  ideal_top5_pct: number;
  ideal_mean_rank: number | null;
  extraction_bottleneck_pct: number;
  search_bottleneck_pct: number;
}

export interface EvalRunSummary {
  run_id: string;
  prompt_id: string;
  prompt_schema: string;
  timestamp: string;
  dataset_hash: string | null;
  dataset_version: string | null;
  summary: EvalRunSummaryStats;
}

export interface EvalRecordResult {
  release_id: number;
  difficulty: string;
  genres: string[];
  skipped: boolean;
  skip_reason?: string;
  ideal: { top1: boolean; top5: boolean; rank: number | null };
  real: { top1: boolean; top5: boolean; rank: number | null; extracted: Record<string, unknown> };
  failure_layer: "none" | "extraction" | "search" | "skip";
}

export interface EvalRun extends EvalRunSummary {
  records: EvalRecordResult[];
}

export interface EvalComparisonEntry {
  release_id: number;
  difficulty: string;
  genres: string[];
  a_rank: number | null;
  b_rank: number | null;
  a_extracted: Record<string, unknown>;
  b_extracted: Record<string, unknown>;
}

export interface EvalComparison {
  run_a: Pick<EvalRunSummary, "run_id" | "prompt_id" | "timestamp" | "summary">;
  run_b: Pick<EvalRunSummary, "run_id" | "prompt_id" | "timestamp" | "summary">;
  comparison: {
    total_common: number;
    fixed_count: number;
    broken_count: number;
    both_pass_count: number;
    both_fail_count: number;
    net_change: number;
  };
  by_difficulty: Record<string, { total: number; fixed: number; broken: number; both_pass: number; both_fail: number }>;
  fixed: EvalComparisonEntry[];
  broken: EvalComparisonEntry[];
  both_pass: EvalComparisonEntry[];
  both_fail: EvalComparisonEntry[];
}

export interface EvalPromptEntry {
  id: string;
  name: string;
  description: string;
  schema: string;
  active: boolean;
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
  catno: string | null;
  match_reason: string | null;
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
  internal_confidence: number;
  auto_added: boolean;
  discogs_release_id: number | null;
  matches: DiscogsMatch[];
  error?: string;
  artist_alt?: string | null;
  title_alt?: string | null;
  low_information: boolean;
  barcode: string | null;
}

export interface PendingScan extends ScanUploadResponse {
  image_url: string;
  processing: boolean;
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
  disc_condition: string | null;
  cover_condition: string | null;
  discogs_release_id: number | null;
  discogs_instance_id: number | null;
  discogs_listing_id: number | null;
  discogs_synced: boolean;
  discogs_url: string | null;
  discogs_lowest_price: number | null;
  discogs_num_for_sale: number | null;
  discogs_suggested_price: number | null;
  cover_image_url: string | null;
  tracklist: { position: string; title: string; duration: string }[] | null;
  record_section: string;
  status: "in_stock" | "sold";
  cost_price: number | null;
  asking_price: number | null;
  sold_price: number | null;
  sold_at: string | null;
  tags: string | null;
  notes: string | null;
  store_listed: boolean;
  created_at: string;
  consignor_id: number | null;
  consignor_agreed_price: number | null;
  consignor_commission_pct: number | null;
  consignor_payout_status: string | null;
  consignor_amount_owed: number | null;
  consignor_amount_paid: number | null;
  consigned_at: string | null;
}

export interface RecordEvent {
  id: number;
  record_id: string;
  event_type: string;
  detail: string | null;
  created_at: string;
}

export interface ThemeGenerationEntry {
  theme: Record<string, unknown>;
  vibe: string;
  created_at: string;
}

export interface StoreSettings {
  id: string;
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
  store_logo_url: string | null;
  store_banner_url: string | null;
  store_font: string | null;
  store_secondary_color: string | null;
  store_tagline: string | null;
  store_hours: string | null;
  store_theme_config: string | null;
  store_hero_layout: string;
}

export const HERO_LAYOUTS = ["gallery", "index", "poster"] as const;

export interface PublicRecord {
  id: string;
  artist: string | null;
  title: string | null;
  year: number | null;
  label: string | null;
  catalog_number: string | null;
  format: string | null;
  genre: string | null;
  styles: string | null;
  condition: string;
  asking_price: number | null;
  cover_image_url: string | null;
  discogs_synced: boolean;
  record_section: string;
  tracklist: { position: string; title: string; duration: string }[] | null;
  created_at: string;
}

export interface PublicAccessory {
  id: string;
  name: string;
  category: string;
  description: string | null;
  price: number | null;
  stock_quantity: number;
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
  store_logo_url: string | null;
  store_banner_url: string | null;
  store_font: string | null;
  store_secondary_color: string | null;
  store_tagline: string | null;
  store_hours: string | null;
  store_theme_config: string | null;
  store_hero_layout: string;
  records: PublicRecord[];
  accessories: PublicAccessory[];
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

export interface Accessory {
  id: string;
  name: string;
  category: string;
  description: string | null;
  price: number | null;
  stock_quantity: number;
  cover_image_url: string | null;
  is_listed: boolean;
  created_at: string;
}

export const ACCESSORY_CATEGORIES = ["Turntables", "Cartridges", "Care", "Sleeves", "Slipmats", "Storage", "Other"] as const;

export interface SellTradeLead {
  id: string;
  name: string;
  email: string;
  approx_records: string | null;
  payout_preference: string | null;
  notes: string | null;
  status: "new" | "contacted" | "closed";
  created_at: string;
}

export interface Order {
  id: string;
  order_ref: string;
  customer_name: string;
  customer_contact: string;
  note: string | null;
  items: { kind: "record" | "accessory"; id: string; name: string; qty: number; price: number | null }[];
  total: number;
  created_at: string;
}

export interface Consignor {
  id: number;
  name: string;
  contact: string | null;
  default_commission_pct: number;
  notes: string | null;
  created_at: string;
  record_count: number;
  on_floor_count: number;
  sold_count: number;
  total_owed: number;
  total_paid: number;
}

export interface ConsignedRecord {
  id: string;
  artist: string | null;
  title: string | null;
  year: number | null;
  label: string | null;
  condition: string;
  asking_price: number | null;
  status: string;
  consignor_id: number | null;
  consignor_agreed_price: number | null;
  consignor_commission_pct: number | null;
  consignor_payout_status: string | null;
  consignor_amount_owed: number | null;
  consignor_amount_paid: number | null;
  consigned_at: string | null;
  sold_price: number | null;
  sold_at: string | null;
  cover_image_url: string | null;
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
  disc_condition?: string | null;
  cover_condition?: string | null;
  lot_id?: string;
  cost_price?: number;
  asking_price?: number;
  discogs_release_id?: number;
  tags?: string;
  notes?: string;
  record_section?: string;
  tracklist?: { position: string; title: string; duration: string }[] | null;
}

export interface DiscogsSyncStatus {
  status: "idle" | "running" | "done" | "error";
  total: number;
  imported: number;
  skipped: number;
  errors: number;
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
    const res = await fetch(`${_resolveApiUrl()}${path}`, {
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

export interface AdminDebugScan {
  id: string;
  image_url: string;
  artist: string | null;
  title: string | null;
  year: number | null;
  label: string | null;
  catalog_number: string | null;
  confidence: number | null;
  status: string | null;
  created_at: string | null;
  claude_raw: Record<string, unknown> | null;
}

// ── Benchmark types ───────────────────────────────────────────────────────────

export interface BenchmarkGroundTruth {
  artist: string | null;
  title: string | null;
  year: number | null;
  label: string | null;
  catno: string | null;
  release_id: number | null;
  thumb: string | null;
}

export interface BenchmarkClaudeResult {
  artist: string | null;
  title: string | null;
  year: number | null;
  label: string | null;
  catalog_number: string | null;
  confidence: number | null;
  low_information: boolean;
  reasoning: string | null;
  _image_type: "cover" | "label";
  _image_url?: string | null;
  error?: string;
}

export interface BenchmarkResult {
  idx: number;
  gt: BenchmarkGroundTruth;
  claude: BenchmarkClaudeResult | null;
  all: BenchmarkClaudeResult[];
  status: "correct" | "partial" | "wrong" | "no_image" | "error";
  errors: string[];
}

export type BenchmarkProgressEvent =
  | { phase: "fetch"; message: string }
  | { phase: "start"; total: number; message: string }
  | { phase: "run"; done: number; total: number };

/**
 * Stream benchmark results from POST /admin/benchmark/run using fetch + ReadableStream.
 * onEvent is called for each SSE event. Returns when stream ends.
 */
export async function benchmarkRun(
  config: { n: number; include_secondary: boolean },
  onEvent: (type: string, data: unknown) => void,
  signal?: AbortSignal,
): Promise<void> {
  const token = getToken();
  const res = await fetch(`${API_URL}/admin/benchmark/run`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(config),
    signal,
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as { detail?: string }).detail ?? `HTTP ${res.status}`);
  }

  const reader = res.body!.getReader();
  const decoder = new TextDecoder();
  let buf = "";

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });

    const chunks = buf.split("\n\n");
    buf = chunks.pop() ?? "";

    for (const chunk of chunks) {
      if (!chunk.trim()) continue;
      let event = "message";
      let data = "";
      for (const line of chunk.split("\n")) {
        if (line.startsWith("event: ")) event = line.slice(7).trim();
        if (line.startsWith("data: ")) data = line.slice(6).trim();
      }
      if (data) {
        try { onEvent(event, JSON.parse(data)); } catch { /* ignore */ }
      }
    }
  }
}

export interface AdminDebugStrategyResult {
  name: string;
  params: Record<string, string>;
  result_count: number;
  error?: string | null;
  top_results: Array<{
    id: number;
    title: string | null;
    catno: string | null;
    format: string[] | null;
    cover_image: string | null;
    _match_reason: string | null;
    _score: number;
    _hit_strategies: string[];
  }>;
}

export interface AdminDebugSearchResult {
  claude_raw?: Record<string, unknown> | null;
  strategies: AdminDebugStrategyResult[];
  ranked: Array<{
    id: number;
    title: string | null;
    catno: string | null;
    format: string[] | null;
    cover_image: string | null;
    _match_reason: string | null;
    _score: number;
    _hit_strategies: string[];
    _breakdown?: {
      hit_weights: Record<string, number>;
      raw_score: number;
      b2_sim: number | null;
      b2_factor: number | null;
      b3_cd: boolean;
      b6_cover: number;
    } | null;
  }>;
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

  uploadScan: async (file: File, file2?: File): Promise<ScanUploadResponse> => {
    const form = new FormData();
    form.append("file", file);
    if (file2) form.append("file2", file2);
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

  enhanceScan: async (scanId: string, file: File): Promise<ScanUploadResponse> => {
    const form = new FormData();
    form.append("file", file);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 60000);
    try {
      const res = await fetch(`${API_URL}/scan/${scanId}/enhance`, {
        method: "POST",
        headers: authHeaders(),
        body: form,
        signal: controller.signal,
      });
      _updateCreditBalance(res.headers.get("X-Credit-Balance"));
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error((err as { detail?: string }).detail ?? res.statusText);
      }
      return res.json();
    } finally {
      clearTimeout(timer);
    }
  },

  confirmScan: (scanId: string, releaseId: number, condition = "VG+", lotId?: string, coverImage?: string | null, matchIndex?: number, coverCondition?: string) =>
    apiFetch<{ ok: boolean; credits_remaining: number; record_id: string }>(`/scan/${scanId}/confirm`, {
      method: "POST",
      body: JSON.stringify({
        release_id: releaseId, condition, lot_id: lotId ?? null, cover_image: coverImage ?? null, match_index: matchIndex ?? null,
        disc_condition: condition, cover_condition: coverCondition ?? condition,
      }),
    }),

  researchScan: (scanId: string, fields: { artist?: string; title?: string; label?: string; catalog_number?: string; year?: number }) =>
    apiFetch<ResearchResponse>(`/scan/${scanId}/research`, {
      method: "POST",
      body: JSON.stringify(fields),
    }),

  visualMatch: (scanId: string, candidates: { release_id: number; cover_image_url: string }[]) =>
    apiFetch<{ best_match_index: number | null; best_match_release_id: number | null; confidence: string; reasoning: string }>(
      `/scan/${scanId}/visual-match`,
      { method: "POST", body: JSON.stringify({ candidates }) },
    ),

  skipScan: (scanId: string) =>
    apiFetch<{ ok: boolean; credits_remaining: number }>(`/scan/${scanId}/skip`, {
      method: "POST",
    }),

  scanHistory: (page = 1, perPage = 20) =>
    apiFetch<Scan[]>(`/scan/history?page=${page}&per_page=${perPage}`),

  pendingScans: () => apiFetch<PendingScan[]>("/scan/pending"),

  adminDebugScans: (page = 1, perPage = 15) =>
    apiFetch<AdminDebugScan[]>(`/scan/admin/debug-scans?page=${page}&per_page=${perPage}`),

  adminDebugSearch: (scanId: string) =>
    apiFetch<AdminDebugSearchResult>(`/scan/admin/debug-search/${scanId}`, { method: "POST" }),

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

  prorateLotCost: (lotId: string, purchasePrice?: number) =>
    apiFetch<{ ok: boolean; purchase_price: number; record_count: number; cost_per_record: number }>(
      `/catalog/lots/${lotId}/prorate`,
      { method: "POST", body: JSON.stringify({ purchase_price: purchasePrice ?? null }) },
    ),

  updateRecord: (id: string, body: Partial<CreateRecordBody & { asking_price?: number | null; condition?: string; lot_id?: string | null; store_listed?: boolean; record_section?: string }>) =>
    apiFetch<CatalogRecord>(`/catalog/${id}`, { method: "PATCH", body: JSON.stringify(body) }),

  sellRecord: (id: string, sold_price: number) =>
    apiFetch<CatalogRecord>(`/catalog/${id}/sell`, { method: "POST", body: JSON.stringify({ sold_price }) }),

  unsellRecord: (id: string) =>
    apiFetch<CatalogRecord>(`/catalog/${id}/unsell`, { method: "POST" }),

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

  // Authenticated "Connect Discogs" from inside the app — attaches to the current
  // account instead of the anonymous loginUrl() flow, which logs in/creates by
  // discogs_username and would otherwise switch the session to a different account.
  connectDiscogs: () => apiFetch<{ authorize_url: string }>("/auth/discogs/login"),

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

  getSettingsHistory: () => apiFetch<{ settings: Partial<StoreSettings>; created_at: string }[]>("/store/settings/history"),

  updateStoreTheme: (themeJson: string) =>
    apiFetch<StoreSettings>("/store/settings", { method: "PATCH", body: JSON.stringify({ store_theme_config: themeJson }) }),

  generateStoreTheme: (vibe: string) =>
    apiFetch<ThemeGenerationEntry>("/store/theme/generate", { method: "POST", body: JSON.stringify({ vibe }) }),

  getThemeHistory: () => apiFetch<ThemeGenerationEntry[]>("/store/theme/history"),

  getPublicStore: (slug: string) => apiFetch<PublicStore>(`/store/${slug}`),

  submitSellTradeLead: (slug: string, body: { name: string; email: string; approx_records: string; payout_preference: string; notes?: string }) =>
    apiFetch<{ ok: boolean }>(`/store/${slug}/sell-trade`, { method: "POST", body: JSON.stringify(body) }),

  uploadStoreLogo: async (file: File): Promise<StoreSettings> => {
    const form = new FormData();
    form.append("file", file);
    const res = await fetch(`${API_URL}/store/logo`, {
      method: "POST",
      headers: authHeaders(),
      body: form,
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error((err as { detail?: string }).detail ?? "Upload failed");
    }
    return res.json();
  },

  deleteStoreLogo: () => apiFetch<StoreSettings>("/store/logo", { method: "DELETE" }),

  uploadStoreBanner: async (file: File): Promise<StoreSettings> => {
    const form = new FormData();
    form.append("file", file);
    const res = await fetch(`${API_URL}/store/banner`, {
      method: "POST",
      headers: authHeaders(),
      body: form,
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error((err as { detail?: string }).detail ?? "Upload failed");
    }
    return res.json();
  },

  deleteStoreBanner: () => apiFetch<StoreSettings>("/store/banner", { method: "DELETE" }),

  // ── Email/password auth ─────────────────────────────────────────────────
  claimAdmin: () =>
    apiFetch<{ ok: boolean; message: string }>("/auth/claim-admin", { method: "POST" }),

  emailLogin: (email: string, password: string) =>
    apiFetch<{ ok: boolean; token: string; user_id: string; is_admin: boolean }>(
      "/auth/login", { method: "POST", body: JSON.stringify({ email, password }) }
    ),

  registerViaInvite: (token: string, password: string, displayName?: string) =>
    apiFetch<{ ok: boolean; token: string; user_id: string }>(
      "/auth/register", { method: "POST", body: JSON.stringify({ token, password, display_name: displayName ?? null }) }
    ),

  updateMe: (body: { display_name?: string; price_step?: number }) =>
    apiFetch<User>("/auth/me", { method: "PATCH", body: JSON.stringify(body) }),

  changePassword: (currentPassword: string, newPassword: string) =>
    apiFetch<{ ok: boolean }>(
      "/auth/change-password", { method: "POST", body: JSON.stringify({ current_password: currentPassword, new_password: newPassword }) }
    ),

  resetPassword: (token: string, newPassword: string) =>
    apiFetch<{ ok: boolean }>(
      "/auth/reset-password", { method: "POST", body: JSON.stringify({ token, new_password: newPassword }) }
    ),

  disconnectDiscogs: () =>
    apiFetch<{ ok: boolean }>("/auth/disconnect-discogs", { method: "POST" }),

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

  // ── Eval harness ─────────────────────────────────────────────────────────
  evalDataset: () =>
    apiFetch<EvalDatasetMeta>("/admin/eval/dataset"),

  evalRuns: () =>
    apiFetch<EvalRunSummary[]>("/admin/eval/runs"),

  evalRun: (runId: string) =>
    apiFetch<EvalRun>(`/admin/eval/runs/${encodeURIComponent(runId)}`),

  evalCompare: (a: string, b: string) =>
    apiFetch<EvalComparison>(`/admin/eval/compare?a=${encodeURIComponent(a)}&b=${encodeURIComponent(b)}`),

  evalPrompts: () =>
    apiFetch<EvalPromptEntry[]>("/admin/eval/prompts"),

  evalSaveImage: (scanId: string, releaseId: number) =>
    apiFetch<{ ok: boolean; path: string; release_id: number; size: number }>(
      "/admin/eval/save-image",
      { method: "POST", body: JSON.stringify({ scan_id: scanId, release_id: releaseId }) }
    ),

  // ── Sell/Trade leads ─────────────────────────────────────────────────────
  listLeads: () => apiFetch<SellTradeLead[]>("/store/leads"),

  updateLeadStatus: (id: string, status: SellTradeLead["status"]) =>
    apiFetch<SellTradeLead>(`/store/leads/${id}`, { method: "PATCH", body: JSON.stringify({ status }) }),

  // ── Storefront orders ────────────────────────────────────────────────────
  listOrders: () => apiFetch<Order[]>("/store/orders"),

  placeOrder: (slug: string, body: { customer_name: string; customer_contact: string; note?: string | null; items: Order["items"]; total: number }) =>
    apiFetch<{ order_ref: string }>(`/store/${slug}/order`, { method: "POST", body: JSON.stringify(body) }),

  // ── Consignments ─────────────────────────────────────────────────────────
  listAccessories: () => apiFetch<Accessory[]>("/accessories"),

  createAccessory: (body: { name: string; category: string; description?: string | null; price?: number | null; stock_quantity?: number; is_listed?: boolean }) =>
    apiFetch<Accessory>("/accessories", { method: "POST", body: JSON.stringify(body) }),

  updateAccessory: (id: string, body: Partial<{ name: string; category: string; description: string | null; price: number | null; stock_quantity: number; is_listed: boolean }>) =>
    apiFetch<Accessory>(`/accessories/${id}`, { method: "PATCH", body: JSON.stringify(body) }),

  deleteAccessory: (id: string) =>
    apiFetch<void>(`/accessories/${id}`, { method: "DELETE" }),

  uploadAccessoryImage: async (id: string, file: File): Promise<Accessory> => {
    const form = new FormData();
    form.append("file", file);
    const res = await fetch(`${API_URL}/accessories/${id}/image`, {
      method: "POST",
      headers: authHeaders(),
      body: form,
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error((err as { detail?: string }).detail ?? "Upload failed");
    }
    return res.json();
  },

  deleteAccessoryImage: (id: string) =>
    apiFetch<Accessory>(`/accessories/${id}/image`, { method: "DELETE" }),

  listConsignors: () => apiFetch<Consignor[]>("/consignments/consignors"),

  createConsignor: (body: { name: string; contact?: string | null; default_commission_pct?: number; notes?: string | null }) =>
    apiFetch<Consignor>("/consignments/consignors", { method: "POST", body: JSON.stringify(body) }),

  updateConsignor: (id: number, body: { name?: string; contact?: string | null; default_commission_pct?: number; notes?: string | null }) =>
    apiFetch<Consignor>(`/consignments/consignors/${id}`, { method: "PATCH", body: JSON.stringify(body) }),

  deleteConsignor: (id: number) =>
    apiFetch<void>(`/consignments/consignors/${id}`, { method: "DELETE" }),

  listConsignedRecords: (params?: { consignor_id?: number; status?: string }) => {
    const p = new URLSearchParams();
    if (params?.consignor_id) p.set("consignor_id", String(params.consignor_id));
    if (params?.status) p.set("status", params.status);
    return apiFetch<ConsignedRecord[]>(`/consignments/records?${p}`);
  },

  assignConsignor: (recordId: string, body: { consignor_id: number | null; consignor_agreed_price?: number | null; consignor_commission_pct?: number | null }) =>
    apiFetch<ConsignedRecord>(`/consignments/records/${recordId}/assign`, { method: "POST", body: JSON.stringify(body) }),

  markConsignorPaid: (recordId: string) =>
    apiFetch<ConsignedRecord>(`/consignments/records/${recordId}/mark-paid`, { method: "POST" }),
};
