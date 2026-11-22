// Compilado horizontal: ensamble de la EDL, guion de puentes con un LLM falso y render real 16:9.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const ffmpegBin = require('ffmpeg-static');
const ffprobeBin = require('ffprobe-static').path;
const video = require('../video');
fs.mkdirSync(video.TEMP_DIR, { recursive: true });
const { armarCompilado, generarPuentes, hechosNuevos, solapamiento, unirAudios, idsDePuentes, duracionDePuente } = require('../edl/compilado');
const { validarEdl } = require('../edl/edlValidator');
const { planEdlARender } = require('../edl/planEdlARender');
const { resolverFuente } = require('../overlay/renderPng');

let hayFuente = true; try { resolverFuente(); } catch { hayFuente = false; }
const sinFuente = { skip: hayFuente ? false : 'no hay tipografía en el sistema' };
const ff = args => execFileSync(ffmpegBin, ['-y', '-loglevel', 'error', ...args]);
const fuente = { tipo: 'tercero', licencia: 'biblioteca_propia', autor: 'biblioteca de Drive', url: 'drive://x' };
const shot = (id, videoId, dur, extra = {}) => ({ id, duracion: dur, recipe: 'clip_kenburns', params: {}, clip: { videoId, famoso: 'X', offset: 0, duracion: dur }, fuente, ...extra });

const historias = () => [
  { tipo: 'historia', titulo: 'El acuerdo de Shakira', shots: [shot('a', 'v1', 2, { recipe: 'hook_cold_open', params: { titulo: 'GANCHO' } }), shot('b', 'v2', 2)] },
  { tipo: 'historia', titulo: 'La gala de Miami', shots: [shot('a', 'v3', 2.5), shot('b', 'v4', 1.5)] },
];

test('armarCompilado: EDL 16:9 válida, apertura de cada historia como ítem de ranking, hook pasa a toma normal', () => {
  const { edl, avisos } = armarCompilado(historias());
  assert.equal(edl.aspect, '16:9');
  assert.equal(edl.shots.length, 4);
  assert.deepEqual(edl.shots.map(s => s.orden), [1, 2, 3, 4]);
  assert.deepEqual(edl.shots.map(s => s.id), ['h1_a', 'h1_b', 'h2_a', 'h2_b']);
  assert.equal(edl.shots[0].recipe, 'ranking_item');
  assert.deepEqual(edl.shots[0].params, { numero: 1, titulo: 'El acuerdo de Shakira', fit: 'auto' });
  assert.equal(edl.shots[2].params.numero, 2);
  assert.equal(edl.shots[1].recipe, 'clip_kenburns');
  assert.equal(edl.shots[1].params.fit, 'auto');
  assert.equal(edl.audio.duracion_s, 8);
  assert.deepEqual(validarEdl(edl).errores, []);
  assert.deepEqual(avisos, []);
});

test('armarCompilado: no muta los segmentos y avisa si un video aparece en dos historias', () => {
  const segs = historias();
  segs[1].shots[0].clip.videoId = 'v1';
  const copia = JSON.stringify(segs);
  const { avisos } = armarCompilado(segs);
  assert.equal(JSON.stringify(segs), copia);
  assert.ok(avisos.some(a => /v1.*historias 1 y 2/.test(a)));
});

test('armarCompilado: puentes con clip entran en su lugar; sin clip se omiten con aviso; tipo desconocido lanza', () => {
  const segs = historias();
  segs.splice(1, 0, { tipo: 'puente', id: 'p1', duracion: 2, clip: { videoId: 'vp', famoso: 'X', offset: 0 } });
  segs.push({ tipo: 'puente', id: 'cierre', duracion: 1.5 });
  const { edl, avisos } = armarCompilado(segs);
  assert.deepEqual(edl.shots.map(s => s.id), ['h1_a', 'h1_b', 'p_p1', 'h2_a', 'h2_b']);
  assert.ok(avisos.some(a => /cierre no tiene clip/.test(a)));
  assert.deepEqual(validarEdl(edl).errores, []);
  assert.throws(() => armarCompilado([{ tipo: 'otro' }]), /tipo desconocido/);
});

