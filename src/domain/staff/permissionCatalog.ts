/**
 * The fixed catalog of administration permissions (`resource.action`), grouped by area. It lives in
 * code because every `/admin/*` route checks one; roles are data that pick from it. The admin web
 * keeps a typed copy (`core/rbac/permission.ts`) and both are tested against
 * `porteros-pro-admin/specs/001-admin-access-foundations/contracts/permissions.md`.
 *
 * `users.block` and `requests.cancel` are deliberately absent until those rules are confirmed.
 */
export const PERMISSION_AREAS = [
  {
    id: 'team',
    name: 'Equipo',
    permissions: [
      { id: 'staff.read', description: 'Ver los miembros del equipo' },
      { id: 'staff.manage', description: 'Invitar, cambiar el rol y desactivar miembros' },
      { id: 'roles.read', description: 'Ver los roles y sus permisos' },
      { id: 'roles.manage', description: 'Crear, editar y borrar roles' },
      { id: 'audit.read', description: 'Ver el registro de auditoría' },
    ],
  },
  { id: 'dashboard', name: 'Panel', permissions: [{ id: 'dashboard.read', description: 'Ver las métricas del panel' }] },
  {
    id: 'users',
    name: 'Usuarios',
    permissions: [
      { id: 'users.read', description: 'Ver usuarios, sus dispositivos y términos aceptados' },
      { id: 'users.update', description: 'Corregir nombre y WhatsApp de un usuario' },
    ],
  },
  {
    id: 'goalkeepers',
    name: 'Porteros',
    permissions: [
      { id: 'goalkeepers.read', description: 'Ver porteros, registros, retiros e inasistencias' },
      { id: 'goalkeepers.update', description: 'Corregir los datos de identificación de un portero' },
      { id: 'goalkeepers.registrations.review', description: 'Revisar registros de portero en curso' },
      { id: 'goalkeepers.penalties.reverse', description: 'Revertir penalidades y levantar suspensiones' },
    ],
  },
  {
    id: 'requests',
    name: 'Solicitudes',
    permissions: [{ id: 'requests.read', description: 'Ver solicitudes, reservas y su línea de tiempo' }],
  },
  { id: 'ratings', name: 'Calificaciones', permissions: [{ id: 'ratings.read', description: 'Ver calificaciones' }] },
  {
    id: 'cases',
    name: 'Casos',
    permissions: [
      { id: 'cases.read', description: 'Ver casos' },
      { id: 'cases.resolve', description: 'Resolver casos' },
    ],
  },
  {
    id: 'wallets',
    name: 'Billeteras',
    permissions: [
      { id: 'wallets.read', description: 'Ver billeteras y movimientos' },
      { id: 'wallets.adjust', description: 'Hacer ajustes manuales de saldo' },
    ],
  },
  {
    id: 'topups',
    name: 'Recargas',
    permissions: [
      { id: 'topups.read', description: 'Ver recargas y su conciliación' },
      { id: 'topups.reconcile', description: 'Forzar la conciliación de una recarga' },
    ],
  },
  {
    id: 'invoicing',
    name: 'Facturación',
    permissions: [
      { id: 'invoicing.read', description: 'Ver facturas y notas crédito' },
      { id: 'invoicing.retry', description: 'Reintentar una factura rechazada' },
      { id: 'invoicing.settings.manage', description: 'Configurar el proveedor de facturación por país' },
    ],
  },
  {
    id: 'geography',
    name: 'Geografía',
    permissions: [
      { id: 'geography.read', description: 'Ver países, regiones, ciudades y zonas' },
      { id: 'geography.manage', description: 'Crear y editar países, regiones, ciudades y zonas' },
    ],
  },
  {
    id: 'catalogs',
    name: 'Catálogos',
    permissions: [{ id: 'catalogs.manage', description: 'Editar tipos de documento y superficies' }],
  },
  {
    id: 'pricing',
    name: 'Precios y reglas',
    permissions: [
      { id: 'pricing.read', description: 'Ver tarifas, comisiones, reglas de reserva e IVA' },
      { id: 'pricing.manage', description: 'Cambiar tarifas, comisiones, reglas de reserva e IVA' },
    ],
  },
  {
    id: 'payments',
    name: 'Pagos',
    permissions: [{ id: 'payments.settings.manage', description: 'Configurar la pasarela de recargas por país' }],
  },
  {
    id: 'notifications',
    name: 'Notificaciones',
    permissions: [
      { id: 'notifications.read', description: 'Ver los avisos enviados a un usuario' },
      { id: 'notifications.send', description: 'Enviar un aviso de prueba a un usuario' },
    ],
  },
  { id: 'system', name: 'Sistema', permissions: [{ id: 'system.read', description: 'Ver eventos, salud y parámetros del sistema' }] },
] as const;

export type PermissionArea = (typeof PERMISSION_AREAS)[number];
export type Permission = PermissionArea['permissions'][number]['id'];

/** Every permission, in catalog order (the order the admin web shows them in). */
export const PERMISSION_CATALOG: readonly Permission[] = PERMISSION_AREAS.flatMap((area) =>
  area.permissions.map((permission) => permission.id),
);

const CATALOG_SET: ReadonlySet<string> = new Set(PERMISSION_CATALOG);

export function isPermission(value: string): value is Permission {
  return CATALOG_SET.has(value);
}
