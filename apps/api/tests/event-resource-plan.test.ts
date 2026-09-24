import { describe, expect, it } from 'vitest';
import { buildInitialResourcePlan } from '../src/modules/crm/event-resource-plan';

describe('buildInitialResourcePlan', () => {
  it('preloads the agreed quince-event moments in their operational order', () => {
    const plan = buildInitialResourcePlan() as { timelineItems: Array<{ title: string }> };

    expect(plan.timelineItems.map((item) => item.title)).toEqual([
      'Recepción de invitados y comida',
      'Entrada de la cumpleañera',
      'Fotos en living / entrada de comida a mesa',
      'Tanda de baile',
      'Plato principal',
      'Vals / tanda de baile',
      'Postre',
      'Tanda de baile',
      'Ceremonia de torta / brindis',
      'Tanda de baile',
      'Mesa dulce',
      'Tanda de baile',
      'Fin de fiesta',
      'Carnaval carioca',
      'Fin del evento'
    ]);
  });
});
