// Estilo "capitol": componentes animados (canvas), recetas nuevas y su render real de punta a punta.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');
const { createCanvas, loadImage } = require('@napi-rs/canvas');

const ffmpegBin = require('ffmpeg-static');
const video = require('../video');
fs.mkdirSync(video.TEMP_DIR, { recursive: true });
const estilo = require('../estilos/capitol');
const { generarSecuencia } = require('../overlay/animacion');
const { COMPONENTES, formatear } = require('../overlay/componentes');
const recetas = require('../recetas');
const { planEdlARender } = require('../edl/planEdlARender');

const ff = args => execFileSync(ffmpegBin, ['-y', '-loglevel', 'error', ...args]);
const cargar = n => JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'edl', n), 'utf8'));
function pixel(f, x, y, t = 0) {
  const buf = execFileSync(ffmpegBin, ['-v', 'error', ...(t ? ['-ss', String(t)] : []), '-i', f, '-frames:v', '1',
    '-vf', `format=rgba,crop=1:1:${x}:${y}`, '-f', 'rawvideo', '-pix_fmt', 'rgba', '-']);
  return [buf[0], buf[1], buf[2], buf[3]];
}
async function alfaMaximo(archivo) {
  const img = await loadImage(fs.readFileSync(archivo));
  const c = createCanvas(img.width, img.height), ctx = c.getContext('2d');
  ctx.drawImage(img, 0, 0);
  const d = ctx.getImageData(0, 0, img.width, img.height).data;
  let max = 0; for (let i = 3; i < d.length; i += 4) if (d[i] > max) max = d[i];
  return max;
}

test('formatear: miles con punto y años sin agrupar', () => {
  assert.equal(formatear(500000), '500.000');
  assert.equal(formatear(1234567), '1.234.567');
  assert.equal(formatear(2023, false), '2023');
  assert.equal(formatear(50), '50');
});

