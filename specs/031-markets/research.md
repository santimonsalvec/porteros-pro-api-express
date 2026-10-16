# Research: Sedes (markets)

**Feature**: 031-markets · **Date**: 2026-10-15 · **Spec**: [spec.md](./spec.md) · **Plan de trabajo**: `_temp_marca_blanca.md` (D1–D31)

Cada sección: decisión, por qué y alternativas descartadas. Las referencias `file:line` son del API salvo que se diga otra cosa.

---

## §1. La sede es una entidad nueva, no una ciudad reutilizada

**Decisión.** Colección nueva `markets` (`Market` en `src/domain/markets/market.ts`), con id UUIDv7 como el resto. `cities` y `regions` siguen existiendo, pero solo como catálogo de facturación (departamento → municipio con DANE). Pierden `zoneCityId` y `timeZone` (este pasa a la sede).

**Por qué.**
- Hoy "ciudad" mezcla el municipio real y el área de operación. La lógica de anclas (`zoneCityId`, `resolveAnchorCityId`, `checkZoneCity`, `canUseAnchor`) existe solo para traducir una cosa a la otra.
- Con la sede separada, esa lógica desaparece entera, y el catálogo de municipios queda con un único uso.
- Un id propio deja claro, en cada documento, si un campo apunta a una sede (`marketId`) o a un municipio (`billing.cityId`).

**Alternativas descartadas.**
- **Reutilizar `cities` agregando `kind: 'market' | 'municipality'`:** mezcla otra vez los dos conceptos y obliga a filtrar por `kind` en cada consulta.
- **Conservar los ids de las ciudades ancla como ids de sede:** no hace falta, porque nada está en producción (D12).

---

## §2. Validación de zonas: sin cruces ni bordes compartidos entre zonas activas

**Decisión.**
- Se reemplaza la advertencia actual por un **error bloqueante** en `domain/zones/zoneGeometry.ts`. Hoy existe `overlaps_zone` con un umbral de 1000 m² y un ganador por `displayOrder` (`zoneGeometry.ts:15-17`, `:118-134`).
- El error nuevo es `zone_conflict`: la zona choca si no es **disjunta** de otra zona activa. Eso cubre área en común y también bordes o vértices que se tocan.
- Se usa `@turf/boolean-disjoint` (familia `@turf` v7, la misma que ya usa el archivo: `area`, `intersect`, `kinks`, `simplify`, `point-to-polygon-distance`).
- **Cuándo se valida:** al crear o editar una zona activa, y al reactivar una inactiva (FR-003, FR-003a). La comparación es contra **todas las zonas activas de todas las sedes**, no solo las de la misma sede.
- **Una zona inactiva nunca bloquea.**
- **La respuesta indica cada zona que choca:** `{ zoneId, zoneName, marketId, marketName }`.
- Se elimina la advertencia `far_from_city_zones` ("lejos de las zonas de la ciudad"): pierde sentido porque una sede no tiene límite oficial y puede crecer en cualquier dirección.

**Por qué.**
- `@turf/intersect` solo detecta área en común: dos polígonos que comparten un borde devuelven `null`. Por eso no sirve para la regla de bordes (D15).
- `booleanDisjoint` es la prueba exacta de "no se tocan ni se cruzan".
- **Costo:** decenas de zonas activas de hasta ~9.000 vértices (`zoneGeometry.ts:15`). Cada validación compara contra cada zona activa, unos pocos cientos de milisegundos en el peor caso, y solo ocurre al guardar en el admin.
- Para que sea rápido, primero se descartan las zonas cuya caja envolvente (bbox) no se cruza, sin dependencia extra (se calcula recorriendo coordenadas).

