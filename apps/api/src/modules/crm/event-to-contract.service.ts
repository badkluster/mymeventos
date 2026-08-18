import mongoose from 'mongoose';
import { Contract, ContractAddendum, Event } from './crm.models';
import { ApiError } from '../../middlewares/errorHandler';
import { recalculateContractTotals } from './contract-financials.service';

export { recalculateContractTotals };

const missingMessage = 'El evento todavía no tiene todos los datos necesarios para generar contrato.';

const baseLegalTerms = [
  { key: 'service', title: 'Objeto y prestación del servicio', text: 'La prestadora se obliga a brindar el servicio de organización y realización del evento detallado en este contrato, en la fecha, salón, horario y modalidad indicados, conforme a las condiciones comerciales, operativas y de menú incorporadas como anexos a este documento.' },
  { key: 'validity', title: 'Vigencia', text: 'El presente contrato entra en vigencia desde su aprobación por ambas partes y se mantiene vigente hasta la finalización del evento y la cancelación total de las obligaciones económicas pendientes, incluido el fondo de garantía.' },
  { key: 'provider_obligations', title: 'Obligaciones de la prestadora', text: 'La prestadora se compromete a disponer el salón, la ambientación, el menú, las bebidas y el personal operativo necesarios según la modalidad contratada, en condiciones adecuadas de higiene, seguridad y funcionamiento.' },
  { key: 'customer_obligations', title: 'Obligaciones del cliente', text: 'El cliente deberá informar datos completos y veraces, confirmar en tiempo y forma la información solicitada (invitados, menú, horarios), cumplir los horarios pactados, respetar las normas de uso del salón y responder por los daños que ocasionen sus invitados o terceros vinculados al evento.' },
  { key: 'price_payment', title: 'Precio y forma de pago', text: 'El precio total, la seña, el saldo y el plan de cuotas de pago se rigen por el resumen comercial y el acuerdo de pago incorporados a este contrato.' },
  { key: 'late_fee', title: 'Mora e intereses', text: 'Los pagos deberán realizarse dentro de la ventana de fechas indicada para cada cuota en el plan de pagos. Salvo que se pacte otra condición por escrito, los importes abonados fuera de esa ventana devengarán un interés diario del 1% sobre el saldo adeudado.' },
  { key: 'cancellation', title: 'Rescisión o cancelación por parte del cliente', text: 'Si el cliente rescinde el contrato antes de la fecha del evento, se aplicarán las condiciones comerciales informadas. Como condición general, salvo acuerdo particular por escrito, se descontará el 70% de lo efectivamente abonado en concepto de gastos administrativos, pudiendo reconocerse el remanente mediante un servicio de lunch sin personal a coordinar con la prestadora.' },
  { key: 'guest_closing', title: 'Cierre de invitados, menú y saldos', text: 'La lista final de invitados, las restricciones alimentarias, el menú definitivo, el croquis de mesas y el saldo total del servicio deberán quedar cerrados y abonados hasta 15 días corridos antes de la fecha del evento, salvo un plazo distinto asentado por escrito.' },
  { key: 'outside_food', title: 'Alimentos y bebidas no incluidos en el servicio contratado', text: 'El servicio de catering, bebidas y menú es prestado exclusivamente por la prestadora o por el proveedor gastronómico habilitado por el salón. El ingreso de alimentos o bebidas ajenos al menú contratado queda sujeto a la autorización previa y por escrito de la prestadora; en tal caso, su manipulación, conservación y consumo son de exclusiva responsabilidad de quien los introduce, y la prestadora no será responsable por intoxicaciones, alergias u otras afecciones derivadas de alimentos o bebidas que no formen parte del servicio contratado.' },
  { key: 'external_vendors', title: 'Proveedores externos', text: 'Todo proveedor externo contratado directamente por el cliente (fotografía, música, cotillón, decoración, entre otros) deberá ser informado a la prestadora con antelación suficiente y ajustarse a las normas de ingreso, horarios y seguridad del salón. La prestadora no asume responsabilidad por la calidad, el cumplimiento ni los daños que ocasionen proveedores no contratados directamente por ella.' },
  { key: 'liability_insurance', title: 'Responsabilidad y seguros', text: 'La prestadora cuenta con la cobertura de responsabilidad civil correspondiente a las instalaciones del salón conforme a la normativa vigente. No será responsable por accidentes, lesiones o daños derivados del uso indebido de las instalaciones, de la conducta de los invitados, del consumo de alcohol o de hechos de terceros ajenos a su personal, sin perjuicio de las acciones que el cliente pueda ejercer contra los responsables directos.' },
  { key: 'alcohol_minors', title: 'Consumo de alcohol y menores de edad', text: 'El servicio de bebidas alcohólicas se realiza de forma responsable, pudiendo el personal del salón restringir su entrega a personas menores de edad o a quienes evidencien un estado de intoxicación. El cliente es responsable de la supervisión de los menores que asistan al evento.' },
  { key: 'damage_deposit', title: 'Fondo de garantía', text: 'El fondo de garantía cubre eventuales daños en vajilla, mantelería, mobiliario e instalaciones del salón. Al finalizar el evento se informarán los daños detectados con el respaldo correspondiente y se descontará el costo de su reposición; el remanente será reintegrado al cliente y, si el daño superara el monto del fondo, el cliente deberá abonar la diferencia.' },
  { key: 'force_majeure', title: 'Fuerza mayor', text: 'Ninguna de las partes será responsable por el incumplimiento de sus obligaciones cuando este obedezca a causas de fuerza mayor o caso fortuito (desastres naturales, disposiciones de la autoridad competente, emergencias sanitarias, cortes de suministro u otras circunstancias ajenas a su control) que impidan la realización del evento en la fecha pactada. En tales casos, las partes acordarán de buena fe una nueva fecha para el evento; si la reprogramación no fuera posible, se definirá de común acuerdo la restitución de los importes abonados, descontando los gastos ya devengados.' },
  { key: 'image_rights', title: 'Uso de imágenes y contenido audiovisual', text: 'La prestadora podrá registrar fotografías y videos del evento con fines institucionales, de portfolio o de difusión en sus canales de comunicación, sin que ello implique la divulgación de datos personales de los invitados más allá de su imagen. El cliente podrá oponerse a este uso comunicándolo por escrito con anterioridad a la fecha del evento.' },
  { key: 'data_protection', title: 'Protección de datos personales', text: 'Los datos personales proporcionados por el cliente serán utilizados exclusivamente para la gestión y prestación del servicio contratado, conforme a la Ley de Protección de Datos Personales (Ley 25.326), y no serán cedidos a terceros salvo que resulte necesario para la ejecución del presente contrato.' },
  { key: 'jurisdiction', title: 'Ley aplicable y jurisdicción', text: 'Este contrato se rige por las leyes de la República Argentina. Ante cualquier controversia derivada de su interpretación o ejecución, las partes se someten a la competencia de los tribunales ordinarios correspondientes al domicilio de la prestadora, con renuncia expresa a cualquier otro fuero o jurisdicción.' },
  { key: 'observations', title: 'Observaciones y anexos', text: 'Toda observación particular, acuerdo especial o excepción a las condiciones generales deberá quedar asentada en este contrato o en anexos firmados por ambas partes, los cuales prevalecerán sobre las cláusulas generales en caso de contradicción.' }
];

