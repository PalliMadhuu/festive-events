import { Hono } from 'hono';
import { getDb, withTransaction, type Sql } from '../lib/db.js';
import { isSuperAdminEmail, verifyFirebaseToken } from '../lib/firebaseAuth.js';
import {
  toAlbum,
  toDonation,
  toEvent,
  toExpense,
  toFestival,
  toJoinRequest,
  toMember,
  toStreet,
  toSubEvent,
  toUser,
  num,
} from '../lib/mappers.js';

type Actor = {
  uid: string;
  email: string;
  role: 'user' | 'superAdmin';
  displayName: string;
  removed: boolean;
};

type Env = { Variables: { actor: Actor } };

export const dataRoutes = new Hono<Env>();

function httpError(message: string, status: number) {
  return Object.assign(new Error(message), { status });
}

async function loadActor(sql: Sql, uid: string, email: string): Promise<Actor> {
  const rows = await sql`SELECT * FROM utsav_seva.users WHERE uid = ${uid} LIMIT 1`;
  const row = rows[0];
  const role: 'user' | 'superAdmin' =
    isSuperAdminEmail(email) || row?.role === 'superAdmin' ? 'superAdmin' : 'user';
  return {
    uid,
    email,
    role,
    displayName: row?.display_name || '',
    removed: !!row?.removed,
  };
}

dataRoutes.use('*', async (c, next) => {
  try {
    const tokenUser = await verifyFirebaseToken(c.req.header('Authorization'));
    const actor = await loadActor(getDb(), tokenUser.uid, tokenUser.email);
    if (actor.removed) return c.json({ error: 'Account is disabled' }, 403);
    c.set('actor', actor);
    await next();
  } catch (error: any) {
    return c.json({ error: error?.message || 'Sign in required' }, 401);
  }
});

dataRoutes.onError((err, c) => {
  const status = Number((err as any).status) || 500;
  return c.json({ error: err.message || 'Request failed' }, status as 400);
});

function requireSuper(actor: Actor) {
  if (actor.role !== 'superAdmin') throw httpError('Super admin access required', 403);
}

async function getEventRow(sql: Sql, eventId: string) {
  const rows = await sql`SELECT * FROM utsav_seva.events WHERE id = ${eventId} LIMIT 1`;
  if (!rows[0]) throw httpError('Event not found', 404);
  return rows[0];
}

function canManageEvent(actor: Actor, event: any) {
  if (actor.role === 'superAdmin') return true;
  if (event.primary_organizer_id === actor.uid) return true;
  const ids: string[] = Array.isArray(event.organizer_ids) ? event.organizer_ids.map(String) : [];
  return ids.includes(actor.uid);
}

// ── users ──────────────────────────────────────────────────────────────────

dataRoutes.get('/users', async (c) => {
  requireSuper(c.get('actor'));
  const rows = await getDb()`
    SELECT * FROM utsav_seva.users
    WHERE removed = FALSE
    ORDER BY created_at DESC
  `;
  return c.json({ users: rows.map(toUser) });
});

dataRoutes.get('/users/by-email', async (c) => {
  const email = String(c.req.query('email') || '')
    .trim()
    .toLowerCase();
  if (!email) return c.json({ error: 'email is required' }, 400);
  const rows = await getDb()`
    SELECT * FROM utsav_seva.users
    WHERE lower(email) = ${email} AND removed = FALSE
    LIMIT 1
  `;
  if (!rows[0]) return c.json({ exists: false });
  const user = toUser(rows[0]);
  return c.json({ exists: true, uid: user.uid, displayName: user.displayName, email: user.email });
});

dataRoutes.get('/users/:uid', async (c) => {
  const uid = c.req.param('uid');
  const actor = c.get('actor');
  if (actor.uid !== uid && actor.role !== 'superAdmin') {
    return c.json({ error: 'Forbidden' }, 403);
  }
  const rows = await getDb()`SELECT * FROM utsav_seva.users WHERE uid = ${uid} LIMIT 1`;
  if (!rows[0]) return c.json({ error: 'Not found' }, 404);
  return c.json({ user: toUser(rows[0]) });
});

dataRoutes.put('/users/:uid', async (c) => {
  const uid = c.req.param('uid');
  const actor = c.get('actor');
  if (actor.uid !== uid && actor.role !== 'superAdmin') {
    return c.json({ error: 'Forbidden' }, 403);
  }
  const body = await c.req.json();
  const email = String(body.email || actor.email || '').trim().toLowerCase();
  const displayName = String(body.displayName || '').trim();
  const role =
    isSuperAdminEmail(email) || body.role === 'superAdmin' ? 'superAdmin' : body.role === 'user' ? 'user' : null;

  const sql = getDb();
  const existing = await sql`SELECT * FROM utsav_seva.users WHERE uid = ${uid} LIMIT 1`;
  if (existing[0]?.removed) return c.json({ user: toUser(existing[0]) });

  const nextRole = role || existing[0]?.role || (isSuperAdminEmail(email) ? 'superAdmin' : 'user');
  const rows = await sql`
    INSERT INTO utsav_seva.users (
      uid, display_name, email, phone_number, photo_url, street_id, street_name, role, fcm_token, updated_at
    ) VALUES (
      ${uid},
      ${displayName || existing[0]?.display_name || ''},
      ${email || existing[0]?.email || ''},
      ${body.phoneNumber ?? existing[0]?.phone_number ?? null},
      ${body.photoURL ?? existing[0]?.photo_url ?? null},
      ${body.streetId ?? existing[0]?.street_id ?? null},
      ${body.streetName ?? existing[0]?.street_name ?? null},
      ${nextRole},
      ${body.fcmToken ?? existing[0]?.fcm_token ?? null},
      NOW()
    )
    ON CONFLICT (uid) DO UPDATE SET
      display_name = COALESCE(EXCLUDED.display_name, utsav_seva.users.display_name),
      email = COALESCE(NULLIF(EXCLUDED.email, ''), utsav_seva.users.email),
      phone_number = COALESCE(EXCLUDED.phone_number, utsav_seva.users.phone_number),
      photo_url = COALESCE(EXCLUDED.photo_url, utsav_seva.users.photo_url),
      street_id = COALESCE(EXCLUDED.street_id, utsav_seva.users.street_id),
      street_name = COALESCE(EXCLUDED.street_name, utsav_seva.users.street_name),
      role = EXCLUDED.role,
      fcm_token = COALESCE(EXCLUDED.fcm_token, utsav_seva.users.fcm_token),
      updated_at = NOW()
    RETURNING *
  `;
  return c.json({ user: toUser(rows[0]) });
});

