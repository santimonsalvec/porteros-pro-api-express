# Tasks: Sedes como comercios con configuración independiente

**Input**: `specs/031-markets/`: plan, spec, research, data-model, `contracts/markets-api.md`, `contracts/markets-ui.md`, quickstart.

**Tests**: obligatorios. Es TDD en los tres repos (compuerta del plan). Cada tarea de prueba va **antes** de la que la implementa, y hay que verla fallar por la razón correcta antes de escribir el código.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: se puede hacer en paralelo (otro archivo, sin dependencias pendientes).
- **[Story]** (numeración de la spec):
  - US1: crear una sede y dibujar sus zonas (P1);
  - US2: configurar una sede heredando del país (P1);
  - US3: habilitar y deshabilitar una sede (P1);
  - US4: el cliente busca portero en un punto (P1);
  - US5: el portero se registra en una sede con sus datos de facturación (P2);
  - US6: el portero cambia de sede (P2);
  - US7: el administrador trabaja con un selector de país y sede (P2);
  - US8: acceso del equipo por país y sede (P3);
  - US9: proveedor de pagos por sede (P3).

## Path Conventions

- `API/` = `/Users/santiagomonsalve/Documents/Projects/express-js/porteros-pro-api/`
- `ADMIN/` = `/Users/santiagomonsalve/Documents/Projects/angular/porteros-pro-admin/`
- `APP/` = `/Users/santiagomonsalve/Documents/Projects/flutter/porteros_pro_app/`
- `SPEC/` = `API/specs/031-markets/`
- **Comandos:**
  - API: `npm test` (unit), `npm run test:http`, `npm run test:architecture`, `npm run lint`, `npm run build`.
  - Admin: `npm test`, `npx ng lint`, `npx ng build`.
  - App: `flutter analyze`, `flutter test`.
- **Reglas:**
  - Sin commits, merges ni push.
  - Textos en español de Colombia, con "sede" en todo texto del admin. En la app no se usa la palabra "sede" (D2).
  - Toda la UI del admin con Zard: leer `ADMIN/DESIGN.md` y consultar la API de cada componente en el MCP `zard-ui` antes de usarlo.
  - Datos de facturación (dirección, municipio) nunca en logs ni en auditoría: solo ids.
  - Montos en enteros, nunca sumados entre monedas.
  - En código: `market`/`marketId`. `cityId` solo cuando es un municipio de facturación.
- **Pruebas existentes:** las fábricas, fakes y helpers que crean ciudades ancla se adaptan a sedes (tareas de Foundational). Las aserciones de negocio no cambian, salvo donde la spec cambia la regla:
  - solapamiento de zonas (era advertencia, ahora es error);
  - `time_zone_not_configured` (se elimina);
  - `scope: city` (pasa a `market`);
  - la búsqueda de ciudades de la app (pasa a ser de municipios).

  Si un caso existente falla por otra razón, el error está en el código nuevo.
- **Patrones a seguir:**
  - **Handlers:** con fakes de `API/tests/fakes/` (`fakeZoneRepository.ts`, `fakeCityRepository.ts`, `fakeCountryRepository.ts`, `fakeBookingSettingsRepository.ts`, `fakeCommissionSettingRepository.ts`, `fakeRentalRateRepository.ts`, `fakeUnverifiedDiscountRepository.ts`, `fakePaymentGatewaySettingsRepository.ts`, `fakeGoalkeeperProfileRepository.ts`, `fakeGoalkeeperRegistrationRepository.ts`, `fakeStaffMemberRepository.ts`, `fakeReferenceUsage.ts`, `fakeAdminAuditLog.ts`, `fakeClock.ts`).
  - **Repositorios Mongo:** con `API/tests/fakes/fakeMongoCollection.ts`; escritura con revisión mediante `API/src/infrastructure/persistence/mongo/revisionWrite.ts`.
  - **HTTP:** `API/tests/http/testAppFactory.ts`, `adminTestHelpers.ts`, `geographyTestHelpers.ts`, `pricingTestHelpers.ts`, `operatingBalanceTestHelpers.ts` y `financeTestHelpers.ts`. Usar `await buildTestApp()` (memoria del proyecto: servidores en 127.0.0.1).
  - **Rutas del admin:** `route()` de `API/src/controllers/admin/adminRoute.ts`, como `geographyRoutes.ts` (zonas, ciudades) y `pricingRoutes.ts` (comisiones).
  - **Admin:** páginas como `ADMIN/src/app/features/geography/pages/{zones-page, zone-editor-page}/` y `ADMIN/src/app/features/pricing/pages/commissions-page/`, con `components/inherited-field/`, `settings/components/{country-picker, revision-conflict}/` y `core/auth/auth.interceptor.ts`.
  - **App:** controladores con `ChangeNotifier`, como `APP/lib/features/goalkeeper/presentation/availability_controller.dart`; clientes HTTP como `APP/lib/features/goalkeeper/data/zones_api_client.dart`; pruebas en espejo bajo `APP/test/features/**`.

---

## Phase 1: Setup

- [X] T001 En `ADMIN/` y en `APP/`, revisar `git status` en `main` y crear la rama `031-markets` (`git switch -c 031-markets`). Si hay cambios sin guardar, avisar al usuario en vez de descartarlos. `API/` ya está en `031-markets`. Anotar el commit de origen de los tres repos en `SPEC/coverage-baseline.md`.
- [X] T002 Medir la línea base y anotarla en `SPEC/coverage-baseline.md`, con el formato de `ADMIN/specs/030-goalkeeper-validation-verification/coverage-baseline.md` (conteo de pruebas y las cuatro métricas):
  - API: `npm test && npm run test:http && npm run test:architecture && npm run lint` y `npx vitest run --coverage`;
  - admin: `npm test -- --coverage`;
  - app: `flutter test --coverage`, con el porcentaje de `coverage/lcov.info`.
- [X] T003 En `API/`, instalar con la misma versión mayor que los `@turf/*` existentes (research §2, §3):
  - `npm install @turf/boolean-disjoint@^7.4.0`;
  - `npm install -D @turf/buffer@^7.4.0`.

  Verificar que `API/package.json` y `API/package-lock.json` solo cambian en esas dos entradas.

---

## Phase 2: Foundational (bloquea todas las historias)

**Propósito:** la sede existe como entidad; zonas, reservas, perfiles y configuraciones apuntan a `marketId`; un solo `MarketContext` reemplaza las lecturas ciudad → región → país; los datos de dev se rehacen. Al terminar, todo lo anterior sigue en verde con Medellín como sede, y el comportamiento de cotización, ofertas, saldo y facturación es el mismo que antes.

### Dominio y persistencia de la sede

- [X] T004 [P] Escribir `API/tests/unit/domain/markets/market.test.ts` (data-model §1):
  - crea en `draft`;
  - valida `name` (2–60, recortado), `timeZone` IANA (`isValidTimeZone`) y `mapCenter` (rangos);
  - `countryId` es obligatorio;
  - transiciones: `enable` desde `draft` y `disabled`; `disable` solo desde `enabled`; nunca vuelve a `draft`;
  - `enable` y `disable` registran fecha y autor;
  - `withEdits` no acepta `countryId`.