**Alternativas descartadas.**
- **`$geoIntersects` de MongoDB con el polígono como `$geometry`:** con las aristas compartidas la semántica de S2 es ambigua, así que no garantiza detectar el borde común. Además, el repositorio evita a propósito el índice `2dsphere` (`zoneRepository.ts:58-63`).
- **`@turf/boolean-intersects`:** equivalente a `!booleanDisjoint`. Se elige `disjoint` porque se lee igual que la regla.
- **Exigir una distancia mínima entre zonas:** el usuario solo pidió que no se toquen (D15).

**Dependencia nueva:** `@turf/boolean-disjoint` (runtime). Se justifica en Complexity Tracking: es la misma familia y versión ya instalada, y ningún paquete instalado detecta bordes compartidos.

---

## §3. Datos de desarrollo: las zonas sembradas comparten bordes

**Hallazgo.** Las zonas de Medellín se trazaron desde límites oficiales y comparten bordes exactos (`zoneGeometry.ts:14`). Con la regla de §2, ninguna se podría volver a guardar ni a reactivar.

**Decisión.**
- El script de rehacer datos de desarrollo (`scripts/reset-031-markets.ts`, §15) encoge cada zona sembrada **3 m hacia adentro** con `@turf/buffer` (radio −0,003 km).
- Luego verifica con la misma función de §2 que el conjunto resultante quede sin conflictos. Si queda alguno, aborta y lo reporta.
- `@turf/buffer` se instala como **devDependency**: solo lo usa el script, nunca el servidor.

**Por qué.**
- Volver a dibujar a mano decenas de zonas no aporta nada.
- 3 m dejan un espacio de ~6 m entre zonas vecinas. Es menor que el ancho de una calle, y en la práctica ninguna cancha cae en esa franja.
- El administrador puede ajustar cualquier zona después.

**Riesgo anotado.** Un punto marcado exactamente sobre una calle limítrofe cae en la franja y recibe "Aún no tenemos servicio aquí". Lo aceptó el usuario al elegir D15. El quickstart incluye una prueba de ese caso.

**Alternativas descartadas.**
- **Exigir que el usuario vuelva a trazar las zonas:** es trabajo manual sin valor.
- **Tolerar bordes compartidos en los datos sembrados:** cualquier edición posterior fallaría.

---

## §4. Un solo resolutor de configuración por niveles y un `MarketContext`

**Decisión.**
- **`src/domain/settings/layered.ts`** generaliza dos patrones que ya existen: `inherited()` con `origin` (`goalkeeperRequests/common/resolveBookingSettings.ts:37-44`) y `resolveTiered()` (`domain/pricing/tieredRate.ts`).
- **`resolveLayered(levels, field, fallback?)`** recibe los documentos ordenados de más específico a más general (`zone → market → country → platform`) y devuelve `{ value, origin }`, donde `origin` es `'zone' | 'market' | 'country' | 'platform' | null`.
- **`resolveTiered`** sigue igual. Ahora recibe niveles `[zone, market, country]` en vez de `[zone, city, country]`.
- **`src/application/features/markets/common/marketContext.ts`** expone `loadMarketContext(deps, { zoneIds?, marketIds? })`. En **una lectura por fuente** carga zonas → sedes → países y devuelve:

  ```ts
  { zone(id), market(id), country(marketId), timeZone(marketId), currency(marketId) }
  ```

  Se crea una vez por request o por corrida del barrido, igual que hoy `createCountrySettingsResolver` (`bookingLifecycle/common/countrySettingsResolver.ts`).
- **Este contexto reemplaza las lecturas de ciudad, región y país** que hoy repiten:
  - `CommissionResolver.levelsFor`
  - `createCountrySettingsResolver`
  - `PricingGeography.load`
  - `resolveAreaSettings`
  - `readinessForCities`
  - `resolveGoalkeeperOperatingBalanceContext`
  - `vatRateResolver`
  - `unverifiedDiscountResolver`
  - `dashboard/common/geography`
- **El país de una sede es un campo directo** (`market.countryId`) y no cambia nunca (FR-001a). Ya no se pasa por `regions`.

