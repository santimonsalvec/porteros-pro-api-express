# 006 — Buscar portero (solicitud de reserva) — Plan de implementación

> **LEER PRIMERO AL RETOMAR (después de compactar o en sesión nueva):**
> 1. Ir a **"Estado actual"** (abajo) → dice en qué paso/tarea quedamos.
> 2. Ir a **"Decisiones"** → lo ya acordado con el usuario (no re-discutir).
> 3. Continuar con la primera tarea `[ ]` del paso activo. Al terminar una tarea: marcarla `[x]`, actualizar "Estado actual" y añadir una línea al "Registro de progreso".
> El chat NO es la memoria; este archivo sí.

---

## Estado actual

- **Paso activo:** 0 — Alineación (esperando respuestas del usuario a las "Preguntas abiertas")
- **Última tarea completada:** 0.1 (plan escrito)
- **Siguiente tarea:** 0.3 (registrar respuestas en "Decisiones")
- **Rama git:** `main` (aún no se crea `006-find-goalkeeper`; crearla al iniciar el Paso 1, con visto bueno del usuario)
- **Bloqueos:** respuestas a Preguntas abiertas P1–P11

---

## Descripción

Permitir que un **cliente** solicite 1 o 2 porteros para su partido amateur (hoy o mañana), vea el precio antes de pedir, y que los **porteros** con esa zona habilitada reciban la solicitud por FCM y la acepten. **El primero que acepta se queda la reserva** (condición de carrera resuelta de forma atómica en MongoDB). Al confirmarse, se registra la reserva y se notifica al cliente.

### Diseños de referencia (HTML, en `~/Downloads/porteros-pro-html/`)
- `buscar.html` — formulario: cancha (Places) · fecha (Hoy/Mañana) · hora (tabs Madrugada/Mañana/Tarde/Noche, cada 30 min) · cantidad (1/2) · duración (60/90/120) · caja de tarifa · botón "BUSCAR PORTERO DISPONIBLE".
- `buscando-portero.html` — radar animado · "N porteros cerca" · cronómetro transcurrido · stepper (Solicitud → Buscando → Confirmación) · tarjeta resumen (cancha, fecha, hora, duración, nº porteros, total) · pill PENDIENTE · botón "CANCELAR BÚSQUEDA".

### Reglas de negocio (del usuario)
- R1. Solo se busca para **hoy o mañana** → nº de días habilitados **controlado por backend** (configurable).
- R2. Anticipación mínima **30 min** → **controlada por backend** (configurable).
- R3. 1 o 2 porteros por solicitud.
- R4. Duración 60, 90 o 120 min.
- R5. Lugar vía **Google Places**; **todo tipo de lugar es válido** (conjuntos residenciales, fincas, sitios públicos, canchas privadas…).
- R6. Tarifa por **zona o por ciudad**; si la zona no tiene valor → aplica el de la ciudad.
- R7. Tarifa **por portero**; 2 porteros ⇒ ×2.
- R8. Tarifa definida **por separado** para 60, 90 y 120 min.
- R9. La tarifa se consulta al backend **cada vez que cambia** lugar, fecha, hora, cantidad o duración. **Si falta alguno de los 5, no se consulta ni se muestra.**
- R10. Reciben la solicitud los porteros con **esa zona habilitada** (ven cancha, hora, día y valor).
- R11. **El primero que acepta se lleva la reserva** (race condition).
- R12. Al aceptarse: se registra en BD y se notifica al cliente que quedó confirmada.
- Stack: **FCM** para notificaciones en primer y segundo plano.

---

## Hallazgos del código/diseño (hechos verificados, 2026-09-18)

