// Package web embeds the built React frontend (web/dist) and serves it as a
// single-page app: unknown paths fall back to index.html.
package web

import (
	"embed"
	"io/fs"
	"net/http"
	"path"
	"strings"
)

//go:embed all:dist
var dist embed.FS

// Handler serves the SPA. If the frontend has not been built (no index.html)
// it returns a short explanation instead of a 404.
func Handler() http.Handler {
	sub, err := fs.Sub(dist, "dist")
	if err != nil {
		panic(err)
	}
	fileServer := http.FileServer(http.FS(sub))

	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		p := strings.TrimPrefix(path.Clean(r.URL.Path), "/")
		if p == "" {
			p = "index.html"
		}
		if f, err := sub.Open(p); err == nil {
			f.Close()
			switch {
			case strings.HasPrefix(p, "assets/"):
				w.Header().Set("Cache-Control", "public, max-age=31536000, immutable")
			case p == "sw.js" || p == "manifest.webmanifest" || p == "index.html":
				w.Header().Set("Cache-Control", "no-cache")
			}
			if p == "manifest.webmanifest" {
				w.Header().Set("Content-Type", "application/manifest+json")
			}
			fileServer.ServeHTTP(w, r)
			return
		}
		// SPA fallback.
		if f, err := sub.Open("index.html"); err == nil {
			f.Close()
			r.URL.Path = "/"
			fileServer.ServeHTTP(w, r)
			return
		}
		http.Error(w, "frontend not built: run `npm run build` in web/ and rebuild the binary", http.StatusServiceUnavailable)
	})
}
