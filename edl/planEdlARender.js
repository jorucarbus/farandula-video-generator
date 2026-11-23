// De una EDL con recetas a lo que montarVideoPlan ya sabe renderizar:
//   { plan, efectos, avisos }  donde efectos.overlays son PNG ya dibujados.
//
// Pasos: edlAPlan (plan[] legado) -> por cada shot, su receta decide un zoom por clip y overlays ->
// los overlays se dibujan como PNG transparentes del tamaño del cuadro (overlay/renderPng).
//
// Degradación (regla del proyecto: el video siempre sale): si un overlay no se puede dibujar (sin
// tipografía, ffmpeg falla) se omite y se avisa; una receta desconocida o sin render propio cae a
// clip_kenburns. Nada de esto lanza.
const fs = require('fs');
const os = require('os');
const path = require('path');
const { edlAPlan } = require('./edlAPlan');
const { planFormato } = require('./planFormato');
const recetas = require('../recetas');
const { renderPng } = require('../overlay/renderPng');
const { generarSecuencia } = require('../overlay/animacion');
const { COMPONENTES } = require('../overlay/componentes');
const estiloCapitol = require('../estilos/capitol');

function ordenar(shots) {
  return shots.map((s, i) => ({ s, i }))
    .sort((a, b) => (a.s.orden ?? a.i + 1) - (b.s.orden ?? b.i + 1) || a.i - b.i).map(x => x.s);
}

// opciones: { dirTemp?, fuenteArchivo?, renderizar?, animar? (inyectables para pruebas) }
async function planEdlARender(edl, opciones = {}) {
  const base = edlAPlan(edl);
  const avisos = [...base.avisos];
  const formato = planFormato(edl.aspect);
  const dirTemp = opciones.dirTemp || fs.mkdtempSync(path.join(os.tmpdir(), 'edl-overlays-'));
  const dibujar = opciones.renderizar || renderPng;
  const animar = opciones.animar || generarSecuencia;
  const estilo = opciones.estilo || estiloCapitol;
  fs.mkdirSync(dirTemp, { recursive: true });

  const shots = ordenar(edl.shots);
  const especificaciones = [];
  let indicePlan = 0;
  let tInicio = 0;

  for (const shot of shots) {
    const tieneClip = Boolean(shot.clip);
    const item = tieneClip ? base.plan[indicePlan++] : null;

    const receta = recetas.existe(shot.recipe) ? recetas.obtener(shot.recipe) : recetas.obtener('clip_kenburns');
    if (!recetas.existe(shot.recipe)) avisos.push(`${shot.id}: receta '${shot.recipe}' desconocida, se usa clip_kenburns`);
    const params = recetas.paramsEfectivos(receta.id, shot.params);
    const resultado = receta.aplicar({ shot, params, tInicio, formato });
    avisos.push(...resultado.avisos);
    if (item && resultado.zoom) item.zoom = { direccion: resultado.zoom.direccion, pct: resultado.zoom.pct };
    if (item && resultado.fit && resultado.fit !== 'cover') item.fit = resultado.fit;
    for (const o of resultado.overlays) especificaciones.push({ ...o, shot: shot.id });
    tInicio += shot.duracion;
  }

  const overlays = [];
  for (const [n, o] of especificaciones.entries()) {
    if (o.componente) {
      // Pieza animada: secuencia de fotogramas PNG (ver overlay/animacion.js). Si falla, se omite y se avisa.
      try {
        const comp = COMPONENTES[o.componente];
        if (!comp) throw new Error(`componente desconocido: ${o.componente}`);
        const r = animar({ componente: comp, datos: o.datos, estilo, w: formato.w, h: formato.h, dirDestino: path.join(dirTemp, `anim_${n}_${o.componente}`) });
        overlays.push({ secuencia: r.secuencia, t0: o.t0, t1: o.t1, x: r.x, y: r.y });
      } catch (e) {
        avisos.push(`${o.shot}: animación '${o.componente}' omitida (${e.message})`);
      }
      continue;
    }
    const destino = path.join(dirTemp, `overlay_${n}_${o.estilo}.png`);
    try {
      await dibujar({ texto: o.texto, estilo: o.estilo, w: formato.w, h: formato.h, destino, fuenteArchivo: opciones.fuenteArchivo });
      overlays.push({ path: destino, t0: o.t0, t1: o.t1, x: 0, y: 0 });
    } catch (e) {
      avisos.push(`${o.shot}: overlay '${o.estilo}' omitido (${e.message})`);
    }
  }

  return { plan: base.plan, efectos: { ...base.efectos, overlays }, omitidos: base.omitidos, avisos, dirTemp };
}

module.exports = { planEdlARender };
