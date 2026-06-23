# Reglas de Seguridad

## Autenticación (Auth)
- Flujo de tokens JWT (Access Token y Refresh Token).
- **Cookies**: Los tokens deben almacenarse en cookies `httpOnly`, `Secure` (en producción) y `SameSite` para mitigar ataques XSS y CSRF.
- **Refresh Tokens**: Los Refresh Tokens deben ser de larga duración pero almacenarse hasheados en la base de datos para prevenir secuestros de sesión en caso de exposición.
- **Access Tokens**: Deben ser de corta duración (ej. 15-30 minutos).
- **Inicio de Sesión**: Mediante nombre de usuario (o email) y contraseña. Contraseñas protegidas mediante algoritmos de hashing fuertes (ej. bcrypt/argon2).

## Autorización y Control de Acceso (RBAC)
- Sistema basado en roles (ADMIN, MANAGER, SALON_MANAGER, STAFF, ACCOUNTING, OPERATIONS, SALES, VALIDATOR).
- Implementar permisos granulares para cada recurso y acción.
- **Visibilidad Restringida**: Los usuarios deben poder acceder a información (leads, eventos, calendario, pagos) únicamente de los salones a los que han sido asignados, a menos que tengan permisos globales (como ADMIN).

## Integridad de Datos
- **Soft Delete**: Los registros importantes (Usuarios, Eventos, Clientes, Pagos) no deben ser eliminados físicamente de la base de datos. Implementar eliminación lógica (soft delete) agregando campos como `deletedAt`.
- **Auditoría**: Conservar un historial de actividades para Leads y Eventos, registrando qué usuario realizó el cambio y cuándo. Conservar el historial de precios de los productos.

## Subida de Archivos y Medios
- **Cloudinary**: Las imágenes, documentos y archivos adjuntos deben almacenarse en Cloudinary o proveedor similar.
- **Validación de Archivos**: Todo archivo subido debe ser validado por tipo MIME y tamaño antes de procesarlo o enviarlo al proveedor de almacenamiento para evitar archivos maliciosos.

## Operaciones Financieras y Sensibles
- **Seguridad en Pagos**: Los registros de pagos manuales deben validar meticulosamente los permisos de quien los ingresa.
- **Validación de Lógica de Negocio**: 
  - Validar disponibilidad de stock mediante transacciones concurrentes o bloqueos optimistas.
  - Los códigos QR de entradas deben ser generados de forma criptográficamente segura, siendo únicos e impredecibles, y marcarse como utilizados en una transacción atómica para prevenir la reutilización (doble escaneo).
