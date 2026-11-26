// Ensamblador: convierte la DIRECCIÓN del director (qué pieza, qué pose, qué ancla) en elementos del lienzo con tiempos ABSOLUTOS
// tomados de las palabras del guion, y los acomoda en diseños fijos por tipo de escena para que nada se pise.
// El muñeco es CONTINUO a través de frases consecutivas (no se vuelve a caer cada vez): actúa lo narrado cambiando de pose,
// emoción y accesorio en la palabra ancla; en cada frase nueva vuelve a reposo si no hay nada que actuar.
const E = require('./elementos');
const P = require('./piezas');
const { muneco } = require('./recortes');
const { titereRig } = require('./titere-rig');
const { escenario } = require('./escenarios');
const { LUGARES, PAISES, nombreDePieza, tokens } = require('../edl/director');
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
const espejar = (p, der) => (der ? { ...p, cx: 1 - p.cx } : p);
const SLOTS_COMP = [{ cx: 0.84, cy: 0.80 }, { cx: 0.16, cy: 0.80 }]; // con el muñeco acompañante abajo: las insignias van a los lados del muñeco, no sobre el dato
const SLOTS_VIDEO = [{ cx: 0.22, cy: 0.27 }, { cx: 0.80, cy: 0.27 }]; // con el video de fondo: las insignias flotan en las esquinas de arriba del recuadro
// Encuadres del muñeco (fracciones del cuadro): cx, base (pies) y alto (de los pies a la coronilla). medio/primer ponen la cabeza arriba y dejan los pies fuera del cuadro.
const ENC = { cuerpo: { cx: 0.30, base: 0.90, alto: 0.60 }, lado: { cx: 0.26, base: 0.90, alto: 0.56 }, companero: { cx: 0.50, base: 0.99, alto: 0.50 }, medio: { cx: 0.44, base: 1.30, alto: 1.02 }, primer: { cx: 0.46, base: 1.66, alto: 1.45 } };
const PEGATINA = { baston: { dx: 0.34, dy: 0.40, ancho: 0.40, giro: true }, 'guante-pulgar': { dx: -0.36, dy: 0.62, ancho: 0.24 }, 'guante-abierto': { dx: -0.36, dy: 0.62, ancho: 0.28 } };

// cfg: { foto (Buffer|ruta de la cabeza), recorte, anclas?, proporcion = 0.30, voz = null, clips = { id: { ruta, ancho, alto, rostro } } }
// Devuelve { elementos, claves, avisos }. Regla de 3 s: un clip real se muestra como máximo USO_MAX_S seguidos y en total.
// Un círculo sobre el rostro solo tiene sentido si la cara se ve (rostro grande) y la palabra ancla habla de la protagonista; si no, la toma va sin marca.
const ANCLAS_SENTIDO = ['corona', 'coronada', 'reina', 'virreina', 'bastonera', 'campeona', 'ganadora', 'ella'];
function marcaConSentido(info, ancla, alias = []) {
  const t = tokens(String(ancla || ''))[0]; return Boolean(info && info.rostro && info.rostro.r >= 0.17 && t && (alias.includes(t) || ANCLAS_SENTIDO.includes(t)));
}

