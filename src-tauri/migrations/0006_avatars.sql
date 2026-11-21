-- Photos are kept inside the database as small JPEG thumbnails, so they travel with the
-- one data file and with exports. They live in their own table so listing people never
-- has to load image data. This replaces the unused `avatar_path` column.

ALTER TABLE contacts DROP COLUMN avatar_path;

CREATE TABLE avatars (
  contact_id TEXT PRIMARY KEY NOT NULL REFERENCES contacts (id) ON DELETE CASCADE,
  -- A data URL: data:image/jpeg;base64,...
  image      TEXT NOT NULL CHECK (image LIKE 'data:image/%'),
  updated_at TEXT NOT NULL
);
