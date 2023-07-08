#!/bin/bash

pid=$(ps aux | grep "php server.php" | grep -v grep | awk '{print $2}')

kill -9 $pid

echo "killed $pid"

