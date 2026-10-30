CREATE TABLE IF NOT EXISTS doors (
    id         TEXT PRIMARY KEY,
    lat        DOUBLE PRECISION NOT NULL,
    lng        DOUBLE PRECISION NOT NULL,
    address    TEXT NOT NULL,
    note       TEXT NOT NULL DEFAULT '',
    open_from  TEXT NOT NULL DEFAULT '',
    open_to    TEXT NOT NULL DEFAULT '',
    year       INTEGER NOT NULL,
    token_hash TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS doors_year_idx ON doors (year);
