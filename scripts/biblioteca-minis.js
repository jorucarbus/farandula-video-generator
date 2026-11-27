// Guarda una miniatura chica de cada clip de una carpeta (data-motor/biblioteca/<carpeta>.minis/<id>.jpg), para poder ver la biblioteca
// sin tener los videos en disco. Usa el mejor momento del rostro si ya se conoce. No repite las que ya existen.
// Uso: node scripts/biblioteca-minis.js <carpeta>
const fs = require('fs'), path = require('path'), { execFileSync } = require('child_process');
const nombre = process.argv[2]; if (!nombre || !/^[\p{L}\p{N}_ .-]+$/u.test(nombre)) { console.error('falta la carpeta'); process.exit(1); }
const BIB = path.join(__dirname, '..', 'data-motor', 'biblioteca'), dir = path.join(BIB, `${nombre}.minis`);
const leer = (f, d) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return d; } };
const clips = leer(path.join(BIB, `${nombre}.clips.json`), []), et = leer(path.join(BIB, `${nombre}.etiquetas.json`), {});
fs.mkdirSync(dir, { recursive: true }); let hechas = 0, sin = 0;
for (const c of clips) {
  const out = path.join(dir, `${c.id}.jpg`); if (fs.existsSync(out)) continue;
  if (!c.ruta || !fs.existsSync(c.ruta)) { sin++; continue; }
  const t = String((et[c.id] && et[c.id].rostro && et[c.id].rostro.t) || 1);
  try { execFileSync(process.env.FFMPEG_BIN || require('ffmpeg-static'), ['-y', '-v', 'error', '-ss', t, '-i', c.ruta, '-frames:v', '1', '-vf', 'scale=270:-2', '-q:v', '5', out], { timeout: 30000 }); hechas++; } catch { try { execFileSync(require('ffmpeg-static'), ['-y', '-v', 'error', '-i', c.ruta, '-frames:v', '1', '-vf', 'scale=270:-2', '-q:v', '5', out], { timeout: 30000 }); hechas++; } catch {} }
}
console.log(`${hechas} miniaturas nuevas en ${nombre}.minis (${sin} clips sin archivo)`);
