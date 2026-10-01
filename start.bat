@echo off
cd /d "%~dp0"
start "" http://localhost:4173
node tools/run.js
