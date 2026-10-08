# Configuraciones de negocio

> **TODO (retirar del repositorio):** archivo de trabajo versionado temporalmente para no perderlo. Quitarlo de git (`git rm --cached`) cuando deje de usarse.

Guía para quien opera PorterosPRO. Explica **cada regla de negocio configurable**:
- qué hace;
- dónde se configura;
- qué valores acepta y qué pasa si no se configura;
- cómo se combina con las demás.

Las configuraciones técnicas (nube, llaves, variables de despliegue) están en `_temp_configs.md`.

## Índice

1. [Cómo se configura (tres lugares)](#1-cómo-se-configura-tres-lugares)
2. [Herencia: país → ciudad ancla → zona](#2-herencia-país--ciudad-ancla--zona)
3. [Datos de referencia: países, regiones, ciudades, zonas y tipos de documento](#3-datos-de-referencia)
4. [Tarifa del portero](#4-tarifa-del-portero-rentalrates)
5. [Reglas de reserva (`bookingSettings`)](#5-reglas-de-reserva-bookingsettings)
6. [Ventana de check-in](#6-ventana-de-check-in)
7. [Inasistencia](#7-inasistencia)
8. [Penalidades del portero](#8-penalidades-del-portero)
9. [Comisión de la plataforma](#9-comisión-de-la-plataforma-commissionsettings)
10. [IVA sobre la comisión](#10-iva-sobre-la-comisión-taxsettings)
11. [Ofertas y recordatorios a porteros](#11-ofertas-y-recordatorios-a-porteros)
12. [Recargas: pasarela, montos y costos](#12-recargas-pasarela-montos-y-costos-paymentgatewaysettings)
13. [Facturación electrónica](#13-facturación-electrónica-invoicingsettings)
14. [Términos y condiciones](#14-términos-y-condiciones)
15. [Operación diaria del administrador](#15-operación-diaria-del-administrador)
16. [Reglas fijas del sistema (no configurables)](#16-reglas-fijas-del-sistema-no-configurables)
17. [Configuración mínima para abrir una ciudad o un país](#17-configuración-mínima-para-abrir-una-ciudad-o-un-país)
18. [Equipo del administrador: miembros, roles y permisos](#18-equipo-del-administrador-miembros-roles-y-permisos)

---

## 1. Cómo se configura (tres lugares)

| Lugar | Qué se configura ahí | Quién lo cambia | Cuándo aplica |
|---|---|---|---|
| **Colecciones de MongoDB sembradas** | Países, regiones, ciudades, zonas, tipos de documento, tarifas (`rentalRates`), reglas de reserva (`bookingSettings`), comisiones (`commissionSettings`) | El responsable de los datos, con `mongosh` o Atlas | De inmediato, en la siguiente operación |
| **Administrador web** (`porteros-pro-admin`) y sus endpoints `/admin/...` | Pasarela de recargas por país, IVA por país, proveedor de facturación por país, ajustes de billetera, reversión de penalidades, casos, facturas | Un miembro del equipo con el permiso de esa acción (§18) | De inmediato, solo a operaciones posteriores |
| **Variables de entorno** (App Hosting) | Recordatorios de ofertas, versión de términos, activación de la facturación, modos técnicos | Quien despliega | Al reiniciar el backend |

El administrador web (`porteros-pro-admin`) ya existe, pero en esta entrega solo tiene el ingreso y el armazón: sus pantallas llegan por entregas. Mientras tanto, los endpoints se usan con el token de una sesión del administrador (`POST /auth/admin/sign-in`). Cada endpoint exige un permiso (§18), y cada cambio queda en el registro de auditoría `adminAuditLog`.

**Validación:**
- Un documento sembrado con un valor inválido **no se ignora**: la operación que lo lee falla con un error de configuración que queda en el log. Por eso conviene revisar cada cambio contra los rangos de esta guía.
- Los endpoints de administración validan antes de guardar y responden `400 validation_failed` con el campo que falla.

## 2. Herencia: país → ciudad ancla → zona

- **Ciudad ancla**: la ciudad que tiene las zonas. Una ciudad pequeña puede apuntar a una ciudad ancla con `zoneCityId` (por ejemplo, Envigado → Medellín) y usa entonces sus zonas, tarifas y reglas.
- **Reglas de reserva** (§5): se leen de la **ciudad ancla** y, campo por campo, lo que falte se toma del **país**.
- **Tarifas** (§4): primero la **zona**, si no la **ciudad ancla**.
- **Comisión** (§9): primero la **zona**, si no la **ciudad ancla**, si no el **país**. Gana la más específica.
- **Penalidades, check-in e inasistencia** (§6–§8): solo a nivel **país**.
- **IVA, pasarela y facturación** (§10, §12, §13): solo a nivel **país**.

El país de una ciudad se encuentra así: ciudad → región (`regionId`) → país (`countryId` de la región).

---

## 3. Datos de referencia

### 3.1 Países (`countries`)

| Campo | Obligatorio | Descripción |
|---|---|---|
| `name` | Sí | Nombre visible |
| `dialCode` | Sí | Indicativo telefónico, por ejemplo `+57` |
| `countryCode` | Sí | Código ISO de dos letras (`CO`). También forma el nombre de los secretos de la pasarela y del proveedor de facturación (`WOMPI_CO_…`, `SIIGO_CO_…`) |
| `currency` | Sí, para operar | Código ISO 4217 (`COP`). **Sin moneda el país no puede cotizar** y sus porteros no tienen billetera (`wallet_not_configured`) |

### 3.2 Regiones (`regions`)

| Campo | Descripción |
|---|---|
| `name` | Nombre (departamento, estado) |
| `countryId` | El `_id` del país. **Sin él, las ciudades de la región no tienen país**: no cotizan ni tienen billetera |

### 3.3 Ciudades (`cities`)

| Campo | Obligatorio | Descripción |
|---|---|---|
| `name` | Sí | Nombre visible |
| `regionId` | Sí | La región (y por ella el país) |
| `zoneCityId` | No | Si la ciudad usa las zonas de otra (ciudad ancla). `null` = es ancla |
| `timeZone` | Sí, para cotizar | Zona horaria IANA (`America/Bogota`). Las horas de los partidos, la ventana de reserva y los avisos se calculan en hora local |
| `daneStateCode`, `daneCityCode` | Sí, para facturar en Colombia | Códigos DANE del departamento (`05`) y del municipio (`05001`). **Guárdalos como texto** para conservar los ceros a la izquierda. Sin ellos la factura queda rechazada (`buyer_city_not_coded`) |

### 3.4 Zonas (`zones`)

| Campo | Descripción |
|---|---|
| `cityId` | La ciudad ancla dueña de la zona |
| `name`, `slug` | Nombre visible y slug único |
| `geometry` | Polígono GeoJSON. Un partido pertenece a la zona que contiene su punto |
| `active` | `false` = la zona no se ofrece: no se puede cotizar en ella ni habilitarla |
| `displayOrder` | Orden en las listas |

Un punto fuera de toda zona activa no se puede cotizar.

### 3.5 Tipos de documento (`documentTypes`)

| Campo | Descripción |
|---|---|
| `code` | Código interno (`cedula_ciudadania`, `cedula_extranjeria`, `pasaporte`, `nit`) |
| `name` | Nombre visible |

El código se usa en la facturación: Siigo solo acepta `cedula_ciudadania` (o `CC`), `cedula_extranjeria` (`CE`), `pasaporte` (`PA`) y `nit` (`NIT`). Un tipo distinto deja la factura rechazada (`buyer_document_type_unsupported`).

---

## 4. Tarifa del portero (`rentalRates`)

**Regla:** lo que el cliente paga **a cada portero** por un partido de cierta duración.

| Campo | Valores | Descripción |
|---|---|---|
| `scope` | `zone` o `city` | Nivel de la tarifa |
| `refId` | Id de zona o de ciudad ancla | A quién aplica |
| `durationMinutes` | `60`, `90` o `120` | Duración del partido |
| `amount` | Entero > 0 | Pesos enteros, en la moneda del país |

**Resolución:** para la zona del partido y la duración elegida:
1. se usa la tarifa de la **zona**;
2. si no hay, la de la **ciudad ancla**;
3. si no hay ninguna, **no se puede cotizar** esa duración.

**Precio de la solicitud:** `(tarifa + recargo por anticipación) × número de porteros`. El recargo (§5.3) se cobra **por portero**.

**Combinaciones:**
- Una tarifa de ciudad para cada duración, más tarifas de zona solo donde el precio cambia.
- Una duración sin tarifa en ningún nivel no aparece como opción cotizable en esa zona.

```js
db.rentalRates.insertMany([
  { scope: 'city', refId: '<cityMedellinId>', durationMinutes: 60, amount: 40000 },
  { scope: 'city', refId: '<cityMedellinId>', durationMinutes: 90, amount: 55000 },
  { scope: 'zone', refId: '<zoneBelloId>',    durationMinutes: 90, amount: 60000 } // Bello cobra más
])
```

---

## 5. Reglas de reserva (`bookingSettings`)

Un documento por nivel: `{ scope: 'country' | 'city', refId: <countryId o ciudad ancla> }`. El índice es único por `scope + refId`. Cada campo es opcional: lo que falte en la ciudad se toma del país.

### 5.1 Ventana de reserva — `bookingWindowDays`

- **Regla:** con cuántos días de anticipación se puede reservar. Es hoy más los siguientes `N − 1` días, en calendario local.
- **Valores:** entero ≥ 1. Ejemplo: `7` = hoy y los 6 días siguientes.
- **Sin configurar en ningún nivel:** la ciudad **no se puede cotizar**.

### 5.2 Anticipación mínima — `minNoticeMinutes`

- **Regla:** cuántos minutos antes del inicio como mínimo se puede cotizar.
- **Valores:** entero ≥ 0. Ejemplo: `30`.
- **Sin configurar en ningún nivel:** la ciudad **no se puede cotizar**.
- **Combinación:** debe ser mayor que el margen de traslado (§5.5); si no, la búsqueda terminaría antes de empezar. Recomendado: margen + 30 min o más.

### 5.3 Recargo por anticipación — `leadTimeSurcharge.tiers`

- **Regla:** un valor extra **por portero** según cuánto falta para el partido al cotizar. Premia a quien reserva con poca antelación.
- **Valores:** lista de tramos `{ fromMinutes, toMinutes, amount }`:
  - `fromMinutes` es inclusivo y `toMinutes` exclusivo;
  - `toMinutes: null` significa sin límite, y solo lo puede tener el último tramo;
  - los tramos van ordenados y sin solaparse;
  - se permiten huecos: en un hueco no hay recargo;
  - `amount` es un entero ≥ 0.
- **Sin configurar en ningún nivel:** la ciudad **no se puede cotizar** (si no quieres recargo, pon un tramo único con `amount: 0`).

```js
leadTimeSurcharge: { tiers: [
  { fromMinutes: 0,   toMinutes: 120,  amount: 10000 }, // menos de 2 h: +10.000 por portero
  { fromMinutes: 120, toMinutes: 360,  amount: 5000 },  // 2 a 6 h: +5.000
  { fromMinutes: 360, toMinutes: null, amount: 0 }      // más de 6 h: sin recargo
] }
```

### 5.4 Plazo de cancelación gratuita — `freeCancellationMinutes`

- **Regla:** hasta cuántos minutos antes del inicio el cliente puede cancelar una reserva **con portero asignado** y el portero recibe la devolución de su comisión (e IVA). Pasado ese momento, la reserva con portero ya no se puede cancelar.
- **Valores:** entero ≥ 0. Por defecto **60** (con un aviso en el log si no está configurado).
- **Este mismo momento controla otras tres reglas:**
  1. **"Cancelar todo"**: a inicio − este plazo se evalúa la preferencia; si no están todos los porteros, se cancela la solicitud completa con devoluciones.
  2. **Datos de contacto**: cliente y portero ven el nombre y el WhatsApp del otro solo desde inicio − este plazo, y ambos reciben un aviso en ese momento.
  3. **Cancelar la solicitud completa** con algún portero asignado se rechaza entera después de ese momento.
- Las reservas **sin** portero se pueden cancelar hasta que terminen.

### 5.5 Margen de traslado — `travelBufferMinutes`

- **Regla:**
  - **Choques de horario:** es el tiempo mínimo entre dos partidos del mismo portero. A y B chocan si `A.inicio < B.fin + margen` y `B.inicio < A.fin + margen`.
  - **Fin de búsqueda:** también marca cuándo **termina la búsqueda** de portero, a inicio − margen. Después la reserva vence (se avisa al cliente) y ya no se ofrece.
- **Valores:** entero ≥ 0. Por defecto **30**.
- **Combinación:** margen < anticipación mínima (§5.2), y conviene margen ≤ plazo de cancelación gratuita (§5.4).

### Ejemplo completo (Colombia y Medellín)

```js
db.bookingSettings.insertMany([
  { scope: 'country', refId: '<countryCoId>', bookingWindowDays: 7, minNoticeMinutes: 60,
    freeCancellationMinutes: 60, travelBufferMinutes: 30,
    leadTimeSurcharge: { tiers: [ { fromMinutes: 0, toMinutes: 180, amount: 5000 }, { fromMinutes: 180, toMinutes: null, amount: 0 } ] },
    goalkeeperPenalties: { lateNoticeMinutes: 120, lateSuspensionDays: 3, weeklyLimit: 3, windowDays: 7, limitSuspensionDays: 7 },
    checkInWindow: { opensMinutesBefore: 30, closesMinutesAfter: 15 },
    noShowGraceMinutes: 60 },
  // Medellín solo cambia el margen de traslado (más tráfico); lo demás lo hereda del país.
  { scope: 'city', refId: '<cityMedellinId>', travelBufferMinutes: 45 }
])
```

---

## 6. Ventana de check-in

- **Regla:** entre inicio − `opensMinutesBefore` e inicio + `closesMinutesAfter`, el portero confirma su llegada con una foto. Fuera de la ventana no se puede; después del cierre, **nunca**.
- **Avisos que dependen de ella:**
  - al abrirse, "Ya puedes confirmar tu llegada";
  - 10 min antes del cierre, "Te quedan 10 minutos";
  - al cerrar sin check-in, se avisa al cliente con el WhatsApp del portero.
- **Dónde:** `bookingSettings.checkInWindow` del **país**.

| Campo | Valores | Por defecto |
|---|---|---|
| `opensMinutesBefore` | Entero 1–120 | 30 |
| `closesMinutesAfter` | Entero 1–60 | 15 |

**Combinación:** cada campo puede faltar y toma su valor por defecto. El check-in es la prueba de asistencia de la inasistencia (§7).

## 7. Inasistencia

- **Regla:** si el portero **no hizo check-in** y el cliente **no respondió "sí llegó"** hasta `noShowGraceMinutes` después del fin del partido, se registra una **inasistencia**:
  - se aplica la penalidad de un retiro tardío (§8) y cuenta para el límite semanal;
  - la comisión no se devuelve;
  - si el cliente responde "no llegó" antes, la inasistencia se registra de inmediato y se abre un caso.
- **Dónde:** `bookingSettings.noShowGraceMinutes` del **país**.
- **Valores:** entero 15–240. Por defecto **60**.

## 8. Penalidades del portero

- **Regla (retiros e inasistencias):**
  - Un retiro con menos de `lateNoticeMinutes` de anticipación es **tardío** y suspende `lateSuspensionDays` días.
  - Al incidente número `weeklyLimit` dentro de una ventana móvil de `windowDays` días, suspende además `limitSuspensionDays` días.
  - Las suspensiones **no se suman**: rige la que termine más tarde.
  - Suspendido, el portero no ve partidos, no recibe ofertas y no puede aceptar.
  - Un incidente cuya penalidad revierte un administrador deja de contar para el límite.
  - La penalidad en dinero es **no devolver la comisión**: no hay otro cobro.
- **Dónde:** `bookingSettings.goalkeeperPenalties` del **país**. Cada campo que falte toma el valor de Colombia.

| Campo | Valores | Por defecto |
|---|---|---|
| `lateNoticeMinutes` | Entero ≥ 1 | 120 (2 h). Exactamente 120 **no** es tardío |
| `lateSuspensionDays` | Entero ≥ 1 | 3 |
| `weeklyLimit` | Entero ≥ 1 | 3 |
| `windowDays` | Entero ≥ 1 | 7 |
| `limitSuspensionDays` | Entero ≥ 1 | 7 |

**Ejemplos:**
- Retiro con 90 min → 3 días.
- Tercer retiro (a tiempo) en 7 días → 7 días.
- Tercer retiro tardío → 3 y 7 días a la vez, rige la de 7.

---

## 9. Comisión de la plataforma (`commissionSettings`)

- **Regla:** lo que la plataforma cobra al portero **al aceptar** cada reserva. Queda fijada en la reserva al cotizar: un cambio posterior no afecta reservas ya creadas.
- **Resolución:** la más específica entre **zona → ciudad ancla → país**.

| Campo | Valores | Descripción |
|---|---|---|
| `scope` | `country`, `city` o `zone` | Nivel |
| `refId` | Id del país, de la ciudad ancla o de la zona | A quién aplica |
| `amount` | Entero > 0 | Pesos enteros, **neto** (el IVA va aparte, §10) |

**Efectos en las reglas de fondos** (siempre con comisión + IVA):
- El portero **no ve partidos ni recibe ofertas** si su saldo es menor que la comisión (+ IVA) más baja de sus zonas habilitadas.
- Solo ve y acepta partidos cuya comisión (+ IVA) puede pagar.
- Una zona **sin comisión en ningún nivel nunca se ofrece** (queda un aviso en el log).

```js
db.commissionSettings.insertMany([
  { scope: 'country', refId: '<countryCoId>', amount: 7000 },
  { scope: 'zone',    refId: '<zonePobladoId>', amount: 9000 }
])
```

## 10. IVA sobre la comisión (`taxSettings`)

- **Regla:** el IVA se cobra **encima** de la comisión (y de una penalidad en dinero, si existiera), como un movimiento aparte de la billetera, en la misma operación. La comisión es lo que gana la plataforma. Una devolución reintegra también el IVA, con la tarifa con la que se cobró.
- **Dónde:** endpoint de administración, **por país**:

```bash
curl -X PUT "$API/admin/tax-settings/<countryCoId>" -H "Authorization: Bearer $TA" -H "Content-Type: application/json" -d '{"vatRateBps":1900}'
curl "$API/admin/tax-settings/<countryCoId>" -H "Authorization: Bearer $TA"
```

- **Valores:** `vatRateBps` entero 0–10 000, en puntos básicos (1900 = 19 %).
- **Sin configurar:** 0 %, con un aviso `vat_not_configured` en el log.
- **Cálculo:** `IVA = redondeo hacia arriba de la mitad (comisión × tarifa)`. Con 7.000 al 19 %: 1.330, en total 8.330.
- **Aplica** a los cobros posteriores al cambio.

## 11. Ofertas y recordatorios a porteros

- **Regla:** al crearse una reserva se avisa de inmediato (push + bandeja) a todos los porteros **elegibles**:
  - activos, con la zona habilitada y disponibles para ofertas;
  - no suspendidos;
  - con fondos (§9);
  - sin choque de horario (§5.5);
  - sin otra reserva de la misma solicitud.

  Mientras nadie la tome, el barrido reenvía recordatorios.
- **Dónde:** variables de entorno (**globales**, no por país):

| Variable | Valores | Por defecto | Descripción |
|---|---|---|---|
| `OFFER_REMINDER_INTERVAL_MINUTES` | Entero ≥ 1 | 5 | Tiempo mínimo entre dos avisos de ofertas al mismo portero |
| `OFFER_MAX_REMINDERS` | Entero ≥ 1 | 3 | Recordatorios por oferta después del primer aviso |

- **Interruptor del portero:** `PUT /api/goalkeepers/me/offers-availability`. Apagado, el portero no recibe ofertas, no ve partidos y no puede aceptar.

## 12. Recargas: pasarela, montos y costos (`paymentGatewaySettings`)

- **Regla:**
  - El portero recarga su billetera solo con los **montos definidos para su país**, a través de la **pasarela configurada para el país**.
  - El **costo de la pasarela lo paga el portero**: antes de pagar ve el monto, el costo y el neto; al aprobarse se acreditan el monto (`top_up`) y se descuenta el costo (`gateway_fee`).
  - Una recarga cubre primero la deuda.
  - El saldo **no se puede retirar**.
- **Dónde:** endpoint de administración, **por país**:

```bash
curl -X PUT "$API/admin/payment-gateways/<countryCoId>" -H "Authorization: Bearer $TA" -H "Content-Type: application/json" -d '{
  "gateway": "wompi",
  "publicConfig": { "publicKey": "pub_test_…", "environment": "sandbox" },
  "costs": { "percentBps": 265, "fixed": 700, "vatBps": 1900 },
  "amounts": [10000, 20000, 30000, 50000, 100000] }'
```

| Campo | Valores | Descripción |
|---|---|---|
| `gateway` | `wompi` | Pasarelas soportadas |
| `publicConfig.environment` | `sandbox` o `production` | Entorno de la pasarela |
| `publicConfig.publicKey` | Texto | Llave **pública**; debe empezar por `pub_test_` en sandbox y `pub_prod_` en producción |
| `costs.percentBps` | Entero 0–10 000 | Porcentaje de la pasarela en puntos básicos (265 = 2,65 %) |
| `costs.fixed` | Entero ≥ 0 | Valor fijo por transacción |
| `costs.vatBps` | Entero 0–10 000 | IVA sobre la comisión de la pasarela |
| `amounts` | 1 a 10 enteros > 0, distintos | Montos ofrecidos (se ordenan). Cada uno debe dejar un neto ≥ 1 |

- **Cálculo del costo:** `(monto × porcentaje + fijo) × (1 + IVA)`, redondeado hacia arriba. Con los valores de ejemplo, 20.000 → costo 1.464 → neto 18.536.
- **Cambiar la pasarela o el entorno** no afecta las recargas en curso: cada una se confirma con la pasarela y el entorno con que empezó.
- **Sin configuración:** el país no tiene recargas (`top_ups_unavailable`).
- **Secretos:** van en Secret Manager (`WOMPI_{PAÍS}_PRIVATE_KEY`, `_EVENTS_SECRET`, `_INTEGRITY_SECRET`). Sin ellos, iniciar una recarga responde `gateway_unavailable`. Ver `docs/payments.md`.
- **Conciliación (fija):** una recarga sin confirmación se consulta a los 15 min, 1 h, 6 h y 24 h y vence a las 48 h. Un pago tardío igual se acredita.

## 13. Facturación electrónica (`invoicingSettings`)

- **Regla:**
  - Cada comisión cobrada genera **una factura electrónica** al portero.
  - Cada comisión devuelta genera **una nota crédito** que referencia su factura.
  - El proveedor envía cada documento al correo del portero, y el portero los descarga en la app.
- **Dónde:** endpoint de administración, **por país**:

```bash
curl -X PUT "$API/admin/invoicing/settings/<countryCoId>" -H "Authorization: Bearer $TA" -H "Content-Type: application/json" -d '{
  "provider": "siigo",
  "config": { "partnerId": "PorterosPRO", "invoiceDocumentId": 24446, "creditNoteDocumentId": 24447, "sellerId": 629,
              "commissionProductCode": "COMISION", "penaltyProductCode": "PENALIDAD", "vatTaxId": 13156, "paymentMethodId": 5636 } }'
```

| Campo (Siigo) | Valores | Descripción |
|---|---|---|
| `provider` | `siigo` | Proveedores soportados |
| `partnerId` | Texto | Nombre de la integración (encabezado `Partner-Id`) |
| `invoiceDocumentId`, `creditNoteDocumentId` | Enteros > 0 | Tipos de documento de factura y nota crédito en Siigo |
| `sellerId` | Entero > 0 | Vendedor en Siigo |
| `commissionProductCode`, `penaltyProductCode` | Texto | Códigos de los productos en Siigo |
| `vatTaxId` | Entero > 0 | Id del IVA en Siigo (se usa solo si el documento lleva IVA) |
| `paymentMethodId` | Entero > 0 | Forma de pago en Siigo |

No se admite ningún campo adicional, así que una credencial nunca puede guardarse ahí por error.

- **Credenciales:** van en Secret Manager, por proveedor y país (`SIIGO_CO_USERNAME`, `SIIGO_CO_ACCESS_KEY`). La respuesta del endpoint dice `credentialsPresent`.
- **Activación global:** `INVOICING_ENABLED=true`. Apagada, los documentos se crean y esperan.
- **País sin proveedor:** los documentos quedan pendientes (`provider_not_configured`) y se emiten cuando se configure.
- **Cambio de proveedor:** los documentos ya enviados, y sus notas crédito, siguen con el proveedor anterior.
- **Datos del portero que se usan:** el tipo y número de documento del perfil de portero al momento del cobro, el nombre y el correo de la cuenta, y los códigos DANE de su ciudad (§3.3).

Ver `docs/invoicing.md` para la operación.

## 14. Términos y condiciones

- **Regla:** para recargar, el portero debe haber aceptado la **versión vigente** de los términos. Al publicar una versión nueva, todos deben aceptarla de nuevo (`POST /api/profile/terms/accept`) antes de su próxima recarga.
- **Dónde:** variables de entorno `LEGAL_TERMS_VERSION` y `LEGAL_PRIVACY_POLICY_VERSION` (por defecto `1.0`). Cambiarla exige un nuevo despliegue.

---

## 15. Operación diaria del administrador

| Acción | Endpoint (permiso) | Detalle |
|---|---|---|
| Ver la billetera de un portero | `GET /admin/goalkeepers/{userId}/wallet` y `…/wallet/movements` (`wallets.read`) | Movimientos con actor, clave de causa y datos de facturación |
| Ajuste manual (crédito o débito) | `POST /admin/goalkeepers/{userId}/wallet/adjustments` con `{ amount, reason, operationKey }` (`wallets.adjust`) | `amount` ≠ 0 (negativo = débito, no deja saldo negativo); `reason` de 3–500 caracteres; `operationKey` es un UUID que evita duplicados. Los ajustes **no** se facturan |
| Ver retiros e inasistencias | `GET /admin/goalkeepers/{userId}/withdrawals` (`goalkeepers.read`) | Con sus penalidades |
| Revertir una penalidad | `POST /admin/goalkeepers/{userId}/withdrawals/{id}/reversal` con `{ refund, liftSuspension, reason }` (`goalkeepers.penalties.reverse`) | `refund: true` devuelve la comisión (y su IVA, con nota crédito); `liftSuspension: true` levanta la suspensión. El incidente deja de contar para el límite semanal |
| Casos (PQRS) | `GET /admin/cases?status=open`, `GET /admin/cases/{id}`, `POST /admin/cases/{id}/resolve` con `{ note }` (`cases.read; resolver: cases.resolve`) | Se abren cuando el cliente dice "no llegó" o el portero "no me pagaron" |
| Facturas con problemas | `GET /admin/invoicing/documents?status=rejected` y `POST …/{id}/retry` (`invoicing.read; reintentar: invoicing.retry`) | Corregir los datos (códigos DANE, documento del portero) y reintentar |

## 16. Reglas fijas del sistema (no configurables)

| Regla | Valor |
|---|---|
| Porteros por solicitud | 1 o 2 |
| Duraciones | 60, 90 o 120 min |
| Horas de inicio | En punto o y media, hora local |
| Validez de una cotización | 3 min |
| Aviso "te quedan 10 minutos" del check-in | 10 min antes del cierre de la ventana |
| Calificaciones | Una por lado y por reserva, privadas; vencen a los 7 días del partido |
| Conciliación de recargas | 15 min, 1 h, 6 h y 24 h; vencen a las 48 h |
| Reintentos de facturación | 1, 5, 15 y 60 min, 3, 6, 12 y 24 h; luego cada 24 h. Aviso si un documento lleva más de 24 h pendiente |
| Red de seguridad de facturación | Crea el documento de cualquier cobro de más de 10 min sin documento (mira 7 días atrás) |
| Devolución por retiro o inasistencia | Nunca: la comisión no se devuelve |
| Retiro del saldo | No se puede retirar |

Cambiar cualquiera de estas reglas requiere un cambio de código.

## 17. Configuración mínima para abrir una ciudad o un país

**Nueva ciudad en un país que ya opera:**
1. La ciudad en `cities` con `regionId`, `timeZone` y (en Colombia) los códigos DANE; su región con `countryId`.
2. Si es ciudad ancla: sus zonas en `zones` (activas, con polígono). Si no: `zoneCityId` de la ciudad ancla.
3. Las tarifas en `rentalRates` (ciudad y/o zonas) para cada duración que se quiera ofrecer.
4. Opcional: un `bookingSettings` de la ciudad si alguna regla cambia frente al país.
5. Opcional: comisiones de ciudad o zona si difieren de la del país.

**Nuevo país**, además de lo anterior:
1. El país con `currency` y `countryCode`, y sus regiones.
2. Un `bookingSettings` del país con al menos `bookingWindowDays`, `minNoticeMinutes` y `leadTimeSurcharge`.
3. La comisión del país en `commissionSettings`.
4. El IVA: `PUT /admin/tax-settings/{countryId}`.
5. La pasarela: sus secretos en Secret Manager (`{PASARELA}_{PAÍS}_…`) y `PUT /admin/payment-gateways/{countryId}`. Si la pasarela del país no es Wompi, antes hay que desarrollar su adaptador.
6. La facturación: sus credenciales en Secret Manager (`{PROVEEDOR}_{PAÍS}_…`) y `PUT /admin/invoicing/settings/{countryId}`. Si el proveedor no es Siigo, antes hay que desarrollar su adaptador (`docs/invoicing.md` §3).
7. Tipos de documento válidos para ese país en `documentTypes`.

## 18. Equipo del administrador: miembros, roles y permisos

El acceso al administrador **no** depende de la marca `isAdmin` de la cuenta (que ya no se lee: esas cuentas usan la app como cualquier cliente). Depende de ser **miembro del equipo** (`staffMembers`) con un **rol** (`staffRoles`).

| Concepto | Regla |
|---|---|
| Rol `owner` (Dueño) | Tiene todos los permisos, también los que se agreguen después. No se edita ni se borra. Siempre queda al menos un dueño activo |
| Roles personalizados | Una lista de permisos del catálogo (32 permisos en 16 áreas; `GET /admin/permissions`). Un rol por miembro |
| Invitación | Por correo y con un rol; dura **7 días**. Se activa en el primer ingreso con Google con ese correo verificado (crea la cuenta si no existía) |
| Sesión | Solo con Google. Dura **12 horas** desde el ingreso y termina antes con **30 minutos** sin uso. Cerrar sesión cierra ese navegador; desactivar al miembro cierra todas sus sesiones |
| Cambios de permisos | Surten efecto en 30 segundos o menos |
| Auditoría | Toda escritura (y todo intento sin permiso) queda en `adminAuditLog`, sin vencimiento y sin secretos |
| Quién administra a quién | `staff.manage` invita, cambia de rol, desactiva y reactiva a cualquiera **menos a un dueño**. Solo un dueño invita como dueño, da o quita el rol `owner` y actúa sobre otro dueño. Nadie se desactiva a sí mismo |
| Motivo | Desactivar, reactivar, cambiar de rol y borrar un rol piden un motivo de 3 a 300 caracteres, que queda en la auditoría |
| Roles en uso | Un rol con miembros no se borra: primero se les cambia el rol |
| Reinvitar | Invitar de nuevo un correo pendiente o vencido renueva los 7 días; un miembro activo o desactivado no se reinvita |

**Dónde se administra:** en el administrador web, Equipo → Miembros, Roles y Auditoría (spec 002; rutas `/admin/staff`, `/admin/roles` y `/admin/audit-log`).

**Comandos, solo para el primer dueño de cada ambiente y para emergencias** (por ejemplo, si nadie puede entrar):

```sh
npx tsx scripts/seed-owner.ts --email dueno@example.com            # el primer dueño de cada ambiente
npx tsx scripts/staff.ts upsert-role --id soporte --name "Soporte" --permissions cases.read,cases.resolve
npx tsx scripts/staff.ts invite --email ana@example.com --role soporte
npx tsx scripts/staff.ts disable --email ana@example.com
npx tsx scripts/staff.ts enable --email ana@example.com
```

Los scripts dejan su registro de auditoría con el actor `system:script`.

**Variables de entorno del administrador:** `GOOGLE_CLIENT_ID_WEB` (cliente OAuth Web de Google), `ADMIN_ALLOWED_ORIGINS` (orígenes del administrador, separados por comas) y, solo en local por HTTP, `ADMIN_SESSION_COOKIE_SECURE=false`.

