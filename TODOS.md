# VinylScan — TODOS

## Deferred with conditions

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
