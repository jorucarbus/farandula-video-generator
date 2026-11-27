// Espera a que Drive (la nube) tenga todos los videos que el Selector dejó en el disco G: de una carpeta de artista.
// Drive para escritorio sube en segundo plano; indexar antes de eso se perdería los últimos. Espera hasta 40 min y sigue igual (el indexado es repetible).
// Uso: node scripts/esperar-drive.js <carpeta>
require('dotenv').config({ quiet: true });
const fs = require('fs'), path = require('path');
const carpeta = process.argv[2]; if (!carpeta || !/^[\p{L}\p{N}_ .-]+$/u.test(carpeta)) { console.error('carpeta inválida'); process.exit(1); }
const RAIZ_DRIVE = process.env.SELECTOR_DESTINO_DRIVE || 'G:\\Mi unidad\\Redes_Canales\\Videos_Famosos_Carpetas';
const EXT = /\.(mp4|mov|webm|mkv|m4v)$/i, dormir = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  const dir = path.join(RAIZ_DRIVE, carpeta), locales = () => { try { return fs.readdirSync(dir).filter(f => EXT.test(f)).length; } catch { return 0; } };
  const esperados = locales(); console.log(`ESPERA: ${esperados} video(s) en ${dir}`);
  if (!esperados || process.env.RESPALDO_DRIVE === '0') return;
  const drive = require('../drive'), limite = Date.now() + 40 * 60000; let ultimo = -1;
  while (Date.now() < limite) {
    let n = 0; try { const mapa = await drive.obtenerCarpetasFamosos(); n = mapa[carpeta] ? (await drive.listarVideos(mapa[carpeta])).length : 0; } catch (e) { console.log('  no pude leer Drive: ' + String(e.message).slice(0, 80)); }
    if (n !== ultimo) { console.log(`  en la nube: ${n}/${esperados}`); ultimo = n; }
    if (n >= esperados) { console.log('ESPERA: Drive ya tiene todo'); return; }
    await dormir(30000);
  }
  console.log('ESPERA: se acabó el tiempo; se etiqueta lo que ya esté (lo demás se etiqueta en la próxima pasada)');
})();
