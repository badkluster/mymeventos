type InitialResourcePlanInput = {
  source?: 'quote_conversion' | 'manual_event';
  sourceQuoteId?: unknown;
};

export function buildInitialResourcePlan(input: InitialResourcePlanInput = {}): Record<string, unknown> {
  return {
    timelineItems: [
      { id: 'setup', time: '', title: 'Armado del salon', area: 'Salon', owner: 'Coordinacion', status: 'pending', notes: '' },
      { id: 'supplier-arrival', time: '', title: 'Recepcion de proveedores', area: 'Logistica', owner: 'Coordinacion', status: 'pending', notes: '' },
      { id: 'guest-reception', time: '', title: 'Recepcion de invitados', area: 'Recepcion', owner: 'Staff', status: 'pending', notes: '' },
      { id: 'honoree-entry', time: '', title: 'Ingreso principal / homenajeado', area: 'Salon', owner: 'Coordinacion', status: 'pending', notes: '' },
      { id: 'reception-service', time: '', title: 'Servicio de recepcion', area: 'Catering', owner: 'Cocina', status: 'pending', notes: '' },
      { id: 'main-menu', time: '', title: 'Servicio de menu principal', area: 'Catering', owner: 'Cocina', status: 'pending', notes: '' },
      { id: 'toast-cake', time: '', title: 'Brindis, torta o momento especial', area: 'Salon', owner: 'Coordinacion', status: 'pending', notes: '' },
      { id: 'sweet-table', time: '', title: 'Mesa dulce / postre', area: 'Catering', owner: 'Cocina', status: 'pending', notes: '' },
      { id: 'party', time: '', title: 'Baile, DJ y animacion', area: 'Pista', owner: 'DJ', status: 'pending', notes: '' },
      { id: 'closing', time: '', title: 'Cierre, desmontaje y devolucion', area: 'Logistica', owner: 'Coordinacion', status: 'pending', notes: '' }
    ],
    productItems: [],
    inventoryItems: [],
    supplierAssignments: [],
    tasks: [],
    alerts: [],
    logistics: {
      eventSetupNotes: '',
      kitchenNotes: '',
      barNotes: '',
      decorationNotes: '',
      accessNotes: '',
      riskNotes: ''
    },
    source: input.source ?? 'manual_event',
    sourceQuoteId: input.sourceQuoteId
  };
}
