#!/bin/bash
# Installs a daily macOS job that refreshes all three KPIs (including the Instagram views kept
# by the local video pipeline) and pushes data/kpis.json. Only the totals are published.
set -euo pipefail
REPO="$(cd "$(dirname "$0")/.." && pwd)"
LEDGER="${1:-$HOME/Documents/quant-interview-videos/analytics/views.jsonl}"
LABEL="com.gaspardol.site-kpis"
PLIST="$HOME/Library/LaunchAgents/$LABEL.plist"
mkdir -p "$HOME/Library/Logs"
cat > "$PLIST" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>$LABEL</string>
  <key>ProgramArguments</key>
  <array>
    <string>/usr/bin/python3</string>
    <string>$REPO/scripts/update_kpis.py</string>
    <string>--views-ledger</string><string>$LEDGER</string>
    <string>--push</string>
  </array>
  <key>EnvironmentVariables</key>
  <dict><key>PATH</key><string>/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin</string></dict>
  <key>StartCalendarInterval</key><dict><key>Hour</key><integer>9</integer><key>Minute</key><integer>30</integer></dict>
  <key>RunAtLoad</key><false/>
  <key>StandardOutPath</key><string>$HOME/Library/Logs/site-kpis.log</string>
  <key>StandardErrorPath</key><string>$HOME/Library/Logs/site-kpis.log</string>
</dict>
</plist>
PLIST
launchctl bootout "gui/$(id -u)/$LABEL" 2>/dev/null || true
launchctl bootstrap "gui/$(id -u)" "$PLIST"
echo "Installed $LABEL (daily 09:30). Logs: ~/Library/Logs/site-kpis.log"
