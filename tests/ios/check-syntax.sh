#!/usr/bin/env bash
# Compiles src/ios/NfcPlugin.m with clang -fsyntax-only against the iPhoneOS SDK and the
# cordova-ios CordovaLib headers (macOS + Xcode only). CoreNFC cannot run in the simulator, so this
# plus tests/unit/ios-source.test.js is what CI can check; device behaviour needs an iPhone.
#   CORDOVA_LIB=/path/to/cordova-ios/CordovaLib tests/ios/check-syntax.sh
#   NFC_IOS_DIR=/path/to/older/src/ios tests/ios/check-syntax.sh      # check another copy
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$HERE/../.." && pwd)"
SRC="${NFC_IOS_DIR:-$ROOT/src/ios}"
CL="${CORDOVA_LIB:-}"
if [ -z "$CL" ]; then
  CACHE="$HERE/.cache"; mkdir -p "$CACHE"
  if [ ! -d "$CACHE/package/CordovaLib" ]; then
    (cd "$CACHE" && npm pack cordova-ios@8 --silent >/dev/null && tar -xzf cordova-ios-*.tgz)
  fi
  CL="$CACHE/package/CordovaLib"
fi
SDK="$(xcrun --sdk iphoneos --show-sdk-path)"
xcrun --sdk iphoneos clang -fsyntax-only -fobjc-arc -fmodules -target arm64-apple-ios13.0 -isysroot "$SDK" \
  -I "$CL/include" -I "$SRC" -Wall -Wextra -Wno-unused-parameter -Wno-#warnings -Werror \
  "$SRC/NfcPlugin.m"
echo "NfcPlugin.m OK (iPhoneOS SDK $(xcrun --sdk iphoneos --show-sdk-version))"