- [X] T005 Implementar `API/src/domain/markets/market.ts` hasta que T004 pase. Clase `Market extends Entity<string>` con `revision` (`readRevision`), los estados `MARKET_STATUSES` y los métodos `enable(by, now)`, `disable(by, now)` y `withEdits({ name?, timeZone?, mapCenter? })`. Lanza un error de dominio en una transición inválida.
- [X] T006 [P] Escribir `API/tests/unit/infrastructure/persistence/mongo/marketRepository.test.ts`, con `fakeMongoCollection`:
  - `create`, `getById`, `getByIds`;
  - `listByCountry`, `listEnabled` ordenado por nombre;
  - `update` con revisión (`stale`);
  - el índice `country_name_unique` usa `nameKey` en minúsculas y sin tildes;
  - el error de clave duplicada se traduce a `name_taken`.
- [X] T007 Implementar `API/src/infrastructure/persistence/mongo/marketRepository.ts` (`MARKETS_COLLECTION = 'markets'`, `ensureIndexes`) y los puertos `IMarketRepository` (lectura) y `IAdminMarketRepository` (escritura) en `API/src/application/features/markets/common/ports.ts`. Registrarlo en `API/src/infrastructure/di.ts`. Crear `API/tests/fakes/fakeMarketRepository.ts`.

### Zonas por sede

- [X] T008 [P] Actualizar `API/tests/unit/domain/zones/zone.test.ts` para que `Zone` lleve `marketId` en vez de `cityId` (data-model §2).
- [X] T009 Cambiar `API/src/domain/zones/zone.ts` (`cityId` → `marketId`, con el comentario "inmutable") y `API/src/infrastructure/persistence/mongo/zoneRepository.ts`:
  - `getActiveByMarketId`, `listByMarket`, `summariesByMarkets`, `marketIdsWithActiveZones`;
  - índice `market_order`;
  - `toFields` sigue sin escribir `marketId` en `update`.

  Ajustar `API/tests/fakes/fakeZoneRepository.ts` y los puertos de `API/src/application/features/zones/common/ports.ts` y `geography/common/ports.ts`.

### `MarketContext` y configuración por sede

- [X] T010 [P] Escribir `API/tests/unit/domain/settings/layered.test.ts` (research §4):
  - `resolveLayered` devuelve el valor y el `origin` del primer nivel que lo define, en el orden zona → sede → país → plataforma;
  - `null` en un nivel significa que hereda;
  - el `fallback` de plataforma aparece con `origin: 'platform'`;
  - sin valor en ningún nivel devuelve `{ value: null, origin: null }`.
- [X] T011 Implementar `API/src/domain/settings/layered.ts` (`SettingLevel`, `Resolved<T>`, `resolveLayered`). Reescribir `inherited()` de `API/src/application/features/goalkeeperRequests/common/resolveBookingSettings.ts` sobre `resolveLayered`, y renombrar el origen `'city'` a `'market'` y `'default'` a `'platform'`. Actualizar sus pruebas en `API/tests/unit/application/features/goalkeeperRequests/**`.
- [X] T012 [P] Escribir `API/tests/unit/application/features/markets/common/marketContext.test.ts`:
  - `loadMarketContext({ zoneIds })` lee zonas, sedes y países con una llamada por repositorio (se verifica con contadores en los fakes);
  - `zone()`, `market()`, `country(marketId)`, `currency(marketId)`, `timeZone(marketId)` y `levelsForZone(zoneId)`;
  - una zona cuya sede no existe lanza `InvalidConfigurationError`;
  - `loadMarketContext({ marketIds })` funciona sin zonas.
- [X] T013 Implementar `API/src/application/features/markets/common/marketContext.ts` hasta que T012 pase.
- [X] T014 Cambiar los alcances `city` por `market` en el dominio y en Mongo (data-model §4):
  - `API/src/domain/pricing/bookingSettings.ts` (`BookingSettingsScope`);
  - `API/src/domain/pricing/rentalRate.ts`;
  - `API/src/domain/operatingBalance/commissionSetting.ts`;
  - `API/src/domain/pricing/unverifiedDiscount.ts`;
  - sus repositorios en `API/src/infrastructure/persistence/mongo/{bookingSettingsRepository, rentalRateRepository, commissionSettingRepository, unverifiedDiscountRepository}.ts` (filtros `findFor({ zoneIds, marketIds, countryIds })`);
  - sus fakes.

  Actualizar las pruebas de dominio y de repositorio existentes **solo** en el nombre del alcance.
- [X] T015 Reemplazar las lecturas ciudad → región → país por `MarketContext`, sin cambiar el comportamiento. Las pruebas existentes de cada archivo deben seguir en verde con los fakes adaptados. Archivos:
  - `API/src/application/features/operatingBalance/common/commissionResolver.ts`;
  - `API/src/application/features/operatingBalance/common/vatRateResolver.ts`;
  - `API/src/application/features/pricing/common/unverifiedDiscountResolver.ts`;
  - `API/src/application/features/pricing/common/pricingGeography.ts`;
  - `API/src/application/features/goalkeeperRequests/common/{serviceArea.ts, pricing.ts, quoteEvaluation.ts}`;
  - `API/src/application/features/bookingLifecycle/common/countrySettingsResolver.ts` (se elimina; sus usos pasan a `MarketContext`);
  - `API/src/application/features/operatingBalance/common/goalkeeperOperatingBalanceContext.ts`;
  - `API/src/application/features/dashboard/common/{geography.ts, scope.ts}`.

  En `serviceArea.ts`, la zona horaria sale de `market.timeZone`, y el resultado `time_zone_not_configured` se elimina junto con sus pruebas.

### Reservas y perfiles con `marketId`

- [X] T016 Renombrar `MatchDetails.cityId` → `marketId` en `API/src/domain/bookings/matchDetails.ts`, y propagarlo a:
  - `API/src/domain/bookings/{quote.ts, goalkeeperRequest.ts, booking.ts}`;
  - `API/src/infrastructure/persistence/mongo/{quoteRepository, goalkeeperRequestRepository, bookingRepository, requestAdminReader}.ts`;
  - `API/tests/fixtures/{quoteFixtures, offerFixtures, bookingStatusCombinations}.ts`.

  Correr `npm test` y corregir cada referencia hasta verde (es un renombre mecánico).
- [X] T017 Renombrar `availability.cityId` → `availability.marketId` en `API/src/domain/goalkeepers/{goalkeeperRegistration.ts, goalkeeperProfile.ts}` y en `API/src/infrastructure/persistence/mongo/{goalkeeperRegistrationRepository, goalkeeperProfileRepository}.ts` (índice `market`). Propagarlo a:
  - `API/src/application/features/goalkeepers/**`;
  - `API/src/application/features/notifications/common/**`;
  - `API/src/application/features/bookingLifecycle/handlers/**`;
  - `API/tests/fixtures/{vettingFixtures, operatingBalanceFixtures}.ts`;
  - los fakes.

  En `validateAvailabilitySelection.ts` se valida contra la sede (existe y las zonas son activas de esa sede). La regla de sede `enabled` llega en US5.