dataRoutes.patch('/users/:uid', async (c) => {
  const uid = c.req.param('uid');
  const actor = c.get('actor');
  if (actor.uid !== uid && actor.role !== 'superAdmin') {
    return c.json({ error: 'Forbidden' }, 403);
  }
  const body = await c.req.json();
  const sql = getDb();
  const existing = await sql`SELECT * FROM utsav_seva.users WHERE uid = ${uid} LIMIT 1`;
  if (!existing[0]) return c.json({ error: 'Not found' }, 404);

  let role = existing[0].role;
  if (actor.role === 'superAdmin' && (body.role === 'user' || body.role === 'superAdmin')) {
    role = isSuperAdminEmail(existing[0].email) ? 'superAdmin' : body.role;
  }

  const rows = await sql`
    UPDATE utsav_seva.users SET
      display_name = ${body.displayName !== undefined ? String(body.displayName) : existing[0].display_name},
      phone_number = ${body.phoneNumber !== undefined ? body.phoneNumber : existing[0].phone_number},
      photo_url = ${body.photoURL !== undefined ? body.photoURL : existing[0].photo_url},
      street_id = ${body.streetId !== undefined ? body.streetId : existing[0].street_id},
      street_name = ${body.streetName !== undefined ? body.streetName : existing[0].street_name},
      role = ${role},
      fcm_token = ${body.fcmToken !== undefined ? body.fcmToken : existing[0].fcm_token},
      updated_at = NOW()
    WHERE uid = ${uid}
    RETURNING *
  `;
  return c.json({ user: toUser(rows[0]) });
});

dataRoutes.post('/users/:uid/remove', async (c) => {
  requireSuper(c.get('actor'));
  const uid = c.req.param('uid');
  if (uid === c.get('actor').uid) return c.json({ error: 'You cannot remove your own account' }, 400);
  await getDb()`
    UPDATE utsav_seva.users
    SET removed = TRUE, updated_at = NOW()
    WHERE uid = ${uid}
  `;
  return c.json({ success: true });
});

dataRoutes.post('/users/:uid/sync-photo', async (c) => {
  const uid = c.req.param('uid');
  const actor = c.get('actor');
  if (actor.uid !== uid && actor.role !== 'superAdmin') {
    return c.json({ error: 'Forbidden' }, 403);
  }
  const body = await c.req.json();
  const photoURL = String(body.photoURL || '').trim();
  if (!photoURL) return c.json({ error: 'photoURL is required' }, 400);
  const sql = getDb();
  await sql`
    UPDATE utsav_seva.users SET photo_url = ${photoURL}, updated_at = NOW() WHERE uid = ${uid}
  `;
  await sql`
    UPDATE utsav_seva.event_members SET photo_url = ${photoURL} WHERE user_id = ${uid}
  `;
  return c.json({ success: true });
});

dataRoutes.get('/me/membership-event-ids', async (c) => {
  const uid = c.get('actor').uid;
  const rows = await getDb()`
    SELECT event_id FROM utsav_seva.event_members WHERE user_id = ${uid}
  `;
  return c.json({ eventIds: rows.map((r: any) => r.event_id) });
});

dataRoutes.get('/me/join-requests', async (c) => {
  const uid = c.get('actor').uid;
  const rows = await getDb()`
    SELECT * FROM utsav_seva.join_requests WHERE uid = ${uid} ORDER BY requested_at DESC
  `;
  return c.json({ requests: rows.map(toJoinRequest) });
});

// ── streets / festivals ────────────────────────────────────────────────────

dataRoutes.get('/streets', async (c) => {
  const rows = await getDb()`SELECT * FROM utsav_seva.streets ORDER BY name ASC`;
  return c.json({ streets: rows.map(toStreet) });
});

dataRoutes.post('/streets', async (c) => {
  requireSuper(c.get('actor'));
  const body = await c.req.json();
  const name = String(body.name || '').trim();
  if (!name) return c.json({ error: 'Street name is required' }, 400);
  const rows = await getDb()`
    INSERT INTO utsav_seva.streets (name, description, created_by)
    VALUES (${name}, ${String(body.description || '').trim()}, ${c.get('actor').uid})
    RETURNING *
  `;
  return c.json({ street: toStreet(rows[0]) });
});

dataRoutes.patch('/streets/:id', async (c) => {
  requireSuper(c.get('actor'));
  const body = await c.req.json();
  const rows = await getDb()`
    UPDATE utsav_seva.streets SET
      name = COALESCE(${body.name != null ? String(body.name).trim() : null}, name),
      description = COALESCE(${body.description != null ? String(body.description).trim() : null}, description)
    WHERE id = ${c.req.param('id')}
    RETURNING *
  `;
  if (!rows[0]) return c.json({ error: 'Not found' }, 404);
  return c.json({ street: toStreet(rows[0]) });
});

dataRoutes.delete('/streets/:id', async (c) => {
  requireSuper(c.get('actor'));
  await getDb()`DELETE FROM utsav_seva.streets WHERE id = ${c.req.param('id')}`;
  return c.json({ success: true });
});

dataRoutes.get('/festivals', async (c) => {
  const rows = await getDb()`SELECT * FROM utsav_seva.festivals ORDER BY name ASC`;
  return c.json({ festivals: rows.map(toFestival) });
});

dataRoutes.post('/festivals', async (c) => {
  requireSuper(c.get('actor'));
  const body = await c.req.json();
  const name = String(body.name || '').trim();
  const year = Number(body.year);
  if (!name) return c.json({ error: 'Festival name is required' }, 400);
  if (!Number.isFinite(year)) return c.json({ error: 'Select a valid festival year' }, 400);
  try {
    const rows = await getDb()`
      INSERT INTO utsav_seva.festivals (name, year, date, emoji, image_url, created_by)
      VALUES (
        ${name},
        ${year},
        ${String(body.date || '').trim()},
        ${body.emoji ?? null},
        ${body.imageUrl?.trim() || null},
        ${c.get('actor').uid}
      )
      RETURNING *
    `;
    return c.json({ festival: toFestival(rows[0]) });
  } catch (error: any) {
    if (String(error?.message || '').includes('unique')) {
      return c.json({ error: `A festival named "${name}" already exists for ${year}.` }, 409);
    }
    throw error;
  }
});

