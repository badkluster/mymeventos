import type { InvitationTheme } from './types';

const channel = (hex: string, position: number) => Number.parseInt(hex.slice(position, position + 2), 16) / 255;
const linear = (value: number) => value <= .03928 ? value / 12.92 : ((value + .055) / 1.055) ** 2.4;

function luminance(hex?: string) {
  const value = hex?.replace('#', '') ?? '';
  if (!/^[0-9a-f]{6}$/i.test(value)) return 1;
  return linear(channel(value, 0)) * .2126 + linear(channel(value, 2)) * .7152 + linear(channel(value, 4)) * .0722;
}

function readableTextColor(color: string) {
  const lightContrast = (1.05) / (luminance(color) + .05);
  const darkContrast = (luminance(color) + .05) / .05;
  return lightContrast >= darkContrast ? '#ffffff' : '#171312';
}

export function resolveInvitationTheme(source?: InvitationTheme) {
  const backgroundColor = source?.backgroundColor ?? '#fffdf9';
  const isDark = luminance(backgroundColor) < .18;
  const primaryColor = source?.primaryColor ?? '#9e7657';
  return {
    primaryColor,
    secondaryColor: source?.secondaryColor ?? '#312820',
    accentColor: source?.accentColor ?? primaryColor,
    backgroundColor,
    surfaceColor: source?.surfaceColor ?? (isDark ? source?.secondaryColor ?? '#211b24' : '#ffffff'),
    textColor: source?.textColor ?? (isDark ? '#fff8ef' : '#30271f'),
    mutedTextColor: source?.mutedTextColor ?? (isDark ? '#d7c9d0' : '#766a61'),
    headingFont: source?.headingFont ?? 'Georgia',
    bodyFont: source?.bodyFont ?? 'system-ui',
    onPrimaryColor: readableTextColor(primaryColor)
  };
}
