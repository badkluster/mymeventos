# Prompt maestro para contextualizar Claude Code — M&M Eventos

Quiero que antes de modificar código comprendas, documentes y conserves el contexto funcional y técnico completo del proyecto **M&M Eventos**.

Tu primera tarea no es implementar una funcionalidad aislada. Tu primera tarea es inspeccionar el repositorio, contrastar el código existente con el contexto detallado en este documento y convertir este conocimiento en memoria persistente del proyecto para futuras ejecuciones de Claude Code.

## 1. Persistencia obligatoria del contexto

1. Revisa si existe un archivo `CLAUDE.md` en la raíz.
2. Si existe, no lo reemplaces ciegamente. Conserva toda instrucción válida, elimina duplicaciones y agrega el contexto faltante.
3. Si no existe, créalo.
4. Crea también un documento detallado en:

   `docs/MYM_EVENTOS_PROJECT_CONTEXT.md`

5. Mantén `CLAUDE.md` relativamente breve y operativo. Debe importar o referenciar el documento detallado mediante:

   `@docs/MYM_EVENTOS_PROJECT_CONTEXT.md`

6. En `CLAUDE.md` deja:
   - propósito general;
   - arquitectura real detectada;
   - comandos reales del repositorio;
   - reglas críticas del dominio;
   - módulos independientes;
   - convenciones técnicas;
   - protocolo de trabajo;
   - referencia al documento completo.
7. En `docs/MYM_EVENTOS_PROJECT_CONTEXT.md` incorpora toda la información funcional y técnica de este documento, ajustándola únicamente cuando el código demuestre que algo cambió.
8. No inventes scripts, endpoints, modelos, variables de entorno o dependencias. Inspecciona el repositorio y documenta los nombres reales.
9. Cada vez que una modificación cambie una regla de negocio, arquitectura, integración, comando o flujo principal, actualiza estos archivos dentro del mismo cambio.
10. No vuelvas a analizar todo el proyecto desde cero en cada sesión. Utiliza estos documentos como fuente persistente y valida solamente el área que vas a modificar.
11. Si encuentras contradicciones entre este documento y el código:
    - no asumas silenciosamente;
    - identifica la contradicción;
    - determina si el código está incompleto, desactualizado o si el contexto requiere actualización;
    - documenta la decisión tomada.

---

# 2. Identidad y propósito del producto

**M&M Eventos** es una plataforma integral para administrar una empresa de eventos con uno o varios salones, centralizando el ciclo comercial, administrativo, operativo y financiero.

No es solamente un calendario de fiestas ni un CRM básico. El objetivo final es disponer de un ecosistema que permita gestionar:

- consultas y oportunidades comerciales;
- clientes;
- presupuestos;
- paquetes y promociones;
- contratos;
- eventos contratados;
- salones;
- disponibilidad;
- servicios y extras;
- menús y bebidas;
- inventario;
- personal;
- comunicación;
- cobros;
- documentación;
- invitaciones digitales;
- venta de entradas;
- validación de accesos mediante QR;
- aplicación móvil operativa.

La plataforma debe ser apta para el uso real diario de M&M Eventos, con datos persistentes, auditoría, permisos, integraciones verdaderas y una experiencia profesional.

---

# 3. Objetivo final del sistema

Al finalizar el proyecto, la empresa debe poder operar el negocio completo desde un único ecosistema:

1. Recibir una consulta.
2. Convertirla en lead.
3. Dar seguimiento comercial.
4. Generar uno o varios presupuestos.
5. Seleccionar un salón, paquete, menú, servicios, extras y condiciones.
6. Ajustar precios según adultos, menores, bebidas, duración, promociones y reglas particulares.
7. Aprobar el presupuesto.
8. Convertir el contacto en cliente sin duplicarlo.
9. Crear un contrato editable y aprobable.
10. Registrar adendas, archivos y modificaciones.
11. Convertir la operación en un evento confirmado.
12. Reservar fecha y salón evitando conflictos.
13. Planificar recursos, inventario y personal.
14. Registrar pagos, saldos y movimientos.
15. Comunicar recordatorios y documentación.
16. Gestionar la ejecución del evento.
17. Registrar asistencia, horarios y trabajo del personal.
18. Cerrar administrativamente el evento.
19. Consultar métricas comerciales, operativas y financieras.

