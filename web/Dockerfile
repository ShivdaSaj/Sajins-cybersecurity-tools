# Self-contained image (alternative to docker-compose.yml, which pulls the code at start-up).
# Build context is the repository root:  docker build -f web/Dockerfile -t cybersecuritytools .
FROM node:22-alpine

ENV NODE_ENV=production PORT=8080 DATA_DIR=/data
WORKDIR /app
COPY README.md /app/README.md
COPY web/server /app/web/server
COPY web/site /app/web/site
RUN mkdir -p /data && chown -R node:node /data

USER node
VOLUME ["/data"]
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s --retries=3 CMD wget -q --spider http://127.0.0.1:8080/healthz || exit 1
CMD ["node", "/app/web/server/server.mjs"]
