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
  SALON_CREATED: 'Salón creado correctamente.',
  SALON_UPDATED: 'Salón actualizado correctamente.',
  SALON_DELETED: 'Salón eliminado correctamente.'
  ,LEAD_CREATED: 'Lead creado correctamente.', LEAD_UPDATED: 'Lead actualizado correctamente.', LEAD_DELETED: 'Lead eliminado correctamente.', LEAD_NOT_FOUND: 'Lead no encontrado.', LEAD_STATUS_UPDATED: 'Estado del lead actualizado correctamente.', LEAD_LOST: 'Lead marcado como perdido.', ACTIVITY_CREATED: 'Actividad agregada correctamente.', QUICK_QUOTE_CREATED: 'Solicitud recibida correctamente.', LEADS_EXPORTED: 'Leads exportados correctamente.',
  QUOTE_CREATED: 'Presupuesto creado correctamente.', QUOTE_UPDATED: 'Presupuesto actualizado correctamente.', QUOTE_DELETED: 'Presupuesto eliminado correctamente.', QUOTE_DUPLICATED: 'Presupuesto duplicado correctamente.', QUOTE_STATUS_UPDATED: 'Estado del presupuesto actualizado correctamente.', QUOTE_NOT_FOUND: 'Presupuesto no encontrado.',
  PACKAGE_TEMPLATE_CREATED: 'Plantilla de paquete creada correctamente.', PACKAGE_TEMPLATE_UPDATED: 'Plantilla de paquete actualizada correctamente.', PACKAGE_TEMPLATE_DELETED: 'Plantilla de paquete eliminada correctamente.', PACKAGE_TEMPLATE_NOT_FOUND: 'Plantilla de paquete no encontrada.', PACKAGE_TEMPLATE_NOT_AVAILABLE: 'La plantilla no está disponible para el salón seleccionado.', PACKAGE_RULE_UPDATED: 'Regla comercial del salón actualizada correctamente.'
} as const;

export type ApiMessageCode = keyof typeof ApiMessages;
export const getApiMessage = (code: string): string => ApiMessages[code as ApiMessageCode] ?? ApiMessages.INTERNAL_SERVER_ERROR;
