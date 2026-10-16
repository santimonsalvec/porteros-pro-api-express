# Feature Specification: Sedes como comercios con configuración independiente

**Feature Branch**: `031-markets`
**Created**: 2026-10-15
**Status**: Implemented
**Input**: User description: "_temp_marca_blanca.md" — plan de trabajo acordado en conversación: cada lugar donde opera PorterosPRO es una **sede** creada desde el administrador, compuesta por zonas propias, con configuración independiente que hereda del país lo que no defina. Alcance completo: API, administrador y aplicación.

## Clarifications

### Session 2026-10-15

Decisiones tomadas durante la elaboración del plan (`_temp_marca_blanca.md`, D1–D31):

- Q: ¿Una sede es una ciudad real? → A: No. Una sede es un grupo de zonas creado en el administrador y no está atada a los límites de un municipio. Los municipios reales se conservan solo para los datos de facturación.
- Q: ¿Siguen existiendo las ciudades ancla y las regiones como parte de la operación? → A: No. Las ciudades ancla desaparecen. Los departamentos y municipios quedan solo como catálogo de facturación.
- Q: ¿Pueden dos zonas solaparse o compartir un borde? → A: No. Ninguna zona activa puede tener área en común con otra zona activa ni tocar su borde, sean de la misma sede o de sedes distintas (ajustado en la sesión de aclaración: ver la pregunta sobre mover zonas).
- Q: ¿Cada sede es un comercio legal o financiero propio? → A: No. Hay un único comercio legal y financiero. Las sedes son unidades operativas. Lo único financiero que puede variar por sede es el proveedor de pagos.
- Q: ¿En cuántas sedes presta servicio un portero? → A: En una sola a la vez. Puede cambiarse, pierde las zonas de la sede anterior y no puede hacerlo si tiene reservas aceptadas sin jugar.
- Q: ¿Qué pasa con el saldo operativo si cambia a una sede de otro país? → A: Solo puede hacerlo con saldo en cero, sin depósitos pendientes y sin un cierre de cuenta en curso.
- Q: ¿Qué estados tiene una sede? → A: Borrador, habilitada y deshabilitada. No se cierra: solo se elimina si no tiene registros asociados.
- Q: ¿Qué deja de pasar en una sede deshabilitada? → A: Solo se bloquean las solicitudes nuevas. Lo que está en curso continúa.
- Q: ¿Cómo elige el administrador sobre qué sede trabaja? → A: Con un selector de país y sede que filtra cada sección según su nivel (sede, país o plataforma), sin cerrar sesión ni volver a autenticarse.
- Q: ¿Qué ve en una sección de país un miembro del equipo con acceso solo a una sede? → A: La sección filtrada a sus sedes.
- Q: ¿A qué sede pertenece un dato de un portero que cambió de sede? → A: Lo actual, a la sede donde está hoy. Lo histórico, a la sede donde ocurrió.

### Session 2026-10-15 (clarify)

- Q: ¿Quién puede crear sedes y cambiar su estado? → A: Crear, habilitar, deshabilitar y eliminar sedes requiere alcance de país o de plataforma. El alcance de sede solo permite configurar la sede y operar en ella.
- Q: ¿Se puede cambiar el país de una sede después de crearla? → A: No, nunca. Si el país era incorrecto, se elimina la sede (si no tiene registros) y se crea otra.
- Q: ¿Se puede mover una zona de una sede a otra? → A: No, nunca. Se desactiva (o se elimina, si no tiene registros) y se dibuja una nueva en la otra sede. Para que eso sea posible, la regla de cruces aplica entre zonas activas: una zona nueva o editada puede cruzar una zona inactiva, pero reactivar una zona inactiva se rechaza si se cruza o toca con alguna activa. Si un punto cae en una zona activa y en una inactiva, manda la activa.
- Q: ¿Quién puede cambiar a un portero de sede? → A: Solo el portero, desde la aplicación. El equipo no puede hacerlo desde el administrador.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Crear una sede y dibujar sus zonas (Priority: P1)

Un administrador crea una sede nueva desde el administrador indicando su nombre, el país al que pertenece, su zona horaria y el punto donde se centra su mapa. Luego dibuja las zonas que la componen. El sistema impide guardar una zona activa que se cruce con otra zona activa o que toque su borde, y muestra las zonas vecinas mientras dibuja para que el espacio entre ellas sea mínimo. La sede nace en borrador y no es visible para clientes ni porteros.

**Why this priority**: Es la base de todo lo demás. Sin sedes y zonas propias no existe dónde configurar, cotizar ni registrar porteros, y hoy abrir un lugar nuevo depende de datos externos y de ciudades ancla.

