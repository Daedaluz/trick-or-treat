package season

import (
	"context"
	"log/slog"
	"time"
)

// Archiver is what the archive job needs from the store.
type Archiver interface {
	LiveYears(ctx context.Context) ([]int, error)
	ArchiveYears(ctx context.Context, years []int) (int64, error)
}

// ArchiveDue moves every live year whose archive date has passed. It is safe
// to run from several replicas: the store does the move in one statement.
func (s *Season) ArchiveDue(ctx context.Context, st Archiver, now time.Time, log *slog.Logger) (int64, error) {
	years, err := st.LiveYears(ctx)
	if err != nil {
		return 0, err
	}
	var due []int
	for _, y := range years {
		if s.ShouldArchive(y, now) {
			due = append(due, y)
		}
	}
	if len(due) == 0 {
		return 0, nil
	}
	moved, err := st.ArchiveYears(ctx, due)
	if err != nil {
		return 0, err
	}
	if moved > 0 {
		log.Info("archived doors", "years", due, "count", moved)
	}
	return moved, nil
}

// RunArchiver calls ArchiveDue now and then every interval until ctx ends.
func (s *Season) RunArchiver(ctx context.Context, st Archiver, interval time.Duration, log *slog.Logger) {
	tick := time.NewTicker(interval)
	defer tick.Stop()
	for {
		if _, err := s.ArchiveDue(ctx, st, time.Now(), log); err != nil && ctx.Err() == nil {
			log.Error("archive job", "err", err)
		}
		select {
		case <-ctx.Done():
			return
		case <-tick.C:
		}
	}
}
