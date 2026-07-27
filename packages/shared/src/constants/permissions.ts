export enum Permission {
  // Users
  USERS_READ = 'users.read',
  USERS_CREATE = 'users.create',
  USERS_UPDATE = 'users.update',
  USERS_DELETE = 'users.delete',

  // Salons
  SALONS_READ = 'salons.read',
  SALONS_CREATE = 'salons.create',
  SALONS_UPDATE = 'salons.update',
  SALONS_DELETE = 'salons.delete',

  // Leads
  LEADS_READ = 'leads.read',
  LEADS_CREATE = 'leads.create',
  LEADS_UPDATE = 'leads.update',
  LEADS_ASSIGN = 'leads.assign',
  LEADS_CONVERT = 'leads.convert',
  LEADS_DELETE = 'leads.delete',

  // Quotes
  QUOTES_READ = 'quotes.read',
  QUOTES_CREATE = 'quotes.create',
  QUOTES_UPDATE = 'quotes.update',
  QUOTES_APPROVE = 'quotes.approve',
  QUOTES_DELETE = 'quotes.delete',

  // Customers
  CUSTOMERS_READ = 'customers.read',
  CUSTOMERS_CREATE = 'customers.create',
  CUSTOMERS_UPDATE = 'customers.update',
  CUSTOMERS_DELETE = 'customers.delete',

  // Events
  EVENTS_READ = 'events.read',
  EVENTS_CREATE = 'events.create',
  EVENTS_UPDATE = 'events.update',
  EVENTS_CANCEL = 'events.cancel',
  // No route implements event deletion today (an Event is only ever cancelled/lost via status,
  // never hard- or soft-deleted) — this permission is declared for future use, not enforced anywhere.
  EVENTS_DELETE = 'events.delete',

  // Contracts
  CONTRACTS_READ = 'contracts.read',
  CONTRACTS_CREATE = 'contracts.create',
  CONTRACTS_UPDATE = 'contracts.update',
  CONTRACTS_APPROVE = 'contracts.approve',
  CONTRACTS_CANCEL = 'contracts.cancel',
  CONTRACTS_DELETE = 'contracts.delete',

  // Payments
  PAYMENTS_READ = 'payments.read',
  PAYMENTS_CREATE = 'payments.create',
  PAYMENTS_UPDATE = 'payments.update',
  PAYMENTS_APPROVE = 'payments.approve',
  PAYMENTS_REJECT = 'payments.reject',
  PAYMENTS_CANCEL = 'payments.cancel',

  // Inventory
  CATALOG_READ = 'catalog.read',
  CATALOG_CREATE = 'catalog.create',
  CATALOG_UPDATE = 'catalog.update',
  CATALOG_DELETE = 'catalog.delete',
  SUPPLIERS_READ = 'suppliers.read',
  SUPPLIERS_CREATE = 'suppliers.create',
  SUPPLIERS_UPDATE = 'suppliers.update',
  SUPPLIERS_DELETE = 'suppliers.delete',
  CONSUMPTION_RULES_READ = 'consumption-rules.read',
  CONSUMPTION_RULES_CREATE = 'consumption-rules.create',
  CONSUMPTION_RULES_UPDATE = 'consumption-rules.update',
  CONSUMPTION_RULES_DELETE = 'consumption-rules.delete',
  INVENTORY_READ = 'inventory.read',
  INVENTORY_UPDATE = 'inventory.update',
  INVENTORY_RESERVE = 'inventory.reserve',
  INVENTORY_RETURN = 'inventory.return',

  // Landing
  LANDING_READ = 'landing.read',
  LANDING_UPDATE = 'landing.update',

  // Promotions
  PROMOTIONS_READ = 'promotions.read',
  PROMOTIONS_CREATE = 'promotions.create',
  PROMOTIONS_UPDATE = 'promotions.update',

  // Campaigns
  CAMPAIGNS_READ = 'campaigns.read',
  CAMPAIGNS_CREATE = 'campaigns.create',
  CAMPAIGNS_UPDATE = 'campaigns.update',
  CAMPAIGNS_SEND = 'campaigns.send',
  CAMPAIGNS_CANCEL = 'campaigns.cancel',
  CAMPAIGNS_RETRY = 'campaigns.retry',
  CAMPAIGNS_DELETE = 'campaigns.delete',
  CAMPAIGNS_EXPORT = 'campaigns.export',

  // Marketing (templates, audiences, settings, unsubscribes)
  MARKETING_TEMPLATES_READ = 'marketingTemplates.read',
  MARKETING_TEMPLATES_MANAGE = 'marketingTemplates.manage',
  MARKETING_AUDIENCES_READ = 'marketingAudiences.read',
  MARKETING_AUDIENCES_MANAGE = 'marketingAudiences.manage',
  MARKETING_SETTINGS_READ = 'marketingSettings.read',
  MARKETING_SETTINGS_UPDATE = 'marketingSettings.update',
  MARKETING_UNSUBSCRIBES_READ = 'marketingUnsubscribes.read',

  // Invitations
  INVITATIONS_READ = 'invitations.read',
  INVITATIONS_CREATE = 'invitations.create',
  INVITATIONS_UPDATE = 'invitations.update',

  // Tickets
  TICKETS_READ = 'tickets.read',
  TICKETS_CREATE = 'tickets.create',
  TICKETS_UPDATE = 'tickets.update',
  TICKETS_VALIDATE = 'tickets.validate',
  DIGITAL_TICKETS_PUBLISH = 'digitalTickets.publish',
  DIGITAL_TICKETS_PAUSE = 'digitalTickets.pause',
  DIGITAL_TICKETS_CANCEL = 'digitalTickets.cancel',
  DIGITAL_TICKETS_ARCHIVE = 'digitalTickets.archive',
  DIGITAL_TICKETS_DELETE = 'digitalTickets.delete',
  DIGITAL_TICKET_SALES_READ = 'digitalTicketSales.read',
  DIGITAL_TICKET_PAYMENTS_READ = 'digitalTicketPayments.read',
  DIGITAL_TICKET_PAYMENTS_RECONCILE = 'digitalTicketPayments.reconcile',
  DIGITAL_TICKET_REFUNDS_READ = 'digitalTicketRefunds.read',
  DIGITAL_TICKET_REFUNDS_CREATE = 'digitalTicketRefunds.create',
  DIGITAL_TICKET_REFUNDS_APPROVE = 'digitalTicketRefunds.approve',
  DIGITAL_TICKET_DISCOUNTS_READ = 'digitalTicketDiscounts.read',
  DIGITAL_TICKET_DISCOUNTS_CREATE = 'digitalTicketDiscounts.create',
  DIGITAL_TICKET_DISCOUNTS_UPDATE = 'digitalTicketDiscounts.update',
  DIGITAL_TICKET_DISCOUNTS_DELETE = 'digitalTicketDiscounts.delete',
  DIGITAL_TICKET_SETTINGS_READ = 'digitalTicketSettings.read',
  DIGITAL_TICKET_SETTINGS_UPDATE = 'digitalTicketSettings.update',
  DIGITAL_TICKET_MERCADO_PAGO_CONNECT = 'digitalTicketMercadoPago.connect',
  DIGITAL_TICKET_MERCADO_PAGO_DISCONNECT = 'digitalTicketMercadoPago.disconnect',
  DIGITAL_TICKET_CHECKIN_REVERSE = 'digitalTicketCheckIn.reverse',

  // Payroll
  // Legacy broad permissions are kept so existing persisted overrides remain valid.
  PAYROLL_READ = 'payroll.read',
  PAYROLL_MANAGE = 'payroll.manage',
  PAYROLL_VIEW = 'payroll.view',
  PAYROLL_MANAGE_PROFILES = 'payroll.manage_profiles',
  PAYROLL_MANAGE_ATTENDANCE = 'payroll.manage_attendance',
  PAYROLL_CREATE = 'payroll.create',
  PAYROLL_CALCULATE = 'payroll.calculate',
  PAYROLL_APPROVE = 'payroll.approve',
  PAYROLL_PAY = 'payroll.pay',
  PAYROLL_EXPORT = 'payroll.export',
  PAYROLL_AUDIT = 'payroll.audit',
  PAYROLL_SELF_READ = 'payroll.self.read',

  // Mobile staff app — access gate + self-service attendance/profile actions.
  // Deliberately NOT tied to Role.STAFF alone: any role can be granted mobile
  // access via permissionOverrides (see docs/MOBILE_AUTHENTICATION.md).
  MOBILE_ACCESS = 'mobile.access',
  MOBILE_DEVICES_MANAGE = 'mobile.devices.manage',
  ATTENDANCE_CLOCK = 'attendance.clock',
  ATTENDANCE_HISTORY_SELF = 'attendance.history.self',
  ATTENDANCE_SCHEDULE_SELF = 'attendance.schedule.self',
  ATTENDANCE_INCIDENT_CREATE = 'attendance.incident.create',
  ATTENDANCE_ADJUSTMENT_REQUEST = 'attendance.adjustment.request',
  ATTENDANCE_READ = 'attendance.read',
  ATTENDANCE_MANAGE = 'attendance.manage',
  ATTENDANCE_SETTINGS_MANAGE = 'attendance.settings.manage',
  PROFILE_VIEW_SELF = 'profile.view.self',
  PROFILE_UPDATE_SELF = 'profile.update.self',
  PROFILE_AVATAR_UPDATE = 'profile.avatar.update',
  SECURITY_PASSWORD_CHANGE = 'security.password.change',

  // Settings
  SETTINGS_READ = 'settings.read',
  SETTINGS_UPDATE = 'settings.update',

  // Reports
  REPORTS_READ = 'reports.read',
  REPORTS_EXPORT = 'reports.export',
  REPORTS_COMMERCIAL_READ = 'reports.commercial.read',
  REPORTS_EVENTS_READ = 'reports.events.read',
  REPORTS_CONTRACTS_READ = 'reports.contracts.read',
  REPORTS_PAYMENTS_READ = 'reports.payments.read',
  REPORTS_PRODUCTION_READ = 'reports.production.read',
  REPORTS_EXPENSES_READ = 'reports.expenses.read',
  REPORTS_PROFITABILITY_READ = 'reports.profitability.read',
  REPORTS_ANALYTICS_READ = 'reports.analytics.read',

  // Dashboard
  DASHBOARD_VIEW = 'dashboard.view',
  DASHBOARD_FINANCIAL_VIEW = 'dashboard.view_financial',
  DASHBOARD_ALL_SALONS_VIEW = 'dashboard.view_all_salons',

  // Production
  PRODUCTION_VIEW = 'production.view',
  PRODUCTION_CREATE = 'production.create',
  PRODUCTION_UPDATE = 'production.update',
  PRODUCTION_COMPLETE = 'production.complete',
  PRODUCTION_REOPEN = 'production.reopen',
  PRODUCTION_GENERATE = 'production.generate',
  PRODUCTION_EXPORT = 'production.export',
  PRODUCTION_RULES_MANAGE = 'production.rules.manage',

  // Expenses
  EXPENSES_VIEW = 'expenses.view',
  EXPENSES_CREATE = 'expenses.create',
  EXPENSES_UPDATE = 'expenses.update',
  EXPENSES_DELETE = 'expenses.delete',
  EXPENSE_CATEGORIES_MANAGE = 'expenses.categories.manage',

  // First-party analytics
  ANALYTICS_VIEW = 'analytics.view',
  ANALYTICS_HEATMAP_VIEW = 'analytics.heatmap.view',
  ANALYTICS_SETTINGS_MANAGE = 'analytics.settings.manage',
  ANALYTICS_EXPORT = 'analytics.export'
}

