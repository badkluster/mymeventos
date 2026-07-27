import { Role, StaffEmploymentStatus, StaffSubrole } from '@mym/shared';
import { connectDatabase, disconnectDatabase } from '../db/connection';
import { Salon } from '../modules/salons/salon.model';
import { User } from '../modules/users/user.model';
import { hashPassword } from '../utils/password';

// Idempotent local/dev roster import. It intentionally uses example.com addresses so
// the created accounts never target a real person's inbox.
// Run with: pnpm --filter @mym/api seed:staff-roster

const INITIAL_PASSWORD = '12345678';

type SalonPreference = 'la-plata' | 'san-carlos';

type RosterEntry = {
  username: string;
  firstName: string;
  lastName: string;
  position: string;
  subroles: StaffSubrole[];
  salonPreference?: SalonPreference;
  notes?: string;
};

const roster: RosterEntry[] = [
  { username: 'liliana.quintero', firstName: 'Liliana', lastName: 'Quintero', position: 'Jefa y encargada de cocina', subroles: [StaffSubrole.COOK] },
  { username: 'pedro.alvarez', firstName: 'Pedro', lastName: 'Álvarez', position: 'Chofer', subroles: [StaffSubrole.OTHER], notes: 'Función operativa: chofer.' },
  { username: 'angeles.fernandez', firstName: 'Ángeles', lastName: 'Fernández', position: 'Limpieza La Plata y encargada de cocina', subroles: [StaffSubrole.CLEANING, StaffSubrole.COOK], salonPreference: 'la-plata' },
  { username: 'solange.biviani', firstName: 'Solange', lastName: 'Biviani', position: 'Limpieza San Carlos y moza', subroles: [StaffSubrole.CLEANING, StaffSubrole.WAITER], salonPreference: 'san-carlos', notes: 'También registrada como Solangel Biviani en el listado original.' },
  { username: 'lucas.biviani', firstName: 'Lucas', lastName: 'Biviani', position: 'Metre, barténder o mozo', subroles: [StaffSubrole.MAITRE, StaffSubrole.BARTENDER, StaffSubrole.WAITER] },
  { username: 'rocio.mena', firstName: 'Rocío', lastName: 'Mena', position: 'Metre, barténder o moza', subroles: [StaffSubrole.MAITRE, StaffSubrole.BARTENDER, StaffSubrole.WAITER] },
  { username: 'veronica.britez', firstName: 'Verónica', lastName: 'Britez', position: 'Metre o moza', subroles: [StaffSubrole.MAITRE, StaffSubrole.WAITER] },
  { username: 'patricia.decastro', firstName: 'Patricia', lastName: 'de Castro', position: 'Encargada de cocina', subroles: [StaffSubrole.COOK] },
  { username: 'gloria.elizabeth', firstName: 'Gloria', lastName: 'Elizabeth', position: 'Ayudante de cocina', subroles: [StaffSubrole.KITCHEN_ASSISTANT], notes: 'El listado recibido no incluía apellido; se cargó Elizabeth como segundo nombre/apellido provisorio.' },
  { username: 'ludmila.dasilva', firstName: 'Ludmila', lastName: 'da Silva', position: 'Ayudante de cocina', subroles: [StaffSubrole.KITCHEN_ASSISTANT] },
  { username: 'macarena.dasilva', firstName: 'Macarena', lastName: 'da Silva', position: 'Ayudante de cocina', subroles: [StaffSubrole.KITCHEN_ASSISTANT] },
  { username: 'mariana.fernandez', firstName: 'Mariana', lastName: 'Fernández', position: 'Ayudante de cocina', subroles: [StaffSubrole.KITCHEN_ASSISTANT] },
  { username: 'sebastian.tomas', firstName: 'Sebastián', lastName: 'Tomás', position: 'Mozo', subroles: [StaffSubrole.WAITER] },
  { username: 'santino.rodriguez', firstName: 'Santino', lastName: 'Rodríguez', position: 'Mozo', subroles: [StaffSubrole.WAITER] },
  { username: 'dilan.gonzalez', firstName: 'Dilan', lastName: 'González', position: 'Mozo', subroles: [StaffSubrole.WAITER] },
  { username: 'lucas.campo', firstName: 'Lucas', lastName: 'Campo', position: 'Barténder', subroles: [StaffSubrole.BARTENDER] }
];

