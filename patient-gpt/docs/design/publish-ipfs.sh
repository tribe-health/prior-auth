#!/usr/bin/env bash
# Publish PatientGPT (the guide and the prototype) to IPFS under one IPNS name.
#
# The published directory is:
#   index.html                    the guide (patient-chat-storyboard.html)
#   patient-chat-storyboard.html  the same guide, so the prototype's Guide link resolves
#   patient-chat.html             PatientGPT itself
#   patient-chat-og.png           the link-preview image (the prototype's home screen)
#   patient-chat/                 its styles and scripts
#
# Each run adds a new directory and repoints the IPNS name at it, so the
# address below stays the same while the content changes:
#   https://ipfs.prometheusags.ai/ipns/<key id>/
#
# The guide's og:image and twitter:image are written against that stable
# address. Here they are swapped for the image's own immutable /ipfs/ address,
# which changes whenever the image does, so link previews pick up a new image.
#
# Everything published is pinned publicly. Synthetic data only.
#
# Usage:  ./publish-ipfs.sh
# Env:    IPFS_API, IPFS_GATEWAY, IPNS_KEY override the defaults below.
set -euo pipefail

API="${IPFS_API:-https://ipfs.prometheusags.ai/api/v0}"
GATEWAY="${IPFS_GATEWAY:-https://ipfs.prometheusags.ai}"
KEY="${IPNS_KEY:-pa-workbench-chat}"
OG="patient-chat-og.png"
ROOT="$(cd "$(dirname "$0")" && pwd)"

STAGE="$(mktemp -d)"
trap 'rm -rf "$STAGE"' EXIT
SITE="$STAGE/site"
mkdir -p "$SITE/patient-chat"
cp "$ROOT/patient-chat-storyboard.html" "$SITE/index.html"
cp "$ROOT/patient-chat-storyboard.html" "$SITE/patient-chat-storyboard.html"
cp "$ROOT/patient-chat.html" "$SITE/patient-chat.html"
cp "$ROOT/$OG" "$SITE/$OG"
cp "$ROOT"/patient-chat/*.css "$ROOT"/patient-chat/*.js "$SITE/patient-chat/"

# The IPNS key: created on first use, reused after that.
keys="$(curl -sS --fail --max-time 30 -X POST "$API/key/list")"
if ! printf '%s' "$keys" | grep -q "\"Name\":\"$KEY\""; then
  echo "Creating IPNS key $KEY"
  curl -sS --fail --max-time 30 -X POST "$API/key/gen?arg=$KEY&type=ed25519" >/dev/null
  keys="$(curl -sS --fail --max-time 30 -X POST "$API/key/list")"
fi
KEY_ID="$(printf '%s' "$keys" | sed -E "s/.*\"Name\":\"$KEY\",\"Id\":\"([^\"]+)\".*/\1/")"

# Pin the preview image on its own and point the guide's preview tags at it.
og_added="$(curl -sS --fail --max-time 120 -X POST -F "file=@$SITE/$OG;filename=$OG" "$API/add?pin=true&cid-version=1&wrap-with-directory=true")"
OG_CID="$(printf '%s\n' "$og_added" | grep '"Name":""' | sed -E 's/.*"Hash":"([^"]+)".*/\1/')"
if [ -z "$OG_CID" ]; then echo "The node did not return a CID for the preview image." >&2; exit 1; fi
for page in "$SITE/index.html" "$SITE/patient-chat-storyboard.html"; do
  sed "s|$GATEWAY/ipns/$KEY_ID/$OG|$GATEWAY/ipfs/$OG_CID/$OG|g" "$page" > "$page.tmp" && mv "$page.tmp" "$page"
done
echo "Preview image: $GATEWAY/ipfs/$OG_CID/$OG"

# One multipart request: each directory entry comes before the files inside it.
part() { printf 'file=@%s;filename=%s' "$1" "$(printf '%s' "$2" | sed 's|/|%2F|g')"; }
args=(-F "file=;type=application/x-directory;filename=site")
for f in "$SITE"/*.html "$SITE"/*.png; do args+=(-F "$(part "$f" "site/$(basename "$f")")"); done
args+=(-F "file=;type=application/x-directory;filename=site%2Fpatient-chat")
for f in "$SITE"/patient-chat/*; do args+=(-F "$(part "$f" "site/patient-chat/$(basename "$f")")"); done

echo "Adding $(find "$SITE" -type f | wc -l | tr -d ' ') files to $API"
added="$(curl -sS --fail --max-time 180 -X POST "${args[@]}" "$API/add?pin=true&cid-version=1")"
CID="$(printf '%s\n' "$added" | grep '"Name":"site"' | sed -E 's/.*"Hash":"([^"]+)".*/\1/')"
if [ -z "$CID" ]; then echo "The node did not return a directory CID." >&2; exit 1; fi
echo "Directory CID: $CID"

echo "Pointing $KEY at the new directory"
curl -sS --fail --max-time 300 -X POST \
  "$API/name/publish?arg=/ipfs/$CID&key=$KEY&lifetime=8760h&ttl=1m&resolve=false" >/dev/null

echo
echo "Guide (stable):      $GATEWAY/ipns/$KEY_ID/"
echo "Prototype (stable):  $GATEWAY/ipns/$KEY_ID/patient-chat.html"
echo "This version only:   $GATEWAY/ipfs/$CID/"
