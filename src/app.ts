import { Hono } from 'hono';
import { corsHeaders } from './lib/auth.js';
import { getDb } from './lib/db.js';
import {
  mappingBodySchema,
  softDeleteBodySchema,
  stripDataUrl,
  uploadBodySchema,
  mediaPurposeSchema,
  mediaKindSchema,
  resolveKind,
} from './lib/schemas.js';
import { byteaToBuffer, MediaRow, publicFileUrl, toMediaDto } from './lib/types.js';

const app = new Hono().basePath('/api');

app.use('*', async (c, next) => {
  const headers = corsHeaders();
  if (c.req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers });
  }
  await next();
  Object.entries(headers).forEach(([key, value]) => c.header(key, value));
});

app.get('/health', (c) =>
  c.json({
    ok: true,
    service: 'festive-events-api',
    storage: 'postgres-bytea',
    time: new Date().toISOString(),
  })
);

/** Upload photo/video — bytes stored in Postgres `media.file_data` */
app.post('/media/upload', async (c) => {
  try {
    const json = await c.req.json();
    const parsed = uploadBodySchema.safeParse(json);
    if (!parsed.success) {
      return c.json({ error: 'Invalid body', details: parsed.error.flatten() }, 400);
    }

    const data = parsed.data;
    const kind = resolveKind(data.kind, data.contentType);
    const raw = stripDataUrl(data.base64);
    const buffer = Buffer.from(raw, 'base64');
    if (!buffer.length) {
      return c.json({ error: 'Empty file data' }, 400);
    }

    // Vercel hobby request body ~4.5MB; keep a safety margin
    if (buffer.length > 4.2 * 1024 * 1024) {
      return c.json(
        {
          error:
            'File too large for this endpoint (max ~4MB). Compress the image/video before upload.',
        },
        413
      );
    }

    const sql = getDb();
    const rows = (await sql`
      INSERT INTO media (
        purpose, kind, event_id, sub_event_id, album_id, user_id,
        donation_id, expense_id,
        file_name, content_type, size_bytes, duration_seconds, width, height,
        file_data, url,
        uploaded_by, uploaded_by_name
      ) VALUES (
        ${data.purpose},
        ${kind},
        ${data.eventId ?? null},
        ${data.subEventId ?? null},
        ${data.albumId ?? null},
        ${data.userId ?? null},
        ${data.donationId ?? null},
        ${data.expenseId ?? null},
        ${data.fileName},
        ${data.contentType},
        ${buffer.length},
        ${data.durationSeconds ?? null},
        ${data.width ?? null},
        ${data.height ?? null},
        ${buffer},
        ${''},
        ${data.uploadedBy},
        ${data.uploadedByName ?? null}
      )
      RETURNING
        id, purpose, kind, event_id, sub_event_id, album_id, user_id,
        donation_id, expense_id, file_name, content_type, size_bytes,
        duration_seconds, width, height, url, blob_pathname, thumbnail_url,
        uploaded_by, uploaded_by_name, created_at, updated_at,
        deleted, deleted_at, deleted_by, deleted_by_name, deletion_reason
    `) as MediaRow[];

    const row = rows[0];
    // Persist convenient file URL path (optional absolute via API_PUBLIC_URL)
    const url = publicFileUrl(row.id);
    await sql`UPDATE media SET url = ${url} WHERE id = ${row.id}::uuid`;
    row.url = url;

    return c.json({ success: true, media: toMediaDto(row) }, 201);
  } catch (error: any) {
    console.error('upload failed', error);
    return c.json({ error: error?.message || 'Upload failed' }, 500);
  }
});

