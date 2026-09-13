// Cola de renderizado: UN render a la vez, en orden de llegada.
//
// Por qué existe (dos razones distintas, las dos reales):
//
// 1. `seleccion.planificarClips()` y `seleccion.elegirPista()` leen y escriben `historial.json`
//    para rotar clips y música sin repetir. Dos renders en paralelo leen el MISMO historial antes
//    de que ninguno lo haya actualizado, y terminan eligiendo los mismos clips y la misma pista —
//    justo lo contrario de lo que se busca con los videos gemelos. Serializar los renders es lo
//    que hace que el segundo video salga de verdad distinto del primero.
// 2. El render era un pedido HTTP largo (minutos), rozando el límite de tiempo del gateway de
//    Railway. Ahora el pedido encola y responde al instante; el navegador sondea el estado.
//
// El ejecutor real se INYECTA desde server.js (`configurar`) en vez de importarse: la función que
// renderiza vive en server.js y server.js importa este módulo, así que importarla de vuelta acá
// sería un require circular.
const fs = require('fs');
const path = require('path');
const driveCache = require('./driveCache');
const metricas = require('./metricas');

const DATA_DIR = path.join(__dirname, 'data');
const COLA_FILE = path.join(DATA_DIR, 'cola.json');
const TTL_TERMINADAS = 24 * 60 * 60 * 1000; // las tareas ya cerradas se podan al día
const MAX_TAREAS = 200;

let tareas = [];        // en orden de llegada, incluye las ya terminadas hasta que se podan
let corriendo = false;
let ejecutor = null;
let secuencia = 0;

// Quién creó cada tarea. `cola.json` se respalda a la MISMA carpeta de Drive desde local, staging
// y producción (igual que jobs.json e historial.json), así que al arrancar cualquiera de los tres
// se trae el archivo del otro. Con jobs.json eso es inofensivo — son datos. Con la cola NO: una
// tarea que quedó `en_cola` en la máquina de casa se reencolaría en Railway y **renderizaría un
// video que nadie pidió ahí**. Pasó de verdad en la primera corrida (el cola.json local llegó a
// staging; se salvó porque todas sus tareas ya estaban en error).
const ENTORNO = process.env.RAILWAY_ENVIRONMENT_NAME
  || process.env.RAILWAY_SERVICE_NAME
  || 'local';

// El respaldo a Drive va AGRUPADO, no en cada cambio de estado. La cola cambia varias veces por
// tarea (encolar, empezar, terminar) y con varias ventanas trabajando en paralelo eso eran una
// docena de subidas a Drive por minuto — cuota tirada a la basura para un archivo que solo hace
// falta si el contenedor se reinicia. Al disco sí se escribe siempre: es local y es gratis.
const RESPALDO_CADA = 15000;
let respaldoPendiente = null;

function respaldarAgrupado() {
  if (respaldoPendiente) return;
  respaldoPendiente = setTimeout(() => {
    respaldoPendiente = null;
    driveCache.respaldar(COLA_FILE, 'cola.json');
  }, RESPALDO_CADA);
  if (respaldoPendiente.unref) respaldoPendiente.unref(); // no mantiene vivo el proceso
}

function guardar() {
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(COLA_FILE, JSON.stringify(tareas, null, 2));
    // Mismo patrón que jobs.json/historial.json (Bloque D): el disco de Railway es efímero.
    respaldarAgrupado();
  } catch (e) {
    console.warn(`⚠️ No se pudo guardar la cola de render: ${e.message}`);
  }
}

function podar() {
  const ahora = Date.now();
  tareas = tareas.filter(t => {
    if (t.estado === 'en_cola' || t.estado === 'renderizando') return true;
    return ahora - new Date(t.terminado || t.encolado).getTime() < TTL_TERMINADAS;
  });
  if (tareas.length > MAX_TAREAS) tareas = tareas.slice(-MAX_TAREAS);
}

