---
name: "M&M Eventos Web"
description: "Backoffice operativo para eventos: información trazable, compacta y clara."
colors:
  background: "#fafafa"
  foreground: "#171717"
  card: "#ffffff"
  muted: "#f1f1f1"
  muted-foreground: "#5f6472"
  border: "#e4e4e7"
  primary: "#171717"
  primary-foreground: "#ffffff"
  ink-strong: "#09090b"
  ink-muted: "#71717a"
  warning-bg: "#fef6e7"
  warning-border: "#f0d29a"
  warning-foreground: "#8a5a10"
  success-bg: "#eaf7f0"
  success-border: "#a9dfc1"
  success-foreground: "#147a4a"
  danger-bg: "#fdecec"
  danger-border: "#f3b4b4"
  danger-foreground: "#a12626"
typography:
  heading:
    fontFamily: "Arial, Helvetica, sans-serif"
    fontSize: "1.875rem"
    fontWeight: 600
    lineHeight: "2.25rem"
    letterSpacing: "-0.025em"
  section:
    fontFamily: "Arial, Helvetica, sans-serif"
    fontSize: "1.125rem"
    fontWeight: 600
    lineHeight: "1.75rem"
  body:
    fontFamily: "Arial, Helvetica, sans-serif"
    fontSize: "1rem"
    fontWeight: 400
  control:
    fontFamily: "Arial, Helvetica, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 500
    lineHeight: "1.25rem"
  label:
    fontFamily: "Arial, Helvetica, sans-serif"
    fontSize: "0.75rem"
    fontWeight: 600
    lineHeight: "1rem"
    letterSpacing: "0.025em"
  table-label:
    fontFamily: "Arial, Helvetica, sans-serif"
    fontSize: "0.6875rem"
    fontWeight: 600
    lineHeight: "1rem"
    letterSpacing: "0.025em"
  number:
    fontFamily: "Arial, Helvetica, sans-serif"
    fontFeature: "tabular-nums"
rounded:
  control: "12px"
  container: "16px"
  icon: "8px"
  pill: "9999px"
spacing:
  "1": "4px"
  "2": "8px"
  "3": "12px"
  "4": "16px"
  "5": "20px"
  "6": "24px"
  "8": "32px"
  control-y: "10px"
  control-x: "16px"
  field-x: "12px"
  status-x: "10px"
components:
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.primary-foreground}"
    typography: "{typography.control}"
    rounded: "{rounded.control}"
    padding: "{spacing.control-y} {spacing.control-x}"
  button-secondary:
    backgroundColor: "{colors.card}"
    textColor: "{colors.foreground}"
    typography: "{typography.control}"
    rounded: "{rounded.control}"
    padding: "{spacing.control-y} {spacing.control-x}"
  input:
    backgroundColor: "{colors.card}"
    textColor: "{colors.foreground}"
    typography: "{typography.body}"
    rounded: "{rounded.control}"
    padding: "{spacing.control-y} {spacing.field-x}"
    height: "42px"
  surface-card:
    backgroundColor: "{colors.card}"
    textColor: "{colors.foreground}"
    rounded: "{rounded.container}"
    padding: "{spacing.4}"
  status-warning:
    backgroundColor: "{colors.warning-bg}"
    textColor: "{colors.warning-foreground}"
    typography: "{typography.label}"
    rounded: "{rounded.pill}"
    padding: "{spacing.1} {spacing.status-x}"
---

# Design System: M&M Eventos Web

## Overview

**Creative North Star: "La mesa de control serena"**

M&M Eventos usa una interfaz administrativa clara, de baja ornamentación y alta trazabilidad. La superficie de trabajo es luminosa y predominantemente zinc: tinta casi negra, planos blancos, bordes grises y una jerarquía que deja que los datos, el estado y la siguiente acción hagan el trabajo visual.

El sistema está pensado para el uso operativo continuo: información en español rioplatense, controles previsibles, datos compactos y explicaciones cercanas cuando una cifra requiere contexto. En reportes, la claridad metodológica acompaña a la métrica; una agregación o atribución no se presenta como una certeza que no es.

**Key Characteristics:**

- Densidad administrativa moderada: cada bloque justifica su espacio con una decisión, cifra o acción.
- Neutros zinc como lenguaje base; el color de estado informa y no decora.
- Contenedores moderados, tablas auditables y números alineados para lectura comparativa.
- Tema oscuro como inversión tonal del shell administrativo, no como una estética distinta.

