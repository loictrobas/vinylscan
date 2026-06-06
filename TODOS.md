# VinylScan — TODOS

## Deferred with conditions

### Backfill state persistence (Redis/DB)
**What:** Move `_backfill_state` and `_sync_state` dicts from in-memory to a Redis key or
a `background_tasks` DB table so state survives server restarts and works across workers.
**Why:** Current in-memory state is lost if Render free-tier instance restarts mid-backfill.
Single-worker is fine now; multi-worker would lose progress.
**When:** Before scaling beyond 1 Render worker, or when backfill resume is required.
**Effort:** S (human: ~1h / CC: ~10min)
**Priority:** P3 — acceptable for current single-worker Render free tier

### Backfill cursor/resume for large collections
**What:** Store last-processed page/index so backfill can resume after interruption.
**Why:** Collections >2000 records (Discogs page limit) may time out mid-flight.
**When:** First user reports partial backfill or collection >2000 records.
**Effort:** S (human: ~1h / CC: ~10min)
**Priority:** P3 — typical collections under 2000 records

### localStorage cart schema version
**What:** Add `version` field to `vinylscan_cart` localStorage object so future schema
changes can migrate or clear stale carts gracefully.
**Why:** Schema changes to the cart object (adding fields, renaming keys) will silently
break old carts already stored in the browser.
**When:** Before next cart schema change.
**Effort:** XS (human: ~15min / CC: ~2min)
**Priority:** P2 — cheap insurance

### Test coverage: bulk-delete partial failure + backfill empty-string path
**What:** Add pytest tests for (a) `handleBulkDelete` allSettled behavior when some
deletes fail, and (b) backfill correctly updating records with `cover_image_url = ""`.
**Why:** Both edge cases were bugs fixed in this session with no regression coverage.
**When:** Next test sprint.
**Effort:** S (human: ~1h / CC: ~10min)
**Priority:** P2

### MarketCell column header disambiguation
**What:** Rename catalog/inventory column header from "Market" to "Mkt Low" or add
a tooltip clarifying this is the lowest current Discogs listing, not the user's asking price.
**Why:** Dealers may confuse market price with their own asking_price — currently visually
similar weight columns.
**When:** UX polish sprint.
**Effort:** XS (human: ~10min / CC: ~2min)
**Priority:** P3

### Rename "Add to cart" → "Add to Invoice" in POS flow
**What:** Once the POS/sales flow has a settled name, update bulk-action button label.
**Why:** "Cart" is consumer language; "Invoice" or "Sale" fits a B2B dealer tool better.
**When:** After POS flow naming is finalized.
**Effort:** XS (human: ~5min / CC: ~1min)
**Priority:** P3

### Collective intelligence lookup layer
**What:** When a user confirms a scan match, store the (cover_image_hash, discogs_release_id)
pair. Before calling Discogs search, check our own confirmed-match table first. Return
instant match with high confidence if found.
**Why:** The moat that no competitor can copy — it requires having been used. Every confirmed
scan from every user makes the product smarter for all future users.
**When:** Activate when `SELECT COUNT(*) FROM scans WHERE status IN ('manually_added','auto_added')` > 500.
**Effort:** M (human: ~2h / CC: ~15min)
**Priority:** P2 — not valuable for 1 user, extremely valuable at 100 users.

### Median pricing (price rule basis)
**What:** Add `price_rule_basis: median` option that uses Discogs median sale price instead
of lowest listing. Requires fetching `/marketplace/price_suggestions` or the price history
endpoint.
**Why:** Lowest listing is conservative — some records have 1 listing at $2 that skews the
floor. Median is a better pricing anchor for common titles.
**When:** After median endpoint is confirmed available on standard OAuth.
**Effort:** S (human: ~1h / CC: ~10min) after spike.
**Priority:** P3

### Multi-user (store employees)
**What:** Store employees can have sub-accounts under the store owner's subscription.
Each scan attributed to the employee. Owner sees all scans.
**Why:** Stores with 2+ employees scanning the same lot need their work merged.
**When:** After first paying store confirms the tool fits their workflow and explicitly
requests it.
**Effort:** L (human: ~1 day / CC: ~45min)
**Priority:** P3

### Catalog price refresh button
**What:** A "↻" icon on catalog entries where `asking_price` is null. Clicking it triggers
`GET /scan/pricing/{release_id}` and updates the record's `asking_price`.
**Why:** BackgroundTasks die if Render free-tier instance goes idle mid-flight. Without
a recovery path, null prices are permanent until the user manually edits them.
**When:** Assess at T11 (store tier). Paid Render plan = reliable background tasks = this
may be unnecessary. Build only if null prices are reported as pain by store users.
**Effort:** XS (human: ~30min / CC: ~5min)
**Priority:** P3
**Depends on:** ~~T5 (asking_price field)~~ ✓ done, T11 (store tier assessment)

### Shareable lot URLs
**What:** Public or private link to a session/lot summary. Useful for sending to buyers
("here's the lot I'm selling") or accountants.
**Why:** CSV export covers the sharing use case for now.
**When:** After store subscription tier ships and there's demand.
**Effort:** S (human: ~1h / CC: ~10min)
**Priority:** P3

## Completed

### T0: Alembic migration infrastructure
**Completed:** 2026-06-06 — async env.py, NullPool, startup retry loop, baseline migration.

### T1: Lot + Record models
**Completed:** 2026-06-06 — RecordCondition/RecordStatus enums, Lot model, Record model with condition/pricing/sold fields, DB indexes, data migration from existing scans.

### T2: Confirm → Catalog (scan confirm creates Record)
**Completed:** 2026-06-06 — _create_catalog_record() helper, BackgroundTask pricing, condition field, lot_id optional assignment.

### T3: Catalog API
**Completed:** 2026-06-06 — GET/PATCH /catalog, POST /catalog/{id}/sell, lot CRUD, price markup settings endpoint.

### T4: Catalog page
**Completed:** 2026-06-06 — /catalog with search, status/lot filters, inline price edit, sell button.

### T5: Discogs price suggestion in confirm UI
**Completed:** 2026-06-06 — MatchCard fetches /scan/pricing on mount, shows lowest price + for-sale count.

### T6: Price markup settings
**Completed:** 2026-06-06 — price_markup_pct on User, applied in background price task, settings page control.

### T7: Quick price edit from catalog
**Completed:** 2026-06-06 — click price cell → inline input → PATCH /catalog/{id}.

### T8: Mark as sold
**Completed:** 2026-06-06 — Sell button inline → POST /catalog/{id}/sell with sold_price confirmation.

### T9: Lots & sales page
**Completed:** 2026-06-06 — /catalog/lots with stock value, revenue, profit/loss per lot, create lot form.

### T14: Pytest scaffold
**Completed:** 2026-06-06 — conftest.py SQLite fixture, 3 critical path tests (confirm→Record, isolation, sell).

### T15: Cover image backfill + catalog UX rewrite
**Completed:** 2026-06-06 — `cover_image_url` column + Alembic migration, backfill endpoint with empty-string fix,
batch prices endpoint, shared components (CoverThumb/CondBadge/RowCheckbox/RecordModal), catalog + inventory full
rewrite with cover thumbnails, accessibility fixes (aria-label, 44×44 touch target), bulk-delete allSettled fix,
timer unmount cleanup, Settings "Fix missing covers" card.