// Se llama UNA vez al arrancar el server. Lo que quedó a medias en el disco vuelve, pero con la
// verdad al frente: una tarea que estaba renderizando cuando el proceso murió perdió sus archivos
// temporales, así que no se puede reanudar — se marca como error VISIBLE en vez de desaparecer en
// silencio (que es como se pierden trabajos sin que nadie se entere).
function rehidratar() {
  try {
    if (!fs.existsSync(COLA_FILE)) return;
    const guardadas = JSON.parse(fs.readFileSync(COLA_FILE, 'utf8'));
    if (!Array.isArray(guardadas)) return;
    // Solo las tareas de ESTE entorno: las que vienen de otro se descartan enteras (ni se
    // ejecutan ni se muestran). Ver el comentario de ENTORNO.
    const ajenas = guardadas.filter(t => (t.entorno || 'local') !== ENTORNO).length;
    tareas = guardadas.filter(t => (t.entorno || 'local') === ENTORNO);
    if (ajenas) console.log(`ℹ️ Cola: ${ajenas} tarea(s) de otro entorno descartada(s) del respaldo compartido`);
    let interrumpidas = 0;
    let pendientes = 0;
    let sinCartel = 0;
    for (const t of tareas) {
      if (t.estado === 'renderizando') {
        t.estado = 'error';
        t.error = 'El servidor se reinició a mitad del render (sus archivos temporales se perdieron). Volvé a generarlo.';
        t.terminado = new Date().toISOString();
        interrumpidas++;
      } else if (t.estado === 'en_cola') {
        // El cartel de portada es un PNG que el navegador dibujó y dejó en el disco efímero ANTES
        // de encolar: el reinicio se lo llevó y no hay de dónde recuperarlo (el audio sí se rescata
        // de Drive por su token, el cartel no). Renderizarla igual daría un video sin portada,
        // subido a Drive y publicable — peor que pedir que se regenere.
        if (t.params?.cartelPath && !fs.existsSync(t.params.cartelPath)) {
          t.estado = 'error';
          t.error = 'El servidor se reinició antes de que le tocara el turno y se perdió el cartel de portada. Volvé a generarlo.';
          t.terminado = new Date().toISOString();
          sinCartel++;
        } else {
          pendientes++;
        }
      }
    }
    podar();
    if (interrumpidas || pendientes || sinCartel) {
      console.log(`♻️ Cola de render rehidratada: ${pendientes} en espera, ${interrumpidas} interrumpida(s) por el reinicio`
        + `${sinCartel ? `, ${sinCartel} sin su cartel de portada` : ''}`);
    }
    guardar();
  } catch (e) {
    console.warn(`⚠️ No se pudo rehidratar la cola de render: ${e.message}`);
    tareas = [];
  }
}

function configurar(fn) {
  ejecutor = fn;
  bombear();
}

// Identificador del render, y prefijo de TODOS sus archivos temporales.
// `video.limpiarTemporales(renderId)` borra por PREFIJO, así que dos ids donde uno empieza igual
// que el otro se borrarían archivos entre sí. Largo fijo (timestamp de 13 + contador de 3) =
// ningún id puede ser prefijo de otro distinto. Prefijo `render_` y no `job_` a propósito: así
// tampoco choca con los renderId de /api/exportar, que siguen usando `job_<timestamp>`.
function nuevoRenderId() {
  secuencia = (secuencia + 1) % 1000;
  return `render_${Date.now()}_${String(secuencia).padStart(3, '0')}`;
}

// `renderId` se puede pasar hecho: el endpoint lo necesita ANTES de encolar para nombrar con él
// el PNG del cartel que deja en disco.
function encolar({ renderId = null, jobId = null, variante = 'A', etiqueta = '', canal = '', params }) {
  const tarea = {
    renderId: renderId || nuevoRenderId(),
    entorno: ENTORNO,
    jobId,
    variante,
    etiqueta,
    canal,
    estado: 'en_cola',
    encolado: new Date().toISOString(),
    iniciado: null,
    terminado: null,
    resultado: null,
    error: null,
    params,
  };
  tareas.push(tarea);
  podar();
  guardar();
  bombear();
  return tarea;
}

// Techo de tiempo de UN render. Medido: un video de 40 clips tarda 2-3 minutos de punta a punta,
// así que 30 es un margen enorme — no está para apurar a nadie, está para que la cola nunca quede
// muerta.
//
// Por qué existe (2026-09-07): una subida a Drive se colgó sin responder y, como la cola procesa
// de a uno esperando a que termine el de adelante, los dos videos que venían detrás se quedaron
// esperando para siempre. Con un solo punto de la cadena que se cuelgue, TODO el sistema de
// renders se detiene sin que nada falle a la vista.
//
// La causa concreta de aquella vez ya está tapada (`SUBIDA_TIMEOUT_MS` en drive.js), pero esta
// guarda es la general: cubre el próximo cuelgue, venga de donde venga.
//
// ⚠️ Vencido el plazo NO se puede cancelar el trabajo que quedó colgado — JavaScript no aborta una
// promesa ajena. Lo que se hace es dejar de esperarlo: la tarea se marca en error y la cola sigue.
// El render huérfano puede seguir vivo en segundo plano y, si termina, escribir en `historial.json`
// mientras corre el siguiente. Es un riesgo aceptado a cambio de no perder la cola entera: pasa
// solo cuando algo ya está roto, y el peor caso es que dos videos repitan una toma.
const TOPE_RENDER_MS = 30 * 60 * 1000;

