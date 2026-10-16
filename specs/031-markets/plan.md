# Implementation Plan: Sedes como comercios con configuración independiente

**Branch**: `031-markets` (en los tres repos) | **Date**: 2026-10-15 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `specs/031-markets/spec.md` · Plan de trabajo: `_temp_marca_blanca.md` (D1–D31)

## Summary

Cada lugar donde opera PorterosPRO pasa a ser una **sede** (`market`) creada desde el admin, con zonas propias que nunca se tocan, configuración que hereda del país y un ciclo de vida explícito: borrador → habilitada ⇄ deshabilitada. Los municipios reales quedan solo para la facturación del portero. Las ciudades ancla y las regiones dejan de usarse para operar.

**En el API** (rama `031-markets`, desde `main`):

- **Colección nueva `markets`** con su máquina de estados y la lista de chequeo reutilizada (`readinessForMarkets`) (research §1, §7).
- **Zonas:**
  - `zones.marketId` reemplaza `cityId`;
  - un error bloqueante `zone_conflict` reemplaza la advertencia de solapamiento, con `@turf/boolean-disjoint`;
  - la regla aplica entre zonas activas, al guardar y al reactivar (research §2).
- **Configuración:**
  - `domain/settings/layered.ts` y `MarketContext` reemplazan las 9 lecturas ciudad → región → país repartidas por el código (research §4);
  - los `scope: city` pasan a `market`;
  - la pasarela gana `scope: market`;
  - los recordatorios de ofertas pasan de variable de entorno a configuración (research §5, §6).
- **Cotización:** responde `location_not_covered` o el nuevo `market_unavailable`. La confirmación bloquea si la sede se deshabilitó (research §8).
- **Portero:**
  - `availability.marketId`;
  - sección `billing` (municipio, dirección y complemento);
  - comando `ChangeGoalkeeperMarket` transaccional con sus bloqueos;
  - la factura usa la dirección real (research §9, §10).
- **Atribución:** `marketId` del momento en movimientos, depósitos, facturas e incidencias (research §11).
- **Admin:**
  - header `X-Scope`, `requireScope` y un nivel por ruta;
  - `StaffMember.scopes`;
  - 3 permisos nuevos;
  - detalle por id según los alcances del miembro;
  - auditoría con alcance (research §14).
- **Datos:** script `reset-031-markets.ts` que rehace dev y encoge las zonas sembradas 3 m (research §3, §15).

**En el admin:**
- selector de alcance en la URL, con interceptor;
- navegación por nivel;
- páginas de **Sedes** (lista, ficha, estados, lista de chequeo);
- editor de zonas con vecinas y conflictos;
- configuración "por sede" con el origen de cada valor;
- equipo con alcances;
- geografía reducida a municipios de facturación.

**En la app:**
- "¿Dónde quieres tapar?" con la lista de sedes;
- sección "Datos de facturación" en el registro y en el perfil;
- "Cambiar dónde tapo" con sus bloqueos;
- el mensaje nuevo "temporalmente fuera de servicio".

## Technical Context

**Language/Version**:
- API: TypeScript ~6.x en Node.js 24 LTS.
- Admin: TypeScript ~5.9 con Angular 21.2 (SSR).
- App: Dart/Flutter 3.47.

**Primary Dependencies**:
- **API:**
  - stack existente: Express 5.2.x, `mongodb` 7.x, `zod`, `uuid`, `pino`, el mediator, `updateAtRevision`, `auditTrail`, `referenceUsage`, `readiness`, `resolveTiered`, el outbox (013) y `withTransaction` (008);
  - **nuevo en runtime:** `@turf/boolean-disjoint` ^7.4, de la misma familia que los `@turf/*` instalados (research §2);
  - **nuevo de desarrollo:** `@turf/buffer` ^7.4, solo para el script de datos (research §3).
- **Admin:** Zard ya instalado (`select`, `combobox`, `badge`, `table`, `tabs`, `dialog`, `alert-dialog`, `alert`, `field`, `input`), más `inherited-field`, `revision-conflict`, `country-picker`, el editor de zonas existente y `auth.interceptor`. Nada nuevo.
- **App:** widgets existentes, `availability_controller` y `goalkeeper_registration_hub`. Nada nuevo.

