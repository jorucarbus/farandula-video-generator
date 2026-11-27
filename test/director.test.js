// Director de escena (validador, reglas, modelo con respaldo) y ensamblador (tiempos por palabra, diseños, muñeco continuo).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { dirigir, directorPorReglas, validarEscena, validarDireccion, normalizarEscena, LUGARES } = require('../edl/director');
const { alinearPalabras, ventanasDeFrases } = require('../edl/tiemposPalabras');
const { ensamblar } = require('../lienzo/ensamblador');

const hechos = [{ texto: 'Ganó.' }, { texto: 'Los medios aseguran que recibió un premio.', confirmado: false }, { texto: 'Compitió contra 12 aspirantes en Chone.' }];
const beats = [
  { frase: 'Leidy inició como bastonera y ahora ganó la corona.', rol: 'persona', hechos: [1] },
  { frase: 'Compitió contra 12 aspirantes en Chone el 30 de octubre de 2026.', rol: 'cifra', hechos: [3] },
  { frase: 'Según los medios, recibió un premio especial.', rol: 'rumor', hechos: [2] },
];
const E1 = () => ({ beat: 1, principal: 'muneco', muneco: { traje: 'bastonera', pose: 'celebrar', emocion: 'feliz', accesorio: 'corona', ancla_pose: 'ganó', ancla_emocion: 'ganó', ancla_accesorio: 'corona', pegatina: { id: 'baston', ancla: 'bastonera' } }, extras: [] });
const E2 = () => ({ beat: 2, principal: 'cifra', cifra: { valor: 12, sufijo: 'aspirantes', ancla: '12' }, extras: [{ tipo: 'insignia', icono: 'map-pin', etiqueta: 'Chone', ancla: 'Chone' }] });
const E3 = () => ({ beat: 3, principal: 'muneco', muneco: { traje: 'bastonera', pose: 'reposo', emocion: 'triste' }, extras: [{ tipo: 'sello', ancla: 'Según' }] });
const buenas = () => [E1(), E2(), E3()];

test('una dirección fiel a las frases pasa sin errores', () => assert.deepEqual(validarDireccion(buenas(), beats, hechos), []));

test('rechaza lo que no está en la frase, lo fuera de catálogo y lo imposible', () => {
  const err = (e, re) => assert.ok(validarEscena(e, beats, hechos).some(x => re.test(x)), `esperaba ${re}: ${JSON.stringify(validarEscena(e, beats, hechos))}`);
  err({ ...E2(), extras: [{ tipo: 'insignia', icono: 'map-pin', etiqueta: 'Guayaquil', ancla: 'Chone' }] }, /no está literalmente/);
  err({ ...E2(), extras: [{ tipo: 'insignia', icono: 'map-pin', etiqueta: 'Chone', ancla: 'Quito' }] }, /palabra ancla/);
  err({ ...E2(), extras: [{ tipo: 'insignia', icono: 'no-existe', etiqueta: 'Chone', ancla: 'Chone' }] }, /no existe/);
  err({ ...E2(), cifra: { valor: 13, ancla: '12' } }, /cifra 13 no está/);
  err({ beat: 2, principal: 'mapa', mapa: { lugar: 'Atlantis', ancla: 'Chone' }, extras: [] }, /fuera del catálogo/);
  err({ beat: 2, principal: 'mapa', mapa: { lugar: 'Quito', ancla: 'Chone' }, extras: [] }, /no está literalmente/);
  err({ ...E2(), muneco: E1().muneco }, /solo puede ir con principal/);
  err({ ...E1(), muneco: { ...E1().muneco, traje: 'gala' } }, /no tiene la pose celebrar/);
  err({ ...E1(), muneco: { ...E1().muneco, emocion: 'furia' } }, /emoción/);
  err({ ...E1(), extras: [1, 2, 3].map(() => ({ tipo: 'insignia', icono: 'crown', etiqueta: 'corona', ancla: 'corona' })) }, /más de 2 extras/);
  err({ ...E2(), extras: [{ tipo: 'sello', ancla: 'Chone' }] }, /sin hechos no confirmados/);
  err({ beat: 1, principal: 'hologramas' }, /fuera del catálogo/);
  assert.ok(validarDireccion([E1(), E2()], beats, hechos).some(x => /beat 3: sin escena/.test(x)), 'toda frase necesita escena');
});