function id(value: any): string | undefined {
  return value?._id?.toString?.() ?? value?.toString?.();
}

function name(value: any): string {
  return value?.fullName || [value?.firstName, value?.lastName].filter(Boolean).join(' ') || value?.name || '';
}

function hasList(value: unknown): boolean {
  return Array.isArray(value) && value.length > 0;
}

function validateEvent(event: any): void {
  const commercial = event?.commercialSnapshot ?? {};
  const amount = event?.finalAmount ?? event?.estimatedAmount ?? commercial.totalAmount;
  const hasCommercialDescription = Boolean(commercial.packageName || event?.eventType || hasList(event?.servicesSnapshot));
  const hasMenuOrDescription = hasList(event?.menuSnapshot) || Boolean(commercial.packageName || event?.notes);
  const hasTime = Boolean(event?.startTime && event?.endTime) || Boolean(commercial.durationHours);
  if (!event?.customerId || !event?.salonId || !event?.eventDate || !hasTime || !event?.guestCount || !amount || !hasCommercialDescription || !hasMenuOrDescription) {
    throw new ApiError(422, 'CONTRACT_EVENT_INCOMPLETE', missingMessage);
  }
}

async function nextContractNumber(): Promise<string> {
  const year = new Date().getFullYear();
  const count = await Contract.countDocuments({ contractNumber: { $regex: `^C-${year}-` } });
  return `C-${year}-${String(count + 1).padStart(5, '0')}`;
}

