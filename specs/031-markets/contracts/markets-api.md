# Contrato del API: Sedes (markets)

**Feature**: 031-markets · **Modelo**: [data-model.md](../data-model.md)

Los errores siguen la forma existente: `{ error: string, message: string, ...detalle }`. "Nuevo", "Cambia" y "Se elimina" se refieren al API actual. No hay compatibilidad hacia atrás (D12).

---

## A. App: cliente y portero

### A1. `GET /markets` · Nuevo

Requiere autenticación. Lista las sedes `enabled`, ordenadas por nombre.

```json
200 { "markets": [ { "id": "…", "name": "Medellín", "countryId": "…", "timeZone": "America/Bogota" } ] }
```

### A2. `GET /zones?marketId=` · Cambia (antes `?cityId=`)

Devuelve las zonas activas de la sede.

| Código | Cuándo |
|---|---|
| `200` | `{ zones: [{ id, name, slug, geometry, displayOrder }] }` |
| `404 market_not_found` | La sede no existe o no está `enabled` |
| `404 no_zones_configured` | La sede no tiene zonas activas |

### A3. `GET /locations/cities?q=` · Cambia: solo municipios para facturación

| Código | Cuándo |
|---|---|
| `200` | `{ cities: [{ id, name, stateName }] }`, hasta 15 resultados, solo municipios con DANE válido |
| `200 { cities: [] }` | `q` vacío |

Se eliminan `region` y `hasZones` de la respuesta.

### A4. Cotización y configuración: `GET /goalkeeper-requests/config`, `POST /goalkeeper-requests/quote` · Cambia

| Código | Cuándo |
|---|---|
| `400 location_not_covered` | El punto no está en ninguna zona, o está en una zona de una sede `draft` (sin cambio) |
| `409 market_unavailable` | **Nuevo.** El punto está en una zona inactiva, o en una zona de una sede `disabled`. Lleva `{ marketName }` |
| — | `time_zone_not_configured` **se elimina** |

En las respuestas, el área se describe como `market: { id, name }` en vez de `city`.

### A5. `POST /goalkeeper-requests/bookings` (confirmar) · Cambia

| Código | Cuándo |
|---|---|
| `409 market_unavailable` | La sede dejó de estar `enabled` entre la cotización y la confirmación (FR-011) |

### A6. Registro de portero · Cambia

**`PATCH /goalkeepers/me/availability`**
- Cuerpo: `{ marketId, zoneIds }`, antes `cityId`.
- Errores:
  - `invalid_market`: la sede no existe o no está `enabled`;
  - `invalid_zones`: `{ invalidZoneIds }`.

**`PATCH /goalkeepers/me/billing`** · Nuevo
- Cuerpo: `{ cityId?, address?, addressComplement? }`. Guarda en borrador, campo por campo, como las otras secciones.
- Errores:
  - `invalid_city`: el municipio no existe o no tiene DANE;
  - `validation_error`.

**`GET /goalkeepers/me`**
- La respuesta incluye `billing: { cityId, cityName, stateName, address, addressComplement }` y `availability: { marketId, marketName, zoneIds }`.

**`POST /goalkeepers/me/activate`**
- Error nuevo: `incomplete_registration` con `missing: ['billing']` cuando falta municipio o dirección.

### A7. Perfil del portero activo · Cambia y nuevo

**`PUT /goalkeepers/me/profile/availability`** · Cambia
- Cuerpo: `{ zoneIds }`. Solo cambia zonas dentro de la sede actual.
- Si el cuerpo trae un `marketId` distinto del actual: `409 use_market_change`.

**`PUT /goalkeepers/me/profile/billing`** · Nuevo
- Cuerpo: `{ cityId, address, addressComplement }`.
- Respuesta: `200` con el perfil.

**`POST /goalkeepers/me/market-change`** · Nuevo (FR-025 a FR-028)
- Cuerpo: `{ marketId, zoneIds }`.

| Código | Cuándo |
|---|---|
| `200` | Perfil actualizado: `{ goalkeeper }` |
| `409 same_market` | La sede destino es la actual |
| `409 market_not_available` | La sede destino no existe o no está `enabled` |
| `400 invalid_zones` | `{ invalidZoneIds }` |
| `409 pending_bookings` | `{ bookings: [{ id, startsAtLocal, zoneName }] }` |
| `409 balance_not_zero` | `{ balance, currency }`. Solo si cambia el país |
| `409 deposit_pending` | `{ depositId }`. Solo si cambia el país |
| `409 account_closure_open` | Solo si cambia el país |

### A8. Depósitos · Cambia por dentro

`GET /goalkeepers/me/operating-balance/deposit-options` y `POST …/deposits` resuelven el proveedor por la sede del portero: primero el de la sede, si no el del país (FR-032). La forma de la respuesta no cambia.