test('director por reglas: cumple su propia validación y detecta lugar, cifra, fecha y rumor', () => {
  const esc = directorPorReglas(beats, hechos);
  assert.deepEqual(validarDireccion(esc, beats, hechos), []);
  assert.equal(esc[0].principal, 'muneco'); assert.equal(esc[0].muneco.pose, 'celebrar'); assert.equal(esc[0].muneco.accesorio, 'corona');
  assert.ok(['mapa', 'cifra'].includes(esc[1].principal));
  assert.ok(esc[1].extras.some(x => x.icono === 'calendar-event'), 'la fecha va como insignia de calendario');
  assert.ok(esc[2].extras.some(x => x.tipo === 'sello'), 'el hecho no confirmado lleva sello');
  assert.ok(Object.keys(LUGARES).includes('Chone'));
});

test('normalizarEscena acepta la variante {elementos:[texto]} de las listas', () => {
  const n = normalizarEscena({ beat: 1, principal: 'lista', lista: { elementos: ['Chonera Bonita 2023', 'Miss Turismo Manabí 2024'], ancla: 'x' } });
  assert.deepEqual(n.lista.items.map(i => i.texto), ['Chonera Bonita 2023', 'Miss Turismo Manabí 2024']);
  assert.equal(n.lista.items[0].ancla, 'chonera');
});

test('dirigir: reintenta con los errores; sin arreglo o sin modelo cae a las reglas', async () => {
  const prompts = []; const llamar = async p => { prompts.push(p); return { escenas: prompts.length === 1 ? [{ beat: 1, principal: 'hologramas' }] : buenas() }; };
  const r = await dirigir(beats, hechos, { llamar });
  assert.equal(r.origen, 'llm'); assert.equal(prompts.length, 2); assert.match(prompts[1], /Tu respuesta anterior tuvo estos problemas/);
  const mal = await dirigir(beats, hechos, { llamar: async () => ({ escenas: [{ beat: 1, principal: 'hologramas' }] }) });
  assert.equal(mal.origen, 'respaldo'); assert.deepEqual(validarDireccion(mal.escenas, beats, hechos), []);
  const caido = await dirigir(beats, hechos, { llamar: async () => { throw new Error('sin red'); } });
  assert.equal(caido.origen, 'respaldo'); assert.ok(caido.avisos.some(a => /sin red/.test(a)));
});

// ── Ensamblador ──
const guion = beats.map(b => b.frase).join(' ');
const oidas = (() => { let t = 0; return guion.split(/\s+/).map(w => ({ w, s: +(t += 0.1).toFixed(2), e: +(t += 0.3).toFixed(2) })); })();
const palabras = alinearPalabras(guion, oidas), V = ventanasDeFrases(beats, palabras);
const cfg = { foto: fs.readFileSync(path.join(__dirname, '..', 'assets', 'kit', 'cabeza-relleno-mujer.png')), recorte: { cx: 0.5, cy: 0.345, rx: 0.353, ry: 0.28 } };

test('ensamblar: muñeco por tramos, la corona cae en su palabra y todas las ventanas son válidas', () => {
  const { elementos, claves } = ensamblar([E1(), E2(), E3()], beats, V, palabras, cfg);
  const munecos = elementos.filter(e => e.flota === false);
  assert.equal(munecos.length, 2, 'dos tramos de muñeco (frase 1 y frase 3; la 2 no lo lleva)');
  assert.equal(munecos[0].t0, V[0].t0 + 0.1);
  const tCorona = palabras.find(p => /corona/.test(p.palabra)).t0;
  assert.ok(munecos[0].eventos.some(v => v.sonido === 'ding' && Math.abs(v.t - (tCorona + 0.45)) < 1e-6), 'la corona cae en su palabra');
  assert.ok(elementos.every(e => e.t1 > e.t0 && e.t0 >= 0), 'todas las ventanas válidas');
  assert.ok(claves.size >= 3, 'hay palabras clave para subrayar');
});

