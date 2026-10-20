// Revisión del guion TERMINADO: lo que el prompt pide pero el modelo no siempre cumple.
//
// Por qué existe (2026-10-20): una regla en el prompt es una petición, no una garantía. Un guion
// sobre una menor salió con su nombre y con "acechaban cada gesto de la niña", y el filtro de
// contenido de Gemini bloqueó el reparto de tomas. Otros guiones salieron con acento de España o
// de Argentina, y con intenciones atribuidas a una persona real que la crónica no decía.
//
// Es una pasada común a los dos motores, sobre el guion ya escrito:
//   1. DETECTORES EN CÓDIGO (gratis, sin modelo): nombre de un menor, vocabulario de acecho cerca de
//      un menor, léxico de España y de Argentina.
//   2. AUDITORÍA CONTRA LA CRÓNICA (una llamada barata): frases que afirman una intención o una
//      opinión colectiva que la crónica no respalda. Eso no se puede detectar con una lista.
//   3. REESCRITURA DE SOLO ESAS FRASES (una llamada): el resto del guion queda intacto.
//
// Regla de robustez: si algo falla, el guion sale tal como estaba. Lo que no se pudo arreglar se
// devuelve como aviso para que el usuario lo vea en el Paso 3 — nunca se deja pasar en silencio.
const gemini = require('./gemini');

const DIVIDIR_ORACIONES = /(?<=[.!?…])\s+/;

// ---------- Detectores ----------

// Palabras que dicen "esto es un menor". `hij[ao]` aparte: una hija puede ser adulta.
const MENOR_ESTRICTO = /\b(ni[ñn][ao]s?|nen[ae]s?|beb[ée]s?|menor(?:es)?\s+de\s+edad|el\s+menor|la\s+menor|peque[ñn][ao]s?|criaturas?|infantes?|adolescentes?)\b/i;

// Un nombre propio pegado a la palabra que lo marca como menor: "su hija Nabani".
const NOMBRE_DE_MENOR = /\b(?:hij[ao]|ni[ñn][ao]|nen[ae]|peque[ñn][ao]|beb[ée])\s+([A-ZÁÉÍÓÚÑ][a-záéíóúñ]{2,})\b/g;
// Palabras que, tras "hija", NO son un nombre.
const NO_ES_NOMBRE = new Set(['del', 'de', 'mayor', 'menor', 'mayores', 'unica', 'única', 'mia', 'mía']);

// Vocabulario de mirada o acecho. El fuerte se marca en cuanto el guion trata de un menor; el débil
// solo cuando comparte oración con uno.
const ACECHO_FUERTE = /\b(acech\w*|morbo\w*|devora\w*\s+con\s+la\s+mirada|depredador\w*|pedofil\w*|sexualiz\w*)/i;
const ACECHO_DEBIL = /\b(cacer[ií]a|jaur[ií]a|escrutinio|ojos\s+ajenos)\b/i;

// Léxico de España y de Argentina: lista CERRADA, a propósito. Atrapa lo inconfundible; las
// construcciones sutiles solo las ayuda el prompt. Cada patrón lleva su nombre para el aviso.
const LEXICO = [
  // España
  ['España', /\b(vosotros|vosotras|vuestr[oa]s?)\b/i, 'vosotros'],
  ['España', /\b(hab[eé]is|ten[eé]is|quer[eé]is|pod[eé]is|sois|est[aá]is|ten[eé]is)\b/i, 'conjugación de vosotros'],
  ['España', /(?:^|[.!?¿¡,]\s*)vale\s*[,.!]/i, '"vale" como interjección'],
  ['España', /\b(mola|molan|molaba|flipa\w*|flip[oó]|currar|curro|curran|curr[oó]|guay|ordenador\w*|chaval\w*|hostia\w*|joder|gilipollas|cabre\w+|mogoll[oó]n|alucin[ae]\w*|tronco|t[ií]o\s+(?=\w))\b/i, 'modismo de España'],
  ['España', /\bcog(?:er|e|en|i[óo]|ieron|[ií])\b/i, '"coger"'],
  // Argentina
  ['Argentina', /\b(ten[eé]s|quer[eé]s|pod[eé]s|sab[eé]s|ven[ií]s|mir[aá]|dec[ií]|hac[eé]|fijate|andá|vení)\b/, 'voseo'],
  ['Argentina', /\b(vos|sos)\b/, 'voseo'],
  ['Argentina', /\b(che|boludo\w*|pelotud\w*|pibe\w*|pibas?|laburo\w*|laburar\w*|guita|quilombo|fiaca|bárbaro|copad[oa]s?|morfar|mina|minas)\b/i, 'modismo argentino'],
  ['Argentina', /\bre\s+(bueno|buena|malo|mala|loco|loca|mal|bien|grande|fuerte|feo|fea)\b/i, '"re" como intensificador'],
  ['Argentina', /\b(ya\s+fue|al\s+pedo)\b/i, 'modismo argentino'],
];

const PARTIR = (guion) => (guion || '').trim().split(DIVIDIR_ORACIONES).filter(Boolean);

