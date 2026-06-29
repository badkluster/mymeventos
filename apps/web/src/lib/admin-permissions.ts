import { hasAnyPermission, Permission, type Role } from '@mym/shared';
import type { ComponentType } from 'react';
import { Building2, CalendarDays, ClipboardList, CreditCard, FileText, LayoutDashboard, ReceiptText, Settings, UserRound, Users } from 'lucide-react';
import type { SessionUser } from './auth';

export type AdminModule = { href: string; label: string; title: string; description: string; icon: ComponentType<{ className?: string }>; permissions: Permission[] };

export const adminModules: AdminModule[] = [
  { href: '/admin', label: 'Panel', title: 'Panel', description: 'Accesos directos a los módulos implementados del backoffice.', icon: LayoutDashboard, permissions: [] },
  { href: '/admin/leads', label: 'Leads', title: 'Leads', description: 'Seguimiento comercial y oportunidades abiertas.', icon: ClipboardList, permissions: [Permission.LEADS_READ] },
  { href: '/admin/customers', label: 'Clientes', title: 'Clientes', description: 'Clientes consolidados con historial comercial.', icon: UserRound, permissions: [Permission.CUSTOMERS_READ] },
  { href: '/admin/quotes', label: 'Presupuestos', title: 'Solicitudes / Presupuestos', description: 'Solicitudes web y presupuesto comercial.', icon: ReceiptText, permissions: [Permission.QUOTES_READ] },
  { href: '/admin/events', label: 'Eventos', title: 'Eventos', description: 'Eventos creados desde presupuestos convertidos.', icon: CalendarDays, permissions: [Permission.EVENTS_READ] },
  { href: '/admin/contracts', label: 'Contratos', title: 'Contratos', description: 'Contratos formales generados desde eventos.', icon: FileText, permissions: [Permission.CONTRACTS_READ] },
  { href: '/admin/payments', label: 'Pagos', title: 'Pagos', description: 'Señas, cuotas, saldos y depósitos asociados a contratos.', icon: CreditCard, permissions: [Permission.PAYMENTS_READ] },
  { href: '/admin/salons', label: 'Salones', title: 'Salones', description: 'Salones, paquetes y reglas comerciales.', icon: Building2, permissions: [Permission.SALONS_READ] },
  { href: '/admin/users', label: 'Usuarios', title: 'Usuarios', description: 'Usuarios activos del backoffice.', icon: Users, permissions: [Permission.USERS_READ] },
  { href: '/admin/settings', label: 'Configuración', title: 'Configuración', description: 'Parámetros operativos del sistema.', icon: Settings, permissions: [Permission.SETTINGS_READ, Permission.SETTINGS_UPDATE] }
];

export function userCanAccess(user: SessionUser | null | undefined, permissions: Permission[]): boolean {
  if (!user) return false;
  if (!permissions.length) return true;
  return (user.roles ?? []).some((role) => hasAnyPermission(role as Role, permissions, user.permissionOverrides as Permission[] ?? [], user.permissionDeniedOverrides as Permission[] ?? []));
}

export function visibleAdminModules(user: SessionUser | null | undefined): AdminModule[] {
  return adminModules.filter((module) => userCanAccess(user, module.permissions));
}

export function moduleForPath(pathname: string): AdminModule | undefined {
  return adminModules.filter((module) => module.href !== '/admin').find((module) => pathname === module.href || pathname.startsWith(`${module.href}/`));
}
