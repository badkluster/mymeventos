'use client';

import {
  ThemeProvider as NextThemesProvider,
  type ThemeProviderProps as NextThemesProviderProps,
} from 'next-themes';
import type { ComponentType, ReactNode } from 'react';

type ThemeProviderProps = NextThemesProviderProps & {
  children: ReactNode;
};

// next-themes 0.4.6 declares ThemeProviderProps through PropsWithChildren.
// With the current React 19 type definitions, TypeScript can lose the
// children property when validating JSX. Keep the compatibility cast local.
const CompatibleNextThemesProvider =
  NextThemesProvider as ComponentType<ThemeProviderProps>;

export function ThemeProvider({ children, ...props }: ThemeProviderProps) {
  return (
    <CompatibleNextThemesProvider
      attribute="class"
      defaultTheme="system"
      enableSystem
      disableTransitionOnChange
      {...props}
    >
      {children}
    </CompatibleNextThemesProvider>
  );
}
