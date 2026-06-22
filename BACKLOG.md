# VinylScan — Product Backlog

Priority order: P1 = ship next, P5 = future. Each item has effort estimate (human / Claude Code).

---

## P1 — Ship next (core correctness + biggest ROI)

### #1 Dual condition grading (disc / cover)
**What:** Replace single `condition` field with two fields: disc condition + cover condition. Industry standard is `M/VG+` notation — disc grade / cover grade. Every Discogs listing uses this.
**Why:** Current app is factually wrong. A record graded "VG+" might mean disc is VG+ but cover is G. Affects price, affects trust.
**Effort:** S (human: ~2h / CC: ~20min)
**Status:** Not started

---

### #2 Discogs price range (median / low / high)
**What:** When showing market price in RecordModal and catalog, display the full range: lowest listing, median sale, highest listing + "X for sale" count. Currently only shows lowest listing as a single suggested price.
**Why:** "Market: €8–€45, median €22, 14 for sale" gives dealers real pricing context. Lowest listing alone is misleading (one outlier can tank the floor).
**Effort:** S (human: ~2h / CC: ~20min)
**Status:** Not started — backend already calls Discogs pricing endpoint, just needs schema + UI update

---

### #3 Lot cost proration
**What:** When creating a lot, enter total purchase price paid. System distributes it evenly across all records in the lot. Each record gets `cost_price = lot_total / record_count`. Margin per record = `asking_price - cost_price`. Lot page shows aggregate margin.
**Why:** Dealers buy 40-record collections for €200. They need per-item cost basis to know if they're pricing profitably. Currently zero margin visibility at record level.
**Effort:** S (human: ~3h / CC: ~25min)
**Status:** Lots exist, `cost_price` field exists on Record. Missing: lot-level purchase price field + proration logic + margin display.

---

### #4 Consignment module
**What:** Track records left by third parties for sale on commission.
- New `Consignor` model: name, contact, default commission %
- `Record` gets optional `consignor_id` + `consignor_agreed_price` + `consignor_commission_pct`
- When sold: auto-calculate amount owed to consignor
- Consignor ledger page: what's on the floor, what sold, what's owed, what's been paid
- Aging alerts: consigned records unsold for >60 days → flag for renegotiation or return
**Why:** Most record stores run 15-30% of inventory on consignment. All track it in spreadsheets. No tool handles this well. Biggest store-specific differentiator in the backlog.
**Effort:** L (human: ~1 day / CC: ~1h)
**Status:** Not started

---

## P2 — High value, after P1 ships

### #6 Curatorial AI search
**What:** Natural language search over your catalog. "Find me something post-punk, 80s, British, under €15" → shows matching records. Powered by embeddings or Claude search over structured catalog data.
**Why:** How customers actually shop in record stores. No other tool does this. Massive demo hook.
**Effort:** M (human: ~1 day / CC: ~45min)
**Status:** Not started

---

### #7 Trade-ins / store credit
**What:** When a customer trades in records, log the trade: records received, credit issued. Credit attaches to a customer profile. Apply credit at POS against a sale. Track outstanding credit balances.
**Why:** Trades are a huge volume of record store transactions. Creates customer relationships (repeat visits to spend credit).
**Effort:** M (human: ~1 day / CC: ~45min)
**Status:** Not started

---

### #8 Walk-in alert (dealer wantlist)
**What:** Dealer-side wantlist of releases regular customers are hunting. When a scanned record matches an entry → notify the seller. Not a customer-facing feature — purely internal to help the store flag a sale opportunity.
**Why:** "I've been hunting a NM copy of Remain in Light for this customer for 6 months" is a real dealer workflow. No tool tracks this today.
**Effort:** M (human: ~1 day / CC: ~45min)
**Status:** Parked idea — not scheduled, no backend/frontend built yet

---

### #9 Holds / reservations
**What:** Mark a record as "Reserved" for a specific customer with an expiry date. Catalog shows reserved badge. Hold expires automatically after X days → back to available. Customer name + contact stored on hold.
**Why:** "Put that aside, I'm coming back Thursday" is a daily request in record stores. Currently untracked.
**Effort:** S (human: ~3h / CC: ~25min)
**Status:** Not started

---

