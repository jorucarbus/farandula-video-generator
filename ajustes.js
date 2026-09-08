// Ajustes del sistema que el usuario prende y apaga, y que valen para TODAS las ventanas.
//
// Viven en el servidor y no en el navegador a propósito: el usuario trabaja varias noticias en
// pestañas distintas y a veces desde otra máquina. Un interruptor guardado en el navegador estaría
// prendido en una ventana y apagado en la otra, y los videos saldrían distintos sin que nada lo
// explique.
//
// Mismo patrón de durabilidad que `jobs.json` e `historial.json` (Bloque D): se escribe al disco y
// se respalda en Drive, porque el disco de Railway es efímero. Sin eso, cada redeploy volvería el
// interruptor a su valor de fábrica en silencio.
const fs = require('fs');
const path = require('path');
const driveCache = require('./driveCache');

const DATA_DIR = path.join(__dirname, 'data');
const AJUSTES_FILE = path.join(DATA_DIR, 'ajustes.json');
const NOMBRE_DRIVE = 'ajustes.json';

// Los valores de fábrica. `videosCortos` arranca ENCENDIDO: es lo que el usuario pidió para hoy
// ("que esté todo el tiempo prendido"), y se apaga el día que La Naple y Supe Lupe moneticen.
const POR_DEFECTO = {
  videosCortos: true,
};

let cache = null;

function cargar() {
  if (cache) return cache;
  try {
    if (fs.existsSync(AJUSTES_FILE)) {
      const guardados = JSON.parse(fs.readFileSync(AJUSTES_FILE, 'utf8'));
      // Se mezcla contra los valores de fábrica: un ajuste nuevo que el archivo viejo no conoce
      // toma su default en vez de quedar `undefined`.
      cache = { ...POR_DEFECTO, ...(guardados && typeof guardados === 'object' ? guardados : {}) };
      return cache;
    }
  } catch (e) {
    console.warn(`⚠️ No se pudieron leer los ajustes (${e.message}); se usan los de fábrica`);
  }
  cache = { ...POR_DEFECTO };
  return cache;
}

function obtener() {
  return { ...cargar() };
}

// Solo se aceptan las claves que existen en POR_DEFECTO y solo con el tipo que corresponde: lo que
// llega del navegador no puede inventar ajustes ni cambiarles la forma.
function guardar(cambios) {
  const actual = cargar();
  const nuevo = { ...actual };
  for (const [k, v] of Object.entries(cambios || {})) {
    if (!(k in POR_DEFECTO)) continue;
    if (typeof v !== typeof POR_DEFECTO[k]) continue;
    nuevo[k] = v;
  }
  cache = nuevo;
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(AJUSTES_FILE, JSON.stringify(nuevo, null, 2));
    driveCache.respaldar(AJUSTES_FILE, NOMBRE_DRIVE);
  } catch (e) {
    console.warn(`⚠️ No se pudieron guardar los ajustes: ${e.message}`);
  }
  return { ...nuevo };
}

// Se llama una vez al arrancar, junto con las demás restauraciones.
async function restaurar() {
  try {
    await driveCache.restaurar(AJUSTES_FILE, NOMBRE_DRIVE);
  } catch (e) {
    console.warn(`⚠️ No se pudieron restaurar los ajustes desde Drive: ${e.message}`);
  }
  cache = null;   // que la próxima lectura tome lo que acaba de bajar
}

module.exports = { obtener, guardar, restaurar, POR_DEFECTO, AJUSTES_FILE, NOMBRE_DRIVE };
