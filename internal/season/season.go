// Package season decides when households may sign up and when a year's doors
// are archived. Dates are month-day strings ("10-01") evaluated in a timezone.
package season

import (
	"fmt"
	"time"
)

// Season holds the configurable calendar.
type Season struct {
	signupOpens  monthDay
	eventDate    monthDay
	archiveAfter monthDay
	loc          *time.Location
}

// Phase is where we are in the yearly cycle.
type Phase string

const (
	// PhaseBefore: the new year has started but sign-up is not open yet.
	PhaseBefore Phase = "before"
	// PhaseOpen: households can register and the map is live.
	PhaseOpen Phase = "open"
	// PhaseAfter: this year's event is over and its doors are archived.
	PhaseAfter Phase = "after"
)

type monthDay struct {
	month time.Month
	day   int
}

// New parses the configuration. The dates are "MM-DD".
func New(signupOpens, eventDate, archiveAfter, timezone string) (*Season, error) {
	so, err := parseMonthDay(signupOpens)
	if err != nil {
		return nil, fmt.Errorf("signup-opens: %w", err)
	}
	ed, err := parseMonthDay(eventDate)
	if err != nil {
		return nil, fmt.Errorf("event-date: %w", err)
	}
	aa, err := parseMonthDay(archiveAfter)
	if err != nil {
		return nil, fmt.Errorf("archive-after: %w", err)
	}
	loc, err := time.LoadLocation(timezone)
	if err != nil {
		return nil, fmt.Errorf("timezone: %w", err)
	}
	s := &Season{signupOpens: so, eventDate: ed, archiveAfter: aa, loc: loc}
	if s.EventAt(2000).Before(s.SignupOpensAt(2000)) || !s.EventAt(2000).Before(s.ArchiveAt(2000)) {
		return nil, fmt.Errorf("dates must be ordered signup-opens (%s) <= event-date (%s) < archive-after (%s)", signupOpens, eventDate, archiveAfter)
	}
	return s, nil
}

func parseMonthDay(s string) (monthDay, error) {
	t, err := time.Parse("01-02", s)
	if err != nil {
		return monthDay{}, fmt.Errorf("%q is not MM-DD", s)
	}
	return monthDay{month: t.Month(), day: t.Day()}, nil
}

// Location is the timezone the season calendar is evaluated in.
func (s *Season) Location() *time.Location { return s.loc }

// Year is the calendar year of now in the season's timezone.
func (s *Season) Year(now time.Time) int { return now.In(s.loc).Year() }

// SignupOpensAt is the instant sign-up opens for the given year.
func (s *Season) SignupOpensAt(year int) time.Time {
	return time.Date(year, s.signupOpens.month, s.signupOpens.day, 0, 0, 0, 0, s.loc)
}

// EventAt is the evening everyone is out: midnight starting the event day.
func (s *Season) EventAt(year int) time.Time {
	return time.Date(year, s.eventDate.month, s.eventDate.day, 0, 0, 0, 0, s.loc)
}

// ArchiveAt is the instant the given year's doors are archived and sign-up closes.
func (s *Season) ArchiveAt(year int) time.Time {
	return time.Date(year, s.archiveAfter.month, s.archiveAfter.day, 0, 0, 0, 0, s.loc)
}

// ShouldArchive reports whether doors registered for year should be archived at now.
func (s *Season) ShouldArchive(year int, now time.Time) bool {
	return !now.Before(s.ArchiveAt(year))
}

// State describes where we are in the calendar, for the API and the UI.
type State struct {
	Year       int   `json:"year"`
	Phase      Phase `json:"phase"`
	SignupOpen bool  `json:"signup_open"`
	// SignupOpensAt, EventAt and ArchiveAt describe the upcoming (or current)
	// season: this year's while it is still ahead or running, next year's
	// once this year's is archived.
	SignupOpensAt time.Time `json:"signup_opens_at"`
	EventAt       time.Time `json:"event_at"`
	ArchiveAt     time.Time `json:"archive_at"`
	// Reason is a human-readable explanation when sign-up is closed.
	Reason string `json:"reason,omitempty"`
	// LastSeason is filled in by the API from the archive when available.
	LastSeason *LastSeason `json:"last_season,omitempty"`
}

// LastSeason summarises the most recent archived year.
type LastSeason struct {
	Year  int `json:"year"`
	Doors int `json:"doors"`
}

// LastSeasonYear is the most recently finished season at now.
func (s *Season) LastSeasonYear(now time.Time) int {
	year := s.Year(now)
	if s.ShouldArchive(year, now) {
		return year
	}
	return year - 1
}

// State evaluates the calendar at now.
func (s *Season) State(now time.Time) State {
	year := s.Year(now)
	st := State{Year: year, SignupOpensAt: s.SignupOpensAt(year), EventAt: s.EventAt(year), ArchiveAt: s.ArchiveAt(year)}
	switch {
	case now.Before(st.SignupOpensAt):
		st.Phase = PhaseBefore
		st.Reason = fmt.Sprintf("Sign-up for %d opens on %s.", year, st.SignupOpensAt.Format("2 January"))
	case !now.Before(st.ArchiveAt):
		st.Phase = PhaseAfter
		st.SignupOpensAt = s.SignupOpensAt(year + 1)
		st.EventAt = s.EventAt(year + 1)
		st.ArchiveAt = s.ArchiveAt(year + 1)
		st.Reason = fmt.Sprintf("This year's trick-or-treating is over. Sign-up for %d opens on %s.", year+1, st.SignupOpensAt.Format("2 January 2006"))
	default:
		st.Phase = PhaseOpen
		st.SignupOpen = true
	}
	return st
}
