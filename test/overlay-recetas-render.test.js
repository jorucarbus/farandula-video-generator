// Capa 2: overlays PNG reales (ffmpeg drawtext) y una EDL con recetas renderizada de punta a punta
// con medios sintéticos. Nunca importa server.js, seleccion, jobStore ni driveCache.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const ffmpegBin = require('ffmpeg-static');
const video = require('../video');
fs.mkdirSync(video.TEMP_DIR, { recursive: true }); // temp-videos no está en git
const { renderPng, resolverFuente, envolver } = require('../overlay/renderPng');
const { planEdlARender } = require('../edl/planEdlARender');

let hayFuente = true;
try { resolverFuente(); } catch { hayFuente = false; }
const sinFuente = { skip: hayFuente ? false : 'no hay tipografía en el sistema (definir OVERLAY_FUENTE)' };

const ff = args => execFileSync(ffmpegBin, ['-y', '-loglevel', 'error', ...args]);
const cargar = n => JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'edl', n), 'utf8'));

// Píxel RGBA (x,y) de una imagen o de un fotograma de video en el segundo t.
function pixel(f, x, y, t = 0) {
  const buf = execFileSync(ffmpegBin, ['-v', 'error', ...(t ? ['-ss', String(t)] : []), '-i', f, '-frames:v', '1',
    '-vf', `format=rgba,crop=1:1:${x}:${y}`, '-f', 'rawvideo', '-pix_fmt', 'rgba', '-']);
  return [buf[0], buf[1], buf[2], buf[3]];
}

test('envolver: parte por palabras sin pasarse del máximo', () => {
  assert.deepEqual(envolver('uno dos tres cuatro', 8), ['uno dos', 'tres', 'cuatro']);
  assert.deepEqual(envolver('  espacios   múltiples ', 30), ['espacios múltiples']);
});

