# Changelog

All notable changes to VinylScan are documented here.
Format: [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).

---

## [0.2.0] — 2026-06-06

### Added
- **Cover image backfill** — `POST /discogs/backfill-covers` background task fetches
  entire Discogs collection once, builds release_id→URL map, bulk-updates all records
  missing `cover_image_url` in a single DB transaction.
- **Batch prices endpoint** — `GET /discogs/prices?release_ids=...` fetches Discogs
  marketplace stats for up to 50 releases concurrently (semaphore=5, 0.3 s delay).
- **Settings "Fix missing covers" card** — trigger and poll backfill from the UI;
  shows idle / running (progress bar) / done (count updated) / error states.
- **Shared React components** — `CoverThumb`, `CondBadge`, `RowCheckbox`, `RecordModal`
  extracted to `frontend/components/` for reuse across catalog and inventory.
- **Cover thumbnails in catalog + inventory** — album art visible in every row.
- **Condition badges** — `CondBadge` with dashed-border unverified visual + `aria-label`
  for screen-reader accessibility.
- **Alembic migration** `a1b2c3d4e5f6` — adds `cover_image_url` column to `records`.

### Changed
- Discogs sync now prefers `cover_image` over `thumb` (higher resolution, fewer empty strings).
- Backfill queries `cover_image_url IS NULL OR cover_image_url = ''` to catch empty strings
  written by earlier sync code.
- Catalog + inventory bulk delete uses `Promise.allSettled` (partial failure safe) with
  per-item confirmation of deleted IDs and alert on partial failure count.
- Bulk add-to-lot clears selection and reloads after `Promise.allSettled`.
- POS/sales page reads `vinylscan_cart` from localStorage for pre-populated cart from bulk
  catalog select.

### Fixed
- `RecordModal` auto-save timer leaked on unmount — added `useEffect` cleanup to cancel
  pending `setTimeout` preventing ghost PATCH requests and React unmount warnings.
- `RowCheckbox` hit area expanded to 44×44 px via `before:inset-[-10px]` pseudo-element
  without breaking table layout.

---

## [0.1.0] — 2026-06-06

Initial release: scan → catalog → sell pipeline.

- Discogs OAuth1 connect, collection sync, bidirectional push
- Record catalog with condition, lot assignment, price markup
- Lot + sales page with revenue/profit tracking
- Discogs price suggestion in confirm modal
- Alembic migrations, pytest scaffold
