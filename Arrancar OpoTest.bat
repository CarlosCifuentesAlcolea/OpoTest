@echo off
title OpoTest
cd /d "%~dp0"

echo Arrancando OpoTest...
start "OpoTest - servidor (no cierres esta ventana)" cmd /k "npm start"

timeout /t 2 /nobreak >nul
start "" http://localhost:3000
