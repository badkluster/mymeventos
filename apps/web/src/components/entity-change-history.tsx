import { History, PencilLine, UserPlus } from 'lucide-react';

export type ChangeHistoryActor = {
  id: string;
  name: string;
};

export type EntityChangeHistory = {
  createdAt?: string;
  updatedAt?: string;
  createdBy: ChangeHistoryActor | null;
  updatedBy: ChangeHistoryActor | null;
  items: Array<{
    id: string;
    action: string;
    createdAt: string;
    actor: ChangeHistoryActor | null;
  }>;
};

const actionLabels: Record<string, string> = {
  LEAD_CREATE: 'Creó el lead',
  LEAD_UPDATE: 'Editó los datos del lead',
  LEAD_STATUS_UPDATE: 'Cambió el estado del lead',
  LEAD_ASSIGN: 'Cambió la asignación del lead',
  LEAD_MARK_LOST: 'Marcó el lead como perdido',
  CUSTOMER_CREATE: 'Creó el cliente',
  CUSTOMER_UPDATE: 'Editó los datos del cliente'
};

const dateTimeFormatter = new Intl.DateTimeFormat('es-AR', {
  dateStyle: 'medium',
  timeStyle: 'short',
  timeZone: 'America/Argentina/Buenos_Aires'
});

function formatDateTime(value?: string): string {
  if (!value) return 'Fecha no registrada';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'Fecha no registrada' : dateTimeFormatter.format(date);
}

function actorName(actor: ChangeHistoryActor | null | undefined): string {
  return actor?.name || 'Sistema o usuario no disponible';
}

function actorInitials(actor: ChangeHistoryActor | null): string {
  if (!actor) return 'S';
  const initials = actor.name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join('');
  return initials.toUpperCase() || 'U';
}

export function EntityChangeHistoryCard({
  history,
  subjectLabel
}: {
  history?: EntityChangeHistory;
  subjectLabel: 'lead' | 'cliente';
}) {
  const items = history?.items ?? [];

  return (
    <article className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
      <header className="flex items-start gap-3">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-zinc-100 text-zinc-600" aria-hidden="true">
          <History className="h-4 w-4" />
        </span>
        <div>
          <h2 className="text-base font-semibold text-zinc-950">Historial de edición</h2>
          <p className="mt-1 text-sm text-zinc-500">Quién creó o modificó este {subjectLabel} desde el backoffice.</p>
        </div>
      </header>

      <dl className="mt-5 grid gap-3 sm:grid-cols-2">
        <div className="rounded-xl border border-zinc-100 bg-zinc-50 p-4">
          <dt className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-zinc-400"><UserPlus className="h-3.5 w-3.5" />Creado por</dt>
          <dd className="mt-2 font-medium text-zinc-900">{actorName(history?.createdBy)}</dd>
          <dd className="mt-1 text-xs text-zinc-500">{formatDateTime(history?.createdAt)}</dd>
        </div>
        <div className="rounded-xl border border-zinc-100 bg-zinc-50 p-4">
          <dt className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-zinc-400"><PencilLine className="h-3.5 w-3.5" />Última actualización</dt>
          <dd className="mt-2 font-medium text-zinc-900">{actorName(history?.updatedBy)}</dd>
          <dd className="mt-1 text-xs text-zinc-500">{formatDateTime(history?.updatedAt)}</dd>
        </div>
      </dl>

      <div className="mt-6 border-t border-zinc-100 pt-5">
        <h3 className="text-sm font-semibold text-zinc-900">Cambios registrados</h3>
        {items.length === 0 ? (
          <p className="mt-3 rounded-xl bg-zinc-50 px-4 py-4 text-sm text-zinc-500">No hay eventos de auditoría históricos para este {subjectLabel}.</p>
        ) : (
          <ol className="mt-4 space-y-4">
            {items.map((item) => (
              <li key={item.id} className="flex gap-3 border-b border-zinc-100 pb-4 last:border-0 last:pb-0">
                <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-zinc-950 text-xs font-semibold text-white" aria-hidden="true">
                  {actorInitials(item.actor)}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-1">
                    <p className="font-medium text-zinc-900">{actionLabels[item.action] ?? 'Actualizó el registro'}</p>
                    <time dateTime={item.createdAt} className="text-xs text-zinc-400">{formatDateTime(item.createdAt)}</time>
                  </div>
                  <p className="mt-1 text-sm text-zinc-500">{actorName(item.actor)}</p>
                </div>
              </li>
            ))}
          </ol>
        )}
      </div>
    </article>
  );
}
