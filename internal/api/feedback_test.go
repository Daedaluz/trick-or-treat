package api

import (
	"testing"
	"time"
)

func TestIPLimiter(t *testing.T) {
	l := newIPLimiter(2, time.Hour)
	now := time.Now()
	if !l.allow("a", now) || !l.allow("a", now) {
		t.Fatal("first two should pass")
	}
	if l.allow("a", now) {
		t.Fatal("third within window should be blocked")
	}
	if !l.allow("b", now) {
		t.Fatal("other key should be independent")
	}
	if !l.allow("a", now.Add(2*time.Hour)) {
		t.Fatal("should pass once the window has moved on")
	}
}