- [X] T018 Quitar `zoneCityId` y `timeZone` de `API/src/domain/locations/city.ts` y de `API/src/infrastructure/persistence/mongo/cityRepository.ts`. Eliminar:
  - `API/src/application/features/locations/common/resolveAnchorCityId.ts`;
  - `canUseAnchor` de `API/src/domain/locations/locationRules.ts`;
  - `checkZoneCity` de `API/src/application/features/geography/common/zoneChecks.ts`;
  - `cityState()` y `CityState` de `geography/common/views.ts`.

  Ajustar las pruebas de esos archivos: se borran los casos de anclas, y no se reescriben como casos de sede.
- [X] T019 Actualizar los helpers HTTP `API/tests/http/{geographyTestHelpers, pricingTestHelpers, operatingBalanceTestHelpers, financeTestHelpers, adminTestHelpers}.ts` para que siembren una sede (`seedMarket({ name, countryId, timeZone, status: 'enabled' })`) con zonas, en vez de una ciudad ancla. Correr `npm run test:http` y corregir hasta verde. Los casos que prueban anclas o `time_zone_not_configured` se eliminan.
- [X] T020 [P] Escribir `API/tests/architecture/marketTerms.test.ts` (research §12). Falla si en `API/src/`:
  - aparecen `zoneCityId`, `anchorCity` o `resolveAnchorCityId`;
  - algún archivo bajo `application/features/{pricing, goalkeeperRequests, operatingBalance, notifications, bookingLifecycle, deposits, markets}` importa `IRegionRepository` o `IAdminRegionRepository`.

  Correrlo con `npm run test:architecture`.

### Datos de dev

- [X] T021 [P] Escribir `API/tests/unit/scripts/reset031Markets.test.ts`, contra colecciones en memoria:
  - sin `--confirm-dev` aborta;
  - con la URI de producción aborta;
  - con datos de ejemplo:
    - crea Medellín con las zonas de la antigua ancla;
    - encoge cada zona y verifica con `findZoneConflicts` (stub hasta T027) que quede sin conflictos;
    - convierte `scope: city` a `market`;
    - pasa `paymentGatewaySettings` a `{ scope, refId }`;
    - quita `zoneCityId`/`timeZone` de `cities`;
    - borra las colecciones transaccionales de research §15;
    - asigna `scopes: [{ kind: 'platform' }]` al equipo;
    - no toca `users`, `staffRoles`, `countries`, `regions`, `documentTypes` ni `matchSurfaces`.
- [X] T022 Implementar `API/scripts/reset-031-markets.ts` y su lógica en `API/scripts/lib/reset031.ts` (patrón de `scripts/lib/migrate029.ts`), con `@turf/buffer` a −0,003 km. Si queda algún conflicto, el script lo reporta y termina con código 1. Agregar el archivo a `EXEMPT_FILES` de `marketTerms.test.ts` si nombra `zoneCityId`.

**Checkpoint:** `npm test && npm run test:http && npm run test:architecture && npm run lint && npm run build` en verde en `API/`.

---

## Phase 3: User Story 1 - Crear una sede y dibujar sus zonas (Priority: P1) 🎯 MVP

**Goal:** el admin crea sedes y dibuja zonas que nunca tocan otra zona activa.

**Independent Test:** crear una sede, dibujar dos zonas que no se toquen, comprobar que una tercera que toca a otra se rechaza y que la sede no aparece en la app.

### Tests

- [X] T023 [P] [US1] Escribir `API/tests/unit/domain/zones/zoneConflicts.test.ts` (research §2):
  - `findZoneConflicts(geometry, selfId, activeZones)`:
    - detecta área en común;
    - detecta un borde compartido exacto;
    - detecta un solo vértice compartido;
    - no detecta dos zonas separadas por 1 m;
    - ignora `selfId`;
    - ignora zonas con geometría inválida;
  - descarta por caja envolvente sin llamar a `booleanDisjoint` (espía);
  - funciona con un `MultiPolygon`.
- [X] T024 [P] [US1] Escribir `API/tests/unit/application/features/markets/commands/createMarket.test.ts` y `updateMarket.test.ts`:
  - crea en `draft`;
  - errores `country_not_found`, `country_without_currency`, `invalid_time_zone` y `market_name_taken`;
  - `update` con `revision` (`stale`);
  - `countryId` en la edición → `country_immutable`.
- [X] T025 [P] [US1] Escribir `API/tests/unit/application/features/geography/commands/saveZone.test.ts` (reemplaza los casos de advertencias):
  - zona activa nueva que toca una activa de otra sede → `zone_conflict` con `{ zoneId, zoneName, marketId, marketName }`;
  - zona que cruza una inactiva → se guarda;
  - reactivar una inactiva que choca → `zone_conflict`;
  - redibujar una activa que pasa a tocar a otra → `zone_conflict`;
  - `marketId` distinto en la edición → `zone_market_immutable`;
  - sede inexistente → `market_not_found`.
- [X] T026 [P] [US1] Escribir `API/tests/http/controllers/adminMarkets.test.ts` (parte de US1) y `adminZonesConflicts.test.ts`, según `SPEC/contracts/markets-api.md` §C (`GET`, `POST`, `PATCH`) y §D. Reemplazar en `adminZones.test.ts` los casos de `acknowledgeWarnings` por los nuevos.

### Implementation

- [X] T027 [US1] En `API/src/domain/zones/zoneGeometry.ts`:
  - implementar `findZoneConflicts` con `booleanDisjoint` de `@turf/boolean-disjoint` y el descarte por caja envolvente;
  - eliminar `zoneGeometryWarnings`, `NeighborZone.displayOrder` como criterio, `OVERLAP_THRESHOLD_SQUARE_METERS`, `FAR_FROM_CITY_KM` y las importaciones que queden sin uso (`area`, `intersect`, `pointToPolygonDistance`, si nadie más las usa).

  T023 debe pasar.
- [X] T028 [US1] Implementar los comandos y consultas `createMarket`, `updateMarket`, `listMarkets` y `getMarket` en `API/src/application/features/markets/{commands, queries}/`, con `marketViews.ts`. T024 debe pasar.
- [X] T029 [US1] Cambiar `API/src/application/features/geography/{commands/saveZone, queries/validateZoneGeometry, queries/listZones, queries/listZoneShapes, common/zoneChecks.ts}` para usar `marketId`, `findZoneConflicts` contra todas las zonas activas (`zones.listActive()`) y las vecinas por caja envolvente (`?neighbors=true`). Quitar `acknowledgeWarnings` y `needsAcknowledgement`. T025 debe pasar.
- [X] T030 [US1] Rutas:
  - `API/src/controllers/admin/marketsRoutes.ts` (`GET`/`POST`/`PATCH` de §C) con su zod en `API/src/controllers/requests/markets/marketRequests.ts`;
  - cambiar las rutas de zonas en `geographyRoutes.ts` y `API/src/controllers/requests/geography/geographyRequests.ts` (§D);
  - permisos `markets.read` y `markets.manage` en `API/src/domain/staff/permissionCatalog.ts`;
  - montar en `API/src/controllers/adminController.ts`;
  - documentar en `API/src/infrastructure/openapi/{openapiSpec.ts, openapiGeography.ts}`.

  T026 debe pasar.
