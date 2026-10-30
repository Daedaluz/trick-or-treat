# syntax=docker/dockerfile:1

# Frontend and Go compile run on the build host's platform; only the final
# image is per-target (Go cross-compiles with CGO disabled).
FROM --platform=$BUILDPLATFORM node:22-alpine AS web
WORKDIR /src/web
COPY web/package.json web/package-lock.json ./
RUN npm ci --ignore-scripts
COPY web/ ./
RUN npm run build

FROM --platform=$BUILDPLATFORM golang:1.27-alpine AS build
ARG TARGETOS TARGETARCH
WORKDIR /src
COPY go.mod go.sum ./
RUN go mod download
COPY . .
COPY --from=web /src/web/dist ./web/dist
RUN CGO_ENABLED=0 GOOS=$TARGETOS GOARCH=$TARGETARCH go build -trimpath -ldflags="-s -w" -o /out/trick-or-treat ./cmd/trick-or-treat

FROM gcr.io/distroless/static-debian12:nonroot
LABEL org.opencontainers.image.source="https://github.com/Daedaluz/trick-or-treat" \
      org.opencontainers.image.description="A map of doors that actually want trick-or-treaters" \
      org.opencontainers.image.licenses="MIT"
COPY --from=build /out/trick-or-treat /trick-or-treat
EXPOSE 8080
USER nonroot:nonroot
ENTRYPOINT ["/trick-or-treat"]
CMD ["serve"]