export async function createContractFromEvent(input: { eventId: string; userId: string }): Promise<{ contract: any; created: boolean }> {
  const event: any = await Event.findOne({ _id: input.eventId, deletedAt: null })
    .populate('customerId')
    .populate('salonId', 'name address locality city province defaultContractTerms defaultPaymentTerms defaultSecurityDepositAmount defaultLateFeePercentage')
    .populate('quoteId')
    .populate('sourceQuoteId')
    .populate('leadId')
    .populate('sourceLeadId');
  if (!event) throw new ApiError(404, 'EVENT_NOT_FOUND');

  const existing = await Contract.findOne({ eventId: event._id, deletedAt: null }).lean();
  if (existing) return { contract: existing, created: false };

  validateEvent(event);

  const customer = event.customerId;
  const salon = event.salonId;
  const quote = event.quoteId || event.sourceQuoteId;
  const commercial = event.commercialSnapshot ?? {};
  const totalAmount = event.finalAmount ?? event.estimatedAmount ?? commercial.totalAmount ?? quote?.totalAmount ?? 0;
  const depositAmount = commercial.depositAmount ?? quote?.depositAmount ?? 0;
  const paidAmount = 0;
  const balanceAmount = Math.max(0, totalAmount - paidAmount);

  const contract = await Contract.create({
    contractNumber: await nextContractNumber(),
    eventId: event._id,
    quoteId: quote?._id,
    customerId: customer?._id,
    leadId: event.leadId?._id ?? event.sourceLeadId?._id,
    salonId: salon?._id,
    status: 'pending_approval',
    versionNumber: 1,
    contractMode: event.quoteMode ?? quote?.quoteMode ?? 'PACKAGE',
    lineItemsSnapshot: event.lineItemsSnapshot ?? quote?.lineItems ?? [],
    customerSnapshot: {
      firstName: customer?.firstName,
      lastName: customer?.lastName,
      fullName: name(customer),
      dni: customer?.dni,
      documentNumber: customer?.documentNumber,
      address: customer?.address,
      occupation: customer?.occupation,
      phone: customer?.phone,
      email: customer?.email
    },
    eventSnapshot: {
      eventType: event.eventType,
      eventName: event.eventName,
      eventDate: event.eventDate,
      startTime: event.startTime ?? commercial.startTime,
      endTime: event.endTime ?? commercial.endTime,
      durationHours: commercial.durationHours ?? quote?.durationHours,
      guestCount: event.guestCount,
      honoreeName: event.honoreeName,
      vegetarianCount: event.vegetarianCount,
      veganCount: event.veganCount,
      celiacCount: event.celiacCount,
      lactoseIntolerantCount: event.lactoseIntolerantCount,
      tableLinenColor: event.tableLinenColor,
      guestBreakdown: event.guestBreakdown,
      adultsCount: event.adultsCount,
      childrenCount: event.childrenCount,
      teenagersCount: event.teenagersCount,
      salonName: salon?.name,
      salonAddress: [salon?.address, salon?.locality || salon?.city, salon?.province].filter(Boolean).join(', '),
      resourcePlanSnapshot: event.resourcePlanSnapshot
    },
    commercialSnapshot: {
      packageName: commercial.packageName ?? quote?.packageName ?? 'Personalizado',
      pricingMode: commercial.pricingMode ?? quote?.pricingMode ?? 'per_person',
      pricePerPerson: commercial.pricePerPerson ?? quote?.pricePerPerson,
      discountPercentage: commercial.discountPercentage ?? quote?.discountPercentage ?? 0,
      finalPricePerPerson: commercial.finalPricePerPerson ?? quote?.finalPricePerPerson,
      fixedPrice: commercial.fixedPrice ?? quote?.fixedPrice,
      finalFixedPrice: commercial.finalFixedPrice ?? quote?.finalFixedPrice,
      totalAmount,
      depositAmount,
      balanceAmount,
      promotionText: commercial.promotionText ?? quote?.promotionText,
      giftText: commercial.giftText ?? quote?.giftText
    },
    menuSnapshot: event.menuSnapshot ?? quote?.menuSections ?? [],
    servicesSnapshot: event.servicesSnapshot ?? quote?.includedServices ?? [],
    paymentPlanSnapshot: event.paymentPlanSnapshot ?? event.paymentSnapshot?.paymentPlan ?? [],
    paymentAgreementSnapshot: {
      paymentTerms: commercial.paymentTerms ?? event.paymentSnapshot?.paymentTerms ?? quote?.paymentTerms ?? salon?.defaultPaymentTerms,
      depositAmount,
      balanceAmount,
      lateFeePercentage: salon?.defaultLateFeePercentage,
      lateFeeText: salon?.defaultLateFeePercentage ? `Mora sugerida: ${salon.defaultLateFeePercentage}%` : undefined
    },
    legalTermsSnapshot: { clauses: baseLegalTerms, providerText: salon?.defaultContractTerms },
    securityDeposit: {
      amount: salon?.defaultSecurityDepositAmount ?? 0,
      requiredAt: event.eventDate,
      status: 'pending'
    },
    securityDepositSnapshot: {
      amount: salon?.defaultSecurityDepositAmount ?? 0,
      requiredAt: event.eventDate,
      status: 'pending'
    },
    baseAmount: totalAmount,
    approvedAddendumsAmount: 0,
    pendingAddendumsAmount: 0,
    discountsAmount: 0,
    totalAmount,
    paidAmount,
    balanceAmount,
    observations: event.notes,
    createdBy: input.userId,
    updatedBy: input.userId
  });

  event.status = 'contract_draft';
  event.updatedBy = input.userId;
  await event.save();

  return { contract, created: true };
}