/** List media metadata by mapping filters (no file bytes in response) */
app.get('/media', async (c) => {
  try {
    const eventId = c.req.query('eventId') || null;
    const purposeRaw = c.req.query('purpose');
    const kindRaw = c.req.query('kind');
    const albumId = c.req.query('albumId') || null;
    const subEventId = c.req.query('subEventId') || null;
    const userId = c.req.query('userId') || null;
    const donationId = c.req.query('donationId') || null;
    const expenseId = c.req.query('expenseId') || null;
    const includeDeleted = c.req.query('includeDeleted') === 'true';
    const limit = Math.min(Number(c.req.query('limit') || 100), 200);

    let purpose: string | null = null;
    if (purposeRaw) {
      const parsed = mediaPurposeSchema.safeParse(purposeRaw);
      if (!parsed.success) return c.json({ error: 'Invalid purpose' }, 400);
      purpose = parsed.data;
    }

    let kind: string | null = null;
    if (kindRaw) {
      const parsed = mediaKindSchema.safeParse(kindRaw);
      if (!parsed.success) return c.json({ error: 'Invalid kind (use photo or video)' }, 400);
      kind = parsed.data;
    }

    const sql = getDb();
    const rows = (await sql`
      SELECT
        id, purpose, kind, event_id, sub_event_id, album_id, user_id,
        donation_id, expense_id, file_name, content_type, size_bytes,
        duration_seconds, width, height, url, blob_pathname, thumbnail_url,
        uploaded_by, uploaded_by_name, created_at, updated_at,
        deleted, deleted_at, deleted_by, deleted_by_name, deletion_reason
      FROM media
      WHERE (${includeDeleted}::boolean OR deleted = FALSE)
        AND (${eventId}::text IS NULL OR event_id = ${eventId})
        AND (${purpose}::text IS NULL OR purpose::text = ${purpose})
        AND (${kind}::text IS NULL OR kind::text = ${kind})
        AND (${albumId}::text IS NULL OR album_id::text = ${albumId})
        AND (${subEventId}::text IS NULL OR sub_event_id = ${subEventId})
        AND (${userId}::text IS NULL OR user_id = ${userId})
        AND (${donationId}::text IS NULL OR donation_id = ${donationId})
        AND (${expenseId}::text IS NULL OR expense_id = ${expenseId})
      ORDER BY created_at DESC
      LIMIT ${limit}
    `) as MediaRow[];

    return c.json({
      success: true,
      count: rows.length,
      media: rows.map(toMediaDto),
    });
  } catch (error: any) {
    console.error('list media failed', error);
    return c.json({ error: error?.message || 'Failed to list media' }, 500);
  }
});

/** Get one media metadata record */
app.get('/media/:id', async (c) => {
  try {
    const id = c.req.param('id');
    const sql = getDb();
    const rows = (await sql`
      SELECT
        id, purpose, kind, event_id, sub_event_id, album_id, user_id,
        donation_id, expense_id, file_name, content_type, size_bytes,
        duration_seconds, width, height, url, blob_pathname, thumbnail_url,
        uploaded_by, uploaded_by_name, created_at, updated_at,
        deleted, deleted_at, deleted_by, deleted_by_name, deletion_reason
      FROM media
      WHERE id = ${id}::uuid
    `) as MediaRow[];
    if (!rows[0]) return c.json({ error: 'Not found' }, 404);
    return c.json({ success: true, media: toMediaDto(rows[0]) });
  } catch (error: any) {
    return c.json({ error: error?.message || 'Failed to fetch media' }, 500);
  }
});

/** Stream raw bytes from Postgres */
app.get('/media/:id/file', async (c) => {
  try {
    const id = c.req.param('id');
    const sql = getDb();
    const rows = (await sql`
      SELECT file_data, content_type, file_name, deleted
      FROM media
      WHERE id = ${id}::uuid
    `) as Array<{
      file_data: unknown;
      content_type: string;
      file_name: string;
      deleted: boolean;
    }>;

    if (!rows[0]) return c.json({ error: 'Not found' }, 404);
    if (rows[0].deleted) return c.json({ error: 'Media was deleted' }, 410);
    if (!rows[0].file_data) return c.json({ error: 'No file data stored for this record' }, 404);

    const buffer = byteaToBuffer(rows[0].file_data);
    return new Response(new Uint8Array(buffer), {
      status: 200,
      headers: {
        'Content-Type': rows[0].content_type || 'application/octet-stream',
        'Content-Length': String(buffer.length),
        'Content-Disposition': `inline; filename="${rows[0].file_name.replace(/"/g, '')}"`,
        'Cache-Control': 'private, max-age=3600',
      },
    });
  } catch (error: any) {
    console.error('file stream failed', error);
    return c.json({ error: error?.message || 'Failed to stream file' }, 500);
  }
});