### #10 Collective intelligence lookup
**What:** When a user confirms a scan match, store `(visual_hash, discogs_release_id)`. Before running full Discogs search for future scans, check the confirmed-match table first. Instant high-confidence match if the same label has been scanned before.
**Why:** The moat no competitor can copy — it requires having been used. Every confirmed scan makes the product smarter for everyone.
**Effort:** M (human: ~2h / CC: ~20min)
**Status:** Planned in TODOS.md. Activate when confirmed_scans > 500.

---

## P3 — After P2

### #11 Deadwax reader
**What:** Input field for the matrix numbers etched in the deadwax groove. Parse them to identify specific pressing variant (links to Discogs release via matrix). Optional: use Claude Vision to read the deadwax from a photo.
**Why:** The deadwax is how serious collectors distinguish pressings. An original UK 1972 pressing vs. a 1975 repress have different matrix strings. Critical for accurate pricing of valuable records.
**Effort:** M (human: ~3h / CC: ~30min) — text input easy, Vision OCR of etched text is harder
**Status:** Not started

---

### #12 Multi-user (store employees)
**What:** Store owner can invite employees as sub-accounts. Each scan attributed to employee. Owner sees all activity. Employee sees only scan + catalog (no financials).
**Why:** Stores with 2+ people scanning lots need merged work. Currently each person needs a separate account.
**Effort:** L (human: ~1 day / CC: ~1h)
**Status:** Not started

---

### #13 Shareable lot URLs
**What:** Generate a public or private link to a lot summary: records in the lot, their prices, condition. Useful for sending to buyers ("here's the lot I'm offering") or for stock lists.
**Why:** Dealers often share "I just got a jazz lot, here's what I have" with regular customers.
**Effort:** S (human: ~1h / CC: ~10min)
**Status:** Not started

---

### #14 Price history per record
**What:** Log every time a record's asking price changes (who changed it, old price, new price, timestamp). Show history in RecordModal.
**Why:** Audit trail. Useful for understanding which records consistently drop in price vs. sell quickly at high margin.
**Effort:** S (human: ~2h / CC: ~15min)
**Status:** Not started

---

## P4 — Polish & infrastructure

### #15 Median pricing basis option
**What:** In price markup settings, allow choosing between "lowest listing" and "median sale price" as the basis for auto-pricing.
**Why:** Lowest listing is conservative — one outlier can tank the floor. Median is more accurate for common titles.
**Effort:** S (human: ~1h / CC: ~10min)
**Status:** In TODOS.md

---

### #16 Catalog price refresh button
**What:** "↻" button on records with null `asking_price`. Triggers a fresh Discogs price lookup.
**Why:** Background tasks die on Render free tier. This is a manual recovery path for null prices.
**Effort:** XS (human: ~30min / CC: ~5min)
**Status:** In TODOS.md

---

### #17 Rename "Add to cart" → "Add to Invoice"
**What:** POS button language change.
**Why:** "Cart" is consumer language. "Invoice" fits B2B dealer context.
**Effort:** XS (human: ~5min / CC: ~1min)
**Status:** In TODOS.md

---

### #18 MarketCell column header disambiguation
**What:** Rename "Market" column to "Mkt Low" or add tooltip: "Lowest current Discogs listing".
**Why:** Dealers may confuse market lowest price with their own asking price.
**Effort:** XS (human: ~10min / CC: ~2min)
**Status:** In TODOS.md

---

## P5 — Infrastructure / scale

### #19 Backfill state persistence (Redis/DB)
**What:** Move in-memory backfill state to DB so it survives server restarts.
**Why:** Current state lost on Render free-tier restart mid-backfill.
**Effort:** S (human: ~1h / CC: ~10min)
**Status:** In TODOS.md. Acceptable now on single-worker.

### #20 Backfill cursor / resume for >2000 record collections
**What:** Store last-processed page so backfill can resume after interruption.
**Why:** Collections >2000 records may time out.
**Effort:** S (human: ~1h / CC: ~10min)
**Status:** In TODOS.md. Not needed until first user has >2000 records.

### #21 localStorage cart schema version
**What:** Add `version` field to cart localStorage object for future schema migrations.
**Effort:** XS (human: ~15min / CC: ~2min)
**Status:** In TODOS.md

---

## Mobile app (Capacitor iOS)
**Status:** Built — `mobile-app/` directory. iOS project generated. Awaiting Xcode install + Apple Developer account to run on device / submit to App Store.
**Next step for user:** Install Xcode → `npx cap open ios` → set Apple Developer team → build to device.
**Production backend URL:** Update `mobile-app/.env.production` before App Store build.
