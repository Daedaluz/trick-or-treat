IMAGE ?= ghcr.io/daedaluz/trick-or-treat
TAG   ?= dev

.PHONY: all web build run dev-db test lint image push helm-lint helm-template

all: web build

web:
	cd web && npm ci --ignore-scripts && npm run build

build:
	CGO_ENABLED=0 go build -o bin/trick-or-treat ./cmd/trick-or-treat

run: build
	./bin/trick-or-treat serve

dev-db:
	docker run -d --name tot-pg -e POSTGRES_USER=trick -e POSTGRES_PASSWORD=treat \
		-e POSTGRES_DB=trick_or_treat -p 5432:5432 postgres:17-alpine

test:
	go test ./cmd/... ./internal/... ./web/...

lint:
	go vet ./cmd/... ./internal/... ./web/...
	cd web && npm run typecheck

image:
	docker build -t $(IMAGE):$(TAG) .

# Needs `docker login ghcr.io` with a token that has write:packages.
push: image
	docker push $(IMAGE):$(TAG)

helm-lint:
	helm lint deploy/helm/trick-or-treat

helm-template:
	helm template trick-or-treat deploy/helm/trick-or-treat
