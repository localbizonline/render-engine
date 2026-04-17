#!/usr/bin/env bash
#
# scripts/smoke-r2-write.sh — end-to-end smoke for POST /api/render.
#
# Why this exists: /health only confirms the process is up. During the
# 2026-04-17 rollout we hit `500 {"success":false,"error":"Access Denied"}`
# because the Railway R2 credentials were still scoped to the old bucket.
# /health reported 200 throughout. This script closes that gap.
#
# What it does:
#   1. Resolves target URL + API key from env or flags.
#   2. POSTs a minimal 2-frame MP4 render to /api/render with unique
#      _smoke/YYYY-MM-DDTHH-MM-SS-<nonce>.mp4 + -poster.jpg keys.
#   3. Asserts the response is success=true and the returned r2Key /
#      posterR2Key match what was requested. A 200 here means the
#      render-engine successfully called S3 PutObject — this IS the R2
#      write verification. A misconfigured bucket/token fails as a 500
#      "Access Denied" here.
#   4. Optionally (--verify-public or R2_PUBLIC_URL env) HEADs the public
#      R2 URL for each key as a secondary check. Skip this unless you
#      know the bucket actually has a public URL (social-posting-media
#      doesn't — it's served through the Worker, not public R2).
#
# Usage:
#   export RENDER_SERVICE_URL=https://render-engine-production.up.railway.app
#   export RENDER_SERVICE_API_KEY=...
#   ./scripts/smoke-r2-write.sh
#
#   # or with flags:
#   ./scripts/smoke-r2-write.sh --url https://... --key ... [--verify-public https://...]
#
# Exit codes:
#   0 — pass (render succeeded + returned keys match)
#   1 — user error (missing URL/key, jq/curl not installed)
#   2 — render service returned non-200 (includes R2 Access Denied -> 500)
#   3 — render service returned 200 but response shape invalid or success=false
#   4 — optional HEAD check on the public R2 URL failed

set -euo pipefail

# ── deps ──────────────────────────────────────────────────────────────

for cmd in curl jq; do
  if ! command -v "$cmd" >/dev/null 2>&1; then
    echo "error: '$cmd' is required but not installed" >&2
    exit 1
  fi
done

# ── args + env ────────────────────────────────────────────────────────

RENDER_URL="${RENDER_SERVICE_URL:-}"
API_KEY="${RENDER_SERVICE_API_KEY:-}"
PUBLIC_URL="${R2_PUBLIC_URL:-}"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --url) RENDER_URL="$2"; shift 2 ;;
    --key) API_KEY="$2"; shift 2 ;;
    --verify-public|--public-url) PUBLIC_URL="$2"; shift 2 ;;
    -h|--help)
      sed -n 's/^# \{0,1\}//p' "$0" | sed -n '/^scripts/,/^Exit codes/p'
      exit 0
      ;;
    *) echo "error: unknown arg '$1' (try --help)" >&2; exit 1 ;;
  esac
done

if [[ -z "$RENDER_URL" ]]; then
  echo "error: RENDER_SERVICE_URL (or --url) is required" >&2
  exit 1
fi
if [[ -z "$API_KEY" ]]; then
  echo "error: RENDER_SERVICE_API_KEY (or --key) is required" >&2
  exit 1
fi

RENDER_URL="${RENDER_URL%/}"  # strip trailing slash

# ── keys ──────────────────────────────────────────────────────────────

NOW="$(date -u +%Y-%m-%dT%H-%M-%S)"
NONCE="$(LC_ALL=C tr -dc 'a-z0-9' < /dev/urandom | head -c 8 || true)"
VIDEO_KEY="_smoke/${NOW}-${NONCE}.mp4"
POSTER_KEY="_smoke/${NOW}-${NONCE}-poster.jpg"

# ── payload ───────────────────────────────────────────────────────────

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
FIXTURE="$SCRIPT_DIR/fixtures/smoke-render-payload.json"

if [[ ! -f "$FIXTURE" ]]; then
  echo "error: fixture not found: $FIXTURE" >&2
  exit 1
fi

PAYLOAD="$(jq \
  --arg jobId "smoke-${NOW}-${NONCE}" \
  --arg videoKey "$VIDEO_KEY" \
  --arg posterKey "$POSTER_KEY" \
  '. + {renderOptions: {jobId: $jobId, outputVideoKey: $videoKey, outputPosterKey: $posterKey}}' \
  "$FIXTURE")"

# ── POST ──────────────────────────────────────────────────────────────

echo "POST ${RENDER_URL}/api/render"
echo "  video key : $VIDEO_KEY"
echo "  poster key: $POSTER_KEY"

TMP_BODY="$(mktemp)"
trap 'rm -f "$TMP_BODY"' EXIT

HTTP_CODE="$(curl -sS -o "$TMP_BODY" -w '%{http_code}' \
  -X POST "${RENDER_URL}/api/render" \
  -H 'Content-Type: application/json' \
  -H "x-api-key: ${API_KEY}" \
  --data "$PAYLOAD")"

if [[ "$HTTP_CODE" != "200" ]]; then
  echo "FAIL: render service returned HTTP $HTTP_CODE" >&2
  echo "--- response body ---" >&2
  cat "$TMP_BODY" >&2
  echo >&2
  exit 2
fi

BODY="$(cat "$TMP_BODY")"

SUCCESS="$(echo "$BODY" | jq -r '.success // false')"
GOT_VIDEO_KEY="$(echo "$BODY" | jq -r '.r2Key // empty')"
GOT_POSTER_KEY="$(echo "$BODY" | jq -r '.posterR2Key // empty')"
RENDER_MS="$(echo "$BODY" | jq -r '.meta.renderTimeMs // empty')"

if [[ "$SUCCESS" != "true" ]]; then
  echo "FAIL: response success=$SUCCESS" >&2
  echo "$BODY" | jq . >&2 || echo "$BODY" >&2
  exit 3
fi

if [[ "$GOT_VIDEO_KEY" != "$VIDEO_KEY" ]] || [[ "$GOT_POSTER_KEY" != "$POSTER_KEY" ]]; then
  echo "FAIL: returned keys do not match requested keys" >&2
  echo "  requested video : $VIDEO_KEY" >&2
  echo "  returned  video : $GOT_VIDEO_KEY" >&2
  echo "  requested poster: $POSTER_KEY" >&2
  echo "  returned  poster: $GOT_POSTER_KEY" >&2
  exit 3
fi

echo "PASS: render returned success=true, keys match, renderTimeMs=${RENDER_MS}"

# ── HEAD the public URL if given ──────────────────────────────────────

if [[ -n "$PUBLIC_URL" ]]; then
  PUBLIC_URL="${PUBLIC_URL%/}"
  echo "HEAD check: ${PUBLIC_URL}/${VIDEO_KEY}"
  VIDEO_CODE="$(curl -sS -o /dev/null -w '%{http_code}' -I "${PUBLIC_URL}/${VIDEO_KEY}")"
  POSTER_CODE="$(curl -sS -o /dev/null -w '%{http_code}' -I "${PUBLIC_URL}/${POSTER_KEY}")"
  if [[ "$VIDEO_CODE" != "200" ]] || [[ "$POSTER_CODE" != "200" ]]; then
    echo "FAIL: R2 public HEAD check failed" >&2
    echo "  video  $VIDEO_CODE" >&2
    echo "  poster $POSTER_CODE" >&2
    exit 4
  fi
  echo "PASS: both R2 objects are publicly reachable"
fi

echo "ALL OK"
