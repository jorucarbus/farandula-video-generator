// Rostros medidos en local (scripts/rostros-clips.py → <carpeta>.rostros.json) para corregir los que adivinó el modelo.
//
// Por qué: al comparar con la detección local, las coordenadas que Gemini daba por rostro eran aproximadas (casi siempre
// cx = 0,5 y cy a 0,1-0,5 de distancia), y de ahí salían los círculos que "parecen aleatorios". El detector local acierta
// la posición y el tamaño, y además dice en qué momento exacto sale mejor la cara.
//
// Formato del rostro de la etiqueta (el de siempre): { t, cx, cy, r } relativos al cuadro; r respecto al ANCHO.

// Radio del círculo para una cara de ancho w y alto h (relativos): lo suficiente para rodearla con un poco de aire.
function radioDe(cara, ancho, alto) {
  const hRel = (cara.h * alto) / Math.max(1, ancho);
  return Math.round(0.55 * Math.max(cara.w, hRel) * 1000) / 1000;
}

// El mejor momento del clip: cuadros con UNA sola cara (sale ella sola) y cara grande; los de varias personas valen menos.
function mejorRostro(datos) {
  if (!datos || !(datos.cuadros || []).length) return null;
  let mejor = null, puntaje = -1;
  for (const q of datos.cuadros) {
    const caras = (q.caras || []).filter(c => c.p >= 0.6);
    if (!caras.length) continue;
    const g = caras.slice().sort((a, b) => b.w * b.h - a.w * a.h)[0];
    const margen = Math.min(g.cx - g.w / 2, 1 - (g.cx + g.w / 2), g.cy - g.h / 2, 1 - (g.cy + g.h / 2)); // cara cortada por el borde = peor
    const p = g.w * g.h * (caras.length === 1 ? 1 : 0.6) * (margen < 0 ? 0.5 : 1) * g.p;
    if (p > puntaje) { puntaje = p; mejor = { q, g, n: caras.length }; }
  }
  if (!mejor) return null;
  return { t: mejor.q.t, cx: mejor.g.cx, cy: mejor.g.cy, r: radioDe(mejor.g, datos.ancho, datos.alto), caras: mejor.n };
}

// Cuántos cuadros medidos tienen rostro (para saber si el clip es "de cara" o solo pasa por pantalla).
function fraccionConRostro(datos) {
  const q = (datos && datos.cuadros) || [];
  return q.length ? q.filter(c => (c.caras || []).some(x => x.p >= 0.6)).length / q.length : 0;
}

// Reemplaza el rostro de cada etiqueta por el medido en local. Conserva el del modelo en `rostroIA`.
function aplicar(etiquetas, rostros) {
  const salida = {}; let corregidos = 0, sinCara = 0;
  for (const [id, t] of Object.entries(etiquetas)) {
    const datos = rostros && rostros[id], m = mejorRostro(datos);
    if (!datos) { salida[id] = t; continue; }
    if (!m) { salida[id] = { ...t, rostroLocal: false }; sinCara++; continue; }
    salida[id] = { ...t, rostroIA: t.rostro || null, rostro: { t: m.t, cx: m.cx, cy: m.cy, r: m.r }, rostroLocal: true, carasEnTomaPrincipal: m.caras, fraccionRostro: +fraccionConRostro(datos).toFixed(2) };
    corregidos++;
  }
  return { etiquetas: salida, corregidos, sinCara };
}

// Caja de una cara (relativa al cuadro original) en coordenadas de la ventana vertical 9:16 donde el clip se muestra con recorte "cover".
function cajaEnVentana(cara, ancho, alto) {
  const aV = 9 / 16, aF = ancho / alto; let cx = cara.cx, cy = cara.cy, w = cara.w, h = cara.h;
  if (aF > aV) { const vis = aV / aF; cx = (cx - (1 - vis) / 2) / vis; w /= vis; } else { const vis = aF / aV; cy = (cy - (1 - vis) / 2) / vis; h /= vis; }
  return { cx, cy, w, h, arriba: cy - h / 2, abajo: cy + h / 2 };
}

// Reencuadre dentro de la tarjeta de video cuando otra tarjeta tapa su parte baja: acerca la toma (s) y la sube (dy, fracción del alto)
// lo mínimo para que las caras de la ventana [ss, ss+dur] queden por encima de la zona tapada. null = no hace falta o no se puede.
// Solo se mueve el video DENTRO de su tarjeta; la tarjeta no se mueve.
const ZONA_TAPADA = 0.74, ESCALAS = [1.08, 1.15, 1.22, 1.30];
function encuadreParaTarjeta(serie, ancho, alto, ss, dur) {
  if (!serie || !ancho || !alto) return null;
  const cajas = [];
  for (const q of serie) if (q.t >= ss - 0.25 && q.t <= ss + dur + 0.25) for (const c of q.caras || []) if (c.p >= 0.6) cajas.push(cajaEnVentana(c, ancho, alto));
  if (!cajas.length) return null;
  const abajo = Math.max(...cajas.map(c => c.abajo)), arriba = Math.min(...cajas.map(c => c.arriba));
  if (abajo <= ZONA_TAPADA) return null; // ya se ve entera
  for (const s of ESCALAS) {
    const tope = (s - 1) / 2, dy = Math.max(-tope, ZONA_TAPADA - 0.5 - (abajo - 0.5) * s);
    const abajoF = 0.5 + (abajo - 0.5) * s + dy, arribaF = 0.5 + (arriba - 0.5) * s + dy;
    if (abajoF <= ZONA_TAPADA + 0.005 && arribaF >= 0.02) return { s, dy: +dy.toFixed(4) };
  }
  return null;
}

module.exports = { radioDe, mejorRostro, fraccionConRostro, aplicar, cajaEnVentana, encuadreParaTarjeta, ZONA_TAPADA };
