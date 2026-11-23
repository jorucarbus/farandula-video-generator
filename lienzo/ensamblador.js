// Ensamblador: convierte la DIRECCIÓN del director (qué pieza, qué pose, qué ancla) en elementos del lienzo con tiempos ABSOLUTOS
// tomados de las palabras del guion, y los acomoda en diseños fijos por tipo de escena para que nada se pise.
// El muñeco es CONTINUO a través de frases consecutivas (no se vuelve a caer cada vez): actúa lo narrado cambiando de pose,
// emoción y accesorio en la palabra ancla; en cada frase nueva vuelve a reposo si no hay nada que actuar.
const E = require('./elementos');
const P = require('./piezas');
const { muneco } = require('./recortes');
const { escenario } = require('./escenarios');
const { LUGARES, nombreDePieza, tokens } = require('../edl/director');

// Posiciones (fracciones del cuadro) de las piezas EXTRA según el principal de la escena.
const SLOTS = {
  muneco: [{ cx: 0.76, cy: 0.40 }, { cx: 0.76, cy: 0.64 }],
  mapa: [{ cx: 0.35, cy: 0.27 }, { cx: 0.65, cy: 0.27 }],
  cifra: [{ cx: 0.30, cy: 0.64 }, { cx: 0.70, cy: 0.64 }],
  lista: [{ cx: 0.30, cy: 0.76 }, { cx: 0.70, cy: 0.76 }],
  escenario: [{ cx: 0.75, cy: 0.30 }, { cx: 0.25, cy: 0.30 }],
};
const PEGATINA = { baston: { dx: 0.34, dy: 0.40, ancho: 0.40, giro: true }, 'guante-pulgar': { dx: -0.36, dy: 0.62, ancho: 0.24 }, 'guante-abierto': { dx: -0.36, dy: 0.62, ancho: 0.28 } };

