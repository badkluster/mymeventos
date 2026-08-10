export const JULY_2026_SEED_KEY = 'FULL_EVENTS_JULY_2026_V1';

export const JULY_2026_EVENT_DAYS = [
  '2026-07-03', '2026-07-04', '2026-07-10', '2026-07-11', '2026-07-17',
  '2026-07-18', '2026-07-24', '2026-07-25', '2026-07-31',
] as const;

export type SeedArguments = { dryRun: boolean; cleanup: boolean };

export type SeedTargetClassification = {
  nodeEnv: string;
  databaseName: string;
  hostClass: 'local' | 'remote' | 'missing';
  production: boolean;
  productionReasons: string[];
};

export type GuestTable = {
  id: string;
  name: string;
  capacity: number;
  audience: string;
  notes: string;
};

export type SeedGuest = {
  id: string;
  fullName: string;
  tableId: string;
  ageGroup: 'adult' | 'teenager' | 'child';
  dietaryPreference: 'standard' | 'vegetarian' | 'vegan' | 'celiac' | 'lactose_intolerant';
  confirmed: true;
  meal: string;
  notes?: string;
};

export type GuestPlan = {
  tables: GuestTable[];
  guests: SeedGuest[];
  notes: string;
};

export type DietaryCounts = {
  vegetarian: number;
  vegan: number;
  celiac: number;
  lactoseIntolerant: number;
};

export type GuestBreakdown = {
  totalGuests: number;
  adultsCount: number;
  minorsCount: number;
  childrenCount: number;
  teenagersCount: number;
  adultsWithAlcoholCount: number;
  includesAlcohol: boolean;
};

export function parseSeedArguments(argv: string[]): SeedArguments {
  const known = new Set(['--dry-run', '--cleanup']);
  const unknown = argv.filter((item) => item.startsWith('--') && !known.has(item));
  if (unknown.length) throw new Error(`Argumentos no reconocidos: ${unknown.join(', ')}`);
  const dryRun = argv.includes('--dry-run');
  const cleanup = argv.includes('--cleanup');
  if (dryRun && cleanup) throw new Error('--dry-run y --cleanup no pueden utilizarse juntos.');
  return { dryRun, cleanup };
}

