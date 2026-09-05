ALTER TABLE profiles ADD COLUMN created_at TEXT NOT NULL DEFAULT '';
ALTER TABLE guild_memberships ADD COLUMN updated_at TEXT NOT NULL DEFAULT '';
ALTER TABLE characters ADD COLUMN profile_note TEXT NOT NULL DEFAULT '';
ALTER TABLE recruitment_applications ADD COLUMN updated_at TEXT NOT NULL DEFAULT '';
ALTER TABLE guild_announcements ADD COLUMN expires_at TEXT;
ALTER TABLE guild_announcements ADD COLUMN created_at TEXT NOT NULL DEFAULT '';

UPDATE profiles SET created_at = updated_at WHERE created_at = '';
UPDATE guild_memberships SET updated_at = joined_at WHERE updated_at = '';
UPDATE recruitment_applications SET updated_at = created_at WHERE updated_at = '';
UPDATE guild_announcements SET created_at = published_at WHERE created_at = '';

CREATE UNIQUE INDEX characters_identity_idx ON characters(user_id, name, realm);
CREATE UNIQUE INDEX one_main_character_per_user_idx ON characters(user_id) WHERE is_main = 1;
CREATE UNIQUE INDEX one_rsvp_per_user_event_idx ON event_rsvps(event_id, user_id);

CREATE TABLE login_attempts (
  attempt_key TEXT PRIMARY KEY,
  failures INTEGER NOT NULL DEFAULT 0,
  window_started_at TEXT NOT NULL,
  blocked_until TEXT
);
