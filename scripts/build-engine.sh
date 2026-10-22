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

# PyInstaller in a venv of its own, kept out of the system Python. Windows names the venv's
# folder of programs Scripts, and its Python python, where the others say bin and python3.
python="${PYTHON:-python3}"
bin=.venv-engine/bin
case "$target" in *windows*) bin=.venv-engine/Scripts ;; esac
if [ ! -x "$bin/pyinstaller$extension" ]; then
    "$python" -m venv .venv-engine
    "$bin/python$extension" -m pip install --quiet pyinstaller
fi

work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT
"$bin/pyinstaller$extension" --onefile --name mox-engine --log-level WARN \
    --distpath "$work/dist" --workpath "$work/build" --specpath "$work" "$source"

mkdir -p src-tauri/binaries
cp "$work/dist/mox-engine$extension" "src-tauri/binaries/mox-engine-$target$extension"
echo "built src-tauri/binaries/mox-engine-$target$extension, from $source:"
"src-tauri/binaries/mox-engine-$target$extension" --version