export function classifySeedTarget(input: { nodeEnv?: string; vercelEnv?: string; mongodbUri?: string }): SeedTargetClassification {
  const uri = input.mongodbUri ?? '';
  const withoutQuery = uri.split('?')[0];
  const databaseName = decodeURIComponent(withoutQuery.match(/\/([^/]+)$/)?.[1] ?? '');
  const authority = uri.replace(/^mongodb(?:\+srv)?:\/\//, '').split('/')[0];
  const hostPart = authority.includes('@') ? authority.split('@').pop() ?? '' : authority;
  const host = hostPart.split(',')[0].replace(/^\[/, '').split(/\]:|:/)[0].toLowerCase();
  const hostClass = !host ? 'missing' : ['localhost', '127.0.0.1', '::1'].includes(host) ? 'local' : 'remote';
  const productionReasons = [
    input.nodeEnv === 'production' ? 'NODE_ENV=production' : undefined,
    input.vercelEnv === 'production' ? 'VERCEL_ENV=production' : undefined,
    /(^|[-_])(prod|production)([-_]|$)/i.test(databaseName) ? 'nombre de base con indicador de producción' : undefined,
  ].filter((value): value is string => Boolean(value));
  return {
    nodeEnv: input.nodeEnv ?? 'development',
    databaseName: databaseName || '(sin nombre explícito)',
    hostClass,
    production: productionReasons.length > 0,
    productionReasons,
  };
}

export function assertSeedWriteAllowed(target: SeedTargetClassification, explicitWriteFlag?: string): void {
  if (target.production) throw new Error(`Destino clasificado como producción (${target.productionReasons.join(', ')}). El seed y cleanup están prohibidos.`);
  if (explicitWriteFlag !== 'true') throw new Error('Escritura no autorizada. Definí ALLOW_FULL_EVENT_SEED=true sólo para el entorno y alcance expresamente autorizados.');
}

export function hashSeed(value: string): number {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

export function createSeededRandom(seed: string): () => number {
  let state = hashSeed(seed) || 1;
  return () => {
    state += 0x6d2b79f5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

export function addUtcDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * 86_400_000);
}

export function dateAtUtc(day: string, time = '12:00'): Date {
  return new Date(`${day}T${time}:00.000Z`);
}

export function dateKey(value: Date | string): string {
  return new Date(value).toISOString().slice(0, 10);
}

export function eventDateTime(day: string, time: string, endRelativeTo?: string): Date {
  const value = dateAtUtc(day, time);
  if (endRelativeTo && time <= endRelativeTo) value.setUTCDate(value.getUTCDate() + 1);
  return value;
}

export function chooseGuestCount(input: { min?: number; recommended?: number; max?: number; seed: string }): number {
  const min = Math.max(1, Math.ceil(Number(input.min || 50)));
  const configuredMax = Number(input.max || input.recommended || Math.max(min, 120));
  const max = Math.max(min, Math.floor(configuredMax));
  const recommended = Math.min(max, Math.max(min, Math.floor(Number(input.recommended || max))));
  const random = createSeededRandom(input.seed);
  const lower = Math.min(recommended, Math.max(min, Math.round(min + (recommended - min) * 0.2)));
  const selected = Math.round(lower + random() * (max - lower));
  return Math.min(max, Math.max(min, selected));
}

export function dietaryCountsFor(guestCount: number, seed: string): DietaryCounts {
  const random = createSeededRandom(seed);
  const maximum = Math.max(0, Math.min(guestCount, Math.floor(guestCount * 0.2)));
  const counts: DietaryCounts = {
    vegetarian: Math.min(maximum, 1 + Math.floor(random() * Math.max(1, guestCount * 0.045))),
    vegan: Math.floor(random() * Math.max(1, guestCount * 0.025)),
    celiac: Math.floor(random() * Math.max(1, guestCount * 0.03)),
    lactoseIntolerant: Math.floor(random() * Math.max(1, guestCount * 0.035)),
  };
  let total = Object.values(counts).reduce((sum, value) => sum + value, 0);
  while (total > maximum) {
    const key = (Object.keys(counts) as Array<keyof DietaryCounts>).sort((left, right) => counts[right] - counts[left])[0];
    if (counts[key] <= 0) break;
    counts[key] -= 1;
    total -= 1;
  }
  return counts;
}

export function guestBreakdownFor(guestCount: number, eventType: string, seed: string): GuestBreakdown {
  const random = createSeededRandom(seed);
  const childHeavy = eventType.includes('baptism') || eventType.includes('birthday');
  const teenagerHeavy = eventType.includes('fifteen') || eventType.includes('graduates');
  const childrenCount = Math.min(guestCount, Math.round(guestCount * (childHeavy ? 0.16 : 0.05 + random() * 0.04)));
  const teenagersCount = Math.min(guestCount - childrenCount, Math.round(guestCount * (teenagerHeavy ? 0.2 : 0.05 + random() * 0.05)));
  const minorsCount = childrenCount + teenagersCount;
  const adultsCount = guestCount - minorsCount;
  const includesAlcohol = !eventType.includes('baptism');
  return {
    totalGuests: guestCount,
    adultsCount,
    minorsCount,
    childrenCount,
    teenagersCount,
    adultsWithAlcoholCount: includesAlcohol ? Math.max(0, adultsCount - Math.round(adultsCount * 0.08)) : 0,
    includesAlcohol,
  };
}

const firstNames = [
  'Sofía', 'Valentina', 'Martina', 'Camila', 'Lucía', 'Julieta', 'Agustina', 'Malena', 'Emma', 'Olivia',
  'Mateo', 'Benjamín', 'Joaquín', 'Santino', 'Bautista', 'Franco', 'Tomás', 'Thiago', 'Lautaro', 'Facundo',
];
const lastNames = [
  'Fernández', 'Martínez', 'Gómez', 'López', 'Rodríguez', 'Pérez', 'Sánchez', 'Romero', 'Díaz', 'Álvarez',
  'Torres', 'Ruiz', 'Ramírez', 'Flores', 'Acosta', 'Benítez', 'Medina', 'Herrera', 'Aguirre', 'Castro',
];
const tableAudiences = ['Familia', 'Amigos', 'Trabajo', 'Jóvenes', 'Familia extendida', 'Compañeros'];

export function buildGuestPlan(input: {
  guestCount: number;
  seed: string;
  dietary: DietaryCounts;
  breakdown: GuestBreakdown;
  meal: string;
}): GuestPlan {
  const { guestCount, dietary, breakdown } = input;
  const dietaryTotal = Object.values(dietary).reduce((sum, value) => sum + value, 0);
  if (dietaryTotal > guestCount) throw new Error('Las restricciones alimentarias superan la cantidad de invitados.');
  if (breakdown.adultsCount + breakdown.childrenCount + breakdown.teenagersCount !== guestCount) {
    throw new Error('La composición etaria no coincide con el total de invitados.');
  }
  const random = createSeededRandom(input.seed);
  const tables: GuestTable[] = [];
  let remaining = guestCount;
  while (remaining > 0) {
    const tableNumber = tables.length + 1;
    const capacity = tableNumber % 4 === 0 ? 12 : 10;
    tables.push({
      id: `${input.seed}-table-${String(tableNumber).padStart(2, '0')}`,
      name: `Mesa ${tableNumber} - ${tableAudiences[(tableNumber - 1) % tableAudiences.length]}`,
      capacity,
      audience: tableAudiences[(tableNumber - 1) % tableAudiences.length],
      notes: tableNumber === 1 ? 'Mesa cercana al sector principal y coordinada con recepción.' : 'Ubicación validada en el plano operativo.',
    });
    remaining -= Math.min(remaining, capacity);
  }

  const dietarySequence: SeedGuest['dietaryPreference'][] = [
    ...Array(dietary.vegetarian).fill('vegetarian'),
    ...Array(dietary.vegan).fill('vegan'),
    ...Array(dietary.celiac).fill('celiac'),
    ...Array(dietary.lactoseIntolerant).fill('lactose_intolerant'),
    ...Array(guestCount - dietaryTotal).fill('standard'),
  ];
  const ageSequence: SeedGuest['ageGroup'][] = [
    ...Array(breakdown.childrenCount).fill('child'),
    ...Array(breakdown.teenagersCount).fill('teenager'),
    ...Array(breakdown.adultsCount).fill('adult'),
  ];

  const guests: SeedGuest[] = [];
  let tableIndex = 0;
  let seatsAtTable = 0;
  for (let index = 0; index < guestCount; index += 1) {
    if (seatsAtTable >= tables[tableIndex].capacity) {
      tableIndex += 1;
      seatsAtTable = 0;
    }
    const fullName = `${firstNames[(index + Math.floor(random() * firstNames.length)) % firstNames.length]} ${lastNames[(index * 3 + Math.floor(random() * lastNames.length)) % lastNames.length]} ${String(index + 1).padStart(3, '0')}`;
    const preference = dietarySequence[index];
    guests.push({
      id: `${input.seed}-guest-${String(index + 1).padStart(3, '0')}`,
      fullName,
      tableId: tables[tableIndex].id,
      ageGroup: ageSequence[index],
      dietaryPreference: preference,
      confirmed: true,
      meal: preference === 'standard' ? input.meal : `${input.meal} - adaptación ${preference}`,
      notes: preference === 'standard' ? undefined : `Plato identificado para restricción ${preference}.`,
    });
    seatsAtTable += 1;
  }

  return { tables, guests, notes: `Lista cerrada y confirmada. ${guestCount}/${guestCount} asistentes con mesa asignada.` };
}

export type ResourcePlanAuditInput = {
  guestCount: number;
  vegetarianCount: number;
  veganCount: number;
  celiacCount: number;
  lactoseIntolerantCount: number;
  resourcePlanSnapshot: Record<string, any>;
};

export function auditResourcePlan(input: ResourcePlanAuditInput): string[] {
  const errors: string[] = [];
  const plan = input.resourcePlanSnapshot ?? {};
  const guests: SeedGuest[] = Array.isArray(plan.guestList?.guests) ? plan.guestList.guests : [];
  const tables: GuestTable[] = Array.isArray(plan.guestList?.tables) ? plan.guestList.tables : [];
  if (guests.length !== input.guestCount) errors.push(`guestList=${guests.length}; guestCount=${input.guestCount}`);
  const tableIds = new Set(tables.map((table) => table.id));
  if (guests.some((guest) => !guest.tableId || !tableIds.has(guest.tableId))) errors.push('Hay invitados sin una mesa válida.');
  for (const table of tables) {
    const assigned = guests.filter((guest) => guest.tableId === table.id).length;
    if (assigned > table.capacity) errors.push(`${table.name} excede capacidad (${assigned}/${table.capacity}).`);
  }
  const countPreference = (preference: SeedGuest['dietaryPreference']) => guests.filter((guest) => guest.dietaryPreference === preference).length;
  const expected: Array<[SeedGuest['dietaryPreference'], number]> = [
    ['vegetarian', input.vegetarianCount], ['vegan', input.veganCount], ['celiac', input.celiacCount], ['lactose_intolerant', input.lactoseIntolerantCount],
  ];
  for (const [preference, count] of expected) {
    const actual = countPreference(preference);
    if (actual !== count) errors.push(`${preference}=${actual}; esperado=${count}`);
  }
  if (!Array.isArray(plan.timelineItems) || !plan.timelineItems.length || plan.timelineItems.some((item: any) => item.status !== 'completed')) errors.push('Cronograma ausente o incompleto.');
  if (!Array.isArray(plan.tasks) || !plan.tasks.length || plan.tasks.some((item: any) => item.status !== 'completed')) errors.push('Tareas ausentes o incompletas.');
  const logistics = plan.logistics ?? {};
  const logisticsFields = ['eventSetupNotes', 'kitchenNotes', 'barNotes', 'decorationNotes', 'accessNotes', 'riskNotes'];
  if (logisticsFields.some((field) => !String(logistics[field] ?? '').trim() || String(logistics[field]).includes('[completar]'))) errors.push('Logística incompleta o con placeholders.');
  return errors;
}

export function money(value: number): string {
  return new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 }).format(value);
}