Además, la plataforma debe incluir dos negocios digitales independientes:

- **Invitaciones digitales**.
- **Venta de entradas digitales**.

Estos módulos deben convivir dentro del producto, pero no deben quedar acoplados obligatoriamente al modelo principal de eventos privados.

---

# 4. Arquitectura general esperada

El proyecto fue concebido como un monorepo, aproximadamente con esta estructura:

- `apps/api`: backend Node.js, Express y MongoDB/Mongoose.
- `apps/web`: aplicación web con Next.js.
- `apps/mobile`: aplicación móvil con React Native y Expo.
- `packages/shared`: tipos, validaciones, constantes o lógica compartida.

Claude debe verificar la estructura actual y documentar la arquitectura real.

Principios arquitectónicos:

- separación clara entre frontend, backend, móvil y código compartido;
- responsabilidades de dominio explícitas;
- APIs consistentes;
- validación tanto en cliente como en servidor;
- control de permisos en backend, no solamente ocultando botones;
- modelos preparados para múltiples salones;
- auditoría de acciones críticas;
- integraciones externas encapsuladas en servicios;
- operaciones sensibles idempotentes;
- evitar archivos gigantes y componentes monolíticos;
- no duplicar reglas de negocio en múltiples interfaces;
- no implementar mocks como solución final;
- no presentar como terminada una integración que todavía sea simulada.

---

# 5. Plataformas del ecosistema

## 5.1 Backoffice web

Es la herramienta principal para administradores, responsables comerciales y encargados de salón.

Debe permitir administrar:

- dashboard;
- leads;
- clientes;
- presupuestos;
- contratos;
- eventos;
- salones;
- disponibilidad;
- paquetes;
- extras;
- inventario;
- empleados;
- pagos;
- campañas;
- invitaciones digitales;
- entradas digitales;
- validación de QR;
- usuarios;
- roles;
- permisos;
- configuración;
- auditoría.

## 5.2 Sitios y vistas públicas

La plataforma puede exponer vistas públicas diferentes, por ejemplo:

- formularios de consulta;
- páginas públicas de invitaciones;
- confirmación de asistencia;
- catálogo o landing de entradas;
- selección de tipo y cantidad de entradas;
- checkout de Mercado Pago;
- páginas de resultado de compra;
- descarga de entradas;
- verificaciones públicas estrictamente limitadas.

No se debe exponer información interna, identificadores sensibles ni datos de otros clientes.

## 5.3 Backend/API

El backend debe ser la fuente de verdad de:

- autenticación;
- autorización;
- reglas de negocio;
- precios;
- disponibilidad;
- estados;
- integraciones;
- generación de documentos;
- pagos;
- QR;
- auditoría;
- persistencia.

El frontend nunca debe decidir por sí solo que un pago fue aprobado, que una entrada es válida o que una fecha está disponible.

## 5.4 Aplicación móvil

La aplicación móvil forma parte del alcance y no debe omitirse de la planificación.

Su objetivo operativo inicial es gestionar al personal y el fichaje:

- acceso de empleados;
- autenticación por usuario y, cuando corresponda, biometría del dispositivo;
- consulta de datos personales;
- consulta de horarios, turnos o asignaciones;
- registro de llegada;
- registro de finalización de jornada;
- fecha y hora del servidor;
- ubicación geográfica;
- dirección IP cuando sea técnicamente aplicable;
- identificación del dispositivo o sesión;
- validaciones para evitar fichajes inconsistentes;
- historial personal de fichajes;
- incidencias u observaciones;
- auditoría para administración;
- información útil para liquidaciones y cálculo de horas.

