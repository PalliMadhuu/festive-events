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

/** Register media that was uploaded elsewhere (e.g. Firebase Storage) — no file bytes. */
export const registerExternalBodySchema = z
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
    contentType: z.string().min(1).default('video/mp4'),
    size: z.number().int().nonnegative().optional().default(0),
    durationSeconds: z.number().positive().optional().nullable(),
    width: z.number().int().positive().optional().nullable(),
    height: z.number().int().positive().optional().nullable(),
    /** Absolute HTTPS URL to the file (Firebase Storage, CDN, etc.) */
    url: z.string().url(),
    thumbnailUrl: z.string().url().optional().nullable(),
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
    if (!/^https:\/\//i.test(value.url)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'url must be https',
        path: ['url'],
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

/** Start a chunked upload (file assembled across multiple requests). */
export const uploadInitBodySchema = z
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
    contentType: z.string().min(1).default('video/mp4'),
    size: z.number().int().positive(),
    totalChunks: z.number().int().positive().max(120),
    durationSeconds: z.number().positive().optional().nullable(),
    width: z.number().int().positive().optional().nullable(),
    height: z.number().int().positive().optional().nullable(),
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
    // Practical Postgres BYTEA cap for gallery videos (~200MB)
    if (value.size > 200 * 1024 * 1024) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'File too large',
        path: ['size'],
      });
    }
  });

export const uploadChunkBodySchema = z.object({
  id: z.string().uuid(),
  index: z.number().int().nonnegative(),
  totalChunks: z.number().int().positive().max(120),
  /** Base64 chunk (must decode to raw bytes for this piece) */
  base64: z.string().min(1),
});

export const uploadCompleteBodySchema = z.object({
  id: z.string().uuid(),
  totalChunks: z.number().int().positive().max(120),
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
