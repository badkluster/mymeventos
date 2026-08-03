const LOCAL_API_URL = 'http://localhost:3001/api';
const PRODUCTION_API_URL = 'https://www.mymsalones.com.ar/api';

function normalizeApiUrl(value: string): string {
  const normalized = value.trim().replace(/\/+$/, '');

  if (!/^https?:\/\//i.test(normalized)) {
    throw new Error('EXPO_PUBLIC_API_URL must start with http:// or https://');
  }

  if (!__DEV__ && !normalized.toLowerCase().startsWith('https://')) {
    throw new Error('Production builds require an HTTPS API URL');
  }

  return normalized;
}

const configuredApiUrl = process.env.EXPO_PUBLIC_API_URL;

export const API_BASE_URL = normalizeApiUrl(
  configuredApiUrl && configuredApiUrl.trim().length > 0
    ? configuredApiUrl
    : (__DEV__ ? LOCAL_API_URL : PRODUCTION_API_URL)
);
