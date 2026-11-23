// Subtítulos estilo capitolinsiders: arriba a la izquierda, en bloques de 1-2 líneas; las palabras ya dichas van
// en negro, las que faltan en gris claro, y las CLAVE llevan subrayado verde que se traza al decirlas.
// Entrada: palabras [{palabra,t0,t1}] (de tiemposPalabras.alinearPalabras). Salida: dibujar(ctx,t).
const { acotar, easeOutCubic } = require('../overlay/animacion');
const { trazar, puntosDeSubrayado } = require('./base');
const { registrarFuentes } = require('../overlay/animacion');

const MAX_PALABRAS = 7;
const termina = p => /[.,;:!?…»)]$/.test(p);

// Parte en bloques: corta tras puntuación (si ya hay 3+ palabras) o al llegar a MAX_PALABRAS.
function bloques(palabras) {
  const out = []; let actual = [];
  palabras.forEach((p, i) => {
    actual.push(i);
    if ((termina(p.palabra) && actual.length >= 3) || actual.length >= MAX_PALABRAS) { out.push(actual); actual = []; }
  });
  if (actual.length) out.push(actual);
  return out;
}

// claves: Set de índices (en `palabras`) que llevan subrayado.
function crearSubtitulos({ palabras, claves = new Set(), w, h, estilo }) {
  registrarFuentes(estilo); // sin la fuente registrada, measureText usaría otra y las palabras saldrían pegadas
  const u = Math.min(w, h);
  const x0 = Math.round(w * 0.137), y0 = Math.round(h * 0.146), tam = Math.round(u * 0.054), interlinea = Math.round(tam * 1.26);
  const ancho = w * 0.74;
  const fuente = `${tam}px ${estilo.tipografia.texto}`;
  const medidor = require('@napi-rs/canvas').createCanvas(8, 8).getContext('2d'); medidor.font = fuente;
  const grupos = bloques(palabras).map(idx => {
    // Reparto en líneas por ancho medido.
    const lineas = []; let linea = []; let x = 0;
    for (const i of idx) {
      const wp = medidor.measureText(palabras[i].palabra + ' ').width;
      if (x + wp > ancho && linea.length) { lineas.push(linea); linea = []; x = 0; }
      linea.push({ i, x, ancho: medidor.measureText(palabras[i].palabra).width }); x += wp;
    }
    if (linea.length) lineas.push(linea);
    const ini = palabras[idx[0]].t0, fin = palabras[idx[idx.length - 1]].t1;
    return { idx, lineas, t0: ini, t1: fin };
  });
  grupos.forEach(g => { g.aparece = Math.max(0, g.t0 - 0.06); });
  grupos.forEach((g, k) => { g.desaparece = k + 1 < grupos.length ? grupos[k + 1].aparece : g.t1 + 0.4; });

  return {
    grupos,
    dibujar(ctx, t) {
      const g = grupos.find(x => t >= x.aparece && t < x.desaparece);
      if (!g) return;
      const entra = acotar((t - g.aparece) / 0.14);
      ctx.save();
      ctx.font = fuente; ctx.textBaseline = 'alphabetic'; ctx.globalAlpha = entra;
      g.lineas.forEach((linea, li) => {
        const y = y0 + li * interlinea + tam;
        for (const c of linea) {
          const p = palabras[c.i];
          const dicha = acotar((t - p.t0) / 0.10);           // gris → negro en 0.1 s
          const gris = Math.round(212 - dicha * (212 - 20)); // #D4 → #14
          ctx.fillStyle = `rgb(${gris},${gris - 2},${gris - 6})`;
          ctx.fillText(p.palabra, x0 + c.x, y);
          if (claves.has(c.i) && t >= p.t0) {
            const pr = easeOutCubic((t - p.t0) / 0.22);
            trazar(ctx, puntosDeSubrayado(x0 + c.x, y + tam * 0.14, x0 + c.x + c.ancho, y + tam * 0.14, c.i + 1), pr, { color: estilo.colores.verde, ancho: Math.max(4, tam * 0.1), u });
          }
        }
      });
      ctx.restore();
    },
  };
}

module.exports = { crearSubtitulos, bloques };
