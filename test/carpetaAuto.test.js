const test = require('node:test');
const assert = require('node:assert');
const A = require('../edl/carpetaAuto');

// cotejar falso: solo conoce algunas carpetas (la lógica real es la de famosos.cotejar, ya probada en la app)
const carpetas = ['Mara_Topic', 'Fatima_Bosch', 'nawat', 'Dalia_Bucaram'];
const cotejar = (nombre) => {
  const n = nombre.toLowerCase();
  const c = carpetas.find(f => f.toLowerCase().replace(/_/g, ' ') === n) || (n.includes('nawat') ? 'nawat' : null);
  return c ? { carpeta: c, confianza: c === 'nawat' ? 'media' : 'alta' } : { carpeta: null, confianza: null };
};

test('elige la persona con carpeta más mencionada en la noticia', () => {
  const lectura = { acta: { personas: ['Israel Vélez Arce', 'Nawat Itsaragrisil', 'Mara Topic'], hechos: 'Mara viajó. Mara habló con Nawat. Mara dijo que sí.' }, cronica: { cronica: 'Mara Topic se despidió de Ecuador.', titulo: 'Mara Topic viaja' } };
  const r = A.elegir(lectura, carpetas, { cotejar });
  assert.strictEqual(r.carpeta, 'Mara_Topic'); assert.strictEqual(r.confianza, 'alta'); assert.ok(r.menciones >= 4);
  assert.deepStrictEqual(r.otras.map(o => o.carpeta), ['nawat']);
});

test('sin ninguna persona con carpeta devuelve null', () => {
  assert.strictEqual(A.elegir({ acta: { personas: ['Desconocida Total'], hechos: 'x' }, cronica: 'y' }, carpetas, { cotejar }), null);
  assert.strictEqual(A.elegir({ acta: { personas: [] }, cronica: '' }, carpetas, { cotejar }), null);
  assert.strictEqual(A.elegir(null, carpetas, { cotejar }), null);
});

test('a igualdad de menciones gana la confianza alta y luego el orden de la noticia; no repite carpeta', () => {
  const lectura = { acta: { personas: ['Nawat Itsaragrisil', 'Fatima Bosch', 'Fatima Bosch'], hechos: '' }, cronica: '' };
  const r = A.elegir(lectura, carpetas, { cotejar });
  assert.strictEqual(r.carpeta, 'Fatima_Bosch'); assert.strictEqual(r.otras.length, 1);
});

test('menciones cuenta el nombre completo y sus palabras de 4+ letras, sin tildes', () => {
  assert.strictEqual(A.menciones('Fátima habló. Luego Bosch dijo que Fatima sí.', 'Fátima Bosch'), 3);
  assert.strictEqual(A.menciones('nada que ver', 'Mara Topic'), 0);
});
