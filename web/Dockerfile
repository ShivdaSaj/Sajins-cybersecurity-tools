# Static catalog site for Sajins Cybersecurity Tools.
# Build context is the repository root, so the current README.md is baked in
# as the initial dataset; sync-readme.sh then refreshes it from GitHub.
FROM nginx:1.27-alpine

RUN apk add --no-cache curl \
 && rm -f /etc/nginx/conf.d/default.conf

COPY web/nginx.conf /etc/nginx/conf.d/site.conf
COPY web/security-headers.conf /etc/nginx/security-headers.conf
COPY web/sync-readme.sh /docker-entrypoint.d/90-sync-readme.sh
COPY web/site/ /usr/share/nginx/html/
COPY README.md /usr/share/nginx/html/data/README.md

RUN chmod +x /docker-entrypoint.d/90-sync-readme.sh

ENV README_URL=https://raw.githubusercontent.com/ShivdaSaj/Sajins-cybersecurity-tools/main/README.md \
    SYNC_INTERVAL=21600

EXPOSE 80
HEALTHCHECK --interval=30s --timeout=5s --retries=3 CMD wget -q --spider http://127.0.0.1/healthz || exit 1
