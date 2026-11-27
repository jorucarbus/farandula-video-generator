// Calibra el puntaje ciego contra la realidad: califica los guiones transcritos de tus canales (éxitos vs contraste) y dice si el puntaje
// los distingue. AUC = probabilidad de que un éxito saque más puntaje que uno de contraste (0.5 = azar, 1 = perfecto).
// Si el AUC es cercano a 0.5, el puntaje NO predice vistas y no hay que usarlo para decidir nada. Se reporta tal cual.
// Uso: node scripts/probar-puntaje.js [--solo-codigo] [--propios]   (--propios: también califica los guiones de este motor)
require('dotenv').config({ quiet: true });
const fs = require('fs'), path = require('path');
const DM = path.join(__dirname, '..', 'data-motor'), DIR = path.join(DM, 'referencias-canales');
const P = require('../edl/puntajeGuion'), soloCodigo = process.argv.includes('--solo-codigo');
const esNarracion = x => x.texto && x.texto.split(/\s+/).length >= 90 && x.texto.split(/[.!?]+/).filter(s => s.trim()).length >= 6 && x.texto.split(/\s+/).length / x.texto.split(/[.!?]+/).filter(s => s.trim()).length < 45;

function auc(pos, neg) { let g = 0, e = 0; for (const a of pos) for (const b of neg) { if (a > b) g++; else if (a === b) e++; } return (g + e / 2) / (pos.length * neg.length); }
const media = a => a.reduce((s, x) => s + x, 0) / (a.length || 1);

(async () => {
  const todos = fs.readdirSync(DIR).filter(f => f.endsWith('.json')).flatMap(f => JSON.parse(fs.readFileSync(path.join(DIR, f), 'utf8')).map(x => ({ ...x, canal: f.replace('.json', '') }))).filter(esNarracion);
  console.log(`${todos.length} guiones con narración (éxitos ${todos.filter(x => x.grupo === 'exito').length}, contraste ${todos.filter(x => x.grupo === 'contraste').length})\n`);
  for (const x of todos) {
    x.p = soloCodigo ? P.combinar(null, x.texto) : await P.puntuar(x.texto);
    await new Promise(r => setTimeout(r, 300));
  }
  const por = g => todos.filter(x => x.grupo === g && x.p.total !== null);
  const claves = ['total', 'gancho', 'concrecion', 'escalada', 'cierre', 'ritmo', 'plantillas'], ex = por('exito'), co = por('contraste');
  console.log('criterio       éxitos  contraste   AUC');
  for (const k of claves) {
    const v = x => (k === 'total' ? x.p.total : x.p.criterios[k]), a = ex.map(v).filter(n => n !== null), b = co.map(v).filter(n => n !== null);
    if (a.length && b.length) console.log(`${k.padEnd(13)} ${media(a).toFixed(2).padStart(7)} ${media(b).toFixed(2).padStart(10)}   ${auc(a, b).toFixed(2)}`);
  }
  // por canal (descarta el efecto de "qué canal es"): AUC dentro de cada canal
  console.log('\nAUC del total dentro de cada canal:');
  for (const c of [...new Set(todos.map(x => x.canal))]) { const a = ex.filter(x => x.canal === c).map(x => x.p.total), b = co.filter(x => x.canal === c).map(x => x.p.total); if (a.length >= 2 && b.length >= 2) console.log(`  ${c.padEnd(24)} n=${a.length}+${b.length}  AUC ${auc(a, b).toFixed(2)}`); }
  fs.writeFileSync(path.join(DM, 'puntaje-calibracion.json'), JSON.stringify(todos.map(x => ({ id: x.id, canal: x.canal, grupo: x.grupo, vistas: x.vistas, total: x.p.total, criterios: x.p.criterios, plantillas: x.p.plantillasDetectadas })), null, 1));

  if (process.argv.includes('--propios')) {
    const nd = path.join(DM, 'noticias'), propios = fs.readdirSync(nd).map(n => { try { return { n, g: JSON.parse(fs.readFileSync(path.join(nd, n, 'guion.json'), 'utf8')) }; } catch { return null; } }).filter(x => x && x.g.script && x.g.script.split(/\s+/).length >= 90);
    const ps = []; for (const x of propios) { const p = soloCodigo ? P.combinar(null, x.g.script) : await P.puntuar(x.g.script); ps.push(p.total); }
    console.log(`\nGuiones de ESTE motor (${propios.length}): promedio ${media(ps.filter(n => n !== null)).toFixed(2)} | éxitos tuyos ${media(ex.map(x => x.p.total)).toFixed(2)} | contraste ${media(co.map(x => x.p.total)).toFixed(2)}`);
  }
})().catch(e => { console.error('FALLO', e.message); process.exit(1); });
