import type { ErrorRequestHandler, RequestHandler } from 'express';
import { ZodError, ZodIssueCode, type ZodIssue } from 'zod';
import { sendError } from '../utils/api';
import { getApiMessage } from '../utils/messages';
import { isDatabaseUnavailableError } from '../db/connection';

const validationFieldLabels: Record<string, string> = {
  username: 'Usuario',
  password: 'Contraseña',
  firstName: 'Nombre',
  lastName: 'Apellido',
  fullName: 'Nombre y apellido',
  contactName: 'Nombre y apellido',
  phone: 'Teléfono',
  email: 'Email',
  documentNumber: 'DNI / documento',
  customer: 'Cliente',
  customerId: 'Cliente',
  salonId: 'Salón',
  salonIds: 'Salones',
  eventName: 'Nombre del evento',
  eventType: 'Tipo de evento',
  eventDate: 'Fecha del evento',
  startTime: 'Horario de inicio',
  endTime: 'Horario de fin',
  guestCount: 'Cantidad de invitados',
  packageTemplateId: 'Paquete',
  packageName: 'Paquete / propuesta',
  pricingMode: 'Modalidad de precio',
  pricePerPerson: 'Precio por persona',
  finalPricePerPerson: 'Precio final por persona',
  fixedPrice: 'Precio total',
  finalFixedPrice: 'Precio final',
  finalAmount: 'Importe final',
  estimatedAmount: 'Importe estimado',
  depositAmount: 'Seña',
};

function validationFieldLabel(issue: ZodIssue): string | undefined {
  const field = [...issue.path].reverse().find((part) => typeof part === 'string' && !['body', 'params', 'query'].includes(part));
  if (typeof field !== 'string') return undefined;
  if (validationFieldLabels[field]) return validationFieldLabels[field];
  const readable = field.replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/[_-]+/g, ' ').trim();
  return readable ? readable.charAt(0).toUpperCase() + readable.slice(1) : undefined;
}

function isDefaultZodMessage(message: string): boolean {
  return /^(Required|Expected |Invalid|String must|Number must|Array must|Date must|Must be|Unrecognized key|Input not instance)/i.test(message);
}

function translatedValidationReason(issue: ZodIssue): string {
  switch (issue.code) {
    case ZodIssueCode.invalid_type:
      return issue.received === 'undefined' ? 'es obligatorio.' : 'tiene un tipo de dato inválido.';
    case ZodIssueCode.too_small:
      if (issue.type === 'string') return `debe tener al menos ${issue.minimum} caracteres.`;
      if (issue.type === 'array') return `debe incluir al menos ${issue.minimum} elementos.`;
      if (issue.type === 'number') return `debe respetar el valor mínimo ${issue.minimum}.`;
      return 'no alcanza el mínimo requerido.';
    case ZodIssueCode.too_big:
      if (issue.type === 'string') return `debe tener como máximo ${issue.maximum} caracteres.`;
      if (issue.type === 'array') return `debe incluir como máximo ${issue.maximum} elementos.`;
      if (issue.type === 'number') return `debe respetar el valor máximo ${issue.maximum}.`;
      return 'supera el máximo permitido.';
    case ZodIssueCode.invalid_string:
      if (issue.validation === 'email') return 'debe tener un formato de email válido.';
      if (issue.validation === 'url') return 'debe tener una URL válida.';
      if (issue.validation === 'datetime') return 'debe tener una fecha y hora válidas.';
      return 'tiene un formato inválido.';
    case ZodIssueCode.invalid_enum_value:
      return 'debe ser una opción válida.';
    case ZodIssueCode.invalid_literal:
      return 'contiene un valor no permitido.';
    case ZodIssueCode.invalid_date:
      return 'debe contener una fecha válida.';
    case ZodIssueCode.unrecognized_keys:
      return 'contiene campos no permitidos.';
    case ZodIssueCode.not_multiple_of:
      return `debe ser múltiplo de ${issue.multipleOf}.`;
    case ZodIssueCode.not_finite:
      return 'debe contener un número finito.';
    default:
      return 'contiene un valor inválido.';
  }
}

function validationIssueMessage(issue: ZodIssue): string {
  const message = issue.message.trim();
  if (message && !isDefaultZodMessage(message)) return message;
  const reason = translatedValidationReason(issue);
  const label = validationFieldLabel(issue);
  return label ? `${label}: ${reason}` : reason.charAt(0).toUpperCase() + reason.slice(1);
}

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message = getApiMessage(code),
    public details?: Record<string, unknown>,
  ) {
    super(message);
  }
}

export const notFoundHandler: RequestHandler = (_request, response) => sendError(response, 404, 'ROUTE_NOT_FOUND', getApiMessage('ROUTE_NOT_FOUND'));
export const errorHandler: ErrorRequestHandler = (error, _request, response, _next) => {
  if (error instanceof ZodError) {
    const fields = error.issues.map((issue) => ({
      path: issue.path.join('.'),
      message: validationIssueMessage(issue),
    }));
    return sendError(
      response,
      400,
      'VALIDATION_ERROR',
      getApiMessage('VALIDATION_ERROR'),
      { fields },
    );
  }
  if (error instanceof ApiError) return sendError(response, error.status, error.code, error.message, error.details);
  if (isDatabaseUnavailableError(error)) {
    console.error(JSON.stringify({
      event: 'database_operation_failed',
      errorName: error instanceof Error ? error.name : 'UnknownError',
      errorMessage: error instanceof Error ? error.message : String(error),
    }));
    return sendError(response, 503, 'DATABASE_UNAVAILABLE', 'La base de datos no está disponible temporalmente. Reintentá en unos segundos.');
  }
  if (typeof error === 'object' && error && (error as { code?: number }).code === 11000) {
    const duplicateFields = Object.keys((error as { keyPattern?: Record<string, unknown> }).keyPattern ?? {});
    if (duplicateFields.includes('email') || duplicateFields.includes('normalizedEmail')) return sendError(response, 409, 'EMAIL_ALREADY_EXISTS', getApiMessage('EMAIL_ALREADY_EXISTS'));
    if (duplicateFields.includes('username')) return sendError(response, 409, 'USERNAME_ALREADY_EXISTS', getApiMessage('USERNAME_ALREADY_EXISTS'));
  }
  console.error(error);
  return sendError(response, 500, 'INTERNAL_ERROR', getApiMessage('INTERNAL_ERROR'));
};