async function bombear() {
  if (corriendo || !ejecutor) return;
  const siguiente = tareas.find(t => t.estado === 'en_cola');
  if (!siguiente) return;

  corriendo = true;
  siguiente.estado = 'renderizando';
  siguiente.iniciado = new Date().toISOString();
  siguiente.progreso = 0;
  siguiente.etapa = 'Preparando…';
  guardar();
  cronos.set(siguiente.renderId, { etapa: 'plan', desde: Date.now(), etapas: {} });

  let reloj;
  const seColgo = new Promise((_, reject) => {
    reloj = setTimeout(() => reject(new Error(
      `El render pasó de ${TOPE_RENDER_MS / 60000} minutos sin terminar (se quedó en "${siguiente.etapa || 'renderizando'}"). `
      + 'Se abandona para no trabar los que están esperando; volvé a generarlo.')), TOPE_RENDER_MS);
    if (reloj.unref) reloj.unref();
  });

  try {
    siguiente.resultado = await Promise.race([
      ejecutor(siguiente.params, siguiente.renderId),
      seColgo,
    ]);
    siguiente.estado = 'listo';
    siguiente.progreso = 100;
    siguiente.etapa = 'Listo';
  } catch (e) {
    siguiente.estado = 'error';
    siguiente.error = e.message;
    console.error(`❌ [${siguiente.renderId}] Render fallido en la cola: ${e.message}`);
  }
  clearTimeout(reloj);
  siguiente.terminado = new Date().toISOString();
  anotarMetrica(siguiente);
  // Los params ya no hacen falta y son lo más pesado de la tarea (fragmentos completos): se
  // sueltan al terminar para no engordar cola.json ni el respaldo de Drive.
  siguiente.params = null;
  corriendo = false;
  guardar();

  setImmediate(bombear); // el resto de la cola, una por una
}

// Cronómetro por etapa de cada render en curso, y el contexto que lo explica (clips, MB, encoder).
// En memoria y no dentro de la tarea a propósito: la tarea se serializa a cola.json en cada cambio,
// y esto es un dato de trabajo que al terminar se vuelca entero en `metricas.js`.
const cronos = new Map();     // renderId -> { etapa, desde, etapas: {clave: segundos} }
const contextos = new Map();  // renderId -> { clips, mbBajados, encoder, ... }

// La etapa sale del PORCENTAJE que ya reporta cada paso, no de su texto: el texto cambia ("Bajando
// clips (3 de 40)", "Cortando toma 7 de 12") y el porcentaje de cada tramo es fijo. Así no hay que
// tocar cada punto del render para medirlo — y si algún día se agrega un paso, basta con que
// reporte su porcentaje como los demás.
function claveDeEtapa(progreso) {
  if (progreso < 15) return 'plan';
  if (progreso < 32) return 'descarga';
  if (progreso < 38) return 'subtitulos';
  if (progreso < 45) return 'musica';
  if (progreso < 80) return 'cortes';
  if (progreso < 84) return 'union';
  if (progreso < 88) return 'mezcla';
  return 'subida';
}

function marcarEtapa(renderId, clave) {
  const c = cronos.get(renderId);
  if (!c || c.etapa === clave) return;
  const ahora = Date.now();
  c.etapas[c.etapa] = Math.round(((c.etapas[c.etapa] || 0) + (ahora - c.desde) / 1000) * 10) / 10;
  c.etapa = clave;
  c.desde = ahora;
}

// Datos que explican el tiempo. Los manda el ejecutor cuando los conoce; se van sumando.
function contexto(renderId, datos) {
  // Solo para renders con el cronómetro corriendo: si la cola ya abandonó uno por el tope de tiempo,
  // el trabajo huérfano puede seguir mandando datos y quedarían en memoria para siempre.
  if (!renderId || !datos || !cronos.has(renderId)) return;
  contextos.set(renderId, { ...(contextos.get(renderId) || {}), ...datos });
}

// Avance del render que se está haciendo AHORA. Lo llama el ejecutor a medida que avanza.
//
// Por qué existe: hasta acá la pantalla solo podía decir "renderizando…" y quedarse ahí cinco
// minutos sin mover un pixel — el usuario no tenía forma de saber si estaba avanzando o colgado.
// Con etapas reales al menos ve que algo pasa, y dónde.
//
// A propósito NO se guarda en disco en cada reporte: el progreso cambia decenas de veces por
// render y `guardar()` escribe el archivo Y programa un respaldo a Drive. Es un dato efímero —
// si el contenedor se reinicia, ese render ya se perdió igual.
function reportar(renderId, progreso, etapa) {
  const t = tareas.find(x => x.renderId === renderId);
  if (!t || t.estado !== 'renderizando') return;
  if (Number.isFinite(progreso)) marcarEtapa(renderId, claveDeEtapa(progreso));
  if (Number.isFinite(progreso)) t.progreso = Math.max(0, Math.min(99, Math.round(progreso)));
  if (etapa) t.etapa = etapa;
}