test('V2 sigue mandando en el compilado: una toma de 3.0 s con transición falla', () => {
  const segs = historias();
  segs[0].shots[1] = shot('b', 'v2', 3.0);
  const { edl } = armarCompilado(segs);
  edl.transicion_preset = 'todos';
  assert.ok(validarEdl(edl).errores.some(e => e.regla === 'V2'));
});

test('hechosNuevos: marca números y nombres propios que ninguna fuente menciona', () => {
  const fuentes = ['Shakira cerró un acuerdo por 35 millones con Piqué en Miami.'];
  assert.deepEqual(hechosNuevos('Mientras tanto, el acuerdo sigue dando que hablar.', fuentes), []);
  assert.deepEqual(hechosNuevos('Y Shakira lo confirmó en Miami.', fuentes), []);
  assert.deepEqual(hechosNuevos('Según Karol G, el monto subió a 50 millones.', fuentes).sort(), ['50', 'Karol'].sort());
});

test('solapamiento: detecta cuando el puente copia frases de las historias', () => {
  const fuente = ['Shakira cerró un acuerdo millonario con Piqué y nadie lo vio venir en Miami'];
  assert.ok(solapamiento('Shakira cerró un acuerdo millonario con Piqué', fuente) > 0.9);
  assert.equal(solapamiento('Pasemos a otra historia que también dio mucho de qué hablar', fuente), 0);
});

const llm = respuestas => { let n = 0; const f = async () => { const r = respuestas[Math.min(n++, respuestas.length - 1)]; if (r instanceof Error) throw r; return r; }; f.n = () => n; return f; };
const H = [
  { titulo: 'El acuerdo de Shakira', texto: 'Shakira cerró un acuerdo con Piqué por 35 millones de dólares.' },
  { titulo: 'La gala de Miami', texto: 'En Miami la gala terminó con un beso que nadie esperaba.' },
];
const buenos = { puentes: [{ id: 'intro', texto: 'Hoy hay dos historias que están dando de qué hablar.' }, { id: 'p1', texto: 'Cambiamos de escenario, aunque el chisme sigue.' }, { id: 'cierre', texto: 'Eso es todo por hoy, nos vemos pronto.' }] };

test('generarPuentes: textos válidos del LLM, sin datos nuevos, con los ids correctos', async () => {
  assert.deepEqual(idsDePuentes(2), ['intro', 'p1', 'cierre']);
  const r = await generarPuentes(H, { llamar: llm([buenos]) });
  assert.equal(r.origen, 'llm');
  assert.deepEqual(r.puentes.map(p => p.id), ['intro', 'p1', 'cierre']);
});

test('generarPuentes: rechaza datos inventados, reintenta con el motivo y se corrige', async () => {
  const malo = { puentes: [{ id: 'intro', texto: 'Hoy: Karol G y un escándalo de 40 millones.' }, buenos.puentes[1], buenos.puentes[2]] };
  const l = llm([malo, buenos]);
  const r = await generarPuentes(H, { llamar: l });
  assert.equal(r.origen, 'llm');
  assert.equal(l.n(), 2);
});

test('generarPuentes: si insiste en inventar, usa los puentes deterministas (solo títulos) tras 2 reintentos', async () => {
  const malo = { puentes: [{ id: 'intro', texto: 'Hoy: Karol G y un escándalo de 40 millones.' }, buenos.puentes[1], buenos.puentes[2]] };
  const l = llm([malo, malo, malo, malo]);
  const r = await generarPuentes(H, { llamar: l });
  assert.equal(r.origen, 'respaldo');
  assert.equal(l.n(), 3);
  assert.match(r.puentes[0].texto, /El acuerdo de Shakira; La gala de Miami/);
  assert.deepEqual(hechosNuevos(r.puentes.map(p => p.texto).join(' '), H.map(h => h.titulo + ' ' + h.texto)), []);
});