**The Operational Read Rule.** Los filtros y el alcance aparecen antes de los resultados, y toda métrica abreviada conserva una explicación visible de su criterio.

## Colors

La paleta se concentra en neutros de alto contraste; los tres colores semánticos se reservan para disponibilidad, confirmación y riesgo.

### Primary

- **Tinta de operación** (`primary`): acciones principales, etapas activas y controles seleccionados.
- **Papel de acción** (`primary-foreground`): texto e iconografía sobre la tinta de operación.

### Secondary

- **Zinc fuerte** (`ink-strong`): títulos, datos prioritarios y elementos de tabla que deben sobrevivir a un escaneo veloz.
- **Zinc de apoyo** (`ink-muted`): metadatos, etiquetas secundarias y señales de menor prioridad.

### Neutral

- **Lienzo de aplicación** (`background`): base amplia de la interfaz administrativa.
- **Papel de superficie** (`card`): filtros, tarjetas, tablas y paneles de trabajo.
- **Plano tenue** (`muted`): fondos de cabecera, hovers y controles secundarios.
- **Divisor silencioso** (`border`): bordes y separadores que ordenan sin competir con el contenido.
- **Texto secundario** (`muted-foreground`): descripciones, ayuda y contexto metodológico.

### Tertiary

- **Ámbar de atención** (`warning-bg`, `warning-border`, `warning-foreground`): configuración pendiente o cobertura incompleta.
- **Verde de confirmación** (`success-bg`, `success-border`, `success-foreground`): conexión correcta y acciones confirmadas.
- **Rojo de excepción** (`danger-bg`, `danger-border`, `danger-foreground`): errores, indisponibilidad y acciones destructivas.

**The One Accent Rule.** Un estado semántico sólo se muestra cuando cambia la lectura o la acción posible; el zinc sigue siendo la voz dominante de cada pantalla.

## Typography

**Display Font:** Arial, Helvetica, sans-serif.

**Body Font:** Arial, Helvetica, sans-serif.

**Character:** Una sans del sistema, directa y legible, sostiene la velocidad de uso de un backoffice. Los pesos semibold construyen la jerarquía sin depender de tamaños excesivos.

### Hierarchy

- **Heading** (`heading`): título de página; reservado al encabezado operativo de cada vista.
- **Section** (`section`): títulos de tarjeta, bloque o tabla; concreta el tema sin competir con la página.
- **Body** (`body`): contenido de formularios, tablas y texto de trabajo.
- **Control** (`control`): botones y acciones compactas de interfaz.
- **Label** (`label`): rótulos de control y métricas; puede convertirse a mayúsculas en resúmenes para separar categoría y valor.
- **Table label** (`table-label`): encabezados de tabla compactos, en mayúsculas y con espaciado de letras.
- **Number** (`number`): importes, porcentajes, contadores y comparaciones usan cifras tabulares y alineación a la derecha cuando hay columnas.

**The Verifiable Figure Rule.** Toda cifra comparable se trata como dato: formato local `es-AR`, anchura tabular y alineación que permita contrastarla fila a fila.

## Layout

El shell administrativo usa una barra lateral fija amplia o contraída y contenido con respiración creciente: 16 px en móvil, 24 px desde `sm` y 32 px desde `lg`. La navegación móvil se abre como panel lateral; la información no se reorganiza en una segunda arquitectura.

Las vistas operativas usan una columna de bloques con separación frecuente de 20–24 px. Los filtros se agrupan en una superficie antes de la lectura y pueden envolver sus controles; los botones de aplicación permanecen junto al conjunto. Las tarjetas de resumen pasan de una columna a dos y hasta cuatro cuando el ancho permite conservar rótulos y cifras legibles.

Las tablas son la fuente de auditoría: conservan sus columnas, alinean importes a la derecha y permiten desplazamiento horizontal cuando la pantalla no alcanza. No se eliminan métricas ni se convierten tablas densas en tarjetas ambiguas para aparentar una adaptación móvil.

**The Table Integrity Rule.** En una pantalla estrecha se preserva el modelo comparativo de la tabla mediante scroll horizontal; la precisión prevalece sobre una simplificación que oculte columnas.

## Elevation & Depth

