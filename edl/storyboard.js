// EXPERTO EN STORYBOARD: toma la dirección del director (qué pieza principal va en cada frase) y decide, frase por frase, el guion visual completo:
//  · cuándo el muñeco acompaña a los datos (mapa, cifra, lista) señalándolos y reaccionando, y cuándo el dato va solo con tomas de video;
//  · cómo reacciona la protagonista según plantillas de lo que le gusta y lo que le duele (edl/reacciones.json): emoción, gesto y pose;
//  · el plano de la cámara sobre el muñeco (cuerpo entero, medio, primer plano de la cara) y su cambio en la palabra justa;
//  · que NUNCA haya un muñeco parado sin hacer nada: toda frase con muñeco lleva al menos una reacción (o un gesto de escucha).
// No gasta tokens: son reglas. Devuelve las escenas enriquecidas y un storyboard legible (storyboardMarkdown) para aprobarlo antes de renderizar.
// La protagonista no habla con la voz del narrador (ver CLAUDE.md): aquí solo se decide cómo reacciona.
const { tokens } = require('./director');
const REACCIONES = require('./reacciones.json');

const DATOS = ['mapa', 'cifra', 'lista'];
const PLANOS_NOMBRE = { cuerpo: 'cuerpo entero', lado: 'al lado del escenario', companero: 'comentarista abajo', medio: 'plano medio', primer: 'PRIMER PLANO de la cara' };

// ¿la frase habla de la protagonista o de OTRA persona con nombre propio? (nombres propios = palabras con mayúscula que no abren la frase)
function hablaDeOtra(frase) {
  const toks = new Set(tokens(frase)), propia = REACCIONES.protagonista.alias.some(a => toks.has(a)), nombres = (frase.match(/(?<=[\s,])[A-ZÁÉÍÓÚÑ][a-záéíóúñ]{2,}/g) || []).filter(n => !REACCIONES.protagonista.alias.includes(tokens(n)[0]));
  return !propia && nombres.length >= 1;
}
function reaccionDe(frase) {
  const toks = tokens(frase);
  for (const p of REACCIONES.plantillas) {
    const hit = toks.find(t => p.disparadores.includes(t)); if (!hit) continue;
    if (p.sentimiento === 'gusta' && hablaDeOtra(frase)) return { ...REACCIONES.rival, ancla: hit }; // el logro es de otra persona: la protagonista no celebra
    return { ...p, ancla: hit };
  }
  return null;
}
const anclaDeDato = e => (e.principal === 'mapa' ? e.mapa.ancla : e.principal === 'cifra' ? e.cifra.ancla : e.principal === 'lista' ? e.lista.items[0].ancla : e.principal === 'escenario' ? e.escenario.ancla : null);
const primeraPalabraDeContenido = frase => tokens(frase).find(t => t.length >= 5) || tokens(frase)[0];

