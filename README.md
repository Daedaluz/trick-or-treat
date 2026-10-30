# 🎃 trick-or-treat

A map of doors that *actually want* trick-or-treaters.

Households mark their address as open (with hours and an optional note).
Kids and parents open the map, see where they are, and head for the pumpkins
instead of knocking on doors that would rather be left alone.

Doors reset every year. Only the browser that registered a door can remove it
(a secret token is kept in `localStorage`), so there are no accounts.

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

Commands: `serve` (migrate + serve), `migrate` (migrate and exit).

## API

| Method   | Path              | Description                                              |
|----------|-------------------|----------------------------------------------------------|
| `GET`    | `/api/doors`      | Doors registered for the current year                    |
| `POST`   | `/api/doors`      | Register a door; returns the door and a one-time token   |
| `DELETE` | `/api/doors/{id}` | Remove a door; needs the `X-Door-Token` header           |
| `GET`    | `/api/geocode?q=` | Address search (Nominatim proxy)                         |
| `GET`    | `/healthz`, `/readyz` | Probes                                               |

## Deploy to Kubernetes

Images are published to `ghcr.io/daedaluz/trick-or-treat` by CI on every push to `main`.
The repo is private, so the cluster needs a pull secret.

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
