#!/bin/bash
#
# Service control for the guesthouse website (macOS).
#
#   ./scripts/service.sh status     is the site running?
#   ./scripts/service.sh start      start it now, on login, and keep it alive
#   ./scripts/service.sh restart    restart it
#   ./scripts/service.sh stop       stop it completely
#
# Runs as a macOS background service, so it keeps working after you close
# every Terminal window, and comes back by itself after a restart or a crash.
#
set -u

LABEL="com.siddhivinayak.guesthouse"
PROJECT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
NODE_BIN="$(command -v node)"
PLIST="$HOME/Library/LaunchAgents/$LABEL.plist"
PORT="${PORT:-3000}"
LOG_DIR="$PROJECT_DIR/logs"

die()  { echo "  $1"; exit 1; }
ok()   { echo "  $1"; }

write_plist() {
  mkdir -p "$HOME/Library/LaunchAgents" "$LOG_DIR"
  cat > "$PLIST" <<PLIST_EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>$LABEL</string>
  <key>ProgramArguments</key>
  <array>
    <string>$NODE_BIN</string>
    <string>$PROJECT_DIR/scripts/run.js</string>
  </array>
  <key>WorkingDirectory</key><string>$PROJECT_DIR</string>
  <key>EnvironmentVariables</key>
  <dict>
    <key>PORT</key><string>$PORT</string>
    <key>NODE_ENV</key><string>production</string>
  </dict>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
  <key>StandardOutPath</key><string>$LOG_DIR/service.log</string>
  <key>StandardErrorPath</key><string>$LOG_DIR/service.log</string>
</dict>
</plist>
PLIST_EOF
}

wait_for_port() {
  for _ in $(seq 1 30); do
    nc -z 127.0.0.1 "$PORT" >/dev/null 2>&1 && return 0
    sleep 1
  done
  return 1
}

case "${1:-status}" in
  status)
    if launchctl list "$LABEL" >/dev/null 2>&1; then
      PID="$(launchctl list "$LABEL" 2>/dev/null | awk '/"PID"/{print $NF}' | tr -d ';')"
      ok "Service is installed and loaded${PID:+ (process $PID)}."
    else
      ok "Service is not running."
    fi
    if nc -z 127.0.0.1 "$PORT" >/dev/null 2>&1; then
      ok "Website answers on http://localhost:$PORT/  and  http://localhost:$PORT/admin.html"
    else
      ok "Nothing is listening on port $PORT."
    fi
    ;;

  start|restart)
    [ -x "$NODE_BIN" ] || die "Node.js not found. Install it from https://nodejs.org (LTS), then try again."
    write_plist
    # if something else is already holding the port, hand over cleanly
    if nc -z 127.0.0.1 "$PORT" >/dev/null 2>&1; then
      ok "Something is already on port $PORT. Restarting through the service…"
    fi
    launchctl bootout "gui/$(id -u)/$LABEL" >/dev/null 2>&1 || true
    # free the port for the service (kills only this project's own server)
    pkill -f "node $PROJECT_DIR/scripts/run.js" >/dev/null 2>&1 || true
    pkill -f "node $PROJECT_DIR/server.js" >/dev/null 2>&1 || true
    sleep 1
    launchctl bootstrap "gui/$(id -u)" "$PLIST" >/dev/null 2>&1 \
      || launchctl load -w "$PLIST" >/dev/null 2>&1 || true
    if wait_for_port; then
      ok "Running:  http://localhost:$PORT/  ·  admin: http://localhost:$PORT/admin.html"
      ok "Logs:    $LOG_DIR/service.log"
    else
      die "The service did not come up. See $LOG_DIR/service.log"
    fi
    ;;

  stop)
    launchctl bootout "gui/$(id -u)/$LABEL" >/dev/null 2>&1 \
      || launchctl unload -w "$PLIST" >/dev/null 2>&1 || true
    pkill -f "node $PROJECT_DIR/scripts/run.js" >/dev/null 2>&1 || true
    pkill -f "node $PROJECT_DIR/server.js" >/dev/null 2>&1 || true
    ok "Stopped. Start again anytime with:  ./scripts/service.sh start"
    ;;

  *)
    echo "  Usage: $0 {status|start|restart|stop}"
    exit 1
    ;;
esac