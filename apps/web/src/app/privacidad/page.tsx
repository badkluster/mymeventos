import type { Metadata } from 'next';
import Link from 'next/link';
import { LegalPageShell, LegalSection } from '@/components/legal/legal-page-shell';
import { SupportRequestForm } from '@/components/legal/support-request-form';
import { absoluteUrl } from '@/lib/local-seo';

export const metadata: Metadata = {
  title: 'Política de Privacidad',
  description: 'Política de privacidad de M&M Eventos y M&M Eventos Staff, incluyendo tratamiento de datos, permisos de la app, retención y eliminación de cuentas.',
  alternates: { canonical: absoluteUrl('/privacidad') },
  robots: { index: true, follow: true },
};

export default function PrivacyPage() {
  return (
    <LegalPageShell
      eyebrow="Privacidad y datos personales"
      title="Política de Privacidad"
      intro="Esta política explica qué información trata M&M Eventos a través de su sitio web, backoffice y aplicación M&M Eventos Staff, para qué se utiliza y cómo podés solicitar soporte, acceso, corrección o eliminación de tus datos."
    >
      <LegalSection title="1. Alcance y responsable">
        <p>M&M Eventos administra servicios digitales vinculados con la organización y operación de eventos, incluyendo el sitio web público, el panel administrativo y la aplicación móvil <strong>M&M Eventos Staff</strong>.</p>
        <p>Esta política se aplica a la información tratada mediante esos servicios. Para consultas relacionadas con privacidad o datos personales podés utilizar el formulario disponible al final de esta página.</p>
      </LegalSection>

      <LegalSection title="2. Información que podemos tratar">
        <p>Según la función utilizada, podemos tratar las siguientes categorías de información:</p>
        <ul className="list-disc space-y-2 pl-5">
          <li><strong>Datos de contacto:</strong> nombre, apellido, teléfono, correo electrónico y otros datos que ingreses voluntariamente.</li>
          <li><strong>Consultas y presupuestos:</strong> tipo y fecha estimada del evento, cantidad de invitados, salón o propuesta de interés y mensajes enviados desde la web.</li>
          <li><strong>Datos de usuarios internos y staff:</strong> usuario, email, nombre, rol, datos de perfil, estado de cuenta y datos necesarios para autenticación y seguridad.</li>
          <li><strong>Asistencia y actividad laboral:</strong> horarios, fichajes, asignaciones, cronogramas y registros relacionados con la operación del personal.</li>
          <li><strong>Ubicación:</strong> la app puede solicitar ubicación precisa o aproximada únicamente cuando una función de fichaje necesita registrar o validar el punto de entrada o salida.</li>
          <li><strong>Imagen de perfil:</strong> si decidís agregar o cambiar un avatar, la app puede solicitar acceso a cámara o fotografías para seleccionar esa imagen.</li>
          <li><strong>Biometría del dispositivo:</strong> la app puede usar Face ID, huella u otro mecanismo biométrico compatible para desbloquear una sesión. M&M Eventos no recibe ni almacena la plantilla biométrica; la validación la realiza el sistema operativo del dispositivo.</li>
          <li><strong>Notificaciones:</strong> identificadores técnicos necesarios para entregar avisos cuando hayas autorizado las notificaciones del dispositivo.</li>
          <li><strong>Datos técnicos y de seguridad:</strong> información de sesión, registros de acceso, identificadores técnicos, errores y eventos necesarios para proteger, mantener y diagnosticar el servicio.</li>
        </ul>
      </LegalSection>

      <LegalSection title="3. Para qué utilizamos la información">
        <p>La información se utiliza para prestar y administrar los servicios de M&M Eventos, responder consultas, preparar propuestas, gestionar eventos y operaciones internas, autenticar usuarios, registrar asistencia, ofrecer funciones de seguridad, enviar notificaciones operativas y brindar soporte.</p>
        <p>También podemos utilizar registros técnicos para prevenir abuso, investigar errores, proteger cuentas y mejorar la estabilidad y seguridad de la plataforma.</p>
      </LegalSection>

      <LegalSection title="4. Permisos de M&M Eventos Staff">
        <p>La aplicación puede solicitar permisos de ubicación, cámara, fotografías, biometría y notificaciones. Cada permiso se utiliza solamente para la función asociada y puede ser administrado desde la configuración del dispositivo.</p>
        <p>La ubicación no se solicita como requisito permanente para navegar por la app: se utiliza cuando corresponde a funciones de asistencia o fichaje. La biometría funciona a través de las APIs seguras del sistema operativo y no permite a M&M Eventos acceder a los datos biométricos almacenados por el dispositivo.</p>
      </LegalSection>

      <LegalSection title="5. Proveedores y terceros">
        <p>Para operar la plataforma podemos utilizar proveedores de infraestructura, alojamiento, base de datos, almacenamiento de archivos, correo electrónico, notificaciones, mapas, distribución de aplicaciones, procesamiento de pagos u otros servicios técnicos necesarios.</p>
        <p>Cuando un proveedor procesa información por cuenta de M&M Eventos, procuramos limitar los datos compartidos a lo necesario para prestar la función correspondiente y exigir medidas razonables de seguridad y confidencialidad.</p>
      </LegalSection>

      <LegalSection title="6. Conservación y seguridad">
        <p>Conservamos la información durante el tiempo necesario para prestar el servicio, mantener registros operativos y de seguridad, cumplir obligaciones aplicables y resolver reclamos o incidencias. Los plazos concretos pueden variar según el tipo de dato y su finalidad.</p>
        <p>Aplicamos controles técnicos y organizativos destinados a proteger la información frente a accesos no autorizados, pérdida, alteración o divulgación indebida. Ningún sistema conectado a Internet puede garantizar seguridad absoluta.</p>
      </LegalSection>

      <LegalSection title="7. Tus opciones y derechos">
        <p>Podés solicitar información sobre tus datos, pedir su actualización o corrección, plantear una consulta de privacidad o solicitar la eliminación de tu cuenta y de los datos personales asociados.</p>
        <p>Para proteger a los usuarios, antes de ejecutar una solicitud sensible podemos pedir información razonable para verificar la identidad y la titularidad de la cuenta.</p>
      </LegalSection>

      <LegalSection id="eliminar-cuenta" title="8. Eliminación de cuenta y datos">
        <p>Los usuarios de <strong>M&M Eventos Staff</strong> pueden iniciar una solicitud de eliminación mediante el formulario público de esta página, incluso si ya no tienen acceso a la aplicación.</p>
        <p>Una solicitud de eliminación busca eliminar la cuenta y los datos personales asociados a ella. Determinada información puede conservarse cuando resulte necesario por obligaciones legales o administrativas, seguridad, prevención de fraude, defensa ante reclamos o integridad de registros que deban mantenerse. En esos casos, la información retenida se limitará a la finalidad que justifique su conservación.</p>
        <p>La eliminación no se reemplaza por una mera suspensión de acceso. Cuando corresponda verificar identidad o completar una tarea administrativa previa, el equipo se comunicará con la persona solicitante.</p>
      </LegalSection>

      <section id="soporte" className="scroll-mt-24">
        <div className="mb-5">
          <p className="text-xs font-semibold uppercase tracking-[0.28em] text-[#dbe1e8]">Contacto</p>
          <h2 className="mt-2 text-3xl font-semibold text-white">Soporte y eliminación de cuenta</h2>
          <p className="mt-3 text-[15px] leading-7 text-zinc-300">Usá este formulario para soporte general o para iniciar una solicitud de eliminación. No necesitás estar logueado.</p>
        </div>
        <SupportRequestForm source="privacy_page" />
      </section>

      <LegalSection title="9. Cambios en esta política">
        <p>Podemos actualizar esta política cuando cambien las funcionalidades, los proveedores o las prácticas de tratamiento de datos. La fecha de última actualización publicada en esta página indica la versión vigente.</p>
        <p>También podés consultar nuestros <Link href="/terminos" className="font-semibold text-[#dbe1e8] underline underline-offset-4">Términos y Condiciones</Link>.</p>
      </LegalSection>
    </LegalPageShell>
  );
}
