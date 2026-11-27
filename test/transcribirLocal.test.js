const test = require('node:test'), assert = require('node:assert/strict');
const { transcribir } = require('../edl/transcribirLocal');
const { actaDeAudio } = require('../lecturaFuente');
const palabras = n => ({ duracion: 30, palabras: Array.from({ length: n }, (_, i) => ({ w: 'p' + i, s: i, e: i + 1 })) });

test('transcribir: devuelve el texto si Whisper oyó una noticia; null si oyó muy poco o falla', async () => {
  assert.match(await transcribir('a.mp3', { ejecutar: async () => palabras(40) }), /^p0 p1 /);
  assert.equal(await transcribir('a.mp3', { ejecutar: async () => palabras(5) }), null);
  assert.equal(await transcribir('a.mp3', { ejecutar: async () => { throw new Error('sin python'); } }), null);
});
test('transcribir: SIN_WHISPER=1 lo apaga', async () => {
  process.env.SIN_WHISPER = '1'; try { assert.equal(await transcribir('a.mp3', { ejecutar: async () => palabras(40) }), null); } finally { delete process.env.SIN_WHISPER; }
});
test('actaDeAudio: con transcripción Gemini solo lee TEXTO; sin ella cae al audio como antes', async () => {
  const llamadas = [];
  const extraer = async (tipo, c) => { llamadas.push(tipo); return { hechos: 'h', personas: [] }; };
  const a = await actaDeAudio('x.mp3', 'social', { transcribir: async () => 'texto largo transcrito', extraer });
  assert.equal(a.tipoReal, 'social-whisper'); assert.deepEqual(llamadas, ['transcripcion']);
  const b = await actaDeAudio('x.mp3', 'youtube', { transcribir: async () => null, extraer });
  assert.equal(b.tipoReal, 'youtube-audio'); assert.deepEqual(llamadas, ['transcripcion', 'audio']);
});