// escenas: salida validada del director; beats: [{frase, rol, hechos}]; opciones: { emocionesValidas, gestosValidos } (para no pedir lo que el rig no tiene)
function planificar(escenas, beats, { emocionesValidas = null, gestosValidos = null } = {}) {
  const out = escenas.map(e => JSON.parse(JSON.stringify(e))), filas = []; let ultimoPrimer = -9, escuchas = 0;
  const emo = n => (!emocionesValidas || emocionesValidas.includes(n) ? n : 'normal'), ges = n => (!gestosValidos || gestosValidos.includes(n) ? n : null);
  out.forEach(e => {
    const k = e.beat - 1, frase = beats[k].frase, rx = reaccionDe(frase), esDato = DATOS.includes(e.principal), esEsc = e.principal === 'escenario', anc = anclaDeDato(e);
    const razon = [];
    // 1) ¿lleva muñeco? mapas y escenarios siempre (acompaña y señala); cifra/lista solo si hay algo que sentir, si no el dato va con tomas de video
    if (esDato && !e.muneco && (e.principal === 'mapa' || rx)) { e.muneco = { traje: 'bastonera', pose: 'reposo', emocion: 'normal' }; razon.push(e.principal === 'mapa' ? 'mapa: la protagonista lo señala' : 'dato con carga emocional: la protagonista reacciona al dato'); }
    if (esDato && !e.muneco) razon.push('dato solo, con tomas de video de fondo (variedad)');
    if (e.principal === 'clip' && !e.muneco) razon.push('toma real de la protagonista');
    if (!e.muneco) { filas.push(fila(e, frase, rx, razon, null)); return; }
    const m = e.muneco; m.gestos = m.gestos || [];
    // 2) reacción por plantilla (lo que le gusta / le duele)
    if (rx) {
      if (m.emocion === 'normal') { m.emocion = emo(rx.emocion); m.ancla_emocion = rx.ancla; }
      if (rx.pose && m.pose === 'reposo' && !esDato) { m.pose = rx.pose; m.ancla_pose = rx.ancla; }
      const g = ges(rx.gesto); if (g && !m.gesto && !(rx.pose && !esDato)) m.gestos.push({ id: g, ancla: rx.ancla });
      razon.push(`${rx.sentimiento === 'gusta' ? 'LE GUSTA' : rx.sentimiento === 'duele' ? 'LE DUELE' : 'neutro'}: «${rx.ancla}» → ${rx.id}`);
    }
    // 3) acompañar al dato: señalarlo en su palabra ancla (antes de la reacción)
    if ((esDato || esEsc) && anc && ges('senala_arriba') && !m.gestos.some(g => g.id === 'senala_arriba') && !m.gesto) { m.gestos.unshift({ id: 'senala_arriba', ancla: anc }); razon.push('señala el dato'); }
    if (m.gesto) m.gestos.unshift({ id: m.gesto.id, ancla: m.gesto.ancla }); delete m.gesto;
    // 4) nunca parado: si no hay emoción ni gesto ni pose, un gesto de escucha
    if (!m.gestos.length && m.emocion === 'normal' && m.pose === 'reposo') {
      const lista = REACCIONES.escucha.filter(g => ges(g)), g = lista[escuchas++ % lista.length]; if (g) { m.gestos.push({ id: g, ancla: primeraPalabraDeContenido(frase) }); razon.push('escucha activa (no se queda parado)'); }
    }
    // 5) plano: primer plano en las reacciones fuertes (con enfriamiento: no más de uno cada 3 frases); medio si hay emoción; cuerpo si no; acompañante abajo con datos
    let plano = esEsc ? 'lado' : esDato ? 'companero' : 'cuerpo';
    if (!esDato && !esEsc && m.emocion !== 'normal') plano = 'medio';
    if (rx && rx.intensidad === 'alta' && k - ultimoPrimer >= 3 && !esDato && !esEsc) { m.plano = 'primer'; m.ancla_plano = rx.ancla; ultimoPrimer = k; plano = 'primer'; razon.push('primer plano: la reacción importa'); }
    m.encuadre = plano === 'primer' ? 'medio' : plano; // plano de base de la frase; el primer plano entra y sale en la palabra ancla
    filas.push(fila(e, frase, rx, razon, plano));
  });
  return { escenas: out, storyboard: filas };
}

function fila(e, frase, rx, razon, plano) {
  const m = e.muneco, det = e.principal === 'mapa' ? e.mapa.lugar : e.principal === 'cifra' ? `${e.cifra.valor} ${e.cifra.sufijo || ''}` : e.principal === 'lista' ? e.lista.items.map(i => i.texto).join(' · ') : e.principal === 'escenario' ? e.escenario.texto : e.principal === 'clip' ? 'clip real (≤3 s)' : '';
  return { beat: e.beat, frase, pantalla: e.principal + (det ? ` (${det})` : ''), muneco: m ? { plano: plano ? PLANOS_NOMBRE[plano] : '', emocion: m.emocion, pose: m.pose, gestos: (m.gestos || []).map(g => `${g.id}@${g.ancla}`), primerPlano: m.plano === 'primer' } : null, razon };
}

function storyboardMarkdown(filas, titulo = 'Storyboard') {
  const L = [`# ${titulo}`, '', '| # | Frase | Pantalla | Muñeco | Por qué |', '|---|-------|----------|--------|---------|'];
  for (const f of filas) {
    const mu = f.muneco ? `${f.muneco.plano}${f.muneco.primerPlano ? ' (+primer plano)' : ''} · emoción ${f.muneco.emocion}${f.muneco.pose !== 'reposo' ? ' · pose ' + f.muneco.pose : ''}${f.muneco.gestos.length ? ' · ' + f.muneco.gestos.join(', ') : ''}` : '— (sin muñeco)';
    L.push(`| ${f.beat} | ${f.frase.slice(0, 70)}${f.frase.length > 70 ? '…' : ''} | ${f.pantalla} | ${mu} | ${f.razon.join('; ')} |`);
  }
  return L.join('\n') + '\n';
}

module.exports = { planificar, storyboardMarkdown, reaccionDe, REACCIONES };
