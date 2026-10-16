# Data Model: Sedes (markets)

**Feature**: 031-markets · **Research**: [research.md](./research.md)

Convenciones del repositorio:
- ids UUIDv7 como `string`;
- `revision` para la concurrencia optimista del admin (`updateAtRevision`);
- montos en unidades enteras de la moneda del país;
- fechas en UTC.

---

## 1. `markets` (nueva)

| Campo | Tipo | Reglas |
|---|---|---|
| `_id` | string | UUIDv7 |
| `name` | string | 2–60 caracteres, recortado. Único por país, sin distinguir mayúsculas (`country_name_unique`) |
| `countryId` | string | País existente con moneda. **Inmutable** (FR-001a) |
| `timeZone` | string | IANA válido (`isValidTimeZone`) |
| `mapCenter` | `{ lat: number; lng: number; zoom: number }` | lat −90..90, lng −180..180, zoom 3..20 |
| `status` | `'draft' \| 'enabled' \| 'disabled'` | Nace `draft` |
| `enabledAt`, `enabledBy` | Date \| null, string \| null | Última habilitación (staffId) |
| `disabledAt`, `disabledBy` | Date \| null, string \| null | Última deshabilitación |
| `createdAt`, `createdBy`, `updatedAt` | Date, string, Date | |
| `revision` | number | |

**Transiciones** (`domain/markets/market.ts`):

```text
draft ──enable (readiness ok)──▶ enabled ──disable──▶ disabled
                                    ▲                    │
                                    └──enable (readiness ok)┘
(nunca vuelve a draft)
```

**Eliminación:** solo si `marketUsage(marketId)` está vacío (§12).

**Índices:** `country_name_unique` (`{ countryId: 1, nameKey: 1 }`, único) y `status` (`{ status: 1, name: 1 }`).

---

## 2. `zones` (cambia)

| Campo | Cambio |
|---|---|
| `cityId` | **Se elimina** |
| `marketId` | **Nuevo**, obligatorio, inmutable (FR-002a) |
| `name`, `slug`, `geometry`, `active`, `displayOrder`, `revision` | Sin cambio |

**Regla de dominio** (`domain/zones/zoneGeometry.ts`):
- `findZoneConflicts(geometry, selfId, activeZones)` devuelve las zonas activas que no son disjuntas de `geometry` (research §2).
- Se llama al guardar una zona con `active: true` y al pasar de `active: false` a `true`.
- Se eliminan las advertencias `overlaps_zone` y `far_from_city_zones`, y las constantes `OVERLAP_THRESHOLD_SQUARE_METERS` y `FAR_FROM_CITY_KM`.

**Índices:** `market_order` (`{ marketId: 1, displayOrder: 1 }`) reemplaza al índice por ciudad. Sigue sin índice `2dsphere` (research §2).

---

## 3. `cities` y `regions` (catálogo de facturación)

| Colección | Cambio |
|---|---|
| `cities` | Se eliminan `zoneCityId` y `timeZone`. Quedan `name`, `regionId`, `daneStateCode`, `daneCityCode` y `revision` |
| `regions` | Sin cambio (`name`, `countryId`). Solo se usa para mostrar el departamento y llegar al país del municipio |

`City` y `Region` dejan de importarse desde resolutores de configuración, cotización, ofertas o saldo. Lo verifica la prueba `tests/architecture/marketTerms.test.ts`.

---

## 4. Configuración por niveles

Tipo común (`domain/settings/layered.ts`):

```ts
type SettingLevel = 'zone' | 'market' | 'country' | 'platform';
interface Resolved<T> { value: T | null; origin: SettingLevel | null }
```

| Colección | `scope` permitido | Cambios de campos |
|---|---|---|
| `bookingSettings` | `country \| market` | **Nuevos:** `offerReminderIntervalMinutes`, `offerMaxReminders`, ambos number \| null, 1..1440 y 0..10. **Pasan a leerse también en `market`:** `checkInWindow` y `noShowGraceMinutes`. **Solo `country`:** `goalkeeperPenalties` (rechazado en `market` con `field_not_allowed_at_level`) |
| `rentalRates` | `market \| zone` | Sin cambio de campos |
| `commissionSettings` | `country \| market \| zone` | Sin cambio de campos |
| `unverifiedDiscounts` | `country \| market \| zone` | Sin cambio de campos |
| `paymentGatewaySettings` | `country \| market` | `_id` pasa a UUID. **Nuevos:** `scope`, `refId`. Índice `scope_ref_unique`. `currency` debe ser la del país de `refId` |
| `taxSettings`, `invoicingSettings`, `documentTypes` | `country` | Sin cambio |

`refId` con `scope: market` apunta a `markets._id`. El índice único de cada colección se mantiene sobre `{ scope, refId, ...tier }`.

**Valores de plataforma** (no se guardan en Mongo): `offerReminderIntervalMinutes` = `OFFER_REMINDER_INTERVAL_MINUTES` y `offerMaxReminders` = `OFFER_MAX_REMINDERS`. También los valores por defecto existentes de `freeCancellationMinutes`, `travelBufferMinutes`, `checkInWindow` y `noShowGraceMinutes`.

---

## 5. `MarketContext` (en memoria, por request o por corrida)

```ts
interface MarketContext {
  zone(zoneId): Zone | null;
  market(marketId): Market | null;
  country(marketId): Country | null;        // market.countryId
  levelsForZone(zoneId): { zone; market; country };   // ids para leer configuraciones
}
```

Se carga con una lectura por fuente: zonas → sedes → países (research §4).

---

## 6. Reserva, cotización y solicitud

