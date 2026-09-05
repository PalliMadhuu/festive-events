export type MediaPurpose = 'gallery' | 'donation' | 'receipt' | 'avatar' | 'cover';
export type MediaKind = 'photo' | 'video';

/** Metadata row — never include file_data in list/get JSON responses. */
export type MediaRow = {
  id: string;
  purpose: MediaPurpose;
  kind: MediaKind;
  event_id: string | null;
  sub_event_id: string | null;
  album_id: string | null;
  user_id: string | null;
  donation_id: string | null;
  expense_id: string | null;
  file_name: string;
  content_type: string;
  size_bytes: number;
  duration_seconds: number | null;
  width: number | null;
  height: number | null;
  url: string | null;
  blob_pathname: string | null;
  thumbnail_url: string | null;
  uploaded_by: string;
  uploaded_by_name: string | null;
  created_at: string;
  updated_at: string;
  deleted: boolean;
  deleted_at: string | null;
  deleted_by: string | null;
  deleted_by_name: string | null;
  deletion_reason: string | null;
};

export type MediaDto = {
  id: string;
  purpose: MediaPurpose;
  kind: MediaKind;
  eventId: string | null;
  subEventId: string | null;
  albumId: string | null;
  userId: string | null;
  donationId: string | null;
  expenseId: string | null;
  fileName: string;
  contentType: string;
  size: number;
  durationSeconds: number | null;
  width: number | null;
  height: number | null;
  /** Absolute or relative URL to stream bytes: GET /api/media/:id/file */
  url: string;
  thumbnailUrl: string | null;
  uploadedBy: string;
  uploadedByName: string | null;
  createdAt: string;
  updatedAt: string;
  deleted: boolean;
  deletedAt: string | null;
  deletedBy: string | null;
  deletedByName: string | null;
  deletionReason: string | null;
};

/** Columns for list/get metadata (excludes heavy file_data). */
export const MEDIA_META_COLUMNS = `
  id, purpose, kind, event_id, sub_event_id, album_id, user_id,
  donation_id, expense_id, file_name, content_type, size_bytes,
  duration_seconds, width, height, url, blob_pathname, thumbnail_url,
  uploaded_by, uploaded_by_name, created_at, updated_at,
  deleted, deleted_at, deleted_by, deleted_by_name, deletion_reason
`;

export function publicFileUrl(id: string): string {
  const path = `/api/media/content?id=${encodeURIComponent(id)}`;
  let base = (process.env.API_PUBLIC_URL || '').replace(/\/$/, '');

  // Never expose localhost / LAN IPs to mobile clients — they can't load those URLs.
  const bad =
    !base ||
    /localhost|127\.0\.0\.1/i.test(base) ||
    /^https?:\/\/(10\.|192\.168\.|172\.(1[6-9]|2\d|3[0-1])\.|169\.254\.)/i.test(base);

  if (bad) {
    if (process.env.VERCEL_URL) {
      base = `https://${process.env.VERCEL_URL.replace(/^https?:\/\//, '')}`;
    } else {
      base = 'https://festive-events-phi.vercel.app';
    }
  }

  return `${base}${path}`;
}

/** Prefer external https URLs (Firebase Storage); otherwise stream via API. */
export function resolveMediaPublicUrl(row: MediaRow): string {
  const stored = (row.url || '').trim();
  if (
    /^https:\/\//i.test(stored) &&
    !stored.includes('/api/media/content') &&
    !/\/api\/media\/[^/]+\/file/.test(stored)
  ) {
    return stored;
  }
  return publicFileUrl(row.id);
}

export function toMediaDto(row: MediaRow): MediaDto {
  return {
    id: row.id,
    purpose: row.purpose,
    kind: row.kind || 'photo',
    eventId: row.event_id,
    subEventId: row.sub_event_id,
    albumId: row.album_id,
    userId: row.user_id,
    donationId: row.donation_id,
    expenseId: row.expense_id,
    fileName: row.file_name,
    contentType: row.content_type,
    size: Number(row.size_bytes) || 0,
    durationSeconds: row.duration_seconds != null ? Number(row.duration_seconds) : null,
    width: row.width,
    height: row.height,
    url: resolveMediaPublicUrl(row),
    thumbnailUrl: row.thumbnail_url,
    uploadedBy: row.uploaded_by,
    uploadedByName: row.uploaded_by_name,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    deleted: row.deleted,
    deletedAt: row.deleted_at,
    deletedBy: row.deleted_by,
    deletedByName: row.deleted_by_name,
    deletionReason: row.deletion_reason,
  };
}

/** Normalize Neon/Postgres BYTEA return values to Buffer. */
export function byteaToBuffer(data: unknown): Buffer {
  if (!data) return Buffer.alloc(0);
  if (Buffer.isBuffer(data)) return data;
  if (data instanceof Uint8Array) return Buffer.from(data);
  if (typeof data === 'string') {
    if (data.startsWith('\\x')) return Buffer.from(data.slice(2), 'hex');
    return Buffer.from(data, 'base64');
  }
  throw new Error('Unexpected BYTEA encoding from database');
}
