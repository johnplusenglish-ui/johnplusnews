#!/bin/bash
# Double-click this file to open the johnplusnews photo publisher (pictures and photo prompts only).
cd "$(dirname "$0")" || exit 1
echo "Starting the johnplusnews photo publisher..."
python3 tools/photos.py
