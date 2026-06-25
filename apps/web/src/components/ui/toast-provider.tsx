'use client';

import { createContext, useCallback, useContext, useMemo, useState } from 'react';
import { AlertCircle, CheckCircle2, Info, X } from 'lucide-react';

type ToastVariant = 'success' | 'error' | 'info';

type ToastInput = {
  title?: string;
  message: string;
  variant?: ToastVariant;
  durationMs?: number;
};

type Toast = Required<Pick<ToastInput, 'message' | 'variant'>> & {
  id: string;
  title?: string;
};

type ToastContextValue = {
  showToast: (toast: ToastInput | string, variant?: ToastVariant) => void;
};

const ToastContext = createContext<ToastContextValue | undefined>(undefined);

const variantStyles: Record<ToastVariant, { icon: typeof CheckCircle2; container: string; iconClass: string; title: string }> = {
  success: {
    icon: CheckCircle2,
    container: 'border-emerald-200 bg-emerald-50 text-emerald-950 shadow-emerald-950/10',
    iconClass: 'text-emerald-600',
    title: 'Operación realizada'
  },
  error: {
    icon: AlertCircle,
    container: 'border-red-200 bg-red-50 text-red-950 shadow-red-950/10',
    iconClass: 'text-red-600',
    title: 'No se pudo completar'
  },
  info: {
    icon: Info,
    container: 'border-zinc-200 bg-white text-zinc-950 shadow-zinc-950/10',
    iconClass: 'text-zinc-600',
    title: 'Aviso'
  }
};

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const dismiss = useCallback((id: string) => {
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }, []);

  const showToast = useCallback((input: ToastInput | string, fallbackVariant: ToastVariant = 'info') => {
    const toastInput: ToastInput = typeof input === 'string' ? { message: input, variant: fallbackVariant } : input;
    const variant = toastInput.variant ?? fallbackVariant;
    const id = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const toast: Toast = { id, message: toastInput.message, title: toastInput.title, variant };
    setToasts((current) => [...current.slice(-3), toast]);
    window.setTimeout(() => dismiss(id), toastInput.durationMs ?? (variant === 'error' ? 5500 : 3800));
  }, [dismiss]);

  const value = useMemo(() => ({ showToast }), [showToast]);

  return <ToastContext.Provider value={value}>
    {children}
    <div aria-live="polite" aria-atomic="true" className="pointer-events-none fixed left-1/2 top-5 z-[100] flex w-[calc(100vw-2rem)] max-w-xl -translate-x-1/2 flex-col gap-3 sm:top-6">
      {toasts.map((toast) => {
        const style = variantStyles[toast.variant];
        const Icon = style.icon;
        return <div key={toast.id} className={`pointer-events-auto flex items-start gap-3 rounded-2xl border px-4 py-3 shadow-xl backdrop-blur ${style.container}`}>
          <Icon className={`mt-0.5 h-5 w-5 shrink-0 ${style.iconClass}`} aria-hidden="true" />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold">{toast.title ?? style.title}</p>
            <p className="mt-0.5 text-sm leading-5 opacity-90">{toast.message}</p>
          </div>
          <button type="button" aria-label="Cerrar alerta" onClick={() => dismiss(toast.id)} className="rounded-full p-1 text-current opacity-60 transition hover:bg-black/5 hover:opacity-100">
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>;
      })}
    </div>
  </ToastContext.Provider>;
}

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) throw new Error('useToast debe usarse dentro de ToastProvider.');
  return context;
}
