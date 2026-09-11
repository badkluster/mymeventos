import { existsSync } from 'fs';
import path from 'path';

export const BRAND_LOGO_FILE_NAME = 'mym-logo-primary.png';
export const BRAND_LOGO_PUBLIC_PATH = `/brand/${BRAND_LOGO_FILE_NAME}`;

/**
 * Resolución única para PDFs y adjuntos de email. Contempla la ejecución desde la
 * raíz del monorepo, desde apps/api y desde los árboles source/dist desplegados.
 */
export function resolveBrandLogoPath(): string | undefined {
  const relativeAsset = path.join('web', 'public', 'brand', BRAND_LOGO_FILE_NAME);
  const candidates = [
    path.resolve(process.cwd(), 'apps', relativeAsset),
    path.resolve(process.cwd(), '..', relativeAsset),
    path.resolve(__dirname, '..', '..', '..', relativeAsset),
    path.resolve(__dirname, '..', '..', '..', '..', relativeAsset)
  ];
  return candidates.find((candidate) => existsSync(candidate));
}
