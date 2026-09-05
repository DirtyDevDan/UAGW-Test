PRAGMA foreign_keys = ON;

CREATE TABLE users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE COLLATE NOCASE,
  password_hash TEXT NOT NULL,
  password_salt TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE sessions (
  token_hash TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX sessions_user_id_idx ON sessions(user_id);
CREATE INDEX sessions_expires_at_idx ON sessions(expires_at);

CREATE TABLE profiles (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  display_name TEXT NOT NULL,
  discord_name TEXT NOT NULL DEFAULT '',
  bio TEXT NOT NULL DEFAULT '',
  visibility TEXT NOT NULL DEFAULT 'guild' CHECK (visibility IN ('guild','private')),
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE guild_memberships (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  guild_rank TEXT NOT NULL DEFAULT 'Recruit',
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','active','suspended')),
  joined_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE characters (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  realm TEXT NOT NULL DEFAULT '',
  class_name TEXT NOT NULL DEFAULT '',
  specialization TEXT NOT NULL DEFAULT '',
  primary_role TEXT NOT NULL DEFAULT 'DPS',
  item_level INTEGER,
  professions TEXT NOT NULL DEFAULT '[]',
  is_main INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX characters_user_id_idx ON characters(user_id);

CREATE TABLE recruitment_applications (
  id TEXT PRIMARY KEY,
  account_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  email TEXT NOT NULL,
  character_name TEXT NOT NULL,
  discord_name TEXT NOT NULL,
  class_name TEXT NOT NULL,
  primary_role TEXT NOT NULL,
  item_level INTEGER,
  goals TEXT NOT NULL DEFAULT '',
  experience TEXT NOT NULL DEFAULT '',
  rules_agreed INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'New',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  reviewed_at TEXT,
  reviewed_by TEXT REFERENCES users(id) ON DELETE SET NULL
);
CREATE INDEX recruitment_status_idx ON recruitment_applications(status);

CREATE TABLE guild_events (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  category TEXT NOT NULL,
  starts_at TEXT NOT NULL,
  duration_minutes INTEGER NOT NULL DEFAULT 120,
  recurrence TEXT NOT NULL DEFAULT 'none',
  recurrence_until TEXT,
  location TEXT NOT NULL DEFAULT '',
  organizer TEXT NOT NULL DEFAULT '',
  description TEXT NOT NULL DEFAULT '',
  requirements TEXT NOT NULL DEFAULT '',
  tank_capacity INTEGER NOT NULL DEFAULT 2,
  healer_capacity INTEGER NOT NULL DEFAULT 4,
  dps_capacity INTEGER NOT NULL DEFAULT 14,
  status TEXT NOT NULL DEFAULT 'published',
  created_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX guild_events_starts_at_idx ON guild_events(starts_at);

CREATE TABLE event_rsvps (
  id TEXT PRIMARY KEY,
  event_id TEXT NOT NULL REFERENCES guild_events(id) ON DELETE CASCADE,
  character_id TEXT NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'Going',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(event_id, character_id)
);
CREATE INDEX event_rsvps_event_id_idx ON event_rsvps(event_id);

CREATE TABLE guild_announcements (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'Guild News',
  body TEXT NOT NULL,
  pinned INTEGER NOT NULL DEFAULT 0,
  published INTEGER NOT NULL DEFAULT 1,
  published_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE guild_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE roster_decisions (
  event_id TEXT NOT NULL REFERENCES guild_events(id) ON DELETE CASCADE,
  character_id TEXT NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
  decision TEXT NOT NULL,
  updated_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY(event_id, character_id)
);

CREATE TABLE event_attendance (
  event_id TEXT NOT NULL REFERENCES guild_events(id) ON DELETE CASCADE,
  character_id TEXT NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
  status TEXT NOT NULL,
  officer_note TEXT NOT NULL DEFAULT '',
  updated_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY(event_id, character_id)
);

CREATE TABLE officer_audit_log (
  id TEXT PRIMARY KEY,
  officer_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  action TEXT NOT NULL,
  target TEXT NOT NULL,
  detail TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX officer_audit_created_idx ON officer_audit_log(created_at DESC);

INSERT INTO guild_settings (key, value) VALUES
  ('raid_rules', '["Be online and ready 15 minutes before raid time.","Bring current consumables and repaired gear.","Keep voice comms clear during pulls and progression discussion."]'),
  ('mythic_rules', '["Treat every key and every player with respect.","Discuss routes and expectations before the timer starts.","Finish the run as a team unless everyone agrees otherwise."]'),
  ('site_content', '{"headline":"Welcome to United Azeroth.","lede":"United Azeroth is a welcoming World of Warcraft community for players who want organized progression, reliable groups, and friendships that last beyond the final pull.","sidebar":"Experienced players. Shared adventures. One united community."}');
