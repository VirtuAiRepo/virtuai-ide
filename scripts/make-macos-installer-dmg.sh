#!/usr/bin/env bash
# Build a classic drag-and-drop macOS DMG: VirtuAI.app + Applications symlink.
set -euo pipefail

usage() {
	echo "usage: $0 <VirtuAI.app> <output.dmg> [volume-name]" >&2
	exit 2
}

[[ $# -ge 2 ]] || usage
app="$1"
out="$2"
volname="${3:-VirtuAI}"

[[ -d "$app" ]] || { echo "missing app: $app" >&2; exit 1; }

work="$(mktemp -d "${TMPDIR:-/tmp}/virtuai-dmg.XXXXXX")"
stage="$work/stage"
cleanup() { rm -rf "$work"; }
trap cleanup EXIT
mkdir -p "$stage"

cp -R "$app" "$stage/VirtuAI.app"
ln -s /Applications "$stage/Applications"

# RW image lives *outside* the srcfolder (otherwise hdiutil nests the image in itself).
rw="$work/rw.dmg"
hdiutil create -volname "$volname" -srcfolder "$stage" -ov -format UDRW "$rw"
mount="$(hdiutil attach -readwrite -noverify -noautoopen "$rw" | awk 'END{print $NF}')"
[[ -d "$mount" ]] || { echo "failed to mount $rw" >&2; exit 1; }

# Best-effort Finder layout (ignored when AppleScript / Finder unavailable in CI).
osascript <<EOF >/dev/null 2>&1 || true
tell application "Finder"
  tell disk "$volname"
    open
    set current view of container window to icon view
    set toolbar visible of container window to false
    set statusbar visible of container window to false
    set the bounds of container window to {100, 100, 640, 420}
    set opts to the icon view options of container window
    set arrangement of opts to not arranged
    set icon size of opts to 128
    set position of item "VirtuAI.app" of container window to {140, 180}
    set position of item "Applications" of container window to {400, 180}
    update without registering applications
    delay 1
    close
  end tell
end tell
EOF

sync
hdiutil detach "$mount" >/dev/null
rm -f "$out"
hdiutil convert "$rw" -format UDZO -imagekey zlib-level=9 -o "$out" >/dev/null
echo "wrote $out"
