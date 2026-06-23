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
  ,LEAD_CREATED: 'Lead creado correctamente.', LEAD_UPDATED: 'Lead actualizado correctamente.', LEAD_DELETED: 'Lead eliminado correctamente.', LEAD_NOT_FOUND: 'Lead no encontrado.', LEAD_STATUS_UPDATED: 'Estado del lead actualizado correctamente.', LEAD_LOST: 'Lead marcado como perdido.', ACTIVITY_CREATED: 'Actividad agregada correctamente.', QUICK_QUOTE_CREATED: 'Solicitud recibida correctamente.'
} as const;

export type ApiMessageCode = keyof typeof ApiMessages;
export const getApiMessage = (code: string): string => ApiMessages[code as ApiMessageCode] ?? ApiMessages.INTERNAL_SERVER_ERROR;
