# Contrato de pantallas: Sedes (markets)

**Feature**: 031-markets · **API**: [markets-api.md](./markets-api.md)

Textos en español, con "sede" en todo texto que lee una persona (D2). El admin usa Zard (`DESIGN.md` del admin). La app usa los widgets existentes.

---

## Admin (`/Users/santiagomonsalve/Documents/Projects/angular/porteros-pro-admin`)

### U1. Selector de alcance (encabezado, todas las páginas)

**Opciones** (`GET /admin/me/scopes`):
- "Todas", solo con alcance de plataforma;
- cada país;
- cada sede, agrupada bajo su país, con un badge de estado ("Borrador", "Deshabilitada"; habilitada sin badge).

**Comportamiento:**
- **La URL guarda la selección:** `/s/todas/...`, `/s/co/...` o `/s/co~<marketId>/...`. Al cambiarla se navega a la misma pantalla con la nueva selección. Recargar la página o abrir el enlace conserva la selección, y cada pestaña tiene la suya (FR-037).
- **El interceptor** `scope.interceptor.ts` agrega `X-Scope` a toda llamada `/admin/*`.
- **En una sección de plataforma**, el selector se ve deshabilitado con la ayuda "Esta sección no depende de la sede".
- **Si la selección sale del alcance** (`403 scope_denied`), se muestra un aviso y se vuelve a la selección más amplia permitida.

### U2. Navegación por nivel

Cada entrada de `core/navigation/navigation.ts` declara `level: 'market' | 'country' | 'platform'`.

| Nivel | Comportamiento |
|---|---|
| Sede | Con un país seleccionado, las tablas agregan la columna "Sede" |
| País | Con una sede seleccionada, la página muestra el chip "Colombia · filtrado: Medellín", que se puede quitar. Con un país seleccionado, ofrece el filtro opcional "Sede". Con "Todas", los montos se ven en un bloque por país |
| Plataforma | Sin cambios de filtro |

**Las pantallas de configuración de país** (reglas del país, IVA, facturación, pasarela del país) muestran arriba la alerta "Configuración de {país}: aplica a todas sus sedes" (FR-016).

### U3. Sedes: lista (`/s/:scope/sedes`, nuevo)

- **Tabla:** nombre, país, estado, zonas activas y lista de chequeo ("Lista" o "Faltan N").
- **Botón "Nueva sede":** solo con `markets.manage` y alcance de país o plataforma.

### U4. Sedes: crear y editar

- **Formulario:**
  - nombre;
  - país (solo al crear; después se ve como texto, con la ayuda "El país no se puede cambiar");
  - zona horaria (combobox de `GET /admin/time-zones`);
  - centro del mapa, que se fija moviendo el mapa y guardando la vista.
- **Conflictos de versión** con `revision-conflict`.

### U5. Sedes: ficha (`/s/:scope/sedes/:id`)

**Pestañas:**
- **Resumen:** estado, fechas y autores de cada cambio de estado.
- **Zonas:** editor existente, adaptado según U6.
- **Configuración:** enlaces a reglas, tarifas, comisiones, descuento y pasarela de la sede.
- **Lista de chequeo:** los ítems de `readiness`, con enlace a la pantalla que resuelve cada uno.

**Acciones** (solo con `markets.lifecycle` y alcance de país o plataforma; con alcance solo de sede no aparecen):

| Acción | Cuándo | Comportamiento |
|---|---|---|
| "Habilitar" | Sede en borrador o deshabilitada | Si faltan requisitos, el diálogo los lista y no deja confirmar |
| "Deshabilitar" | Sede habilitada | Diálogo con motivo obligatorio y el texto: "Los clientes no podrán crear solicitudes nuevas en esta sede. Las solicitudes y reservas en curso siguen normalmente" |
| "Eliminar" | Sede sin registros | Si tiene registros, el diálogo dice qué la usa |

### U6. Editor de zonas

- **El mapa muestra en gris las zonas activas vecinas**, de cualquier sede, con su nombre y el de su sede (FR-004).
- **Al validar o guardar con conflicto:** el polígono en conflicto se resalta en rojo y aparece la alerta "Esta zona toca o se cruza con: {zona} ({sede})". El botón "Guardar" queda deshabilitado.
- **Una zona inactiva no bloquea.** Reactivarla puede fallar con el mismo mensaje.
- **Se elimina** el paso de "aceptar advertencias".
- **No existe** el campo "sede" editable para una zona ya creada.

### U7. Configuración (precios y reglas)

