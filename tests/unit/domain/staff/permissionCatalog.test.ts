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
  ['goalkeepers', 'Porteros', 'goalkeepers.read', 'Ver porteros, registros, retiros e inasistencias'],
  ['goalkeepers', 'Porteros', 'goalkeepers.update', 'Corregir los datos de identificación de un portero'],
  ['goalkeepers', 'Porteros', 'goalkeepers.registrations.review', 'Revisar registros de portero en curso'],
  ['goalkeepers', 'Porteros', 'goalkeepers.penalties.reverse', 'Revertir penalidades y levantar suspensiones'],
  ['requests', 'Solicitudes', 'requests.read', 'Ver solicitudes, reservas y su línea de tiempo'],
  ['ratings', 'Calificaciones', 'ratings.read', 'Ver calificaciones'],
  ['cases', 'Casos', 'cases.read', 'Ver casos'],
  ['cases', 'Casos', 'cases.resolve', 'Resolver casos'],
  ['wallets', 'Billeteras', 'wallets.read', 'Ver billeteras y movimientos'],
  ['wallets', 'Billeteras', 'wallets.adjust', 'Hacer ajustes manuales de saldo'],
  ['topups', 'Recargas', 'topups.read', 'Ver recargas y su conciliación'],
  ['topups', 'Recargas', 'topups.reconcile', 'Forzar la conciliación de una recarga'],
  ['invoicing', 'Facturación', 'invoicing.read', 'Ver facturas y notas crédito'],
  ['invoicing', 'Facturación', 'invoicing.retry', 'Reintentar una factura rechazada'],
  ['invoicing', 'Facturación', 'invoicing.settings.manage', 'Configurar el proveedor de facturación por país'],
  ['geography', 'Geografía', 'geography.read', 'Ver países, regiones, ciudades y zonas'],
  ['geography', 'Geografía', 'geography.manage', 'Crear y editar países, regiones, ciudades y zonas'],
  ['catalogs', 'Catálogos', 'catalogs.manage', 'Editar tipos de documento y superficies'],
  ['pricing', 'Precios y reglas', 'pricing.read', 'Ver tarifas, comisiones, reglas de reserva e IVA'],
  ['pricing', 'Precios y reglas', 'pricing.manage', 'Cambiar tarifas, comisiones, reglas de reserva e IVA'],
  ['payments', 'Pagos', 'payments.settings.manage', 'Configurar la pasarela de recargas por país'],
  ['notifications', 'Notificaciones', 'notifications.read', 'Ver los avisos enviados a un usuario'],
  ['notifications', 'Notificaciones', 'notifications.send', 'Enviar un aviso de prueba a un usuario'],
  ['system', 'Sistema', 'system.read', 'Ver eventos, salud y parámetros del sistema'],
];

describe('permission catalog', () => {
  it('lists the 32 permissions of 16 areas, in the contract order', () => {
    const flattened = PERMISSION_AREAS.flatMap((area) =>
      area.permissions.map((permission) => [area.id, area.name, permission.id, permission.description]),
    );

    expect(flattened).toEqual(EXPECTED);
    expect(PERMISSION_AREAS).toHaveLength(16);
    expect(PERMISSION_CATALOG).toEqual(EXPECTED.map(([, , permission]) => permission));
  });

  it('leaves out the rules not yet confirmed by the owner', () => {
    expect(PERMISSION_CATALOG).not.toContain('users.block');
    expect(PERMISSION_CATALOG).not.toContain('requests.cancel');
  });

  it('recognises only catalog permissions', () => {
    expect(isPermission('cases.read')).toBe(true);
    expect(isPermission('x.y')).toBe(false);
    expect(isPermission('')).toBe(false);
  });
});
