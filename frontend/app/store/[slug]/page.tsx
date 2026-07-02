"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useParams } from "next/navigation";
import {
  Search, X, ShoppingCart, Disc3, Loader2, Music,
  Instagram, MessageCircle, Plus, Check, SlidersHorizontal,
  MapPin, Globe, Facebook, ArrowUpDown, ExternalLink,
  ChevronLeft, ChevronRight, Clock, Zap, ArrowLeft, ChevronDown,
  Package, Repeat, Info,
} from "lucide-react";
import { api, type PublicRecord, type PublicStore, type PublicAccessory } from "@/lib/api";
import { useStoreLang, STORE_TRANSLATIONS, STORE_LANGS, type StoreTranslations } from "@/lib/storeI18n";

const CONDITIONS = ["M", "NM", "VG+", "VG", "G"] as const;
type SortKey = "newest" | "price_asc" | "price_desc" | "az";
type StoreView = "home" | "shop" | "product" | "acc" | "sell" | "about" | "checkout";

// ── AI theme — resolved token tables ──────────────────────────────────────────
type CardTexture = "plain" | "swatch" | "grain";
type Motion = "minimal" | "smooth" | "playful";
type ButtonShape = "block" | "pill" | "underline";

const THEME_RADIUS: Record<string, string> = { sharp: "0px", soft: "10px", round: "28px" };
const THEME_BORDER: Record<string, string> = { hairline: "1px", bold: "3px", none: "0px" };
const THEME_DENSITY_CARD_PAD: Record<string, string> = { compact: "8px", comfortable: "12px", spacious: "20px" };
const THEME_DENSITY_SECTION_PAD: Record<string, string> = { compact: "2rem", comfortable: "3.5rem", spacious: "5.5rem" };
const THEME_MOTION_CLASS: Record<string, string> = {
  minimal: "",
  smooth: "transition-transform duration-200 hover:-translate-y-0.5",
  playful: "transition-transform duration-200 hover:-translate-y-0.5 hover:rotate-1 hover:scale-[1.02]",
};

const H1_HERO: Record<string, string> = { modest: "text-3xl sm:text-4xl", editorial: "text-4xl sm:text-6xl", oversized: "text-5xl sm:text-7xl" };
const H1_HERO_BIG: Record<string, string> = { modest: "text-4xl sm:text-5xl", editorial: "text-5xl sm:text-7xl", oversized: "text-6xl sm:text-8xl" };
const H2_SECTION: Record<string, string> = { modest: "text-2xl sm:text-3xl", editorial: "text-3xl sm:text-4xl", oversized: "text-4xl sm:text-5xl" };

const FONT_MAP: Record<string, { family: string; url?: string }> = {
  inter: { family: "'Inter', sans-serif" },
  syne: {
    family: "'Syne', sans-serif",
    url: "https://fonts.googleapis.com/css2?family=Syne:wght@400;600;700&display=swap",
  },
  "dm-sans": {
    family: "'DM Sans', sans-serif",
    url: "https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;700&display=swap",
  },
  unbounded: {
    family: "'Unbounded', sans-serif",
    url: "https://fonts.googleapis.com/css2?family=Unbounded:wght@400;600;700&display=swap",
  },
  // legacy compat
  playfair: {
    family: "'Syne', sans-serif",
    url: "https://fonts.googleapis.com/css2?family=Syne:wght@400;600;700&display=swap",
  },
  "space-grotesk": {
    family: "'DM Sans', sans-serif",
    url: "https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;700&display=swap",
  },
};

const CONDITION_COLORS: Record<string, string> = {
  M: "#16a34a",
  NM: "#22c55e",
  "VG+": "#f59e0b",
  VG: "#f97316",
  G: "#ef4444",
};

function fmt(n: number) { return `$${n.toFixed(2)}`; }

function swatchStyle(seed: string, accent: string, secondary: string): React.CSSProperties {
  const variants = [accent, secondary, `${accent}b3`, `${secondary}b3`];
  let hash = 0;
  for (let i = 0; i < seed.length; i++) hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  return { background: variants[hash % variants.length] };
}
function isPhone(s: string) { return /^[+\d\s\-().]{7,}$/.test(s.trim()); }
function isNew(created_at: string): boolean {
  return Date.now() - new Date(created_at).getTime() < 30 * 24 * 60 * 60 * 1000;
}
function recordTags(r: PublicRecord): string[] {
  return r.styles ? r.styles.split(", ").map((s) => s.trim()) : r.genre ? [r.genre] : [];
}

interface AccessoryLine { accessory: PublicAccessory; qty: number; }

function buildShareLink(
  contact: string, items: PublicRecord[], accessoryLines: AccessoryLine[], storeName: string | null,
  buyer?: { name: string; contact: string; note?: string; orderRef?: string },
) {
  const recordLines = items.map(
    (r) => `• ${r.artist ?? "Unknown"} — ${r.title ?? "Untitled"} (${r.condition})${r.asking_price != null ? ` — ${fmt(r.asking_price)}` : ""}`
  );
  const accLines = accessoryLines.map(
    ({ accessory: a, qty }) => `• ${a.name} x${qty}${a.price != null ? ` — ${fmt(a.price * qty)}` : ""}`
  );
  const total = items.reduce((s, r) => s + (r.asking_price ?? 0), 0) + accessoryLines.reduce((s, l) => s + (l.accessory.price ?? 0) * l.qty, 0);
  const msg = [
    `Hi${storeName ? ` ${storeName}` : ""}! I'd like to buy:`,
    "",
    ...recordLines,
    ...accLines,
    "",
    `Total: ${fmt(total)}`,
    "",
    "(Store pickup)",
    ...(buyer ? ["", `Order ${buyer.orderRef ?? ""}`.trim(), `From: ${buyer.name} (${buyer.contact})`, ...(buyer.note ? [`Note: ${buyer.note}`] : [])] : []),
  ].join("\n");
  if (isPhone(contact)) {
    return `https://wa.me/${contact.replace(/\D/g, "")}?text=${encodeURIComponent(msg)}`;
  }
  return `mailto:${contact}?subject=${encodeURIComponent("Record order")}&body=${encodeURIComponent(msg)}`;
}

function sortRecords(records: PublicRecord[], sort: SortKey): PublicRecord[] {
  const copy = [...records];
  switch (sort) {
    case "price_asc":
      return copy.sort((a, b) => (a.asking_price ?? Infinity) - (b.asking_price ?? Infinity));
    case "price_desc":
      return copy.sort((a, b) => (b.asking_price ?? -Infinity) - (a.asking_price ?? -Infinity));
    case "az":
      return copy.sort((a, b) => (a.artist ?? "").localeCompare(b.artist ?? ""));
    default:
      return copy;
  }
}

function ThemedActionButton({ accent, buttonShape, filled, label, price, onClick, disabled }: {
  accent: string; buttonShape: ButtonShape; filled: boolean; label: string;
  price?: string | null; onClick?: (e: React.MouseEvent) => void; disabled?: boolean;
}) {
  if (buttonShape === "underline") {
    return (
      <button
        onClick={onClick}
        disabled={disabled}
        className="w-full flex items-center justify-center gap-1.5 py-1.5 text-2xs uppercase tracking-widest font-semibold border-b transition-colors disabled:opacity-40"
        style={{ borderColor: filled ? accent : "#d4d4d4", color: filled ? accent : "#525252" }}
      >
        <span>{label}</span>
        {price && <span className="font-mono">{price}</span>}
      </button>
    );
  }
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`w-full flex items-center justify-between px-3 py-2 text-2xs uppercase tracking-widest font-semibold border transition-colors rounded-[var(--vs-radius)] border-[length:var(--vs-border-w)] disabled:opacity-40 ${buttonShape === "pill" ? "!rounded-full" : ""}`}
      style={filled ? { background: accent, borderColor: accent, color: "#fff" } : { borderColor: "#d4d4d4", color: "#525252" }}
    >
      <span>{label}</span>
      {price && <span className="font-mono">{price}</span>}
    </button>
  );
}

function RecordCard({
  record, inCart, onToggle, onOpen, accent, secondary, compact = false, t, cardTexture, motionClass, buttonShape,
}: {
  record: PublicRecord; inCart: boolean; onToggle: () => void; onOpen?: () => void; accent: string; secondary: string; compact?: boolean; t: StoreTranslations;
  cardTexture: CardTexture; motionClass: string; buttonShape: ButtonShape;
}) {
  const condColor = CONDITION_COLORS[record.condition] ?? "#6b7280";
  const badge = isNew(record.created_at);

  const noPhotoStyle = cardTexture === "plain" ? { background: "#e5e5e5" } : swatchStyle(record.genre || record.artist || record.id, accent, secondary);

  return (
    <div
      onClick={onOpen}
      className={`group flex flex-col border overflow-hidden cursor-pointer rounded-[var(--vs-radius)] border-[length:var(--vs-border-w)] border-neutral-200 dark:border-neutral-800 ${motionClass} ${compact ? "min-w-[160px] max-w-[160px] sm:min-w-[180px] sm:max-w-[180px]" : ""}`}
      style={{ boxShadow: "var(--vs-shadow)", ...(inCart ? { borderColor: accent } : {}) }}
    >
      <div className={`aspect-square relative overflow-hidden ${cardTexture === "grain" ? "bg-[radial-gradient(circle,rgba(255,255,255,0.15)_1px,transparent_1px)] bg-[length:4px_4px]" : ""}`} style={record.cover_image_url ? { background: "#e5e5e5" } : noPhotoStyle}>
        {record.cover_image_url ? (
          <img
            src={record.cover_image_url}
            alt={record.title ?? ""}
            className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <Disc3 size={compact ? 36 : 52} className="text-white/30" />
          </div>
        )}

        {/* Cart overlay */}
        {inCart && (
          <div className="absolute inset-0 flex items-center justify-center" style={{ background: `${accent}50` }}>
            <div className="w-9 h-9 flex items-center justify-center border-2 border-white" style={{ background: accent }}>
              <Check size={16} className="text-white" strokeWidth={3} />
            </div>
          </div>
        )}

        {/* NEW badge */}
        {badge && (
          <span className="absolute top-2 right-2 px-1.5 py-0.5 text-2xs font-bold uppercase tracking-wide bg-neutral-900 text-white">
            {t.card.new}
          </span>
        )}

        {/* Genre tag */}
        {!compact && recordTags(record).length > 0 && (
          <span className="absolute top-2 left-2 text-2xs uppercase tracking-widest font-medium text-white/80">
            {recordTags(record)[0]}
          </span>
        )}
      </div>

      <div className={`flex flex-col flex-1 ${compact ? "p-2.5" : ""}`} style={compact ? undefined : { padding: "var(--vs-card-pad)" }}>
        <p className={`font-semibold text-neutral-900 dark:text-neutral-100 leading-snug line-clamp-2 mb-0.5 ${compact ? "text-xs" : "text-sm"}`}>
          {record.title || t.card.untitled}
        </p>
        <p className={`text-neutral-500 truncate mb-2 ${compact ? "text-2xs" : "text-xs"}`}>{record.artist || t.card.unknownArtist}</p>

        <div className="flex items-center gap-1 mt-auto mb-2">
          <span
            className="text-2xs px-1.5 py-0.5 font-bold border"
            style={{ color: condColor, borderColor: `${condColor}40`, background: `${condColor}12` }}
          >
            {record.condition}
          </span>
          {record.format && (
            <span className="text-2xs px-1.5 py-0.5 bg-neutral-100 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 text-neutral-500 font-medium">
              {record.format.split(" ")[0]}
            </span>
          )}
        </div>

        <ThemedActionButton
          accent={accent}
          buttonShape={buttonShape}
          filled={inCart}
          label={inCart ? t.card.inCart : t.card.add}
          price={record.asking_price != null ? fmt(record.asking_price) : null}
          onClick={(e) => { e.stopPropagation(); onToggle(); }}
        />
      </div>
    </div>
  );
}