dataRoutes.patch('/festivals/:id', async (c) => {
  requireSuper(c.get('actor'));
  const body = await c.req.json();
  const existing = await getDb()`SELECT * FROM utsav_seva.festivals WHERE id = ${c.req.param('id')} LIMIT 1`;
  if (!existing[0]) return c.json({ error: 'Not found' }, 404);
  const rows = await getDb()`
    UPDATE utsav_seva.festivals SET
      name = ${body.name !== undefined ? String(body.name).trim() : existing[0].name},
      year = ${body.year !== undefined ? Number(body.year) : existing[0].year},
      date = ${body.date !== undefined ? String(body.date).trim() : existing[0].date},
      emoji = ${body.emoji !== undefined ? body.emoji : existing[0].emoji},
      image_url = ${body.imageUrl !== undefined ? body.imageUrl : existing[0].image_url}
    WHERE id = ${c.req.param('id')}
    RETURNING *
  `;
  return c.json({ festival: toFestival(rows[0]) });
});

dataRoutes.delete('/festivals/:id', async (c) => {
  requireSuper(c.get('actor'));
  await getDb()`DELETE FROM utsav_seva.festivals WHERE id = ${c.req.param('id')}`;
  return c.json({ success: true });
});

// ── events ─────────────────────────────────────────────────────────────────

dataRoutes.get('/events', async (c) => {
  const streetId = c.req.query('streetId');
  const festivalName = c.req.query('festivalName');
  const year = c.req.query('year');
  const primaryOrganizerId = c.req.query('primaryOrganizerId');
  const organizerId = c.req.query('organizerId');
  const sql = getDb();
  let rows: any[];
  if (primaryOrganizerId) {
    rows = await sql`
      SELECT * FROM utsav_seva.events
      WHERE primary_organizer_id = ${primaryOrganizerId}
      ORDER BY created_at DESC
    `;
  } else if (organizerId) {
    rows = await sql`
      SELECT * FROM utsav_seva.events
      WHERE ${organizerId} = ANY(organizer_ids)
      ORDER BY created_at DESC
    `;
  } else {
    rows = await sql`SELECT * FROM utsav_seva.events ORDER BY created_at DESC`;
  }
  if (streetId) rows = rows.filter((r) => r.street_id === streetId);
  if (festivalName) rows = rows.filter((r) => r.festival_name === festivalName);
  if (year) rows = rows.filter((r) => Number(r.year) === Number(year));
  return c.json({ events: rows.map(toEvent) });
});

dataRoutes.get('/events/mine', async (c) => {
  const uid = c.get('actor').uid;
  const rows = await getDb()`
    SELECT DISTINCT e.*
    FROM utsav_seva.events e
    LEFT JOIN utsav_seva.event_members m ON m.event_id = e.id
    WHERE e.primary_organizer_id = ${uid}
       OR ${uid} = ANY(e.organizer_ids)
       OR m.user_id = ${uid}
    ORDER BY e.created_at DESC
  `;
  return c.json({ events: rows.map(toEvent) });
});

dataRoutes.get('/events/:eventId', async (c) => {
  const rows = await getDb()`SELECT * FROM utsav_seva.events WHERE id = ${c.req.param('eventId')} LIMIT 1`;
  if (!rows[0]) return c.json({ error: 'Not found' }, 404);
  return c.json({ event: toEvent(rows[0]) });
});

dataRoutes.post('/events', async (c) => {
  const actor = c.get('actor');
  const body = await c.req.json();
  const streetId = String(body.streetId || '').trim();
  const streetName = String(body.streetName || '').trim();
  const festivalName = String(body.festivalName || '').trim();
  const year = Number(body.year);
  const eventName = String(body.eventName || '').trim();
  const description = String(body.description || '').trim();
  if (!streetId || !streetName || !festivalName || !eventName || !description || !Number.isFinite(year)) {
    return c.json({ error: 'Missing required fields' }, 400);
  }

  try {
    const created = await withTransaction(async (sql) => {
      const existing = await sql`
        SELECT id FROM utsav_seva.events WHERE street_id = ${streetId} AND year = ${year}
      `;
      if (existing.length > 0) {
        throw httpError('Only 1 event is allowed for this street and year.', 409);
      }
      const events = await sql`
        INSERT INTO utsav_seva.events (
          street_id, street_name, festival_name, year, event_name, description,
          primary_organizer_id, primary_organizer_name, organizer_ids, member_count
        ) VALUES (
          ${streetId}, ${streetName}, ${festivalName}, ${year}, ${eventName}, ${description},
          ${actor.uid}, ${actor.displayName || 'Organizer'}, ARRAY[${actor.uid}]::text[], 1
        )
        RETURNING *
      `;
      const event = events[0];
      await sql`
        INSERT INTO utsav_seva.event_members (event_id, user_id, display_name, photo_url, role, added_by)
        VALUES (
          ${event.id}, ${actor.uid}, ${actor.displayName || 'Organizer'}, NULL, 'primary_organizer', ${actor.uid}
        )
      `;
      return event;
    });
    return c.json({ success: true, eventId: created.id, event: toEvent(created) });
  } catch (error: any) {
    if (error?.status) return c.json({ error: error.message }, error.status);
    if (String(error?.message || '').includes('uq_events_street_year') || String(error?.message || '').includes('idx_events_street_year')) {
      return c.json({ error: 'Only 1 event is allowed for this street and year.' }, 409);
    }
    throw error;
  }
});

