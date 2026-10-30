package api

import (
	"crypto/subtle"
	"net/http"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/gin-gonic/gin"
)

// ipLimiter allows at most n events per window per key. It is in-memory and
// per replica, which is plenty to stop a script from flooding the table.
type ipLimiter struct {
	mu     sync.Mutex
	n      int
	window time.Duration
	hits   map[string][]time.Time
}

func newIPLimiter(n int, window time.Duration) *ipLimiter {
	return &ipLimiter{n: n, window: window, hits: map[string][]time.Time{}}
}

func (l *ipLimiter) allow(key string, now time.Time) bool {
	l.mu.Lock()
	defer l.mu.Unlock()
	cutoff := now.Add(-l.window)
	kept := l.hits[key][:0]
	for _, t := range l.hits[key] {
		if t.After(cutoff) {
			kept = append(kept, t)
		}
	}
	if len(kept) >= l.n {
		l.hits[key] = kept
		return false
	}
	l.hits[key] = append(kept, now)
	// Opportunistic cleanup so the map does not grow forever.
	if len(l.hits) > 10000 {
		for k, v := range l.hits {
			if len(v) == 0 || !v[len(v)-1].After(cutoff) {
				delete(l.hits, k)
			}
		}
	}
	return true
}

type feedbackRequest struct {
	Message string `json:"message"`
	Contact string `json:"contact"`
}

// createFeedback stores a visitor's message. Anyone may write; nobody can read
// through the public API.
func (h *handler) createFeedback(c *gin.Context) {
	if !h.feedbackLimit.allow(c.ClientIP(), time.Now()) {
		c.JSON(http.StatusTooManyRequests, gin.H{"error": "too much feedback from this address, try again later"})
		return
	}
	var req feedbackRequest
	c.Request.Body = http.MaxBytesReader(c.Writer, c.Request.Body, 1<<16)
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid JSON"})
		return
	}
	req.Message = strings.TrimSpace(req.Message)
	req.Contact = strings.TrimSpace(req.Contact)
	switch {
	case len(req.Message) < 3:
		c.JSON(http.StatusBadRequest, gin.H{"error": "please write a few words"})
		return
	case len(req.Message) > 2000 || len(req.Contact) > 200:
		c.JSON(http.StatusBadRequest, gin.H{"error": "message or contact too long"})
		return
	}
	ua := c.Request.UserAgent()
	if len(ua) > 300 {
		ua = ua[:300]
	}
	if err := h.store.CreateFeedback(c.Request.Context(), req.Message, req.Contact, ua); err != nil {
		h.log.Error("create feedback", "err", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "database error"})
		return
	}
	if h.metrics != nil {
		h.metrics.FeedbackSubmitted()
	}
	c.Status(http.StatusNoContent)
}

// requireAdmin checks a bearer token against the configured admin token.
// The route is only registered when a token is configured.
func (h *handler) requireAdmin(c *gin.Context) {
	auth := c.GetHeader("Authorization")
	tok, ok := strings.CutPrefix(auth, "Bearer ")
	if !ok || subtle.ConstantTimeCompare([]byte(tok), []byte(h.cfg.AdminToken)) != 1 {
		c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{"error": "admin token required"})
		return
	}
	c.Next()
}

// listFeedback returns feedback for the operator. ?since=RFC3339 and ?limit=.
func (h *handler) listFeedback(c *gin.Context) {
	var since time.Time
	if s := c.Query("since"); s != "" {
		t, err := time.Parse(time.RFC3339, s)
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "since must be RFC3339"})
			return
		}
		since = t
	}
	limit := 100
	if s := c.Query("limit"); s != "" {
		n, err := strconv.Atoi(s)
		if err != nil || n < 1 || n > 1000 {
			c.JSON(http.StatusBadRequest, gin.H{"error": "limit must be 1-1000"})
			return
		}
		limit = n
	}
	out, err := h.store.ListFeedback(c.Request.Context(), since, limit)
	if err != nil {
		h.log.Error("list feedback", "err", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "database error"})
		return
	}
	c.JSON(http.StatusOK, out)
}
