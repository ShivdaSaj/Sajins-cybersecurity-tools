#!/bin/sh
# Keeps data/README.md in sync with the GitHub source list.
# Runs once at container start, then every $SYNC_INTERVAL seconds in the background.
DEST=/usr/share/nginx/html/data/README.md
URL="${README_URL:?}"
INTERVAL="${SYNC_INTERVAL:-21600}"

sync_once() {
  tmp="$(mktemp)"
  if curl -fsSL --max-time 30 "$URL" -o "$tmp" \
     && [ "$(wc -c < "$tmp")" -gt 5000 ] && grep -q '^## ' "$tmp"; then
    if ! cmp -s "$tmp" "$DEST"; then
      chmod 644 "$tmp" && mv "$tmp" "$DEST" && echo "[sync-readme] updated from $URL"
      return
    fi
  else
    echo "[sync-readme] fetch failed, keeping current copy" >&2
  fi
  rm -f "$tmp"
}

sync_once
( while sleep "$INTERVAL"; do sync_once; done ) &