dataRoutes.patch('/events/:eventId', async (c) => {
  const eventId = c.req.param('eventId');
  const actor = c.get('actor');
  const sql = getDb();
  const event = await getEventRow(sql, eventId);
  if (!canManageEvent(actor, event) && actor.role !== 'superAdmin') {
    return c.json({ error: 'Forbidden' }, 403);
  }
  const body = await c.req.json();
  const rows = await sql`
    UPDATE utsav_seva.events SET
      event_name = ${body.eventName !== undefined ? String(body.eventName) : event.event_name},
      description = ${body.description !== undefined ? body.description : event.description},
      cover_image_url = ${body.coverImageUrl !== undefined ? body.coverImageUrl : event.cover_image_url},
      status = ${body.status !== undefined ? body.status : event.status},
      gallery_enabled = ${body.galleryEnabled !== undefined ? !!body.galleryEnabled : event.gallery_enabled},
      street_name = ${body.streetName !== undefined ? body.streetName : event.street_name},
      festival_name = ${body.festivalName !== undefined ? body.festivalName : event.festival_name},
      primary_organizer_name = ${
        body.primaryOrganizerName !== undefined ? body.primaryOrganizerName : event.primary_organizer_name
      },
      updated_at = NOW()
    WHERE id = ${eventId}
    RETURNING *
  `;
  return c.json({ event: toEvent(rows[0]) });
});

dataRoutes.delete('/events/:eventId', async (c) => {
  const eventId = c.req.param('eventId');
  const actor = c.get('actor');
  const sql = getDb();
  const event = await getEventRow(sql, eventId);
  if (actor.role !== 'superAdmin' && event.primary_organizer_id !== actor.uid) {
    return c.json({ error: 'Forbidden' }, 403);
  }
  await sql`DELETE FROM utsav_seva.events WHERE id = ${eventId}`;
  return c.json({ success: true });
});

// ── members / join requests ────────────────────────────────────────────────

dataRoutes.get('/events/:eventId/members', async (c) => {
  const eventId = c.req.param('eventId');
  const sql = getDb();
  const rows = await sql`
    SELECT m.*, u.display_name AS user_display_name, u.photo_url AS user_photo_url
    FROM utsav_seva.event_members m
    LEFT JOIN utsav_seva.users u ON u.uid = m.user_id
    WHERE m.event_id = ${eventId}
  `;
  const members = rows.map((row: any) =>
    toMember({
      ...row,
      display_name: row.user_display_name || row.display_name,
      photo_url: row.user_photo_url || row.photo_url,
    })
  );
  return c.json({ members });
});

dataRoutes.post('/events/:eventId/members/:userId/promote', async (c) => {
  const eventId = c.req.param('eventId');
  const userId = c.req.param('userId');
  const actor = c.get('actor');
  try {
    await withTransaction(async (sql) => {
      const event = await getEventRow(sql, eventId);
      if (!canManageEvent(actor, event)) throw httpError('Forbidden', 403);
      await sql`
        UPDATE utsav_seva.event_members SET role = 'organizer'
        WHERE event_id = ${eventId} AND user_id = ${userId}
      `;
      await sql`
        UPDATE utsav_seva.events
        SET organizer_ids = ARRAY(SELECT DISTINCT unnest(organizer_ids || ARRAY[${userId}::text])),
            updated_at = NOW()
        WHERE id = ${eventId}
      `;
    });
    return c.json({ success: true });
  } catch (error: any) {
    if (error?.status) return c.json({ error: error.message }, error.status);
    throw error;
  }
});

dataRoutes.post('/events/:eventId/members/:userId/demote', async (c) => {
  const eventId = c.req.param('eventId');
  const userId = c.req.param('userId');
  const actor = c.get('actor');
  try {
    await withTransaction(async (sql) => {
      const event = await getEventRow(sql, eventId);
      if (!canManageEvent(actor, event)) throw httpError('Forbidden', 403);
      if (userId === event.primary_organizer_id) throw httpError('Cannot demote the primary organizer', 400);
      await sql`
        UPDATE utsav_seva.event_members SET role = 'member'
        WHERE event_id = ${eventId} AND user_id = ${userId}
      `;
      await sql`
        UPDATE utsav_seva.events
        SET organizer_ids = array_remove(organizer_ids, ${userId}),
            updated_at = NOW()
        WHERE id = ${eventId}
      `;
    });
    return c.json({ success: true });
  } catch (error: any) {
    if (error?.status) return c.json({ error: error.message }, error.status);
    throw error;
  }
});

dataRoutes.delete('/events/:eventId/members/:userId', async (c) => {
  const eventId = c.req.param('eventId');
  const userId = c.req.param('userId');
  const actor = c.get('actor');
  try {
    await withTransaction(async (sql) => {
      const event = await getEventRow(sql, eventId);
      if (!canManageEvent(actor, event)) throw httpError('Forbidden', 403);
      if (userId === event.primary_organizer_id) throw httpError('Cannot remove the primary organizer.', 400);
      await sql`DELETE FROM utsav_seva.event_members WHERE event_id = ${eventId} AND user_id = ${userId}`;
      await sql`
        UPDATE utsav_seva.events
        SET member_count = GREATEST(member_count - 1, 0),
            organizer_ids = array_remove(organizer_ids, ${userId}),
            updated_at = NOW()
        WHERE id = ${eventId}
      `;
    });
    return c.json({ success: true });
  } catch (error: any) {
    if (error?.status) return c.json({ error: error.message }, error.status);
    throw error;
  }
});

dataRoutes.get('/events/:eventId/join-requests', async (c) => {
  const status = c.req.query('status');
  const uid = c.req.query('uid');
  const eventId = c.req.param('eventId');
  const sql = getDb();
  let rows: any[];
  if (uid) {
    rows = await sql`
      SELECT * FROM utsav_seva.join_requests WHERE event_id = ${eventId} AND uid = ${uid}
    `;
  } else if (status) {
    rows = await sql`
      SELECT * FROM utsav_seva.join_requests
      WHERE event_id = ${eventId} AND status = ${status}
      ORDER BY requested_at DESC
    `;
  } else {
    rows = await sql`
      SELECT * FROM utsav_seva.join_requests WHERE event_id = ${eventId} ORDER BY requested_at DESC
    `;
  }
  return c.json({ requests: rows.map(toJoinRequest) });
});

