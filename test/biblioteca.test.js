// Biblioteca de clips reales: etiquetado con caché, elección por frase (sin inventar), geometría del rostro y regla de 3 s.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const B = require('../edl/biblioteca');
const { dirigir, directorPorReglas, validarDireccion } = require('../edl/director');
const { alinearPalabras, ventanasDeFrases } = require('../edl/tiemposPalabras');
const { ensamblar } = require('../lienzo/ensamblador');

const clip = (id, extra = {}) => ({ id, name: `cuenta_1707795141_7334924255294999814_${id}.mp4`, ruta: `/x/${id}.mp4`, duracion: 20, fecha: '2024-02-13', ...extra });
const etiqueta = (id, extra = {}) => B.limpiarEtiqueta({ descripcion: 'Concurso de belleza en un coliseo, recibe banda y corona', tipo: 'concurso_belleza', vestuario: ['corona', 'banda'], lugar: 'coliseo', personas: 15, rostro: { visible: true, t: 2, cx: 0.58, cy: 0.35, r: 0.1 }, ...extra }, clip(id));

test('fechaDeNombre: el epoch del nombre de TikTok da la fecha; sin patrón devuelve null', () => {
  assert.equal(B.fechaDeNombre('leidy_302006_1707795141_7334924255294999814.mp4'), '2024-02-13');
  assert.equal(B.fechaDeNombre('a59.mp4'), null);
});

test('limpiarEtiqueta: acota rostro y campos, y un tipo desconocido pasa a "otro"', () => {
  const e = B.limpiarEtiqueta({ descripcion: 'x'.repeat(500), tipo: 'hologramas', vestuario: 'no-es-lista', personas: 'muchas', rostro: { visible: true, t: 999, cx: 5, cy: -1, r: 9 } }, clip('a', { duracion: 10 }));
  assert.equal(e.descripcion.length, 300); assert.equal(e.tipo, 'otro'); assert.deepEqual(e.vestuario, []);
  assert.deepEqual([e.rostro.cx, e.rostro.cy, e.rostro.r], [1, 0, 0.6]); assert.ok(e.rostro.t <= 9.9);
  assert.equal(B.limpiarEtiqueta({ rostro: { visible: false } }, clip('b')).rostro, null);
});

