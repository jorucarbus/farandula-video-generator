// Gráficos "sociales": VS (confrontación entre dos personas) y apoyo (el público o alguien respalda a una persona).
//
// Pedido de la dueña: círculos con las fotos y un VS cuando se habla de una confrontación; siluetas simples o fotos con un ícono de
// emoción cuando se habla de apoyo. "No debe ser siempre, solo cuando sume y no esté por estar": por eso las reglas son estrictas
// (verbo de confrontación/apoyo + personas con foto en ESA frase) y hay un tope por video (1 VS y 1 apoyo, nunca en frases seguidas).
// Todo es determinista: no gasta llamadas al modelo.
const norm = t => String(t || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9ñ ]+/g, ' ').replace(/\s+/g, ' ').trim();

const RE_CONFRONTA = /\b(contra|enfrent\w*|pele\w*|critic\w*|polemic\w*|discu\w*|acus\w*|respond\w*|disput\w*|choque|cruce|rival\w*|ataca\w*|reclam\w*|desafi\w*)\b/;
const RE_APOYO = /\b(apoy\w*|respald\w*|aplaud\w*|felicit\w*|aclam\w*|defend\w*|animar\w*|alent\w*|cari[nñ]\w*|mensajes? de amor|orgull\w*)\b/;
const RE_PUBLICO = /\b(publico|fans?|seguidores|admiradores|ecuatorianos|internautas|gente|redes|compa[nñ]eros|colegas|familia|amigos)\b/;

// Quiénes aparecen nombrados en la frase, en orden de aparición. figuras: [{ nombre, foto, alias[] }] (alias normalizados, 4+ letras).
function figurasEnFrase(frase, figuras) {
  const palabras = norm(frase).split(' '), out = [];
  for (const f of figuras) {
    const i = palabras.findIndex(w => f.alias.includes(w));
    if (i >= 0) out.push({ f, i });
  }
  return out.sort((a, b) => a.i - b.i).map(x => x.f);
}

function palabraAncla(frase, re) { const m = norm(frase).match(re); return m ? m[0].split(' ')[0] : null; }

// escenas: las del director (se les agrega `social`); beats: [{ frase }]; figuras: personas con foto + la protagonista (si tiene).
// maxVs / maxApoyo: tope por video. Devuelve las escenas y los avisos.
function asignarSociales(escenas, beats, figuras, { maxVs = 1, maxApoyo = 1 } = {}) {
  const avisos = []; let vs = 0, apoyo = 0, ultima = -9;
  for (let k = 0; k < beats.length; k++) {
    const e = escenas.find(x => x.beat === k + 1); if (!e || e.social) continue;
    if (k - ultima < 2) continue; // nunca dos seguidos
    if ((e.personas && e.personas.length) || (e.extras || []).some(x => x.tipo === 'insignia')) continue; // las esquinas de arriba ya están ocupadas
    if (e.principal === 'mapa' || e.principal === 'lista' || e.principal === 'cifra' || e.principal === 'grafico') continue; // ya hay un gráfico principal
    const frase = beats[k].frase, nom = figurasEnFrase(frase, figuras.filter(f => f.foto));
    if (vs < maxVs && RE_CONFRONTA.test(norm(frase)) && nom.length >= 2) {
      e.social = { tipo: 'vs', a: { nombre: nom[0].nombre, foto: nom[0].foto }, b: { nombre: nom[1].nombre, foto: nom[1].foto }, ancla: palabraAncla(frase, RE_CONFRONTA) };
      vs++; ultima = k; avisos.push(`frase ${k + 1}: VS entre ${nom[0].nombre} y ${nom[1].nombre}`); continue;
    }
    if (apoyo < maxApoyo && RE_APOYO.test(norm(frase))) {
      const publico = RE_PUBLICO.test(norm(frase));
      if (nom.length || publico) {
        e.social = { tipo: 'apoyo', fotos: publico ? [] : nom.slice(0, 3).map(f => ({ nombre: f.nombre, foto: f.foto })), icono: 'heart', ancla: palabraAncla(frase, RE_APOYO) };
        apoyo++; ultima = k; avisos.push(`frase ${k + 1}: apoyo ${publico ? '(siluetas del público)' : 'a ' + nom.map(f => f.nombre).join(', ')}`);
      }
    }
  }
  return { escenas, avisos };
}

module.exports = { asignarSociales, figurasEnFrase, RE_CONFRONTA, RE_APOYO, RE_PUBLICO, norm };
