#!/bin/bash
# Double-click this file to open the johnplusnews publisher.
cd "$(dirname "$0")" || exit 1
echo "Starting the johnplusnews publisher..."
python3 tools/publish.py