**Independent Test**: Crear una sede de prueba, dibujarle dos zonas que no se toquen, intentar guardar una tercera que se cruce con una de ellas y comprobar que el sistema lo rechaza; comprobar que la sede no aparece en la aplicación.

**Acceptance Scenarios**:

1. **Given** un administrador con permiso, **When** crea una sede con nombre, país, zona horaria y centro del mapa, **Then** la sede queda creada en estado borrador.
2. **Given** una sede en borrador, **When** el administrador intenta crearla sin país o sin zona horaria, **Then** el sistema lo impide e indica qué dato falta.
3. **Given** una sede ya creada, **When** el administrador intenta cambiar su país, **Then** el sistema no lo permite; para corregirlo debe eliminarla (si no tiene registros) y crear otra.
4. **Given** una sede con una zona existente, **When** el administrador dibuja una zona que se cruza con ella o toca su borde, **Then** el sistema rechaza la zona e indica con qué zona choca.
5. **Given** dos sedes distintas, **When** el administrador dibuja en una sede una zona que se cruza con una zona de la otra, **Then** el sistema la rechaza de la misma forma.
6. **Given** una zona inactiva de otra sede, **When** el administrador dibuja una zona nueva que la cruza, **Then** el sistema la acepta; **When** luego intenta reactivar la zona inactiva, **Then** el sistema lo rechaza e indica con qué zona activa choca.
7. **Given** una zona activa de una sede, **When** el administrador intenta asignarla a otra sede, **Then** esa opción no existe.
8. **Given** una sede en borrador, **When** un cliente o un portero usan la aplicación, **Then** la sede no aparece en ningún listado.

---

### User Story 2 - Configurar una sede heredando del país (Priority: P1)

Un administrador configura una sede: tarifas, reglas de reserva, recargos, cancelación gratuita, tiempo de desplazamiento, ventana de check-in, espera antes del no-show, recordatorios de ofertas, comisión y descuento por portero no verificado. Todo lo que la sede no defina lo hereda del país. Algunas configuraciones también se pueden afinar por zona. En cada pantalla el administrador ve el valor efectivo y de dónde viene (zona, sede, país o valor por defecto de la plataforma).

**Why this priority**: Es la razón de ser de la funcionalidad: cada sede se comporta como un comercio independiente sin tener que repetir lo que es común al país.

**Independent Test**: Definir en el país una ventana de reserva de 14 días, abrir una sede sin definirla y comprobar que hereda 14 días con origen "país"; definir 7 días en la sede y comprobar que el valor efectivo pasa a 7 con origen "sede".

**Acceptance Scenarios**:

1. **Given** un país con una regla definida y una sede que no la define, **When** el administrador consulta la regla en la sede, **Then** ve el valor del país y que proviene del país.
2. **Given** una sede que define su propio valor, **When** se cotiza un partido en esa sede, **Then** se usa el valor de la sede, no el del país.
3. **Given** una zona con tarifa propia, **When** se cotiza un partido en esa zona, **Then** se usa la tarifa de la zona antes que la de la sede.
4. **Given** una configuración que solo existe a nivel país (por ejemplo, el IVA o las penalidades del portero), **When** el administrador abre la configuración de una sede, **Then** no puede sobrescribirla, y la pantalla indica que aplica a todas las sedes del país.
5. **Given** los recordatorios de ofertas definidos solo a nivel de plataforma, **When** una sede define los suyos, **Then** las ofertas de esa sede usan los de la sede.

---

### User Story 3 - Habilitar y deshabilitar una sede (Priority: P1)

Un administrador revisa la lista de chequeo de una sede (zonas activas, tarifas, reglas, comisión y demás requisitos para poder cotizar). Solo puede habilitarla cuando la lista está completa. Más adelante puede deshabilitarla: deja de recibir solicitudes nuevas, pero todo lo que está en curso sigue su camino normal. Para volver a habilitarla, la lista de chequeo debe estar completa otra vez.

**Why this priority**: Convierte abrir una sede en un proceso explícito y seguro: ningún cliente llega a una sede que no puede cotizar, y pausar una sede no perjudica a quien ya tiene un servicio en curso.

**Independent Test**: Intentar habilitar una sede sin tarifas y comprobar que se rechaza; completarla, habilitarla y crear una solicitud; deshabilitarla y comprobar que la solicitud existente sigue buscando portero y que no se pueden crear nuevas.

**Acceptance Scenarios**:

