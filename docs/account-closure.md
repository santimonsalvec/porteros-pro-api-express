# Cierre de cuenta y devolución del saldo operativo (feature 029)

El **Saldo Operativo** es un depósito de garantía que cubre las comisiones de intermediación (con su
IVA) y las penalidades de los partidos que el portero juega en persona. No es retirable mientras la
cuenta está activa; **se devuelve al cerrar la cuenta**. Este documento describe ese proceso.

## Vocabulario

La plataforma no vende créditos, monedas ni puntos. Estos términos **no deben aparecer** en textos
visibles, rutas, campos ni notificaciones: *billetera*, *wallet*, *recarga*, *top-up*, *créditos*,
*monedas*, *puntos* (la nota crédito, documento fiscal, es la única excepción). La prueba
`tests/architecture/forbiddenTerms.test.ts` lo verifica sobre `src/` y `scripts/`.

| Concepto | Texto | Código |
|---|---|---|
| Lo que el portero mantiene | Saldo Operativo | `operatingBalance`, `/operating-balance` |
| Lo que paga con la pasarela | Depósito | `deposit`, `/deposits` |

## Estados de una solicitud (`accountClosures`)

```
requested ─ refund ─▶ refund_recorded ─ close ─▶ closed ─ (ingresa de nuevo) ─▶ reopened
    ├─ cancel (usuario) ─▶ cancelled
    └─ reject (administrador) ─▶ rejected
```

- **Abierta** (`requested`, `refund_recorded`): la cuenta está **inactiva**. Sigue pudiendo ingresar y
  ver el estado; lo demás responde `409 account_closing` (ofertas, partidos disponibles, aceptar,
  depositar y, para clientes, cotizar y reservar). Solo se deposita para cubrir una deuda cuando un
  administrador lo exigió.
- **Cerrada**: borrado lógico. No renueva sesión; movimientos, facturas y auditoría se conservan.
  Si la persona ingresa de nuevo, la cuenta se **reactiva** con su historial.

## Reglas

- No se puede **solicitar** el cierre con partidos aceptados por jugar (`409 closure_blocked`).
- El monto a devolver es el saldo (≥ 0). Con saldo negativo (deuda) el administrador elige: **exigir un
  depósito** que la cubra o **condonarla** con motivo (movimiento `debt_waiver`).
- La devolución (`closure_refund`) exige la constancia de la transferencia (referencia y fecha) cuando
  el monto es mayor que 0, y no se permite con depósitos pendientes, casos abiertos ni deuda.
- La transferencia al portero la hace el equipo **fuera de la plataforma**; el panel solo la registra.

## Rutas

| Quién | Ruta |
|---|---|
| Usuario | `GET/POST /profile/account-closure`, `POST /profile/account-closure/cancel` |
| Administrador | `GET /admin/account-closures`, `GET …/{closureId}`, `POST …/{closureId}/debt-resolution`, `…/refund`, `…/close`, `…/reject` |

Permisos: `account_closures.read` y `account_closures.manage`. Cada acción queda en el registro de
auditoría (`account_closure.debt_resolve|refund|close|reject`).

## Migración de la versión anterior

`scripts/migrate-029-operating-balance.ts` renombra las colecciones (`wallets`→`operatingBalances`,
`walletMovements`→`balanceMovements`, `topUps`→`deposits`), los campos y tipos que las referencian, los
permisos de los roles, la auditoría y los avisos. Ejecútalo **antes** de arrancar el API nuevo:

```sh
npx tsx scripts/migrate-029-operating-balance.ts --dry-run   # planifica y verifica, no escribe
npx tsx scripts/migrate-029-operating-balance.ts --yes       # aplica
```

No cambia ningún monto: compara conteos y sumas antes y después, y termina con error si algo no
coincide. Es idempotente.
