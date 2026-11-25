// PUENTE entre el guion de la app de siempre (texto corrido) y el director del motor (frases con rol y hechos).
// El director necesita, por cada frase, su rol (persona, cifra, fecha, lugar, objeto, rumor, dato) y qué hechos de la noticia
// la respaldan; la app vieja entrega solo el texto. Acá se parte el guion en frases (determinista) y UNA llamada barata
// al modelo asigna rol y hechos a cada una. Si el modelo falla o contesta mal, se cae a reglas: el video sale igual.
// El modelo NO escribe nada que se vea en pantalla: solo clasifica frases que ya existen.
const ROLES = ['persona', 'cifra', 'fecha', 'lugar', 'objeto', 'rumor', 'dato'];
const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'setiembre', 'octubre', 'noviembre', 'diciembre'];
const MAX_HECHOS = 16;

const normalizar = t => String(t).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
const palabras = t => normalizar(t).match(/[a-z0-9ñ]+/g) || [];

// Frases: corta después de . ! ? … seguidos de espacio. No parte "0,99" ni "6.000" (no hay espacio detrás del punto).
// Una "frase" de menos de 3 palabras (p. ej. "Sí.") se pega a la anterior, para no gastar una escena en nada.
function partirFrases(script) {
  const crudas = String(script || '').replace(/\s+/g, ' ').trim().split(/(?<=[.!?…])\s+(?=[A-ZÁÉÍÓÚÑ¿¡"«“0-9])/).map(s => s.trim()).filter(Boolean);
  const out = [];
  for (const f of crudas) { if (out.length && palabras(f).length < 3) out[out.length - 1] += ' ' + f; else out.push(f); }
  return out;
}

// Rol por reglas (respaldo y validación): lo que la frase DICE, no lo que se imagina.
function rolPorReglas(frase) {
  const n = normalizar(frase);
  if (/\b(rumor|segun fuentes|se dice|supuestamente|no confirm)/.test(n)) return 'rumor';
  if (MESES.some(m => new RegExp(`\\b${m}\\b`).test(n)) || /\b(lunes|martes|miercoles|jueves|viernes|sabado|domingo)\b/.test(n)) return 'fecha';
  if (/\d/.test(n) && /(dolar|votos|%|por ciento|años|finalistas|mil\b|millon)/.test(n)) return 'cifra';
  if (/\b(en|desde|hacia|rumbo a) (el |la |los |las )?[a-z]/.test(n) && /\b(aeropuerto|ciudad|pais|estadio|coliseo|teatro|playa|hotel)\b/.test(n)) return 'lugar';
  return 'dato';
}

// Hechos de respaldo: las frases de la crónica; cada frase del guion se asocia con la que más palabras largas comparte.
function respaldoPorReglas(frases, cronica) {
  const hechos = partirFrases(cronica).slice(0, MAX_HECHOS).map(texto => ({ texto }));
  const conjuntos = hechos.map(h => new Set(palabras(h.texto).filter(w => w.length >= 5)));
  const beats = frases.map(frase => {
    const ws = palabras(frase).filter(w => w.length >= 5);
    let mejor = -1, puntos = 1; // se exigen 2 palabras largas en común
    conjuntos.forEach((c, i) => { const p = ws.filter(w => c.has(w)).length; if (p > puntos) { puntos = p; mejor = i; } });
    return { frase, rol: rolPorReglas(frase), hechos: mejor >= 0 ? [mejor + 1] : [] };
  });
  return { hechos, beats };
}

const PROMPT = `Clasificas las frases de un guion de farándula. NO escribes ni cambias ninguna frase.
Recibes la CRÓNICA (los hechos confirmados de la noticia) y las FRASES del guion numeradas.
Devuelve SOLO JSON: {"hechos":[{"texto":"...","confirmado":true|false}],"frases":[{"n":1,"rol":"...","hechos":[1]}]}
- "hechos": entre 4 y ${MAX_HECHOS} hechos ATÓMICOS sacados SOLO de la crónica, con las mismas palabras y cifras. "confirmado":false únicamente si la crónica lo presenta como rumor, versión sin confirmar o "según fuentes".
- "frases": una entrada por cada frase, con su "n".
- "rol" de cada frase, uno de: ${ROLES.join(', ')}. persona = presenta o cita a alguien; cifra = su dato central es un número o monto; fecha = su dato central es un día o plazo; lugar = su dato central es un sitio; objeto = una cosa (vestido, corona, trofeo…); rumor = solo si cuenta algo NO confirmado; dato = cualquier otra.
- "hechos" de cada frase: los números (1 en adelante) de los hechos que respaldan lo que la frase afirma; puede ser vacío.`;

// → { hechos:[{texto,confirmado?}], beats:[{frase,rol,hechos:[n]}], origen:'modelo'|'reglas', avisos:[] }
// Con `hechosDados` (la lista de datos que ya se extrajo de la noticia) el modelo solo clasifica frases; sin ella, también extrae los hechos.
const PROMPT_CON_HECHOS = `Clasificas las frases de un guion de farándula. NO escribes ni cambias ninguna frase.
Recibes los HECHOS numerados de la noticia y las FRASES del guion numeradas. Devuelve SOLO JSON: {"frases":[{"n":1,"rol":"...","hechos":[1]}]}
- Una entrada por cada frase, con su "n".
- "rol", uno de: ${ROLES.join(', ')}. persona = presenta o cita a alguien; cifra = su dato central es un número o monto; fecha = su dato central es un día o plazo; lugar = su dato central es un sitio; objeto = una cosa (vestido, corona, trofeo…); rumor = solo si cuenta algo NO confirmado; dato = cualquier otra.
- "hechos": los números de los HECHOS que respaldan lo que la frase afirma; puede ser vacío.`;

async function guionABeats(script, cronica, { llamar = null, hechosDados = null } = {}) {
  const frases = partirFrases(script), avisos = [];
  if (!frases.length) throw new Error('El guion está vacío: no hay frases que clasificar');
  if (!llamar) { const gemini = require('../gemini'); llamar = (p, m) => gemini.llamarJSON(p, m, gemini.TAREAS.fragmentacion); }
  try {
    const dados = Array.isArray(hechosDados) && hechosDados.length >= 3 ? hechosDados.slice(0, MAX_HECHOS) : null;
    const r = dados
      ? await llamar(PROMPT_CON_HECHOS, `=== HECHOS ===\n${dados.map((h, i) => `${i + 1}. ${h.texto}`).join('\n')}\n=== FRASES ===\n${frases.map((f, i) => `${i + 1}. ${f}`).join('\n')}`)
      : await llamar(PROMPT, `=== CRÓNICA ===\n${cronica}\n=== FRASES ===\n${frases.map((f, i) => `${i + 1}. ${f}`).join('\n')}`);
    const hechos = dados ? dados.map(h => (h.confirmado === false ? { texto: h.texto, confirmado: false } : { texto: h.texto }))
      : (Array.isArray(r && r.hechos) ? r.hechos : []).filter(h => h && typeof h.texto === 'string' && h.texto.trim()).slice(0, MAX_HECHOS)
        .map(h => (h.confirmado === false ? { texto: h.texto.trim(), confirmado: false } : { texto: h.texto.trim() }));
    if (hechos.length < 3) throw new Error('el modelo devolvió menos de 3 hechos');
    const porN = new Map((Array.isArray(r.frases) ? r.frases : []).map(x => [x && x.n, x]));
    const beats = frases.map((frase, i) => {
      const x = porN.get(i + 1) || {};
      let rol = ROLES.includes(x.rol) ? x.rol : null;
      if (!rol) { rol = rolPorReglas(frase); avisos.push(`frase ${i + 1}: rol inválido, se usó el de reglas (${rol})`); }
      if (rol === 'rumor' && !(x.hechos || []).some(k => hechos[k - 1] && hechos[k - 1].confirmado === false)) rol = rolPorReglas(frase) === 'rumor' ? 'dato' : rolPorReglas(frase); // rumor solo con hechos no confirmados
      return { frase, rol, hechos: [...new Set((Array.isArray(x.hechos) ? x.hechos : []).filter(k => Number.isInteger(k) && k >= 1 && k <= hechos.length))] };
    });
    return { hechos, beats, origen: 'modelo', avisos };
  } catch (e) {
    avisos.push(`clasificación por modelo falló (${e.message}); se usaron reglas`);
    return { ...respaldoPorReglas(frases, cronica), origen: 'reglas', avisos };
  }
}

module.exports = { guionABeats, partirFrases, rolPorReglas, respaldoPorReglas, ROLES, PROMPT };
