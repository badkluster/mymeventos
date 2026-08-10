"""Build the official HTML source for the M&M Eventos user manual."""

from __future__ import annotations

import html
from pathlib import Path


ROOT = Path(__file__).resolve().parents[3]
MANUAL = ROOT / "docs" / "manual"
ASSETS = MANUAL / "assets"
OUTPUT = MANUAL / "Manual_Usuario_M&M_Eventos.html"


CHAPTERS = [
    ("introduccion", "1. Introducción"),
    ("primeros-pasos", "2. Primeros pasos"),
    ("landing-publica", "3. Landing pública"),
    ("panel-calendario", "4. Panel principal y calendario"),
    ("comercial", "5. Leads, clientes y presupuestos"),
    ("flujo-comercial", "6. Flujo comercial completo"),
    ("eventos", "7. Eventos y operación integral"),
    ("invitados-mesas", "8. Invitados, mesas, logística y stock"),
    ("contratos", "9. Contratos"),
    ("pagos", "10. Ingresos y pagos"),
    ("proveedores-gastos", "11. Proveedores, gastos y rentabilidad"),
    ("produccion", "12. Producción"),
    ("invitaciones", "13. Invitaciones digitales"),
    ("entradas", "14. Entradas digitales"),
    ("salones-paquetes", "15. Salones, paquetes e inventario"),
    ("equipo", "16. Usuarios, roles, asistencia y sueldos"),
    ("reportes", "17. Reportes y analítica"),
    ("marketing", "18. Marketing y notificaciones"),
    ("configuracion", "19. Configuración y perfil"),
    ("estados", "20. Estados del sistema"),
    ("guias-rapidas", "21. Guías rápidas y resolución de situaciones"),
]


CSS = r"""
@page { size: A4; margin: 17mm 15mm 20mm; }
* { box-sizing: border-box; }
html { scroll-behavior: smooth; }
body {
  margin: 0; color: #171717; background: white;
  font-family: "Segoe UI", Arial, sans-serif; font-size: 10.4pt; line-height: 1.48;
  -webkit-print-color-adjust: exact; print-color-adjust: exact;
}
a { color: #74591f; text-decoration: none; }
p { margin: 0 0 3.3mm; }
ul, ol { margin: 2mm 0 4mm 6mm; padding-left: 5mm; }
li { margin: 0 0 1.5mm; }
.cover {
  min-height: 245mm; padding: 24mm 18mm; border-radius: 7mm; color: white;
  background: radial-gradient(circle at 80% 10%, #4d4434 0, #171717 34%, #050505 72%);
  position: relative; overflow: hidden; page-break-after: always;
}
.cover::after { content: ""; position: absolute; width: 120mm; height: 120mm; right: -45mm; bottom: -45mm; border: 1px solid rgba(199,164,90,.35); border-radius: 50%; }
.cover-logo { width: 58mm; padding: 5mm; background: white; border-radius: 3mm; }
.cover-kicker { margin-top: 39mm; color: #d7c28e; text-transform: uppercase; letter-spacing: .28em; font-size: 9pt; }
.cover h1 { margin: 5mm 0 3mm; font-size: 32pt; line-height: 1.05; font-weight: 650; letter-spacing: -.03em; }
.cover h2 { margin: 0; max-width: 125mm; font-size: 16pt; line-height: 1.35; font-weight: 400; color: #e5e5e5; }
.cover-meta { position: absolute; left: 18mm; bottom: 20mm; display: grid; grid-template-columns: auto auto; gap: 1.5mm 9mm; font-size: 9.5pt; color: #d4d4d4; }
.cover-meta strong { color: #d7c28e; font-weight: 600; }
.toc { page-break-after: always; }
.toc-grid { columns: 2; column-gap: 12mm; }
.toc a { display: block; break-inside: avoid; padding: 2.4mm 0; border-bottom: 1px solid #e5e5e5; font-weight: 600; }
.chapter { page-break-before: always; }
.chapter-title { border-top: 2.2mm solid #171717; padding-top: 4mm; margin-bottom: 7mm; }
.chapter-title .number { color: #a37c2e; font-size: 9pt; text-transform: uppercase; letter-spacing: .17em; }
h1 { margin: 1.5mm 0 0; font-size: 24pt; line-height: 1.15; letter-spacing: -.025em; }
h2 { margin: 8mm 0 3mm; font-size: 16pt; line-height: 1.22; color: #252525; page-break-after: avoid; }
h3 { margin: 5mm 0 2mm; font-size: 12pt; color: #3f3f3f; page-break-after: avoid; }
.lead { font-size: 12pt; color: #4b4b4b; border-left: 1.5mm solid #b38a3b; padding-left: 4mm; margin-bottom: 7mm; }
.callout { break-inside: avoid; margin: 5mm 0; padding: 4mm 5mm; border-radius: 2.5mm; border: 1px solid; }
.callout strong { display: block; margin-bottom: 1mm; text-transform: uppercase; letter-spacing: .08em; font-size: 8.5pt; }
.important { background: #fff8e8; border-color: #d9b765; }
.tip { background: #f1f7f2; border-color: #8fb89a; }
.warning { background: #fff1ef; border-color: #d49387; }
.note { background: #f4f4f5; border-color: #cfcfd3; }
figure { margin: 6mm 0 7mm; break-inside: avoid; }
figure img { width: 100%; max-height: 166mm; object-fit: contain; object-position: top; display: block; border: .35mm solid #d5d5d5; border-radius: 2.5mm; background: #f7f7f7; }
figcaption { margin-top: 2mm; color: #666; font-size: 8.7pt; }
.small-figure img { max-height: 122mm; }
.two-col { display: grid; grid-template-columns: 1fr 1fr; gap: 5mm; align-items: start; }
.card { break-inside: avoid; padding: 4mm; border: .35mm solid #ddd; border-radius: 2.5mm; background: #fafafa; }
.card h3 { margin-top: 0; }
table { width: 100%; border-collapse: collapse; margin: 4mm 0 6mm; break-inside: avoid; font-size: 9.3pt; }
th { background: #1b1b1b; color: white; text-align: left; padding: 2.5mm; }
td { vertical-align: top; padding: 2.3mm; border-bottom: .3mm solid #ddd; }
tr:nth-child(even) td { background: #fafafa; }
.steps { counter-reset: step; list-style: none; padding: 0; margin-left: 0; }
.steps > li { counter-increment: step; position: relative; min-height: 8mm; padding: 0 0 3mm 11mm; }
.steps > li::before { content: counter(step); position: absolute; left: 0; top: -.6mm; width: 7mm; height: 7mm; display: grid; place-items: center; border-radius: 50%; background: #171717; color: white; font-size: 8pt; font-weight: 700; }
.checklist { list-style: none; padding-left: 0; margin-left: 0; }
.checklist li::before { content: "□"; margin-right: 2.5mm; color: #8b6a28; font-size: 13pt; vertical-align: -.5mm; }
.tag { display: inline-block; border-radius: 99px; padding: .5mm 2mm; background: #ececec; font-size: 8pt; font-weight: 650; }
.module-empty { border: .4mm dashed #b7b7b7; padding: 4mm; border-radius: 2mm; background: #fbfbfb; }
.page-break { page-break-before: always; }
.endnote { margin-top: 10mm; padding-top: 5mm; border-top: 1px solid #bbb; color: #666; font-size: 9pt; }
@media screen { body { max-width: 210mm; margin: 0 auto; padding: 12mm; box-shadow: 0 0 30px #bbb; } .cover { min-height: 260mm; } }
@media print { .screen-only { display: none !important; } }
"""


def safe(text: str) -> str:
    return html.escape(text)


def figure(filename: str, caption: str, small: bool = False) -> str:
    path = ASSETS / filename
    if not path.exists():
        raise FileNotFoundError(path)
    css = ' class="small-figure"' if small else ""
    return f'<figure{css}><img src="assets/{safe(filename)}" alt="{safe(caption)}"><figcaption>{safe(caption)}</figcaption></figure>'


