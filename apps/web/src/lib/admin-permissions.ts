import { hasAnyPermission, Permission, type Role } from '@mym/shared';
import type { ComponentType } from 'react';
import { Activity, BadgeDollarSign, Bell, Building2, CalendarClock, CalendarDays, ChartNoAxesCombined, ChefHat, ClipboardList, Clock3, CreditCard, FileText, Globe2, LayoutDashboard, Mail, Megaphone, ReceiptText, Settings, Ticket, Truck, UserRound, Users, WalletCards } from 'lucide-react';
import type { SessionUser } from './auth';

export type AdminModule = { href: string; label: string; title: string; description: string; icon: ComponentType<{ className?: string }>; permissions: Permission[] };

export const adminModules: AdminModule[] = [
  { href: '/admin/dashboard', label: 'Dashboard', title: 'Dashboard gerencial', description: 'Indicadores, agenda y alertas operativas con información real.', icon: LayoutDashboard, permissions: [Permission.DASHBOARD_VIEW] },
  { href: '/admin/calendar', label: 'Calendario', title: 'Calendario', description: 'Agenda centralizada por día, semana, mes y año.', icon: CalendarClock, permissions: [Permission.EVENTS_READ] },
  { href: '/admin/leads', label: 'Leads', title: 'Leads', description: 'Seguimiento comercial y oportunidades abiertas.', icon: ClipboardList, permissions: [Permission.LEADS_READ] },
  { href: '/admin/customers', label: 'Clientes', title: 'Clientes', description: 'Clientes consolidados con historial comercial.', icon: UserRound, permissions: [Permission.CUSTOMERS_READ] },
  { href: '/admin/quotes', label: 'Presupuestos', title: 'Solicitudes / Presupuestos', description: 'Solicitudes web y presupuesto comercial.', icon: ReceiptText, permissions: [Permission.QUOTES_READ] },
  { href: '/admin/events', label: 'Eventos', title: 'Eventos', description: 'Eventos creados desde presupuestos convertidos.', icon: CalendarDays, permissions: [Permission.EVENTS_READ] },
  { href: '/admin/contracts', label: 'Contratos', title: 'Contratos', description: 'Contratos formales generados desde eventos.', icon: FileText, permissions: [Permission.CONTRACTS_READ] },
  { href: '/admin/digital-invitations', label: 'Invitaciones Digitales', title: 'Invitaciones Digitales', description: 'Invitaciones, invitados y confirmaciones independientes.', icon: Mail, permissions: [Permission.INVITATIONS_READ] },
  { href: '/admin/digital-tickets', label: 'Entradas Digitales', title: 'Entradas Digitales', description: 'Publicaciones, órdenes, entradas y control de ingreso independientes.', icon: Ticket, permissions: [Permission.TICKETS_READ] },
  { href: '/admin/payments', label: 'Ingresos', title: 'Ingresos', description: 'Cobros, señas, cuotas, saldos y depósitos asociados a contratos.', icon: CreditCard, permissions: [Permission.PAYMENTS_READ] },
  { href: '/admin/expenses', label: 'Gastos', title: 'Gastos y rentabilidad', description: 'Costos, comprobantes, categorías y margen por evento.', icon: WalletCards, permissions: [Permission.EXPENSES_VIEW] },
  { href: '/admin/payroll', label: 'Liquidación de Sueldos', title: 'Liquidación de Sueldos', description: 'Asistencias aprobadas, perfiles salariales, liquidaciones, adelantos y pagos internos.', icon: BadgeDollarSign, permissions: [Permission.PAYROLL_VIEW, Permission.PAYROLL_READ] },
  { href: '/admin/reports', label: 'Reportes', title: 'Centro de reportes', description: 'Información comercial, operativa y financiera exportable.', icon: ChartNoAxesCombined, permissions: [Permission.REPORTS_READ] },
  { href: '/admin/production', label: 'Producción', title: 'Producción', description: 'Planes por evento, consolidación y reglas de cálculo.', icon: ChefHat, permissions: [Permission.PRODUCTION_VIEW] },
  { href: '/admin/analytics', label: 'Analítica', title: 'Analítica del sitio', description: 'Visitas, consultas, secciones e interacciones, con datos anónimos.', icon: Activity, permissions: [Permission.ANALYTICS_VIEW] },
  { href: '/admin/suppliers', label: 'Proveedores', title: 'Proveedores', description: 'Proveedores para productos, servicios y compras futuras.', icon: Truck, permissions: [Permission.SUPPLIERS_READ] },
  { href: '/admin/marketing', label: 'Marketing', title: 'Marketing y Campañas', description: 'Campañas de email, plantillas, promociones y audiencias.', icon: Megaphone, permissions: [Permission.CAMPAIGNS_READ] },
  { href: '/admin/landing', label: 'Landing', title: 'Landing pública', description: 'Hero, promociones, galería, testimonios, preguntas frecuentes y bloques comerciales.', icon: Globe2, permissions: [Permission.LANDING_READ] },
  { href: '/admin/notifications', label: 'Notificaciones', title: 'Notificaciones', description: 'Avisos operativos, pendientes y accesos rápidos del backoffice.', icon: Bell, permissions: [] },
  { href: '/admin/salons', label: 'Salones', title: 'Salones', description: 'Salones, paquetes y reglas comerciales.', icon: Building2, permissions: [Permission.SALONS_READ] },
  { href: '/admin/users', label: 'Usuarios', title: 'Usuarios y equipo', description: 'Personas, roles, operación, horarios y capacidades de asistencia.', icon: Users, permissions: [Permission.USERS_READ] },
  { href: '/admin/attendance', label: 'Asistencia', title: 'Asistencia y app móvil', description: 'Jornadas activas, historial, incidencias, correcciones y configuración de fichaje móvil.', icon: Clock3, permissions: [Permission.ATTENDANCE_READ] },
  { href: '/admin/settings', label: 'Configuración', title: 'Configuración', description: 'Parámetros operativos del sistema.', icon: Settings, permissions: [Permission.SETTINGS_READ] }
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
  return adminModules.find((module) => pathname === module.href || pathname.startsWith(`${module.href}/`));
}