El rol `STAFF` no necesita acceso general al backoffice en la primera etapa. El registro del empleado puede existir en el sistema administrativo mientras su operación cotidiana se realiza desde la app móvil.

La app debe utilizar el backend y las mismas reglas de autorización que el resto del sistema. No debe mantener una lógica paralela e incompatible.

Puede contemplarse un modo móvil para validadores de entradas o personal de acceso, pero no debe mezclarse automáticamente con el fichaje. Si se implementa, debe ser un módulo o permiso específico.

Debe considerarse la conectividad móvil inestable. Cualquier estrategia offline o de sincronización debe evitar duplicar fichajes, validar dos veces una entrada o perder auditoría.

---

# 6. Usuarios, roles y permisos

La estructura de roles debe mantenerse sencilla:

## `ADMIN`

- acceso total;
- configuración global;
- gestión de usuarios y permisos;
- acceso a todos los salones;
- auditoría;
- acciones sensibles.

## `MANAGER`

- capacidades determinadas por permisos explícitos;
- puede gestionar áreas comerciales, operativas o administrativas;
- no debe recibir acceso total por defecto.

## `SALON_MANAGER`

- acceso a la información asociada a su salón o salones permitidos;
- puede gestionar leads, clientes, presupuestos, contratos y eventos vinculados a esos salones;
- no debe visualizar datos de salones no autorizados.

## `STAFF`

- representa empleados operativos;
- inicialmente utiliza principalmente la aplicación móvil;
- puede tener subrol o función laboral: mozo, maître, cocina, limpieza, seguridad, recepción, técnico, DJ u otra;
- no recibe acceso al backoffice salvo permiso explícito futuro.

Reglas:

- los permisos deben verificarse en backend;
- toda consulta sensible debe aplicar alcance por salón;
- no confiar en valores enviados por el frontend para determinar permisos;
- registrar auditoría de altas, modificaciones, bajas, aprobaciones, pagos, escaneos y acciones críticas.

---

# 7. Flujo comercial principal

El flujo de negocio base es:

`Lead → Presupuesto(s) → Cliente → Contrato → Evento`

## 7.1 Leads

Un lead representa una consulta u oportunidad, todavía no necesariamente un cliente confirmado.

Debe permitir:

- alta manual y potencial ingreso desde formularios;
- nombre;
- teléfono;
- email;
- salón de interés;
- fecha estimada;
- tipo de evento;
- cantidad de invitados;
- origen;
- estado;
- responsable;
- notas;
- historial de contacto;
- acciones rápidas de email y WhatsApp;
- búsqueda;
- filtros;
- ordenamiento;
- paginación;
- seguimiento.

Las tablas deben ser modernas y operativas:

- orden por columnas;
- búsqueda con debounce;
- filtros coordinados;
- paginación real;
- acciones iconográficas con tooltip;
- estados de carga, vacío y error;
- confirmación para acciones destructivas;
- acciones deshabilitadas cuando corresponda.

## 7.2 Presupuestos

Un lead puede tener varios presupuestos o versiones.

Un presupuesto puede incluir:

- salón;
- fecha tentativa;
- cantidad de adultos;
- cantidad de menores;
- duración;
- paquete base;
- menú;
- bebidas;
- servicios incluidos;
- extras;
- promociones;
- descuentos;
- precio por persona;
- precio fijo;
- seña;
- saldo;
- condiciones de pago;
- vigencia;
- notas internas;
- texto público;
- archivos;
- historial;
- estado.

El cálculo no debe depender únicamente del frontend. El backend debe recalcular o validar los importes.

Debe soportar:

- plantillas de paquetes;
- paquetes globales;
- paquetes específicos por salón;
- duplicación;
- edición;
- soft delete;
- auditoría;
- distintas versiones;
- presupuesto personalizado sin paquete predefinido.

## 7.3 Clientes

Cuando una operación avanza, el contacto se convierte en cliente.

