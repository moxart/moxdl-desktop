#!/bin/sh
# Build mox into one executable that the installers carry, so the app needs no Python.
#
#   scripts/build-engine.sh [path/to/mox.py]      (default: ../moxdl/mox.py)
#
# Tauri wants the file named for the platform it runs on, as in
# src-tauri/binaries/mox-engine-x86_64-unknown-linux-gnu, and puts it next to the app.
set -eu

cd "$(dirname "$0")/.."
source="${1:-../moxdl/mox.py}"
[ -f "$source" ] || { echo "no mox.py at $source; pass its path" >&2; exit 1; }
target=$(rustc -vV | sed -n 's/^host: //p')
extension=""
case "$target" in *windows*) extension=".exe" ;; esac

# PyInstaller in a venv of its own, kept out of the system Python.
if [ ! -x .venv-engine/bin/pyinstaller ]; then
    python3 -m venv .venv-engine
    .venv-engine/bin/pip install --quiet pyinstaller
fi

work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT
.venv-engine/bin/pyinstaller --onefile --name mox-engine --log-level WARN \
    --distpath "$work/dist" --workpath "$work/build" --specpath "$work" "$source"

mkdir -p src-tauri/binaries
cp "$work/dist/mox-engine$extension" "src-tauri/binaries/mox-engine-$target$extension"
echo "built src-tauri/binaries/mox-engine-$target$extension, from $source:"
"src-tauri/binaries/mox-engine-$target$extension" --version