- [X] T031 [P] [US1] Admin, pruebas:
  - `ADMIN/src/app/features/markets/data/markets-api.service.spec.ts` (llamadas de §C);
  - `ADMIN/src/app/features/markets/pages/markets-page/markets-page.spec.ts` (tabla, botón "Nueva sede" según permiso);
  - `ADMIN/src/app/features/markets/pages/market-form-page/market-form-page.spec.ts` (crear, editar, país no editable, conflicto de revisión);
  - casos nuevos en `ADMIN/src/app/features/geography/pages/zone-editor-page/zone-editor-page.spec.ts` (vecinas en gris, `zone_conflict` resaltado, "Guardar" deshabilitado, sin paso de advertencias).
- [X] T032 [US1] Admin, implementación:
  - `ADMIN/src/app/features/markets/{data/markets-api.service.ts, data/markets.models.ts, pages/markets-page/, pages/market-form-page/, markets.routes.ts}`;
  - ruta `sedes` en `ADMIN/src/app/app.routes.ts` y entrada en `ADMIN/src/app/core/navigation/navigation.ts`;
  - editor de zonas (`zone-editor-page`, `zones-api.service.ts`, `geography.models.ts`) con `marketId` y vecinas (`contracts/markets-ui.md` U3, U4, U6).

  T031 debe pasar.
- [X] T033 [P] [US1] Admin, geografía como catálogo de facturación (U8): `cities-page` y `city-page` pasan a "Municipios (facturación)", sin ancla, zona horaria ni zonas; `regions-page` pasa a "Departamentos". Ajustar sus `.spec.ts` y `city-labels.ts`.

**Checkpoint:** API y admin en verde. Se crea una sede y sus zonas desde el admin.

---

## Phase 4: User Story 2 - Configurar una sede heredando del país (Priority: P1)

**Goal:** cada configuración se resuelve zona → sede → país → plataforma según FR-014, y el admin muestra el origen de cada valor.

**Independent Test:** ventana de 14 días en el país, sede sin valor → "14 · Del país"; 7 en la sede → "7 · De la sede" y la cotización usa 7.

### Tests

- [X] T034 [P] [US2] Escribir casos en `API/tests/unit/domain/pricing/bookingSettings.test.ts`:
  - `checkInWindow` y `noShowGraceMinutes` se aceptan en `market`;
  - `goalkeeperPenalties` en `market` → `field_not_allowed_at_level`;
  - `offerReminderIntervalMinutes` (1..1440) y `offerMaxReminders` (0..10) en `country` y `market`.
- [X] T035 [P] [US2] Escribir casos en `API/tests/unit/application/features/bookingLifecycle/**` (check-in y no-show): la sede que define `checkInWindow` o `noShowGraceMinutes` gana sobre el país, y sin ninguno aplica el valor de plataforma.
- [X] T036 [P] [US2] Escribir casos en `API/tests/unit/application/features/notifications/common/offerSender.test.ts`: `maxReminders` e intervalo por la sede de cada solicitud; sin configuración, el valor de entorno con `origin: 'platform'` (research §6).
- [X] T037 [P] [US2] Escribir `API/tests/http/controllers/adminBookingSettings.test.ts` (casos nuevos): `GET`/`PUT /admin/booking-settings/markets/:marketId`, `origin` en cada campo, `field_not_allowed_at_level`, y que la ruta `/cities/:cityId` ya no existe. Casos nuevos en `adminRentalRates.test.ts`, `adminCommissions.test.ts` y `adminUnverifiedDiscounts.test.ts` con `scope: 'market'`.

### Implementation

- [X] T038 [US2] Implementar en `API/src/domain/pricing/{bookingSettings.ts, bookingSettingsRules.ts, adminLimits.ts}` los campos y reglas nuevos. T034 debe pasar.
- [X] T039 [US2] Implementar la lectura por sede de `checkInWindow` y `noShowGraceMinutes` en los resolvers de check-in y no-show de `API/src/application/features/bookingLifecycle/**`, con `MarketContext` y `resolveLayered`. T035 debe pasar.
- [X] T040 [US2] Implementar en `API/src/application/features/notifications/common/offerSender.ts` y `API/src/infrastructure/di.ts` la resolución por sede de los recordatorios. `config.ts` pasa los valores de entorno como valor de plataforma. `API/src/infrastructure/systemParameterSource.ts` los sigue mostrando como "valor por defecto". T036 debe pasar.
- [X] T041 [US2] Rutas y comandos:
  - `API/src/application/features/pricing/{commands/saveCityBookingSettings → saveMarketBookingSettings, queries/getCityBookingSettings → getMarketBookingSettings, queries/listPricingAreas, queries/getPricingPreview, common/bookingRules.ts, common/views.ts}`;
  - `API/src/controllers/admin/pricingRoutes.ts`;
  - `API/src/controllers/requests/pricing/{pricingRequests, unverifiedDiscountRequests}.ts`;
  - OpenAPI.

  T037 debe pasar.
- [X] T042 [P] [US2] Admin, pruebas:
  - `ADMIN/src/app/features/pricing/pages/city-booking-rules-page` pasa a `market-booking-rules-page/market-booking-rules-page.spec.ts` (campos nuevos, origen "De la sede", "Del país" o "Valor de la plataforma", sin penalidades);
  - casos en `country-booking-rules-page.spec.ts` (recordatorios y la alerta "aplica a todas sus sedes");
  - `rental-rates-page`, `commissions-page`, `unverified-discount-page` y `pricing-simulator-page` con "sede".
- [X] T043 [US2] Admin, implementación (U7):
  - `ADMIN/src/app/features/pricing/{data/*.ts, pages/**}` y `components/inherited-field/` (etiquetas de origen nuevas);
  - todo texto "ciudad" pasa a "sede".

  T042 debe pasar.

**Checkpoint:** la configuración de una sede hereda del país y se ve el origen de cada valor.

---

## Phase 5: User Story 3 - Habilitar y deshabilitar una sede (Priority: P1)

**Goal:** una sede solo se habilita con la lista de chequeo completa. Deshabilitarla solo bloquea solicitudes nuevas.

**Independent Test:** habilitar una sede sin tarifas → rechazo; completarla y habilitarla; deshabilitarla → la solicitud existente sigue buscando portero.

### Tests

- [X] T044 [P] [US3] Escribir `API/tests/unit/application/features/geography/common/readinessForMarkets.test.ts`:
  - los ítems de `readiness.ts` sin los de ancla y región;
  - ítem nuevo "al menos una zona activa";
  - sin ítems DANE;
  - una sede lista cotiza con las mismas funciones (FR-008, SC-003);
  - una lectura por fuente para N sedes.
- [X] T045 [P] [US3] Escribir `API/tests/unit/application/features/markets/commands/{enableMarket, disableMarket, deleteMarket}.test.ts`:
  - `not_ready` con los ítems faltantes;
  - `already_enabled`, `not_enabled`;
  - `stale`;
  - `reason` obligatorio al deshabilitar;
  - `in_use` con `{ kind, count }`, en el orden de data-model §12;
  - se audita cada transición.
- [X] T046 [P] [US3] Escribir `API/tests/unit/infrastructure/persistence/mongo/referenceUsage.test.ts` (casos nuevos): `marketUsage` cuenta cada tipo de registro, en orden.
- [X] T047 [P] [US3] Completar `API/tests/http/controllers/adminMarkets.test.ts` con `enable`, `disable`, `delete` y `readiness` (§C). Con un miembro de alcance de plataforma; los casos de alcance se agregan en US8.

### Implementation