function AccessoryCard({ accessory, inCart, onToggle, accent, secondary, t, cardTexture, motionClass, buttonShape }: {
  accessory: PublicAccessory; inCart: boolean; onToggle: () => void; accent: string; secondary: string; t: StoreTranslations;
  cardTexture: CardTexture; motionClass: string; buttonShape: ButtonShape;
}) {
  const outOfStock = accessory.stock_quantity <= 0;
  const noPhotoStyle = cardTexture === "plain" ? { background: "#e5e5e5" } : swatchStyle(accessory.category, accent, secondary);
  return (
    <div className={`flex flex-col border overflow-hidden rounded-[var(--vs-radius)] border-[length:var(--vs-border-w)] border-neutral-200 dark:border-neutral-800 ${motionClass}`} style={{ boxShadow: "var(--vs-shadow)" }}>
      <div className={`aspect-square relative overflow-hidden ${cardTexture === "grain" ? "bg-[radial-gradient(circle,rgba(255,255,255,0.15)_1px,transparent_1px)] bg-[length:4px_4px]" : ""}`} style={accessory.cover_image_url ? { background: "#e5e5e5" } : noPhotoStyle}>
        {accessory.cover_image_url ? (
          <img src={accessory.cover_image_url} alt={accessory.name} className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full flex items-center justify-center"><Package size={40} className="text-white/30" /></div>
        )}
        <span className="absolute top-2 left-2 text-2xs uppercase tracking-widest font-medium text-white/80">{accessory.category}</span>
      </div>
      <div className="flex flex-col flex-1" style={{ padding: "var(--vs-card-pad)" }}>
        <p className="font-semibold text-sm text-neutral-900 dark:text-neutral-100 leading-snug mb-0.5">{accessory.name}</p>
        {accessory.description && <p className="text-xs text-neutral-500 line-clamp-2 mb-2">{accessory.description}</p>}
        <p className={`text-2xs mb-2 mt-auto ${outOfStock ? "text-red-500" : "text-neutral-400"}`}>{outOfStock ? t.card.outOfStock : t.card.inStockCount(accessory.stock_quantity)}</p>
        <ThemedActionButton
          accent={accent}
          buttonShape={buttonShape}
          filled={inCart}
          label={inCart ? t.card.inCart : t.card.add}
          price={accessory.price != null ? fmt(accessory.price) : null}
          onClick={onToggle}
          disabled={outOfStock && !inCart}
        />
      </div>
    </div>
  );
}

function HorizontalCarousel({
  title, icon, records, cart, onToggle, onOpen, accent, secondary, onViewAll, t, cardTexture, motionClass, buttonShape,
}: {
  title: string;
  icon: React.ReactNode;
  records: PublicRecord[];
  cart: PublicRecord[];
  onToggle: (r: PublicRecord) => void;
  onOpen: (r: PublicRecord) => void;
  accent: string;
  secondary: string;
  onViewAll?: () => void;
  t: StoreTranslations;
  cardTexture: CardTexture; motionClass: string; buttonShape: ButtonShape;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);

  function scroll(dir: "left" | "right") {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollBy({ left: dir === "left" ? -360 : 360, behavior: "smooth" });
  }

  return (
    <div className="mb-10">
      <div className="flex items-center justify-between mb-4 px-4 sm:px-6">
        <div className="flex items-center gap-2">
          <span className="text-neutral-400">{icon}</span>
          <h2 className="text-lg font-bold text-neutral-900 dark:text-neutral-100">{title}</h2>
          <span className="text-xs text-neutral-400 font-normal ml-1">({records.length})</span>
        </div>
        <div className="flex items-center gap-3">
          {onViewAll && (
            <button onClick={onViewAll} className="text-2xs uppercase tracking-widest font-medium transition-colors hover:underline" style={{ color: accent }}>
              {t.carousel.viewAll}
            </button>
          )}
          <button onClick={() => scroll("left")} className="w-7 h-7 border border-neutral-300 dark:border-neutral-700 flex items-center justify-center text-neutral-500 hover:text-neutral-900 dark:hover:text-neutral-100 hover:border-neutral-900 dark:hover:border-neutral-100 transition-colors">
            <ChevronLeft size={14} />
          </button>
          <button onClick={() => scroll("right")} className="w-7 h-7 border border-neutral-300 dark:border-neutral-700 flex items-center justify-center text-neutral-500 hover:text-neutral-900 dark:hover:text-neutral-100 hover:border-neutral-900 dark:hover:border-neutral-100 transition-colors">
            <ChevronRight size={14} />
          </button>
        </div>
      </div>
      <div ref={scrollRef} className="flex gap-3 overflow-x-auto no-scrollbar px-4 sm:px-6 pb-2">
        {records.map((r) => (
          <RecordCard
            key={r.id}
            record={r}
            inCart={!!cart.find((c) => c.id === r.id)}
            onToggle={() => onToggle(r)}
            onOpen={() => onOpen(r)}
            accent={accent}
            secondary={secondary}
            t={t}
            cardTexture={cardTexture}
            motionClass={motionClass}
            buttonShape={buttonShape}
            compact
          />
        ))}
      </div>
    </div>
  );
}

function FilterSection({ label, options, value, onChange, allLabel }: {
  label: string; options: string[]; value: string; onChange: (v: string) => void; allLabel: string;
}) {
  return (
    <div className="mb-5">
      <p className="text-2xs font-bold uppercase tracking-widest text-neutral-400 mb-2">{label}</p>
      <ul className="space-y-0.5">
        <li>
          <button
            onClick={() => onChange("")}
            className={`w-full text-left text-xs px-2 py-1.5 border-l-2 transition-colors ${
              value === "" ? "border-current text-neutral-900 dark:text-neutral-100 font-medium" : "border-transparent text-neutral-500 hover:text-neutral-700 dark:hover:text-neutral-300"
            }`}
          >{allLabel}</button>
        </li>
        {options.map((o) => (
          <li key={o}>
            <button
              onClick={() => onChange(value === o ? "" : o)}
              className={`w-full text-left text-xs px-2 py-1.5 border-l-2 transition-colors ${
                value === o ? "border-current text-neutral-900 dark:text-neutral-100 font-medium" : "border-transparent text-neutral-500 hover:text-neutral-700 dark:hover:text-neutral-300"
              }`}
            >{o}</button>
          </li>
        ))}
      </ul>
    </div>
  );
}

// ── Hero variants ────────────────────────────────────────────────────────────

interface HeroProps {
  store: PublicStore;
  accent: string;
  secondary: string;
  featured: PublicRecord | null;
  tiles: PublicRecord[];
  onShop: () => void;
  t: StoreTranslations;
  headlineScale: string;
}

function Eyebrow({ children, color }: { children: React.ReactNode; color?: string }) {
  return <p className="text-2xs uppercase tracking-widest font-semibold mb-3" style={{ color: color ?? "currentColor" }}>{children}</p>;
}

function HeroMeta({ store, t }: { store: PublicStore; t: StoreTranslations }) {
  const items: React.ReactNode[] = [];
  if (store.store_location) items.push(<span key="loc" className="flex items-center gap-1.5"><MapPin size={11} />{store.store_location}</span>);
  if (store.store_instagram) items.push(
    <a key="ig" href={`https://instagram.com/${store.store_instagram}`} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5 hover:text-neutral-900 dark:hover:text-neutral-100 transition-colors">
      <Instagram size={11} />@{store.store_instagram}
    </a>
  );
  if (store.store_website) items.push(
    <a key="web" href={store.store_website} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5 hover:text-neutral-900 dark:hover:text-neutral-100 transition-colors">
      <Globe size={11} />{t.hero.website}
    </a>
  );
  if (items.length === 0) return null;
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-2xs uppercase tracking-widest font-medium text-neutral-400 dark:text-neutral-500 mt-6">
      {items.map((item, i) => (
        <span key={i} className="flex items-center gap-4">
          {i > 0 && <span className="text-neutral-300 dark:text-neutral-700">·</span>}
          {item}
        </span>
      ))}
    </div>
  );
}

