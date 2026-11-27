const test = require('node:test'), assert = require('node:assert/strict');
const P = require('../edl/puntajeGuion');
const largo = 'Mara llegó a Chone el sábado. Dijo que no hablaría. La gente comentó mucho en redes durante toda la noche y nadie entendía por qué. Se fue sin despedirse. Su hermana confirmó que viajó a Quito esa misma tarde por un asunto familiar muy urgente que no quiso detallar.';

test('puntaje: detecta frases de plantilla en código y baja ese criterio', () => {
  const t = 'Hay un secreto que nadie te cuenta. Olvídate de todo lo que crees saber. Mara viajó.';
  assert.equal(P.detectarPlantillas(t).length, 2); assert.equal(P.detectarPlantillas('Mara viajó a Quito.').length, 0);
  const r = P.combinar({ gancho: 5, concrecion: 5, escalada: 5, cierre: 5 }, t); assert.equal(r.criterios.plantillas, 2);
});
test('puntaje: el total lo calcula el código con pesos fijos (no el modelo) y se mantiene entre 0 y 10', () => {
  const todo10 = P.combinar({ gancho: 10, concrecion: 10, escalada: 10, cierre: 10 }, largo + ' ' + largo), todo0 = P.combinar({ gancho: 0, concrecion: 0, escalada: 0, cierre: 0 }, largo);
  assert.ok(todo10.total > todo0.total); assert.ok(todo10.total <= 10 && todo0.total >= 0);
  assert.equal(P.combinar({ gancho: 99, concrecion: -5, escalada: 'x', cierre: 5 }, largo).criterios.gancho, 10);
  assert.equal(P.combinar({ gancho: 99, concrecion: -5, escalada: 'x', cierre: 5 }, largo).criterios.concrecion, 0);
});
test('puntaje: sin respuesta del modelo el puntaje es parcial (solo código), nunca 0 falso', () => {
  const r = P.combinar(null, largo); assert.equal(r.parcial, true); assert.equal(r.criterios.gancho, null); assert.ok(r.total > 0);
});
test('puntaje: es ciego (al modelo solo viaja el texto del guion) y rechaza guiones cortos', async () => {
  let visto = ''; const r = await P.puntuar(largo, { llamar: async (p, m) => { visto = m; return { gancho: 6, concrecion: 6, escalada: 6, cierre: 6, resumen: 'ok', mejoras: [{ frase: 'x', cambio: 'y' }] }; } });
  assert.match(visto, /^GUION:\nMara/); assert.ok(!/canal|motor|vistas/i.test(visto)); assert.equal(r.mejoras.length, 1);
  await assert.rejects(() => P.puntuar('muy corto'), /demasiado corto/);
  const caido = await P.puntuar(largo, { llamar: async () => { throw new Error('503'); } }); assert.equal(caido.parcial, true);
});
test('puntaje: el ritmo premia mezcla de frases cortas y largas', () => {
  const uniforme = Array(8).fill('uno dos tres cuatro cinco seis siete ocho.').join(' '), mezcla = 'Se fue. Nadie lo esperaba en ese lugar tan lejano a esa hora de la noche. No. Su hermana lo confirmó después de muchas horas de silencio. Eso fue todo. Luego llegó la policía.';
  assert.ok(P.puntajeRitmo(mezcla) > P.puntajeRitmo(uniforme));
});
