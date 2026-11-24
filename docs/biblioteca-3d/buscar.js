#!/usr/bin/env node
// Consulta el catálogo de la biblioteca 3D (catalogo.json). Sin dependencias.
// Uso:
//   node docs/biblioteca-3d/buscar.js <texto>            busca en nombre, categoría, que_es, para_que_nos_sirve y matrices
//   node docs/biblioteca-3d/buscar.js --accion <nombre>  fila de matriz_acciones con items expandidos
//   node docs/biblioteca-3d/buscar.js --escena <nombre>  fila de matriz_escenas_props con items expandidos
//   node docs/biblioteca-3d/buscar.js --prioridad alta   items por prioridad (alta|media|baja|evitar)
//   node docs/biblioteca-3d/buscar.js --pendientes       pendientes de verificar, en orden de importancia
//   node docs/biblioteca-3d/buscar.js --id <id>          ficha completa de un item
// Salida por item: id | nombre | prioridad | licencia_estado | acción

const fs = require("fs");
const path = require("path");

const cat = JSON.parse(fs.readFileSync(path.join(__dirname, "catalogo.json"), "utf8"));
const byId = Object.fromEntries(cat.items.map((i) => [i.id, i]));

const norm = (s) => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
const linea = (it) => [it.id, it.nombre, it.prioridad, it.licencia_estado, it.accion_recomendada].join(" | ");

function buscarClave(matriz, q) {
  const nq = norm(q);
  const claves = Object.keys(matriz);
  const exactas = claves.filter((k) => norm(k) === nq);
  return exactas.length ? exactas : claves.filter((k) => norm(k).includes(nq));
}

function mostrarMatriz(matriz, q, etiqueta) {
  if (!q) { console.error(`Falta el nombre de ${etiqueta}. Opciones:\n  ` + Object.keys(matriz).join("\n  ")); process.exit(2); }
  const ks = buscarClave(matriz, q);
  if (!ks.length) { console.log(`Sin coincidencias de ${etiqueta} para "${q}". Opciones:\n  ` + Object.keys(matriz).join("\n  ")); return; }
  for (const k of ks) {
    console.log(`# ${k}`);
    if (!matriz[k].length) console.log("  (sin cobertura libre: ver sin_cobertura en catalogo.json / catalogo.md)");
    matriz[k].forEach((e, i) => {
      const it = byId[e.item_id];
      console.log(`  ${i + 1}. ${linea(it)}`);
      if (e.nota) console.log(`     nota: ${e.nota}`);
    });
  }
}

const args = process.argv.slice(2);
if (!args.length || args[0] === "-h" || args[0] === "--help") {
  console.log(fs.readFileSync(__filename, "utf8").split("\n").slice(1, 11).map((l) => l.replace(/^\/\/ ?/, "")).join("\n"));
  process.exit(args.length ? 0 : 2);
}

if (args[0] === "--accion") mostrarMatriz(cat.matriz_acciones, args.slice(1).join(" "), "acción");
else if (args[0] === "--escena") mostrarMatriz(cat.matriz_escenas_props, args.slice(1).join(" "), "escena/prop");
else if (args[0] === "--prioridad") {
  const p = norm(args[1]);
  const r = cat.items.filter((i) => norm(i.prioridad) === p);
  if (!r.length) console.log("Sin items con prioridad: " + (args[1] || "(vacío)") + ". Valores: alta | media | baja | evitar");
  r.forEach((i) => console.log(linea(i)));
  console.log(`-- ${r.length} items`);
} else if (args[0] === "--pendientes") {
  cat.pendientes_verificar.forEach((p) => {
    const it = byId[p.item_id];
    console.log(`${p.orden}. [${p.importancia}] ${it.id} | ${it.nombre} | ${it.licencia_estado} | ${it.accion_recomendada}`);
    console.log(`     comprobar: ${p.que_comprobar}`);
  });
  console.log(`-- ${cat.pendientes_verificar.length} pendientes`);
} else if (args[0] === "--id") {
  const it = byId[args[1]];
  if (!it) { console.log("id no encontrado: " + args[1]); process.exit(1); }
  console.log(JSON.stringify(it, null, 2));
} else {
  const q = norm(args.join(" "));
  const ids = new Set();
  for (const it of cat.items) {
    if ([it.nombre, it.categoria, it.que_es, it.para_que_nos_sirve].some((c) => norm(c).includes(q))) ids.add(it.id);
  }
  const viaMatriz = [];
  for (const [nombreM, m] of [["accion", cat.matriz_acciones], ["escena", cat.matriz_escenas_props]]) {
    for (const [k, lista] of Object.entries(m)) {
      if (norm(k).includes(q) || lista.some((e) => norm(e.nota).includes(q))) {
        viaMatriz.push(`${nombreM}: ${k}`);
        lista.forEach((e) => ids.add(e.item_id));
      }
    }
  }
  const r = cat.items.filter((i) => ids.has(i.id));
  r.forEach((i) => console.log(linea(i)));
  console.log(`-- ${r.length} items` + (viaMatriz.length ? ` | matrices: ${viaMatriz.join("; ")}` : ""));
}