Debe evitarse la duplicación utilizando reglas razonables sobre:

- email;
- teléfono;
- nombre;
- documentos cuando existan.

La conversión debe ser segura e idempotente.

## 7.4 Contratos

Los contratos deben poder modificarse antes de aprobarse. No se debe diseñar el flujo solamente alrededor de imprimir y firmar.

Estados simples recomendados:

- `pending_approval`;
- `approved`;
- estados adicionales solo si tienen una necesidad real.

Los contratos deben soportar:

- contenido editable;
- datos congelados o snapshot del acuerdo;
- historial de versiones;
- adjuntos;
- adendas;
- observaciones;
- aprobación;
- auditoría;
- relación con presupuesto, cliente y evento.

Todo aquello no contratado o expresamente aprobado debe quedar fuera del alcance comercial correspondiente.

## 7.5 Eventos contratados

Un evento representa una celebración privada o servicio confirmado de la operación principal.

Debe contener información suficiente para:

- identificar cliente y salón;
- fecha y horario;
- controlar disponibilidad;
- invitados adultos y menores;
- menú;
- bebidas;
- servicios;
- extras;
- personal;
- inventario previsto;
- pagos;
- documentación;
- observaciones;
- cronograma;
- estado;
- cierre.

La conversión desde presupuesto o contrato debe ser idempotente: no debe crear dos eventos por dobles clics, reintentos o solicitudes repetidas.

---

# 8. Salones, disponibilidad y multisalón

La plataforma debe funcionar con varios salones.

Cada salón puede tener:

- datos generales;
- dirección;
- ubicación;
- capacidad;
- imágenes;
- horarios;
- paquetes;
- servicios;
- extras;
- reglas;
- calendario;
- responsables;
- configuración particular.

Reglas esenciales:

- evitar superposición de reservas incompatibles;
- distinguir fechas tentativas, bloqueadas y confirmadas;
- filtrar información por salón;
- permitir configuración global y configuración específica;
- mantener trazabilidad cuando una operación cambia de salón;
- no filtrar únicamente desde la interfaz: el backend debe respetar el alcance.

---

# 9. Paquetes, eventos personalizados y precios

M&M Eventos no trabaja solamente con paquetes cerrados.

El sistema debe admitir:

## Paquetes predefinidos

Pueden incluir:

- comida;
- bebidas;
- DJ;
- mobiliario;
- decoración;
- personal;
- duración;
- servicios;
- promociones;
- precio por persona o fijo.

## Eventos personalizados

El precio puede depender de:

- cantidad de adultos;
- cantidad de menores;
- menú;
- bebidas;
- consumo de alcohol;
- duración;
- servicios;
- extras;
- salón;
- fecha;
- promoción;
- condiciones especiales.

No se debe forzar un evento personalizado dentro de una plantilla rígida.

Las reglas de precio deben ser transparentes, trazables y validadas en backend.

---

# 10. Inventario, recursos y servicios

Debe existir una capa para administrar recursos utilizados en los eventos:

- alimentos;
- bebidas;
- productos;
- mantelería;
- vajilla;
- mobiliario;
- materiales;
- equipamiento;
- servicios externos;
- extras.

El sistema debe poder manejar:

- stock;
- unidad de medida;
- costo;
- precio;
- disponibilidad;
- movimientos;
- reserva o planificación por evento;
- reglas de consumo;
- cantidades estimadas;
- faltantes;
- devoluciones;
- pérdidas o roturas;
- proveedores cuando corresponda.

La planificación puede relacionar cantidad de invitados con consumo estimado, pero las reglas deben ser configurables.

---

# 11. Personal y liquidaciones

Además del fichaje móvil, el sistema administrativo debe permitir:

- alta de empleados;
- datos personales;
- rol y subrol;
- salones habilitados;
- disponibilidad;
- turnos;
- asignación a eventos;
- valor hora o modalidad de pago;
- registro de fichajes;
- correcciones autorizadas;
- incidencias;
- horas trabajadas;
- liquidaciones;
- historial;
- auditoría.

