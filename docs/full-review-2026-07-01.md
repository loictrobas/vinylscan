# VinylScan — Revisión completa de código (auditoría de solo lectura)

**Fecha:** 2026-07-01
**Alcance:** working tree actual (incluye cambios sin commitear), `backend/`, `frontend/`, `mobile-app/`.
**Método:** lectura del código real (no suposiciones). Cada hallazgo incluye archivo:línea y fix recomendado.

---

## Resumen ejecutivo — Top 10 problemas por impacto

| # | Severidad | Problema | Ubicación |
|---|-----------|----------|-----------|
| 1 | CRÍTICO | **Secretos de Cloudinary hardcodeados y commiteados** (`api_key` + `api_secret` como valores por defecto en el código). Cualquiera con acceso al repo puede usar/abusar la cuenta. | `backend/routers/store.py:34-35` |
| 2 | CRÍTICO | **Backdoor de admin sembrado en cada arranque.** `_seed_admin()` crea/re-fuerza `loictrobas1@gmail.com` / `loicisadmin` como `is_admin=True` en CUALQUIER entorno salvo que se sobrescriban dos env vars. Credenciales conocidas → toma total de la instancia. | `backend/main.py:49-89` |
| 3 | CRÍTICO | **`SECRET_KEY` con default inseguro** (`"change-me-in-production"`). Si la env var no está puesta, el atacante conoce la clave de firma JWT → puede forjar tokens de cualquier usuario. Además la clave Fernet (cifrado de tokens Discogs) se **deriva del mismo SECRET_KEY**, ignorando la `ENCRYPTION_KEY` documentada. | `backend/middleware/auth_middleware.py:7-17` |
| 4 | CRÍTICO | **Checkout público sin validación de precios ni de propiedad.** `place_order` confía en `total` e `items[].price` enviados por el cliente y no valida que los IDs pertenezcan a esa tienda ni que estén en stock. Un cliente puede "comprar" a precio arbitrario. | `backend/routers/store.py:752-772` |
| 5 | ALTO | **Sin rate limiting en ningún endpoint** (login, register, reset-password, formularios públicos `sell-trade`/`order`). Brute-force de contraseñas y spam/DoS triviales. | `backend/routers/auth.py:308`, `store.py:701,752` |
| 6 | ALTO | **Webhook de Stripe sin idempotencia.** Reentregas de eventos (Stripe reintenta) vuelven a sumar créditos / re-procesan. La firma sí se valida. | `backend/routers/billing.py:103-199` |
| 7 | ALTO | **Confirmar escaneo desde el móvil está roto.** El cliente móvil envía `discogs_release_id` pero el backend exige `release_id` → 422 siempre. | `mobile-app/src/lib/api.ts:153-157` vs `backend/schemas.py:119` |
| 8 | ALTO | **Endpoint `find-discogs` roto + llamada frontend a endpoint inexistente.** `search_releases` devuelve una tupla `(lista, int)`; el router la itera como si fuera lista → excepción. Y `api.checkDuplicate` llama a `/catalog/check-duplicate`, que no existe en el backend. | `backend/routers/catalog.py:934-942`, `frontend/lib/api.ts:932` |
| 9 | MEDIO | **Condición de carrera en créditos.** `_deduct_credit` y `apply_monthly_topup` hacen read-modify-write no atómico; escaneos concurrentes pueden descontar de menos/de más. | `backend/routers/scan.py:74-83`, `auth.py:76-100` |
| 10 | MEDIO | **Tareas de fondo fire-and-forget sin seguimiento.** `asyncio.create_task(_process_scan_async...)` no se awaitea ni se guarda referencia; en reinicio/GC se pierden y las excepciones se tragan. Imágenes en `/tmp` se pierden al reiniciar. | `backend/routers/scan.py:739,770`, `main.py:16` |

---

## Pilar 1 — Seguridad

### CRÍTICO

- **Secretos Cloudinary hardcodeados** — `backend/routers/store.py:34-35`. `CLOUDINARY_API_KEY` y `CLOUDINARY_API_SECRET` tienen valores reales como default en el código fuente commiteado. **Fix:** eliminar los defaults (`os.getenv(...,"")`), rotar el secreto en Cloudinary de inmediato, mover a env var. Considerar `git filter-repo` para purgar del historial.

