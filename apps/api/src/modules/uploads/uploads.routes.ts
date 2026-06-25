import { Router } from 'express';
import multer from 'multer';
import { z } from 'zod';
import { Permission } from '@mym/shared';
import { requireAuth, requirePermission } from '../../middlewares/auth';
import { asyncHandler } from '../../utils/asyncHandler';
import { ApiError } from '../../middlewares/errorHandler';
import { sendSuccess } from '../../utils/api';
import { uploadBuffer } from './cloudinary.service';

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 25 * 1024 * 1024 } });
const contexts = ['salons', 'users', 'quotes', 'documents', 'general'] as const;
const uploadSchema = z.object({ context: z.enum(contexts).default('general'), folder: z.string().trim().optional(), salonId: z.string().regex(/^[0-9a-fA-F]{24}$/).optional(), quoteId: z.string().regex(/^[0-9a-fA-F]{24}$/).optional() });

function resourceTypeFor(mimeType: string): 'image' | 'video' | 'raw' {
  if (mimeType.startsWith('image/')) return 'image';
  if (mimeType.startsWith('video/')) return 'video';
  return 'raw';
}

function defaultFolder(input: z.infer<typeof uploadSchema>): string {
  if (input.folder) return `mym-eventos/${input.folder.replace(/^\/+|\/+$/g, '')}`;
  if (input.context === 'salons' && input.salonId) return `mym-eventos/salons/${input.salonId}`;
  if (input.context === 'quotes' && input.quoteId) return `mym-eventos/quotes/${input.quoteId}`;
  return `mym-eventos/${input.context}`;
}

router.use(requireAuth);

router.post('/', requirePermission(Permission.SALONS_UPDATE), upload.single('file'), asyncHandler(async (request, response) => {
  if (!request.file) throw new ApiError(400, 'UPLOAD_FILE_REQUIRED');
  const parsed = uploadSchema.safeParse(request.body);
  if (!parsed.success) throw new ApiError(400, 'VALIDATION_ERROR');
  const resourceType = resourceTypeFor(request.file.mimetype);
  const asset = await uploadBuffer(request.file.buffer, {
    folder: defaultFolder(parsed.data),
    resource_type: resourceType,
    use_filename: true,
    unique_filename: true,
    overwrite: false,
    type: 'upload'
  });
  return sendSuccess(response, { asset }, 201, 'Archivo subido correctamente.');
}));

export default router;