1. **Given** una sede en borrador con requisitos pendientes, **When** el administrador intenta habilitarla, **Then** el sistema lo impide y muestra qué falta.
2. **Given** una sede con la lista de chequeo completa, **When** el administrador la habilita, **Then** queda habilitada, se registra cuándo y quién, y aparece en la aplicación.
3. **Given** una sede habilitada con solicitudes buscando portero y reservas aceptadas, **When** el administrador la deshabilita, **Then** las solicitudes siguen buscando portero, las reservas se juegan normalmente y no se pueden crear solicitudes nuevas en la sede.
4. **Given** una sede deshabilitada, **When** el administrador intenta habilitarla y algún requisito dejó de cumplirse, **Then** el sistema lo impide y muestra qué falta.
5. **Given** una sede habilitada o deshabilitada, **When** el administrador intenta devolverla a borrador, **Then** el sistema no lo permite.
6. **Given** una sede sin registros asociados, **When** el administrador la elimina, **Then** desaparece. **Given** una sede con zonas, porteros, configuraciones o reservas, **When** intenta eliminarla, **Then** el sistema lo impide e indica qué la referencia.

---

### User Story 4 - El cliente busca portero en un punto (Priority: P1)

Un cliente marca dónde se juega el partido. El punto cae como máximo en una zona activa, y esa zona define la sede, el precio y las reglas que aplican. Si el punto no cae en ninguna zona, el cliente ve que aún no hay servicio en ese lugar. Si cae en una zona inactiva o en una sede deshabilitada, ve que la sede está temporalmente fuera de servicio. Si cae en una zona de una sede en borrador, ve lo mismo que si no hubiera servicio.

**Why this priority**: Es el flujo principal del negocio y el que más se beneficia de que no haya ambigüedad: un punto, una zona, una sede, un precio.

**Independent Test**: Cotizar un partido en un punto dentro de una zona habilitada y comprobar el precio de su sede; repetir con un punto fuera de toda zona, otro en una zona inactiva y otro en una zona de una sede en borrador, y comprobar los tres mensajes.

**Acceptance Scenarios**:

1. **Given** un punto dentro de una zona activa de una sede habilitada, **When** el cliente cotiza, **Then** recibe el precio y las reglas de esa zona y su sede.
2. **Given** un punto fuera de toda zona, **When** el cliente cotiza, **Then** ve "Aún no tenemos servicio aquí".
3. **Given** un punto que solo cae en una zona inactiva, o en una zona de una sede deshabilitada, **When** el cliente cotiza, **Then** ve "Esta sede está temporalmente fuera de servicio".
4. **Given** un punto dentro de una zona de una sede en borrador, **When** el cliente cotiza, **Then** ve "Aún no tenemos servicio aquí".
5. **Given** una reserva creada en una sede, **When** se consulta después, **Then** sigue indicando la sede donde se creó y usa su zona horaria para mostrar fechas y horas.

---

### User Story 5 - El portero se registra en una sede con sus datos de facturación (Priority: P2)

Un portero que se registra elige la sede donde va a tapar, de una lista con solo las sedes habilitadas (sin buscador), y luego elige las zonas de esa sede. En una sección llamada "Datos de facturación" indica su municipio de residencia, su dirección y el complemento de la dirección. Sin esa sección completa no puede enviar el registro. Después puede editar sus datos de facturación desde su perfil.

**Why this priority**: Sin sede no hay a quién ofrecer servicios, y sin datos de facturación reales las facturas electrónicas quedarían con un municipio equivocado cuando una sede abarca varios municipios.

**Independent Test**: Registrar un portero, comprobar que solo ve sedes habilitadas, que no puede enviar sin los datos de facturación y que, al editarlos luego, las facturas nuevas usan los datos nuevos y las anteriores conservan los de entonces.

**Acceptance Scenarios**:

1. **Given** sedes en borrador, habilitadas y deshabilitadas, **When** un portero abre el registro, **Then** solo ve las habilitadas.
2. **Given** un portero que eligió una sede, **When** elige zonas, **Then** solo puede elegir zonas activas de esa sede.
3. **Given** un registro sin datos de facturación completos, **When** el portero intenta enviarlo, **Then** el sistema lo impide e indica qué falta.
4. **Given** un portero con facturas emitidas, **When** cambia su dirección, **Then** las facturas nuevas usan la dirección nueva y las anteriores no cambian.
5. **Given** un portero ya registrado en una sede que luego se deshabilita, **When** abre la aplicación, **Then** sigue perteneciendo a esa sede.

---

### User Story 6 - El portero cambia de sede (Priority: P2)

Un portero que se muda o quiere tapar en otro lugar elige una nueva sede habilitada y sus zonas. Deja de estar vinculado a las zonas de la sede anterior. No puede cambiarse mientras tenga reservas aceptadas sin jugar. Si la nueva sede está en otro país, además debe tener el saldo operativo en cero, ningún depósito pendiente y ningún cierre de cuenta en curso.

