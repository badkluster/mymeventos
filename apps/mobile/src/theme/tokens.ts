export const colors = {
  background: '#F3F6FC',
  backgroundDark: '#071426',
  backgroundDeep: '#030A15',
  surface: '#FFFFFF',
  surfaceMuted: '#EAF0FA',
  surfaceStrong: '#DCE8F8',
  border: '#D9E3F1',
  text: '#101B32',
  textMuted: '#60708A',
  textSubtle: '#92A0B5',
  primary: '#0B1F3A',
  primarySoft: '#173D6C',
  primaryText: '#FFFFFF',
  accent: '#22D3EE',
  accentSoft: '#CFF7FC',
  violet: '#7C5CFC',
  violetSoft: '#E7E1FF',
  success: '#059669',
  successBg: '#D3F8E8',
  warning: '#B86509',
  warningBg: '#FFF0C9',
  danger: '#D72F5C',
  dangerBg: '#FFE1E9',
  info: '#2563EB',
  infoBg: '#DCEBFF',
  overlay: 'rgba(3,10,21,0.66)'
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
  display: { fontSize: 34, fontWeight: '800' as const, letterSpacing: -1.1 },
  h1: { fontSize: 28, fontWeight: '800' as const, letterSpacing: -0.55 },
  h2: { fontSize: 22, fontWeight: '700' as const, letterSpacing: -0.35 },
  h3: { fontSize: 18, fontWeight: '600' as const },
  body: { fontSize: 15, fontWeight: '400' as const },
  bodyStrong: { fontSize: 15, fontWeight: '600' as const },
  small: { fontSize: 13, fontWeight: '400' as const },
  caption: { fontSize: 12, fontWeight: '500' as const, letterSpacing: 0.2 }
};

export const shadow = {
  card: {
    shadowColor: '#0B1F3A',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.09,
    shadowRadius: 20,
    elevation: 4
  },
  glow: {
    shadowColor: '#22D3EE',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.25,
    shadowRadius: 18,
    elevation: 7
  }
} as const;

export const hitSlop = { top: 8, bottom: 8, left: 8, right: 8 };
