// Regresión: las carpetas con ñ/tildes (Las_ñañas, Doña_Lety) se rechazaban por el patrón [\w .-] y nunca se indexaban,
// así que el guion nombraba a la persona y el video no mostraba tomas suyas.
const test = require('node:test'), assert = require('node:assert');
const fs = require('fs'), path = require('path');
const archivos = ['scripts/biblioteca-indexar-nuevos.js', 'scripts/biblioteca-minis.js', 'scripts/biblioteca-traer.js', 'scripts/esperar-drive.js', 'edl/clipsDrive.js', 'edl/respaldoIndice.js', 'gestor/biblioteca.js', 'gestor/servidor.js'];
test('ningún validador de carpeta usa \w (rechaza la ñ)', () => {
  for (const f of archivos) assert.ok(!fs.readFileSync(path.join(__dirname, '..', f), 'utf8').includes('[\w .-]'), f);
});
test('el patrón nuevo acepta ñ y rechaza rutas', () => {
  const ok = c => /^[\p{L}\p{N}_ .-]+$/u.test(c);
  for (const n of ['Las_ñañas', 'Doña_Lety', 'eden_muñoz', 'kerly_Moran']) assert.ok(ok(n), n);
  for (const n of ['../x', 'a/b', 'a\b', '']) assert.ok(!ok(n), n);
});
