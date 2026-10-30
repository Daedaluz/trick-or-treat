# 🎃 trick-or-treat

A map of doors that *actually want* trick-or-treaters.

Households mark their address as open (with hours and an optional note).
Kids and parents open the map, see where they are, and head for the pumpkins
instead of knocking on doors that would rather be left alone.

Each year is a season: sign-up opens on a configurable date (default 1 October),
and on the archive date (default 2 November) the year's doors are moved to an
archive table and sign-up closes until next season. Only the browser that
registered a door can remove it (a secret token is kept in `localStorage`), so
there are no accounts.

## Stack

- **Backend:** Go, [cobra](https://github.com/spf13/cobra) + [viper](https://github.com/spf13/viper) CLI, [gin](https://github.com/gin-gonic/gin) router, PostgreSQL via [pgx](https://github.com/jackc/pgx)
- **Frontend:** React + TypeScript, Vite, Leaflet (OpenStreetMap tiles), embedded into the Go binary
- **Geocoding:** Nominatim, proxied through the server to respect its 1 req/s policy
- **Deploy:** Docker (distroless), Helm chart with a Gateway API `HTTPRoute`

## Run locally

```bash
make dev-db          # Postgres 17 in Docker on :5432 (trick/treat)
make web             # build the frontend into web/dist
make run             # go build + serve on :8080
```

Frontend hot reload: `cd web && npm run dev` (Vite on :5173 proxies `/api` to :8080).

## Configuration

Every flag can be set as an env var with the `TOT_` prefix, or in a file passed with `--config`.

| Flag             | Env                 | Default                                   |
|------------------|---------------------|-------------------------------------------|
| `--listen`       | `TOT_LISTEN`        | `:8080`                                   |
| `--database-url` | `TOT_DATABASE_URL`  | `postgres://trick:treat@localhost:5432/…` |
| `--user-agent`   | `TOT_USER_AGENT`    | `trick-or-treat/0.1 (…)`                  |
| `--log-json`     | `TOT_LOG_JSON`      | `false`                                   |
| `--trust-proxy`  | `TOT_TRUST_PROXY`   | `true`                                    |
| `--admin-token`  | `TOT_ADMIN_TOKEN`   | empty (admin endpoints disabled)          |
| `--season.signup-opens`     | `TOT_SEASON_SIGNUP_OPENS`     | `10-01` (MM-DD)   |
| `--season.event-date`       | `TOT_SEASON_EVENT_DATE`       | `10-31` (MM-DD)   |
| `--season.archive-after`    | `TOT_SEASON_ARCHIVE_AFTER`    | `11-02` (MM-DD)   |
| `--season.timezone`         | `TOT_SEASON_TIMEZONE`         | `Europe/Stockholm` |
| `--season.archive-interval` | `TOT_SEASON_ARCHIVE_INTERVAL` | `1h`              |

Commands: `serve` (migrate, run the hourly archive job and serve), `migrate`
(migrate and exit), `archive` (archive due seasons and exit, handy as a CronJob),
`feedback list [--since YYYY-MM-DD] [--limit N] [--json]` (read visitor feedback).

Example config file (`--config config.yaml`):

```yaml
database-url: postgres://trick:treat@db/trick_or_treat
season:
  signup-opens: "10-01"
  event-date: "10-31"
  archive-after: "11-02"
  timezone: Europe/Stockholm
```

## API

| Method   | Path              | Description                                              |
|----------|-------------------|----------------------------------------------------------|
| `GET`    | `/api/season`     | Phase (`before`/`open`/`after`), dates, last season's door count |
| `GET`    | `/api/doors`      | Doors registered for the current year                    |
| `POST`   | `/api/doors`      | Register a door; `403` while sign-up is closed           |
| `DELETE` | `/api/doors/{id}` | Remove a door; needs the `X-Door-Token` header           |
| `GET`    | `/api/geocode?q=` | Address search (Nominatim proxy)                         |
| `POST`   | `/api/feedback`   | Leave feedback (5 per hour per IP); write-only           |
| `GET`    | `/api/admin/feedback` | Read feedback; needs `Authorization: Bearer <admin token>` and only exists when `--admin-token` is set |
| `GET`    | `/healthz`, `/readyz` | Probes                                               |

## Reading feedback

Feedback is write-only through the public API. Read it either from inside the
cluster with the CLI, which talks straight to the database:

```bash
kubectl -n trick-or-treat exec deploy/trick-or-treat -- /trick-or-treat feedback list
```

or, if you set `admin.token` in the chart, over HTTP:

```bash
curl -H "Authorization: Bearer $TOKEN" https://trick-or-treat.example.com/api/admin/feedback
```

## Deploy to Kubernetes

Build and push the image locally (CI only runs on `v*` tags or manual dispatch to save Actions minutes):

```bash
docker login ghcr.io
make push TAG=0.1.0
```

The repo is private, so the cluster needs a pull secret for `ghcr.io/daedaluz/trick-or-treat`.

```bash
helm upgrade --install trick-or-treat deploy/helm/trick-or-treat \
  --namespace trick-or-treat --create-namespace \
  --set database.existingSecret=tot-db-app --set database.existingSecretKey=uri \
  --set 'httpRoute.hostnames[0]=trick-or-treat.example.com' \
  --set 'httpRoute.parentRefs[0].name=my-gateway' \
  --set 'httpRoute.parentRefs[0].namespace=gateway-system' \
  --set 'imagePullSecrets[0].name=ghcr-pull'
```

See [`deploy/helm/trick-or-treat/values.yaml`](deploy/helm/trick-or-treat/values.yaml) for all options.
