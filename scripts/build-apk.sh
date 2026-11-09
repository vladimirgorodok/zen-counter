#!/usr/bin/env bash
# Сборка APK.
#   по умолчанию — Gradle (нужен x86_64, потому что aapt2 от Google только x86_64);
#   на ARM64 скрипт сам уходит в scripts/build-apk-manual.sh (aapt/javac/d8/apksigner).
#   Флаг --manual принуждает ручной путь, --gradle — путь Gradle.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
WEB="$ROOT/web"
ASSETS="$ROOT/android/app/src/main/assets"
DIST="$ROOT/dist"

MODE="auto"
case "${1:-}" in
  --manual) MODE="manual"; shift ;;
  --gradle) MODE="gradle"; shift ;;
esac
BUILD_TYPE="${1:-debug}"

GRADLE_BIN="${GRADLE_BIN:-}"
if [ -z "$GRADLE_BIN" ]; then
  if [ -x "$ROOT/../_tools/gradle-8.9/bin/gradle" ]; then
    GRADLE_BIN="$ROOT/../_tools/gradle-8.9/bin/gradle"
  elif command -v gradle >/dev/null 2>&1; then
    GRADLE_BIN="$(command -v gradle)"
  else
    GRADLE_BIN="$ROOT/android/gradlew"
  fi
fi

export ANDROID_HOME="${ANDROID_HOME:-$ROOT/../_tools/android-sdk}"
export ANDROID_SDK_ROOT="$ANDROID_HOME"

if [ ! -d "$ANDROID_HOME/platforms" ]; then
  echo "Android SDK не найден в $ANDROID_HOME" >&2
  echo "Установите: sdkmanager \"platforms;android-34\" \"build-tools;34.0.0\"" >&2
  exit 1
fi

# 1. Веб-приложение → assets/www
rm -rf "$ASSETS"
mkdir -p "$ASSETS/www"
cp -r "$WEB/." "$ASSETS/www/"
rm -f "$ASSETS"/www/icons/*.png # PNG нужны только для установки PWA, в APK — нет (−640 КБ)

# 2. Иконки (если есть rsvg-convert)
if command -v rsvg-convert >/dev/null 2>&1; then
  "$ROOT/scripts/make-icons.sh" >/dev/null
fi

# 3. Решаем, каким путём собирать: aapt2 от Google — только x86_64.
if [ "$MODE" = "auto" ]; then
  AAPT2="$ANDROID_HOME/build-tools/34.0.0/aapt2"
  if [ -x "$AAPT2" ] && "$AAPT2" version >/dev/null 2>&1; then
    MODE="gradle"
  else
    MODE="manual"
  fi
fi

if [ "$MODE" = "manual" ]; then
  echo "aapt2 недоступен (ARM64?) → сборка через aapt/javac/d8"
  exec bash "$ROOT/scripts/build-apk-manual.sh"
fi

# 4. Gradle
echo "Сборка: $BUILD_TYPE"
(cd "$ROOT/android" && "$GRADLE_BIN" --no-daemon -q "assemble${BUILD_TYPE^}")

APK="$ROOT/android/app/build/outputs/apk/$BUILD_TYPE/app-$BUILD_TYPE.apk"

mkdir -p "$DIST"
if [ "$BUILD_TYPE" = "release" ]; then
  OUT="$DIST/zen-counter-v$(grep -oP 'versionName "\K[^"]+' "$ROOT/android/app/build.gradle")-release.apk"
else
  OUT="$DIST/zen-counter-debug.apk"
fi
cp -f "$APK" "$OUT"
echo "APK: $OUT ($(du -h "$OUT" | cut -f1))"