Una modificación manual de horario debe dejar registro de quién la realizó, cuándo y por qué.

---

# 12. Comunicaciones y automatizaciones

El sistema debe facilitar comunicaciones operativas y comerciales mediante:

- email;
- WhatsApp;
- plantillas;
- recordatorios;
- confirmaciones;
- envío de presupuestos;
- envío de contratos;
- envío de invitaciones;
- envío de entradas;
- campañas;
- cupones o promociones.

No se debe declarar una integración como real si solamente abre una URL o simula un envío.

Los fallos de envío deben registrarse y poder reintentarse sin duplicar operaciones sensibles.

---

# 13. Módulo independiente de invitaciones digitales

Este módulo es independiente del módulo central de eventos privados.

No debe crearse como una simple pestaña obligatoriamente dependiente de `Event`.

Debe tener acceso propio desde el menú y sus propias entidades de dominio.

Puede incluir:

- proyectos de invitación;
- plantillas;
- temas;
- colores;
- tipografías;
- imágenes;
- música cuando sea legal y técnicamente viable;
- datos de fecha, hora y ubicación;
- mapa;
- cuenta regresiva;
- galería;
- datos del homenajeado;
- código de vestimenta;
- información adicional;
- lista de invitados;
- enlace público;
- RSVP;
- cantidad de asistentes;
- estado de respuesta;
- restricciones;
- fecha límite;
- mensajes;
- email;
- WhatsApp;
- métricas;
- configuración de privacidad;
- activación o desactivación.

Puede existir una vinculación opcional con un cliente, salón o evento privado, pero no debe ser obligatoria ni generar acoplamiento estructural.

Una invitación digital debe poder venderse o administrarse como producto independiente.

---

# 14. Módulo independiente de entradas digitales

El módulo de entradas digitales también es independiente del modelo central de eventos privados.

Debe tener acceso propio desde el menú, configuración propia y entidades propias.

Usar nombres de dominio claros, por ejemplo:

- `TicketedEvent`;
- `TicketType`;
- `TicketOrder`;
- `Ticket`;
- `Payment`;
- `TicketScan`;
- `TicketDelivery`.

Los nombres definitivos deben respetar el código existente, pero no debe reutilizarse de forma forzada el modelo `Event` de celebraciones privadas.

## 14.1 Configuración de una publicación de entradas

Debe permitir:

- título;
- descripción;
- imagen;
- fecha;
- hora;
- ubicación;
- mapa;
- organizador;
- condiciones;
- capacidad;
- período de venta;
- estado;
- visibilidad;
- tipos de entrada;
- precio;
- cupo por tipo;
- límite por compra;
- cortesías;
- promociones;
- configuración de Mercado Pago;
- contenido del ticket;
- configuración del email.

## 14.2 Compra pública

Flujo esperado:

1. El comprador ingresa a la página pública.
2. Selecciona tipo de entrada.
3. Selecciona cantidad.
4. Informa sus datos.
5. El backend valida disponibilidad y precio.
6. Se crea una orden pendiente.
7. Se crea una preferencia real de Mercado Pago.
8. El comprador completa el pago.
9. El backend recibe y valida el webhook.
10. Solamente cuando el pago queda aprobado se emiten las entradas.
11. Se genera una entrada individual por unidad comprada.
12. Cada entrada recibe un QR único.
13. Se genera el PDF.
14. Se almacena en el servidor o servicio de archivos configurado.
15. Se envía el email al comprador.
16. El comprador puede descargar o presentar sus entradas.

La redirección de éxito del navegador no es prueba suficiente del pago. El webhook validado debe ser la fuente principal.

## 14.3 Integración con Mercado Pago

La integración debe ser real.

Debe contemplar:

