// Planificador de recetas: el LLM ELIGE una receta de un enum cerrado por shot y rellena sus params.
// Nunca escribe ffmpeg, HTML ni bpy, y no puede cambiar duraciones, clips ni fuentes: de su respuesta
// solo se toman `recipe` y `params`.
//
//   Etapa 1: recipe por shot (enum = claves del catálogo, solo las implementadas).
//   Etapa 2: params por shot (título del gancho, texto del rótulo...), validados contra el schema de
//            la receta; lo inválido cae a los defaults de la receta, no tumba nada.
//   Reglas en código tras la etapa 1 (el prompt no basta): certeza 'rumor' fuerza rumor_stamp, el
//   primer shot de un short solo es hook_cold_open o clip_kenburns, y todo pasa por validarEdl.
//   Hasta 2 reintentos devolviéndole al modelo la lista de errores; si sigue mal (o el modelo falla),
//   plan DETERMINISTA de respaldo = el comportamiento de hoy (clip_kenburns, y rumor_stamp si toca).
//
// `llamar(prompt, mensajeUsuario) -> objeto JSON` es inyectable: las pruebas pasan un falso y no hay
// red. Por defecto usa gemini.llamarJSON (carga perezosa, así este módulo sigue siendo liviano).
const recetas = require('../recetas');
const { validarEdl } = require('./edlValidator');

const MAX_REINTENTOS = 2;

function ordenar(shots) {
  return shots.map((s, i) => ({ s, i }))
    .sort((a, b) => (a.s.orden ?? a.i + 1) - (b.s.orden ?? b.i + 1) || a.i - b.i).map(x => x.s);
}

const recetasElegibles = () => recetas.ids().filter(id => recetas.obtener(id).implementada);

function llamarGemini(prompt, mensaje) {
  const gemini = require('../gemini');
  return gemini.llamarJSON(prompt, mensaje, gemini.TAREAS.planEdl);
}

// Lo único que el modelo ve de cada shot: nada de URLs ni de video.
function resumenShots(edl) {
  return ordenar(edl.shots).map((s, k) => ({
    id: s.id, posicion: k + 1, de: edl.shots.length, duracion: s.duracion,
    es_imagen: Boolean(s.clip && s.clip.esImagen), famoso: s.clip && s.clip.famoso,
    certeza: s.certeza ? s.certeza.nivel : 'confirmado',
    medio: (s.fuente && s.fuente.autor) || s.source_outlet || null,
    texto_pantalla: s.locucion && s.locucion.texto_pantalla,
  }));
}

const PROMPT_ETAPA_1 = (edl, errores) => `Eres el planificador de edición de un video corto de farándula (${edl.aspect}).
Para CADA shot elige UNA receta de esta lista cerrada. No inventes recetas.
${recetasElegibles().map(id => `- ${id}: ${recetas.obtener(id).cuando}`).join('\n')}
Reglas: el primer shot de un short (9:16) solo puede ser hook_cold_open o clip_kenburns; hook_cold_open solo en el primero;
un shot con certeza "rumor" usa rumor_stamp; toma de un tercero que hay que atribuir -> source_lowerthird; el resto clip_kenburns.
No cambies duraciones ni ids. Responde SOLO JSON: {"shots":[{"id":"...","recipe":"..."}]}${errores && errores.length ? `\nTu respuesta anterior tuvo estos errores, corrígelos:\n- ${errores.join('\n- ')}` : ''}`;

const PROMPT_ETAPA_2 = (necesitan) => `Rellena los parámetros de texto de estos shots (español neutro, sin inventar hechos, solo lo que dice texto_pantalla/medio).
${necesitan.map(n => `- ${n.id} (${n.recipe}): ${n.pide}`).join('\n')}
Responde SOLO JSON: {"shots":[{"id":"...","params":{...}}]}`;

const PIDE = {
  hook_cold_open: `params {"titulo": string de máx. ${recetas.MAX_TITULO} caracteres}`,
  source_lowerthird: 'params {"texto": "Según <medio>, <fecha corta>"} (máx. 80 caracteres)',
  rumor_stamp: 'params {"texto": string de máx. 40 caracteres} o {} para el texto por defecto',
};

function clonar(x) { return JSON.parse(JSON.stringify(x)); }

// Plan de respaldo, SIN LLM: conserva la receta que el shot ya traía solo si existe, está
// implementada y sus params validan; si no, clip_kenburns (el comportamiento de hoy). Un shot con
// certeza 'rumor' siempre termina con rumor_stamp.
function planDeterminista(edl) {
  const salida = clonar(edl);
  ordenar(salida.shots).forEach((shot, k) => {
    const valida = recetas.existe(shot.recipe) && recetas.obtener(shot.recipe).implementada
      && recetas.validarParams(shot.recipe, shot.params).length === 0
      && !(shot.recipe === 'hook_cold_open' && k > 0);
    if (shot.certeza && shot.certeza.nivel === 'rumor') {
      if (shot.recipe !== 'rumor_stamp' || !valida) { shot.recipe = 'rumor_stamp'; shot.params = {}; }
    } else if (!valida) {
      shot.recipe = 'clip_kenburns'; shot.params = {};
    } else if (!shot.params) {
      shot.params = {};
    }
  });
  return salida;
}