- **Backdoor de super-admin** — `backend/main.py:49-89`. En cada arranque se garantiza un admin con contraseña conocida y `is_admin=True` (incluso reactiva cuentas deshabilitadas). **Fix:** ejecutar el seed solo si `DEV_MODE` o mediante un flag explícito `SEED_ADMIN=true`; nunca con contraseña por defecto en prod; no forzar `is_active=True`.

- **`SECRET_KEY` default + cifrado derivado del mismo** — `backend/middleware/auth_middleware.py:7-17`. Con el default, los JWT son falsificables y los tokens OAuth de Discogs quedan cifrados con una clave pública conocida. La `ENCRYPTION_KEY` mencionada en CLAUDE.md/render.yaml **no se usa**. **Fix:** fallar el arranque (`raise`) si `SECRET_KEY` no está en entorno no-dev; usar una `ENCRYPTION_KEY` independiente para Fernet.

- **Checkout público manipulable** — `backend/routers/store.py:752-772`. **Fix:** recalcular `total` en el servidor a partir de los `asking_price`/`price` reales de los items de esa tienda; validar `Record.user_id == store_user.id` y `status == in_stock` / `stock_quantity > 0` para cada item; ignorar el precio del cliente.

### ALTO

- **Sin rate limiting** — `auth.py:308` (login), `:329` (register), `:410` (reset), `store.py:701/752` (formularios públicos). **Fix:** `slowapi`/reverse-proxy con límites por IP; captcha en formularios públicos.

- **JWT: expiración larga y sin revocación** — `auth_middleware.py:9` (30 días). El algoritmo está bien fijado (`algorithms=["HS256"]`, sin confusión de alg). Pero `logout` solo borra la cookie (`auth.py:222-233`); el token en `localStorage` sigue válido 30 días. **Fix:** reducir expiración + refresh tokens, o lista de revocación (jti) / rotación de `SECRET_KEY` por usuario.

- **Token JWT en query string de SSE** — `scan.py:153-167` (`/scan/stream?token=`). Puede quedar en logs de proxies/accesos. Se usa `print()` con `user.id` en varias líneas (`scan.py:346,350`). **Fix:** aceptar el token por header cuando sea posible; usar tokens efímeros de corta vida para el stream; sustituir `print` por logger sin secretos.

### MEDIO / BAJO

- **CORS**: `allow_credentials=True` con regex de LAN abierta en `DEV_MODE` (`main.py:96-110`). Aceptable solo en dev; verificar que `DEV_MODE=false` en Render (render.yaml lo fija, bien).
- **`save-image` (eval) no valida propiedad** — `eval_router.py:171` selecciona el `Scan` por id sin filtrar `user_id`, pese a que el docstring afirma lo contrario. Es admin-only, riesgo bajo. **Fix:** filtrar por el admin actual o documentar que es cross-user a propósito.
- **Aislamiento multi-tenant: correcto en general.** Todas las queries de `catalog`, `consignments`, `accessories`, `discogs`, `store/leads`, `store/orders` filtran por `user_id`/`store_user.id`. No se detectó IDOR en endpoints de usuario.
- **Subida de imágenes**: valida `content_type` y tamaño (`scan.py:220`, `store.py:312-317`), nombres con `uuid4` (sin path traversal). Bien. `_load_image_bytes` (`scan.py:1193`) hace `requests.get` a URLs de Discogs — SSRF acotado a Discogs, riesgo bajo.
- **SQL injection**: no hay SQL crudo; todo vía ORM parametrizado. OK.
- **XSS**: `store_theme_config` se parsea con `JSON.parse` y se aplica vía objetos `style` de React (`app/store/[slug]/page.tsx:634`), que no permiten inyección de CSS arbitrario. `dangerouslySetInnerHTML` solo en `layout.tsx:46` con contenido estático. Riesgo bajo.

---

## Pilar 2 — Datos e integridad

