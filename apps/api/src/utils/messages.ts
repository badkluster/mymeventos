export const ApiMessages = {
  INVALID_CREDENTIALS: 'Usuario o contraseña inválidos.',
  UNAUTHORIZED: 'No autorizado.',
  UNAUTHENTICATED: 'No autorizado.',
  FORBIDDEN: 'No tenés permisos para realizar esta acción.',
  NOT_FOUND: 'Recurso no encontrado.',
  ROUTE_NOT_FOUND: 'Ruta no encontrada.',
  VALIDATION_ERROR: 'Los datos enviados no son válidos.',
  INTERNAL_SERVER_ERROR: 'Ocurrió un error interno del servidor.',
  INTERNAL_ERROR: 'Ocurrió un error interno del servidor.',
  USER_NOT_FOUND: 'Usuario no encontrado.',
  USER_INACTIVE: 'El usuario se encuentra inactivo.',
  TOKEN_EXPIRED: 'La sesión expiró. Iniciá sesión nuevamente.',
  INVALID_TOKEN: 'Token inválido.',
  SALON_SCOPE_DENIED: 'No tenés acceso a este salón.',
  SALON_SCOPE_FORBIDDEN: 'No tenés acceso a este salón.',
  SALON_NOT_FOUND: 'Salón no encontrado.',
  SETTINGS_UPDATED: 'Configuración actualizada correctamente.',
  USER_CREATED: 'Usuario creado correctamente.',
  USER_UPDATED: 'Usuario actualizado correctamente.',
  USER_DELETED: 'Usuario eliminado correctamente.',
  USER_PASSWORD_RESET: 'Contraseña reiniciada correctamente.',
  USERNAME_ALREADY_EXISTS: 'Ya existe un usuario con ese nombre de usuario.',
  USER_PRIMARY_SALON_INVALID: 'El salón principal debe estar dentro de los salones asignados.',
  USER_PRIMARY_MANAGED_SALON_INVALID: 'El salón principal a cargo debe estar dentro de los salones a cargo.',
  SALON_CREATED: 'Salón creado correctamente.',
  SALON_UPDATED: 'Salón actualizado correctamente.',
  SALON_DELETED: 'Salón eliminado correctamente.',
  SALON_MANAGER_ROLE_INVALID: 'El encargado debe tener rol administrador, manager o encargado de salón.',
  LEAD_CREATED: 'Lead creado correctamente.', LEAD_UPDATED: 'Lead actualizado correctamente.', LEAD_DELETED: 'Lead eliminado correctamente.', LEAD_NOT_FOUND: 'Lead no encontrado.', LEAD_STATUS_UPDATED: 'Estado del lead actualizado correctamente.', LEAD_LOST: 'Lead marcado como perdido.', ACTIVITY_CREATED: 'Actividad agregada correctamente.', QUICK_QUOTE_CREATED: 'Solicitud recibida correctamente.', LEADS_EXPORTED: 'Leads exportados correctamente.',
  QUOTE_CREATED: 'Presupuesto creado correctamente.', QUOTE_UPDATED: 'Presupuesto actualizado correctamente.', QUOTE_DELETED: 'Presupuesto eliminado correctamente.', QUOTE_DUPLICATED: 'Presupuesto duplicado correctamente.', QUOTE_STATUS_UPDATED: 'Estado del presupuesto actualizado correctamente.', QUOTE_NOT_FOUND: 'Presupuesto no encontrado.',
  PACKAGE_TEMPLATE_CREATED: 'Plantilla de paquete creada correctamente.', PACKAGE_TEMPLATE_UPDATED: 'Plantilla de paquete actualizada correctamente.', PACKAGE_TEMPLATE_DELETED: 'Plantilla de paquete eliminada correctamente.', PACKAGE_TEMPLATE_NOT_FOUND: 'Plantilla de paquete no encontrada.', PACKAGE_TEMPLATE_NOT_AVAILABLE: 'La plantilla no está disponible para el salón seleccionado.', PACKAGE_RULE_UPDATED: 'Regla comercial del salón actualizada correctamente.'
  ,QUOTE_REQUEST_CREATED: 'Solicitud de presupuesto creada correctamente.', QUOTE_REQUEST_UPDATED: 'Solicitud de presupuesto actualizada correctamente.', QUOTE_REQUEST_DELETED: 'Solicitud de presupuesto eliminada correctamente.', QUOTE_REQUEST_NOT_FOUND: 'Solicitud de presupuesto no encontrada.', QUOTE_REQUEST_NOT_CONVERTIBLE: 'La solicitud no se puede convertir en presupuesto.'
  ,EVENT_CREATED_FROM_QUOTE: 'Evento creado correctamente desde el presupuesto.', EVENT_ALREADY_CREATED_FROM_QUOTE: 'El evento ya estaba creado para este presupuesto.', EVENT_UPDATED: 'Evento actualizado correctamente.', EVENT_NOT_FOUND: 'Evento no encontrado.', CUSTOMER_NOT_FOUND: 'Cliente no encontrado.', CUSTOMER_CREATED: 'Cliente creado correctamente.', CUSTOMER_UPDATED: 'Cliente actualizado correctamente.', CUSTOMER_DELETED: 'Cliente eliminado correctamente.',
  CONTRACT_CREATED: 'Contrato creado correctamente.', CONTRACT_UPDATED: 'Contrato actualizado correctamente.', CONTRACT_DELETED: 'Contrato eliminado correctamente.', CONTRACT_NOT_FOUND: 'Contrato no encontrado.', CONTRACT_ALREADY_EXISTS: 'El evento ya tiene un contrato activo.', CONTRACT_EVENT_INCOMPLETE: 'El evento todavía no tiene todos los datos necesarios para generar contrato.', CONTRACT_NOT_APPROVABLE: 'El contrato todavía no tiene todos los datos necesarios para aprobarse.', CONTRACT_CANCELLED: 'El contrato está cancelado.',
  CONTRACT_ADDENDUM_CREATED: 'Adenda creada correctamente.', CONTRACT_ADDENDUM_UPDATED: 'Adenda actualizada correctamente.', CONTRACT_ADDENDUM_DELETED: 'Adenda eliminada correctamente.', CONTRACT_ADDENDUM_NOT_FOUND: 'Adenda no encontrada.', CONTRACT_ADDENDUM_NOT_APPROVABLE: 'La adenda todavía no tiene todos los datos necesarios para aprobarse.', CONTRACT_ADDENDUM_APPROVED_LOCKED: 'Una adenda aprobada no se puede editar.',
  PAYMENT_CREATED: 'Pago registrado correctamente.', PAYMENT_UPDATED: 'Pago actualizado correctamente.', PAYMENT_DELETED: 'Pago eliminado correctamente.', PAYMENT_CANCELLED: 'Pago cancelado correctamente.', PAYMENT_REFUNDED: 'Reembolso registrado correctamente.', PAYMENT_NOT_FOUND: 'Pago no encontrado.', PAYMENT_CONTRACT_REQUIRED: 'El pago debe estar asociado a un contrato.', PAYMENT_METHOD_REQUIRED: 'Indicá el medio de pago para marcarlo como cobrado.', PAYMENT_PAID_LOCKED: 'Un pago cobrado no puede modificar importes ni asociación.', PAYMENT_REFUNDED_LOCKED: 'Un pago reembolsado no puede cancelarse.', PAYMENT_NOT_REFUNDABLE: 'Este pago no puede reembolsarse.'
} as const;

export type ApiMessageCode = keyof typeof ApiMessages;
export const getApiMessage = (code: string): string => ApiMessages[code as ApiMessageCode] ?? ApiMessages.INTERNAL_SERVER_ERROR;