test('generarPuentes: textos largos o que copian la historia se rechazan; si el modelo falla, respaldo', async () => {
  const largo = { puentes: [{ id: 'intro', texto: 'palabra '.repeat(60) }, buenos.puentes[1], buenos.puentes[2]] };
  assert.equal((await generarPuentes(H, { llamar: llm([largo, largo, largo]) })).origen, 'respaldo');
  const copia = { puentes: [{ id: 'intro', texto: 'Shakira cerró un acuerdo con Piqué por 35 millones de dólares.' }, buenos.puentes[1], buenos.puentes[2]] };
  assert.equal((await generarPuentes(H, { llamar: llm([copia, copia, copia]) })).origen, 'respaldo');
  const r = await generarPuentes(H, { llamar: llm([new Error('503')]) });
  assert.equal(r.origen, 'respaldo');
  assert.ok(r.avisos.some(a => /503/.test(a)));
});

test('duracionDePuente: 150 ppm con piso de 1.5 s', () => {
  assert.equal(duracionDePuente('uno dos'), 1.5);
  assert.equal(duracionDePuente(Array(25).fill('palabra').join(' ')), 10);
});

test('compilado de punta a punta: audios unidos + render 16:9 con tomas verticales sin barras negras', sinFuente, async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'compilado-'));
  const jobId = 't-compilado';
  try {
    const vertical = path.join(dir, 'vertical.mp4');
    ff(['-f', 'lavfi', '-i', 'color=c=green:size=360x640:rate=30:duration=8', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', vertical]);
    const horizontal = path.join(dir, 'horizontal.mp4');
    ff(['-f', 'lavfi', '-i', 'color=c=green:size=1280x720:rate=30:duration=8', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', horizontal]);
    const a1 = path.join(dir, 'a1.mp3'); const a2 = path.join(dir, 'a2.mp3');
    ff(['-f', 'lavfi', '-i', 'sine=frequency=440:duration=4', '-c:a', 'libmp3lame', a1]);
    ff(['-f', 'lavfi', '-i', 'sine=frequency=330:duration=4', '-c:a', 'libmp3lame', a2]);
    const audio = await unirAudios([a1, a2], path.join(dir, 'todo.mp3'));
    const dAudio = Number(execFileSync(ffprobeBin, ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', audio]).toString());
    assert.ok(Math.abs(dAudio - 8) < 0.2, `audio unido ${dAudio}`);

    const { edl } = armarCompilado(historias());
    const r = await planEdlARender(edl, { dirTemp: path.join(dir, 'ov') });
    assert.ok(r.plan.every(p => p.fit === 'auto'), 'todas las tomas llevan fit auto');
    const archivos = { v1: vertical, v2: horizontal, v3: vertical, v4: horizontal };
    const res = await video.montarVideoPlan(r.plan, archivos, audio, jobId, r.efectos);
    const info = JSON.parse(execFileSync(ffprobeBin, ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height', '-show_entries', 'format=duration', '-of', 'json', res.finalPath]).toString());
    assert.equal(info.streams[0].width, 1920);
    assert.equal(info.streams[0].height, 1080);
    assert.ok(Math.abs(Number(info.format.duration) - 8) < 0.3);

    // toma vertical (primer segundo): la esquina es verde (fondo desenfocado), no negra
    const px = execFileSync(ffmpegBin, ['-v', 'error', '-ss', '0.5', '-i', res.finalPath, '-frames:v', '1', '-vf', 'format=rgb24,crop=1:1:5:5', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-']);
    assert.ok(px[1] > 100 && px[0] < 90 && px[2] < 90, `esquina rgb=${[...px]}`);
  } finally {
    video.limpiarTemporales(jobId);
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('video.decidirFit: auto elige contain_blur solo si el metraje difiere del formato', () => {
  const f = { w: 1920, h: 1080 };
  assert.equal(video.decidirFit('auto', { w: 1280, h: 720 }, f), 'cover');
  assert.equal(video.decidirFit('auto', { w: 360, h: 640 }, f), 'contain_blur');
  assert.equal(video.decidirFit('auto', null, f), 'cover');
  assert.equal(video.decidirFit('contain_blur', { w: 1280, h: 720 }, f), 'contain_blur');
});
