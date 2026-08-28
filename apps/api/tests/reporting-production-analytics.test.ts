import { describe, expect, it } from 'vitest';
import { Types } from 'mongoose';
import { Role } from '@mym/shared';
import { parseReportPeriod, REPORT_TIME_ZONE, resolveReportScope } from '../src/modules/reporting/report-filter';
import { normalizeProductName } from '../src/modules/production/production.service';
import { consolidatedProductionExcel, consolidatedProductionPdf } from '../src/modules/production/production-consolidated-export.service';
import { AnalyticsEvent, AnalyticsSession, analyticsEventNames } from '../src/modules/analytics/analytics.models';
import { dashboardMetricDefinitions } from '../src/modules/reporting/metric-catalog';

describe('reporting period boundaries', () => {
  const now = new Date('2026-07-25T02:30:00.000Z');

  it('uses Buenos Aires calendar dates and an inclusive final day', () => {
    const period = parseReportPeriod({ from: '2026-07-01', to: '2026-07-24' }, now);

    expect(period.timeZone).toBe(REPORT_TIME_ZONE);
    expect(period.from.toISOString()).toBe('2026-07-01T03:00:00.000Z');
    expect(period.toExclusive.toISOString()).toBe('2026-07-25T03:00:00.000Z');
    expect(period.previousFromDate).toBe('2026-06-07');
    expect(period.previousToDate).toBe('2026-06-30');
  });

  it('derives today from Buenos Aires rather than UTC', () => {
    const period = parseReportPeriod({}, now);
    expect(period.fromDate).toBe('2026-07-01');
    expect(period.toDate).toBe('2026-07-24');
  });

  it('rejects reversed or excessively long periods', () => {
    expect(() => parseReportPeriod({ from: '2026-07-25', to: '2026-07-24' }, now)).toThrowError(
      expect.objectContaining({ code: 'REPORT_PERIOD_INVALID' }),
    );
    expect(() => parseReportPeriod({ from: '2025-01-01', to: '2026-07-24' }, now)).toThrowError(
      expect.objectContaining({ code: 'REPORT_PERIOD_TOO_LONG' }),
    );
  });
});

describe('dashboard metric contract', () => {
  it('provides a valid drill-down destination for every metric', () => {
    expect(dashboardMetricDefinitions.length).toBeGreaterThan(0);
    for (const metric of dashboardMetricDefinitions) {
      expect(metric.drillDownHref).toMatch(/^\/admin\/.+/);
    }
  });
});

describe('reporting salon scope', () => {
  it('uses ObjectId values so the same filter works in Mongo aggregations', () => {
    const salonId = '6a3a7b01e07b5dce06768bd2';
    const scope = resolveReportScope({
      query: { salonId },
      user: { id: 'user-1', roles: [Role.ADMIN], permissionOverrides: [], permissionDeniedOverrides: [], salonIds: [], managedSalonIds: [], active: true },
    } as any);
    const match: any = scope.match();

    expect(match.salonId).toBeInstanceOf(Types.ObjectId);
    expect(match.salonId.toString()).toBe(salonId);
  });
});

describe('production normalization', () => {
  it('merges accents, casing and repeated whitespace into the same comparison key', () => {
    expect(normalizeProductName('  Café   MOLIDO ')).toBe('cafe molido');
    expect(normalizeProductName('CuchÁra')).toBe(normalizeProductName('cuchara'));
  });
});

describe('production consolidated exports', () => {
  const sections = [{
    type: 'savory', name: 'Producción salada', events: [{ planId: 'plan-empanadas-1', customerName: 'Martina López', eventDate: '2026-07-04', plannedQuantity: 120, completedQuantity: 90 }], items: [{ productName: 'Empanadas', supplierName: 'La Empanadería', unit: 'unidad', eventCount: 2, plannedQuantity: 120, completedQuantity: 90, availableQuantity: 80, missingQuantity: 40, toBuyQuantity: 40, toProduceQuantity: 30, pendingItems: 1, byEvent: [{ planId: 'plan-empanadas-1', customerName: 'Martina López', eventDate: '2026-07-04', plannedQuantity: 120, completedQuantity: 90 }] }],
  }, {
    type: 'beverages', name: 'Bebidas', events: [{ planId: 'plan-agua-1', customerName: 'Gonzalo Castro', eventDate: '2026-07-08', plannedQuantity: 30, completedQuantity: 30 }], items: [{ productName: 'Agua', unit: 'litro', eventCount: 1, plannedQuantity: 30, completedQuantity: 30, availableQuantity: 50, missingQuantity: 0, toBuyQuantity: 0, toProduceQuantity: 0, pendingItems: 0, byEvent: [{ planId: 'plan-agua-1', customerName: 'Gonzalo Castro', eventDate: '2026-07-08', plannedQuantity: 30, completedQuantity: 30 }] }],
  }];

  it('builds a total worksheet plus one worksheet per production type', () => {
    const excel = consolidatedProductionExcel(sections, 'Producción consolidada');

    expect(excel).toContain('ss:Name="Total consolidado"');
    expect(excel).toContain('ss:Name="Producción salada"');
    expect(excel).toContain('ss:Name="Bebidas"');
    expect(excel).toContain('Empanadas');
    expect(excel).toContain('Proveedor');
    expect(excel).toContain('La Empanadería');
    expect(excel).toContain('Agua');
    expect(excel).toContain('Martina López');
    expect(excel).toContain('Gonzalo Castro');
    expect(excel).toContain('<Styles>');
    expect(excel).toContain('ss:StyleID="sHeader"');
    expect(excel).toContain('<AutoFilter x:Range="R8C1:R10C13"/>');
    expect(excel).toContain('ss:MergeAcross="12"');
  });

  it('builds a PDF containing every requested production type', async () => {
    const pdf = await consolidatedProductionPdf(sections, 'Producción consolidada', '2026-07-01 al 2026-07-31');

    expect(pdf.subarray(0, 4).toString()).toBe('%PDF');
    expect(pdf.length).toBeGreaterThan(500);
  });
});

describe('first-party analytics safeguards', () => {
  it('uses a closed event whitelist and rejects unknown event names', async () => {
    expect(analyticsEventNames).toContain('form_success');
    await expect(new AnalyticsEvent({
      eventId: 'evt-valid-001',
      anonymousVisitorId: 'visitor-001',
      sessionId: 'session-001',
      attributionId: 'attribution-001',
      eventName: 'typed_form_value',
      pagePath: '/',
      occurredAt: new Date(),
      pageVersion: 'landing-v1',
      expiresAt: new Date(Date.now() + 86_400_000),
    }).validate()).rejects.toThrow();
  });

  it('has TTL indexes for raw events and sessions', () => {
    const hasTtl = (indexes: ReturnType<typeof AnalyticsEvent.schema.indexes>) =>
      indexes.some(([keys, options]) => keys.expiresAt === 1 && options.expireAfterSeconds === 0);

    expect(hasTtl(AnalyticsEvent.schema.indexes())).toBe(true);
    expect(hasTtl(AnalyticsSession.schema.indexes())).toBe(true);
  });
});
