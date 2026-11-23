#!/bin/bash
# Runs the logic tests with Node if installed, else macOS's built-in JavaScriptCore.
set -u
DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT="$DIR/.."

if command -v node >/dev/null 2>&1; then
  OUT="$(node "$DIR/logic.test.js" 2>&1)"
else
  JSC=/System/Library/Frameworks/JavaScriptCore.framework/Versions/Current/Helpers/jsc
  if [ ! -x "$JSC" ]; then echo "No JavaScript engine found (install Node, or run on macOS)." >&2; exit 2; fi
  OUT="$("$JSC" "$ROOT/js/logic.js" "$DIR/logic.test.js" 2>&1)"
fi
echo "$OUT"
echo "$OUT" | grep -q 'RESULT: PASS'
