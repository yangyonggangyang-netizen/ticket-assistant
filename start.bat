@echo off
set ELECTRON_RUN_AS_NODE=
set ELECTRON_OVERRIDE_DIST_PATH=
cd /d "%~dp0"
"node_modules\electron\dist\electron.exe" . --no-sandbox --disable-gpu
