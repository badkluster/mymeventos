export enum Permission {
  // Users
  USERS_READ = 'users.read',
  USERS_CREATE = 'users.create',
  USERS_UPDATE = 'users.update',
  USERS_DELETE = 'users.delete',

  // Salons
  SALONS_READ = 'salons.read',
  SALONS_UPDATE = 'salons.update',

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

  // Events
  EVENTS_READ = 'events.read',
  EVENTS_CREATE = 'events.create',
  EVENTS_UPDATE = 'events.update',
  EVENTS_CANCEL = 'events.cancel',

  // Payments
  PAYMENTS_READ = 'payments.read',
  PAYMENTS_CREATE = 'payments.create',
  PAYMENTS_APPROVE = 'payments.approve',
  PAYMENTS_REJECT = 'payments.reject',

  // Inventory
  INVENTORY_READ = 'inventory.read',
  INVENTORY_UPDATE = 'inventory.update',
  INVENTORY_RESERVE = 'inventory.reserve',
  INVENTORY_RETURN = 'inventory.return',

  // Promotions
  PROMOTIONS_READ = 'promotions.read',
  PROMOTIONS_CREATE = 'promotions.create',
  PROMOTIONS_UPDATE = 'promotions.update',

  // Campaigns
  CAMPAIGNS_READ = 'campaigns.read',
  CAMPAIGNS_CREATE = 'campaigns.create',
  CAMPAIGNS_SEND = 'campaigns.send',

  // Invitations
  INVITATIONS_READ = 'invitations.read',
  INVITATIONS_CREATE = 'invitations.create',
  INVITATIONS_UPDATE = 'invitations.update',

  // Tickets
  TICKETS_READ = 'tickets.read',
  TICKETS_CREATE = 'tickets.create',
  TICKETS_VALIDATE = 'tickets.validate',

  // Payroll
  PAYROLL_READ = 'payroll.read',
  PAYROLL_MANAGE = 'payroll.manage',

  // Settings
  SETTINGS_READ = 'settings.read',
  SETTINGS_UPDATE = 'settings.update',

  // Reports
  REPORTS_READ = 'reports.read',
  REPORTS_EXPORT = 'reports.export'
}

import { Role } from './roles';

export const RolePresets: Record<Role, Permission[]> = {
  [Role.ADMIN]: Object.values(Permission),
  [Role.MANAGER]: [
    Permission.USERS_READ,
    Permission.SALONS_READ, Permission.SALONS_UPDATE,
    Permission.LEADS_READ, Permission.LEADS_CREATE, Permission.LEADS_UPDATE, Permission.LEADS_ASSIGN, Permission.LEADS_CONVERT,
    Permission.QUOTES_READ, Permission.QUOTES_CREATE, Permission.QUOTES_UPDATE, Permission.QUOTES_APPROVE,
    Permission.EVENTS_READ, Permission.EVENTS_CREATE, Permission.EVENTS_UPDATE,
    Permission.PAYMENTS_READ,
    Permission.INVENTORY_READ, Permission.INVENTORY_UPDATE, Permission.INVENTORY_RESERVE, Permission.INVENTORY_RETURN,
    Permission.PROMOTIONS_READ, Permission.PROMOTIONS_CREATE, Permission.PROMOTIONS_UPDATE,
    Permission.CAMPAIGNS_READ, Permission.CAMPAIGNS_CREATE, Permission.CAMPAIGNS_SEND,
    Permission.REPORTS_READ, Permission.REPORTS_EXPORT
  ],
  [Role.SALON_MANAGER]: [
    Permission.USERS_READ,
    Permission.SALONS_READ,
    Permission.LEADS_READ, Permission.LEADS_CREATE, Permission.LEADS_UPDATE, Permission.LEADS_ASSIGN, Permission.LEADS_CONVERT,
    Permission.QUOTES_READ, Permission.QUOTES_CREATE, Permission.QUOTES_UPDATE,
    Permission.EVENTS_READ, Permission.EVENTS_CREATE, Permission.EVENTS_UPDATE,
    Permission.PAYMENTS_READ,
    Permission.INVENTORY_READ, Permission.INVENTORY_RESERVE, Permission.INVENTORY_RETURN,
    Permission.REPORTS_READ
  ],
  [Role.STAFF]: [
    Permission.EVENTS_READ,
    Permission.INVENTORY_READ
  ],
  [Role.ACCOUNTING]: [
    Permission.PAYMENTS_READ, Permission.PAYMENTS_CREATE, Permission.PAYMENTS_APPROVE, Permission.PAYMENTS_REJECT,
    Permission.REPORTS_READ, Permission.REPORTS_EXPORT,
    Permission.PAYROLL_READ, Permission.PAYROLL_MANAGE
  ],
  [Role.OPERATIONS]: [
    Permission.EVENTS_READ,
    Permission.INVENTORY_READ, Permission.INVENTORY_UPDATE, Permission.INVENTORY_RESERVE, Permission.INVENTORY_RETURN
  ],
  [Role.SALES]: [
    Permission.LEADS_READ, Permission.LEADS_CREATE, Permission.LEADS_UPDATE,
    Permission.QUOTES_READ, Permission.QUOTES_CREATE, Permission.QUOTES_UPDATE,
    Permission.EVENTS_READ
  ],
  [Role.VALIDATOR]: [
    Permission.TICKETS_VALIDATE, Permission.TICKETS_READ
  ]
};