test('etiquetarClips: usa y guarda la caché (no repite lo pagado), reintenta una vez y sigue si un clip falla', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bib-')), cache = path.join(dir, 'e.json');
  try {
    const llamadas = []; let fallaB = 0;
    const etiquetador = async (ruta, c) => { llamadas.push(c.id); if (c.id === 'b') { fallaB++; throw new Error('429'); } return { descripcion: `clip ${c.id}`, tipo: 'baile' }; };
    const r1 = await B.etiquetarClips([clip('a'), clip('b'), clip('c')], { cache, etiquetador, concurrencia: 2 });
    assert.deepEqual(Object.keys(r1.etiquetas).sort(), ['a', 'c']); assert.equal(r1.fallos.length, 1); assert.equal(fallaB, 2, 'reintenta una vez');
    llamadas.length = 0;
    const r2 = await B.etiquetarClips([clip('a'), clip('b'), clip('c')], { cache, etiquetador: async (ruta, c) => { llamadas.push(c.id); return { descripcion: 'ok', tipo: 'baile' }; } });
    assert.deepEqual(llamadas, ['b'], 'solo se paga lo que faltaba');
    assert.equal(Object.keys(r2.etiquetas).length, 3);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

const beats = [{ frase: 'Antes ganó Miss Turismo Manabí 2024 en el coliseo.', hechos: [1] }, { frase: 'Hoy sigue en las redes sociales.', hechos: [1] }];
const etiquetas = { c1: etiqueta('c1'), corto: etiqueta('corto', {}) };
etiquetas.corto = { ...etiquetas.corto, duracion: 2 };

test('elegirClips: acepta solo clips del catálogo, con inicio que cabe en 3 s, sin repetir; si falla no inventa ninguno', async () => {
  const ok = await B.elegirClips(beats, etiquetas, { llamar: async () => ({ frases: [{ beat: 1, clip: 'c1', ss: 4, motivo: 'concurso en coliseo, 2024' }, { beat: 2, clip: null, ss: 0, motivo: '' }] }) });
  assert.deepEqual([...ok.elecciones.keys()], [0]); assert.equal(ok.elecciones.get(0).id, 'c1');
  const err = (frases, re) => assert.ok(B.validarElecciones(frases, beats, etiquetas).some(e => re.test(e)), `esperaba ${re}`);
  err([{ beat: 1, clip: 'inventado', ss: 0, motivo: 'x' }], /no está en el catálogo/);
  err([{ beat: 1, clip: 'c1', ss: 19, motivo: 'x' }], /no cabe en un clip/);
  err([{ beat: 1, clip: 'c1', ss: 0, motivo: 'x' }, { beat: 2, clip: 'c1', ss: 5, motivo: 'x' }], /ya se usó/);
  err([{ beat: 1, clip: 'c1', ss: 0, motivo: '' }], /falta el motivo/);
  const mezcla = await B.elegirClips(beats, etiquetas, { llamar: async () => ({ frases: [{ beat: 1, clip: 'c1', ss: 2, motivo: 'bien' }, { beat: 2, clip: 'c1', ss: 5, motivo: 'repetido' }] }) });
  assert.deepEqual([...mezcla.elecciones.keys()], [0], 'se conserva el primer uso y se descarta el repetido');
  assert.ok(mezcla.avisos.some(a => /se descartó lo inválido/.test(a)));
  const mal = await B.elegirClips(beats, etiquetas, { llamar: async () => ({ frases: [{ beat: 1, clip: 'inventado', ss: 0, motivo: 'x' }] }) });
  assert.equal(mal.elecciones.size, 0); assert.ok(mal.avisos.some(a => /sin clips reales/.test(a)));
  const sinRed = await B.elegirClips(beats, etiquetas, { llamar: async () => { throw new Error('sin red'); } });
  assert.equal(sinRed.elecciones.size, 0);
  assert.equal((await B.elegirClips(beats, { corto: etiquetas.corto })).elecciones.size, 0, 'clips de menos de 3 s no se ofrecen');
});

test('elegirClips: la regla del sujeto va en el prompt (solo frases sobre la protagonista) con su nombre', async () => {
  let visto = ''; await B.elegirClips(beats, etiquetas, { protagonista: 'Leidy Alvarez', llamar: async p => { visto = p; return { frases: [] }; } });
  assert.match(visto, /SOLO de Leidy Alvarez/); assert.match(visto, /OTRAS personas/);
});

test('rostroEnVentana: cuadro vertical 9:16 no cambia; uno ancho recorta los lados; uno más alto recorta arriba y abajo', () => {
  const r = { cx: 0.5, cy: 0.4, r: 0.2 };
  const v = B.rostroEnVentana(r, 1080, 1920); assert.ok(Math.abs(v.cx - 0.5) < 1e-9 && Math.abs(v.cy - 0.4) < 1e-9 && Math.abs(v.r - 0.2) < 1e-9);
  const ancho = B.rostroEnVentana({ cx: 0.5, cy: 0.4, r: 0.1 }, 1920, 1080); // 16:9 → solo se ve ~31 % del ancho
  assert.ok(Math.abs(ancho.cx - 0.5) < 1e-9 && ancho.r > 0.1 * 3, `el radio crece al recortar lados (${ancho.r})`);
  const lateral = B.rostroEnVentana({ cx: 0.9, cy: 0.4, r: 0.05 }, 1920, 1080); assert.ok(lateral.cx <= 0.95, 'queda dentro de la ventana');
  const alto = B.rostroEnVentana({ cx: 0.5, cy: 0.3, r: 0.2 }, 720, 1920); assert.ok(alto.cy >= 0.05 && alto.cy <= 0.95 && alto.r === 0.2);
  assert.equal(B.rostroEnVentana(null, 1, 1), null);
});

// ── Director y ensamblador con clips ──
const guion = beats.map(b => b.frase).join(' ');
const oidas = (() => { let t = 0; return guion.split(/\s+/).map(w => ({ w, s: +(t += 0.1).toFixed(2), e: +(t += 0.3).toFixed(2) })); })();
const palabras = alinearPalabras(guion, oidas), V = ventanasDeFrases(beats, palabras);
const elecciones = new Map([[0, { id: 'c1', ss: 4, motivo: 'concurso' }]]);
const cfg = (extra = {}) => ({ foto: fs.readFileSync(path.join(__dirname, '..', 'assets', 'kit', 'cabeza-relleno-mujer.png')), recorte: { cx: 0.5, cy: 0.345, rx: 0.353, ry: 0.28 }, clips: { c1: { ruta: '/x/c1.mp4', ancho: 720, alto: 1280, rostro: { t: 4, cx: 0.5, cy: 0.35, r: 0.15 } } }, ...extra });

test('director: el principal clip solo acepta el candidato; sin candidato o con otro id es error; las reglas lo usan primero', async () => {
  const hechos = [{ texto: 'x' }];
  const base = { beat: 1, principal: 'clip', clip: { id: 'c1', ss: 4, marca: { tipo: 'circulo', ancla: 'Miss' } }, extras: [] };
  const sinPieza = { beat: 2, principal: 'cifra', cifra: { valor: 1, ancla: 'x' }, extras: [] };
  void sinPieza;
  const err = (e, re, clips = elecciones) => assert.ok(validarDireccion([e, { beat: 2, principal: 'mapa', mapa: { lugar: 'Quito', ancla: 'x' }, extras: [] }], beats, hechos, clips).some(x => re.test(x)), `esperaba ${re}`);
  err({ ...base, clip: { ...base.clip, id: 'otro' } }, /debe ser el candidato c1/);
  err({ ...base, clip: { ...base.clip, ss: 9 } }, /inicio \(ss\)/);
  err(base, /no hay clip real candidato/, new Map());
  err({ ...base, clip: { ...base.clip, marca: { tipo: 'subrayado', ancla: 'Miss' } } }, /solo puede ser un círculo/);
  err({ ...base, clip: { ...base.clip, marca: { tipo: 'circulo', ancla: 'zzz' } } }, /palabra ancla/);
  const reglas = directorPorReglas(beats, hechos, elecciones);
  assert.equal(reglas[0].principal, 'clip'); assert.equal(reglas[0].clip.id, 'c1'); assert.notEqual(reglas[1].principal, 'clip');
  assert.deepEqual(validarDireccion(reglas, beats, hechos, elecciones), []);
  const llm = await dirigir(beats, hechos, { clips: elecciones, llamar: async p => { assert.match(p, /clipCandidato|VIDEO REAL/); return { escenas: reglas }; } });
  assert.equal(llm.origen, 'llm');
  // si el modelo no da muñeco para la frase con clip, el código lo completa (la pantalla no queda vacía tras los 3 s)
  const sinMuneco = reglas.map(e => { const { muneco, ...resto } = e; return e.principal === 'clip' ? resto : e; });
  const completado = await dirigir(beats, hechos, { clips: elecciones, llamar: async () => ({ escenas: sinMuneco }) });
  assert.equal(completado.origen, 'llm'); assert.ok(completado.escenas[0].muneco, 'el muñeco se añadió a la frase con clip');
});

test('ensamblar con clip: ventana de a lo sumo 3 s, círculo sobre el rostro en la palabra ancla y regla de 3 s por clip', () => {
  const esc = directorPorReglas(beats, [{ texto: 'x' }], elecciones);
  const r = ensamblar(esc, beats, V, palabras, cfg());
  const ventana = r.elementos.find(e => typeof e.limpiar === 'function'); // solo la ventana del clip tiene limpiar()
  assert.ok(ventana, 'hay ventana con marca (círculo)'); assert.ok(ventana.t1 - ventana.t0 <= B.USO_MAX_S + 1e-9, `≤ 3 s (${ventana.t1 - ventana.t0})`);
  // un clip usado dos veces en total no pasa de 3 s
  const doble = [{ ...esc[0] }, { ...esc[0], beat: 2 }];
  const r2 = ensamblar(doble, beats, V, palabras, cfg());
  const usadas = r2.elementos.filter(e => typeof e.limpiar === 'function');
  const total = usadas.reduce((t, e) => t + (e.t1 - e.t0), 0); assert.ok(total <= B.USO_MAX_S + 1e-6, `uso total del clip ${total.toFixed(2)} s`);
  assert.ok(r2.avisos.some(a => /agotó/.test(a)), 'avisa que se agotó');
  const r3 = ensamblar(esc, beats, V, palabras, cfg({ clips: {} }));
  assert.ok(r3.avisos.some(a => /no está disponible/.test(a)) && r3.elementos.every(e => typeof e.limpiar !== 'function'), 'sin el clip se omite, no se rompe');
  const r4 = ensamblar(esc, beats, V, palabras, cfg({ clips: { c1: { ruta: '/x/c1.mp4', ancho: 720, alto: 1280, rostro: null } } }));
  assert.ok(r4.avisos.some(a => /sin coordenadas del rostro/.test(a)));
});

// ── relleno con criterio ──
test('candidatosRelleno: primero las tomas donde sale ella (sola y con rostro, o en pareja con rostro grande); las demás al final', () => {
  const { candidatosRelleno, esDeLaProtagonista } = require('../edl/biblioteca');
  const e = [
    { id: 'grupo', tipo: 'baile', personas: 4, rostro: { r: 0.3 } },
    { id: 'sola_chica', tipo: 'selfie_hablando', personas: 1, rostro: { r: 0.05 } },
    { id: 'sola', tipo: 'selfie_hablando', personas: 1, rostro: { r: 0.3 } },
    { id: 'pareja_grande', tipo: 'evento', personas: 2, rostro: { r: 0.25 } },
    { id: 'pareja_chica', tipo: 'evento', personas: 2, rostro: { r: 0.15 } },
    { id: 'sin_rostro', tipo: 'paisaje', personas: 0 },
  ];
  assert.equal(esDeLaProtagonista(e[2]), true); assert.equal(esDeLaProtagonista(e[0]), false); assert.equal(esDeLaProtagonista(e[4]), false);
  const ids = candidatosRelleno(e);
  assert.deepEqual(ids.slice(0, 2).sort(), ['pareja_grande', 'sola']); assert.ok(ids.indexOf('grupo') >= 2 && ids.includes('pareja_chica'), 'las demás solo al final'); assert.ok(!ids.includes('sin_rostro'), 'sin rostro no entra');
});