---

## B. Admin: alcance

### B1. Header `X-Scope` · Nuevo

| Valor | Significado |
|---|---|
| `all` | Todo lo que el miembro tiene permitido |
| `country:<countryId>` | Un país |
| `market:<marketId>` | Una sede |

- Sin header: se usa el alcance más amplio del miembro.
- Va en todas las rutas `/admin/*` excepto `/admin/me*`.

| Código | Cuándo |
|---|---|
| `400 invalid_scope` | El valor está mal formado |
| `404 scope_not_found` | El país o la sede no existen |
| `403 scope_denied` | El miembro no tiene ese alcance. Se registra como `denied` en la auditoría |

**Nivel de cada ruta** (FR-034), declarado en `createAdminRouting`:

| Nivel | Rutas |
|---|---|
| `market` | `/admin/requests*`, `/admin/cases*`, `/admin/zones*`, `/admin/rental-rates*`, `/admin/booking-settings/markets/*`, `/admin/commissions*`, `/admin/unverified-discounts*`, `/admin/pricing/*`, `/admin/readiness`, `/admin/dashboard*`, `/admin/markets/:id*` |
| `country` | `/admin/goalkeepers*` (incluye `/:userId/withdrawals`, la validación y la verificación), `/admin/goalkeeper-registrations*`, `/admin/operating-balances*`, `/admin/deposits*`, `/admin/invoicing/documents*`, `/admin/account-closures*`, `/admin/tax-settings/*`, `/admin/booking-settings/countries/*`, `/admin/payment-gateways*`, `/admin/invoicing/settings/*` |
| `platform` | `/admin/staff*`, `/admin/roles*`, `/admin/audit-log*`, `/admin/countries*`, `/admin/regions*`, `/admin/cities*` (municipios), `/admin/catalogs*`, `/admin/system*`, `/admin/access-settings`, `/admin/users*`, `/admin/notifications*` |

**Comportamiento por nivel:**
- **`market`:** filtra por la sede seleccionada o por las sedes permitidas del país seleccionado. Cada fila trae `market: { id, name }`.
- **`country`:** filtra por el país. Acepta `?marketId=` opcional dentro de las sedes permitidas. Un miembro con alcance solo de sede ve únicamente datos atribuidos a sus sedes (FR-042, FR-043).
- **`platform`:** ignora el header.

**Detalle por id (FR-038):** se valida contra los alcances del miembro, no contra el header. Si no tiene acceso, responde `404 not_found`.

**Montos con `X-Scope: all`:** las rutas de país con totales responden `{ countries: [{ countryId, currency, totals… }] }` y nunca suman entre monedas (FR-036).

### B2. `GET /admin/me/scopes` · Nuevo

Sin permiso propio (cualquier miembro activo).

```json
200 { "platform": false,
      "countries": [ { "id": "…", "name": "Colombia", "currency": "COP", "full": true,
                       "markets": [ { "id": "…", "name": "Medellín", "status": "enabled" } ] } ] }
```

`full: false` indica que el miembro solo tiene algunas sedes de ese país.

---

## C. Admin: sedes

| Ruta | Permiso | Nivel | Cuerpo y respuesta | Errores |
|---|---|---|---|---|
| `GET /admin/markets` | `markets.read` | market | `?status=`. Lista `{ id, name, country, status, zoneCount, readiness: { ready, missingCount } }` | |
| `GET /admin/markets/:id` | `markets.read` | market | Sede, `enabled*`/`disabled*` y `revision` | `404` |
| `POST /admin/markets` | `markets.manage` + alcance de país o plataforma | country | `{ name, countryId, timeZone }` → `201 { marketId }` | `country_not_found`, `country_without_currency`, `invalid_time_zone`, `market_name_taken`, `scope_denied` |
| `PATCH /admin/markets/:id` | `markets.manage` | market | `{ revision, name?, timeZone? }` | `stale`, `market_name_taken`, `invalid_time_zone`, `country_immutable` si llega `countryId` |
| `POST /admin/markets/:id/enable` | `markets.lifecycle` + alcance de país o plataforma | country | `{ revision }` | `not_ready` + `{ items }` (los faltantes del readiness), `already_enabled`, `stale` |
| `POST /admin/markets/:id/disable` | `markets.lifecycle` + alcance de país o plataforma | country | `{ revision, reason }` | `not_enabled`, `stale` |
| `POST /admin/markets/:id/delete` | `markets.lifecycle` + alcance de país o plataforma | country | `{ revision }` | `in_use` + `{ kind, count }`, `stale` |
| `GET /admin/markets/:id/readiness` | `markets.read` | market | `{ ready, missingCount, items }`, con el formato de `ReadinessItem` actual | |

Todas las escrituras se auditan: `market.create`, `market.update`, `market.enable`, `market.disable` y `market.delete`.

