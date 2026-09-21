// Bloque D: respaldo/restauración en Drive de archivos de estado (historial.json, data/jobs.json).
// Railway usa filesystem efímero: cada redeploy los borra. Esta subcarpeta ("cache-estado", dentro
// de Redes_Canales) guarda una copia para que la rotación de clips y los jobs en progreso sobrevivan
// un restart. OJO: Redes_Canales (1irTudEARQWOrJr3y911Hwl_1VbvQqNP5) es la raíz compartida con
// renders/audios/recursos — NO subir aquí directo, usar siempre la subcarpeta dedicada.
const fs = require('fs');
const path = require('path');
const { getDrive, getDriveOAuth } = require('./drive');

const CACHE_FOLDER_ID = process.env.GOOGLE_DRIVE_CACHE_FOLDER_ID || '1s0OXuermFR4_DbNZP3gWFYDAV1xvf5ct';

function cliente() {
  return getDriveOAuth() || getDrive();
}

async function buscarArchivo(nombre) {
  const res = await cliente().files.list({
    q: `'${CACHE_FOLDER_ID}' in parents and name='${nombre}' and trashed=false`,
    fields: 'files(id, name, size)',
    pageSize: 1,
    includeItemsFromAllDrives: true,
    supportsAllDrives: true,
  });
  return res.data.files[0] || null;
}

// ¿El archivo es JSON sin nada adentro (`{}`, `[]`, vacío)? Si no se puede leer, se lo trata como
// no vacío: la guarda de abajo solo debe frenar el caso claro, nunca un archivo real.
function estaVacio(ruta) {
  try {
    const texto = fs.readFileSync(ruta, 'utf8').trim();
    if (!texto) return true;
    const datos = JSON.parse(texto);
    return Array.isArray(datos) ? datos.length === 0 : (datos && typeof datos === 'object' && !Object.keys(datos).length);
  } catch {
    return false;
  }
}

// Al arrancar: si el archivo local no existe (o está vacío), lo trae de la carpeta caché.
// Nunca pisa un archivo local que ya tenga contenido (evita perder progreso reciente).
async function restaurar(localPath, nombreDrive) {
  try {
    if (fs.existsSync(localPath) && fs.statSync(localPath).size > 0) return false;
    const archivo = await buscarArchivo(nombreDrive);
    if (!archivo) {
      console.log(`ℹ️ ${nombreDrive} no existe todavía en la carpeta caché de Drive (nada que restaurar)`);
      return false;
    }

    const res = await cliente().files.get(
      { fileId: archivo.id, alt: 'media', supportsAllDrives: true },
      { responseType: 'stream' }
    );
    fs.mkdirSync(path.dirname(localPath), { recursive: true });
    await new Promise((resolve, reject) => {
      const out = fs.createWriteStream(localPath);
      res.data.pipe(out);
      out.on('finish', resolve);
      out.on('error', reject);
    });
    console.log(`♻️  Restaurado desde Drive: ${nombreDrive}`);
    return true;
  } catch (e) {
    console.warn(`⚠️ No se pudo restaurar ${nombreDrive} desde Drive: ${e.message}`);
    return false;
  }
}

// Archivos de ESTADO COMPARTIDO: local, staging y producción respaldan todos al mismo nombre en
// la misma carpeta de Drive, así que el último que escribe pisa a los demás. Y `restaurar()` no
// baja nada si el archivo local ya existe con contenido, así que la máquina de casa nunca ve lo
// que hicieron las otras: arranca con SU copia vieja y la sube encima.
//
// Eso ya pasó de verdad: levantar el servidor local para una prueba dejó el respaldo de jobs.json
// con 4 jobs de prueba en lugar de los 11 reales (recuperado desde las revisiones de Drive). Con
// cola.json el problema es todavía peor y por eso colaRender ya filtra por entorno.
//
// Estos archivos existen para que Railway sobreviva un redeploy — su disco es efímero. El disco
// local NO lo es, así que respaldarlos desde local no aporta nada y solo puede destruir. Los
// archivos de material adicional sí se suben desde donde sea: son de un job puntual, no pisan
// estado de nadie.
const ESTADO_COMPARTIDO = new Set(['jobs.json', 'historial.json', 'cola.json', 'famosos.json', 'ajustes.json', 'metricas-render.json']);
const EN_RAILWAY = Boolean(process.env.RAILWAY_ENVIRONMENT_NAME || process.env.RAILWAY_SERVICE_NAME);

