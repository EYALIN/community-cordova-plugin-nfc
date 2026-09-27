#!/usr/bin/env bash
# Compiles NfcPlugin.java + Util.java against the JVM fakes in tests/android/fakes and runs
# NfcPluginTest. No Android SDK or device needed.
#   tests/android/run.sh                 # plugin source from this checkout
#   PLUGIN_SRC=/path/to/src/android tests/android/run.sh   # e.g. an older checkout, to show a BEFORE
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$HERE/../.." && pwd)"
SRC="${PLUGIN_SRC:-$ROOT/src/android}"
CACHE="$HERE/.cache"; OUT="$CACHE/classes"
mkdir -p "$CACHE"
JSON_JAR="${ORG_JSON_JAR:-}"
if [ -z "$JSON_JAR" ]; then
  JSON_JAR="$(find "$HOME/.gradle/caches/modules-2/files-2.1/org.json" -name 'json-*.jar' 2>/dev/null | grep -v sources | head -1 || true)"
fi
if [ -z "$JSON_JAR" ]; then
  JSON_JAR="$CACHE/json-20240303.jar"
  [ -f "$JSON_JAR" ] || curl -sSfL -o "$JSON_JAR" https://repo1.maven.org/maven2/org/json/json/20240303/json-20240303.jar
fi
rm -rf "$OUT"; mkdir -p "$OUT"
javac -nowarn -encoding UTF-8 -cp "$JSON_JAR" -d "$OUT" \
  $(find "$HERE/fakes" -name '*.java') \
  "$SRC"/src/com/chariotsolutions/nfc/plugin/*.java \
  "$HERE"/src/com/chariotsolutions/nfc/plugin/NfcPluginTest.java
java -cp "$OUT:$JSON_JAR" com.chariotsolutions.nfc.plugin.NfcPluginTest