**Why this priority**: Es necesario para que la regla "un portero, una sede" no deje a nadie atrapado, pero es menos frecuente que el registro.

**Independent Test**: Cambiar de sede a un portero sin reservas pendientes y comprobar que pierde sus zonas anteriores; intentarlo con una reserva aceptada sin jugar y comprobar que se rechaza; intentarlo hacia otro país con saldo a favor y comprobar que se rechaza con la explicación.

**Acceptance Scenarios**:

1. **Given** un portero sin reservas aceptadas pendientes, **When** cambia a otra sede del mismo país y elige zonas, **Then** queda en la nueva sede, deja de tener las zonas anteriores y empieza a recibir ofertas solo de la nueva.
2. **Given** un portero con al menos una reserva aceptada sin jugar, **When** intenta cambiar de sede, **Then** el sistema lo impide y le indica qué reserva lo bloquea.
3. **Given** un portero con saldo a favor, **When** intenta cambiar a una sede de otro país, **Then** el sistema lo impide y le explica que primero debe gastarlo o pedir la devolución.
4. **Given** un portero con saldo en cero, sin depósitos pendientes ni cierre en curso, **When** cambia a una sede de otro país, **Then** su saldo pasa a la moneda del nuevo país y su historial conserva la moneda original de cada movimiento.
5. **Given** un portero con ofertas recibidas y no aceptadas en la sede anterior, **When** cambia de sede, **Then** esas ofertas dejan de estar disponibles para él.
6. **Given** un miembro del equipo que consulta a un portero en el administrador, **When** busca cómo cambiarlo de sede, **Then** esa acción no existe: solo el portero puede hacerlo desde la aplicación.

---

### User Story 7 - El administrador trabaja con un selector de país y sede (Priority: P2)

El administrador tiene un selector con las opciones a las que tiene acceso: "Todas", un país ("Colombia") o una sede ("Colombia › Medellín"). Cada sección del administrador pertenece a un nivel y se filtra según la selección. Las secciones de sede (reservas, solicitudes, zonas, precios y reglas de la sede, lista de chequeo, casos, tablero operativo) muestran la sede elegida, o todas las del país con una columna "Sede". Las secciones de país (porteros, saldo operativo, depósitos, ganancias y comisiones, facturación, IVA, penalidades e incidencias, cierres de cuenta) muestran el país elegido, con un filtro opcional por sede dentro de la sección. Las secciones de plataforma (equipo y roles, países, superficies de juego, parámetros del sistema, acceso) no dependen del selector. Cambiar la selección es inmediato, cada pestaña del navegador conserva la suya y el enlace de una pantalla incluye la selección.

**Why this priority**: Hace usable el administrador cuando hay varias sedes, sin tener que elegir la sede en cada pantalla.

**Independent Test**: Elegir "Colombia › Medellín" y comprobar que reservas solo muestra Medellín; abrir "Porteros" y comprobar que muestra los de Colombia; abrir otra pestaña con otra sede y comprobar que ninguna afecta a la otra; con "Todas", comprobar que los totales de dinero se muestran por país.

**Acceptance Scenarios**:

1. **Given** la selección "Colombia › Medellín", **When** el administrador abre reservas, **Then** solo ve reservas de Medellín.
2. **Given** la selección "Colombia", **When** abre reservas, **Then** ve las de todas las sedes de Colombia con la sede de cada una.
3. **Given** cualquier selección dentro de Colombia, **When** abre porteros o saldo operativo, **Then** ve los de todo Colombia y puede filtrar por sede dentro de la sección.
4. **Given** la selección "Todas" y sedes en dos países, **When** abre ganancias o saldo operativo, **Then** ve un bloque por país, cada uno en su moneda, nunca un total sumado entre monedas.
5. **Given** dos pestañas con sedes distintas, **When** el administrador cambia la selección en una, **Then** la otra conserva la suya.
6. **Given** un enlace a una reserva de otra sede a la que el administrador tiene acceso, **When** lo abre, **Then** ve la reserva aunque la selección actual sea otra sede.
7. **Given** una pantalla de configuración del país, **When** el administrador la abre con una sede seleccionada, **Then** la pantalla indica que la configuración aplica a todas las sedes del país.

---

### User Story 8 - Acceso del equipo por país y sede (Priority: P3)

