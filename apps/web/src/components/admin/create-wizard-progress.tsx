import { Check } from 'lucide-react';

export type CreateWizardStep = { title: string; description: string };

export function CreateWizardProgress({ steps, currentStep }: { steps: CreateWizardStep[]; currentStep: number }) {
  return <ol className="grid gap-2 rounded-2xl border border-zinc-200 bg-zinc-50 p-3 sm:grid-cols-5" aria-label="Progreso de creación">
    {steps.map((step, index) => {
      const isCurrent = index === currentStep;
      const isComplete = index < currentStep;
      return <li key={step.title} className={`flex min-w-0 items-center gap-2 rounded-xl px-2 py-2 ${isCurrent ? 'bg-white shadow-sm ring-1 ring-zinc-200' : ''}`} aria-current={isCurrent ? 'step' : undefined}>
        <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${isComplete ? 'bg-emerald-600 text-white' : isCurrent ? 'bg-zinc-950 text-white' : 'bg-zinc-200 text-zinc-600'}`}>{isComplete ? <Check className="h-3.5 w-3.5" aria-hidden="true" /> : index + 1}</span>
        <span className="min-w-0"><span className="block truncate text-xs font-semibold text-zinc-900">{step.title}</span><span className="hidden text-xs text-zinc-500 lg:block">{step.description}</span></span>
      </li>;
    })}
  </ol>;
}
