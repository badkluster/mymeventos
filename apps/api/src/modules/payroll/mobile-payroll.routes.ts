import { Router } from 'express';
import { z } from 'zod';
import { ObjectIdSchema, Permission } from '@mym/shared';
import { requireAuth, requirePermission } from '../../middlewares/auth';
import { validateRequest } from '../../middlewares/validateRequest';
import { asyncHandler } from '../../utils/asyncHandler';
import { sendSuccess } from '../../utils/api';
import * as payrollService from './payroll.service';

const router = Router();

router.use(requireAuth, requirePermission(Permission.PAYROLL_SELF_READ));

router.get('/summary', validateRequest(z.object({ body: z.unknown().optional(), params: z.object({}), query: z.object({ from: z.coerce.date().optional(), to: z.coerce.date().optional() }) })), asyncHandler(async (request, response) => {
  const items = await payrollService.mobilePayrollSettlements(request.user!.id, request.query);
  return sendSuccess(response, {
    items,
    totalNetAmountMinor: items.reduce((sum: number, settlement: any) => sum + Number(settlement.netAmountMinor ?? 0), 0),
    pendingPayment: items.filter((settlement: any) => settlement.paymentStatus !== 'paid').length
  });
}));

router.get('/settlements', validateRequest(z.object({ body: z.unknown().optional(), params: z.object({}), query: z.object({ from: z.coerce.date().optional(), to: z.coerce.date().optional() }) })), asyncHandler(async (request, response) => {
  return sendSuccess(response, { items: await payrollService.mobilePayrollSettlements(request.user!.id, request.query) });
}));

router.get('/settlements/:id', validateRequest(z.object({ body: z.unknown().optional(), params: z.object({ id: ObjectIdSchema }), query: z.object({}) })), asyncHandler(async (request, response) => {
  return sendSuccess(response, { settlement: await payrollService.mobilePayrollSettlement(request.user!.id, request.params.id) });
}));

router.get('/settlements/:id/receipt', validateRequest(z.object({ body: z.unknown().optional(), params: z.object({ id: ObjectIdSchema }), query: z.object({}) })), asyncHandler(async (request, response) => {
  const settlement: any = await payrollService.mobilePayrollSettlement(request.user!.id, request.params.id);
  return sendSuccess(response, { receipt: settlement.receipt ?? null });
}));

export default router;
