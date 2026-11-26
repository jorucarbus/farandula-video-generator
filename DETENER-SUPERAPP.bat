@echo off
rem Apaga el gestor y el Selector de la superapp (no cierra Firefox).
taskkill /FI "WINDOWTITLE eq Gestor de la superapp*" /T /F >nul 2>nul
taskkill /FI "WINDOWTITLE eq Selector de videos*" /T /F >nul 2>nul
echo Superapp apagada.
timeout /t 2 /nobreak >nul
