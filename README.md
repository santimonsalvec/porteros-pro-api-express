# PorterosPRO API

Backend de **PorterosPRO**, construido en Express + TypeScript (migrado desde `SMC.PorterosPRO.Backend`, en .NET).

## ¿Qué es PorterosPRO?

PorterosPRO es una plataforma para **buscar y rentar porteros de fútbol** por partido. Conecta a quienes necesitan un arquero (un equipo al que le falta uno, un grupo de amigos, la organización de un torneo) con porteros disponibles en su ciudad, tanto para **partidos amateur** como para **torneos**.

Esta API es el backend que usa la app móvil (Flutter, repositorio `porteros_pro_app`) y un panel de administración web.

### Roles

| Rol | Quién es | Qué puede hacer |
|---|---|---|
| **Cliente** | Todo usuario que inicia sesión con Google y completa su perfil | Buscar y (próximamente) rentar porteros; convertirse en portero |
| **Portero** | Un cliente que completó y activó su registro como portero | Publicar su disponibilidad por ciudad y zonas; mantener sus datos físicos y de disponibilidad |
| **Administrador** | Usuario con el claim `isAdmin` en su token | Acceso al panel de administración web; los endpoints de cliente le responden `403` |

Un mismo usuario puede ser cliente y portero a la vez: el token interno lleva el claim `isGoalkeeper` cuando su perfil de portero está activo.

### Flujo de negocio

1. **Ingreso** — el usuario se autentica con Google (SSO). La API valida el ID token de Google y emite sus propios tokens (access + refresh).
2. **Perfil de cliente** — antes de usar el resto de la API debe completar su perfil y aceptar términos y política de privacidad (se registra la versión aceptada).
3. **Convertirse en portero** — un cliente puede registrarse como portero por secciones, guardando el avance en un borrador:
   - **Identificación**: tipo y número de documento, fechas de expedición y nacimiento, y foto del documento (anverso y reverso).
   - **Datos físicos**: estatura y peso.
   - **Disponibilidad**: la ciudad donde trabaja y las **zonas** de esa ciudad que cubre.
   - **Activación**: cuando las tres secciones están completas, el borrador se convierte en un perfil de portero permanente. La identificación queda inmutable; los datos físicos y la disponibilidad se pueden seguir editando. El registro también se puede cancelar mientras no esté activo.
4. **Cobertura por zonas** — las ciudades se dividen en zonas de servicio (polígonos GeoJSON). Un portero declara en qué zonas atiende, y esa información es la base para encontrar porteros cercanos a una cancha.
5. **Buscar y rentar un portero** — *en diseño, aún no implementado.* Un cliente solicita uno o dos porteros para un partido indicando cancha, fecha, hora y duración, ve el precio antes de pedir, y los porteros de esa zona reciben la solicitud por notificación push; el primero en aceptar se queda la reserva. El plan completo está en `specs/006-find-goalkeeper/IMPLEMENTATION_PLAN.md`.

### Estado actual

| Capacidad | Estado |
|---|---|
| Autenticación SSO con Google + tokens internos (JWT) | Implementado |
| Perfil de cliente | Implementado |
| Catálogos: países, ciudades, zonas, tipos de documento | Implementado |
| Almacenamiento de imágenes (Cloudinary) | Implementado |
| Registro, activación y edición de perfil de portero | Implementado |
| Buscar y rentar porteros (solicitudes, tarifas, reservas, notificaciones push) | En diseño |

## Stack

- **TypeScript ~6.x** sobre **Node.js 24 LTS**
- **Express 5.2.x** como framework web
- **MongoDB** (driver oficial `mongodb` 7.x, sin ODM)
- **google-auth-library** para verificación de ID tokens de Google (SSO)
- **jose** para firma/verificación de JWT internos
- **zod** para validación de DTOs de request
- **Cloudinary** (SDK oficial `cloudinary`) como proveedor de almacenamiento de imágenes
- **multer** (almacenamiento en memoria) + **file-type** para recibir uploads `multipart/form-data` y validar la imagen por sus bytes reales, no por el MIME o la extensión que declare el cliente
- **pino** / **pino-http** para logging estructurado
- **@opentelemetry/sdk-node** para trazas (exporta a OTLP o a consola si no hay endpoint configurado)
- **swagger-ui-express** para exponer la documentación OpenAPI
- **vitest** + **supertest** para pruebas

## Estructura del proyecto

