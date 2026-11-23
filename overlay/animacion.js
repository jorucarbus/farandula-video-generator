// Animación de overlays por SECUENCIA DE FOTOGRAMAS PNG dibujados en código (canvas).
// Por qué así y no con expresiones de ffmpeg: el movimiento (rebote, conteo, caída de sello) queda 100 %
// determinista, se ajusta con números de estilos/*.js y no depende de lo que ffmpeg sepa evaluar.
// Cada componente se dibuja en una caja pequeña (no a pantalla completa): menos peso en disco y en el mux.
const fs = require('fs');
const path = require('path');
const { createCanvas, GlobalFonts } = require('@napi-rs/canvas');

const lerp = (a, b, t) => a + (b - a) * t;
const acotar = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
const easeOutCubic = t => 1 - Math.pow(1 - acotar(t), 3);
const easeInQuad = t => acotar(t) * acotar(t);
// Rebote con sobreimpulso: s≈1.7 da ~10 % de pasada y vuelve (el "pop" de la referencia).
const easeOutBack = (t, s = 1.70158) => { const x = acotar(t) - 1; return 1 + (s + 1) * x * x * x + s * x * x; };

let fuentesRegistradas = new Set();
function registrarFuentes(estilo) {
  for (const f of estilo.fuentes) {
    if (fuentesRegistradas.has(f.archivo)) continue;
    if (!fs.existsSync(f.archivo)) throw new Error(`falta la fuente ${f.archivo}`);
    GlobalFonts.registerFromPath(f.archivo, f.familia);
    fuentesRegistradas.add(f.archivo);
  }
}

// componente: { dur(estilo,datos), caja({w,h,u,datos,estilo,ctx}), dibujar(ctx,{p,t,cw,ch,u,datos,estilo}) }
// u = unidad = lado menor del cuadro (1080 en 9:16 y 16:9): todos los tamaños son proporciones de u.
// Devuelve { secuencia:{patron,fps,n}, x, y, cw, ch, dur }.
function generarSecuencia({ componente, datos, estilo, w, h, dirDestino, prefijo = 'anim' }) {
  registrarFuentes(estilo);
  const fps = estilo.movimiento.fps;
  const u = Math.min(w, h);
  const medidor = createCanvas(8, 8).getContext('2d');
  const { cw, ch, x, y } = componente.caja({ w, h, u, datos, estilo, ctx: medidor });
  const dur = componente.dur(estilo, datos);
  const n = Math.max(2, Math.ceil(dur * fps) + 1);
  fs.mkdirSync(dirDestino, { recursive: true });
  const canvas = createCanvas(cw, ch);
  const ctx = canvas.getContext('2d');
  for (let i = 0; i < n; i++) {
    ctx.clearRect(0, 0, cw, ch);
    const t = Math.min(dur, i / fps);
    componente.dibujar(ctx, { p: acotar(t / dur), t, cw, ch, w, h, u, datos, estilo });
    fs.writeFileSync(path.join(dirDestino, `${prefijo}_${String(i).padStart(3, '0')}.png`), canvas.toBuffer('image/png'));
  }
  return { secuencia: { patron: path.join(dirDestino, `${prefijo}_%03d.png`), fps, n }, x, y, cw, ch, dur };
}

module.exports = { generarSecuencia, registrarFuentes, lerp, acotar, easeOutCubic, easeInQuad, easeOutBack };
