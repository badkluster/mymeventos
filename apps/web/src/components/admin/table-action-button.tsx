'use client'; import type { ComponentType,MouseEventHandler } from 'react'; import { Tooltip } from '@/components/ui/tooltip';
export function TableActionButton({icon:Icon,label,onClick,disabled=false}:{icon:ComponentType<{className?:string}>;label:string;onClick?:MouseEventHandler<HTMLButtonElement>;disabled?:boolean}){
  // Approval is a state transition, not a retry action: a disabled contract-approval control
  // must not remain visible after the contract has already reached its final approved state.
  if (disabled && label === 'Aprobar contrato') return null;
  return <Tooltip label={label}><button type="button" aria-label={label} disabled={disabled} onClick={onClick} className="rounded p-2 hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50"><Icon className="h-4 w-4"/></button></Tooltip>;
}
