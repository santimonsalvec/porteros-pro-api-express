import { describe, expect, it } from 'vitest';
import { isPermission, PERMISSION_AREAS, PERMISSION_CATALOG } from '../../../../src/domain/staff/permissionCatalog.js';

/** The catalog of contracts/permissions.md (spec 001 of porteros-pro-admin), in order. */
const EXPECTED: [area: string, areaName: string, permission: string, description: string][] = [
  ['team', 'Equipo', 'staff.read', 'Ver los miembros del equipo'],
  ['team', 'Equipo', 'staff.manage', 'Invitar, cambiar el rol y desactivar miembros'],
  ['team', 'Equipo', 'roles.read', 'Ver los roles y sus permisos'],
  ['team', 'Equipo', 'roles.manage', 'Crear, editar y borrar roles'],
  ['team', 'Equipo', 'audit.read', 'Ver el registro de auditoría'],
  ['dashboard', 'Panel', 'dashboard.read', 'Ver las métricas del panel'],
  ['users', 'Usuarios', 'users.read', 'Ver usuarios, sus dispositivos y términos aceptados'],
  ['users', 'Usuarios', 'users.update', 'Corregir nombre y WhatsApp de un usuario'],
  ['users', 'Usuarios', 'users.block', 'Bloquear y desbloquear usuarios'],
  ['account_closures', 'Cierres de cuenta', 'account_closures.read', 'Ver las solicitudes de cierre de cuenta'],
  ['account_closures', 'Cierres de cuenta', 'account_closures.manage', 'Resolver deudas, registrar devoluciones y cerrar cuentas'],
  ['goalkeepers', 'Porteros', 'goalkeepers.read', 'Ver porteros, registros, retiros e inasistencias'],
  ['goalkeepers', 'Porteros', 'goalkeepers.update', 'Corregir los datos de identificación de un portero'],
  ['goalkeepers', 'Porteros', 'goalkeepers.registrations.review', 'Revisar registros de portero en curso'],
  ['goalkeepers', 'Porteros', 'goalkeepers.penalties.reverse', 'Revertir penalidades y levantar suspensiones'],
  ['goalkeepers', 'Porteros', 'goalkeepers.validate', 'Revisar antecedentes y validar, rechazar o revocar la validación de porteros'],
  ['goalkeepers', 'Porteros', 'goalkeepers.verify', 'Otorgar y revocar el sello de verificado de porteros'],
  ['requests', 'Solicitudes', 'requests.read', 'Ver solicitudes, reservas y su línea de tiempo'],
  ['requests', 'Solicitudes', 'requests.cancel', 'Cancelar solicitudes y reservas'],
  ['ratings', 'Calificaciones', 'ratings.read', 'Ver calificaciones'],
  ['cases', 'Casos', 'cases.read', 'Ver casos'],
  ['cases', 'Casos', 'cases.resolve', 'Resolver casos'],
  ['operating_balances', 'Saldos operativos', 'operating_balances.read', 'Ver saldos operativos y movimientos'],
  ['operating_balances', 'Saldos operativos', 'operating_balances.adjust', 'Hacer ajustes manuales de saldo operativo'],
  ['deposits', 'Depósitos', 'deposits.read', 'Ver depósitos y su conciliación'],
  ['deposits', 'Depósitos', 'deposits.reconcile', 'Forzar la conciliación de un depósito'],
  ['invoicing', 'Facturación', 'invoicing.read', 'Ver facturas y notas crédito'],
  ['invoicing', 'Facturación', 'invoicing.retry', 'Reintentar una factura rechazada'],
  ['invoicing', 'Facturación', 'invoicing.settings.manage', 'Configurar el proveedor de facturación por país'],
  ['geography', 'Geografía', 'geography.read', 'Ver países, regiones, ciudades y zonas'],
  ['geography', 'Geografía', 'geography.manage', 'Crear y editar países, regiones, ciudades y zonas'],
  ['catalogs', 'Catálogos', 'catalogs.manage', 'Editar tipos de documento y superficies'],
  ['pricing', 'Precios y reglas', 'pricing.read', 'Ver tarifas, comisiones, reglas de reserva e IVA'],
  ['pricing', 'Precios y reglas', 'pricing.manage', 'Cambiar tarifas, comisiones, reglas de reserva e IVA'],
  ['pricing', 'Precios y reglas', 'pricing.unverified_discount.manage', 'Configurar el descuento por portero no verificado'],
  ['payments', 'Pagos', 'payments.settings.manage', 'Configurar la pasarela de depósitos por país'],
  ['notifications', 'Notificaciones', 'notifications.read', 'Ver los avisos enviados a un usuario'],
  ['notifications', 'Notificaciones', 'notifications.send', 'Enviar un aviso de prueba a un usuario'],
  ['access', 'Acceso', 'access.settings.manage', 'Configurar el ingreso con código'],
  ['system', 'Sistema', 'system.read', 'Ver eventos, salud y parámetros del sistema'],
];

describe('permission catalog', () => {
  it('lists the 37 permissions of 18 areas, in the contract order', () => {
    const flattened = PERMISSION_AREAS.flatMap((area) =>
      area.permissions.map((permission) => [area.id, area.name, permission.id, permission.description]),
    );

    expect(flattened).toEqual(EXPECTED);
    expect(PERMISSION_AREAS).toHaveLength(18);
    expect(PERMISSION_CATALOG).toEqual(EXPECTED.map(([, , permission]) => permission));
  });

  it('includes the admin cancellation confirmed in spec 006 of porteros-pro-admin', () => {
    expect(PERMISSION_CATALOG).toContain('requests.cancel');
  });

  it('recognises only catalog permissions', () => {
    expect(isPermission('cases.read')).toBe(true);
    expect(isPermission('x.y')).toBe(false);
    expect(isPermission('')).toBe(false);
  });
});

describe('admin spec 030 permissions', () => {
  it('separates validating, verifying and configuring the unverified discount', () => {
    for (const id of ['goalkeepers.validate', 'goalkeepers.verify', 'pricing.unverified_discount.manage']) {
      expect(isPermission(id)).toBe(true);
    }
    const area = (id: string) => PERMISSION_AREAS.find((candidate) => candidate.permissions.some((permission) => permission.id === id))?.id;
    expect(area('goalkeepers.validate')).toBe('goalkeepers');
    expect(area('goalkeepers.verify')).toBe('goalkeepers');
    expect(area('pricing.unverified_discount.manage')).toBe('pricing');
  });
});
