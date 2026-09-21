/**
 * One-time copy of Firestore app data → Postgres (utsav_seva.*).
 *
 * Does NOT copy media bytes (already in Postgres) or Firebase Auth users.
 * Does NOT copy plaintext `password` fields.
 *
 * Run after 005_app_tables.sql:
 *   npm run db:migrate-firestore
 */
import { config } from 'dotenv';
config();

import { initializeApp } from 'firebase/app';
import { collection, getDocs, getFirestore } from 'firebase/firestore';
import { getPool } from '../lib/db.js';

const firebaseConfig = {
  apiKey: 'AIzaSyDXbF9q9s8BZGZeMs5Ym0KMZInHzUgyobg',
  authDomain: 'festiveevents-e84f8.firebaseapp.com',
  projectId: 'festiveevents-e84f8',
  storageBucket: 'festiveevents-e84f8.firebasestorage.app',
  appId: '1:781701238556:web:5f8359dff079dc9af8f4d9',
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

function toDate(value: any): Date | null {
  if (value == null || value === '') return null;
  if (value instanceof Date) return value;
  if (typeof value?.toDate === 'function') return value.toDate();
  if (typeof value?.seconds === 'number') return new Date(value.seconds * 1000);
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function iso(value: any, fallbackNow = true): string | null {
  const date = toDate(value);
  if (date) return date.toISOString();
  return fallbackNow ? new Date().toISOString() : null;
}

function num(value: any, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function strArr(value: any): string[] {
  return Array.isArray(value) ? value.map(String).filter(Boolean) : [];
}

async function col(name: string) {
  const snap = await getDocs(collection(db, name));
  return snap.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() } as any));
}

async function sub(eventId: string, name: string) {
  const snap = await getDocs(collection(db, 'events', eventId, name));
  return snap.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() } as any));
}