// Cierra el cronómetro y guarda el render en la historia de métricas. Se anotan también los que
// fallan, con la etapa donde se quedaron: un render que se cuelga siempre en la subida es un dato
// tan útil como uno lento.
function anotarMetrica(t) {
  try {
    const c = cronos.get(t.renderId);
    // Dónde estaba al terminar, leído ANTES de cerrar el cronómetro (que pisa la etapa actual).
    // En un render que falló es el dato más útil: dice en qué paso se rompió.
    const etapaAlTerminar = c?.etapa || null;
    if (c) marcarEtapa(t.renderId, '__fin__');
    const seg = (a, b) => (a && b ? Math.round((new Date(b) - new Date(a)) / 100) / 10 : null);
    metricas.registrar({
      renderId: t.renderId,
      jobId: t.jobId,
      variante: t.variante,
      canal: t.canal,
      etiqueta: t.etiqueta,
      estado: t.estado,
      encolado: t.encolado,
      terminado: t.terminado,
      esperaSeg: seg(t.encolado, t.iniciado),
      trabajoSeg: seg(t.iniciado, t.terminado),
      etapaFinal: t.estado === 'listo' ? null : etapaAlTerminar,
      etapas: c ? Object.fromEntries(Object.entries(c.etapas).filter(([k]) => k !== '__fin__')) : {},
      contexto: contextos.get(t.renderId) || {},
      error: t.error ? String(t.error).slice(0, 200) : null,
    });
  } catch (e) {
    console.warn(`⚠️ No se pudo anotar la métrica de ${t.renderId}: ${e.message}`);
  } finally {
    cronos.delete(t.renderId);
    contextos.delete(t.renderId);
  }
}

// Vista pública de una tarea (sin `params`, que es interno y pesado) + su puesto en la fila.
function publica(t) {
  if (!t) return null;
  const enEspera = tareas.filter(x => x.estado === 'en_cola');
  const idx = enEspera.findIndex(x => x.renderId === t.renderId);
  return {
    renderId: t.renderId,
    jobId: t.jobId,
    variante: t.variante,
    etiqueta: t.etiqueta,
    canal: t.canal,
    estado: t.estado,
    posicion: idx >= 0 ? idx + 1 : null,   // 1 = es el próximo en entrar
    enEspera: enEspera.length,
    progreso: t.progreso ?? null,   // 0-100 mientras renderiza; null si todavía no arrancó
    etapa: t.etapa || null,         // qué está haciendo ahora, en palabras
    encolado: t.encolado,
    iniciado: t.iniciado,
    terminado: t.terminado,
    resultado: t.resultado,
    error: t.error,
  };
}

function obtener(renderId) {
  return publica(tareas.find(t => t.renderId === renderId));
}

// Panorama COMPLETO, para que cualquier ventana abierta vea qué se está renderizando y cuánto
// tiene por delante — el usuario trabaja varias noticias a la vez en pestañas distintas.
function listar() {
  return {
    corriendo: publica(tareas.find(t => t.estado === 'renderizando')),
    cola: tareas.filter(t => t.estado === 'en_cola').map(publica),
    recientes: tareas.filter(t => t.estado === 'listo' || t.estado === 'error').slice(-10).map(publica),
  };
}

// Archivos que limpiarCache() NO puede borrar todavía: son de tareas que aún no corrieron. Sin
// esto, una cola larga (más de 1h de espera) se queda sin el cartel o sin la locución de los
// renders que todavía no llegaron a su turno.
function rutasProtegidas() {
  const rutas = [];
  for (const t of tareas) {
    if (t.estado !== 'en_cola' && t.estado !== 'renderizando') continue;
    if (!t.params) continue;
    if (t.params.cartelPath) rutas.push(t.params.cartelPath);
    if (t.params.audioPath) rutas.push(t.params.audioPath);
  }
  return rutas;
}

// Los audioToken de las tareas que todavía no corrieron. El servidor los resuelve contra su propio
// mapa de locuciones aprobadas para no borrar un mp3 que otro render de la fila todavía necesita
// (ver `audioSigueEnUso` en server.js — bug real de los gemelos, 2026-08-22).
function audioTokensPendientes() {
  return tareas
    .filter(t => (t.estado === 'en_cola' || t.estado === 'renderizando') && t.params?.audioToken)
    .map(t => t.params.audioToken);
}

module.exports = { configurar, encolar, obtener, listar, rehidratar, rutasProtegidas, audioTokensPendientes, nuevoRenderId, reportar, contexto };
