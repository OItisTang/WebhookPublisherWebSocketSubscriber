#!/bin/bash

SCRIPT_DIR=$( cd -- "$( dirname -- "${BASH_SOURCE[0]}" )" &> /dev/null && pwd )

$SCRIPT_DIR/src/_start-server.sh &

sleep 2

pid=$(ps aux | grep "php server.php" | grep -v grep | awk '{print $2}')

echo "started $pid"

