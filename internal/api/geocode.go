package api

import (
	"encoding/json"
	"io"
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
)

type geocodeResult struct {
	Lat         float64 `json:"lat"`
	Lng         float64 `json:"lng"`
	DisplayName string  `json:"display_name"`
}

// geocode proxies an address search to Nominatim so the browser never talks to
// it directly and the server can honour the one-request-per-second policy.
func (h *handler) geocode(c *gin.Context) {
	q := strings.TrimSpace(c.Query("q"))
	if len(q) < 3 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "query too short"})
		return
	}
	params := url.Values{"q": {q}, "format": {"jsonv2"}, "limit": {"5"}}
	if lang := c.GetHeader("Accept-Language"); lang != "" {
		params.Set("accept-language", lang)
	}
	req, err := http.NewRequestWithContext(c.Request.Context(), http.MethodGet,
		"https://nominatim.openstreetmap.org/search?"+params.Encode(), nil)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "bad upstream request"})
		return
	}
	req.Header.Set("User-Agent", h.cfg.UserAgent)

	h.geoMu.Lock()
	if wait := time.Second - time.Since(h.geoLast); wait > 0 {
		time.Sleep(wait)
	}
	h.geoLast = time.Now()
	resp, err := h.geoClient.Do(req)
	h.geoMu.Unlock()
	if err != nil {
		c.JSON(http.StatusBadGateway, gin.H{"error": "geocoder unreachable"})
		return
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		c.JSON(http.StatusBadGateway, gin.H{"error": "geocoder returned " + resp.Status})
		return
	}

	var raw []struct {
		Lat         string `json:"lat"`
		Lon         string `json:"lon"`
		DisplayName string `json:"display_name"`
	}
	if err := json.NewDecoder(io.LimitReader(resp.Body, 1<<20)).Decode(&raw); err != nil {
		c.JSON(http.StatusBadGateway, gin.H{"error": "geocoder returned unexpected data"})
		return
	}
	out := make([]geocodeResult, 0, len(raw))
	for _, item := range raw {
		lat, err1 := strconv.ParseFloat(item.Lat, 64)
		lng, err2 := strconv.ParseFloat(item.Lon, 64)
		if err1 != nil || err2 != nil {
			continue
		}
		out = append(out, geocodeResult{Lat: lat, Lng: lng, DisplayName: item.DisplayName})
	}
	c.JSON(http.StatusOK, out)
}