- API: Express 5 + TS, patrón mediator (`Command/Query + Handler`), controllers por feature, fakes en `tests/fakes`, tests `vitest` (`npm test && npm run lint`). Mongo sin ODM. Indexes vía `ensureIndexes()` en `src/infrastructure/di.ts`.
- `zones` (externa, solo lectura): `{cityId (ancla), name, slug, geometry GeoJSON, active, displayOrder}`. **Solo tiene índice `cityId_active_displayOrder`; NO hay índice 2dsphere en `geometry`.**
- `cities` **no tienen geometría** → un punto solo se puede mapear a ciudad **a través de una zona** (`zone.cityId`) o por nombre de localidad de Places (frágil).
- `GoalkeeperProfile`: `{userId, cityId, zoneIds[], …}`; token JWT ya lleva claim `isGoalkeeper`.
- **No existe** en el repo: FCM/firebase-admin, Places, tarifas, solicitudes/reservas, tokens de dispositivo.
- `apphosting.yaml`: Firebase App Hosting (Cloud Run) `minInstances: 0, maxInstances: 1, concurrency: 80` ⇒ **no se puede confiar en timers/estado en memoria** (escala a cero, CPU throttling). Todo estado de solicitud vive en Mongo; la carrera se resuelve con operación atómica en un documento (aunque hoy haya 1 instancia, hay concurrencia interna).
- Flutter (`~/Documents/Projects/flutter/porteros_pro_app`): ya tiene `google_maps_flutter`, key de Maps en Info.plist/AndroidManifest, `features/search/presentation/search_screen.dart` y `features/bookings/…` (placeholders probables). **No tiene Firebase/FCM ni Places.** Prueba en iPhone físico ⇒ FCM en iOS exige llave APNs en Firebase.
- **Discrepancias diseño ↔ reglas** (a corregir en Flutter):
  - `buscar.html` dice "varía según urgencia y demanda" y "TARIFA ESTIMADA" → las reglas dicen tarifa **determinista** por zona/ciudad/duración. Cambiar copy a "Tarifa por portero" / "Total".
  - El diseño calcula "hoy/hora pasada" con el **reloj del dispositivo** → debe usar `now` + reglas **del backend**.
  - "N porteros cerca" del radar requiere dato real del backend (`notifiedCount`); el diseño lo simula con timers.
  - No hay diseño de la pantalla **del portero** para ver/aceptar la solicitud.

---

## Preguntas abiertas (con recomendación) — responder antes del Paso 1

| # | Pregunta | Recomendación por defecto |
|---|---|---|
| P1 | ¿Alcance ahora: solo backend, o también Flutter (buscar, buscando, pantalla del portero, FCM)? ¿Hay diseño para la pantalla del portero que recibe/acepta? | Backend primero (Pasos 1–8), Flutter después (F1–F4) en este mismo plan. |
| P2 | Con **2 porteros**: ¿la reserva se confirma cuando acepta el 1º (1/2) o solo cuando aceptan ambos? Si expira con 1/2, ¿qué pasa? | Estado `searching` con `1/2` visible al cliente; **confirmada solo con 2/2**. Si expira con 1/2 → notificar al cliente y dejarlo elegir "quedarme con 1" o cancelar. |
| P3 | Cancha **fuera de toda zona** de cobertura (las ciudades no tienen geometría): ¿rechazar, o intentar ciudad por nombre de localidad de Places? | Rechazar en la cotización con `zone_not_covered` (sin precio, sin porteros a quienes notificar). "Todas las locaciones permitidas" = todo tipo de lugar, no cobertura ilimitada. |
| P4 | Tarifas: ¿dónde se administran (seed manual en Mongo como `countries`, o endpoint admin)? ¿Moneda COP entera? ¿El portero recibe el 100% o hay comisión? | Colección `rentalRates` (fila por scope+ref+duración), seed manual, COP entero, sin comisión (el portero ve el valor por portero). Admin CRUD fuera de alcance. |
| P5 | ¿Pagos dentro de alcance? | **Fuera de alcance**: la solicitud solo registra el precio pactado. |
| P6 | Vigencia de una búsqueda sin aceptar: ¿cuántos minutos? ¿Solo 1 búsqueda activa por cliente? | TTL configurable (default 15 min, tope: `startsAt − 10 min`); 1 búsqueda activa por cliente. Expiración perezosa al leer + notificación FCM al expirar. |
| P7 | Reglas configurables (días habilitados, anticipación mínima, paso de hora, duraciones, cantidades, TTL): ¿env vars (requiere redeploy) o documento en Mongo editable sin redeploy? Zona horaria? | Documento Mongo `appSettings` con cache corto (60 s); zona `America/Bogota`; paso 30 min. |
| P8 | Places: ¿el cliente Flutter consulta Places directo (Places SDK/API New + session token) y envía `{placeId,name,address,lat,lng}`, o backend hace de proxy? | Cliente directo; backend valida forma y coordenadas, no re-consulta Places. Confirmar que Places API (New) está habilitada en el proyecto de Google Cloud y qué key se usa. |
| P9 | Firebase: ¿ya existe proyecto con FCM y llave APNs subida (iOS)? Backend usará `firebase-admin` con credenciales por defecto de App Hosting. | Sí a `firebase-admin`; en local se usa `GOOGLE_APPLICATION_CREDENTIALS`. |
| P10 | Elegibilidad de quien puede aceptar y post-confirmación: ¿excluir al propio solicitante, excluir porteros con reserva solapada, compartir WhatsApp entre cliente y portero al confirmar? ¿Cancelación tras confirmar / calificaciones? | Excluir solicitante y solapados; compartir WhatsApp al confirmar; cancelación post-confirmación y calificaciones **fuera de alcance**. |
| P11 | Librería de fechas con zonas horarias (`luxon`) o solo `Intl`? | `luxon` (única dependencia nueva de fechas); `firebase-admin` es la otra nueva dependencia. |