Al invitar o editar a un miembro del equipo, el administrador le asigna un rol (qué puede hacer) y uno o varios alcances (dónde puede hacerlo): toda la plataforma, uno o varios países, o una o varias sedes. El selector solo le ofrece lo que está en su alcance. En las secciones de país, quien solo tiene acceso a sedes ve únicamente los datos de sus sedes. Lo actual de un portero (el listado, el saldo de hoy) cuenta en la sede donde está hoy. Lo histórico (comisiones, ganancias, depósitos, facturas, incidencias, movimientos del saldo) cuenta en la sede donde ocurrió.

**Why this priority**: Permite tener operadores locales sin exponerles otras sedes. Es necesario cuando haya más de una sede con equipo propio, no para abrir la primera.

**Independent Test**: Crear un operador con acceso solo a Medellín; comprobar que el selector solo ofrece Medellín, que en porteros solo ve los de Medellín y que no puede abrir por enlace una reserva de otra sede; mover un portero de Medellín a otra sede y comprobar que las comisiones que pagó en Medellín siguen apareciendo en el reporte de Medellín.

**Acceptance Scenarios**:

1. **Given** un miembro con acceso solo a Medellín, **When** abre el selector, **Then** solo puede elegir Medellín.
2. **Given** ese miembro, **When** abre una sección de país como porteros o saldo operativo, **Then** solo ve los porteros cuya sede actual es Medellín y sus saldos.
3. **Given** ese miembro, **When** abre por enlace una reserva de otra sede, **Then** el sistema le niega el acceso.
4. **Given** un portero que pagó comisiones en Medellín y luego se cambió a otra sede, **When** se consulta el reporte de comisiones de Medellín, **Then** esas comisiones siguen apareciendo en Medellín.
5. **Given** un miembro con acceso de plataforma, **When** abre el selector, **Then** puede elegir "Todas", cualquier país o cualquier sede.
6. **Given** un miembro con acceso solo a Medellín, **When** intenta deshabilitar Medellín o crear una sede nueva, **Then** el sistema se lo impide; **Given** un miembro con acceso a Colombia, **When** hace lo mismo con una sede de Colombia, **Then** puede hacerlo.
7. **Given** un cambio en los alcances de un miembro, **When** hace su siguiente acción en el administrador, **Then** ya aplica el alcance nuevo, sin esperar a que se renueve su sesión.

---

### User Story 9 - Proveedor de pagos por sede (Priority: P3)

El proveedor de pagos de los depósitos al saldo operativo se configura por país. Una sede puede definir su propio proveedor, y en ese caso los porteros de esa sede depositan con el de la sede. Nunca se configura por zona.

**Why this priority**: Da flexibilidad comercial (por ejemplo, un proveedor con mejor costo en un lugar), pero no bloquea abrir sedes.

**Independent Test**: Configurar un proveedor en el país y otro en una sede; comprobar que un portero de esa sede ve las opciones del proveedor de la sede y que uno de otra sede del mismo país ve las del país.

**Acceptance Scenarios**:

1. **Given** un país con proveedor y una sede sin proveedor propio, **When** un portero de la sede inicia un depósito, **Then** usa el proveedor del país.
2. **Given** una sede con proveedor propio, **When** un portero de esa sede inicia un depósito, **Then** usa el proveedor de la sede.
3. **Given** la configuración de pagos, **When** el administrador busca definirla por zona, **Then** esa opción no existe.

---

### Edge Cases

- Dos zonas vecinas que comparten un borde exacto: se rechaza la segunda. Entre ellas siempre queda un espacio sin servicio.
- Un administrador edita una zona existente y la nueva forma toca otra zona: se rechaza la edición y la zona conserva su forma anterior.
- Se desactiva una zona mientras tiene solicitudes buscando portero: esas solicitudes siguen su curso; solo se bloquean las nuevas en esa zona.
- Una sede sin zonas activas: no se puede habilitar; si ya estaba habilitada y se desactivan todas sus zonas, los clientes ven "temporalmente fuera de servicio".
- El país de una sede no tiene moneda definida: la lista de chequeo lo señala y la sede no se puede habilitar.
- Se elimina una configuración de la sede: el valor efectivo vuelve a ser el del país, sin afectar reservas ya creadas.
- Un portero intenta cambiar de sede con un depósito pendiente dentro del mismo país: se permite, porque la moneda no cambia.
- Un portero de una sede deshabilitada quiere cambiarse a otra sede: puede hacerlo con las mismas reglas que cualquier otro.
- Se cambia la zona horaria de una sede con reservas futuras: las reservas conservan la hora acordada con el cliente.
- Un miembro del equipo pierde el acceso a la sede que tenía seleccionada: su siguiente acción le pide elegir otra selección dentro de su alcance.
- "Todas" con una sola moneda: los totales se muestran igual, en un solo bloque de país.
- Un municipio del catálogo de facturación deja de existir o cambia de código: las facturas ya emitidas conservan los datos con que se emitieron.