---

## D. Admin: zonas

| Ruta | Cambio |
|---|---|
| `GET /admin/zones` | `?marketId=` reemplaza `?cityId=`. Por defecto usa la sede del alcance |
| `GET /admin/zones/shapes` | `?marketId=&neighbors=true` devuelve también las zonas **activas** de todas las sedes cuya caja envolvente toca la vista (FR-004) |
| `POST /admin/zones/validate` | Cuerpo `{ marketId, zoneId?, geometry, active }`. Si choca: `422 zone_conflict` + `{ conflicts: [{ zoneId, zoneName, marketId, marketName }] }`. Se eliminan las advertencias |
| `POST /admin/zones` | `{ marketId, name, slug, geometry, active, displayOrder }`. Error `zone_conflict` |
| `PATCH /admin/zones/:id` | Si llega `marketId`: `409 zone_market_immutable`. Si `active` pasa a `true` o cambia la geometría de una zona activa: `zone_conflict` (FR-003a) |
| `acknowledgeWarnings` | **Se elimina** del cuerpo |

---

## E. Admin: configuración

| Ruta | Cambio |
|---|---|
| `GET/PUT /admin/booking-settings/markets/:marketId` | Reemplaza `/cities/:cityId`. Campos de sede: los de FR-014 más `offerReminderIntervalMinutes`, `offerMaxReminders`, `checkInWindow` y `noShowGraceMinutes`. Si llega `goalkeeperPenalties`: `400 field_not_allowed_at_level` |
| `GET/PUT /admin/booking-settings/countries/:countryId` | Gana `offerReminderIntervalMinutes` y `offerMaxReminders`. Las respuestas muestran `{ value, origin }` con `origin ∈ zone \| market \| country \| platform` |
| `rental-rates`, `commissions`, `unverified-discounts` | `scope: 'market'` reemplaza `'city'` en cuerpos, filtros (`?marketId=`) y respuestas |
| `GET /admin/pricing/areas`, `GET /admin/pricing/preview` | Áreas = sedes y zonas. `preview` acepta `?marketId=&zoneId=` |
| `GET /admin/payment-gateways?countryId=` | **Nuevo.** Lista la configuración del país y de sus sedes, con `scope` |
| `GET/PUT /admin/payment-gateways/:scope/:refId` | Reemplaza `/:countryId`. `scope ∈ country \| market`. La moneda debe ser la del país. `scope: zone`: `400 invalid_scope` |
| `POST /admin/payment-gateways/market/:refId/delete` | **Nuevo.** Quita el override de una sede, que vuelve a usar el del país |

---

## F. Admin: equipo

| Ruta | Cambio |
|---|---|
| `POST /admin/staff` (invitar) | Gana `scopes` (al menos uno) |
| `PATCH /admin/staff/:id` | Gana `scopes`. Errores: `scope_not_found`, `scopes_required` |
| `GET /admin/staff*` | Las respuestas incluyen `scopes: [{ kind, id, name }]` |

Al cambiar alcances se invalida la caché de acceso de ese miembro en la instancia (research §14).

---

## G. Admin: secciones de país

| Ruta | Cambio |
|---|---|
| `GET /admin/goalkeepers`, `GET /admin/goalkeeper-registrations` | `?marketId=` opcional reemplaza `cityId`. Cada fila trae `market: { id, name }` |
| `GET /admin/operating-balances` | Filtra por la sede actual del portero (dato actual). Totales por país |
| `GET /admin/deposits`, `GET /admin/invoicing/documents` | Filtran por el `marketId` guardado (dato histórico) |
| `GET /admin/dashboard*` | `countryId` y `marketId` salen del alcance. Se eliminan los parámetros `?countryId&cityId` |
| `GET /admin/requests`, `GET /admin/cases` | Se eliminan `?countryId&cityId`. Salen del alcance |

---

## H. Pruebas HTTP

Cada ruta nueva o que cambia tiene su caso en `tests/http/controllers/`:

| Archivo | Qué cubre |
|---|---|
| `adminMarkets.test.ts` | C completo: estados, readiness, eliminación, alcances |
| `adminZonesConflicts.test.ts` | D: cruce, borde compartido, inactiva que no bloquea, reactivación rechazada, `marketId` inmutable |
| `adminScope.test.ts` | B: header, 403 y 404, nivel `market`, nivel `country` con miembro de sede, detalle por id fuera de alcance, totales por país con `all` |
| `marketsApp.test.ts` | A1, A2 y A4 (los dos errores), A5 |
| `goalkeeperMarketChange.test.ts` | A7 completo, con cada bloqueo |
| `goalkeeperBilling.test.ts` | A6 y A7: factura con dirección, copia al momento del cobro |
| `paymentGatewayByMarket.test.ts` | A8 y E (override por sede) |
