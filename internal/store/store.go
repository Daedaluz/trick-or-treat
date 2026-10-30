// Package store persists doors in PostgreSQL.
package store

import (
	"context"
	"embed"
	"errors"
	"fmt"
	"io/fs"
	"sort"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

//go:embed migrations/*.sql
var migrationFS embed.FS

// ErrNotFound is returned when no door matches the given id and token.
var ErrNotFound = errors.New("door not found")

// Door is a household that has opted in to receive trick-or-treaters.
type Door struct {
	ID        string    `json:"id"`
	Lat       float64   `json:"lat"`
	Lng       float64   `json:"lng"`
	Address   string    `json:"address"`
	Unit      string    `json:"unit,omitempty"`
	Intercom  string    `json:"intercom_name,omitempty"`
	Note      string    `json:"note,omitempty"`
	OpenFrom  string    `json:"open_from,omitempty"`
	OpenTo    string    `json:"open_to,omitempty"`
	Year      int       `json:"year"`
	CreatedAt time.Time `json:"created_at"`
}

// Store wraps a pgx connection pool.
type Store struct {
	pool *pgxpool.Pool
}

// Open connects to the database and verifies the connection.
func Open(ctx context.Context, url string) (*Store, error) {
	pool, err := pgxpool.New(ctx, url)
	if err != nil {
		return nil, fmt.Errorf("connect: %w", err)
	}
	pingCtx, cancel := context.WithTimeout(ctx, 10*time.Second)
	defer cancel()
	if err := pool.Ping(pingCtx); err != nil {
		pool.Close()
		return nil, fmt.Errorf("ping: %w", err)
	}
	return &Store{pool: pool}, nil
}

// Close releases the pool.
func (s *Store) Close() { s.pool.Close() }

// Migrate applies every embedded migration that has not been applied yet.
// It takes an advisory lock so several replicas starting at once don't race.
func (s *Store) Migrate(ctx context.Context) error {
	conn, err := s.pool.Acquire(ctx)
	if err != nil {
		return err
	}
	defer conn.Release()

	const lockID = 0x7472_6963_6b // "trick"
	if _, err := conn.Exec(ctx, `SELECT pg_advisory_lock($1)`, lockID); err != nil {
		return err
	}
	defer conn.Exec(context.WithoutCancel(ctx), `SELECT pg_advisory_unlock($1)`, lockID) //nolint:errcheck

	if _, err := conn.Exec(ctx, `CREATE TABLE IF NOT EXISTS schema_migrations (name TEXT PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT now())`); err != nil {
		return err
	}

	entries, err := fs.ReadDir(migrationFS, "migrations")
	if err != nil {
		return err
	}
	sort.Slice(entries, func(i, j int) bool { return entries[i].Name() < entries[j].Name() })

	for _, e := range entries {
		var applied bool
		if err := conn.QueryRow(ctx, `SELECT EXISTS (SELECT 1 FROM schema_migrations WHERE name = $1)`, e.Name()).Scan(&applied); err != nil {
			return err
		}
		if applied {
			continue
		}
		body, err := migrationFS.ReadFile("migrations/" + e.Name())
		if err != nil {
			return err
		}
		err = pgx.BeginFunc(ctx, conn, func(tx pgx.Tx) error {
			if _, err := tx.Exec(ctx, string(body)); err != nil {
				return err
			}
			_, err := tx.Exec(ctx, `INSERT INTO schema_migrations (name) VALUES ($1)`, e.Name())
			return err
		})
		if err != nil {
			return fmt.Errorf("migration %s: %w", e.Name(), err)
		}
	}
	return nil
}

// ListDoors returns all doors registered for the given year.
func (s *Store) ListDoors(ctx context.Context, year int) ([]Door, error) {
	rows, err := s.pool.Query(ctx,
		`SELECT id, lat, lng, address, unit, intercom_name, note, open_from, open_to, year, created_at
		 FROM doors WHERE year = $1 ORDER BY created_at DESC`, year)
	if err != nil {
		return nil, err
	}
	doors, err := pgx.CollectRows(rows, pgx.RowToStructByPos[Door])
	if err != nil {
		return nil, err
	}
	if doors == nil {
		doors = []Door{}
	}
	return doors, nil
}

// CreateDoor inserts a door. tokenHash is the hash of the owner's secret.
func (s *Store) CreateDoor(ctx context.Context, d Door, tokenHash string) error {
	_, err := s.pool.Exec(ctx,
		`INSERT INTO doors (id, lat, lng, address, unit, intercom_name, note, open_from, open_to, year, token_hash, created_at)
		 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
		d.ID, d.Lat, d.Lng, d.Address, d.Unit, d.Intercom, d.Note, d.OpenFrom, d.OpenTo, d.Year, tokenHash, d.CreatedAt)
	return err
}

// UpdateDoor replaces the editable fields of a door when id and token hash
// match. The year and creation time are kept.
func (s *Store) UpdateDoor(ctx context.Context, id, tokenHash string, d Door) (Door, error) {
	rows, err := s.pool.Query(ctx,
		`UPDATE doors SET lat = $3, lng = $4, address = $5, unit = $6, intercom_name = $7, note = $8, open_from = $9, open_to = $10
		 WHERE id = $1 AND token_hash = $2
		 RETURNING id, lat, lng, address, unit, intercom_name, note, open_from, open_to, year, created_at`,
		id, tokenHash, d.Lat, d.Lng, d.Address, d.Unit, d.Intercom, d.Note, d.OpenFrom, d.OpenTo)
	if err != nil {
		return Door{}, err
	}
	out, err := pgx.CollectOneRow(rows, pgx.RowToStructByPos[Door])
	if errors.Is(err, pgx.ErrNoRows) {
		return Door{}, ErrNotFound
	}
	return out, err
}

// DeleteDoor removes a door when id and token hash match.
func (s *Store) DeleteDoor(ctx context.Context, id, tokenHash string) error {
	tag, err := s.pool.Exec(ctx, `DELETE FROM doors WHERE id = $1 AND token_hash = $2`, id, tokenHash)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return ErrNotFound
	}
	return nil
}

// ArchiveYears moves every door whose year is in years into doors_archive.
// It returns how many doors were moved.
func (s *Store) ArchiveYears(ctx context.Context, years []int) (int64, error) {
	if len(years) == 0 {
		return 0, nil
	}
	var moved int64
	err := pgx.BeginFunc(ctx, s.pool, func(tx pgx.Tx) error {
		tag, err := tx.Exec(ctx, `
			WITH moved AS (
				DELETE FROM doors WHERE year = ANY($1) RETURNING *
			)
			INSERT INTO doors_archive (id, lat, lng, address, unit, intercom_name, note, open_from, open_to, year, created_at)
			SELECT id, lat, lng, address, unit, intercom_name, note, open_from, open_to, year, created_at FROM moved
			ON CONFLICT (id) DO NOTHING`, years)
		if err != nil {
			return err
		}
		moved = tag.RowsAffected()
		return nil
	})
	return moved, err
}

// LiveYears returns the distinct years present in the live doors table.
func (s *Store) LiveYears(ctx context.Context) ([]int, error) {
	rows, err := s.pool.Query(ctx, `SELECT DISTINCT year FROM doors ORDER BY year`)
	if err != nil {
		return nil, err
	}
	return pgx.CollectRows(rows, pgx.RowTo[int])
}

// CountDoors returns how many doors are live for the given year.
func (s *Store) CountDoors(ctx context.Context, year int) (int, error) {
	var n int
	err := s.pool.QueryRow(ctx, `SELECT count(*) FROM doors WHERE year = $1`, year).Scan(&n)
	return n, err
}

// CountFeedback returns how many feedback messages are stored.
func (s *Store) CountFeedback(ctx context.Context) (int, error) {
	var n int
	err := s.pool.QueryRow(ctx, `SELECT count(*) FROM feedback`).Scan(&n)
	return n, err
}

// CountArchived returns how many doors were archived for the given year.
func (s *Store) CountArchived(ctx context.Context, year int) (int, error) {
	var n int
	err := s.pool.QueryRow(ctx, `SELECT count(*) FROM doors_archive WHERE year = $1`, year).Scan(&n)
	return n, err
}

// Healthy reports whether the database answers.
func (s *Store) Healthy(ctx context.Context) error {
	return s.pool.Ping(ctx)
}