```text
src/
  app.ts                 # ensamblado de la app Express (rutas, middlewares)
  server.ts              # punto de entrada: observabilidad, dependencias, listen
  appDependencies.ts     # contrato de dependencias inyectadas a los controllers
  controllers/           # routers HTTP por feature (auth, profile, clients, goalkeepers,
                         #   images, locations, zones, health) + requests/responses (zod)
  application/           # casos de uso (commands/queries) por feature, con mediator
  domain/                # entidades y lógica de dominio (users, goalkeepers, countries,
                         #   locations, zones, images, common)
  infrastructure/        # Mongo, auth (Google/JWT), Cloudinary, observabilidad, OpenAPI, config, DI
tests/
  unit/                  # pruebas unitarias de application e infrastructure
  http/                  # pruebas HTTP de los controllers
  architecture/          # reglas de capas (layering)
  fakes/ fixtures/       # dobles de prueba y datos de ejemplo
specs/                   # especificaciones y planes por feature (Spec Kit), ver más abajo
```

La arquitectura es por capas (`controllers → application → domain`, con `infrastructure` implementando los puertos definidos en `application`), y las reglas se verifican con `npm run test:architecture`.

## Requisitos

- Node.js 24 LTS
- Una base de datos MongoDB accesible (Atlas u otra)
- Una cuenta de Cloudinary (solo para los endpoints que suben o eliminan imágenes)

## Configuración

Copia `.env.example` a `.env` y completa los valores:

```bash
cp .env.example .env
```

| Variable | Requerida | Descripción |
|---|---|---|
| `MONGODB_CONNECTION_STRING` | Sí | Connection string de MongoDB (`mongodb+srv://...`) |
| `JWT_SIGNING_KEY` | Sí | Clave simétrica (32+ bytes aleatorios) para firmar tokens internos |
| `GOOGLE_CLIENT_ID_MOBILE` | No | Client ID de Google OAuth aceptado como `aud` para mobile |
| `GOOGLE_CLIENT_ID_WEB` | No | Client ID de Google OAuth aceptado como `aud` para admin-web |
| `JWT_ACCESS_TOKEN_LIFETIME_MINUTES` | No (default `15`) | Vigencia del access token |
| `JWT_REFRESH_TOKEN_LIFETIME_DAYS` | No (default `30`) | Vigencia del refresh token |
| `LEGAL_TERMS_VERSION` | No (default `1.0`) | Versión de términos y condiciones registrada al aceptar |
| `LEGAL_PRIVACY_POLICY_VERSION` | No (default `1.0`) | Versión de política de privacidad registrada al aceptar |
| `CLOUDINARY_URL` | Para imágenes | Connection string de Cloudinary (`cloudinary://<api_key>:<api_secret>@<cloud_name>`). Se lee al primer uso: si falta, solo fallan las operaciones de imágenes, no el arranque |
| `IMAGE_MAX_UPLOAD_SIZE_BYTES` | No (default `10485760`) | Tamaño máximo de una imagen subida (10 MB), validado antes de enviarla a Cloudinary |
| `OTEL_EXPORTER_OTLP_ENDPOINT` | No | Endpoint OTLP para trazas; sin valor, exporta a consola |
| `OTEL_EXPORTER_OTLP_HEADERS` | No | Cabeceras `clave=valor` (ej. `Authorization=Basic ...`) para el endpoint OTLP, requeridas por proveedores como Grafana Cloud. Leída automáticamente por el SDK de OpenTelemetry, no necesita cableado propio |
| `PORT` | No (default `3000`) | Puerto HTTP |

En producción (`NODE_ENV=production`) las variables se leen únicamente del entorno real, nunca de un archivo `.env`. En local no se necesita crear el `.env` a mano: pídele a alguien del equipo con acceso a Firebase Console los valores reales de `MONGODB_CONNECTION_STRING`, `JWT_SIGNING_KEY`, `GOOGLE_CLIENT_ID_MOBILE` y `CLOUDINARY_URL` (App Hosting → Environment variables), ya que el entorno local por defecto apunta a la misma base de datos de desarrollo que usa el backend desplegado.

### Datos de referencia en MongoDB

Varias colecciones son datos de referencia que **no se administran desde esta API**; se cargan o mantienen directamente en la base de datos:

| Colección | Contenido | Acceso desde la API |
|---|---|---|
| `countries` | Países | Solo lectura |
| `cities` | Ciudades (con `regionId`) | Solo lectura |
| `regions` | Regiones | Solo lectura |
| `zones` | Zonas de servicio por ciudad, con su geometría GeoJSON (se devuelve tal cual, la API no la procesa) | Solo lectura |
| `documentTypes` | Tipos de documento de identidad aceptados | Solo lectura |

Las colecciones que sí escribe la API son `users`, `refreshTokens`, `termsAcceptances`, `images`, `goalkeeperRegistrations` y `goalkeeperProfiles`. Los índices se crean al arrancar (`ensureIndexes()` en `src/infrastructure/di.ts`).