**Por qué.**
- Hoy cada resolutor hace ciudad → región → país por su cuenta (ver diagnóstico en `_temp_marca_blanca.md`).
- Un solo contexto evita que dos pantallas o dos flujos resuelvan distinto el mismo valor.
- Un único `resolveLayered` hace que la tabla de FR-014 se cumpla en un solo lugar.

**Alternativas descartadas.**
- **Un documento único de configuración por sede:** las colecciones tienen permisos, auditoría y pantallas distintas, y todas usan concurrencia optimista por `revision` (`_temp_marca_blanca.md`, cambio 2).
- **Caché global de sedes y países en memoria:** son pocos datos, pero el admin los edita. Una lectura por request es barata y siempre está al día.

---

## §5. Niveles por configuración (FR-014): cambios en las colecciones existentes

| Colección | Hoy | Después |
|---|---|---|
| `bookingSettings` | `scope: country \| city` | `scope: country \| market`. Los campos que solo se leían a nivel país (`checkInWindow`, `noShowGraceMinutes`) se leen también en la sede. `goalkeeperPenalties` sigue solo en país. Nuevos: `offerReminderIntervalMinutes`, `offerMaxReminders`. |
| `rentalRates` | `scope: zone \| city` | `scope: zone \| market` |
| `commissionSettings` | `scope: country \| city \| zone` | `scope: country \| market \| zone` |
| `unverifiedDiscounts` | `scope: country \| city \| zone` | `scope: country \| market \| zone` |
| `paymentGatewaySettings` | `_id = countryId` | `scope: country \| market` + `refId`, `_id` UUID e índice único `scope_ref_unique` |
| `taxSettings`, `invoicingSettings`, `documentTypes` | país | sin cambio |

**Validación al escribir:** el comando rechaza un campo de solo país escrito en una sede, con `field_not_allowed_at_level`. Hoy esos campos se ignoran en silencio a nivel ciudad (`bookingSettings.ts:43-52`); ahora se rechazan para que el admin no guarde algo que no aplica.

---

## §6. Recordatorios de ofertas configurables (FR-017)

**Decisión.**
- `offerReminderIntervalMinutes` y `offerMaxReminders` pasan a `bookingSettings`, en los niveles plataforma → país → sede.
- El **nivel plataforma** es el valor de entorno actual (`OFFER_REMINDER_INTERVAL_MINUTES`, `OFFER_MAX_REMINDERS`, `config.ts:26-33`). Sigue visible en "Parámetros del sistema" como valor por defecto.
- `offerSender.ts:40` deja de recibir `maxReminders` fijo y lo resuelve por la sede de cada solicitud con el `MarketContext` de la corrida.

**Por qué.** Reutiliza el documento y las pantallas de reglas de reserva, y no crea una colección para dos números.

**Alternativa descartada.** Un documento `platformSettings` en Mongo: obligaría a migrar los valores de entorno, y el entorno ya es la fuente de los valores por defecto del sistema.

---

## §7. Estados de la sede y lista de chequeo

**Decisión.**
- Máquina de estados en `domain/markets/market.ts`:

  | Desde | Hacia | Condición |
  |---|---|---|
  | `draft` | `enabled` | readiness completo |
  | `enabled` | `disabled` | siempre |
  | `disabled` | `enabled` | readiness completo |
  | cualquiera | `draft` | nunca |

- Cada transición guarda `enabledAt`/`enabledBy` o `disabledAt`/`disabledBy`, y deja una entrada en la auditoría.
- **Readiness:** `geography/common/readiness.ts` pasa de `readinessForCities` a `readinessForMarkets`, con los mismos ítems menos los de ciudad ancla y región, más "la sede tiene al menos una zona activa". Se conserva el criterio del archivo: corre las mismas funciones que la cotización, para que "lista" signifique que cotiza (SC-003).
- Los ítems de DANE salen del readiness de la sede y pasan a validarse en los datos de facturación del portero (§10).
- **Eliminar una sede** reutiliza `referenceUsage.ts` con un `marketUsage(marketId)` que cuenta zonas, configuraciones de cualquier colección, perfiles, registros, cotizaciones, solicitudes, reservas y atribuciones (§11).

