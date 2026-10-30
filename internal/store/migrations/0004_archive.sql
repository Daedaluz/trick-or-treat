-- Past seasons are moved here so the live table only holds the current year.
CREATE TABLE IF NOT EXISTS doors_archive (
    id            TEXT PRIMARY KEY,
    lat           DOUBLE PRECISION NOT NULL,
    lng           DOUBLE PRECISION NOT NULL,
    address       TEXT NOT NULL,
    unit          TEXT NOT NULL DEFAULT '',
    intercom_name TEXT NOT NULL DEFAULT '',
    note          TEXT NOT NULL DEFAULT '',
    open_from     TEXT NOT NULL DEFAULT '',
    open_to       TEXT NOT NULL DEFAULT '',
    year          INTEGER NOT NULL,
    created_at    TIMESTAMPTZ NOT NULL,
    archived_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS doors_archive_year_idx ON doors_archive (year);