## Uso

```bash
npm install
npm run dev              # desarrollo con recarga (tsx watch)
npm run build            # compila a dist/
npm start                # ejecuta dist/server.js
```

## Tests y linting

```bash
npm test                  # unit tests (vitest)
npm run test:http         # tests HTTP end-to-end
npm run test:architecture # reglas de arquitectura
npm run test:all          # todas las suites
npm run lint
```

## Endpoints principales

La referencia completa y siempre actualizada está en `GET /openapi.json` y `/swagger`. Resumen:

| Recurso | Endpoints | Acceso |
|---|---|---|
| **Auth** | `GET /api/auth/sso-options`, `POST /api/auth/sso/exchange`, `POST /api/auth/tokens/refresh`, `GET /api/auth/me` | Público, salvo `me` (autenticado) |
| **Perfil** | `POST /api/profile/complete` — completa el perfil inicial y acepta términos | Autenticado |
| **Clientes** | `GET /api/clients/me`, `PATCH /api/clients/me` | Cliente (no admin); `PATCH` exige perfil completo |
| **Ubicaciones** | `GET /api/locations/countries`, `GET /api/locations/cities?q=` | Países público; ciudades autenticado |
| **Zonas** | `GET /api/zones?cityId=` — zonas de servicio de una ciudad | Autenticado |
| **Imágenes** | `POST /api/images` (multipart, campo `image`), `GET /api/images/:id`, `DELETE /api/images/:id` | Autenticado |
| **Portero: registro** | `GET /api/goalkeepers/me`, `PATCH /api/goalkeepers/me/identification`, `.../physical-data`, `.../availability`, `POST .../me/document-photo` (multipart `sideA`/`sideB`), `POST .../me/activate`, `POST .../me/cancel` | Cliente con perfil completo |
| **Portero: perfil activo** | `PATCH /api/goalkeepers/me/profile/physical-data`, `PUT /api/goalkeepers/me/profile/availability` | Cliente con perfil completo y perfil de portero activo |
| **Tipos de documento** | `GET /api/goalkeepers/document-types` | Público |
| **Health** | `GET /health` — incluye el estado de la conexión a Mongo | Público |
| **Docs** | `GET /openapi.json`, `/swagger` | Público |

## Especificaciones (`specs/`)

El proyecto se desarrolla feature por feature con [Spec Kit](https://github.com/github/spec-kit); cada carpeta trae su spec, plan, modelo de datos, contratos y tareas:

| Feature | Tema |
|---|---|
| `001-porteros-api-migration` | Migración del backend .NET a Express + TypeScript (auth, perfil, clientes, países) |
| `002-cloudinary-image-storage` | Almacenamiento de imágenes en Cloudinary |
| `003-convertirse-goalkeeper` | Registro por secciones, activación y cancelación como portero |
| `004-rename-location-collections` | Renombrado de colecciones de ubicación (`Countries` → `countries`) |
| `005-goalkeeper-service-zones` | Disponibilidad del portero por ciudad y zonas de servicio |
| `006-find-goalkeeper` | Buscar y rentar portero (plan de implementación, aún sin implementar) |

## Despliegue

El backend se despliega en **Firebase App Hosting**, con build y deploy automáticos al hacer push a `main`. La configuración de runtime (CPU, memoria, instancias) vive en `apphosting.yaml`; las variables de entorno sensibles se gestionan desde la consola de Firebase (App Hosting → Environment variables), no desde el repositorio.

Como la instancia puede escalar a cero (`minInstances: 0`), el servicio no debe depender de estado ni temporizadores en memoria: todo estado vive en MongoDB.

## Troubleshooting

**El contenedor no abre el puerto y el deploy expira ("container failed to start and listen...")**

El servidor solo llama a `app.listen()` después de conectarse a MongoDB y correr `ensureIndexes()` (`src/infrastructure/di.ts`). Si ese paso lanza una excepción, el proceso termina antes de escuchar el puerto y Cloud Run/App Hosting reporta timeout de arranque en vez de un error de conexión. Revisa siempre los logs de **runtime** de la revisión (no los de build) para ver la causa real.

Causa más común: `MongoServerError: Index already exists with a different name` (código 85, `IndexOptionsConflict`) en la colección `users`. Ocurre cuando un índice ya existe en Atlas con un nombre autogenerado distinto al que `userRepository.ts` pide crear (`externalIdentities_provider_subject_unique`, `normalizedPhoneNumber_unique_sparse`). Se resuelve borrando el índice conflictivo en Atlas (`db.collection('users').dropIndex(<nombre_actual>)`); el código lo recrea con el nombre correcto en el siguiente arranque, sin pérdida de datos.