function HeroArtBlock({ store, accent, secondary, featured, corner, t }: {
  store: PublicStore; accent: string; secondary: string; featured: PublicRecord | null; corner?: string; t: StoreTranslations;
}) {
  return (
    <div className="relative aspect-square overflow-hidden rounded-[var(--vs-radius)] border-[length:var(--vs-border-w)] border-neutral-200 dark:border-neutral-800" style={{ boxShadow: "var(--vs-shadow)" }}>
      {store.store_banner_url ? (
        <img src={store.store_banner_url} alt="" className="absolute inset-0 w-full h-full object-cover" />
      ) : featured?.cover_image_url ? (
        <img src={featured.cover_image_url} alt="" className="absolute inset-0 w-full h-full object-cover" />
      ) : (
        <div className="absolute inset-0 flex items-center justify-center" style={{ background: `linear-gradient(135deg, ${accent} 0%, ${secondary} 100%)` }}>
          <Disc3 size={96} className="text-white/30" />
        </div>
      )}
      {corner && (
        <span className="absolute top-3 left-3 text-2xs uppercase tracking-widest font-medium text-white/70">{corner}</span>
      )}
      {featured && (
        <div className="absolute bottom-0 left-0 bg-neutral-50 dark:bg-neutral-950 border-t border-r border-neutral-200 dark:border-neutral-800 px-4 py-3 max-w-[70%]">
          <p className="text-2xs uppercase tracking-widest font-semibold mb-1" style={{ color: accent }}>{t.hero.featuredRelease}</p>
          <p className="text-sm font-semibold truncate">{featured.title ?? t.card.untitled}</p>
          <p className="text-xs text-neutral-500">{featured.artist ?? t.hero.unknown}{featured.asking_price != null ? ` · ${fmt(featured.asking_price)}` : ""}</p>
        </div>
      )}
    </div>
  );
}

function HeroCTARow({ accent, onShop, t }: { accent: string; onShop: () => void; t: StoreTranslations }) {
  return (
    <div className="flex flex-wrap items-center gap-5">
      <button onClick={onShop} className="px-6 py-3 text-sm font-semibold text-white rounded-[var(--vs-radius)]" style={{ background: accent }}>
        {t.hero.browseShop}
      </button>
    </div>
  );
}

function HeroGallery({ store, accent, secondary, featured, onShop, t, headlineScale }: HeroProps) {
  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-14 sm:py-20 grid sm:grid-cols-2 gap-10 sm:gap-14 items-center">
      <div>
        <Eyebrow color={accent}>{t.hero.independentShop(store.store_location)}</Eyebrow>
        <h1 className={`${H1_HERO[headlineScale]} font-bold tracking-tight leading-[0.95] mb-5`}>{store.store_name ?? t.hero.defaultName}</h1>
        {(store.store_tagline || store.store_description) && (
          <p className="text-base text-neutral-500 dark:text-neutral-400 max-w-md mb-7 leading-relaxed">{store.store_tagline ?? store.store_description}</p>
        )}
        <HeroCTARow accent={accent} onShop={onShop} t={t} />
        <HeroMeta store={store} t={t} />
      </div>
      <HeroArtBlock store={store} accent={accent} secondary={secondary} featured={featured} corner={store.store_tagline ? undefined : t.hero.newTag} t={t} />
    </div>
  );
}

