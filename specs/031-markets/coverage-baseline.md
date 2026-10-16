# Cobertura: línea base y cierre de 031

## Antes de 031 (2026-10-15)

**API:** rama `031-markets`, creada desde `main` (commit `38b5004`). Árbol limpio salvo los documentos de la spec.

| Comando | Resultado |
|---|---|
| `npm test` | 3076 ✅ (382 archivos) |
| `npm run test:http` | 730 ✅ (109 archivos) |
| `npm run test:architecture` | 13 ✅ (3 archivos) |
| `npm run lint` | limpio |

| Métrica | % |
|---|---|
| Statements | 96.44 % |
| Branches | 89.15 % |
| Functions | 97.60 % |
| Lines | 97.85 % |

`npx vitest run --coverage --coverage.reportOnFailure` (las tres suites juntas) dio 1 falla en la corrida combinada: es la misma intermitencia anotada en 009 y 030. Las suites por separado pasan completas.

**Admin:** rama `031-markets`, desde `main` (`55a510b`). `npm test`: 1010 ✅ y **2 ❌ que ya estaban** en `src/app/features/dashboard/pages/dashboard-home/dashboard-home.spec.ts`, las mismas de 009 y 030. No son parte de 031 y no se tocan aquí.

Cobertura medida sin ese spec (`--exclude "**/dashboard-home.spec.ts"`), 997 pruebas:

| Métrica | % |
|---|---|
| Statements | 84.44 % |
| Branches | 77.60 % |
| Functions | 76.46 % |
| Lines | 84.56 % |

**App:** rama `031-markets`, creada desde `main` (`5f66a5f`). `flutter test --coverage`: 2023 ✅. Líneas: 16230/17264 = **94.01 %** (`coverage/lcov.info`).

## Después de 031 (2026-10-16)

**API:** `npx vitest run --coverage --coverage.reportOnFailure` (las tres suites juntas): 4015 ✅ (520 archivos; sin la intermitencia de la línea base en esta corrida). `npm run lint` y `npm run build` limpios.

| Métrica | Antes | Después | Δ |
|---|---|---|---|
| Statements | 96.44 % | 96.32 % | −0.12 |
| Branches | 89.15 % | 88.96 % | −0.19 |
| Functions | 97.60 % | 97.53 % | −0.07 |
| Lines | 97.85 % | 97.72 % | −0.13 |

Queda una décima por debajo porque el denominador creció mucho (alcances, sedes, facturación, herencia). Lo que sigue sin cubrir en archivos de 031 es código defensivo inalcanzable por diseño: los `case 'not_found'` de deshabilitar/eliminar en `marketsRoutes.ts` (la vista ya responde 404 antes) y el `invalid_note` de `casesRoutes.ts` (el esquema zod aplica la misma regla que el dominio). Todo lo demás de 031 tiene prueba dirigida (`cancelAllJob`, `depositHttp`, `Deposit`, `readiness`, `scopeChecks`, habilitar con `stale`/`already_enabled`).

**Admin:** `npx ng test --watch=false`: 1063 ✅ y las mismas **2 ❌ de línea base** en `dashboard-home.spec.ts`. `npx ng lint` y `npx ng build` limpios (bundle inicial 516 kB vs 512 kB; la advertencia de presupuesto ya existía).

Cobertura sin ese spec, 1051 pruebas:

| Métrica | Antes | Después | Δ |
|---|---|---|---|
| Statements | 84.44 % | 85.36 % | +0.92 |
| Branches | 77.60 % | 78.71 % | +1.11 |
| Functions | 76.46 % | 77.95 % | +1.49 |
| Lines | 84.56 % | 85.77 % | +1.21 |

**App:** `flutter analyze` limpio; `flutter test --coverage`: 2054 ✅. Líneas: 16862/17913 = **94.13 %** (antes 94.01 %, +0.12).

**T107 (2026-10-16):** reset aplicado a `PorterosProDevelopment` con autorización del usuario. Resultado: la sede **Medellín** (habilitada, `America/Bogota`); **13 zonas** pasadas a `marketId` y encogidas 3 m. Antes de encogerlas, 5 traslapes se recortaron de la zona más grande, que cede el área a la vecina: Copacabana ↔ Bello (1.33 km², Copacabana queda en 83.0 km²), Centro ↔ Nororiental, Centro ↔ El Poblado, Noroccidental ↔ Centrooccidental y Suroccidental ↔ Centrooccidental (astillas de 0.1 a 1.5 ha). 12 tarifas pasaron de `city` a `market`, la pasarela pasó a la forma con `scope`, el equipo quedó con alcance de plataforma y se borraron los índices obsoletos (`zones.cityId_active_displayOrder`, `cities.zoneCityId`, `goalkeeperProfiles.cityId_activatedAt`, `goalkeeperRequests.city_startsAt`). Se vaciaron las colecciones transaccionales. Al correrlo se corrigió el guard de producción (`/prod/i` rechazaba "PorterosProDevelopment"). Después se borraron el script, su lógica, su prueba y la dependencia `@turf/buffer`. El recorrido local del quickstart queda pendiente.