// Nombres de menores que aparecen en el guion. "hija"/"hijo" solo cuentan si el guion deja claro
// que se trata de un menor: un "su hijo Alejandro" adulto no es un problema.
function nombresDeMenores(guion) {
  const claroQueHayMenor = MENOR_ESTRICTO.test(guion);
  const nombres = new Set();
  for (const m of (guion || '').matchAll(NOMBRE_DE_MENOR)) {
    const nombre = m[1];
    if (NO_ES_NOMBRE.has(nombre.toLowerCase())) continue;
    const marca = m[0].split(/\s+/)[0].toLowerCase();
    if (/^hij[ao]$/.test(marca) && !claroQueHayMenor) continue;
    nombres.add(nombre);
  }
  return [...nombres];
}

// Devuelve [{ frase, motivo, tipo }] — una entrada por frase problemática, sin repetir frases.
function detectar(guion) {
  const oraciones = PARTIR(guion);
  const hayMenor = MENOR_ESTRICTO.test(guion || '');
  const nombres = nombresDeMenores(guion);
  const porFrase = new Map();
  const anotar = (frase, motivo, tipo) => {
    const previo = porFrase.get(frase);
    if (previo) { if (!previo.motivos.includes(motivo)) previo.motivos.push(motivo); return; }
    porFrase.set(frase, { frase, motivos: [motivo], tipo });
  };

  for (const o of oraciones) {
    for (const nombre of nombres) {
      if (new RegExp(`\\b${nombre}\\b`).test(o)) anotar(o, `nombra a un menor (${nombre}): dejar "su hija", "el menor"`, 'menor');
    }
    if (hayMenor && ACECHO_FUERTE.test(o)) anotar(o, 'vocabulario de mirada o acecho en una noticia sobre un menor', 'menor');
    if (MENOR_ESTRICTO.test(o) && ACECHO_DEBIL.test(o)) anotar(o, 'junta a un menor con vocabulario de acecho', 'menor');
    for (const [pais, patron, que] of LEXICO) {
      if (patron.test(o)) anotar(o, `léxico de ${pais} (${que}): usar español neutro latinoamericano`, 'lexico');
    }
  }
  return [...porFrase.values()].map(p => ({ frase: p.frase, motivo: p.motivos.join('; '), tipo: p.tipo }));
}

// ---------- Auditoría contra la crónica ----------

const PROMPT_AUDITORIA = `Rol: Verificador de hechos de un canal de farándula en TikTok.

TAREA: Te doy la CRÓNICA (los hechos de la noticia) y un GUION escrito a partir de ella. Marca las
frases del guion que AFIRMAN, como si fuera un hecho, algo que la crónica NO respalda:
- Una intención o un motivo atribuido a una persona real ("lo hizo para inflar sus números",
  "es una táctica", "busca limpiar su imagen").
- Una opinión colectiva inventada ("el público sospecha", "muchos aseguran", "nadie le cree") cuando
  la crónica no dice que alguien lo haya dicho.
- Un hecho concreto (una demanda, una cifra, una fecha, un parentesco) que no está en la crónica.

NO marques:
- Lo que la crónica dice o permite deducir directamente, aunque esté con otras palabras.
- Las preguntas retóricas ni los recursos de tensión que no afirman nada.
- Las frases que ya están atribuidas a alguien que la crónica menciona ("según ella", "lo acusan de").

Cada "frase" tiene que ser una copia EXACTA, carácter por carácter, de una oración del guion.
Responde ÚNICAMENTE un array JSON: [{"frase": "...", "motivo": "qué se afirma sin respaldo"}]
Si no hay ninguna, responde [].`;

async function auditarContraCronica(guion, cronica) {
  const lista = await gemini.llamarJSON(
    PROMPT_AUDITORIA,
    `=== CRÓNICA ===\n${cronica}\n=== FIN DE LA CRÓNICA ===\n\n=== GUION ===\n${guion}\n=== FIN DEL GUION ===`,
    gemini.TAREAS.materiales,
  );
  if (!Array.isArray(lista)) return [];
  // Solo vale lo que es una oración REAL del guion: el modelo a veces parafrasea al citar.
  const oraciones = new Set(PARTIR(guion));
  return lista
    .filter(x => x && typeof x.frase === 'string' && oraciones.has(x.frase.trim()))
    .slice(0, 4)
    .map(x => ({ frase: x.frase.trim(), motivo: `afirma sin respaldo en la crónica: ${x.motivo || 'intención u opinión no sustentada'}`, tipo: 'respaldo' }));
}

// ---------- Reescritura ----------

