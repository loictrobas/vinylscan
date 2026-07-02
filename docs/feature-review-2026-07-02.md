# VinylScan — Review feature por feature (UI / UX / función)

**Fecha:** 2026-07-02 · **Método:** app corriendo en local (backend nuevo + frontend dev), recorrido real de cada pantalla con browser, pruebas funcionales end-to-end (venta POS, cancelación, filtros de storefront, orden público). Cero errores de consola en todo el recorrido.

Leyenda: ✅ bien · ⚠️ mejorable · 🔴 problema (los marcados **[FIXED]** ya quedaron arreglados en esta sesión).

---

## 1. Login / Auth
- ✅ Página limpia, jerarquía clara, flujo dual (email + Discogs OAuth).
- ✅ Mensajes de error diferencian "credenciales inválidas" de "sesión expirada".
- ⚠️ El footer muestra `api: <url>` — útil en dev, ruido en producción. Gate por `NODE_ENV`.
- ⚠️ Registro solo por invitación (texto "ask your administrator") — coherente con el modelo actual.

## 2. Dashboard (Home)
- ✅ KPIs correctos (revenue hoy/semana/mes, inventario, margen), gráfico 7 días, botones New sale / Scan bien ubicados.
- 🔴 **[FIXED]** Banner "Start your 14-day free trial" + "Upgrade to Pro" en sidebar se mostraban al admin (dueño). Ahora ocultos para `is_admin`.
- ✅ Empty states correctos cuando no hay datos.

## 3. Scan (desktop) — el corazón de la app
- ✅ Flujo phone→desktop con SSE + replay buffer: un scan hecho con la pestaña cerrada aparece al abrir.
- ✅ Condición por defecto configurable, atajos de teclado (add / S skip), barcode, multi-foto (enhance).
- 🔴 **[FIXED]** Con el panel debug de admin activo, el grid de 2 columnas (contenido + 320px) no colapsaba en anchos < xl → el panel pisaba el título del disco. Ahora colapsa a 1 columna.
- ⚠️ Imagen del scan pendiente rota (era de `/tmp`, borrada por un reinicio) — exactamente el problema que arregló mover imágenes a `backend/data/`. Los scans nuevos no lo sufren.
- ⚠️ `ScanInterface` ya partido en módulos (`components/scan/`), pero el componente principal (~860 líneas) todavía admite extraer un hook `useScanQueue` en una pasada futura.

## 4. Catálogo (Records)
- ✅ Tabla completa: market price vs tu precio, cond. con badges, filtros (In stock/Sold/All/Unlinked), búsqueda, Auto-price, export CSV, New record manual.
- 🔴 **[FIXED]** Sidebar marcaba "Records" activo también en /catalog/lots y subrutas (match por prefijo). Ahora match exacto.
- ⚠️ Miniaturas: todos los discos de prueba muestran ícono genérico — los importados de Discogs no siempre traen `cover_image_url`. Vale un backfill batch desde Discogs (release details ya se piden al confirmar).

## 5. Lots
- ✅ Empty state con CTA claro. Detalle con breakdown por condición, prorrateo de costo, profit.
- ⚠️ Sin probar con volumen (0 lots en datos de prueba).

## 6. Consignments
- ✅ Página con métricas (on floor / sold / owed / outstanding) y "all clear" — buen resumen operativo.
- ✅ Payout parcial y estados por consignor.

## 7. Accessories
- ✅ CRUD con stock real (a diferencia de discos 1-of-1). Integrado al storefront y al carrito público.

## 8. Point of Sale
- ✅ Excelente: buscar → carrito → precio editable → descuento → método de pago → recibo. Rápido y sin fricción, ideal mostrador.
- 🔴 **[FIXED]** El método de pago (cash/card/transfer) se elegía en UI pero el backend lo descartaba — imposible reportar efectivo vs tarjeta. Ahora: columna `records.payment_method` (migración `v2w3x4y5z6a7`), se persiste al vender, se limpia al cancelar, visible en historial + export CSV.
- ⚠️ El descuento se aplica al total pero no se persiste por ítem — el sold_price guardado es el precio sin descuento repartido. Si querés contabilidad exacta, repartir descuento pro-rata en sold_price.

## 9. Sales history
- ✅ Orden por columnas, búsqueda, export CSV, margen con tooltip cuando falta cost price, Cancel con confirmación.
- ✅ **[NUEVO]** Columna Payment.
- 🔴 **[FIXED]** Fechas en leads/orders salían en locale del browser (francés) con UI en inglés. Unificado a en-US como el resto.

## 10. Sell/Trade Leads + Storefront Orders
- ✅ Ambas persisten y muestran los envíos del storefront con estados. Email de aviso con fallback si el contacto no es email.
- ⚠️ Orders: no hay acción de estado (completado/cancelado) — un pedido retirado queda igual que uno nuevo. Vale un campo `status` como el de leads.
- ⚠️ Cancelar un pedido no re-lista el disco deslistado por la reserva — hoy es manual (relistar desde catálogo). Documentado; si molesta, botón "cancelar pedido y relistar".

## 11. My store (settings + theme)
- ✅ Checklist de setup (3/6 done) + live preview del storefront embebido — de lo mejor de la app.
- ✅ Undo history de settings, generación de tema por AI (admin), i18n de 6 idiomas.

## 12. Storefront público
- ✅ Tema oscuro custom aplicado, hero, carousels, carrito, checkout pickup con WhatsApp/email.
- ✅ **[NUEVO]** Paginación server-side + facetas + búsqueda con debounce + "Ver más" — verificado en vivo (filtro Trip Hop: 2 de 2 correctos).
- 🔴 **[FIXED]** Bug de facetas recién introducido (producto cartesiano en la query → contaba 2176 en vez de 8). Cazado en esta misma review, corregido con `with_only_columns`.
- ⚠️ Hero tiles vacíos sin cover images (mismo tema del backfill de covers).

## 13. Admin (users / eval / benchmark)
- ✅ Tabla de usuarios con créditos/records/status, invites, eval dashboard y benchmark separados.

## 14. Mobile web (/mobile/*)
- ✅ Home con credits + quick actions, bottom tabs, "switch to desktop view". Limpio en 375px.

## 15. App iOS (Capacitor) — revisión de código (sin device)
- ✅ Fast-ack uploads, override de server URL en runtime, historial espejo del desktop.
- ✅ **[NUEVO]** Cola offline con reintento automático y encadenado de "same record".
- ⚠️ `DEV_TOKEN` en App.tsx sigue en el código (ya no en .env) — quitar antes de release.
- ⚠️ Cola offline es en memoria: sobrevive cortes de red, no un kill de la app (limitación documentada; solución completa = plugin Filesystem).

---

## Deuda restante (priorizada)

1. **Seguridad (Fase 1 del reporte anterior)** — pospuesta a pedido del usuario. Sigue siendo lo primero antes de cualquier deploy público.
2. Backfill de cover images para records sin `cover_image_url`.
3. Estado en Storefront Orders (nuevo → retirado/cancelado) + relist al cancelar.
4. Descuento POS pro-rata en sold_price.
5. Extraer hook `useScanQueue` del ScanInterface principal.
6. Quitar `DEV_TOKEN` del mobile App.tsx.
7. Render sigue con código viejo — deploy cuando quieras que el teléfono use todo esto.
