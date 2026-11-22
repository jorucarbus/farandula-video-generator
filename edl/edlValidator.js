// Validador de la EDL v1: función pura, sin red, sin disco de datos, sin Drive.
//
// PROHIBIDO importar seleccion, jobStore o driveCache desde acá: este módulo es la "capa 1" pura de
// las pruebas (ver plan v4 §6) y tiene que poder correr sin tocar historial.json ni jobs.json.
//
// validarEdl(edl) -> { errores: [{regla, shot, mensaje}], avisos: [...] }
//   Los errores bloquean; los avisos se muestran y van al log, nunca detienen un video.
//
// Reglas implementadas hoy (nota 12 §2): V1 schema, V2 regla de 3 s, V3 mínimo 0,7 s, V4 suma =
// audio, V5 resolución/fps, V6 atribución, V7 certeza. Pendientes: V8 ritmo, V9 contigüidad,
// V10 ids/refs (necesita el catálogo de recetas), V11 bucles. `params` contra el schema de cada
// receta se valida en segunda pasada cuando exista el catálogo.
const fs = require('fs');
const path = require('path');
const Ajv2020 = require('ajv/dist/2020');
const addFormats = require('ajv-formats');

// Se reusan las MISMAS funciones del render: si el validador calculara el padding por su cuenta,
// discreparía de montarVideoPlan (video.js:191-199 y :473-475).
const { decidirEfecto, esLimiteDeTanda } = require('../video');

// La regla de 3 s es un límite LEGAL por toma de VIDEO de terceros (no estético). Lo generado en la
// PC (gráficos, recortes animados, rótulos) y las fotos/capturas no entran: decisión del usuario.
const CLIP_MAX = 3;
const TOLERANCIA_LIMITE = 0.001;
const CLIP_MIN = 0.7;
const TOLERANCIA_AUDIO = 0.05;
const TIPOS_AJENOS = new Set(['tercero', 'licenciado']);
const RESOLUCION = { '9:16': { w: 1080, h: 1920 }, '16:9': { w: 1920, h: 1080 } };
const DUR_TRANSICION_DEFAULT = 0.35;

const schema = JSON.parse(fs.readFileSync(path.join(__dirname, 'edl.v1.schema.json'), 'utf8'));
const ajv = new Ajv2020({ allErrors: true, strict: false });
addFormats(ajv);
const validarSchema = ajv.compile(schema);

function tipoFuente(shot) {
  // Fail-closed: sin fuente.tipo se trata como tercero y rige la regla de 3 s.
  return shot.fuente && shot.fuente.tipo ? shot.fuente.tipo : 'tercero';
}

// Un clip cae bajo la regla de 3 s si es VIDEO (no imagen) de un tercero.
function esVideoDeTercero(shot) {
  return Boolean(shot.clip) && !shot.clip.esImagen && TIPOS_AJENOS.has(tipoFuente(shot));
}

function ordenar(shots) {
  return shots
    .map((s, i) => ({ s, i }))
    .sort((a, b) => (a.s.orden ?? a.i + 1) - (b.s.orden ?? b.i + 1) || a.i - b.i)
    .map(x => x.s);
}

// Padding (segundos extra de metraje fuente que el render corta para la cola de mezcla xfade) del
// shot k. Misma cuenta que montarVideoPlan: no es el último, hay transición activa y no cae en el
// borde de una tanda.
function paddingDelShot(edl, shots, k) {
  const esUltimo = k === shots.length - 1;
  if (esUltimo || esLimiteDeTanda(k)) return 0;
  const shot = shots[k];
  const dur = (shot.transicion && shot.transicion.dur) || (edl.transicion_default && edl.transicion_default.dur) || DUR_TRANSICION_DEFAULT;
  if (edl.transicion_preset) {
    return decidirEfecto(edl.transicion_preset, k).activo ? dur : 0;
  }
  const t = shot.transicion || edl.transicion_default;
  if (!t || !t.tipo || t.tipo === 'corte') return 0;
  return dur;
}

