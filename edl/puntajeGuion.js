// PUNTAJE CIEGO DE UN GUION: califica con una rúbrica fija, sin saber quién lo escribió, de qué canal es ni con qué versión del motor.
//
// Por qué "ciego": si el modelo supiera que el guion salió de nuestro motor, tendería a aprobarlo. Aquí recibe SOLO el texto.
// Quien califica es la cadena "mecánica" (otro modelo que el que escribe el guion, que va por la "creativa").
// El total NO lo da el modelo: se calcula en código con pesos fijos, así dos guiones se comparan con la misma vara.
//
// Qué mide (cada criterio de 0 a 10):
//   gancho      — la apertura suelta algo concreto y fuerte sobre una persona nombrada, no una pregunta vacía ni una promesa vaga
//   concrecion  — nombres, hechos, lugares: se puede visualizar; sin generalidades
//   escalada    — cada frase aporta algo nuevo y sube la tensión; no repite ni rellena
//   cierre      — termina en una consecuencia o una pregunta natural, no en un "comenta y sigue" genérico
//   ritmo       — (código) mezcla de frases cortas y largas, sin párrafos eternos
//   plantillas  — (código) 10 = ninguna frase de plantilla gastada; baja con cada una
// La calibración contra las vistas REALES se hace con scripts/probar-puntaje.js: si el puntaje no distingue a los guiones que
// funcionaron de los que no, no sirve y se dice. Los puntajes de cada video se guardan para compararlos con sus vistas (edl/exitos.js).
const PESOS = { gancho: 0.25, concrecion: 0.2, escalada: 0.2, cierre: 0.1, ritmo: 0.1, plantillas: 0.15 };

// Frases de plantilla que se repiten mucho en videos de chisme. Se detectan en código (gratis, igual para todos).
const PLANTILLAS = [
  /hay (un )?secreto[^.]{0,40}(que )?(nadie|que no)/i, /nadie te (est[aá]|ha|lo)[^.]{0,20}(cuenta|dice|contado)/i, /olv[ií]date de (todo )?lo que (crees|te dijeron)/i,
  /(tres|3) (hechos|momentos|cosas|datos)[^.]{0,30}(cambia|lo cambia|exponen|revelan)/i, /(no vas a creer|no te vas a creer)/i, /lo que (pas[oó]|viene) (despu[eé]s|a continuaci[oó]n)[^.]{0,20}(te )?(sorprender|dejar)/i,
  /comenta y sigue|d[eé]jame tu comentario|sigue la cuenta|suscr[ií]bete/i, /patr[oó]n oculto/i, /(la verdad|lo que) (nadie|no) (quiere|te quieren) (que sepas|contar|decir)/i,
];
function detectarPlantillas(texto) {
  const frases = String(texto || '').split(/(?<=[.!?])\s+/), out = [];
  for (const f of frases) if (PLANTILLAS.some(r => r.test(f))) out.push(f.trim().slice(0, 140));
  return out;
}

// Ritmo: mezcla de frases cortas y largas. 10 = variedad sana; baja si todas miden casi lo mismo o si hay frases larguísimas.
function puntajeRitmo(texto) {
  const lens = String(texto || '').split(/[.!?]+/).map(s => s.trim().split(/\s+/).filter(Boolean).length).filter(n => n > 0);
  if (lens.length < 4) return 3;
  const media = lens.reduce((a, b) => a + b, 0) / lens.length, sd = Math.sqrt(lens.reduce((a, b) => a + (b - media) ** 2, 0) / lens.length);
  const larguisimas = lens.filter(n => n > 35).length / lens.length;
  const variedad = Math.min(1, sd / 7); // sd ≈ 7 palabras = mezcla sana
  return Math.max(0, Math.min(10, Math.round((4 + 6 * variedad - 10 * larguisimas) * 10) / 10));
}

