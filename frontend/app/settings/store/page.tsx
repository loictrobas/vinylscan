"use client";

import { useEffect, useState, useRef, useCallback, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import {
  Store, ExternalLink, Copy, Check, Loader2, Eye, Instagram,
  Share2, MapPin, Upload, X, Music, Image as ImageIcon, Type, Clock, Wand2,
  LayoutTemplate, Palette, FileText, Link2, CheckCircle2, Circle, RefreshCw, History, ArrowLeft,
  RotateCcw, Plus, AlertCircle, Sparkles,
} from "lucide-react";
import { api, getToken, type StoreSettings, type ThemeGenerationEntry } from "@/lib/api";

const FRONTEND_URL = typeof window !== "undefined" ? window.location.origin : "";

const HERO_LAYOUTS = [
  { id: "gallery", label: "Gallery", description: "Big headline left, featured cover art right" },
  { id: "index", label: "Index", description: "Full-width display headline, 4 records below it" },
  { id: "poster", label: "Poster", description: "Centered cover art, headline overlaid" },
] as const;

const FONTS = [
  { id: "inter", label: "Inter", description: "Clean · Modern", sample: "Inter", googleUrl: null },
  { id: "syne", label: "Syne", description: "Editorial · Angular", sample: "Syne", googleUrl: "https://fonts.googleapis.com/css2?family=Syne:wght@400;600;700&display=swap" },
  { id: "dm-sans", label: "DM Sans", description: "Rounded · Friendly", sample: "DM Sans", googleUrl: "https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;700&display=swap" },
  { id: "unbounded", label: "Unbounded", description: "Display · Bold", sample: "Unbounded", googleUrl: "https://fonts.googleapis.com/css2?family=Unbounded:wght@400;600;700&display=swap" },
];

function SectionHeader({ icon, title, description }: { icon: React.ReactNode; title: string; description: string }) {
  return (
    <div className="flex items-center gap-2 mb-1">
      {icon}
      <div>
        <p className="text-sm font-semibold text-vs-text">{title}</p>
        <p className="text-2xs text-vs-muted">{description}</p>
      </div>
    </div>
  );
}

// ── AI Theme — schema, validator, preview, presets (ported from /settings/store/theme) ──

export interface StoreTheme {
  accent: string;
  secondary: string;
  font: "inter" | "syne" | "dm-sans" | "unbounded";
  radius: "sharp" | "soft" | "round";
  border_weight: "hairline" | "bold" | "none";
  shadow_style: "flat" | "soft" | "hard-offset";
  density: "compact" | "comfortable" | "spacious";
  headline_scale: "modest" | "editorial" | "oversized";
  card_texture: "plain" | "swatch" | "grain";
  motion: "minimal" | "smooth" | "playful";
  button_shape: "block" | "pill" | "underline";
  mood?: string;
}

const FONT_URLS: Record<string, string | null> = {
  inter: null,
  syne: "https://fonts.googleapis.com/css2?family=Syne:wght@400;600;700&display=swap",
  "dm-sans": "https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;700&display=swap",
  unbounded: "https://fonts.googleapis.com/css2?family=Unbounded:wght@400;600;700&display=swap",
};

const FONT_FAMILIES: Record<string, string> = {
  inter: "'Inter', sans-serif",
  syne: "'Syne', sans-serif",
  "dm-sans": "'DM Sans', sans-serif",
  unbounded: "'Unbounded', sans-serif",
};

const RADIUS_PX: Record<string, string> = { sharp: "0px", soft: "10px", round: "28px" };
const BORDER_PX: Record<string, string> = { hairline: "1px", bold: "3px", none: "0px" };
const CARD_PAD: Record<string, string> = { compact: "8px", comfortable: "12px", spacious: "18px" };

interface ValidationResult {
  ok: boolean;
  errors: string[];
  parsed?: StoreTheme;
}

const HEX_RE = /^#[0-9a-fA-F]{6}$/;
const VALID_FONTS = ["inter", "syne", "dm-sans", "unbounded"];
const VALID_RADII = ["sharp", "soft", "round"];
const VALID_BORDER_WEIGHTS = ["hairline", "bold", "none"];
const VALID_SHADOW_STYLES = ["flat", "soft", "hard-offset"];
const VALID_DENSITIES = ["compact", "comfortable", "spacious"];
const VALID_HEADLINE_SCALES = ["modest", "editorial", "oversized"];
const VALID_CARD_TEXTURES = ["plain", "swatch", "grain"];
const VALID_MOTIONS = ["minimal", "smooth", "playful"];
const VALID_BUTTON_SHAPES = ["block", "pill", "underline"];
const REQUIRED_KEYS = [
  "accent", "secondary", "font", "radius", "border_weight", "shadow_style",
  "density", "headline_scale", "card_texture", "motion", "button_shape",
];
const ALLOWED_KEYS = [...REQUIRED_KEYS, "mood"];

function validateTheme(raw: string): ValidationResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { ok: false, errors: ['Invalid JSON — could not parse. Check for missing quotes, commas, or brackets.'] };
  }

  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    return { ok: false, errors: ["Expected a JSON object {…}, not an array or primitive."] };
  }

  const obj = parsed as Record<string, unknown>;
  const errors: string[] = [];

  for (const key of REQUIRED_KEYS) {
    if (!(key in obj)) errors.push(`Missing required key: "${key}"`);
  }

  if (typeof obj.accent === "string" && !HEX_RE.test(obj.accent))
    errors.push(`"accent" must be a 6-digit hex color like "#a855f7" — got "${obj.accent}"`);
  if (typeof obj.secondary === "string" && !HEX_RE.test(obj.secondary))
    errors.push(`"secondary" must be a 6-digit hex color like "#ec4899" — got "${obj.secondary}"`);
  if (typeof obj.font === "string" && !VALID_FONTS.includes(obj.font))
    errors.push(`"font" must be one of: ${VALID_FONTS.map((f) => `"${f}"`).join(", ")} — got "${obj.font}"`);
  if (typeof obj.radius === "string" && !VALID_RADII.includes(obj.radius))
    errors.push(`"radius" must be one of: ${VALID_RADII.map((r) => `"${r}"`).join(", ")} — got "${obj.radius}"`);
  if (typeof obj.border_weight === "string" && !VALID_BORDER_WEIGHTS.includes(obj.border_weight))
    errors.push(`"border_weight" must be one of: ${VALID_BORDER_WEIGHTS.map((v) => `"${v}"`).join(", ")} — got "${obj.border_weight}"`);
  if (typeof obj.shadow_style === "string" && !VALID_SHADOW_STYLES.includes(obj.shadow_style))
    errors.push(`"shadow_style" must be one of: ${VALID_SHADOW_STYLES.map((v) => `"${v}"`).join(", ")} — got "${obj.shadow_style}"`);
  if (typeof obj.density === "string" && !VALID_DENSITIES.includes(obj.density))
    errors.push(`"density" must be one of: ${VALID_DENSITIES.map((v) => `"${v}"`).join(", ")} — got "${obj.density}"`);
  if (typeof obj.headline_scale === "string" && !VALID_HEADLINE_SCALES.includes(obj.headline_scale))
    errors.push(`"headline_scale" must be one of: ${VALID_HEADLINE_SCALES.map((v) => `"${v}"`).join(", ")} — got "${obj.headline_scale}"`);
  if (typeof obj.card_texture === "string" && !VALID_CARD_TEXTURES.includes(obj.card_texture))
    errors.push(`"card_texture" must be one of: ${VALID_CARD_TEXTURES.map((v) => `"${v}"`).join(", ")} — got "${obj.card_texture}"`);
  if (typeof obj.motion === "string" && !VALID_MOTIONS.includes(obj.motion))
    errors.push(`"motion" must be one of: ${VALID_MOTIONS.map((v) => `"${v}"`).join(", ")} — got "${obj.motion}"`);
  if (typeof obj.button_shape === "string" && !VALID_BUTTON_SHAPES.includes(obj.button_shape))
    errors.push(`"button_shape" must be one of: ${VALID_BUTTON_SHAPES.map((v) => `"${v}"`).join(", ")} — got "${obj.button_shape}"`);

  for (const key of Object.keys(obj)) {
    if (!ALLOWED_KEYS.includes(key)) {
      errors.push(`Unexpected key "${key}" — allowed keys are: ${ALLOWED_KEYS.map((k) => `"${k}"`).join(", ")}`);
    }
  }
  if (typeof obj.mood === "string" && obj.mood.length > 80)
    errors.push(`"mood" must be 80 characters or fewer (got ${obj.mood.length})`);

  if (errors.length > 0) return { ok: false, errors };
  return { ok: true, errors: [], parsed: obj as unknown as StoreTheme };
}