import { Role } from './roles';

export const RolePresets: Record<Role, Permission[]> = {
  [Role.ADMIN]: Object.values(Permission),
  [Role.MANAGER]: [
    Permission.USERS_READ,
    Permission.SALONS_READ, Permission.SALONS_CREATE, Permission.SALONS_UPDATE,
    Permission.LEADS_READ, Permission.LEADS_CREATE, Permission.LEADS_UPDATE, Permission.LEADS_ASSIGN, Permission.LEADS_CONVERT,
    Permission.QUOTES_READ, Permission.QUOTES_CREATE, Permission.QUOTES_UPDATE, Permission.QUOTES_APPROVE, Permission.QUOTES_DELETE,
    Permission.CUSTOMERS_READ, Permission.CUSTOMERS_CREATE, Permission.CUSTOMERS_UPDATE,
    Permission.EVENTS_READ, Permission.EVENTS_CREATE, Permission.EVENTS_UPDATE, Permission.EVENTS_CANCEL,
    Permission.CONTRACTS_READ, Permission.CONTRACTS_CREATE, Permission.CONTRACTS_UPDATE, Permission.CONTRACTS_APPROVE, Permission.CONTRACTS_CANCEL,
    Permission.PAYMENTS_READ, Permission.PAYMENTS_CREATE, Permission.PAYMENTS_UPDATE,
    Permission.INVITATIONS_READ, Permission.INVITATIONS_CREATE, Permission.INVITATIONS_UPDATE,
    Permission.TICKETS_READ, Permission.TICKETS_CREATE, Permission.TICKETS_UPDATE, Permission.TICKETS_VALIDATE,
    Permission.DIGITAL_TICKETS_PUBLISH, Permission.DIGITAL_TICKETS_PAUSE, Permission.DIGITAL_TICKETS_CANCEL, Permission.DIGITAL_TICKETS_ARCHIVE, Permission.DIGITAL_TICKETS_DELETE,
    Permission.DIGITAL_TICKET_SALES_READ, Permission.DIGITAL_TICKET_PAYMENTS_READ, Permission.DIGITAL_TICKET_PAYMENTS_RECONCILE,
    Permission.DIGITAL_TICKET_REFUNDS_READ, Permission.DIGITAL_TICKET_REFUNDS_CREATE, Permission.DIGITAL_TICKET_DISCOUNTS_READ, Permission.DIGITAL_TICKET_DISCOUNTS_CREATE, Permission.DIGITAL_TICKET_DISCOUNTS_UPDATE,
    Permission.DIGITAL_TICKET_SETTINGS_READ, Permission.DIGITAL_TICKET_SETTINGS_UPDATE, Permission.DIGITAL_TICKET_CHECKIN_REVERSE,
    Permission.SUPPLIERS_READ, Permission.SUPPLIERS_CREATE, Permission.SUPPLIERS_UPDATE, Permission.SUPPLIERS_DELETE,
    Permission.LANDING_READ, Permission.LANDING_UPDATE,
    Permission.PROMOTIONS_READ, Permission.PROMOTIONS_CREATE, Permission.PROMOTIONS_UPDATE,
    Permission.CAMPAIGNS_READ, Permission.CAMPAIGNS_CREATE, Permission.CAMPAIGNS_UPDATE, Permission.CAMPAIGNS_SEND, Permission.CAMPAIGNS_CANCEL, Permission.CAMPAIGNS_RETRY, Permission.CAMPAIGNS_DELETE, Permission.CAMPAIGNS_EXPORT,
    Permission.MARKETING_TEMPLATES_READ, Permission.MARKETING_TEMPLATES_MANAGE,
    Permission.MARKETING_AUDIENCES_READ, Permission.MARKETING_AUDIENCES_MANAGE,
    Permission.MARKETING_SETTINGS_READ, Permission.MARKETING_SETTINGS_UPDATE,
    Permission.MARKETING_UNSUBSCRIBES_READ,
    Permission.PAYROLL_READ, Permission.PAYROLL_MANAGE,
    Permission.PAYROLL_VIEW, Permission.PAYROLL_MANAGE_PROFILES, Permission.PAYROLL_MANAGE_ATTENDANCE,
    Permission.PAYROLL_CREATE, Permission.PAYROLL_CALCULATE, Permission.PAYROLL_APPROVE, Permission.PAYROLL_PAY,
    Permission.PAYROLL_EXPORT, Permission.PAYROLL_AUDIT,
    Permission.MOBILE_DEVICES_MANAGE,
    Permission.ATTENDANCE_READ, Permission.ATTENDANCE_MANAGE, Permission.ATTENDANCE_SETTINGS_MANAGE,
    Permission.REPORTS_READ, Permission.REPORTS_EXPORT,
    Permission.REPORTS_COMMERCIAL_READ, Permission.REPORTS_EVENTS_READ, Permission.REPORTS_CONTRACTS_READ, Permission.REPORTS_PAYMENTS_READ,
    Permission.REPORTS_PRODUCTION_READ, Permission.REPORTS_EXPENSES_READ, Permission.REPORTS_PROFITABILITY_READ, Permission.REPORTS_ANALYTICS_READ,
    Permission.DASHBOARD_VIEW, Permission.DASHBOARD_FINANCIAL_VIEW, Permission.DASHBOARD_ALL_SALONS_VIEW,
    Permission.PRODUCTION_VIEW, Permission.PRODUCTION_CREATE, Permission.PRODUCTION_UPDATE, Permission.PRODUCTION_COMPLETE, Permission.PRODUCTION_REOPEN, Permission.PRODUCTION_GENERATE, Permission.PRODUCTION_EXPORT, Permission.PRODUCTION_RULES_MANAGE,
    Permission.EXPENSES_VIEW, Permission.EXPENSES_CREATE, Permission.EXPENSES_UPDATE, Permission.EXPENSES_DELETE, Permission.EXPENSE_CATEGORIES_MANAGE,
    Permission.ANALYTICS_VIEW, Permission.ANALYTICS_HEATMAP_VIEW, Permission.ANALYTICS_SETTINGS_MANAGE, Permission.ANALYTICS_EXPORT
  ],
  [Role.SALON_MANAGER]: [
    Permission.USERS_READ,
    Permission.SALONS_READ,
    Permission.LEADS_READ, Permission.LEADS_CREATE, Permission.LEADS_UPDATE, Permission.LEADS_ASSIGN, Permission.LEADS_CONVERT,
    Permission.QUOTES_READ, Permission.QUOTES_CREATE, Permission.QUOTES_UPDATE, Permission.QUOTES_DELETE,
    Permission.CUSTOMERS_READ, Permission.CUSTOMERS_CREATE, Permission.CUSTOMERS_UPDATE,
    Permission.EVENTS_READ, Permission.EVENTS_CREATE, Permission.EVENTS_UPDATE, Permission.EVENTS_CANCEL,
    Permission.CONTRACTS_READ, Permission.CONTRACTS_CREATE, Permission.CONTRACTS_UPDATE,
    Permission.PAYMENTS_READ, Permission.PAYMENTS_CREATE,
    Permission.INVITATIONS_READ,
    Permission.TICKETS_READ, Permission.TICKETS_VALIDATE,
    Permission.SUPPLIERS_READ,
    Permission.LANDING_READ, Permission.LANDING_UPDATE,
    Permission.PROMOTIONS_READ,
    Permission.CAMPAIGNS_READ, Permission.CAMPAIGNS_CREATE, Permission.CAMPAIGNS_UPDATE,
    Permission.MARKETING_TEMPLATES_READ,
    Permission.MARKETING_AUDIENCES_READ, Permission.MARKETING_AUDIENCES_MANAGE,
    Permission.ATTENDANCE_READ, Permission.ATTENDANCE_MANAGE,
    Permission.REPORTS_READ,
    Permission.REPORTS_COMMERCIAL_READ, Permission.REPORTS_EVENTS_READ, Permission.REPORTS_CONTRACTS_READ, Permission.REPORTS_PAYMENTS_READ, Permission.REPORTS_PRODUCTION_READ, Permission.REPORTS_EXPENSES_READ,
    Permission.DASHBOARD_VIEW,
    Permission.PRODUCTION_VIEW, Permission.PRODUCTION_UPDATE,
    Permission.EXPENSES_VIEW, Permission.EXPENSES_CREATE
  ],
  [Role.STAFF]: [
    Permission.EVENTS_READ,
    Permission.MOBILE_ACCESS,
    Permission.ATTENDANCE_CLOCK,
    Permission.ATTENDANCE_HISTORY_SELF,
    Permission.ATTENDANCE_SCHEDULE_SELF,
    Permission.ATTENDANCE_INCIDENT_CREATE,
    Permission.ATTENDANCE_ADJUSTMENT_REQUEST,
    Permission.PAYROLL_SELF_READ,
    Permission.PROFILE_VIEW_SELF,
    Permission.PROFILE_UPDATE_SELF,
    Permission.PROFILE_AVATAR_UPDATE,
    Permission.SECURITY_PASSWORD_CHANGE
  ]
};