const PROMPT = `Eres un lector crítico de guiones de videos cortos de farándula (narración de 60-90 segundos). Te doy SOLO el texto de un guion. No sabes quién lo escribió ni de qué cuenta es; no lo adivines. Califica con la rúbrica, con criterio técnico (no opines si la noticia te gusta ni juzgues a las personas):
- gancho (0-10): ¿las 2 primeras frases sueltan algo concreto y fuerte sobre una persona NOMBRADA? 0 = arranque vago, pregunta vacía o promesa ("hay un secreto…"); 10 = un hecho o imagen potente y específica.
- concrecion (0-10): ¿hay nombres, hechos, lugares, cosas que se pueden ver? 0 = generalidades; 10 = todo es específico.
- escalada (0-10): ¿cada frase aporta algo nuevo y sube la tensión? 0 = repite o rellena; 10 = siempre hay algo nuevo y avanza hacia un punto fuerte.
- cierre (0-10): ¿termina en una consecuencia o una pregunta natural que deja pensando? 0 = se apaga o usa un cierre genérico de "comenta y sigue"; 10 = cierre fuerte.
Sé exigente y usa todo el rango; no pongas 7-8 a todo. En "mejoras" da hasta 3 cambios TÉCNICOS y concretos (cita la frase y di cómo reescribirla); no cambies los hechos.
Devuelve SOLO este JSON: {"gancho":n,"concrecion":n,"escalada":n,"cierre":n,"resumen":"una frase","mejoras":[{"frase":"texto exacto","cambio":"cómo mejorarla"}]}`;

const clamp = n => { if (n === null || n === undefined || n === '') return null; n = Number(n); return Number.isFinite(n) ? Math.max(0, Math.min(10, Math.round(n * 10) / 10)) : null; };

// Combina lo del modelo con lo de código. Si el modelo falla, el total sale solo de lo de código y se marca como parcial.
function combinar(modelo, texto) {
  const plantillas = detectarPlantillas(texto), c = {
    gancho: clamp(modelo && modelo.gancho), concrecion: clamp(modelo && modelo.concrecion), escalada: clamp(modelo && modelo.escalada), cierre: clamp(modelo && modelo.cierre),
    ritmo: puntajeRitmo(texto), plantillas: Math.max(0, 10 - 4 * plantillas.length),
  };
  const completos = Object.keys(PESOS).filter(k => c[k] !== null), pesoTotal = completos.reduce((s, k) => s + PESOS[k], 0);
  const total = pesoTotal ? Math.round(completos.reduce((s, k) => s + c[k] * PESOS[k], 0) / pesoTotal * 10) / 10 : null;
  return { total, criterios: c, parcial: completos.length < Object.keys(PESOS).length, plantillasDetectadas: plantillas, resumen: String((modelo && modelo.resumen) || '').slice(0, 240),
    mejoras: (Array.isArray(modelo && modelo.mejoras) ? modelo.mejoras : []).slice(0, 3).map(m => ({ frase: String((m && m.frase) || '').slice(0, 200), cambio: String((m && m.cambio) || '').slice(0, 240) })).filter(m => m.cambio) };
}

// `llamar(prompt, texto)` es inyectable. Ciego: solo viaja el texto del guion.
async function puntuar(script, { llamar = null } = {}) {
  const texto = String(script || '').trim(); if (texto.split(/\s+/).length < 30) throw new Error('el guion es demasiado corto para calificarlo');
  if (!llamar) { const g = require('../gemini'); llamar = (p, m) => g.llamarJSON(p, m, g.TAREAS.puntajeGuion); }
  let r = null; try { r = await llamar(PROMPT, `GUION:\n${texto.slice(0, 2500)}`); } catch { /* sin modelo: puntaje parcial */ }
  return { ...combinar(r, texto), fecha: new Date().toISOString() };
}

module.exports = { puntuar, combinar, detectarPlantillas, puntajeRitmo, PESOS, PROMPT, PLANTILLAS };
