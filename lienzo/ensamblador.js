// Ensamblador: convierte la DIRECCIÓN del director (qué pieza, qué pose, qué ancla) en elementos del lienzo con tiempos ABSOLUTOS
// tomados de las palabras del guion, y los acomoda en diseños fijos por tipo de escena para que nada se pise.
// El muñeco es CONTINUO a través de frases consecutivas (no se vuelve a caer cada vez): actúa lo narrado cambiando de pose,
// emoción y accesorio en la palabra ancla; en cada frase nueva vuelve a reposo si no hay nada que actuar.
const E = require('./elementos');
const P = require('./piezas');
const { muneco } = require('./recortes');
const { titereRig } = require('./titere-rig');
const { escenario } = require('./escenarios');
const { LUGARES, nombreDePieza, tokens } = require('../edl/director');
const { rostroEnVentana, USO_MAX_S } = require('../edl/biblioteca');

// Posiciones (fracciones del cuadro) de las piezas EXTRA según el principal de la escena.
const SLOTS = {
  muneco: [{ cx: 0.76, cy: 0.40 }, { cx: 0.76, cy: 0.64 }],
  mapa: [{ cx: 0.35, cy: 0.27 }, { cx: 0.65, cy: 0.27 }],
  cifra: [{ cx: 0.30, cy: 0.64 }, { cx: 0.70, cy: 0.64 }],
  lista: [{ cx: 0.30, cy: 0.76 }, { cx: 0.70, cy: 0.76 }],
  escenario: [{ cx: 0.75, cy: 0.30 }, { cx: 0.25, cy: 0.30 }],
  clip: [{ cx: 0.76, cy: 0.40 }, { cx: 0.76, cy: 0.64 }], // a la derecha, como con el muñeco (que entra después del clip)
};
const SLOTS_VIDEO = [{ cx: 0.22, cy: 0.27 }, { cx: 0.80, cy: 0.27 }]; // con el video de fondo: las insignias flotan en las esquinas de arriba del recuadro
const PEGATINA = { baston: { dx: 0.34, dy: 0.40, ancho: 0.40, giro: true }, 'guante-pulgar': { dx: -0.36, dy: 0.62, ancho: 0.24 }, 'guante-abierto': { dx: -0.36, dy: 0.62, ancho: 0.28 } };