async function main() {
  const pool = getPool();
  const client = await pool.connect();
  const counts: Record<string, number> = {};

  try {
    await client.query('BEGIN');

    const users = await col('users');
    for (const user of users) {
      await client.query(
        `INSERT INTO utsav_seva.users (
          uid, display_name, email, phone_number, photo_url, street_id, street_name,
          role, fcm_token, removed, created_at, updated_at
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
        ON CONFLICT (uid) DO UPDATE SET
          display_name = EXCLUDED.display_name,
          email = EXCLUDED.email,
          phone_number = EXCLUDED.phone_number,
          photo_url = EXCLUDED.photo_url,
          street_id = EXCLUDED.street_id,
          street_name = EXCLUDED.street_name,
          role = EXCLUDED.role,
          fcm_token = EXCLUDED.fcm_token,
          removed = EXCLUDED.removed,
          updated_at = EXCLUDED.updated_at`,
        [
          user.uid || user.id,
          user.displayName || '',
          String(user.email || '').toLowerCase(),
          user.phoneNumber || null,
          user.photoURL || null,
          user.streetId || null,
          user.streetName || null,
          user.role === 'superAdmin' ? 'superAdmin' : 'user',
          user.fcmToken || null,
          !!user.removed,
          iso(user.createdAt),
          iso(user.updatedAt),
        ]
      );
    }
    counts.users = users.length;

    const streets = await col('streets');
    for (const street of streets) {
      await client.query(
        `INSERT INTO utsav_seva.streets (id, name, description, created_by, created_at)
         VALUES ($1,$2,$3,$4,$5)
         ON CONFLICT (id) DO NOTHING`,
        [street.id, street.name || '', street.description || '', street.createdBy || '', iso(street.createdAt)]
      );
    }
    counts.streets = streets.length;

    const festivals = await col('festivals');
    for (const festival of festivals) {
      await client.query(
        `INSERT INTO utsav_seva.festivals (id, name, year, date, emoji, image_url, created_by, created_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
         ON CONFLICT (id) DO NOTHING`,
        [
          festival.id,
          festival.name || '',
          num(festival.year),
          festival.date || '',
          festival.emoji || null,
          festival.imageUrl || null,
          festival.createdBy || '',
          iso(festival.createdAt),
        ]
      );
    }
    counts.festivals = festivals.length;

    const events = await col('events');
    for (const event of events) {
      await client.query(
        `INSERT INTO utsav_seva.events (
          id, street_id, street_name, festival_name, year, event_name, description, cover_image_url,
          primary_organizer_id, primary_organizer_name, organizer_ids, member_count, status, slot,
          total_expenses, total_donations, total_street_donations, sub_event_count, gallery_enabled,
          created_at, updated_at
        ) VALUES (
          $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21
        )
        ON CONFLICT (id) DO NOTHING`,
        [
          event.id,
          event.streetId || '',
          event.streetName || '',
          event.festivalName || '',
          num(event.year),
          event.eventName || '',
          event.description || '',
          event.coverImageUrl || null,
          event.primaryOrganizerId || '',
          event.primaryOrganizerName || '',
          strArr(event.organizerIds),
          num(event.memberCount, 1),
          event.status || 'active',
          num(event.slot, 1),
          num(event.totalExpenses),
          num(event.totalDonations),
          num(event.totalStreetDonations),
          num(event.subEventCount),
          !!event.galleryEnabled,
          iso(event.createdAt),
          iso(event.updatedAt),
        ]
      );
    }
    counts.events = events.length;

    counts.members = 0;
    counts.joinRequests = 0;
    counts.subEvents = 0;
    counts.albums = 0;
    counts.expenses = 0;
    counts.donations = 0;
    counts.streetDonations = 0;
    counts.likes = 0;

    for (const event of events) {
      const members = await sub(event.id, 'members');
      for (const member of members) {
        const userId = member.userId || member.uid || member.id;
        if (!userId) continue;
        await client.query(
          `INSERT INTO utsav_seva.event_members (
            event_id, user_id, display_name, photo_url, role, joined_at, added_by
          ) VALUES ($1,$2,$3,$4,$5,$6,$7)
          ON CONFLICT (event_id, user_id) DO NOTHING`,
          [
            event.id,
            userId,
            member.displayName || '',
            member.photoURL || null,
            ['member', 'organizer', 'primary_organizer'].includes(member.role) ? member.role : 'member',
            iso(member.joinedAt),
            member.addedBy || null,
          ]
        );
        counts.members += 1;
      }

      const joins = await sub(event.id, 'joinRequests');
      for (const join of joins) {
        const uid = join.uid || join.id;
        if (!uid) continue;
        await client.query(
          `INSERT INTO utsav_seva.join_requests (
            event_id, uid, display_name, photo_url, email, status, message,
            requested_at, reviewed_at, reviewed_by
          ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
          ON CONFLICT (event_id, uid) DO NOTHING`,
          [
            event.id,
            uid,
            join.displayName || '',
            join.photoURL || null,
            join.email || '',
            join.status || 'pending',
            join.message || '',
            iso(join.requestedAt),
            iso(join.reviewedAt, false),
            join.reviewedBy || null,
          ]
        );
        counts.joinRequests += 1;
      }

      const subEvents = await sub(event.id, 'subEvents');
      for (const subEvent of subEvents) {
        await client.query(
          `INSERT INTO utsav_seva.sub_events (
            id, event_id, name, description, date, time, location, cover_image_url, created_by, created_at, updated_at
          ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
          ON CONFLICT (id) DO NOTHING`,
          [
            subEvent.id,
            event.id,
            subEvent.name || '',
            subEvent.description || null,
            subEvent.date || '',
            subEvent.time || null,
            subEvent.location || null,
            subEvent.coverImageUrl || null,
            subEvent.createdBy || '',
            iso(subEvent.createdAt),
            iso(subEvent.updatedAt),
          ]
        );
        counts.subEvents += 1;
      }

      const albums = await sub(event.id, 'albums');
      for (const album of albums) {
        await client.query(
          `INSERT INTO public.albums (id, event_id, name, cover_url, media_count, created_by, created_at)
           VALUES ($1,$2,$3,$4,$5,$6,$7)
           ON CONFLICT (id) DO NOTHING`,
          [
            String(album.id),
            event.id,
            album.name || 'Album',
            album.coverUrl || null,
            num(album.mediaCount),
            album.createdBy || 'migrated',
            iso(album.createdAt),
          ]
        );
        counts.albums += 1;
      }

      const expenses = await sub(event.id, 'expenses');
      for (const expense of expenses) {
        await client.query(
          `INSERT INTO utsav_seva.expenses (
            id, event_id, title, amount, category, other_category, description, date, sub_event_id,
            receipt_urls, uploaded_by, uploaded_by_name, created_at, updated_at, updated_by, updated_by_name,
            deleted, deleted_at, deleted_by, deleted_by_name, deletion_reason
          ) VALUES (
            $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21
          )
          ON CONFLICT (id) DO NOTHING`,
          [
            expense.id,
            event.id,
            expense.title || '',
            num(expense.amount),
            expense.category || null,
            expense.otherCategory || null,
            expense.description || null,
            expense.date || iso(expense.createdAt),
            expense.subEventId || null,
            strArr(expense.receiptUrls),
            expense.uploadedBy || '',
            expense.uploadedByName || '',
            iso(expense.createdAt),
            iso(expense.updatedAt),
            expense.updatedBy || null,
            expense.updatedByName || null,
            !!expense.deleted,
            iso(expense.deletedAt, false),
            expense.deletedBy || null,
            expense.deletedByName || null,
            expense.deletionReason || null,
          ]
        );
        counts.expenses += 1;
      }

      const donations = await sub(event.id, 'donations');
      for (const donation of donations) {
        await client.query(
          `INSERT INTO utsav_seva.donations (
            id, event_id, donor_name, amount, note, date, photo_url, status,
            uploaded_by, uploaded_by_name, created_at, updated_at, updated_by, updated_by_name,
            deleted, deleted_at, deleted_by, deleted_by_name, deletion_reason
          ) VALUES (
            $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19
          )
          ON CONFLICT (id) DO NOTHING`,
          [
            donation.id,
            event.id,
            donation.donorName || '',
            num(donation.amount),
            donation.note || '',
            donation.date || iso(donation.createdAt),
            donation.photoUrl || null,
            donation.status === 'pending' ? 'pending' : 'given',
            donation.uploadedBy || '',
            donation.uploadedByName || '',
            iso(donation.createdAt),
            iso(donation.updatedAt, false),
            donation.updatedBy || null,
            donation.updatedByName || null,
            !!donation.deleted,
            iso(donation.deletedAt, false),
            donation.deletedBy || null,
            donation.deletedByName || null,
            donation.deletionReason || null,
          ]
        );
        for (const uid of strArr(donation.likedBy)) {
          await client.query(
            `INSERT INTO utsav_seva.donation_likes (donation_id, user_id) VALUES ($1,$2) ON CONFLICT DO NOTHING`,
            [donation.id, uid]
          );
          counts.likes += 1;
        }
        counts.donations += 1;
      }

      const streetDonations = await sub(event.id, 'streetDonations');
      for (const donation of streetDonations) {
        await client.query(
          `INSERT INTO utsav_seva.street_donations (
            id, event_id, donor_name, amount, note, date, photo_url, status,
            uploaded_by, uploaded_by_name, created_at, updated_at, updated_by, updated_by_name,
            deleted, deleted_at, deleted_by, deleted_by_name, deletion_reason
          ) VALUES (
            $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19
          )
          ON CONFLICT (id) DO NOTHING`,
          [
            donation.id,
            event.id,
            donation.donorName || '',
            num(donation.amount),
            donation.note || '',
            donation.date || iso(donation.createdAt),
            donation.photoUrl || null,
            donation.status === 'pending' ? 'pending' : 'given',
            donation.uploadedBy || '',
            donation.uploadedByName || '',
            iso(donation.createdAt),
            iso(donation.updatedAt, false),
            donation.updatedBy || null,
            donation.updatedByName || null,
            !!donation.deleted,
            iso(donation.deletedAt, false),
            donation.deletedBy || null,
            donation.deletedByName || null,
            donation.deletionReason || null,
          ]
        );
        for (const uid of strArr(donation.likedBy)) {
          await client.query(
            `INSERT INTO utsav_seva.street_donation_likes (donation_id, user_id)
             VALUES ($1,$2) ON CONFLICT DO NOTHING`,
            [donation.id, uid]
          );
          counts.likes += 1;
        }
        counts.streetDonations += 1;
      }
    }

    // Recompute counters from child rows so stale Firestore totals are not trusted.
    await client.query(`
      UPDATE utsav_seva.events e SET
        member_count = (SELECT COUNT(*) FROM utsav_seva.event_members m WHERE m.event_id = e.id),
        sub_event_count = (SELECT COUNT(*) FROM utsav_seva.sub_events s WHERE s.event_id = e.id),
        total_expenses = COALESCE((
          SELECT SUM(amount) FROM utsav_seva.expenses x WHERE x.event_id = e.id AND x.deleted = FALSE
        ), 0),
        total_donations = COALESCE((
          SELECT SUM(amount) FROM utsav_seva.donations d
          WHERE d.event_id = e.id AND d.deleted = FALSE AND d.status = 'given'
        ), 0),
        total_street_donations = COALESCE((
          SELECT SUM(amount) FROM utsav_seva.street_donations d
          WHERE d.event_id = e.id AND d.deleted = FALSE AND d.status = 'given'
        ), 0)
    `);

    await client.query('COMMIT');
    console.log('Firestore → Postgres migration complete:', counts);
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
    await pool.end();
    process.exit(0);
  }
}

main().catch((err) => {
  console.error('Migration failed:', err?.message || err);
  process.exit(1);
});
