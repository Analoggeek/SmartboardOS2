#!/usr/bin/env bash
set -euo pipefail
pkg=com.analoggeek.smartboardos.qa
adb shell cmd connectivity airplane-mode enable
adb shell svc wifi disable
adb shell svc data disable
[[ $(adb shell settings get global airplane_mode_on | tr -d '\r') == 1 ]]
apks=(dist/*-android-QA.apk)
adb install "${apks[0]}"
adb shell am start -W -n "$pkg/com.analoggeek.smartboardos.MainActivity"
pid=$(adb shell pidof -s "$pkg" | tr -d '\r')
[[ $pid =~ ^[0-9]+$ ]]
adb forward tcp:9222 "localabstract:webview_devtools_remote_$pid"
trap 'adb forward --remove tcp:9222' EXIT
node scripts/smoke-android.cjs
