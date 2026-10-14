# Correo e ingreso con código

Spec: `porteros-pro-admin/specs/009-email-otp-login`.

La app y el administrador permiten entrar con un código de 6 dígitos que llega por correo, además de Google.

## Proveedor

- Las reglas de ingreso solo conocen `ILoginCodeMailer`, que usa `IEmailSender` (`src/application/common/email.ts`).
- Resend es un adaptador: `src/infrastructure/email/resendEmailSender.ts`, con el SDK `resend` fijado en una versión exacta. Ningún otro archivo puede importar `resend` (lo revisa `tests/architecture/layering.test.ts`).
- Cada envío lleva una clave de idempotencia (el id del código), así un reintento nunca manda dos correos. El envío se abandona a los 10 s.
- **Para cambiar de proveedor:** escribir otro `IEmailSender` en `src/infrastructure/email/` y elegirlo en `src/infrastructure/di.ts`. Las reglas no cambian.

## Plantilla

El correo usa una plantilla **publicada** en Resend (por defecto `otp-login`) con dos variables:

| Variable | Valor |
|---|---|
| `OTP_CODE` | el código, como texto (conserva el `0` inicial) |
| `EXPIRY_MINUTES` | la vigencia con la que se emitió ese código |

El remitente y el asunto salen de la plantilla. Si la plantilla no los trae, Resend rechaza el envío: hay que configurar `EMAIL_FROM`. El dominio del remitente debe estar verificado en Resend.

## Variables de ambiente

| Nombre | Por defecto | Uso |
|---|---|---|
| `EMAIL_MODE` | `resend` | `resend` envía; `log` escribe el correo y el código en el log local, y el API no arranca con `log` en producción |
| `RESEND_API_KEY` | — | obligatoria con `EMAIL_MODE=resend`; secreto, nunca en el repositorio |
| `EMAIL_FROM` | — | opcional; reemplaza el remitente de la plantilla |
| `LOGIN_CODE_TEMPLATE_ID` | `otp-login` | id o alias de la plantilla |

En App Hosting, la llave va en Secret Manager:

```bash
firebase apphosting:secrets:set resend-api-key
firebase apphosting:secrets:grantaccess resend-api-key --backend <backend>
```

En Sistema → Parámetros del administrador aparece si `RESEND_API_KEY` está presente (nunca su valor) y qué `EMAIL_MODE` está activo.

## Reglas

- **Código:** 6 dígitos al azar. Se guarda solo su HMAC (con `JWT_SIGNING_KEY`), ligado al producto y al correo: un código de la app nunca sirve en el admin. Colección `loginCodes`, un documento por producto y correo, borrado a las 24 h (índice TTL `purgeAt_ttl`).
- **Vigencia:** la de Configuración → Acceso del admin (`accessSettings`, de 1 a 10 minutos, 2 por defecto). Un código conserva la vigencia con la que se emitió.
- **Reenvío:** 60 s entre envíos y como máximo 5 por hora, por correo y producto. Un envío que el proveedor rechaza no cuenta.
- **Intentos:** 3 fallos seguidos invalidan el código.
- **Por dirección de red:** 20 solicitudes y 60 verificaciones por hora (colección `rateLimitWindows`).
- **Admin:** responde lo mismo a cualquier correo, y nunca antes de 800 ms; solo los miembros activos y las invitaciones vigentes reciben el código.
- **Una cuenta por correo:** `users.emailKey` es el correo comprobado (por un código o por Google con `email_verified`), con índice único parcial. El ingreso con Google enlaza su identidad a la cuenta que ya tiene ese correo.
- **Log:** el correo se registra enmascarado (`j***@gmail.com`); nunca el código ni su huella.

## Cuentas que ya existían

Antes de desplegar 009 en un ambiente con usuarios, llenar `emailKey`. El API crea el índice único al arrancar, y fallaría si quedan repetidos sin resolver.

```bash
npx tsx scripts/backfill-user-email-key.ts --dry-run   # muestra el plan y los correos repetidos
npx tsx scripts/backfill-user-email-key.ts             # escribe las claves
```

Entre cuentas con el mismo correo, solo la más antigua recibe la clave; las demás se listan para revisarlas a mano.