- credenciales seguras;
- ambientes de prueba y producción;
- creación de preferencias;
- referencias externas;
- metadata;
- webhook;
- consulta de pago cuando sea necesario;
- idempotencia;
- logs;
- estados;
- reintentos;
- pagos duplicados;
- rechazos;
- cancelaciones;
- vencimientos;
- reembolsos;
- contracargos cuando corresponda.

Estados orientativos:

- `pending`;
- `approved`;
- `rejected`;
- `cancelled`;
- `expired`;
- `refunded`;
- `charged_back`.

No guardar secretos en el repositorio ni exponerlos al frontend.

## 14.4 Emisión de entradas

Una compra de varias unidades genera varias entradas individuales.

Ejemplo:

- orden de 4 entradas;
- 4 registros `Ticket`;
- 4 códigos únicos;
- 4 QR únicos;
- cada uno puede utilizarse una sola vez.

No debe utilizarse un único QR compartido por toda la orden.

Cada ticket debe tener:

- identificador público seguro;
- token QR firmado o no predecible;
- tipo;
- titular o comprador;
- orden;
- estado;
- fecha de emisión;
- fecha de uso;
- información de validación;
- auditoría.

No colocar en el QR información sensible ni un identificador secuencial fácilmente manipulable.

## 14.5 PDF de entradas

Las entradas deben generarse en PDF con apariencia profesional de ticket real.

El PDF debe ser apto para:

- impresión;
- presentación desde el teléfono;
- envío por email;
- descarga posterior.

Debe incluir, según configuración:

- marca M&M o marca del organizador;
- nombre de la publicación;
- imagen;
- fecha;
- hora;
- ubicación;
- tipo de entrada;
- número o código de ticket;
- comprador o titular;
- QR;
- instrucciones;
- condiciones;
- datos de contacto;
- aviso de uso único.

Cuando una orden contiene varias entradas, puede generarse:

- un PDF multipágina con una entrada por página;
- y/o archivos individuales.

La decisión debe ser consistente y facilitar la descarga, el reenvío y la validación.

El archivo debe almacenarse mediante el servicio de archivos existente. No debe depender solamente de un archivo temporal del proceso.

## 14.6 Email de entrega

Después de la aprobación y emisión se debe enviar un email completo con:

- confirmación de compra;
- número de orden;
- detalle;
- fecha;
- hora;
- ubicación;
- imagen;
- cantidad;
- tipos de entrada;
- instrucciones;
- archivo PDF o enlaces seguros;
- contacto de soporte.

Debe registrarse el estado de entrega:

- pendiente;
- enviado;
- fallido;
- reintentado.

El backoffice debe permitir:

- reenviar;
- descargar;
- consultar el historial;
- corregir el email dentro de reglas seguras.

## 14.7 Validación y escaneo QR

El backoffice debe contar con una vista adaptada a dispositivos móviles para escanear QR usando la cámara.

También puede implementarse en la app móvil mediante un permiso específico, sin mezclarlo con el módulo de fichaje.

Al escanear:

1. Se envía el token al backend.
2. El backend valida autenticación y permiso del operador.
3. Verifica firma y existencia.
4. Verifica que corresponda a la publicación correcta.
5. Verifica estado del pago.
6. Verifica estado de la entrada.
7. Si es válida, muestra el detalle.
8. El operador confirma o el sistema registra el ingreso según el flujo definido.
9. La entrada cambia a utilizada.
10. Se crea un registro de escaneo.

Debe mostrar respuestas claras:

- válida;
- ya utilizada;
- anulada;
- reembolsada;
- inexistente;
- publicación incorrecta;
- pago no aprobado;
- fuera de vigencia.

La validación debe ser atómica para impedir que dos dispositivos utilicen el mismo QR simultáneamente.

El registro debe incluir:

- ticket;
- fecha y hora;
- operador;
- dispositivo o sesión;
- publicación;
- resultado;
- ubicación si corresponde;
- observación;
- auditoría.

Nunca confiar en que el frontend marque una entrada como utilizada sin confirmación transaccional del backend.

---

# 15. Separación obligatoria de dominios