function validarEdl(edl) {
  const errores = [];
  const avisos = [];
  const err = (regla, shot, mensaje) => errores.push({ regla, shot: shot || null, mensaje });
  const avi = (regla, shot, mensaje) => avisos.push({ regla, shot: shot || null, mensaje });

  // V1: schema. Si no pasa, el resto de las reglas no tiene sobre qué trabajar.
  if (!validarSchema(edl)) {
    for (const e of validarSchema.errors) err('V1', null, `${e.instancePath || '/'} ${e.message}`);
    return { errores, avisos };
  }

  const shots = ordenar(edl.shots);

  // V5: resolución y fps coherentes con el aspect (el render hoy está cableado a 30 fps).
  const esperado = RESOLUCION[edl.aspect];
  if (edl.resolucion && (edl.resolucion.w !== esperado.w || edl.resolucion.h !== esperado.h)) {
    err('V5', null, `aspect ${edl.aspect} exige ${esperado.w}x${esperado.h}, vino ${edl.resolucion.w}x${edl.resolucion.h}`);
  }
  if (edl.fps !== 30) avi('V5', null, `fps ${edl.fps}: el render actual está cableado a 30`);

  // V4: el audio manda; la suma de duraciones visibles debe igualarlo.
  const suma = shots.reduce((t, s) => t + s.duracion, 0);
  if (Math.abs(suma - edl.audio.duracion_s) > TOLERANCIA_AUDIO) {
    err('V4', null, `la suma de shots (${suma.toFixed(3)} s) no iguala al audio (${edl.audio.duracion_s} s) ±${TOLERANCIA_AUDIO}`);
  }

  shots.forEach((shot, k) => {
    const id = shot.id;

    // V2: regla de 3 s por toma de VIDEO de terceros, contando el padding de la transición.
    if (esVideoDeTercero(shot)) {
      const padding = paddingDelShot(edl, shots, k);
      const necesita = shot.clip.duracion + padding;
      if (necesita > CLIP_MAX + TOLERANCIA_LIMITE) {
        err('V2', id, `toma de video de tercero de ${shot.clip.duracion} s + ${padding} s de transición = ${necesita.toFixed(3)} s (máx. ${CLIP_MAX})`);
      }
    }

    // V3: mínimo 0,7 s por toma de clip (no aplica a imágenes ni a shots sin clip).
    if (shot.clip && !shot.clip.esImagen && shot.clip.duracion < CLIP_MIN) {
      err('V3', id, `clip de ${shot.clip.duracion} s por debajo del mínimo ${CLIP_MIN} s`);
    }

    // V6: atribución obligatoria.
    const tipo = tipoFuente(shot);
    const f = shot.fuente || {};
    if (TIPOS_AJENOS.has(tipo)) {
      for (const campo of ['licencia', 'autor', 'url']) {
        if (!f[campo]) err('V6', id, `fuente '${tipo}' exige '${campo}'`);
      }
    } else if (!f.licencia) {
      err('V6', id, `fuente '${tipo}' exige 'licencia'`);
    }

    // V7: certeza. reportado/rumor exigen atribución; rumor exige sello visible y nunca es gancho.
    const c = shot.certeza;
    if (c && (c.nivel === 'reportado' || c.nivel === 'rumor')) {
      if (!c.atribucion || !c.atribucion.trim()) err('V7', id, `certeza '${c.nivel}' exige 'atribucion' no vacía`);
    }
    if (c && c.nivel === 'rumor') {
      const tieneSello = shot.recipe === 'rumor_stamp' || (shot.elementos || []).some(e => e.tipo === 'sello');
      if (!tieneSello) err('V7', id, "un 'rumor' exige un sello visible (receta rumor_stamp o elemento 'sello')");
      if (shot.recipe === 'hook_cold_open') err('V7', id, "un 'rumor' no puede ser el gancho (hook_cold_open)");
    }
  });

  return { errores, avisos };
}

module.exports = { validarEdl, esVideoDeTercero, paddingDelShot, CLIP_MAX, CLIP_MIN };