function validateContractForApproval(contract: any): void {
  if (!contract?.customerSnapshot?.fullName || !contract?.eventSnapshot?.eventDate || !contract?.eventSnapshot?.guestCount || Number(contract?.totalAmount || 0) <= 0) {
    throw new ApiError(422, 'CONTRACT_NOT_APPROVABLE');
  }
}

export async function approveContract(contractId: string, userId: string): Promise<any> {
  // The financial snapshot is refreshed before the state transition. The approval itself and
  // its corresponding commercial Event transition happen in one transaction below.
  await recalculateContractTotals(contractId);
  const session = await mongoose.startSession();
  let approvedContract: any;

  try {
    await session.withTransaction(async () => {
      const contract: any = await Contract.findOne({ _id: contractId, deletedAt: null }).session(session);
      if (!contract) throw new ApiError(404, 'CONTRACT_NOT_FOUND');
      validateContractForApproval(contract);

      const event: any = contract.eventId
        ? await Event.findOne({ _id: contract.eventId, deletedAt: null }).session(session)
        : null;
      if (!event) throw new ApiError(422, 'CONTRACT_EVENT_INCONSISTENT', 'El contrato no tiene un evento activo asociado.');

      // Replaying an approval is intentionally safe. It also repairs a legacy inconsistency
      // left by the previous implementation without moving events backwards from later states.
      if (contract.status !== 'approved') {
        if (contract.status !== 'pending_approval') throw new ApiError(422, 'CONTRACT_NOT_APPROVABLE');
        contract.status = 'approved';
        contract.approvedAt = new Date();
        contract.approvedByUserId = userId;
        contract.updatedBy = userId;
        await contract.save({ session });

        if (contract.supersedesContractId) {
          const previous: any = await Contract.findOne({ _id: contract.supersedesContractId, deletedAt: null }).session(session);
          if (!previous) throw new ApiError(422, 'CONTRACT_EVENT_INCONSISTENT', 'No se encontró la versión contractual anterior.');
          if (previous.eventId?.toString() !== contract.eventId?.toString()) throw new ApiError(422, 'CONTRACT_EVENT_INCONSISTENT', 'Las versiones contractuales pertenecen a eventos distintos.');
          previous.status = 'superseded';
          previous.supersededByContractId = contract._id;
          previous.updatedBy = userId;
          await previous.save({ session });
        }
      }

      if (event.status === 'contract_draft') {
        event.status = 'deposit_pending';
        event.updatedBy = userId;
        await event.save({ session });
      }
      approvedContract = contract;
    });
  } finally {
    await session.endSession();
  }

  return approvedContract;
}

export async function requestContractChanges(contractId: string, userId: string): Promise<any> {
  const contract: any = await Contract.findOne({ _id: contractId, deletedAt: null });
  if (!contract) throw new ApiError(404, 'CONTRACT_NOT_FOUND');
  contract.status = 'requires_changes';
  contract.updatedBy = userId;
  await contract.save();
  return contract;
}