// MODO RESPALDO (`MODO_RESPALDO=1`): el despliegue LEE el estado compartido pero nunca lo escribe.
//
// Por qué existe (2026-09-20): el usuario trabaja a diario en staging y deja producción como la
// "versión que sé que funciona", para volver a ella si algo se rompe. Los dos entornos comparten la
// carpeta `cache-estado`, y producción, aunque nadie la use, no está quieta: su limpieza de insumos
// marca procesos cada 6 horas y guarda SU copia de jobs.json — que es la del día en que arrancó. Esa
// escritura pisaría en Drive todos los procesos que el usuario creó después en staging.
//
// En modo respaldo se sigue RESTAURANDO al arrancar: cada reinicio trae el estado más reciente, así
// que el día que haga falta volver a producción, arranca con todo el historial. Para usar producción
// de verdad (no como respaldo), se quita la variable.
const MODO_RESPALDO = /^(1|true|si|sí)$/i.test(process.env.MODO_RESPALDO || '');

// Respalda (crea o actualiza) un archivo local en la carpeta caché de Drive.
// Fire-and-forget: nunca debe tumbar el flujo principal si Drive falla.
// mimeType: 'application/json' por defecto (jobs.json/historial.json, los 2 usos originales);
// los archivos binarios (material adicional: audio/video/imagen) pasan el suyo real.
async function respaldar(localPath, nombreDrive, mimeType = 'application/json') {
  try {
    if (!EN_RAILWAY && ESTADO_COMPARTIDO.has(nombreDrive)) return;
    if (MODO_RESPALDO && ESTADO_COMPARTIDO.has(nombreDrive)) return;   // ver MODO_RESPALDO
    if (!fs.existsSync(localPath)) return;
    const archivo = await buscarArchivo(nombreDrive);

    // Nunca subir un estado VACÍO encima de uno con contenido.
    //
    // Pasó el 2026-09-20: una prueba mal aislada subió `{}` a jobs.json e historial.json, los dos
    // entornos se reiniciaron, restauraron el archivo vacío y quedaron sin un solo proceso. Se
    // recuperó desde las revisiones de Drive, pero no tiene que poder volver a pasar — ni por una
    // prueba, ni por un bug que vacíe la lista en memoria. Un estado compartido que de verdad quede
    // vacío es tan raro que conviene exigir que alguien lo borre a mano en Drive.
    if (archivo && ESTADO_COMPARTIDO.has(nombreDrive) && Number(archivo.size) > 100 && estaVacio(localPath)) {
      console.warn(`🛑 No se respalda ${nombreDrive}: el archivo local está VACÍO y el de Drive tiene `
        + `${archivo.size} bytes. Subirlo borraría el estado compartido de todos los entornos.`);
      return;
    }
    // El archivo se abre recién ahora, cuando ya se sabe que se va a subir: abrirlo antes dejaba
    // un descriptor abierto que nadie leía cada vez que la guarda de arriba frenaba la subida.
    const media = { mimeType, body: fs.createReadStream(localPath) };
    if (archivo) {
      await cliente().files.update({ fileId: archivo.id, media, supportsAllDrives: true });
    } else {
      await cliente().files.create({
        requestBody: { name: nombreDrive, parents: [CACHE_FOLDER_ID] },
        media,
        fields: 'id',
        supportsAllDrives: true,
      });
    }
  } catch (e) {
    console.warn(`⚠️ No se pudo respaldar ${nombreDrive} en Drive: ${e.message}`);
  }
}

// Borra el respaldo de Drive de un archivo (ej. al eliminar un material adicional a mano —
// evita que la carpeta caché acumule archivos huérfanos para siempre). Fire-and-forget.
async function borrar(nombreDrive) {
  try {
    const archivo = await buscarArchivo(nombreDrive);
    if (archivo) await cliente().files.delete({ fileId: archivo.id, supportsAllDrives: true });
  } catch (e) {
    console.warn(`⚠️ No se pudo borrar el respaldo de ${nombreDrive} en Drive: ${e.message}`);
  }
}

module.exports = { restaurar, respaldar, borrar, CACHE_FOLDER_ID, MODO_RESPALDO};