test('ensamblar: el marcador del mapa cae en el nombre del lugar y un lugar desconocido lanza', () => {
  const mapa = { beat: 2, principal: 'mapa', mapa: { lugar: 'Chone', ancla: 'Chone' }, extras: [] };
  const m = ensamblar([mapa], beats, V, palabras, cfg).elementos[0];
  const tChone = palabras.find((p, i) => i >= V[1].desde && /Chone/.test(p.palabra)).t0;
  assert.ok(m.eventos.some(v => v.sonido === 'golpe' && Math.abs(v.t - (tChone + 0.45)) < 1e-6), 'el pin aterriza 0.45 s después de decir Chone');
  assert.throws(() => ensamblar([{ beat: 2, principal: 'mapa', mapa: { lugar: 'Atlantis', ancla: 'x' } }], beats, V, palabras, cfg));
  const lista = { beat: 2, principal: 'lista', lista: { titulo: 'Datos', items: [{ texto: '12 aspirantes', ancla: '12' }, { texto: 'Chone', ancla: 'Chone' }] }, extras: [] };
  assert.equal(ensamblar([lista], beats, V, palabras, cfg).elementos.length, 1);
});

test('ensamblar: los huecos sin pieza principal se llenan con clips de relleno y ninguno pasa de 3 s en total', () => {
  const relleno = { ids: ['a', 'b'], info: id => ({ ruta: id + '.mp4', rostro: { t: 1, cx: 0.5, cy: 0.3, r: 0.2 }, duracion: 8 }) };
  const solo1 = [{ beat: 1, principal: 'cifra', cifra: { valor: 12, sufijo: 'aspirantes', ancla: '12' }, extras: [] }];
  const sin = ensamblar(solo1, beats, V, palabras, cfg), con = ensamblar(solo1, beats, V, palabras, { ...cfg, relleno });
  const ventanas = con.elementos.slice(sin.elementos.length); // el relleno se agrega al final
  assert.ok(ventanas.length >= 1, 'se agregó al menos un clip de relleno');
  for (const v of ventanas) assert.ok(v.t1 - v.t0 <= 3.0001, 'cada aparición ≤ 3 s');
  assert.ok(ventanas.reduce((s, v) => s + v.t1 - v.t0, 0) <= 6.0001, 'dos clips disponibles: 3 s cada uno como máximo');
  assert.equal(sin.elementos.length + ventanas.length, con.elementos.length);
  const agotado = ensamblar(solo1, beats, V, palabras, { ...cfg, relleno: { ids: ['a'], info: relleno.info } });
  assert.ok(agotado.elementos.slice(sin.elementos.length).reduce((s, v) => s + v.t1 - v.t0, 0) <= 3.0001, 'un solo clip no pasa de 3 s en total');
  assert.ok(agotado.avisos.some(a => /sin clips de relleno/.test(a)), 'si se agotan los clips lo avisa en vez de repetir uno pasando de 3 s');
});

test('ensamblar con montaje: el video solo va con cifras, listas y clips pedidos; tomas distintas, ≤ 3 s con la transición, debajo de todo', () => {
  const E = require('../lienzo/elementos');
  const ids = Array.from({ length: 30 }, (_, i) => 'c' + i), montaje = { ids, info: id => ({ ruta: id + '.mp4', rostro: { t: 1, cx: 0.5, cy: 0.3, r: 0.2 }, duracion: 8 }) };
  const clipInfo = { c7: { ruta: 'c7.mp4', ancho: 720, alto: 1280, rostro: { t: 1, cx: 0.5, cy: 0.4, r: 0.2 }, duracion: 8 } };
  const esc = [{ beat: 1, principal: 'clip', clip: { id: 'c7', ss: 2, marca: { tipo: 'circulo', ancla: 'bastonera' } }, muneco: E1().muneco, extras: [] }, E2(), E3()];
  const r = ensamblar(esc, beats, V, palabras, { ...cfg, clips: clipInfo, montaje });
  const ms = r.elementos.filter(e => e.cortes); assert.ok(ms.length >= 2, 'un tramo para el clip pedido y otro para la cifra');
  assert.equal(r.elementos.indexOf(ms[0]) < r.elementos.findIndex(e => !e.cortes), true, 'el montaje va primero (queda debajo)');
  const cortes = ms.flatMap(m => m.cortes), clips = cortes.map(c => c.clip); assert.equal(new Set(clips).size, clips.length, 'ningún clip se repite');
  assert.ok(clips.includes('c7.mp4'), 'el clip que pidió el director entra en el montaje');
  for (const c of cortes) assert.ok(c.t1 - c.t0 + E.TRANS <= 3.0001, 'toma + transición ≤ 3 s: ' + (c.t1 - c.t0));
  for (const m of ms) for (let k = 1; k < m.cortes.length; k++) assert.ok(Math.abs(m.cortes[k].t0 - m.cortes[k - 1].t1) < 1e-6, 'sin huecos entre tomas');
  assert.ok(cortes.some(c => c.marcas.length === 1), 'el círculo rojo va en la toma pedida');
  const frase3 = [V[2].t0, V[2].t1]; assert.ok(ms.every(m => m.t0 < frase3[0] && m.t1 <= frase3[0] + 0.45), 'con el muñeco solo (frase 3) no hay video de fondo');
  const m1 = ms.find(m => m.cortes.some(c => c.clip === 'c7.mp4')); assert.ok(m1.t1 - m1.t0 + E.TRANS <= 3.0001, 'el clip pedido, con su transición, dura menos de 3 s');
  const sin = ensamblar(esc, beats, V, palabras, { ...cfg, clips: { c7: { ruta: 'c7.mp4', ancho: 720, alto: 1280, rostro: null } } });
  assert.ok(!sin.elementos.some(e => e.cortes), 'sin montaje conserva el diseño anterior');
});

