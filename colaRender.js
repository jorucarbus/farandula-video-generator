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

const DATA_DIR = path.join(__dirname, 'data');
const COLA_FILE = path.join(DATA_DIR, 'cola.json');
const TTL_TERMINADAS = 24 * 60 * 60 * 1000; // las tareas ya cerradas se podan al día
const MAX_TAREAS = 200;

let tareas = [];        // en orden de llegada, incluye las ya terminadas hasta que se podan
let corriendo = false;
let ejecutor = null;
let secuencia = 0;

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
    tareas = guardadas;
    let interrumpidas = 0;
    let pendientes = 0;
    for (const t of tareas) {
      if (t.estado === 'renderizando') {
        t.estado = 'error';
        t.error = 'El servidor se reinició a mitad del render (sus archivos temporales se perdieron). Volvé a generarlo.';
        t.terminado = new Date().toISOString();
        interrumpidas++;
      } else if (t.estado === 'en_cola') {
        pendientes++;
      }
    }
    podar();
    if (interrumpidas || pendientes) {
      console.log(`♻️ Cola de render rehidratada: ${pendientes} en espera, ${interrumpidas} interrumpida(s) por el reinicio`);
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

async function bombear() {
  if (corriendo || !ejecutor) return;
  const siguiente = tareas.find(t => t.estado === 'en_cola');
  if (!siguiente) return;

  corriendo = true;
  siguiente.estado = 'renderizando';
  siguiente.iniciado = new Date().toISOString();
  guardar();

  try {
    siguiente.resultado = await ejecutor(siguiente.params, siguiente.renderId);
    siguiente.estado = 'listo';
  } catch (e) {
    siguiente.estado = 'error';
    siguiente.error = e.message;
    console.error(`❌ [${siguiente.renderId}] Render fallido en la cola: ${e.message}`);
  }
  siguiente.terminado = new Date().toISOString();
  // Los params ya no hacen falta y son lo más pesado de la tarea (fragmentos completos): se
  // sueltan al terminar para no engordar cola.json ni el respaldo de Drive.
  siguiente.params = null;
  corriendo = false;
  guardar();

  setImmediate(bombear); // el resto de la cola, una por una
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

module.exports = { configurar, encolar, obtener, listar, rehidratar, rutasProtegidas, nuevoRenderId };
