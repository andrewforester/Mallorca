#!/usr/bin/env bash
set -euo pipefail

here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
web="$(cd "$here/../.." && pwd)"
repo="$(cd "$web/.." && pwd)"
java_home="${JAVA_HOME:-/Applications/Android Studio.app/Contents/jbr/Contents/Home}"
build="$here/build"

source_path="$here/src:$repo/Tools/src:$repo/MallorcaCore/src/main/java:$repo/MallorcaEquilator/src:$repo/MallorcaBrains/src/main/java"

rm -rf "$build"
mkdir -p "$build/classes"
"$java_home/bin/javac" --release 8 -nowarn -Xlint:-options -encoding UTF-8 -implicit:class \
  -sourcepath "$source_path" -d "$build/classes" "$here"/src/golden/*.java
"$java_home/bin/java" -cp "$build/classes:$repo/MallorcaEquilator/src" golden.GoldenMain "$web"

fixtures=(
  src/brains/fixtures/decisions.json
  src/brains/fixtures/preflop-strength-java.json
)
cd "$web"
if [ -s "${NVM_DIR:-$HOME/.nvm}/nvm.sh" ]; then
  set +u
  source "${NVM_DIR:-$HOME/.nvm}/nvm.sh"
  nvm use >/dev/null
  set -u
fi
npx --no-install prettier --log-level warn --write "${fixtures[@]}"
