declare const __DEV__: boolean;

const LOCAL_API_URL = 'http://localhost:3001/api';
const PRODUCTION_API_URL = 'https://www.mymsalones.com.ar/api';
const LOCAL_WEB_URL = 'http://localhost:3000';
const PRODUCTION_WEB_URL = 'https://www.mymsalones.com.ar';

function normalizeUrl(value: string, variableName: string): string {
  const normalized = value.trim().replace(/\/+$/, '');

  if (!/^https?:\/\//i.test(normalized)) {
    throw new Error(`${variableName} must start with http:// or https://`);
  }

  if (!__DEV__ && !normalized.toLowerCase().startsWith('https://')) {
    throw new Error(`Production builds require an HTTPS URL for ${variableName}`);
  }

  return normalized;
}

const configuredApiUrl = process.env.EXPO_PUBLIC_API_URL;
const configuredWebUrl = process.env.EXPO_PUBLIC_WEB_URL;

export const API_BASE_URL = normalizeUrl(
  configuredApiUrl && configuredApiUrl.trim().length > 0
    ? configuredApiUrl
    : (__DEV__ ? LOCAL_API_URL : PRODUCTION_API_URL),
  'EXPO_PUBLIC_API_URL'
);

export const PUBLIC_WEB_URL = normalizeUrl(
  configuredWebUrl && configuredWebUrl.trim().length > 0
    ? configuredWebUrl
    : (__DEV__ ? LOCAL_WEB_URL : PRODUCTION_WEB_URL),
  'EXPO_PUBLIC_WEB_URL'
);
