-- Allow Firestore-style album ids (not only UUID)
ALTER TABLE media DROP CONSTRAINT IF EXISTS fk_media_album;
ALTER TABLE media ALTER COLUMN album_id TYPE TEXT USING album_id::text;