// Aplica la etapa 1 sobre una copia: solo toma `recipe` y fuerza las reglas en código.
function aplicarEtapa1(edl, respuesta, avisos) {
  const salida = clonar(edl);
  const porId = new Map(((respuesta && respuesta.shots) || []).map(s => [s.id, s.recipe]));
  const elegibles = new Set(recetasElegibles());
  for (const shot of salida.shots) {
    let r = porId.get(shot.id);
    if (!r || !elegibles.has(r)) { if (r) avisos.push(`${shot.id}: receta '${r}' fuera del enum, se usa clip_kenburns`); r = 'clip_kenburns'; }
    if (shot.certeza && shot.certeza.nivel === 'rumor' && r !== 'rumor_stamp') { avisos.push(`${shot.id}: certeza rumor fuerza rumor_stamp`); r = 'rumor_stamp'; }
    shot.recipe = r;
    shot.params = {};
  }
  return salida;
}

async function planificarEdl(edl, { llamar = llamarGemini, maxReintentos = MAX_REINTENTOS } = {}) {
  const avisos = [];
  let errores = [];
  let candidata = null;

  for (let intento = 0; intento <= maxReintentos; intento++) {
    let respuesta;
    try {
      respuesta = await llamar(PROMPT_ETAPA_1(edl, errores), JSON.stringify(resumenShots(edl)));
    } catch (e) {
      avisos.push(`el modelo falló (${e.message})`);
      break; // sin modelo no tiene sentido reintentar: respaldo determinista
    }
    candidata = aplicarEtapa1(edl, respuesta, avisos);
    // Los `params` todavía no existen en la etapa 1 (llegan en la 2): sus errores se miran al final.
    const v = validarEdl(candidata);
    const erroresEtapa1 = v.errores.filter(e => !(e.regla === 'V10' && /^params de /.test(e.mensaje)));
    if (erroresEtapa1.length === 0) { errores = []; break; }
    errores = erroresEtapa1.map(e => `${e.regla}${e.shot ? ' ' + e.shot : ''}: ${e.mensaje}`);
    candidata = null;
  }

  if (!candidata) {
    avisos.push(`plan determinista de respaldo${errores.length ? ` (errores sin resolver: ${errores.join('; ')})` : ''}`);
    const respaldo = planDeterminista(edl);
    return { edl: respaldo, origen: 'respaldo', avisos, errores };
  }

  // Etapa 2: params de texto. Lo inválido se descarta y se usan los defaults/derivados de la receta.
  const necesitan = candidata.shots.filter(s => PIDE[s.recipe]).map(s => ({ id: s.id, recipe: s.recipe, pide: PIDE[s.recipe] }));
  if (necesitan.length) {
    try {
      const r2 = await llamar(PROMPT_ETAPA_2(necesitan), JSON.stringify(resumenShots(edl)));
      const porId = new Map(((r2 && r2.shots) || []).map(s => [s.id, s.params]));
      for (const shot of candidata.shots) {
        const p = porId.get(shot.id);
        if (!p || !PIDE[shot.recipe]) continue;
        const malos = recetas.validarParams(shot.recipe, p);
        if (malos.length) avisos.push(`${shot.id}: params de ${shot.recipe} inválidos (${malos[0]}), se usan los de la receta`);
        else shot.params = p;
      }
    } catch (e) {
      avisos.push(`etapa 2 falló (${e.message}): params por defecto`);
    }
  }
  // hook_cold_open exige titulo: sin él, el gancho pasa a clip_kenburns (no hay de dónde inventarlo).
  for (const shot of candidata.shots) {
    if (shot.recipe === 'hook_cold_open' && !(shot.params && shot.params.titulo)) {
      avisos.push(`${shot.id}: hook_cold_open sin título, se usa clip_kenburns`);
      shot.recipe = 'clip_kenburns'; shot.params = {};
    }
  }
  const final = validarEdl(candidata);
  if (final.errores.length) {
    avisos.push(`tras la etapa 2 quedaron errores (${final.errores.length}): plan determinista de respaldo`);
    return { edl: planDeterminista(edl), origen: 'respaldo', avisos, errores: final.errores.map(e => `${e.regla}: ${e.mensaje}`) };
  }
  return { edl: candidata, origen: 'llm', avisos, errores: [] };
}

module.exports = { planificarEdl, planDeterminista, resumenShots, recetasElegibles };
