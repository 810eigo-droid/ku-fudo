CREATE TABLE IF NOT EXISTS users (
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 login TEXT NOT NULL UNIQUE,
 name TEXT NOT NULL,
 password TEXT NOT NULL,
 role TEXT NOT NULL CHECK(role IN ('member','candidate','director','admin')),
 active INTEGER NOT NULL DEFAULT 1,
 must_change INTEGER NOT NULL DEFAULT 0,
 version INTEGER NOT NULL DEFAULT 1,
 created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS messages (
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 room TEXT NOT NULL CHECK(room IN ('all','board')),
 user_id INTEGER NOT NULL REFERENCES users(id),
 body TEXT NOT NULL,
 kind TEXT NOT NULL DEFAULT 'chat' CHECK(kind IN ('chat','notice')),
 title TEXT NOT NULL DEFAULT '',
 area TEXT NOT NULL DEFAULT '',
 event_at TEXT NOT NULL DEFAULT '',
 zoom_url TEXT NOT NULL DEFAULT '',
 parent_id INTEGER REFERENCES messages(id),
 hidden INTEGER NOT NULL DEFAULT 0,
 created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_messages_room_id ON messages(room,id);
CREATE INDEX IF NOT EXISTS idx_messages_events ON messages(room,kind,event_at);
CREATE TABLE IF NOT EXISTS limits (
 bucket TEXT PRIMARY KEY,
 count INTEGER NOT NULL,
 expires INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS audit (
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 actor INTEGER NOT NULL,
 action TEXT NOT NULL,
 target INTEGER NOT NULL,
 created_at INTEGER NOT NULL
);
PRAGMA user_version=1;