| Documento | Cambio |
|---|---|
| `MatchDetails` (`quotes`, `goalkeeperRequests`, `bookings`) | `cityId` → `marketId`. Se conservan `zoneId` y `timeZone` (copia de `market.timeZone` al cotizar) |
| Índices que usaban `cityId` (listados del admin) | Pasan a `marketId` |

---

## 7. Portero

### `goalkeeperRegistrations`

| Campo | Cambio |
|---|---|
| `availability.cityId` | → `availability.marketId` |
| `billing` | **Nuevo:** `{ cityId: string \| null; address: string \| null; addressComplement: string \| null }` |

`cityId` es un municipio con DANE válido. `address` tiene 5–120 caracteres y `addressComplement` 0–80. La activación exige `cityId` y `address`.

### `goalkeeperProfiles`

| Campo | Cambio |
|---|---|
| `cityId` | → `marketId`. Índice `market` (`{ marketId: 1 }`) |
| `billing` | **Nuevo:** igual que en el registro, copiado al activar. Se edita desde el perfil |
| `marketChangedAt` | **Nuevo:** Date \| null. Último cambio de sede, informativo |

### `ChangeGoalkeeperMarket` (comando, en una transacción)

| Verificación | Resultado si falla |
|---|---|
| Sede destino existe y está `enabled` | `market_not_available` |
| Sede destino ≠ sede actual | `same_market` |
| Zonas activas de la sede destino, al menos una | `invalid_zones` |
| Ninguna `bookings` del portero con `status: 'assigned'` | `pending_bookings` + `{ bookingIds }` |
| Si cambia el país: `operatingBalances.balance === 0` | `balance_not_zero` + `{ balance, currency }` |
| Si cambia el país: ningún `deposits.status === 'pending'` | `deposit_pending` |
| Si cambia el país: ningún cierre abierto (`requested` o `refund_recorded`; `reopened` es una cuenta activa de nuevo) | `account_closure_open` |

**Efectos:**
- `profile.marketId` y `zoneIds` cambian, y se fija `marketChangedAt`.
- Si cambió el país, `operatingBalances.currency` pasa a la moneda nueva.

---

## 8. Facturación

| Documento | Cambio |
|---|---|
| `InvoicingBuyer` (`invoicingDocuments.buyer`) | `cityId` pasa a ser el municipio de `profile.billing`. **Nuevos:** `address`, `addressComplement`. `cityName`, `stateCode` y `cityCode` salen de ese municipio |
| `invoicingDocuments` | **Nuevo:** `marketId` (atribución, §9) |

---

## 9. Atribución a sede (FR-043)

| Colección | Campo nuevo | De dónde sale | Índice |
|---|---|---|---|
| `balanceMovements` | `marketId` | La reserva (comisión, IVA, penalidad, reembolso). La sede del portero al momento (depósito, comisión de pasarela, ajuste) | `market_occurred` (`{ marketId: 1, occurredAt: -1 }`) |
| `deposits` | `marketId` | Sede del portero al iniciar | `market_created` |
| `invoicingDocuments` | `marketId` | El movimiento que factura | `market_issued` |
| `goalkeeperIncidents` | `marketId` | La reserva | `market_occurred` |

El campo se escribe una vez y nunca se reescribe.

---

## 10. Equipo

### `staffMembers`

| Campo | Cambio |
|---|---|
| `scopes` | **Nuevo:** `Array<{ kind: 'platform' } \| { kind: 'country'; id: string } \| { kind: 'market'; id: string }>`, al menos uno, sin duplicados. El rol `owner` implica `platform` aunque no esté guardado |

### Permisos nuevos (`permissionCatalog.ts`)

| Permiso | Para qué |
|---|---|
| `markets.read` | Ver sedes y su lista de chequeo |
| `markets.manage` | Crear sedes y editar nombre, zona horaria y mapa. Crear requiere además alcance de país o plataforma |
| `markets.lifecycle` | Habilitar, deshabilitar y eliminar. Requiere alcance de país o plataforma sobre la sede (FR-041a) |

### `AdminScope` (por request, `req.adminScope`)

```ts
interface AdminScope {
  kind: 'all' | 'country' | 'market';
  countryId: string | null;
  marketId: string | null;
  allowedCountryIds: string[] | 'all';
  allowedMarketIds: string[] | 'all';
}
```

### `adminAuditLog`

**Nuevo:** `scope: { countryId: string | null; marketId: string | null }`.

---

## 11. Lo que se elimina

- `City.zoneCityId` y `City.timeZone`.
- `resolveAnchorCityId`, `checkZoneCity`, `canUseAnchor` y `ZoneCityCheck`.
- `cityState()` y `CityState`.
- `readinessForCities`, reemplazado por `readinessForMarkets`.
- `createCountrySettingsResolver`, reemplazado por `MarketContext`.
- `BookingSettingsScope 'city'`, `RentalRateScope 'city'`, `CommissionScope 'city'` y `UnverifiedDiscountScope 'city'`.
- El resultado `time_zone_not_configured` de la cotización.
- Las advertencias `overlaps_zone` y `far_from_city_zones`.

---

## 12. `marketUsage(marketId)` (impide eliminar)

Cuenta, en este orden:
1. zonas;
2. configuraciones de `bookingSettings`, `rentalRates`, `commissionSettings`, `unverifiedDiscounts` y `paymentGatewaySettings`;
3. `goalkeeperRegistrations` y `goalkeeperProfiles`;
4. `quotes`, `goalkeeperRequests` y `bookings`;
5. registros con atribución (§9);
6. alcances de staff que la nombran.

Devuelve el primer tipo con registros y su conteo, como hace hoy `referenceUsage.ts`.
