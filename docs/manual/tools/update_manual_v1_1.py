import fitz
from pathlib import Path

MANUAL_DIR = Path(__file__).resolve().parents[1]
SRC = MANUAL_DIR / 'Manual_Usuario_M&M_Eventos.pdf'
OUT = MANUAL_DIR / 'Manual_Usuario_M&M_Eventos_v1.1.pdf'
doc=fitz.open(SRC)

DARK=(0.09,0.09,0.09)
MUTED=(0.30,0.30,0.30)
GREEN_BG=(0.945,0.976,0.949)
GREEN_BORDER=(0.56,0.72,0.60)
AMBER_BG=(1.0,0.973,0.91)
AMBER_BORDER=(0.85,0.72,0.40)
WHITE=(1,1,1)
GRAY_BG=(0.965,0.965,0.97)
GRAY_LINE=(0.86,0.86,0.86)
BLACK=(0.11,0.11,0.11)


def redact(page, rect, fill=WHITE):
    page.add_redact_annot(fitz.Rect(rect), fill=fill)
    page.apply_redactions()


def textbox(page, rect, text, size=9.2, bold=False, color=DARK, lineheight=1.22):
    weight='700' if bold else '400'
    html=f'''<div style="font-family: Arial, Helvetica, sans-serif; font-size:{size}pt; line-height:{lineheight}; font-weight:{weight}; color:rgb({int(color[0]*255)},{int(color[1]*255)},{int(color[2]*255)});">{text}</div>'''
    return page.insert_htmlbox(fitz.Rect(rect), html)


def callout(page, rect, title, body, bg=GREEN_BG, border=GREEN_BORDER):
    r=fitz.Rect(rect)
    page.draw_rect(r, color=border, fill=bg, width=0.7, radius=0.08)
    textbox(page,(r.x0+14,r.y0+11,r.x1-14,r.y0+27),title.upper(),size=8,bold=True,color=DARK)
    textbox(page,(r.x0+14,r.y0+31,r.x1-14,r.y1-10),body,size=8.8,color=DARK,lineheight=1.32)

# Version footer on all pages.
for page in doc:
    hits=page.search_for('Versión 1.0 · 10/08/2026')
    for h in hits:
        redact(page,(h.x0-1,h.y0-1,h.x1+2,h.y1+1))
        textbox(page,(h.x0,h.y0-1,h.x1+20,h.y1+3),'Versión 1.1 · 10/08/2026',size=5.9,color=MUTED)

# Cover manual version 1.1. System version 1.0.0 stays unchanged.
p=doc[0]
redact(p,(200,634,235,649),fill=(0.035,0.035,0.035))
textbox(p,(200,634,240,650),'1.1',size=9.1,color=(0.84,0.84,0.84))

# Page 3 - glossary for nontechnical users.
p=doc[2]
textbox(p,(43,515,250,538),'Glosario rápido',size=15,bold=True,color=(0.16,0.16,0.16))
callout(p,(43,545,552,710),'Palabras que vas a encontrar',
        '<b>Lead:</b> persona que consultó y todavía no contrató.<br>'
        '<b>Pipeline:</b> recorrido desde la consulta hasta la contratación.<br>'
        '<b>Staff:</b> personal asignado a trabajar en un evento.<br>'
        '<b>Briefing:</b> reunión o repaso operativo antes del evento.<br>'
        '<b>RSVP:</b> confirmación de asistencia de una invitación.<br>'
        '<b>Adenda:</b> modificación posterior de un contrato aprobado.',
        bg=GRAY_BG,border=(0.80,0.80,0.82))

# Page 4 - production-neutral access instruction.
p=doc[3]
redact(p,(70,214,555,249))
textbox(p,(74,217,548,248),
        'Abrí un navegador actualizado e ingresá a la <b>dirección del backoffice proporcionada por Administración</b>. '
        'Si estás trabajando en un entorno de prueba, verificá que sea el entorno autorizado antes de cargar datos.',
        size=9.2,lineheight=1.28)

