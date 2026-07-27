# Plan de implementación: Liquidación de Sueldos

## Etapa 1: Fundaciones del dominio

1. Incorporar permisos granulares y de autoservicio móvil.
2. Crear modelos versionados para perfiles de liquidación, conceptos, lotes, liquidaciones, ajustes y adelantos.
3. Extender `WorkSession`, sin duplicarla, con el estado de aprobación para liquidación y la reserva de la liquidación que la utiliza.
4. Conservar el campo histórico `User.payrollProfile` sin usarlo como fuente de cálculo. No se eliminan ni se inventan importes existentes.

## Etapa 2: Motor de cálculo y seguridad

1. Implementar un motor puro y determinista con importes en unidades menores enteras.
2. Construir un servicio de dominio que resuelva perfiles vigentes, asistencias aprobadas y adelantos pendientes.
3. Reservar las jornadas mediante actualización atómica para evitar doble liquidación aun sin transacciones MongoDB.
4. Bloquear recalculo, edición de conceptos y pago una vez aprobada la liquidación.

## Etapa 3: API y evidencia administrativa

1. Exponer perfiles, asistencias, conceptos, lotes, liquidaciones, ajustes, adelantos y resumen.
2. Registrar todas las transiciones sensibles en `AuditLog` con actor, IP, valores previos y motivo cuando corresponde.
3. Generar comprobantes PDF internos y exportaciones CSV, Excel XML y PDF consolidado.
4. Exponer solamente liquidaciones aprobadas y propias en la API móvil.

## Etapa 4: Backoffice

1. Incorporar el acceso principal "Liquidación de Sueldos".
2. Implementar tablero, aprobación de asistencias, configuraciones salariales, conceptos, adelantos y liquidaciones.
3. Ofrecer generación de lotes en cinco pasos: alcance, validación, vista previa, borradores y aprobación.

## Etapa 5: Calidad y evolución

1. Cubrir el motor de cálculo, las transiciones críticas y los permisos por salón con pruebas.
2. Ejecutar lint, typecheck, test y build de los paquetes afectados.
3. Evaluar posteriormente reglas de feriados, conciliación bancaria, recibos oficiales e interfaces móviles nativas. No se incluirán como reglas implícitas en esta etapa.
