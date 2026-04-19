#!/bin/bash
# sync.sh — Read Apple Notes "北京吃喝玩乐" + "外地旅游" and generate data.js
# Uses clipboard copy to preserve checklist state (- [x] / - [ ])
# Run: bash sync.sh

set -e
DIR="$(cd "$(dirname "$0")" && pwd)"

echo "[sync] Reading Apple Notes via clipboard..."

# Helper: open a note, select all, copy, save clipboard to variable
read_note_via_clipboard() {
  local note_name="$1"
  # Clear clipboard first
  pbcopy < /dev/null

  osascript <<EOF
tell application "Notes"
    activate
    set theNote to note "$note_name"
    show theNote
end tell

delay 2

-- Double-click in note body area to ensure focus is in the note content
tell application "System Events"
    tell process "Notes"
        set frontmost to true
        delay 0.5
    end tell
end tell

-- Use Notes' own "show" + a small delay, then select all via menu
tell application "System Events"
    tell process "Notes"
        click menu item "全选" of menu "编辑" of menu bar 1
        delay 0.5
        click menu item "拷贝" of menu "编辑" of menu bar 1
        delay 1
    end tell
end tell
EOF

  local result
  result=$(pbpaste 2>/dev/null)

  # Verify we got the right note
  if echo "$result" | head -5 | grep -q "$note_name" 2>/dev/null || [ ${#result} -gt 100 ]; then
    echo "$result"
  else
    echo "[sync] WARNING: clipboard may not contain '$note_name', got ${#result} chars" >&2
    echo "$result"
  fi
}

NOTE_BJ=$(read_note_via_clipboard "🍷北京吃喝玩乐" 2>/dev/null || echo "")
sleep 1
NOTE_TRAVEL=$(read_note_via_clipboard "🎒外地旅游" 2>/dev/null || echo "")

if [ -z "$NOTE_BJ" ] && [ -z "$NOTE_TRAVEL" ]; then
  # Fallback: try cached data
  if [ -f "$DIR/.cache_bj.txt" ] || [ -f "$DIR/.cache_travel.txt" ]; then
    echo "[sync] WARNING: Clipboard capture failed. Using cached data."
    NOTE_BJ=$(cat "$DIR/.cache_bj.txt" 2>/dev/null || echo "")
    NOTE_TRAVEL=$(cat "$DIR/.cache_travel.txt" 2>/dev/null || echo "")
  else
    echo "[sync] ERROR: Could not read any notes. Open Notes manually, select all in the note, copy, then re-run."
    exit 1
  fi
fi

# Cache successful reads
[ -n "$NOTE_BJ" ] && echo "$NOTE_BJ" > "$DIR/.cache_bj.txt"
[ -n "$NOTE_TRAVEL" ] && echo "$NOTE_TRAVEL" > "$DIR/.cache_travel.txt"

# Pass plaintext (with checkbox markers) to the Node.js parser
node "$DIR/parse_notes.js" "$DIR/data.js" <<HEREDOC_EOF
===BJ_NOTE===
$NOTE_BJ
===TRAVEL_NOTE===
$NOTE_TRAVEL
HEREDOC_EOF

echo "[sync] Done! data.js updated at $(date)"
