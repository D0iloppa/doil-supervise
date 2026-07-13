#!/usr/bin/env bash
# 이 스킬을 Claude Code 스킬 디렉토리로 심볼릭 링크한다(글로벌 설치).
# 링크만 걸므로 이 repo에서 편집하면 즉시 반영된다.
set -euo pipefail

SKILL_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
NAME="$(basename "$SKILL_DIR")"
CONFIG_DIR="${CLAUDE_CONFIG_DIR:-$HOME/.claude}"
DEST="$CONFIG_DIR/skills"

mkdir -p "$DEST"
ln -sfn "$SKILL_DIR" "$DEST/$NAME"
echo "linked: $DEST/$NAME -> $SKILL_DIR"
echo "done. config dir: $CONFIG_DIR"