dataRoutes.put('/events/:eventId/join-requests/:uid', async (c) => {
  const eventId = c.req.param('eventId');
  const uid = c.req.param('uid');
  const actor = c.get('actor');
  if (actor.uid !== uid) return c.json({ error: 'Forbidden' }, 403);
  const body = await c.req.json();
  const rows = await getDb()`
    INSERT INTO utsav_seva.join_requests (
      event_id, uid, display_name, photo_url, email, status, message
    ) VALUES (
      ${eventId}, ${uid},
      ${String(body.displayName || actor.displayName || '')},
      ${body.photoURL || null},
      ${String(body.email || actor.email || '')},
      'pending',
      ${String(body.message || '')}
    )
    ON CONFLICT (event_id, uid) DO UPDATE SET
      display_name = EXCLUDED.display_name,
      photo_url = EXCLUDED.photo_url,
      email = EXCLUDED.email,
      status = 'pending',
      message = EXCLUDED.message,
      requested_at = NOW(),
      reviewed_at = NULL,
      reviewed_by = NULL
    RETURNING *
  `;
  return c.json({ request: toJoinRequest(rows[0]) });
});

dataRoutes.post('/events/:eventId/join-requests/:uid/approve', async (c) => {
  const eventId = c.req.param('eventId');
  const uid = c.req.param('uid');
  const actor = c.get('actor');
  try {
    await withTransaction(async (sql) => {
      const event = await getEventRow(sql, eventId);
      if (!canManageEvent(actor, event)) throw httpError('Only organizers can approve join requests.', 403);
      const join = await sql`
        SELECT * FROM utsav_seva.join_requests WHERE event_id = ${eventId} AND uid = ${uid} LIMIT 1
      `;
      if (!join[0]) throw httpError('Join request not found.', 404);
      if (join[0].status !== 'pending') throw httpError('Join request is not pending.', 400);
      await sql`
        UPDATE utsav_seva.join_requests
        SET status = 'approved', reviewed_at = NOW(), reviewed_by = ${actor.uid}
        WHERE event_id = ${eventId} AND uid = ${uid}
      `;
      await sql`
        INSERT INTO utsav_seva.event_members (event_id, user_id, display_name, photo_url, role, added_by)
        VALUES (${eventId}, ${uid}, ${join[0].display_name || ''}, ${join[0].photo_url}, 'member', ${actor.uid})
        ON CONFLICT (event_id, user_id) DO NOTHING
      `;
      await sql`
        UPDATE utsav_seva.events SET member_count = member_count + 1, updated_at = NOW() WHERE id = ${eventId}
      `;
    });
    return c.json({ success: true });
  } catch (error: any) {
    if (error?.status) return c.json({ error: error.message }, error.status);
    throw error;
  }
});

dataRoutes.post('/events/:eventId/join-requests/:uid/reject', async (c) => {
  const eventId = c.req.param('eventId');
  const uid = c.req.param('uid');
  const actor = c.get('actor');
  try {
    const sql = getDb();
    const event = await getEventRow(sql, eventId);
    if (!canManageEvent(actor, event)) throw httpError('Only organizers can reject join requests.', 403);
    await sql`
      UPDATE utsav_seva.join_requests
      SET status = 'rejected', reviewed_at = NOW(), reviewed_by = ${actor.uid}
      WHERE event_id = ${eventId} AND uid = ${uid}
    `;
    return c.json({ success: true });
  } catch (error: any) {
    if (error?.status) return c.json({ error: error.message }, error.status);
    throw error;
  }
});

// ── sub-events / albums ────────────────────────────────────────────────────

dataRoutes.get('/events/:eventId/sub-events', async (c) => {
  const rows = await getDb()`
    SELECT * FROM utsav_seva.sub_events WHERE event_id = ${c.req.param('eventId')} ORDER BY date ASC
  `;
  return c.json({ subEvents: rows.map(toSubEvent) });
});

dataRoutes.get('/events/:eventId/sub-events/:subEventId', async (c) => {
  const rows = await getDb()`
    SELECT * FROM utsav_seva.sub_events
    WHERE event_id = ${c.req.param('eventId')} AND id = ${c.req.param('subEventId')}
    LIMIT 1
  `;
  if (!rows[0]) return c.json({ error: 'Not found' }, 404);
  return c.json({ subEvent: toSubEvent(rows[0]) });
});

dataRoutes.post('/events/:eventId/sub-events', async (c) => {
  const eventId = c.req.param('eventId');
  const actor = c.get('actor');
  const body = await c.req.json();
  const name = String(body.name || '').trim();
  const date = String(body.date || '').trim();
  if (!name) return c.json({ error: 'Sub-event name is required.' }, 400);
  if (!date) return c.json({ error: 'Sub-event date is required.' }, 400);
  try {
    const created = await withTransaction(async (sql) => {
      await getEventRow(sql, eventId);
      const rows = await sql`
        INSERT INTO utsav_seva.sub_events (
          event_id, name, description, date, time, location, cover_image_url, created_by
        ) VALUES (
          ${eventId}, ${name}, ${body.description?.trim() || null}, ${date},
          ${body.time?.trim() || null}, ${body.location?.trim() || null},
          ${body.coverImageUrl?.trim() || null}, ${body.createdBy || actor.uid}
        )
        RETURNING *
      `;
      await sql`
        UPDATE utsav_seva.events
        SET sub_event_count = sub_event_count + 1, updated_at = NOW()
        WHERE id = ${eventId}
      `;
      return rows[0];
    });
    return c.json({ subEvent: toSubEvent(created) });
  } catch (error: any) {
    if (error?.status) return c.json({ error: error.message }, error.status);
    throw error;
  }
});

dataRoutes.patch('/events/:eventId/sub-events/:subEventId', async (c) => {
  const body = await c.req.json();
  const existing = await getDb()`
    SELECT * FROM utsav_seva.sub_events
    WHERE event_id = ${c.req.param('eventId')} AND id = ${c.req.param('subEventId')} LIMIT 1
  `;
  if (!existing[0]) return c.json({ error: 'Not found' }, 404);
  const rows = await getDb()`
    UPDATE utsav_seva.sub_events SET
      name = ${body.name !== undefined ? String(body.name).trim() : existing[0].name},
      date = ${body.date !== undefined ? String(body.date).trim() : existing[0].date},
      description = ${body.description !== undefined ? String(body.description).trim() || null : existing[0].description},
      time = ${body.time !== undefined ? String(body.time).trim() || null : existing[0].time},
      location = ${body.location !== undefined ? String(body.location).trim() || null : existing[0].location},
      cover_image_url = ${
        body.coverImageUrl !== undefined ? String(body.coverImageUrl).trim() || null : existing[0].cover_image_url
      },
      updated_at = NOW()
    WHERE id = ${c.req.param('subEventId')}
    RETURNING *
  `;
  return c.json({ subEvent: toSubEvent(rows[0]) });
});

