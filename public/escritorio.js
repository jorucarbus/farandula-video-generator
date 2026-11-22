// Pestañas de la versión de escritorio. Cada pestaña "Crear" es un marco con la aplicación entera y su
// propio proceso; los marcos son de la misma página, así que comparten la API Key y el servidor, y la
// cola de renders sigue siendo una sola (los videos se procesan de a uno, en el orden en que se mandan).
//
// Las pestañas abiertas se recuerdan (con el proceso de cada una) para que cerrar y volver a abrir la
// aplicación devuelva todo como estaba.

const CLAVE = 'escritorio_pestanas_v1';
const pestanas = [];          // [{ id, marco, boton, jobId }]
let activa = null;            // id de la pestaña visible, o 'publicar'
let siguienteId = 1;

const contPestanas = document.getElementById('pestanas');
const contMarcos = document.getElementById('marcos');

function crearMarco(src, nombre) {
    const marco = document.createElement('iframe');
    marco.src = src;
    marco.name = nombre;
    marco.setAttribute('allow', 'clipboard-read; clipboard-write; autoplay');
    contMarcos.appendChild(marco);
    return marco;
}

function nuevaPestana(jobId = null, { activarla = true } = {}) {
    const id = siguienteId++;
    const src = `/?marco=${id}` + (jobId ? `&jobId=${encodeURIComponent(jobId)}` : '');
    const marco = crearMarco(src, `crear-${id}`);

    const boton = document.createElement('div');
    boton.className = 'pestana';
    boton.title = 'Clic para ver este video';
    boton.innerHTML = '<span class="punto"></span><span class="nombre">Nuevo video</span><button class="cerrar" type="button" title="Cerrar esta pestaña">✕</button>';
    boton.addEventListener('click', e => { if (!e.target.classList.contains('cerrar')) activar(id); });
    boton.querySelector('.cerrar').addEventListener('click', () => cerrarPestana(id));
    boton.addEventListener('auxclick', e => { if (e.button === 1) cerrarPestana(id); });   // clic con la rueda
    contPestanas.appendChild(boton);

    pestanas.push({ id, marco, boton, jobId });
    if (activarla) activar(id);
    guardar();
    return id;
}

function activar(id) {
    activa = id;
    for (const p of pestanas) {
        p.marco.classList.toggle('activo', p.id === id);
        p.boton.classList.toggle('activa', p.id === id);
    }
    publicar.marco.classList.toggle('activo', id === 'publicar');
    publicar.boton.classList.toggle('activa', id === 'publicar');
    // Publicar se refresca al entrar: lo que se terminó en las otras pestañas tiene que aparecer.
    if (id === 'publicar') { try { publicar.marco.contentWindow.cargarPublicar?.(); } catch {} }
    guardar();
}

function cerrarPestana(id) {
    const i = pestanas.findIndex(p => p.id === id);
    if (i < 0) return;
    const p = pestanas[i];
    const w = p.marco.contentWindow;
    let enCurso = false;
    try { enCurso = Boolean(w.__farandula?.state?.jobId) && !w.__farandula?.state?.aprobado?.video; } catch {}
    if (enCurso && !confirm('¿Cerrar esta pestaña? El proceso queda guardado en el historial y lo puedes retomar desde ahí. Un video que ya mandaste a generar sigue en la cola.')) return;
    p.marco.remove();
    p.boton.remove();
    pestanas.splice(i, 1);
    if (!pestanas.length) nuevaPestana();
    else if (activa === id) activar(pestanas[Math.max(0, i - 1)].id);
    guardar();
}

// Nombre de cada pestaña (la noticia que tiene abierta) y su proceso, leídos de su propio marco.
function refrescarNombres() {
    for (const p of pestanas) {
        try {
            const w = p.marco.contentWindow;
            const st = w.__farandula?.state;
            if (!st) continue;
            const nombre = st.sourceData?.titulo || st.sourceData?.nombreCorto || (st.jobId ? 'Proceso sin título' : 'Nuevo video');
            const span = p.boton.querySelector('.nombre');
            if (span.textContent !== nombre) span.textContent = nombre;
            p.boton.title = nombre;
            const trabajando = Boolean(w.document.querySelector('#progress-section:not(.hidden)'));
            p.boton.querySelector('.punto').dataset.estado = trabajando ? 'trabajando' : (st.jobId ? 'listo' : '');
            if (st.jobId && st.jobId !== p.jobId) { p.jobId = st.jobId; guardar(); }
        } catch {}
    }
    try {
        const n = publicar.marco.contentWindow.document.getElementById('publicar-contador');
        document.getElementById('publicar-n').textContent = n && !n.classList.contains('hidden') ? `(${n.textContent})` : '';
    } catch {}
}

function guardar() {
    try {
        localStorage.setItem(CLAVE, JSON.stringify({
            pestanas: pestanas.map(p => ({ jobId: p.jobId || null })),
            activa: activa === 'publicar' ? 'publicar' : pestanas.findIndex(p => p.id === activa),
        }));
    } catch {}
}

// Un marco pide abrir un proceso del historial: va a una pestaña nueva de esta misma ventana (o a la
// que ya lo tenga abierto), en vez de abrir otra ventana del navegador.
window.addEventListener('message', e => {
    if (e.origin !== location.origin) return;
    const jobId = e.data?.abrirProceso;
    if (!jobId) return;
    const ya = pestanas.find(p => p.jobId === jobId);
    if (ya) activar(ya.id); else nuevaPestana(jobId);
});

// Atajos: Ctrl+T abre otro video, Ctrl+W cierra la pestaña actual.
function atajos(e) {
    if (!e.ctrlKey) return;
    const k = e.key.toLowerCase();
    if (k === 't') { e.preventDefault(); nuevaPestana(); }
    if (k === 'w' && activa !== 'publicar') { e.preventDefault(); cerrarPestana(activa); }
}
window.addEventListener('keydown', atajos);

// ---- arranque ----
const publicar = {
    marco: crearMarco('/?marco=publicar#publicar', 'publicar'),
    boton: document.getElementById('pestana-publicar'),
};
// Los atajos también tienen que funcionar con el foco dentro de un marco.
contMarcos.addEventListener('load', () => {}, true);
setInterval(() => {
    for (const m of contMarcos.querySelectorAll('iframe')) {
        try {
            const w = m.contentWindow;
            if (w && !w.__atajosEscritorio) { w.addEventListener('keydown', atajos); w.__atajosEscritorio = true; }
        } catch {}
    }
    refrescarNombres();
}, 1500);

let guardado = null;
try { guardado = JSON.parse(localStorage.getItem(CLAVE) || 'null'); } catch {}
if (guardado?.pestanas?.length) {
    for (const p of guardado.pestanas) nuevaPestana(p.jobId, { activarla: false });
    if (guardado.activa === 'publicar') activar('publicar');
    else activar(pestanas[Math.min(Math.max(0, guardado.activa | 0), pestanas.length - 1)].id);
} else {
    nuevaPestana();
}