La profundidad es discreta y estructural. La mayoría de las superficies blancas se separan del fondo con borde y una sombra baja; los menús y diálogos se elevan sólo cuando flotan sobre una tarea. En oscuro, la diferenciación se apoya principalmente en planos y bordes ajustados por el shell.

**The Resting Surface Rule.** Una tarjeta en reposo no necesita una sombra dramática: el borde y la sombra baja sólo definen agrupación. La elevación mayor indica superposición o interacción temporal.

## Shapes

Los contenedores principales, filtros, tarjetas y tablas usan esquinas suaves de `container`. Los controles de formulario y los botones usan `control`; los botones de icono reducen a `icon` para conservar una huella precisa. Los badges de estado son el único patrón plenamente circular mediante `pill`.

Los bordes son finos y continuos. No se usan geometrías expresivas, recortes decorativos ni esquinas inconsistentes dentro de una misma superficie administrativa.

## Components

### Buttons

Botones compactos y textuales para aplicar, actualizar o exportar.

- **Primary:** `button-primary` reserva la tinta de operación para la acción que confirma el bloque actual.
- **Secondary:** `button-secondary` mantiene el plano de papel con borde para acciones paralelas, como exportar, volver o limpiar.
- **Hover / Focus:** el hover baja levemente la opacidad o activa el plano tenue; el foco visible usa un anillo suave de tinta. Los estados deshabilitados reducen opacidad y mantienen el tamaño para evitar saltos.

### Cards / Containers

- **Surface:** `surface-card` es el patrón de filtros, resúmenes, tablas y secciones de configuración.
- **Header:** una tarjeta que contiene una tabla separa su cabecera con un divisor silencioso y conserva el fondo de tabla tenue sólo para los encabezados de columna.
- **Metric:** el valor es el elemento dominante; el rótulo es compacto y, cuando corresponde, en mayúsculas. El contexto queda inmediatamente debajo.

### Inputs / Fields

- **Style:** `input` comparte fondo de papel, borde y sombra baja con los demás controles.
- **Focus:** el borde y anillo de tinta señalan edición sin introducir un color de marca adicional.
- **Grouping:** cada campo mantiene su rótulo arriba; fechas y selectores se colocan juntos por alcance, no por tipo de dato.

### Tables

- **Header:** rótulos compactos, en mayúsculas, sobre plano tenue para distinguir la estructura de los registros.
- **Rows:** divisores suaves y hover tenue; los nombres llevan mayor peso que sus metadatos.
- **Numbers:** métricas, moneda, porcentajes y ratios se alinean a la derecha con `number`.

### Status Chips

- **Connection:** las cápsulas de conexión combinan punto, etiqueta y uno de los tres estados semánticos; no dependen del color como única señal.
- **Warning:** `status-warning` identifica asignaciones pendientes o cobertura incompleta sin desplazar la lectura principal.

### Report Funnel

- **Stages:** la primera etapa activa usa tinta de operación con texto claro; las etapas restantes son planos tenues con barra de progreso zinc.
- **Methodology:** una nota final en tinta de operación reúne el criterio de cálculo para que la interpretación acompañe al resultado.

**The Explain-At-The-Point Rule.** El aviso sobre conexión, permisos, atribución o alcance se muestra en el mismo bloque que la métrica afectada; no se relega a una ayuda genérica.

## Do's and Don'ts

### Do:

- **Do** usar las fichas y tablas sobre `card`, separadas por `border` y una elevación baja.
- **Do** ubicar filtros de rango y alcance antes de cualquier resumen que cambien.
- **Do** acompañar datos de conversión, cobertura o atribución con una frase de método cerca del valor.
- **Do** conservar cifras tabulares y alineadas a la derecha cuando haya comparación entre filas o etapas.
- **Do** usar los tokens semánticos completos (fondo, borde y texto) para estados de éxito, advertencia y error.

### Don't:

- **Don't** usar color decorativo, gradientes o gráficos llamativos para reemplazar una jerarquía de datos clara.
- **Don't** elevar cada tarjeta con sombras profundas ni mezclar radios dentro de un mismo bloque.
- **Don't** ocultar columnas de una tabla auditable para encajarla en móvil; habilitá desplazamiento horizontal.
- **Don't** presentar una métrica derivada como una atribución exacta si su metodología o cobertura es parcial.
- **Don't** usar sólo un punto de color para comunicar un estado; incluí una etiqueta legible.
