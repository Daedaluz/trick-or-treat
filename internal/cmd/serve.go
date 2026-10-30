package cmd

import (
	"context"
	"errors"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/spf13/cobra"

	"github.com/Daedaluz/trick-or-treat/internal/api"
	"github.com/Daedaluz/trick-or-treat/internal/config"
	"github.com/Daedaluz/trick-or-treat/internal/metrics"
	"github.com/Daedaluz/trick-or-treat/internal/season"
	"github.com/Daedaluz/trick-or-treat/internal/store"
)

var serveCmd = &cobra.Command{
	Use:   "serve",
	Short: "Run database migrations and start the HTTP server",
	RunE: func(cmd *cobra.Command, args []string) error {
		cfg, err := config.Load()
		if err != nil {
			return err
		}
		log := newLogger(cfg)

		ctx, stop := signal.NotifyContext(cmd.Context(), os.Interrupt, syscall.SIGTERM)
		defer stop()

		st, err := store.Open(ctx, cfg.DatabaseURL)
		if err != nil {
			return err
		}
		defer st.Close()
		if err := st.Migrate(ctx); err != nil {
			return err
		}
		sea, err := newSeason(cfg)
		if err != nil {
			return err
		}
		go sea.RunArchiver(ctx, st, cfg.Season.ArchiveInterval, log)

		var m *metrics.Metrics
		if cfg.MetricsAddr != "" {
			m = metrics.New(st, func() int { return sea.Year(time.Now()) }, log)
			mux := http.NewServeMux()
			mux.Handle("/metrics", m.Handler())
			msrv := &http.Server{Addr: cfg.MetricsAddr, Handler: mux, ReadHeaderTimeout: 5 * time.Second}
			go func() {
				<-ctx.Done()
				_ = msrv.Close()
			}()
			go func() {
				log.Info("metrics listening", "addr", cfg.MetricsAddr)
				if err := msrv.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
					log.Error("metrics server", "err", err)
				}
			}()
		}

		srv := &http.Server{
			Addr:              cfg.Listen,
			Handler:           api.New(st, cfg, sea, m, log),
			ReadHeaderTimeout: 5 * time.Second,
		}
		go func() {
			<-ctx.Done()
			shutdownCtx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
			defer cancel()
			_ = srv.Shutdown(shutdownCtx)
		}()

		log.Info("listening", "addr", cfg.Listen)
		if err := srv.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
			return err
		}
		return nil
	},
}

var migrateCmd = &cobra.Command{
	Use:   "migrate",
	Short: "Run database migrations and exit",
	RunE: func(cmd *cobra.Command, args []string) error {
		cfg, err := config.Load()
		if err != nil {
			return err
		}
		st, err := store.Open(cmd.Context(), cfg.DatabaseURL)
		if err != nil {
			return err
		}
		defer st.Close()
		return st.Migrate(cmd.Context())
	},
}

var archiveCmd = &cobra.Command{
	Use:   "archive",
	Short: "Archive doors whose season is over, then exit",
	RunE: func(cmd *cobra.Command, args []string) error {
		cfg, err := config.Load()
		if err != nil {
			return err
		}
		sea, err := newSeason(cfg)
		if err != nil {
			return err
		}
		st, err := store.Open(cmd.Context(), cfg.DatabaseURL)
		if err != nil {
			return err
		}
		defer st.Close()
		if err := st.Migrate(cmd.Context()); err != nil {
			return err
		}
		moved, err := sea.ArchiveDue(cmd.Context(), st, time.Now(), newLogger(cfg))
		if err != nil {
			return err
		}
		cmd.Printf("archived %d doors\n", moved)
		return nil
	},
}

func newSeason(cfg *config.Config) (*season.Season, error) {
	return season.New(cfg.Season.SignupOpens, cfg.Season.EventDate, cfg.Season.ArchiveAfter, cfg.Season.Timezone)
}

func newLogger(cfg *config.Config) *slog.Logger {
	if cfg.LogJSON {
		return slog.New(slog.NewJSONHandler(os.Stdout, nil))
	}
	return slog.New(slog.NewTextHandler(os.Stdout, nil))
}

func init() {
	rootCmd.AddCommand(serveCmd, migrateCmd, archiveCmd)
}
