#!/usr/bin/env bash
set -euo pipefail

repo_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
esp_index="https://espressif.github.io/arduino-esp32/package_esp32_index.json"
mkdir -p "$HOME/.local/bin" "$repo_dir/build/toki"
if ! command -v arduino-cli >/dev/null 2>&1; then
  curl -fsSL https://raw.githubusercontent.com/arduino/arduino-cli/master/install.sh \
    | BINDIR="$HOME/.local/bin" sh
fi
export PATH="$HOME/.local/bin:$PATH"
arduino-cli core update-index --additional-urls "$esp_index"
if ! arduino-cli core list | grep -q '^esp32:esp32'; then
  arduino-cli core install esp32:esp32@3.3.11 --additional-urls "$esp_index"
fi
arduino-cli lib update-index
arduino-cli lib install "GxEPD2"
arduino-cli compile --fqbn esp32:esp32:esp32:PartitionScheme=min_spiffs --export-binaries \
  --output-dir "$repo_dir/build/toki" "$repo_dir/firmware/Toki"
echo "Toki firmware binary: $repo_dir/build/toki/Toki.ino.bin"
