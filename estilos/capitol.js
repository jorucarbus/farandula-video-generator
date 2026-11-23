// Estilo "capitolinsiders" (referencia elegida por el usuario, nota 29): fondo crema, acentos verde/rojo,
// numerales condensados en negro, tarjetas blancas con sombra. TOKENS, no código: cambiar un número aquí
// cambia el estilo sin tocar los componentes.
//
// OJO: los colores salen de capturas de la referencia (hechos medidos antes). Los tiempos de `movimiento`
// son ESTIMADOS, todavía no medidos cuadro a cuadro contra los videos de referencia: se ajustan a ojo con el
// usuario y luego se miden (plan: nota 29, "motion tokens").
const path = require('path');
const FUENTES = path.join(__dirname, '..', 'assets', 'fuentes');

module.exports = {
  id: 'capitol',
  colores: {
    fondo: '#F3F1ED', verde: '#16A37A', rojo: '#E5173F', gris: '#8F877A',
    negro: '#111111', blanco: '#FFFFFF', sombra: 'rgba(0,0,0,0.28)',
  },
  fuentes: [
    { familia: 'Big Shoulders', archivo: path.join(FUENTES, 'BigShoulders-Bold.ttf') }, // numerales condensados
    { familia: 'Outfit', archivo: path.join(FUENTES, 'Outfit-Bold.ttf') },              // texto
  ],
  tipografia: { numero: '"Big Shoulders"', texto: 'Outfit' },
  // Niveles de los efectos (dB, relativos a la voz ya mezclada): se ajustan a oído. maestro baja todo parejo.
  sonido: { maestro: -10, ganancias: { pop: -10, trazo: -13, tick: -18, golpe: -7, ding: -14, clic: -14 } },
  movimiento: {
    fps: 30,
    // Los elementos "flotan" como las pegatinas de capitol: sube/baja suave y leve inclinación, con fase distinta por elemento.
    flote: { amp: 0.0065, periodo: 3.4, giroGrados: 0.55 },
    pop:    { dur: 0.34, escalaInicial: 0.45, sobreimpulso: 1.9 },   // aparece creciendo con rebote
    conteo: { dur: 0.95 },                                           // 0 → valor, frena al final
    sello:  { dur: 0.30, escalaInicial: 2.5, escalaImpacto: 0.94, giroGrados: -6 }, // cae y se asienta
  },
};
