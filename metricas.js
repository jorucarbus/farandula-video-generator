// Cuánto tarda cada render, etapa por etapa, para saber DÓNDE se va el tiempo antes de optimizar.
//
// Por qué existe (pedido del usuario, 2026-09-13): "quiero saber cuánto tiempo termina demorando
// cada render y al final poder sacar datos para saber cómo agilitar el proceso". La cola ya
// guardaba inicio y fin, pero solo el total — que dice "tardó 3 minutos" y nunca dónde — y además
// se poda a las 24 horas.
//
// Lección que ya costó plata en otro proyecto: el culpable de un costo no era el que todos
// suponían (ver la memoria del costo de Gemini). Acá hay dos sospechosos obvios —la unión con
// transiciones y la descarga de clips—, pero se mide antes de tocar.
//
// Mismo patrón de durabilidad que el resto del estado: disco + respaldo en Drive, porque el disco
// de Railway es efímero. Es un archivo JSON (no JSONL) a propósito, para que el respaldo y la
// restauración de `driveCache` lo traten igual que a `jobs.json`.
const fs = require('fs');
const path = require('path');
const driveCache = require('./driveCache');

const DATA_DIR = path.join(__dirname, 'data');
const ARCHIVO = path.join(DATA_DIR, 'metricas-render.json');
const NOMBRE_DRIVE = 'metricas-render.json';

// ~350 bytes por render: 2000 son ~700 KB y, al ritmo del usuario, varios meses de historia.
const MAX_REGISTROS = 2000;

// Hasta este largo de audio se cuenta como formato corto (30-40 s); arriba, el normal (~70 s). Se
// separan porque promediarlos juntos mezclaría dos cosas distintas y no diría nada de ninguna.
const TOPE_CORTO_SEG = 50;

// El orden en que ocurren. Las claves las asigna `colaRender` según el progreso reportado.
const ETAPAS = ['plan', 'descarga', 'subtitulos', 'musica', 'cortes', 'union', 'mezcla', 'subida'];

let cache = null;
let respaldoPendiente = null;

function leer() {
  if (cache) return cache;
  try {
    const datos = JSON.parse(fs.readFileSync(ARCHIVO, 'utf8'));
    cache = Array.isArray(datos) ? datos : [];
  } catch {
    cache = [];
  }
  return cache;
}

// Agrupado igual que la cola: el disco se escribe siempre, Drive como mucho cada 30 s.
function respaldarAgrupado() {
  if (respaldoPendiente) return;
  respaldoPendiente = setTimeout(() => {
    respaldoPendiente = null;
    driveCache.respaldar(ARCHIVO, NOMBRE_DRIVE);
  }, 30000);
  if (respaldoPendiente.unref) respaldoPendiente.unref();
}

// Anota un render terminado (bien o mal). Nunca lanza: medir no puede tumbar un render.
function registrar(registro) {
  try {
    const lista = leer();
    lista.push(registro);
    if (lista.length > MAX_REGISTROS) lista.splice(0, lista.length - MAX_REGISTROS);
    fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(ARCHIVO, JSON.stringify(lista));
    respaldarAgrupado();
  } catch (e) {
    console.warn(`⚠️ No se pudo guardar la métrica del render: ${e.message}`);
  }
}

function percentil(valores, p) {
  const v = valores.filter(Number.isFinite).sort((a, b) => a - b);
  if (!v.length) return null;
  const i = Math.min(v.length - 1, Math.max(0, Math.ceil((p / 100) * v.length) - 1));
  return Math.round(v[i] * 10) / 10;
}

function estadistica(valores) {
  const v = valores.filter(Number.isFinite);
  if (!v.length) return null;
  return { mediana: percentil(v, 50), p90: percentil(v, 90), max: Math.round(Math.max(...v) * 10) / 10 };
}

// Resumen para la pantalla. MEDIANA y no promedio: un solo render colgado (ya pasó uno de 14
// minutos) arruinaría cualquier promedio y escondería cómo se comporta el caso normal.
function resumen({ limite = 50 } = {}) {
  const todos = leer();
  const listos = todos.filter(r => r.estado === 'listo').slice(-limite);

  const grupos = {};
  for (const r of listos) {
    const formato = (r.contexto?.audioSegundos ?? 99) <= TOPE_CORTO_SEG ? 'corto' : 'normal';
    (grupos[formato] ??= []).push(r);
  }

  const porFormato = {};
  for (const [formato, rs] of Object.entries(grupos)) {
    const totalMediana = percentil(rs.map(r => r.trabajoSeg), 50) || 0;
    const etapas = {};
    for (const e of ETAPAS) {
      const est = estadistica(rs.map(r => r.etapas?.[e]));
      if (!est) continue;
      etapas[e] = { ...est, porcentaje: totalMediana ? Math.round((est.mediana / totalMediana) * 100) : null };
    }
    porFormato[formato] = {
      renders: rs.length,
      esperaEnCola: estadistica(rs.map(r => r.esperaSeg)),
      trabajo: estadistica(rs.map(r => r.trabajoSeg)),
      clips: estadistica(rs.map(r => r.contexto?.clips)),
      mbBajados: estadistica(rs.map(r => r.contexto?.mbBajados)),
      etapas,
    };
  }

  return {
    totalRegistrados: todos.length,
    fallidos: todos.filter(r => r.estado !== 'listo').slice(-limite).length,
    porFormato,
    ultimos: todos.slice(-10).reverse().map(r => ({
      etiqueta: r.etiqueta, canal: r.canal, estado: r.estado, terminado: r.terminado,
      esperaSeg: r.esperaSeg, trabajoSeg: r.trabajoSeg, etapaFinal: r.etapaFinal,
      etapas: r.etapas, contexto: r.contexto,
    })),
  };
}

async function restaurar() {
  try {
    await driveCache.restaurar(ARCHIVO, NOMBRE_DRIVE);
  } catch (e) {
    console.warn(`⚠️ No se pudieron restaurar las métricas desde Drive: ${e.message}`);
  }
  cache = null;
}

module.exports = { registrar, resumen, restaurar, ETAPAS, ARCHIVO, NOMBRE_DRIVE };
