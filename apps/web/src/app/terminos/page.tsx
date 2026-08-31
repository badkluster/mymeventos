import type { Metadata } from 'next';
import Link from 'next/link';
import { LegalPageShell, LegalSection } from '@/components/legal/legal-page-shell';
import { SupportRequestForm } from '@/components/legal/support-request-form';
import { absoluteUrl } from '@/lib/local-seo';

export const metadata: Metadata = {
  title: 'Términos y Condiciones',
  description: 'Términos y condiciones de uso del sitio, backoffice y aplicación M&M Eventos Staff.',
  alternates: { canonical: absoluteUrl('/terminos') },
  robots: { index: true, follow: true },
};

export default function TermsPage() {
  return (
    <LegalPageShell
      eyebrow="Condiciones de uso"
      title="Términos y Condiciones"
      intro="Estos términos regulan el acceso y uso del sitio web de M&M Eventos, su panel administrativo y la aplicación M&M Eventos Staff. Al utilizar una cuenta habilitada o enviar información mediante el sitio, aceptás las condiciones aplicables a la función utilizada."
    >
      <LegalSection title="1. Servicios comprendidos">
        <p>M&M Eventos ofrece herramientas digitales para publicar información sobre salones y servicios, recibir consultas y solicitudes de presupuesto, administrar clientes, propuestas y eventos, organizar tareas internas y permitir que el personal autorizado consulte su actividad y registre asistencia mediante M&M Eventos Staff.</p>
        <p>Algunas funciones pueden estar disponibles únicamente para usuarios autorizados por M&M Eventos y pueden variar según el rol asignado.</p>
      </LegalSection>

      <LegalSection title="2. Cuentas y acceso">
        <p>Las credenciales del backoffice y de M&M Eventos Staff son personales. Cada usuario es responsable de mantenerlas confidenciales y de informar cualquier acceso no reconocido o sospecha de uso indebido.</p>
        <p>Las cuentas del personal son creadas, habilitadas y administradas por usuarios autorizados de M&M Eventos. El acceso puede limitarse, suspenderse o finalizar cuando cambie la relación operativa, el rol, las responsabilidades o existan motivos razonables de seguridad.</p>
      </LegalSection>

      <LegalSection title="3. Uso permitido">
        <p>El servicio debe utilizarse exclusivamente para finalidades legítimas y vinculadas con las funciones disponibles. No está permitido intentar acceder a cuentas ajenas, eludir controles de seguridad, alterar registros sin autorización, introducir software malicioso, realizar cargas automatizadas abusivas o utilizar la plataforma de una manera que afecte su disponibilidad o integridad.</p>
      </LegalSection>

      <LegalSection title="4. Información ingresada por los usuarios">
        <p>Quien ingresa, modifica o carga información en el sistema declara contar con autorización suficiente para hacerlo y es responsable de la exactitud y legitimidad de los datos incorporados.</p>
        <p>En funciones relacionadas con clientes, invitados, proveedores, personal, eventos o documentación, los usuarios deben evitar incorporar información innecesaria y respetar las políticas internas y obligaciones aplicables sobre confidencialidad y datos personales.</p>
      </LegalSection>

      <LegalSection title="5. Sitio público, consultas y presupuestos">
        <p>La información comercial publicada en el sitio busca describir los servicios de M&M Eventos. La disponibilidad, precios, condiciones, fechas, capacidades, promociones y características finales de una contratación quedan sujetos a la propuesta o documentación comercial confirmada para cada caso.</p>
        <p>El envío de un formulario de contacto o presupuesto no implica por sí mismo una reserva, contratación ni bloqueo de fecha.</p>
      </LegalSection>

      <LegalSection title="6. Aplicación M&M Eventos Staff">
        <p>La app está destinada al personal autorizado y puede incluir funciones de perfil, cronograma, asistencia, fichaje, liquidaciones u otras herramientas operativas. Cuando una función requiere ubicación, biometría, fotografías o notificaciones, el sistema solicitará los permisos correspondientes del dispositivo.</p>
        <p>Los registros generados por la app deben utilizarse de acuerdo con los procedimientos internos definidos por M&M Eventos. Un error técnico o de conectividad debe informarse por los canales de soporte para su revisión.</p>
      </LegalSection>

      <LegalSection title="7. Disponibilidad y cambios del servicio">
        <p>Buscamos mantener la plataforma disponible y segura, pero pueden existir interrupciones por mantenimiento, actualizaciones, fallas de terceros, conectividad, incidentes técnicos o causas fuera de nuestro control.</p>
        <p>Podemos incorporar, modificar o retirar funciones cuando resulte necesario para mejorar la operación, seguridad, compatibilidad o cumplimiento de requisitos técnicos y comerciales.</p>
      </LegalSection>

      <LegalSection title="8. Propiedad intelectual">
        <p>El software, diseño, identidad visual, textos propios, interfaces, marcas y demás materiales de M&M Eventos están protegidos por los derechos que correspondan. El acceso al servicio no transfiere derechos de propiedad ni autoriza su reproducción, modificación o explotación fuera del uso normal de la plataforma.</p>
      </LegalSection>

      <LegalSection title="9. Privacidad y datos personales">
        <p>El tratamiento de información personal se describe en la <Link href="/privacidad" className="font-semibold text-[#dbe1e8] underline underline-offset-4">Política de Privacidad</Link>. Allí también se detallan los permisos de la app, criterios de conservación y el procedimiento para solicitar eliminación de cuenta y datos.</p>
      </LegalSection>

      <LegalSection title="10. Terminación y eliminación de cuenta">
        <p>Un usuario puede dejar de tener acceso cuando su cuenta sea deshabilitada por razones operativas o de seguridad. Si desea solicitar la eliminación definitiva de su cuenta y los datos personales asociados, puede hacerlo desde la sección pública de <Link href="/privacidad#eliminar-cuenta" className="font-semibold text-[#dbe1e8] underline underline-offset-4">eliminación de cuenta</Link>.</p>
        <p>La eliminación se procesará luego de las verificaciones necesarias y respetando cualquier información que deba conservarse legítimamente por obligaciones aplicables, seguridad o integridad de registros.</p>
      </LegalSection>

      <LegalSection title="11. Actualizaciones de estos términos">
        <p>Podemos actualizar estos términos para reflejar cambios del servicio, nuevas funciones o requisitos aplicables. La versión vigente será la publicada en esta URL junto con su fecha de actualización.</p>
      </LegalSection>

      <section id="soporte" className="scroll-mt-24">
        <div className="mb-5">
          <p className="text-xs font-semibold uppercase tracking-[0.28em] text-[#dbe1e8]">Ayuda</p>
          <h2 className="mt-2 text-3xl font-semibold text-white">¿Necesitás soporte?</h2>
          <p className="mt-3 text-[15px] leading-7 text-zinc-300">Podés enviar una consulta desde acá. Si tu pedido es eliminar una cuenta, seleccioná esa opción en el formulario.</p>
        </div>
        <SupportRequestForm source="terms_page" />
      </section>
    </LegalPageShell>
  );
}
