# Facturación electrónica (feature 023)

La plataforma factura cada **comisión** y cada **penalidad en dinero** que cobra a un portero, y
emite una **nota crédito** por cada comisión devuelta o penalidad revertida. Cada documento se envía a
la DIAN (o a la autoridad del país) a través del **proveedor de facturación configurado para el país
del portero**. El primero es **Siigo**, para Colombia.

## 1. IVA aparte

La comisión (y la penalidad) es lo que gana la plataforma. El IVA se cobra **encima**, como un
movimiento propio de la billetera, en la misma transacción:

| Movimiento | Signo | Cuándo |
|---|---|---|
| `commission_vat` | − | Al aceptar una reserva, junto con `commission_charge` |
| `commission_vat_refund` | + | Al devolver la comisión, con la tarifa con la que se cobró |
| `penalty_vat` / `penalty_vat_reversal` | − / + | Con una penalidad en dinero (hoy ninguna función las cobra) |

- **La tarifa** es por país: `PUT /api/admin/tax-settings/{countryId}` con `{"vatRateBps":1900}` (19 %). Sin configurar = 0 %, con un aviso `vat_not_configured` en el log.
- **Ejemplo** con 7.000 al 19 %: se descuentan 7.000 + 1.330 = 8.330.
- **Todas las reglas de fondos** usan comisión + IVA: ver partidos, recibir ofertas y aceptar. En la billetera, `offers.lowestCharge` y `missingAmount` ya incluyen el IVA.

## 2. Cómo se emite (por eventos, sin perder ninguno)

1. **El evento se guarda con el dinero.** El cobro (o la devolución) guarda el evento `commission.charged` (o `commission.refunded`) en el `outbox`, en la misma transacción que los movimientos (feature 013).
2. **Un consumidor aparte crea el documento.** Recibe el evento, crea el documento pendiente (uno por movimiento, índice único `source_unique`) e intenta emitirlo una vez. Si el proveedor falla, el documento queda pendiente y el mensaje **no** va al dead-letter.
3. **El barrido reintenta.** El job `invoicing-issuer` de `/internal/sweep`, cada minuto, hace tres cosas:
   - reintenta los documentos pendientes con esperas de 1, 5, 15 y 60 min y luego 3, 6, 12 y 24 h;
   - vuelve a consultar los que esperan a la DIAN;
   - como **red de seguridad**, crea el documento de cualquier cobro de más de 10 minutos que no lo tenga.
4. **Siigo no duplica documentos.** Se envía un `Idempotency-Key` por documento: si la respuesta se pierde, el reintento recibe el mismo documento.
5. **Notas crédito.** Una nota crédito espera a que su factura esté emitida y va al mismo proveedor que ella.

**Estados:**
- `pending`: por enviar o reintentando;
- `awaiting_authority`: creado en el proveedor, esperando a la DIAN;
- `issued`: emitido;
- `rejected`: rechazado por datos; lo corrige un administrador.

Siigo envía cada documento por correo al portero (PDF y XML). El portero los consulta y descarga en
`GET /api/goalkeepers/me/invoices`.

## 3. Proveedor por país

- **Configuración no secreta**, desde el administrador: `PUT /api/admin/invoicing/settings/{countryId}` con `{"provider":"siigo","config":{…}}`. La respuesta dice si existen las credenciales del país (`credentialsPresent`), sin mostrarlas.
- **Credenciales**, en Secret Manager, por proveedor y país: `{PROVEEDOR}_{PAÍS}_USERNAME` y `{PROVEEDOR}_{PAÍS}_ACCESS_KEY` (por ejemplo `SIIGO_CO_USERNAME` y `SIIGO_CO_ACCESS_KEY`), referenciadas en `apphosting.yaml`. Nunca van en la base de datos, los logs ni las respuestas.
- **Cada documento conserva su proveedor**, y la configuración con la que se envió. Si el país cambia de proveedor, los documentos ya enviados siguen con el anterior; los no enviados usan el nuevo.
- **País sin proveedor**: sus documentos quedan pendientes (`provider_not_configured`) y se emiten cuando el país se configure.
- **Activación**: `INVOICING_ENABLED=true`. Apagado (por defecto en local), los documentos se crean y esperan.