---

## Decisiones (se llena al recibir respuestas)

_Vacío. Registrar aquí `Pn → decisión` con fecha._

---

## Arquitectura propuesta (sujeta a Decisiones)

**Agregado `GoalkeeperRequest`** (colección `goalkeeperRequests`):
`{ _id, clientId, place{placeId,name,address,lat,lng}, zoneId, cityId(ancla), startsAt(UTC), durationMinutes, goalkeeperCount, unitPrice, totalPrice, currency, status: 'searching'|'confirmed'|'expired'|'cancelled', acceptedGoalkeeperIds[], notifiedGoalkeeperIds[], expiresAt, createdAt, confirmedAt? }`

**Carrera (R11):** `findOneAndUpdate({_id, status:'searching', acceptedGoalkeeperIds:{$ne:gk}, $expr:{$lt:[{$size:'$acceptedGoalkeeperIds'}, '$goalkeeperCount']}}, {$push:{acceptedGoalkeeperIds:gk}})` — atómico por documento, sin transacciones. Si devuelve `null` → `409 already_taken`. Quien completa el último cupo pone `status:'confirmed'` y crea `Booking` (índice único `requestId` ⇒ idempotente).

**Cotización (R6–R9):** `POST …/quote` recibe los 5 datos → resuelve zona por punto (`$geoIntersects` sobre `zones.geometry`, requiere índice 2dsphere) → tarifa por duración: fila de zona, si no, fila de ciudad ancla → `unitPrice`, `total = unitPrice × count`. Snapshot del precio al crear la solicitud; el cliente envía `expectedTotal` y si cambió → `409 price_changed`.

**Reglas (R1–R2):** `GET …/config` devuelve `{ now, timezone, days:[fechas], minLeadMinutes, slotStepMinutes, durations, goalkeeperCounts }`; el backend **revalida** todo en quote y en create (nunca confiar en el cliente).

**Notificación (R10, FCM):** colección `deviceTokens {userId, token, platform, updatedAt}`; puerto `IPushNotifier` (adaptador `firebase-admin` + fake en tests). Mensaje con `notification` + `data{type,requestId}` para 1er y 2º plano. Polling `GET /:id` como respaldo (FCM no es garantía de entrega).

**Endpoints (borrador):**
- `GET  /api/goalkeeper-requests/config`
- `POST /api/goalkeeper-requests/quote`
- `POST /api/goalkeeper-requests`
- `GET  /api/goalkeeper-requests/:id` (cliente: estado, `acceptedCount`, `notifiedCount`, `elapsed`)
- `POST /api/goalkeeper-requests/:id/cancel`
- `GET  /api/goalkeeper-requests/incoming` (portero: abiertas que le aplican)
- `POST /api/goalkeeper-requests/:id/accept` (portero)
- `PUT/DELETE /api/devices/token`

