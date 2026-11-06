#!/usr/bin/env bash
# Runs the Java unit tests of the plain-Java parts of android-native/ on a PC (no Android SDK needed).
# org.json (the same API Android has) is fetched once from github.com/stleary/JSON-java.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
WORK="${TMPDIR:-/tmp}/chibarti-java-tests"
JSON="${JSON_JAVA_DIR:-$WORK/json-java}"
mkdir -p "$WORK/out"
if [ ! -d "$JSON/src/main/java/org/json" ]; then
  git clone -q --depth 1 https://github.com/stleary/JSON-java.git "$JSON"
fi
PURE="Crypto SecureLink Handshake Proto Pairing QrPayload OutgoingJob IncomingJob RateControl"
SRC=()
for c in $PURE; do SRC+=("$ROOT/android-native/$c.java"); done
javac -encoding UTF-8 -nowarn -d "$WORK/out" $(find "$JSON/src/main/java/org/json" -name '*.java') "${SRC[@]}" "$ROOT/tests/java/ChibartiTests.java" 2>&1 | grep -v '^Note:' || true
java -cp "$WORK/out" com.luachsport.chibarti.ChibartiTests