Esta regla es crítica.

Existen tres conceptos diferentes:

1. Evento privado contratado por un cliente.
2. Proyecto de invitación digital.
3. Publicación o evento de venta de entradas.

No son la misma entidad.

No debes:

- usar automáticamente el mismo modelo para los tres;
- hacer que invitaciones y entradas dependan obligatoriamente de un evento privado;
- colocar toda la lógica en el módulo `/events`;
- mezclar estados;
- mezclar permisos;
- mezclar rutas;
- mezclar menús;
- generar dependencias circulares.

Se permite una relación opcional cuando agregue valor, pero cada módulo debe funcionar de manera autónoma.

---

# 16. Estados, auditoría e idempotencia

Toda operación crítica debe tener estados explícitos y transiciones controladas.

Áreas especialmente sensibles:

- conversión de lead;
- conversión a cliente;
- aprobación de presupuesto;
- creación de contrato;
- creación de evento;
- reserva de fecha;
- registro de pago;
- webhook;
- emisión de ticket;
- generación de PDF;
- envío de email;
- escaneo QR;
- fichaje móvil;
- modificación manual de horario;
- liquidación.

Aplicar idempotencia para:

- dobles clics;
- reintentos del frontend;
- reintentos de red;
- webhooks repetidos;
- procesos ejecutados más de una vez;
- reenvíos;
- tareas programadas.

Toda acción sensible debe poder investigarse posteriormente.

---

# 17. Seguridad

Requisitos mínimos:

- secretos solamente en variables de entorno o servicios seguros;
- contraseñas con hash robusto;
- sesiones o tokens correctamente gestionados;
- control de rol y permiso en backend;
- alcance por salón;
- validación de payload;
- sanitización;
- rate limiting en endpoints públicos sensibles;
- protección de archivos privados;
- enlaces con expiración cuando corresponda;
- QR no predecible;
- verificación de webhooks;
- no registrar secretos o datos completos de pago;
- manejo seguro de errores;
- privacidad de datos personales;
- auditoría.

El frontend no es una barrera de seguridad.

---

# 18. Experiencia de usuario y diseño

La interfaz debe sentirse moderna, clara y profesional.

Principios:

- reducir densidad visual;
- jerarquía clara;
- acciones principales visibles;
- acciones secundarias agrupadas;
- tablas consistentes;
- formularios divididos por secciones;
- validación contextual;
- feedback inmediato;
- estados de carga;
- estados vacíos útiles;
- mensajes de error comprensibles;
- confirmaciones para acciones destructivas;
- diseño responsive;
- accesibilidad;
- uso consistente de componentes;
- evitar modales enormes;
- evitar formularios interminables sin agrupación;
- evitar componentes sobrecargados.

Las vistas de escaneo y fichaje deben priorizar velocidad, legibilidad y uso desde celular.

---

# 19. Calidad técnica

Antes de considerar una tarea terminada:

- compilar;
- ejecutar lint;
- ejecutar typecheck;
- ejecutar tests relevantes;
- revisar errores de consola;
- verificar estados de carga y error;
- verificar permisos;
- verificar responsive;
- verificar datos persistidos;
- verificar efectos sobre otros salones;
- verificar reintentos;
- verificar idempotencia;
- revisar migraciones o compatibilidad de datos;
- actualizar documentación.

No ocultar errores con `any`, `try/catch` vacíos o desactivación indiscriminada de reglas.

No hacer refactors masivos no solicitados sin una razón concreta.

No modificar contratos de API sin actualizar todos sus consumidores.

---

# 20. Estado conocido del proyecto

Según el contexto acumulado, ya se trabajó en:

- monorepo;
- backend Express/Mongoose;
- web Next.js;
- aplicación móvil Expo;
- leads;
- presupuestos;
- plantillas de paquetes;
- reglas por salón;
- CRUD;
- duplicación;
- estados;
- soft delete;
- auditoría;
- salones;
- clientes;
- eventos;
- conversión idempotente;
- navegación administrativa;
- configuración para despliegue en Vercel;
- conexión MongoDB reutilizable en entorno serverless;
- primeras implementaciones de invitaciones digitales;
- primeras implementaciones de entradas digitales.

