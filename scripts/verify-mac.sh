#!/usr/bin/env bash
set -euo pipefail
image="dist/SmartBoardOS-$1-mac-$2.dmg"
mount=$(mktemp -d)
trap 'hdiutil detach "$mount" -force >/dev/null 2>&1 || true; rmdir "$mount"' EXIT
hdiutil verify "$image"
codesign --verify --verbose=2 "$image"
xcrun notarytool submit "$image" --key "$APPLE_API_KEY" --key-id "$APPLE_API_KEY_ID" --issuer "$APPLE_API_ISSUER" --wait
xcrun stapler staple "$image"
xcrun stapler validate "$image"
hdiutil attach -readonly -nobrowse -mountpoint "$mount" "$image"
app="$mount/SmartBoardOS.app"
codesign --verify --deep --strict --verbose=2 "$app"
team=$(codesign --display --verbose=4 "$app" 2>&1 | sed -n 's/^TeamIdentifier=//p')
[[ "$team" == "$SBOS_MAC_TEAM_ID" ]]
spctl --assess --type execute --verbose=4 "$app"
xcrun stapler validate "$app"