- **MEDIO — Tipos de dinero inconsistentes.** `Record.*_price` usa `Numeric(10,2)` (correcto), pero `Lot.purchase_price`, `User.price_markup_pct`, `Consignor.default_commission_pct`, `Record.consignor_commission_pct` son `Float` (`models.py:149,65,231,197`). El importe adeudado al consignatario se calcula en float (`catalog.py:834`). **Fix:** migrar campos monetarios/porcentajes a `Numeric`.
- **MEDIO — `Order.items` es JSON sin esquema** (`models.py:289`) y `place_order` los persiste tal cual. Sin validación de forma más allá de Pydantic de entrada.
- **MEDIO — Sin decremento de stock en storefront.** `place_order` no marca `Record` como vendido ni descuenta `Accessory.stock_quantity`; permite sobreventa. Puede ser intencional (retiro en tienda), pero no hay ningún control ni nota de reserva.
- **MEDIO — Condiciones de carrera** (ver Top 10 #9): créditos, topup mensual, y `confirm_scan`/`sell_record` sin bloqueo optimista. Doble-confirm se protege por chequeo de `status` pero no es atómico.
- **BAJO — Búsqueda sin índice adecuado.** `list_catalog` usa `ilike('%term%')` sobre `artist`/`title` (`catalog.py:668-670`) sin índice trigram → scans completos en catálogos grandes.
- **Migraciones Alembic:** un único head (`813d1e678c0e`), sin ramas divergentes. Corren al arranque con reintentos (`main.py:31-46`). Bien. Verificar que el modelo `theme_history`/`settings_history` (JSON en `User`) tenga migración correspondiente.
- **Cascadas:** `RecordEvent`, `Consignor`, `Accessory`, `Order`, `SellTradeLead` usan `ondelete="CASCADE"`; `Record.consignor_id` usa `SET NULL` (bien). `Scan`/`Record`/`Lot` FK a `users.id` **sin** `ondelete` → borrar un usuario fallaría por FK (probablemente no ocurre en la práctica).

---

## Pilar 3 — Funcionalidades core / correctitud

- **ALTO — `find-discogs` roto** (`catalog.py:934-942`): `search_releases` retorna `(list, int)`; el código itera la tupla y hace `DiscogsMatch(**m)` → excepción. Además no llama a `parse_search_results`, así que los dicts no tienen la forma esperada. **Fix:** `raw, _ = await search_releases(...)` y `matches = [DiscogsMatch(**m) for m in parse_search_results(raw)]`.
- **ALTO — Confirmar desde móvil roto** (`mobile-app/src/lib/api.ts:156`): envía `discogs_release_id`; el schema exige `release_id`. **Fix:** renombrar la clave del body a `release_id`.
- **Manejo de fallos de Claude/Discogs:** razonable. `identify_record` reintenta 1 vez ante JSON inválido (`claude_vision.py:95-98`); fallos de Discogs se capturan y devuelven lista vacía (`scan.py:308-310`). Timeouts en `requests` (10–20s) presentes. Bien.
- **MEDIO — SSE fugas/memoria:** las colas son `asyncio.Queue()` sin límite (`sse.py:23`), así que `put_nowait` nunca lanza `QueueFull` — el `except QueueFull` es código muerto y un consumidor lento crece sin cota. El buffer `_recent` es por-usuario en memoria (se pierde al reiniciar; multi-worker no comparte estado). **Fix:** `Queue(maxsize=N)`; para prod multi-worker, mover a Redis pub/sub.
- **POS/ventas:** `sell_record`/`unsell_record` consistentes; recalculan payout de consignatario. `place_order` (ver Pilar 1/2). Estados de `Scan` bien controlados con enum.

---

## Pilar 4 — Arquitectura backend

- **Duplicación grande en `scan.py`:** cuatro bloques casi idénticos — `upload_scan`/`_process_scan_async` y `enhance_scan`/`_process_enhance_async` (~120 líneas repetidas). **Fix:** extraer un helper común `_analyze_and_persist(scan, images, user, db)`.
- **`asyncio.create_task` vs `BackgroundTasks`:** los endpoints `-mobile` usan `create_task` sin retener referencia (`scan.py:739,770`) → riesgo de GC y excepciones silenciadas. Otros usan `background_tasks.add_task` (mejor). Unificar.
- **Logging inconsistente:** mezcla de `print(...)` (SSE) y `logger`. Sin handler de excepciones global de FastAPI.
- **Imports dentro de funciones** por todos lados (`import requests`, `import asyncio`, `from ... import ...`) — estilo; mover a nivel de módulo.
- **Config sin defaults seguros:** además de `SECRET_KEY`, `DATABASE_URL` cae a localhost (`database.py:5`) y `STRIPE_*`/`RESEND_API_KEY` vacíos (degradan en silencio, aceptable). El código deriva Fernet de SECRET_KEY pero render.yaml genera una `ENCRYPTION_KEY` que nunca se usa → confusión.
- **Estado en memoria por proceso:** `_sync_state`, `_backfill_state`, `_request_token_store`, caché de precios, buffer SSE — todo se rompe con múltiples workers/instancias. Documentado como "usar Redis" en un caso.

---

## Pilar 5 — Frontend

- **`lib/api.ts` (1239 líneas):** manejo de errores razonable (`apiFetch` con timeout, retry en cold-start, redirección a `/login` en 401 con limpieza de token/cache). Los endpoints de subida (FormData) duplican el manejo de 401 en vez de reusar `apiFetch`.
- **ALTO — llamada muerta/rota:** `api.checkDuplicate` → `/catalog/check-duplicate` no existe en el backend (`lib/api.ts:932`). **Fix:** eliminar o implementar; el reemplazo real parece ser `ownedReleaseIds`.
- **Token en `localStorage`** (`lib/api.ts:525-538`): expuesto a XSS. Es un trade-off deliberado por cross-domain (API en Render, front en Vercel); se setea también cookie httpOnly. Aceptable pero documentarlo y minimizar superficie XSS.
- **`ScanInterface.tsx` (2191 líneas):** monolito con ~30 `useState/useEffect`. **Fix:** descomponer en `useScanQueue` (hook), `ScanResultCard`, `MatchList`, `ConditionPicker` (ya existe), `EnhancePhotos`. Alta prioridad de mantenibilidad.
- **Duplicación desktop vs `/mobile/`:** `app/catalog` vs `app/mobile/catalog`, `app/scan` vs `app/scan/mobile`, etc. Lógica de datos replicada. **Fix:** compartir hooks/componentes de datos, dejar solo la capa de presentación divergente.
- **Estados de carga/error:** existen `app/error.tsx` y varios `loading.tsx` (nuevos, sin commitear). Bien.

---

## Pilar 6 — Mobile app

- **ALTO — confirm roto** (ver arriba, `mobile-app/src/lib/api.ts:156`).
- **Sin manejo offline:** el desktop tiene `lib/offline.ts` (cola offline); el móvil no tiene equivalente pese a ser el que dispara fotos en campo con red intermitente. **Fix:** cola local + reintento.
- **Token en `localStorage`** del WebView (`api.ts:27-35`): aceptable en app nativa.
- **`DEV_TOKEN` en `App.tsx:18`** sobrescribe el token en cada arranque si está presente — ya mitigado (removido del `.env`), pero el código sigue ahí. Quitar antes de release.
- **Duplicación de tipos/cliente** con `frontend/lib/api.ts` (definiciones paralelas de `ScanResult`, `PendingScan`). **Fix:** paquete compartido de tipos si se quiere invertir.

---

## Pilar 7 — Performance

- **MEDIO — Storefront público sin paginación** (`store.py:626-698`): carga TODOS los records `in_stock + store_listed` y accesorios de una tienda en una sola respuesta. Tiendas grandes → payload y render lentos. **Fix:** paginar / lazy-load.
- **MEDIO — Búsqueda de catálogo sin índice** (ver Pilar 2).
- **BIEN — sin N+1 evidentes:** `list_users`, `list_lots`, `list_consignors` usan agregaciones batinizadas con `group_by`. `batch_prices` usa `Semaphore(5)`. Los list endpoints paginan (`catalog`, `scan/history`).
- **Imágenes:** en dev vía `/tmp` servidas por FastAPI StaticFiles (sin CDN); en prod R2. Cloudinary para logos/banners/accesorios. Aceptable.

---

## Pilar 8 — Infra / deploy

- **CRÍTICO — secreto commiteado** (Cloudinary, Pilar 1). `.env` reales NO están en git (solo `.env.example`), bien; pero el secreto en código anula eso.
- **Imágenes en `/tmp`** (`main.py:16`, `scan.py:37`): se pierden al reiniciar el contenedor. En Render sin R2 configurado, todas las imágenes de escaneo desaparecen en cada deploy. **Fix:** exigir R2 en prod.
- **Paridad dev/prod rota** (documentado en CLAUDE.md): phone→Render, desktop→localhost usan DBs distintas → el flujo SSE phone→desktop no funciona salvo que ambos apunten al mismo backend.
- **Sin backups automatizados** (Render free `plan: free` DB). Riesgo de pérdida de datos.
- **Migraciones en prod:** corren al arranque (`lifespan`), lo cual puede causar carreras si escalan a >1 instancia simultánea. **Fix:** job de migración separado del arranque de la web.

---

## Pilar 9 — Calidad AI / evals

- **Parsing de salida de Claude frágil pero acotado:** `_extract_json` (`claude_vision.py:50-54`) hace regex sobre fences y `json.loads`; `identify_record` reintenta 1 vez ante error de parseo (no ante errores de API). `visual_match` degrada a "none" si no parsea. Aceptable.
- **`adapters.py`:** limpio; mapea `flat` y `v3` con `_val()` para objetos de confianza. `adapt` lanza si el schema es desconocido (bien). El registry tiene `v3-literal` activo.
- **Harness de eval:** endpoints admin-only correctos (`eval_router.py` con `require_admin`). Dataset/resultados en disco (`eval/`), se pierden si el FS es efímero (Render). **Fix:** persistir resultados en DB o R2 si se quiere histórico en prod.
- **Cobertura:** el pipeline de estrategias de Discogs es sofisticado y ya registra outcomes por estrategia (`SearchStrategyOutcome`) — buena base de datos para medir precisión real.

---

## Pilar 10 — Tests y CI

- **Existe base mínima:** `tests/conftest.py`, `tests/test_critical_paths.py` (confirm→record, aislamiento de catálogo, sell), `tests/test_discogs_marketplace.py`. No se detectó configuración de CI (sin `.github/workflows`).
- **Los 5 tests de mayor valor a añadir primero:**
  1. **Autorización/tenant:** que usuario A no pueda leer/editar/borrar records, lots, consignors, accessories, leads y orders de usuario B (IDOR regression).
  2. **Checkout público seguro:** que `place_order` recalcule el total en servidor y rechace items ajenos/sin stock (cubre Top 10 #4 una vez arreglado).
  3. **Créditos:** deducción atómica en escaneos concurrentes y topup mensual idempotente.
  4. **Webhook Stripe idempotente:** reentrega del mismo evento no duplica créditos.
  5. **Contrato móvil↔backend:** que el payload de confirm del móvil sea aceptado (cubre Top 10 #7) — test de contrato sobre `ConfirmRequest`.

---

## Plan de mejoras priorizado

### Fase 1 — Seguridad crítica (hacer YA)
| Ítem | Esfuerzo |
|------|----------|
| Rotar y eliminar secretos Cloudinary hardcodeados; purgar del historial git | S |
| Exigir `SECRET_KEY` en entorno (fallar arranque si falta); usar `ENCRYPTION_KEY` separada para Fernet | S |
| Eliminar el seed de admin con contraseña por defecto en prod (gate por flag/DEV_MODE) | S |
| Validar `place_order` en servidor (recalcular total, verificar propiedad y stock) | M |
| Rate limiting en login/register/reset y formularios públicos + captcha | M |
| Idempotencia en webhook Stripe (tabla de `event_id` procesados) | S |

### Fase 2 — Correctitud / integridad de datos
| Ítem | Esfuerzo |
|------|----------|
| Arreglar `find-discogs` (tupla) y eliminar `checkDuplicate` muerto | S |
| Arreglar confirm del móvil (`release_id`) | S |
| Deducción de créditos atómica (UPDATE ... SET credits = credits - 1 con guardas) | M |
| Migrar campos monetarios/porcentajes de `Float` a `Numeric` | M |
| Decidir y aplicar política de stock en storefront (reserva o marcado vendido) | M |

### Fase 3 — Robustez / infra
| Ítem | Esfuerzo |
|------|----------|
| Exigir R2 en prod; dejar de servir imágenes desde `/tmp` | S |
| Mover migraciones a job separado del arranque web | S |
| Estado compartido (SSE, sync, tokens OAuth) a Redis para multi-worker | L |
| Colas SSE con `maxsize`; reemplazar `print` por logger sin secretos | S |
| Backups automáticos de la base de datos | S |

### Fase 4 — Mantenibilidad / performance
| Ítem | Esfuerzo |
|------|----------|
| Descomponer `ScanInterface.tsx` (2191 líneas) en hooks + subcomponentes | L |
| Deduplicar los 4 bloques de análisis en `scan.py` | M |
| Paginación en storefront público + índice trigram para búsqueda de catálogo | M |
| Compartir tipos/cliente entre frontend y mobile; deduplicar rutas desktop/mobile | L |
| Cola offline en la app móvil | M |

### Fase 5 — Calidad / tests / CI
| Ítem | Esfuerzo |
|------|----------|
| Añadir los 5 tests prioritarios (Pilar 10) | M |
| Configurar CI (pytest + typecheck front) en cada PR | S |
| Persistir resultados de eval fuera del FS efímero | M |

**Leyenda de esfuerzo:** S = pequeño (<0.5 día) · M = medio (0.5–2 días) · L = grande (>2 días).