test('generarSecuencia: arranca transparente, termina visible y la caja cabe en el cuadro (9:16 y 16:9)', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'seq-'));
  try {
    for (const [w, h] of [[1080, 1920], [1920, 1080]]) {
      for (const [nombre, datos] of [['cifra_pildora', { valor: 500000, sufijo: ' $' }], ['sello_animado', { texto: 'Rumor sin confirmar' }], ['tarjeta_dato', { etiqueta: 'Fecha', titulo: '30 de octubre de 2026', detalle: 'Portoviejo' }]]) {
        const r = generarSecuencia({ componente: COMPONENTES[nombre], datos, estilo, w, h, dirDestino: path.join(dir, `${nombre}_${w}`) });
        const { patron, fps, n } = r.secuencia;
        assert.equal(fps, 30);
        assert.ok(n >= 8 && n <= 40, `${nombre}: ${n} fotogramas`);
        assert.ok(r.cw <= w && r.x >= 0 && r.x + r.cw <= w, `${nombre} ${w}x${h}: la caja cabe a lo ancho (x=${r.x}, cw=${r.cw})`);
        assert.ok(r.y >= 0 && r.y + r.ch <= h, `${nombre} ${w}x${h}: la caja cabe a lo alto (y=${r.y}, ch=${r.ch})`);
        assert.equal(await alfaMaximo(patron.replace('%03d', '000')), 0, `${nombre}: el fotograma 0 es transparente`);
        assert.ok(await alfaMaximo(patron.replace('%03d', String(n - 1).padStart(3, '0'))) > 200, `${nombre}: el último fotograma es visible`);
      }
    }
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('cifra_pildora: el conteo crece y un año con conteo:false no cuenta desde cero', () => {
  assert.equal(COMPONENTES.cifra_pildora.dur(estilo, { valor: 5 }), 0.95);
  assert.equal(COMPONENTES.cifra_pildora.dur(estilo, { valor: 2023, conteo: false }), estilo.movimiento.pop.dur);
});

test('recetas nuevas: validan sus parámetros y emiten un overlay animado dentro de la toma', () => {
  assert.deepEqual(recetas.validarParams('cifra_pildora', { valor: 500000, sufijo: ' $' }), []);
  assert.ok(recetas.validarParams('cifra_pildora', {}).length, 'falta valor');
  assert.ok(recetas.validarParams('cifra_pildora', { valor: -1 }).length);
  assert.ok(recetas.validarParams('tarjeta_dato', { titulo: 'x'.repeat(61) }).length);
  assert.deepEqual(recetas.validarParams('sello_animado', {}), []);
  const shot = { id: 's', duracion: 3, recipe: 'tarjeta_dato' };
  const r = recetas.obtener('tarjeta_dato').aplicar({ shot, params: recetas.paramsEfectivos('tarjeta_dato', { titulo: 'Hola' }), tInicio: 10 });
  assert.equal(r.overlays[0].componente, 'tarjeta_dato');
  assert.ok(r.overlays[0].t0 > 10 && r.overlays[0].t1 === 13);
});

test('planEdlARender: una receta animada produce overlay con secuencia y posición; si falla, se omite con aviso', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'edl-anim-'));
  try {
    const edl = cargar('ejemplo-a-short-9x16.json');
    edl.shots[1].recipe = 'cifra_pildora'; edl.shots[1].params = { valor: 500000 };
    const r = await planEdlARender(edl, { dirTemp: dir });
    const anim = r.efectos.overlays.filter(o => o.secuencia);
    assert.equal(anim.length, 1, JSON.stringify(r.avisos));
    assert.ok(anim[0].secuencia.n > 5 && Number.isFinite(anim[0].x) && Number.isFinite(anim[0].y));
    const roto = await planEdlARender(edl, { dirTemp: dir, animar: () => { throw new Error('sin canvas'); } });
    assert.equal(roto.efectos.overlays.filter(o => o.secuencia).length, 0);
    assert.ok(roto.avisos.some(a => /animación 'cifra_pildora' omitida/.test(a)));
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('render real: la píldora roja no está antes de su ventana y sostiene el último fotograma después de animarse', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'edl-pildora-'));
  const jobId = 't-pildora';
  try {
    const azul = path.join(dir, 'azul.mp4');
    ff(['-f', 'lavfi', '-i', 'color=c=blue:size=640x360:rate=30:duration=8', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', azul]);
    const foto = path.join(dir, 'foto.jpg');
    ff(['-f', 'lavfi', '-i', 'color=c=blue:size=640x360', '-frames:v', '1', foto]);
    const audio = path.join(dir, 'audio.mp3');
    ff(['-f', 'lavfi', '-i', 'sine=frequency=440:duration=10', '-c:a', 'libmp3lame', audio]);

    const edl = cargar('ejemplo-a-short-9x16.json');
    edl.shots[1].recipe = 'cifra_pildora'; edl.shots[1].params = { valor: 500000, sufijo: ' $', ancla: 'centro' };
    const r = await planEdlARender(edl, { dirTemp: path.join(dir, 'ov') });
    const [o] = r.efectos.overlays.filter(x => x.secuencia);
    assert.ok(o, JSON.stringify(r.avisos));
    const res = await video.montarVideoPlan(r.plan, { drv_abc: azul, drv_def: azul, foto_01: foto }, audio, jobId, r.efectos);

    // Franja horizontal por el centro de la caja: hay rojo si la píldora está, azul puro si no.
    const rojos = t => {
      let n = 0;
      const y = Math.round(1920 * 0.46);
      for (let x = 300; x <= 780; x += 30) { const p = pixel(res.finalPath, x, y, t); if (p[0] > 190 && p[1] < 70 && p[2] < 90) n++; }
      return n;
    };
    assert.equal(rojos(1.0), 0, 'antes de la ventana no hay píldora');
    assert.ok(rojos(4.2) >= 3, 'después de la animación la píldora roja está en pantalla');
  } finally {
    video.limpiarTemporales(jobId);
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
