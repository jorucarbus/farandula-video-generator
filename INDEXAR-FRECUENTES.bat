@echo off
rem Etiqueta (una vez) los clips de los artistas mas publicados. Es reanudable: lo ya etiquetado no se repite ni gasta IA.
rem Deja el avance en data-motor\analisis\indexado-progreso.json y el registro en data-motor\analisis\indexar-frecuentes.log
chcp 65001 >nul
cd /d "%~dp0"
node scripts\analisis-publicados.js
node scripts\indexar-frecuentes.js --minimo 3 --max-artistas 60 --max-por-carpeta 150
pause
