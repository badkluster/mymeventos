import { Router } from 'express';
import multer from 'multer';
import { z } from 'zod';
import { hasPermission, Permission } from '@mym/shared';
import { requireAuth } from '../../middlewares/auth';
import { asyncHandler } from '../../utils/asyncHandler';
import { ApiError } from '../../middlewares/errorHandler';
import { sendSuccess } from '../../utils/api';
import { deleteAsset, uploadBuffer } from './cloudinary.service';

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 25 * 1024 * 1024 } });
const contexts = ['salons', 'users', 'quotes', 'documents', 'general'] as const;
const uploadSchema = z.object({ context: z.enum(contexts).default('general'), folder: z.string().trim().optional(), salonId: z.string().regex(/^[0-9a-fA-F]{24}$/).optional(), quoteId: z.string().regex(/^[0-9a-fA-F]{24}$/).optional() });
const deleteSchema = z.object({
  query: z.object({
    context: z.enum(contexts).default('general'),
    publicId: z.string().trim().min(1),
    resourceType: z.enum(['image', 'video', 'raw']).default('image')
  }),
  body: z.object({}).optional(),
  params: z.object({})
});

const imageExtensions = new Set(['.avif', '.gif', '.heic', '.heif', '.jpeg', '.jpg', '.png', '.webp']);
const videoExtensions = new Set(['.avi', '.m4v', '.mov', '.mp4', '.mpeg', '.mpg', '.webm']);

function fileExtension(file: Express.Multer.File): string {
  const match = file.originalname.toLowerCase().match(/\.[a-z0-9]+$/);
  return match?.[0] ?? '';
}

function isHeicLike(file: Express.Multer.File): boolean {
  const extension = fileExtension(file);
  return ['.heic', '.heif'].includes(extension) || ['image/heic', 'image/heif', 'image/heic-sequence', 'image/heif-sequence'].includes(file.mimetype);
}

function resourceTypeFor(file: Express.Multer.File): 'image' | 'video' | 'raw' {
  const extension = fileExtension(file);
  if (file.mimetype.startsWith('image/') || imageExtensions.has(extension)) return 'image';
  if (file.mimetype.startsWith('video/') || videoExtensions.has(extension)) return 'video';
  return 'raw';
}

function defaultFolder(input: z.infer<typeof uploadSchema>): string {
  if (input.folder) return `mym-eventos/${input.folder.replace(/^\/+|\/+$/g, '')}`;
  if (input.context === 'salons' && input.salonId) return `mym-eventos/salons/${input.salonId}`;
  if (input.context === 'quotes' && input.quoteId) return `mym-eventos/quotes/${input.quoteId}`;
  return `mym-eventos/${input.context}`;
}

router.use(requireAuth);

function canUpload(request: Express.Request, context: z.infer<typeof uploadSchema>['context']) {
  const user = request.user;
  if (!user) return false;
  if (context === 'users') return true;
  const needed = context === 'salons' ? Permission.SALONS_UPDATE : context === 'general' ? Permission.LANDING_UPDATE : Permission.SALONS_UPDATE;
  return user.roles.some((role) => hasPermission(role, needed, user.permissionOverrides, user.permissionDeniedOverrides));
}

router.post('/', upload.single('file'), asyncHandler(async (request, response) => {
  if (!request.file) throw new ApiError(400, 'UPLOAD_FILE_REQUIRED');
  const parsed = uploadSchema.safeParse(request.body);
  if (!parsed.success) throw new ApiError(400, 'VALIDATION_ERROR');
  if (!canUpload(request, parsed.data.context)) throw new ApiError(403, 'FORBIDDEN');
  const resourceType = resourceTypeFor(request.file);
  const shouldConvertToJpg = resourceType === 'image' && isHeicLike(request.file);
  const asset = await uploadBuffer(request.file.buffer, {
    folder: defaultFolder(parsed.data),
    resource_type: resourceType,
    ...(shouldConvertToJpg ? { format: 'jpg' } : {}),
    use_filename: true,
    unique_filename: true,
    overwrite: false,
    type: 'upload'
  });
  return sendSuccess(response, { asset }, 201, 'Archivo subido correctamente.');
}));

router.delete('/', asyncHandler(async (request, response) => {
  const parsed = deleteSchema.safeParse({ body: request.body, params: request.params, query: request.query });
  if (!parsed.success) throw new ApiError(400, 'VALIDATION_ERROR');
  if (!canUpload(request, parsed.data.query.context)) throw new ApiError(403, 'FORBIDDEN');
  await deleteAsset(parsed.data.query.publicId, parsed.data.query.resourceType);
  return sendSuccess(response, { deleted: true }, 200, 'Archivo eliminado correctamente.');
}));

export default router;