**Storage**: MongoDB (Atlas, transacciones).
- **Nueva:** `markets`.
- **Cambian:**
  - `zones` (`marketId`);
  - `cities` (sin `zoneCityId` ni `timeZone`);
  - `bookingSettings`, `rentalRates`, `commissionSettings` y `unverifiedDiscounts` (`scope: market`, y campos nuevos en `bookingSettings`);
  - `paymentGatewaySettings` (`scope`/`refId`);
  - `quotes`, `goalkeeperRequests` y `bookings` (`MatchDetails.marketId`);
  - `goalkeeperRegistrations` y `goalkeeperProfiles` (`marketId`, `billing`);
  - `invoicingDocuments` (`buyer.address*`, `marketId`);
  - `balanceMovements`, `deposits` y `goalkeeperIncidents` (`marketId`);
  - `staffMembers` (`scopes`);
  - `adminAuditLog` (`scope`).
- **Índices** en [data-model.md](./data-model.md).
- **Sin migración:** el script de reinicio de dev reemplaza a la migración (D12).

**Testing**:
- **API:** Vitest `unit`, `http` y `architecture`, con TDD.
  - **Dominio:** `Market` y sus transiciones, `findZoneConflicts` (cruce, borde compartido, vértice compartido, inactiva ignorada, caja envolvente), `resolveLayered` con cada nivel y `origin`, y las reglas de `ChangeGoalkeeperMarket`.
  - **Handlers con fakes:** crear, habilitar, deshabilitar y eliminar sedes; guardar zonas; cotización (los dos errores); confirmación con sede deshabilitada; cambio de sede (cada bloqueo); facturación con dirección; atribución en cada tipo de movimiento; `requireScope`.
  - **HTTP:** según [contracts/markets-api.md](./contracts/markets-api.md) §H.
  - **Arquitectura:** `marketTerms.test.ts` (research §12).
- **Admin:** Vitest + TestBed ([contracts/markets-ui.md](./contracts/markets-ui.md), "Pruebas de UI").
- **App:** `flutter test` ([contracts/markets-ui.md](./contracts/markets-ui.md)).
- **Pruebas existentes:** las fábricas y fakes que crean ciudades ancla pasan a crear sedes. Es un cambio mecánico, y las aserciones de negocio no cambian salvo donde la spec cambia la regla (solapamiento y `time_zone_not_configured`).

**Target Platform**:
- API en Firebase App Hosting;
- admin en navegadores de escritorio y tableta;
- app en iOS y Android.

**Project Type**: web-service (API) + aplicación web (admin) + app móvil.

**Performance Goals**:
- **Cotización:** a lo sumo una consulta extra (`findAnyContainingPoint`), y solo cuando no hay zona activa.
- **`MarketContext`:** una lectura por fuente.
- **Validar una zona:** menos de 1 s con decenas de zonas activas de hasta 20.000 vértices, gracias al descarte previo por caja envolvente.
- **Cambiar el selector del admin:** muestra datos en menos de 2 s (SC-006). Es solo una navegación con un header distinto.

**Constraints**:
- **Zonas:** ninguna zona activa toca otra activa. El país de una sede y la sede de una zona son inmutables.
- **Pausa:** deshabilitar no cancela nada en curso.
- **Facturas:** usan los datos de facturación del momento del cobro.
- **Montos:** nunca se suman entre monedas.
- **Alcance:**
  - un miembro con alcance de sede no ve nada fuera de sus sedes, ni por enlace;
  - la selección no viaja en el token;
  - cambiar un alcance aplica de inmediato en la instancia y en hasta 30 s en las demás, igual que los permisos.
- **Datos personales:** los de facturación no se escriben en logs. La auditoría guarda ids.

**Scale/Scope**:
- **Datos:** decenas de sedes y de zonas activas, cientos de porteros.
- **API:**
  - 1 colección nueva y unas 15 que cambian;
  - unos 166 archivos que nombran `cityId`, revisados uno a uno;
  - 13 rutas nuevas y unas 30 que cambian;
  - unos 12 comandos y consultas nuevos.
- **Admin:** 3 páginas nuevas y unas 15 que cambian.
- **App:** 3 pantallas o secciones nuevas y 3 que cambian.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

Las constituciones siguen sin llenar. Se usan las compuertas de las specs 001–030.

