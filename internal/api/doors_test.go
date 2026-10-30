package api

import "testing"

func TestValidClock(t *testing.T) {
	for in, want := range map[string]bool{"": true, "17:00": true, "23:59": true, "24:00": false, "7pm": false, "17:00:00": false} {
		if got := validClock(in); got != want {
			t.Errorf("validClock(%q) = %v, want %v", in, got, want)
		}
	}
}

func TestHashTokenIsStableAndOpaque(t *testing.T) {
	a, b := hashToken("secret"), hashToken("secret")
	if a != b {
		t.Fatal("hash not deterministic")
	}
	if a == "secret" || len(a) != 64 {
		t.Fatalf("unexpected hash %q", a)
	}
	if hashToken("other") == a {
		t.Fatal("collision between different tokens")
	}
}
