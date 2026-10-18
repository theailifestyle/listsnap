-- Run once as the database owner ("app"). The app itself connects as "app_runtime",
-- which can read and write rows but can't create tables.
CREATE TABLE IF NOT EXISTS lists (
  id         int GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  title      text NOT NULL,
  photo_key  text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS items (
  id       int GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  list_id  int NOT NULL REFERENCES lists(id) ON DELETE CASCADE,
  text     text NOT NULL,
  done     boolean NOT NULL DEFAULT false,
  position int NOT NULL
);

CREATE INDEX IF NOT EXISTS items_list_id ON items (list_id);