Sin embargo, debes verificar el estado real del repositorio. No asumas que todo está completo solo porque aparece en esta lista.

En particular, las integraciones de Mercado Pago, emisión de entradas, PDF, email y escaneo QR deben revisarse como un flujo integral de producción, no como pantallas aisladas.

---

# 21. Criterio de finalización del producto

El proyecto estará funcionalmente maduro cuando:

- el ciclo comercial completo funcione;
- no se dupliquen clientes ni eventos;
- las fechas se reserven correctamente;
- los precios sean confiables;
- los contratos puedan aprobarse y versionarse;
- los salones estén aislados por permisos;
- el inventario pueda planificarse;
- el personal pueda asignarse;
- la app móvil registre fichajes auditables;
- los administradores puedan liquidar horas;
- las invitaciones digitales funcionen de manera independiente;
- una persona pueda comprar entradas con Mercado Pago;
- el webhook confirme el pago;
- se genere un QR único por entrada;
- se genere y almacene el PDF;
- el comprador reciba el email;
- el QR pueda escanearse;
- una entrada usada no pueda reutilizarse;
- reembolsos y anulaciones invaliden accesos;
- todas las operaciones críticas queden auditadas;
- el sistema sea responsive;
- los errores sean recuperables;
- no existan integraciones falsas presentadas como completas.

---

# 22. Protocolo de trabajo para Claude

Antes de implementar una tarea:

1. Lee `CLAUDE.md`.
2. Lee el documento de contexto importado.
3. Identifica el módulo afectado.
4. Inspecciona modelos, servicios, rutas, componentes y tests relacionados.
5. Describe brevemente el estado real.
6. Detecta riesgos y dependencias.
7. Diseña el cambio más pequeño que resuelva el problema completo.
8. Implementa backend y frontend de manera coherente.
9. Incluye móvil cuando el flujo lo requiera.
10. Valida permisos, multisalón e idempotencia.
11. Ejecuta verificaciones.
12. Actualiza la documentación cuando cambie el comportamiento.

Reglas de interacción:

- no afirmar que una tarea está completa sin evidencia;
- no inventar datos;
- no crear integraciones simuladas como solución definitiva;
- no acoplar módulos independientes;
- no eliminar comportamiento existente sin analizarlo;
- no reescribir grandes áreas sin necesidad;
- informar bloqueos concretos;
- proponer decisiones con impacto;
- mantener compatibilidad con datos existentes;
- priorizar soluciones mantenibles.

---

# 23. Tarea concreta para esta ejecución

Realiza ahora lo siguiente:

1. Inspecciona la raíz y la estructura del monorepo.
2. Localiza toda documentación existente.
3. Localiza `CLAUDE.md`, `README`, archivos de entorno de ejemplo y scripts.
4. Identifica las tecnologías y comandos reales.
5. Identifica los modelos y módulos existentes.
6. Compara el código con este contexto.
7. Crea o actualiza `docs/MYM_EVENTOS_PROJECT_CONTEXT.md`.
8. Crea o actualiza `CLAUDE.md`.
9. Evita duplicar contenido: usa la importación del documento detallado.
10. Agrega una sección de “estado real detectado” separando:
    - implementado;
    - parcial;
    - pendiente;
    - inconsistente;
    - riesgo técnico.
11. No cambies funcionalidades de negocio en esta primera tarea salvo que sea imprescindible para corregir documentación rota.
12. Al finalizar, informa:
    - archivos creados;
    - archivos modificados;
    - arquitectura detectada;
    - comandos verificados;
    - contradicciones encontradas;
    - decisiones documentadas;
    - próximos riesgos prioritarios.

Este contexto debe convertirse en la fuente de referencia permanente del proyecto M&M Eventos.
