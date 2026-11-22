// Catálogo cerrado de recetas del motor. MÓDULO PURO: no renderiza nada, no importa ffmpeg ni disco.
//
// El LLM solo elige `recipe` (enum cerrado: las claves de este catálogo) y rellena `params`, que se
// validan contra el schema de la receta. Nunca escribe ffmpeg, HTML ni bpy. Cada receta traduce su
// shot a cosas que el render YA sabe hacer: un zoom por clip y overlays PNG con ventana de tiempo.
//
// aplicar({ shot, params, tInicio, formato }) -> { zoom?: {direccion, pct}, overlays: [{texto, estilo, t0, t1}], avisos }
//   Los tiempos de los overlays son ABSOLUTOS en el video (tInicio = suma de las duraciones previas).
const Ajv2020 = require('ajv/dist/2020');

const ajv = new Ajv2020({ allErrors: true, strict: false, useDefaults: false });

const AMBOS = ['9:16', '16:9'];
const MAX_TITULO = 40;

function textoDeFuente(shot) {
  const f = shot.fuente || {};
  const medio = shot.source_outlet || f.autor;
  const fecha = shot.source_date || f.fecha_acceso;
  if (!medio) return null;
  return fecha ? `Según ${medio}, ${fecha}` : `Según ${medio}`;
}

const RECETAS = {
  // El render de hoy: toma del famoso con zoom suave. Default seguro: si algo falla, todo cae acá.
  clip_kenburns: {
    id: 'clip_kenburns',
    cuando: 'toma normal de un famoso, sin texto en pantalla (default seguro)',
    aspects: AMBOS,
    aplicaRegla3s: true,
    implementada: true,
    params: {
      type: 'object', additionalProperties: false,
      properties: { dir: { enum: ['in', 'out'] }, pct: { type: 'number', minimum: 0, maximum: 30 } },
    },
    defaults: { dir: 'in', pct: 15 },
    aplicar({ params }) {
      return { zoom: { direccion: params.dir, pct: params.pct }, overlays: [], avisos: [] };
    },
  },

  // Gancho: título grande arriba en los primeros segundos. Solo puede ser el primer shot.
  hook_cold_open: {
    id: 'hook_cold_open',
    cuando: 'primer shot: la afirmación o imagen más fuerte con un título corto, sin saludo ni logo',
    aspects: AMBOS,
    aplicaRegla3s: true,
    implementada: true,
    params: {
      type: 'object', additionalProperties: false, required: ['titulo'],
      properties: {
        titulo: { type: 'string', minLength: 1, maxLength: MAX_TITULO },
        resaltar: { type: 'string' },
        segundos: { type: 'number', minimum: 0.8, maximum: 4 },
      },
    },
    defaults: { segundos: 2.4 },
    aplicar({ shot, params, tInicio }) {
      const dur = Math.min(params.segundos, shot.duracion);
      return {
        zoom: { direccion: 'in', pct: 18 },
        overlays: [{ texto: params.titulo.toUpperCase(), estilo: 'titulo', t0: tInicio, t1: tInicio + dur }],
        avisos: [],
      };
    },
  },

  // "Según X, fecha" durante casi toda la toma. Si no hay texto, se arma desde la fuente del shot.
  source_lowerthird: {
    id: 'source_lowerthird',
    cuando: 'toma de un tercero que hay que atribuir en pantalla (medio y fecha)',
    aspects: AMBOS,
    aplicaRegla3s: true,
    implementada: true,
    params: {
      type: 'object', additionalProperties: false,
      properties: { texto: { type: 'string', minLength: 1, maxLength: 80 }, dir: { enum: ['in', 'out'] }, pct: { type: 'number', minimum: 0, maximum: 30 } },
    },
    defaults: { dir: 'out', pct: 12 },
    aplicar({ shot, params, tInicio }) {
      const texto = params.texto || textoDeFuente(shot);
      const avisos = [];
      const overlays = [];
      if (texto) {
        const t0 = tInicio + Math.min(0.2, shot.duracion * 0.1);
        overlays.push({ texto, estilo: 'lowerthird', t0, t1: tInicio + shot.duracion - Math.min(0.2, shot.duracion * 0.1) });
      } else {
        avisos.push(`${shot.id}: source_lowerthird sin texto ni fuente.autor: sin rótulo de atribución`);
      }
      return { zoom: { direccion: params.dir, pct: params.pct }, overlays, avisos };
    },
  },

  // Sello visible de rumor durante toda la toma.
  rumor_stamp: {
    id: 'rumor_stamp',
    cuando: 'shot cuya certeza es rumor: lleva sello visible "RUMOR SIN CONFIRMAR"',
    aspects: AMBOS,
    aplicaRegla3s: true,
    implementada: true,
    params: {
      type: 'object', additionalProperties: false,
      properties: { texto: { type: 'string', minLength: 1, maxLength: 40 } },
    },
    defaults: { texto: 'RUMOR SIN CONFIRMAR' },
    aplicar({ shot, params, tInicio }) {
      return {
        zoom: { direccion: 'out', pct: 10 },
        overlays: [{ texto: params.texto.toUpperCase(), estilo: 'sello', t0: tInicio, t1: tInicio + shot.duracion }],
        avisos: [],
      };
    },
  },

  // Reservadas (día 25 en adelante): existen en el catálogo para que la EDL de ejemplo valide, pero
  // todavía no tienen render propio. El render las trata como clip_kenburns y lo avisa.
  ranking_item: {
    id: 'ranking_item', cuando: 'ítem numerado de un ranking (pendiente: render propio)', aspects: AMBOS,
    aplicaRegla3s: true, implementada: false,
    params: { type: 'object' }, defaults: {},
    aplicar({ shot }) {
      return { zoom: { direccion: 'in', pct: 12 }, overlays: [], avisos: [`${shot.id}: ranking_item aún sin render propio, se usa clip_kenburns`] };
    },
  },
  split_compare: {
    id: 'split_compare', cuando: 'comparación lado a lado de dos shots (pendiente: render propio)', aspects: AMBOS,
    aplicaRegla3s: false, implementada: false,
    params: { type: 'object' }, defaults: {},
    aplicar({ shot }) {
      return { zoom: null, overlays: [], avisos: [`${shot.id}: split_compare aún sin render propio`] };
    },
  },
};

