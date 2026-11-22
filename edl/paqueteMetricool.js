// Paquete de salida para Metricool: CSV de programación masiva a partir de publicaciones aprobadas.
// Los encabezados exactos de la plantilla oficial NO están verificados (nota 22): por eso el exportador
// lee los de la plantilla que el usuario baja UNA vez (Calendario > Importar CSV > plantilla) y mapea por
// nombre; lo que no reconoce lo deja vacío y lo avisa. Sin plantilla usa columnas por defecto.
// UTF-8 con BOM, máx. 50 filas por archivo, Draft=TRUE por defecto (se revisa en el calendario).

const MAX_FILAS = 50;
const ENCABEZADOS_DEFECTO = ['Text', 'Date', 'Time', 'Draft', 'Video URL', 'Instagram', 'TikTok', 'YouTube', 'Facebook'];

const norm = s => String(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim();

// Qué campo de la publicación llena cada encabezado (por palabras clave del nombre).
function campoDe(encabezado) {
  const h = norm(encabezado);
  if (/^(text|texto|caption|descripcion|description|copy|post)\b/.test(h)) return 'texto';
  if (/^(date|fecha)\b/.test(h) || /publication date/.test(h)) return 'fecha';
  if (/^(time|hora)\b/.test(h)) return 'hora';
  if (/draft|borrador/.test(h)) return 'draft';
  if (/(video|media|picture|image|imagen).*(url|link|enlace)|^(url|link)\b/.test(h)) return 'video';
  if (/^title\b|titulo/.test(h)) return 'titulo';
  for (const red of ['instagram', 'tiktok', 'youtube', 'facebook', 'twitter', 'linkedin']) if (h.startsWith(red)) return `red:${red}`;
  return null;
}

const csvCelda = v => {
  const s = v == null ? '' : String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

function validarPublicacion(p, i) {
  const errores = [];
  if (!p || !String(p.texto || '').trim()) errores.push('sin texto');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(p?.fecha || '')) errores.push('fecha debe ser AAAA-MM-DD');
  if (!/^\d{2}:\d{2}(:\d{2})?$/.test(p?.hora || '')) errores.push('hora debe ser HH:MM[:SS]');
  if (!/^https?:\/\//.test(p?.videoUrl || '')) errores.push('videoUrl debe ser un enlace http(s) estable');
  if (!Array.isArray(p?.redes) || !p.redes.length) errores.push('sin redes');
  return errores.map(e => `publicación ${i + 1}: ${e}`);
}

// publicaciones: [{ texto, fecha, hora, videoUrl, redes:['instagram','tiktok'], titulo? }]
// opciones: { plantillaCsv?: string (contenido), draft?: boolean }
// -> { archivos: [{ nombre, contenido }], avisos: [] }  (lanza si hay publicaciones inválidas)
function construirCsv(publicaciones, { plantillaCsv, draft = true, prefijo = 'metricool' } = {}) {
  const errores = publicaciones.flatMap(validarPublicacion);
  if (errores.length) throw new Error(errores.join('; '));
  const avisos = [];
  let encabezados = ENCABEZADOS_DEFECTO;
  if (plantillaCsv) {
    const primera = plantillaCsv.replace(/^﻿/, '').split(/\r?\n/)[0];
    encabezados = primera.split(/[,;]/).map(c => c.replace(/^"|"$/g, '').trim()).filter(Boolean);
    const sinMapa = encabezados.filter(h => !campoDe(h));
    if (sinMapa.length) avisos.push(`columnas de la plantilla sin llenar: ${sinMapa.join(', ')}`);
    if (!encabezados.some(h => campoDe(h) === 'texto')) avisos.push('la plantilla no tiene columna de texto reconocible');
  } else avisos.push('sin plantilla oficial: se usaron columnas por defecto (verifica con la plantilla de Metricool)');

  const fila = p => encabezados.map(h => {
    const c = campoDe(h);
    if (c === 'texto') return p.texto;
    if (c === 'fecha') return p.fecha;
    if (c === 'hora') return p.hora.length === 5 ? `${p.hora}:00` : p.hora;
    if (c === 'draft') return draft ? 'TRUE' : 'FALSE';
    if (c === 'video') return p.videoUrl;
    if (c === 'titulo') return p.titulo || '';
    if (c && c.startsWith('red:')) return p.redes.map(norm).includes(c.slice(4)) ? 'TRUE' : 'FALSE';
    return '';
  });

  const archivos = [];
  for (let i = 0; i < publicaciones.length; i += MAX_FILAS) {
    const lote = publicaciones.slice(i, i + MAX_FILAS);
    const lineas = [encabezados, ...lote.map(fila)].map(f => f.map(csvCelda).join(','));
    archivos.push({ nombre: `${prefijo}_${String(archivos.length + 1).padStart(2, '0')}.csv`, contenido: '﻿' + lineas.join('\r\n') + '\r\n' });
  }
  return { archivos, avisos };
}

module.exports = { construirCsv, campoDe, MAX_FILAS };
