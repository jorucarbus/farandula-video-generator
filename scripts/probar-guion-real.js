// Prueba real del guion narrativo con Gemini. Hechos tomados de una crónica real del historial (respaldo, solo lectura).
// Uso: node scripts/probar-guion-real.js
require('dotenv').config();
const { generarGuion } = require('../edl/guionNarrativo');
const hechos = [
  { texto: 'El Coliseo La California de Portoviejo fue la sede de la elección de la Reina de Manabí 2026-2027.' },
  { texto: 'La noche del viernes 30 de octubre de 2026, Leidy Michelle Alvarez Corral, conocida como la Chonera Bonita, ganó el título.' },
  { texto: 'Compitió contra 12 aspirantes de la provincia.' },
  { texto: 'La corona se la entregó Paula Zambrano, su antecesora, que también representó a Chone.' },
  { texto: 'Marcel Ponce Zamora, de Manta, fue virreina.' },
  { texto: 'Ariana Espinoza, de Bolívar, fue primera finalista; Camille Ramírez, de Portoviejo, segunda; y Diana Andrade, de El Carmen, tercera.' },
  { texto: 'Alvarez acumula seis años de presencia en TikTok e Instagram.' },
  { texto: 'Antes ganó los títulos de Chonera Bonita 2023, Miss Turismo Manabí 2024 y Reina de Chone 2026.' },
  { texto: 'Al terminar, agradeció el respaldo de su cantón y de las autoridades locales que impulsaron su candidatura.' },
];
(async () => {
  const r = await generarGuion(hechos, { tema: 'Chone retiene la corona de Reina de Manabí' });
  console.log('ORIGEN:', r.origen, '| PALABRAS:', r.palabras, '| AVISOS:', r.avisos.join(' || ') || '-');
  r.beats.forEach((b, i) => console.log(`${i + 1}. [${b.rol}] ${b.frase}`));
})().catch(e => { console.error('FALLO', e.message); process.exit(1); });
