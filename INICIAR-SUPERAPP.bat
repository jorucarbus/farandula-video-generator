@echo off
rem Superapp: gestor de la biblioteca + Selector de videos + crear video, en una sola ventana.
rem Arranca el Selector (Python, puerto 8765) y el gestor (Node, puerto 3100) y abre el navegador.
chcp 65001 >nul
cd /d "%~dp0"
set "SELECTOR_DIR=%~dp0..\selector-videos"
if exist "%SELECTOR_DIR%\selector_tiktok.py" (
  start "Selector de videos" /min cmd /c "cd /d %SELECTOR_DIR% && (where py >nul 2>nul && py selector_tiktok.py || python selector_tiktok.py)"
) else (
  echo No encuentro el Selector en %SELECTOR_DIR% - solo se abre el gestor.
)
start "" "http://127.0.0.1:3100"
node gestor\servidor.js
pause
