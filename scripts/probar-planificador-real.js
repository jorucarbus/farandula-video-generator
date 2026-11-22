// Prueba de aceptación con Gemini REAL: corre planificarEdl sobre la EDL de ejemplo A y cuenta lo
// que gasta (llamadas, caracteres, tokens estimados, tiempo). Consume cuota: correrlo a mano.
// Uso: node scripts/probar-planificador-real.js
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const gemini = require('../gemini');
const { planificarEdl } = require('../edl/planificadorLLM');
const { validarEdl } = require('../edl/edlValidator');

const edl = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'test', 'fixtures', 'edl', 'ejemplo-a-short-9x16.json'), 'utf8'));
edl.shots[0].locucion = { texto_pantalla: 'Lo que nadie vio del acuerdo de Shakira y Piqué' };
// recetas de entrada neutras: el modelo parte de cero
edl.shots.forEach(s => { s.recipe = 'clip_kenburns'; s.params = {}; });

const registro = [];
const llamar = async (prompt, mensaje) => {
  const t0 = Date.now();
  const r = await gemini.llamarJSON(prompt, mensaje, gemini.TAREAS.planEdl);
  registro.push({ ms: Date.now() - t0, entrada: prompt.length + mensaje.length, salida: JSON.stringify(r).length });
  return r;
};

(async () => {
  const t0 = Date.now();
  const r = await planificarEdl(edl, { llamar });
  const entrada = registro.reduce((t, x) => t + x.entrada, 0);
  const salida = registro.reduce((t, x) => t + x.salida, 0);
  console.log(JSON.stringify({
    origen: r.origen,
    recetas: r.edl.shots.map(s => ({ id: s.id, recipe: s.recipe, params: s.params })),
    avisos: r.avisos,
    validaSinErrores: validarEdl(r.edl).errores.length === 0,
    llamadas: registro.length,
    caracteres: { entrada, salida },
    tokensEstimados: { entrada: Math.round(entrada / 3.5), salida: Math.round(salida / 3.5) },
    segundos: Number(((Date.now() - t0) / 1000).toFixed(1)),
  }, null, 2));
})().catch(e => { console.error('FALLÓ:', e.message.slice(0, 300)); process.exit(1); });