dataRoutes.delete('/events/:eventId/sub-events/:subEventId', async (c) => {
  const eventId = c.req.param('eventId');
  const subEventId = c.req.param('subEventId');
  await withTransaction(async (sql) => {
    await sql`DELETE FROM utsav_seva.sub_events WHERE event_id = ${eventId} AND id = ${subEventId}`;
    await sql`
      UPDATE utsav_seva.events
      SET sub_event_count = GREATEST(sub_event_count - 1, 0), updated_at = NOW()
      WHERE id = ${eventId}
    `;
  });
  return c.json({ success: true });
});

dataRoutes.get('/events/:eventId/albums', async (c) => {
  const rows = await getDb()`
    SELECT * FROM public.albums
    WHERE event_id = ${c.req.param('eventId')} AND deleted = FALSE
    ORDER BY created_at DESC
  `;
  return c.json({ albums: rows.map(toAlbum) });
});

dataRoutes.post('/events/:eventId/albums', async (c) => {
  const body = await c.req.json();
  const name = String(body.name || '').trim();
  if (!name) return c.json({ error: 'Album name is required' }, 400);
  const rows = await getDb()`
    INSERT INTO public.albums (event_id, name, created_by, created_by_name)
    VALUES (${c.req.param('eventId')}, ${name}, ${c.get('actor').uid}, ${c.get('actor').displayName || null})
    RETURNING *
  `;
  return c.json({ album: toAlbum(rows[0]) });
});

dataRoutes.patch('/events/:eventId/albums/:albumId', async (c) => {
  const body = await c.req.json();
  const rows = await getDb()`
    UPDATE public.albums SET
      name = COALESCE(${body.name != null ? String(body.name) : null}, name),
      cover_url = COALESCE(${body.coverUrl != null ? body.coverUrl : null}, cover_url),
      updated_at = NOW()
    WHERE id = ${c.req.param('albumId')} AND event_id = ${c.req.param('eventId')}
    RETURNING *
  `;
  if (!rows[0]) return c.json({ error: 'Not found' }, 404);
  return c.json({ album: toAlbum(rows[0]) });
});

dataRoutes.delete('/events/:eventId/albums/:albumId', async (c) => {
  await getDb()`
    UPDATE public.albums
    SET deleted = TRUE, deleted_at = NOW(), updated_at = NOW()
    WHERE id = ${c.req.param('albumId')} AND event_id = ${c.req.param('eventId')}
  `;
  return c.json({ success: true });
});

// ── expenses ───────────────────────────────────────────────────────────────

dataRoutes.get('/events/:eventId/expenses', async (c) => {
  const category = c.req.query('category');
  const subEventId = c.req.query('subEventId');
  const sql = getDb();
  let rows = await sql`
    SELECT * FROM utsav_seva.expenses
    WHERE event_id = ${c.req.param('eventId')}
    ORDER BY created_at DESC
  `;
  if (category) rows = rows.filter((r: any) => r.category === category);
  if (subEventId) rows = rows.filter((r: any) => r.sub_event_id === subEventId);
  return c.json({ expenses: rows.map(toExpense) });
});

dataRoutes.get('/events/:eventId/expenses/:expenseId', async (c) => {
  const rows = await getDb()`
    SELECT * FROM utsav_seva.expenses
    WHERE event_id = ${c.req.param('eventId')} AND id = ${c.req.param('expenseId')} LIMIT 1
  `;
  if (!rows[0]) return c.json({ error: 'Not found' }, 404);
  return c.json({ expense: toExpense(rows[0]) });
});

dataRoutes.post('/events/:eventId/expenses', async (c) => {
  const eventId = c.req.param('eventId');
  const actor = c.get('actor');
  const body = await c.req.json();
  const amount = num(body.amount);
  const created = await withTransaction(async (sql) => {
    const rows = await sql`
      INSERT INTO utsav_seva.expenses (
        event_id, title, amount, category, other_category, description, date, sub_event_id,
        receipt_urls, uploaded_by, uploaded_by_name
      ) VALUES (
        ${eventId},
        ${String(body.title || '').trim()},
        ${amount},
        ${body.category ?? null},
        ${body.otherCategory ?? null},
        ${body.description ?? null},
        ${body.date || new Date().toISOString()},
        ${body.subEventId ?? null},
        ${Array.isArray(body.receiptUrls) ? body.receiptUrls : []},
        ${body.uploadedBy || actor.uid},
        ${body.uploadedByName || actor.displayName || ''}
      )
      RETURNING *
    `;
    if (amount) {
      await sql`
        UPDATE utsav_seva.events
        SET total_expenses = total_expenses + ${amount}, updated_at = NOW()
        WHERE id = ${eventId}
      `;
    }
    return rows[0];
  });
  return c.json({ expense: toExpense(created) });
});

dataRoutes.patch('/events/:eventId/expenses/:expenseId', async (c) => {
  const eventId = c.req.param('eventId');
  const expenseId = c.req.param('expenseId');
  const actor = c.get('actor');
  const body = await c.req.json();
  try {
    const updated = await withTransaction(async (sql) => {
      const snap = await sql`
        SELECT * FROM utsav_seva.expenses WHERE event_id = ${eventId} AND id = ${expenseId} LIMIT 1
      `;
      if (!snap[0]) throw httpError('Expense not found.', 404);
      if (snap[0].deleted) throw httpError('Deleted expenses cannot be edited.', 400);
      const oldAmount = num(snap[0].amount);
      const nextAmount = body.amount != null ? num(body.amount) : oldAmount;
      const rows = await sql`
        UPDATE utsav_seva.expenses SET
          title = ${body.title !== undefined ? String(body.title) : snap[0].title},
          amount = ${nextAmount},
          category = ${body.category !== undefined ? body.category : snap[0].category},
          other_category = ${body.otherCategory !== undefined ? body.otherCategory : snap[0].other_category},
          description = ${body.description !== undefined ? body.description : snap[0].description},
          date = ${body.date !== undefined ? body.date : snap[0].date},
          sub_event_id = ${body.subEventId !== undefined ? body.subEventId : snap[0].sub_event_id},
          receipt_urls = ${body.receiptUrls !== undefined ? body.receiptUrls : snap[0].receipt_urls},
          updated_at = NOW(),
          updated_by = ${actor.uid},
          updated_by_name = ${actor.displayName || 'Organizer'}
        WHERE id = ${expenseId}
        RETURNING *
      `;
      const delta = nextAmount - oldAmount;
      if (delta) {
        await sql`
          UPDATE utsav_seva.events
          SET total_expenses = total_expenses + ${delta}, updated_at = NOW()
          WHERE id = ${eventId}
        `;
      }
      return rows[0];
    });
    return c.json({ expense: toExpense(updated) });
  } catch (error: any) {
    if (error?.status) return c.json({ error: error.message }, error.status);
    throw error;
  }
});