// cfg: { foto (Buffer|ruta de la cabeza), recorte, anclas?, proporcion = 0.30, voz = null }
function ensamblar(escenas, beats, V, palabras, cfg) {
  const fin = k => V[k].t1 + 0.4;
  const idxEn = (k, ancla) => { const n = tokens(String(ancla))[0]; for (let i = V[k].desde; i < V[k].hasta; i++) if (tokens(palabras[i].palabra)[0] === n) return i; return V[k].desde; };
  const tPal = (k, ancla) => (ancla ? palabras[idxEn(k, ancla)].t0 : V[k].t0);
  const elementos = [], claves = new Set();
  const marca = (k, ancla) => { if (ancla) claves.add(idxEn(k, ancla)); };

  // 1) piezas principales y extras, frase por frase
  const porBeat = new Map(escenas.map(e => [e.beat - 1, e]));
  for (let k = 0; k < beats.length; k++) {
    const e = porBeat.get(k); if (!e) continue;
    const t0 = V[k].t0, t1 = fin(k);
    if (e.principal === 'escenario') { elementos.push(escenario({ tipo: e.escenario.tipo, texto: e.escenario.texto, cx: 0.70, base: 0.90, ancho: 0.56, t0: Math.max(0, tPal(k, e.escenario.ancla) - 0.2), t1 })); marca(k, e.escenario.ancla); }
    if (e.principal === 'mapa') { const l = LUGARES[e.mapa.lugar]; elementos.push(E.mapa({ pais: 'Ecuador', lugar: { lon: l.lon, lat: l.lat, nombre: e.mapa.lugar }, tPin: tPal(k, e.mapa.ancla), cy: 0.56, t0, t1 })); marca(k, e.mapa.ancla); }
    if (e.principal === 'cifra') { elementos.push(E.cifra({ valor: e.cifra.valor, sufijo: e.cifra.sufijo, cy: 0.42, t0: Math.max(0, tPal(k, e.cifra.ancla) - 0.1), t1 })); marca(k, e.cifra.ancla); }
    if (e.principal === 'lista') {
      elementos.push(E.listaNumerada({ titulo: e.lista.titulo, cy: 0.40, t0: t0 + 0.2, t1, items: e.lista.items.map(it => ({ texto: it.texto, t: tPal(k, it.ancla) })) }));
      marca(k, e.lista.items[0].ancla);
    }
  }

  // 2) el muñeco: un elemento por tramo de frases consecutivas con muñeco
  const conMuneco = [...porBeat.values()].filter(e => e.muneco).map(e => e.beat - 1).sort((a, b) => a - b);
  const tramos = []; for (const k of conMuneco) { const u = tramos[tramos.length - 1]; if (u && u[u.length - 1] === k - 1) u.push(k); else tramos.push([k]); }
  for (const tr of tramos) {
    const primero = porBeat.get(tr[0]), m0 = primero.muneco, poses = [], emociones = [], accesorios = [], pegatinas = [], saltos = [], usados = new Set();
    for (const k of tr) {
      const m = porBeat.get(k).muneco, ini = V[k].t0;
      if (k !== tr[0]) { poses.push({ t: ini, pieza: nombreDePieza(m.traje, 'reposo') }); emociones.push({ t: ini, e: 'normal' }); }
      if (m.pose !== 'reposo') { const t = tPal(k, m.ancla_pose); poses.push({ t, pieza: nombreDePieza(m.traje, m.pose) }); saltos.push(t); marca(k, m.ancla_pose); }
      if (m.emocion !== 'normal') emociones.push({ t: tPal(k, m.ancla_emocion || m.ancla_pose), e: m.emocion });
      if (m.accesorio && !usados.has(m.accesorio)) { usados.add(m.accesorio); accesorios.push({ id: m.accesorio, t: tPal(k, m.ancla_accesorio || m.ancla_pose) }); marca(k, m.ancla_accesorio); }
      for (const a of m.saltos || []) saltos.push(tPal(k, a));
      if (m.pegatina) { // la pegatina (p. ej. el bastón) se va cuando el muñeco cambia de pose en esta misma frase
        const ini = tPal(k, m.pegatina.ancla), cambio = m.pose !== 'reposo' ? tPal(k, m.ancla_pose) : null;
        pegatinas.push({ id: m.pegatina.id, t0: ini, t1: cambio !== null && cambio > ini + 0.3 ? cambio - 0.05 : fin(k), ...PEGATINA[m.pegatina.id] }); marca(k, m.pegatina.ancla);
      }
    }
    const lado = primero.principal === 'escenario';
    elementos.push(muneco({
      cuerpo: nombreDePieza(m0.traje, 'reposo'), cabeza: cfg.foto, recorte: cfg.recorte, anclas: cfg.anclas, proporcion: cfg.proporcion ?? 0.30, voz: cfg.voz || null,
      cx: lado ? 0.26 : 0.30, base: 0.93, alto: lado ? 0.56 : 0.60, t0: V[tr[0]].t0 + 0.1, t1: fin(tr[tr.length - 1]),
      poses: poses.sort((a, b) => a.t - b.t), emociones: emociones.sort((a, b) => a.t - b.t), accesorios, pegatinas, saltos,
    }));
  }

  // 3) extras (insignias, sello) en sus posiciones
  for (let k = 0; k < beats.length; k++) {
    const e = porBeat.get(k); if (!e) continue;
    const slots = SLOTS[e.principal] || SLOTS.muneco; let s = 0;
    for (const x of e.extras || []) {
      if (x.tipo === 'insignia') { const p = slots[Math.min(s++, slots.length - 1)]; elementos.push(P.insignia({ icono: x.icono, color: x.color || 'negro', etiqueta: x.etiqueta, cx: p.cx, cy: p.cy, r: 0.07, t0: tPal(k, x.ancla), t1: fin(k) })); marca(k, x.ancla); }
      if (x.tipo === 'sello') { elementos.push(P.sello({ cy: 0.5, t0: tPal(k, x.ancla), t1: fin(k) })); marca(k, x.ancla); }
    }
  }
  return { elementos, claves };
}

module.exports = { ensamblar, SLOTS };