# Page 11 - automation summary.
p=doc[10]
textbox(p,(43,438,360,460),'Qué hace M&M Eventos automáticamente',size=15,bold=True,color=(0.16,0.16,0.16))
callout(p,(43,470,552,710),'Automatizaciones frecuentes',
        '• Al crear un evento, genera recordatorios operativos de base que luego pueden editarse.<br>'
        '• Controla vencimientos y avisos de cuotas, presupuestos, cierres y tareas según su configuración.<br>'
        '• Puede alertar por producción pendiente, sobre-reserva de stock/vajilla y jornadas sin cerrar.<br>'
        '• Las campañas programadas y ciertos seguimientos se ejecutan después de haber sido configurados por una persona.<br>'
        '• En Entradas Digitales libera reservas no pagadas según la regla vigente y valida cada QR al momento del ingreso.<br><br>'
        '<b>Importante:</b> una automatización no reemplaza la revisión del operador cuando el sistema pide confirmar, programar o resolver una incidencia.',
        bg=AMBER_BG,border=AMBER_BORDER)

# Page 24 - remove obsolete workarounds.
p=doc[23]
redact(p,(70,454,555,491))
textbox(p,(74,458,549,489),
        'Volvé al evento y verificá el estado. Al aprobar el contrato, el evento avanza automáticamente a '
        '<b>“Seña pendiente”</b> cuando corresponde. No hace falta cambiar el estado manualmente.',size=9.2,lineheight=1.28)
redact(p,(70,582,555,620))
textbox(p,(74,586,548,618),
        'Confirmá que aumente <b>“Ya abonado”</b>, disminuya <b>“Restante a pagar”</b> y que el movimiento aparezca '
        'en <b>Historial de pagos</b> en la misma pantalla. Si la operación informa un error, revisalo antes de reintentar.',size=9.2,lineheight=1.28)

# Page 26 - replace historical bug warning with current behavior.
p=doc[25]
redact(p,(42,423,553,512))
callout(p,(43,427,552,506),'Comportamiento actual',
        'La aprobación del contrato sincroniza el estado comercial del evento. Al registrar un pago correctamente, '
        'los indicadores, el saldo y el historial se actualizan en la misma vista; no es necesario salir y volver a entrar.',
        bg=GREEN_BG,border=GREEN_BORDER)

# Page 32 - staff lifecycle instructions.
p=doc[31]
redact(p,(70,510,552,548))
textbox(p,(74,514,548,548),
        'En <b>Staff</b>, asigná persona, rol y turno. Antes del evento podés <b>Confirmar</b>. Después registrá el resultado real: '
        '<b>Completado</b>, <b>Ausente</b> o <b>Cancelado</b>; si se usa fichaje, <b>Ingresó</b> puede preceder a Completado.',
        size=8.8,lineheight=1.27)

# Page 34 - explain terminal staff states; screenshot remains a historical example.
p=doc[33]
callout(p,(43,425,552,535),'Ciclo de personal del evento',
        'Las asignaciones avanzan según lo ocurrido: Asignado → Confirmado → (opcionalmente Ingresó) → Completado. '
        'También pueden finalizar como Cancelado o Ausente. Para el cierre operativo son estados finales '
        '<b>Completado, Cancelado y Ausente</b>. Un integrante que siga Confirmado o Ingresó todavía requiere resolución.<br><br>'
        '<b>Nota sobre la captura:</b> la imagen superior corresponde al relevamiento inicial; la interfaz actual ya ofrece las acciones de cierre y muestra los rótulos de rol/estado traducidos.',
        bg=GREEN_BG,border=GREEN_BORDER)

# Page 40 - closure semantics for staff.
p=doc[39]
redact(p,(70,454,555,492))
textbox(p,(74,458,548,492),
        '<b>Cierre operativo:</b> el evento ocurrió, la producción está generada y cerrada, no hay ítems bloqueados y todas '
        'las asignaciones de personal terminaron como <b>Completado, Cancelado o Ausente</b>. Confirmado o Ingresó todavía bloquean el cierre.',
        size=8.8,lineheight=1.27)

# Page 46 - provider labels/accessibility.
p=doc[45]
redact(p,(70,281,470,304))
textbox(p,(74,285,535,304),
        'Completá identidad, categoría, contacto y canales disponibles. Cada campo conserva un <b>rótulo visible</b> para que sea fácil identificarlo al crear o editar.',
        size=8.9,lineheight=1.25)

# Page 47 - mark old screenshot explicitly as reference.
p=doc[46]
textbox(p,(165,395,552,409),'Referencia visual del relevamiento inicial; los campos actuales muestran rótulos permanentes.',size=6.8,color=MUTED)

