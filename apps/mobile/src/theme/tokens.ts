// Design tokens for the M&M Eventos staff app. Deliberately small and flat (no theming
// engine) — a single light brand theme, matching the backoffice's zinc/emerald palette.

export const colors = {
  background: '#F7F7F8',
  surface: '#FFFFFF',
  surfaceMuted: '#F1F1F3',
  border: '#E4E4E7',
  text: '#0B0B0F',
  textMuted: '#6B7280',
  textSubtle: '#9CA3AF',
  primary: '#0B0B0F',
  primaryText: '#FFFFFF',
  accent: '#D4AF37',
  success: '#059669',
  successBg: '#D1FAE5',
  warning: '#B45309',
  warningBg: '#FEF3C7',
  danger: '#DC2626',
  dangerBg: '#FEE2E2',
  info: '#2563EB',
  infoBg: '#DBEAFE',
  overlay: 'rgba(11,11,15,0.55)'
} as const;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
  xxxl: 48
} as const;

export const radii = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  pill: 999
} as const;

export const typography = {
  h1: { fontSize: 28, fontWeight: '700' as const, letterSpacing: -0.3 },
  h2: { fontSize: 22, fontWeight: '700' as const, letterSpacing: -0.2 },
  h3: { fontSize: 18, fontWeight: '600' as const },
  body: { fontSize: 15, fontWeight: '400' as const },
  bodyStrong: { fontSize: 15, fontWeight: '600' as const },
  small: { fontSize: 13, fontWeight: '400' as const },
  caption: { fontSize: 12, fontWeight: '500' as const, letterSpacing: 0.2 }
};

export const shadow = {
  card: {
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.06,
    shadowRadius: 12,
    elevation: 2
  }
} as const;

export const hitSlop = { top: 8, bottom: 8, left: 8, right: 8 };
