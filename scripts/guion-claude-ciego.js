// Versión "Claude" del guion de la prueba ciega, validada con el MISMO validador que la de Gemini.
const { validarGuion, limitesDeLargo } = require('../edl/guionNarrativo');
const src = require('fs').readFileSync(__dirname + '/probar-guion-real.js', 'utf8');
const hechos = eval(src.match(/const hechos = (\[[\s\S]*?\n\]);/)[1]);
const beats = [
  { frase: 'Doce aspirantes subieron al escenario del Coliseo La California, en Portoviejo, y la corona se quedó en Chone.', rol: 'lugar', hechos: [1, 3] },
  { frase: 'La noche del viernes 30 de octubre de 2026, Leidy Michelle Alvarez Corral, la Chonera Bonita, ganó el título de Reina de Manabí 2026-2027.', rol: 'persona', hechos: [2] },
  { frase: 'Quien le puso la corona fue Paula Zambrano, su antecesora, que también representó a Chone.', rol: 'objeto', hechos: [4] },
  { frase: 'Marcel Ponce Zamora, de Manta, fue virreina.', rol: 'persona', hechos: [5] },
  { frase: 'Ariana Espinoza, de Bolívar, quedó primera finalista; Camille Ramírez, de Portoviejo, segunda; y Diana Andrade, de El Carmen, tercera.', rol: 'persona', hechos: [6] },
  { frase: 'Antes, Alvarez ya había ganado Chonera Bonita 2023, Miss Turismo Manabí 2024 y Reina de Chone 2026.', rol: 'fecha', hechos: [8] },
  { frase: 'Desde hace seis años está en TikTok e Instagram.', rol: 'cifra', hechos: [7] },
  { frase: 'Al terminar la gala, agradeció el respaldo de su cantón y de las autoridades locales que impulsaron su candidatura.', rol: 'persona', hechos: [9] },
];
const v = validarGuion(beats, hechos, limitesDeLargo(hechos));
console.log('PALABRAS', v.palabras, '| ERRORES', v.errores.join(' | ') || '-', '| AVISOS', v.avisos.join(' | ') || '-');
beats.forEach((b, i) => console.log(`${i + 1}. [${b.rol}] ${b.frase}`));
