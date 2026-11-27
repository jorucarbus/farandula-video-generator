// NOMBRE DE ARCHIVO como lo hacía la app vieja: "<fecha> <Protagonista> - <Secundario> - <hecho en 2-4 palabras>"
// ej.: "2026-09-13 Celeste Moran - Kike Jav Cuy - anuncia su salida definitiva". SOLO es el nombre que ve la persona (Drive, descargas): las carpetas internas siguen con su id estable.
// Sin llamadas extra: la crónica que ya se pide al leer la noticia trae "protagonista", "secundario" y "accion".
const prohibidos = /[\\/:*?"<>|\u0000-\u001f]/g;
const limpia = t => String(t || '').replace(/#\S+/g, '').replace(/[\u{1F000}-\u{1FFFF}\u{2600}-\u{27BF}]/gu, '').replace(prohibidos, '').replace(/\s+/g, ' ').trim();
const humanizar = c => String(c || '').replace(/_/g, ' ').replace(/\s+/g, ' ').trim();
const recortarPalabras = (t, n) => limpia(t).split(' ').filter(Boolean).slice(0, n).join(' ');

const norm = t => String(t || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9ñ ]+/g, ' ').replace(/\s+/g, ' ').trim();
const titulo = t => humanizar(t).split(' ').map(w => (w ? w[0].toUpperCase() + w.slice(1) : w)).join(' ');
const mismaPersona = (a, b) => { const x = norm(a).split(' ').filter(Boolean), y = norm(b).split(' ').filter(Boolean); return x.length && y.length && (x.every(t => y.includes(t)) || y.every(t => x.includes(t))); };

// cronica: { protagonista, secundario, accion, titulo }; carpeta: la del artista del video. El PRINCIPAL es el artista de la carpeta (de quién es el video); si la crónica lo escribe
// con tildes, se usa esa escritura. Después va la otra persona principal de la noticia y el hecho en pocas palabras. → "Protagonista - Otra persona - hecho"
function desdeCronica(cronica = {}, { carpeta = '' } = {}) {
  const cand = [limpia(cronica.protagonista), limpia(cronica.secundario)].filter(Boolean);
  const prot = carpeta ? (cand.find(c => mismaPersona(c, humanizar(carpeta))) || titulo(carpeta)) : (cand[0] || '');
  const otro = cand.find(c => !mismaPersona(c, prot)) || '', hecho = recortarPalabras(cronica.accion || cronica.titulo, 5);
  return ([prot, otro, hecho].filter(Boolean).join(' - ') || 'Video farandula').slice(0, 90).trim();
}

// fecha: AAAA-MM-DD del día en que se hizo el video (sale del id "gestor-AAAA-MM-DD-xxxx"; si no, hoy)
const fechaDe = (id, hoy = new Date()) => { const m = String(id || '').match(/(\d{4}-\d{2}-\d{2})/); return m ? m[1] : hoy.toISOString().slice(0, 10); };
const nombreCompleto = (id, cronica, opciones) => `${fechaDe(id)} ${desdeCronica(cronica, opciones)}`;

module.exports = { desdeCronica, fechaDe, nombreCompleto, limpia, humanizar };