# Page 52 - clarify consolidated screen vs exported file.
p=doc[51]
textbox(p,(43,590,350,612),'Cómo leer el consolidado',size=13.5,bold=True,color=(0.16,0.16,0.16))
callout(p,(43,620,552,735),'Lectura operativa',
        'En la pantalla, cada sección puede desglosarse por evento y luego muestra Total, Completado, Disponible, Faltante, A comprar, A producir y Pendientes. '
        '<b>Faltante</b> representa el faltante contra el stock disponible; no debe confundirse con lo que falta elaborar. '
        'Para decidir compras o producción, revisá también Completado, A comprar/A producir y el detalle de cada evento.',
        bg=GRAY_BG,border=(0.80,0.80,0.82))

# Page 83 - add staff statuses and re-create practical rule lower down.
p=doc[82]
redact(p,(42,530,553,610))
textbox(p,(43,525,260,546),'Personal del evento',size=13.5,bold=True,color=(0.16,0.16,0.16))
textbox(p,(49,550,545,578),
        '<b>Estados:</b> Propuesto, Asignado, Confirmado, Ingresó, Completado, Cancelado y Ausente. '
        '<b>Finales para el cierre operativo:</b> Completado, Cancelado y Ausente.',size=8.4,lineheight=1.25)
callout(p,(43,590,552,670),'Regla práctica',
        'No cambies un estado para “hacer desaparecer” una alerta. Resolvé el requisito real y después elegí el estado que describa lo ocurrido.',
        bg=AMBER_BG,border=AMBER_BORDER)

# Page 85 - replace obsolete troubleshooting table with current workflow guidance.
p=doc[84]
redact(p,(42,78,553,355))
p.draw_rect(fitz.Rect(43,78,552,107), color=BLACK, fill=BLACK, width=0.5)
textbox(p,(49,87,210,103),'Situación',size=8.2,bold=True,color=WHITE)
textbox(p,(212,87,545,103),'Qué hacer',size=8.2,bold=True,color=WHITE)
rows=[
 ('No se puede crear contrato','Abrí el checklist y completá cada requisito faltante en Cliente, Ficha, Comercial, Menú o Servicios.'),
 ('Personal del evento sin finalizar','Entrá en Staff y resolvé cada asignación abierta. Para el cierre operativo deben quedar Completado, Cancelado o Ausente.'),
 ('Producción sin ítems','Agregá ítems manuales o configurá reglas y regenerá una nueva versión cuando corresponda.'),
 ('Cierre operativo bloqueado','Revisá que el evento haya ocurrido, la producción esté cerrada, no haya ítems bloqueados y el personal esté finalizado.'),
 ('Cierre financiero bloqueado','Revisá contrato aprobado, saldo, pagos pendientes, gastos pendientes y costos del evento.'),
 ('Módulo sin datos','Buscá Nuevo/Registrar/Generar y verificá primero los registros previos que necesita.'),
 ('No aparece un módulo','Pedí a un administrador que revise rol, salones, área y acciones permitidas.'),
]
y=107
for i,(left,right) in enumerate(rows):
    h=37 if i in (1,3,4,5) else 31
    fill=(0.98,0.98,0.98) if i%2 else WHITE
    p.draw_rect(fitz.Rect(43,y,552,y+h), color=GRAY_LINE, fill=fill, width=0.35)
    textbox(p,(49,y+7,202,y+h-4),left,size=7.3,color=DARK,lineheight=1.20)
    textbox(p,(212,y+7,545,y+h-4),right,size=7.3,color=DARK,lineheight=1.20)
    y+=h

for h in p.search_for('Fin del Manual de Usuario Oficial de M&M Eventos · Versión 1.0 · Generado el 10 de agosto de 2026.'):
    redact(p,(h.x0-1,h.y0-1,h.x1+1,h.y1+1))
    textbox(p,(h.x0,h.y0-1,550,h.y1+4),'Fin del Manual de Usuario Oficial de M&M Eventos · Versión 1.1 · Actualizado el 10 de agosto de 2026.',size=7.1,color=MUTED)

doc.set_metadata({**doc.metadata,
                  'title':'Manual de Usuario Oficial - M&M Eventos',
                  'subject':'Versión 1.1 - actualizado con correcciones de contratos, pagos, proveedores, traducciones y ciclo de staff',
                  'keywords':'M&M Eventos, manual de usuario, eventos, contratos, pagos, producción, staff, cierre integral'})
doc.save(OUT, garbage=4, deflate=True, clean=True)
doc.close()
print(OUT)
