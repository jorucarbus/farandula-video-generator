// "Plan por recetas": modo OPT-IN del render clásico (efectos.planPorRecetas === true).
//
// Toma el plan[] que ya armó seleccion.js, lo convierte en una EDL mínima, deja que el planificador
// elija recetas (zoom por clip, gancho con título, sello de rumor...), y devuelve el MISMO plan con
// `zoom` por clip más los overlays PNG listos. Todo lo demás del plan (videoId, offset, duracion,
// parrafoIdx, esImagen, famoso) se conserva tal cual: el flujo clásico no cambia de forma.
//
// Si algo falla, quien llama sigue con el plan original (server.js lo envuelve en try/catch).
const { planificarEdl, planDeterminista } = require('./planificadorLLM');
const { planEdlARender } = require('./planEdlARender');

// El plan clásico no trae metadatos de fuente (los clips salen de la biblioteca de Drive del usuario):
// se declara honestamente eso, no se inventan autor ni URL de un medio.
const FUENTE_BIBLIOTECA = id => ({ tipo: 'tercero', licencia: 'biblioteca_propia', autor: 'biblioteca de Drive', url: `drive://${id}` });

// Reglas que NO son del planificador en este modo (las cubre la guarda de video.js y la auditoría):
// el LLM no puede arreglar un clip corto que ya decidió seleccion.js.
const REGLAS_IGNORADAS = ['V2', 'V3', 'V4', 'V6'];

function edlDesdePlan(plan, { aspect = '9:16', efectos = {}, titulo = null } = {}) {
  const clips = plan.map((c, i) => ({ c, i })).filter(x => x.c);
  // Partitura visual (efectos.recetasPorParrafo: índice de fragmento → {recipe, params}): la pieza va en el
  // PRIMER clip del párrafo. En un short 9:16 el primer shot queda libre para el gancho (regla del catálogo).
  const partitura = efectos.recetasPorParrafo || {};
  const usados = new Set();
  const shots = clips.map(({ c, i }, k) => {
    const pedida = partitura[c.parrafoIdx];
    const aplica = pedida && !usados.has(c.parrafoIdx) && !(k === 0 && aspect === '9:16');
    if (pedida) usados.add(c.parrafoIdx);
    const shot = {
      id: `c${i}`,
      orden: k + 1,
      duracion: c.duracion,
      recipe: aplica ? pedida.recipe : 'clip_kenburns',
      params: aplica ? pedida.params : {},
      clip: { videoId: c.videoId, famoso: c.famoso, offset: c.offset, duracion: c.duracion },
      fuente: FUENTE_BIBLIOTECA(c.videoId),
    };
    if (c.esImagen) shot.clip.esImagen = true;
    if (c.parrafoIdx !== undefined) shot.clip.parrafoIdx = c.parrafoIdx;
    if (k === 0 && titulo) shot.locucion = { texto_pantalla: String(titulo).slice(0, 120) };
    return shot;
  });
  const preset = efectos.transicion || 'ninguno';
  return {
    edl_version: '1',
    id: `plan_${Date.now()}`,
    aspect,
    fps: 30,
    audio: { duracion_s: shots.reduce((t, s) => t + s.duracion, 0) },
    transicion_preset: preset,
    transicion_default: { tipo: preset === 'ninguno' ? 'corte' : 'fade', dur: efectos.transicionDur || 0.35 },
    shots,
  };
}

// opciones: { plan, efectos, titulo, llamar?, dirTemp?, fuenteArchivo? }
async function aplicarPlanPorRecetas({ plan, efectos = {}, titulo = null, llamar, dirTemp, fuenteArchivo }) {
  const aspect = efectos.aspect || '9:16';
  const edl = edlDesdePlan(plan, { aspect, efectos, titulo });
  // Con partitura el planificador LLM no interviene: las recetas ya vienen elegidas y verificadas.
  const planificado = efectos.recetasPorParrafo
    ? { edl: planDeterminista(edl), origen: 'partitura', avisos: [] }
    : await planificarEdl(edl, { llamar, reglasIgnoradas: REGLAS_IGNORADAS });
  const render = await planEdlARender(planificado.edl, { dirTemp, fuenteArchivo });

  // Mezclar: el plan original manda; solo se le agrega el zoom por clip de la receta.
  let k = 0;
  const planFinal = plan.map(item => {
    if (!item) return item;
    const conReceta = render.plan[k++];
    if (!conReceta) return item;
    return { ...item, ...(conReceta.zoom ? { zoom: conReceta.zoom } : {}), ...(conReceta.fit ? { fit: conReceta.fit } : {}) };
  });
  const efectosFinal = { ...efectos, overlays: [...(efectos.overlays || []), ...render.efectos.overlays] };
  return {
    plan: planFinal,
    efectos: efectosFinal,
    info: {
      origen: planificado.origen,
      recetas: planificado.edl.shots.map(s => s.recipe),
      overlays: render.efectos.overlays.length,
      avisos: [...planificado.avisos, ...render.avisos],
    },
  };
}

module.exports = { aplicarPlanPorRecetas, edlDesdePlan, REGLAS_IGNORADAS };