**Por qué.** El readiness ya es la definición de "esta área cotiza" (admin spec 003 US3). Reutilizarlo garantiza FR-008.

---

## §8. Cotización: dos respuestas de "no se puede cotizar"

**Decisión.**
- `resolveServiceArea` (`goalkeeperRequests/common/serviceArea.ts:23-38`) sigue buscando la zona activa que contiene el punto (`findActiveContainingPoint`). Como las zonas activas ya no se cruzan, el orden por `displayOrder` deja de decidir nada. Se conserva solo como desempate determinista ante datos inválidos.
- **Si la zona encontrada es de una sede `disabled`:** `market_unavailable`.
- **Si es de una sede `draft`:** `location_not_covered`.
- **Si no hay zona activa,** una segunda consulta `findAnyContainingPoint` busca una zona **inactiva**:
  - si es de una sede `enabled` o `disabled`: `market_unavailable`;
  - si es de una sede `draft`, o no hay ninguna: `location_not_covered`.
- **HTTP:** se conserva `400 location_not_covered`. Se agrega `409 market_unavailable` con `{ marketName }` para el mensaje "Esta sede está temporalmente fuera de servicio".
- `time_zone_not_configured` desaparece, porque la zona horaria es obligatoria al crear la sede (FR-001).
- **Bloqueo de solicitudes nuevas (FR-011):** la confirmación (`confirmBooking`) vuelve a resolver el área. Si la sede ya no está `enabled`, responde `market_unavailable` aunque la cotización fuera válida. Las solicitudes ya creadas no pasan por aquí, así que siguen su curso.

**Alternativa descartada.** Un solo error con un campo `reason`: la app ya distingue fallas por código (`goalkeeper_requests_api_client.dart:395`), y un código nuevo sigue el mismo patrón.

---

## §9. Portero: una sede, cambio de sede y saldo

**Decisión.**
- **Registro y perfil:** `availability.cityId` pasa a `availability.marketId` en `GoalkeeperRegistration` y `GoalkeeperProfile`. `validateAvailabilitySelection` exige una sede `enabled` y zonas activas de esa sede. La validación de anclas desaparece.
- **Cambio de sede:** `PUT /goalkeepers/me/profile/availability` hoy permite cambiar de ciudad sin restricciones (`updateGoalkeeperAvailabilityCommandHandler.ts:32-52`). Se divide en dos:
  - **Misma sede:** `PUT /goalkeepers/me/profile/availability` solo cambia zonas. Rechaza un `marketId` distinto con `use_market_change`.
  - **Otra sede:** comando nuevo `ChangeGoalkeeperMarket` (`POST /goalkeepers/me/market-change`). En una transacción:
    1. Verifica que la sede destino esté `enabled` y que las zonas sean válidas.
    2. Verifica que no haya reservas aceptadas sin jugar (`bookings` con `status: 'assigned'` del portero). Si hay, responde `pending_bookings` con sus ids.
    3. Si cambia el país, verifica saldo 0, ningún depósito `pending` y ningún cierre de cuenta abierto. Si falla, responde `balance_not_zero`, `deposit_pending` o `account_closure_open`.
    4. Cambia `marketId` y `zoneIds`. Si cambió el país, actualiza `operatingBalances.currency` (solo es posible con saldo 0 y sin movimientos pendientes).
- **Ofertas abiertas:** dejan de mostrarse solas, porque la elegibilidad (`offerEligibilityService`) compara las zonas del perfil con la zona de la solicitud. No se borra ningún aviso.
- **El equipo no tiene esta acción** (FR-025). No hay ruta de admin.

