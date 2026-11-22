// Adaptador EDL -> plan[] legado. Función pura: sin red, sin disco, sin importar seleccion/jobStore.
//
// Principio "superconjunto, no reemplazo": cada shot de la EDL lleva un `clip` con los campos de hoy
// (videoId, famoso, offset, duracion, esImagen, parrafoIdx). Este adaptador devuelve exactamente el
// plan[] que montarVideoPlan ya sabe renderizar, más los `efectos` que se desprenden de la EDL.
//
// Los shots sin `clip` (recetas generadas, p. ej. split_compare) todavía no tienen camino de render:
// se omiten y se devuelven en `omitidos` para que quien llame decida (nunca se descartan en silencio).
const { planFormato } = require('./planFormato');

const TIPO_TRANSICION = { fade: 'fade', whip: 'slideleft', xfade_aleatorio: 'aleatorio' };

function ordenar(shots) {
  return shots
    .map((s, i) => ({ s, i }))
    .sort((a, b) => (a.s.orden ?? a.i + 1) - (b.s.orden ?? b.i + 1) || a.i - b.i)
    .map(x => x.s);
}

function edlAPlan(edl) {
  const avisos = [];
  const omitidos = [];
  const plan = [];

  for (const shot of ordenar(edl.shots)) {
    if (!shot.clip) { omitidos.push(shot.id); continue; }
    const c = shot.clip;
    const item = { videoId: c.videoId, famoso: c.famoso, offset: c.offset, duracion: c.duracion };
    if (c.esImagen) item.esImagen = true;
    if (c.parrafoIdx !== undefined) item.parrafoIdx = c.parrafoIdx;
    // Marca de origen: el guardia de 3 s de montarVideoPlan solo aplica a video ajeno.
    if (shot.fuente && shot.fuente.tipo) item.fuenteTipo = shot.fuente.tipo;
    plan.push(item);
  }
  if (omitidos.length) avisos.push(`shots sin clip omitidos del plan legado: ${omitidos.join(', ')}`);

  const efectos = { aspect: planFormato(edl.aspect).aspect };

  // Transiciones: preset explícito si lo hay; si no, se deduce de la transición por defecto.
  const td = edl.transicion_default;
  if (edl.transicion_preset) {
    efectos.transicion = edl.transicion_preset;
  } else if (td && td.tipo && td.tipo !== 'corte') {
    efectos.transicion = 'todos';
  } else {
    efectos.transicion = 'ninguno';
  }
  if (td && td.dur) efectos.transicionDur = td.dur;
  if (td && TIPO_TRANSICION[td.tipo]) efectos.transicionTipo = TIPO_TRANSICION[td.tipo];

  // Una transición distinta en shots sueltos no se puede expresar con un preset global.
  const distintas = edl.shots.some(s => s.transicion && td && s.transicion.tipo && s.transicion.tipo !== td.tipo);
  if (distintas && !edl.transicion_preset) avisos.push('hay transiciones por shot distintas de la por defecto: el render legado usa un preset global');

  return { plan, efectos, omitidos, avisos };
}

module.exports = { edlAPlan };
