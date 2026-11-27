const test = require('node:test');
const assert = require('node:assert');
const G = require('../edl/graficosSociales');

const figuras = [
  { nombre: 'Amelia Vega', foto: 'a.jpg', alias: ['amelia', 'vega'] },
  { nombre: 'Fátima Bosch', foto: 'b.jpg', alias: ['fatima', 'bosch'] },
  { nombre: 'Mara Topic', foto: 'c.jpg', alias: ['mara', 'topic'] },
];
const escenas = n => Array.from({ length: n }, (_, i) => ({ beat: i + 1, principal: 'video', extras: [] }));

test('VS: verbo de confrontación + dos personas con foto en la misma frase', () => {
  const beats = [{ frase: 'Amelia Vega criticó a Fátima Bosch sin filtro.' }];
  const r = G.asignarSociales(escenas(1), beats, figuras);
  assert.strictEqual(r.escenas[0].social.tipo, 'vs');
  assert.deepStrictEqual([r.escenas[0].social.a.nombre, r.escenas[0].social.b.nombre], ['Amelia Vega', 'Fátima Bosch']);
  assert.strictEqual(r.escenas[0].social.ancla, 'critico');
});

test('sin dos personas o sin verbo de confrontación, no hay VS', () => {
  assert.strictEqual(G.asignarSociales(escenas(1), [{ frase: 'Amelia Vega criticó el certamen entero.' }], figuras).escenas[0].social, undefined);
  assert.strictEqual(G.asignarSociales(escenas(1), [{ frase: 'Amelia Vega y Fátima Bosch posaron juntas.' }], figuras).escenas[0].social, undefined);
});

test('apoyo del público: siluetas; apoyo a una persona: su foto', () => {
  const pub = G.asignarSociales(escenas(1), [{ frase: 'Los fans la apoyaron con miles de mensajes.' }], figuras).escenas[0].social;
  assert.strictEqual(pub.tipo, 'apoyo'); assert.deepStrictEqual(pub.fotos, []);
  const uno = G.asignarSociales(escenas(1), [{ frase: 'Mara Topic recibió el respaldo de su familia.' }], figuras).escenas[0].social;
  assert.strictEqual(uno.tipo, 'apoyo');
});

test('tope: un VS y un apoyo por video, nunca en frases seguidas', () => {
  const beats = Array.from({ length: 6 }, () => ({ frase: 'Amelia Vega criticó a Fátima Bosch.' }));
  const r = G.asignarSociales(escenas(6), beats, figuras);
  assert.strictEqual(r.escenas.filter(e => e.social).length, 1);
  const ap = Array.from({ length: 4 }, () => ({ frase: 'Los fans apoyaron a Mara Topic.' }));
  assert.strictEqual(G.asignarSociales(escenas(4), ap, figuras).escenas.filter(e => e.social).length, 1);
});

test('no se pone sobre un gráfico principal ni sobre esquinas ocupadas', () => {
  const beats = [{ frase: 'Amelia Vega criticó a Fátima Bosch.' }, { frase: 'Amelia Vega criticó a Fátima Bosch.' }, { frase: 'Amelia Vega criticó a Fátima Bosch.' }];
  const e = escenas(3); e[0].principal = 'mapa'; e[1].personas = [{ nombre: 'x' }];
  const r = G.asignarSociales(e, beats, figuras);
  assert.strictEqual(r.escenas[0].social, undefined); assert.strictEqual(r.escenas[1].social, undefined); assert.strictEqual(r.escenas[2].social.tipo, 'vs');
});

test('ensamblar: la escena con `social` agrega el VS y el apoyo en la palabra ancla, sin romper', () => {
  const fs = require('fs'), path = require('path');
  const { alinearPalabras, ventanasDeFrases } = require('../edl/tiemposPalabras');
  const { directorPorReglas } = require('../edl/director');
  const { ensamblar } = require('../lienzo/ensamblador');
  const beats = [{ frase: 'Amelia Vega criticó a Fátima Bosch sin filtro.', rol: 'dato', hechos: [] }, { frase: 'Los fans apoyaron a Mara Topic con mucho cariño.', rol: 'dato', hechos: [] }];
  const guion = beats.map(b => b.frase).join(' '), oidas = (() => { let t = 0; return guion.split(/\s+/).map(w => ({ w, s: +(t += 0.1).toFixed(2), e: +(t += 0.3).toFixed(2) })); })();
  const palabras = alinearPalabras(guion, oidas), V = ventanasDeFrases(beats, palabras);
  const esc = directorPorReglas(beats, [], null, { sinMuneco: true });
  const so = G.asignarSociales(esc, beats, figuras, { maxApoyo: 1 }); // 2 frases seguidas: solo entra la primera
  assert.strictEqual(so.escenas[0].social.tipo, 'vs');
  const cfg = { foto: fs.readFileSync(path.join(__dirname, '..', 'assets', 'kit', 'cabeza-relleno-mujer.png')), recorte: { cx: 0.5, cy: 0.345, rx: 0.353, ry: 0.28 }, clips: {} };
  const r = ensamblar(so.escenas, beats, V, palabras, cfg);
  assert.ok(r.elementos.some(e => (e.eventos || []).some(x => x.sonido === 'golpe')), 'hay un VS (suena el golpe)');
  assert.ok(r.claves.size >= 1);
});

test('abajo (video de fondo, sin muñeco): el VS no se bloquea por insignias ni personas de arriba, y caben 2', () => {
  const figuras = [{ nombre: 'Mara', foto: 'a.jpg', alias: ['mara'] }, { nombre: 'Conny', foto: 'b.jpg', alias: ['conny'] }];
  const bs = [{ frase: 'Mara criticó a Conny.' }, { frase: 'Otra frase.' }, { frase: 'Conny respondió contra Mara.' }];
  const mk = () => [{ beat: 1, principal: 'video', extras: [{ tipo: 'insignia' }] }, { beat: 2, principal: 'video', extras: [] }, { beat: 3, principal: 'video', extras: [{ tipo: 'insignia' }] }];
  assert.equal(G.asignarSociales(mk(), bs, figuras).escenas.filter(e => e.social).length, 0); // arriba: las insignias lo bloquean
  assert.equal(G.asignarSociales(mk(), bs, figuras, { abajo: true }).escenas.filter(e => e.social && e.social.tipo === 'vs').length, 2);
  assert.equal(G.asignarSociales([{ beat: 1, principal: 'cita', extras: [] }, ...mk().slice(1)], bs, figuras, { abajo: true }).escenas[0].social, undefined); // no se pisa una cita
});
