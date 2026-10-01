#!/bin/bash
# macOS: doble clic para arrancar el dashboard (equivalente a start.bat)
cd "$(dirname "$0")"
(sleep 1 && open http://localhost:4173) &
node tools/run.js