**Por qué.**
- La transacción evita que un depósito se apruebe entre la verificación y el cambio de moneda (Atlas replica set, `withTransaction` como en 008).
- Separar las dos rutas hace imposible cambiar de sede "sin querer" desde la pantalla de zonas.

---

## §10. Datos de facturación del portero

**Decisión.**
- **Sección nueva del registro:** `billing: { cityId, address, addressComplement }`, donde `cityId` es un municipio del catálogo con DANE válido (`daneCodesValid`, `domain/locations/locationRules.ts`).
  - Ruta: `PATCH /goalkeepers/me/billing`.
  - La activación (`POST /goalkeepers/me/activate`) exige la sección completa, igual que identificación.
- **Edición posterior:** `PUT /goalkeepers/me/profile/billing`.
- **En la factura:** `InvoicingBuyer` (`domain/invoicing/invoicingDocument.ts:8-14`) agrega `address` y `addressComplement`. El documento se arma con `profile.billing` en `documentForMovement.ts:84-90`, no con `profile.cityId`.
- **Siigo:** `siigoInvoicingProvider.ts:136-138` envía la dirección real en `address.address`. Hoy envía el nombre de la ciudad.
- **Copia al momento del cobro:** la factura ya guarda el comprador como estaba al cobrar (`invoicingDocument.ts:7`). Solo se amplía su contenido.
- **El buscador de municipios para la app** sigue en `GET /locations/cities?q=`:
  - quita `hasZones`;
  - agrega `stateName`;
  - sin `q`, devuelve vacío.

  La lista de sedes es otra ruta (§13).

**Por qué.** La DIAN pide el municipio real del comprador. Con sedes que abarcan varios municipios, el de la sede sería incorrecto (D9).

---

## §11. Atribución a sede de los datos de país (FR-043)

**Decisión.**
- **Campo `marketId` del momento**, que nunca se reescribe, en:
  - `balanceMovements`: de la reserva para comisiones, IVA, penalidades y reembolsos; de la sede del portero para depósitos y ajustes;
  - `deposits`;
  - `invoicingDocuments`: copiado del movimiento;
  - `goalkeeperIncidents`: de la reserva.
- `quotes`, `goalkeeperRequests` y `bookings` lo llevan en `MatchDetails` (§12).
- **Filtros:**
  - **Datos actuales:** porteros y saldo de hoy filtran por `goalkeeperProfiles.marketId`.
  - **Datos históricos:** filtran por el `marketId` guardado.
- **Índices nuevos:**
  - `balanceMovements.market_occurred`
  - `deposits.market_created`
  - `invoicingDocuments.market_issued`
  - `goalkeeperIncidents.market_occurred`
  - `goalkeeperProfiles.market`

**Por qué.** El reporte de una sede no debe cambiar cuando un portero se va (SC-008).

---

## §12. Renombre `cityId` → `marketId` en los flujos de reserva

**Decisión.**
- `MatchDetails.cityId` (`domain/bookings/matchDetails.ts:10`) pasa a `marketId`, y `timeZone` sigue copiado en el detalle. Con eso, `quotes`, `goalkeeperRequests` y `bookings` cambian de forma.
- **Sin compatibilidad hacia atrás** (D12): los documentos de desarrollo se borran (§15).
- **Alcance aproximado:** 166 archivos de `src/` nombran `cityId`. Los que hablan de facturación conservan `cityId` (municipio). Todos los de operación pasan a `marketId`.
- **Una prueba de arquitectura nueva** (`tests/architecture/marketTerms.test.ts`) falla si `zoneCityId`, `anchorCity` o `resolveAnchorCityId` vuelven a aparecer, y si un resolutor de configuración importa un puerto de regiones (FR-005).

**Por qué.** Un nombre por concepto evita que alguien vuelva a usar el municipio para operar.

---

## §13. Rutas de la app

**Decisión.**

