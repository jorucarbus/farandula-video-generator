// Limpieza automática de las carpetas de insumos en Drive.
//
// Cada job crea su carpeta de insumos (guion, audio.mp3, fragments.json, resultado.json)
// y hasta ahora nadie las borraba: llegaron a 117 carpetas / 1.17 GB con la más vieja de
// 3 semanas. Como el contenido es noticioso, a las 48h el material ya no tiene vigencia
// (decisión del usuario, 2026-08-05), así que se manda a la papelera.
//
// SIEMPRE a la papelera, nunca borrado permanente: recuperable ~30 días desde Drive.
//
// ⚠️ Alcance: SOLO las carpetas de job dentro de GOOGLE_DRIVE_INSUMOS_FOLDER_ID.
// Las carpetas de famosos (GOOGLE_DRIVE_FOLDER_ID), los renders y cache-estado son
// intocables — hay una guarda abajo que aborta si la configuración los confunde.
const drive = require('./drive');
const jobStore = require('./jobStore');

const RETENCION_HORAS = Number(process.env.INSUMOS_RETENCION_HORAS) || 48;
const INTERVALO_HORAS = 6;
const HORA_MS = 60 * 60 * 1000;

// Carpetas que esta limpieza no debe tocar bajo ninguna circunstancia. Si la raíz de
// insumos coincide con alguna, es un error de configuración y no se borra nada.
function raizValida(raizInsumos) {
  const prohibidas = {
    'GOOGLE_DRIVE_FOLDER_ID (famosos)': process.env.GOOGLE_DRIVE_FOLDER_ID,
    'GOOGLE_DRIVE_RENDERS_FOLDER_ID': process.env.GOOGLE_DRIVE_RENDERS_FOLDER_ID,
    'GOOGLE_DRIVE_CACHE_FOLDER_ID': process.env.GOOGLE_DRIVE_CACHE_FOLDER_ID,
  };
  for (const [nombre, id] of Object.entries(prohibidas)) {
    if (id && id === raizInsumos) {
      console.error(`🛑 Limpieza de insumos ABORTADA: la raíz de insumos es la misma carpeta que ${nombre}. Revisa el .env.`);
      return false;
    }
  }
  return true;
}

// Marca jobs cuya carpeta de insumos ya no existe aunque NO la haya borrado este cron
// (una limpieza manual, o el usuario borrándola desde Drive). Sin esto, el historial
// seguiría ofreciendo un link muerto para siempre en esos jobs.
async function reconciliar() {
  const candidatos = jobStore.listarJobs(100).filter(j => j.carpetaInsumoId && !j.insumosLimpiados);
  const muertas = [];
  for (const job of candidatos) {
    try {
      const r = await drive.getDrive().files.get({
        fileId: job.carpetaInsumoId,
        fields: 'trashed',
        supportsAllDrives: true,
      });
      if (r.data.trashed) muertas.push(job.carpetaInsumoId);
    } catch {
      muertas.push(job.carpetaInsumoId); // 404: la carpeta ya no está
    }
  }
  return muertas.length ? jobStore.marcarInsumosLimpiados(muertas) : 0;
}

async function limpiar() {
  const raiz = process.env.GOOGLE_DRIVE_INSUMOS_FOLDER_ID;
  if (!raiz) {
    console.warn('⚠️ Limpieza de insumos omitida: falta GOOGLE_DRIVE_INSUMOS_FOLDER_ID');
    return { borradas: 0, fallidas: 0 };
  }
  if (!raizValida(raiz)) return { borradas: 0, fallidas: 0 };

  const corte = Date.now() - RETENCION_HORAS * HORA_MS;
  let borradas = 0;
  let fallidas = 0;
  const limpiadas = [];

  try {
    // Nivel 1: carpetas de canal. Nivel 2: carpetas de job (lo que se borra).
    const canales = await drive.listarSubcarpetas(raiz);
    for (const canal of canales) {
      const jobs = await drive.listarSubcarpetas(canal.id);
      for (const job of jobs) {
        if (new Date(job.createdTime).getTime() >= corte) continue;
        try {
          await drive.enviarAPapelera(job.id);
          limpiadas.push(job.id);
          borradas++;
        } catch (e) {
          fallidas++;
          console.warn(`  ⚠️ No se pudo limpiar "${job.name}": ${e.message}`);
        }
      }
    }

    // El historial deja de ofrecer el link a una carpeta que ya no existe.
    if (limpiadas.length) jobStore.marcarInsumosLimpiados(limpiadas);
    const marcados = await reconciliar();

    if (borradas || fallidas) {
      console.log(`🧹 Insumos: ${borradas} carpetas a la papelera (más de ${RETENCION_HORAS}h)${fallidas ? `, ${fallidas} fallidas` : ''}`);
    } else {
      console.log(`🧹 Insumos: nada que limpiar (retención ${RETENCION_HORAS}h)`);
    }
    if (marcados) console.log(`   ${marcados} jobs marcados con insumos ya inexistentes`);
  } catch (e) {
    console.error(`❌ Limpieza de insumos falló: ${e.message}`);
  }

  return { borradas, fallidas };
}

// La primera pasada espera un minuto a propósito: al arrancar, driveCache.restaurar()
// está trayendo jobs.json desde Drive (fire-and-forget) y solo restaura si el archivo
// local no existe o está vacío. Si limpiáramos de inmediato, las marcas de
// insumosLimpiados se escribirían sobre un jobs.json vacío y la restauración las pisaría.
const DEMORA_PRIMERA = 60 * 1000;

function start() {
  console.log(`🔄 Limpieza de insumos activa: cada ${INTERVALO_HORAS}h, retención ${RETENCION_HORAS}h`);
  setTimeout(limpiar, DEMORA_PRIMERA);
  setInterval(limpiar, INTERVALO_HORAS * HORA_MS);
}

module.exports = { start, limpiar, RETENCION_HORAS };
