#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
sdk="${ANDROID_HOME:-${ANDROID_SDK_ROOT:?Set ANDROID_HOME to the Android SDK directory}}"
tools="$sdk/build-tools/35.0.0"
android="$sdk/platforms/android-35/android.jar"
version="${SBOS_VERSION:-1.4.0}"
code="${SBOS_VERSION_CODE:-1}"
[[ $version =~ ^[0-9]+\.[0-9]+\.[0-9]+$ && $code =~ ^[1-9][0-9]*$ ]]
mode=${1:-}
[[ $mode == release || $mode == qa ]] || { echo 'Usage: build-android.sh release|qa' >&2; exit 1; }
work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT
mkdir -p "$work"/{assets/web,res/drawable-xxxhdpi,classes,dex} dist
cp -R index.html manifest.webmanifest css js assets vendor "$work/assets/web/"
cp assets/icons/icon-192.png "$work/res/drawable-xxxhdpi/app_icon.png"
"$tools/aapt2" compile --dir "$work/res" -o "$work/resources.zip"
manifest=mobile/android/AndroidManifest.xml
rename=()
if [[ $mode == qa ]]; then
  # QA builds use a different package identity and are never published as the production app.
  rename=(--rename-manifest-package com.analoggeek.smartboardos.qa)
  sed 's/android:label="SmartBoardOS"/android:label="SmartBoardOS QA"/' "$manifest" > "$work/AndroidManifest.xml"
  manifest="$work/AndroidManifest.xml"
fi
"$tools/aapt2" link -o "$work/base.apk" -I "$android" --manifest "$manifest" \
  -A "$work/assets" --version-code "$code" --version-name "$version" "${rename[@]}" "$work/resources.zip"
javac --release 8 -classpath "$android" -d "$work/classes" mobile/android/MainActivity.java
jar cf "$work/classes.jar" -C "$work/classes" .
"$tools/d8" --release --min-api 26 --lib "$android" --output "$work/dex" "$work/classes.jar"
jar uf "$work/base.apk" -C "$work/dex" classes.dex
"$tools/zipalign" -P 16 -f 4 "$work/base.apk" "$work/aligned.apk"
if [[ $mode == release ]]; then
  : "${SBOS_ANDROID_KEYSTORE:?Missing Android signing keystore}"
  : "${SBOS_ANDROID_KEY_ALIAS:?Missing Android signing alias}"
  : "${SBOS_ANDROID_STORE_PASSWORD:?Missing Android keystore password}"
  : "${SBOS_ANDROID_KEY_PASSWORD:?Missing Android signing key password}"
  : "${SBOS_ANDROID_CERT_SHA256:?Missing Android signer SHA-256 fingerprint}"
  [[ $SBOS_ANDROID_CERT_SHA256 =~ ^[A-Fa-f0-9]{64}$ ]]
  out="dist/SmartBoardOS-$version-android-universal.apk"
  name=com.analoggeek.smartboardos
else
  export SBOS_ANDROID_KEYSTORE="$work/qa.p12" SBOS_ANDROID_KEY_ALIAS=qa
  SBOS_ANDROID_STORE_PASSWORD=$(openssl rand -hex 24); export SBOS_ANDROID_STORE_PASSWORD
  export SBOS_ANDROID_KEY_PASSWORD="$SBOS_ANDROID_STORE_PASSWORD"
  keytool -genkeypair -storetype PKCS12 -keystore "$SBOS_ANDROID_KEYSTORE" -alias qa \
    -storepass:env SBOS_ANDROID_STORE_PASSWORD -dname 'CN=SmartBoardOS CI testing only' -keyalg RSA -keysize 2048 -validity 365 -noprompt
  out="dist/SmartBoardOS-$version-android-QA.apk"
  name=com.analoggeek.smartboardos.qa
fi
signed="$work/signed.apk"
"$tools/apksigner" sign --ks "$SBOS_ANDROID_KEYSTORE" --ks-key-alias "$SBOS_ANDROID_KEY_ALIAS" \
  --ks-pass env:SBOS_ANDROID_STORE_PASSWORD --key-pass env:SBOS_ANDROID_KEY_PASSWORD --out "$signed" "$work/aligned.apk"
"$tools/zipalign" -c -P 16 4 "$signed"
verified=$("$tools/apksigner" verify --verbose --print-certs "$signed")
printf '%s\n' "$verified"
grep -q 'Verified using v2 scheme.*: true' <<< "$verified"
if [[ $mode == release ]]; then
  actual=$(sed -n 's/^Signer #1 certificate SHA-256 digest: //p' <<< "$verified")
  [[ ${actual,,} == "${SBOS_ANDROID_CERT_SHA256,,}" ]] || { echo 'APK signer did not match the release fingerprint' >&2; exit 1; }
fi
badging=$("$tools/aapt" dump badging "$signed")
grep -Fq "package: name='$name' versionCode='$code' versionName='$version'" <<< "$badging"
grep -Fq "launchable-activity: name='com.analoggeek.smartboardos.MainActivity'" <<< "$badging"
if grep -Fq 'android.permission.INTERNET' <<< "$badging"; then echo 'Android bundle unexpectedly has internet permission' >&2; exit 1; fi
# Confirm the complete renderer was actually embedded, not a shortcut to a website.
for file in index.html js/main.js js/pptx-import.js js/map-data.js vendor/pdf.worker.min.js; do
  unzip -p "$signed" "assets/web/$file" | cmp "$file" -
done
mv "$signed" "$out"