function normalizedText(value: string): string {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}

function emailFor(entry: RosterEntry, index: number): string {
  return `${entry.username.replace(/\./g, '-')}.${String(index + 1).padStart(2, '0')}@staff.example.com`;
}

function phoneFor(index: number): string {
  return `+54 9 221 555 ${String(1000 + index)}`;
}

async function importRoster(): Promise<void> {
  await connectDatabase();

  const salons: Array<{ _id: { toString(): string }; name: string }> = await Salon.find({ active: true, deletedAt: null })
    .sort({ displayOrder: 1, name: 1 })
    .select('_id name')
    .lean() as unknown as Array<{ _id: { toString(): string }; name: string }>;

  if (!salons.length) throw new Error('No hay salones activos. Creá al menos uno antes de importar el plantel.');

  const findSalon = (keyword: string) => salons.find((salon) => normalizedText(salon.name).includes(keyword));
  const laPlata = findSalon('la plata');
  const sanCarlos = findSalon('san carlos');
  const allSalonIds = salons.map((salon) => salon._id.toString());
  let created = 0;
  let updated = 0;

  for (const [index, entry] of roster.entries()) {
    const preferredSalon = entry.salonPreference === 'la-plata' ? laPlata : entry.salonPreference === 'san-carlos' ? sanCarlos : undefined;
    const salonIds = preferredSalon ? [preferredSalon._id.toString()] : allSalonIds;
    const passwordHash = await hashPassword(INITIAL_PASSWORD);
    const existing = await User.findOne({ username: entry.username }).select('+passwordHash');
    const isNew = !existing;
    const user: any = existing ?? new User();

    Object.assign(user, {
      username: entry.username,
      email: emailFor(entry, index),
      passwordHash,
      firstName: entry.firstName,
      lastName: entry.lastName,
      phone: phoneFor(index),
      roles: [Role.STAFF],
      primaryRole: Role.STAFF,
      permissionOverrides: [],
      permissionDeniedOverrides: [],
      active: true,
      canAccessBackoffice: false,
      salonIds,
      primarySalonId: salonIds[0],
      employeeProfile: {
        employeeCode: `STAFF-${String(index + 1).padStart(3, '0')}`,
        position: entry.position,
        department: 'Operaciones',
        employmentStatus: 'active',
        notes: entry.notes
      },
      staffProfile: {
        staffCode: `STAFF-${String(index + 1).padStart(3, '0')}`,
        staffSubroles: entry.subroles,
        employmentStatus: StaffEmploymentStatus.ACTIVE,
        notes: entry.notes
      },
      workSchedule: {
        type: 'EVENT_BASED',
        weeklyAvailability: [],
        notes: 'Disponibilidad asignada por evento.'
      },
      payrollProfile: {
        paymentType: 'PER_EVENT',
        currency: 'ARS',
        active: true
      },
      attendanceConfig: {
        enabled: true,
        canUseMobileApp: true,
        requiresGeolocation: false,
        requiresWifiOrIpValidation: false,
        allowedIpAddresses: [],
        allowedGeoLocations: [],
        allowManualAdjustment: true,
        defaultWorkLocationSalonId: salonIds[0],
        notes: 'Asistencia y app móvil habilitadas al crear el perfil de Staff.'
      },
      mustChangePassword: false,
      deletedAt: null,
      deletedBy: undefined
    });

    await user.save();
    if (isNew) created += 1;
    else updated += 1;
  }

  const locationWarning = [
    !laPlata ? 'No se encontró un salón con “La Plata”; Ángeles recibió los salones activos.' : '',
    !sanCarlos ? 'No se encontró un salón con “San Carlos”; Solange recibió los salones activos.' : ''
  ].filter(Boolean);

  console.info(`Plantel importado: ${created} creado(s), ${updated} actualizado(s), ${roster.length} total.`);
  console.info(`Salones asignados: ${salons.map((salon) => salon.name).join(', ')}.`);
  for (const warning of locationWarning) console.warn(warning);
}

importRoster().then(disconnectDatabase).catch(async (error) => {
  console.error('La importación de plantel falló:', error);
  await disconnectDatabase();
  process.exitCode = 1;
});