| Compuerta | Estado |
|---|---|
| TDD en los tres repos y la cobertura no baja | ✅ Línea base antes de empezar (`coverage-baseline.md`, en `/speckit.tasks`) |
| No romper los contratos de la app | ⚠️ Justificado: se rompen a propósito (`cityId` pasa a `marketId`, rutas de disponibilidad, `/locations/cities`). Nada está en producción (D12) y la app de esta misma versión se entrega junto con el API (FR-044) |
| Reglas de negocio confirmadas | ✅ 31 decisiones en el plan de trabajo, 11 aclaraciones en specify y 4 en clarify |
| Reutilizar sin duplicar | ✅ Un solo `MarketContext` y un solo `resolveLayered`. `resolveTiered`, `readiness`, `referenceUsage`, `updateAtRevision`, `auditTrail`, `withTransaction` e `inherited-field` se reutilizan |
| Sin datos personales en logs | ✅ Dirección y municipio solo en el perfil y en la factura. La auditoría registra ids y alcance |
| UI con Zard (`DESIGN.md`) | ✅ Todos los componentes ya están instalados |
| Sin commits, merges ni push sin pedirlo | ✅ |
| Capas del API | ✅ Reglas en `domain/markets`, `domain/settings` y `domain/zones`; puertos en `application/features/*/common`; Mongo en `infrastructure/persistence/mongo`; zod en `controllers/requests`. `layering.test.ts` lo verifica |
| Sin dependencias nuevas | ⚠️ Justificado: `@turf/boolean-disjoint` en runtime y `@turf/buffer` de desarrollo, de la misma familia ya instalada (research §2, §3) |
| Script destructivo | ⚠️ Justificado: `reset-031-markets.ts` borra colecciones de dev. Exige `--confirm-dev` y rechaza la base de producción (research §15) |

**Re-evaluación tras el diseño:** sin cambios. Las tres filas ⚠️ quedan en Complexity Tracking.

## Project Structure

### Documentation (this feature)

```text
specs/031-markets/
├── spec.md · plan.md · research.md · data-model.md · quickstart.md
├── contracts/markets-api.md      # app, alcance del admin, sedes, zonas, configuración, equipo
├── contracts/markets-ui.md       # admin (selector, sedes, zonas, configuración, equipo) y app
├── checklists/requirements.md
├── coverage-baseline.md          # /speckit.tasks
└── tasks.md                      # /speckit.tasks
```

### Source Code

**API** (`/Users/santiagomonsalve/Documents/Projects/express-js/porteros-pro-api`):

```text
src/domain/markets/market.ts                      # nuevo: Market, estados, transiciones, validación de campos
src/domain/settings/layered.ts                    # nuevo: SettingLevel, resolveLayered
src/domain/zones/{zone.ts, zoneGeometry.ts}       # marketId; findZoneConflicts (boolean-disjoint + bbox); sin advertencias
src/domain/locations/{city.ts, locationRules.ts}  # sin zoneCityId/timeZone; sin canUseAnchor
src/domain/pricing/{bookingSettings.ts, bookingSettingsRules.ts, rentalRate.ts, unverifiedDiscount.ts, tieredRate.ts}
src/domain/operatingBalance/{commissionSetting.ts, balanceMovement.ts}   # scope market; marketId
src/domain/payments/gatewaySettings.ts            # scope/refId
src/domain/bookings/matchDetails.ts               # marketId
src/domain/goalkeepers/{goalkeeperRegistration.ts, goalkeeperProfile.ts, goalkeeperIncident.ts, marketChange.ts}
src/domain/invoicing/invoicingDocument.ts         # buyer.address*, marketId
src/domain/deposits/deposit.ts                    # marketId
src/domain/staff/{staffMember.ts, permissionCatalog.ts, staffScope.ts}   # scopes; markets.*
src/application/features/markets/                 # nuevo
├── common/{ports.ts, marketContext.ts, marketViews.ts, marketUsage.ts}
├── commands/{createMarket, updateMarket, enableMarket, disableMarket, deleteMarket}/
└── queries/{listMarkets, getMarket, getMarketReadiness, listEnabledMarkets}/
src/application/features/geography/              # readinessForMarkets; zonas por sede; ciudades = municipios
src/application/features/locations/              # getCities = buscador de municipios; sin resolveAnchorCityId
src/application/features/goalkeeperRequests/common/{serviceArea.ts, resolveBookingSettings.ts, pricing.ts, quoteEvaluation.ts}
src/application/features/goalkeeperRequests/commands/{issueServiceQuote, confirmBooking}/
src/application/features/goalkeepers/
├── commands/{saveAvailabilitySection, saveBillingSection, updateGoalkeeperAvailability,
│             updateGoalkeeperBilling, changeGoalkeeperMarket, activateGoalkeeper}/
└── common/validateAvailabilitySelection.ts
src/application/features/{pricing, operatingBalance, deposits, invoicing, bookingLifecycle,
                          notifications, dashboard, cases, staff}/**   # MarketContext; marketId; alcance
src/infrastructure/auth/middleware/requireScope.ts   # nuevo
src/infrastructure/auth/staffAccessResolver.ts       # scopes
src/infrastructure/audit/audited.ts                  # scope en cada entrada
src/infrastructure/persistence/mongo/marketRepository.ts   # nuevo + índices
src/infrastructure/persistence/mongo/**              # zones, cities, settings, profiles, bookings, movimientos…
src/infrastructure/invoicing/siigoInvoicingProvider.ts     # dirección real
src/controllers/{marketsController.ts, zonesController.ts, locationsController.ts,
                 goalkeeperController.ts, goalkeeperRequestsController.ts}
src/controllers/admin/{adminRoute.ts, marketsRoutes.ts, geographyRoutes.ts, pricingRoutes.ts,
                       settingsRoutes.ts, teamRoutes.ts, …}   # level por ruta
src/controllers/requests/**                          # zod
src/infrastructure/openapi/{openapiSpec.ts, openapiGeography.ts}
scripts/reset-031-markets.ts                         # nuevo
tests/unit/** · tests/http/controllers/*.test.ts (contracts §H) · tests/architecture/marketTerms.test.ts
tests/fakes/**, tests/fixtures/**                    # sedes en vez de ciudades ancla
```