| Ruta | Cambio |
|---|---|
| `GET /markets` | Nueva. Autenticada. Sedes `enabled`: `{ id, name, countryId, timeZone, mapCenter }`, por nombre. |
| `GET /zones?marketId=` | Reemplaza `?cityId=`. Zonas activas de la sede. |
| `GET /goalkeeper-requests/config` y la cotización | Devuelven `market: { id, name }` en vez de la ciudad. |
| `GET /locations/cities` | Pasa a ser solo el buscador de municipios (§10). |

---

## §14. Alcance del administrador: header `X-Scope`, alcances del staff y nivel de cada ruta

**Decisión.**

- **Header.** Valores:
  - `X-Scope: all`
  - `X-Scope: country:<countryId>`
  - `X-Scope: market:<marketId>`

  Un middleware `requireScope` (`infrastructure/auth/middleware/requireScope.ts`) va después de `requireAdminAuth`. Hace tres cosas:
  1. parsea el header;
  2. verifica que el país o la sede existan;
  3. verifica que el alcance del miembro lo cubra. Deja en `req.adminScope`:

     ```ts
     { kind: 'all' | 'country' | 'market', countryId, marketId, allowedMarketIds, allowedCountryIds }
     ```

  Si el header falta, el alcance por defecto es el más amplio del miembro. Si el miembro no tiene acceso: `403 scope_denied`.

- **Alcances del staff.** `StaffMember.scopes: Array<{ kind: 'platform' } | { kind: 'country'; id } | { kind: 'market'; id }>` (`domain/staff/staffMember.ts`).
  - Al menos uno.
  - El rol `owner` implica `platform`.
  - Se resuelven en `StaffAccessResolver.load` (`infrastructure/auth/staffAccessResolver.ts:54-61`) junto con el rol.
  - Usan la misma caché de 30 s: en la misma instancia el cambio aplica de inmediato (`invalidate`), y en otras dentro de 30 s. Es el mismo comportamiento que hoy tienen los permisos (spec 001, FR-010), y cumple FR-041.

- **Nivel de cada ruta.** `AdminRouteGuard` (`controllers/admin/adminRoute.ts:14-17`) gana `level: 'market' | 'country' | 'platform'`. `createAdminRouting` agrega `requireScope(level)`, y cada handler recibe el filtro ya calculado:
  - **`market`:** `marketIds` = la sede seleccionada, o las sedes permitidas del país seleccionado.
  - **`country`:** `countryId` del alcance, más `marketIds` cuando el miembro solo tiene sedes (FR-042) o cuando la sección usa su filtro opcional `?marketId=`.
  - **`platform`:** nada.

- **Consultas por id (FR-038).** Los handlers de detalle verifican que el registro pertenezca a una sede o país dentro de `allowedMarketIds` o `allowedCountryIds`, no a la selección actual. Si no, responden `404 not_found`, sin revelar que existe.

- **Auditoría (FR-039).** `auditTrail` agrega `scope: { countryId, marketId }` a cada entrada.

- **Permisos nuevos:** `markets.read`, `markets.manage` (crear y configurar datos de la sede) y `markets.lifecycle` (habilitar, deshabilitar, eliminar). `markets.lifecycle` además exige alcance de país o plataforma sobre la sede (FR-041a).
- **`geography.*`:** queda para países, departamentos, municipios y zonas.

**Por qué.**
- El token no lleva permisos a propósito (`jwtAdminTokenIssuer.ts:11-13`).
- Si la selección viviera en la sesión, una pestaña cambiaría a la otra en la siguiente renovación (D24).
- El header es explícito, se audita y permite una selección por pestaña.

**Alternativas descartadas.**
- **La sede como claim del JWT:** ver D24.
- **Un parámetro `?marketId=` en cada ruta:** cada pantalla tendría que agregarlo, y es fácil olvidarlo.

---

## §15. Rehacer datos de desarrollo (sin migración)

