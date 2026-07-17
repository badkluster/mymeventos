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
  CAMPAIGNS_SEND = 'campaigns.send',

  // Invitations
  INVITATIONS_READ = 'invitations.read',
  INVITATIONS_CREATE = 'invitations.create',
  INVITATIONS_UPDATE = 'invitations.update',

  // Tickets
  TICKETS_READ = 'tickets.read',
  TICKETS_CREATE = 'tickets.create',
  TICKETS_UPDATE = 'tickets.update',
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
    Permission.SALONS_READ, Permission.SALONS_CREATE, Permission.SALONS_UPDATE,
    Permission.LEADS_READ, Permission.LEADS_CREATE, Permission.LEADS_UPDATE, Permission.LEADS_ASSIGN, Permission.LEADS_CONVERT,
    Permission.QUOTES_READ, Permission.QUOTES_CREATE, Permission.QUOTES_UPDATE, Permission.QUOTES_APPROVE,
    Permission.CUSTOMERS_READ, Permission.CUSTOMERS_CREATE, Permission.CUSTOMERS_UPDATE,
    Permission.EVENTS_READ, Permission.EVENTS_CREATE, Permission.EVENTS_UPDATE, Permission.EVENTS_CANCEL,
    Permission.CONTRACTS_READ, Permission.CONTRACTS_CREATE, Permission.CONTRACTS_UPDATE, Permission.CONTRACTS_APPROVE, Permission.CONTRACTS_CANCEL,
    Permission.PAYMENTS_READ, Permission.PAYMENTS_CREATE, Permission.PAYMENTS_UPDATE,
    Permission.INVITATIONS_READ, Permission.INVITATIONS_CREATE, Permission.INVITATIONS_UPDATE,
    Permission.TICKETS_READ, Permission.TICKETS_CREATE, Permission.TICKETS_UPDATE, Permission.TICKETS_VALIDATE,
    Permission.SUPPLIERS_READ, Permission.SUPPLIERS_CREATE, Permission.SUPPLIERS_UPDATE, Permission.SUPPLIERS_DELETE,
    Permission.LANDING_READ, Permission.LANDING_UPDATE,
    Permission.PROMOTIONS_READ, Permission.PROMOTIONS_CREATE, Permission.PROMOTIONS_UPDATE,
    Permission.CAMPAIGNS_READ, Permission.CAMPAIGNS_CREATE, Permission.CAMPAIGNS_SEND,
    Permission.REPORTS_READ, Permission.REPORTS_EXPORT
  ],
  [Role.SALON_MANAGER]: [
    Permission.USERS_READ,
    Permission.SALONS_READ,
    Permission.LEADS_READ, Permission.LEADS_CREATE, Permission.LEADS_UPDATE, Permission.LEADS_ASSIGN, Permission.LEADS_CONVERT,
    Permission.QUOTES_READ, Permission.QUOTES_CREATE, Permission.QUOTES_UPDATE,
    Permission.CUSTOMERS_READ, Permission.CUSTOMERS_CREATE, Permission.CUSTOMERS_UPDATE,
    Permission.EVENTS_READ, Permission.EVENTS_CREATE, Permission.EVENTS_UPDATE,
    Permission.CONTRACTS_READ, Permission.CONTRACTS_CREATE, Permission.CONTRACTS_UPDATE,
    Permission.PAYMENTS_READ, Permission.PAYMENTS_CREATE,
    Permission.INVITATIONS_READ,
    Permission.TICKETS_READ, Permission.TICKETS_VALIDATE,
    Permission.SUPPLIERS_READ,
    Permission.LANDING_READ, Permission.LANDING_UPDATE,
    Permission.REPORTS_READ
  ],
  [Role.STAFF]: [
    Permission.EVENTS_READ
  ]
};
