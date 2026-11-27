// MEMORIA DE ALIAS: quién es quién entre los nombres del guion y las carpetas de famosos.
// Un guion puede nombrar a alguien por su apodo, su nombre real o su nombre artístico ("El Cuy", "Enrique …", "Kike Jav"). Se averigua UNA vez
// (primero en los nombres de carpeta, que es gratis; si no, buscando contexto en internet) y queda guardado en data-motor/alias-personas.json:
// la próxima vez que salga ese nombre se resuelve de golpe, sin escanear ni gastar IA.
//   alias:       { "<nombre normalizado>": { carpeta, fuente: 'carpeta'|'web'|'manual', fecha } }
//   sinCarpeta:  { "<nombre normalizado>": { fecha, carpetas: N } }   ← "ya busqué y no tiene carpeta": no se vuelve a buscar hasta que cambie la lista
//                                                                      de carpetas o pasen 60 días
const fs = require('fs'), path = require('path');
const { norm, buscarCarpeta } = require('./clipsDeOtros');

const DM = process.env.DATA_MOTOR_DIR || path.join(__dirname, '..', 'data-motor'), ARCHIVO = path.join(DM, 'alias-personas.json');
const DIAS_NEGATIVO = 60;

const cargar = (archivo = ARCHIVO) => { try { const j = JSON.parse(fs.readFileSync(archivo, 'utf8')); return { alias: j.alias || {}, sinCarpeta: j.sinCarpeta || {} }; } catch { return { alias: {}, sinCarpeta: {} }; } };
const guardar = (reg, archivo = ARCHIVO) => { try { require('./respaldoIndice').escribirSeguro(archivo, reg); } catch { fs.mkdirSync(path.dirname(archivo), { recursive: true }); fs.writeFileSync(archivo, JSON.stringify(reg, null, 1)); } };

function registrar(reg, nombres, carpeta, fuente) {
  for (const n of [].concat(nombres)) { const k = norm(n); if (k.length >= 3) { reg.alias[k] = { carpeta, fuente, fecha: new Date().toISOString().slice(0, 10) }; delete reg.sinCarpeta[k]; } }
  return reg;
}

// Pregunta a internet quién es. Dos pasos (como investigarHechos): búsqueda con citas reales y luego estructurar SOLO lo hallado.
async function buscarNombresWeb(nombre, { contexto = '' } = {}) {
  const g = require('../gemini');
  const { texto, grounding } = await g.callGemini('Eres investigador de farándula latina (Ecuador, México, Colombia, etc.). Busca en la web y responde breve y verificable: quién es esta persona o grupo, su nombre real, nombre artístico, apodos y a qué grupo o programa pertenece. Si no encuentras nada confiable, dilo; no inventes.',
    `¿Quién es "${nombre}"?${contexto ? ' Contexto de la noticia: ' + contexto.slice(0, 300) : ''}`, g.TAREAS.contexto, {}, [{ google_search: {} }]);
  if (!(grounding && (grounding.groundingChunks || []).length)) return { nombres: [], texto: '' };
  const r = await g.llamarJSON('De la búsqueda web, extrae TODOS los nombres con que se conoce a esa persona o grupo (nombre real, artístico, apodos). Usa solo lo que dice el texto. Responde SOLO JSON: {"nombres":["..."]}', `PERSONA: ${nombre}\n=== LO ENCONTRADO ===\n${texto.slice(0, 3000)}\n=== FIN ===`, g.TAREAS.contexto);
  return { nombres: (Array.isArray(r.nombres) ? r.nombres : []).map(String).slice(0, 12), texto: texto.slice(0, 300) };
}

// → { carpeta, origen: 'registro'|'carpeta'|'web'|null, alias: [nombres conocidos] }. `buscar` es inyectable (pruebas).
async function resolver(nombre, { carpetas, reg = null, buscar = buscarNombresWeb, contexto = '', excluir = [], guardarEn = ARCHIVO, hoy = Date.now() } = {}) {
  reg = reg || cargar(guardarEn); const k = norm(nombre); if (!k) return { carpeta: null, origen: null, alias: [] };
  const aliasDe = c => Object.keys(reg.alias).filter(a => reg.alias[a].carpeta === c);
  if (reg.alias[k] && carpetas.includes(reg.alias[k].carpeta)) return { carpeta: reg.alias[k].carpeta, origen: 'registro', alias: aliasDe(reg.alias[k].carpeta) };
  const directa = buscarCarpeta(nombre, carpetas, { excluir });
  if (directa) { registrar(reg, nombre, directa, 'carpeta'); guardar(reg, guardarEn); return { carpeta: directa, origen: 'carpeta', alias: aliasDe(directa) }; }
  const neg = reg.sinCarpeta[k]; if (neg && neg.carpetas === carpetas.length && hoy - Date.parse(neg.fecha) < DIAS_NEGATIVO * 864e5) return { carpeta: null, origen: 'registro', alias: [] };
  let hallados = []; try { hallados = (await buscar(nombre, { contexto })).nombres || []; } catch { return { carpeta: null, origen: null, alias: [] }; } // sin internet: no se anota nada, se reintenta otro día
  const cand = new Set(); for (const h of hallados) { const c = buscarCarpeta(h, carpetas, { excluir }); if (c) cand.add(c); }
  if (cand.size === 1) { const c = [...cand][0]; registrar(reg, [nombre, ...hallados.filter(h => !/^(los|las)\s/i.test(h.trim()))], c, 'web'); // no se anotan nombres de grupos/familias ("Los Morales"): pueden ser otra gente guardar(reg, guardarEn); return { carpeta: c, origen: 'web', alias: aliasDe(c) }; }
  reg.sinCarpeta[k] = { fecha: new Date(hoy).toISOString().slice(0, 10), carpetas: carpetas.length, ...(cand.size > 1 ? { ambiguo: [...cand] } : {}) }; guardar(reg, guardarEn);
  return { carpeta: null, origen: 'web', alias: [] };
}

// Nombres ya aprendidos que aparecen en el texto (sin IA): [{ nombre, carpeta, alias }]
function personasEnTexto(texto, carpetas, reg = cargar()) {
  const T = ' ' + norm(texto) + ' ', out = new Map();
  for (const [a, v] of Object.entries(reg.alias)) if (carpetas.includes(v.carpeta) && T.includes(' ' + a + ' ')) { const p = out.get(v.carpeta) || { nombre: a, carpeta: v.carpeta, alias: [] }; p.alias.push(a); out.set(v.carpeta, p); }
  return [...out.values()];
}

module.exports = { cargar, guardar, registrar, resolver, personasEnTexto, buscarNombresWeb, ARCHIVO };