- [X] T048 [US3] Implementar `readinessForMarkets` en `API/src/application/features/geography/common/readiness.ts`, y adaptar `API/src/application/features/geography/queries/getReadiness/` y `API/src/controllers/admin/readinessRoutes.ts` a sedes. T044 debe pasar.
- [X] T049 [US3] Implementar `marketUsage` en `API/src/infrastructure/persistence/mongo/referenceUsage.ts` y en su puerto en `API/src/application/features/markets/common/marketUsage.ts`. T046 debe pasar.
- [X] T050 [US3] Implementar `enableMarket`, `disableMarket`, `deleteMarket` y `getMarketReadiness` en `API/src/application/features/markets/`, con sus rutas en `marketsRoutes.ts`, el permiso `markets.lifecycle` y las acciones de auditoría `market.enable`, `market.disable` y `market.delete`. T045 y T047 deben pasar.
- [X] T051 [P] [US3] Admin, pruebas: `ADMIN/src/app/features/markets/pages/market-page/market-page.spec.ts`:
  - pestañas Resumen, Zonas, Configuración y Lista de chequeo;
  - "Habilitar" con faltantes no deja confirmar;
  - "Deshabilitar" exige motivo y muestra el texto de U5;
  - "Eliminar" con `in_use` dice qué la usa;
  - las acciones se ocultan sin `markets.lifecycle`.

  Casos en `readiness-dashboard-page.spec.ts` (lista sedes).
- [X] T052 [US3] Admin, implementación (U5): `ADMIN/src/app/features/markets/{pages/market-page/, components/enable-market-dialog/, components/disable-market-dialog/, components/delete-market-dialog/, components/market-readiness/}` y `geography/pages/readiness-dashboard-page`. T051 debe pasar.

**Checkpoint:** sedes con ciclo de vida completo desde el admin.

---

## Phase 6: User Story 4 - El cliente busca portero en un punto (Priority: P1)

**Goal:** un punto → una zona activa → una sede, con dos mensajes distintos cuando no se puede cotizar.

**Independent Test:** cotizar dentro de una zona habilitada, fuera de toda zona, en una zona inactiva y en una zona de una sede en borrador. Comprobar el precio y los dos mensajes.

### Tests

- [X] T053 [P] [US4] Escribir casos en `API/tests/unit/application/features/goalkeeperRequests/common/serviceArea.test.ts` (research §8):

  | Caso | Resultado |
  |---|---|
  | Zona activa de sede `enabled` | `ok` con la sede y `market.timeZone` |
  | Zona activa de sede `disabled` | `market_unavailable` |
  | Zona activa de sede `draft` | `location_not_covered` |
  | Sin zona activa, pero con una inactiva de sede `enabled` o `disabled` | `market_unavailable` |
  | Inactiva de sede `draft` | `location_not_covered` |
  | Nada | `location_not_covered` |
  | Activa e inactiva a la vez | Gana la activa |

- [X] T054 [P] [US4] Escribir casos en `API/tests/unit/application/features/goalkeeperRequests/commands/confirmBooking.test.ts`: una cotización válida de una sede que pasó a `disabled` → `market_unavailable`. Las solicitudes ya creadas en esa sede siguen recibiendo ofertas y aceptaciones (caso en `acceptBooking.test.ts`).
- [X] T055 [P] [US4] Escribir `API/tests/http/controllers/marketsApp.test.ts` (A1, A2, A4, A5).
- [X] T056 [P] [US4] Escribir `API/tests/unit/infrastructure/persistence/mongo/zoneRepository.test.ts` (casos nuevos): `findAnyContainingPoint` devuelve una zona inactiva cuando no hay activa.

### Implementation

- [X] T057 [US4] Implementar `findAnyContainingPoint` en `API/src/infrastructure/persistence/mongo/zoneRepository.ts` y en su fake. T056 debe pasar.
- [X] T058 [US4] Implementar los resultados nuevos en `API/src/application/features/goalkeeperRequests/common/serviceArea.ts`, `queries/{getServiceQuote, getBookingConfig}` y `commands/{issueServiceQuote, confirmBooking}`. Las respuestas usan `market: { id, name }`. T053 y T054 deben pasar.
- [X] T059 [US4] Rutas de la app:
  - `API/src/controllers/marketsController.ts` (`GET /markets`, montado en `API/src/app.ts`), con `listEnabledMarkets`;
  - `API/src/controllers/zonesController.ts` (`?marketId=`) y `API/src/application/features/zones/queries/getZonesByCity` → `getZonesByMarket`;
  - `API/src/controllers/goalkeeperRequestsController.ts` (`409 market_unavailable`);
  - OpenAPI.

  T055 debe pasar.
- [X] T060 [P] [US4] App, pruebas: casos en `APP/test/features/search/data/goalkeeper_requests_api_client_test.dart` (`market_unavailable` → `MarketUnavailable(marketName)` en cotización y confirmación) y en las pruebas de la pantalla de búsqueda (mensaje de M5 y vuelta a la búsqueda al confirmar).
- [X] T061 [US4] App, implementación: `APP/lib/features/search/domain/goalkeeper_request_failure.dart` (`MarketUnavailable`), `APP/lib/features/search/data/goalkeeper_requests_api_client.dart` y la presentación de búsqueda (M5). Leer `market` en vez de la ciudad en las respuestas de cotización y configuración. T060 debe pasar.

**Checkpoint:** MVP de las historias P1. Quickstart §1–§4 de punta a punta.

---

## Phase 7: User Story 5 - El portero se registra en una sede con sus datos de facturación (Priority: P2)

**Goal:** registro con la lista de sedes habilitadas y la sección "Datos de facturación". La factura usa la dirección real.

**Independent Test:** el portero solo ve sedes habilitadas, no puede enviar sin facturación, y las facturas nuevas usan los datos nuevos mientras las anteriores conservan los suyos.

### Tests

- [X] T062 [P] [US5] Escribir casos en `API/tests/unit/domain/goalkeepers/goalkeeperRegistration.test.ts` y `goalkeeperProfile.test.ts`:
  - sección `billing` (`cityId`, `address` 5–120, `addressComplement` 0–80);
  - la activación exige municipio y dirección (`incomplete_registration`, `missing: ['billing']`);
  - el perfil copia `billing` al activar.
- [X] T063 [P] [US5] Escribir `API/tests/unit/application/features/goalkeepers/commands/{saveBillingSection, updateGoalkeeperBilling}.test.ts` (`invalid_city` si el municipio no existe o no tiene DANE) y casos en `saveAvailabilitySection.test.ts` (`invalid_market` si la sede no está `enabled`).
- [X] T064 [P] [US5] Escribir casos en `API/tests/unit/application/features/invoicing/common/{documentForMovement, issueDocument}.test.ts`:
  - el comprador usa `profile.billing` (municipio, DANE, dirección y complemento), no la sede;
  - cambiar la dirección no altera documentos ya creados.

  Caso en `API/tests/unit/infrastructure/invoicing/siigoInvoicingProvider.test.ts`: `address.address` es la dirección real con su complemento.
- [X] T065 [P] [US5] Escribir `API/tests/http/controllers/goalkeeperBilling.test.ts` (A6, A7 de facturación, A3).

### Implementation

