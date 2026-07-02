# Storefront v2 — Architecture

Status: **planned, not yet built.** This document is the agreed spec for rebuilding the public-facing storefront (`/store/[slug]`) that each store owner's customers browse and buy from. It replaces the previous basic version with the structure below. Per-store visual customization (fonts/colors/sizes/"vibe coded" params) is a later, separate phase — not covered here. A dedicated mobile-specific version is also deferred — existing responsive behavior just needs to keep working.

Source brief: see conversation history / `architecture-brief.md` supplied by the store owner for the original design reference. This document is the version adapted to VinylScan's real data and constraints.

---

## 1. Scope decisions

These were explicitly decided (not left implicit) because they change the shape of the build:

| Decision | What it means |
|---|---|
| **Checkout is pickup-only, no real payment** | No shipping address fields, no shipping cost, no card-number form (payment happens in person at pickup — a fake card form would mislead customers). "Place order" generates a local reference number and hands off cart + contact info to the store owner via WhatsApp/email, same mechanism as today. No Order/OrderItem table. |
| **Sell/Trade leads aren't persisted** | Submitting the form sends an email to the store owner. No DB table, no admin inbox to check. |
| **Accessories are a real, separate entity** | Not `Record` rows with `record_section="accessory"` anymore. Own table, own category field, own `stock_quantity` (informational only — there's no real checkout to enforce it against). |
| **No Staff Picks** | Out of scope. Not building this. |
| **No newsletter signup** | Dropped from the footer. |
| **Tracklist is real, not fabricated** | Sourced from the linked Discogs release at confirm time. If a record has no Discogs release, the store owner can type one in manually. Shown as "not available" only when genuinely neither source has one — never made up. |
| **Hero layout is an owner setting** | Gallery / Index / Poster, picked once in Settings, not a visitor-facing toggle. |

---

## 2. Views

The storefront stays a single URL (`/store/[slug]`) — navigation between views is in-page state, not real routing, matching how it already works today (filters/sections don't change the URL). Every view change scrolls to top.

| View | Purpose |
|---|---|
| `home` | Landing — hero (one of 3 layouts) + New Arrivals + Browse by Genre + Accessories teaser + Sell/Trade band + About teaser |
| `shop` | Full catalog — genre/format/condition/price filters, search, sort |
| `product` | Single record detail — metadata, real tracklist, "you might also like" |
| `acc` | Accessories catalogue — category filter chips |
| `sell` | Sell/Trade lead form → confirmation |
| `about` | Store description, location/hours/contact, stats (titles in stock — the only real number available) |
| `checkout` | Pickup contact form → order summary → confirmation with reference number |

Cart drawer is an overlay (not a view), reachable from anywhere via the header's bag button.

---

## 3. Data model

### New: `Accessory` table
```
id, user_id (FK→users), name, category, description, price,
stock_quantity (int, default 0, display-only), cover_image_url,
is_listed (bool), created_at
```
`category` is a validated free string (Turntables / Cartridges / Care / Sleeves / Slipmats / Storage / Other) — not a DB enum, to avoid migration friction if the list changes later.

### `Record` — one addition
```
tracklist: JSON  — list of {position, title, duration}
```
Populated from the confirmed Discogs release at confirm time (reusing the existing release-detail fetch — zero extra API calls), or typed in manually via the record-edit modal when there's no linked release.

### `User` — one addition
```
store_hero_layout: string  — "gallery" | "index" | "poster", default "gallery"
```

### Existing fields reused as-is
- All 18 `store_*` branding fields (name, colors, fonts, logo, banner, hours, contact, socials, theme config) — unchanged.
- `Record.record_section="accessory"` (legacy) — left alone, just stops feeding the new dedicated accessories view. Not migrated; near-zero real data exists under this flag today.

---

## 4. Backend endpoints

### New: `/accessories` (authenticated, store owner)
```
GET    /accessories              list (incl. unlisted) — admin view
POST   /accessories              create
GET    /accessories/{id}
PATCH  /accessories/{id}
DELETE /accessories/{id}
POST   /accessories/{id}/image   Cloudinary upload
DELETE /accessories/{id}/image
```
All scoped to the authenticated owner — same pattern as every existing catalog/consignment endpoint.

### New: `/store/{slug}/sell-trade` (public, no auth)
```
POST /store/{slug}/sell-trade
  body: {name, email, approx_records, payout_preference, notes}
  → {ok: true}
```
Resolves the email recipient (store contact if it's an email address, otherwise the owner's account email), sends via the existing email service. Always returns success to the caller; delivery failures are logged server-side only.

### Changed: `GET /store/{slug}` (public)
Now also returns:
- `accessories: [...]` (from the new table)
- `store_hero_layout`
- `tracklist` on each record

Still a single GET — the whole storefront is fetched once and filtered client-side, same as today.

### Changed: `GET/PATCH /store/settings` (authenticated)
Adds `store_hero_layout`.

### Changed: `PATCH /catalog/{record_id}` (authenticated)
Adds `tracklist` to the set of fields an owner can edit directly.

### No checkout endpoint
Checkout is a pure frontend flow ending in the same WhatsApp/email handoff used today — now carrying pickup contact details instead of just the item list.

---

## 5. Frontend structure

`frontend/app/store/[slug]/page.tsx` stays the single route, shrunk to an orchestrator: fetch the store once, hold cart + current-view state, render persistent chrome (header/footer/cart drawer), switch on the active view.

New `frontend/components/store/` directory holds one component per view (`StoreHome`, `StoreShop`, `StoreProduct`, `StoreAccessories`, `StoreSellTrade`, `StoreAbout`, `StoreCheckout`), three hero layout variants, and shared pieces (record card, carousel, theme hook, cart hook) extracted from the current single-file implementation with no behavior change.

**Cart**: keyed by item id, tracks `{kind: "record"|"accessory", qty}`. Records are remove-only (real vinyl is 1-of-1, a quantity stepper would be misleading); accessories get full +/− controls since stock quantity makes that meaningful. Total is subtotal only — no shipping line.

---

## 6. Admin-side changes

- New `/catalog/accessories` page + dedicated modal for creating/editing accessories (own field set, doesn't fit the existing record modal).
- Sidebar gets an "Accessories" nav link.
- Existing record-edit modal gets a tracklist section: shows the Discogs-sourced tracklist read-only when one exists, otherwise an editable list (add/remove rows) for manual entry.
- Existing store settings page gets a hero-layout picker (3 cards, same pattern as the existing font picker).

---

## 7. Build phases

Each phase ships and verifies independently:

0. Extract today's storefront into the new file structure — zero behavior change, just groundwork.
1. Backend: `Accessory` model + CRUD endpoints.
2. Backend: real tracklist sourcing from Discogs at confirm time + manual-edit support.
3. Admin UI: accessories management page + tracklist editor.
4. Backend + frontend: hero layout setting.
5. Frontend: Shop + Product views, and the Home rebuild that links to them (shipped together — each needs the other to be reachable/testable).
6. Frontend + backend: Accessories, About, and Sell/Trade views + the lead-email endpoint.
7. Frontend: cart drawer rebuild (quantity-aware, records + accessories) + the pickup-only checkout flow — last, since it touches every "Add to bag" call site across all the other views.

---

## 8. What stays exactly as it is

- Stripe billing — that's VinylScan charging the store owner for the app, completely unrelated to this storefront and untouched by this work.
- The 18 existing store branding fields and how they're edited.
- The "fetch the whole store once, filter client-side" data-loading pattern.
- The in-state, no-URL-change navigation philosophy already in place today.