def callout(kind: str, title: str, body: str) -> str:
    return f'<div class="callout {kind}"><strong>{safe(title)}</strong>{body}</div>'


def steps(items: list[str]) -> str:
    return '<ol class="steps">' + ''.join(f'<li>{item}</li>' for item in items) + '</ol>'


def table(headers: list[str], rows: list[list[str]]) -> str:
    head = ''.join(f'<th>{safe(value)}</th>' for value in headers)
    body = ''.join('<tr>' + ''.join(f'<td>{value}</td>' for value in row) + '</tr>' for row in rows)
    return f'<table><thead><tr>{head}</tr></thead><tbody>{body}</tbody></table>'


def chapter(number: str, title: str, anchor: str, lead: str) -> str:
    return f'<section class="chapter" id="{anchor}"><div class="chapter-title"><div class="number">Capítulo {number}</div><h1>{title}</h1></div><p class="lead">{lead}</p>'


def close() -> str:
    return '</section>'


def build() -> str:
    out: list[str] = []
    out.append('<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">')
    out.append('<title>Manual de Usuario Oficial — M&M Eventos</title><style>' + CSS + '</style></head><body>')
    out.append('''<section class="cover">
      <img class="cover-logo" src="assets/mym-logo.jpg" alt="M&M Eventos">
      <div class="cover-kicker">Documento oficial</div>
      <h1>Manual de Usuario</h1>
      <h2>Sistema de Gestión Integral de Eventos</h2>
      <div class="cover-meta">
        <strong>Organización</strong><span>M&M Eventos</span>
        <strong>Versión del sistema</strong><span>1.0.0</span>
        <strong>Versión del manual</strong><span>1.0</span>
        <strong>Generado</strong><span>10 de agosto de 2026</span>
        <strong>Formato</strong><span>A4 · preparado para impresión</span>
      </div>
    </section>''')

    out.append('<section class="toc"><div class="chapter-title"><div class="number">Contenido</div><h1>Índice</h1></div>')
    out.append('<p>Hacé clic en un capítulo para abrirlo en la versión HTML. Los enlaces también quedan activos en el PDF.</p><div class="toc-grid">')
    for anchor, title in CHAPTERS:
        out.append(f'<a href="#{anchor}">{safe(title)}</a>')
    out.append('</div>')
    out.append(callout('important', 'Uso del manual', '<p>Las capturas corresponden al sistema local revisado el 10 de agosto de 2026. Los nombres “QA” y “Manual QA” identifican ejemplos ficticios. Nunca copies datos personales reales a un entorno de prueba.</p>'))
    out.append('</section>')

    # 1
    out.append(chapter('1', 'Introducción', 'introduccion', 'M&M Eventos centraliza el trabajo comercial, administrativo y operativo de los salones, desde la primera consulta hasta el cierre del evento.'))
    out.append('<h2>¿Qué permite hacer?</h2><p>El sistema reúne consultas de posibles clientes, presupuestos, eventos, contratos, cobros, proveedores, gastos, personal, producción, invitaciones y entradas digitales. También ofrece calendario, reportes, analítica de la página pública, marketing, asistencia y liquidación de sueldos.</p>')
    out.append('<h2>¿A quién está dirigido?</h2><div class="two-col"><div class="card"><h3>Administración y ventas</h3><p>Para registrar contactos, cotizar, convertir presupuestos, generar contratos y controlar cobros.</p></div><div class="card"><h3>Operación de eventos</h3><p>Para organizar menú, proveedores, staff, invitados, mesas, vajilla, producción, cronograma y cierres.</p></div></div>')
    out.append(callout('note', 'Alcance', '<p>Este manual explica solamente funciones visibles para una persona usuaria. La disponibilidad de cada módulo depende de los roles, salones y permisos asignados a su cuenta.</p>'))
    out.append(close())

    # 2
    out.append(chapter('2', 'Primeros pasos', 'primeros-pasos', 'El backoffice es el espacio privado donde trabaja el equipo. Se necesita una cuenta habilitada; nunca compartas tu contraseña.'))
    out.append('<h2>Primer ingreso</h2>')
    out.append(steps([
        'Abrí un navegador actualizado e ingresá a <strong>http://localhost:3000/admin</strong> cuando trabajes en el entorno local autorizado.',
        'En <strong>Usuario o email</strong>, escribí el identificador de tu cuenta.',
        'En <strong>Contraseña</strong>, escribí tu clave. Podés usar “Mostrar contraseña” solamente si nadie más puede ver la pantalla.',
        'Hacé clic en <strong>Ingresar al backoffice</strong>. Si los datos son correctos, se abrirá el Panel principal.',
    ]))
    out.append(figure('01-login.png', 'Pantalla de ingreso al backoffice. La captura no contiene credenciales.'))
    out.append('<h2>Cómo moverte</h2><p>El menú lateral agrupa las áreas de trabajo. Los grupos <strong>Reportes y análisis</strong> y <strong>Configuración y herramientas</strong> se despliegan con un clic. El botón con el logotipo o “Dashboard” vuelve al panel.</p>')
    out.append(figure('03-menu-completo.png', 'Menú lateral completo con todos los módulos disponibles para una cuenta administradora.'))
    out.append('<h2>Cuenta, tema y cierre de sesión</h2>')
    out.append(steps([
        'Hacé clic en tu nombre, arriba a la derecha, para abrir el menú de la cuenta.',
        'Usá <strong>Mi perfil</strong> para cambiar datos personales y contraseña.',
        'Hacé clic en <strong>Cerrar sesión</strong> al terminar. “Cerrar todas las sesiones” también desconecta otros dispositivos y debe usarse sólo cuando corresponda.',
    ]))
    out.append(figure('136-menu-cuenta.png', 'Menú de la cuenta con acceso al perfil y las opciones de cierre de sesión.', True))
    out.append(callout('warning', 'Atención', '<p>No cierres “todas las sesiones” si otras personas comparten legítimamente la misma cuenta. La práctica recomendada es que cada persona tenga su propio usuario.</p>'))
    out.append(close())

    # 3
    out.append(chapter('3', 'Landing pública', 'landing-publica', 'La página pública presenta los salones, paquetes y servicios, y permite solicitar una propuesta o consultar entradas.'))
    out.append('<h2>Secciones visibles</h2><p>La navegación pública incluye Salones, Paquetes, Galería, Preguntas frecuentes, Contacto y Ubicaciones. También muestra cómo trabaja M&M Eventos, tipos de celebraciones, servicios incluidos, promociones, testimonios y un formulario de presupuesto.</p>')
    out.append(figure('141-landing-portada.png', 'Portada de la landing pública real, con navegación, salones y llamados a la acción.'))
    out.append('<h2>Enviar una consulta</h2>')
    out.append(steps([
        'En la sección de contacto, completá nombre, teléfono, email, tipo de evento, fecha tentativa, cantidad de personas y salón de interés.',
        'Escribí un mensaje con la necesidad principal: tipo de celebración, horarios o servicios importantes.',
        'Hacé clic en <strong>Solicitar presupuesto</strong>. La consulta aparecerá en Solicitudes de Presupuestos y generará una notificación interna.',
    ]))
    out.append('<h2>Entradas públicas</h2><p>El enlace <strong>Entradas</strong> abre el catálogo de publicaciones activas. Se puede filtrar por texto y fecha y entrar al detalle de cada experiencia.</p>')
    out.append(figure('140-entradas-catalogo-publico.png', 'Catálogo público de entradas activas.'))
    out.append(close())

    # 4
    out.append(chapter('4', 'Panel principal y calendario', 'panel-calendario', 'El panel prioriza acciones que necesitan atención; el calendario organiza eventos, alertas, tareas, reuniones y vencimientos.'))
    out.append('<h2>Panel principal</h2><p>Los filtros <strong>Desde</strong>, <strong>Hasta</strong> y <strong>Salón</strong> cambian el período de análisis. “Actualizar” vuelve a consultar la información. Los accesos rápidos permiten crear un lead, presupuesto o evento, gestionar ingresos y generar producción.</p>')
    out.append(table(['Indicador', 'Qué significa'], [
        ['Eventos próximos', 'Eventos activos dentro de los próximos 30 días desde la fecha actual.'],
        ['Leads pendientes', 'Consultas que todavía requieren gestión, aunque hayan sido creadas antes del período.'],
        ['Saldo vencido', 'Cuotas pendientes cuyo vencimiento ya pasó.'],
        ['Producciones pendientes', 'Planes de producción que aún no están cerrados.'],
        ['Leads nuevos', 'Consultas creadas dentro del período filtrado.'],
        ['Eventos confirmados', 'Eventos que alcanzaron el estado Confirmado.'],
        ['Total cobrado', 'Ingresos marcados como cobrados dentro del criterio del panel.'],
        ['Pipeline', 'Paso de leads a presupuestos, aceptación, contratos y eventos confirmados.'],
    ]))
    out.append(figure('04-dashboard.png', 'Panel principal con indicadores, pipeline, agenda y alertas.'))
    out.append('<h2>Calendario</h2><p>Permite ver Día, Semana, Mes o Año. Los filtros distinguen eventos, alertas, notas, recordatorios, tareas, pagos y reuniones; también se filtra por estado, prioridad, salón y existencia de aviso.</p>')
    out.append(steps([
        'Hacé clic en <strong>Crear item</strong>.',
        'Elegí tipo, prioridad y visibilidad. “Personal” lo muestra sólo a quien lo crea; “Visible para todos” lo comparte con el equipo autorizado.',
        'Completá título, fecha, horario y salón. Si corresponde, vinculalo con un lead, cliente, evento, presupuesto, contrato, pago o proveedor.',
        'Activá el recordatorio, indicá cuánto antes avisar y escribí el detalle.',
        'Hacé clic en <strong>Crear</strong>.',
    ]))
    out.append(figure('27-calendario-nuevo-item.png', 'Formulario para crear una alerta, recordatorio, nota, tarea, rango de pago o reunión.'))
    out.append(close())

    # 5
    out.append(chapter('5', 'Leads, clientes y presupuestos', 'comercial', 'Estos tres módulos forman la base comercial: una consulta se registra como lead, se cotiza y, cuando avanza, se consolida como cliente.'))
    out.append('<h2>Leads</h2><p>El listado muestra nombre, teléfono, email, tipo y fecha estimativa del evento, cantidad de personas, estado, origen y acciones. Se puede filtrar por estado, origen, salón y cantidad de resultados por página.</p>')
    out.append(figure('06-leads.png', 'Listado de leads con filtros, estados y acciones.'))
    out.append('<h3>Crear un lead</h3>')
    out.append(steps([
        'Hacé clic en <strong>Nuevo lead</strong>.',
        'Completá nombre, apellido y teléfono. Agregá email si está disponible.',
        'Elegí el origen real: Formulario web, Cotización rápida, WhatsApp, Manual, Promoción, Entrada, Invitación u Otro.',
        'Indicá tipo de evento, fecha estimativa, cantidad de personas y uno o más salones de interés.',
        'Escribí el mensaje recibido y reservá <strong>Notas internas</strong> para información del equipo.',
        'Hacé clic en <strong>Guardar lead</strong>.',
    ]))
    out.append(figure('28-lead-nuevo.png', 'Alta de un lead: datos de contacto, origen, evento, salones y notas.'))
    out.append('<h3>Gestionar el lead</h3><p>En el detalle se puede cambiar el estado, enviar email o WhatsApp, editar, agregar notas y revisar actividad, solicitudes, presupuestos y eventos relacionados.</p>')
    out.append(figure('43-lead-detalle.png', 'Detalle de un lead con estado y relaciones comerciales.'))
    out.append('<h2>Clientes</h2><p>Un cliente puede surgir de la conversión de un presupuesto o cargarse manualmente. El detalle reúne datos personales, origen, total contratado, cobrado, pendiente, garantía, presupuestos, eventos, contratos y actividad.</p>')
    out.append(steps([
        'Para una carga directa, hacé clic en <strong>Nuevo cliente</strong>.',
        'Completá nombre, apellido, teléfono y email. El documento, ocupación, fecha de nacimiento, domicilio, salones y notas mejoran la ficha y pueden ser necesarios para contratos.',
        'Hacé clic en <strong>Guardar cliente</strong>.',
    ]))
    out.append(figure('29-cliente-nuevo.png', 'Formulario de nuevo cliente.'))
    out.append('<h2>Solicitudes y presupuestos</h2><p>La pestaña <strong>Solicitudes</strong> contiene pedidos ingresados desde la web. Sus estados son Nueva, En revisión, Presupuestada, Descartada y Duplicada. La pestaña <strong>Presupuestos</strong> contiene las propuestas emitidas.</p>')
    out.append(figure('99-presupuestos-listado.png', 'Listado de presupuestos con estados y acciones.'))
    out.append('<h3>Crear un presupuesto</h3>')
    out.append(steps([
        'Hacé clic en <strong>Nuevo presupuesto</strong>.',
        'Usá <strong>Buscar</strong> para elegir un lead o cliente existente. Usá “Persona nueva” sólo si todavía no existe.',
        'Verificá nombre, teléfono, email, tipo, fecha y cantidad de personas. Completá homenajeado, mantelería y restricciones alimentarias.',
        'Marcá uno o más salones. El sistema crea un presupuesto independiente por cada salón seleccionado.',
        'Elegí el paquete. Revisá modalidad, valor por persona o total, descuento, seña, promoción, regalo y condiciones de pago.',
        'Revisá menú, servicios incluidos y observaciones internas.',
        'Hacé clic en <strong>Crear presupuesto</strong>.',
    ]))
    out.append(figure('122-flujo-presupuesto-formulario.png', 'Presupuesto completo vinculado a un lead ficticio y al salón San Carlos.'))
    out.append(callout('important', 'Importante', '<p>Elegir varios salones no combina valores: genera propuestas separadas. Antes de crear, revisá que la cantidad de personas sea compatible con la capacidad del salón.</p>'))
    out.append(close())

    # 6
    out.append(chapter('6', 'Flujo comercial completo', 'flujo-comercial', 'Este capítulo reproduce una operación real de prueba: lead → presupuesto → evento → contrato → pago.'))
    out.append('<h2>Ejemplo utilizado</h2><p><strong>Manual QA Operador</strong>, cumpleaños para 80 personas, San Carlos, paquete Banquete Premium. Todos los datos son ficticios y fueron creados desde la interfaz local.</p>')
    out.append('<h2>Paso 1 — Crear y gestionar el lead</h2>')
    out.append(steps([
        'Abrí Leads y hacé clic en “Nuevo lead”.',
        'Registrá contacto, origen, tipo de evento, fecha, personas y salón.',
        'Guardá. En el detalle, cambiá el estado a medida que avances: Nuevo, Contactado, Seguimiento, Presupuesto enviado o Negociación.',
    ]))
    out.append(figure('121-flujo-lead-creado.png', 'Lead ficticio creado para el recorrido del manual.'))
    out.append('<h2>Paso 2 — Cotizar</h2><p>Desde Presupuestos, elegí el lead existente. El paquete completa valores, menú y servicios; revisalos antes de guardar.</p>')
    out.append(figure('123-flujo-presupuesto-creado.png', 'Presupuesto Banquete Premium creado en estado Borrador.'))
    out.append('<h2>Paso 3 — Aceptar y crear el evento</h2>')
    out.append(steps([
        'Abrí el presupuesto y revisá el documento comercial.',
        'Hacé clic en <strong>Aceptar y crear evento</strong>. El presupuesto queda Aceptado.',
        'Luego hacé clic en <strong>Crear evento</strong>. El presupuesto cambia a Convertido y aparece “Ver evento”.',
        'Hacé clic en “Ver evento” para continuar.',
    ]))
    out.append(figure('124-flujo-presupuesto-convertido.png', 'Presupuesto convertido con acceso directo al evento.'))
    out.append(figure('126-flujo-evento-creado.png', 'Evento creado con total, saldo y plan operativo inicial.'))
    out.append('<h2>Paso 4 — Completar datos contractuales</h2><p>En la pestaña Cliente, hacé clic en “Ver cliente” y completá documento, domicilio y ocupación. En Ficha verificá fecha, horario, invitados y datos del evento.</p>')
    out.append('<h2>Paso 5 — Crear y aprobar el contrato</h2>')
    out.append(steps([
        'Abrí la pestaña <strong>Contrato</strong>.',
        'Verificá que cada requisito del checklist diga “OK”.',
        'Hacé clic en <strong>Crear contrato</strong>. Se genera en Pendiente de aprobación.',
        'Abrí “Ver contrato”, revisá cliente, evento, servicios, menú, valores y condiciones.',
        'Hacé clic en <strong>Aprobar</strong> sólo cuando la información refleje lo acordado.',
    ]))
    out.append(figure('128-flujo-contrato-checklist.png', 'Checklist completo antes de crear el contrato.'))
    out.append(figure('129-flujo-contrato-generado.png', 'Contrato generado y pendiente de aprobación.'))
    out.append(figure('130-flujo-contrato-aprobado.png', 'Contrato aprobado con total contractual y saldo.'))
    out.append('<h2>Paso 6 — Registrar la seña</h2>')
    out.append(steps([
        'Volvé al evento y verificá el estado. Después de aprobar el contrato, debe avanzar a “Seña pendiente”; si conserva “Contrato borrador”, elegí manualmente “Seña pendiente”.',
        'Abrí Pagos y elegí <strong>Seña</strong>.',
        'Escribí el importe efectivamente recibido, el medio, la referencia y una nota útil.',
        'Hacé clic en <strong>Registrar pago</strong>.',
        'Confirmá que aumente “Ya abonado”, disminuya “Restante a pagar” y aparezca el movimiento en Historial de pagos. Si no se refresca de inmediato, salí y volvé a Pagos.',
    ]))
    out.append(figure('131-flujo-pago-formulario.png', 'Ejemplo real: seña de prueba por transferencia.'))
    out.append(figure('135-flujo-resultado-final-con-sena.png', 'Resultado final: seña registrada, total abonado y saldo restante.'))
    out.append(callout('warning', 'Comportamiento observado', '<p>Durante la revisión, la aprobación del contrato no actualizó automáticamente el estado del evento y el historial de pagos necesitó recargar la pantalla. Verificá siempre ambos resultados.</p>'))
    out.append(close())

    # 7
    out.append(chapter('7', 'Eventos y operación integral', 'eventos', 'El evento concentra toda la información de la venta y la ejecución. Es la pantalla principal para coordinar al equipo.'))
    out.append('<h2>Listado de eventos</h2><p>Se filtra por estado, salón y cantidad por página. Cada fila muestra evento/cliente, fecha, salón, tipo, presupuesto de origen y estado. “Nuevo evento” permite crear uno directo o desde un presupuesto; “Cierre integral” abre el expediente de cierre.</p>')
    out.append(figure('09-eventos.png', 'Listado general de eventos.'))
    out.append('<h2>Resumen</h2><p>Muestra importe total, abonado, restante, gastos confirmados, resultado estimado, tipo, fecha, horario, personas, salón, pulso operativo y progreso de tareas.</p>')
    out.append(figure('53-evento-resumen.png', 'Resumen de un evento histórico sintético de julio de 2026.'))
    out.append('<h2>Ficha, cliente y comercial</h2>')
    out.append(table(['Pestaña', 'Uso'], [
        ['Ficha', 'Nombre, tipo, homenajeado, fecha, horario, invitados, restricciones, mantelería y notas.'],
        ['Cliente', 'Cliente, lead de origen y presupuestos relacionados.'],
        ['Comercial', 'Total acordado, seña, condiciones y generación del plan de cuotas.'],
    ]))
    out.append(figure('54-evento-ficha.png', 'Ficha editable del evento.'))
    out.append(figure('56-evento-comercial.png', 'Valores y plan de pagos del evento.'))
    out.append('<h2>Menú y servicios</h2><p>El menú se organiza en secciones y platos o ítems. Los cambios del evento no alteran el presupuesto ni la plantilla original. Servicios permite detallar bebidas, barra, mantelería, catering, ambientación, salón y servicios externos.</p>')
    out.append(figure('57-evento-menu.png', 'Menú organizado por secciones.'))
    out.append(figure('58-evento-servicios.png', 'Servicios incluidos y detalle operativo.'))
    out.append('<h2>Proveedores, staff y tareas</h2>')
    out.append(steps([
        'En Proveedores, usá “Asignar proveedor” o “Alta rápida”. Indicá estado, servicio, llegada, monto y notas.',
        'Una asignación Confirmada o Pagada genera o actualiza el gasto del evento sin duplicarlo.',
        'En Staff, hacé clic en “Asignar integrante”, elegí persona, rol y turno. Confirmá, cancelá o quitá según corresponda.',
        'En Tareas, agregá responsable, prioridad y estado. Una tarea Bloqueada debe resolverse antes del cierre.',
    ]))
    out.append(figure('60-evento-proveedores.png', 'Proveedores asignados y gastos asociados.'))
    out.append(figure('61-evento-staff.png', 'Equipo y turnos del evento.'))
    out.append(figure('62-evento-tareas.png', 'Tareas, prioridades, estados y alertas.'))
    out.append('<h2>Cronograma y documentos operativos</h2><p>El cronograma reúne momentos, invitados, logística, vajilla, stock, proveedores y staff. Desde allí se generan vistas previas, PDF, Word, email o WhatsApp para el cronograma integral, control de ingreso, logística y reserva de vajilla.</p>')
    out.append(figure('63-evento-cronograma.png', 'Cronograma integral con momentos y documentos operativos.'))
    out.append('<h2>Actividad</h2><p>Registra cambios importantes y permite agregar notas. Usalo para dejar contexto que deba quedar asociado al evento.</p>')
    out.append(close())

    # 8
    out.append(chapter('8', 'Invitados, mesas, logística y stock', 'invitados-mesas', 'Estas herramientas están dentro de Cronograma y permiten preparar recepción, salón, cocina, barra y materiales.'))
    out.append('<h2>Invitados y mesas</h2>')
    out.append(steps([
        'Abrí el evento, entrá en Cronograma y elegí <strong>Lista invitados y mesas</strong>.',
        'Para crear una mesa, hacé clic en “Nueva mesa”, escribí el nombre y la capacidad.',
        'Para crear un invitado, hacé clic en “Agregar invitado”. Registrá nombre, confirmación, menú o restricción, edad/menor y observaciones si el formulario las solicita.',
        'Asigná invitados arrastrándolos a una mesa. En pantallas pequeñas, editá el invitado y elegí la mesa.',
        'Controlá que ninguna mesa exceda su capacidad y que no queden invitados sin asignar.',
        'Hacé clic en “Guardar cambios”.',
    ]))
    out.append(figure('68-invitados-mesas.png', 'Plano visual: 70 invitados, 7 mesas, capacidades y restricciones.'))
    out.append('<h3>Enlace público para el cliente</h3><p>“Crear enlace cliente” genera un acceso que puede compartirse para colaborar con la lista. Antes de enviarlo, verificá que corresponda al evento correcto y que no exponga información innecesaria.</p>')
    out.append('<h2>Logística</h2><p>Organiza armado, cocina, barra y bebidas, ambientación/mantelería/vajilla, ingreso/accesos, cierre y puntos críticos. “Usar guía” completa una base que luego debe adaptarse al evento.</p>')
    out.append(figure('69-logistica.png', 'Guías de logística y coordinación interna.'))
    out.append('<h2>Vajilla y stock</h2><p>“Prearmar por invitados” calcula una base según la cantidad de personas. La tabla compara stock, reservado, disponible y cantidad a asignar. “Completar faltantes” ayuda a detectar necesidades. La vajilla adicional representa préstamo, alquiler o compra externa y no descuenta el stock del salón.</p>')
    out.append(figure('70-vajilla-stock.png', 'Reserva de vajilla propia y adicional.'))
    out.append('<h2>Stock de productos</h2><p>Los insumos se clasifican como Salados, Dulces, Bebidas u Otros. Cada ítem admite categoría, cantidad, unidad, proveedor, costo y estado: Planificado, Reservado, Comprado, Usado, Entregado, Devuelto, Faltante o Roto.</p>')
    out.append(figure('71-stock-productos.png', 'Insumos y estados del stock del evento.'))
    out.append('<h2>Cierre integral</h2>')
    out.append(steps([
        '<strong>Cierre operativo:</strong> el evento ocurrió, la producción está generada y cerrada, no hay bloqueos y las asignaciones de personal finalizaron.',
        '<strong>Cierre financiero:</strong> exige cierre operativo, contrato activo y aprobado, saldo resuelto, ausencia de pagos/gastos pendientes y costos cargados.',
        '<strong>Cierre administrativo:</strong> exige los dos cierres anteriores y que cliente y contrato estén asociados.',
        'Hacé clic en “Cerrar etapa” sólo cuando todos los requisitos estén cumplidos. Si aparece “Resolvé N requisitos”, corregí lo pendiente y volvé.',
    ]))
    out.append(figure('72-cierre-integral-detalle.png', 'Cierre integral: operativo listo, financiero bloqueado por un requisito y administrativo pendiente.'))
    out.append(callout('warning', 'Orden obligatorio', '<p>Las etapas se cierran en orden. Reabrir una etapa anterior también reabre las posteriores para evitar inconsistencias.</p>'))
    out.append(close())

    # 9
    out.append(chapter('9', 'Contratos', 'contratos', 'El contrato formaliza cliente, evento, servicios, menú, valores y condiciones. Debe revisarse antes de aprobarse.'))
    out.append('<h2>Listado y estados</h2><p>El listado muestra número, cliente, evento, fecha, salón, base, adendas aprobadas, total y estado. Se filtra por estado y cantidad por página.</p>')
    out.append(figure('10-contratos.png', 'Listado de contratos.'))
    out.append('<h2>Crear y revisar</h2>')
    out.append(steps([
        'Desde el evento, abrí Contrato y completá todos los requisitos del checklist.',
        'Hacé clic en “Crear contrato”.',
        'En el detalle revisá Resumen, Cliente, Evento, Servicios, Menú, Valores, Adendas, Condiciones y Actividad.',
        'Usá “Vista previa” antes de aprobar. Si algo debe corregirse, elegí “Requiere cambios”.',
        'Hacé clic en “Aprobar” cuando coincida con lo acordado. Luego podés generar el PDF.',
    ]))
    out.append(figure('46-contrato-detalle.png', 'Detalle de contrato y pestañas de revisión.'))
    out.append('<h2>Adendas</h2><p>Las adendas registran modificaciones posteriores. Una adenda aprobada se suma al valor contractual; una borrador o pendiente todavía no debe considerarse definitiva. Si una versión reemplaza a otra, conservá el historial y verificá cuál está activa.</p>')
    out.append(callout('important', 'No confundas', '<p><strong>Cancelar</strong> deja el contrato sin vigencia; <strong>Requiere cambios</strong> lo devuelve para corrección; <strong>Reemplazado</strong> indica que otra versión ocupa su lugar. Eliminar no es una acción habitual en esta etapa.</p>'))
    out.append(close())

    # 10
    out.append(chapter('10', 'Ingresos y pagos', 'pagos', 'Ingresos reúne señas, cuotas, saldos, extras, ajustes, reembolsos y depósitos vinculados con contratos o entradas digitales.'))
    out.append('<h2>Listado</h2><p>Se filtra por estado, tipo, medio y origen manual/entradas. Las columnas muestran número, fecha, vencimiento, cliente, evento, contrato, salón, tipo, medio, importe y estado.</p>')
    out.append(figure('14-ingresos.png', 'Listado de ingresos y filtros.'))
    out.append('<h2>Registrar desde un evento</h2>')
    out.append(steps([
        'Abrí el evento y entrá en Pagos.',
        'Elegí tipo: Seña, Cuota, Saldo, Extra, Ajuste u Otro.',
        'Si elegís Cuota, seleccioná una cuota pendiente o usá importe libre. El excedente puede aplicarse a las cuotas siguientes.',
        'Escribí el importe realmente recibido.',
        'Elegí Efectivo, Transferencia, Mercado Pago, Tarjeta u Otro.',
        'Agregá comprobante/referencia y notas.',
        'Hacé clic en “Registrar pago” y verificá indicadores e historial.',
    ]))
    out.append('<h2>Estados</h2><p><strong>Pendiente</strong> todavía no se cobró; <strong>Cobrado</strong> impacta el saldo; <strong>Cancelado</strong> queda sin efecto; <strong>Reembolsado</strong> registra una devolución. “Marcar cobrado”, “Reembolsar” y “Cancelar” cambian el movimiento y deben usarse con respaldo administrativo.</p>')
    out.append(figure('48-ingreso-detalle.png', 'Detalle de un ingreso con asociaciones, medio y referencias.'))
    out.append(callout('warning', 'Riesgo financiero', '<p>No registres importes estimados como cobrados. Primero confirmá el ingreso real y su referencia. Las pruebas de entradas digitales no deben usar pagos reales.</p>'))
    out.append(close())

    # 11
    out.append(chapter('11', 'Proveedores, gastos y rentabilidad', 'proveedores-gastos', 'Los proveedores forman el catálogo; los gastos registran el costo real y la rentabilidad compara ingresos con costos.'))
    out.append('<h2>Proveedores</h2><p>Se filtra por categoría y estado. Cada ficha contiene proveedor, categoría, contacto, teléfono, WhatsApp, email y activo/inactivo.</p>')
    out.append(steps([
        'Hacé clic en “Nuevo proveedor”.',
        'Completá identidad, categoría, contacto y canales disponibles.',
        'Dejá “Activo” marcado mientras pueda seleccionarse en eventos y gastos.',
        'Hacé clic en “Guardar”. Editar modifica la ficha; Eliminar debe reservarse para registros cargados por error y sin uso.',
    ]))
    out.append(figure('20-proveedores.png', 'Listado de proveedores.'))
    out.append(figure('39-proveedor-nuevo.png', 'Alta de un proveedor.'))
    out.append('<h2>Gastos</h2><p>El módulo separa Gastos, Por proveedor y Rentabilidad. Un gasto puede vincularse a salón y evento o quedar como gasto general.</p>')
    out.append(steps([
        'Si hace falta, creá primero una categoría con nombre, código y tipo.',
        'Hacé clic en “Registrar gasto”.',
        'Completá fecha, concepto, salón/evento, proveedor y categoría.',
        'Registrá estimado inicial, importe final, adicional e impuestos. El total es final + adicional + impuestos.',
        'Elegí Pendiente, Pagado o Cancelado, medio, comprobante y notas.',
        'Hacé clic en “Guardar gasto”.',
    ]))
    out.append(figure('35-gasto-registrar.png', 'Formulario de gasto con relación a evento, proveedor y categoría.'))
    out.append('<div class="module-empty"><strong>Situación actual:</strong> el listado de gastos no muestra registros para los filtros revisados. Para comenzar, creá una categoría si no existe y luego registrá el primer gasto.</div>')
    out.append('<h2>Rentabilidad</h2><p><strong>Resultado</strong> es ingreso menos gastos. <strong>Margen</strong> indica qué porcentaje del ingreso queda después de descontar gastos. Revisá siempre el período, el salón y si los costos son definitivos.</p>')
    out.append(figure('79-rentabilidad.png', 'Vista de rentabilidad por período y salón.'))
    out.append(close())

    # 12
    out.append(chapter('12', 'Producción', 'produccion', 'Producción controla lo que debe prepararse antes de un evento, con cantidades, responsables, estados y reglas auditables.'))
    out.append('<h2>Por evento</h2><p>Los estados visibles son Pendiente, En proceso, Lista, Chequeada, Bloqueada, Cancelada y Cerrada. Cada fila muestra fecha, evento/cliente, salón, invitados, avance, bloqueos y estado.</p>')
    out.append(figure('17-produccion.png', 'Planes de producción por evento.'))
    out.append('<h3>Generar producción</h3>')
    out.append(steps([
        'Hacé clic en “Generar producción”.',
        'Elegí un evento próximo. Volver a generar no duplica productos; si cambió el evento, puede crear una nueva versión.',
        'Abrí el plan y verificá si quedó desactualizado.',
        'Agregá ítems manuales o configurá reglas si el evento no generó productos.',
        'Actualizá cantidades, responsables y estados. Resolver ítems bloqueados es obligatorio antes del cierre.',
        'Usá “Cerrar producción” cuando los ítems estén preparados y chequeados.',
    ]))
    out.append(figure('36-produccion-generar.png', 'Selección del evento para generar producción.'))
    out.append(figure('74-produccion-plan.png', 'Plan existente sin ítems: requiere carga manual o reglas aplicables.'))
    out.append('<h2>Consolidado, reglas y catálogo</h2>')
    out.append(table(['Vista', 'Para qué sirve'], [
        ['Consolidado', 'Suma cantidades normalizadas de varios eventos y las compara con stock.'],
        ['Reglas', 'Define qué productos se generan según paquete, servicio u otras condiciones.'],
        ['Catálogo', 'Mantiene los productos disponibles, unidades y stock relacionado.'],
    ]))
    out.append(figure('76-produccion-reglas.png', 'Reglas de generación automática.'))
    out.append(figure('77-produccion-catalogo.png', 'Catálogo de producción.'))
    out.append(close())

    # 13
    out.append(chapter('13', 'Invitaciones digitales', 'invitaciones', 'Las invitaciones son independientes de las entradas: sirven para comunicar una celebración y recibir confirmaciones de asistencia.'))
    out.append('<h2>Crear una invitación</h2>')
    out.append(steps([
        'Hacé clic en “Nueva invitación”.',
        'Elegí el tipo de celebración y una plantilla sugerida. Las plantillas Basic y Premium ofrecen capacidades diferentes.',
        'Completá título público, homenajeado o anfitriones, fecha/hora, cierre de confirmaciones, lugar, Maps y bienvenida.',
        'Guardá para abrir el editor visual.',
        'En el editor, configurá secciones, colores, tipografías, fondos, hero, galería, ubicación, dress code, RSVP y cierre.',
        'Usá Vista previa y guardá. Publicá sólo cuando los datos sean correctos.',
        'Copiá la URL o compartila por correo o WhatsApp.',
    ]))
    out.append(figure('32-invitacion-nueva.png', 'Selección de celebración, plantilla y datos principales.'))
    out.append(figure('47-invitacion-editar.png', 'Editor visual de invitación con secciones, diseño y vista previa.'))
    out.append('<h2>Estados y acciones</h2><p>Una invitación Desactivada/Borrador todavía no debe compartirse como definitiva. “Activar” la publica; “Editar” cambia contenido; “Clonar” crea una copia; “Eliminar” quita el registro. Las plantillas y ejemplos ayudan a elegir una base.</p>')
    out.append(figure('80-invitaciones-plantillas.png', 'Biblioteca de plantillas de invitaciones.'))
    out.append(close())

    # 14
    out.append(chapter('14', 'Entradas digitales', 'entradas', 'Entradas digitales administra publicaciones con venta, compradores, QR y control de ingreso. No está ligada obligatoriamente a un evento interno.'))
    out.append('<h2>Crear una publicación</h2>')
    out.append(steps([
        'Hacé clic en “Nueva publicación”.',
        'En General, completá nombre interno, título público, identificador público, categoría y descripción.',
        'Configurá Multimedia, Fecha y ubicación, Entradas y precios, Compradores, Pagos, Políticas, Apariencia y Publicación.',
        'En Entradas y precios creá cada tipo con nombre, precio, cantidad y condiciones.',
        'Revisá la vista pública. Publicá o programá únicamente cuando los datos estén completos.',
    ]))
    out.append(figure('33-entrada-nueva-publicacion.png', 'Nueva publicación y sus áreas de configuración.'))
    out.append('<h2>Panel, ventas y compradores</h2><p>El panel resume publicaciones activas, vendidas, disponibles, recaudación, pendientes y reembolsos. Los estados son Borrador, Programada, Activa, Pausada, Agotada, Finalizada, Cerrada, Cancelada y Archivada. Pausar detiene temporalmente; Archivar la retira de la operación habitual.</p>')
    out.append(figure('12-entradas-digitales.png', 'Panel de publicaciones de entradas.'))
    out.append('<h2>QR y validación</h2>')
    out.append(steps([
        'Abrí “Escanear Entradas” y elegí la publicación correcta.',
        'Hacé clic en “Abrir cámara” y autorizá el permiso, o escribí el código manual.',
        'Hacé clic en “Validar”. Permití el ingreso sólo si el resultado protegido indica que la entrada es válida y no utilizada.',
        'Si aparece utilizada, anulada, devuelta o inválida, no permitas el ingreso hasta que administración lo resuelva.',
    ]))
    out.append(figure('138-scanner-validacion.png', 'Control de ingreso con cámara opcional y código manual.'))
    out.append(callout('warning', 'Pagos reales', '<p>Durante pruebas no completes compras reales. Si existe integración con Mercado Pago, usá únicamente el modo de prueba autorizado por administración.</p>'))
    out.append(close())

    # 15
    out.append(chapter('15', 'Salones, paquetes e inventario', 'salones-paquetes', 'Los salones definen capacidad, datos comerciales, paquetes, stock, asistencia y contenido público.'))
    out.append('<h2>Salones</h2><p>El listado muestra encargado, localidad, capacidad, WhatsApp, paquetes activos, visibilidad web y estado. Se filtra por activo/inactivo y visible/oculto.</p>')
    out.append(steps([
        'Hacé clic en “Nuevo salón”.',
        'Completá nombre, identificador público, dirección, localidad, WhatsApp, email y redes.',
        'Elegí encargado y capacidad máxima.',
        'Escribí una descripción pública y definí Activo/Visible en web.',
        'Guardá y continuá la configuración desde el detalle.',
    ]))
    out.append(figure('23-salones.png', 'Listado de salones y datos principales.'))
    out.append(figure('41-salon-nuevo.png', 'Alta de un salón.'))
    out.append('<h2>Paquetes</h2><p>En la pestaña Paquetes se distinguen plantillas globales y reglas del salón. “Nuevo paquete para este salón” lo limita al espacio actual; “Nuevo paquete global” lo pone a disposición de todos. Una regla puede activarse o desactivarse por salón.</p>')
    out.append(figure('51-salon-paquetes.png', 'Paquetes y reglas del salón San Carlos.'))
    out.append('<h2>Stock e inventario</h2><p>La pestaña Stock mantiene artículos y cantidades del salón. La reserva real se visualiza en cada evento, donde se compara stock, reservado y disponible. Registrá faltantes y material externo para que producción y cierre puedan controlarlos.</p>')
    out.append(callout('important', 'Activar, desactivar y eliminar', '<p>Desactivar conserva el registro y evita su uso normal. Eliminar puede perder la referencia y sólo debe usarse si la interfaz lo permite y el salón no tiene relaciones relevantes.</p>'))
    out.append(close())

    # 16
    out.append(chapter('16', 'Usuarios, roles, asistencia y sueldos', 'equipo', 'La ficha de una persona reúne cuenta, roles, salones, operación, asistencia y permisos específicos.'))
    out.append('<h2>Crear un usuario</h2>')
    out.append(steps([
        'Hacé clic en “Nuevo usuario”.',
        'Completá identidad, contacto y contraseña inicial. Comunicá la clave por un canal seguro y pedí cambiarla.',
        'Marcá uno o más roles: Administrador, Manager, Encargado salón o Staff.',
        'Elegí salones con acceso, salón principal y, si corresponde, salones a cargo.',
        'Definí si está activo y si puede entrar al backoffice. Un Staff activo puede acceder a la app móvil según sus permisos.',
        'Guardá y revisá “Accesos y permisos”.',
    ]))
    out.append(figure('42-usuario-nuevo.png', 'Alta de usuario, roles y salones.'))
    out.append('<h2>Roles y permisos reales</h2>')
    out.append(table(['Rol', 'Comportamiento habitual verificado en la interfaz'], [
        ['Administrador', 'Puede administrar áreas, usuarios, salones, permisos y operación general. Los bloqueos específicos siguen teniendo prioridad.'],
        ['Manager', 'Rol de gestión. Su alcance depende de salones asignados y áreas habilitadas; no debe asumirse acceso total.'],
        ['Encargado de salón', 'Se orienta a operación del salón asignado. Las áreas financieras, usuarios o configuración pueden estar ocultas.'],
        ['Staff', 'Puede tener sólo app móvil y autogestión: fichaje, historial, turnos, incidencias, liquidaciones y perfil. Puede quedar sin acceso al backoffice.'],
    ]))
    out.append('<p>La pantalla permite dar o quitar acceso a cada área y, en algunas, habilitar acciones como Ver, Crear, Editar, Cancelar o Eliminar. Por eso el nombre del rol no alcanza para saber qué puede hacer una cuenta.</p>')
    out.append(figure('137-roles-permisos.png', 'Accesos por área y acciones permitidas.'))
    out.append('<h2>Asistencia</h2><p>Las pestañas Activos, Historial, Incidencias, Correcciones y Configuración supervisan jornadas de la app móvil. La configuración incluye zona horaria, precisión de ubicación, geocerca, tolerancias, jornada máxima, turno obligatorio e incidencias.</p>')
    out.append(figure('25-asistencia.png', 'Asistencia en vivo; actualmente no hay jornadas activas.'))
    out.append(figure('105-asistencia-configuracion.png', 'Configuración operativa de asistencia.'))
    out.append('<h2>Liquidación de sueldos</h2><p>Incluye Resumen, Asistencias, Liquidaciones, Lotes, Adelantos y ajustes, Empleados, Conceptos e Historial. Sólo deben incluirse asistencias aprobadas y no reservadas.</p>')
    out.append(steps([
        'Para una persona, hacé clic en “Liquidación individual”, elegí empleado y período y generá borrador.',
        'Para varias personas, usá “Nuevo lote”. El asistente tiene cinco pasos: alcance, validación, cálculo, revisión y cierre.',
        'Revisá conceptos, adelantos, ajustes y neto antes de aprobar o registrar pago.',
        'Conservá Historial y auditoría para reconstruir cada cambio.',
    ]))
    out.append(figure('38-sueldos-nuevo-lote.png', 'Primer paso del asistente de lote de liquidación.'))
    out.append('<div class="module-empty"><strong>Situación actual:</strong> el período revisado no muestra liquidaciones ni importes pendientes. Hay empleados sin perfil salarial; deben configurarse antes de calcular.</div>')
    out.append(close())

    # 17
    out.append(chapter('17', 'Reportes y analítica', 'reportes', 'Los reportes responden preguntas operativas y financieras; la analítica mide el uso anónimo de la página pública.'))
    out.append('<h2>Centro de reportes</h2><p>Incluye Leads, Presupuestos, Eventos, Contratos, Pagos y cobranzas, Control de pagos mensual y Gastos. Cada reporte ofrece filtros propios y exportación sólo si el rol lo permite.</p>')
    out.append(figure('16-reportes.png', 'Centro de reportes organizado por Comercial, Operación y Finanzas.'))
    out.append(table(['Métrica', 'Explicación sencilla'], [
        ['Conversión', 'Porcentaje de registros que avanzó a la etapa siguiente.'],
        ['Contratado', 'Valor aprobado en contratos dentro del criterio del reporte.'],
        ['Cobrado', 'Importes efectivamente marcados como cobrados.'],
        ['Saldo', 'Parte del contrato que todavía no fue cubierta por cobros que afectan saldo.'],
        ['Vencido', 'Importes pendientes cuya fecha límite ya pasó.'],
        ['Gasto', 'Costo registrado según fecha efectiva, categoría, salón o evento.'],
        ['Margen', 'Porcentaje del ingreso que queda después de descontar gastos.'],
    ]))
    out.append('<h3>Cómo usar un reporte</h3>')
    out.append(steps([
        'Elegí el reporte y leé la descripción del criterio temporal.',
        'Definí Desde/Hasta y los filtros de salón, estado, responsable o tipo.',
        'Aplicá filtros y comprobá el total de registros.',
        'Revisá indicadores y detalle. Exportá sólo la información necesaria y protegé el archivo resultante.',
    ]))
    out.append(figure('90-reporte-control-pagos.png', 'Control mensual de pagos por cliente y contrato.'))
    out.append('<h2>Analítica del sitio</h2><p>Mide visitantes, sesiones, vistas, duración, rebote, conversión, clics, formularios e interacción por sección. No registra valores de formularios ni graba sesiones. También dispone de mapa de calor y configuración de privacidad.</p>')
    out.append(figure('18-analitica.png', 'Resumen de analítica propia.'))
    out.append(figure('83-analitica-mapa-calor.png', 'Mapa de calor de interacción.'))
    out.append(close())

    # 18
    out.append(chapter('18', 'Marketing y notificaciones', 'marketing', 'Marketing administra campañas, plantillas y audiencias; Notificaciones concentra avisos operativos.'))
    out.append('<h2>Marketing</h2><p>Las áreas son Resumen, Campañas, Plantillas, Audiencias, Historial de envíos y Configuración. El resumen muestra campañas activas/programadas, envíos, tasas y contactos alcanzables.</p>')
    out.append(steps([
        'Hacé clic en “Nueva campaña”.',
        'Escribí un nombre interno, elegí salón y audiencia inicial y agregá descripción.',
        'Guardá y continuá con contenido, destinatarios, pruebas y programación.',
        'Antes de enviar, verificá asunto, remitente, enlaces, audiencia y derecho de baja. Usá envío de prueba cuando esté disponible.',
    ]))
    out.append(figure('40-marketing-nueva-campana.png', 'Alta inicial de campaña; guardar crea un borrador, no envía.'))
    out.append('<div class="module-empty"><strong>Situación actual:</strong> no hay campañas enviadas ni programadas, por lo que las tasas de entrega, apertura y clic todavía no tienen datos.</div>')
    out.append('<h2>Notificaciones</h2><p>Se filtran por Todas, Sin leer y Leídas. Cada aviso permite abrir el área relacionada, marcar como leído o eliminar. “Marcar todo como leído” no resuelve la tarea: sólo cambia el estado visual.</p>')
    out.append(figure('22-notificaciones.png', 'Notificaciones operativas y accesos directos.'))
    out.append(close())

    # 19
    out.append(chapter('19', 'Configuración y perfil', 'configuracion', 'La configuración visible se divide entre contenido público, parámetros generales y datos de la propia cuenta.'))
    out.append('<h2>Landing</h2><p>Permite modificar Hero, Promociones, Galería, FAQ, Testimonios, Servicios, Tipos de evento y Cómo trabajamos. En Hero se cambian título, texto, botones, imagen o video; también contacto y SEO.</p>')
    out.append(steps([
        'Abrí la pestaña que querés modificar.',
        'Cambiá únicamente textos, imágenes o elementos autorizados.',
        'Guardá cambios y hacé clic en “Ver landing”.',
        'Revisá escritorio y celular antes de considerar publicada la modificación.',
    ]))
    out.append(figure('26-landing.png', 'Configuración del hero, contacto y SEO de la landing.'))
    out.append(figure('113-landing-promociones.png', 'Edición de promociones públicas.'))
    out.append('<h2>Configuración general</h2><p>La pantalla muestra parámetros persistidos con clave, valor, descripción y última actualización. Modificá sólo valores comprendidos y autorizados; no contiene configuración del servidor.</p>')
    out.append(figure('98-configuracion.png', 'Configuración general visible.'))
    out.append('<h2>Mi perfil</h2><p>Permite cambiar nombre, apellido, email, teléfono, documento y avatar. Para cambiar contraseña se exige contraseña actual, nueva y confirmación.</p>')
    out.append(figure('97-perfil.png', 'Perfil, avatar y cambio de contraseña.'))
    out.append(close())

    # 20
    out.append(chapter('20', 'Estados del sistema', 'estados', 'Los estados indican en qué punto se encuentra un registro. Cambiarlos modifica reportes, alertas y acciones disponibles.'))
    out.append('<h2>Leads</h2>')
    out.append(table(['Estado', 'Significado'], [
        ['Nuevo', 'Consulta ingresada, todavía sin gestión.'], ['Contactado', 'El equipo logró el primer contacto.'], ['Seguimiento', 'Necesita nuevas acciones.'], ['Presupuesto enviado', 'La propuesta fue compartida.'], ['Negociación', 'Se están acordando condiciones.'], ['Ganado', 'La oportunidad se considera ganada.'], ['Perdido', 'No continuará.'], ['Convertido', 'Ya generó cliente/evento mediante presupuesto.'],
    ]))
    out.append('<h2>Presupuestos</h2>')
    out.append(table(['Estado', 'Significado'], [
        ['Borrador', 'Todavía se está preparando.'], ['Enviado', 'Fue compartido con el cliente.'], ['En seguimiento', 'Requiere contacto posterior.'], ['Aceptado', 'El cliente aceptó; todavía puede faltar crear el evento.'], ['Rechazado', 'El cliente no aceptó.'], ['Vencido', 'Superó su vigencia.'], ['Convertido', 'Ya creó o está vinculado a un evento.'],
    ]))
    out.append('<h2>Eventos</h2>')
    out.append(table(['Estado', 'Significado'], [
        ['Borrador', 'Carga inicial incompleta.'], ['Pendiente de contrato', 'Está listo para completar datos y crear contrato.'], ['Contrato borrador', 'Tiene contrato en preparación o pendiente.'], ['Seña pendiente', 'Contrato aprobado, falta seña suficiente.'], ['Reservado', 'La fecha quedó reservada.'], ['Confirmado', 'Evento formalmente confirmado.'], ['Cancelado', 'Se anuló luego de avanzar.'], ['Perdido', 'La oportunidad no continuará.'],
    ]))
    out.append('<h2>Contratos, pagos y producción</h2>')
    out.append(table(['Área', 'Estados'], [
        ['Contratos', 'Borrador, Pendiente de aprobación, Aprobado, Requiere cambios, Cancelado, Reemplazado.'],
        ['Pagos', 'Pendiente, Cobrado, Cancelado, Reembolsado.'],
        ['Producción', 'Pendiente, En proceso, Lista, Chequeada, Bloqueada, Cancelada, Cerrada.'],
        ['Entradas', 'Borrador, Programada, Activa, Pausada, Agotada, Finalizada, Cerrada, Cancelada, Archivada.'],
    ]))
    out.append(callout('important', 'Regla práctica', '<p>No cambies un estado para “hacer desaparecer” una alerta. Resolvé el requisito real y después elegí el estado que describa lo ocurrido.</p>'))
    out.append(close())

    # 21
    out.append(chapter('21', 'Guías rápidas y resolución de situaciones', 'guias-rapidas', 'Listas breves para operar con seguridad y saber qué revisar cuando una acción no avanza.'))
    out.append('<h2>Antes de confirmar un evento</h2><ul class="checklist"><li>Cliente y contacto correctos</li><li>Salón, fecha y horario verificados</li><li>Cantidad de invitados compatible con capacidad</li><li>Paquete, menú y servicios acordados</li><li>Total, descuento, seña y condiciones revisados</li><li>Documento y domicilio del cliente completos</li><li>Contrato aprobado</li><li>Seña registrada y saldo visible</li></ul>')
    out.append('<h2>Antes de abrir el salón</h2><ul class="checklist"><li>Invitados confirmados y mesas sin sobrecupo</li><li>Restricciones y menores comunicados a cocina/recepción</li><li>Proveedores confirmados con horario de llegada</li><li>Staff asignado y briefing realizado</li><li>Cronograma, logística, vajilla y stock revisados</li><li>Producción sin bloqueos</li><li>Documentos operativos disponibles</li></ul>')
    out.append('<h2>Si el sistema muestra un bloqueo</h2>')
    out.append(table(['Situación', 'Qué hacer'], [
        ['No se puede crear contrato', 'Abrí el checklist y completá cada requisito faltante en Cliente, Ficha, Comercial, Menú o Servicios.'],
        ['Contrato aprobado, evento sigue en Contrato borrador', 'Verificá el contrato y elegí Seña pendiente en el estado del evento. El comportamiento fue observado durante esta revisión.'],
        ['Pago no aparece de inmediato', 'No lo cargues otra vez. Salí de Pagos, volvé a entrar y revisá Historial e importe abonado.'],
        ['Producción sin ítems', 'Agregá ítems manuales o configurá reglas y regenerá una nueva versión.'],
        ['Cierre financiero bloqueado', 'Revisá saldo, pagos pendientes, gastos pendientes y costos cargados.'],
        ['Módulo sin datos', 'Buscá el botón Nuevo/Registrar/Generar y confirmá primero los registros previos que necesita.'],
        ['No aparece un módulo', 'Pedí a un administrador que revise rol, salones, área y acciones permitidas.'],
    ]))
    out.append('<h2>Buenas prácticas</h2><ul><li>Usá una cuenta individual y cerrá sesión.</li><li>No dupliques registros si una pantalla tarda en actualizar: primero recargá y buscá el resultado.</li><li>Registrá importes sólo con respaldo.</li><li>Conservá notas claras y evitá datos sensibles innecesarios.</li><li>Usá Cancelar, Desactivar y Eliminar según su efecto; no son equivalentes.</li><li>Revisá los reportes después de una operación importante.</li></ul>')
    out.append('<p class="endnote">Fin del Manual de Usuario Oficial de M&M Eventos · Versión 1.0 · Generado el 10 de agosto de 2026.</p>')
    out.append(close())

    out.append('</body></html>')
    return ''.join(out)


def main() -> None:
    OUTPUT.write_text(build(), encoding="utf-8")
    print(OUTPUT)


if __name__ == "__main__":
    main()
