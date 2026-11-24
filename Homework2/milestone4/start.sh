#!/usr/bin/env bash
set -euo pipefail
cd -- "$(dirname -- "$0")"
if [[ ! -f node_modules/rxjs/dist/bundles/rxjs.umd.min.js ]]; then
  echo 'Run npm ci before starting the website.'
  exit 1
fi
mkdir -p build
if command -v javac >/dev/null; then
  javac --release 17 --add-modules jdk.httpserver -d build server/*.java
else
  java -m jdk.compiler/com.sun.tools.javac.Main -source 17 -target 17 --add-modules jdk.httpserver -d build server/*.java
fi
exec java --add-modules jdk.httpserver -cp build Server "${1:-9000}"
