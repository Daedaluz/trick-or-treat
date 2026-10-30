package store

import (
	"context"
	"time"

	"github.com/jackc/pgx/v5"
)

// Feedback is a message a visitor left about the service.
type Feedback struct {
	ID        int64     `json:"id"`
	Message   string    `json:"message"`
	Contact   string    `json:"contact,omitempty"`
	UserAgent string    `json:"user_agent,omitempty"`
	CreatedAt time.Time `json:"created_at"`
}

// CreateFeedback stores a feedback message.
func (s *Store) CreateFeedback(ctx context.Context, message, contact, userAgent string) error {
	_, err := s.pool.Exec(ctx,
		`INSERT INTO feedback (message, contact, user_agent) VALUES ($1, $2, $3)`,
		message, contact, userAgent)
	return err
}

// ListFeedback returns feedback newer than since (zero = all), newest first.
func (s *Store) ListFeedback(ctx context.Context, since time.Time, limit int) ([]Feedback, error) {
	rows, err := s.pool.Query(ctx,
		`SELECT id, message, contact, user_agent, created_at FROM feedback
		 WHERE created_at > $1 ORDER BY created_at DESC LIMIT $2`, since, limit)
	if err != nil {
		return nil, err
	}
	out, err := pgx.CollectRows(rows, pgx.RowToStructByPos[Feedback])
	if err != nil {
		return nil, err
	}
	if out == nil {
		out = []Feedback{}
	}
	return out, nil
}