**Decisión.**
- **Script `scripts/reset-031-markets.ts`.** Exige `--confirm-dev` y que la base no sea la de producción (mismo control que `scripts/lib`).
- **Borra:** `quotes`, `goalkeeperRequests`, `bookings`, `goalkeeperRegistrations`, `goalkeeperProfiles`, `notifications`, `offerPushState`, `ratings`, `cases`, `goalkeeperIncidents`, `balanceMovements`, `operatingBalances`, `deposits`, `invoicingDocuments` y los `outbox`/`processedEvents` asociados.
- **Crea la sede Medellín** (`America/Bogota`, centro en el Parque Berrío, país Colombia) con las zonas existentes de la antigua ciudad ancla, encogidas según §3.
- **Convierte** `bookingSettings`, `rentalRates`, `commissionSettings` y `unverifiedDiscounts` de `scope: city` a `scope: market`.
- **Pasa** `paymentGatewaySettings` a la forma nueva.
- **Quita** `zoneCityId` y `timeZone` de `cities`.
- **Asigna** el alcance `platform` a los miembros existentes del equipo.
- **No toca** `users`, `staffMembers`, `staffRoles`, `countries`, `regions`, `documentTypes` ni `matchSurfaces`.

**Por qué.** D12 dice que se rehace y no se migra. Un script hace el reinicio reproducible en cada máquina.

**Precaución.** Es destructivo. Solo se corre a mano, con confirmación explícita, nunca en el arranque del servidor.

---

## §16. Admin (Angular): selector, interceptor y secciones por nivel

**Decisión.**
- **`core/scope/scope.service.ts`.** Señal con la selección de la pestaña, guardada en la URL como parámetro de ruta `/:scope/...`, con valores `todas`, `co` o `co~<marketId>`. Un `HttpInterceptorFn` (`core/scope/scope.interceptor.ts`) agrega `X-Scope` solo a las llamadas al API del admin.
- **Selector en el encabezado** (`core/layout/scope-picker.component.ts`). Ofrece "Todas", los países y las sedes del alcance del miembro (`GET /admin/me/scopes`). Cambiarlo navega a la misma pantalla con la nueva selección: es instantáneo y no vuelve a autenticar.
- **Cada entrada de `core/navigation/navigation.ts` declara su nivel.** Las de país muestran el filtro opcional de sede. Las de plataforma ocultan el selector o lo deshabilitan con el texto "No depende de la sede".
- **Pantallas nuevas:** `features/markets/` (lista, ficha con mapa, estados, lista de chequeo).
- **Pantallas que cambian:**
  - las de `geography/` dejan "ciudades ancla" y regiones como datos operativos, y quedan solo como catálogo de facturación;
  - las de `pricing/` pasan de "ciudad" a "sede";
  - `staff/` gana alcances.

**Por qué.** El admin ya tiene `auth.interceptor.ts` y `query-state.ts`. El alcance sigue el mismo patrón (D24).

---

## §17. App (Flutter)

**Decisión.**
- **Registro y disponibilidad:**
  - `city_search_result.dart` y `goalkeeper_city.dart` dejan de usarse para operar;
  - el paso de disponibilidad muestra la lista de `GET /markets` y luego las zonas.
- **Sección nueva "Datos de facturación"**, con buscador de municipio (`GET /locations/cities?q=`), dirección y complemento.
- **Perfil:**
  - "Cambiar de sede" usa `POST /goalkeepers/me/market-change` y muestra los bloqueos con su explicación (FR-026, FR-027);
  - "Datos de facturación" se puede editar.
- **Búsqueda del cliente:** `market_unavailable` → `MarketUnavailable(marketName)`, con el texto "Esta sede está temporalmente fuera de servicio".

---

## §18. Lo que no cambia

- La validación y verificación del portero (030) siguen siendo globales (FR-029).
- `taxSettings`, `invoicingSettings` y `documentTypes` siguen por país (D13).
- Los secretos de pagos siguen por proveedor y país (`WOMPI_CO_*`, D14).
- El outbox, los consumidores y el barrido (013) solo cambian el campo que leen.
