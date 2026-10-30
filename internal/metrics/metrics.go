// Package metrics exposes Prometheus metrics: HTTP traffic plus a few
// business gauges read from the database at scrape time.
package metrics

import (
	"context"
	"log/slog"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/prometheus/client_golang/prometheus"
	"github.com/prometheus/client_golang/prometheus/collectors"
	"github.com/prometheus/client_golang/prometheus/promhttp"
)

// Stats is what the business collector needs from the store.
type Stats interface {
	CountDoors(ctx context.Context, year int) (int, error)
	CountFeedback(ctx context.Context) (int, error)
}

// Metrics holds the registry and the instruments.
type Metrics struct {
	reg       *prometheus.Registry
	requests  *prometheus.CounterVec
	duration  *prometheus.HistogramVec
	inflight  prometheus.Gauge
	pageLoads prometheus.Counter
	doorsReg  prometheus.Counter
	feedback  prometheus.Counter
}

// New builds a registry with Go/process collectors and the app's metrics.
func New(stats Stats, year func() int, log *slog.Logger) *Metrics {
	reg := prometheus.NewRegistry()
	reg.MustRegister(collectors.NewGoCollector(), collectors.NewProcessCollector(collectors.ProcessCollectorOpts{}))

	m := &Metrics{
		reg: reg,
		requests: prometheus.NewCounterVec(prometheus.CounterOpts{
			Name: "tot_http_requests_total",
			Help: "HTTP requests by method, route template and status code.",
		}, []string{"method", "route", "status"}),
		duration: prometheus.NewHistogramVec(prometheus.HistogramOpts{
			Name:    "tot_http_request_duration_seconds",
			Help:    "HTTP request latency by route template.",
			Buckets: []float64{.005, .01, .025, .05, .1, .25, .5, 1, 2.5, 5},
		}, []string{"route"}),
		inflight: prometheus.NewGauge(prometheus.GaugeOpts{
			Name: "tot_http_requests_in_flight",
			Help: "Requests currently being served.",
		}),
		pageLoads: prometheus.NewCounter(prometheus.CounterOpts{
			Name: "tot_page_loads_total",
			Help: "Times the app shell (index.html) was served, roughly one per visit.",
		}),
		doorsReg: prometheus.NewCounter(prometheus.CounterOpts{
			Name: "tot_doors_registered_total",
			Help: "Doors registered since the process started.",
		}),
		feedback: prometheus.NewCounter(prometheus.CounterOpts{
			Name: "tot_feedback_submitted_total",
			Help: "Feedback messages submitted since the process started.",
		}),
	}
	reg.MustRegister(m.requests, m.duration, m.inflight, m.pageLoads, m.doorsReg, m.feedback)
	reg.MustRegister(&dbCollector{stats: stats, year: year, log: log})
	return m
}

// Handler serves the /metrics endpoint.
func (m *Metrics) Handler() http.Handler {
	return promhttp.HandlerFor(m.reg, promhttp.HandlerOpts{})
}

// Middleware records every request. Routes that gin did not match (static
// files, SPA fallback) are collapsed to keep label cardinality low.
func (m *Metrics) Middleware() gin.HandlerFunc {
	return func(c *gin.Context) {
		start := time.Now()
		m.inflight.Inc()
		c.Next()
		m.inflight.Dec()

		route := c.FullPath()
		if route == "" {
			switch {
			case strings.HasPrefix(c.Request.URL.Path, "/assets/"), strings.HasPrefix(c.Request.URL.Path, "/icons/"):
				route = "static"
			case strings.HasPrefix(c.Writer.Header().Get("Content-Type"), "text/html"):
				route = "spa"
				if c.Request.Method == http.MethodGet && c.Writer.Status() == http.StatusOK {
					m.pageLoads.Inc()
				}
			default:
				route = "other"
			}
		}
		m.requests.WithLabelValues(c.Request.Method, route, strconv.Itoa(c.Writer.Status())).Inc()
		m.duration.WithLabelValues(route).Observe(time.Since(start).Seconds())
	}
}

// DoorRegistered and FeedbackSubmitted are called by the API handlers.
func (m *Metrics) DoorRegistered()    { m.doorsReg.Inc() }
func (m *Metrics) FeedbackSubmitted() { m.feedback.Inc() }

// dbCollector reads live counts from the database on every scrape.
type dbCollector struct {
	stats Stats
	year  func() int
	log   *slog.Logger
}

var (
	descDoors    = prometheus.NewDesc("tot_doors_live", "Doors currently registered for this season.", nil, nil)
	descFeedback = prometheus.NewDesc("tot_feedback_messages", "Feedback messages stored.", nil, nil)
)

func (d *dbCollector) Describe(ch chan<- *prometheus.Desc) {
	ch <- descDoors
	ch <- descFeedback
}

func (d *dbCollector) Collect(ch chan<- prometheus.Metric) {
	ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
	defer cancel()
	if n, err := d.stats.CountDoors(ctx, d.year()); err == nil {
		ch <- prometheus.MustNewConstMetric(descDoors, prometheus.GaugeValue, float64(n))
	} else {
		d.log.Warn("metrics: count doors", "err", err)
	}
	if n, err := d.stats.CountFeedback(ctx); err == nil {
		ch <- prometheus.MustNewConstMetric(descFeedback, prometheus.GaugeValue, float64(n))
	} else {
		d.log.Warn("metrics: count feedback", "err", err)
	}
}
