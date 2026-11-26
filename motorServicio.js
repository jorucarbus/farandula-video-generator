// Motor EDL como tarea de la cola: de un link (o texto) al MP4, sin interfaz de por medio.
//
// Corre `scripts/noticia-a-video.js` en un proceso hijo (así un fallo del render no tumba el servidor y
// la memoria del render se libera al terminar) y traduce lo que imprime en avance para `colaRender`.
// Después guarda el video igual que el motor legado: carpeta local de Drive o subida por API, y fila en Sheets.
//
// Las dependencias (colaRender, driveHelper, sheets...) se INYECTAN: este módulo no importa server.js ni
// la cola, así se puede probar con falsos y no hay requires circulares.
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const RAIZ = __dirname;
const SCRIPT = path.join(RAIZ, 'scripts', 'noticia-a-video.js');
const DM = path.join(RAIZ, 'data-motor');

// Etapas que el script anuncia por consola → porcentaje y texto para la cola.
const ETAPAS = [
  [/^Leyendo la fuente/i, 5, 'Leyendo la noticia'],
  [/^Lectura \(|^Lectura ya hecha/i, 15, 'Noticia leída'],
  [/^Datos de la noticia/i, 20, 'Extrayendo los datos'],
  [/^Guion 1:/i, 30, 'Escribiendo el guion'],
  [/^Guion:|^Guion ya escrito/i, 42, 'Guion listo'],
  [/^Voz:|^Voz ya generada/i, 48, 'Generando la voz'],
  [/^DIRECTOR/i, 62, 'Dirigiendo las escenas'],
  [/^PERSONAS/i, 68, 'Fotos de personas'],
  [/^MÚSICA/i, 74, 'Eligiendo la música'],
  [/^LISTO /i, 84, 'Video renderizado'],
];

function nombreSeguro(t) {
  return String(t || 'video').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Za-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 40).trim() || 'video';
}

// Arma los argumentos del script. Separado para poder probarlo sin lanzar nada.
function argumentosDe(params, nombre, salida) {
  const a = [SCRIPT];
  if (params.link) a.push(params.link);
  else if (params.texto) a.push('--texto', params.texto);
  else throw new Error('Falta el link o el texto de la noticia');
  a.push('--canal', params.canal || 'Chismex Picante', '--carpeta', params.carpetaClips, '--nombre', nombre, '--salida', salida);
  if (params.desdeNombre) a.push('--desde', params.desdeNombre);
  if (params.hastaGuion) a.push('--hasta-guion');
  return a;
}

function crearEjecutor({ colaRender, driveHelper, sheets, video, spawnFn = spawn, log = console }) {
  return async function renderizarVideoMotor(params, renderId) {
    if (!params.carpetaClips) throw new Error('Falta carpetaClips (carpeta de clips del protagonista en data-motor/biblioteca/)');
    const nombre = params.nombre || `${new Date().toISOString().slice(0, 10)}-${nombreSeguro(params.etiqueta).toLowerCase().replace(/ /g, '-')}-${renderId}`;
    const salida = path.join(DM, 'renders', `${nombre}.mp4`);
    fs.mkdirSync(path.dirname(salida), { recursive: true });
    colaRender.reportar(renderId, 3, 'Arrancando el motor nuevo');

    // 1) proceso hijo
    const textoFinal = await new Promise((resolve, reject) => {
      const hijo = spawnFn(process.execPath, argumentosDe(params, nombre, salida), { cwd: RAIZ, env: process.env });
      let salidaTxt = '', cola = '';
      const leer = chunk => {
        const s = chunk.toString(); salidaTxt += s; cola = (cola + s).slice(-6000);
        for (const linea of s.split(/\r?\n/)) for (const [re, pct, etapa] of ETAPAS) if (re.test(linea.trim())) { colaRender.reportar(renderId, pct, etapa); break; }
      };
      hijo.stdout.on('data', leer); hijo.stderr.on('data', leer);
      hijo.on('error', reject);
      hijo.on('close', code => code === 0 ? resolve(salidaTxt) : reject(new Error(`El motor falló (código ${code}): ${(cola.match(/FALLO.*/) || [cola.trim().split('\n').pop()])[0]}`)));
    });
    if (!fs.existsSync(salida)) throw new Error('El motor terminó pero no dejó el video');

    // 2) metadatos que dejó el guion
    const g = JSON.parse(fs.readFileSync(path.join(DM, 'noticias', nombre, 'guion.json'), 'utf8'));
    const fecha = new Date().toISOString().slice(0, 10);
    const fileName = `${fecha} ${nombreSeguro(g.titulo)}.mp4`;
    const duracion = await video.obtenerDuracion(salida);

    // 3) guardar en Drive (carpeta local sincronizada o subida por API), igual que el motor legado
    let driveLink = null, folderName = params.destFolder ? await driveHelper.nombreCarpeta(params.destFolder) : '(sin carpeta de Drive)', archivoDriveId = null;
    if (params.destFolder) {
      colaRender.reportar(renderId, 88, 'Guardando el video');
      const localBase = process.env.RENDERS_LOCAL_PATH;
      if (localBase && fs.existsSync(path.join(localBase, folderName))) {
        fs.copyFileSync(salida, path.join(localBase, folderName, fileName));
        driveLink = `https://drive.google.com/drive/folders/${params.destFolder}`;
      } else {
        const subido = await driveHelper.subirVideo(salida, fileName, params.destFolder);
        driveLink = subido.webViewLink; archivoDriveId = subido.id || null;
      }
      try {
        await sheets.registrarVideo({ fecha, titulo: g.titulo, descripcion: [g.descripcion, (g.hashtags || []).join(' ')].filter(Boolean).join('\n'), protagonista: params.protagonista || '',
          canal: folderName, nombreArchivo: fileName, linkFuente: params.link || '', linkRender: driveLink, guion: g.script, tipo: 'video', destino: 'feed', idNoticia: params.jobId || '', archivoDriveId });
      } catch (e) { log.warn(`⚠️ [${renderId}] No se pudo registrar en Sheets: ${e.message}`); }
    }

    colaRender.contexto(renderId, { motor: 'edl', palabras: g.palabras, datosCubiertosPct: g.control && g.control.datosCubiertosPct });
    return { status: 'success', motor: 'edl', fileName, folderName, duration: duracion, driveLink, titulo: g.titulo, descripcion: g.descripcion, hashtags: g.hashtags || [], rutaLocal: salida, previewUrl: null, cartelUrl: null };
  };
}

// Elige el ejecutor por tarea: `params.motor === 'edl'` va al motor nuevo; todo lo demás, al legado.
function despachador(legado, motor) {
  return (params, renderId) => (params && params.motor === 'edl' ? motor(params, renderId) : legado(params, renderId));
}

module.exports = { crearEjecutor, despachador, argumentosDe, ETAPAS };
