// Package api exposes the HTTP API and mounts the frontend.
package api

import (
	"log/slog"
	"net/http"
	"sync"
	"time"

	"github.com/gin-gonic/gin"

	"github.com/Daedaluz/trick-or-treat/internal/config"
	"github.com/Daedaluz/trick-or-treat/internal/season"
	"github.com/Daedaluz/trick-or-treat/internal/store"
	"github.com/Daedaluz/trick-or-treat/web"
)

type handler struct {
	store  *store.Store
	cfg    *config.Config
	season *season.Season
	log    *slog.Logger

	geoClient *http.Client
	geoMu     sync.Mutex // Nominatim allows at most one request per second.
	geoLast   time.Time

	feedbackLimit *ipLimiter
}

// New builds the gin engine with API routes and the embedded SPA.
func New(st *store.Store, cfg *config.Config, sea *season.Season, log *slog.Logger) http.Handler {
	gin.SetMode(gin.ReleaseMode)
	r := gin.New()
	r.Use(gin.Recovery(), requestLogger(log))
	if cfg.TrustProxy {
		_ = r.SetTrustedProxies(nil) // trust all; we run behind the gateway
	} else {
		_ = r.SetTrustedProxies([]string{})
	}

	h := &handler{
		store:     st,
		cfg:       cfg,
		season:    sea,
		log:       log,
		geoClient: &http.Client{Timeout: 10 * time.Second},

		feedbackLimit: newIPLimiter(5, time.Hour),
	}

	r.GET("/healthz", func(c *gin.Context) { c.String(http.StatusOK, "ok") })
	r.GET("/readyz", func(c *gin.Context) {
		if err := st.Healthy(c.Request.Context()); err != nil {
			c.String(http.StatusServiceUnavailable, "db: %v", err)
			return
		}
		c.String(http.StatusOK, "ok")
	})

	api := r.Group("/api")
	{
		api.GET("/season", h.getSeason)
		api.GET("/doors", h.listDoors)
		api.POST("/doors", h.createDoor)
		api.DELETE("/doors/:id", h.deleteDoor)
		api.GET("/geocode", h.geocode)
		api.POST("/feedback", h.createFeedback)

		// Operator-only reads exist only when an admin token is configured.
		if cfg.AdminToken != "" {
			admin := api.Group("/admin", h.requireAdmin)
			admin.GET("/feedback", h.listFeedback)
		}
	}

	r.NoRoute(gin.WrapH(web.Handler()))
	return r
}

func requestLogger(log *slog.Logger) gin.HandlerFunc {
	return func(c *gin.Context) {
		start := time.Now()
		c.Next()
		if c.Request.URL.Path == "/healthz" || c.Request.URL.Path == "/readyz" {
			return
		}
		log.Info("request",
			"method", c.Request.Method,
			"path", c.Request.URL.Path,
			"status", c.Writer.Status(),
			"duration", time.Since(start).Round(time.Millisecond).String(),
			"ip", c.ClientIP(),
		)
	}
}