dataRoutes.post('/events/:eventId/expenses/:expenseId/delete', async (c) => {
  const eventId = c.req.param('eventId');
  const expenseId = c.req.param('expenseId');
  const actor = c.get('actor');
  const body = await c.req.json();
  const reason = String(body.reason || '').trim();
  if (!reason) return c.json({ error: 'Please provide a reason for deleting this expense.' }, 400);
  try {
    await withTransaction(async (sql) => {
      const snap = await sql`
        SELECT * FROM utsav_seva.expenses WHERE event_id = ${eventId} AND id = ${expenseId} LIMIT 1
      `;
      if (!snap[0]) return;
      if (snap[0].deleted) throw httpError('This expense is already deleted.', 400);
      const amount = num(snap[0].amount);
      await sql`
        UPDATE utsav_seva.expenses SET
          deleted = TRUE, deleted_at = NOW(), deleted_by = ${actor.uid},
          deleted_by_name = ${actor.displayName || 'Organizer'},
          deletion_reason = ${reason}, updated_at = NOW()
        WHERE id = ${expenseId}
      `;
      if (amount) {
        await sql`
          UPDATE utsav_seva.events
          SET total_expenses = total_expenses - ${amount}, updated_at = NOW()
          WHERE id = ${eventId}
        `;
      }
    });
    return c.json({ success: true });
  } catch (error: any) {
    if (error?.status) return c.json({ error: error.message }, error.status);
    throw error;
  }
});

// ── donations / street donations ───────────────────────────────────────────

dataRoutes.get('/events/:eventId/donations', async (c) => {
  const eventId = c.req.param('eventId');
  const result = await getDb()`
    SELECT d.*,
      COALESCE(ARRAY(SELECT l.user_id FROM utsav_seva.donation_likes l WHERE l.donation_id = d.id), '{}') AS liked_by
    FROM utsav_seva.donations d
    WHERE d.event_id = ${eventId}
    ORDER BY d.created_at DESC
  `;
  return c.json({ donations: result.map(toDonation) });
});

dataRoutes.post('/events/:eventId/donations', async (c) => {
  const eventId = c.req.param('eventId');
  const actor = c.get('actor');
  const body = await c.req.json();
  const amount = num(body.amount);
  const status = body.status === 'pending' ? 'pending' : 'given';
  const created = await withTransaction(async (sql) => {
    const rows = await sql`
      INSERT INTO utsav_seva.donations (
        event_id, donor_name, amount, note, photo_url, status, date, uploaded_by, uploaded_by_name
      ) VALUES (
        ${eventId},
        ${String(body.donorName || '').trim()},
        ${amount},
        ${body.note || ''},
        ${body.photoUrl || null},
        ${status},
        ${new Date().toISOString()},
        ${body.uploadedBy || actor.uid},
        ${body.uploadedByName || actor.displayName || ''}
      )
      RETURNING *
    `;
    if (status === 'given' && amount) {
      await sql`
        UPDATE utsav_seva.events
        SET total_donations = total_donations + ${amount}, updated_at = NOW()
        WHERE id = ${eventId}
      `;
    }
    return { ...rows[0], liked_by: [] };
  });
  return c.json({ donation: toDonation(created) });
});

dataRoutes.patch('/events/:eventId/donations/:donationId', async (c) => {
  return patchDonation(c, 'festival');
});

dataRoutes.post('/events/:eventId/donations/:donationId/like', async (c) => {
  return toggleLike(c, 'festival');
});

dataRoutes.post('/events/:eventId/donations/:donationId/delete', async (c) => {
  return softDeleteDonation(c, 'festival');
});

dataRoutes.get('/events/:eventId/street-donations', async (c) => {
  const eventId = c.req.param('eventId');
  const result = await getDb()`
    SELECT d.*,
      COALESCE(ARRAY(SELECT l.user_id FROM utsav_seva.street_donation_likes l WHERE l.donation_id = d.id), '{}') AS liked_by
    FROM utsav_seva.street_donations d
    WHERE d.event_id = ${eventId}
    ORDER BY d.created_at DESC
  `;
  return c.json({ donations: result.map(toDonation) });
});

dataRoutes.post('/events/:eventId/street-donations', async (c) => {
  const eventId = c.req.param('eventId');
  const actor = c.get('actor');
  const body = await c.req.json();
  const amount = num(body.amount);
  const status = body.status === 'pending' ? 'pending' : 'given';
  const created = await withTransaction(async (sql) => {
    const rows = await sql`
      INSERT INTO utsav_seva.street_donations (
        event_id, donor_name, amount, note, photo_url, status, date, uploaded_by, uploaded_by_name
      ) VALUES (
        ${eventId},
        ${String(body.donorName || '').trim()},
        ${amount},
        ${body.note || ''},
        ${body.photoUrl || null},
        ${status},
        ${new Date().toISOString()},
        ${body.uploadedBy || actor.uid},
        ${body.uploadedByName || actor.displayName || ''}
      )
      RETURNING *
    `;
    if (status === 'given' && amount) {
      await sql`
        UPDATE utsav_seva.events
        SET total_street_donations = total_street_donations + ${amount}, updated_at = NOW()
        WHERE id = ${eventId}
      `;
    }
    return { ...rows[0], liked_by: [] };
  });
  return c.json({ donation: toDonation(created) });
});

