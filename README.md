# PorterosPRO API

Backend de PorterosPRO construido en Express + TypeScript, migrado desde `SMC.PorterosPRO.Backend` (.NET).

## Stack

- **TypeScript ~6.x** sobre **Node.js 24 LTS**
- **Express 5.2.x** como framework web
- **MongoDB** (driver oficial `mongodb` 7.x, sin ODM)
- **google-auth-library** para verificación de ID tokens de Google (SSO)
- **jose** para firma/verificación de JWT internos
- **zod** para validación de DTOs de request
- **pino** / **pino-http** para logging estructurado
- **@opentelemetry/sdk-node** para trazas (exporta a OTLP o a consola si no hay endpoint configurado)
- **swagger-ui-express** para exponer la documentación OpenAPI

## Estructura del proyecto

```text
src/
  app.ts                # ensamblado de la app Express (rutas, middlewares)
  server.ts             # punto de entrada: observabilidad, dependencias, listen
  appDependencies.ts     # contrato de dependencias inyectadas a los controllers
  controllers/           # routers HTTP por feature (auth, profile, clients, locations, health)
  application/           # casos de uso (commands/queries) por feature, mediator
  domain/                # entidades y lógica de dominio (users, countries, common)
  infrastructure/        # Mongo, auth (Google/JWT), observabilidad, OpenAPI, config, DI
tests/                   # unit, http, architecture
```

## Requisitos

- Node.js 24 LTS
- Una base de datos MongoDB accesible (Atlas u otra)

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
| `OTEL_EXPORTER_OTLP_ENDPOINT` | No | Endpoint OTLP para trazas; sin valor, exporta a consola |
| `PORT` | No (default `3000`) | Puerto HTTP |

En producción (`NODE_ENV=production`) las variables se leen únicamente del entorno real, nunca de un archivo `.env`.

## Uso

```bash
npm install
npm run dev             # desarrollo con recarga (tsx watch)
npm run build            # compila a dist/
npm start                # ejecuta dist/server.js
```

## Tests y linting

```bash
npm test                 # unit tests (vitest)
npm run test:http        # tests HTTP end-to-end
npm run test:architecture # reglas de arquitectura
npm run test:all         # todas las suites
npm run lint
```

## Endpoints principales

- `POST /api/auth/*` — SSO con Google, intercambio y refresco de tokens
- `GET/PUT /api/profile/*` — perfil del cliente autenticado
- `GET/PUT /api/clients/*` — gestión de clientes
- `GET /api/locations/*` — catálogo de países
- `GET /health` — health check (incluye estado de conexión a Mongo)
- `GET /openapi.json` y `/swagger` — documentación OpenAPI

## Despliegue

El backend se despliega en **Firebase App Hosting**, con build y deploy automáticos al hacer push a `main`. La configuración de runtime (CPU, memoria, instancias) vive en `apphosting.yaml`; las variables de entorno sensibles se gestionan desde la consola de Firebase (App Hosting → Environment variables), no desde el repositorio.