- [X] T066 [US5] Implementar `billing` en `API/src/domain/goalkeepers/{goalkeeperRegistration.ts, goalkeeperProfile.ts}`, en sus repositorios y en la activación (`API/src/application/features/goalkeepers/commands/activateGoalkeeper/`). T062 debe pasar.
- [X] T067 [US5] Implementar `saveBillingSection` y `updateGoalkeeperBilling` en `API/src/application/features/goalkeepers/commands/`; la regla de sede `enabled` en `validateAvailabilitySelection.ts`; y las rutas `PATCH /goalkeepers/me/billing` y `PUT /goalkeepers/me/profile/billing` en `API/src/controllers/goalkeeperController.ts`, con zod en `API/src/controllers/requests/goalkeepers/`. `GET /goalkeepers/me` devuelve `billing` y `availability.marketName`. T063 debe pasar.
- [X] T068 [US5] Implementar el comprador nuevo en `API/src/domain/invoicing/invoicingDocument.ts` (`InvoicingBuyer.address`, `addressComplement`), `API/src/application/features/invoicing/common/{documentForMovement.ts, issueDocument.ts}` y `API/src/infrastructure/invoicing/siigoInvoicingProvider.ts`. T064 debe pasar.
- [X] T069 [US5] Cambiar `API/src/application/features/locations/queries/getCities/` en el buscador de municipios (A3: `{ id, name, stateName }`, solo con DANE válido, vacío sin `q`) y `API/src/controllers/locationsController.ts`. T065 debe pasar.
- [X] T070 [P] [US5] App, pruebas:
  - `APP/test/features/goalkeeper/data/markets_api_client_test.dart`;
  - casos en `goalkeepers_api_client_test.dart` (sección de facturación, `marketId`);
  - `APP/test/features/goalkeeper/presentation/availability_controller_test.dart` (lista de sedes, sin buscador, sin sedes → mensaje de M1);
  - `billing_section_controller_test.dart` (validación, autosave, búsqueda de municipio);
  - casos en `goalkeeper_registration_hub_controller_test.dart` ("Enviar registro" deshabilitado sin facturación).
- [X] T071 [US5] App, implementación (M1, M2, M3):
  - `APP/lib/features/goalkeeper/data/markets_api_client.dart`;
  - `domain/{market.dart, billing_data.dart, municipality.dart}`;
  - `presentation/{availability_screen.dart, availability_controller.dart, billing_section_screen.dart, billing_section_controller.dart, goalkeeper_registration_hub_screen.dart}`;
  - la edición de facturación en `presentation/profile_sections/`.

  Eliminar el uso operativo de `city_search_result.dart`, `goalkeeper_city.dart` y `city_details_cache.dart` (borrarlos si quedan sin uso). T070 debe pasar.

**Checkpoint:** quickstart §5.

---

## Phase 8: User Story 6 - El portero cambia de sede (Priority: P2)

**Goal:** cambio de sede con sus bloqueos, solo desde la app.

**Independent Test:** cambio sin reservas pendientes → pierde zonas; con una reserva aceptada → rechazo; a otro país con saldo → rechazo con explicación.

### Tests

- [X] T072 [P] [US6] Escribir `API/tests/unit/domain/goalkeepers/marketChange.test.ts`: reglas puras de data-model §7 (`same_market`, `pending_bookings`, `balance_not_zero`, `deposit_pending`, `account_closure_open`). Las de saldo, depósito y cierre solo aplican si cambia el país.
- [X] T073 [P] [US6] Escribir `API/tests/unit/application/features/goalkeepers/commands/changeGoalkeeperMarket.test.ts`:
  - cada resultado de data-model §7;
  - mismo país: se permite con depósito pendiente;
  - otro país con saldo 0: `operatingBalances.currency` cambia y los movimientos conservan su moneda;
  - las ofertas de la sede anterior dejan de ser elegibles (`offerEligibilityService`);
  - todo ocurre en una transacción (el fake falla a mitad y no queda nada a medias).
- [X] T074 [P] [US6] Escribir casos en `updateGoalkeeperAvailability.test.ts`: con un `marketId` distinto → `use_market_change`; solo cambia zonas de la sede actual.
- [X] T075 [P] [US6] Escribir `API/tests/http/controllers/goalkeeperMarketChange.test.ts` (A7), incluido que no existe ninguna ruta de admin para cambiar de sede.

### Implementation

- [X] T076 [US6] Implementar `API/src/domain/goalkeepers/marketChange.ts`. T072 debe pasar.
- [X] T077 [US6] Implementar `API/src/application/features/goalkeepers/commands/changeGoalkeeperMarket/` con `withTransaction`, y los puertos de lectura que haga falta: reservas `assigned` del portero, depósito `pending`, cierre abierto, `operatingBalances.currency` (en `API/src/infrastructure/persistence/mongo/**`). T073 debe pasar.
- [X] T078 [US6] Cambiar `API/src/application/features/goalkeepers/commands/updateGoalkeeperAvailability/` (solo zonas) y agregar `POST /goalkeepers/me/market-change` en `API/src/controllers/goalkeeperController.ts`, con zod y OpenAPI. T074 y T075 deben pasar.
- [X] T079 [P] [US6] App, pruebas: `APP/test/features/goalkeeper/presentation/change_market_controller_test.dart` (pasos, diálogo de confirmación, cada error de M4 con su mensaje y enlace) y casos en las pruebas de "Mis zonas" (solo la sede actual).
- [X] T080 [US6] App, implementación (M4): `APP/lib/features/goalkeeper/presentation/{change_market_screen.dart, change_market_controller.dart}`, la entrada "Cambiar dónde tapo" en `profile_sections/location_section.dart` y `goalkeepers_api_client.dart` (`changeMarket`). T079 debe pasar.

**Checkpoint:** quickstart §6.

---

## Phase 9: User Story 7 - El administrador trabaja con un selector de país y sede (Priority: P2)

**Goal:** `X-Scope`, un nivel por ruta y el selector por pestaña en la URL.

**Independent Test:** "Colombia › Medellín" filtra Solicitudes; Porteros muestra todo Colombia con el chip; dos pestañas independientes; "Todas" muestra los totales por país.

### Tests

- [X] T081 [P] [US7] Escribir `API/tests/unit/infrastructure/auth/middleware/requireScope.test.ts`:
  - parseo de `all`, `country:` y `market:`;
  - `invalid_scope`, `scope_not_found`, `scope_denied`;
  - sin header → el alcance más amplio;
  - `req.adminScope` por nivel (`market`, `country`, `platform`);
  - el rol `owner` equivale a plataforma.
- [X] T082 [P] [US7] Escribir casos en `API/tests/unit/infrastructure/audit/audited.test.ts`: cada entrada lleva `scope: { countryId, marketId }`.
- [X] T083 [P] [US7] Escribir `API/tests/http/controllers/adminScope.test.ts` (§B con un miembro de plataforma):
  - nivel `market` en `/admin/requests` y `/admin/cases`;
  - nivel `country` en `/admin/goalkeepers` y `/admin/operating-balances`, con `?marketId=`;
  - `platform` ignora el header;
  - `X-Scope: all` con dos países → `{ countries: [...] }` sin sumar monedas;
  - `GET /admin/me/scopes`.

  Ajustar `adminDashboard.test.ts`, `adminRequests.test.ts` y `adminCasesFilters.test.ts`: los parámetros `?countryId&cityId` se reemplazan por el header.