## Requirements *(mandatory)*

### Functional Requirements

**Sedes y zonas**

- **FR-001**: El sistema MUST permitir crear una sede desde el administrador con nombre, país, zona horaria y centro del mapa como datos obligatorios.
- **FR-001a**: El país de una sede MUST quedar fijo al crearla y MUST NOT poder cambiarse después. El nombre, la zona horaria y el centro del mapa sí se pueden editar.
- **FR-002**: Toda zona MUST pertenecer a exactamente una sede.
- **FR-002a**: Una zona MUST NOT poder cambiar de sede. Para pasar un área a otra sede, la zona se desactiva (o se elimina, si no tiene registros) y se dibuja una nueva en la otra sede.
- **FR-003**: Las zonas activas MUST NOT cruzarse ni tocar sus bordes entre sí, sin importar la sede. El sistema MUST rechazar crear o editar una zona activa cuya forma tenga área en común con otra zona activa o toque su borde, e indicar con qué zona choca. Una zona nueva o editada sí puede cruzar una zona inactiva.
- **FR-003a**: El sistema MUST rechazar reactivar una zona inactiva si su forma se cruza o toca con alguna zona activa, e indicar con cuál.
- **FR-004**: El administrador MUST mostrar las zonas vecinas mientras se dibuja una zona.
- **FR-005**: El sistema MUST dejar de usar las ciudades ancla y las regiones para operar, cotizar o resolver configuraciones.
- **FR-006**: El sistema MUST conservar el catálogo de departamentos y municipios, con sus códigos oficiales, solo como fuente de los datos de facturación.

**Estados de la sede**

- **FR-007**: Una sede MUST tener uno de tres estados: borrador, habilitada o deshabilitada. Una sede nueva nace en borrador.
- **FR-008**: El sistema MUST permitir pasar de borrador a habilitada y de deshabilitada a habilitada solo si la lista de chequeo de la sede está completa, y mostrar qué falta cuando no lo está.
- **FR-009**: El sistema MUST impedir que una sede habilitada o deshabilitada vuelva a borrador.
- **FR-010**: El sistema MUST registrar quién y cuándo habilitó o deshabilitó una sede.
- **FR-011**: Deshabilitar una sede o desactivar una zona MUST bloquear solo las solicitudes nuevas. Las solicitudes ya creadas MUST seguir buscando portero y las reservas aceptadas MUST seguir su curso normal.
- **FR-012**: El sistema MUST permitir eliminar una sede solo si no tiene registros asociados, y MUST indicar qué la referencia cuando no se puede.

**Configuración heredada**

- **FR-013**: Cada configuración MUST resolverse del nivel más específico al más general entre los niveles que admite: zona, sede, país y valor por defecto de la plataforma.
- **FR-014**: Los niveles admitidos por cada configuración MUST ser:

  | Configuración | Plataforma | País | Sede | Zona |
  |---|:-:|:-:|:-:|:-:|
  | Moneda | | ✓ | | |
  | IVA | | ✓ | | |
  | Facturación electrónica | | ✓ | | |
  | Tipos de documento | | ✓ | | |
  | Proveedor de pagos | | ✓ | ✓ | |
  | Penalidades del portero | | ✓ | | |
  | Espera antes del no-show | | ✓ | ✓ | |
  | Ventana de check-in | | ✓ | ✓ | |
  | Ventana de reserva (días) | | ✓ | ✓ | |
  | Anticipación mínima | | ✓ | ✓ | |
  | Recargo por poca anticipación | | ✓ | ✓ | |
  | Cancelación gratuita | | ✓ | ✓ | |
  | Tiempo de desplazamiento | | ✓ | ✓ | |
  | Recordatorios de ofertas | ✓ | ✓ | ✓ | |
  | Comisión | | ✓ | ✓ | ✓ |
  | Descuento por portero no verificado | | ✓ | ✓ | ✓ |
  | Tarifas de alquiler | | | ✓ | ✓ |
  | Superficies de juego | ✓ | | | |
  | Versiones legales, acceso e ingreso | ✓ | | | |

- **FR-015**: Las pantallas de configuración MUST mostrar el valor efectivo de cada configuración y el nivel del que proviene.
- **FR-016**: Las pantallas de configuración de país y de plataforma MUST indicar que aplican a todas las sedes del país o de la plataforma, sin importar la sede seleccionada.
- **FR-017**: Los recordatorios de ofertas, que hoy son un valor fijo del servidor, MUST pasar a ser configurables; el valor actual queda como valor por defecto de la plataforma.

**Cotización y reservas**

