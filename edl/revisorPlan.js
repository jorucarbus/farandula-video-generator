// REVISOR DEL PLAN: una segunda pasada, ANTES de renderizar, que mejora lo técnico y verifica que lo visual acompañe lo que se dice.
//  - No opina del tema ni juzga a nadie: solo cambia escenas (qué pieza se ve en cada frase) cuando algo está mal resuelto.
//  - Es texto puro y una sola llamada (cadena barata): cuesta una fracción de centavo, no toca imágenes.
//  - Todo cambio que propone pasa por los MISMOS validadores del director (formas exactas, textos copiados de la frase, tomas reales).
//    Lo que no valida se descarta; si un cambio rompe el conjunto, se descarta ese y se sigue. Nunca puede dejar el plan inválido.
const D = require('./director');

// Señales gratis (en código) que se le pasan al revisor para que mire donde hay algo que mirar.
function senales(beats, escenas, hechos, clips) {
  const out = [], reglas = D.directorPorReglas(beats, hechos, clips, { sinMuneco: true });
  let racha = 1;
  for (let i = 1; i < escenas.length; i++) {
    racha = escenas[i].principal === escenas[i - 1].principal ? racha + 1 : 1;
    if (racha === 3) out.push(`frases ${i - 1}-${i + 1}: tres seguidas con "${escenas[i].principal}" (monotonía)`);
  }
  escenas.forEach((e, i) => {
    const r = reglas[i];
    if (r && ['mapa', 'cifra', 'lista'].includes(r.principal) && ['video', 'clip'].includes(e.principal) && !(clips && clips.get(i))) out.push(`frase ${i + 1}: la frase trae un dato para graficar (${r.principal}) y se dejó "${e.principal}"`);
    if (e.principal === 'video' && !(e.extras || []).length) out.push(`frase ${i + 1}: solo "video" sin ninguna pieza encima`);
  });
  return out;
}

const PROMPT = (catalogo, referencias) => `Eres EDITOR TÉCNICO de videos verticales de farándula. Te doy las frases del guion y la escena que el director eligió para cada una. Tu trabajo NO es opinar del tema ni juzgar a nadie: es verificar que lo que se VE acompañe lo que se DICE y mejorar lo técnico.
Revisa solo esto:
1. Cada frase debe tener en pantalla algo que la ilustre (un lugar → mapa, una cifra → cifra/gráfico, una enumeración → lista, algo dicho o escrito entre comillas → cita, un clipCandidato → clip).
2. Variedad y ritmo: no más de 2 frases seguidas con el mismo principal; las 2 primeras frases deben ser visualmente fuertes (enganchan).
3. Que ninguna pieza contradiga o invente algo que la frase no dice.
Cambia SOLO lo que mejora de verdad (máximo 4 frases). Si el plan está bien, devuelve {"cambios":[]}.${referencias ? `\n\nPara calibrar, estos videos del canal SÍ funcionaron con la audiencia. Úsalos solo como referencia de ritmo y de qué piezas usaron; no los copies:\n${referencias}` : ''}

${catalogo}
Devuelve SOLO este JSON: {"cambios":[{"beat":número de frase,"motivo":"qué mejora, en una línea","escena":{...misma forma exacta de arriba, una sola escena...}}]}`;

// Quita del prompt del director su línea final ("Responde SOLO JSON…"), que choca con la salida del revisor.
const catalogoDelDirector = () => D.PROMPT_SIN_MUNECO([]).split('\n').filter(l => !/^Responde SOLO JSON/.test(l)).join('\n');

async function revisarPlan({ beats, hechos, clips = null, escenas, referencias = '', llamar = null, maxCambios = 4 }) {
  const avisos = [], aplicados = [], descartados = [];
  const sen = senales(beats, escenas, hechos, clips);
  if (!llamar) { const g = require('../gemini'); llamar = (p, m) => g.llamarJSON(p, m, g.TAREAS.revisorPlan); }
  const mensaje = JSON.stringify({ frases: beats.map((b, i) => ({ beat: i + 1, frase: b.frase, ...(clips && clips.get(i) ? { clipCandidato: { id: clips.get(i).id, ss: clips.get(i).ss } } : {}), escena: escenas[i] })), senales: sen });
  let r; try { r = await llamar(PROMPT(catalogoDelDirector(), referencias), mensaje); } catch (e) { return { escenas, aplicados, descartados, avisos: [`el revisor no respondió (${String(e.message).slice(0, 80)}); el plan queda como estaba`], senales: sen }; }
  let actual = escenas.map(e => ({ ...e }));
  for (const c of (Array.isArray(r && r.cambios) ? r.cambios : []).slice(0, maxCambios)) {
    const beat = Number(c && c.beat); if (!Number.isInteger(beat) || beat < 1 || beat > beats.length || !c.escena) { descartados.push({ beat: c && c.beat, por: 'beat o escena inválidos' }); continue; }
    const nueva = D.quitarMuneco(D.normalizarEscena({ ...c.escena, beat }));
    const prueba = actual.map((e, i) => (i === beat - 1 ? nueva : e)), errores = D.validarDireccion(prueba, beats, hechos, clips);
    if (errores.length) { descartados.push({ beat, por: errores[0] }); continue; }
    actual = prueba; aplicados.push({ beat, motivo: String(c.motivo || '').slice(0, 160), de: escenas[beat - 1].principal, a: nueva.principal });
  }
  if (descartados.length) avisos.push(`${descartados.length} cambio(s) del revisor descartado(s) por no validar`);
  return { escenas: actual, aplicados, descartados, avisos, senales: sen };
}

module.exports = { revisarPlan, senales };