dataRoutes.patch('/events/:eventId/street-donations/:donationId', async (c) => {
  return patchDonation(c, 'street');
});

dataRoutes.post('/events/:eventId/street-donations/:donationId/like', async (c) => {
  return toggleLike(c, 'street');
});

dataRoutes.post('/events/:eventId/street-donations/:donationId/delete', async (c) => {
  return softDeleteDonation(c, 'street');
});

async function patchDonation(c: any, kind: 'festival' | 'street') {
  const eventId = c.req.param('eventId');
  const donationId = c.req.param('donationId');
  const actor = c.get('actor') as Actor;
  const body = await c.req.json();
  const table = kind === 'festival' ? 'utsav_seva.donations' : 'utsav_seva.street_donations';
  const totalCol = kind === 'festival' ? 'total_donations' : 'total_street_donations';
  try {
    const updated = await withTransaction(async (sql) => {
      const rows = await sql.query(`SELECT * FROM ${table} WHERE event_id = $1 AND id = $2 LIMIT 1`, [
        eventId,
        donationId,
      ]);
      if (!rows[0]) throw httpError(kind === 'festival' ? 'Donation not found.' : 'Street donation not found.', 404);
      if (rows[0].deleted) throw httpError('Deleted donations cannot be edited.', 400);
      const oldAmount = num(rows[0].amount);
      const nextAmount = body.amount != null ? num(body.amount) : oldAmount;
      const oldStatus = rows[0].status === 'pending' ? 'pending' : 'given';
      const nextStatus = body.status === 'pending' || body.status === 'given' ? body.status : oldStatus;
      const oldCounted = oldStatus === 'given' ? oldAmount : 0;
      const nextCounted = nextStatus === 'given' ? nextAmount : 0;
      const delta = nextCounted - oldCounted;
      const donorName = body.donorName !== undefined ? String(body.donorName) : rows[0].donor_name;
      const note = body.note !== undefined ? body.note : rows[0].note;
      const photoUrl = body.photoUrl !== undefined ? body.photoUrl : rows[0].photo_url;
      const updatedRows = await sql.query(
        `UPDATE ${table} SET
          donor_name = $1,
          amount = $2,
          note = $3,
          photo_url = $4,
          status = $5,
          updated_at = NOW(),
          updated_by = $6,
          updated_by_name = $7
        WHERE id = $8
        RETURNING *`,
        [donorName, nextAmount, note, photoUrl, nextStatus, actor.uid, actor.displayName || 'Organizer', donationId]
      );
      if (delta) {
        await sql.query(
          `UPDATE utsav_seva.events SET ${totalCol} = ${totalCol} + $1, updated_at = NOW() WHERE id = $2`,
          [delta, eventId]
        );
      }
      return { ...updatedRows[0], liked_by: [] };
    });
    return c.json({ donation: toDonation(updated) });
  } catch (error: any) {
    if (error?.status) return c.json({ error: error.message }, error.status);
    throw error;
  }
}

async function toggleLike(c: any, kind: 'festival' | 'street') {
  const donationId = c.req.param('donationId');
  const uid = (c.get('actor') as Actor).uid;
  const table = kind === 'festival' ? 'utsav_seva.donations' : 'utsav_seva.street_donations';
  const likeTable = kind === 'festival' ? 'utsav_seva.donation_likes' : 'utsav_seva.street_donation_likes';
  try {
    const updated = await withTransaction(async (sql) => {
      const snap = await sql.query(`SELECT * FROM ${table} WHERE id = $1 LIMIT 1`, [donationId]);
      if (!snap[0]) throw httpError('Donation not found.', 404);
      if (snap[0].deleted) throw httpError('Deleted donations cannot be liked.', 400);
      const existing = await sql.query(`SELECT 1 FROM ${likeTable} WHERE donation_id = $1 AND user_id = $2`, [
        donationId,
        uid,
      ]);
      if (existing[0]) {
        await sql.query(`DELETE FROM ${likeTable} WHERE donation_id = $1 AND user_id = $2`, [donationId, uid]);
      } else {
        await sql.query(`INSERT INTO ${likeTable} (donation_id, user_id) VALUES ($1, $2)`, [donationId, uid]);
      }
      const liked = await sql.query(`SELECT user_id FROM ${likeTable} WHERE donation_id = $1`, [donationId]);
      return { ...snap[0], liked_by: liked.map((r: any) => r.user_id) };
    });
    return c.json({ donation: toDonation(updated) });
  } catch (error: any) {
    if (error?.status) return c.json({ error: error.message }, error.status);
    throw error;
  }
}

async function softDeleteDonation(c: any, kind: 'festival' | 'street') {
  const eventId = c.req.param('eventId');
  const donationId = c.req.param('donationId');
  const actor = c.get('actor') as Actor;
  const body = await c.req.json();
  const reason = String(body.reason || '').trim();
  if (!reason) return c.json({ error: 'Please provide a reason for deleting this donation.' }, 400);
  const table = kind === 'festival' ? 'utsav_seva.donations' : 'utsav_seva.street_donations';
  const totalCol = kind === 'festival' ? 'total_donations' : 'total_street_donations';
  try {
    await withTransaction(async (sql) => {
      const snap = await sql.query(`SELECT * FROM ${table} WHERE event_id = $1 AND id = $2 LIMIT 1`, [
        eventId,
        donationId,
      ]);
      if (!snap[0]) return;
      if (snap[0].deleted) throw httpError('This donation is already deleted.', 400);
      const amount = num(snap[0].amount);
      const wasGiven = snap[0].status !== 'pending';
      await sql.query(
        `UPDATE ${table} SET
          deleted = TRUE, deleted_at = NOW(), deleted_by = $1, deleted_by_name = $2,
          deletion_reason = $3
        WHERE id = $4`,
        [actor.uid, actor.displayName || 'Organizer', reason, donationId]
      );
      if (wasGiven && amount) {
        await sql.query(
          `UPDATE utsav_seva.events SET ${totalCol} = ${totalCol} - $1, updated_at = NOW() WHERE id = $2`,
          [amount, eventId]
        );
      }
    });
    return c.json({ success: true });
  } catch (error: any) {
    if (error?.status) return c.json({ error: error.message }, error.status);
    throw error;
  }
}
