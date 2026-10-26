#!/usr/bin/env bash
# TJ-ARCH-MOB-001 compliant
# Generate every PatientGPT application icon from the brand sources.
#
#   bash scripts/brand-icons/gen-app-icons.sh [repo-root]
#
# Sources (never edited): docs/design/brand/icon.svg (app icon master) and
# docs/design/brand/favicon.svg (favicon cut). Rules from the brand board's
# "Application icons" section:
#   - the tile is full-bleed navy; each platform applies its own corner
#   - Android's adaptive masks cut deepest, so the mark stays in the central 66 %
#   - Windows taskbar at 24 px uses the favicon cut
#   - macOS does not round icons, so its tile is pre-rounded on Apple's grid
#
# Writes masters to assets/brand/app-icons/, then:
#   - Flutter: dart run flutter_launcher_icons   (config in mobile/pubspec.yaml)
#   - Tauri:   cargo tauri icon, then icon.icns, icon.ico and 32x32.png replaced
set -euo pipefail

ROOT="$(cd "${1:-.}" && pwd)"
BRAND="$ROOT/docs/design/brand"
OUT="$ROOT/assets/brand/app-icons"
TAURI_ICONS="$ROOT/desktop/src-tauri/icons"
NAVY="#1F4E79"   # icon.svg's tile fill

for tool in rsvg-convert magick iconutil cargo; do
  command -v "$tool" >/dev/null || { echo "error: $tool is required (rsvg-convert and magick: brew install librsvg imagemagick)" >&2; exit 1; }
done
for src in icon.svg favicon.svg; do
  [ -f "$BRAND/$src" ] || { echo "error: brand source not found: $BRAND/$src" >&2; exit 1; }
done
grep -q "fill=\"$NAVY\"" "$BRAND/icon.svg" || { echo "error: icon.svg tile is no longer $NAVY; update NAVY here and in mobile/pubspec.yaml" >&2; exit 1; }

WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT
mkdir -p "$OUT"

# ── masters ────────────────────────────────────────────────────────────────
# Full-bleed tile, opaque: iOS rejects app icons with an alpha channel.
rsvg-convert -w 1024 -h 1024 "$BRAND/icon.svg" -o "$WORK/tile.png"
magick "$WORK/tile.png" -background "$NAVY" -alpha remove -alpha off "$OUT/tile-1024.png"

# macOS: Apple's 1024 grid puts an 824 px rounded body (185 px corner) inside a
# transparent margin. The corner is drawn on the tile rect itself (185/824 of
# 512 = 115 units); the bubble sits well inside it, so nothing else is clipped.
sed 's|<rect width="512" height="512" fill="'"$NAVY"'"/>|<rect width="512" height="512" rx="115" fill="'"$NAVY"'"/>|' "$BRAND/icon.svg" > "$WORK/tile-rounded.svg"
grep -q 'rx="115"' "$WORK/tile-rounded.svg" || { echo "error: could not round the tile in icon.svg for macOS" >&2; exit 1; }
rsvg-convert -w 824 -h 824 "$WORK/tile-rounded.svg" -o "$WORK/macos-824.png"
magick "$WORK/macos-824.png" -background none -gravity center -extent 1024x1024 "$OUT/macos-1024.png"

# Android adaptive foreground: the mark without its navy tile, scaled into the
# central 66.7 % (72 of 108 dp) so every launcher mask leaves it whole.
sed 's|<rect width="512" height="512" fill="'"$NAVY"'"/>||' "$BRAND/icon.svg" > "$WORK/mark-only.svg"
if grep -q "fill=\"$NAVY\"" "$WORK/mark-only.svg"; then
  echo "error: could not strip the navy tile from icon.svg for the Android foreground" >&2; exit 1
fi
rsvg-convert -w 683 -h 683 "$WORK/mark-only.svg" -o "$WORK/mark-683.png"
magick "$WORK/mark-683.png" -background none -gravity center -extent 1024x1024 "$OUT/android-foreground-1024.png"

# Favicon cut for the small sizes.
for size in 16 24 32; do
  rsvg-convert -w "$size" -h "$size" "$BRAND/favicon.svg" -o "$OUT/favicon-$size.png"
done
echo "wrote masters to ${OUT#"$ROOT"/}"

# ── Flutter (iOS AppIcon set, Android legacy + adaptive) ───────────────────
# flutter_launcher_icons 0.14.4 rewrites every project.pbxproj line containing
# ASSETCATALOG (lib/ios.dart), including the unrelated
# ASSETCATALOG_COMPILER_GENERATE_SWIFT_ASSET_SYMBOL_EXTENSIONS. The icon set
# keeps its name (AppIcon), so the project file needs no change: restore it.
PBXPROJ="$ROOT/mobile/ios/Runner.xcodeproj/project.pbxproj"
cp "$PBXPROJ" "$WORK/project.pbxproj"
(cd "$ROOT/mobile" && dart run flutter_launcher_icons)
cp "$WORK/project.pbxproj" "$PBXPROJ"

# ── Tauri ──────────────────────────────────────────────────────────────────
(cd "$ROOT/desktop" && cargo tauri icon "$OUT/tile-1024.png" -o "$TAURI_ICONS")
# The desktop shell ships no mobile targets; cargo tauri icon writes them anyway.
rm -rf "$TAURI_ICONS/android" "$TAURI_ICONS/ios"

ICONSET="$WORK/icon.iconset"
mkdir -p "$ICONSET"
for size in 16 32 128 256 512; do
  magick "$OUT/macos-1024.png" -resize "${size}x${size}" "$ICONSET/icon_${size}x${size}.png"
  magick "$OUT/macos-1024.png" -resize "$((size * 2))x$((size * 2))" "$ICONSET/icon_${size}x${size}@2x.png"
done
iconutil -c icns "$ICONSET" -o "$TAURI_ICONS/icon.icns"

magick "$OUT/favicon-16.png" "$OUT/favicon-24.png" "$OUT/favicon-32.png" \
  \( "$OUT/tile-1024.png" -resize 48x48 \) \
  \( "$OUT/tile-1024.png" -resize 64x64 \) \
  \( "$OUT/tile-1024.png" -resize 256x256 \) \
  "$TAURI_ICONS/icon.ico"
cp "$OUT/favicon-32.png" "$TAURI_ICONS/32x32.png"
echo "wrote Tauri icons to ${TAURI_ICONS#"$ROOT"/}"