test('renderPng: PNG transparente del tamaño del cuadro con el rótulo dibujado (9:16 y 16:9)', sinFuente, async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'png-'));
  try {
    for (const [w, h] of [[1080, 1920], [1920, 1080]]) {
      const destino = path.join(dir, `lt_${w}.png`);
      await renderPng({ texto: 'Según Medio Z: ¡Última hora, 3 may!', estilo: 'lowerthird', w, h, destino });
      const info = execFileSync(ffmpegBin, ['-v', 'error', '-i', destino, '-f', 'null', '-'], { stdio: ['ignore', 'pipe', 'pipe'] });
      assert.ok(fs.statSync(destino).size > 500);
      assert.equal(pixel(destino, 2, 2)[3], 0, `${w}x${h}: la esquina debe ser transparente`);
      // la franja del lower third (x=6% del ancho, y=74% del alto) tiene que ser opaca
      const franja = pixel(destino, Math.round(w * 0.05), Math.round(h * 0.74) + 10);
      assert.ok(franja[3] > 120, `${w}x${h}: la franja debe tener alfa (vino ${franja[3]})`);
      void info;
    }
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('renderPng: texto con comillas, dos puntos, tildes y ñ no rompe el filtro', sinFuente, async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'png-'));
  try {
    const destino = path.join(dir, 'raro.png');
    await renderPng({ texto: `¿"Nadie" lo vio? Año: 2026 — 'Peña' \\ 50%`, estilo: 'titulo', w: 1080, h: 1920, destino });
    assert.ok(fs.statSync(destino).size > 500);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('renderPng: sin texto o con estilo desconocido lanza', sinFuente, async () => {
  await assert.rejects(renderPng({ texto: '  ', estilo: 'titulo', w: 100, h: 100, destino: path.join(os.tmpdir(), 'x.png') }), /sin texto/);
  await assert.rejects(renderPng({ texto: 'a', estilo: 'neon', w: 100, h: 100, destino: path.join(os.tmpdir(), 'x.png') }), /desconocido/);
});

test('EDL con recetas -> render real: lower third visible solo en su ventana y sello rojo en el rumor', sinFuente, async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'edl-recetas-'));
  const jobId = 't-recetas';
  try {
    // Fondo azul liso: cualquier cosa que no sea azul puro es un overlay.
    const azul = path.join(dir, 'azul.mp4');
    ff(['-f', 'lavfi', '-i', 'color=c=blue:size=640x360:rate=30:duration=8', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', azul]);
    const foto = path.join(dir, 'foto.jpg');
    ff(['-f', 'lavfi', '-i', 'color=c=blue:size=640x360', '-frames:v', '1', foto]);
    const audio = path.join(dir, 'audio.mp3');
    ff(['-f', 'lavfi', '-i', 'sine=frequency=440:duration=10', '-c:a', 'libmp3lame', audio]);

    const edl = cargar('ejemplo-a-short-9x16.json');
    edl.shots[1].recipe = 'source_lowerthird';
    edl.shots[1].params = { texto: 'Según Medio Z, 3 may' };
    const r = await planEdlARender(edl, { dirTemp: path.join(dir, 'ov') });

    assert.equal(r.efectos.overlays.length, 3, JSON.stringify(r.avisos));
    assert.equal(r.efectos.aspect, '9:16');
    assert.ok(r.plan[0].zoom && r.plan[1].zoom && r.plan[2].zoom, 'cada clip lleva el zoom de su receta');
    assert.equal(r.plan[0].zoom.direccion, 'in');   // hook_cold_open
    assert.equal(r.plan[1].zoom.direccion, 'out');  // source_lowerthird
    assert.equal(r.plan[2].zoom.direccion, 'out');  // rumor_stamp

    const archivos = { drv_abc: azul, drv_def: azul, foto_01: foto };
    const res = await video.montarVideoPlan(r.plan, archivos, audio, jobId, r.efectos);
    const [lt] = r.efectos.overlays.filter(o => /lowerthird/.test(o.path));
    assert.ok(lt.t0 > 2.4 && lt.t1 < 4.8, 'la ventana del lower third cae dentro del shot 2');

    // dentro de la ventana: la franja oscura sobre el azul (b baja); fuera: azul puro
    const dentro = pixel(res.finalPath, 50, 1430, 3.5);
    const fuera = pixel(res.finalPath, 50, 1430, 1.0);
    assert.ok(dentro[2] < 130, `dentro de la ventana debe oscurecerse (b=${dentro[2]})`);
    assert.ok(fuera[2] > 200, `fuera de la ventana debe ser azul (b=${fuera[2]})`);
    // sello de rumor (shot 3: 4.8-10 s): caja roja arriba del texto
    const sello = pixel(res.finalPath, 540, 835, 7.0);
    assert.ok(sello[0] > 190 && sello[1] < 70, `el sello debe verse rojo (rgb=${sello.slice(0, 3)})`);
    const sinSello = pixel(res.finalPath, 540, 835, 1.0);
    assert.ok(!(sinSello[0] > 190 && sinSello[1] < 70), 'antes del rumor no hay sello');
  } finally {
    video.limpiarTemporales(jobId);
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('planEdlARender: si el overlay no se puede dibujar, se omite con aviso y el plan sale igual', async () => {
  const edl = cargar('ejemplo-a-short-9x16.json');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'edl-roto-'));
  try {
    const r = await planEdlARender(edl, { dirTemp: dir, renderizar: async () => { throw new Error('sin tipografía'); } });
    assert.equal(r.efectos.overlays.length, 0);
    assert.equal(r.plan.length, 3);
    assert.ok(r.avisos.some(a => /omitido/.test(a)));
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('planEdlARender: una receta reservada cae a clip_kenburns y lo avisa; sin clip se omite', async () => {
  const edl = cargar('ejemplo-b-ranking-16x9.json');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'edl-b-'));
  try {
    const r = await planEdlARender(edl, { dirTemp: dir, renderizar: async () => {} });
    assert.equal(r.efectos.aspect, '16:9');
    assert.equal(r.plan.length, 3);
    assert.ok(r.plan.every(p => p.zoom && p.zoom.pct > 0));
    assert.ok(r.avisos.some(a => /ranking_item/.test(a)));
    assert.deepEqual(r.omitidos, ['r4']);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});
