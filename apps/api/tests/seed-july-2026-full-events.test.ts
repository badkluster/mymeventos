import { describe, expect, it } from 'vitest';
import {
  assertSeedWriteAllowed, auditResourcePlan, buildGuestPlan, chooseGuestCount, classifySeedTarget, dietaryCountsFor,
  guestBreakdownFor, parseSeedArguments,
} from '../src/scripts/seedJuly2026FullEvents.helpers';
import { parseReportPeriod } from '../src/modules/reporting/report-filter';

describe('seed integral de julio de 2026', () => {
  it('clasifica destinos de producción sin exponer credenciales', () => {
    expect(classifySeedTarget({ nodeEnv: 'production', mongodbUri: 'mongodb+srv://user:secret@cluster/db' }).production).toBe(true);
    expect(classifySeedTarget({ nodeEnv: 'development', mongodbUri: 'mongodb://127.0.0.1/mymeventos-test' })).toMatchObject({ production: false, databaseName: 'mymeventos-test', hostClass: 'local' });
  });

  it('exige autorización explícita para toda escritura y nunca permite producción', () => {
    const testTarget = classifySeedTarget({ nodeEnv: 'test', mongodbUri: 'mongodb://127.0.0.1/mymeventos-test' });
    expect(() => assertSeedWriteAllowed(testTarget)).toThrow('Escritura no autorizada');
    expect(() => assertSeedWriteAllowed(testTarget, 'true')).not.toThrow();
    const production = classifySeedTarget({ nodeEnv: 'production', mongodbUri: 'mongodb://127.0.0.1/mymeventos-prod' });
    expect(() => assertSeedWriteAllowed(production, 'true')).toThrow('prohibidos');
  });

  it('valida argumentos mutuamente excluyentes', () => {
    expect(parseSeedArguments(['--dry-run'])).toEqual({ dryRun: true, cleanup: false });
    expect(() => parseSeedArguments(['--dry-run', '--cleanup'])).toThrow();
    expect(() => parseSeedArguments(['--force'])).toThrow();
  });

  it('genera invitados exactos, deterministas, con mesas y restricciones reconciliadas', () => {
    const guestCount = chooseGuestCount({ min: 50, recommended: 100, max: 120, seed: 'test-event' });
    const dietary = dietaryCountsFor(guestCount, 'test-dietary');
    const breakdown = guestBreakdownFor(guestCount, 'fifteen', 'test-ages');
    const first = buildGuestPlan({ guestCount, seed: 'test-guests', dietary, breakdown, meal: 'Menú de prueba' });
    const second = buildGuestPlan({ guestCount, seed: 'test-guests', dietary, breakdown, meal: 'Menú de prueba' });
    expect(first).toEqual(second);
    expect(first.guests).toHaveLength(guestCount);
    expect(first.guests.every((guest) => guest.confirmed && guest.tableId)).toBe(true);
    expect(first.tables.every((table) => first.guests.filter((guest) => guest.tableId === table.id).length <= table.capacity)).toBe(true);
  });

  it('audita el resource plan y detecta desvíos matemáticos', () => {
    const guestCount = 73;
    const dietary = { vegetarian: 3, vegan: 2, celiac: 1, lactoseIntolerant: 2 };
    const breakdown = guestBreakdownFor(guestCount, 'wedding', 'audit-ages');
    const guestList = buildGuestPlan({ guestCount, seed: 'audit-guests', dietary, breakdown, meal: 'Principal' });
    const plan = {
      guestList,
      timelineItems: [{ status: 'completed' }],
      tasks: [{ status: 'completed' }],
      logistics: Object.fromEntries(['eventSetupNotes', 'kitchenNotes', 'barNotes', 'decorationNotes', 'accessNotes', 'riskNotes'].map((key) => [key, 'Detalle operativo completo.'])),
    };
    expect(auditResourcePlan({ guestCount, vegetarianCount: 3, veganCount: 2, celiacCount: 1, lactoseIntolerantCount: 2, resourcePlanSnapshot: plan })).toEqual([]);
    plan.guestList.guests.pop();
    expect(auditResourcePlan({ guestCount, vegetarianCount: 3, veganCount: 2, celiacCount: 1, lactoseIntolerantCount: 2, resourcePlanSnapshot: plan })).not.toEqual([]);
  });

  it('delimita julio por medianoche de Buenos Aires, incluyendo ambos extremos civiles', () => {
    const period = parseReportPeriod({ from: '2026-07-01', to: '2026-07-31' });
    expect(period.from.toISOString()).toBe('2026-07-01T03:00:00.000Z');
    expect(period.toExclusive.toISOString()).toBe('2026-08-01T03:00:00.000Z');
    expect(new Date('2026-07-01T02:59:59.999Z') < period.from).toBe(true);
    expect(new Date('2026-07-01T03:00:00.000Z') >= period.from).toBe(true);
    expect(new Date('2026-08-01T02:59:59.999Z') < period.toExclusive).toBe(true);
    expect(new Date('2026-08-01T03:00:00.000Z') < period.toExclusive).toBe(false);
  });
});
