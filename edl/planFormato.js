// Formato de salida (9:16 o 16:9): una sola fuente de verdad para ancho, alto y fps.
// Función pura, sin dependencias. El default es 9:16, que es lo que el render hacía antes de que
// existiera la elección de formato: sin `aspect`, el resultado tiene que ser idéntico al de siempre.
const FORMATOS = {
  '9:16': { aspect: '9:16', w: 1080, h: 1920, fps: 30 },
  '16:9': { aspect: '16:9', w: 1920, h: 1080, fps: 30 },
};

function planFormato(aspect) {
  const f = FORMATOS[aspect || '9:16'];
  if (!f) throw new Error(`aspect desconocido: ${aspect} (usar 9:16 o 16:9)`);
  return {
    ...f,
    // Mismo filtro que el render usaba escrito a mano: cubre el cuadro completo y recorta el sobrante.
    escalaYRecorte: `scale=${f.w}:${f.h}:force_original_aspect_ratio=increase,crop=${f.w}:${f.h},fps=${f.fps}`,
    tamano: `${f.w}x${f.h}`,
  };
}

module.exports = { planFormato, FORMATOS };
