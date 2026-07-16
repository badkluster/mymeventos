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
      { id: 'reception-service', time: '', title: 'Servicio de recepcion', area: 'Catering', owner: 'Cocina', status: 'pending', notes: '' },
      { id: 'honoree-entry', time: '', title: 'Ingreso principal / homenajeado', area: 'Salon', owner: 'Coordinacion', status: 'pending', notes: '' },
      { id: 'main-menu', time: '', title: 'Servicio de menu principal', area: 'Catering', owner: 'Cocina', status: 'pending', notes: '' },
      { id: 'toast-cake', time: '', title: 'Brindis, torta o momento especial', area: 'Salon', owner: 'Coordinacion', status: 'pending', notes: '' },
      { id: 'sweet-table', time: '', title: 'Mesa dulce / postre', area: 'Catering', owner: 'Cocina', status: 'pending', notes: '' },
      { id: 'party', time: '', title: 'Baile, DJ y animacion', area: 'Pista', owner: 'DJ', status: 'pending', notes: '' },
      { id: 'closing', time: '', title: 'Cierre, desmontaje y devolucion', area: 'Logistica', owner: 'Coordinacion', status: 'pending', notes: '' }
    ],
    staffNotes: [
      { id: 'protocol', title: 'Protocolo y momentos especiales', notes: 'El/la maître confirma cada momento con el cliente, DJ, foto y coordinación antes de avanzar.' },
      { id: 'minors', title: 'Menores y bebidas', notes: 'Identificar a los menores y respetar las indicaciones de bebidas y menú definidas para el evento.' },
      { id: 'closing', title: 'Cierre operativo', notes: 'Al finalizar, realizar conteo de vajilla y mantelería, ordenar cocina y entregar o resguardar los sobrantes según lo acordado.' }
    ],
    guestList: { tables: [], guests: [], notes: '' },
    productItems: [],
    inventoryItems: [
      { id: 'dinner-plate', name: 'Plato playo', category: 'Vajilla', unit: 'unidad', status: 'planned', notes: '' },
      { id: 'dessert-plate', name: 'Plato de postre', category: 'Vajilla', unit: 'unidad', status: 'planned', notes: '' },
      { id: 'water-glass', name: 'Copa de agua', category: 'Vajilla', unit: 'unidad', status: 'planned', notes: '' },
      { id: 'champagne-glass', name: 'Copa de champagne', category: 'Vajilla', unit: 'unidad', status: 'planned', notes: '' },
      { id: 'plastic-glass', name: 'Vaso plástico', category: 'Vajilla', unit: 'unidad', status: 'planned', notes: '' },
      { id: 'cutlery', name: 'Cubiertos de mesa', category: 'Vajilla', unit: 'juego', status: 'planned', notes: '' },
      { id: 'round-linen', name: 'Mantel redondo', category: 'Mantelería', unit: 'unidad', status: 'planned', notes: '' },
      { id: 'box-linen', name: 'Mantel cajón / mesa principal', category: 'Mantelería', unit: 'unidad', status: 'planned', notes: '' },
      { id: 'table-runner', name: 'Camino de mesa', category: 'Mantelería', unit: 'unidad', status: 'planned', notes: '' },
      { id: 'napkin', name: 'Servilleta', category: 'Mantelería', unit: 'unidad', status: 'planned', notes: '' }
    ],
    supplierAssignments: [],
    tasks: [
      { id: 'client-briefing', title: 'Confirmar protocolo y responsables con el cliente', owner: 'Coordinación', priority: 'high', status: 'pending', notes: 'Validar ingresos, música, momentos especiales y contactos de referencia.' },
      { id: 'guest-list', title: 'Cerrar lista de invitados, mesas, menú y restricciones', owner: 'Coordinación', priority: 'high', status: 'pending', notes: 'Compartir formulario con el cliente y revisar el resumen con cocina.' },
      { id: 'setup-check', title: 'Verificar montaje, mantelería, vajilla y equipamiento', owner: 'Logística', priority: 'high', status: 'pending', notes: 'Controlar cantidades, estado y distribución antes del ingreso de invitados.' },
      { id: 'kitchen-briefing', title: 'Coordinar tiempos de servicio con cocina', owner: 'Cocina', priority: 'high', status: 'pending', notes: 'Revisar menú por cantidad y platos con restricción alimentaria.' },
      { id: 'closing-check', title: 'Realizar conteo y devolución al cierre', owner: 'Coordinación', priority: 'normal', status: 'pending', notes: 'Registrar faltantes, roturas, sobrantes y limpieza de sectores.' }
    ],
    alerts: [],
    logistics: {
      eventSetupNotes: 'Hora de llegada y responsable de apertura: [completar]\n\nMontaje del salón\n• Confirmar el layout, cantidad y ubicación de mesas según el plano.\n• Preparar mesa principal, sectores de fotos, pista y mesa dulce si aplica.\n• Verificar sillas, cartelería, iluminación, sonido y circulación de invitados.\n• Hacer una recorrida final con coordinación antes de habilitar el ingreso.',
      kitchenNotes: 'Antes del servicio\n• Confirmar cantidades finales, menús infantiles y restricciones alimentarias.\n• Coordinar con maître el orden y horario de salida de cada servicio.\n\nDurante el evento\n• Preparar recepción, menú principal, postre y mesa dulce según los momentos acordados.\n• Identificar las mesas o invitados con menú especial antes de bandejear.\n• Avisar a coordinación ante demoras, faltantes o cambios de último momento.',
      barNotes: 'Preparación de barra\n• Confirmar bebidas, hielo, cristalería, vasos y horario de apertura.\n• Definir responsable de reposición y retiro de vajilla.\n\nServicio responsable\n• Respetar la indicación del evento para menores: no servir alcohol cuando corresponda.\n• Preparar alternativas sin alcohol, agua y gaseosas para mesas de chicos.',
      decorationNotes: 'Mantelería y vajilla\n• Definir color y combinación de manteles, caminos, servilletas y mesa principal.\n• Confirmar cantidad de manteles por mesa, mesa dulce, fotos y sectores especiales.\n• Revisar platos, cubiertos, copas y vasos; para niños usar vasos plásticos si corresponde.\n\nDisposición de cubiertos\n• Cuchillo a la derecha, con filo hacia adentro.\n• Tenedor a la izquierda.\n• Cuchara orientada hacia el tenedor.\n• Realizar control final de limpieza, manchas y faltantes.',
      accessNotes: 'Recepción e ingreso\n• Definir quién recibe a invitados, proveedores y familia principal.\n• Tener disponible el control de mesas y la lista de invitados.\n• Informar estacionamiento, accesos, baños y sectores reservados.\n• Coordinar con maître y staff el momento de habilitar el ingreso.',
      riskNotes: 'Puntos críticos\n• Confirmar contactos de salón, coordinación, cocina, DJ, fotografía y proveedores.\n• Revisar alergias, restricciones, menores y momentos especiales antes del ingreso.\n• Registrar cambios de último momento y comunicar al responsable de cada área.\n\nCierre\n• Hacer conteo de vajilla, mantelería, stock y elementos prestados.\n• Registrar faltantes, roturas, sobrantes y pendientes de devolución.'
    },
    source: input.source ?? 'manual_event',
    sourceQuoteId: input.sourceQuoteId
  };
}