// ── modo SIN MUÑECO ──
test('director por reglas en modo sin muñeco: nunca hay muñeco; lo que iba al muñeco pasa a video', () => {
  const { directorPorReglas, validarDireccion } = require('../edl/director');
  const beats = [{ frase: 'Dalia ganó la corona en Chone.', rol: 'persona', hechos: [1] }, { frase: 'Estudia Psicología y hace voluntariado.', rol: 'persona', hechos: [2] }], hechos = [{ texto: 'a' }, { texto: 'b' }];
  const esc = directorPorReglas(beats, hechos, null, { sinMuneco: true });
  assert.ok(esc.every(e => !e.muneco), 'ninguna escena trae muñeco');
  assert.ok(esc.some(e => e.principal === 'video'), 'las frases sin dato quedan como video (tomas reales)');
  assert.deepEqual(validarDireccion(esc, beats, hechos), []);
});
test('quitarMuneco convierte el principal muneco en video y borra los datos del muñeco', () => {
  const { quitarMuneco } = require('../edl/director');
  const e = quitarMuneco({ beat: 1, principal: 'muneco', muneco: { traje: 'bastonera' }, extras: [] });
  assert.equal(e.principal, 'video'); assert.equal(e.muneco, undefined);
});
test('una cifra pequeña escrita con letras ("dos piezas") no es un dato destacable', () => {
  const { validarEscena } = require('../edl/director');
  const beats = [{ frase: 'Eligió un conjunto de dos piezas azul.', hechos: [] }];
  const errs = validarEscena({ beat: 1, principal: 'cifra', cifra: { valor: 2, sufijo: 'piezas', ancla: 'dos' }, extras: [] }, beats, []);
  assert.ok(errs.some(x => /pequeña/.test(x)), errs.join(' | '));
});

test('mapa de un PAÍS: el director por reglas lo detecta y el validador exige el país literal en la frase', () => {
  const { directorPorReglas, validarEscena, PAISES } = require('../edl/director');
  const beats = [{ frase: 'La final será en Puerto Rico.', hechos: [] }];
  const e = directorPorReglas(beats, [], null, { sinMuneco: true })[0];
  assert.equal(e.principal, 'mapa'); assert.equal(e.mapa.pais, 'Puerto Rico'); assert.ok(PAISES['Puerto Rico']);
  assert.deepEqual(validarEscena(e, beats, []), []);
  assert.ok(validarEscena({ beat: 1, principal: 'mapa', mapa: { pais: 'Francia', ancla: 'final' }, extras: [] }, beats, []).length > 0, 'un país que la frase no dice no pasa');
});

test('gráfico de barras: dos o más cifras con su palabra lo activan y el validador exige cifras y etiquetas literales de la frase', () => {
  const { directorPorReglas, validarEscena } = require('../edl/director');
  const beats = [{ frase: 'Acumula 6 años de carrera y 12 rivales vencidas.', hechos: [] }];
  const e = directorPorReglas(beats, [], null, { sinMuneco: true })[0];
  assert.equal(e.principal, 'grafico'); assert.equal(e.grafico.items.length, 2); assert.deepEqual(validarEscena(e, beats, []), []);
  const mala = { beat: 1, principal: 'grafico', grafico: { items: [{ etiqueta: 'años', valor: 6, ancla: 'seis' }, { etiqueta: 'premios', valor: 9, ancla: 'nueve' }] }, extras: [] };
  assert.ok(validarEscena(mala, beats, []).length > 0, 'una cifra o etiqueta que la frase no dice no pasa');
});

