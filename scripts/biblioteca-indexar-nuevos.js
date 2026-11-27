// Pone al día el índice de UNA carpeta de Drive, gastando IA solo en lo que falta: baja (temporal) únicamente los clips SIN etiqueta,
// los etiqueta con Gemini UNA vez, mide calidad y rostros, guarda miniaturas y respalda el índice en Drive. Lo ya etiquetado no se toca.
// Es lo que corre solo la primera vez que se usa un artista en un video (y cuando aparecen videos nuevos en su carpeta de Drive).
// Uso: node scripts/biblioteca-indexar-nuevos.js <carpeta> [--sin-gemini]
require('dotenv').config({ quiet: true });
const fs = require('fs'), path = require('path'), { spawnSync } = require('child_process');
const R = require('../edl/respaldoIndice'), { etiquetarClips, RAIZ, fechaDeNombre } = require('../edl/biblioteca');
const nombre = process.argv[2]; if (!nombre || !/^[\p{L}\p{N}_ .-]+$/u.test(nombre)) { console.error('falta la carpeta (o es inválida)'); process.exit(1); }
const sinGemini = process.argv.includes('--sin-gemini'), leer = (f, d) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return d; } };
const correr = (script, ...a) => spawnSync(script.endsWith('.py') ? 'python' : process.execPath, [path.join(__dirname, script), ...a], { stdio: 'inherit', cwd: path.join(__dirname, '..') });

(async () => {
  if (process.env.RESPALDO_DRIVE === '0') { console.log('ÍNDICE: sin Drive (RESPALDO_DRIVE=0), no se actualiza'); return; }
  const drive = require('../drive'); let mapa;
  try { mapa = await drive.obtenerCarpetasFamosos(); } catch (e) { console.log('ÍNDICE: no pude leer Drive (' + String(e.message).slice(0, 80) + '); se sigue con lo que hay'); return; }
  const id = mapa[nombre]; if (!id) { console.log(`ÍNDICE: "${nombre}" no está en Drive (¿es una carpeta importada del Selector?); se usa lo que hay`); return; }

  // Si este equipo no tiene el índice de la carpeta pero Drive sí (otra PC, disco nuevo), primero se trae: así no se vuelve a pagar nada.
  await R.restaurarFaltantes({}).catch(() => {});
  const fClips = path.join(RAIZ, `${nombre}.clips.json`), fEt = path.join(RAIZ, `${nombre}.etiquetas.json`);
  const videos = await drive.listarVideos(id), clips = leer(fClips, []), etiquetas = leer(fEt, {}), conocidos = new Set(clips.map(c => c.id));
  const dir = path.join(RAIZ, nombre); fs.mkdirSync(dir, { recursive: true });
  for (const v of videos) if (!conocidos.has(v.id)) clips.push({ id: v.id, name: v.name, ruta: path.join(dir, `src_${v.id}.mp4`), duracion: v.duracion, fecha: fechaDeNombre(v.name) });
  const maxArg = Number(process.argv[process.argv.indexOf('--max') + 1]) || Infinity; // tope por corrida (carpetas enormes); se toman primero los más recientes
  const sinEtiqueta = clips.filter(c => !etiquetas[c.id] && videos.some(v => v.id === c.id)).sort((x, y) => String(y.fecha || '').localeCompare(String(x.fecha || '')));
  const pendientes = sinEtiqueta.slice(0, maxArg);
  console.log(`ÍNDICE ${nombre}: ${videos.length} videos en Drive, ${Object.keys(etiquetas).length} ya etiquetados, ${pendientes.length} por etiquetar${sinEtiqueta.length > pendientes.length ? ' (de ' + sinEtiqueta.length + ', tope ' + maxArg + ')' : ''}`);
  if (!pendientes.length) { if (clips.length !== conocidos.size) R.escribirSeguro(fClips, clips); return; }

  // 1) bajar SOLO los pendientes (temporal)
  let n = 0;
  for (const c of pendientes) { try { await drive.descargarVideo(c.id, dir); n++; console.log(`  bajado ${n}/${pendientes.length}`); } catch (e) { console.log(`  no pude bajar ${c.name}: ${String(e.message).slice(0, 80)}`); } }
  R.escribirSeguro(fClips, clips); // el índice completo (los clips ya etiquetados no salen de la lista)
  // 2) etiquetar con Gemini, una sola vez por clip (etiquetarClips salta los que ya tienen etiqueta)
  const bajados = pendientes.filter(c => fs.existsSync(c.ruta));
  if (!sinGemini && bajados.length) {
    const r = await etiquetarClips(bajados, { cache: fEt, progreso: (i, t) => console.log(`  etiquetando ${i}/${t}`) });
    console.log(`  ${bajados.length - r.fallos.length} etiquetados${r.fallos.length ? `, ${r.fallos.length} fallaron: ${r.fallos[0].error}` : ''}`);
  }
  // 3) lo demás es gratis y reanuda solo lo que falte
  correr('calidad-clips.js', nombre); correr('rostros-clips.py', nombre); correr('biblioteca-minis.js', nombre);
  try { const rb = await R.respaldarCarpeta(nombre); console.log(`  índice respaldado en Drive (${rb.subidos} archivos)`); } catch (e) { console.log('  (no pude respaldar en Drive: ' + String(e.message).slice(0, 80) + ')'); }
  console.log(`ÍNDICE ${nombre}: listo`);
})().catch(e => { console.error('ÍNDICE: falló:', e.message); process.exit(0); }); // un fallo aquí no debe tumbar el video: se sigue con lo que haya
