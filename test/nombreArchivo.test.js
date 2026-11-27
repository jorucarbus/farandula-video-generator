const test = require('node:test'), assert = require('node:assert'), NA = require('../edl/nombreArchivo');
test('el principal es el artista de la carpeta; después la otra persona y el hecho corto', () => {
  assert.equal(NA.desdeCronica({ protagonista: 'Las Ñañas', secundario: 'Kerly Morán', accion: 'shows con diferente convocatoria' }, { carpeta: 'kerly_Moran' }), 'Kerly Morán - Las Ñañas - shows con diferente convocatoria');
  assert.equal(NA.desdeCronica({ protagonista: 'Mara Topic', secundario: '', accion: 'Varada tras emergencia aérea' }, { carpeta: 'Mara_Topic' }), 'Mara Topic - Varada tras emergencia aérea');
});
test('sin carpeta usa la crónica; sin nada, un nombre por defecto; limpia caracteres prohibidos y emojis', () => {
  assert.equal(NA.desdeCronica({ protagonista: 'Ana', secundario: 'Luis', accion: 'se casan: "boda" 🔥' }), 'Ana - Luis - se casan boda');
  assert.equal(NA.desdeCronica({}), 'Video farandula');
});
test('nombreCompleto: fecha del id del video + nombre', () => {
  assert.equal(NA.nombreCompleto('gestor-2026-11-27-mwzdc3d9', { protagonista: 'Kerly Morán', accion: 'concierto flojo' }, { carpeta: 'kerly_Moran' }), '2026-11-27 Kerly Morán - concierto flojo');
});
