export const leadStatusLabels: Record<string,string>={new:'Nuevo',contacted:'Contactado',follow_up:'Seguimiento',quote_sent:'Presupuesto enviado',negotiation:'Negociación',won:'Ganado',lost:'Perdido',converted:'Convertido'};
export const leadSourceLabels: Record<string,string>={web_form:'Formulario web',quick_quote:'Cotización rápida',whatsapp:'WhatsApp',manual:'Manual',promotion:'Promoción',ticket:'Entrada',invitation:'Invitación',other:'Otro'};
export const activityTypeLabels: Record<string,string>={note:'Nota',call:'Llamada',whatsapp:'WhatsApp',email:'Email',status_change:'Cambio de estado',assignment:'Asignación',quote_created:'Presupuesto creado',quote_sent:'Presupuesto enviado',lost:'Perdido',converted:'Convertido',system:'Sistema'};
export const quoteStatusLabels: Record<string,string>={draft:'Borrador',sent:'Enviado',follow_up:'En seguimiento',accepted:'Aceptado',rejected:'Rechazado',expired:'Vencido',converted:'Convertido'};
export const quoteRequestStatusLabels: Record<string,string>={new:'Nueva',in_review:'En revisión',converted:'Presupuestada',discarded:'Descartada',duplicated:'Duplicada'};
export const quoteRequestSourceLabels: Record<string,string>={website:'Web',admin:'Carga manual',whatsapp:'WhatsApp',office:'Oficina',phone:'Teléfono',quick_quote:'Cotización rápida',other:'Otro'};
export const eventStatusLabels: Record<string,string>={draft:'Borrador',quoted:'Pendiente de contrato',contract_draft:'Contrato borrador',deposit_pending:'Seña pendiente',reserved:'Reservado',confirmed:'Confirmado',cancelled:'Cancelado',lost:'Perdido'};
export const contractStatusLabels: Record<string,string>={draft:'Borrador',pending_approval:'Pendiente de aprobación',approved:'Aprobado',requires_changes:'Requiere cambios',cancelled:'Cancelado',superseded:'Reemplazado'};
export const contractAddendumStatusLabels: Record<string,string>={draft:'Borrador',pending_approval:'Pendiente de aprobación',approved:'Aprobada',rejected:'Rechazada',cancelled:'Cancelada'};
export const contractAddendumTypeLabels: Record<string,string>={extra_service:'Servicio extra',beverage:'Bebidas',decoration:'Ambientación',menu_upgrade:'Menú adicional',staff:'Staff',hour_extension:'Hora extra',other:'Otro'};
export const paymentStatusLabels: Record<string,string>={pending:'Pendiente',paid:'Cobrado',cancelled:'Cancelado',refunded:'Reembolsado'};
export const paymentTypeLabels: Record<string,string>={deposit:'Seña',installment:'Cuota',balance:'Saldo',addendum:'Adenda',extra:'Extra',security_deposit:'Depósito garantía',adjustment:'Ajuste',refund:'Reembolso',other:'Otro'};
export const paymentMethodLabels: Record<string,string>={cash:'Efectivo',bank_transfer:'Transferencia',mercado_pago:'Mercado Pago',card:'Tarjeta',other:'Otro'};
export const roleLabels: Record<string,string>={ADMIN:'Administrador',MANAGER:'Manager',SALON_MANAGER:'Encargado salón',STAFF:'Staff'};
export const staffSubroleLabels: Record<string,string>={WAITER:'Mozo',MAITRE:'Maitre',COOK:'Cocinero',KITCHEN_ASSISTANT:'Ayudante de cocina',BARTENDER:'Barman',DJ:'DJ',DECORATION:'Decoración',CLEANING:'Limpieza',SECURITY:'Seguridad',COORDINATOR:'Coordinador',RECEPTION:'Recepción',OTHER:'Otro'};
export const staffEmploymentStatusLabels: Record<string,string>={ACTIVE:'Activo',INACTIVE:'Inactivo',SUSPENDED:'Suspendido',TERMINATED:'Finalizado'};
export const payrollPaymentTypeLabels: Record<string,string>={PER_EVENT:'Por evento',PER_HOUR:'Por hora',MONTHLY:'Mensual',OTHER:'Otro'};
export const eventStaffStatusLabels: Record<string,string>={proposed:'Propuesto',assigned:'Asignado',confirmed:'Confirmado',checked_in:'Fichado',completed:'Completado',cancelled:'Cancelado',no_show:'Ausente'};
export const catalogItemTypeLabels: Record<string,string>={FOOD:'Comida',BEVERAGE:'Bebida',DISPOSABLE:'Descartable',CLEANING:'Limpieza',DECORATION:'Decoración',OTHER:'Otro'};
export const inventoryCategoryLabels: Record<string,string>={FOOD:'Comida',BEVERAGE:'Bebida',TABLEWARE:'Vajilla',LINEN:'Mantelería',FURNITURE:'Mobiliario',DECORATION:'Decoración',EQUIPMENT:'Equipos',CLEANING:'Limpieza',DISPOSABLE:'Descartable',OTHER:'Otro'};
export const beverageTypeLabels: Record<string,string>={NON_ALCOHOLIC:'Sin alcohol',ALCOHOLIC:'Con alcohol'};
export const serviceExtraTypeLabels: Record<string,string>={FIXED_PRICE:'Precio fijo',PER_PERSON:'Por persona',PER_HOUR:'Por hora',PER_UNIT:'Por unidad',CUSTOM:'Personalizado'};
export const supplierCategoryLabels: Record<string,string>={BEVERAGES:'Bebidas',FOOD:'Comida',BAKERY:'Panadería',PASTRY:'Pastelería',MEAT:'Carnes',DECORATION:'Decoración',SOUND_DJ:'Sonido/DJ',PHOTOGRAPHY:'Fotografía',CLEANING:'Limpieza',DISPOSABLES:'Descartables',TABLEWARE:'Vajilla',LINEN:'Mantelería',STAFFING:'Personal',OTHER:'Otro'};
export const inventoryItemTypeLabels: Record<string,string>={CONSUMABLE:'Consumible',NON_CONSUMABLE:'No consumible'};
export const inventoryAdjustmentTypeLabels: Record<string,string>={IN:'Entrada',OUT:'Salida',ADJUSTMENT:'Ajuste',DAMAGE:'Rotura',LOSS:'Pérdida',RETURN:'Devolución'};
export const consumptionRuleTargetLabels: Record<string,string>={TOTAL_GUESTS:'Total invitados',ADULTS:'Adultos',MINORS:'Menores',CHILDREN:'Niños',TEENAGERS:'Adolescentes',ADULTS_WITH_ALCOHOL:'Adultos con alcohol',TABLES:'Mesas',EVENT_DURATION_HOURS:'Horas de evento'};
export const roundingModeLabels: Record<string,string>={NONE:'Sin redondeo',CEIL:'Hacia arriba',FLOOR:'Hacia abajo',ROUND:'Redondear',PACKAGE_SIZE:'Por empaque'};
export const permissionLabels: Record<string,string>={
  'users.read':'Usuarios: ver','users.create':'Usuarios: crear','users.update':'Usuarios: editar','users.delete':'Usuarios: eliminar',
  'salons.read':'Salones: ver','salons.create':'Salones: crear','salons.update':'Salones: editar','salons.delete':'Salones: eliminar',
  'leads.read':'Leads: ver','leads.create':'Leads: crear','leads.update':'Leads: editar','leads.delete':'Leads: eliminar','leads.assign':'Leads: asignar','leads.convert':'Leads: convertir',
  'quotes.read':'Presupuestos: ver','quotes.create':'Presupuestos: crear','quotes.update':'Presupuestos: editar','quotes.approve':'Presupuestos: aprobar','quotes.delete':'Presupuestos: eliminar',
  'customers.read':'Clientes: ver','customers.create':'Clientes: crear','customers.update':'Clientes: editar','customers.delete':'Clientes: eliminar',
  'events.read':'Eventos: ver','events.create':'Eventos: crear','events.update':'Eventos: editar','events.cancel':'Eventos: cancelar','events.delete':'Eventos: eliminar',
  'contracts.read':'Contratos: ver','contracts.create':'Contratos: crear','contracts.update':'Contratos: editar','contracts.approve':'Contratos: aprobar','contracts.cancel':'Contratos: cancelar','contracts.delete':'Contratos: eliminar',
  'payments.read':'Pagos: ver','payments.create':'Pagos: crear','payments.update':'Pagos: editar','payments.approve':'Pagos: aprobar','payments.reject':'Pagos: rechazar','payments.cancel':'Pagos: cancelar',
  'suppliers.read':'Proveedores: ver','suppliers.create':'Proveedores: crear','suppliers.update':'Proveedores: editar','suppliers.delete':'Proveedores: eliminar',
  'landing.read':'Landing: ver','landing.update':'Landing: editar',
  'reports.read':'Reportes: ver','reports.export':'Reportes: exportar',
  'reports.commercial.read':'Reportes comerciales: ver','reports.events.read':'Reportes de eventos: ver','reports.contracts.read':'Reportes de contratos: ver','reports.payments.read':'Reportes de pagos: ver','reports.production.read':'Reportes de producción: ver','reports.expenses.read':'Reportes de gastos: ver','reports.profitability.read':'Rentabilidad: ver','reports.analytics.read':'Reportes de analítica: ver',
  'dashboard.view':'Dashboard: ver','dashboard.view_financial':'Dashboard: ver finanzas','dashboard.view_all_salons':'Dashboard: ver todos los salones',
  'production.view':'Producción: ver','production.create':'Producción: crear','production.update':'Producción: editar','production.complete':'Producción: completar','production.reopen':'Producción: reabrir','production.generate':'Producción: generar','production.export':'Producción: exportar','production.rules.manage':'Producción: administrar reglas',
  'expenses.view':'Gastos: ver','expenses.create':'Gastos: crear','expenses.update':'Gastos: editar','expenses.delete':'Gastos: eliminar','expenses.categories.manage':'Gastos: administrar categorías',
  'analytics.view':'Analítica: ver','analytics.heatmap.view':'Heatmaps: ver','analytics.settings.manage':'Analítica: configurar','analytics.export':'Analítica: exportar',
  'imports.create':'Importaciones: crear','imports.execute':'Importaciones: ejecutar','imports.view':'Importaciones: ver',
  'settings.read':'Configuración: ver','settings.update':'Configuración: editar'
};
export {
  MarketingCampaignStatusLabels as marketingCampaignStatusLabels,
  MarketingRecipientStatusLabels as marketingRecipientStatusLabels,
  PromotionDiscountTypeLabels as promotionDiscountTypeLabels,
  MarketingTemplateCategoryLabels as marketingTemplateCategoryLabels,
  MarketingUnsubscribeReasonLabels as marketingUnsubscribeReasonLabels
} from '@mym/shared';
export const displayLabel=(labels:Record<string,string>,value:string)=>labels[value]??'Sin especificar';