function ensamblar(escenas, beats, V, palabras, cfg) {
  const fin = k => V[k].t1 + 0.4;
  const idxEn = (k, ancla) => { const n = tokens(String(ancla))[0]; for (let i = V[k].desde; i < V[k].hasta; i++) if (tokens(palabras[i].palabra)[0] === n) return i; return V[k].desde; };
  const tPal = (k, ancla) => (ancla ? palabras[idxEn(k, ancla)].t0 : V[k].t0);
  const elementos = [], claves = new Set(), avisos = [], uso = new Map(), finClip = new Map(); // finClip: beat → segundo en que termina su clip real
  const marca = (k, ancla) => { if (ancla) claves.add(idxEn(k, ancla)); };
  const cubre = [], tarjetas = [], pedidos = [], zoomsT = []; // zoomsT: segundos de las palabras clave (anclas de insignias, mapas y gráficos): ahí se da un golpe de zoom a la toma; // cubre: intervalos con una pieza PRINCIPAL en pantalla; tarjetas: solo las que van sobre el montaje; pedidos: clips que el director pidió para una frase
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
      const marcas = [], m = e.clip.marca && marcaConSentido(info, e.clip.marca.ancla, cfg.alias) ? e.clip.marca : null, cara = m && info.rostro ? rostroEnVentana(info.rostro, info.ancho, info.alto) : null;
      if (m && cara) { // círculo rojo a mano sobre el rostro, en la palabra ancla (dentro de la ventana del clip)
        const tm = Math.min(t0 + dur - 0.6, Math.max(t0 + 0.3, tPal(k, m.ancla)));
        marcas.push({ tipo: 'circulo', cx: cara.cx, cy: cara.cy, rx: cara.r * 1.7, ry: cara.r * 1.7 * (9 / 16), t: tm, semilla: 11 + k }); marca(k, m.ancla);
      } else if (e.clip.marca) avisos.push('frase ' + (k + 1) + (!info.rostro ? ': sin coordenadas del rostro; el clip va sin círculo' : ': el círculo no tiene sentido (rostro pequeño o la palabra no habla de ella); el clip va sin marca'));
      elementos.push(E.ventanaClip({ clip: info.ruta, ss: e.clip.ss, cy: 0.58, t0, t1: t0 + dur, marcas })); cubre.push([t0, t0 + dur]);
    }
    if (e.principal === 'video') { cubre.push([t0, t1]); } // solo montaje de tomas (lo arma el paso 4b): el muñeco no aporta aquí
    if (e.principal === 'escenario') { const ta = Math.max(0, tPal(k, e.escenario.ancla) - 0.2); elementos.push(escenario({ tipo: e.escenario.tipo, texto: e.escenario.texto, cx: e.muneco && e.muneco.lado === 'der' ? 0.30 : 0.70, base: M ? 0.86 : 0.90, ancho: 0.56, t0: ta, t1 })); card([ta, t1]); marca(k, e.escenario.ancla); }
    if (e.principal === 'mapa') { // sin muñeco y con tomas de fondo, el mapa se suma en la parte baja de la tarjeta del video (el video sigue debajo)
      const l = e.mapa.lugar ? LUGARES[e.mapa.lugar] : null; if (e.mapa.lugar ? !l : !PAISES[e.mapa.pais]) throw new Error(`mapa: lugar o país fuera del catálogo (${e.mapa.lugar || e.mapa.pais})`);
      const tA = tPal(k, e.mapa.ancla), t0m = Math.max(t0, tA - 1.2), t1m = Math.max(t0m + 3, Math.min(t1, tA + 4.5)); // el mapa aparece ~1 s antes de nombrar el lugar y no se queda hasta el final de una frase larga
      const base = { cy: e.muneco ? 0.375 : M ? 0.79 : 0.56, alto: e.muneco ? 0.32 : M ? 0.30 : 0.40, tPin: tA, t0: t0m, t1: t1m };
      elementos.push(l ? E.mapa({ pais: 'Ecuador', lugar: { lon: l.lon, lat: l.lat, nombre: e.mapa.lugar }, ...base }) : E.mapa({ pais: PAISES[e.mapa.pais], nombrePais: e.mapa.pais, ...base })); card([t0m, t1m]); marca(k, e.mapa.ancla); zoomsT.push(tPal(k, e.mapa.ancla)); }
    if (e.principal === 'cifra') { const ta = Math.max(0, tPal(k, e.cifra.ancla) - 0.1); elementos.push(E.cifra({ valor: e.cifra.valor, sufijo: e.cifra.sufijo, cy: e.muneco ? 0.34 : M ? 0.80 : 0.42, t0: ta, t1: Math.min(t1, ta + 4) })); card([ta, Math.min(t1, ta + 4)]); marca(k, e.cifra.ancla); }
    if (e.principal === 'grafico') { // barras que crecen, abajo sobre la tarjeta del video (o arriba con muñeco)
      const its = e.grafico.items.map(b => ({ etiqueta: b.etiqueta, valor: b.valor, t: tPal(k, b.ancla) })), ta = Math.max(0, Math.min(...its.map(b => b.t)) - 0.3);
      elementos.push(E.grafico({ titulo: e.grafico.titulo, items: its, cy: e.muneco ? 0.36 : M ? 0.79 : 0.42, alto: 0.30, t0: ta, t1 })); card([ta, t1]); e.grafico.items.forEach(b => { marca(k, b.ancla); zoomsT.push(tPal(k, b.ancla)); });
    }
    if (e.principal === 'lista') { // la tarjeta aparece cuando se dice el primer elemento: una tarjeta vacía no cuenta como pieza
      const items = e.lista.items.map(it => ({ texto: it.texto, t: tPal(k, it.ancla) })), ta = Math.max(t0 + 0.2, Math.min(t0 + 1.2, items[0].t - 0.3));
      elementos.push(E.listaNumerada({ titulo: e.lista.titulo, cy: e.muneco ? 0.36 : M ? 0.79 : 0.40, t0: Math.min(ta, items[0].t - 0.1), t1, items })); card([Math.min(ta, items[0].t - 0.1), t1]);
      marca(k, e.lista.items[0].ancla);
    }
  }

  // 2) el muñeco: un elemento por tramo de frases consecutivas con muñeco
  const conMuneco = [...porBeat.values()].filter(e => e.muneco).map(e => e.beat - 1).sort((a, b) => a - b);
  const tramos = []; for (const k of conMuneco) { const u = tramos[tramos.length - 1]; const ld = kk => porBeat.get(kk).muneco.lado, ultimoLado = u && [...u].reverse().map(ld).find(Boolean); if (u && u[u.length - 1] === k - 1 && porBeat.get(k).principal !== 'clip' && !(ld(k) && ultimoLado && ld(k) !== ultimoLado)) u.push(k); else tramos.push([k]); } // un clip empieza tramo nuevo: el muñeco entra cuando el clip termina
  let primeraEntrada = true; // el muñeco cae solo la primera vez; después entra con un fundido (si no, caería en cada frase)
  for (const tr of tramos) {
    const ladoDer = tr.some(kk => porBeat.get(kk).muneco && porBeat.get(kk).muneco.lado === 'der'), encuadres = [], primero = porBeat.get(tr[0]), m0 = primero.muneco, poses = [], emociones = [], accesorios = [], pegatinas = [], saltos = [], gestos = [], usados = new Set();
    for (const k of tr) {
      const m = porBeat.get(k).muneco, ini = V[k].t0;
      if (k !== tr[0]) { poses.push({ t: ini, pieza: nombreDePieza(m.traje, 'reposo') }); emociones.push({ t: ini, e: 'normal' }); }
      if (m.pose !== 'reposo') { const t = tPal(k, m.ancla_pose); poses.push({ t, pieza: nombreDePieza(m.traje, m.pose) }); saltos.push(t); marca(k, m.ancla_pose); }
      if (m.emocion !== 'normal') emociones.push({ t: tPal(k, m.ancla_emocion || m.ancla_pose), e: m.emocion });
      if (m.accesorio && !usados.has(m.accesorio)) { usados.add(m.accesorio); accesorios.push({ id: m.accesorio, t: tPal(k, m.ancla_accesorio || m.ancla_pose) }); marca(k, m.ancla_accesorio); }
      for (const a of m.saltos || []) saltos.push(tPal(k, a));
      for (const g of [m.gesto, ...(m.gestos || [])].filter(Boolean)) { gestos.push({ id: g.id, t: tPal(k, g.ancla) }); marca(k, g.ancla); } // los gestos del storyboard (varios por frase) además del gesto del director
      { const pl = espejar(ENC[m.encuadre || (porBeat.get(k).principal === 'escenario' ? 'lado' : 'cuerpo')], ladoDer && m.encuadre !== 'companero'); encuadres.push({ t: Math.max(ini, k === tr[0] ? ini : ini - 0.05), ...pl });
        if (m.plano === 'primer') { const tp = Math.max(ini + 0.1, tPal(k, m.ancla_plano) - 0.25); encuadres.push({ t: tp, ...espejar(ENC.primer, ladoDer) }); encuadres.push({ t: Math.min(fin(k) - 0.2, tp + 2.6), ...pl }); } }
      if (m.pegatina) { // la pegatina (p. ej. el bastón) se va cuando el muñeco cambia de pose en esta misma frase
        const ini = tPal(k, m.pegatina.ancla), cambio = m.pose !== 'reposo' ? tPal(k, m.ancla_pose) : null;
        pegatinas.push({ id: m.pegatina.id, t0: ini, t1: cambio !== null && cambio > ini + 0.3 ? cambio - 0.05 : fin(k), ...PEGATINA[m.pegatina.id], ...(ladoDer ? { dx: -PEGATINA[m.pegatina.id].dx } : {}) }); marca(k, m.pegatina.ancla);
      }
    }
    const lado = primero.principal === 'escenario', sig = tr[tr.length - 1] + 1, t1m = porBeat.has(sig) && porBeat.get(sig).principal === 'clip' ? V[sig].t0 : fin(tr[tr.length - 1]); // antes de un clip el muñeco sale justo cuando empieza el video
    cubre.push([finClip.has(tr[0]) ? finClip.get(tr[0]) + 0.1 : V[tr[0]].t0 + 0.1, t1m]);
    const ini0 = encuadres.length ? encuadres[0] : { cx: lado ? 0.26 : 0.30, base: 0.90, alto: lado ? 0.56 : 0.60 }, comun = { espejo: ladoDer, entrada: primeraEntrada ? 'caida' : 'fundido', cx: ini0.cx, base: ini0.base, alto: ini0.alto, encuadres: encuadres.sort((a, b) => a.t - b.t), t0: finClip.has(tr[0]) ? finClip.get(tr[0]) + 0.1 : V[tr[0]].t0 + 0.1, t1: t1m, voz: cfg.voz || null,
      poses: poses.sort((a, b) => a.t - b.t), emociones: emociones.sort((a, b) => a.t - b.t), accesorios, pegatinas, saltos };
    // kit de plastilina: muñeco ARTICULADO de piezas (titere-rig); kit de fotos: el de recortes de antes
    primeraEntrada = false;
    elementos.push(cfg.kit === 'plastilina' ? titereRig({ ...comun, gestos, traje: m0.traje })
      : cfg.kit === 'rig-foto' ? titereRig({ ...comun, gestos, traje: cfg.trajeFoto || 'bastonera-foto' }) // rig articulado con piezas de foto (solo hay un traje: la bastonera)
      : muneco({ ...comun, cuerpo: nombreDePieza(m0.traje, 'reposo'), cabeza: cfg.foto, recorte: cfg.recorte, anclas: cfg.anclas, proporcion: cfg.proporcion ?? 0.30, kit: cfg.kit || 'fotos' }));
  }

  // 3) extras (insignias, sello) en sus posiciones
  for (let k = 0; k < beats.length; k++) {
    const e = porBeat.get(k); if (!e) continue;
    const der = Boolean(e.muneco && e.muneco.lado === 'der'), slots = (e.muneco && ['mapa', 'cifra', 'lista'].includes(e.principal) ? SLOTS_COMP : (M && ['cifra', 'lista', 'mapa', 'grafico'].includes(e.principal)) || e.principal === 'video' ? SLOTS_VIDEO : (SLOTS[e.principal] || SLOTS.muneco).map(p => espejar(p, der))); let s = 0;
    for (const x of e.extras || []) {
      if (x.tipo === 'insignia') { zoomsT.push(tPal(k, x.ancla)); const p = slots[Math.min(s++, slots.length - 1)]; elementos.push(P.insignia({ icono: x.icono, color: x.color || 'negro', etiqueta: x.etiqueta, cx: p.cx, cy: p.cy, r: 0.07, t0: tPal(k, x.ancla), t1: fin(k) })); marca(k, x.ancla); }
      if (x.tipo === 'sello') { elementos.push(P.sello({ cy: 0.5, t0: tPal(k, x.ancla), t1: fin(k) })); marca(k, x.ancla); }
    }
  }
  // 3b) círculos flotantes con la foto de las OTRAS personas cuando se las nombra (el lado ya se eligió para que miren hacia adentro del video)
  for (let k = 0; k < beats.length; k++) {
    const e = porBeat.get(k); if (!e || !e.personas) continue;
    e.personas.forEach((pr) => { const ta = Math.max(0, tPal(k, pr.ancla) - 0.15); elementos.push(E.retrato({ foto: pr.foto, nombre: pr.nombre, cx: pr.lado === 'der' ? 0.84 : 0.16, cy: 0.27, r: 0.115, t0: ta, t1: Math.min(fin(k) + 0.6, ta + 3.4) })); });
  }
  // 4) sin huecos: todo tramo de más de 0.5 s sin pieza principal se llena con clips reales de la protagonista (cada uno ≤ 3 s en total).
  // cfg.relleno = { ids: [ids de clips candidatos], info: id → { ruta, ancho, alto, rostro, duracion } }
  if (M) {
    // 4b) MONTAJE de fondo, SOLO donde el dato es chico (cifra, lista) o donde el director pidió un clip: con el muñeco, el mapa o el escenario el
    // centro es la pieza, sin video. Dentro de cada tramo: tomas de ~2 s cortadas en una palabra, cada una de un clip distinto (nunca se repite).
    // Cada toma ≤ USO_MAX_S − TRANS − 0.1 porque la transición la deja correr TRANS s más: así ningún clip pasa de 3 s en pantalla.
    let ciclo = 0; const MAXC = USO_MAX_S - E.TRANS - 0.1, usados = new Set(pedidos.map(p => p.id)), pool = M.ids.filter(id => !usados.has(id)), tramos4 = [];
    const alPalabra = (t, lo, hi) => { let mejor = null; for (const p of palabras) if (p.t0 >= lo && p.t0 <= hi && (mejor === null || Math.abs(p.t0 - t) < Math.abs(mejor - t))) mejor = p.t0; return mejor === null ? Math.min(hi, Math.max(lo, t)) : mejor; };
    for (let k = 0; k < beats.length; k++) {
      const e = porBeat.get(k); if (!e) continue;
      const ivs = []; // [inicio, fin, esDato]
      if ((e.principal === 'cifra' || e.principal === 'lista' || e.principal === 'mapa' || e.principal === 'grafico' || e.principal === 'video') && !e.muneco) ivs.push([V[k].t0, fin(k), true]);
      else if (e.principal === 'clip' && finClip.has(k)) { ivs.push([V[k].t0, finClip.get(k), false]); if (!e.muneco && fin(k) - finClip.get(k) > 0.5) ivs.push([finClip.get(k), fin(k), true]); } // sin muñeco, lo que queda de la frase tras el clip (≤ 3 s) se llena con otras tomas
      for (const [ia, ib, dato] of ivs) {
        const u = tramos4[tramos4.length - 1];
        if (u && u.dato && dato && ia <= u.b + 0.2) u.b = Math.max(u.b, ib); else tramos4.push({ a: ia, b: ib, dato }); // solo se juntan datos seguidos; el tramo de un clip pedido termina cuando entra el muñeco
      }
    }
    // COLA tras la voz (mínimo de 60 s): solo tomas de video, sin repetir el dato de la última frase
    if (cfg.cola && cfg.cola.t1 - cfg.cola.t0 > 0.5) { const u = tramos4[tramos4.length - 1]; if (u && u.dato && cfg.cola.t0 <= u.b + 0.2) u.b = Math.max(u.b, cfg.cola.t1); else tramos4.push({ a: cfg.cola.t0, b: cfg.cola.t1, dato: true }); }
    const pendientes = [...pedidos].sort((p, q) => V[p.k].t0 - V[q.k].t0); let ri = 0;
    for (const tr of tramos4) {
      const cortes = []; let cur = tr.a;
      while (tr.b - cur > 0.5) {
        const r = pendientes[ri]; let id, dur, pedido = null;
        if (r && V[r.k].t0 >= tr.a - 0.01 && V[r.k].t0 < tr.b && V[r.k].t0 - cur < 1.0) { pedido = r; ri++; id = r.id; dur = Math.min(MAXC, Math.max(1.2, Math.min(tr.b, fin(r.k)) - cur)); }
        else {
          const tope = r && V[r.k].t0 < tr.b ? V[r.k].t0 : tr.b; dur = alPalabra(cur + 1.6 + 0.8 * ((cortes.length * 3) % 5) / 4, cur + 1.2, Math.min(cur + MAXC, tope)) - cur;
          if (!(dur >= 1.0)) dur = Math.min(MAXC, tope - cur);
          id = pool.shift(); if (!id) { if (!M.ids.length) { avisos.push('el montaje no tiene clips'); break; } ciclo++; pool.push(...M.ids); id = pool.shift(); if (ciclo === 1) avisos.push('el montaje reutiliza tomas (otro tramo del mismo clip) a los ' + cur.toFixed(1) + ' s'); }
        }
        const info = (cfg.clips || {})[id] || M.info(id); if (!info) { avisos.push('clip ' + id + ' no disponible; se omite'); continue; }
        const ss = pedido ? pedido.ss : Math.max(0, Math.min(((info.rostro && info.rostro.t) || 0) + (ciclo ? ciclo * 1.1 : 0), Math.max(0, (info.duracion || USO_MAX_S) - dur - E.TRANS))), marcas = []; // al reutilizar un clip se toma otro tramo suyo
        if (pedido && pedido.marca && marcaConSentido(info, pedido.marca.ancla, cfg.alias)) {
          const cara = info.rostro && info.ancho ? rostroEnVentana(info.rostro, info.ancho, info.alto) : null;
          if (cara) { const tm = Math.min(cur + dur - 0.6, Math.max(cur + 0.3, tPal(pedido.k, pedido.marca.ancla))); marcas.push({ tipo: 'circulo', cx: cara.cx, cy: cara.cy, rx: cara.r * 1.7, ry: cara.r * 1.7 * (9 / 16), t: tm, semilla: 11 + pedido.k }); marca(pedido.k, pedido.marca.ancla); }
          else avisos.push('frase ' + (pedido.k + 1) + ': sin coordenadas del rostro; la toma va sin círculo');
        }
        cortes.push({ clip: info.ruta, ss: cfg.ajustarSs ? Math.min(cfg.ajustarSs(info.ruta, ss), Math.max(ss, (info.duracion || USO_MAX_S) - dur - E.TRANS)) : ss, t0: cur, t1: cur + dur, marcas }); cur += dur;
      }
      if (cortes.length) { // un resto mínimo se absorbe en la última toma; el montaje de este tramo termina donde termina el dato
        const ult = cortes[cortes.length - 1]; if (tr.b - ult.t1 > 0 && tr.b - ult.t1 < 0.5) ult.t1 = Math.min(tr.b, ult.t0 + MAXC);
        const merge = []; for (const [a, b] of [...tarjetas].sort((p, q) => p[0] - q[0])) { const u = merge[merge.length - 1]; if (u && a <= u.t1 + 0.2) u.t1 = Math.max(u.t1, b); else merge.push({ t0: a, t1: b }); }
        const zs = []; for (const z of [...zoomsT].sort((p, q) => p - q)) if (z > tr.a + 0.4 && z < ult.t1 - 0.5 && (!zs.length || z - zs[zs.length - 1] >= 2.2)) zs.push(z); // un golpe de zoom por palabra clave, separados ≥ 2,2 s
        elementos.unshift(E.montaje({ cortes, t0: tr.a, t1: ult.t1, atenuar: merge, zooms: zs })); if (zs.length) avisos.push('zoom digital en ' + zs.map(z => z.toFixed(1) + ' s').join(', ')); // primero: queda DEBAJO de todo lo demás
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