export async function cancelContract(contractId: string, userId: string, reason: string): Promise<any> {
  if (!reason || !reason.trim()) throw new ApiError(422, 'CONTRACT_CANCELLATION_REASON_REQUIRED');
  const contract: any = await Contract.findOne({ _id: contractId, deletedAt: null });
  if (!contract) throw new ApiError(404, 'CONTRACT_NOT_FOUND');
  contract.status = 'cancelled';
  contract.cancellationReason = reason;
  contract.cancelledAt = contract.cancelledAt ?? new Date();
  contract.updatedBy = userId;
  await contract.save();
  return contract;
}

async function nextAddendumNumber(contractNumber: string): Promise<string> {
  const count = await ContractAddendum.countDocuments({ addendumNumber: { $regex: `^${contractNumber}-A` } });
  return `${contractNumber}-A${String(count + 1).padStart(2, '0')}`;
}

function normalizeItems(items: any[]): any[] {
  return (items ?? []).map((item) => {
    const quantity = Number(item.quantity || 1);
    const unitPrice = Number(item.unitPrice || 0);
    return { ...item, quantity, unitPrice, totalPrice: Number(item.totalPrice ?? quantity * unitPrice) };
  });
}

function amounts(items: any[], discountAmount = 0): { subtotalAmount: number; discountAmount: number; totalAmount: number } {
  const subtotalAmount = items.reduce((sum, item) => sum + Number(item.totalPrice || 0), 0);
  return { subtotalAmount, discountAmount: Number(discountAmount || 0), totalAmount: Math.max(0, subtotalAmount - Number(discountAmount || 0)) };
}

export async function createAddendum(contractId: string, payload: any, userId: string): Promise<any> {
  const contract: any = await Contract.findOne({ _id: contractId, deletedAt: null });
  if (!contract) throw new ApiError(404, 'CONTRACT_NOT_FOUND');
  if (contract.status === 'cancelled') throw new ApiError(422, 'CONTRACT_CANCELLED');
  const items = normalizeItems(payload.items ?? []);
  const totals = amounts(items, payload.discountAmount);
  const addendum = await ContractAddendum.create({
    addendumNumber: await nextAddendumNumber(contract.contractNumber),
    contractId: contract._id,
    eventId: contract.eventId,
    customerId: contract.customerId,
    salonId: contract.salonId,
    status: payload.status ?? 'pending_approval',
    title: payload.title,
    description: payload.description,
    items,
    ...totals,
    affectsBalance: false,
    createdBy: userId,
    updatedBy: userId
  });
  await recalculateContractTotals(contractId);
  return addendum;
}

export async function updateAddendum(addendumId: string, payload: any, userId: string): Promise<any> {
  const addendum: any = await ContractAddendum.findOne({ _id: addendumId, deletedAt: null });
  if (!addendum) throw new ApiError(404, 'CONTRACT_ADDENDUM_NOT_FOUND');
  if (addendum.status === 'approved') throw new ApiError(422, 'CONTRACT_ADDENDUM_APPROVED_LOCKED');
  const items = payload.items ? normalizeItems(payload.items) : addendum.items;
  Object.assign(addendum, payload, amounts(items, payload.discountAmount ?? addendum.discountAmount), { items, updatedBy: userId });
  await addendum.save();
  await recalculateContractTotals(addendum.contractId.toString());
  return addendum;
}

export async function approveAddendum(addendumId: string, userId: string): Promise<any> {
  const addendum: any = await ContractAddendum.findOne({ _id: addendumId, deletedAt: null });
  if (!addendum) throw new ApiError(404, 'CONTRACT_ADDENDUM_NOT_FOUND');
  const contract: any = await Contract.findOne({ _id: addendum.contractId, deletedAt: null });
  if (!contract) throw new ApiError(404, 'CONTRACT_NOT_FOUND');
  if (contract.status === 'cancelled') throw new ApiError(422, 'CONTRACT_CANCELLED');
  if (!addendum.items?.length || Number(addendum.totalAmount || 0) <= 0) throw new ApiError(422, 'CONTRACT_ADDENDUM_NOT_APPROVABLE');
  addendum.status = 'approved';
  addendum.affectsBalance = true;
  addendum.approvedAt = addendum.approvedAt ?? new Date();
  addendum.approvedByUserId = userId;
  addendum.updatedBy = userId;
  await addendum.save();
  await recalculateContractTotals(addendum.contractId.toString());
  return addendum;
}
