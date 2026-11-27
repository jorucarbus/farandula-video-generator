@echo off
rem Arranca el Selector de videos (Python) y deja su salida en el registro que se pasa como 2do argumento.
cd /d "%~1"
where py >nul 2>nul
if %errorlevel%==0 ( py selector_tiktok.py --sin-navegador >> "%~2" 2>&1 ) else ( python selector_tiktok.py --sin-navegador >> "%~2" 2>&1 )