Auth: `requireAuth` + `requireClientOnly` + `requireCompleteProfile`; endpoints de portero además exigen claim `isGoalkeeper`.

---

## Pasos y tareas

Convención: `[ ]` pendiente · `[~]` en curso · `[x]` hecha · `[!]` bloqueada. Cada paso termina con `npm test && npm run lint` en verde.

### Paso 0 — Alineación
- [x] 0.1 Leer diseños, explorar repo, escribir este plan
- [ ] 0.2 Enviar Preguntas abiertas al usuario
- [ ] 0.3 Registrar respuestas en "Decisiones"; ajustar pasos/arquitectura si cambian
- [ ] 0.4 Con visto bueno: crear rama `006-find-goalkeeper`, actualizar `.specify/feature.json`, y agregar `data-model.md` + `contracts/` en esta carpeta (convención de specs 001–005)

### Paso 1 — Fundaciones: reglas configurables y tiempo
- [ ] 1.1 Dependencia `luxon` (+ tipos) si P11 = sí
- [ ] 1.2 Dominio `BookingRules` + repositorio/proveedor de `appSettings` (Mongo, cache 60 s) con defaults (2 días, 30 min, paso 30, [60,90,120], [1,2], TTL)
- [ ] 1.3 Servicio puro `validateRequestWindow(now, date, time, rules)` → devuelve `startsAt` UTC o error tipado (`date_not_allowed`, `too_soon`, `slot_invalid`)
- [x] 1.4 ~~Query `GetRequestConfig` + endpoint `GET /config`~~ — **hecho en la feature 007** como `GET /api/goalkeeper-requests/config?latitude=&longitude=` (por ubicación: la ventana y la anticipación son por país/ciudad). Ver `specs/007-goalkeeper-service-quote/contracts/booking-config.md`
- [ ] 1.5 Tests unitarios (bordes: 23:50→mañana, exactamente 30 min, día no habilitado, tz) + test HTTP

### Paso 2 — Lugar y resolución de zona
- [ ] 2.1 Value object `Place` + esquema zod (placeId, name, address, lat −90..90, lng −180..180)
- [ ] 2.2 `ZoneRepository.findActiveContainingPoint(lat,lng)` con `$geoIntersects`; `ensureIndexes` crea 2dsphere en `zones.geometry`
- [ ] 2.3 **Verificar contra datos reales** que todos los polígonos son GeoJSON válido (si el índice falla, listar zonas inválidas y avisar al usuario)
- [ ] 2.4 Fake en `tests/fakes`, tests del repositorio (fakeMongoCollection) y del caso "fuera de zona" (P3)

### Paso 3 — Tarifas
- [ ] 3.1 Dominio `RentalRate` + colección `rentalRates` (`scope: zone|city`, `refId`, `durationMinutes`, `amount`, `currency`; índice único)
- [ ] 3.2 `IRentalRateRepository` + Mongo + fake
- [ ] 3.3 Servicio `resolveUnitPrice(zoneId, cityId, duration)` con fallback zona→ciudad; error `rate_not_configured`
- [ ] 3.4 Query `QuoteRequest` (valida ventana + zona + tarifa; `total = unit × count`) + `POST /quote`
- [ ] 3.5 Tests (zona con tarifa, zona sin tarifa→ciudad, ninguna→error, ×2, fuera de zona)
- [ ] 3.6 Documentar seed manual de `rentalRates` (README/quickstart)

### Paso 4 — Solicitud (crear / consultar / cancelar)
- [ ] 4.1 Dominio `GoalkeeperRequest` (máquina de estados) + repositorio + índices (cliente+estado, `status+zoneId+startsAt`, TTL/expiración)
- [ ] 4.2 `CreateRequestCommand`: re-cotiza en servidor, valida `expectedTotal`, 1 activa por cliente (P6), snapshot de precio → `201`
- [ ] 4.3 `GetRequestQuery` (solo dueño; expiración perezosa; expone `acceptedCount`, `notifiedCount`, `createdAt`)
- [ ] 4.4 `CancelRequestCommand` (solo `searching`)
- [ ] 4.5 Tests unit + HTTP (permisos, idempotencia de doble envío, `price_changed`)

