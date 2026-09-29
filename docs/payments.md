# Recargas de la billetera con pasarelas de pago (feature 022)

El portero recarga su billetera con un monto predefinido de su país. El backend crea la recarga
pendiente y responde la dirección del **Web Checkout de Wompi** firmada en el servidor; la app la
abre en el navegador del sistema. Solo acreditan la **confirmación de Wompi** (evento
`transaction.updated`) o la **conciliación** (cada 15 min, 1 h, 6 h y 24 h; vence a las 48 h). Una
recarga aprobada deja dos movimientos: `top_up` (+monto) y `gateway_fee` (−costo de la pasarela).

## 1. Secretos: Google Secret Manager

Los secretos **nunca** van en la base de datos, en los logs ni en las respuestas. Cada país tiene
tres, con el nombre `{PASARELA}_{PAÍS}_{NOMBRE}`:

| Variable | Qué es | Prefijo sandbox / producción |
|---|---|---|
| `WOMPI_CO_PRIVATE_KEY` | Llave privada (consulta de transacciones) | `prv_test_` / `prv_prod_` |
| `WOMPI_CO_EVENTS_SECRET` | Secreto de eventos (verifica el webhook) | `test_events_` / `prod_events_` |
| `WOMPI_CO_INTEGRITY_SECRET` | Secreto de integridad (firma el checkout) | `test_integrity_` / `prod_integrity_` |

Se crean en Secret Manager y App Hosting los inyecta como variables de entorno
(`apphosting.yaml`, sección `env`, con `secret:`):

```bash
firebase apphosting:secrets:set wompi-co-private-key
firebase apphosting:secrets:set wompi-co-events-secret
firebase apphosting:secrets:set wompi-co-integrity-secret
firebase apphosting:secrets:grantaccess wompi-co-private-key,wompi-co-events-secret,wompi-co-integrity-secret --backend <backend>
```

En local van en `.env` (ver `.env.example`). Si faltan los secretos de un país configurado, iniciar
una recarga responde `503 gateway_unavailable` y el log dice qué falta (nunca el valor).

## 2. Configuración no secreta

| Variable | Uso |
|---|---|
| `PAYMENTS_PUBLIC_BASE_URL` | Base HTTPS pública del API. La dirección de retorno es `{base}/pagos/retorno/{reference}`. Sin ella no se pueden iniciar recargas. |
| `PAYMENTS_APP_OPEN_URL` | A dónde lleva el botón "Volver a PorterosPRO" de la página de retorno. |
| `ANDROID_APP_PACKAGE`, `ANDROID_CERT_SHA256` | App Links de Android (`/.well-known/assetlinks.json`). Huellas SHA-256 separadas por comas (la de subida y la de Play App Signing). |
| `IOS_APP_ID` | Universal Links de iOS (`/.well-known/apple-app-site-association`), formato `TEAMID.bundle.id`. |

Sin las variables de enlace, los archivos `.well-known` responden `404` y la página funciona igual en
el navegador. En la app hay que declarar el dominio (Android: `intent-filter` con `autoVerify` para
`/pagos/retorno/*`; iOS: *Associated Domains* `applinks:<dominio>`).

## 3. La pasarela de cada país (administrador)

`PUT /api/admin/payment-gateways/{countryId}`:

```json
{ "gateway": "wompi",
  "publicConfig": { "publicKey": "pub_test_…", "environment": "sandbox" },
  "costs": { "percentBps": 265, "fixed": 700, "vatBps": 1900 },
  "amounts": [10000, 20000, 30000, 50000, 100000] }
```

- `percentBps` 265 = 2,65 %; `fixed` en pesos; `vatBps` 1900 = IVA del 19 % sobre la comisión. El
  costo se redondea hacia arriba: 20.000 → 1.464, neto 18.536. Usar las tarifas reales del contrato.
- La llave pública debe coincidir con el entorno (`pub_test_` en sandbox, `pub_prod_` en producción).
- Las recargas en curso conservan la pasarela y el entorno con que empezaron.

## 4. Panel de Wompi

1. **Desarrolladores → Llaves**: copiar la llave pública (va en la configuración del país) y los tres
   secretos (van en Secret Manager), del entorno correcto.
2. **Desarrolladores → Seguimiento de transacciones → URL de eventos**:
   `{PAYMENTS_PUBLIC_BASE_URL}/webhooks/payments/wompi`, una por entorno (sandbox y producción).
3. El webhook responde `200` a todo evento procesado (también a uno inválido o desconocido, que se
   ignora con un aviso en el log) y `500` solo ante un error interno, para que Wompi reintente.

## 5. Pruebas en sandbox

- Tarjeta aprobada: `4242 4242 4242 4242`; rechazada: `4111 1111 1111 1111` (cualquier fecha futura y CVC).
- Nequi sandbox: `3991111111` aprueba, `3992222222` rechaza.
- PSE sandbox: elegir el banco de pruebas y el resultado deseado.

(Confirmar los valores vigentes en la documentación de Wompi antes de probar.)

## 6. Verificación manual pendiente antes de producción

- **Consulta de transacciones por referencia**: la conciliación llama
  `GET {https://sandbox.wompi.co|https://production.wompi.co}/v1/transactions?reference={reference}`
  con `Authorization: Bearer {llave privada}` y toma la transacción más reciente. Confirmar contra la
  referencia del API de Wompi; si difiere, solo cambia `src/infrastructure/payments/wompiGateway.ts`.
- Un pago real pequeño en producción, y la vuelta a la app por App Link / Universal Link con Nequi y PSE.
