# Festive Events Backend (`festive-events-be-repo`)

API for **app data + photos/videos**, stored in PostgreSQL.

- Files: `media.file_data` BYTEA
- App records: schema `utsav_seva` (users, events, donations, expenses, …)
- Login remains **Firebase email/password**. Google sign-in is not part of this API.

## Quick start

```bash
cd festive-events-be-repo
cp .env.example .env
# edit DATABASE_URL
npm install
npm run db:test
npm run dev
```

API: `http://localhost:3001/api/health`

## Environment

| Variable | Required | Example |
|----------|----------|---------|
| `DATABASE_URL` | yes | `postgresql://user:pass@host:5432/B2B_POC` |
| `FIREBASE_PROJECT_ID` | no | `festiveevents-e84f8` (verifies email/password ID tokens) |
| `API_PUBLIC_URL` | no | `https://your-host.com` |
| `CORS_ORIGIN` | no | `*` |
| `PORT` | no | `3001` |

`.env` is gitignored.

## SQL

| File | When |
|------|------|
| `migrations/000_rollback_media.sql` | Drop old tables |
| `migrations/005_app_tables.sql` | App data tables (`utsav_seva`) + copy Firestore with `npm run db:migrate-firestore` |

## Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/health` | Health check |
| GET/POST/PATCH/DELETE | `/api/streets` `/api/festivals` `/api/events` … | App data (Firebase ID token required) |
| POST | `/api/auth/registration-otp` | Store registration OTP |
| POST | `/api/media/upload` | Upload photo/video (base64) + mapping |
| GET | `/api/media?eventId=&purpose=` | List by IDs |
| GET | `/api/media/:id` | Metadata |
| GET | `/api/media/:id/file` | Stream file bytes |
| PATCH | `/api/media/:id/mapping` | Update mapping |
| DELETE | `/api/media/:id` | Soft-delete (needs reason) |
| DELETE | `/api/media/:id/hard` | Hard-delete |

### Upload example

```json
POST /api/media/upload
{
  "purpose": "gallery",
  "kind": "photo",
  "eventId": "evt_123",
  "uploadedBy": "uid_abc",
  "uploadedByName": "Madhu",
  "fileName": "photo.jpg",
  "contentType": "image/jpeg",
  "base64": "...."
}
```

Max request ~4MB (compress on device).

## Deploy

### Option A — Vercel

```bash
npx vercel
```

Set `DATABASE_URL` (and optional `API_PUBLIC_URL`) in the Vercel project env.

### Option B — any Node host (Railway, Render, VPS)

```bash
npm install
npm run build
npm start
```

Expose port `PORT` (default 3001).

### Option C — new GitHub repo

```bash
cd festive-events-be-repo
git init
git add .
git commit -m "Initial festive-events backend API"
# create empty GitHub repo, then:
git remote add origin https://github.com/<you>/festive-events-be-repo.git
git push -u origin main
```

Do **not** commit `.env`.

## Mapping cheat sheet

| Need | Query |
|------|--------|
| Event gallery | `GET /api/media?eventId=X&purpose=gallery` |
| Sub-event media | `GET /api/media?eventId=X&subEventId=Y` |
| Donation photos | `GET /api/media?eventId=X&purpose=donation` |
| Receipts | `GET /api/media?eventId=X&purpose=receipt` |
| Avatar | `GET /api/media?userId=U&purpose=avatar` |
| Photos only | `&kind=photo` |
| Videos only | `&kind=video` |