const PROMPT_REESCRITURA = `Rol: Editor de guiones de farándula para TikTok.

TAREA: Te doy oraciones de un guion, cada una con su PROBLEMA. Reescribe SOLO esas oraciones,
arreglando el problema, y devuelve la nueva versión de cada una.

REGLAS:
1. Misma función y misma energía en el guion, y un largo parecido al original (±20% de palabras).
   Esto NO baja el tono: la frase tiene que pegar igual.
2. Español neutro que se entienda igual en toda América Latina. Prohibido el léxico de España
   (vosotros, vale, tío, mola, currar, guay, coger…) y de Argentina (voseo: tenés, sos, mirá;
   che, pibe, laburo, re + adjetivo…). Tuteo estándar, sin modismos de ningún país.
3. Un menor de edad NUNCA se nombra ("su hija", "el menor", "la pequeña"), y no hay vocabulario
   de mirada ni de acecho cerca de él (morbo, acechar, devorar con la mirada, cada gesto). Se cuenta
   lo que hacen los ADULTOS, no lo que se mira o se dice del menor.
4. Si el problema es una afirmación sin respaldo: usa SOLO lo que dice la crónica, o atribúyelo
   ("según algunos usuarios", "trascendió que") si la crónica lo permite. Si la crónica no lo
   permite, quita la afirmación y deja una frase que cumpla la misma función en la historia.
5. No agregues hechos nuevos. No cambies nombres de adultos. Conserva la puntuación expresiva.
6. Responde ÚNICAMENTE un array JSON: [{"original": "<oración tal cual>", "nueva": "<reescrita>"}]
   en el mismo orden. "original" es una copia exacta de lo que te di.`;

async function reescribir(frases, cronica) {
  const bloque = frases.map((f, i) => `${i + 1}. PROBLEMA: ${f.motivo}\n   ORACIÓN: ${f.frase}`).join('\n');
  const lista = await gemini.llamarJSON(
    PROMPT_REESCRITURA,
    `=== CRÓNICA (los hechos permitidos) ===\n${cronica || '(no disponible)'}\n=== FIN ===\n\n=== ORACIONES A REESCRIBIR ===\n${bloque}\n=== FIN ===`,
    gemini.TAREAS.materiales,
  );
  return Array.isArray(lista) ? lista : [];
}

// Reemplaza cada oración por su versión nueva SOLO si el cambio es razonable: es una oración
// distinta, no vacía y de largo parecido. Devuelve el guion nuevo y cuántas se aplicaron.
function aplicar(guion, pedidas, respuestas) {
  let texto = guion;
  let aplicadas = 0;
  const cambios = [];
  for (const r of respuestas) {
    const original = typeof r?.original === 'string' ? r.original.trim() : '';
    const nueva = typeof r?.nueva === 'string' ? r.nueva.trim() : '';
    const pedida = pedidas.find(p => p.frase === original);
    if (!pedida || !nueva || nueva === original || !texto.includes(original)) continue;
    const a = original.split(/\s+/).length;
    const b = nueva.split(/\s+/).length;
    if (b < a * 0.5 || b > a * 1.6) continue;   // un cambio de largo así de grande ya no es la misma frase
    texto = texto.replace(original, nueva);
    aplicadas++;
    cambios.push({ antes: original, despues: nueva, motivo: pedida.motivo });
  }
  return { texto, aplicadas, cambios };
}

// ---------- Orquestación ----------

const MAX_PASADAS = 2;

async function revisar(guion, cronica) {
  const resultado = { guion, avisos: [], cambios: [] };
  try {
    let texto = guion;

    // Primera pasada: detectores + auditoría, juntos, para reescribir todo en UNA llamada.
    let problemas = detectar(texto);
    try {
      if (cronica) {
        const yaMarcadas = new Set(problemas.map(p => p.frase));
        for (const a of await auditarContraCronica(texto, cronica)) {
          if (!yaMarcadas.has(a.frase)) problemas.push(a);
        }
      }
    } catch (e) {
      console.warn(`  ⚠️ No se pudo auditar el guion contra la crónica: ${e.message}`);
    }

    for (let pasada = 1; pasada <= MAX_PASADAS && problemas.length; pasada++) {
      console.log(`  🔎 Revisión del guion (pasada ${pasada}): ${problemas.length} frase(s) a reescribir`);
      const respuestas = await reescribir(problemas, cronica);
      const { texto: nuevo, aplicadas, cambios } = aplicar(texto, problemas, respuestas);
      texto = nuevo;
      resultado.cambios.push(...cambios);
      if (!aplicadas) break;
      // Segunda pasada: solo lo que los DETECTORES siguen viendo (la auditoría no se repite).
      problemas = detectar(texto);
    }

    resultado.guion = texto;
    // Lo que quedó sin resolver se avisa tal cual: es lo que el usuario tiene que corregir a mano.
    for (const p of detectar(texto)) resultado.avisos.push(`"${p.frase}" — ${p.motivo}`);
    if (resultado.cambios.length) {
      const tipos = [...new Set(resultado.cambios.map(c => c.motivo.split(/[:(]/)[0].trim()))];
      console.log(`  ✅ Revisión: ${resultado.cambios.length} frase(s) reescrita(s) (${tipos.join('; ')})`);
    }
  } catch (e) {
    console.warn(`  ⚠️ La revisión del guion falló (${e.message}); el guion sale como estaba`);
    return { guion, avisos: [], cambios: [] };
  }
  return resultado;
}

module.exports = { revisar, detectar, nombresDeMenores, aplicar };
