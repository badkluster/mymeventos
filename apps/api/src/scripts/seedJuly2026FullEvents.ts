import mongoose from 'mongoose';
import type { Request } from 'express';
import { ExpenseSourceType, ExpenseStatus, Role, SupplierCategory } from '@mym/shared';
import { env } from '../config/env';
import { connectDatabase, disconnectDatabase } from '../db/connection';
import {
  CalendarItem, Contract, Customer, Event, EventStaffAssignment, Lead, LeadActivity,
  PackageTemplate, Payment, Quote, QuoteRevision, VenuePackageRule,
} from '../modules/crm/crm.models';
import { EventTablewareAllocation } from '../modules/crm/eventTablewareAllocation.model';
import { convertQuoteToEvent } from '../modules/crm/quote-to-event.service';
import { approveContract, createContractFromEvent } from '../modules/crm/event-to-contract.service';
import { createPayment } from '../modules/crm/payments.service';
import { syncEventSupplierExpenses, type EventSupplierAssignmentInput } from '../modules/crm/event-supplier-expenses.service';
import { EventClosure } from '../modules/event-closure/event-closure.model';
import {
  CatalogItem, ConsumptionRule, Expense, ExpenseAllocation, InventoryItem, Supplier,
} from '../modules/operations/operations.models';
import { ProductionItem, ProductionPlan, ProductionRule, ProductionSection } from '../modules/production/production.models';
import { generateProductionPlan } from '../modules/production/production.service';
import { Salon } from '../modules/salons/salon.model';
import { SalonStockItem } from '../modules/salons/salonStockItem.model';
import { TimePunch, WorkSession } from '../modules/attendance/attendance.models';
import { User } from '../modules/users/user.model';
import { AuditLog } from '../modules/audit/auditLog.model';
import {
  JULY_2026_EVENT_DAYS, JULY_2026_SEED_KEY, addUtcDays, auditResourcePlan, buildGuestPlan,
  assertSeedWriteAllowed, chooseGuestCount, classifySeedTarget, createSeededRandom, dateAtUtc, dateKey, dietaryCountsFor,
  eventDateTime, guestBreakdownFor, money, parseSeedArguments,
} from './seedJuly2026FullEvents.helpers';

type AnyRecord = Record<string, any>;
type Scenario = {
  index: number;
  key: string;
  marker: string;
  salon: AnyRecord;
  packageTemplate: AnyRecord;
  packageValues: AnyRecord;
  eventDay: string;
  eventType: string;
  eventName: string;
  honoreeName: string;
  guestCount: number;
  dietary: { vegetarian: number; vegan: number; celiac: number; lactoseIntolerant: number };
  guestBreakdown: ReturnType<typeof guestBreakdownFor>;
  startTime: string;
  endTime: string;
  totalAmount: number;
  depositAmount: number;
  menuSections: AnyRecord[];
  includedServices: string[];
  businessDates: { lead: Date; quote: Date; sent: Date; accepted: Date; contract: Date };
  paymentPlan: AnyRecord[];
  resourcePlan: AnyRecord;
};
type SeedRecord = Scenario & { event: AnyRecord; lead: AnyRecord; customer: AnyRecord; quote: AnyRecord; contract?: AnyRecord };
type AuditRow = {
  event: AnyRecord;
  contract?: AnyRecord;
  payments: AnyRecord[];
  expenses: AnyRecord[];
  plan?: AnyRecord;
  productionItems: AnyRecord[];
  staffAssignments: AnyRecord[];
  attendanceSessions: AnyRecord[];
  tablewareAllocations: AnyRecord[];
  errors: string[];
  operationalReady: boolean;
  financialReady: boolean;
  administrativeReady: boolean;
};

const eventTypes = ['fifteen', 'wedding', 'birthday', 'anniversary', 'baptism_communion', 'graduates', 'corporate'];
const linenColors = ['Marfil y dorado', 'Blanco y verde oliva', 'Azul noche y plata', 'Rosa viejo y marfil', 'Terracota y natural', 'Negro y dorado'];
const customerFirstNames = ['Mariana', 'Lucas', 'Carolina', 'Federico', 'Agustina', 'Nicolás', 'Florencia', 'Martín', 'Paula', 'Gonzalo', 'Julieta', 'Ignacio', 'Valeria', 'Sebastián'];
const customerLastNames = ['Fernández', 'Martínez', 'Gómez', 'López', 'Rodríguez', 'Pérez', 'Sánchez', 'Romero', 'Díaz', 'Álvarez', 'Torres', 'Ruiz', 'Medina', 'Castro'];
const supplierCategoryLabels: Record<string, string> = {
  BEVERAGES: 'Bebidas y reposición de barra', SOUND_DJ: 'DJ, sonido e iluminación', DECORATION: 'Ambientación y decoración',
  PHOTOGRAPHY: 'Fotografía y registro audiovisual', PASTRY: 'Torta y mesa dulce', STAFFING: 'Apoyo operativo externo', OTHER: 'Servicio complementario',
};

