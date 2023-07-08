#!/bin/bash

# single instance guard
[ "${FLOCKER}" != "$0" ] && exec env FLOCKER="$0" flock -en "$0" "$0" "$@" || :

cd "$(dirname "$0")"

{
echo "$(date) - Started TrelloUpdatePushWebSocketServer"

php server.php

echo "$(date) - Stopped"
} > ../log/server.log 2>&1


