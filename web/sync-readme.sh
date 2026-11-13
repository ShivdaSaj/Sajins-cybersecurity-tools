#!/bin/sh
# Keeps data/README.md in sync with the GitHub source list.
# Runs once at container start, then every $SYNC_INTERVAL seconds in the background.
DEST=/usr/share/nginx/html/data/README.md
URL="${README_URL:-https://raw.githubusercontent.com/ShivdaSaj/Sajins-cybersecurity-tools/main/README.md}"
INTERVAL="${SYNC_INTERVAL:-21600}"
mkdir -p "$(dirname "$DEST")"

fetch() {
  if command -v curl >/dev/null 2>&1; then curl -fsSL --max-time 30 "$1" -o "$2"
  else wget -q -T 30 -O "$2" "$1"; fi
}

sync_once() {
  tmp="$DEST.tmp"
  if fetch "$URL" "$tmp" && [ "$(wc -c < "$tmp")" -gt 5000 ] && grep -q '^## ' "$tmp"; then
    if ! cmp -s "$tmp" "$DEST"; then
      chmod 644 "$tmp" && mv "$tmp" "$DEST" && echo "[sync-readme] updated from $URL"
    fi
  else
    echo "[sync-readme] fetch failed, keeping current copy" >&2
  fi
}

sync_once
( while sleep "$INTERVAL"; do sync_once; done ) &
