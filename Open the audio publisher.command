#!/bin/bash
# Double-click this file to open the johnplusnews audio publisher.
cd "$(dirname "$0")" || exit 1
echo "Starting the johnplusnews audio publisher..."
python3 tools/audio.py