### Agregar el proveedor de un país nuevo

1. Un adaptador en `src/infrastructure/invoicing/` que implemente `IInvoicingProvider` (factura, nota crédito, estado, archivo, errores `transient` o `rejected`).
2. Su nombre en `SUPPORTED_INVOICING_PROVIDERS` y la validación de su configuración en `src/domain/invoicing/invoicingSettings.ts`.
3. Registrarlo en `InvoicingProviderRegistry` (`src/infrastructure/di.ts`).
4. Sus credenciales en Secret Manager y `apphosting.yaml`, y configurar el país desde el administrador.

## 4. Siigo (Colombia)

**En Siigo Nube:**
1. Cargar la resolución de facturación de la DIAN y su rango de numeración.
2. Crear un **producto** para la comisión y otro para la penalidad (sus códigos van en `commissionProductCode` y `penaltyProductCode`).
3. Anotar los ids de:
   - el **IVA 19 %** (`vatTaxId`);
   - el tipo de documento de **factura** (`invoiceDocumentId`) y de **nota crédito** (`creditNoteDocumentId`);
   - el **vendedor** (`sellerId`);
   - la **forma de pago** (`paymentMethodId`, por ejemplo "Otros").
4. En **Alianzas → Mi Credencial API**, obtener el usuario y la *access key*. Van en Secret Manager como `SIIGO_CO_USERNAME` y `SIIGO_CO_ACCESS_KEY`. El `partnerId` es el nombre de la integración.

```bash
firebase apphosting:secrets:set siigo-co-username
firebase apphosting:secrets:set siigo-co-access-key
firebase apphosting:secrets:grantaccess siigo-co-username,siigo-co-access-key --backend <backend>
```

```bash
curl -X PUT "$API/admin/invoicing/settings/$CO" -H "Authorization: Bearer $TA" -H "Content-Type: application/json" -d '{
  "provider": "siigo",
  "config": { "partnerId": "PorterosPRO", "invoiceDocumentId": 24446, "creditNoteDocumentId": 24447, "sellerId": 629,
              "commissionProductCode": "COMISION", "penaltyProductCode": "PENALIDAD", "vatTaxId": 13156, "paymentMethodId": 5636 } }'
```

**Datos del comprador:** el tipo y número de documento del perfil de portero (al momento del cobro),
el nombre y el correo de la cuenta, y la ciudad del perfil. Siigo exige los **códigos DANE** del
departamento y la ciudad: el responsable de la base de datos debe llenar `daneStateCode` y
`daneCityCode` en cada ciudad de la colección `cities`. Sin ellos el documento queda `rejected`
(`buyer_city_not_coded`); se corrige cargando los códigos y reintentando.

## 5. Operación

- **Rechazados**: `GET /api/admin/invoicing/documents?status=rejected` muestra el motivo (`lastError`). Se corrigen los datos y se reintenta con `POST /api/admin/invoicing/documents/{id}/retry`, que toma los datos actuales del portero.
- **Atascados**: el log `invoicing_pending_too_long` aparece cuando hay documentos pendientes por más de 24 h; el listado los marca `stale: true`.
- **Recuperados**: el log `invoicing_document_recovered` indica que la red de seguridad creó un documento cuyo evento se perdió.

## 6. Pendiente de confirmar en el sandbox de Siigo

- Que acepte un comprador sin dirección de calle (se envía el nombre de la ciudad), con `fiscal_responsibilities: R-99-PN`.
- Que exista `GET /v1/invoices/{id}/xml`. Si no existe, se sirve solo el PDF; el XML llega por correo.
- Que el total que calcula Siigo (base + IVA) coincida con el `payments.value` enviado, en bases que no den IVA entero.
- El código de motivo de la nota crédito (`reason: "2"`, anulación).