### Paso 5 — FCM y dispositivos
- [ ] 5.1 Dependencia `firebase-admin`; `config.firebase` + `.env.example`
- [ ] 5.2 Colección `deviceTokens` + `PUT/DELETE /api/devices/token`
- [ ] 5.3 Puerto `IPushNotifier` + adaptador `firebase-admin` (multicast, limpiar tokens inválidos) + fake
- [ ] 5.4 Al crear solicitud: seleccionar porteros elegibles (zona ∈ `zoneIds`, ≠ solicitante, sin reserva solapada) → guardar `notifiedGoalkeeperIds` → enviar push
- [ ] 5.5 Tests (elegibilidad, exclusiones, tokens inválidos)

### Paso 6 — Aceptar (carrera) y confirmar
- [ ] 6.1 `IGoalkeeperRequestRepository.tryAccept(...)` atómico (ver Arquitectura)
- [ ] 6.2 `AcceptRequestCommand`: valida elegibilidad + ventana + no expirada → `200` / `409 already_taken` / `409 overlapping_booking`
- [ ] 6.3 `Booking` (colección `bookings`, índice único `requestId`) al completar cupos; push de confirmación al cliente (y datos de contacto si P10)
- [ ] 6.4 `GET /incoming` (respaldo si el push no llegó)
- [ ] 6.5 Test de concurrencia: N `accept` simultáneos ⇒ exactamente `goalkeeperCount` ganan (contra Mongo real de dev, script/test opt-in; los fakes no prueban atomicidad)
- [ ] 6.6 Expiración: lectura perezosa + job liviano (endpoint interno protegido para Cloud Scheduler) que marca `expired` y notifica

### Paso 7 — Cierre backend
- [ ] 7.1 OpenAPI (`openapiSpec.ts`) para todos los endpoints
- [ ] 7.2 Test de arquitectura (`tests/architecture`) sigue verde; lint limpio
- [ ] 7.3 README + `quickstart.md` (env vars, seed de tarifas/settings, índice 2dsphere)
- [ ] 7.4 Actualizar `CLAUDE.md` (Active Technologies / Recent Changes)
- [ ] 7.5 Revisión con `/code-review` antes de merge

### Paso F — Flutter (sujeto a P1)
- [ ] F1 Firebase: `firebase_core` + `firebase_messaging`, permisos, handler 1er/2º plano, registro de token, APNs
- [ ] F2 Pantalla Buscar (`buscar.html`): Places autocomplete, chips de día/hora desde `/config`, cotización reactiva (solo con los 5 datos, debounce, cancelar respuesta vieja), copy sin "urgencia/demanda"
- [ ] F3 Pantalla Buscando (`buscando-portero.html`): estado real por polling + push, `notifiedCount`, cronómetro desde `createdAt`, stepper por `status`, cancelar
- [ ] F4 Pantalla del portero: lista/tarjeta de solicitud entrante, aceptar, manejo de `already_taken`, deep-link desde push

---

## Fuera de alcance (salvo que el usuario diga lo contrario)
Pagos · comisión de plataforma · cancelación tras confirmar · calificaciones · admin CRUD de tarifas · chat · reasignación si el portero cancela.

## Riesgos conocidos
- Polígonos con GeoJSON inválido rompen el índice 2dsphere (Paso 2.3).
- Escala a cero en App Hosting: sin timers en memoria; expiración perezosa + Scheduler.
- FCM no garantiza entrega → polling + `/incoming`.
- APNs/Firebase en iOS requiere configuración fuera del código.
- Los fakes no prueban atomicidad real de Mongo (Paso 6.5).

## Registro de progreso
- 2026-09-18 — Plan creado tras leer ambos diseños y explorar API + Flutter. Pendiente: respuestas P1–P11.