const validadores = Object.fromEntries(Object.values(RECETAS).map(r => [r.id, ajv.compile(r.params)]));

const ids = () => Object.keys(RECETAS);
const existe = id => Object.prototype.hasOwnProperty.call(RECETAS, id);
const obtener = id => RECETAS[id];

// Parámetros efectivos: defaults + lo que mande el shot.
function paramsEfectivos(id, params) {
  return { ...RECETAS[id].defaults, ...(params || {}) };
}

// Valida `params` contra el schema de la receta. Devuelve [] si está bien.
function validarParams(id, params) {
  if (!existe(id)) return [`receta desconocida: ${id}`];
  const v = validadores[id];
  if (v(paramsEfectivos(id, params))) return [];
  return v.errors.map(e => `${e.instancePath || '/'} ${e.message}`);
}

function ordenar(shots) {
  return shots.map((s, i) => ({ s, i }))
    .sort((a, b) => (a.s.orden ?? a.i + 1) - (b.s.orden ?? b.i + 1) || a.i - b.i).map(x => x.s);
}

// Reglas en CÓDIGO (no en el prompt) que el LLM no puede saltarse. Devuelve [{shot, mensaje}].
function reglasDeReceta(edl) {
  const errores = [];
  const shots = ordenar(edl.shots);
  shots.forEach((shot, k) => {
    const r = RECETAS[shot.recipe];
    if (!r) return; // la receta desconocida la reporta V10
    if (!r.aspects.includes(edl.aspect)) errores.push({ shot: shot.id, mensaje: `la receta ${r.id} no existe en ${edl.aspect}` });
    // La regla del gancho es de los shorts 9:16; una compilación 16:9 puede abrir con otra receta.
    if (k === 0 && edl.aspect === '9:16' && !['hook_cold_open', 'clip_kenburns'].includes(shot.recipe)) {
      errores.push({ shot: shot.id, mensaje: `el primer shot solo puede ser hook_cold_open o clip_kenburns, no ${shot.recipe}` });
    }
    if (k > 0 && shot.recipe === 'hook_cold_open') {
      errores.push({ shot: shot.id, mensaje: 'hook_cold_open solo puede ser el primer shot' });
    }
  });
  return errores;
}

module.exports = { RECETAS, ids, existe, obtener, paramsEfectivos, validarParams, reglasDeReceta, textoDeFuente, MAX_TITULO };
