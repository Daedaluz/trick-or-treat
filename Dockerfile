# syntax=docker/dockerfile:1

FROM node:22-alpine AS web
WORKDIR /src/web
COPY web/package.json web/package-lock.json ./
RUN npm ci --ignore-scripts
COPY web/ ./
RUN npm run build

FROM golang:1.27-alpine AS build
WORKDIR /src
COPY go.mod go.sum ./
RUN go mod download
COPY . .
COPY --from=web /src/web/dist ./web/dist
RUN CGO_ENABLED=0 go build -trimpath -ldflags="-s -w" -o /out/trick-or-treat ./cmd/trick-or-treat

FROM gcr.io/distroless/static-debian12:nonroot
COPY --from=build /out/trick-or-treat /trick-or-treat
EXPOSE 8080
USER nonroot:nonroot
ENTRYPOINT ["/trick-or-treat"]
CMD ["serve"]