- **FR-018**: Al cotizar, el sistema MUST ubicar la única zona activa que contiene el punto del partido (si también cae en una zona inactiva, manda la activa) y usar la sede de esa zona para el precio, las reglas y la zona horaria.
- **FR-019**: El sistema MUST distinguir dos respuestas cuando no se puede cotizar: sin servicio (punto fuera de toda zona, o en una zona de una sede en borrador) y temporalmente fuera de servicio (zona inactiva o sede deshabilitada). La aplicación MUST mostrar a cada una su mensaje.
- **FR-020**: Toda cotización, solicitud y reserva MUST quedar asociada a la sede donde se creó.

**Porteros**

- **FR-021**: La aplicación MUST mostrar al portero solo las sedes habilitadas, en una lista sin buscador.
- **FR-022**: Un portero MUST pertenecer a una sola sede a la vez y solo MUST poder elegir zonas activas de esa sede.
- **FR-023**: El registro de portero MUST incluir una sección "Datos de facturación" con municipio de residencia (del catálogo), dirección y complemento, obligatoria para enviar el registro.
- **FR-024**: El portero MUST poder editar sus datos de facturación desde su perfil.
- **FR-025**: El portero MUST poder cambiar de sede desde la aplicación, y solo él: el administrador MUST NOT ofrecer esa acción al equipo. Al hacerlo pierde las zonas de la sede anterior y deja de ver las ofertas recibidas allí.
- **FR-026**: El sistema MUST impedir el cambio de sede si el portero tiene reservas aceptadas sin jugar, e indicar cuáles.
- **FR-027**: El sistema MUST impedir el cambio a una sede de otro país salvo que el saldo operativo esté en cero, no haya depósitos pendientes y no haya un cierre de cuenta en curso, y MUST explicar al portero qué debe hacer.
- **FR-028**: Al cambiar a una sede de otro país, el saldo operativo MUST pasar a la moneda del nuevo país y cada movimiento anterior MUST conservar su moneda original.
- **FR-029**: La validación y la verificación del portero MUST seguir siendo globales y no depender de la sede.

**Facturación y pagos**

- **FR-030**: Las facturas electrónicas MUST usar el municipio, la dirección y el complemento de los datos de facturación del portero, no los de su sede.
- **FR-031**: Cada factura MUST conservar los datos de facturación vigentes al momento del cobro.
- **FR-032**: Los depósitos MUST usar el proveedor de pagos de la sede del portero si la sede define uno, y el del país si no.

**Administrador: selector y alcance**

- **FR-033**: El administrador MUST ofrecer un selector con "Todas", los países y las sedes a los que el miembro del equipo tiene acceso.
- **FR-034**: Cada sección del administrador MUST pertenecer a un nivel (sede, país o plataforma) y filtrar sus datos según la selección:
  - Sede: reservas, solicitudes, zonas, precios y reglas de la sede, lista de chequeo, casos y tablero operativo.
  - País: porteros, saldo operativo, depósitos, ganancias y comisiones, facturación, IVA, penalidades e incidencias, y cierres de cuenta, con un filtro opcional por sede.
  - Plataforma: equipo y roles, países, superficies de juego, parámetros del sistema y acceso.
- **FR-035**: Con un país seleccionado, las secciones de sede MUST mostrar todas sus sedes indicando la sede de cada registro.
- **FR-036**: Los montos de dinero MUST mostrarse por país, en su moneda, y nunca sumarse entre monedas distintas.
- **FR-037**: Cambiar la selección MUST ser inmediato, sin cerrar sesión. Cada pestaña del navegador MUST conservar su propia selección, y el enlace de cada pantalla MUST incluirla.
- **FR-038**: Abrir un registro por enlace MUST depender del acceso del miembro del equipo, no de la selección actual.
- **FR-039**: Cada acción del administrador MUST quedar registrada en la auditoría con el país y la sede sobre los que se hizo.

**Equipo**

- **FR-040**: Cada miembro del equipo MUST tener un rol y uno o varios alcances: plataforma, uno o varios países, o una o varias sedes.
- **FR-041**: El acceso MUST validarse en cada acción, de modo que un cambio de alcance aplique de inmediato.
- **FR-041a**: Crear, habilitar, deshabilitar y eliminar una sede MUST requerir alcance de país (sobre el país de la sede) o de plataforma. Un miembro con alcance de sede MUST poder configurar su sede y operar en ella, pero no cambiar su estado, eliminarla ni crear sedes.
- **FR-042**: En las secciones de país, un miembro con acceso solo a sedes MUST ver únicamente los datos atribuidos a sus sedes.
- **FR-043**: Los datos actuales de un portero (listado, saldo de hoy) MUST atribuirse a su sede actual. Los datos históricos (comisiones, ganancias, depósitos, facturas, incidencias y movimientos del saldo) MUST atribuirse a la sede donde ocurrieron, y esa atribución MUST mantenerse aunque el portero cambie de sede.