const FAKE_RECORD = {
  title: "Blue Lines",
  artist: "Massive Attack",
  condition: "VG+",
  format: "LP",
  asking_price: 24.99,
  genre: "Trip-Hop",
};

function PreviewCard({ theme }: { theme: StoreTheme }) {
  const radius = RADIUS_PX[theme.radius];
  const borderW = BORDER_PX[theme.border_weight];
  const pad = CARD_PAD[theme.density];
  const fontFamily = FONT_FAMILIES[theme.font];
  const condColor = "#f59e0b";

  const shadow =
    theme.shadow_style === "soft" ? "0 4px 16px 0 rgba(0,0,0,0.12)"
    : theme.shadow_style === "hard-offset" ? `4px 4px 0 0 ${theme.accent}`
    : "none";

  const cardStyle: React.CSSProperties = {
    fontFamily,
    backgroundColor: "#ffffff",
    borderRadius: radius,
    color: "#111111",
    overflow: "hidden",
    width: "180px",
    flexShrink: 0,
    border: borderW === "0px" ? "none" : `${borderW} solid #d4d4d4`,
    boxShadow: shadow,
  };

  const buttonRadius = theme.button_shape === "pill" ? "999px" : theme.button_shape === "underline" ? "0px" : radius;

  return (
    <div style={cardStyle}>
      <div
        style={{
          aspectRatio: "1",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          position: "relative",
          backgroundColor: theme.card_texture === "plain" ? "#e5e5e5" : undefined,
          backgroundImage: theme.card_texture === "plain"
            ? undefined
            : theme.card_texture === "grain"
              ? `radial-gradient(circle, rgba(255,255,255,0.15) 1px, transparent 1px), linear-gradient(135deg, ${theme.accent} 0%, ${theme.secondary} 100%)`
              : `linear-gradient(135deg, ${theme.accent} 0%, ${theme.secondary} 100%)`,
          backgroundSize: theme.card_texture === "grain" ? "3px 3px, cover" : undefined,
        }}
      >
        <Music size={36} color="rgba(255,255,255,0.6)" />
        <div style={{ position: "absolute", top: 8, left: 8 }}>
          <span style={{ background: "rgba(0,0,0,0.6)", color: "rgba(255,255,255,0.9)", fontSize: "10px", padding: "2px 7px", fontWeight: 500, textTransform: "uppercase", letterSpacing: "0.05em" }}>
            {FAKE_RECORD.genre}
          </span>
        </div>
      </div>

      <div style={{ padding: pad }}>
        <p style={{
          fontWeight: 700, lineHeight: 1.2, marginBottom: 2,
          fontSize: theme.headline_scale === "modest" ? "12px" : theme.headline_scale === "oversized" ? "16px" : "13px",
        }}>
          {FAKE_RECORD.title}
        </p>
        <p style={{ fontSize: "11px", color: "#6b7280", marginBottom: 8 }}>
          {FAKE_RECORD.artist}
        </p>

        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
          <div style={{ display: "flex", gap: 4 }}>
            <span style={{ fontSize: "10px", padding: "2px 6px", fontWeight: 700, color: condColor, background: `${condColor}18`, border: `1px solid ${condColor}40` }}>
              {FAKE_RECORD.condition}
            </span>
            <span style={{ fontSize: "10px", padding: "2px 6px", background: "#f3f4f6", color: "#6b7280", fontWeight: 500 }}>
              {FAKE_RECORD.format}
            </span>
          </div>
          {theme.button_shape !== "block" && (
            <span style={{ fontWeight: 700, fontSize: "15px" }}>${FAKE_RECORD.asking_price.toFixed(2)}</span>
          )}
        </div>

        {theme.button_shape === "underline" ? (
          <button style={{ width: "100%", padding: "4px 0", fontSize: "11px", fontWeight: 600, display: "flex", alignItems: "center", justifyContent: "center", gap: 4, cursor: "pointer", background: "none", border: "none", borderBottom: `1px solid ${theme.accent}`, color: theme.accent }}>
            <Plus size={10} />Add
          </button>
        ) : (
          <button style={{
            width: "100%", padding: "6px 10px", borderRadius: buttonRadius, fontSize: "11px", fontWeight: 600,
            display: "flex", alignItems: "center", justifyContent: theme.button_shape === "block" ? "space-between" : "center", gap: 4,
            cursor: "pointer", background: "transparent", border: `1px solid ${theme.accent}`, color: theme.accent,
          }}>
            <span style={{ display: "flex", alignItems: "center", gap: 4 }}><Plus size={10} />Add</span>
            {theme.button_shape === "block" && <span>${FAKE_RECORD.asking_price.toFixed(2)}</span>}
          </button>
        )}
      </div>
    </div>
  );
}

const THEME_PRESETS: { label: string; description: string; theme: StoreTheme }[] = [
  {
    label: "Editorial Minimal",
    description: "Today's default — sharp, hairline, quiet",
    theme: { accent: "#a855f7", secondary: "#ec4899", font: "inter", radius: "sharp", border_weight: "hairline", shadow_style: "flat", density: "comfortable", headline_scale: "editorial", card_texture: "swatch", motion: "minimal", button_shape: "block", mood: "clean editorial record shop" },
  },
  {
    label: "Neo-Brutalist",
    description: "Thick borders, offset shadow, loud",
    theme: { accent: "#ff0055", secondary: "#000000", font: "unbounded", radius: "sharp", border_weight: "bold", shadow_style: "hard-offset", density: "compact", headline_scale: "oversized", card_texture: "grain", motion: "playful", button_shape: "block", mood: "loud neo-brutalist record fair stall" },
  },
  {
    label: "Soft Pastel",
    description: "Rounded, airy, gentle",
    theme: { accent: "#f9a8d4", secondary: "#93c5fd", font: "dm-sans", radius: "round", border_weight: "none", shadow_style: "soft", density: "spacious", headline_scale: "modest", card_texture: "swatch", motion: "smooth", button_shape: "pill", mood: "soft pastel boutique record shop" },
  },
  {
    label: "Warm Vintage",
    description: "Amber tones, underline links, unhurried",
    theme: { accent: "#b45309", secondary: "#78350f", font: "syne", radius: "soft", border_weight: "hairline", shadow_style: "soft", density: "comfortable", headline_scale: "editorial", card_texture: "grain", motion: "smooth", button_shape: "underline", mood: "warm vintage second-hand record shop" },
  },
  {
    label: "Dark Vinyl",
    description: "Cyan + violet, bold display headlines",
    theme: { accent: "#22d3ee", secondary: "#a855f7", font: "unbounded", radius: "soft", border_weight: "hairline", shadow_style: "soft", density: "comfortable", headline_scale: "oversized", card_texture: "swatch", motion: "smooth", button_shape: "block", mood: "late-night electronic and techno record shop" },
  },
  {
    label: "Bold Pop",
    description: "Yellow + red, pill buttons, max energy",
    theme: { accent: "#fbbf24", secondary: "#ef4444", font: "unbounded", radius: "round", border_weight: "bold", shadow_style: "hard-offset", density: "compact", headline_scale: "oversized", card_texture: "grain", motion: "playful", button_shape: "pill", mood: "colorful 70s soul and funk shop" },
  },
];

const SCHEMA_EXAMPLE = `{
  "accent": "#a855f7",
  "secondary": "#ec4899",
  "font": "syne",
  "radius": "round",
  "border_weight": "none",
  "shadow_style": "soft",
  "density": "comfortable",
  "headline_scale": "oversized",
  "card_texture": "swatch",
  "motion": "smooth",
  "button_shape": "pill",
  "mood": "indie record shop, warm and eclectic"
}`;