function id(value: any): string { return String(value?._id ?? value ?? ''); }
function markerFor(index: number): string { return `[${JULY_2026_SEED_KEY}:E${String(index + 1).padStart(3, '0')}]`; }
function seedRegex(): RegExp { return new RegExp(JULY_2026_SEED_KEY); }
function exactMarkerRegex(marker: string): RegExp { return new RegExp(marker.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')); }
function roundMoney(value: number): number { return Math.round(value * 100) / 100; }
function defined(source: AnyRecord, keys: string[]): AnyRecord {
  return Object.fromEntries(keys.filter((key) => source[key] !== undefined).map((key) => [key, source[key]]));
}
function shiftTime(time: string, minutes: number): string {
  const [hours, mins] = time.split(':').map(Number);
  const total = (hours * 60 + mins + minutes + 1_440 * 4) % 1_440;
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}
function addHoursToTime(time: string, hours: number): string { return shiftTime(time, Math.round(hours * 60)); }
function sanitizeKey(value: string): string { return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-|-$/g, '').toLowerCase(); }

function targetClassification() {
  return classifySeedTarget({ nodeEnv: env.NODE_ENV, vercelEnv: process.env.VERCEL_ENV, mongodbUri: env.MONGODB_URI });
}

function assertWriteAllowed(): void {
  assertSeedWriteAllowed(targetClassification(), process.env.ALLOW_FULL_EVENT_SEED);
}

function packagePrice(values: AnyRecord, guestCount: number): { totalAmount: number; depositAmount: number } {
  const pricingMode = values.pricingMode === 'fixed' ? 'fixed' : 'per_person';
  const discount = Number(values.discountPercentage || 0);
  const perPerson = Number(values.pricePerPerson || values.finalPricePerPerson || 0);
  const fixed = Number(values.fixedPrice || values.finalFixedPrice || 0);
  const finalPerPerson = Number(values.finalPricePerPerson || Math.round(perPerson * (1 - discount / 100)));
  const finalFixed = Number(values.finalFixedPrice || Math.round(fixed * (1 - discount / 100)));
  const totalAmount = pricingMode === 'fixed' ? finalFixed : Math.round(finalPerPerson * guestCount);
  if (!(totalAmount > 0)) throw new Error(`El paquete ${values.name || '(sin nombre)'} no tiene un precio utilizable.`);
  const configuredDeposit = Number(values.depositAmount || 0);
  const depositAmount = Math.min(totalAmount, configuredDeposit > 0 ? configuredDeposit : Math.round(totalAmount * 0.25));
  return { totalAmount, depositAmount };
}

function buildPaymentPlan(totalAmount: number, depositAmount: number, contractAt: Date, eventAt: Date, scenarioIndex: number): AnyRecord[] {
  const remaining = roundMoney(totalAmount - depositAmount);
  const middleRatio = [0.42, 0.5, 0.56][scenarioIndex % 3];
  const installment = roundMoney(remaining * middleRatio);
  const balance = roundMoney(totalAmount - depositAmount - installment);
  const firstDue = addUtcDays(contractAt, 7 + scenarioIndex % 4);
  const balanceDue = addUtcDays(eventAt, -(3 + scenarioIndex % 7));
  return [
    { id: `deposit-${scenarioIndex + 1}`, label: 'Seña', type: 'deposit', amount: depositAmount, paidAmount: depositAmount, status: 'paid', dueDate: contractAt, paymentWindowStart: addUtcDays(contractAt, -1), paymentWindowEnd: addUtcDays(contractAt, 2) },
    { id: `installment-${scenarioIndex + 1}`, label: 'Cuota intermedia', type: 'installment', amount: installment, paidAmount: installment, status: 'paid', dueDate: firstDue, paymentWindowStart: addUtcDays(firstDue, -2), paymentWindowEnd: addUtcDays(firstDue, 3) },
    { id: `balance-${scenarioIndex + 1}`, label: 'Saldo final', type: 'balance', amount: balance, paidAmount: balance, status: 'paid', dueDate: balanceDue, paymentWindowStart: addUtcDays(balanceDue, -2), paymentWindowEnd: balanceDue },
  ];
}

function menuMeal(menuSections: AnyRecord[]): string {
  return menuSections.flatMap((section) => Array.isArray(section.items) ? section.items : []).find(Boolean) || 'Menú principal del paquete';
}

function buildTimeline(startTime: string, endTime: string, marker: string): AnyRecord[] {
  const rows = [
    [-240, 'Apertura técnica del salón', 'Salón', 'Coordinación'], [-225, 'Ingreso de coordinación', 'Salón', 'Coordinación'],
    [-210, 'Inicio de montaje', 'Logística', 'Coordinación'], [-180, 'Recepción de proveedores', 'Logística', 'Coordinación'],
    [-150, 'Armado de decoración', 'Ambientación', 'Decoración'], [-120, 'Preparación de cocina y barra', 'Catering', 'Cocina'],
    [-90, 'Briefing de staff', 'Personal', 'Maître'], [-60, 'Prueba de sonido e iluminación', 'Técnica', 'DJ'],
    [-30, 'Control final de vajilla y mesas', 'Salón', 'Maître'], [-15, 'Apertura de recepción', 'Recepción', 'Recepción'],
    [0, 'Ingreso de invitados', 'Recepción', 'Coordinación'], [30, 'Recepción gastronómica', 'Catering', 'Cocina'],
    [75, 'Ingreso principal / homenajeado', 'Salón', 'Coordinación'], [105, 'Servicio principal', 'Catering', 'Maître'],
    [180, 'Brindis', 'Salón', 'Coordinación'], [200, 'Torta o momento especial', 'Salón', 'Coordinación'],
    [225, 'Mesa dulce', 'Catering', 'Cocina'], [240, 'Baile y animación', 'Pista', 'DJ'],
  ];
  const endRows = [[-30, 'Última ronda de barra', 'Barra', 'Bartender'], [0, 'Cierre del evento', 'Salón', 'Coordinación'], [15, 'Desmontaje y conteo', 'Logística', 'Coordinación'], [60, 'Fin operativo', 'Logística', 'Coordinación']];
  return [
    ...rows.map(([minutes, title, area, owner], index) => ({ id: `${marker}-timeline-${index + 1}`, time: shiftTime(startTime, Number(minutes)), title, area, owner, status: 'completed', notes: 'Ejecutado según coordinación operativa.' })),
    ...endRows.map(([minutes, title, area, owner], index) => ({ id: `${marker}-timeline-end-${index + 1}`, time: shiftTime(endTime, Number(minutes)), title, area, owner, status: 'completed', notes: 'Cierre verificado y registrado.' })),
  ];
}

function buildTasks(marker: string): AnyRecord[] {
  const titles = [
    'Confirmar cliente y protocolo', 'Cerrar lista de invitados', 'Confirmar menú definitivo', 'Revisar restricciones alimentarias',
    'Confirmar proveedores externos', 'Reservar vajilla interna y externa', 'Asignar staff', 'Confirmar DJ, sonido e iluminación',
    'Verificar decoración y plano de mesas', 'Realizar briefing de cocina', 'Controlar salón antes del montaje', 'Completar armado',
    'Realizar control previo a apertura', 'Cerrar cocina y barra', 'Contar vajilla y mantelería', 'Desmontar y devolver elementos',
    'Conciliar gastos, pagos y sobrantes',
  ];
  return titles.map((title, index) => ({ id: `${marker}-task-${index + 1}`, title, owner: index < 5 ? 'Coordinación' : index < 11 ? 'Logística' : 'Responsable de cierre', priority: index < 8 ? 'high' : 'normal', status: 'completed', notes: 'Completada y verificada para el evento histórico.' }));
}

function buildResourcePlan(input: {
  scenarioKey: string; marker: string; eventName: string; eventDay: string; salonName: string; startTime: string; endTime: string;
  guestCount: number; dietary: Scenario['dietary']; breakdown: ReturnType<typeof guestBreakdownFor>; menuSections: AnyRecord[]; catalog: AnyRecord[]; linenColor: string;
}): AnyRecord {
  const guests = buildGuestPlan({ guestCount: input.guestCount, seed: input.scenarioKey, dietary: input.dietary, breakdown: input.breakdown, meal: menuMeal(input.menuSections) });
  const productItems = input.catalog.slice(0, Math.min(6, input.catalog.length)).map((item, index) => ({
    id: `${input.marker}-product-${index + 1}`, catalogItemId: item._id, name: item.name, category: item.category || item.type,
    quantity: item.type === 'BEVERAGE' ? Math.ceil(input.guestCount * (index % 2 ? 0.75 : 1.5)) : Math.ceil(input.guestCount * (0.22 + (index % 3) * 0.08)),
    unit: item.unitOfMeasure || 'unidad', sectionType: item.type === 'BEVERAGE' ? 'beverages' : item.type === 'FOOD' ? 'kitchen' : 'miscellaneous',
    status: 'completed', notes: 'Cantidad operativa histórica confirmada.',
  }));
  const logistics = {
    eventSetupNotes: `${input.marker} Apertura ${shiftTime(input.startTime, -240)} a cargo de coordinación. Montaje desde ${shiftTime(input.startTime, -210)} con plano de ${guests.tables.length} mesas, mesa principal, recepción y pista. Recorrida final ${shiftTime(input.startTime, -30)}; desmontaje desde ${input.endTime}.`,
    kitchenNotes: `Cocina ingresa ${shiftTime(input.startTime, -120)}. Preparar ${input.guestCount} cubiertos y separar ${input.dietary.vegetarian} vegetarianos, ${input.dietary.vegan} veganos, ${input.dietary.celiac} celíacos y ${input.dietary.lactoseIntolerant} sin lactosa. Salidas coordinadas con maître y cierre ${shiftTime(input.endTime, 15)}.`,
    barNotes: `Barra habilitada ${shiftTime(input.startTime, -30)}. Responsable controla hielo, bebidas, cristalería y reposición. Servicio de alcohol sólo a adultos identificados (${input.breakdown.adultsWithAlcoholCount}); última ronda ${shiftTime(input.endTime, -30)}.`,
    decorationNotes: `Ambientación desde ${shiftTime(input.startTime, -150)} con mantelería ${input.linenColor}. Revisar caminos, servilletas, mesa principal y circulación; fotografía final del montaje antes de ${shiftTime(input.startTime, -30)}.`,
    accessNotes: `Proveedores ingresan por acceso operativo a las ${shiftTime(input.startTime, -180)} y acreditan responsable. Recepción abre ${shiftTime(input.startTime, -15)} con lista por mesa. Señalizar estacionamiento, baños y salida; seguridad mantiene libre la zona de descarga.`,
    riskNotes: `Coordinación conserva contactos de salón, cocina, DJ y proveedores. Restricciones identificadas por nombre y mesa. Al cierre: inventario de vajilla, sobrantes refrigerados, residuos separados, devolución a proveedores y registro de faltantes; resultado sin incidentes.`,
  };
  return {
    timelineItems: buildTimeline(input.startTime, input.endTime, input.marker),
    staffNotes: [
      { id: `${input.marker}-protocol`, title: 'Protocolo', notes: 'Maître y coordinación verificaron cada hito con cliente, DJ y cocina.' },
      { id: `${input.marker}-minors`, title: 'Menores y bebidas', notes: 'Menores identificados en lista; barra aplicó servicio responsable.' },
      { id: `${input.marker}-closing`, title: 'Cierre operativo', notes: 'Conteo, limpieza, sobrantes y devoluciones conciliados.' },
    ],
    guestList: guests,
    productItems,
    inventoryItems: [],
    supplierAssignments: [],
    tasks: buildTasks(input.marker),
    alerts: [],
    logistics,
    source: 'quote_conversion',
    seed: input.marker,
  };
}

async function loadDomainData() {
  const [salons, templates, rules, stock, suppliers, catalog, productionRules, consumptionRules, inventory, staff, actor] = await Promise.all([
    Salon.find({ active: true, deletedAt: null }).sort({ name: 1 }).lean(),
    PackageTemplate.find({ active: true, deletedAt: null }).sort({ name: 1 }).lean(),
    VenuePackageRule.find({ active: true, deletedAt: null }).lean(),
    SalonStockItem.find({ active: true, deletedAt: null }).sort({ displayOrder: 1, name: 1 }).lean(),
    Supplier.find({ active: true, deletedAt: null }).sort({ name: 1 }).lean(),
    CatalogItem.find({ active: true, deletedAt: null }).sort({ name: 1 }).lean(),
    ProductionRule.find({ isActive: true, deletedAt: null }).lean(),
    ConsumptionRule.find({ active: true, deletedAt: null }).lean(),
    InventoryItem.find({ active: true, deletedAt: null }).lean(),
    User.find({ active: true, deletedAt: null, roles: Role.STAFF, 'staffProfile.employmentStatus': 'ACTIVE' }).sort({ fullName: 1 }).lean(),
    User.findOne({ active: true, deletedAt: null, roles: Role.ADMIN }).sort({ createdAt: 1 }).lean(),
  ]);
  if (!salons.length) throw new Error('No hay salones activos disponibles.');
  if (!actor) throw new Error('No existe un usuario ADMIN activo para atribuir el seed.');
  if (!catalog.length) throw new Error('No hay catálogo activo; no puede construirse una producción no vacía.');
  return { salons, templates, rules, stock, suppliers, catalog, productionRules, consumptionRules, inventory, staff, actor };
}

function applicablePackages(salon: AnyRecord, templates: AnyRecord[], rules: AnyRecord[]): Array<{ template: AnyRecord; values: AnyRecord }> {
  const templateById = new Map(templates.map((template) => [id(template), template]));
  const overrideKeys = ['name', 'durationHours', 'startTime', 'endTime', 'pricingMode', 'pricePerPerson', 'fixedPrice', 'discountPercentage', 'finalPricePerPerson', 'finalFixedPrice', 'depositAmount', 'paymentTerms', 'promotionText', 'giftText', 'menuSections', 'includedServices', 'notes'];
  return rules.filter((rule) => id(rule.salonId) === id(salon)).flatMap((rule) => {
    const template = templateById.get(id(rule.packageTemplateId));
    if (!template) return [];
    const templateSalonIds = (template.salonIds || []).map(id);
    if (!template.isGlobal && !templateSalonIds.includes(id(salon))) return [];
    const values: AnyRecord = { ...template, ...defined(rule, overrideKeys), venuePackageRuleId: rule._id };
    return [{ template, values }];
  }).filter(({ values }) => {
    try { return packagePrice(values, Math.max(1, Number(salon.minCapacity || 50))).totalAmount > 0; } catch { return false; }
  }).sort((left, right) => String(left.values.name).localeCompare(String(right.values.name), 'es'));
}

function buildScenarios(domain: Awaited<ReturnType<typeof loadDomainData>>): Scenario[] {
  const scenarios: Scenario[] = [];
  for (const [salonIndex, salon] of domain.salons.entries()) {
    const packages = applicablePackages(salon, domain.templates, domain.rules);
    if (!packages.length) throw new Error(`El salón ${salon.name} no tiene paquetes aplicables con VenuePackageRule activa.`);
    for (const [dayIndex, eventDay] of JULY_2026_EVENT_DAYS.entries()) {
      const index = scenarios.length;
      const selected = packages[(dayIndex + salonIndex * 2) % packages.length];
      const key = `july26-${String(index + 1).padStart(3, '0')}`;
      const marker = markerFor(index);
      const eventType = eventTypes[(dayIndex * 2 + salonIndex) % eventTypes.length];
      const guestCount = chooseGuestCount({ min: salon.minCapacity, recommended: salon.recommendedCapacity, max: salon.maxCapacity, seed: `${key}-guests` });
      const dietary = dietaryCountsFor(guestCount, `${key}-dietary`);
      const guestBreakdown = guestBreakdownFor(guestCount, eventType, `${key}-ages`);
      const duration = Number(selected.values.durationHours || salon.defaultDurationHours || 8);
      const startTime = selected.values.startTime || salon.defaultStartTime || '21:00';
      const endTime = selected.values.endTime || salon.defaultEndTime || addHoursToTime(startTime, duration);
      const { totalAmount, depositAmount } = packagePrice(selected.values, guestCount);
      const eventAt = dateAtUtc(eventDay);
      const leadDaysBefore = 18 + ((index * 7) % 25);
      const leadAt = addUtcDays(eventAt, -leadDaysBefore);
      const quoteAt = addUtcDays(leadAt, 1 + index % 3);
      const sentAt = new Date(quoteAt.getTime() + 3_600_000 * (2 + index % 4));
      const acceptedAt = addUtcDays(quoteAt, 2 + index % 4);
      const contractAt = addUtcDays(acceptedAt, 1);
      const paymentPlan = buildPaymentPlan(totalAmount, depositAmount, contractAt, eventAt, index);
      const menuSections = Array.isArray(selected.values.menuSections) ? selected.values.menuSections : [];
      const includedServices = Array.isArray(selected.values.includedServices) ? selected.values.includedServices : [];
      const honoreeName = `${customerFirstNames[(index + 3) % customerFirstNames.length]} ${customerLastNames[(index + 5) % customerLastNames.length]}`;
      const eventName = `${eventType === 'corporate' ? 'Encuentro corporativo' : eventType === 'wedding' ? 'Casamiento' : eventType === 'fifteen' ? 'Fiesta de 15' : eventType === 'graduates' ? 'Egresados' : eventType === 'baptism_communion' ? 'Bautismo y comunión' : eventType === 'anniversary' ? 'Aniversario' : 'Cumpleaños'} de ${honoreeName}`;
      const resourcePlan = buildResourcePlan({ scenarioKey: key, marker, eventName, eventDay, salonName: salon.name, startTime, endTime, guestCount, dietary, breakdown: guestBreakdown, menuSections, catalog: [...domain.catalog].sort((left, right) => (id(left).localeCompare(id(right)) + index) % 3), linenColor: linenColors[index % linenColors.length] });
      scenarios.push({ index, key, marker, salon, packageTemplate: selected.template, packageValues: selected.values, eventDay, eventType, eventName, honoreeName, guestCount, dietary, guestBreakdown, startTime, endTime, totalAmount, depositAmount, menuSections, includedServices, businessDates: { lead: leadAt, quote: quoteAt, sent: sentAt, accepted: acceptedAt, contract: contractAt }, paymentPlan, resourcePlan });
    }
  }
  return scenarios;
}

async function assertNoVenueConflicts(scenarios: Scenario[]): Promise<void> {
  const from = dateAtUtc('2026-06-30', '00:00');
  const to = dateAtUtc('2026-08-02', '00:00');
  const existing = await Event.find({
    deletedAt: null,
    eventDate: { $gte: from, $lt: to },
    status: { $in: ['reserved', 'confirmed'] },
    notes: { $not: seedRegex() },
  }).select('salonId eventDate startTime endTime eventName').lean();
  const conflicts = scenarios.filter((scenario) => existing.some((event) => {
    if (id(event.salonId) !== id(scenario.salon)) return false;
    const normalize = (day: string, start?: string, end?: string) => {
      const dayStart = dateAtUtc(day, '00:00').getTime();
      if (!/^\d{2}:\d{2}$/.test(start ?? '') || !/^\d{2}:\d{2}$/.test(end ?? '')) return { start: dayStart, end: dayStart + 86_400_000 };
      return { start: eventDateTime(day, start!).getTime(), end: eventDateTime(day, end!, start!).getTime() };
    };
    const left = normalize(scenario.eventDay, scenario.startTime, scenario.endTime);
    const right = normalize(dateKey(event.eventDate), event.startTime, event.endTime);
    return left.start < right.end && right.start < left.end;
  }));
  if (conflicts.length) throw new Error(`Hay ${conflicts.length} escenario(s) que se superponen con eventos preexistentes. No se realizó ninguna escritura.`);
}

async function ensureCommercialEvent(scenario: Scenario, actorId: string): Promise<SeedRecord> {
  const existingEvent: AnyRecord | null = await Event.findOne({ notes: { $regex: exactMarkerRegex(scenario.marker) }, deletedAt: null });
  if (existingEvent) {
    const [lead, customer, quote] = await Promise.all([
      existingEvent.sourceLeadId ? Lead.findById(existingEvent.sourceLeadId) : Promise.resolve(null),
      Customer.findById(existingEvent.customerId),
      Quote.findById(existingEvent.sourceQuoteId || existingEvent.quoteId),
    ]);
    if (!customer || !quote) throw new Error(`${scenario.marker} existe pero su cliente o presupuesto no existe.`);
    return { ...scenario, event: existingEvent, lead, customer, quote };
  }

  const firstName = customerFirstNames[scenario.index % customerFirstNames.length];
  const lastName = customerLastNames[(scenario.index * 3) % customerLastNames.length];
  const fullName = `${firstName} ${lastName}`;
  const numeric = String(10_000_000 + scenario.index * 7919).padStart(8, '0').slice(-8);
  const phone = `+54 9 221 ${String(400 + scenario.index).padStart(3, '0')}-${String(1000 + scenario.index * 13).slice(-4)}`;
  const email = `${scenario.key}@example.invalid`;
  const customerNotes = `${scenario.marker} Cliente sintético QA. Localidad ficticia: La Plata. No corresponde a una persona real.`;

  let lead: any = await Lead.findOne({ notes: { $regex: exactMarkerRegex(scenario.marker) }, deletedAt: null });
  if (!lead) {
    lead = await Lead.create({
      firstName, lastName, fullName, phone, normalizedPhone: phone.replace(/\D/g, ''), email, normalizedEmail: email,
      eventType: scenario.eventType, eventDate: dateAtUtc(scenario.eventDay, '00:00'), guestCount: scenario.guestCount,
      salonId: scenario.salon._id, salonIds: [scenario.salon._id], assignedUserId: actorId, source: ['referral', 'instagram', 'phone', 'walk_in'][scenario.index % 4],
      status: 'new', message: `Consulta sintética para ${scenario.eventName}.`, notes: customerNotes,
      tags: [JULY_2026_SEED_KEY, 'qa', 'julio-2026'], createdBy: actorId, updatedBy: actorId,
    });
    await Lead.updateOne({ _id: lead._id }, { $set: { createdAt: scenario.businessDates.lead, updatedAt: scenario.businessDates.lead } }, { timestamps: false });
  }

  let customer: any = await Customer.findOne({ email, deletedAt: null });
  if (!customer) {
    customer = await Customer.create({
      firstName, lastName, fullName, phone, normalizedPhone: phone.replace(/\D/g, ''), email, normalizedEmail: email,
      documentNumber: numeric, address: `Calle Ficticia ${1200 + scenario.index}, La Plata, Buenos Aires`, occupation: ['Docente', 'Comerciante', 'Profesional independiente', 'Administración'][scenario.index % 4],
      sourceLeadId: lead._id, sourceLeadIds: [lead._id], createdFromLeadId: lead._id, salonIds: [scenario.salon._id],
      tags: [JULY_2026_SEED_KEY, 'qa'], notes: customerNotes, createdBy: actorId, updatedBy: actorId,
    });
    await Customer.updateOne({ _id: customer._id }, { $set: { createdAt: addUtcDays(scenario.businessDates.lead, 1), updatedAt: addUtcDays(scenario.businessDates.lead, 1) } }, { timestamps: false });
  }

  const pricing = scenario.packageValues;
  const quoteNumber = `QA-JUL26-${String(scenario.index + 1).padStart(3, '0')}`;
  let quote: any = await Quote.findOne({ quoteNumber });
  if (!quote) {
    quote = await Quote.create({
      quoteNumber, leadId: lead._id, customerId: customer._id, source: 'lead', quoteMode: 'PACKAGE', salonId: scenario.salon._id,
      packageTemplateId: scenario.packageTemplate._id, status: 'accepted', contactName: fullName, phone, email,
      eventType: scenario.eventType, eventDate: dateAtUtc(scenario.eventDay, '00:00'), guestCount: scenario.guestCount, honoreeName: scenario.honoreeName,
      vegetarianCount: scenario.dietary.vegetarian, veganCount: scenario.dietary.vegan, celiacCount: scenario.dietary.celiac,
      lactoseIntolerantCount: scenario.dietary.lactoseIntolerant, tableLinenColor: linenColors[scenario.index % linenColors.length],
      packageName: pricing.name || scenario.packageTemplate.name, durationHours: Number(pricing.durationHours || 8), startTime: scenario.startTime, endTime: scenario.endTime,
      pricingMode: pricing.pricingMode === 'fixed' ? 'fixed' : 'per_person', pricePerPerson: Number(pricing.pricePerPerson || pricing.finalPricePerPerson || 0),
      discountPercentage: Number(pricing.discountPercentage || 0), finalPricePerPerson: Number(pricing.finalPricePerPerson || pricing.pricePerPerson || 0),
      fixedPrice: Number(pricing.fixedPrice || pricing.finalFixedPrice || 0), finalFixedPrice: Number(pricing.finalFixedPrice || pricing.fixedPrice || 0),
      totalAmount: scenario.totalAmount, depositAmount: scenario.depositAmount, balanceAmount: scenario.totalAmount - scenario.depositAmount,
      paymentTerms: pricing.paymentTerms || scenario.salon.defaultPaymentTerms || 'Seña, cuota intermedia y saldo antes del evento.',
      promotionText: pricing.promotionText, giftText: pricing.giftText, menuSections: scenario.menuSections, includedServices: scenario.includedServices,
      notes: `${scenario.marker} Presupuesto histórico sintético aceptado.`, validUntil: addUtcDays(scenario.businessDates.quote, 10), sentAt: scenario.businessDates.sent,
      acceptedAt: scenario.businessDates.accepted, ...scenario.guestBreakdown,
      templateSnapshot: pricing, packageSnapshot: pricing, contactSnapshot: { leadId: lead._id, customerId: customer._id, contactName: fullName, phone, email },
      createdBy: actorId, updatedBy: actorId,
    });
    await Quote.updateOne({ _id: quote._id }, { $set: { createdAt: scenario.businessDates.quote, updatedAt: scenario.businessDates.accepted } }, { timestamps: false });
  }

  const converted = await convertQuoteToEvent({ quoteId: id(quote), userId: actorId, eventName: scenario.eventName, notes: `${scenario.marker} Evento histórico sintético de QA.` });
  const event = converted.event;
  const commercialSnapshot = {
    packageTemplateId: scenario.packageTemplate._id, venuePackageRuleId: scenario.packageValues.venuePackageRuleId,
    packageName: scenario.packageValues.name || scenario.packageTemplate.name, pricingMode: scenario.packageValues.pricingMode || 'per_person',
    durationHours: Number(scenario.packageValues.durationHours || 8), startTime: scenario.startTime, endTime: scenario.endTime,
    pricePerPerson: Number(scenario.packageValues.pricePerPerson || 0), discountPercentage: Number(scenario.packageValues.discountPercentage || 0),
    finalPricePerPerson: Number(scenario.packageValues.finalPricePerPerson || scenario.packageValues.pricePerPerson || 0),
    fixedPrice: Number(scenario.packageValues.fixedPrice || 0), finalFixedPrice: Number(scenario.packageValues.finalFixedPrice || scenario.packageValues.fixedPrice || 0),
    totalAmount: scenario.totalAmount, depositAmount: scenario.depositAmount, balanceAmount: scenario.totalAmount - scenario.depositAmount,
    paymentTerms: quote.paymentTerms, promotionText: scenario.packageValues.promotionText, giftText: scenario.packageValues.giftText,
  };
  await Event.updateOne({ _id: event._id }, {
    $set: {
      status: 'confirmed', eventName: scenario.eventName, eventDate: dateAtUtc(scenario.eventDay, '00:00'), startTime: scenario.startTime, endTime: scenario.endTime,
      guestCount: scenario.guestCount, honoreeName: scenario.honoreeName, vegetarianCount: scenario.dietary.vegetarian, veganCount: scenario.dietary.vegan,
      celiacCount: scenario.dietary.celiac, lactoseIntolerantCount: scenario.dietary.lactoseIntolerant, tableLinenColor: linenColors[scenario.index % linenColors.length],
      quoteMode: 'PACKAGE', guestBreakdown: scenario.guestBreakdown, estimatedAmount: scenario.totalAmount, finalAmount: scenario.totalAmount,
      commercialSnapshot, menuSnapshot: scenario.menuSections, servicesSnapshot: scenario.includedServices,
      paymentSnapshot: { depositAmount: scenario.depositAmount, balanceAmount: scenario.totalAmount - scenario.depositAmount, paymentTerms: quote.paymentTerms, paidInFull: true },
      paymentPlanSnapshot: scenario.paymentPlan, resourcePlanSnapshot: scenario.resourcePlan,
      contractReadyChecklist: { customerComplete: true, document: true, address: true, salonDefined: true, dateDefined: true, timeDefined: true, guestCount: true, totalPrice: true, deposit: true, paymentTerms: true, menu: scenario.menuSections.length > 0 || Boolean(scenario.packageValues.name), includedServices: scenario.includedServices.length > 0 },
      notes: `${scenario.marker} Evento histórico sintético de QA. Cliente, invitados y documentación son ficticios.`, updatedBy: actorId,
      createdAt: scenario.businessDates.accepted, updatedAt: scenario.businessDates.accepted,
    },
  }, { timestamps: false });
  await CalendarItem.deleteMany({ eventId: event._id, source: 'event' });
  await Promise.all([
    Lead.updateOne({ _id: lead._id }, { $set: { status: 'converted', convertedCustomerId: customer._id, convertedEventId: event._id, convertedAt: scenario.businessDates.accepted, updatedAt: scenario.businessDates.accepted } }, { timestamps: false }),
    Quote.updateOne({ _id: quote._id }, { $set: { status: 'converted', acceptedAt: scenario.businessDates.accepted, convertedCustomerId: customer._id, convertedEventId: event._id, updatedAt: scenario.businessDates.accepted } }, { timestamps: false }),
    LeadActivity.updateMany({ $or: [{ leadId: lead._id }, { eventId: event._id }] }, { $set: { createdAt: scenario.businessDates.accepted } }, { timestamps: false }),
  ]);
  const freshEvent = await Event.findById(event._id);
  if (!freshEvent) throw new Error(`No se pudo recuperar ${scenario.marker}.`);
  return { ...scenario, event: freshEvent, lead, customer, quote };
}

async function ensureContractAndPayments(record: SeedRecord, actorId: string): Promise<AnyRecord> {
  let contract: any = await Contract.findOne({ eventId: record.event._id, deletedAt: null }).sort({ versionNumber: -1 });
  if (!contract) contract = (await createContractFromEvent({ eventId: id(record.event), userId: actorId })).contract;
  if (contract.status !== 'approved') contract = await approveContract(id(contract), actorId);
  await Contract.updateOne({ _id: contract._id }, { $set: {
    status: 'approved', approvedAt: record.businessDates.contract, approvedByUserId: actorId, paymentPlanSnapshot: record.paymentPlan,
    observations: `${record.marker} Contrato histórico sintético aprobado.`, createdAt: record.businessDates.contract, updatedAt: record.businessDates.contract,
  } }, { timestamps: false });

  const existingPayments = await Payment.find({ contractId: contract._id, notes: { $regex: exactMarkerRegex(record.marker) }, deletedAt: null }).lean();
  if (!existingPayments.length) {
    const methods = ['bank_transfer', 'cash', 'card'];
    for (const [index, installment] of record.paymentPlan.entries()) {
      const paidAt = index === 0 ? record.businessDates.contract : index === 1 ? installment.dueDate : addUtcDays(dateAtUtc(record.eventDay), -(2 + record.index % 4));
      const payment = await createPayment({
        contractId: id(contract), eventId: id(record.event), customerId: id(record.customer), salonId: id(record.salon), quoteId: id(record.quote),
        type: installment.type, method: methods[(record.index + index) % methods.length], status: 'paid', amount: installment.amount,
        dueDate: installment.dueDate, paidAt, planInstallmentId: installment.id, affectsContractBalance: true,
        receiptNumber: `QA-R-${String(record.index + 1).padStart(3, '0')}-${index + 1}`, reference: `${record.marker} ${installment.label}`,
        notes: `${record.marker} Pago histórico sintético; no se procesó mediante pasarela externa.`,
      }, actorId);
      record.paymentPlan[index].paymentId = payment._id.toString();
      record.paymentPlan[index].paidAt = paidAt;
      await Payment.updateOne({ _id: payment._id }, { $set: { createdAt: paidAt, updatedAt: paidAt } }, { timestamps: false });
    }
  } else {
    for (const installment of record.paymentPlan) {
      const payment = existingPayments.find((item) => item.planInstallmentId === installment.id);
      if (payment) { installment.paymentId = id(payment); installment.paidAt = payment.paidAt; }
    }
  }
  await Contract.updateOne({ _id: contract._id }, { $set: { paymentPlanSnapshot: record.paymentPlan } });
  await Event.updateOne({ _id: record.event._id }, { $set: { status: 'confirmed', paymentPlanSnapshot: record.paymentPlan, 'paymentSnapshot.balanceAmount': 0, 'paymentSnapshot.paidInFull': true } });
  const reconciled = await Contract.findById(contract._id);
  if (!reconciled) throw new Error(`Contrato ausente para ${record.marker}.`);
  record.contract = reconciled;
  return reconciled;
}

async function ensureSupplierPool(existing: AnyRecord[], actorId: string): Promise<AnyRecord[]> {
  const desired = [
    { key: 'fotografia', name: 'Estudio Prisma QA', category: SupplierCategory.PHOTOGRAPHY },
    { key: 'pasteleria', name: 'Dulce Julio QA', category: SupplierCategory.PASTRY },
    { key: 'apoyo', name: 'Apoyo Operativo QA', category: SupplierCategory.STAFFING },
  ];
  const pool = [...existing];
  for (const item of desired) {
    let supplier: any = await Supplier.findOne({ notes: { $regex: `${JULY_2026_SEED_KEY}:SUPPLIER:${item.key}` }, deletedAt: null });
    if (!supplier) {
      supplier = await Supplier.create({
        name: item.name, businessName: `${item.name} - proveedor sintético`, category: item.category, active: true,
        email: `${item.key}.${JULY_2026_SEED_KEY.toLowerCase()}@example.invalid`, phone: '+54 9 221 000-0000',
        contactPerson: 'Contacto sintético QA', notes: `[${JULY_2026_SEED_KEY}:SUPPLIER:${item.key}] Proveedor ficticio exclusivo de la simulación.`,
        createdBy: actorId, updatedBy: actorId,
      });
    }
    if (!pool.some((current) => id(current) === id(supplier))) pool.push(supplier);
  }
  return pool.sort((left, right) => String(left.name).localeCompare(String(right.name), 'es'));
}

async function ensureSuppliersAndExpenses(record: SeedRecord, supplierPool: AnyRecord[], actorId: string): Promise<void> {
  const existingAssignments = record.event.resourcePlanSnapshot?.supplierAssignments || [];
  const existingExpenses = await Expense.countDocuments({ eventId: record.event._id, status: ExpenseStatus.PAID, deletedAt: null });
  if (existingAssignments.length >= 3 && existingExpenses >= 3 && existingAssignments.every((item: AnyRecord) => String(item.id).includes(JULY_2026_SEED_KEY))) return;
  const count = 3 + (record.index % 2);
  const selected = Array.from({ length: count }, (_, offset) => supplierPool[(record.index * 2 + offset) % supplierPool.length]);
  const targetCostRatio = 0.56 + (record.index % 6) * 0.035;
  const targetCost = Math.round(record.totalAmount * Math.min(0.74, targetCostRatio));
  const weights = selected.map((_, index) => [0.34, 0.28, 0.22, 0.16][index] || 0.1);
  const weightTotal = weights.reduce((sum, value) => sum + value, 0);
  let allocated = 0;
  const assignments: EventSupplierAssignmentInput[] = selected.map((supplier, index) => {
    const amount = index === selected.length - 1 ? targetCost - allocated : Math.round(targetCost * weights[index] / weightTotal);
    allocated += amount;
    const assignmentId = `${JULY_2026_SEED_KEY}:supplier:${record.key}:${index + 1}`;
    return {
      id: assignmentId, supplierId: id(supplier), serviceType: supplierCategoryLabels[supplier.category] || `Servicio de ${supplier.name}`,
      arrivalTime: shiftTime(record.startTime, -(180 - index * 15)), agreedAmount: amount, status: 'paid',
      notes: `${record.marker} Ingreso acreditado, servicio cumplido, comprobante interno conciliado y devolución verificada.`,
    };
  });
  await syncEventSupplierExpenses({ eventId: id(record.event), assignments, userId: actorId });
  const paidAt = addUtcDays(dateAtUtc(record.eventDay), -(1 + record.index % 8));
  await Expense.updateMany({ eventId: record.event._id, sourceType: ExpenseSourceType.SUPPLIER_ASSIGNMENT, sourceId: { $in: assignments.map((item) => item.id) } }, [
    { $set: { date: paidAt, paidAt, initialEstimatedAmount: { $round: [{ $multiply: ['$amount', 0.96] }, 0] }, finalAmount: '$amount', additionalAmount: { $round: [{ $multiply: ['$amount', 0.04] }, 0] }, paymentMethod: ['bank_transfer', 'cash', 'other'][record.index % 3], status: ExpenseStatus.PAID, updatedBy: new mongoose.Types.ObjectId(actorId) } },
  ]);
  record.event = await Event.findById(record.event._id) as AnyRecord;
}

function tablewareRequirement(item: AnyRecord, guestCount: number, tableCount: number): number {
  const text = `${item.itemKey} ${item.name}`.toLocaleLowerCase('es');
  if (/mantel|camino|fald[oó]n|table-runner|tablecloth/.test(text)) return Math.max(1, tableCount + (text.includes('servilleta') ? guestCount : 1));
  if (/servilleta|napkin/.test(text)) return Math.ceil(guestCount * 1.08);
  if (/jarra|hielera|frapera|salero|panera/.test(text)) return Math.max(2, Math.ceil(tableCount / 2));
  return Math.ceil(guestCount * 1.08);
}

async function ensureTableware(record: SeedRecord, stock: AnyRecord[], actorId: string): Promise<void> {
  if (await EventTablewareAllocation.exists({ eventId: record.event._id })) return;
  const salonStock = stock.filter((item) => id(item.salonId) === id(record.salon));
  const priorities = ['dinner-plate', 'dessert-plate', 'water-glass', 'champagne-glass', 'long-drink-glass', 'fork', 'knife', 'spoon', 'napkin', 'linen'];
  const chosen: AnyRecord[] = [];
  for (const priority of priorities) {
    const match = salonStock.find((item) => !chosen.some((current) => id(current) === id(item)) && `${item.itemKey} ${item.name}`.toLocaleLowerCase('es').includes(priority));
    if (match) chosen.push(match);
  }
  for (const category of ['PLATES', 'GLASSWARE', 'DRINKWARE', 'CUTLERY', 'LINENS']) {
    const candidates = salonStock.filter((item) => item.category === category && !chosen.some((current) => id(current) === id(item)));
    chosen.push(...candidates.slice(0, Math.max(0, 2 - chosen.filter((item) => item.category === category).length)));
  }
  const selected = chosen.slice(0, 12);
  if (!selected.length) throw new Error(`${record.marker} no tiene stock activo para referenciar.`);
  const tableCount = record.resourcePlan.guestList.tables.length;
  const allocations: AnyRecord[] = [];
  for (const item of selected) {
    const required = tablewareRequirement(item, record.guestCount, tableCount);
    const internal = Math.min(required, Math.max(0, Number(item.currentQuantity || 0)));
    if (internal > 0) allocations.push({ eventId: record.event._id, salonId: record.salon._id, salonStockItemId: item._id, source: 'salon_stock', itemName: item.name, category: 'Vajilla', unit: item.unitOfMeasure || 'unidad', quantity: internal, eventDay: record.eventDay, notes: `${record.marker} Reserva interna conciliada.`, createdBy: actorId, updatedBy: actorId });
    if (required > internal) allocations.push({ eventId: record.event._id, salonId: record.salon._id, source: 'external', itemName: `${item.name} (externo)`, category: 'Vajilla adicional', unit: item.unitOfMeasure || 'unidad', quantity: required - internal, eventDay: record.eventDay, notes: `${record.marker} Diferencia cubierta externamente sin alterar el stock del salón.`, createdBy: actorId, updatedBy: actorId });
  }
  await EventTablewareAllocation.insertMany(allocations);
  const inventoryItems = allocations.map((item) => ({ id: `${record.marker}-tableware-${sanitizeKey(item.itemName)}`, name: item.itemName, category: item.category, quantityRequired: item.quantity, quantityReserved: item.source === 'salon_stock' ? item.quantity : undefined, unit: item.unit, status: item.source === 'salon_stock' ? 'reserved' : 'planned', source: item.source, notes: item.notes }));
  await Event.updateOne({ _id: record.event._id }, { $set: { 'resourcePlanSnapshot.inventoryItems': inventoryItems, updatedBy: actorId } });
  record.event = await Event.findById(record.event._id) as AnyRecord;
}

function shiftBounds(record: SeedRecord): { start: Date; end: Date } {
  const start = eventDateTime(record.eventDay, shiftTime(record.startTime, -150));
  const end = eventDateTime(record.eventDay, shiftTime(record.endTime, 75), record.startTime);
  if (end <= start) end.setUTCDate(end.getUTCDate() + 1);
  return { start, end };
}

function compatibleStaff(staff: AnyRecord, salonId: string): boolean {
  return (staff.salonIds || []).map(id).includes(salonId) && Array.isArray(staff.staffProfile?.staffSubroles) && staff.staffProfile.staffSubroles.length > 0;
}

async function ensureStaff(records: SeedRecord[], staff: AnyRecord[], actorId: string): Promise<void> {
  for (const day of JULY_2026_EVENT_DAYS) {
    const dayRecords = records.filter((record) => record.eventDay === day).sort((left, right) => right.guestCount - left.guestCount);
    const startWindow = addUtcDays(dateAtUtc(day, '00:00'), -1);
    const endWindow = addUtcDays(dateAtUtc(day, '00:00'), 2);
    const occupied: AnyRecord[] = await EventStaffAssignment.find({ deletedAt: null, status: { $nin: ['cancelled', 'no_show'] }, shiftStart: { $lt: endWindow }, shiftEnd: { $gt: startWindow } }).lean();
    for (const [recordOffset, record] of dayRecords.entries()) {
      const existing = await EventStaffAssignment.find({ eventId: record.event._id, deletedAt: null, status: 'completed' }).lean();
      if (existing.length) continue;
      const desired = 5 + (recordOffset === 0 && staff.length >= 16 ? 1 : 0);
      const bounds = shiftBounds(record);
      const candidates = staff.filter((member) => compatibleStaff(member, id(record.salon)) && !occupied.some((assignment) =>
        id(assignment.staffUserId) === id(member) && new Date(assignment.shiftStart) < bounds.end && bounds.start < new Date(assignment.shiftEnd)
      ));
      const chosen: Array<{ member: AnyRecord; subrole: string }> = [];
      const priorities = ['MAITRE', 'WAITER', 'COOK', 'BARTENDER', 'KITCHEN_ASSISTANT', 'CLEANING', 'OTHER'];
      for (const priority of priorities) {
        if (chosen.length >= desired) break;
        const member = candidates.find((candidate) => !chosen.some((item) => id(item.member) === id(candidate)) && candidate.staffProfile.staffSubroles.includes(priority));
        if (member) chosen.push({ member, subrole: priority });
      }
      for (const member of candidates) {
        if (chosen.length >= desired) break;
        if (!chosen.some((item) => id(item.member) === id(member))) chosen.push({ member, subrole: member.staffProfile.staffSubroles[0] });
      }
      if (chosen.length < 3) throw new Error(`${record.marker} no tiene staff compatible suficiente sin superposición.`);
      for (const item of chosen) {
        const assignment = await EventStaffAssignment.create({
          eventId: record.event._id, staffUserId: item.member._id, salonId: record.salon._id, roleLabel: item.subrole.replaceAll('_', ' '),
          staffSubrole: item.subrole, shiftStart: bounds.start, shiftEnd: bounds.end, status: 'completed',
          notes: `${record.marker} Turno histórico cumplido sin incidentes.`, createdBy: actorId, updatedBy: actorId,
        });
        occupied.push(assignment.toObject());
        await ensureAttendance(record, assignment, actorId);
      }
    }
  }
  const assignments = await EventStaffAssignment.find({ eventId: { $in: records.map((record) => record.event._id) }, deletedAt: null }).lean();
  for (const record of records) {
    for (const assignment of assignments.filter((item) => id(item.eventId) === id(record.event))) await ensureAttendance(record, assignment, actorId);
  }
}

async function ensureAttendance(record: SeedRecord, assignment: AnyRecord, actorId: string): Promise<void> {
  if (await WorkSession.exists({ assignmentId: assignment._id })) return;
  const random = createSeededRandom(`${record.key}-${id(assignment.staffUserId)}`);
  const startedAt = new Date(new Date(assignment.shiftStart).getTime() + Math.floor(random() * 6) * 60_000);
  const endedAt = new Date(new Date(assignment.shiftEnd).getTime() - Math.floor(random() * 8) * 60_000);
  const workedMinutes = Math.max(1, Math.round((endedAt.getTime() - startedAt.getTime()) / 60_000));
  const requestBase = `${JULY_2026_SEED_KEY}:${id(assignment)}`;
  const checkIn = await TimePunch.create({
    userId: assignment.staffUserId, type: 'check_in', source: 'backoffice', clientOccurredAt: startedAt, serverReceivedAt: startedAt, effectiveAt: startedAt,
    networkStatus: 'online', requestId: `${requestBase}:in`, salonId: record.salon._id, locationValidationStatus: 'not_configured', clockSkewMs: 0,
    notes: `${record.marker} Marcación histórica sintética`, createdBy: actorId, createdAt: startedAt,
  });
  const session = await WorkSession.create({
    userId: assignment.staffUserId, salonId: record.salon._id, eventId: record.event._id, assignmentId: assignment._id, status: 'completed',
    checkInPunchId: checkIn._id, startedAt, endedAt, workedMinutes, breakMinutes: 0, payableMinutes: workedMinutes,
    payrollApprovalStatus: 'approved', approvedMinutes: workedMinutes, payrollApprovedBy: actorId, payrollApprovedAt: endedAt,
    attendanceClassification: 'on_time', hasIncident: false, requiresReview: false, closedBy: actorId,
    closeReason: 'Turno histórico cumplido', notes: `${record.marker} Jornada sintética vinculada a asignación real.`, createdBy: actorId, updatedBy: actorId,
  });
  const checkOut = await TimePunch.create({
    userId: assignment.staffUserId, workSessionId: session._id, type: 'check_out', source: 'backoffice', clientOccurredAt: endedAt, serverReceivedAt: endedAt, effectiveAt: endedAt,
    networkStatus: 'online', requestId: `${requestBase}:out`, salonId: record.salon._id, locationValidationStatus: 'not_configured', clockSkewMs: 0,
    notes: `${record.marker} Marcación histórica sintética`, createdBy: actorId, createdAt: endedAt,
  });
  await Promise.all([
    TimePunch.updateOne({ _id: checkIn._id }, { $set: { workSessionId: session._id } }),
    WorkSession.updateOne({ _id: session._id }, { $set: { checkOutPunchId: checkOut._id } }),
  ]);
}

async function ensureProduction(record: SeedRecord, actor: AnyRecord): Promise<void> {
  const existing: AnyRecord | null = await ProductionPlan.findOne({ eventId: record.event._id, isCurrent: true, deletedAt: null });
  if (existing?.status === 'closed') return;
  const request = {
    user: { id: id(actor), roles: [Role.ADMIN], salonIds: [], managedSalonIds: [] },
    ip: '127.0.0.1',
    get: (_name: string) => undefined,
  } as unknown as Request;
  const result = await generateProductionPlan(request, id(record.event));
  const planId = id(result.plan);
  const items = await ProductionItem.find({ productionPlanId: planId, deletedAt: null });
  if (!items.length) throw new Error(`${record.marker} generó un plan de producción vacío.`);
  const completedAt = eventDateTime(record.eventDay, shiftTime(record.startTime, -45));
  const closedAt = eventDateTime(record.eventDay, shiftTime(record.endTime, 30), record.startTime);
  if (closedAt <= completedAt) closedAt.setUTCDate(closedAt.getUTCDate() + 1);
  for (const item of items) {
    item.completedQuantity = item.plannedQuantity;
    item.status = 'checked'; item.ready = true; item.checked = true; item.readyAt = completedAt; item.checkedAt = completedAt;
    item.readyBy = actor._id; item.checkedBy = actor._id; item.updatedBy = actor._id;
    item.transitions = [
      { fromStatus: 'pending', toStatus: 'ready', changedAt: addUtcDays(completedAt, -1), changedBy: actor._id, reason: 'Producción histórica completada.' },
      { fromStatus: 'ready', toStatus: 'checked', changedAt: completedAt, changedBy: actor._id, reason: 'Control final conforme.' },
    ];
    await item.save();
  }
  await ProductionPlan.updateOne({ _id: planId }, { $set: { status: 'closed', startedAt: addUtcDays(completedAt, -2), completedAt, closedAt, notes: `${record.marker} Producción real generada desde reglas y productos del evento; control final completo.`, updatedBy: actor._id } });
}

async function ensureOpenClosure(record: SeedRecord, actorId: string): Promise<void> {
  const closure: AnyRecord = await EventClosure.findOneAndUpdate(
    { eventId: record.event._id, deletedAt: null },
    { $setOnInsert: { eventId: record.event._id, salonId: record.salon._id, createdBy: actorId }, $set: { operational: { status: 'open' }, financial: { status: 'open' }, administrative: { status: 'open' }, updatedBy: actorId } },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  );
  if (closure.operational.status !== 'open' || closure.financial.status !== 'open' || closure.administrative.status !== 'open') throw new Error(`${record.marker} no quedó con las tres etapas de cierre abiertas.`);
}

async function auditSeed(): Promise<{ rows: AuditRow[]; totals: AnyRecord }> {
  const events = await Event.find({ notes: seedRegex(), deletedAt: null }).populate('salonId', 'name').sort({ eventDate: 1, salonId: 1 }).lean();
  const rows: AuditRow[] = [];
  for (const event of events) {
    const currentPlan: any = await ProductionPlan.findOne({ eventId: event._id, isCurrent: true, deletedAt: null }).lean();
    const results: any[] = await Promise.all([
      Contract.findOne({ eventId: event._id, deletedAt: null, status: { $nin: ['cancelled', 'superseded'] } }).sort({ versionNumber: -1 }).lean(),
      Payment.find({ eventId: event._id, deletedAt: null }).lean(),
      Expense.find({ eventId: event._id, deletedAt: null }).lean(),
      currentPlan ? ProductionItem.find({ productionPlanId: currentPlan._id, deletedAt: null }).lean() : Promise.resolve([]),
      EventStaffAssignment.find({ eventId: event._id, deletedAt: null }).lean(),
      WorkSession.find({ eventId: event._id }).lean(),
      EventTablewareAllocation.find({ eventId: event._id }).lean(),
      EventClosure.findOne({ eventId: event._id, deletedAt: null }).lean(),
    ]);
    const contract: AnyRecord | null = results[0];
    const payments: AnyRecord[] = results[1];
    const expenses: AnyRecord[] = results[2];
    const productionItems: AnyRecord[] = results[3];
    const staffAssignments: AnyRecord[] = results[4];
    const attendanceSessions: AnyRecord[] = results[5];
    const tablewareAllocations: AnyRecord[] = results[6];
    const closure: AnyRecord | null = results[7];
    const errors = auditResourcePlan({
      guestCount: Number(event.guestCount || 0), vegetarianCount: Number(event.vegetarianCount || 0), veganCount: Number(event.veganCount || 0),
      celiacCount: Number(event.celiacCount || 0), lactoseIntolerantCount: Number(event.lactoseIntolerantCount || 0), resourcePlanSnapshot: event.resourcePlanSnapshot || {},
    });
    if (!event.customerId) errors.push('Cliente ausente.');
    if (!event.salonId) errors.push('Salón ausente.');
    if (!JULY_2026_EVENT_DAYS.includes(dateKey(event.eventDate) as typeof JULY_2026_EVENT_DAYS[number])) errors.push('Fecha fuera del conjunto objetivo.');
    if (event.status !== 'confirmed') errors.push(`Estado de evento=${event.status}.`);
    if (!contract) errors.push('Contrato ausente.');
    else {
      if (contract.status !== 'approved') errors.push(`Contrato=${contract.status}.`);
      if (Math.abs(Number(contract.balanceAmount || 0)) > 0.01) errors.push(`Saldo contractual=${contract.balanceAmount}.`);
      const paid = payments.filter((payment) => payment.status === 'paid' && payment.affectsContractBalance).reduce((sum, payment) => sum + (payment.type === 'refund' ? -Number(payment.amount || 0) : Number(payment.amount || 0)), 0);
      if (Math.abs(paid - Number(contract.totalAmount || 0)) > 0.01) errors.push(`Pagos=${paid}; contrato=${contract.totalAmount}.`);
    }
    if (payments.some((payment) => payment.status === 'pending' && payment.affectsContractBalance)) errors.push('Hay pagos relevantes pendientes.');
    if (expenses.some((expense) => expense.status === ExpenseStatus.PENDING)) errors.push('Hay gastos pendientes.');
    if (!expenses.some((expense) => expense.status !== ExpenseStatus.CANCELLED)) errors.push('No hay gastos activos.');
    if (!currentPlan) errors.push('Plan de producción ausente.');
    else {
      if (!currentPlan.isCurrent) errors.push('Plan de producción no actual.');
      if (currentPlan.status !== 'closed') errors.push(`Producción=${currentPlan.status}.`);
      if (!productionItems.length) errors.push('Plan de producción vacío.');
      if (productionItems.some((item) => item.status === 'blocked')) errors.push('Hay ítems de producción bloqueados.');
      if (productionItems.some((item) => Number(item.completedQuantity) !== Number(item.plannedQuantity) || item.status !== 'checked')) errors.push('Hay ítems de producción sin completar/chequear.');
    }
    if (!staffAssignments.length) errors.push('No hay staff asignado.');
    if (staffAssignments.some((assignment) => !['completed', 'cancelled', 'no_show'].includes(assignment.status))) errors.push('Hay asignaciones de staff abiertas.');
    if (attendanceSessions.length !== staffAssignments.length || attendanceSessions.some((session) => !['completed', 'adjusted'].includes(session.status))) errors.push(`Asistencia no reconciliada (${attendanceSessions.length}/${staffAssignments.length}).`);
    if (!tablewareAllocations.length) errors.push('No hay reservas de vajilla.');
    if (!(event.resourcePlanSnapshot?.supplierAssignments || []).length) errors.push('No hay proveedores asignados.');
    if (!closure) errors.push('EventClosure ausente.');
    else if ([closure.operational?.status, closure.financial?.status, closure.administrative?.status].some((status: string) => status !== 'open')) errors.push('Las etapas de cierre no están todas abiertas.');

    const operationalReady = Boolean(event.eventDate && new Date(event.eventDate) <= new Date()) && currentPlan?.status === 'closed'
      && productionItems.every((item) => item.status !== 'blocked') && staffAssignments.every((assignment) => ['completed', 'cancelled', 'no_show'].includes(assignment.status));
    const financialReady = contract !== null && contract.status === 'approved' && Math.abs(Number(contract.balanceAmount || 0)) <= 0.01
      && !payments.some((payment) => payment.affectsContractBalance && payment.status === 'pending') && !expenses.some((expense) => expense.status === 'pending');
    const administrativeReady = Boolean(event.customerId && contract);
    if (!operationalReady) errors.push('Blockers operativos > 0.');
    if (!financialReady) errors.push('Blockers financieros hipotéticos > 0.');
    if (!administrativeReady) errors.push('Blockers administrativos hipotéticos > 0.');
    rows.push({ event, contract: contract || undefined, payments, expenses, plan: currentPlan || undefined, productionItems, staffAssignments, attendanceSessions, tablewareAllocations, errors, operationalReady, financialReady, administrativeReady });
  }
  const allAssignments = rows.flatMap((row) => row.staffAssignments.map((assignment) => ({ row, assignment })));
  for (let leftIndex = 0; leftIndex < allAssignments.length; leftIndex += 1) for (let rightIndex = leftIndex + 1; rightIndex < allAssignments.length; rightIndex += 1) {
    const left = allAssignments[leftIndex]; const right = allAssignments[rightIndex];
    if (id(left.assignment.eventId) === id(right.assignment.eventId) || id(left.assignment.staffUserId) !== id(right.assignment.staffUserId)) continue;
    if (new Date(left.assignment.shiftStart) < new Date(right.assignment.shiftEnd) && new Date(right.assignment.shiftStart) < new Date(left.assignment.shiftEnd)) {
      const message = `Staff ${id(left.assignment.staffUserId)} asignado en turnos incompatibles.`;
      if (!left.row.errors.includes(message)) left.row.errors.push(message);
      if (!right.row.errors.includes(message)) right.row.errors.push(message);
    }
  }
  const stockIds = rows.flatMap((row) => row.tablewareAllocations.filter((item) => item.source === 'salon_stock' && item.salonStockItemId).map((item) => item.salonStockItemId));
  const stockItems = await SalonStockItem.find({ _id: { $in: stockIds } }).select('currentQuantity').lean();
  const stockById = new Map(stockItems.map((item) => [id(item), Number(item.currentQuantity || 0)]));
  const reservedByDay = new Map<string, number>();
  for (const row of rows) for (const allocation of row.tablewareAllocations.filter((item) => item.source === 'salon_stock')) {
    const key = `${id(allocation.salonStockItemId)}|${allocation.eventDay}`;
    reservedByDay.set(key, (reservedByDay.get(key) || 0) + Number(allocation.quantity || 0));
    if ((reservedByDay.get(key) || 0) > (stockById.get(id(allocation.salonStockItemId)) || 0)) row.errors.push(`Reserva interna excede stock para ${key}.`);
  }
  const totals = {
    events: events.length,
    customers: await Customer.countDocuments({ notes: seedRegex(), deletedAt: null }),
    leads: await Lead.countDocuments({ notes: seedRegex(), deletedAt: null }),
    quotes: await Quote.countDocuments({ notes: seedRegex(), deletedAt: null }),
    contracts: await Contract.countDocuments({ observations: seedRegex(), deletedAt: null }),
    payments: rows.reduce((sum, row) => sum + row.payments.length, 0), expenses: rows.reduce((sum, row) => sum + row.expenses.filter((item) => item.status !== 'cancelled').length, 0),
    productionPlans: rows.filter((row) => row.plan).length, productionItems: rows.reduce((sum, row) => sum + row.productionItems.length, 0),
    staffAssignments: rows.reduce((sum, row) => sum + row.staffAssignments.length, 0),
    attendanceSessions: rows.reduce((sum, row) => sum + row.attendanceSessions.length, 0),
    guests: events.reduce((sum, event) => sum + Number(event.guestCount || 0), 0),
    tables: events.reduce((sum, event) => sum + Number(event.resourcePlanSnapshot?.guestList?.tables?.length || 0), 0),
    tableware: rows.reduce((sum, row) => sum + row.tablewareAllocations.length, 0),
    contracted: rows.reduce((sum, row) => sum + Number(row.contract?.totalAmount || 0), 0),
    collected: rows.reduce((sum, row) => sum + row.payments.filter((payment) => payment.status === 'paid' && payment.affectsContractBalance).reduce((inner, payment) => inner + (payment.type === 'refund' ? -Number(payment.amount || 0) : Number(payment.amount || 0)), 0), 0),
    expensesPaid: rows.reduce((sum, row) => sum + row.expenses.filter((expense) => expense.status === 'paid').reduce((inner, expense) => inner + Number(expense.amount || 0), 0), 0),
  };
  return { rows, totals };
}

function printAudit(audit: Awaited<ReturnType<typeof auditSeed>>, domain?: Awaited<ReturnType<typeof loadDomainData>>, expected?: number): void {
  const { rows, totals } = audit;
  const profit = totals.collected - totals.expensesPaid;
  const margin = totals.collected ? profit / totals.collected * 100 : 0;
  const salonNames = new Set(rows.map((row) => row.event.salonId?.name || id(row.event.salonId)));
  const packageNames = new Set(rows.map((row) => row.event.commercialSnapshot?.packageName).filter(Boolean));
  const supplierIds = new Set(rows.flatMap((row) => (row.event.resourcePlanSnapshot?.supplierAssignments || []).map((item: AnyRecord) => id(item.supplierId))));
  const staffIds = new Set(rows.flatMap((row) => row.staffAssignments.map((item) => id(item.staffUserId))));
  console.log('\nSEED FULL EVENTS JULY 2026');
  console.log(`Base: ${mongoose.connection.name} (${targetClassification().hostClass}) | NODE_ENV=${env.NODE_ENV}`);
  console.log(`Salones encontrados: ${domain?.salons.length ?? salonNames.size}`);
  console.log(`Paquetes encontrados/utilizados: ${domain?.templates.length ?? '-'} / ${packageNames.size}`);
  console.log(`Proveedores utilizados: ${supplierIds.size}`);
  console.log(`Staff utilizado: ${staffIds.size}`);
  console.log(`Eventos esperados: ${expected ?? rows.length} | auditados: ${rows.length}`);
  console.log(`Clientes: ${totals.customers} | Leads: ${totals.leads} | Quotes: ${totals.quotes} | Contratos: ${totals.contracts}`);
  console.log(`Pagos: ${totals.payments} | Gastos: ${totals.expenses} | Planes producción: ${totals.productionPlans} | Items producción: ${totals.productionItems}`);
  console.log(`Asignaciones staff: ${totals.staffAssignments} | Asistencias: ${totals.attendanceSessions} | Invitados: ${totals.guests} | Mesas: ${totals.tables} | Reservas vajilla: ${totals.tableware}`);
  console.log(`Total contratado: ${money(totals.contracted)} | Total cobrado: ${money(totals.collected)} | Total gastos: ${money(totals.expensesPaid)}`);
  console.log(`Rentabilidad: ${money(profit)} | Margen: ${margin.toFixed(2)}%`);
  console.log(`Cierre listo — Operativo: ${rows.filter((row) => row.operationalReady).length}/${rows.length} | Financiero: ${rows.filter((row) => row.financialReady).length}/${rows.length} | Administrativo: ${rows.filter((row) => row.administrativeReady).length}/${rows.length}`);
  console.log(`Errores: ${rows.reduce((sum, row) => sum + row.errors.length, 0)}`);
  console.log('\nRESUMEN EVENTO POR EVENTO');
  for (const row of rows) {
    const suppliers = row.event.resourcePlanSnapshot?.supplierAssignments?.length || 0;
    console.log(`${dateKey(row.event.eventDate)} | ${row.event.salonId?.name || id(row.event.salonId)} | ${row.event.commercialSnapshot?.packageName || 'Sin pack'} | ${row.event.guestCount} invitados`);
    console.log(`Contrato: ${String(row.contract?.status || 'MISSING').toUpperCase()} | Pagado: ${Math.abs(Number(row.contract?.balanceAmount || 0)) <= 0.01 ? '100%' : 'PENDIENTE'} | Gastos: ${row.expenses.every((item) => item.status !== 'pending') ? 'PAID' : 'PENDING'} | Producción: ${String(row.plan?.status || 'MISSING').toUpperCase()}`);
    console.log(`Staff: ${row.staffAssignments.every((item) => item.status === 'completed') ? 'COMPLETED' : 'INCOMPLETE'} | Invitados: ${row.event.resourcePlanSnapshot?.guestList?.guests?.length || 0}/${row.event.guestCount} | Vajilla: ${row.tablewareAllocations.length ? 'OK' : 'MISSING'} | Proveedores: ${suppliers}`);
    console.log(`Operational: ${row.operationalReady ? 'READY' : 'BLOCKED'} | Financial: ${row.financialReady ? 'READY' : 'BLOCKED'} | Administrative: ${row.administrativeReady ? 'READY' : 'BLOCKED'}${row.errors.length ? ` | ${row.errors.join(' · ')}` : ''}`);
  }
  const bySalon = new Map<string, number>();
  const byPackage = new Map<string, number>();
  rows.forEach((row) => {
    const salon = row.event.salonId?.name || id(row.event.salonId); bySalon.set(salon, (bySalon.get(salon) || 0) + 1);
    const pack = row.event.commercialSnapshot?.packageName || 'Sin pack'; byPackage.set(pack, (byPackage.get(pack) || 0) + 1);
  });
  console.log('\nEventos por salón:', Object.fromEntries(bySalon));
  console.log('Eventos por paquete:', Object.fromEntries(byPackage));
}

async function cleanupSeed(): Promise<void> {
  assertWriteAllowed();
  const events = await Event.find({ notes: seedRegex() }).select('_id').lean();
  const eventIds = events.map((event) => event._id);
  const [plans, contracts, assignments, sessions] = await Promise.all([
    ProductionPlan.find({ eventId: { $in: eventIds } }).select('_id').lean(),
    Contract.find({ eventId: { $in: eventIds } }).select('_id').lean(),
    EventStaffAssignment.find({ eventId: { $in: eventIds } }).select('_id').lean(),
    WorkSession.find({ eventId: { $in: eventIds }, notes: seedRegex() }).select('_id').lean(),
  ]);
  const planIds = plans.map((item) => item._id);
  const contractIds = contracts.map((item) => item._id);
  const assignmentIds = assignments.map((item) => item._id);
  const sessionIds = sessions.map((item) => item._id);
  const entityIds = [...eventIds, ...planIds, ...contractIds, ...assignmentIds, ...sessionIds].map(id);
  await Promise.all([
    TimePunch.deleteMany({ $or: [{ workSessionId: { $in: sessionIds } }, { requestId: { $regex: `^${JULY_2026_SEED_KEY}:` } }] }),
    WorkSession.deleteMany({ _id: { $in: sessionIds } }),
    ProductionItem.deleteMany({ productionPlanId: { $in: planIds } }),
    ProductionSection.deleteMany({ productionPlanId: { $in: planIds } }),
    Payment.deleteMany({ contractId: { $in: contractIds }, notes: seedRegex() }),
    ExpenseAllocation.deleteMany({ eventId: { $in: eventIds } }),
    Expense.deleteMany({ eventId: { $in: eventIds }, sourceId: { $regex: JULY_2026_SEED_KEY } }),
    EventTablewareAllocation.deleteMany({ eventId: { $in: eventIds } }),
    EventClosure.deleteMany({ eventId: { $in: eventIds } }),
    CalendarItem.deleteMany({ eventId: { $in: eventIds } }),
    LeadActivity.deleteMany({ eventId: { $in: eventIds } }),
    QuoteRevision.deleteMany({ quoteId: { $in: await Quote.distinct('_id', { notes: seedRegex() }) } }),
    AuditLog.deleteMany({ entityId: { $in: entityIds } }),
  ]);
  await Promise.all([
    ProductionPlan.deleteMany({ _id: { $in: planIds } }), Contract.deleteMany({ _id: { $in: contractIds } }),
    EventStaffAssignment.deleteMany({ _id: { $in: assignmentIds } }), Event.deleteMany({ _id: { $in: eventIds } }),
  ]);
  await Promise.all([
    Quote.deleteMany({ notes: seedRegex() }), Customer.deleteMany({ notes: seedRegex() }), Lead.deleteMany({ notes: seedRegex() }),
    Supplier.deleteMany({ notes: seedRegex() }),
  ]);
  console.log(`Cleanup completado: ${eventIds.length} eventos y sus dependencias exclusivas eliminados.`);
}

async function dryRun(domain: Awaited<ReturnType<typeof loadDomainData>>, scenarios: Scenario[]): Promise<void> {
  await assertNoVenueConflicts(scenarios);
  const existing = await Event.countDocuments({ notes: seedRegex(), deletedAt: null });
  const packages = new Map<string, number>();
  scenarios.forEach((scenario) => packages.set(String(scenario.packageValues.name), (packages.get(String(scenario.packageValues.name)) || 0) + 1));
  console.log('\nDRY RUN — SEED FULL EVENTS JULY 2026');
  console.log(`Destino: base ${mongoose.connection.name} (${targetClassification().hostClass}), NODE_ENV=${env.NODE_ENV}, producción=${targetClassification().production ? 'sí' : 'no'}`);
  console.log(`Salones activos: ${domain.salons.length}; eventos proyectados: ${scenarios.length}; existentes/reutilizables: ${existing}; nuevos: ${Math.max(0, scenarios.length - existing)}`);
  console.log(`Paquetes activos: ${domain.templates.length}; reglas salón-paquete activas: ${domain.rules.length}; proveedores activos: ${domain.suppliers.length}; staff compatible total: ${domain.staff.length}`);
  console.log(`Stock de salón: ${domain.stock.length}; catálogo: ${domain.catalog.length}; reglas producción: ${domain.productionRules.length}; reglas consumo: ${domain.consumptionRules.length}; inventario operativo: ${domain.inventory.length}`);
  console.log('Distribución proyectada por paquete:', Object.fromEntries(packages));
  console.log(`Total contratado proyectado: ${money(scenarios.reduce((sum, scenario) => sum + scenario.totalAmount, 0))}`);
  console.log('No se realizaron escrituras. No se enviaron emails, WhatsApp, push ni solicitudes a Mercado Pago/Cloudinary.');
}

async function runSeed(domain: Awaited<ReturnType<typeof loadDomainData>>, scenarios: Scenario[]): Promise<void> {
  assertWriteAllowed();
  await assertNoVenueConflicts(scenarios);
  const actorId = id(domain.actor);
  const supplierPool = await ensureSupplierPool(domain.suppliers, actorId);
  const records: SeedRecord[] = [];
  for (const scenario of scenarios) records.push(await ensureCommercialEvent(scenario, actorId));
  for (const record of records) await ensureContractAndPayments(record, actorId);
  for (const record of records) await ensureSuppliersAndExpenses(record, supplierPool, actorId);
  for (const record of records) await ensureTableware(record, domain.stock, actorId);
  await ensureStaff(records, domain.staff, actorId);
  for (const record of records) await ensureProduction(record, domain.actor);
  for (const record of records) await ensureOpenClosure(record, actorId);
  const audit = await auditSeed();
  printAudit(audit, domain, scenarios.length);
  const errors = audit.rows.flatMap((row) => row.errors.map((error) => `${row.event.eventName}: ${error}`));
  if (audit.rows.length !== scenarios.length) errors.push(`Eventos auditados=${audit.rows.length}; esperados=${scenarios.length}.`);
  if (errors.length) throw new Error(`La auditoría final encontró ${errors.length} inconsistencia(s):\n${errors.join('\n')}`);
}

export async function main(argv = process.argv.slice(2)): Promise<void> {
  const args = parseSeedArguments(argv);
  await connectDatabase();
  try {
    const classification = targetClassification();
    console.log(`Entorno detectado: NODE_ENV=${classification.nodeEnv}; base=${mongoose.connection.name || classification.databaseName}; host=${classification.hostClass}; producción=${classification.production ? 'sí' : 'no'}.`);
    if (args.cleanup) { await cleanupSeed(); return; }
    const domain = await loadDomainData();
    const scenarios = buildScenarios(domain);
    if (args.dryRun) { await dryRun(domain, scenarios); return; }
    await runSeed(domain, scenarios);
  } finally {
    await disconnectDatabase();
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error('\nSEED_ABORTED');
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
