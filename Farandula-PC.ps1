# Farandula PC: arranca la aplicacion en ESTE computador para que los videos se procesen aqui y no en
# Railway (pedido del usuario, 2026-11-16: "quiero que mi computador procese los videos... y asi gastar
# menos dinero ahi").
#
# Que hace, en orden:
#   1. Si la aplicacion ya esta encendida, solo abre su ventana.
#   2. Pone al dia el estado local con el de Drive (sincronizar-estado.js).
#   3. Enciende el servidor con PC_PRINCIPAL=1: la PC pasa a guardar el estado compartido en Drive.
#   4. Abre la aplicacion en una ventana propia (sin barra de navegador).
#   5. Mantiene el equipo DESPIERTO mientras esta ventana negra siga abierta, para que una cola de
#      renders no se corte porque Windows suspendio el computador.
#
# Para apagar la aplicacion: cerrar ESTA ventana (la negra). Cerrar solo la ventana de la aplicacion
# no apaga nada: los renders en cola siguen, y se vuelve a abrir con el mismo acceso directo.

param(
    [switch]$SoloVentana,   # uso interno: esperar a que el servidor conteste y abrir la ventana
    [switch]$SinEscribir    # prueba: enciende todo igual pero SIN guardar el estado compartido en Drive
)

$ErrorActionPreference = 'Continue'
# El servidor escribe en UTF-8 (tildes y emojis): sin esto salen como simbolos raros en la ventana y en el registro.
try { [Console]::OutputEncoding = [System.Text.Encoding]::UTF8; $OutputEncoding = [System.Text.Encoding]::UTF8 } catch {}
Set-Location -LiteralPath $PSScriptRoot
if (-not $SoloVentana) { $Host.UI.RawUI.WindowTitle = 'Farandula PC - servidor encendido (cerrar esta ventana apaga la aplicacion)' }

$puerto = 3000
$linea = Select-String -LiteralPath (Join-Path $PSScriptRoot '.env') -Pattern '^PORT=(\d+)' -ErrorAction SilentlyContinue | Select-Object -First 1
if ($linea) { $puerto = [int]$linea.Matches[0].Groups[1].Value }
$url = "http://localhost:$puerto"

function Test-Encendida {
    try { (Invoke-WebRequest -Uri "$url/api/health" -UseBasicParsing -TimeoutSec 3).StatusCode -eq 200 } catch { $false }
}

function Open-Ventana {
    # Ventana propia, con su perfil aparte: asi no se mezcla con las pestanas del navegador de siempre.
    $perfil = Join-Path $env:LOCALAPPDATA 'FarandulaPC\perfil'
    $candidatos = @(
        "${env:ProgramFiles(x86)}\Microsoft\Edge\Application\msedge.exe",
        "$env:ProgramFiles\Microsoft\Edge\Application\msedge.exe",
        "$env:ProgramFiles\Google\Chrome\Application\chrome.exe",
        "${env:ProgramFiles(x86)}\Google\Chrome\Application\chrome.exe"
    )
    $navegador = $candidatos | Where-Object { $_ -and (Test-Path -LiteralPath $_) } | Select-Object -First 1
    if ($navegador) {
        Start-Process -FilePath $navegador -ArgumentList "--app=$url", "--user-data-dir=`"$perfil`"", '--window-size=1500,950', '--no-first-run'
    } else {
        Start-Process $url   # sin Edge ni Chrome: se abre en el navegador que haya
    }
}

if ($SoloVentana) {
    for ($i = 0; $i -lt 90; $i++) {
        if (Test-Encendida) { Open-Ventana; exit 0 }
        Start-Sleep -Seconds 1
    }
    exit 1
}

if (Test-Encendida) {
    Write-Host 'La aplicacion ya esta encendida: abro su ventana.'
    Open-Ventana
    Start-Sleep -Seconds 2
    exit 0
}

if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    Write-Host 'No encuentro Node.js en este computador. Instalalo desde https://nodejs.org y vuelve a abrir.' -ForegroundColor Red
    Read-Host 'Enter para cerrar'
    exit 1
}

# Mantener el equipo despierto mientras este proceso viva (la pantalla si puede apagarse).
# ES_CONTINUOUS (0x80000000) + ES_SYSTEM_REQUIRED (0x00000001)
try {
    Add-Type -Namespace Farandula -Name Energia -MemberDefinition '[DllImport("kernel32.dll")] public static extern uint SetThreadExecutionState(uint esFlags);'
    [void][Farandula.Energia]::SetThreadExecutionState([uint32]2147483649)
    Write-Host 'El equipo no se va a suspender mientras esta ventana siga abierta.'
} catch {
    Write-Host 'Aviso: no pude impedir la suspension del equipo. Revisa la configuracion de energia si dejas una cola de noche.' -ForegroundColor Yellow
}

if ($SinEscribir) {
    Write-Host 'MODO PRUEBA: esta sesion NO guarda el estado compartido en Drive.' -ForegroundColor Yellow
} else {
    $env:PC_PRINCIPAL = '1'
}

Write-Host ''
Write-Host 'Poniendo al dia el estado con Drive...'
node sincronizar-estado.js

# La ventana de la aplicacion se abre sola cuando el servidor contesta. Lo hace OTRO proceso (este
# mismo guion con -SoloVentana), porque este queda ocupado mostrando lo que dice el servidor.
Start-Process -FilePath 'powershell.exe' -WindowStyle Hidden -ArgumentList '-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', "`"$PSCommandPath`"", '-SoloVentana'

Write-Host ''
Write-Host "Encendiendo la aplicacion en $url ..."
Write-Host 'Los videos se procesan en ESTE computador. Para apagar: cerrar esta ventana.' -ForegroundColor Green
Write-Host ''

New-Item -ItemType Directory -Force -Path (Join-Path $PSScriptRoot 'logs') | Out-Null
$registro = Join-Path $PSScriptRoot 'logs\pc-servidor.log'
node server.js 2>&1 | Tee-Object -FilePath $registro

Write-Host ''
Write-Host 'El servidor se detuvo. Si no lo cerraste tu, lo ultimo que dijo esta arriba (y en logs\pc-servidor.log).' -ForegroundColor Yellow
Read-Host 'Enter para cerrar'
