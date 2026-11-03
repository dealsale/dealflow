#!/usr/bin/env bash
# Arma DealFlowSoporte-Setup.exe desde Linux (sin Wine):
#   1. electron-builder empaqueta la app de Windows (dist/win-unpacked) y le pone el ícono.
#   2. makensis (el de Linux que trae electron-builder) arma el instalador con instalador.nsi.
set -euo pipefail
cd "$(dirname "$0")/.."
VERSION=$(node -p "require('./package.json').version")
rm -rf dist
npx electron-builder --win dir --x64 --publish never
NSIS="${NSIS_DIR:-$HOME/.cache/electron-builder/nsis/nsis-3.0.4.1}"
if [ ! -x "$NSIS/linux/makensis" ]; then
  echo "No está makensis en $NSIS: corre una vez «npx electron-builder --win nsis» para que se descargue." >&2
  exit 1
fi
cd compilar
NSISDIR="$NSIS" "$NSIS/linux/makensis" -V2 -DVERSION="$VERSION" instalador.nsi
ls -la ../dist/DealFlowSoporte-Setup.exe
