'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Ga4PerformancePanel } from './ga4-performance-panel';

export function Ga4PerformancePlacement() {
  const [target, setTarget] = useState<HTMLElement | null>(null);

  useEffect(() => {
    setTarget(document.getElementById('resumen'));
  }, []);

  const panel = <Ga4PerformancePanel />;
  return target ? createPortal(panel, target) : panel;
}