### Implementation

- [X] T084 [US7] Implementar `API/src/infrastructure/auth/middleware/requireScope.ts`, el tipo `AdminScope` en `API/src/application/features/staff/common/ports.ts` y `level` en `AdminRouteGuard`/`createAdminRouting` de `API/src/controllers/admin/adminRoute.ts`. Declarar el nivel de **cada** ruta existente según §B. T081 debe pasar.
- [X] T085 [US7] Pasar el alcance a los handlers de listados:
  - **sede:** `listRequestsAdmin`, `listCasesAdmin`, `getDashboardSummary`, `getDashboardAreas`;
  - **país:** `listGoalkeepers`, `listGoalkeeperRegistrations`, `listOperatingBalancesAdmin`, `listDeposits`, `exportDeposits`, `listInvoicingDocuments`, `exportDocuments`, `listAccountClosures`.

  Quitar sus parámetros `countryId`/`cityId` en `API/src/controllers/requests/**`, y devolver `market: { id, name }` por fila y totales por país. T083 debe pasar.
- [X] T086 [US7] Implementar `scope` en `API/src/infrastructure/audit/audited.ts` y en el documento de `adminAuditLog`. Implementar `GET /admin/me/scopes` en `API/src/controllers/adminController.ts`. T082 debe pasar.
- [X] T087 [P] [US7] Admin, pruebas:
  - `ADMIN/src/app/core/scope/scope.service.spec.ts` (selección desde la URL: `todas`, `co`, `co~<id>`);
  - `scope.interceptor.spec.ts` (solo `/admin/*`, no `/admin/me*`);
  - `ADMIN/src/app/core/layout/scope-picker.component.spec.ts` (opciones por alcance, plataforma deshabilitado, `scope_denied` → vuelve al más amplio);
  - casos en `navigation.spec.ts` (nivel por entrada) y en las páginas de nivel sede y país (columna "Sede", chip de filtro, totales por país).
- [X] T088 [US7] Admin, implementación (U1, U2, U10):
  - `ADMIN/src/app/core/scope/{scope.service.ts, scope.interceptor.ts, scope.models.ts}`;
  - `core/layout/scope-picker.component.ts` en `shell.component.html`;
  - prefijo `/s/:scope` en `ADMIN/src/app/app.routes.ts`;
  - interceptor en `app.config.ts`;
  - `level` en `navigation.ts`;
  - columna, filtro y totales en `features/{requests, cases, dashboard, goalkeepers, finance, closures}/**`;
  - alerta de país en `pricing/pages/country-booking-rules-page`, `tax-settings-page` y `settings/pages/{gateway-settings-page, invoicing-settings-page}`.

  T087 debe pasar.

**Checkpoint:** quickstart §7.1–§7.3.

---

## Phase 10: User Story 8 - Acceso del equipo por país y sede (Priority: P3)

**Goal:** alcances por miembro, consultas por id según el alcance y atribución histórica a la sede.

**Independent Test:** un operador de Medellín solo ve Medellín, no cambia el estado de la sede y no abre por enlace datos de otra sede. Las comisiones de un portero que se fue siguen en Medellín.

### Tests

- [X] T089 [P] [US8] Escribir casos en `API/tests/unit/domain/staff/staffMember.test.ts`: `scopes` (al menos uno, sin duplicados) y `owner` implica plataforma. Escribir `API/tests/unit/domain/staff/staffScope.test.ts`: `covers(scopes, { countryId, marketId })` y `allowedMarketIds`.
- [X] T090 [P] [US8] Escribir casos en `API/tests/unit/infrastructure/auth/staffAccessResolver.test.ts`: resuelve `scopes`, e `invalidate` hace que el cambio aplique de inmediato en la instancia.
- [X] T091 [P] [US8] Escribir casos de atribución (research §11):
  - `API/tests/unit/domain/operatingBalance/balanceMovement.test.ts` (`marketId` obligatorio);
  - los handlers que crean movimientos (comisión, IVA, penalidad, reembolso, depósito, comisión de pasarela, ajuste), cada uno con el `marketId` correcto;
  - `deposit.test.ts`, `invoicingDocument.test.ts` y `goalkeeperIncident.test.ts`;
  - un portero que cambia de sede no altera el `marketId` de lo anterior.
- [X] T092 [P] [US8] Completar `API/tests/http/controllers/adminScope.test.ts` y `adminMarkets.test.ts` con un miembro de alcance solo Medellín:
  - el selector y `GET /admin/me/scopes`;
  - secciones de país filtradas por sus sedes (dato actual y dato histórico);
  - detalle por id de otra sede → `404`;
  - `enable`, `disable`, `delete` y `POST /admin/markets` → `403 scope_denied`, que sí pasan con alcance de Colombia.

  Casos en `adminStaff.test.ts` e `adminInvitation.test.ts` (`scopes`, `scopes_required`, `scope_not_found`).

### Implementation

- [X] T093 [US8] Implementar `scopes` en `API/src/domain/staff/{staffMember.ts, staffScope.ts}`, `API/src/infrastructure/persistence/mongo/staffMemberRepository.ts`, `API/src/infrastructure/auth/staffAccessResolver.ts` y `requireScope.ts` (`allowed*`), y la regla de FR-041a en `markets.lifecycle` y en la creación de sedes. T089 y T090 deben pasar.
- [X] T094 [US8] Implementar `marketId` de atribución en `API/src/domain/{operatingBalance/balanceMovement.ts, deposits/deposit.ts, invoicing/invoicingDocument.ts, goalkeepers/goalkeeperIncident.ts}`, en sus repositorios (índices de data-model §9) y en cada handler que los crea, bajo `API/src/application/features/{operatingBalance, deposits, invoicing, bookingLifecycle}/**`. T091 debe pasar.
- [X] T095 [US8] Aplicar el filtro por sedes permitidas:
  - datos actuales por `goalkeeperProfiles.marketId`, datos históricos por el `marketId` guardado, en los lectores de admin de `API/src/infrastructure/persistence/mongo/{operatingBalanceAdminReader, depositAdminReader, invoicingDocumentAdminReader, goalkeeperAdminReader, requestAdminReader}.ts`;
  - las consultas por id verifican `allowedMarketIds`/`allowedCountryIds`;
  - el equipo con `scopes` en `API/src/application/features/staff/**`, `API/src/controllers/admin/teamRoutes.ts` y su zod.

  T092 debe pasar.
- [X] T096 [P] [US8] Admin, pruebas: casos en `ADMIN/src/app/features/staff/pages/members-page/*.spec.ts` y en el diálogo de invitar y editar (campo "Alcance", al menos uno, badges); casos en `market-page.spec.ts` (acciones ocultas con alcance de sede).
- [X] T097 [US8] Admin, implementación (U9): `ADMIN/src/app/features/staff/**` con alcances; ocultar en la ficha de sede y en la lista las acciones que el alcance no permite. T096 debe pasar.

**Checkpoint:** quickstart §7.4–§7.5.

---

## Phase 11: User Story 9 - Proveedor de pagos por sede (Priority: P3)

**Goal:** la pasarela se configura por país con override por sede, nunca por zona.