test('cita: se acepta si es literal de la frase y se rechaza si no lo es o es muy corta', () => {
  const bs = [{ frase: 'Mara respondió: «No voy a permitir que me falten el respeto» y se fue.', rol: 'persona', hechos: [] }];
  const ok = { beat: 1, principal: 'cita', cita: { texto: 'No voy a permitir que me falten el respeto', autor: 'Mara', ancla: 'No' }, extras: [] };
  assert.deepEqual(validarEscena(ok, bs, []), []);
  assert.ok(validarEscena({ ...ok, cita: { ...ok.cita, texto: 'No voy a permitir que me insulten' } }, bs, []).some(x => /literalmente/.test(x)));
  assert.ok(validarEscena({ ...ok, cita: { ...ok.cita, texto: 'No voy' } }, bs, []).some(x => /4 a 22/.test(x)));
  assert.ok(validarEscena({ ...ok, cita: { ...ok.cita, autor: 'Pedro' } }, bs, []).some(x => /autor/.test(x)));
});

test('director por reglas sin muñeco: lo entrecomillado pasa a tarjeta de cita', () => {
  const bs = [{ frase: 'Mara respondió: «No voy a permitir que me falten el respeto» y se fue.', rol: 'persona', hechos: [] }];
  const [e] = directorPorReglas(bs, [], null, { sinMuneco: true });
  assert.equal(e.principal, 'cita'); assert.equal(e.cita.texto, 'No voy a permitir que me falten el respeto'); assert.deepEqual(validarEscena(e, bs, []), []);
  assert.notEqual(directorPorReglas(bs, [], null, { sinMuneco: false })[0].principal, 'cita'); // con muñeco no hay tarjeta de cita
});

test('ensamblar: la cita entra en su primera palabra, y con montaje la frase queda cubierta por tomas (sin hueco)', () => {
  const cita = { beat: 2, principal: 'cita', cita: { texto: 'Compitió contra 12 aspirantes', autor: '', ancla: 'Compitió' }, extras: [] };
  const r = ensamblar([cita], beats, V, palabras, cfg).elementos;
  assert.equal(r.length, 1);
  const tIni = palabras.find((p, i) => i >= V[1].desde && /Compiti/.test(p.palabra)).t0;
  assert.ok(Math.abs(r[0].t0 - Math.max(0, tIni - 0.3)) < 1e-6, 'aparece 0,3 s antes de decir la primera palabra');
  // con montaje y sin muñeco: un principal que antes dejaba la pantalla vacía (cita) ahora lleva tomas de fondo
  const montaje = { ids: ['a', 'b', 'c', 'd', 'e', 'f'], info: id => ({ ruta: id + '.mp4', rostro: { t: 0, cx: 0.5, cy: 0.4, r: 0.2 }, duracion: 20, ancho: 720, alto: 1280 }) };
  const conM = ensamblar([cita], beats, V, palabras, { ...cfg, montaje }).elementos;
  assert.ok(conM.some(e => e.cortes && e.cortes.length && e.t0 <= V[1].t0 + 0.01 && e.t1 >= V[1].t1 - 0.5), 'la frase de la cita lleva montaje debajo');
});

test('dirigir: una escena mala no tumba las buenas (se reemplaza solo la inválida por reglas)', async () => {
  const llamar = async () => ({ escenas: [E1(), E2(), { beat: 3, principal: 'hologramas' }] });
  const r = await dirigir(beats, hechos, { llamar, maxReintentos: 0 });
  assert.equal(r.origen, 'mixto'); assert.deepEqual(validarDireccion(r.escenas, beats, hechos), []);
  assert.equal(r.escenas[0].principal, 'muneco'); assert.equal(r.escenas[1].principal, 'cifra', 'las buenas del modelo se conservan');
  assert.ok(r.avisos.some(a => /acertó 2 de 3/.test(a)));
});
