package season

import (
	"testing"
	"time"
)

func mustNew(t *testing.T) *Season {
	t.Helper()
	s, err := New("10-01", "11-02", "Europe/Stockholm")
	if err != nil {
		t.Fatal(err)
	}
	return s
}

func at(t *testing.T, s string) time.Time {
	t.Helper()
	loc, _ := time.LoadLocation("Europe/Stockholm")
	ts, err := time.ParseInLocation("2006-01-02 15:04", s, loc)
	if err != nil {
		t.Fatal(err)
	}
	return ts
}

func TestState(t *testing.T) {
	s := mustNew(t)
	cases := []struct {
		now  string
		open bool
	}{
		{"2026-09-30 23:59", false},
		{"2026-10-01 00:00", true},
		{"2026-10-31 20:00", true},
		{"2026-11-01 23:59", true},
		{"2026-11-02 00:00", false},
		{"2026-12-25 12:00", false},
	}
	for _, c := range cases {
		st := s.State(at(t, c.now))
		if st.SignupOpen != c.open {
			t.Errorf("at %s: signup_open = %v, want %v (%s)", c.now, st.SignupOpen, c.open, st.Reason)
		}
		if st.Year != 2026 {
			t.Errorf("at %s: year = %d", c.now, st.Year)
		}
	}
	// After archiving, the next sign-up date is next year's.
	st := s.State(at(t, "2026-11-02 00:00"))
	if st.SignupOpensAt.Year() != 2027 {
		t.Errorf("next signup year = %d, want 2027", st.SignupOpensAt.Year())
	}
}

func TestShouldArchive(t *testing.T) {
	s := mustNew(t)
	if s.ShouldArchive(2026, at(t, "2026-11-01 23:59")) {
		t.Error("archived too early")
	}
	if !s.ShouldArchive(2026, at(t, "2026-11-02 00:00")) {
		t.Error("not archived on the archive date")
	}
	if !s.ShouldArchive(2025, at(t, "2026-01-01 00:00")) {
		t.Error("previous year should always be archived")
	}
}

func TestNewRejectsBadConfig(t *testing.T) {
	for _, c := range [][3]string{
		{"13-01", "11-02", "UTC"},
		{"10-01", "11-2", "UTC"},
		{"11-05", "11-02", "UTC"},
		{"10-01", "11-02", "Mars/Olympus"},
	} {
		if _, err := New(c[0], c[1], c[2]); err == nil {
			t.Errorf("New(%q, %q, %q) accepted", c[0], c[1], c[2])
		}
	}
}
