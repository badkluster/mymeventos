import { v2 as cloudinary, type UploadApiOptions, type UploadApiResponse } from 'cloudinary';
import { env } from '../../config/env';

let configured = false;

export function configureCloudinary(): void {
  if (configured) return;
  let cloudName = env.CLOUDINARY_CLOUD_NAME;
  let apiKey = env.CLOUDINARY_API_KEY;
  let apiSecret = env.CLOUDINARY_API_SECRET;
  if ((!cloudName || !apiKey || !apiSecret) && env.CLOUDINARY_URL) {
    try {
      const url = new URL(env.CLOUDINARY_URL);
      if (url.protocol !== 'cloudinary:') throw new Error('Protocolo inválido');
      cloudName = cloudName || url.hostname;
      apiKey = apiKey || decodeURIComponent(url.username);
      apiSecret = apiSecret || decodeURIComponent(url.password);
    } catch {
      throw new Error('CLOUDINARY_URL no tiene un formato válido. Usá cloudinary://API_KEY:API_SECRET@CLOUD_NAME.');
    }
  }
  if (!cloudName || !apiKey || !apiSecret) {
    throw new Error('Cloudinary no está configurado. Definí CLOUDINARY_URL o CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY y CLOUDINARY_API_SECRET.');
  }
  cloudinary.config({ cloud_name: cloudName, api_key: apiKey, api_secret: apiSecret, secure: true });
  configured = true;
}

export type UploadedAsset = {
  publicId: string;
  url: string;
  secureUrl: string;
  resourceType: string;
  format?: string;
  bytes: number;
  width?: number;
  height?: number;
  duration?: number;
  originalFilename?: string;
};

export function uploadBuffer(buffer: Buffer, options: UploadApiOptions): Promise<UploadedAsset> {
  configureCloudinary();
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(options, (error, result?: UploadApiResponse) => {
      if (error || !result) return reject(error ?? new Error('Cloudinary no devolvió resultado de subida.'));
      resolve({
        publicId: result.public_id,
        url: result.url,
        secureUrl: result.secure_url,
        resourceType: result.resource_type,
        format: result.format,
        bytes: result.bytes,
        width: result.width,
        height: result.height,
        duration: result.duration,
        originalFilename: result.original_filename
      });
    });
    stream.end(buffer);
  });
}

export async function deleteAsset(publicId: string, resourceType: 'image' | 'video' | 'raw'): Promise<void> {
  configureCloudinary();
  const result = await cloudinary.uploader.destroy(publicId, { resource_type: resourceType, invalidate: true });
  if (!['ok', 'not found'].includes(result.result)) throw new Error(`Cloudinary no pudo eliminar el archivo: ${result.result}`);
}

export function getSignedDownloadUrl(publicId: string, expiresInSeconds = 900): string {
  configureCloudinary();
  return cloudinary.utils.private_download_url(publicId, 'pdf', {
    resource_type: 'raw',
    type: 'upload',
    expires_at: Math.floor(Date.now() / 1000) + expiresInSeconds,
  });
}
