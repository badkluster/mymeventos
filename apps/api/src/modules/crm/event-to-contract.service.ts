import { Contract, ContractAddendum, Event } from './crm.models';
import { ApiError } from '../../middlewares/errorHandler';

const missingMessage = 'El evento todavía no tiene todos los datos necesarios para generar contrato.';

const baseLegalTerms = [
  { key: 'service', title: 'Prestación del servicio', text: 'La prestadora brindará el servicio contratado para el evento indicado, respetando las condiciones comerciales y operativas detalladas en este contrato.' },
  { key: 'validity', title: 'Vigencia', text: 'El presente contrato entra en vigencia desde su aceptación por las partes y se mantiene vigente hasta la finalización del evento y cancelación de obligaciones pendientes.' },
  { key: 'provider_obligations', title: 'Obligaciones de la prestadora', text: 'La prestadora se compromete a disponer el salón, servicios incluidos y personal operativo necesario según la modalidad contratada.' },
  { key: 'customer_obligations', title: 'Obligaciones del usuario', text: 'El usuario deberá informar datos completos, cumplir horarios, respetar normas del salón y responder por daños ocasionados por invitados o terceros vinculados al evento.' },
  { key: 'price_payment', title: 'Precio y forma de pago', text: 'El precio, seña, saldo y condiciones de pago se rigen por el resumen comercial y el acuerdo de pago incorporados a este contrato.' },
  { key: 'late_fee', title: 'Mora e intereses', text: 'La falta de pago en término podrá generar mora e intereses conforme las condiciones pactadas y comunicadas por la prestadora.' },
  { key: 'cancellation', title: 'Rescisión o cancelación', text: 'La cancelación, reprogramación o rescisión deberá informarse por escrito y quedará sujeta a las condiciones comerciales acordadas entre las partes.' },
  { key: 'guest_closing', title: 'Cierre de invitados, croquis y saldos', text: 'La cantidad final de invitados, croquis, menú definitivo y saldos pendientes deberán cerrarse dentro de los plazos operativos indicados por la prestadora.' },
  { key: 'damage_deposit', title: 'Depósito por roturas', text: 'El depósito por roturas será retenido, devuelto o compensado según el estado de las instalaciones y bienes al finalizar el evento.' },
  { key: 'observations', title: 'Observaciones', text: 'Toda observación particular deberá quedar asentada en este contrato o en anexos aceptados por ambas partes.' }
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
    .populate('salonId', 'name address locality city province defaultContractTerms defaultPaymentTerms minimumDepositAmount defaultDepositAmount defaultLateFeePercentage')
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
    customerSnapshot: {
      firstName: customer?.firstName,
      lastName: customer?.lastName,
      fullName: name(customer),
      dni: customer?.dni,
      documentNumber: customer?.documentNumber,
      address: customer?.address,
      phone: customer?.phone,
      email: customer?.email
    },
    eventSnapshot: {
      eventType: event.eventType,
      honoreeName: event.honoreeName,
      eventName: event.eventName,
      eventDate: event.eventDate,
      startTime: event.startTime ?? commercial.startTime,
      endTime: event.endTime ?? commercial.endTime,
      durationHours: commercial.durationHours ?? quote?.durationHours,
      guestCount: event.guestCount,
      adultsCount: event.adultsCount,
      childrenCount: event.childrenCount,
      teenagersCount: event.teenagersCount,
      salonName: salon?.name,
      salonAddress: [salon?.address, salon?.locality || salon?.city, salon?.province].filter(Boolean).join(', ')
    },
    commercialSnapshot: {
      packageName: commercial.packageName ?? quote?.packageName ?? 'Personalizado',
      pricePerPerson: commercial.pricePerPerson ?? quote?.pricePerPerson,
      discountPercentage: commercial.discountPercentage ?? quote?.discountPercentage ?? 0,
      finalPricePerPerson: commercial.finalPricePerPerson ?? quote?.finalPricePerPerson,
      totalAmount,
      depositAmount,
      balanceAmount,
      promotionText: commercial.promotionText ?? quote?.promotionText,
      giftText: commercial.giftText ?? quote?.giftText
    },
    menuSnapshot: event.menuSnapshot ?? quote?.menuSections ?? [],
    servicesSnapshot: event.servicesSnapshot ?? quote?.includedServices ?? [],
    paymentAgreementSnapshot: {
      paymentTerms: commercial.paymentTerms ?? event.paymentSnapshot?.paymentTerms ?? quote?.paymentTerms ?? salon?.defaultPaymentTerms,
      depositAmount,
      balanceAmount,
      lateFeePercentage: salon?.defaultLateFeePercentage,
      lateFeeText: salon?.defaultLateFeePercentage ? `Mora sugerida: ${salon.defaultLateFeePercentage}%` : undefined
    },
    legalTermsSnapshot: { clauses: baseLegalTerms, providerText: salon?.defaultContractTerms },
    securityDeposit: {
      amount: salon?.minimumDepositAmount ?? salon?.defaultDepositAmount ?? 0,
      requiredAt: event.eventDate,
      status: 'pending'
    },
    securityDepositSnapshot: {
      amount: salon?.minimumDepositAmount ?? salon?.defaultDepositAmount ?? 0,
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

export async function recalculateContractTotals(contractId: string): Promise<any> {
  const contract: any = await Contract.findOne({ _id: contractId, deletedAt: null });
  if (!contract) throw new ApiError(404, 'CONTRACT_NOT_FOUND');
  const addendums = await ContractAddendum.find({ contractId, deletedAt: null });
  const approvedAddendumsAmount = addendums.filter((item: any) => item.status === 'approved').reduce((sum: number, item: any) => sum + Number(item.totalAmount || 0), 0);
  const pendingAddendumsAmount = addendums.filter((item: any) => ['draft', 'pending_approval'].includes(item.status)).reduce((sum: number, item: any) => sum + Number(item.totalAmount || 0), 0);
  contract.approvedAddendumsAmount = approvedAddendumsAmount;
  contract.pendingAddendumsAmount = pendingAddendumsAmount;
  contract.totalAmount = Number(contract.baseAmount || 0) + approvedAddendumsAmount - Number(contract.discountsAmount || 0);
  contract.balanceAmount = contract.totalAmount - Number(contract.paidAmount || 0);
  await contract.save();
  return contract;
}

function validateContractForApproval(contract: any): void {
  if (!contract?.customerSnapshot?.fullName || !contract?.eventSnapshot?.eventDate || !contract?.eventSnapshot?.guestCount || Number(contract?.totalAmount || 0) <= 0) {
    throw new ApiError(422, 'CONTRACT_NOT_APPROVABLE');
  }
}

export async function approveContract(contractId: string, userId: string): Promise<any> {
  const contract: any = await recalculateContractTotals(contractId);
  validateContractForApproval(contract);
  contract.status = 'approved';
  contract.approvedAt = contract.approvedAt ?? new Date();
  contract.approvedByUserId = userId;
  contract.updatedBy = userId;
  await contract.save();
  return contract;
}

export async function requestContractChanges(contractId: string, userId: string): Promise<any> {
  const contract: any = await Contract.findOne({ _id: contractId, deletedAt: null });
  if (!contract) throw new ApiError(404, 'CONTRACT_NOT_FOUND');
  contract.status = 'requires_changes';
  contract.updatedBy = userId;
  await contract.save();
  return contract;
}

export async function cancelContract(contractId: string, userId: string): Promise<any> {
  const contract: any = await Contract.findOne({ _id: contractId, deletedAt: null });
  if (!contract) throw new ApiError(404, 'CONTRACT_NOT_FOUND');
  contract.status = 'cancelled';
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
