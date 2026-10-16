#!/bin/bash
#
# Siddhivinayak Temple Guesthouse — one-click starter (macOS)
#
# Double-click this file. It installs the website as a background service
# (starts now, restarts itself if it stops, and starts with your Mac),
# then opens the admin panel in your browser.
#
# To stop the website completely, run in Terminal:
#   ./scripts/service.sh stop
#

cd "$(dirname "$0")" || exit 1

clear
echo ""
echo "  Siddhivinayak Temple Guesthouse"
echo ""

"./scripts/service.sh" start

echo ""
echo "  Opening the admin panel…"
sleep 1
open "http://localhost:3000/admin.html"

echo ""
echo "  The website now runs in the background — you can close this window."
echo "  Default login:  admin / varanasi123"
echo ""