function buildPrompt(storeName: string, storeDesc: string): string {
  return `You are generating a visual theme config for a vinyl record store storefront.

Store name: ${storeName || "my vinyl store"}
${storeDesc ? `Store description: ${storeDesc}` : ""}

[DESCRIBE YOUR STORE'S VIBE HERE — e.g. "gritty punk basement in Berlin", "clean minimalist jazz shrine", "colorful 70s soul and funk shop", "loud neo-brutalist record fair stall"]

Return ONLY a valid JSON object. No explanation, no markdown, no code blocks — just the raw JSON.

Schema:
{
  "accent": string,     // hex color like "#a855f7" — primary brand color (buttons, highlights)
  "secondary": string,  // hex color like "#ec4899" — gradient & secondary accents
  "font": "inter" | "syne" | "dm-sans" | "unbounded",
  "radius": "sharp" | "soft" | "round",                  // corner rounding on every card/button/chip
  "border_weight": "hairline" | "bold" | "none",          // border thickness throughout the storefront
  "shadow_style": "flat" | "soft" | "hard-offset",        // flat=no shadow, soft=subtle blur, hard-offset=solid neo-brutalist offset shadow
  "density": "compact" | "comfortable" | "spacious",      // padding/spacing scale on cards, buttons, sections
  "headline_scale": "modest" | "editorial" | "oversized", // how big section/hero headlines render
  "card_texture": "plain" | "swatch" | "grain",           // plain=flat gray fallback, swatch=colored block per genre (default), grain=swatch+subtle noise
  "motion": "minimal" | "smooth" | "playful",             // hover feel: none, gentle lift, or scale+tilt
  "button_shape": "block" | "pill" | "underline",         // Add-to-bag/CTA button shape
  "mood": string        // optional, max 80 chars, describes the vibe (not displayed)
}

Guide:
- font: inter = clean modern, syne = editorial angular, dm-sans = friendly geometric, unbounded = bold display
- radius: sharp = zero rounding (modern/editorial), soft = light rounding, round = heavily rounded corners (for fully pill-shaped buttons, use button_shape instead)
- shadow_style: hard-offset only looks right paired with bold border_weight and sharp/soft radius (neo-brutalist)
- motion: playful adds a slight scale+tilt on hover — fits loud/energetic vibes, not calm/minimal ones

Example output:
${SCHEMA_EXAMPLE}`;
}

// CSS `position: sticky` doesn't work here — the shared AppShell's <main> has
// `overflow-auto` (for wide tables on other pages), which makes it the sticky
// containing block even though it never actually scrolls itself (the window
// does) — so sticky never engages. Faking it with position:fixed + a scroll
// listener instead, scoped to just this page.
function StickyPreview({ children }: { children: React.ReactNode }) {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const innerRef = useRef<HTMLDivElement>(null);
  const stuckRef = useRef(false);
  const [stuck, setStuck] = useState(false);
  const [rect, setRect] = useState<{ left: number; width: number; height: number } | null>(null);

  useEffect(() => {
    function update() {
      const wrapper = wrapperRef.current;
      const inner = innerRef.current;
      if (!wrapper || !inner) return;
      const shouldStick = wrapper.getBoundingClientRect().top <= 24;
      if (!stuckRef.current) {
        const r = inner.getBoundingClientRect();
        setRect({ left: r.left, width: r.width, height: r.height });
      }
      if (shouldStick !== stuckRef.current) {
        stuckRef.current = shouldStick;
        setStuck(shouldStick);
      }
    }
    update();
    window.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update);
    return () => {
      window.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
    };
  }, []);

  return (
    <div ref={wrapperRef} style={stuck && rect ? { height: rect.height } : undefined}>
      <div
        ref={innerRef}
        className={stuck ? "lg:fixed" : undefined}
        style={stuck && rect ? { top: 24, left: rect.left, width: rect.width } : undefined}
      >
        {children}
      </div>
    </div>
  );
}

type Tab = "info" | "personalization" | "design";
const TABS: { id: Tab; label: string; icon: React.ReactNode }[] = [
  { id: "info", label: "Store info", icon: <FileText size={14} /> },
  { id: "personalization", label: "Personalization", icon: <ImageIcon size={14} /> },
  { id: "design", label: "Design", icon: <Palette size={14} /> },
];

function StoreSettingsPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [activeTab, setActiveTab] = useState<Tab>(() => {
    const t = searchParams.get("tab");
    return t === "design" || t === "personalization" || t === "info" ? t : "info";
  });

  const [settings, setSettings] = useState<StoreSettings | null>(null);
  const [form, setForm] = useState({
    store_name: "",
    store_slug: "",
    store_description: "",
    store_tagline: "",
    store_contact: "",
    store_public: false,
    store_info_banner: "",
    store_instagram: "",
    store_location: "",
    store_accent_color: "",
    store_secondary_color: "",
    store_font: "inter",
    store_facebook: "",
    store_website: "",
    store_hours: "",
    store_hero_layout: "gallery",
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);

  const [logoUploading, setLogoUploading] = useState(false);
  const [logoError, setLogoError] = useState("");
  const [logoPreview, setLogoPreview] = useState<string | null>(null);

  const [bannerUploading, setBannerUploading] = useState(false);
  const [bannerError, setBannerError] = useState("");
  const [bannerPreview, setBannerPreview] = useState<string | null>(null);
  const [accessoryCount, setAccessoryCount] = useState<number | null>(null);
  const [previewKey, setPreviewKey] = useState(0);
  const [settingsHistory, setSettingsHistory] = useState<{ settings: Record<string, unknown>; created_at: string }[]>([]);
  const [historyOpen, setHistoryOpen] = useState(false);
  const initialFormRef = useRef<typeof form | null>(null);

  // AI Theme state (merged in from the old /settings/store/theme page)
  const [currentTheme, setCurrentTheme] = useState<StoreTheme | null>(null);
  const [themeJson, setThemeJson] = useState("");
  const [themeValidation, setThemeValidation] = useState<ValidationResult | null>(null);
  const [themeSaving, setThemeSaving] = useState(false);
  const [themeSaved, setThemeSaved] = useState(false);
  const [promptCopied, setPromptCopied] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [vibe, setVibe] = useState("");
  const [generating, setGenerating] = useState(false);
  const [genError, setGenError] = useState("");
  const [themeHistory, setThemeHistory] = useState<ThemeGenerationEntry[]>([]);
  const [lastAppliedTheme, setLastAppliedTheme] = useState("");

  // Load Google Fonts for all non-system fonts so previews render correctly
  useEffect(() => {
    const links: HTMLLinkElement[] = [];
    for (const font of FONTS) {
      if (!font.googleUrl) continue;
      const existing = document.querySelector(`link[data-font-id="${font.id}"]`);
      if (existing) continue;
      const link = document.createElement("link");
      link.rel = "stylesheet";
      link.href = font.googleUrl;
      link.setAttribute("data-font-id", font.id);
      document.head.appendChild(link);
      links.push(link);
    }
    return () => {
      links.forEach((l) => l.remove());
    };
  }, []);

  useEffect(() => {
    if (!getToken()) { router.replace("/"); return; }
    api.getStoreSettings()
      .then((s) => {
        setSettings(s);
        const loaded = {
          store_name: s.store_name ?? "",
          store_slug: s.store_slug ?? "",
          store_description: s.store_description ?? "",
          store_tagline: s.store_tagline ?? "",
          store_contact: s.store_contact ?? "",
          store_public: s.store_public,
          store_info_banner: s.store_info_banner ?? "",
          store_instagram: s.store_instagram ?? "",
          store_location: s.store_location ?? "",
          store_accent_color: s.store_accent_color ?? "",
          store_secondary_color: s.store_secondary_color ?? "",
          store_font: s.store_font ?? "inter",
          store_facebook: s.store_facebook ?? "",
          store_website: s.store_website ?? "",
          store_hours: s.store_hours ?? "",
          store_hero_layout: s.store_hero_layout ?? "gallery",
        };
        setForm(loaded);
        initialFormRef.current = loaded;
        if (s.store_theme_config) {
          try {
            const parsed = JSON.parse(s.store_theme_config) as StoreTheme;
            setCurrentTheme(parsed);
            const s2 = JSON.stringify(parsed, null, 2);
            setThemeJson(s2);
            setLastAppliedTheme(s2);
          } catch { /* corrupted, ignore */ }
        }
      })
      .finally(() => setLoading(false));
    api.listAccessories().then((as) => setAccessoryCount(as.filter((a) => a.is_listed).length)).catch(() => {});
    api.getSettingsHistory().then(setSettingsHistory).catch(() => {});
    api.me().then((u) => {
      setIsAdmin(u.is_admin);
      if (u.is_admin) api.getThemeHistory().then(setThemeHistory).catch(() => {});
    }).catch(() => {});
  }, [router]);

  function restoreSnapshot(settings: Record<string, unknown>) {
    setForm((f) => ({
      ...f,
      ...Object.fromEntries(Object.entries(settings).map(([k, v]) => [k, v ?? (typeof f[k as keyof typeof f] === "boolean" ? false : "")])),
    }));
    setHistoryOpen(false);
  }

  async function handleLogoUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setLogoPreview(URL.createObjectURL(file));
    setLogoUploading(true);
    setLogoError("");
    try {
      const updated = await api.uploadStoreLogo(file);
      setSettings(updated);
      setLogoPreview(null);
    } catch (err: unknown) {
      setLogoError(err instanceof Error ? err.message : "Upload failed");
      setLogoPreview(null);
    } finally {
      setLogoUploading(false);
      e.target.value = "";
    }
  }

  async function handleLogoRemove() {
    setLogoUploading(true);
    try {
      const updated = await api.deleteStoreLogo();
      setSettings(updated);
    } catch { /* ignore */ } finally {
      setLogoUploading(false);
    }
  }

  async function handleBannerUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setBannerPreview(URL.createObjectURL(file));
    setBannerUploading(true);
    setBannerError("");
    try {
      const updated = await api.uploadStoreBanner(file);
      setSettings(updated);
      setBannerPreview(null);
    } catch (err: unknown) {
      setBannerError(err instanceof Error ? err.message : "Upload failed");
      setBannerPreview(null);
    } finally {
      setBannerUploading(false);
      e.target.value = "";
    }
  }

  async function handleBannerRemove() {
    setBannerUploading(true);
    try {
      const updated = await api.deleteStoreBanner();
      setSettings(updated);
    } catch { /* ignore */ } finally {
      setBannerUploading(false);
    }
  }

  async function save() {
    setSaving(true); setError(""); setSaved(false);
    try {
      const updated = await api.updateStoreSettings({
        store_name: form.store_name || null,
        store_slug: form.store_slug || null,
        store_description: form.store_description || null,
        store_tagline: form.store_tagline || null,
        store_contact: form.store_contact || null,
        store_public: form.store_public,
        store_info_banner: form.store_info_banner || null,
        store_instagram: form.store_instagram || null,
        store_location: form.store_location || null,
        store_accent_color: form.store_accent_color || null,
        store_secondary_color: form.store_secondary_color || null,
        store_font: form.store_font || "inter",
        store_facebook: form.store_facebook || null,
        store_website: form.store_website || null,
        store_hours: form.store_hours || null,
        store_hero_layout: form.store_hero_layout || "gallery",
      });
      setSettings(updated);
      const savedForm = {
        store_name: updated.store_name ?? "",
        store_slug: updated.store_slug ?? "",
        store_description: updated.store_description ?? "",
        store_tagline: updated.store_tagline ?? "",
        store_contact: updated.store_contact ?? "",
        store_public: updated.store_public,
        store_info_banner: updated.store_info_banner ?? "",
        store_instagram: updated.store_instagram ?? "",
        store_location: updated.store_location ?? "",
        store_accent_color: updated.store_accent_color ?? "",
        store_secondary_color: updated.store_secondary_color ?? "",
        store_font: updated.store_font ?? "inter",
        store_facebook: updated.store_facebook ?? "",
        store_website: updated.store_website ?? "",
        store_hours: updated.store_hours ?? "",
        store_hero_layout: updated.store_hero_layout ?? "gallery",
      };
      setForm(savedForm);
      initialFormRef.current = savedForm;
      setSaved(true);
      setPreviewKey((k) => k + 1);
      api.getSettingsHistory().then(setSettingsHistory).catch(() => {});
      setTimeout(() => setSaved(false), 2500);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Save failed";
      setError(msg.includes("409") || msg.toLowerCase().includes("taken") ? "That URL slug is already taken." : msg);
    } finally { setSaving(false); }
  }

  const storePath = settings ? `/store/${settings.store_slug || settings.id}` : null;
  const storeUrl = storePath ? `${FRONTEND_URL}${storePath}` : null;

  async function copyUrl() {
    if (!storeUrl) return;
    await navigator.clipboard.writeText(storeUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  // ── AI Theme handlers (ported) ──
  async function handleGenerate() {
    if (!vibe.trim()) return;
    setGenerating(true);
    setGenError("");
    try {
      const entry = await api.generateStoreTheme(vibe.trim());
      const s = JSON.stringify(entry.theme, null, 2);
      setThemeJson(s);
      setThemeValidation(validateTheme(s));
      setThemeHistory((h) => [entry, ...h].slice(0, 3));
    } catch (e: unknown) {
      setGenError(e instanceof Error ? e.message : "Generation failed");
    } finally {
      setGenerating(false);
    }
  }

  function loadFromHistory(entry: ThemeGenerationEntry) {
    const s = JSON.stringify(entry.theme, null, 2);
    setThemeJson(s);
    setThemeValidation(validateTheme(s));
    setThemeSaved(false);
  }

  // Load font for theme preview
  useEffect(() => {
    if (!themeValidation?.parsed) return;
    const url = FONT_URLS[themeValidation.parsed.font];
    if (!url) return;
    if (document.querySelector(`link[href="${url}"]`)) return;
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = url;
    document.head.appendChild(link);
  }, [themeValidation?.parsed?.font]);

  const handleJsonChange = useCallback((value: string) => {
    setThemeJson(value);
    setThemeSaved(false);
    if (!value.trim()) { setThemeValidation(null); return; }
    setThemeValidation(validateTheme(value));
  }, []);

  async function handleApplyTheme() {
    if (!themeValidation?.ok || !themeValidation.parsed) return;
    setThemeSaving(true);
    try {
      await api.updateStoreTheme(JSON.stringify(themeValidation.parsed));
      setCurrentTheme(themeValidation.parsed);
      setLastAppliedTheme(themeJson);
      setThemeSaved(true);
      setSettings((s) => s ? { ...s, store_theme_config: JSON.stringify(themeValidation.parsed) } : s);
      setPreviewKey((k) => k + 1);
    } catch (e: unknown) {
      setThemeValidation({ ok: false, errors: [e instanceof Error ? e.message : "Save failed"] });
    } finally {
      setThemeSaving(false);
    }
  }

  function handleThemeReset() {
    if (currentTheme) {
      const s = JSON.stringify(currentTheme, null, 2);
      setThemeJson(s);
      setThemeValidation(validateTheme(s));
    } else {
      setThemeJson("");
      setThemeValidation(null);
    }
    setThemeSaved(false);
  }

  async function copyPrompt() {
    await navigator.clipboard.writeText(buildPrompt(form.store_name, form.store_description));
    setPromptCopied(true);
    setTimeout(() => setPromptCopied(false), 2000);
  }

  const previewTheme = themeValidation?.parsed ?? currentTheme;

  const isDirty = initialFormRef.current !== null && JSON.stringify(form) !== JSON.stringify(initialFormRef.current);
  const isThemeDirty = themeJson !== lastAppliedTheme;

  useEffect(() => {
    if (!isDirty && !isThemeDirty) return;
    function onBeforeUnload(e: BeforeUnloadEvent) { e.preventDefault(); }
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [isDirty, isThemeDirty]);

  const accentPreview = form.store_accent_color || "#a855f7";
  const secondaryPreview = form.store_secondary_color || "#ec4899";
  const bannerSrc = bannerPreview ?? settings?.store_banner_url ?? null;

  function goToTab(tab: Tab) {
    setActiveTab(tab);
    router.replace(`/settings/store?tab=${tab}`, { scroll: false });
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 size={24} className="animate-spin text-vs-muted" />
      </div>
    );
  }

  return (
    <div className="px-6 py-6 max-w-6xl">
      <Link href="/settings" className="text-xs text-vs-muted hover:text-vs-text inline-flex items-center gap-1 mb-3">
        <ArrowLeft size={11} />
        Back to Settings
      </Link>

      <div className="flex items-center justify-between gap-4 mb-6">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-vs-raised border border-vs-border-2 flex items-center justify-center">
            <Store size={16} className="text-vs-accent" />
          </div>
          <div>
            <h1 className="text-xl font-medium">Your store</h1>
            <p className="text-xs text-vs-muted mt-0.5">Public browsable catalog for your customers</p>
          </div>
        </div>
        {storePath && (
          <a
            href={storePath}
            target="_blank"
            rel="noopener noreferrer"
            className="btn-primary text-sm flex items-center gap-2 flex-shrink-0"
          >
            <Eye size={14} />
            View your store
            <ExternalLink size={12} />
          </a>
        )}
      </div>

      {/* ── HEALTH CHECKLIST ───────────────────────────────────────────────── */}
      {(() => {
        const items: { label: string; done: boolean; action: () => void }[] = [
          { label: "Logo uploaded", done: !!settings?.store_logo_url, action: () => goToTab("personalization") },
          { label: "Banner uploaded", done: !!settings?.store_banner_url, action: () => goToTab("personalization") },
          { label: "At least 1 accessory listed", done: (accessoryCount ?? 0) > 0, action: () => router.push("/catalog/accessories") },
          { label: "AI theme applied", done: !!settings?.store_theme_config, action: () => goToTab("design") },
          { label: "Store is public", done: !!form.store_public, action: () => {} },
          { label: "Contact info set", done: !!form.store_contact, action: () => goToTab("info") },
        ];
        const doneCount = items.filter((i) => i.done).length;
        if (doneCount === items.length) return null;
        return (
          <div className="card p-4 mb-6">
            <p className="text-xs font-medium text-vs-text-2 mb-3">Storefront checklist — {doneCount}/{items.length} done</p>
            <div className="flex flex-wrap gap-2">
              {items.map((item) => (
                <button
                  key={item.label}
                  onClick={item.action}
                  className={`text-xs px-2.5 py-1.5 rounded-lg border flex items-center gap-1.5 transition-colors ${
                    item.done ? "border-vs-success/30 text-vs-success bg-vs-success/5" : "border-vs-border text-vs-muted hover:text-vs-text hover:border-vs-border-2"
                  }`}
                >
                  {item.done ? <CheckCircle2 size={12} /> : <Circle size={12} />}
                  {item.label}
                </button>
              ))}
            </div>
          </div>
        );
      })()}

      {/* ── LIVE PREVIEW (real storefront, last saved) ──────────────────────── */}
      {storeUrl && (
        <div className="card p-4 mb-6">
          <div className="flex items-center justify-between mb-3">
            <p className="text-xs font-medium text-vs-text-2">Live preview</p>
            <button
              onClick={() => setPreviewKey((k) => k + 1)}
              className="text-2xs text-vs-muted hover:text-vs-text flex items-center gap-1.5 transition-colors"
            >
              <RefreshCw size={11} />
              Refresh preview
            </button>
          </div>
          <div className="rounded-lg border border-vs-border overflow-hidden bg-vs-raised" style={{ height: 480 }}>
            <iframe key={previewKey} src={storeUrl} className="w-full h-full" style={{ border: "none" }} title="Storefront preview" />
          </div>
          <p className="text-2xs text-vs-muted mt-2">Shows your last saved storefront — not live as you type. Refreshes automatically after you save.</p>
        </div>
      )}

      {/* ── STATUS + LINK (full width) ──────────────────────────────────── */}
      <div className="card p-5 mb-6">
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-sm font-medium text-vs-text">
              {form.store_public ? "Store is live" : "Store is private"}
            </p>
            <p className="text-xs text-vs-muted mt-0.5">
              {form.store_public
                ? "Customers can browse and build carts"
                : "Only you can see it — flip the switch when ready"}
            </p>
          </div>
          <button
            onClick={() => setForm((f) => ({ ...f, store_public: !f.store_public }))}
            className={`relative inline-flex items-center w-11 h-6 rounded-full transition-colors flex-shrink-0 ${form.store_public ? "bg-vs-success" : "bg-vs-border"}`}
          >
            <span className={`inline-block w-5 h-5 rounded-full bg-white shadow transition-transform ${form.store_public ? "translate-x-5" : "translate-x-0.5"}`} />
          </button>
        </div>

        {storeUrl && (
          <div className="flex gap-4 mt-4 pt-4 border-t border-vs-border">
            <img
              src={`https://api.qrserver.com/v1/create-qr-code/?size=80x80&data=${encodeURIComponent(storeUrl)}&bgcolor=ffffff&color=000000&margin=2`}
              alt="Store QR code"
              width={80}
              height={80}
              className="rounded-lg border border-vs-border flex-shrink-0"
            />
            <div className="flex-1 min-w-0 flex flex-col gap-2">
              <div className="p-2.5 rounded-lg bg-vs-raised border border-vs-border flex items-center gap-2">
                <p className="text-xs text-vs-text-2 flex-1 truncate">{storeUrl}</p>
                <button onClick={copyUrl} className="text-vs-muted hover:text-vs-text flex-shrink-0 transition-colors" title="Copy link">
                  {copied ? <Check size={13} className="text-vs-success" /> : <Copy size={13} />}
                </button>
              </div>
              <div className="flex gap-2">
                {typeof navigator !== "undefined" && navigator.share && (
                  <button
                    onClick={() => navigator.share?.({ title: settings?.store_name ?? "My store", url: storeUrl })}
                    className="flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg border border-vs-border text-vs-muted text-xs hover:text-vs-text hover:border-vs-border-2 transition-colors"
                  >
                    <Share2 size={12} />
                    Share
                  </button>
                )}
              </div>
            </div>
          </div>
        )}
        <p className="text-xs text-vs-muted mt-3">
          Send this link to customers or print the QR code for your counter.
        </p>
      </div>

      {/* ── TABS ─────────────────────────────────────────────────────────── */}
      <div className="flex items-center gap-1 border-b border-vs-border mb-6">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => goToTab(tab.id)}
            className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors -mb-px ${
              activeTab === tab.id ? "border-vs-accent text-vs-text" : "border-transparent text-vs-muted hover:text-vs-text"
            }`}
          >
            {tab.icon}
            {tab.label}
          </button>
        ))}
      </div>

      {/* ── TAB: STORE INFO ──────────────────────────────────────────────── */}
      {activeTab === "info" && (
        <div className="grid lg:grid-cols-2 gap-6 mb-6">
          <div className="flex flex-col gap-4">
            <SectionHeader
              icon={<FileText size={15} className="text-vs-accent" />}
              title="Store info"
              description="Name, description, location, hours"
            />
            <div className="card p-4 flex flex-col gap-4">
              <div>
                <label className="text-xs text-vs-text-2 mb-1 block">Store name</label>
                <input
                  className="input"
                  value={form.store_name}
                  onChange={(e) => setForm((f) => ({ ...f, store_name: e.target.value }))}
                  placeholder="e.g. Bendito Records"
                />
              </div>

              <div>
                <label className="text-xs text-vs-text-2 mb-1 block">Tagline</label>
                <input
                  className="input"
                  value={form.store_tagline}
                  onChange={(e) => setForm((f) => ({ ...f, store_tagline: e.target.value }))}
                  placeholder="e.g. Rare vinyl from Buenos Aires"
                  maxLength={100}
                />
                <p className="text-2xs text-vs-muted mt-1">Shown below the store name in the hero section.</p>
              </div>

              <div>
                <label className="text-xs text-vs-text-2 mb-1 block">URL slug</label>
                <div className="flex items-center gap-0">
                  <span className="px-3 py-2 bg-vs-raised border border-r-0 border-vs-border rounded-l-lg text-xs text-vs-muted whitespace-nowrap">
                    /store/
                  </span>
                  <input
                    className="input rounded-l-none"
                    value={form.store_slug}
                    onChange={(e) => setForm((f) => ({ ...f, store_slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "") }))}
                    placeholder="bendito-records"
                  />
                </div>
                <p className="text-2xs text-vs-muted mt-1">Letters, numbers, hyphens only. Leave blank to auto-generate.</p>
              </div>

              <div>
                <label className="text-xs text-vs-text-2 mb-1 block">Description</label>
                <textarea
                  className="input resize-none"
                  rows={2}
                  value={form.store_description}
                  onChange={(e) => setForm((f) => ({ ...f, store_description: e.target.value }))}
                  placeholder="A short description of your store…"
                />
              </div>

              <div>
                <label className="text-xs text-vs-text-2 mb-1 block">Location</label>
                <div className="relative">
                  <MapPin size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-vs-muted" />
                  <input
                    className="input pl-8"
                    value={form.store_location}
                    onChange={(e) => setForm((f) => ({ ...f, store_location: e.target.value }))}
                    placeholder="e.g. Buenos Aires, Argentina"
                  />
                </div>
              </div>

              <div>
                <label className="text-xs text-vs-text-2 mb-1 block">Info banner</label>
                <input
                  className="input"
                  value={form.store_info_banner}
                  onChange={(e) => setForm((f) => ({ ...f, store_info_banner: e.target.value }))}
                  placeholder="e.g. Pickup in Buenos Aires · Ships worldwide"
                  maxLength={500}
                />
                <p className="text-2xs text-vs-muted mt-1">Announcement bar at the top of your store.</p>
              </div>

              <div>
                <div className="flex items-center gap-1.5 mb-1">
                  <Clock size={12} className="text-vs-muted" />
                  <label className="text-xs text-vs-text-2">Store hours</label>
                </div>
                <textarea
                  className="input resize-none font-mono text-xs"
                  rows={4}
                  value={form.store_hours}
                  onChange={(e) => setForm((f) => ({ ...f, store_hours: e.target.value }))}
                  placeholder={"Mon–Fri  12:00–20:00\nSat       11:00–20:00\nSun       Closed"}
                />
                <p className="text-2xs text-vs-muted mt-1">Shown in your store footer.</p>
              </div>
            </div>
          </div>

          <div className="flex flex-col gap-4">
            <SectionHeader
              icon={<Link2 size={15} className="text-vs-accent" />}
              title="Contact & social"
              description="How customers reach you and find you elsewhere"
            />
            <div className="card p-4 flex flex-col gap-4">
              <div>
                <label className="text-xs text-vs-text-2 mb-1 block">Contact (WhatsApp number or email)</label>
                <input
                  className="input"
                  value={form.store_contact}
                  onChange={(e) => setForm((f) => ({ ...f, store_contact: e.target.value }))}
                  placeholder="+1 555 000 0000 or hello@store.com"
                />
                <p className="text-2xs text-vs-muted mt-1">Phone numbers get a WhatsApp link for cart orders.</p>
              </div>

              <div>
                <label className="text-xs text-vs-text-2 mb-1 block">Instagram</label>
                <div className="flex items-center gap-0">
                  <span className="px-3 py-2 bg-vs-raised border border-r-0 border-vs-border rounded-l-lg text-xs text-vs-muted">
                    <Instagram size={11} />
                  </span>
                  <input
                    className="input rounded-l-none"
                    value={form.store_instagram}
                    onChange={(e) => setForm((f) => ({ ...f, store_instagram: e.target.value.replace(/^@/, "") }))}
                    placeholder="yourstore"
                  />
                </div>
              </div>

              <div>
                <label className="text-xs text-vs-text-2 mb-1 block">Facebook</label>
                <div className="flex items-center gap-0">
                  <span className="px-3 py-2 bg-vs-raised border border-r-0 border-vs-border rounded-l-lg text-xs text-vs-muted whitespace-nowrap">fb.com/</span>
                  <input
                    className="input rounded-l-none"
                    value={form.store_facebook}
                    onChange={(e) => setForm((f) => ({ ...f, store_facebook: e.target.value.replace(/^https?:\/\/[^/]*facebook\.com\//, "") }))}
                    placeholder="yourstore"
                  />
                </div>
              </div>

              <div>
                <label className="text-xs text-vs-text-2 mb-1 block">Website</label>
                <input
                  className="input"
                  value={form.store_website}
                  onChange={(e) => setForm((f) => ({ ...f, store_website: e.target.value }))}
                  placeholder="https://yourstore.com"
                />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── TAB: PERSONALIZATION ─────────────────────────────────────────── */}
      {activeTab === "personalization" && (
        <div className="grid lg:grid-cols-2 gap-6 mb-6">
          <div className="card p-4">
            <div className="flex items-center gap-2 mb-3">
              <ImageIcon size={13} className="text-vs-muted" />
              <p className="text-xs text-vs-text-2 font-medium">Store banner</p>
            </div>
            <div className="w-full h-28 rounded-xl overflow-hidden bg-vs-raised border border-vs-border mb-3 relative flex items-center justify-center">
              {bannerSrc ? (
                <img src={bannerSrc} alt="Store banner" className="w-full h-full object-cover" />
              ) : (
                <div
                  className="w-full h-full flex items-center justify-center"
                  style={{ background: `linear-gradient(135deg, ${accentPreview}, ${secondaryPreview})` }}
                >
                  <span className="text-white/60 text-xs">Banner photo goes here</span>
                </div>
              )}
            </div>
            <div className="flex gap-2">
              <label className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-vs-border text-xs cursor-pointer transition-colors ${bannerUploading ? "opacity-50 pointer-events-none" : "hover:border-vs-border-2 text-vs-text-2"}`}>
                {bannerUploading ? <Loader2 size={12} className="animate-spin" /> : <Upload size={12} />}
                {settings?.store_banner_url ? "Replace banner" : "Upload banner"}
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={handleBannerUpload}
                  disabled={bannerUploading}
                />
              </label>
              {settings?.store_banner_url && !bannerUploading && (
                <button
                  onClick={handleBannerRemove}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-vs-border text-xs text-vs-muted hover:text-vs-danger hover:border-vs-danger/40 transition-colors"
                >
                  <X size={12} /> Remove
                </button>
              )}
            </div>
            <p className="text-2xs text-vs-muted mt-2">Recommended 1600×500 px. Under 10 MB. If no photo, gradient is used.</p>
            {bannerError && <p className="text-2xs text-vs-danger mt-1">{bannerError}</p>}
          </div>

          <div className="card p-4">
            <div className="flex items-center gap-2 mb-3">
              <Music size={13} className="text-vs-muted" />
              <p className="text-xs text-vs-text-2 font-medium">Store logo</p>
            </div>
            <div className="flex items-center gap-4">
              <div className="w-16 h-16 rounded-xl overflow-hidden bg-vs-raised border border-vs-border flex items-center justify-center flex-shrink-0">
                {logoPreview || settings?.store_logo_url ? (
                  <img
                    src={logoPreview ?? settings!.store_logo_url!}
                    alt="Store logo"
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <Music size={24} className="text-vs-muted" />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex gap-2">
                  <label className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-vs-border text-xs cursor-pointer transition-colors ${logoUploading ? "opacity-50 pointer-events-none" : "hover:border-vs-border-2 text-vs-text-2"}`}>
                    {logoUploading ? <Loader2 size={12} className="animate-spin" /> : <Upload size={12} />}
                    {settings?.store_logo_url ? "Replace" : "Upload"}
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={handleLogoUpload}
                      disabled={logoUploading}
                    />
                  </label>
                  {settings?.store_logo_url && !logoUploading && (
                    <button
                      onClick={handleLogoRemove}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-vs-border text-xs text-vs-muted hover:text-vs-danger hover:border-vs-danger/40 transition-colors"
                    >
                      <X size={12} /> Remove
                    </button>
                  )}
                </div>
                <p className="text-2xs text-vs-muted mt-1.5">Shown in your store header. PNG or JPG, under 5 MB.</p>
                {logoError && <p className="text-2xs text-vs-danger mt-1">{logoError}</p>}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── TAB: DESIGN ──────────────────────────────────────────────────── */}
      {activeTab === "design" && (
        <div className="mb-6 space-y-6">
          <div className="grid lg:grid-cols-2 gap-6">
            <div className="card p-4">
              <p className="text-xs text-vs-text-2 font-medium mb-3">Colors</p>
              <div className="w-full h-8 rounded-lg mb-4 overflow-hidden" style={{ background: `linear-gradient(90deg, ${accentPreview} 0%, ${secondaryPreview} 100%)` }} />
              <div className="flex gap-4">
                <div className="flex-1">
                  <label className="text-2xs text-vs-muted block mb-1.5">Primary color</label>
                  <div className="flex items-center gap-2">
                    <input
                      type="color"
                      value={accentPreview}
                      onChange={(e) => setForm((f) => ({ ...f, store_accent_color: e.target.value }))}
                      className="w-9 h-8 rounded-lg border border-vs-border cursor-pointer bg-vs-raised p-0.5"
                    />
                    <input
                      className="input font-mono text-xs"
                      value={form.store_accent_color}
                      onChange={(e) => {
                        const v = e.target.value;
                        if (v === "" || /^#[0-9a-fA-F]{0,6}$/.test(v)) {
                          setForm((f) => ({ ...f, store_accent_color: v }));
                        }
                      }}
                      placeholder="#a855f7"
                      maxLength={7}
                    />
                  </div>
                </div>
                <div className="flex-1">
                  <label className="text-2xs text-vs-muted block mb-1.5">Secondary color</label>
                  <div className="flex items-center gap-2">
                    <input
                      type="color"
                      value={secondaryPreview}
                      onChange={(e) => setForm((f) => ({ ...f, store_secondary_color: e.target.value }))}
                      className="w-9 h-8 rounded-lg border border-vs-border cursor-pointer bg-vs-raised p-0.5"
                    />
                    <input
                      className="input font-mono text-xs"
                      value={form.store_secondary_color}
                      onChange={(e) => {
                        const v = e.target.value;
                        if (v === "" || /^#[0-9a-fA-F]{0,6}$/.test(v)) {
                          setForm((f) => ({ ...f, store_secondary_color: v }));
                        }
                      }}
                      placeholder="#ec4899"
                      maxLength={7}
                    />
                  </div>
                </div>
              </div>
              <p className="text-2xs text-vs-muted mt-2">Used for buttons, hero gradient, and accents throughout your store.</p>
            </div>

            <div className="card p-4">
              <div className="flex items-center gap-2 mb-3">
                <Type size={13} className="text-vs-muted" />
                <p className="text-xs text-vs-text-2 font-medium">Store font</p>
              </div>
              <div className="flex flex-col gap-2">
                {FONTS.map((font) => (
                  <button
                    key={font.id}
                    onClick={() => setForm((f) => ({ ...f, store_font: font.id }))}
                    className={`flex items-center justify-between px-3 py-2.5 rounded-lg border transition-colors text-left ${form.store_font === font.id ? "border-vs-accent bg-vs-accent/5" : "border-vs-border hover:border-vs-border-2"}`}
                  >
                    <div>
                      <p className="text-sm font-medium" style={{ fontFamily: `'${font.sample}', sans-serif` }}>{font.label}</p>
                      <p className="text-2xs text-vs-muted mt-0.5" style={{ fontFamily: `'${font.sample}', sans-serif` }}>
                        The quick brown fox jumps · {font.description}
                      </p>
                    </div>
                    {form.store_font === font.id && (
                      <div className="w-4 h-4 rounded-full bg-vs-accent flex items-center justify-center flex-shrink-0">
                        <Check size={10} className="text-white" />
                      </div>
                    )}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="card p-4">
            <div className="flex items-center gap-2 mb-3">
              <LayoutTemplate size={13} className="text-vs-muted" />
              <p className="text-xs text-vs-text-2 font-medium">Homepage layout</p>
            </div>
            <div className="grid sm:grid-cols-3 gap-2">
              {HERO_LAYOUTS.map((layout) => (
                <button
                  key={layout.id}
                  onClick={() => setForm((f) => ({ ...f, store_hero_layout: layout.id }))}
                  className={`flex items-center justify-between px-3 py-2.5 rounded-lg border transition-colors text-left ${form.store_hero_layout === layout.id ? "border-vs-accent bg-vs-accent/5" : "border-vs-border hover:border-vs-border-2"}`}
                >
                  <div>
                    <p className="text-sm font-medium text-vs-text">{layout.label}</p>
                    <p className="text-2xs text-vs-muted mt-0.5">{layout.description}</p>
                  </div>
                  {form.store_hero_layout === layout.id && (
                    <div className="w-4 h-4 rounded-full bg-vs-accent flex items-center justify-center flex-shrink-0">
                      <Check size={10} className="text-white" />
                    </div>
                  )}
                </button>
              ))}
            </div>
            <p className="text-2xs text-vs-muted mt-2">How your storefront&apos;s homepage hero looks for every visitor.</p>
          </div>

          <div>
            <div className="flex items-center gap-2 mb-1">
              <Wand2 size={15} className="text-vs-accent" />
              <p className="text-sm font-semibold text-vs-text">AI Store Theme</p>
            </div>
            <p className="text-xs text-vs-muted mb-4">
              Use your own AI (ChatGPT, Claude, etc.) to generate a full visual theme for your storefront — shapes, spacing, motion, on top of the colors/font above. No extra cost — you control the AI.
            </p>

            <div className="grid lg:grid-cols-[1fr_360px] gap-6">
              <div className="space-y-6 min-w-0">
                <div className="card p-5 space-y-3">
                  <div>
                    <p className="text-sm font-medium">Or pick a preset</p>
                    <p className="text-xs text-vs-muted mt-0.5">One click loads it below — tweak the JSON or apply as-is.</p>
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                    {THEME_PRESETS.map((preset) => (
                      <button
                        key={preset.label}
                        onClick={() => handleJsonChange(JSON.stringify(preset.theme, null, 2))}
                        className="text-left rounded-lg border border-vs-border hover:border-vs-accent/40 transition-colors overflow-hidden"
                      >
                        <div className="h-10" style={{ background: `linear-gradient(90deg, ${preset.theme.accent} 0%, ${preset.theme.secondary} 100%)` }} />
                        <div className="p-2.5">
                          <p className="text-xs font-medium text-vs-text">{preset.label}</p>
                          <p className="text-2xs text-vs-muted mt-0.5">{preset.description}</p>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>

                {isAdmin && (
                  <div className="card p-5 space-y-3 border-vs-accent/30">
                    <div className="flex items-center gap-2">
                      <Sparkles size={15} className="text-vs-accent" />
                      <p className="text-sm font-medium">Generate with Claude</p>
                      <span className="text-2xs px-1.5 py-0.5 rounded bg-vs-accent/10 text-vs-accent font-medium">Admin only</span>
                    </div>
                    <p className="text-xs text-vs-muted">Calls Claude directly — costs us a generation, so this button is hidden from regular store owners. They still use the copy/paste flow below.</p>
                    <div className="flex gap-2">
                      <input
                        value={vibe}
                        onChange={(e) => setVibe(e.target.value)}
                        placeholder='e.g. "gritty punk basement in Berlin"'
                        className="input flex-1 text-sm"
                        onKeyDown={(e) => { if (e.key === "Enter") handleGenerate(); }}
                      />
                      <button
                        onClick={handleGenerate}
                        disabled={!vibe.trim() || generating}
                        className="btn-primary flex items-center gap-1.5 disabled:opacity-40 whitespace-nowrap"
                      >
                        {generating ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
                        Generate
                      </button>
                    </div>
                    {genError && <p className="text-xs text-vs-danger flex items-center gap-1.5"><AlertCircle size={12} />{genError}</p>}

                    {themeHistory.length > 0 && (
                      <div className="pt-2 border-t border-vs-border space-y-2">
                        <div className="flex items-center gap-1.5 text-2xs text-vs-muted uppercase tracking-widest font-medium">
                          <History size={11} />Last {themeHistory.length} generation{themeHistory.length !== 1 ? "s" : ""}
                        </div>
                        {themeHistory.map((entry, i) => (
                          <button
                            key={i}
                            onClick={() => loadFromHistory(entry)}
                            className="w-full flex items-center justify-between text-left px-3 py-2 rounded-lg border border-vs-border hover:border-vs-accent/40 transition-colors text-xs"
                          >
                            <span className="truncate">{entry.vibe}</span>
                            <span className="text-vs-muted flex-shrink-0 ml-2">{new Date(entry.created_at).toLocaleDateString()}</span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                <p className="text-2xs text-vs-muted uppercase tracking-widest font-medium px-1">Manual option</p>

                <div className="card p-5 space-y-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium">Use your own AI</p>
                      <p className="text-xs text-vs-muted mt-0.5">Take this to ChatGPT, Claude, or any AI. Fill in the vibe description.</p>
                    </div>
                    <button onClick={copyPrompt} className="btn-secondary flex items-center gap-1.5 text-xs py-1.5 px-3">
                      {promptCopied ? <><Check size={12} className="text-vs-success" />Copied!</> : <><Copy size={12} />Copy prompt</>}
                    </button>
                  </div>
                  <pre className="bg-vs-raised border border-vs-border rounded-lg p-3 text-xs text-vs-text-2 overflow-x-auto whitespace-pre-wrap max-h-40 overflow-y-auto font-mono leading-relaxed select-all">
                    {buildPrompt(form.store_name, form.store_description)}
                  </pre>
                </div>

                <div className="card p-5 space-y-3">
                  <div>
                    <p className="text-sm font-medium">Paste the result</p>
                    <p className="text-xs text-vs-muted mt-0.5">Your AI will return a JSON object. Paste it below.</p>
                  </div>

                  <textarea
                    value={themeJson}
                    onChange={(e) => handleJsonChange(e.target.value)}
                    placeholder={`Paste your theme JSON here…\n\nExample:\n${SCHEMA_EXAMPLE}`}
                    rows={14}
                    className="input font-mono text-xs leading-relaxed resize-y"
                    spellCheck={false}
                  />

                  {themeValidation && (
                    <div className={`rounded-lg px-4 py-3 space-y-1 ${themeValidation.ok ? "bg-vs-success/10 border border-vs-success/30" : "bg-vs-danger/10 border border-vs-danger/30"}`}>
                      {themeValidation.ok ? (
                        <div className="flex items-center gap-2 text-vs-success text-sm font-medium">
                          <CheckCircle2 size={14} />
                          Valid theme — ready to save
                        </div>
                      ) : (
                        <>
                          <div className="flex items-center gap-2 text-vs-danger text-sm font-medium">
                            <AlertCircle size={14} />
                            {themeValidation.errors.length} error{themeValidation.errors.length !== 1 ? "s" : ""}
                          </div>
                          <ul className="space-y-0.5 pl-5 list-disc">
                            {themeValidation.errors.map((e, i) => (
                              <li key={i} className="text-xs text-vs-danger/90 font-mono">{e}</li>
                            ))}
                          </ul>
                          <p className="text-xs text-vs-muted pt-1">Copy these errors and paste them back into your AI to fix them.</p>
                        </>
                      )}
                    </div>
                  )}

                  <div className="flex items-center gap-3">
                    <button
                      onClick={handleApplyTheme}
                      disabled={!themeValidation?.ok || themeSaving}
                      className="btn-primary flex items-center gap-1.5 disabled:opacity-40"
                    >
                      {themeSaving ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
                      {themeSaving ? "Saving…" : themeSaved ? "Saved!" : "Apply theme"}
                    </button>
                    {(themeJson || currentTheme) && (
                      <button onClick={handleThemeReset} className="btn-ghost flex items-center gap-1.5 text-xs">
                        <RotateCcw size={12} />
                        Reset
                      </button>
                    )}
                  </div>
                </div>
              </div>

              <StickyPreview>
                {previewTheme && (
                  <div className="card p-5 space-y-3">
                    <div>
                      <p className="text-sm font-medium">Live preview</p>
                      <p className="text-xs text-vs-muted mt-0.5">How a record card will look with this theme. Spacing/motion differences are subtler at this size — your real storefront will show them more clearly.</p>
                    </div>

                    <div
                      className="rounded-xl p-6 flex items-center justify-center"
                      style={{ background: `linear-gradient(135deg, ${previewTheme.accent}18 0%, ${previewTheme.secondary}18 100%)` }}
                    >
                      <PreviewCard theme={previewTheme} />
                    </div>

                    <div className="flex flex-wrap gap-3 text-xs text-vs-muted">
                      <span><span className="font-medium text-vs-text-2">Font:</span> {previewTheme.font}</span>
                      <span><span className="font-medium text-vs-text-2">Radius:</span> {previewTheme.radius}</span>
                      <span><span className="font-medium text-vs-text-2">Border:</span> {previewTheme.border_weight}</span>
                      <span><span className="font-medium text-vs-text-2">Shadow:</span> {previewTheme.shadow_style}</span>
                      <span><span className="font-medium text-vs-text-2">Density:</span> {previewTheme.density}</span>
                      <span><span className="font-medium text-vs-text-2">Headlines:</span> {previewTheme.headline_scale}</span>
                      <span><span className="font-medium text-vs-text-2">Texture:</span> {previewTheme.card_texture}</span>
                      <span><span className="font-medium text-vs-text-2">Motion:</span> {previewTheme.motion}</span>
                      <span><span className="font-medium text-vs-text-2">Buttons:</span> {previewTheme.button_shape}</span>
                      {previewTheme.mood && <span><span className="font-medium text-vs-text-2">Mood:</span> {previewTheme.mood}</span>}
                    </div>
                  </div>
                )}
              </StickyPreview>
            </div>
          </div>
        </div>
      )}

      {/* ── SAVE BAR ─────────────────────────────────────────────────────── */}
      <div className="sticky bottom-0 mt-6 py-4 bg-vs-bg border-t border-vs-border flex items-center gap-3 relative">
        {error && <p className="text-xs text-vs-danger">{error}</p>}
        <button
          onClick={save}
          disabled={saving}
          className="btn-primary flex items-center justify-center gap-2 disabled:opacity-50"
        >
          {saving ? <Loader2 size={14} className="animate-spin" /> : saved ? <Check size={14} /> : null}
          {saving ? "Saving…" : saved ? "Saved!" : "Save settings"}
        </button>
        {isDirty && !saving && !saved && (
          <span className="text-xs text-vs-warning">Unsaved changes</span>
        )}

        {settingsHistory.length > 0 && (
          <div className="ml-auto relative">
            <button
              onClick={() => setHistoryOpen((o) => !o)}
              className="btn-secondary text-xs py-1.5 px-3 flex items-center gap-1.5"
            >
              <History size={12} />
              Undo
            </button>
            {historyOpen && (
              <div className="absolute bottom-full right-0 mb-2 w-72 bg-vs-card border border-vs-border rounded-xl shadow-lg p-2 z-10">
                <p className="text-2xs text-vs-muted uppercase tracking-widest font-medium px-2 py-1">Restore a previous version</p>
                {settingsHistory.map((snap, i) => (
                  <button
                    key={i}
                    onClick={() => restoreSnapshot(snap.settings)}
                    className="w-full text-left px-2 py-2 rounded-lg hover:bg-vs-raised transition-colors text-xs"
                  >
                    <p className="text-vs-text">{new Date(snap.created_at).toLocaleString()}</p>
                    <p className="text-vs-muted truncate mt-0.5">{(snap.settings.store_tagline as string) || (snap.settings.store_name as string) || "—"}</p>
                  </button>
                ))}
                <p className="text-2xs text-vs-muted px-2 pt-1">Loads into the form — review, then Save to apply.</p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default function StoreSettingsPage() {
  return (
    <Suspense>
      <StoreSettingsPageInner />
    </Suspense>
  );
}
