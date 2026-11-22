// Capa 1: los subtítulos siguen igual en 9:16 y tienen valores provisionales propios en 16:9.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const subtitulos = require('../subtitulos');

function generar(opciones) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'subs-formato-'));
  try {
    const frags = [{ texto: 'Última hora: Shakira cerró un acuerdo millonario.' }];
    const p = subtitulos.generarASS(frags, [4], null, { tempDir: dir, jobId: 'x', ...opciones });
    return fs.readFileSync(p, 'utf8');
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
}
const estilo = ass => ass.split('\n').find(l => l.startsWith('Style: Base,')).split(',');

test('9:16 por defecto: canvas 1080x1920, tamaño 210 y margen 606 (igual que siempre)', () => {
  const ass = generar({});
  assert.match(ass, /PlayResX: 1080\nPlayResY: 1920/);
  const e = estilo(ass);
  assert.equal(e[2], '210');
  assert.equal(e[21], '606');
});

test('16:9: canvas 1920x1080 con tamaño 128 y margen 90 (calibrado sobre un render real)', () => {
  const ass = generar({ aspect: '16:9' });
  assert.match(ass, /PlayResX: 1920\nPlayResY: 1080/);
  const e = estilo(ass);
  assert.equal(e[2], '128');
  assert.equal(e[21], '90');
});

test('las opciones explícitas mandan sobre los defaults de formato', () => {
  const e = estilo(generar({ aspect: '16:9', tamano: 120, marginV: 150 }));
  assert.equal(e[2], '120');
  assert.equal(e[21], '150');
});