- **Todo texto "ciudad" pasa a "sede".** El selector de área toma la sede del alcance.
- **`inherited-field` muestra el origen** de cada valor: "De la zona", "De la sede", "Del país" o "Valor de la plataforma".
- **Reglas de la sede:** se agregan "Ventana de check-in", "Espera antes del no-show" y "Recordatorios de ofertas" (intervalo y máximo).
- **Las penalidades** solo aparecen en las reglas del país.
- **Pasarela de pagos:** página con la configuración del país y la lista de sedes con override. Acciones: "Usar otro proveedor en esta sede" y "Volver al del país".

### U8. Geografía

- **"Ciudades" pasa a llamarse "Municipios (facturación)":** nombre, departamento, DANE. Se quitan "ancla", "zona horaria" y "zonas".
- **Regiones** se ven como "Departamentos".
- **La lista de chequeo general** (`readiness-dashboard-page`) pasa a listar sedes.

### U9. Equipo

- **Invitar y editar** ganan un campo "Alcance" de selección múltiple: "Toda la plataforma", países y sedes. Al menos uno es obligatorio.
- **La lista** muestra los alcances como badges.

### U10. Secciones de país

- **Porteros y registros:**
  - columna y filtro "Sede";
  - la ficha muestra "Sede actual" y los "Datos de facturación" en solo lectura;
  - no hay ninguna acción de cambiar de sede (FR-025).
- **Saldo operativo, depósitos, facturas y ganancias:** totales por país, y el filtro "Sede" aplica la atribución de FR-043.

---

## App (`/Users/santiagomonsalve/Documents/Projects/flutter/porteros_pro_app`)

### M1. Registro de portero: "¿Dónde quieres tapar?"

- **Reemplaza** el buscador de ciudades del paso de disponibilidad.
- **Lista de sedes** de `GET /markets`, sin buscador. La pantalla no usa la palabra "sede".
- **Luego**, las zonas de la sede elegida (`GET /zones?marketId=`).
- **Si no hay sedes:** "Aún no tenemos servicio disponible para nuevos porteros".

### M2. Registro de portero: "Datos de facturación" (nuevo)

- **Tarjeta** en `goalkeeper_registration_hub_screen.dart`, al nivel de las otras secciones.
- **Campos:**
  - "Municipio de residencia", con búsqueda en `GET /locations/cities?q=`, que muestra "Municipio, Departamento";
  - "Dirección";
  - "Complemento (apto, torre, barrio)", opcional.
- **Guarda en borrador** como las otras secciones (autosave, spec 006 de la app).
- **"Enviar registro"** se deshabilita mientras falte la sección, y lo indica.

### M3. Perfil del portero: "Datos de facturación"

- **Editable.** Al guardar se muestra: "Las facturas nuevas usarán estos datos".

### M4. Perfil del portero: "Cambiar dónde tapo"

- **Pasos:** elegir sede (lista de M1), elegir zonas, confirmar.
- **El diálogo de confirmación dice:** "Dejarás de recibir ofertas en {sede actual} y perderás tus zonas allí".
- **Mensajes por error:**

  | Error | Mensaje |
  |---|---|
  | `pending_bookings` | "Tienes partidos aceptados sin jugar. Cuando los juegues podrás cambiarte". Lista los partidos |
  | `balance_not_zero` | "Para cambiarte a otro país tu saldo operativo debe estar en cero. Puedes usarlo o pedir la devolución". Enlaza al saldo y al cierre de cuenta |
  | `deposit_pending` | "Tienes un depósito en proceso. Espera a que termine" |
  | `account_closure_open` | "Tienes una solicitud de cierre de cuenta en curso" |

- **La pantalla "Mis zonas"** solo cambia zonas dentro de la sede actual.

### M5. Cliente: búsqueda de portero

| Respuesta | Mensaje |
|---|---|
| `location_not_covered` | "Aún no tenemos servicio aquí" (sin cambio) |
| `market_unavailable` | "{Sede} está temporalmente fuera de servicio. Intenta más tarde" (nuevo, `MarketUnavailable`) |
| `market_unavailable` al confirmar | El mismo mensaje, y se vuelve a la búsqueda |

---

## Pruebas de UI

**Admin** (Vitest + TestBed):
- `scope.service` y el interceptor;
- el selector, con sus opciones por alcance;
- la columna "Sede" por nivel;
- la ficha de sede: acciones visibles según permiso y alcance, y "Habilitar" con faltantes;
- el editor de zonas con conflicto;
- equipo con alcances.

**App** (`flutter test`):
- el paso de sedes de M1;
- la sección de facturación de M2 (validación, autosave, bloqueo de envío);
- M4 con cada error;
- el parseo de `market_unavailable` en M5.
