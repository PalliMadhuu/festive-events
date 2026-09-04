import { z } from 'zod';

export const mediaPurposeSchema = z.enum(['gallery', 'donation', 'receipt', 'avatar', 'cover']);
export const mediaKindSchema = z.enum(['photo', 'video']);

export const uploadBodySchema = z
  .object({
    purpose: mediaPurposeSchema,
    kind: mediaKindSchema.optional().default('photo'),
    eventId: z.string().min(1).optional().nullable(),
    subEventId: z.string().min(1).optional().nullable(),
    albumId: z.string().min(1).optional().nullable(),
    userId: z.string().min(1).optional().nullable(),
    donationId: z.string().min(1).optional().nullable(),
    expenseId: z.string().min(1).optional().nullable(),
    uploadedBy: z.string().min(1),
    uploadedByName: z.string().optional().nullable(),
    fileName: z.string().min(1),
    contentType: z.string().min(1).default('image/jpeg'),
    durationSeconds: z.number().positive().optional().nullable(),
    width: z.number().int().positive().optional().nullable(),
    height: z.number().int().positive().optional().nullable(),
    /** Base64 file bytes (with or without data: URL prefix) */
    base64: z.string().min(8),
  })
  .superRefine((value, ctx) => {
    if (value.purpose === 'avatar') {
      if (!value.userId) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'userId is required for avatar uploads',
          path: ['userId'],
        });
      }
    } else if (!value.eventId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'eventId is required for this purpose',
        path: ['eventId'],
      });
    }
  });

export const mappingBodySchema = z.object({
  eventId: z.string().min(1).optional().nullable(),
  subEventId: z.string().min(1).optional().nullable(),
  albumId: z.string().min(1).optional().nullable(),
  userId: z.string().min(1).optional().nullable(),
  donationId: z.string().min(1).optional().nullable(),
  expenseId: z.string().min(1).optional().nullable(),
});

export const softDeleteBodySchema = z.object({
  reason: z.string().min(1, 'Deletion reason is required'),
  deletedBy: z.string().min(1),
  deletedByName: z.string().optional().nullable(),
});

export function stripDataUrl(base64: string) {
  const comma = base64.indexOf(',');
  if (base64.startsWith('data:') && comma >= 0) {
    return base64.slice(comma + 1);
  }
  return base64;
}

export function resolveKind(kind: 'photo' | 'video' | undefined, contentType: string): 'photo' | 'video' {
  if (kind === 'video' || contentType.startsWith('video/')) return 'video';
  return 'photo';
}