**Admin** (`/Users/santiagomonsalve/Documents/Projects/angular/porteros-pro-admin`):

```text
src/app/core/scope/{scope.service.ts, scope.interceptor.ts, scope.models.ts}   # nuevo
src/app/core/layout/scope-picker.component.ts      # nuevo
src/app/core/navigation/navigation.ts              # level por entrada
src/app/app.routes.ts · app.config.ts              # prefijo /s/:scope, interceptor
src/app/features/markets/                          # nuevo: lista, formulario, ficha, estados, lista de chequeo
src/app/features/geography/pages/{zone-editor-page, zones-page, cities-page, city-page,
                                  regions-page, readiness-dashboard-page}/
src/app/features/pricing/pages/**                  # sede en vez de ciudad; reglas de sede ampliadas; pasarela
src/app/features/settings/**                       # pasarela por país y sede
src/app/features/staff/pages/{members-page, …}     # alcances
src/app/features/{goalkeepers, finance, requests, cases, dashboard}/**   # columna/filtro Sede, totales por país
```

**App** (`/Users/santiagomonsalve/Documents/Projects/flutter/porteros_pro_app`):

```text
lib/features/goalkeeper/data/{markets_api_client.dart, zones_api_client.dart, goalkeepers_api_client.dart}
lib/features/goalkeeper/domain/{market.dart, goalkeeper_registration.dart, billing_data.dart, municipality.dart}
lib/features/goalkeeper/presentation/{availability_screen.dart, availability_controller.dart,
    billing_section_screen.dart, billing_section_controller.dart, change_market_screen.dart,
    change_market_controller.dart, goalkeeper_registration_hub_screen.dart, profile_sections/**}
lib/features/search/{data/goalkeeper_requests_api_client.dart, domain/goalkeeper_request_failure.dart, presentation/**}
test/**
```

**Structure Decision**: la spec vive en el API porque abarca las tres piezas (FR-044). En los tres repos se trabaja en la rama `031-markets`. La entrega va por fases, en el orden de las historias, y cada fase deja los tres repos verdes.

| Fase | Contenido | Historias |
|---|---|---|
| 1 | Sedes y zonas, `marketId` en reservas y perfiles, script de dev | US1 |
| 2 | `MarketContext` y `resolveLayered` | US2 |
| 3 | Estados, lista de chequeo, cotización y confirmación | US3, US4 |
| 4 | Registro, facturación y cambio de sede | US5, US6 |
| 5 | Alcance y selector | US7, US8 |
| 6 | Pasarela por sede y recordatorios configurables | US9, FR-017 |

## Complexity Tracking

| Violación | Por qué hace falta | Alternativa más simple descartada porque |
|---|---|---|
| Se rompen contratos de la app | `cityId` pasa a ser otro concepto (`marketId`). Mantener ambos nombres perpetúa la confusión que la funcionalidad elimina | Una capa de compatibilidad no tiene a quién servir: nada está en producción, y la app se entrega junto con el API |
| `@turf/boolean-disjoint` (runtime) | La regla D15 prohíbe bordes compartidos, y `@turf/intersect`, ya instalado, no detecta un borde común | `$geoIntersects` tiene semántica ambigua en las aristas y necesitaría un índice `2dsphere` que el repositorio evita (research §2) |
| `@turf/buffer` (desarrollo) y script destructivo | Las zonas sembradas comparten bordes. Sin encogerlas no se pueden volver a guardar, y D12 pide rehacer dev en vez de migrar | Volver a dibujar a mano decenas de zonas, o mantener datos que violan la regla (research §3, §15) |