**Alcance de la entrega**

- **FR-044**: La funcionalidad MUST entregarse completa en el servidor, el administrador y la aplicación.
- **FR-045**: Los datos de desarrollo MUST rehacerse con el modelo nuevo. No se requiere migrar datos, porque nada de esto está en producción.

### Key Entities *(include if feature involves data)*

- **Sede**: unidad operativa donde se presta el servicio. Tiene nombre, país, zona horaria, centro del mapa, estado (borrador, habilitada, deshabilitada) y las fechas y autores de sus cambios de estado. Agrupa zonas, porteros, configuraciones y reservas.
- **Zona**: área dibujada que pertenece a una sola sede para siempre, activa o inactiva. Una zona activa nunca se cruza ni toca a otra zona activa.
- **País**: define moneda, impuestos, facturación, tipos de documento y penalidades, más los valores que heredan sus sedes.
- **Configuración por nivel**: cada valor configurable, definido en plataforma, país, sede o zona según lo que admita, con su valor efectivo y su origen.
- **Municipio y departamento**: catálogo de lugares reales con códigos oficiales, usado solo para facturación.
- **Datos de facturación del portero**: municipio de residencia, dirección y complemento. Cada factura conserva una copia de los vigentes al cobrar.
- **Portero**: pertenece a una sede y a zonas de esa sede. Su validación y verificación son globales.
- **Alcance del miembro del equipo**: dónde puede actuar: plataforma, países o sedes. Es independiente de su rol.
- **Atribución a sede**: la sede donde ocurrió cada movimiento del saldo, depósito, factura, incidencia y reserva. No cambia aunque el portero cambie de sede.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Un administrador puede abrir una sede nueva de principio a fin (crearla, dibujar zonas, configurarla y habilitarla) solo desde el administrador, sin scripts ni cambios directos en la base de datos, en el 100 % de los casos.
- **SC-002**: El 100 % de los puntos caen en cero o una zona activa: ninguna cotización tiene dos precios posibles.
- **SC-003**: Ninguna sede habilitada falla al cotizar por falta de configuración: lo que la lista de chequeo marca como completo siempre cotiza.
- **SC-004**: Al deshabilitar una sede, el 100 % de las solicitudes y reservas en curso siguen su camino, sin cancelaciones ni reembolsos causados por la pausa.
- **SC-005**: El 100 % de las facturas emitidas después del cambio usan el municipio y la dirección de residencia del portero.
- **SC-006**: Cambiar la selección de país o sede en el administrador muestra los datos de la nueva selección en menos de 2 segundos, sin volver a iniciar sesión.
- **SC-007**: Un miembro del equipo con acceso solo a una sede no puede ver ningún dato atribuido a otra sede, en ninguna sección ni por enlace directo.
- **SC-008**: El reporte histórico de una sede (comisiones, ganancias, depósitos) da el mismo resultado antes y después de que uno de sus porteros se cambie de sede.
- **SC-009**: Un cliente que busca portero fuera de servicio entiende en el primer intento si el lugar no tiene servicio o si está temporalmente fuera de servicio: cada caso tiene un mensaje distinto.

## Assumptions

- Nada de esto está en producción. Los datos de desarrollo se rehacen, no se migran, y los cambios no necesitan compatibilidad con versiones anteriores de la aplicación.
- La empresa es un único comercio legal y financiero, operado desde Medellín (Colombia). Facturar a porteros de sedes fuera de Colombia es un tema legal y tributario aparte, fuera de este alcance.
- Se reutilizan las funcionalidades existentes: lista de chequeo de la ciudad, tarifas, comisiones y descuentos por nivel, saldo operativo y cierre de cuenta, facturación electrónica, depósitos, validación y verificación de porteros, y el equipo con roles.
- El catálogo actual de departamentos y municipios, con sus códigos oficiales, es suficiente para los datos de facturación.
- El administrador ya permite dibujar zonas en un mapa. Esta funcionalidad agrega la validación de cruces y bordes, y la vista de zonas vecinas.
- Las sedes son pocas (decenas), y un portero cambia de sede con poca frecuencia.
- Los mensajes exactos que ven los clientes pueden ajustarse durante el diseño, siempre que se distingan los dos casos de FR-019.
- El orden de entrega sigue las fases del plan: sedes y zonas; configuración unificada; estados y publicación; porteros y facturación; parámetros configurables; equipo y selector; proveedor de pagos por sede.
