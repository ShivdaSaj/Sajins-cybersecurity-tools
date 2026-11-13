# Website: cybersecuritytools.sajinshivdas.online

A static, searchable front-end for the curated list in the repository's root `README.md`.

- `site/index.html` is a single page with inline CSS/JS and no framework. It parses `data/README.md` in the browser, so the page structure always follows the source list.
- `sync-readme.sh` re-downloads the README from GitHub at container start and every `SYNC_INTERVAL` seconds (default 6h). New tools pushed to `main` show up without a redeploy.
- `nginx.conf` serves the site with gzip, short caching and security headers (CSP, nosniff, frame-deny).
- `docker-compose.yml` runs stock `nginx:alpine`. At start-up it downloads `web/` from GitHub (branch `SITE_REF`, default `main`), so **Restart** in Docker Manager also deploys site changes. Traefik routes it (`websecure` entrypoint, `letsencrypt` resolver).
- `Dockerfile` is an alternative self-contained image if you prefer building locally.

## Deploy / update

On the VPS, use Hostinger Docker Manager with project `cybersecuritytools` and paste `docker-compose.yml`, or run:

```bash
docker compose -p cybersecuritytools -f web/docker-compose.yml up -d
```

Set the `SITE_REF` environment variable to serve the site code from a branch other than `main`.

## Local preview

```bash
docker build -f web/Dockerfile -t cybersecuritytools . && docker run --rm -p 8080:80 cybersecuritytools
```
