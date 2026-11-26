@echo off
rem Superapp: gestor de la biblioteca + Selector de videos + crear video, dentro de un Firefox propio.
rem  - Selector (Python, puerto 8765) y gestor (Node, puerto 3100) arrancan en segundo plano.
rem  - Firefox se abre con un PERFIL PROPIO (..\superapp-firefox-perfil): ahi inicias sesion en tus redes y el Selector lee esas mismas cookies.
chcp 65001 >nul
cd /d "%~dp0"
set "SELECTOR_DIR=%~dp0..\selector-videos"
set "PERFIL=%~dp0..\superapp-firefox-perfil"
rem Si quedó abierta una versión vieja del gestor o del Selector (puerto ocupado), se reemplaza: si no, la superapp seguiría mostrando lo anterior.
powershell -NoProfile -Command "Get-CimInstance Win32_Process | Where-Object { $_.CommandLine -match 'gestor.servidor.js|selector_tiktok.py' -and $_.CommandLine -notmatch 'powershell' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }"
if not exist "%PERFIL%" mkdir "%PERFIL%"
if not exist "%PERFIL%\user.js" copy /y "%~dp0gestor\firefox\user.js" "%PERFIL%\user.js" >nul
set "SELECTOR_NAVEGADOR=firefox"
set "SELECTOR_PERFIL_FIREFOX=%PERFIL%"

if exist "%SELECTOR_DIR%\selector_tiktok.py" (
  start "Selector de videos" /min cmd /c "cd /d %SELECTOR_DIR% && (where py >nul 2>nul && py selector_tiktok.py --sin-navegador || python selector_tiktok.py --sin-navegador)"
) else (
  echo No encuentro el Selector en %SELECTOR_DIR% - solo se abre el gestor.
)
start "Gestor de la superapp" /min cmd /c "node gestor\servidor.js"
timeout /t 3 /nobreak >nul

where firefox >nul 2>nul
if %errorlevel%==0 (
  start "" firefox -no-remote -profile "%PERFIL%" "http://127.0.0.1:3100"
) else (
  echo No encuentro Firefox: abro el navegador predeterminado. Las sesiones de las redes necesitan Firefox.
  start "" "http://127.0.0.1:3100"
)
echo.
echo Superapp en marcha. Puedes cerrar esta ventana; para apagarla usa DETENER-SUPERAPP.bat
pause