**Independent Test:** un override en una sede hace que sus porteros vean los montos de la sede; "Volver al del país" lo quita.

### Tests

- [X] T098 [P] [US9] Escribir casos en `API/tests/unit/domain/payments/gatewaySettings.test.ts` (`scope: country | market`, `refId`, la moneda debe ser la del país) y en `API/tests/unit/application/features/deposits/common/depositSetup.test.ts` (`usableSettings` resuelve primero la sede y luego el país).
- [X] T099 [P] [US9] Escribir `API/tests/http/controllers/paymentGatewayByMarket.test.ts` (A8, §E): listar por país, `PUT` por sede, `scope: zone` → `invalid_scope`, quitar el override; y ajustar `adminPaymentGateways.test.ts` a las rutas nuevas.

### Implementation

- [X] T100 [US9] Implementar `scope`/`refId` en `API/src/domain/payments/gatewaySettings.ts` y en `API/src/infrastructure/persistence/mongo/paymentGatewaySettingsRepository.ts` (índice `scope_ref_unique`), y la resolución en `API/src/application/features/deposits/common/depositSetup.ts`, `startDeposit`, `getDepositOptions` y `applyGatewayEvent`. T098 debe pasar.
- [X] T101 [US9] Implementar las rutas de §E en `API/src/controllers/admin/settingsRoutes.ts`, con `getGatewaySettings`, `setGatewaySettings` y la eliminación del override en `API/src/application/features/payments/`, y OpenAPI. T099 debe pasar.
- [X] T102 [P] [US9] Admin, pruebas: casos en `ADMIN/src/app/features/settings/pages/gateway-settings-page/*.spec.ts` (configuración del país, lista de sedes con override, "Usar otro proveedor en esta sede", "Volver al del país").
- [X] T103 [US9] Admin, implementación (U7, pasarela): `ADMIN/src/app/features/settings/pages/gateway-settings-page/` y su servicio de datos. T102 debe pasar.

**Checkpoint:** quickstart §8.

---

## Phase 12: Polish & Cross-Cutting Concerns

- [X] T104 Recorrer `API/src/` buscando `cityId` (`grep -rn "cityId" src`) y confirmar que cada uso restante es un municipio de facturación (`billing.cityId`, `InvoicingBuyer.cityId`, catálogo). Renombrar lo que quede de operación.
- [X] T105 [P] Revisar `API/src/infrastructure/openapi/**` contra `SPEC/contracts/markets-api.md` y que `/swagger` cargue sin errores.
- [X] T106 [P] Revisar que los datos de facturación no aparezcan en logs: pruebas en `API/tests/unit/infrastructure/audit/auditRedaction.test.ts` (dirección y municipio redactados en `before`/`after`) y su implementación en `API/src/infrastructure/audit/auditRedaction.ts`.
- [X] T107 Correr `npx tsx scripts/reset-031-markets.ts --confirm-dev` contra la base de desarrollo **solo con autorización explícita del usuario**, y anotar en `SPEC/coverage-baseline.md` cuántas zonas se encogieron.
- [X] T108 Agregar los pasos 1–8 de `SPEC/quickstart.md` a `API/_temp_pruebas.md` como pruebas manuales (pasos y resultado esperado), según la costumbre del proyecto.
- [X] T109 Medir el cierre con los mismos comandos de T002 y anotarlo en `SPEC/coverage-baseline.md`. La cobertura no baja en ninguno de los tres repos.
- [X] T110 Correr en los tres repos `lint`, `build` y todas las suites (API: `npm test && npm run test:http && npm run test:architecture && npm run lint && npm run build`; admin: `npm test && npx ng lint && npx ng build`; app: `flutter analyze && flutter test`) y dejarlo todo en verde.
- [X] T111 Actualizar el estado en `SPEC/spec.md` (`Status: Implemented`) y avisar al usuario que el quickstart en local queda pendiente si no se recorrió.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1):** sin dependencias.
- **Foundational (Phase 2):** depende de Setup. **Bloquea todas las historias.**
- **US1 (Phase 3):** depende de Foundational.
- **US2 (Phase 4):** depende de Foundational. Puede ir en paralelo con US1 en el API; en el admin necesita la ruta `sedes` de US1.
- **US3 (Phase 5):** depende de US1 (sedes y zonas por el admin) y de US2 (el readiness lee la configuración por sede).
- **US4 (Phase 6):** depende de US3 (estados de la sede).
- **US5 (Phase 7):** depende de US4 (`GET /markets` y `GET /zones?marketId=`).
- **US6 (Phase 8):** depende de US5 (lista de sedes en la app y perfil con `marketId`).
- **US7 (Phase 9):** depende de Foundational y de US1 (las rutas de sedes existen). Puede ir en paralelo con US5 y US6.
- **US8 (Phase 10):** depende de US7 (`requireScope`).
- **US9 (Phase 11):** depende de Foundational. Puede ir en paralelo con US5–US8.
- **Polish (Phase 12):** depende de todas.

### Within Each User Story

- Las pruebas se escriben y se ven fallar antes de la implementación.
- El orden es dominio → aplicación → rutas → admin/app.
- Cada fase termina con su checkpoint en verde.

### Parallel Opportunities

- **Foundational:** T004, T006, T008, T010, T012, T020 y T021 son pruebas en archivos distintos.
- **Pruebas de cada historia:** todas las marcadas [P] de una misma historia van juntas.
- **Equipos distintos:** con Foundational terminado, US1+US2 (API), US7 (API) y US9 (API) pueden avanzar en paralelo; las tareas de admin y app de cada historia también son independientes entre sí.

---

## Parallel Example: User Story 1

```bash
# Pruebas de US1 en paralelo:
Task: "T023 zoneConflicts.test.ts"
Task: "T024 createMarket.test.ts / updateMarket.test.ts"
Task: "T025 saveZone.test.ts"
Task: "T026 adminMarkets.test.ts + adminZonesConflicts.test.ts"
Task: "T031 pruebas del admin (markets, zone-editor)"
```

## Parallel Example: User Story 7

```bash
Task: "T081 requireScope.test.ts"
Task: "T082 audited.test.ts"
Task: "T083 adminScope.test.ts"
Task: "T087 scope.service / interceptor / scope-picker specs"
```

---

## Implementation Strategy

### MVP First (P1: US1–US4)

1. Phase 1 (Setup) y Phase 2 (Foundational): todo sigue igual, pero sobre sedes.
2. US1 → US2 → US3 → US4.
3. **Parar y validar:** quickstart §1–§4. Con esto ya se abre una sede desde el admin y los clientes cotizan en ella.

### Incremental Delivery

4. US5 → US6: el portero entra por sede, con facturación real, y puede cambiarse (quickstart §5–§6).
5. US7 → US8: el admin trabaja por sede y con operadores locales (quickstart §7).
6. US9: pasarela por sede (quickstart §8).
7. Polish.

Cada fase deja los tres repos en verde y no rompe lo anterior.

---

## Notes

- [P] = otro archivo, sin dependencias pendientes.
- [Story] ata cada tarea a su historia, para seguirla.
- Ver cada prueba fallar antes de implementar.
- El script de T022 es destructivo: se escribe y se prueba en Foundational, pero **solo se corre contra la base de dev en T107, con autorización del usuario**.
- Sin commits ni push: el usuario decide cuándo.