// cfg: { foto (Buffer|ruta de la cabeza), recorte, anclas?, proporcion = 0.30, voz = null, clips = { id: { ruta, ancho, alto, rostro } } }
// Devuelve { elementos, claves, avisos }. Regla de 3 s: un clip real se muestra como máximo USO_MAX_S seguidos y en total.
function ensamblar(escenas, beats, V, palabras, cfg) {
  const fin = k => V[k].t1 + 0.4;
  const idxEn = (k, ancla) => { const n = tokens(String(ancla))[0]; for (let i = V[k].desde; i < V[k].hasta; i++) if (tokens(palabras[i].palabra)[0] === n) return i; return V[k].desde; };
  const tPal = (k, ancla) => (ancla ? palabras[idxEn(k, ancla)].t0 : V[k].t0);
  const elementos = [], claves = new Set(), avisos = [], uso = new Map(), finClip = new Map(); // finClip: beat → segundo en que termina su clip real
  const marca = (k, ancla) => { if (ancla) claves.add(idxEn(k, ancla)); };
  const cubre = [], tarjetas = [], pedidos = []; // cubre: intervalos con una pieza PRINCIPAL en pantalla; tarjetas: solo las que van sobre el montaje; pedidos: clips que el director pidió para una frase
  const card = iv => { cubre.push(iv); tarjetas.push(iv); };
  const M = cfg.montaje && cfg.montaje.ids && cfg.montaje.ids.length ? cfg.montaje : null; // con montaje, el video es el fondo de todo el tiempo

  // 1) piezas principales y extras, frase por frase
  const porBeat = new Map(escenas.map(e => [e.beat - 1, e]));
  for (let k = 0; k < beats.length; k++) {
    const e = porBeat.get(k); if (!e) continue;
    const t0 = V[k].t0, t1 = fin(k);
    if (e.principal === 'clip' && M) { pedidos.push({ k, id: e.clip.id, ss: e.clip.ss, marca: e.clip.marca }); finClip.set(k, t0 + Math.min(USO_MAX_S - E.TRANS - 0.1, Math.max(1.2, fin(k) - t0))); continue; } // el clip pedido será una toma del montaje
    if (e.principal === 'clip') {
      const info = (cfg.clips || {})[e.clip.id];
      if (!info) { avisos.push('frase ' + (k + 1) + ': el clip ' + e.clip.id + ' no está disponible; se omite'); continue; }
      const gastado = uso.get(e.clip.id) || 0, dur = Math.min(USO_MAX_S - gastado, fin(k) - t0, USO_MAX_S);
      if (dur < 0.5) { avisos.push('frase ' + (k + 1) + ': el clip ' + e.clip.id + ' ya agotó sus ' + USO_MAX_S + ' s de uso; se omite'); continue; }
      uso.set(e.clip.id, gastado + dur); finClip.set(k, t0 + dur);
      const marcas = [], m = e.clip.marca, cara = m && info.rostro ? rostroEnVentana(info.rostro, info.ancho, info.alto) : null;
      if (m && cara) { // círculo rojo a mano sobre el rostro, en la palabra ancla (dentro de la ventana del clip)
        const tm = Math.min(t0 + dur - 0.6, Math.max(t0 + 0.3, tPal(k, m.ancla)));
        marcas.push({ tipo: 'circulo', cx: cara.cx, cy: cara.cy, rx: cara.r * 1.7, ry: cara.r * 1.7 * (9 / 16), t: tm, semilla: 11 + k }); marca(k, m.ancla);
      } else if (m) avisos.push('frase ' + (k + 1) + ': sin coordenadas del rostro; el clip va sin círculo');
      elementos.push(E.ventanaClip({ clip: info.ruta, ss: e.clip.ss, cy: 0.58, t0, t1: t0 + dur, marcas })); cubre.push([t0, t0 + dur]);
    }
    if (e.principal === 'escenario') { const ta = Math.max(0, tPal(k, e.escenario.ancla) - 0.2); elementos.push(escenario({ tipo: e.escenario.tipo, texto: e.escenario.texto, cx: 0.70, base: M ? 0.86 : 0.90, ancho: 0.56, t0: ta, t1 })); card([ta, t1]); marca(k, e.escenario.ancla); }
    if (e.principal === 'mapa') { const l = LUGARES[e.mapa.lugar]; elementos.push(E.mapa({ pais: 'Ecuador', lugar: { lon: l.lon, lat: l.lat, nombre: e.mapa.lugar }, tPin: tPal(k, e.mapa.ancla), cy: M ? 0.52 : 0.56, t0, t1 })); card([t0, t1]); marca(k, e.mapa.ancla); }
    if (e.principal === 'cifra') { const ta = Math.max(0, tPal(k, e.cifra.ancla) - 0.1); elementos.push(E.cifra({ valor: e.cifra.valor, sufijo: e.cifra.sufijo, cy: M ? 0.66 : 0.42, t0: ta, t1 })); card([ta, t1]); marca(k, e.cifra.ancla); }
    if (e.principal === 'lista') { // la tarjeta aparece cuando se dice el primer elemento: una tarjeta vacía no cuenta como pieza
      const items = e.lista.items.map(it => ({ texto: it.texto, t: tPal(k, it.ancla) })), ta = Math.max(t0 + 0.2, Math.min(t0 + 1.2, items[0].t - 0.3));
      elementos.push(E.listaNumerada({ titulo: e.lista.titulo, cy: M ? 0.64 : 0.40, t0: Math.min(ta, items[0].t - 0.1), t1, items })); card([Math.min(ta, items[0].t - 0.1), t1]);
      marca(k, e.lista.items[0].ancla);
    }
  }

  // 2) el muñeco: un elemento por tramo de frases consecutivas con muñeco
  const conMuneco = [...porBeat.values()].filter(e => e.muneco).map(e => e.beat - 1).sort((a, b) => a - b);
  const tramos = []; for (const k of conMuneco) { const u = tramos[tramos.length - 1]; if (u && u[u.length - 1] === k - 1 && porBeat.get(k).principal !== 'clip') u.push(k); else tramos.push([k]); } // un clip empieza tramo nuevo: el muñeco entra cuando el clip termina
  for (const tr of tramos) {
    const primero = porBeat.get(tr[0]), m0 = primero.muneco, poses = [], emociones = [], accesorios = [], pegatinas = [], saltos = [], gestos = [], usados = new Set();
    for (const k of tr) {
      const m = porBeat.get(k).muneco, ini = V[k].t0;
      if (k !== tr[0]) { poses.push({ t: ini, pieza: nombreDePieza(m.traje, 'reposo') }); emociones.push({ t: ini, e: 'normal' }); }
      if (m.pose !== 'reposo') { const t = tPal(k, m.ancla_pose); poses.push({ t, pieza: nombreDePieza(m.traje, m.pose) }); saltos.push(t); marca(k, m.ancla_pose); }
      if (m.emocion !== 'normal') emociones.push({ t: tPal(k, m.ancla_emocion || m.ancla_pose), e: m.emocion });
      if (m.accesorio && !usados.has(m.accesorio)) { usados.add(m.accesorio); accesorios.push({ id: m.accesorio, t: tPal(k, m.ancla_accesorio || m.ancla_pose) }); marca(k, m.ancla_accesorio); }
      for (const a of m.saltos || []) saltos.push(tPal(k, a));
      if (m.gesto) { gestos.push({ id: m.gesto.id, t: tPal(k, m.gesto.ancla) }); marca(k, m.gesto.ancla); }
      if (m.pegatina) { // la pegatina (p. ej. el bastón) se va cuando el muñeco cambia de pose en esta misma frase
        const ini = tPal(k, m.pegatina.ancla), cambio = m.pose !== 'reposo' ? tPal(k, m.ancla_pose) : null;
        pegatinas.push({ id: m.pegatina.id, t0: ini, t1: cambio !== null && cambio > ini + 0.3 ? cambio - 0.05 : fin(k), ...PEGATINA[m.pegatina.id] }); marca(k, m.pegatina.ancla);
      }
    }
    const lado = primero.principal === 'escenario', sig = tr[tr.length - 1] + 1, t1m = porBeat.has(sig) && porBeat.get(sig).principal === 'clip' ? V[sig].t0 : fin(tr[tr.length - 1]); // antes de un clip el muñeco sale justo cuando empieza el video
    cubre.push([finClip.has(tr[0]) ? finClip.get(tr[0]) + 0.1 : V[tr[0]].t0 + 0.1, t1m]);
    const comun = { cx: lado ? 0.26 : 0.30, base: 0.90, alto: lado ? 0.56 : 0.60, t0: finClip.has(tr[0]) ? finClip.get(tr[0]) + 0.1 : V[tr[0]].t0 + 0.1, t1: t1m, voz: cfg.voz || null,
      poses: poses.sort((a, b) => a.t - b.t), emociones: emociones.sort((a, b) => a.t - b.t), accesorios, pegatinas, saltos };
    // kit de plastilina: muñeco ARTICULADO de piezas (titere-rig); kit de fotos: el de recortes de antes
    elementos.push(cfg.kit === 'plastilina' ? titereRig({ ...comun, gestos, traje: m0.traje })
      : cfg.kit === 'rig-foto' ? titereRig({ ...comun, gestos, traje: cfg.trajeFoto || 'bastonera-foto' }) // rig articulado con piezas de foto (solo hay un traje: la bastonera)
      : muneco({ ...comun, cuerpo: nombreDePieza(m0.traje, 'reposo'), cabeza: cfg.foto, recorte: cfg.recorte, anclas: cfg.anclas, proporcion: cfg.proporcion ?? 0.30, kit: cfg.kit || 'fotos' }));
  }

  // 3) extras (insignias, sello) en sus posiciones
  for (let k = 0; k < beats.length; k++) {
    const e = porBeat.get(k); if (!e) continue;
    const slots = M && (e.principal === 'cifra' || e.principal === 'lista') ? SLOTS_VIDEO : SLOTS[e.principal] || SLOTS.muneco; let s = 0;
    for (const x of e.extras || []) {
      if (x.tipo === 'insignia') { const p = slots[Math.min(s++, slots.length - 1)]; elementos.push(P.insignia({ icono: x.icono, color: x.color || 'negro', etiqueta: x.etiqueta, cx: p.cx, cy: p.cy, r: 0.07, t0: tPal(k, x.ancla), t1: fin(k) })); marca(k, x.ancla); }
      if (x.tipo === 'sello') { elementos.push(P.sello({ cy: 0.5, t0: tPal(k, x.ancla), t1: fin(k) })); marca(k, x.ancla); }
    }
  }
  // 4) sin huecos: todo tramo de más de 0.5 s sin pieza principal se llena con clips reales de la protagonista (cada uno ≤ 3 s en total).
  // cfg.relleno = { ids: [ids de clips candidatos], info: id → { ruta, ancho, alto, rostro, duracion } }
  if (M) {
    // 4b) MONTAJE de fondo, SOLO donde el dato es chico (cifra, lista) o donde el director pidió un clip: con el muñeco, el mapa o el escenario el
    // centro es la pieza, sin video. Dentro de cada tramo: tomas de ~2 s cortadas en una palabra, cada una de un clip distinto (nunca se repite).
    // Cada toma ≤ USO_MAX_S − TRANS − 0.1 porque la transición la deja correr TRANS s más: así ningún clip pasa de 3 s en pantalla.
    const MAXC = USO_MAX_S - E.TRANS - 0.1, usados = new Set(pedidos.map(p => p.id)), pool = M.ids.filter(id => !usados.has(id)), tramos4 = [];
    const alPalabra = (t, lo, hi) => { let mejor = null; for (const p of palabras) if (p.t0 >= lo && p.t0 <= hi && (mejor === null || Math.abs(p.t0 - t) < Math.abs(mejor - t))) mejor = p.t0; return mejor === null ? Math.min(hi, Math.max(lo, t)) : mejor; };
    for (let k = 0; k < beats.length; k++) {
      const e = porBeat.get(k); if (!e) continue;
      let iv = null, dato = false; if (e.principal === 'cifra' || e.principal === 'lista') { iv = [V[k].t0, fin(k)]; dato = true; } else if (e.principal === 'clip' && finClip.has(k)) iv = [V[k].t0, finClip.get(k)];
      if (!iv) continue; const u = tramos4[tramos4.length - 1];
      if (u && u.dato && dato && iv[0] <= u.b + 0.2) u.b = Math.max(u.b, iv[1]); else tramos4.push({ a: iv[0], b: iv[1], dato }); // solo se juntan datos seguidos; el tramo de un clip pedido termina cuando entra el muñeco
    }
    const pendientes = [...pedidos].sort((p, q) => V[p.k].t0 - V[q.k].t0); let ri = 0;
    for (const tr of tramos4) {
      const cortes = []; let cur = tr.a;
      while (tr.b - cur > 0.5) {
        const r = pendientes[ri]; let id, dur, pedido = null;
        if (r && V[r.k].t0 >= tr.a - 0.01 && V[r.k].t0 < tr.b && V[r.k].t0 - cur < 1.0) { pedido = r; ri++; id = r.id; dur = Math.min(MAXC, Math.max(1.2, Math.min(tr.b, fin(r.k)) - cur)); }
        else {
          const tope = r && V[r.k].t0 < tr.b ? V[r.k].t0 : tr.b; dur = alPalabra(cur + 1.6 + 0.8 * ((cortes.length * 3) % 5) / 4, cur + 1.2, Math.min(cur + MAXC, tope)) - cur;
          if (!(dur >= 1.0)) dur = Math.min(MAXC, tope - cur);
          id = pool.shift(); if (!id) { avisos.push('el montaje se queda sin clips distintos a los ' + cur.toFixed(1) + ' s'); break; }
        }
        const info = (cfg.clips || {})[id] || M.info(id); if (!info) { avisos.push('clip ' + id + ' no disponible; se omite'); continue; }
        const ss = pedido ? pedido.ss : Math.max(0, Math.min((info.rostro && info.rostro.t) || 0, Math.max(0, (info.duracion || USO_MAX_S) - dur - E.TRANS))), marcas = [];
        if (pedido && pedido.marca) {
          const cara = info.rostro && info.ancho ? rostroEnVentana(info.rostro, info.ancho, info.alto) : null;
          if (cara) { const tm = Math.min(cur + dur - 0.6, Math.max(cur + 0.3, tPal(pedido.k, pedido.marca.ancla))); marcas.push({ tipo: 'circulo', cx: cara.cx, cy: cara.cy, rx: cara.r * 1.7, ry: cara.r * 1.7 * (9 / 16), t: tm, semilla: 11 + pedido.k }); marca(pedido.k, pedido.marca.ancla); }
          else avisos.push('frase ' + (pedido.k + 1) + ': sin coordenadas del rostro; la toma va sin círculo');
        }
        cortes.push({ clip: info.ruta, ss, t0: cur, t1: cur + dur, marcas }); cur += dur;
      }
      if (cortes.length) { // un resto mínimo se absorbe en la última toma; el montaje de este tramo termina donde termina el dato
        const ult = cortes[cortes.length - 1]; if (tr.b - ult.t1 > 0 && tr.b - ult.t1 < 0.5) ult.t1 = Math.min(tr.b, ult.t0 + MAXC);
        const merge = []; for (const [a, b] of [...tarjetas].sort((p, q) => p[0] - q[0])) { const u = merge[merge.length - 1]; if (u && a <= u.t1 + 0.2) u.t1 = Math.max(u.t1, b); else merge.push({ t0: a, t1: b }); }
        elementos.unshift(E.montaje({ cortes, t0: tr.a, t1: ult.t1, atenuar: merge })); // primero: queda DEBAJO de todo lo demás
      }
    }
  } else if (cfg.relleno && cfg.relleno.ids && cfg.relleno.ids.length) {
    const fa = fin(beats.length - 1), ord = cubre.filter(([a, b]) => b > a).sort((p, q) => p[0] - q[0]), huecos = []; let cur = V[0].t0;
    for (const [a, b] of ord) { if (a - cur > 0.5) huecos.push([cur, a]); cur = Math.max(cur, b); }
    if (fa - cur > 0.5) huecos.push([cur, fa]);
    const pool = [...cfg.relleno.ids];
    for (const [ha, hb] of huecos) {
      let a = ha;
      while (hb - a > 0.5) {
        const id = pool.find(i => USO_MAX_S - (uso.get(i) || 0) >= 0.5);
        if (!id) { avisos.push('hueco de ' + ha.toFixed(1) + ' a ' + hb.toFixed(1) + ' s sin clips de relleno disponibles'); break; }
        const info = cfg.relleno.info(id), dur = Math.min(USO_MAX_S - (uso.get(id) || 0), hb - a, USO_MAX_S);
        const ss = Math.max(0, Math.min((info.rostro && info.rostro.t) || 0, Math.max(0, (info.duracion || USO_MAX_S) - dur)));
        uso.set(id, (uso.get(id) || 0) + dur);
        elementos.push(E.ventanaClip({ clip: info.ruta, ss, cy: 0.58, t0: a, t1: a + dur, marcas: [] }));
        a += dur;
      }
    }
  }
  return { elementos, claves, avisos };
}

module.exports = { ensamblar, SLOTS };