function HeroIndex({ store, accent, secondary, tiles, onShop, t, headlineScale }: HeroProps) {
  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-14 sm:py-20">
      <Eyebrow color={accent}>{t.hero.independentShop(store.store_location)}</Eyebrow>
      <h1 className={`${H1_HERO_BIG[headlineScale]} font-bold tracking-tight leading-[0.95] mb-5 max-w-3xl`}>{store.store_name ?? t.hero.defaultName}</h1>
      {(store.store_tagline || store.store_description) && (
        <p className="text-base text-neutral-500 dark:text-neutral-400 max-w-md mb-7 leading-relaxed">{store.store_tagline ?? store.store_description}</p>
      )}
      <HeroCTARow accent={accent} onShop={onShop} t={t} />
      <HeroMeta store={store} t={t} />
      {tiles.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-10">
          {tiles.map((tile) => (
            <div key={tile.id} className="aspect-square rounded-[var(--vs-radius)] border-[length:var(--vs-border-w)] border-neutral-200 dark:border-neutral-800 overflow-hidden bg-neutral-100 dark:bg-neutral-900">
              {tile.cover_image_url ? (
                <img src={tile.cover_image_url} alt="" className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full flex items-center justify-center"><Music size={20} className="text-neutral-300 dark:text-neutral-700" /></div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function HeroPoster({ store, accent, secondary, featured, onShop, t, headlineScale }: HeroProps) {
  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 py-14 sm:py-20 flex flex-col items-center text-center">
      <Eyebrow color={accent}>{t.hero.independentShop(store.store_location)}</Eyebrow>
      <h1 className={`${H1_HERO[headlineScale]} font-bold tracking-tight leading-[0.95] mb-5`}>{store.store_name ?? t.hero.defaultName}</h1>
      {(store.store_tagline || store.store_description) && (
        <p className="text-base text-neutral-500 dark:text-neutral-400 max-w-md mb-7 leading-relaxed">{store.store_tagline ?? store.store_description}</p>
      )}
      <HeroCTARow accent={accent} onShop={onShop} t={t} />
      <div className="w-full max-w-sm mt-10">
        <HeroArtBlock store={store} accent={accent} secondary={secondary} featured={featured} t={t} />
      </div>
      <HeroMeta store={store} t={t} />
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function StorePage() {
  const params = useParams();
  const slug = params.slug as string;

  const [store, setStore] = useState<PublicStore | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  const [view, setView] = useState<StoreView>("home");
  const [selectedRecordId, setSelectedRecordId] = useState<string | null>(null);

  const [search, setSearch] = useState("");
  const [genreFilter, setGenreFilter] = useState("");
  const [formatFilter, setFormatFilter] = useState("");
  const [condFilter, setCondFilter] = useState("");
  const [maxPrice, setMaxPrice] = useState("");
  const [sort, setSort] = useState<SortKey>("newest");
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const [cart, setCart] = useState<PublicRecord[]>([]);
  const [accessoryQty, setAccessoryQty] = useState<Record<string, number>>({});
  const [cartOpen, setCartOpen] = useState(false);
  const [accCategoryFilter, setAccCategoryFilter] = useState("");

  const [sellForm, setSellForm] = useState({ name: "", email: "", approx_records: "", payout_preference: "cash", notes: "" });
  const [sellSubmitting, setSellSubmitting] = useState(false);
  const [sellDone, setSellDone] = useState(false);

  const [checkoutForm, setCheckoutForm] = useState({ name: "", contact: "", note: "" });
  const [orderRef, setOrderRef] = useState<string | null>(null);
  const [orderTotal, setOrderTotal] = useState<number | null>(null);
  const [placingOrder, setPlacingOrder] = useState(false);

  const [lang, setLang] = useStoreLang();
  const t = STORE_TRANSLATIONS[lang];

  useEffect(() => {
    api.getPublicStore(slug)
      .then(setStore)
      .catch(() => setNotFound(true))
      .finally(() => setLoading(false));
  }, [slug]);

  // Inject Google Fonts when store loads
  useEffect(() => {
    if (!store) return;
    const fontKey = store.store_font ?? "inter";
    const fontDef = FONT_MAP[fontKey];
    if (fontDef?.url) {
      const existing = document.querySelector(`link[data-store-font]`);
      if (existing) existing.remove();
      const link = document.createElement("link");
      link.rel = "stylesheet";
      link.href = fontDef.url;
      link.setAttribute("data-store-font", "1");
      document.head.appendChild(link);
    }
    return () => {
      document.querySelector("link[data-store-font]")?.remove();
    };
  }, [store?.store_font]);

  const toggleCart = useCallback((record: PublicRecord) => {
    setCart((prev) =>
      prev.find((r) => r.id === record.id)
        ? prev.filter((r) => r.id !== record.id)
        : [...prev, record]
    );
  }, []);

  const addAccessoryToCart = useCallback((accessory: PublicAccessory) => {
    setAccessoryQty((prev) => ({ ...prev, [accessory.id]: (prev[accessory.id] ?? 0) > 0 ? 0 : 1 }));
  }, []);

  const setAccessoryLineQty = useCallback((id: string, qty: number) => {
    setAccessoryQty((prev) => ({ ...prev, [id]: Math.max(0, qty) }));
  }, []);

  // Every view change scrolls to top, no URL change — pure in-state routing.
  const navigate = useCallback((next: StoreView, opts?: { recordId?: string; genre?: string }) => {
    if (opts?.recordId !== undefined) setSelectedRecordId(opts.recordId);
    if (opts?.genre !== undefined) setGenreFilter(opts.genre);
    setView(next);
    window.scrollTo({ top: 0 });
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen bg-white dark:bg-neutral-950 flex items-center justify-center">
        <Loader2 size={32} className="animate-spin text-neutral-400" />
      </div>
    );
  }

  if (notFound || !store) {
    return (
      <div className="min-h-screen bg-white dark:bg-neutral-950 flex flex-col items-center justify-center gap-3 px-4 text-center">
        <Disc3 size={40} className="text-neutral-400" />
        <p className="text-lg font-medium text-neutral-900 dark:text-neutral-100">{t.notFound.title}</p>
        <p className="text-sm text-neutral-500">{t.notFound.body}</p>
      </div>
    );
  }

  // Theme config overrides individual fields when present
  let themeConfig: {
    accent?: string; secondary?: string; font?: string;
    radius?: string; border_weight?: string; shadow_style?: string;
    density?: string; headline_scale?: string; card_texture?: string;
    motion?: string; button_shape?: string;
  } | null = null;
  if (store.store_theme_config) {
    try { themeConfig = JSON.parse(store.store_theme_config); } catch { /* ignore */ }
  }

  const accent = themeConfig?.accent ?? store.store_accent_color ?? "#a855f7";
  const secondary = themeConfig?.secondary ?? store.store_secondary_color ?? "#ec4899";
  const fontKey = themeConfig?.font ?? store.store_font ?? "inter";
  const fontFamily = FONT_MAP[fontKey]?.family ?? "'Inter', sans-serif";

  const vsRadius = THEME_RADIUS[themeConfig?.radius ?? "sharp"];
  const vsBorderW = THEME_BORDER[themeConfig?.border_weight ?? "hairline"];
  const vsCardPad = THEME_DENSITY_CARD_PAD[themeConfig?.density ?? "comfortable"];
  const vsSectionPad = THEME_DENSITY_SECTION_PAD[themeConfig?.density ?? "comfortable"];
  const vsShadow =
    themeConfig?.shadow_style === "soft" ? "0 2px 10px rgba(0,0,0,0.10)"
    : themeConfig?.shadow_style === "hard-offset" ? `4px 4px 0 0 ${accent}`
    : "none";
  const headlineScale = themeConfig?.headline_scale ?? "editorial";
  const cardTexture = (themeConfig?.card_texture ?? "swatch") as CardTexture;
  const motion = (themeConfig?.motion ?? "minimal") as Motion;
  const motionClass = THEME_MOTION_CLASS[motion];
  const buttonShape = (themeConfig?.button_shape ?? "block") as ButtonShape;

  const vinylRecords = store.records.filter((r) => r.record_section !== "accessory");
  const discogsRecords = vinylRecords.filter((r) => r.discogs_synced);

  const newIn = [...vinylRecords].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()).slice(0, 12);

  const genres = [...new Set(vinylRecords.flatMap(recordTags))].sort();
  const genreCounts: Record<string, number> = {};
  for (const g of genres) genreCounts[g] = vinylRecords.filter((r) => recordTags(r).includes(g)).length;

  const formats = [...new Set(vinylRecords.map((r) => r.format).filter(Boolean) as string[])].sort();

  const filtered = sortRecords(
    vinylRecords.filter((r) => {
      if (search) {
        const q = search.toLowerCase();
        if (!`${r.artist} ${r.title} ${r.label ?? ""}`.toLowerCase().includes(q)) return false;
      }
      if (genreFilter && !recordTags(r).includes(genreFilter)) return false;
      if (formatFilter && r.format !== formatFilter) return false;
      if (condFilter && r.condition !== condFilter) return false;
      if (maxPrice) {
        const max = parseFloat(maxPrice);
        if (!isNaN(max) && (r.asking_price == null || r.asking_price > max)) return false;
      }
      return true;
    }),
    sort
  );

  const accessoryLines: AccessoryLine[] = store.accessories
    .filter((a) => (accessoryQty[a.id] ?? 0) > 0)
    .map((a) => ({ accessory: a, qty: accessoryQty[a.id] }));

  const cartTotal = cart.reduce((s, r) => s + (r.asking_price ?? 0), 0) + accessoryLines.reduce((s, l) => s + (l.accessory.price ?? 0) * l.qty, 0);
  const cartCount = cart.length + accessoryLines.reduce((s, l) => s + l.qty, 0);
  const hasFilters = !!(genreFilter || formatFilter || condFilter || maxPrice);

  const accCategories = [...new Set(store.accessories.map((a) => a.category))].sort();
  const filteredAccessories = accCategoryFilter ? store.accessories.filter((a) => a.category === accCategoryFilter) : store.accessories;

  const selectedRecord = selectedRecordId ? store.records.find((r) => r.id === selectedRecordId) ?? null : null;
  const related = selectedRecord
    ? vinylRecords.filter((r) => r.id !== selectedRecord.id && recordTags(r).some((t) => recordTags(selectedRecord).includes(t))).slice(0, 4)
    : [];

  const sidebar = (
    <div className="flex flex-col gap-0">
      {genres.length > 0 && (
        <FilterSection label={t.sidebar.genreStyle} options={genres} value={genreFilter} onChange={setGenreFilter} allLabel={t.sidebar.all} />
      )}
      {formats.length > 0 && (
        <FilterSection label={t.sidebar.format} options={formats} value={formatFilter} onChange={setFormatFilter} allLabel={t.sidebar.all} />
      )}
      <FilterSection label={t.sidebar.condition} options={[...CONDITIONS]} value={condFilter} onChange={setCondFilter} allLabel={t.sidebar.all} />
      <div>
        <p className="text-2xs font-bold uppercase tracking-widest text-neutral-400 mb-2">{t.sidebar.maxPrice}</p>
        <div className="flex items-center gap-1">
          <span className="text-xs text-neutral-400">$</span>
          <input
            type="number" min="0" value={maxPrice}
            onChange={(e) => setMaxPrice(e.target.value)}
            placeholder={t.sidebar.any}
            className="w-full border border-neutral-300 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-900 text-neutral-900 dark:text-neutral-100 px-2 py-1.5 text-xs focus:outline-none"
          />
        </div>
      </div>
      {hasFilters && (
        <button
          onClick={() => { setGenreFilter(""); setFormatFilter(""); setCondFilter(""); setMaxPrice(""); }}
          className="mt-4 text-xs text-neutral-400 hover:text-red-500 transition-colors flex items-center gap-1"
        >
          <X size={11} /> {t.sidebar.clearAll}
        </button>
      )}
    </div>
  );

  const heroProps: HeroProps = { store, accent, secondary, featured: newIn[0] ?? null, tiles: newIn.slice(0, 4), onShop: () => navigate("shop"), t, headlineScale };

  return (
    <div
      className="min-h-screen bg-neutral-50 dark:bg-neutral-950 text-neutral-900 dark:text-neutral-100 flex flex-col"
      style={{
        fontFamily,
        ["--vs-radius" as string]: vsRadius,
        ["--vs-border-w" as string]: vsBorderW,
        ["--vs-shadow" as string]: vsShadow,
        ["--vs-card-pad" as string]: vsCardPad,
        ["--vs-section-pad" as string]: vsSectionPad,
      } as React.CSSProperties}
    >

      {/* ── ANNOUNCEMENT BANNER ──────────────────────────────────────────── */}
      {store.store_info_banner && (
        <div className="border-b border-neutral-200 dark:border-neutral-800 px-4 py-2 text-center">
          <p className="text-2xs uppercase tracking-widest font-medium text-neutral-500 dark:text-neutral-400">{store.store_info_banner}</p>
        </div>
      )}

      {/* ── STICKY HEADER (global chrome, every view) ────────────────────── */}
      <div className="border-b border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-950 sticky top-0 z-30">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
          <button onClick={() => navigate("home")} className="flex items-center gap-2.5">
            {store.store_logo_url ? (
              <img src={store.store_logo_url} alt="" className="w-7 h-7 object-cover" />
            ) : (
              <div className="w-7 h-7 flex items-center justify-center border border-neutral-300 dark:border-neutral-700">
                <Disc3 size={14} style={{ color: accent }} />
              </div>
            )}
            <span className="font-semibold text-base italic hidden sm:inline">{store.store_name ?? t.hero.defaultName}</span>
          </button>
          <nav className="flex items-center gap-5 sm:gap-7">
            {([
              ["shop", t.nav.shop],
              ["acc", t.nav.accessories],
              ["sell", t.nav.sellTrade],
              ["about", t.nav.about],
            ] as const).map(([v, label]) => (
              <button
                key={v}
                onClick={() => navigate(v)}
                className={`hidden sm:inline-block text-2xs uppercase tracking-widest font-medium pb-0.5 border-b-2 transition-colors ${view === v ? "border-current" : "border-transparent text-neutral-500 hover:text-neutral-900 dark:hover:text-neutral-100"}`}
                style={view === v ? { color: accent } : undefined}
              >
                {label}
              </button>
            ))}
            <button
              onClick={() => navigate("shop")}
              className={`sm:hidden text-2xs uppercase tracking-widest font-medium pb-0.5 border-b-2 transition-colors ${view === "shop" ? "border-current" : "border-transparent text-neutral-500"}`}
              style={view === "shop" ? { color: accent } : undefined}
            >
              {t.nav.shop}
            </button>
            <select
              value={lang}
              onChange={(e) => setLang(e.target.value as typeof lang)}
              aria-label="Language"
              className="border border-neutral-300 dark:border-neutral-700 bg-transparent text-2xs uppercase tracking-widest font-medium text-neutral-700 dark:text-neutral-300 px-2 py-1.5 focus:outline-none cursor-pointer appearance-none"
            >
              {STORE_LANGS.map((l) => (
                <option key={l.code} value={l.code}>{l.label}</option>
              ))}
            </select>
            <button
              onClick={() => setCartOpen(true)}
              className="flex items-center gap-2 px-3 py-1.5 border border-neutral-300 dark:border-neutral-700 text-2xs uppercase tracking-widest font-medium text-neutral-700 dark:text-neutral-300 hover:border-neutral-900 dark:hover:border-neutral-100 transition-colors"
            >
              {t.nav.bag}
              {cartCount > 0 && <span className="font-mono">({cartCount})</span>}
            </button>
          </nav>
        </div>
      </div>

      {/* ════════════════════════ HOME ════════════════════════════════════ */}
      {view === "home" && (
        <>
          {store.store_hero_layout === "index" ? (
            <HeroIndex {...heroProps} />
          ) : store.store_hero_layout === "poster" ? (
            <HeroPoster {...heroProps} />
          ) : (
            <HeroGallery {...heroProps} />
          )}

          <div className="pt-10 pb-4 bg-neutral-50 dark:bg-neutral-950">
            <div className="max-w-7xl mx-auto w-full">
              {newIn.length > 0 && (
                <HorizontalCarousel
                  title={t.carousel.newArrivals}
                  icon={<Zap size={16} />}
                  records={newIn}
                  cart={cart}
                  onToggle={toggleCart}
                  onOpen={(r) => navigate("product", { recordId: r.id })}
                  accent={accent}
                  secondary={secondary}
                  onViewAll={() => navigate("shop")}
                  t={t}
                  cardTexture={cardTexture}
                  motionClass={motionClass}
                  buttonShape={buttonShape}
                />
              )}

              {/* Browse by genre — editorial index list */}
              {genres.length > 0 && (
                <div className="mb-10 px-4 sm:px-6">
                  <Eyebrow color={accent}>{t.home.digByGenre}</Eyebrow>
                  <div className="border-t border-neutral-200 dark:border-neutral-800">
                    {genres.map((g) => (
                      <button
                        key={g}
                        onClick={() => navigate("shop", { genre: g })}
                        className="w-full flex items-center justify-between py-5 border-b border-neutral-200 dark:border-neutral-800 hover:bg-neutral-100/50 dark:hover:bg-neutral-900/50 transition-colors text-left"
                      >
                        <span className="text-2xl sm:text-3xl font-bold tracking-tight">{g}</span>
                        <span className="text-2xs uppercase tracking-widest font-medium text-neutral-400 flex-shrink-0">
                          {t.home.titleCount(String(genreCounts[g]).padStart(2, "0"), genreCounts[g])}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {discogsRecords.length > 0 && (
                <HorizontalCarousel
                  title={t.carousel.onDiscogs}
                  icon={<Disc3 size={16} />}
                  records={discogsRecords.slice(0, 12)}
                  cart={cart}
                  onToggle={toggleCart}
                  onOpen={(r) => navigate("product", { recordId: r.id })}
                  accent={accent}
                  secondary={secondary}
                  t={t}
                  cardTexture={cardTexture}
                  motionClass={motionClass}
                  buttonShape={buttonShape}
                />
              )}

              {/* Accessories teaser */}
              {store.accessories.length > 0 && (
                <div className="mb-10 px-4 sm:px-6">
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-2">
                      <Package size={16} className="text-neutral-400" />
                      <h2 className="text-lg font-bold">{t.home.accessories}</h2>
                    </div>
                    <button onClick={() => navigate("acc")} className="text-xs font-medium hover:underline" style={{ color: accent }}>{t.home.shopGear}</button>
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                    {store.accessories.slice(0, 4).map((a) => (
                      <AccessoryCard
                        key={a.id}
                        accessory={a}
                        inCart={(accessoryQty[a.id] ?? 0) > 0}
                        onToggle={() => addAccessoryToCart(a)}
                        accent={accent}
                        secondary={secondary}
                        t={t}
                        cardTexture={cardTexture}
                        motionClass={motionClass}
                        buttonShape={buttonShape}
                      />
                    ))}
                  </div>
                </div>
              )}

              {/* Sell/Trade band — full-bleed dark */}
              <div className="relative left-1/2 right-1/2 -mx-[50vw] w-screen bg-neutral-900 dark:bg-black text-white mb-10">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 py-14 sm:py-20 grid sm:grid-cols-[1fr_360px] gap-10 sm:gap-16">
                  <div>
                    <p className="text-2xs uppercase tracking-widest font-semibold mb-3" style={{ color: accent }}>{t.home.sellTradeLabel}</p>
                    <h2 className={`${H1_HERO[headlineScale]} font-bold tracking-tight leading-[0.95] mb-5`}>{t.home.sellTradeHeadline1}<br />{t.home.sellTradeHeadline2}</h2>
                    <p className="text-sm text-white/60 mb-7 max-w-sm leading-relaxed">{t.home.sellTradeBody}</p>
                    <button onClick={() => navigate("sell")} className="px-6 py-3 text-sm font-semibold text-white rounded-[var(--vs-radius)]" style={{ background: accent }}>
                      {t.home.getOffer}
                    </button>
                  </div>
                  <div className="border-t border-white/15 sm:border-t-0">
                    {[
                      ["01", t.home.step1Title, t.home.step1Desc],
                      ["02", t.home.step2Title, t.home.step2Desc],
                      ["03", t.home.step3Title, t.home.step3Desc],
                    ].map(([n, title, desc], i) => (
                      <div key={n} className={`py-5 ${i > 0 ? "border-t border-white/15" : ""}`}>
                        <div className="flex items-baseline gap-3">
                          <span className="text-xs font-mono" style={{ color: accent }}>{n}</span>
                          <div>
                            <p className="text-sm font-semibold">{title}</p>
                            <p className="text-xs text-white/50 mt-0.5">{desc}</p>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* About teaser */}
              {(store.store_description || store.store_banner_url) && (
                <div className="px-4 sm:px-6 mb-10">
                  <div className="grid sm:grid-cols-2 gap-10 sm:gap-16 items-center">
                    <div className="aspect-[4/3] border border-neutral-200 dark:border-neutral-800 overflow-hidden bg-neutral-100 dark:bg-neutral-900">
                      {store.store_banner_url ? (
                        <img src={store.store_banner_url} alt="" className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center"><Info size={32} className="text-neutral-300 dark:text-neutral-700" /></div>
                      )}
                    </div>
                    <div>
                      <Eyebrow color={accent}>{t.home.theShop}</Eyebrow>
                      <h2 className="text-2xl sm:text-3xl font-bold tracking-tight leading-tight mb-4">{t.home.aboutTitle(store.store_name ?? t.hero.defaultName)}</h2>
                      {store.store_description && <p className="text-sm text-neutral-500 mb-6 leading-relaxed line-clamp-3">{store.store_description}</p>}
                      <button onClick={() => navigate("about")} className="px-5 py-2.5 text-sm font-medium border-[length:var(--vs-border-w)] rounded-[var(--vs-radius)] border-neutral-300 dark:border-neutral-700 hover:border-neutral-900 dark:hover:border-neutral-100 transition-colors">
                        {t.home.readOurStory}
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </>
      )}

      {/* ════════════════════════ SHOP ═════════════════════════════════════ */}
      {view === "shop" && (
        <>
          <div className="max-w-7xl mx-auto px-4 sm:px-6 pt-10 pb-6 w-full">
            <Eyebrow color={accent}>{t.shop.eyebrow}</Eyebrow>
            <h2 className={`${H2_SECTION[headlineScale]} font-bold tracking-tight mb-6`}>
              {genreFilter || t.shop.allRecords}
            </h2>
            <div className="flex gap-2 mb-5">
              <div className="relative flex-1">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400 pointer-events-none" />
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder={t.shop.searchPlaceholder}
                  className="w-full pl-9 pr-8 py-2.5 border border-neutral-300 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-900 text-sm text-neutral-900 dark:text-neutral-100 placeholder-neutral-400 focus:outline-none"
                />
                {search && (
                  <button onClick={() => setSearch("")} className="absolute right-3 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-neutral-600">
                    <X size={12} />
                  </button>
                )}
              </div>
              <div className="relative">
                <ArrowUpDown size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-neutral-400 pointer-events-none" />
                <select
                  value={sort}
                  onChange={(e) => setSort(e.target.value as SortKey)}
                  className="pl-8 pr-3 py-2.5 border border-neutral-300 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-900 text-sm text-neutral-700 dark:text-neutral-300 appearance-none cursor-pointer focus:outline-none"
                >
                  <option value="newest">{t.shop.sortNewest}</option>
                  <option value="price_asc">{t.shop.sortPriceAsc}</option>
                  <option value="price_desc">{t.shop.sortPriceDesc}</option>
                  <option value="az">{t.shop.sortAZ}</option>
                </select>
              </div>
              <button
                onClick={() => setSidebarOpen(!sidebarOpen)}
                className={`sm:hidden px-3 py-2 border-[length:var(--vs-border-w)] rounded-[var(--vs-radius)] text-sm flex items-center gap-1.5 transition-colors ${hasFilters ? "" : "border-neutral-300 dark:border-neutral-700 text-neutral-500"}`}
                style={hasFilters ? { borderColor: accent, color: accent } : undefined}
              >
                <SlidersHorizontal size={14} />
                {hasFilters && <span className="w-1.5 h-1.5" style={{ background: accent }} />}
              </button>
            </div>

            {sidebarOpen && (
              <div className="sm:hidden mb-4 p-4 bg-neutral-50 dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800">
                {sidebar}
              </div>
            )}
          </div>

          <div className="max-w-7xl mx-auto px-4 sm:px-6 pb-16 flex gap-8 flex-1 w-full">
            <aside className="hidden sm:block w-44 flex-shrink-0 sticky top-24 self-start">
              {sidebar}
            </aside>

            <div className="flex-1 min-w-0">
              <p className="text-xs text-neutral-400 mb-4">
                {t.shop.recordCount(filtered.length, vinylRecords.length, filtered.length !== vinylRecords.length)}
              </p>

              {filtered.length === 0 ? (
                <div className="flex flex-col items-center gap-3 py-24 text-center">
                  <Disc3 size={40} className="text-neutral-300" />
                  <p className="text-neutral-500 text-sm">
                    {search || hasFilters ? t.shop.noMatch : t.shop.noneAvailable}
                  </p>
                  {(hasFilters || search) && (
                    <button
                      onClick={() => { setGenreFilter(""); setFormatFilter(""); setCondFilter(""); setMaxPrice(""); setSearch(""); }}
                      className="text-xs hover:underline"
                      style={{ color: accent }}
                    >
                      {t.shop.clearFilters}
                    </button>
                  )}
                </div>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                  {filtered.map((r) => (
                    <RecordCard
                      key={r.id}
                      record={r}
                      inCart={!!cart.find((c) => c.id === r.id)}
                      onToggle={() => toggleCart(r)}
                      onOpen={() => navigate("product", { recordId: r.id })}
                      accent={accent}
                      secondary={secondary}
                      t={t}
                      cardTexture={cardTexture}
                      motionClass={motionClass}
                      buttonShape={buttonShape}
                    />
                  ))}
                </div>
              )}
            </div>
          </div>
        </>
      )}

      {/* ════════════════════════ PRODUCT ══════════════════════════════════ */}
      {view === "product" && selectedRecord && (
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8 w-full">
          <button onClick={() => navigate("shop")} className="flex items-center gap-1.5 text-sm text-neutral-500 hover:text-neutral-900 dark:hover:text-neutral-100 mb-6 transition-colors">
            <ArrowLeft size={14} />{t.product.backToShop}
          </button>

          <div className="grid sm:grid-cols-2 gap-10 sm:gap-16">
            <div className="aspect-square border border-neutral-200 dark:border-neutral-800 overflow-hidden" style={selectedRecord.cover_image_url ? { background: "#e5e5e5" } : swatchStyle(selectedRecord.genre || selectedRecord.artist || selectedRecord.id, accent, secondary)}>
              {selectedRecord.cover_image_url ? (
                <img src={selectedRecord.cover_image_url} alt="" className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full flex items-center justify-center"><Disc3 size={64} className="text-white/30" /></div>
              )}
            </div>

            <div>
              {(selectedRecord.genre || selectedRecord.styles) && (
                <Eyebrow color={accent}>{recordTags(selectedRecord)[0]}</Eyebrow>
              )}
              <h1 className="text-3xl sm:text-4xl font-bold tracking-tight leading-tight mb-2">{selectedRecord.title || t.card.untitled}</h1>
              <p className="text-neutral-500 mb-7">{selectedRecord.artist || t.card.unknownArtist}</p>

              <div className="grid grid-cols-2 gap-4 mb-7 text-sm border-t border-neutral-200 dark:border-neutral-800 pt-5">
                <div><p className="text-2xs text-neutral-400 uppercase tracking-widest mb-0.5">{t.product.year}</p><p className="font-medium">{selectedRecord.year ?? "—"}</p></div>
                <div><p className="text-2xs text-neutral-400 uppercase tracking-widest mb-0.5">{t.product.format}</p><p className="font-medium">{selectedRecord.format ?? "—"}</p></div>
                <div><p className="text-2xs text-neutral-400 uppercase tracking-widest mb-0.5">{t.product.condition}</p><p className="font-medium">{selectedRecord.condition}</p></div>
                <div><p className="text-2xs text-neutral-400 uppercase tracking-widest mb-0.5">{t.product.catalogNumber}</p><p className="font-medium">{selectedRecord.catalog_number ?? "—"}</p></div>
              </div>

              <button
                onClick={() => toggleCart(selectedRecord)}
                className={`w-full flex items-center justify-between px-5 py-3.5 text-sm font-semibold uppercase tracking-widest border transition-colors mb-3 rounded-[var(--vs-radius)] border-[length:var(--vs-border-w)] ${buttonShape === "pill" ? "!rounded-full" : buttonShape === "underline" ? "!rounded-none !border-x-0 !border-t-0" : ""}`}
                style={cart.find((c) => c.id === selectedRecord.id)
                  ? { background: accent, borderColor: accent, color: "#fff" }
                  : { borderColor: "#d4d4d4", color: "#171717" }}
              >
                <span>{cart.find((c) => c.id === selectedRecord.id) ? t.card.inCart : t.product.addToBag}</span>
                {selectedRecord.asking_price != null && <span className="font-mono">{fmt(selectedRecord.asking_price)}</span>}
              </button>

              <p className="text-xs text-neutral-400 mb-6">{t.product.pickupOnly}</p>

              {selectedRecord.tracklist && selectedRecord.tracklist.length > 0 ? (
                <div className="border-t border-neutral-200 dark:border-neutral-800 pt-5">
                  <h3 className="text-sm font-semibold mb-3">{t.product.tracklist}</h3>
                  <div className="flex flex-col gap-1.5">
                    {selectedRecord.tracklist.map((track, i) => (
                      <div key={i} className="flex items-center gap-3 text-sm">
                        <span className="text-neutral-400 font-mono w-8 flex-shrink-0">{track.position}</span>
                        <span className="flex-1">{track.title}</span>
                        {track.duration && <span className="text-neutral-400 text-xs">{track.duration}</span>}
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="border-t border-neutral-200 dark:border-neutral-800 pt-5">
                  <p className="text-xs text-neutral-400">{t.product.tracklistUnavailable}</p>
                </div>
              )}
            </div>
          </div>

          {related.length > 0 && (
            <div className="mt-14">
              <h2 className="text-lg font-bold mb-4">{t.product.relatedTitle}</h2>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                {related.map((r) => (
                  <RecordCard
                    key={r.id}
                    record={r}
                    inCart={!!cart.find((c) => c.id === r.id)}
                    onToggle={() => toggleCart(r)}
                    onOpen={() => navigate("product", { recordId: r.id })}
                    accent={accent}
                    secondary={secondary}
                    t={t}
                    cardTexture={cardTexture}
                    motionClass={motionClass}
                    buttonShape={buttonShape}
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ════════════════════════ ACCESSORIES ══════════════════════════════ */}
      {view === "acc" && (
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-10 w-full flex-1">
          <Eyebrow color={accent}>{t.acc.eyebrow}</Eyebrow>
          <h1 className={`${H1_HERO[headlineScale]} font-bold tracking-tight mb-6`}>{t.acc.title}</h1>

          <div className="flex items-center gap-2 mb-8 flex-wrap">
            <button
              onClick={() => setAccCategoryFilter("")}
              className={`text-2xs uppercase tracking-widest font-medium px-3.5 py-2 border-[length:var(--vs-border-w)] rounded-[var(--vs-radius)] transition-colors ${!accCategoryFilter ? "" : "border-neutral-300 dark:border-neutral-700 text-neutral-500"}`}
              style={!accCategoryFilter ? { background: accent, borderColor: accent, color: "white" } : undefined}
            >
              {t.acc.allCount(store.accessories.length)}
            </button>
            {accCategories.map((c) => (
              <button
                key={c}
                onClick={() => setAccCategoryFilter(c)}
                className={`text-2xs uppercase tracking-widest font-medium px-3.5 py-2 border-[length:var(--vs-border-w)] rounded-[var(--vs-radius)] transition-colors ${accCategoryFilter === c ? "" : "border-neutral-300 dark:border-neutral-700 text-neutral-500"}`}
                style={accCategoryFilter === c ? { background: accent, borderColor: accent, color: "white" } : undefined}
              >
                {c}
              </button>
            ))}
          </div>

          {filteredAccessories.length === 0 ? (
            <div className="flex flex-col items-center gap-3 py-24 text-center">
              <Package size={40} className="text-neutral-300" />
              <p className="text-neutral-500 text-sm">{t.acc.none}</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
              {filteredAccessories.map((a) => (
                <AccessoryCard
                  key={a.id}
                  accessory={a}
                  inCart={(accessoryQty[a.id] ?? 0) > 0}
                  onToggle={() => addAccessoryToCart(a)}
                  accent={accent}
                  secondary={secondary}
                  t={t}
                  cardTexture={cardTexture}
                  motionClass={motionClass}
                  buttonShape={buttonShape}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {/* ════════════════════════ SELL / TRADE ═════════════════════════════ */}
      {view === "sell" && (
        <div className="max-w-2xl mx-auto px-4 sm:px-6 py-14 sm:py-20 w-full flex-1">
          {sellDone ? (
            <div className="flex flex-col items-center gap-3 text-center py-12">
              <div className="w-12 h-12 flex items-center justify-center border" style={{ borderColor: accent }}>
                <Check size={22} style={{ color: accent }} />
              </div>
              <h2 className="text-lg font-bold">{t.sell.doneTitle}</h2>
              <p className="text-sm text-neutral-500">{t.sell.doneBody}</p>
              <button
                onClick={() => { setSellDone(false); setSellForm({ name: "", email: "", approx_records: "", payout_preference: "cash", notes: "" }); }}
                className="text-xs hover:underline mt-2"
                style={{ color: accent }}
              >
                {t.sell.submitAnother}
              </button>
            </div>
          ) : (
            <>
              <Eyebrow color={accent}>{t.sell.eyebrow}</Eyebrow>
              <h1 className={`${H1_HERO[headlineScale]} font-bold tracking-tight leading-[0.95] mb-5`}>{t.sell.headline1}<br />{t.sell.headline2}</h1>
              <p className="text-base text-neutral-500 max-w-md mb-10 leading-relaxed">{t.sell.body}</p>

              <div className="flex flex-col gap-5">
                <div className="grid sm:grid-cols-2 gap-5">
                  <div>
                    <label className="text-2xs uppercase tracking-widest font-medium text-neutral-400 mb-1.5 block">{t.sell.yourName}</label>
                    <input value={sellForm.name} onChange={(e) => setSellForm((f) => ({ ...f, name: e.target.value }))} className="w-full px-3 py-3 border border-neutral-300 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-900 text-sm focus:outline-none" />
                  </div>
                  <div>
                    <label className="text-2xs uppercase tracking-widest font-medium text-neutral-400 mb-1.5 block">{t.sell.email}</label>
                    <input type="email" value={sellForm.email} onChange={(e) => setSellForm((f) => ({ ...f, email: e.target.value }))} className="w-full px-3 py-3 border border-neutral-300 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-900 text-sm focus:outline-none" />
                  </div>
                </div>
                <div className="grid sm:grid-cols-2 gap-5">
                  <div>
                    <label className="text-2xs uppercase tracking-widest font-medium text-neutral-400 mb-1.5 block">{t.sell.approxRecords}</label>
                    <input value={sellForm.approx_records} onChange={(e) => setSellForm((f) => ({ ...f, approx_records: e.target.value }))} placeholder={t.sell.approxPlaceholder} className="w-full px-3 py-3 border border-neutral-300 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-900 text-sm focus:outline-none" />
                  </div>
                  <div>
                    <label className="text-2xs uppercase tracking-widest font-medium text-neutral-400 mb-1.5 block">{t.sell.preferredPayout}</label>
                    <select
                      value={sellForm.payout_preference}
                      onChange={(e) => setSellForm((f) => ({ ...f, payout_preference: e.target.value }))}
                      className="w-full px-3 py-3 border border-neutral-300 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-900 text-sm focus:outline-none appearance-none cursor-pointer"
                    >
                      <option value="cash">{t.sell.payoutCash}</option>
                      <option value="credit">{t.sell.payoutCredit}</option>
                      <option value="either">{t.sell.payoutEither}</option>
                    </select>
                  </div>
                </div>
                <div>
                  <label className="text-2xs uppercase tracking-widest font-medium text-neutral-400 mb-1.5 block">{t.sell.highlights}</label>
                  <textarea
                    value={sellForm.notes}
                    onChange={(e) => setSellForm((f) => ({ ...f, notes: e.target.value }))}
                    rows={4}
                    placeholder={t.sell.highlightsPlaceholder}
                    className="w-full px-3 py-3 border border-neutral-300 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-900 text-sm focus:outline-none resize-none"
                  />
                </div>
                <button
                  disabled={!sellForm.name || !sellForm.email || sellSubmitting}
                  onClick={async () => {
                    setSellSubmitting(true);
                    try {
                      await api.submitSellTradeLead(slug, sellForm);
                    } catch { /* prototype-grade — show confirmation regardless */ }
                    setSellSubmitting(false);
                    setSellDone(true);
                  }}
                  className="self-start px-6 py-3.5 text-sm font-semibold uppercase tracking-widest text-white disabled:opacity-50 flex items-center justify-center gap-2 mt-2 rounded-[var(--vs-radius)]"
                  style={{ background: accent }}
                >
                  {sellSubmitting ? <Loader2 size={15} className="animate-spin" /> : <Repeat size={15} />}
                  {t.sell.requestOffer}
                </button>
              </div>
            </>
          )}
        </div>
      )}

      {/* ════════════════════════ ABOUT ════════════════════════════════════ */}
      {view === "about" && (
        <div className="w-full flex-1">
          <div className="max-w-4xl mx-auto px-4 sm:px-6 py-14 sm:py-20">
            <Eyebrow color={accent}>{t.about.eyebrow}</Eyebrow>
            <h1 className="text-4xl sm:text-5xl font-bold tracking-tight leading-[0.95] mb-10">{store.store_name ?? t.about.defaultTitle}</h1>
            {store.store_banner_url && (
              <div className="w-full border border-neutral-200 dark:border-neutral-800 overflow-hidden mb-10" style={{ aspectRatio: "21/9" }}>
                <img src={store.store_banner_url} alt="" className="w-full h-full object-cover" />
              </div>
            )}
            <div className="grid sm:grid-cols-2 gap-10 mb-10">
              {store.store_tagline && (
                <blockquote className="text-2xl font-medium leading-snug border-l-2 pl-5" style={{ borderColor: accent }}>
                  &ldquo;{store.store_tagline}&rdquo;
                </blockquote>
              )}
              {store.store_description && <p className="text-sm text-neutral-600 dark:text-neutral-400 leading-relaxed">{store.store_description}</p>}
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-10 py-6 border-t border-b border-neutral-200 dark:border-neutral-800">
              <div>
                <p className="text-3xl font-bold font-mono">{vinylRecords.length}</p>
                <p className="text-2xs text-neutral-400 uppercase tracking-widest mt-1">{t.about.titlesInStock}</p>
              </div>
            </div>

            <div className="flex flex-wrap gap-6 text-sm text-neutral-600 dark:text-neutral-400">
              {store.store_location && <span className="flex items-center gap-1.5"><MapPin size={14} />{store.store_location}</span>}
              {store.store_contact && (
                isPhone(store.store_contact)
                  ? <a href={`https://wa.me/${store.store_contact.replace(/\D/g, "")}`} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5 hover:underline"><MessageCircle size={14} />{t.about.whatsapp}</a>
                  : <a href={`mailto:${store.store_contact}`} className="flex items-center gap-1.5 hover:underline">{store.store_contact}</a>
              )}
              {store.store_hours && <span className="flex items-center gap-1.5 whitespace-pre-line"><Clock size={14} />{store.store_hours}</span>}
            </div>
          </div>
        </div>
      )}

      {/* ════════════════════════ CHECKOUT ═════════════════════════════════ */}
      {view === "checkout" && (
        <div className="max-w-4xl mx-auto px-4 sm:px-6 py-10 w-full flex-1">
          {orderRef ? (
            <div className="max-w-md mx-auto flex flex-col items-center gap-3 text-center py-12">
              <div className="w-12 h-12 flex items-center justify-center border" style={{ borderColor: accent }}>
                <Check size={22} style={{ color: accent }} />
              </div>
              <h2 className="text-lg font-bold">{t.checkout.thanks(checkoutForm.name)}</h2>
              <p className="text-sm text-neutral-500">{t.checkout.orderLine(orderRef, fmt(orderTotal ?? 0))}</p>
              <p className="text-xs text-neutral-400">{t.checkout.confirmBody}</p>
              <button onClick={() => navigate("shop")} className="text-xs hover:underline mt-2" style={{ color: accent }}>{t.checkout.keepDigging}</button>
            </div>
          ) : cartCount === 0 ? (
            <div className="flex flex-col items-center gap-3 text-center py-12">
              <ShoppingCart size={32} className="text-neutral-300" />
              <p className="text-sm text-neutral-500">{t.checkout.emptyBag}</p>
              <button onClick={() => navigate("shop")} className="text-xs hover:underline" style={{ color: accent }}>{t.checkout.startDigging}</button>
            </div>
          ) : (
            <>
              <button onClick={() => setCartOpen(true)} className="flex items-center gap-1.5 text-sm text-neutral-500 hover:text-neutral-900 dark:hover:text-neutral-100 mb-6 transition-colors">
                <ArrowLeft size={14} />{t.checkout.backToCart}
              </button>
              <div className="grid sm:grid-cols-[1fr_320px] gap-10">
                <div>
                  <Eyebrow color={accent}>{t.checkout.eyebrow}</Eyebrow>
                  <h1 className="text-3xl font-bold tracking-tight mb-1">{t.checkout.title}</h1>
                  <p className="text-sm text-neutral-500 mb-7">{t.checkout.subtitle}</p>
                  <div className="flex flex-col gap-4">
                    <div>
                      <label className="text-2xs uppercase tracking-widest font-medium text-neutral-400 mb-1.5 block">{t.checkout.name}</label>
                      <input value={checkoutForm.name} onChange={(e) => setCheckoutForm((f) => ({ ...f, name: e.target.value }))} className="w-full px-3 py-3 border border-neutral-300 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-900 text-sm focus:outline-none" />
                    </div>
                    <div>
                      <label className="text-2xs uppercase tracking-widest font-medium text-neutral-400 mb-1.5 block">{t.checkout.emailOrPhone}</label>
                      <input value={checkoutForm.contact} onChange={(e) => setCheckoutForm((f) => ({ ...f, contact: e.target.value }))} placeholder={t.checkout.emailOrPhonePlaceholder} className="w-full px-3 py-3 border border-neutral-300 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-900 text-sm focus:outline-none" />
                    </div>
                    <div>
                      <label className="text-2xs uppercase tracking-widest font-medium text-neutral-400 mb-1.5 block">{t.checkout.note}</label>
                      <textarea value={checkoutForm.note} onChange={(e) => setCheckoutForm((f) => ({ ...f, note: e.target.value }))} rows={2} placeholder={t.checkout.notePlaceholder} className="w-full px-3 py-3 border border-neutral-300 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-900 text-sm focus:outline-none resize-none" />
                    </div>
                  </div>
                </div>

                <div className="sm:sticky sm:top-20 self-start">
                  <div className="border-[length:var(--vs-border-w)] rounded-[var(--vs-radius)] border-neutral-200 dark:border-neutral-800 p-5" style={{ boxShadow: "var(--vs-shadow)" }}>
                    <p className="text-2xs uppercase tracking-widest font-semibold text-neutral-400 mb-4">{t.checkout.orderSummary}</p>
                    <div className="flex flex-col gap-3 mb-4">
                      {cart.map((r) => (
                        <div key={r.id} className="flex items-center gap-2 text-sm">
                          <div className="w-9 h-9 flex-shrink-0 overflow-hidden bg-neutral-100 dark:bg-neutral-800">
                            {r.cover_image_url ? <img src={r.cover_image_url} alt="" className="w-full h-full object-cover" /> : <div className="w-full h-full flex items-center justify-center"><Music size={14} className="text-neutral-400" /></div>}
                          </div>
                          <span className="flex-1 truncate text-xs">{r.title}</span>
                          {r.asking_price != null && <span className="text-xs font-medium font-mono">{fmt(r.asking_price)}</span>}
                        </div>
                      ))}
                      {accessoryLines.map(({ accessory: a, qty }) => (
                        <div key={a.id} className="flex items-center gap-2 text-sm">
                          <div className="w-9 h-9 flex-shrink-0 overflow-hidden bg-neutral-100 dark:bg-neutral-800">
                            {a.cover_image_url ? <img src={a.cover_image_url} alt="" className="w-full h-full object-cover" /> : <div className="w-full h-full flex items-center justify-center"><Package size={14} className="text-neutral-400" /></div>}
                          </div>
                          <span className="flex-1 truncate text-xs">{a.name} x{qty}</span>
                          {a.price != null && <span className="text-xs font-medium font-mono">{fmt(a.price * qty)}</span>}
                        </div>
                      ))}
                    </div>
                    <div className="flex items-center justify-between pt-3 border-t border-neutral-200 dark:border-neutral-800 mb-1">
                      <span className="text-sm font-semibold">{t.checkout.total}</span>
                      <span className="text-lg font-bold font-mono">{fmt(cartTotal)}</span>
                    </div>
                    <p className="text-2xs text-neutral-400 mb-4">{t.checkout.pickupNote}</p>
                    <button
                      disabled={!checkoutForm.name || !checkoutForm.contact || placingOrder}
                      onClick={async () => {
                        setPlacingOrder(true);
                        let ref = "ORD-" + Date.now().toString(36).toUpperCase();
                        try {
                          const items = [
                            ...cart.map((r) => ({ kind: "record" as const, id: r.id, name: `${r.artist ?? ""} — ${r.title ?? ""}`.trim(), qty: 1, price: r.asking_price })),
                            ...accessoryLines.map(({ accessory: a, qty }) => ({ kind: "accessory" as const, id: a.id, name: a.name, qty, price: a.price })),
                          ];
                          const res = await api.placeOrder(slug, { customer_name: checkoutForm.name, customer_contact: checkoutForm.contact, note: checkoutForm.note || null, items, total: cartTotal });
                          ref = res.order_ref;
                        } catch { /* backend record-keeping is best-effort — still complete the handoff below */ }
                        if (store.store_contact) {
                          const link = buildShareLink(store.store_contact, cart, accessoryLines, store.store_name, { ...checkoutForm, orderRef: ref });
                          window.open(link, "_blank");
                        }
                        setOrderTotal(cartTotal);
                        setOrderRef(ref);
                        setCart([]);
                        setAccessoryQty({});
                        setPlacingOrder(false);
                      }}
                      className="w-full py-3.5 text-sm font-semibold uppercase tracking-widest text-white disabled:opacity-50 rounded-[var(--vs-radius)] flex items-center justify-center gap-2"
                      style={{ background: accent }}
                    >
                      {placingOrder && <Loader2 size={14} className="animate-spin" />}
                      {t.checkout.placeOrder}
                    </button>
                  </div>
                </div>
              </div>
            </>
          )}
        </div>
      )}

      {/* ── FOOTER ───────────────────────────────────────────────────────── */}
      <footer className="border-t border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 mt-auto">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-10">
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-8">
            <div className="sm:col-span-2">
              <div className="flex items-center gap-2 mb-3">
                {store.store_logo_url ? (
                  <img src={store.store_logo_url} alt="" className="w-8 h-8 rounded-lg object-cover" />
                ) : (
                  <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: `${accent}20` }}>
                    <Disc3 size={14} style={{ color: accent }} />
                  </div>
                )}
                <h3 className="font-semibold text-neutral-900 dark:text-neutral-100">{store.store_name ?? t.hero.defaultName}</h3>
              </div>
              {store.store_tagline && <p className="text-sm text-neutral-500 mb-2">{store.store_tagline}</p>}
              {store.store_description && <p className="text-xs text-neutral-400 leading-relaxed">{store.store_description}</p>}
            </div>

            <div>
              <h4 className="text-xs font-bold uppercase tracking-widest text-neutral-400 mb-3">{t.footer.contact}</h4>
              <div className="flex flex-col gap-2">
                {store.store_location && (
                  <div className="flex items-center gap-2 text-sm text-neutral-600 dark:text-neutral-400">
                    <MapPin size={13} className="flex-shrink-0" />{store.store_location}
                  </div>
                )}
                {store.store_contact && isPhone(store.store_contact) && (
                  <a href={`https://wa.me/${store.store_contact.replace(/\D/g, "")}`} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 text-sm text-[#25D366] hover:underline">
                    <MessageCircle size={13} className="flex-shrink-0" />{t.about.whatsapp}
                  </a>
                )}
                {store.store_contact && !isPhone(store.store_contact) && (
                  <a href={`mailto:${store.store_contact}`} className="flex items-center gap-2 text-sm text-neutral-600 dark:text-neutral-400 hover:underline">
                    {store.store_contact}
                  </a>
                )}
                {store.store_hours && (
                  <div className="mt-2">
                    <div className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-widest text-neutral-400 mb-1.5">
                      <Clock size={11} /> {t.footer.hours}
                    </div>
                    <pre className="text-xs text-neutral-500 dark:text-neutral-400 whitespace-pre-wrap font-sans leading-relaxed">{store.store_hours}</pre>
                  </div>
                )}
              </div>
            </div>

            <div>
              <h4 className="text-xs font-bold uppercase tracking-widest text-neutral-400 mb-3">{t.footer.follow}</h4>
              <div className="flex flex-col gap-2">
                {store.store_instagram && (
                  <a href={`https://instagram.com/${store.store_instagram}`} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 text-sm text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-neutral-100 transition-colors">
                    <Instagram size={13} />@{store.store_instagram}
                  </a>
                )}
                {store.store_facebook && (
                  <a href={`https://facebook.com/${store.store_facebook}`} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 text-sm text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-neutral-100 transition-colors">
                    <Facebook size={13} />{store.store_facebook}
                  </a>
                )}
                {store.store_website && (
                  <a href={store.store_website} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 text-sm text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-neutral-100 transition-colors">
                    <Globe size={13} />{t.footer.website} <ExternalLink size={11} />
                  </a>
                )}
                {!store.store_instagram && !store.store_facebook && !store.store_website && (
                  <p className="text-xs text-neutral-400">—</p>
                )}
              </div>
            </div>
          </div>

          <div className="mt-8 pt-6 border-t border-neutral-100 dark:border-neutral-800 flex items-center justify-between flex-wrap gap-3">
            <p className="text-xs text-neutral-400">{t.footer.copyright(new Date().getFullYear(), store.store_name ?? t.hero.defaultName)}</p>
            <div className="flex items-center gap-1.5 text-xs text-neutral-400">
              <Disc3 size={12} /><span>{t.footer.poweredBy}</span>
              <a href="/" className="font-medium text-neutral-500 hover:text-neutral-700 dark:hover:text-neutral-300 transition-colors">VinylScan</a>
            </div>
          </div>
        </div>
      </footer>

      {/* ── CART DRAWER ──────────────────────────────────────────────────── */}
      {cartOpen && (
        <div className="fixed inset-0 z-50 flex justify-end">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setCartOpen(false)} />
          <div className="relative bg-neutral-50 dark:bg-neutral-900 border-l border-neutral-200 dark:border-neutral-800 w-full max-w-sm flex flex-col h-full">
            <div className="flex items-center justify-between px-5 py-4 border-b border-neutral-200 dark:border-neutral-800">
              <p className="text-2xs uppercase tracking-widest font-semibold">{t.cart.bagCount(cartCount)}</p>
              <button onClick={() => setCartOpen(false)} className="text-neutral-400 hover:text-neutral-700">
                <X size={16} />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto px-5 py-4 flex flex-col gap-3">
              {cartCount === 0 ? (
                <div className="flex flex-col items-center gap-3 py-12 text-center">
                  <ShoppingCart size={32} className="text-neutral-300" />
                  <p className="text-sm text-neutral-500">{t.cart.empty}</p>
                  <button onClick={() => { setCartOpen(false); navigate("shop"); }} className="text-xs hover:underline" style={{ color: accent }}>{t.cart.startDigging}</button>
                </div>
              ) : (
                <>
                  {cart.map((r) => (
                    <div key={r.id} className="flex items-center gap-3 py-1">
                      <div className="w-12 h-12 flex-shrink-0 overflow-hidden bg-neutral-100 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-800">
                        {r.cover_image_url
                          ? <img src={r.cover_image_url} alt="" loading="lazy" className="w-full h-full object-cover" />
                          : <div className="w-full h-full flex items-center justify-center"><Music size={18} className="text-neutral-400" /></div>
                        }
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs text-neutral-500 truncate">{r.artist}</p>
                        <p className="text-sm font-medium truncate">{r.title}</p>
                        <p className="text-2xs text-neutral-400">{r.condition}{r.format ? ` · ${r.format}` : ""}</p>
                      </div>
                      <div className="text-right flex-shrink-0">
                        {r.asking_price != null && <p className="text-sm font-bold font-mono">{fmt(r.asking_price)}</p>}
                        <button onClick={() => toggleCart(r)} className="text-2xs text-neutral-400 hover:text-red-500 transition-colors">{t.cart.remove}</button>
                      </div>
                    </div>
                  ))}
                  {accessoryLines.map(({ accessory: a, qty }) => (
                    <div key={a.id} className="flex items-center gap-3 py-1">
                      <div className="w-12 h-12 flex-shrink-0 overflow-hidden bg-neutral-100 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-800">
                        {a.cover_image_url
                          ? <img src={a.cover_image_url} alt="" loading="lazy" className="w-full h-full object-cover" />
                          : <div className="w-full h-full flex items-center justify-center"><Package size={18} className="text-neutral-400" /></div>
                        }
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs text-neutral-500 truncate">{a.category}</p>
                        <p className="text-sm font-medium truncate">{a.name}</p>
                        <div className="flex items-center gap-2 mt-1">
                          <button onClick={() => setAccessoryLineQty(a.id, qty - 1)} className="w-5 h-5 border border-neutral-300 dark:border-neutral-700 flex items-center justify-center text-neutral-500 text-xs">−</button>
                          <span className="text-xs w-4 text-center font-mono">{qty}</span>
                          <button
                            onClick={() => setAccessoryLineQty(a.id, qty + 1)}
                            disabled={qty >= a.stock_quantity}
                            className="w-5 h-5 border border-neutral-300 dark:border-neutral-700 flex items-center justify-center text-neutral-500 text-xs disabled:opacity-30"
                          >+</button>
                        </div>
                      </div>
                      <div className="text-right flex-shrink-0">
                        {a.price != null && <p className="text-sm font-bold font-mono">{fmt(a.price * qty)}</p>}
                        <button onClick={() => setAccessoryLineQty(a.id, 0)} className="text-2xs text-neutral-400 hover:text-red-500 transition-colors">{t.cart.remove}</button>
                      </div>
                    </div>
                  ))}
                </>
              )}
            </div>

            {cartCount > 0 && (
              <div className="border-t border-neutral-200 dark:border-neutral-800 px-5 py-4 flex flex-col gap-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-neutral-500">{t.cart.total}</span>
                  <span className="text-xl font-bold font-mono">{fmt(cartTotal)}</span>
                </div>
                <p className="text-2xs text-neutral-400">{t.cart.pickupOnly}</p>
                <button
                  onClick={() => { setCartOpen(false); navigate("checkout"); }}
                  className={`w-full flex items-center justify-between px-5 py-3.5 text-sm font-semibold uppercase tracking-widest text-white rounded-[var(--vs-radius)] ${buttonShape === "pill" ? "!rounded-full" : ""}`}
                  style={{ background: accent }}
                >
                  <span>{t.cart.checkout}</span>
                  <span className="font-mono">{fmt(cartTotal)}</span>
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