/** Remap linkage without re-uploading */
app.patch('/media/:id/mapping', async (c) => {
  try {
    const id = c.req.param('id');
    const parsed = mappingBodySchema.safeParse(await c.req.json());
    if (!parsed.success) {
      return c.json({ error: 'Invalid body', details: parsed.error.flatten() }, 400);
    }

    const sql = getDb();
    const existing = (await sql`
      SELECT
        id, purpose, kind, event_id, sub_event_id, album_id, user_id,
        donation_id, expense_id, file_name, content_type, size_bytes,
        duration_seconds, width, height, url, blob_pathname, thumbnail_url,
        uploaded_by, uploaded_by_name, created_at, updated_at,
        deleted, deleted_at, deleted_by, deleted_by_name, deletion_reason
      FROM media WHERE id = ${id}::uuid
    `) as MediaRow[];
    if (!existing[0]) return c.json({ error: 'Not found' }, 404);
    if (existing[0].deleted) return c.json({ error: 'Cannot remap a deleted media item' }, 400);

    const next = {
      eventId: parsed.data.eventId === undefined ? existing[0].event_id : parsed.data.eventId,
      subEventId:
        parsed.data.subEventId === undefined ? existing[0].sub_event_id : parsed.data.subEventId,
      albumId: parsed.data.albumId === undefined ? existing[0].album_id : parsed.data.albumId,
      userId: parsed.data.userId === undefined ? existing[0].user_id : parsed.data.userId,
      donationId:
        parsed.data.donationId === undefined ? existing[0].donation_id : parsed.data.donationId,
      expenseId:
        parsed.data.expenseId === undefined ? existing[0].expense_id : parsed.data.expenseId,
    };

    const rows = (await sql`
      UPDATE media SET
        event_id = ${next.eventId},
        sub_event_id = ${next.subEventId},
        album_id = ${next.albumId},
        user_id = ${next.userId},
        donation_id = ${next.donationId},
        expense_id = ${next.expenseId},
        updated_at = NOW()
      WHERE id = ${id}::uuid
      RETURNING
        id, purpose, kind, event_id, sub_event_id, album_id, user_id,
        donation_id, expense_id, file_name, content_type, size_bytes,
        duration_seconds, width, height, url, blob_pathname, thumbnail_url,
        uploaded_by, uploaded_by_name, created_at, updated_at,
        deleted, deleted_at, deleted_by, deleted_by_name, deletion_reason
    `) as MediaRow[];

    return c.json({ success: true, media: toMediaDto(rows[0]) });
  } catch (error: any) {
    return c.json({ error: error?.message || 'Failed to update mapping' }, 500);
  }
});

/** Soft-delete (keeps bytes + mapping for audit) */
app.delete('/media/:id', async (c) => {
  try {
    const id = c.req.param('id');
    const parsed = softDeleteBodySchema.safeParse(await c.req.json().catch(() => ({})));
    if (!parsed.success) {
      return c.json({ error: 'Invalid body', details: parsed.error.flatten() }, 400);
    }

    const sql = getDb();
    const existing = (await sql`SELECT id, deleted FROM media WHERE id = ${id}::uuid`) as Array<{
      id: string;
      deleted: boolean;
    }>;
    if (!existing[0]) return c.json({ error: 'Not found' }, 404);
    if (existing[0].deleted) return c.json({ error: 'Already deleted' }, 400);

    const rows = (await sql`
      UPDATE media SET
        deleted = TRUE,
        deleted_at = NOW(),
        deleted_by = ${parsed.data.deletedBy},
        deleted_by_name = ${parsed.data.deletedByName ?? null},
        deletion_reason = ${parsed.data.reason},
        updated_at = NOW()
      WHERE id = ${id}::uuid
      RETURNING
        id, purpose, kind, event_id, sub_event_id, album_id, user_id,
        donation_id, expense_id, file_name, content_type, size_bytes,
        duration_seconds, width, height, url, blob_pathname, thumbnail_url,
        uploaded_by, uploaded_by_name, created_at, updated_at,
        deleted, deleted_at, deleted_by, deleted_by_name, deletion_reason
    `) as MediaRow[];

    return c.json({ success: true, media: toMediaDto(rows[0]) });
  } catch (error: any) {
    return c.json({ error: error?.message || 'Failed to delete media' }, 500);
  }
});

/** Hard-delete row + bytes from Postgres */
app.delete('/media/:id/hard', async (c) => {
  try {
    const id = c.req.param('id');
    const sql = getDb();
    const existing = (await sql`SELECT id FROM media WHERE id = ${id}::uuid`) as Array<{ id: string }>;
    if (!existing[0]) return c.json({ error: 'Not found' }, 404);
    await sql`DELETE FROM media WHERE id = ${id}::uuid`;
    return c.json({ success: true });
  } catch (error: any) {
    return c.json({ error: error?.message || 'Failed to hard-delete media' }, 500);
  }
});

app.notFound((c) => c.json({ error: 'Not found' }, 404));

export default app;
