// Config — backend por modo. Consolidado 2026-07-25: video e insumos son el MISMO server
// (antes insumos vivía en un servicio Railway aparte, farandula-insumos). Los endpoints de
// lectura/guion/fragmentación/audio ya eran genéricos (no les importa el formato final), así
// que FLUJO.insumos reusa los mismos nombres que FLUJO.video — solo cambia el paso final
// (generate-video compone 1 mp4, exportar corta fragmentos numerados + locución).
const BACKENDS = {
    video: window.location.origin,
    insumos: window.location.origin,
};
const FLUJO = {
    video:   { asignar: '/fragment', asignarParam: 'script', parrafosKey: 'fragments', audioParam: 'fragments', destinos: '/folders', destinosKey: 'folders' },
    insumos: { asignar: '/fragment', asignarParam: 'script', parrafosKey: 'fragments', audioParam: 'fragments', destinos: '/canales', destinosKey: 'canales' },
};
let MODO = 'video';
function apiBase() { return BACKENDS[MODO]; }
function cfg() { return FLUJO[MODO]; }

// Helper: deshabilitar/habilitar botón mientras proceso está activo
function setButtonDisabled(buttonId, disabled) {
    const btn = document.getElementById(buttonId);
    if (btn) btn.disabled = disabled; // .btn:disabled ya baja la opacidad por CSS
}

// Tipos de transición tildados en el Paso 6 (Fase 7) — el server elige al azar SOLO entre
// estos en cada corte; 1 solo tildado = siempre esa; ninguno tildado = las 16 (video.js cae
// solo a 'aleatorio' con el catálogo completo si el array llega vacío).
function tiposTransicionElegidos() {
    return [...document.querySelectorAll('#transicion-tipos-checks input[type="checkbox"]:checked')].map(c => c.value);
}

// Bloque C: rehacer un paso ya completado (editar y reenviar) invalida todo lo posterior.
// Se llama al INICIO de cada función que muta el pipeline, antes de la llamada a la API.
const STEP_ORDER = ['fuente-section', 'script-section', 'guion-section', 'revision-section', 'audio-section', 'destination-section'];
// Claves de "ya atendido por variante" que cada paso invalida al rehacerse. Sin esto, rehacer el
// guion dejaría la variante B marcada como lista con datos de un guion que ya no existe.
const CLAVES_POR_PASO = {
    'guion-section': ['guion', 'asignaciones', 'audio'],
    'revision-section': ['asignaciones', 'audio'],
    'audio-section': ['audio'],
};

function lockFrom(stepId) {
    const idx = STEP_ORDER.indexOf(stepId);
    if (idx === -1) return;
    if (typeof invalidarVariantes === 'function' && CLAVES_POR_PASO[stepId]) {
        invalidarVariantes(CLAVES_POR_PASO[stepId]);
    }
    for (let i = idx; i < STEP_ORDER.length; i++) {
        setStepStatus(STEP_ORDER[i], 'locked');
        if (STEP_ORDER[i] === 'guion-section') resetProductoSlot('producto-guion');
        if (STEP_ORDER[i] === 'audio-section') resetProductoSlot('producto-audio');
        if (STEP_ORDER[i] === 'destination-section') resetProductoSlot('producto-final');
    }
    document.getElementById('result-section').classList.add('hidden');
}

// Cambiar de modo: resetea el flujo (los pasos difieren entre modos)
function setModo(modo) {
    if (modo === MODO) return;
    MODO = modo;
    document.getElementById('modo-selector').dataset.modo = modo;
    document.getElementById('producto-final-label').textContent = modo === 'video' ? 'Video' : 'Insumos';
    // Transiciones son un efecto ENTRE clips — no aplica a Insumos (clips sueltos para editar
    // a mano, cada uno con sus propios efectos quemados pero sin mezcla con el vecino).
    const esInsumos = modo === 'insumos';
    ['transicion-group', 'transicion-tipo-group', 'transicion-dur-group'].forEach(id => {
        document.getElementById(id)?.classList.toggle('hidden', esInsumos);
    });
    // Volver al inicio (paso 1) con estado limpio
    state = { jobId: null, sourceData: null, selectedAngle: null, selectedDestFolder: null, cronista: null, guion: null, fragments: null, carpetas: [], audioToken: null, fuentes: [], sesgo: 'neutral', avisoReconstruccion: null, materialesAdicionales: [], materialesPendientes: [], gemelos: false, varianteActiva: 'A', B: null, aprobado: {}, carpetasDestino: [] };
    renderFuentesLista();
    renderMaterialesLista();
    sessionStorage.removeItem('farandula_job_id');

    document.getElementById('lectura-section').classList.add('hidden');
    hideProgress();
    lockFrom('script-section');
    setStepStatus('fuente-section', 'active');

    log(`🔀 Modo: ${modo === 'video' ? 'Video final' : 'Insumos para editar'}`);
}

let API_KEY = null;

// API Key vía banner en la página (prompt() no funciona en algunos navegadores embebidos)
function initApiKey() {
  API_KEY = localStorage.getItem('api_key') || null;
  const banner = document.getElementById('apikey-banner');
  if (banner && !API_KEY) banner.classList.remove('hidden');
}

function guardarApiKey() {
  const input = document.getElementById('apikey-input');
  const key = (input.value || '').trim();
  if (!key) { alert('Ingresa la API Key'); return; }
  API_KEY = key;
  localStorage.setItem('api_key', key);
  document.getElementById('apikey-banner').classList.add('hidden');
  iniciarSesion();
}

// Punto único de arranque tras tener API_KEY: si la URL trae ?jobId= (click desde el
// historial en otra pestaña) carga ese proceso directo; si no, revisa si esta MISMA
// pestaña dejó algo a medias (sessionStorage, no localStorage: cada pestaña es independiente).
async function iniciarSesion() {
    await cargarCanales(); // primero: cargarHistorial usa canalesMap para mostrar el nombre del canal
    cargarHistorial();
    const cargadoPorURL = await cargarDesdeURL();
    if (!cargadoPorURL) chequearJobPendiente();
}

function pedirApiKeyDeNuevo() {
  localStorage.removeItem('api_key');
  API_KEY = null;
  const banner = document.getElementById('apikey-banner');
  if (banner) {
    banner.classList.remove('hidden');
    document.getElementById('apikey-input').value = '';
    document.getElementById('apikey-input').focus();
  }
}

let state = {
    jobId: null,    // id de persistencia (server guarda el progreso por etapa)
    sourceData: null,
    selectedAngle: null,
    selectedDestFolder: null,
    cronista: null,
    guion: null,
    fragments: null,
    carpetas: [],
    audioToken: null,
    fuentes: [],    // [{type, content, tipoReal, fuenteResumen}, ...] — hasta 3 por noticia (Fase 4)
    sesgo: 'neutral',
    avisoReconstruccion: null, // los fragmentos no reconstruyeron el guion (tiempos corridos)
    previewToken: null, // token del preview del último video renderizado, para /api/portada
    materialesAdicionales: [], // [{id, tipo, tieneVideo, descripcion, citas}, ...] — espejo de job.materialesAdicionales
    materialesPendientes: [], // [{tipo, file, descripcion}, ...] — archivos elegidos ANTES de tener jobId
    // Videos gemelos (ver el bloque de abajo). Apagado por defecto: con `gemelos: false` nada de
    // esto se ejecuta y el flujo es exactamente el de siempre.
    gemelos: false,
    varianteActiva: 'A',
    B: null,              // datos del segundo video; se crea al activar el modo
    aprobado: {},         // qué pasos ya se atendieron para el video A
    carpetasDestino: [],  // catálogo de /api/folders, para nombrar las pestañas y buscar la gemela
};
const MAX_FUENTES = 6;

// =================================================================================================
// VIDEOS GEMELOS + COLA DE RENDERIZADO
//
// Gemelos: una misma noticia produce DOS videos, uno para cada canal hermano. Comparten fuentes,
// crónica y material adicional; se diferencian en guion, título/descripción, cita, cartel, tomas
// y música.
//
// Cómo está montado en la UI, y por qué así: NO se duplica el DOM. Los pasos 3 a 6 tienen una
// pestaña A/B que cambia qué variante se está viendo, y los MISMOS controles de siempre se
// repintan con los datos de esa variante. Duplicar el HTML habría significado dos editores de
// guion, dos listas de asignación, dos reproductores y dos canvas de cartel — el doble de
// superficie para que algo se desincronice, que es exactamente el bug que ya costó una semana con
// la geometría del cartel.
//
// Dónde viven los datos: el video A se queda en los campos de SIEMPRE de `state` (`guion`,
// `fragments`, `audioToken`, …) y el B cuelga de `state.B`. Misma asimetría que en el servidor
// (`job.gemela`), y por la misma razón: con el modo apagado no cambia absolutamente nada del
// flujo que ya funcionaba.
// =================================================================================================

function nuevaVarianteB() {
    return {
        guion: null, fragments: null, audioToken: null, duracion: null,
        metadatos: null, selectedDestFolder: null, titularCartel: null,
        carpetas: [], avisoReconstruccion: null,
        aprobado: {},   // { guion, asignaciones, audio }
        renderId: null, resultado: null,
    };
}

// Los datos de una variante. `V()` sin argumento = la que se está viendo.
// La estructura del video B se crea acá al primer uso, aunque el modo gemelos esté apagado: crearla
// no activa nada, y evita toda una familia de errores por `state.B === null` (encontrada probando
// la regresión con gemelos apagado, donde `actualizarTabs` igual recorre las dos pestañas).
function V(v) {
    if ((v || state.varianteActiva) !== 'B') return state;
    if (!state.B) state.B = nuevaVarianteB();
    return state.B;
}
function otraVariante(v) {
    return (v || state.varianteActiva) === 'A' ? 'B' : 'A';
}
// Título y descripción del post. El A los saca de la lectura; el B tiene los suyos, generados por
// `gemini.variarMetadatos` para que los dos canales no publiquen el mismo texto.
function metaVariante(v) {
    const q = v || state.varianteActiva;
    if (q === 'B' && state.B?.metadatos) {
        return { ...(state.sourceData || {}), ...state.B.metadatos };
    }
    return state.sourceData || {};
}

// Canales hermanos, por nombre normalizado. Único lugar donde vive el pareo: si el usuario
// renombra una carpeta en Drive y deja de calzar, el destino del segundo video simplemente se
// elige a mano — nunca se adivina ni se bloquea.
const GEMELAS = {
    chismexpicante: 'supelupe',
    supelupe: 'chismexpicante',
    embajadoresdelchisme: 'lanaple',
    lanaple: 'embajadoresdelchisme',
};
function normalizarCanal(nombre) {
    return (nombre || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]/g, '');
}
function buscarCarpetaGemela(nombreCarpeta, carpetas) {
    const objetivo = GEMELAS[normalizarCanal(nombreCarpeta)];
    if (!objetivo) return null;
    return (carpetas || []).find(f => normalizarCanal(f.name) === objetivo) || null;
}

function toggleGemelos(activo) {
    state.gemelos = Boolean(activo);
    if (!state.gemelos) state.varianteActiva = 'A';
    if (state.gemelos && !state.B) state.B = nuevaVarianteB();
    document.querySelectorAll('[data-tabs]').forEach(t => t.classList.toggle('hidden', !state.gemelos));
    actualizarTabs();
    log(state.gemelos
        ? '👯 Modo gemelos activado: se van a generar DOS videos, uno por canal hermano'
        : '🎬 Modo gemelos desactivado: un solo video');
}

// Nombre visible de cada pestaña: el canal destino si ya se eligió, si no "Video A"/"Video B".
function etiquetaVariante(v) {
    const dest = V(v).selectedDestFolder;
    const carpeta = (state.carpetasDestino || []).find(f => f.id === dest);
    return carpeta ? carpeta.name : `Video ${v}`;
}

function actualizarTabs() {
    document.querySelectorAll('[data-tabs]').forEach(cont => {
        cont.querySelectorAll('.variante-tab').forEach(btn => {
            const v = btn.dataset.var;
            btn.classList.toggle('activa', v === state.varianteActiva);
            btn.querySelector('.variante-nombre').textContent = etiquetaVariante(v);
            // El punto dice si esa variante ya tiene lo que ese paso pide, para no aprobar a ciegas
            const paso = cont.closest('.form-section')?.id;
            btn.querySelector('.variante-punto').dataset.estado = estadoVariantePaso(v, paso);
        });
    });
}

function estadoVariantePaso(v, paso) {
    const d = V(v);
    if (paso === 'guion-section') return d.aprobado?.guion ? 'listo' : (d.guion ? 'pendiente' : 'vacio');
    if (paso === 'revision-section') return d.aprobado?.asignaciones ? 'listo' : (d.fragments ? 'pendiente' : 'vacio');
    if (paso === 'audio-section') return d.aprobado?.audio ? 'listo' : (d.audioToken ? 'pendiente' : 'vacio');
    if (paso === 'destination-section') return d.selectedDestFolder ? 'listo' : 'pendiente';
    return 'vacio';
}

// Antes de cambiar de pestaña hay que rescatar lo que el usuario escribió en los controles
// compartidos: si no, editar el guion A y saltar a B perdería la edición sin aviso.
function volcarVista() {
    const d = V();
    const editor = document.getElementById('guion-editor');
    if (editor && editor.value.trim()) d.guion = editor.value;
    const titular = document.getElementById('portada-titular');
    if (titular) d.titularCartel = titular.value;
    const dest = document.getElementById('dest-folder');
    if (dest && dest.value) d.selectedDestFolder = dest.value;
}

// Y al entrar en una pestaña, los controles se repintan con SUS datos.
function pintarVista() {
    const d = V();

    const editor = document.getElementById('guion-editor');
    if (editor) { editor.value = d.guion || ''; actualizarStatsGuion(); }

    if (d.fragments) {
        renderAsignaciones(false, state.sourceData?.protagonista);
    } else {
        const lista = document.getElementById('lista-asignaciones');
        if (lista) lista.innerHTML = '<p class="hint">Todavía no se asignaron carpetas para esta versión.</p>';
    }

    const player = document.getElementById('audio-player');
    const info = document.getElementById('audio-info');
    if (player) {
        if (d.audioToken) {
            player.src = apiBase() + `/api/audio/${d.audioToken}?t=` + Date.now();
            player.load();
            if (info) info.textContent = `Duración: ${d.duracion || '?'}s | ${etiquetaVariante(state.varianteActiva)}`;
        } else {
            player.removeAttribute('src');
            if (info) info.textContent = 'Todavía no se generó la locución de esta versión.';
        }
    }

    const dest = document.getElementById('dest-folder');
    if (dest) dest.value = d.selectedDestFolder || '';

    const titular = document.getElementById('portada-titular');
    if (titular) {
        titular.value = d.titularCartel || tituloParaCartel(state.varianteActiva);
        d.titularCartel = titular.value;
        actualizarPortadaDiseno();
    }

    actualizarTabs();
}

function cambiarVariante(v) {
    if (v === state.varianteActiva) return;
    volcarVista();
    state.varianteActiva = v;
    pintarVista();
    log(`👯 Ahora estás editando: ${etiquetaVariante(v)}`);
}

// El cartel se rellena con el TÍTULO de la lectura (el titular viral), no con `nombreCorto`, que
// es la base del NOMBRE DE ARCHIVO — corto y seco, pensado para ordenar carpetas, no para leerse
// en pantalla. Pedido explícito del usuario. `nombreCorto` queda de respaldo por si no hay título.
function tituloParaCartel(v) {
    const meta = metaVariante(v);
    return (meta.titulo || meta.nombreCorto || '').slice(0, 90);
}

// Marca un paso como hecho para la variante activa. Devuelve true si YA se puede avanzar (o sea:
// no hay gemelos, o las dos variantes cumplieron). Si falta la otra, salta a su pestaña — así el
// usuario no puede aprobar el paso habiendo mirado solo la mitad.
function marcarPasoVariante(clave, mensajeFalta) {
    const d = V();
    d.aprobado = { ...(d.aprobado || {}), [clave]: true };
    actualizarTabs();
    if (!state.gemelos) return true;
    const otra = otraVariante();
    if (V(otra).aprobado?.[clave]) return true;
    cambiarVariante(otra);
    log(`⏳ ${mensajeFalta}`);
    return false;
}

// Al rehacer un paso hay que borrar lo aprobado de LAS DOS variantes de ese paso en adelante:
// si no, la B queda marcada como lista con datos de un guion que ya no existe.
function invalidarVariantes(claves) {
    for (const d of [state, state.B].filter(Boolean)) {
        if (!d.aprobado) continue;
        for (const c of claves) delete d.aprobado[c];
    }
    actualizarTabs();
}

// -------------------------------------------------------------------------------------------
// COLA DE RENDERIZADO
// -------------------------------------------------------------------------------------------

let colaTimer = null;

// Sondea un render hasta que termina. Reemplaza a la espera del pedido HTTP largo: ahora el
// servidor responde al instante con un id y el trabajo se hace en la cola, de a uno.
async function esperarRender(renderId, etiqueta) {
    let ultimoEstado = null;
    while (true) {
        const t = await apiCall(`/render/${renderId}`, 'GET');
        if (t.estado !== ultimoEstado) {
            ultimoEstado = t.estado;
            if (t.estado === 'en_cola') log(`⏳ ${etiqueta}: en cola, puesto ${t.posicion} de ${t.enEspera}`);
            if (t.estado === 'renderizando') log(`🎞️ ${etiqueta}: renderizando...`);
        }
        if (t.estado === 'en_cola') {
            showProgress(`${icon('listChecks')} ${etiqueta}: en cola (puesto ${t.posicion} de ${t.enEspera})`);
            updateProgress(55);
        } else if (t.estado === 'renderizando') {
            showProgress(`${icon('rocketLaunch')} ${etiqueta}: renderizando...`);
            updateProgress(80);
        }
        if (t.estado === 'listo') return t.resultado;
        if (t.estado === 'error') throw new Error(t.error || 'El render falló');
        await new Promise(r => setTimeout(r, 3000));
    }
}

// Arranca al cargar la página, no al generar: el usuario trabaja varias noticias en ventanas
// distintas y quiere ver desde el principio cuánto hay por delante. El panel aparece solo cuando
// hay algo que mostrar, así una ventana ociosa no arrastra una caja vacía.
function iniciarPanelCola() {
    if (colaTimer) return;
    const tick = async () => {
        try { pintarCola(await apiCall('/cola', 'GET')); } catch { /* la cola es informativa: si falla, se calla */ }
    };
    tick();
    colaTimer = setInterval(tick, 4000);
}

function pintarCola(datos) {
    const cont = document.getElementById('cola-lista');
    if (!cont) return;
    const filas = [];
    const fila = (t, clase) => `
        <div class="cola-item" data-estado="${t.estado}">
            <span class="cola-estado">${clase}</span>
            <span class="cola-nombre">${(t.etiqueta || 'Video')}${t.canal ? ` · ${t.canal}` : ''}</span>
            <span class="cola-detalle">${t.estado === 'en_cola' ? `puesto ${t.posicion}` : (t.error ? 'falló' : '')}</span>
        </div>`;
    if (datos.corriendo) filas.push(fila(datos.corriendo, '🎞️'));
    for (const t of datos.cola || []) filas.push(fila(t, '⏳'));
    for (const t of (datos.recientes || []).slice(-3).reverse()) filas.push(fila(t, t.estado === 'listo' ? '✅' : '❌'));
    cont.innerHTML = filas.join('');
    document.getElementById('cola-section')?.classList.toggle('hidden', filas.length === 0);
}


// Funciones auxiliares (Bloque B: todos los pasos visibles a la vez, sin wizard)

const STEP_BADGE = {
    locked: { icon: 'hourglass', texto: 'Pendiente' },
    active: { icon: 'lockOpen', texto: 'Activo' },
    done: { icon: 'checkCircle', texto: 'Listo' },
};

function actualizarStepBadge(el, status) {
    const badge = el.querySelector('.step-badge');
    if (!badge) return;
    const info = STEP_BADGE[status] || STEP_BADGE.locked;
    badge.innerHTML = `${icon(info.icon)} ${info.texto}`;
}

// Cambia el estado visual de una tarjeta de paso: locked (bloqueada) | active (en curso) | done (completa)
function setStepStatus(stepId, status) {
    const el = document.getElementById(stepId);
    if (!el) return;
    el.dataset.status = status;
    actualizarStepBadge(el, status);
    if (status === 'active') el.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
}

// Productos del job actual (columna derecha): opacos hasta que existan, se "encienden" al estar listos.
function setProductoSlot(id, status) {
    const el = document.getElementById(id);
    if (el) el.dataset.status = status;
}
function resetProductoSlot(id) {
    setProductoSlot(id, 'pendiente');
    const body = document.querySelector(`#${id} .producto-slot-body`);
    if (body) body.textContent = 'Aún no generado';
}
function renderProductoGuion(texto) {
    setProductoSlot('producto-guion', 'listo');
    const body = document.querySelector('#producto-guion .producto-slot-body');
    body.innerHTML = '';
    const p = document.createElement('p');
    p.className = 'pre-wrap';
    p.textContent = texto.length > 160 ? texto.slice(0, 160) + '…' : texto;
    body.appendChild(p);
}
function renderProductoAudio(src) {
    setProductoSlot('producto-audio', 'listo');
    const body = document.querySelector('#producto-audio .producto-slot-body');
    body.innerHTML = '';
    const audio = document.createElement('audio');
    audio.controls = true;
    audio.src = src;
    body.appendChild(audio);
}
function renderProductoFinal(resultado) {
    setProductoSlot('producto-final', 'listo');
    const body = document.querySelector('#producto-final .producto-slot-body');
    body.innerHTML = '';
    if (MODO === 'video' && resultado.previewUrl) {
        const video = document.createElement('video');
        video.controls = true;
        video.playsInline = true;
        video.className = 'thumb-video';
        video.src = resultado.previewUrl;
        body.appendChild(video);
    } else if (resultado.driveLink) {
        const a = document.createElement('a');
        a.href = resultado.driveLink;
        a.target = '_blank';
        a.innerHTML = `${icon('link')} Ver en Drive`;
        body.appendChild(a);
    } else {
        body.textContent = 'Listo';
    }
}

// Revela la tarjeta de resultado de lectura (queda visible el resto de la sesión, no se vuelve a ocultar)
function revealLectura() {
    document.getElementById('lectura-section').classList.remove('hidden');
}

// Barra de progreso flotante (ya no tapa el grid de pasos, como antes hacía showSection)
function showProgress(label) {
    ocultarError();
    document.getElementById('progress-title').innerHTML = label || 'Procesando...';
    document.getElementById('progress-section').classList.remove('hidden');
    updateProgress(0);
}

function hideProgress() {
    document.getElementById('progress-section').classList.add('hidden');
}

// Barra de error: reintentar el paso que falló (sin rehacer lo anterior) o volver atrás.
// reintentarFn: closure que repite SOLO el paso fallido (conserva guion/audio/párrafos ya generados).
// volverStepId: id de la tarjeta de paso a reactivar (o null si no aplica).
function mostrarError(mensaje, reintentarFn, volverStepId) {
    log(`❌ ${mensaje}`);
    document.getElementById('progress-section').classList.remove('hidden');
    const bar = document.getElementById('error-actions');
    if (!bar) return;
    const btnR = document.getElementById('btn-reintentar');
    const btnV = document.getElementById('btn-volver');
    btnR.onclick = () => { ocultarError(); reintentarFn(); };
    if (volverStepId) {
        btnV.classList.remove('hidden');
        btnV.onclick = () => {
            ocultarError();
            hideProgress();
            setStepStatus(volverStepId, 'active');
        };
    } else {
        btnV.classList.add('hidden');
    }
    bar.classList.remove('hidden');
}

function ocultarError() {
    const bar = document.getElementById('error-actions');
    if (bar) bar.classList.add('hidden');
}

function log(message) {
    const logBox = document.getElementById('log-box');
    const timestamp = new Date().toLocaleTimeString();
    logBox.innerHTML += `[${timestamp}] ${message}\n`;
    logBox.scrollTop = logBox.scrollHeight;
}

function updateProgress(percent) {
    document.getElementById('progress-fill').style.width = percent + '%';
    document.getElementById('progress-text').textContent = percent + '%';
}

async function apiCall(endpoint, method = 'GET', data = null) {
    const options = {
        method,
        headers: {
            'Content-Type': 'application/json',
            'x-api-key': API_KEY,
        },
    };

    if (data) {
        options.body = JSON.stringify(data);
    }

    try {
        const response = await fetch(`${apiBase()}/api${endpoint}`, options);
        if (response.status === 401) {
            // Key inválida: mostrar el banner para reingresarla
            pedirApiKeyDeNuevo();
            throw new Error('API Key inválida: ingrésala arriba y reintenta');
        }
        if (!response.ok) {
            let detalle = `HTTP ${response.status}`;
            try { detalle = (await response.json()).error || detalle; } catch {}
            throw new Error(detalle);
        }
        return await response.json();
    } catch (error) {
        console.error('API Error:', error);
        log(`❌ Error: ${error.message}`);
        throw error;
    }
}

// PASO 1: Leer fuente (primera) o agregar otra (hasta MAX_FUENTES) sobre la misma noticia.
// El botón es el mismo en los dos casos — leerFuente() decide según si ya hay jobId.
async function handleRead() {
    const canalId = document.getElementById('canal-select').value;
    const sourceType = document.getElementById('source-type').value;
    const sourceInput = document.getElementById('source-input').value;
    const sesgo = document.getElementById('sesgo-select').value;

    if (!state.jobId && !canalId) {
        alert('Por favor selecciona un canal');
        return;
    }

    if (!sourceInput.trim()) {
        alert('Por favor ingresa un link o texto');
        return;
    }
    setButtonDisabled('btn-read', true);
    try {
        await leerFuente(sourceType, sourceInput, sesgo, canalId);
    } finally {
        setButtonDisabled('btn-read', false);
    }
}

// Muestra/oculta el aviso de "hay fuentes sin procesar" y resalta el botón de procesar.
function marcarFuentesPendientes(pendiente) {
    document.getElementById('fuentes-pendiente-hint').classList.toggle('hidden', !pendiente);
}

// Pinta la lista de fuentes ya agregadas (Paso 1) y ajusta el botón/label según cuántas hay.
// Dos botones separados a propósito (antes era uno solo que agregaba Y procesaba, y al pasar
// de paso no quedaba claro que se podían seguir agregando fuentes): "Leer"/"Agregar fuente"
// solo guarda la fuente nueva; "Ya, procesar fuentes" sintetiza la crónica con TODAS juntas.
function renderFuentesLista() {
    const wrap = document.getElementById('fuentes-lista-wrap');
    const lista = document.getElementById('fuentes-lista');
    const contador = document.getElementById('fuentes-contador');
    const btn = document.getElementById('btn-read');
    const btnProcesar = document.getElementById('btn-procesar-fuentes');
    const label = document.getElementById('source-input-label');

    contador.textContent = `${state.fuentes.length}/${MAX_FUENTES}`;
    lista.innerHTML = state.fuentes.map((f, i) => `
        <li>
            <span class="fuente-num">${i + 1}.</span>
            <span class="fuente-tipo">${f.tipoReal || f.type}</span>
            <span>${f.fuenteResumen || f.content.slice(0, 60)}</span>
        </li>
    `).join('');
    wrap.classList.toggle('hidden', state.fuentes.length === 0);
    btnProcesar.classList.toggle('hidden', state.fuentes.length === 0);

    if (state.fuentes.length === 0) {
        btn.innerHTML = `${icon('bookOpen')} Leer y procesar`;
        label.textContent = 'Ingresa aquí:';
        document.getElementById('source-input').disabled = false;
    } else if (state.fuentes.length < MAX_FUENTES) {
        btn.innerHTML = `${icon('bookOpen')} Agregar fuente ${state.fuentes.length + 1} de ${MAX_FUENTES}`;
        label.textContent = `Fuente ${state.fuentes.length + 1} de ${MAX_FUENTES} (opcional):`;
        document.getElementById('source-input').disabled = false;
        setButtonDisabled('btn-read', false);
    } else {
        btn.innerHTML = `${icon('check')} Máximo de ${MAX_FUENTES} fuentes alcanzado`;
        setButtonDisabled('btn-read', true);
        label.textContent = 'Ingresa aquí:';
        document.getElementById('source-input').disabled = true;
    }
}

// Material adicional por fragmento (cita/foto/video de apoyo) — Paso 1, opcional e independiente
// de las fuentes de texto. Antes de tener jobId los archivos quedan en cola
// (state.materialesPendientes, mismo patrón que state.fuentes antes de "Procesar fuentes") y se
// suben apenas el primer /api/read devuelve un jobId (flushMaterialesPendientes).
function handleMaterialFile(tipo, fileList) {
    const archivos = [...fileList];
    if (!archivos.length) return;
    if (!state.jobId) {
        archivos.forEach(file => state.materialesPendientes.push({ tipo, file }));
        log(`📎 ${archivos.length} archivo(s) de "${tipo}" en cola — se suben apenas se cree el proceso`);
        renderMaterialesLista();
    } else {
        archivos.forEach(file => subirMaterial(tipo, file));
    }
}

function flushMaterialesPendientes() {
    if (!state.materialesPendientes.length) return;
    const pendientes = state.materialesPendientes;
    state.materialesPendientes = [];
    pendientes.forEach(p => subirMaterial(p.tipo, p.file));
}

// Upload real — multipart, no puede pasar por apiCall() (siempre manda JSON.stringify). El
// Content-Type con boundary lo pone el navegador solo si no se lo seteamos a mano.
async function subirMaterial(tipo, file) {
    const endpoint = { entrevista: '/materiales/entrevista', foto: '/materiales/foto', video: '/materiales/video' }[tipo];
    const form = new FormData();
    form.append('jobId', state.jobId);
    form.append('archivo', file);
    log(`⬆️ Subiendo ${tipo}: ${file.name}...`);
    try {
        const response = await fetch(`${apiBase()}/api${endpoint}`, { method: 'POST', headers: { 'x-api-key': API_KEY }, body: form });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || `HTTP ${response.status}`);
        state.materialesAdicionales.push({
            id: result.materialId, tipo: result.tipo, tieneVideo: result.tieneVideo || false,
            descripcion: null, citas: result.citas || [],
        });
        log(result.tipo === 'entrevista'
            ? `✅ Entrevista subida (${(result.citas || []).length} cita(s) detectada(s)): ${file.name}`
            : `✅ ${result.tipo === 'foto' ? 'Foto' : 'Video'} de apoyo subido: ${file.name}`);
        renderMaterialesLista();
    } catch (e) {
        log(`❌ Error subiendo ${tipo} (${file.name}): ${e.message}`);
    }
}

async function eliminarMaterial(materialId) {
    if (state.jobId) {
        try {
            await fetch(`${apiBase()}/api/materiales/${state.jobId}/${materialId}`, { method: 'DELETE', headers: { 'x-api-key': API_KEY } });
        } catch { /* si falla el borrado en server, igual lo sacamos de la UI */ }
    }
    state.materialesAdicionales = state.materialesAdicionales.filter(m => m.id !== materialId);
    renderMaterialesLista();
}

function renderMaterialesLista() {
    const ul = document.getElementById('materiales-lista');
    if (!ul) return;
    const subidos = state.materialesAdicionales.map(m => {
        const etiqueta = m.tipo === 'entrevista' ? `🎙️ Entrevista (${(m.citas || []).length} cita(s))` : m.tipo === 'foto' ? '🖼️ Foto de apoyo' : '🎬 Video de apoyo';
        return `<li>${etiqueta} <button type="button" class="btn-link" onclick="eliminarMaterial('${m.id}')">quitar</button></li>`;
    });
    const pendientes = state.materialesPendientes.map(p => `<li>⏳ ${p.file.name} (en cola)</li>`);
    ul.innerHTML = [...subidos, ...pendientes].join('');
}

// Lectura reutilizable: sin jobId crea el video (requiere canal) y SIEMPRE sintetiza (el server
// lo obliga: hace falta la crónica para nombrar la carpeta de insumos). Con jobId, solo AGREGA
// la fuente nueva al job — no sintetiza ni avanza de paso; para eso está procesarFuentes().
async function leerFuente(sourceType, sourceInput, sesgo, canalId) {
    const esPrimera = !state.jobId;
    try {
        state.sesgo = sesgo;
        if (esPrimera) state.canalId = canalId;
        // Rehacer/ampliar la lectura invalida guion/asignaciones/audio/destino ya hechos
        state.selectedAngle = null;
        state.guion = null;
        state.fragments = null;
        state.audioToken = null;
        state.selectedDestFolder = null;
        lockFrom('script-section');

        showProgress(`${icon('bookOpen')} ${esPrimera ? 'Leyendo fuente' : 'Agregando fuente'}...`);
        log(`📖 ${esPrimera ? 'Iniciando lectura' : 'Agregando fuente'} (sesgo: ${sesgo})...`);
        updateProgress(10);

        const result = await apiCall('/read', 'POST', {
            type: sourceType,
            content: sourceInput,
            sesgo: sesgo,
            canalId: canalId,
            jobId: state.jobId || undefined,
            sintetizar: false, // ignorado en la primera fuente: el server la sintetiza igual
        });

        state.fuentes.push({ type: sourceType, content: sourceInput, tipoReal: result.tipoReal, fuenteResumen: result.fuenteResumen });
        if (sourceType === 'link' && !state.sourceData?.linkFuente) {
            state.sourceData = { ...(state.sourceData || {}), linkFuente: sourceInput.trim() };
        }
        if (result.jobId) {
            state.jobId = result.jobId;
            sessionStorage.setItem('farandula_job_id', result.jobId);
            flushMaterialesPendientes();
        }
        updateProgress(30);
        renderFuentesLista();
        document.getElementById('source-input').value = '';

        if (result.sintetizado) {
            log(esPrimera ? '✅ Lectura completada' : `✅ Fuente ${result.numFuentes}/${result.maxFuentes} agregada y procesada`);
            state.sourceData = { ...state.sourceData, ...result };
            document.getElementById('res-titulo').textContent = result.titulo;
            document.getElementById('res-descripcion').textContent = result.descripcion;
            document.getElementById('res-cronica').textContent = result.cronica;
            revealLectura();
            marcarFuentesPendientes(false);
            hideProgress();
            setStepStatus('fuente-section', 'done');
            setStepStatus('script-section', 'active');
            log('➡️ Agregá otra fuente si querés, o selecciona un ángulo para continuar');
        } else {
            log(`✅ Fuente ${result.numFuentes}/${result.maxFuentes} agregada (${result.tipoReal}) — sin procesar todavía`);
            marcarFuentesPendientes(true);
            hideProgress();
            log('➡️ Agregá otra fuente, o pulsá "Ya, procesar fuentes" para actualizar la crónica');
        }
    } catch (error) {
        mostrarError(`Error en lectura: ${error.message}`,
            () => leerFuente(sourceType, sourceInput, sesgo, canalId), 'fuente-section');
    }
}

// Sintetiza la crónica con TODAS las fuentes acumuladas hasta ahora (botón "Ya, procesar
// fuentes"). Reusa /api/resintetizar — no vuelve a descargar ni re-procesar ninguna fuente.
async function procesarFuentes() {
    if (!state.jobId || state.fuentes.length === 0) {
        alert('Todavía no hay fuentes agregadas');
        return;
    }
    setButtonDisabled('btn-procesar-fuentes', true);
    try {
        state.selectedAngle = null;
        state.guion = null;
        state.fragments = null;
        state.audioToken = null;
        state.selectedDestFolder = null;
        lockFrom('script-section');

        showProgress(`${icon('checkCircle')} Procesando ${state.fuentes.length} fuente(s)...`);
        log(`📝 Sintetizando crónica con ${state.fuentes.length} fuente(s) (sesgo: ${state.sesgo})...`);
        updateProgress(30);

        const result = await apiCall('/resintetizar', 'POST', { jobId: state.jobId, sesgo: state.sesgo });
        state.sourceData = { ...state.sourceData, ...result };
        document.getElementById('res-titulo').textContent = result.titulo;
        document.getElementById('res-descripcion').textContent = result.descripcion;
        document.getElementById('res-cronica').textContent = result.cronica;
        revealLectura();
        marcarFuentesPendientes(false);
        hideProgress();
        setStepStatus('fuente-section', 'done');
        setStepStatus('script-section', 'active');
        log('✅ Crónica actualizada con todas las fuentes. Selecciona un ángulo para continuar');
    } catch (error) {
        mostrarError(`Error procesando fuentes: ${error.message}`, () => procesarFuentes(), 'fuente-section');
    } finally {
        setButtonDisabled('btn-procesar-fuentes', false);
    }
}

// PASO 2: Seleccionar ángulo
function selectAngle(angle) {
    state.selectedAngle = angle;

    document.querySelectorAll('.angle-card').forEach(card => {
        card.classList.remove('selected');
    });
    event.target.closest('.angle-card').classList.add('selected');

    if (angle === 7) {
        document.getElementById('custom-angle-group').classList.remove('hidden');
    } else {
        document.getElementById('custom-angle-group').classList.add('hidden');
    }

    log(`✓ Ángulo ${angle} seleccionado`);
}

// PASO 2.5: Generar guion
async function handleGenerateScript() {
    if (!state.selectedAngle) {
        alert('Selecciona un ángulo primero');
        return;
    }

    let angleContent = null;
    if (state.selectedAngle === 7) {
        angleContent = document.getElementById('custom-angle').value;
        if (!angleContent.trim()) {
            alert('Escribe tu enfoque personalizado');
            return;
        }
    }

    setButtonDisabled('btn-generate-script', true);
    try {
        // Rehacer el guion (nuevo ángulo o regenerar) invalida asignaciones/audio/destino ya hechos
        state.fragments = null;
        state.audioToken = null;
        state.selectedDestFolder = null;
        lockFrom('guion-section');

        showProgress(`${icon('pencilSimple')} Generando guion...`);
        log('✍️ Generando guion...');
        updateProgress(40);

        const result = await apiCall('/generate-script', 'POST', {
            cronica: state.sourceData.cronica,
            angle: state.selectedAngle,
            angleContent: angleContent,
            jobId: state.jobId,
            // Modo gemelos: el server escribe los DOS guiones en la misma llamada (el segundo con
            // el primero como "esto es lo que NO podés parecerte") y le busca al segundo su propio
            // título y descripción.
            gemela: state.gemelos,
            metadatos: state.gemelos ? { titulo: state.sourceData?.titulo, descripcion: state.sourceData?.descripcion } : undefined,
        });

        log('✅ Guion generado');
        state.guion = result.script;
        renderProductoGuion(result.script);
        updateProgress(50);

        if (state.gemelos) {
            if (result.gemela) {
                state.B = { ...nuevaVarianteB(), guion: result.gemela.script, metadatos: result.gemela.metadatos };
                log(`✅ Guion del gemelo: ${result.gemela.palabras} palabras — "${result.gemela.metadatos?.titulo || ''}"`);
            } else {
                // El A ya está listo: se sigue con uno solo en vez de tirar abajo todo el paso.
                state.gemelos = false;
                document.getElementById('chk-gemelos').checked = false;
                toggleGemelos(false);
                log('⚠️ No se pudo escribir el guion del gemelo: seguí con un solo video o volvé a generar');
            }
        }
        state.varianteActiva = 'A';
        actualizarTabs();

        // Mostrar el guion en el editor para revisión (aprobar / modificar / rechazar)
        document.getElementById('guion-editor').value = result.script;
        actualizarStatsGuion();
        const numPalabras = result.palabras || result.script.split(/\s+/).filter(Boolean).length;
        log(`📜 Guion: ${numPalabras} palabras`);
        if (numPalabras < 180) {
            log('⚠️ Guion corto (se esperan 205-220 palabras)');
        }

        hideProgress();
        setStepStatus('script-section', 'done');
        setStepStatus('guion-section', 'active');
        log('➡️ Revisa el guion: aprueba, edita o regenera');
    } catch (error) {
        mostrarError(`Error generando guion: ${error.message}`,
            () => handleGenerateScript(), 'script-section');
    } finally {
        setButtonDisabled('btn-generate-script', false);
    }
}

// Conteo de palabras en vivo mientras se edita el guion
function actualizarStatsGuion() {
    const texto = document.getElementById('guion-editor').value;
    const numPalabras = texto.split(/\s+/).filter(Boolean).length;
    const alerta = numPalabras < 180 ? ' ⚠️ corto' : '';
    document.getElementById('guion-stats').textContent =
        `Guion (${numPalabras} palabras, ~${Math.round(numPalabras / 3)}s de locución)${alerta}`;
}

function copyGuion() {
    navigator.clipboard.writeText(document.getElementById('guion-editor').value)
        .then(() => log('📋 Guion copiado'));
}

// APROBACIÓN: solo el guion aprobado (con ediciones del usuario) sigue el pipeline
async function aprobarGuion() {
    const texto = document.getElementById('guion-editor').value.trim();
    if (!texto) {
        alert('El guion está vacío');
        return;
    }
    const d = V();
    d.guion = texto;
    if (state.varianteActiva === 'A') renderProductoGuion(texto);
    log(`✅ Guion aprobado (${etiquetaVariante(state.varianteActiva)})`);

    setButtonDisabled('btn-approve-guion', true);
    try {
        // Rehacer la aprobación (guion editado) invalida audio/destino ya hechos
        d.audioToken = null;
        d.selectedDestFolder = null;
        invalidarVariantes(['asignaciones', 'audio']);
        lockFrom('revision-section');

        showProgress(`${icon('folderOpen')} Asignando carpetas (${etiquetaVariante(state.varianteActiva)})...`);
        log('📂 Asignando carpetas a los párrafos...');
        updateProgress(52);
        const result = await apiCall(cfg().asignar, 'POST', {
            [cfg().asignarParam]: d.guion,
            protagonista: state.sourceData?.protagonista,
            jobId: state.jobId,
            variante: state.varianteActiva,
        });
        d.fragments = result[cfg().parrafosKey];
        d.avisoReconstruccion = result.avisoReconstruccion || null;
        // Las carpetas de famosos y el material adicional son del JOB, no de la variante: las dos
        // versiones eligen entre las mismas carpetas y comparten las fotos/videos de apoyo.
        state.carpetas = result.carpetas;
        state.materialesAdicionales = result.materialesDisponibles || [];
        renderAsignaciones(result.protagonistaSinCarpeta, result.protagonista);

        hideProgress();
        if (!marcarPasoVariante('guion', 'Ahora revisá y aprobá el guion del canal hermano.')) return;
        setStepStatus('guion-section', 'done');
        setStepStatus('revision-section', 'active');
    } catch (error) {
        mostrarError(`Error asignando carpetas: ${error.message}`,
            () => aprobarGuion(), 'guion-section');
    } finally {
        setButtonDisabled('btn-approve-guion', false);
    }
}

// Pinta la lista de párrafos/carpetas asignadas (usada al aprobar guion y al recuperar un job)
function renderAsignaciones(protagonistaSinCarpeta, protagonistaNombre) {
    const aviso = document.getElementById('aviso-protagonista');
    if (protagonistaSinCarpeta) {
        aviso.textContent = `⚠️ ${protagonistaNombre} NO tiene carpeta propia: los clips saldrán de las carpetas asignadas abajo. Revisa bien (o crea la carpeta en Drive y vuelve a intentar).`;
        aviso.classList.remove('hidden');
    } else {
        aviso.classList.add('hidden');
    }

    // Los fragmentos deben reconstruir el guion palabra por palabra: el tiempo en pantalla de
    // cada clip sale de su proporción de caracteres. Si no coinciden, todos los clips quedan
    // corridos respecto de la locución — y no falla nada a la vista, por eso hay que avisarlo.
    const avisoRec = document.getElementById('aviso-reconstruccion');
    if (V().avisoReconstruccion) {
        avisoRec.textContent = `⚠️ ${V().avisoReconstruccion}`;
        avisoRec.classList.remove('hidden');
    } else {
        avisoRec.classList.add('hidden');
    }

    const lista = document.getElementById('lista-asignaciones');
    lista.innerHTML = '';
    const itemsMaterial = aplanarMaterialesCliente(state.materialesAdicionales);
    V().fragments.forEach((f, i) => {
        const div = document.createElement('div');
        div.className = 'asignacion-row';
        const p = document.createElement('p');
        p.className = 'asignacion-label';
        p.textContent = `${i + 1}. (${f.porcentaje}%) ${f.texto}`;
        const sel = document.createElement('select');
        state.carpetas.forEach(c => {
            const o = document.createElement('option');
            o.value = c; o.textContent = c;
            if (c === f.famoso) o.selected = true;
            sel.appendChild(o);
        });
        sel.onchange = () => { state.fragments[i].famoso = sel.value; };
        div.appendChild(p);
        div.appendChild(sel);

        // Material adicional (cita/foto/video de apoyo): sugerencia automática, editable acá —
        // mismo lugar donde ya se corrige "famoso" a mano.
        if (itemsMaterial.length) {
            const selMat = document.createElement('select');
            selMat.className = 'asignacion-material';
            selMat.appendChild(new Option('— Sin material adicional —', ''));
            itemsMaterial.forEach(it => selMat.appendChild(new Option(etiquetaMaterial(it), it.id)));
            const actual = f.materialAdicional;
            if (actual) selMat.value = actual.citaId ? `${actual.materialId}:${actual.citaId}` : actual.materialId;

            const inputsCita = document.createElement('span');
            inputsCita.className = 'asignacion-cita-tiempos hidden';
            const inIni = document.createElement('input');
            inIni.type = 'number'; inIni.step = '0.1'; inIni.className = 'input-cita-tiempo';
            inIni.title = 'Inicio de la cita (segundos)';
            const inFin = document.createElement('input');
            inFin.type = 'number'; inFin.step = '0.1'; inFin.className = 'input-cita-tiempo';
            inFin.title = 'Fin de la cita (segundos)';
            inputsCita.append('Cita: ', inIni, ' – ', inFin, 's');

            // Al elegir una cita, prellenar con lo que Gemini detectó en la entrevista
            // (item.inicioAprox/finAprox) — SALVO que esta selección sea la ya guardada del
            // fragmento (render inicial o vuelta atrás), en cuyo caso se respeta lo que el
            // usuario ya haya ajustado a mano (actual.inicio/fin).
            const sincronizarCita = () => {
                const item = itemsMaterial.find(it => it.id === selMat.value);
                const esCita = item?.tipo === 'cita';
                inputsCita.classList.toggle('hidden', !esCita);
                if (!esCita) return;
                const esLaGuardada = actual && selMat.value === (actual.citaId ? `${actual.materialId}:${actual.citaId}` : actual.materialId);
                inIni.value = (esLaGuardada && actual.inicio != null) ? actual.inicio : (item.inicioAprox ?? '');
                inFin.value = (esLaGuardada && actual.fin != null) ? actual.fin : (item.finAprox ?? '');
            };
            sincronizarCita();

            const aplicarSeleccion = () => {
                const item = itemsMaterial.find(it => it.id === selMat.value);
                if (!item) { state.fragments[i].materialAdicional = null; }
                else {
                    state.fragments[i].materialAdicional = {
                        materialId: item.materialId, tipo: item.tipo, citaId: item.citaId || undefined,
                        ...(item.tipo === 'cita' ? { inicio: parseFloat(inIni.value) || 0, fin: parseFloat(inFin.value) || 0 } : {}),
                    };
                }
            };
            selMat.onchange = () => { sincronizarCita(); aplicarSeleccion(); };
            inIni.onchange = aplicarSeleccion;
            inFin.onchange = aplicarSeleccion;
            if (actual) aplicarSeleccion();

            div.appendChild(selMat);
            div.appendChild(inputsCita);
        }

        lista.appendChild(div);
    });
}

// Espejo en JS de gemini.aplanarMateriales() (server) — cada cita de cada entrevista es su
// propio ítem asignable, igual que cada foto/video. Mismo criterio de `id` (materialId, o
// materialId:citaId) para que la selección viaje idéntica al server.
function aplanarMaterialesCliente(materialesAdicionales) {
    const items = [];
    for (const m of materialesAdicionales || []) {
        if (m.tipo === 'entrevista') {
            (m.citas || []).forEach(c => items.push({ id: `${m.id}:${c.citaId}`, materialId: m.id, citaId: c.citaId, tipo: 'cita', texto: c.texto, inicioAprox: c.inicioAprox, finAprox: c.finAprox }));
        } else {
            items.push({ id: m.id, materialId: m.id, tipo: m.tipo, texto: m.descripcion || null });
        }
    }
    return items;
}
function etiquetaMaterial(item) {
    if (item.tipo === 'cita') return `🎙️ Cita: "${(item.texto || '').slice(0, 40)}${(item.texto || '').length > 40 ? '…' : ''}"`;
    if (item.tipo === 'foto') return `🖼️ Foto de apoyo${item.texto ? ': ' + item.texto : ''}`;
    return `🎬 Video de apoyo${item.texto ? ': ' + item.texto : ''}`;
}

// Trae la lista de carpetas viva desde Drive y repinta los desplegables del Paso 4.
// Necesario porque al retomar un job las carpetas vienen de la foto guardada al fragmentar:
// un famoso creado en Drive después de ese momento no aparecía en las opciones.
// Las carpetas guardadas se CONSERVAN en la unión — si alguna fue renombrada o borrada en
// Drive, el fragmento que la tenía asignada no se queda sin su opción seleccionada.
async function refrescarCarpetas() {
    setButtonDisabled('btn-refrescar-carpetas', true);
    const nota = document.getElementById('nota-carpetas');
    try {
        const { carpetas } = await apiCall('/carpetas-famosos');
        const antes = state.carpetas.length;
        const asignadas = state.fragments ? state.fragments.map(f => f.famoso) : [];
        state.carpetas = [...new Set([...carpetas, ...state.carpetas, ...asignadas])]
            .filter(Boolean)
            .sort((a, b) => a.localeCompare(b));
        const nuevas = state.carpetas.length - antes;

        // Recalcular el aviso de "protagonista sin carpeta" con la lista nueva (mismo
        // criterio que usa el server al fragmentar): si el usuario acaba de crear esa
        // carpeta en Drive y refresca, el aviso tiene que desaparecer solo.
        const norm = s => (s || '').toLowerCase().replace(/[_\s]/g, '');
        const protagonista = state.sourceData ? state.sourceData.protagonista : '';
        const p = norm(protagonista);
        const sinCarpeta = Boolean(p) && !state.carpetas.some(c => norm(c).includes(p) || p.includes(norm(c)));
        renderAsignaciones(sinCarpeta, protagonista);
        nota.textContent = nuevas > 0
            ? `✅ Lista actualizada: ${nuevas} carpeta(s) nueva(s). Total ${state.carpetas.length}.`
            : `✅ Lista actualizada: ya estaba al día (${state.carpetas.length} carpetas).`;
        log(`📂 Carpetas actualizadas desde Drive: ${state.carpetas.length}${nuevas > 0 ? ` (+${nuevas})` : ''}`);
    } catch (error) {
        nota.textContent = `❌ No se pudo actualizar la lista: ${error.message}`;
        log(`❌ Error actualizando carpetas: ${error.message}`);
    } finally {
        setButtonDisabled('btn-refrescar-carpetas', false);
    }
}

// Confirmar asignaciones → generar locución para aprobación
async function confirmarAsignaciones() {
    setButtonDisabled('btn-confirm-assignments', true);
    try {
        await regenerarAudio('eleven_v3');
        marcarPasoVariante('asignaciones', 'Ahora revisá las asignaciones del canal hermano.');
    } finally {
        setButtonDisabled('btn-confirm-assignments', false);
    }
}

// Generar (o regenerar) la locución y mostrarla para aprobación
async function regenerarAudio(modelo) {
    setButtonDisabled('btn-regenerate-audio-v3', true);
    setButtonDisabled('btn-regenerate-audio-v2', true);
    try {
        // Rehacer la locución invalida el destino ya elegido
        const d = V();
        d.selectedDestFolder = null;
        invalidarVariantes(['audio']);
        lockFrom('destination-section');

        showProgress(`${icon('microphone')} Generando locución de ${etiquetaVariante(state.varianteActiva)} (${modelo})...`);
        log(`🎙️ Generando locución (${modelo}) — ${etiquetaVariante(state.varianteActiva)}...`);
        updateProgress(65);
        const result = await apiCall('/generar-audio', 'POST', {
            [cfg().audioParam]: d.fragments,
            modelo: modelo,
            jobId: state.jobId,
            variante: state.varianteActiva,
        });
        d.audioToken = result.audioToken;
        d.duracion = result.duracion;

        document.getElementById('audio-info').textContent =
            `Duración: ${result.duracion}s | Modelo: ${result.modelo}`;
        const player = document.getElementById('audio-player');
        // La URL del audio es relativa al backend activo (importante en modo insumos)
        player.src = apiBase() + result.audioUrl + '?t=' + Date.now();
        player.load();
        if (state.varianteActiva === 'A') renderProductoAudio(player.src);

        hideProgress();
        actualizarTabs();
        setStepStatus('revision-section', 'done');
        setStepStatus('audio-section', 'active');
        log('🎧 Escucha la locución y apruébala o regenérala');
    } catch (error) {
        mostrarError(`Error generando locución: ${error.message}`,
            () => regenerarAudio(modelo), 'revision-section');
    } finally {
        setButtonDisabled('btn-regenerate-audio-v3', false);
        setButtonDisabled('btn-regenerate-audio-v2', false);
    }
}

// Recargar el audio.mp3 desde la carpeta de insumos en Drive (voz hecha en otra parte).
// No pasa por ElevenLabs: baja el archivo que el usuario dejó en Drive y lo deja aprobable.
async function recargarAudioDeDrive() {
    if (!state.jobId) {
        alert('No hay un proceso activo con carpeta en Drive');
        return;
    }
    setButtonDisabled('btn-recargar-audio', true);
    try {
        // Cambiar la locución invalida el destino ya elegido
        V().selectedDestFolder = null;
        invalidarVariantes(['audio']);
        lockFrom('destination-section');

        showProgress(`${icon('arrowsClockwise')} Recargando audio desde Drive...`);
        log('♻️ Recargando audio desde Drive...');
        updateProgress(65);
        const result = await apiCall('/recargar-audio', 'POST', { jobId: state.jobId, variante: state.varianteActiva });
        V().audioToken = result.audioToken;
        V().duracion = result.duracion;

        document.getElementById('audio-info').textContent =
            `Duración: ${result.duracion}s | Origen: Drive`;
        const player = document.getElementById('audio-player');
        player.src = apiBase() + result.audioUrl + '?t=' + Date.now();
        player.load();
        renderProductoAudio(player.src);

        hideProgress();
        setStepStatus('revision-section', 'done');
        setStepStatus('audio-section', 'active');
        log('🎧 Audio de Drive cargado. Escúchalo y apruébalo.');
    } catch (error) {
        mostrarError(`Error recargando audio: ${error.message}`,
            () => recargarAudioDeDrive(), 'audio-section');
    } finally {
        setButtonDisabled('btn-recargar-audio', false);
    }
}

// Locución aprobada → elegir carpeta de destino
async function aprobarAudio() {
    if (!V().audioToken) {
        alert('No hay locución generada para esta versión');
        return;
    }
    setButtonDisabled('btn-approve-audio', true);
    try {
        log(`✅ Locución aprobada (${etiquetaVariante(state.varianteActiva)})`);
        if (!marcarPasoVariante('audio', 'Ahora escuchá y aprobá la locución del canal hermano.')) return;
        await loadDestinationFolders();
        setStepStatus('audio-section', 'done');
        setStepStatus('destination-section', 'active');
        // Prefill del titular del cartel con el TÍTULO de la lectura (no con `nombreCorto`, que es
        // la base del nombre de archivo) — editable, y sin pisar si el usuario ya escribió algo.
        const portadaTitularEl = document.getElementById('portada-titular');
        if (portadaTitularEl && !portadaTitularEl.value.trim()) {
            portadaTitularEl.value = tituloParaCartel(state.varianteActiva);
            V().titularCartel = portadaTitularEl.value;
            actualizarPortadaDiseno();
        }
    } finally {
        setButtonDisabled('btn-approve-audio', false);
    }
}

// RECHAZO: regenerar con el mismo ángulo
async function regenerarGuion() {
    setButtonDisabled('btn-regenerate-guion', true);
    try {
        log('🔄 Regenerando guion (mismo ángulo)...');
        await handleGenerateScript();
    } finally {
        setButtonDisabled('btn-regenerate-guion', false);
    }
}

// RECHAZO: volver a elegir ángulo
function cambiarAngulo() {
    setStepStatus('guion-section', 'locked');
    setStepStatus('script-section', 'active');
    log('🎯 Elige otro ángulo');
}

// Cargar carpetas de destino
async function loadDestinationFolders() {
    try {
        log('📂 Cargando carpetas de Google Drive...');
        const result = await apiCall(cfg().destinos);
        const lista = result[cfg().destinosKey] || [];

        const select = document.getElementById('dest-folder');
        select.innerHTML = '<option value="">-- Selecciona una carpeta --</option>';

        lista.forEach(folder => {
            const option = document.createElement('option');
            option.value = folder.id;
            option.textContent = folder.name;
            option.dataset.name = folder.name; // insumos necesita el nombre del canal
            select.appendChild(option);
        });

        state.carpetasDestino = lista;
        select.value = V().selectedDestFolder || '';
        actualizarTabs();
        log(`✅ ${lista.length} carpetas cargadas`);
    } catch (error) {
        log(`❌ Error cargando carpetas: ${error.message}`);
    }
}

// Elegir el destino de la variante que se está viendo. En modo gemelos, elegir el del video A
// autocompleta el del B con su canal hermano — si el nombre no está en el mapa GEMELAS (carpeta
// renombrada, canal nuevo), simplemente no autocompleta y el usuario lo elige a mano.
function elegirDestino(valor) {
    V().selectedDestFolder = valor || null;
    const hint = document.getElementById('hint-gemela-destino');
    if (hint) hint.classList.add('hidden');

    if (state.gemelos && state.varianteActiva === 'A' && valor) {
        const carpetaA = state.carpetasDestino.find(f => f.id === valor);
        const gemela = buscarCarpetaGemela(carpetaA?.name, state.carpetasDestino);
        if (gemela) {
            V('B').selectedDestFolder = gemela.id;
            if (hint) {
                hint.textContent = `El video B va a "${gemela.name}", el canal hermano de "${carpetaA.name}". Podés cambiarlo desde su pestaña.`;
                hint.classList.remove('hidden');
            }
        } else if (hint) {
            hint.textContent = `No encontré el canal hermano de "${carpetaA?.name}": elegí a mano el destino del video B en su pestaña.`;
            hint.classList.remove('hidden');
        }
    }
    actualizarTabs();
}

// PASO 3: Generar el resultado final (video o insumos según el modo)
// Efectos del Paso 6. Son COMPARTIDOS por las dos variantes (zoom, espejo, transiciones,
// subtítulos, música): lo que las diferencia visualmente no son los ajustes sino las tomas y la
// pista, que salen distintas solas porque los renders van de a uno y la rotación de historial.json
// no repite (ver seleccion.js).
function efectosDelPaso6() {
    return {
        zoom: document.getElementById('efecto-zoom')?.value || 'ninguno',
        zoomPct: Number(document.getElementById('zoom-pct')?.value) || 20,
        espejo: document.getElementById('efecto-espejo')?.value || 'ninguno',
        subtitulos: document.getElementById('efecto-subtitulos')?.checked ?? true,
        musica: document.getElementById('efecto-musica')?.checked ?? true,
        musicaTono: document.getElementById('musica-tono')?.value || 'auto',
        // Cuánto se atenúa la música. Cada pista se emparejará a ESE nivel midiendo su propio
        // loudness, así que mover esto no reabre la diferencia entre unas y otras (ver musica.js).
        musicaVolumenDb: Number(document.getElementById('musica-volumen')?.value) || -18,
        subtitulosFuente: subsFuente,
        subtitulosTamano: subsTamano,
        subtitulosMarginV: subsMarginV,
        transicion: document.getElementById('efecto-transicion')?.value || 'ninguno',
        transicionTipo: tiposTransicionElegidos(),
        transicionDur: Number(document.getElementById('transicion-dur')?.value) || 0.35,
    };
}

// Encola UNA variante y devuelve su renderId. El cartel se dibuja en el canvas compartido justo
// antes de exportarlo: hay un solo canvas, así que cada variante lo pinta con SU titular, exporta
// su PNG y recién ahí se pasa a la siguiente.
async function encolarVariante(v) {
    const d = V(v);
    if (!d.fragments || d.fragments.length === 0) throw new Error(`El video ${v} no tiene párrafos asignados`);
    if (!d.audioToken) throw new Error(`El video ${v} no tiene locución aprobada`);
    if (!d.selectedDestFolder) throw new Error(`El video ${v} no tiene carpeta de destino`);

    const titularEl = document.getElementById('portada-titular');
    if (titularEl) {
        titularEl.value = d.titularCartel || tituloParaCartel(v);
        await actualizarPortadaDiseno();
    }
    const cartelPNG = await exportarCartelPNG();
    if (titularEl?.value.trim() && !cartelPNG) {
        log(`⚠️ No se pudo generar el cartel del video ${v}: va a salir sin él.`);
    }

    const meta = metaVariante(v);
    const carpeta = state.carpetasDestino.find(f => f.id === d.selectedDestFolder);
    const respuesta = await apiCall('/generate-video', 'POST', {
        fragments: d.fragments,
        audioToken: d.audioToken,
        destFolder: d.selectedDestFolder,
        guion: d.guion,
        jobId: state.jobId,
        variante: v,
        etiqueta: meta.nombreCorto || meta.titulo || 'Video',
        canal: carpeta?.name || '',
        metadatos: {
            titulo: meta.titulo,
            descripcion: meta.descripcion,
            protagonista: meta.protagonista,
            nombreCorto: meta.nombreCorto,
            linkFuente: meta.linkFuente,
        },
        efectos: { ...efectosDelPaso6(), cartelPNG },
    });
    d.renderId = respuesta.renderId;
    log(`📋 ${etiquetaVariante(v)} encolado (${respuesta.estado === 'en_cola' ? `puesto ${respuesta.posicion}` : 'arrancando'})`);
    return respuesta.renderId;
}

async function handleGenerateVideo() {
    const select = document.getElementById('dest-folder');
    const destFolder = select.value;

    if (!destFolder) {
        alert('Selecciona una carpeta de destino');
        return;
    }

    V().selectedDestFolder = destFolder;
    state.selectedDestFolder = state.selectedDestFolder || destFolder;

    // Modo gemelos: dos tareas en la cola, A y después B. El orden importa — la rotación de clips
    // y de música mira lo que consumió el render anterior, así que planificar el B DESPUÉS del A
    // es justamente lo que hace que las tomas no se repitan entre los dos canales.
    if (MODO === 'video' && state.gemelos) {
        if (!state.B?.selectedDestFolder) {
            alert('Falta elegir la carpeta de destino del segundo video (pestaña del canal hermano)');
            return;
        }
        setButtonDisabled('btn-generate-video', true);
        iniciarPanelCola();
        const varianteOriginal = state.varianteActiva;
        try {
            volcarVista();
            showProgress(`${icon('rocketLaunch')} Encolando los dos videos...`);
            updateProgress(50);
            const idA = await encolarVariante('A');
            const idB = await encolarVariante('B');

            const resA = await esperarRender(idA, etiquetaVariante('A'));
            state.resultado = resA;
            log(`🎉 ${etiquetaVariante('A')} listo: ${resA.fileName}`);
            showResult(resA);

            try {
                const resB = await esperarRender(idB, etiquetaVariante('B'));
                V('B').resultado = resB;
                log(`🎉 ${etiquetaVariante('B')} listo: ${resB.fileName}`);
                mostrarResultadoGemelo(resB);
            } catch (e) {
                // El A ya está subido y registrado: se avisa del B sin tirar abajo lo que sí salió.
                log(`❌ El video del canal hermano falló: ${e.message}`);
                mostrarResultadoGemelo(null, e.message);
            }

            hideProgress();
            setStepStatus('destination-section', 'done');
        } catch (error) {
            mostrarError(`Error generando los videos gemelos: ${error.message}`,
                () => handleGenerateVideo(), 'destination-section');
        } finally {
            state.varianteActiva = varianteOriginal;
            pintarVista();
            setButtonDisabled('btn-generate-video', false);
        }
        return;
    }

    setButtonDisabled('btn-generate-video', true);
    try {
        showProgress(MODO === 'video' ? `${icon('rocketLaunch')} Generando video...` : `${icon('rocketLaunch')} Exportando insumos...`);
        log(MODO === 'video' ? '🚀 Iniciando generación de video...' : '🚀 Iniciando exportación de insumos...');
        updateProgress(50);

        // Todo ya aprobado: párrafos revisados + locución escuchada
        if (!state.fragments || state.fragments.length === 0) {
            throw new Error('No hay párrafos asignados (vuelve a aprobar el guion)');
        }
        if (!state.audioToken) {
            throw new Error('No hay locución aprobada');
        }

        let resultado;
        if (MODO === 'video') {
            log('🎞️ Generando video con FFmpeg...');
            updateProgress(70);
            // Cartel de portada: se exporta acá el PNG EXACTO que se ve en la previa del Paso 6.
            // El server no lo re-dibuja — lo superpone tal cual en el frame 0 y en el JPG, así
            // los tres (previa, video, JPG) son literalmente la misma imagen.
            // El render ya no ocurre dentro de este pedido: el servidor encola y responde al
            // instante, y acá se sondea el estado. Además de sacarle de encima el límite de
            // tiempo del gateway, es lo que impide que dos renders corran a la vez.
            iniciarPanelCola();
            const idRender = await encolarVariante('A');
            resultado = await esperarRender(idRender, etiquetaVariante('A'));
            log('✅ Video generado');
        } else {
            log('✂️ Cortando fragmentos y subiendo insumos...');
            updateProgress(70);
            resultado = await apiCall('/exportar', 'POST', {
                guion: state.guion,
                jobId: state.jobId,
                fragments: state.fragments,
                audioToken: state.audioToken,
                metadatos: {
                    titulo: state.sourceData?.titulo,
                    descripcion: state.sourceData?.descripcion,
                    protagonista: state.sourceData?.protagonista,
                    linkFuente: state.sourceData?.linkFuente,
                },
                efectos: {
                    zoom: document.getElementById('efecto-zoom')?.value || 'ninguno',
                    zoomPct: Number(document.getElementById('zoom-pct')?.value) || 20,
                    espejo: document.getElementById('efecto-espejo')?.value || 'ninguno',
                },
            });
            log('✅ Insumos exportados');
        }
        updateProgress(100);
        hideProgress();
        setStepStatus('destination-section', 'done');
        showResult(resultado);
    } catch (error) {
        // Reintentar aquí repite SOLO el render/export: el guion y la locución ya están en state.
        mostrarError(`Error en ${MODO === 'video' ? 'la generación del video' : 'la exportación'}: ${error.message}`,
            () => handleGenerateVideo(), 'destination-section');
    } finally {
        setButtonDisabled('btn-generate-video', false);
    }
}

// El segundo video no reemplaza al primero en pantalla: se muestra debajo, con su propio link.
// Si falló, se dice qué pasó — el primero ya está subido y registrado igual.
function mostrarResultadoGemelo(videoData, error) {
    const cont = document.getElementById('result-info');
    if (!cont) return;
    const caja = document.createElement('div');
    caja.className = videoData ? 'banner-ok mt-md' : 'banner-danger mt-md';
    caja.id = 'resultado-gemelo';
    if (videoData) {
        caja.innerHTML = `
            <p><strong>${icon('checkCircle')} ${etiquetaVariante('B')}: ${videoData.fileName}</strong></p>
            ${videoData.driveLink ? `<p><a href="${videoData.driveLink}" target="_blank">${icon('link')} Abrir en Google Drive</a></p>` : ''}
            <p class="hint">Título del post: ${metaVariante('B').titulo || '(el mismo del primero)'}</p>`;
    } else {
        caja.innerHTML = `<p><strong>⚠️ El video de ${etiquetaVariante('B')} no se pudo generar</strong></p>
            <p class="hint">${error || ''} — el primero ya quedó subido. Podés reintentar solo este desde el Paso 6.</p>`;
    }
    document.getElementById('resultado-gemelo')?.remove();
    cont.appendChild(caja);
}

// Mostrar resultado
function showResult(videoData) {
    const resultSection = document.getElementById('result-section');
    resultSection.classList.remove('hidden');
    resultSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
    const resultInfo = document.getElementById('result-info');
    renderProductoFinal(videoData);

    // Modo insumos: carpeta con fragmentos + locución, sin MP4 final
    if (MODO === 'insumos') {
        resultInfo.innerHTML = `
            <p><strong>${icon('checkCircle')} Insumos exportados</strong></p>
            <p>${icon('folderOpen')} Carpeta creada en el canal seleccionado con los fragmentos numerados + <code>locucion.mp3</code></p>
            ${videoData.driveLink ? `<p><a href="${videoData.driveLink}" target="_blank">${icon('link')} Abrir carpeta en Google Drive</a></p>` : ''}
            <p class="hint mt-md">Listo para editar a mano en tu editor de video.</p>
        `;
        log('🎉 ¡Insumos listos!');
        return;
    }

    const playerHtml = videoData.previewUrl
        ? `<video id="result-video-player" controls playsinline class="result-video-player" src="${videoData.previewUrl}"></video>`
        : '';
    const nombresSesgo = { neutral: `${icon('scales')} Neutral`, favor: `${icon('heart')} A favor`, contra: `${icon('flame')} En contra` };
    const otrosSesgos = ['neutral', 'favor', 'contra'].filter(s => s !== state.sesgo);
    const botonesSesgo = otrosSesgos.map(s =>
        `<button class="btn btn-primary" onclick="otroSesgo('${s}')">${nombresSesgo[s]}</button>`
    ).join('');

    // Token del preview: se extrae de la URL en vez de guardarlo aparte en showResult, porque
    // acá es el único lugar donde llega — así /api/portada sabe de qué MP4 sacar el fotograma.
    state.previewToken = videoData.previewUrl ? videoData.previewUrl.split('/').pop() : null;
    // El cartel quedó FIJO en el Paso 6, antes de generar: el server guardó el PNG que le mandó
    // el navegador y devuelve su URL. Es el MISMO archivo que quemó en el frame 0 y que va a usar
    // para el JPG — acá se muestra tal cual, no se re-dibuja ni se aproxima.
    const cartelUrl = videoData.cartelUrl || null;

    const portadaHtml = (state.previewToken && cartelUrl) ? `
        <div class="portada-box mt-md" id="portada-box">
            <p><strong>${icon('videoCamera')} Elegí la foto para el JPG de portada</strong></p>
            <p class="hint">El cartel ya quedó quemado en el primer fotograma del video, tal como lo definiste en el Paso 6 — acá solo elegís QUÉ FOTO de fondo lleva el JPG descargable (mismo cartel, no se re-edita). Pausá el reproductor de arriba donde quieras.</p>
            <div class="portada-live" id="portada-live">
                <canvas id="portada-live-canvas"></canvas>
                <img class="portada-live-cartel" src="${cartelUrl}" alt="">
            </div>
            <button class="btn btn-secondary mt-sm" type="button" id="btn-generar-portada" onclick="generarPortada()">${icon('sparkle')} Generar portada con esta foto</button>
            <div id="portada-resultado"></div>
        </div>
    ` : '';

    resultInfo.innerHTML = `
        ${playerHtml}
        <p><strong>${icon('checkCircle')} Video generado exitosamente</strong> (sesgo: ${nombresSesgo[state.sesgo]})</p>
        <p>${icon('folderOpen')} Carpeta destino: ${videoData.folderName}</p>
        <p>${icon('pencilSimple')} Nombre del archivo: <code>${videoData.fileName}</code></p>
        <p>${icon('hourglass')} Duración: ${videoData.duration}s</p>
        <p><a href="${videoData.driveLink}" target="_blank">${icon('link')} Ver en Google Drive</a></p>
        <p class="mt-md"><strong>${icon('repeat')} Generar otro video de la MISMA noticia con otro sesgo:</strong></p>
        <p class="btn-row">${botonesSesgo}</p>
        ${portadaHtml}
        <p class="hint mt-md">
            El video está listo para publicar en redes sociales.
        </p>
    `;
    if (state.previewToken && cartelUrl) {
        const videoEl = document.getElementById('result-video-player');
        // Fotograma por defecto: el PRIMERO del video, pedido explícito del usuario — el
        // reproductor sigue pudiéndose pausar en otro punto si se prefiere otro fotograma.
        // 0.01 y no 0 a propósito (encontrado probando en browser real): si currentTime YA está
        // en 0 (arranca ahí por defecto), asignarle 0 de nuevo es un no-op — nunca dispara
        // 'seeked' y el navegador no llega a decodificar un frame pintable, así que el mockup
        // capturaba un canvas negro. Con 0.01s sí hay un seek real, y la diferencia visual con
        // el frame 0 es nula.
        if (videoEl) {
            try { videoEl.currentTime = 0.01; } catch {}
        }
        initPortadaLive(cartelUrl);
    }
    log('🎉 ¡Proceso completado!');
}

// Casilla "automático" prende/apaga el slider+número de tamaño de la portada, y los sincroniza
// entre sí — mismo patrón que fijarTamano() de los subtítulos, pero acá el número SÍ se manda al
// server (lo lee handleGenerateVideo() al armar `efectos`). También dispara
// actualizarPortadaDiseno() en cada cambio, para que el mockup del Paso 6 siga al slider.
function initPortadaTamano() {
    const auto = document.getElementById('portada-tamano-auto');
    const slider = document.getElementById('portada-tamano');
    const num = document.getElementById('portada-tamano-num');
    if (!auto || !slider || !num) return;
    const sync = valor => {
        const n = Math.max(24, Math.min(160, Math.round(valor) || 94));
        slider.value = n;
        num.value = n;
    };
    auto.addEventListener('change', () => {
        slider.disabled = auto.checked;
        num.disabled = auto.checked;
        actualizarPortadaDiseno();
    });
    slider.addEventListener('input', () => { sync(slider.value); actualizarPortadaDiseno(); });
    num.addEventListener('input', () => { sync(num.value); actualizarPortadaDiseno(); });
}

// Tamaño de la CAJA — independiente del de letra, pedido explícito del usuario. Sin casilla de
// "automático": 100% ya es el default de siempre, no hace falta un modo aparte para eso.
function initPortadaCaja() {
    const slider = document.getElementById('portada-caja');
    const num = document.getElementById('portada-caja-num');
    if (!slider || !num) return;
    const sync = valor => {
        const n = Math.max(50, Math.min(250, Math.round(valor) || 100));
        slider.value = n;
        num.value = n;
    };
    slider.addEventListener('input', () => { sync(slider.value); actualizarPortadaDiseno(); });
    num.addEventListener('input', () => { sync(num.value); actualizarPortadaDiseno(); });
}

// ---- Cartel de portada: UN SOLO dibujo, en canvas a tamaño real de video ----
//
// Antes esto era un mockup CSS que replicaba a mano las fórmulas de portada.js (servidor), con
// un contrato de "si cambiás allá, cambiá acá". Siempre terminaban difiriendo: el usuario reportó
// una previa con saltos de línea y ancho de caja distintos a los del video final. La causa de
// fondo era que AMBOS lados estimaban el ancho del texto con un `factorAncho` por tipografía
// (un promedio) en vez de medirlo — y cualquier diferencia de un carácter por línea cambia el
// corte, el tamaño elegido y el ancho de la caja en cascada.
//
// Ahora el cartel se dibuja UNA vez, acá, en un <canvas> de 1080x1920 (el tamaño real del video,
// mostrado chico por CSS). Ese canvas ES la vista previa, y `canvas.toBlob()` da exactamente esos
// píxeles como PNG, que es lo que ffmpeg superpone en el frame 0 del video y en el JPG de portada.
// No hay dos dibujos que puedan diferir: es el mismo archivo en los tres lugares.
//
// Beneficio extra: `ctx.measureText()` mide el texto DE VERDAD, así que desapareció la estimación
// `factorAncho` que causaba el problema.
const PORTADA_ANCHO_VIDEO = 1080;
const PORTADA_ALTO_VIDEO = 1920;
const PORTADA_ANCHO_UTIL = PORTADA_ANCHO_VIDEO - 70 - 70; // margen lateral, igual que portada.js
const PORTADA_FONTSIZE_MAX = 94;
const PORTADA_FONTSIZE_MIN = 36;
const PORTADA_POS_Y_FRACCION = 0.58; // top de la caja — encima de la franja de TikTok
const PORTADA_COLOR_CAJA = '#ff2d6b';
const PORTADA_COLOR_TEXTO = '#ffffff';
const PORTADA_MAX_LINEAS = 3;

// Familia con la que se registra el .ttf que sirve el server (ver asegurarFuenteCargada). Nombre
// propio, distinto del de Google Fonts, para no depender de cuál gane si ambas están cargadas.
// Peso normal siempre: los .ttf del catálogo YA son el corte grueso (Poppins-ExtraBold,
// PassionOne-Black...), pedir bold encima haría que el navegador lo engrose sintéticamente.
function portadaFontCss(claveFuente, fontsize) {
    return `${fontsize}px 'cartel-${claveFuente}', sans-serif`;
}

// Parte `texto` en como máximo `maxLineas` líneas que quepan en `maxAncho` PÍXELES REALES, sin
// cortar palabras. `ctx` ya debe tener la fuente/tamaño finales seteados (measureText depende de
// eso). Devuelve null si no entra —así el automático prueba un tamaño más chico—, salvo `forzar`,
// que desborda la última línea en vez de fallar (último recurso, o cuando el usuario eligió el
// tamaño a mano y no corresponde que el código se lo achique solo).
function portadaEnvolverMedido(ctx, texto, maxAncho, maxLineas, forzar) {
    const palabras = texto.trim().split(/\s+/).filter(Boolean);
    if (!palabras.length) return [''];
    const lineas = [''];
    for (const palabra of palabras) {
        const actual = lineas[lineas.length - 1];
        const candidata = actual ? `${actual} ${palabra}` : palabra;
        if (ctx.measureText(candidata).width <= maxAncho || !actual) {
            lineas[lineas.length - 1] = candidata;
        } else if (lineas.length < maxLineas) {
            lineas.push(palabra);
        } else if (forzar) {
            lineas[lineas.length - 1] = candidata;
        } else {
            return null;
        }
    }
    return lineas;
}

// Tamaño de letra más grande (de PORTADA_FONTSIZE_MAX hacia abajo) que deja el titular en como
// máximo 3 líneas sin desbordar el ancho útil, midiendo real en cada intento.
function portadaAjustarTamanoMedido(ctx, texto, claveFuente) {
    for (let fontsize = PORTADA_FONTSIZE_MAX; fontsize >= PORTADA_FONTSIZE_MIN; fontsize -= 3) {
        ctx.font = portadaFontCss(claveFuente, fontsize);
        const lineas = portadaEnvolverMedido(ctx, texto, PORTADA_ANCHO_UTIL, PORTADA_MAX_LINEAS, false);
        if (lineas) return { lineas, fontsize };
    }
    ctx.font = portadaFontCss(claveFuente, PORTADA_FONTSIZE_MIN);
    return {
        lineas: portadaEnvolverMedido(ctx, texto, PORTADA_ANCHO_UTIL, PORTADA_MAX_LINEAS, true),
        fontsize: PORTADA_FONTSIZE_MIN,
    };
}

// Rectángulo redondeado por camino (arcTo en vez de ctx.roundRect: soporte universal, incluidos
// navegadores algo viejos donde roundRect no existe).
function portadaCaminoCajaRedondeada(ctx, x, y, w, h, r) {
    const radio = Math.max(0, Math.min(r, w / 2, h / 2));
    ctx.beginPath();
    ctx.moveTo(x + radio, y);
    ctx.arcTo(x + w, y, x + w, y + h, radio);
    ctx.arcTo(x + w, y + h, x, y + h, radio);
    ctx.arcTo(x, y + h, x, y, radio);
    ctx.arcTo(x, y, x + w, y, radio);
    ctx.closePath();
}

// Dibuja el cartel completo (caja + línea blanca interior + texto) sobre un canvas de
// 1080x1920, con el fondo TRANSPARENTE — así el PNG que sale de acá se puede superponer sobre
// cualquier fotograma. Mismas proporciones que tenía portada.js, ahora en un solo lugar.
// Devuelve false si no hay titular (nada que dibujar).
function dibujarCartel(canvas, { titular, fuente, tamanoManual, escalaCaja }) {
    const ctx = canvas.getContext('2d');
    canvas.width = PORTADA_ANCHO_VIDEO;
    canvas.height = PORTADA_ALTO_VIDEO;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const texto = (titular || '').trim().toUpperCase();
    if (!texto) return false;

    const claveFuente = fuente || 'anton';
    let lineas, fontsize;
    if (Number.isFinite(tamanoManual)) {
        fontsize = Math.max(24, Math.min(160, Math.round(tamanoManual)));
        ctx.font = portadaFontCss(claveFuente, fontsize);
        lineas = portadaEnvolverMedido(ctx, texto, PORTADA_ANCHO_UTIL, PORTADA_MAX_LINEAS, true);
    } else {
        ({ lineas, fontsize } = portadaAjustarTamanoMedido(ctx, texto, claveFuente));
    }
    ctx.font = portadaFontCss(claveFuente, fontsize);

    // Geometría (mismas proporciones de siempre). El ancho de la caja ahora sale del texto MEDIDO,
    // no de una estimación conservadora: la burbuja abraza el texto real.
    const esc = Number.isFinite(escalaCaja) ? escalaCaja : 1;
    const padX = Math.round(fontsize * 0.32 * esc);
    const padY = Math.round(fontsize * 0.22 * esc);
    const lineHeight = Math.round(fontsize * 1.08);
    const lineSpacing = Math.round(fontsize * 0.08);
    const anchoMaxLinea = Math.max(...lineas.map(l => ctx.measureText(l).width));
    const boxW = Math.min(PORTADA_ANCHO_UTIL + padX * 2, Math.round(anchoMaxLinea + padX * 2));
    const boxH = lineas.length * lineHeight + (lineas.length - 1) * lineSpacing + padY * 2;
    const boxX = Math.round((PORTADA_ANCHO_VIDEO - boxW) / 2);
    const boxY = Math.round(PORTADA_ALTO_VIDEO * PORTADA_POS_Y_FRACCION);
    const radio = Math.max(14, Math.min(32, Math.round(fontsize * 0.4)));
    const sombra = Math.max(2, Math.round(fontsize * 0.045));
    // Línea blanca DENTRO de la caja (no un margen que la agrande): 3 formas concéntricas —
    // color, anillo blanco, color de nuevo.
    const separacion = Math.max(5, Math.round(fontsize * 0.11 * esc));
    const grosor = Math.max(3, Math.round(fontsize * 0.05));

    portadaCaminoCajaRedondeada(ctx, boxX, boxY, boxW, boxH, radio);
    ctx.fillStyle = PORTADA_COLOR_CAJA;
    ctx.fill();
    portadaCaminoCajaRedondeada(ctx, boxX + separacion, boxY + separacion,
        boxW - separacion * 2, boxH - separacion * 2, Math.max(4, radio - separacion));
    ctx.fillStyle = PORTADA_COLOR_TEXTO;
    ctx.fill();
    portadaCaminoCajaRedondeada(ctx, boxX + separacion + grosor, boxY + separacion + grosor,
        boxW - (separacion + grosor) * 2, boxH - (separacion + grosor) * 2,
        Math.max(4, radio - separacion - grosor));
    ctx.fillStyle = PORTADA_COLOR_CAJA;
    ctx.fill();

    ctx.fillStyle = PORTADA_COLOR_TEXTO;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.shadowColor = 'rgba(0,0,0,0.6)';
    ctx.shadowOffsetX = sombra;
    ctx.shadowOffsetY = sombra;
    ctx.shadowBlur = sombra * 1.5;
    const altoTexto = lineas.length * lineHeight + (lineas.length - 1) * lineSpacing;
    let y = boxY + boxH / 2 - altoTexto / 2 + lineHeight / 2;
    for (const linea of lineas) {
        ctx.fillText(linea, boxX + boxW / 2, y);
        y += lineHeight + lineSpacing;
    }
    ctx.shadowColor = 'transparent';
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = 0;
    ctx.shadowBlur = 0;
    return true;
}

// Lee los controles del Paso 6 y devuelve el diseño del cartel.
function leerDisenoCartel() {
    const titularEl = document.getElementById('portada-titular');
    if (!titularEl) return null;
    const autoEl = document.getElementById('portada-tamano-auto');
    const tamanoEl = document.getElementById('portada-tamano-num');
    const cajaEl = document.getElementById('portada-caja-num');
    return {
        titular: titularEl.value || '',
        fuente: document.getElementById('portada-fuente')?.value || 'anton',
        tamanoManual: autoEl && !autoEl.checked ? Number(tamanoEl?.value) || 94 : undefined,
        escalaCaja: (Number(cajaEl?.value) || 100) / 100,
    };
}

// La tipografía tiene que estar CARGADA antes de medir/dibujar: si no, el canvas mide y dibuja con
// una de reemplazo, y como este dibujo es el que se hornea en el video, la letra equivocada llega
// al resultado final (antes esto era solo un problema de la previa, porque el video lo dibujaba el
// server con libass y el .ttf real).
//
// Se carga el MISMO .ttf que usa el server (`/api/fuente/:clave`), no el de Google Fonts: así los
// dos lados comparten el archivo exacto, y no depende de que el CDN esté disponible. Se cachea la
// promesa por tipografía para no re-pedirla en cada tecla.
const fuentesCartelCargadas = new Map();
async function asegurarFuenteCargada(claveFuente) {
    if (!window.FontFace || !document.fonts) return false;
    if (!fuentesCartelCargadas.has(claveFuente)) {
        fuentesCartelCargadas.set(claveFuente, (async () => {
            try {
                const ff = new FontFace(`cartel-${claveFuente}`, `url(/api/fuente/${encodeURIComponent(claveFuente)})`);
                await ff.load();
                document.fonts.add(ff);
                return true;
            } catch (e) {
                // Solo se cachean los ÉXITOS: si falla (red caída, el server todavía no bajó el
                // .ttf), se borra la entrada para que el próximo intento vuelva a probar. Cachear
                // el fallo dejaría la tipografía rota hasta recargar la página, y el usuario
                // terminaría horneando el cartel con una letra de reemplazo sin poder corregirlo.
                fuentesCartelCargadas.delete(claveFuente);
                console.warn(`No se pudo cargar la tipografía "${claveFuente}" para el cartel:`, e.message);
                return false;
            }
        })());
    }
    return fuentesCartelCargadas.get(claveFuente);
}

// Aviso visible si la tipografía no cargó: el cartel se dibujaría con una letra de reemplazo Y ESA
// sería la que queda en el video. Mejor decirlo que hornear en silencio algo distinto a lo pedido.
function avisarFuenteCartel(ok) {
    const el = document.getElementById('portada-fuente-aviso');
    if (!el) return;
    el.textContent = ok ? '' : '⚠️ No se pudo cargar esa tipografía: el cartel se está dibujando con una letra de reemplazo, y así quedaría en el video. Revisá la conexión o elegí otra.';
    el.style.display = ok ? 'none' : 'block';
}

// Paso 6 — vista previa REAL: es el mismo canvas que después se exporta como PNG.
async function actualizarPortadaDiseno() {
    const canvas = document.getElementById('portada-diseno-canvas');
    const diseno = leerDisenoCartel();
    if (!canvas || !diseno) return;
    avisarFuenteCartel(await asegurarFuenteCargada(diseno.fuente));
    dibujarCartel(canvas, { ...diseno, titular: diseno.titular || '...' });
}

function initPortadaDiseno() {
    document.getElementById('portada-titular')?.addEventListener('input', actualizarPortadaDiseno);
    document.getElementById('portada-fuente')?.addEventListener('change', actualizarPortadaDiseno);
    actualizarPortadaDiseno();
}

// PNG del cartel tal como se ve en la previa, listo para mandar al server. Devuelve null si no
// hay titular (el usuario no quiere cartel). Es una data URL porque viaja dentro del JSON del
// pedido de generar video, junto al resto de los efectos.
async function exportarCartelPNG() {
    const diseno = leerDisenoCartel();
    if (!diseno || !diseno.titular.trim()) return null;
    await asegurarFuenteCargada(diseno.fuente);
    const canvas = document.createElement('canvas');
    if (!dibujarCartel(canvas, diseno)) return null;
    return canvas.toDataURL('image/png');
}

// Post-render — ELEGIR FOTO: fotograma real capturado del reproductor + EL PNG REAL del cartel
// encima (`cartelUrl`, el mismo archivo que el server ya quemó en el frame 0 y que va a usar para
// el JPG). Ya no se re-dibuja ni se aproxima nada acá: es la imagen final, estirada al mismo
// recuadro. Acá solo se elige la foto, nunca se re-edita el cartel.
function initPortadaLive(cartelUrl) {
    const videoEl = document.getElementById('result-video-player');
    const canvas = document.getElementById('portada-live-canvas');
    if (!videoEl || !canvas) return;

    const capturarFrame = () => {
        try {
            canvas.width = 270;
            canvas.height = 480;
            canvas.getContext('2d').drawImage(videoEl, 0, 0, canvas.width, canvas.height);
        } catch {} // video aún no tiene un frame decodificado (CORS/timing) — se reintenta en el próximo evento
    };

    videoEl.addEventListener('seeked', capturarFrame);
    videoEl.addEventListener('loadeddata', capturarFrame);

    // Primera captura: si el <video> ya está listo, directo; si no (carrera real medida: el
    // fetch de /api/fuentes-subtitulos que precede a esta función a veces tarda MÁS que la carga
    // del propio video local, así que el evento 'loadeddata' ya disparó antes de que este
    // listener se enganchara), reintenta cada 100ms hasta 2s en vez de quedarse con el canvas en
    // negro para siempre.
    let intentos = 0;
    const intentarCaptura = () => {
        if (videoEl.readyState >= 2 && videoEl.videoWidth > 0) capturarFrame();
        else if (intentos < 20) { intentos++; setTimeout(intentarCaptura, 100); }
    };
    intentarCaptura();
}

// Genera el JPG de portada: fotograma elegido en el player + EL MISMO cartel ya quemado en el
// frame 0 (texto/fuente/tamaño/caja vienen del server, guardados junto al preview — acá no se
// re-envían ni se re-editan, pedido explícito del usuario).
async function generarPortada() {
    const videoEl = document.getElementById('result-video-player');
    const destino = document.getElementById('portada-resultado');
    if (!state.previewToken) {
        alert('No hay preview del video disponible (generá el video de nuevo)');
        return;
    }
    setButtonDisabled('btn-generar-portada', true);
    destino.innerHTML = '';
    try {
        const { portadaUrl, guardadaJuntoAlVideo } = await apiCall('/portada', 'POST', {
            previewToken: state.previewToken,
            timestamp: videoEl ? videoEl.currentTime : 0,
        });
        const notaGuardado = guardadaJuntoAlVideo
            ? `<p class="hint">${icon('checkCircle')} Guardada junto al video, en su misma carpeta.</p>`
            : `<p class="hint">${icon('folderOpen')} No se pudo guardar junto al video — descargala y subila vos.</p>`;
        destino.innerHTML = `
            <img src="${portadaUrl}" alt="Portada" class="portada-preview">
            ${notaGuardado}
            <p><a href="${portadaUrl}" download="portada.jpg" class="btn btn-secondary">${icon('folderOpen')} Descargar portada (JPG)</a></p>
        `;
    } catch (e) {
        destino.innerHTML = `<p class="error-text">Error generando la portada: ${e.message}</p>`;
    } finally {
        setButtonDisabled('btn-generar-portada', false);
    }
}

// Rehacer el flujo con la misma fuente pero otro sesgo (nueva crónica → nuevo guion → nuevo video)
async function otroSesgo(sesgo) {
    if (!state.jobId || state.fuentes.length === 0) {
        alert('No hay fuente guardada, empieza de nuevo');
        return;
    }
    try {
        state.sesgo = sesgo;
        state.selectedAngle = null;
        state.guion = null;
        state.fragments = null;
        state.audioToken = null;
        state.selectedDestFolder = null;
        lockFrom('script-section');

        showProgress(`${icon('repeat')} Re-sintetizando con otro sesgo...`);
        log(`📝 Re-sintetizando (sesgo: ${sesgo}) — sin volver a descargar nada...`);
        updateProgress(20);

        // /resintetizar reusa las actas YA cacheadas en el job: no vuelve a tocar
        // audio/video/web de ninguna fuente (Fase 4 del plan maestro).
        const result = await apiCall('/resintetizar', 'POST', { jobId: state.jobId, sesgo });

        state.sourceData = { ...state.sourceData, ...result };
        document.getElementById('res-titulo').textContent = result.titulo;
        document.getElementById('res-descripcion').textContent = result.descripcion;
        document.getElementById('res-cronica').textContent = result.cronica;
        revealLectura();

        hideProgress();
        setStepStatus('fuente-section', 'done');
        setStepStatus('script-section', 'active');
        log('➡️ Selecciona un ángulo para continuar');
    } catch (error) {
        mostrarError(`Error re-sintetizando: ${error.message}`,
            () => otroSesgo(sesgo), 'fuente-section');
    }
}

// Copiar texto al portapapeles
function copyText(elementId) {
    const text = document.getElementById(elementId).textContent;
    navigator.clipboard.writeText(text).then(() => {
        log('📋 Copiado al portapapeles');
    }).catch(() => {
        // Fallback para navegadores sin clipboard API
        const ta = document.createElement('textarea');
        ta.value = text;
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
        log('📋 Copiado al portapapeles');
    });
}

// Scroll magnético: marca con clase 'snapped' SOLO el bloque más cercano al centro del contenedor
// (por distancia de centros, no por intersección — evita que varios queden "encendidos" a la vez).
// eje: 'y' (vertical, default) | 'x' (horizontal — usado por el carril de pasos)
function observarSnap(container, itemSelector, eje) {
    if (!container) return;
    const horizontal = eje === 'x';
    function actualizar() {
        const items = container.querySelectorAll(itemSelector);
        if (!items.length) return;
        const contRect = container.getBoundingClientRect();
        const contCenter = horizontal
            ? contRect.left + contRect.width / 2
            : contRect.top + contRect.height / 2;
        let masCercano = null;
        let menorDistancia = Infinity;
        items.forEach(item => {
            const r = item.getBoundingClientRect();
            const centro = horizontal ? r.left + r.width / 2 : r.top + r.height / 2;
            const distancia = Math.abs(centro - contCenter);
            if (distancia < menorDistancia) { menorDistancia = distancia; masCercano = item; }
        });
        items.forEach(item => item.classList.toggle('snapped', item === masCercano));
    }
    let esperando = false;
    container.addEventListener('scroll', () => {
        if (esperando) return;
        esperando = true;
        requestAnimationFrame(() => { actualizar(); esperando = false; });
    });
    actualizar();
}

// Carrusel de Procesos: un paso completo a la vez, navegado con flechas + indicador "Paso X de 6".
function contenedorPasos() {
    return document.querySelector('.col-procesos .scroll-snap-col');
}

function actualizarPasosIndicador() {
    const cont = contenedorPasos();
    const el = document.getElementById('pasos-nav-indicador');
    if (!cont || !el || !cont.clientWidth) return;
    const total = cont.querySelectorAll('.form-section').length;
    const idx = Math.min(total - 1, Math.max(0, Math.round(cont.scrollLeft / cont.clientWidth)));
    el.textContent = `Paso ${idx + 1} de ${total}`;
}

function pasoSiguiente() {
    const cont = contenedorPasos();
    if (!cont) return;
    cont.scrollBy({ left: cont.clientWidth, behavior: 'smooth' });
    setTimeout(actualizarPasosIndicador, 350);
}

function pasoAnterior() {
    const cont = contenedorPasos();
    if (!cont) return;
    cont.scrollBy({ left: -cont.clientWidth, behavior: 'smooth' });
    setTimeout(actualizarPasosIndicador, 350);
}

// Historial ÚNICO (jobStore): todo proceso, terminado o no, con badge de estado y paso.
// Se carga solo (sin botón); muestra las 3 más recientes visibles y el resto con scroll magnético.
// Click en el título expande/colapsa el resto de la info de ese proceso.
const ESTADO_PROCESO = {
    terminado: { icon: 'checkCircle', texto: 'Terminado' },
    en_proceso: { icon: 'lockOpen', texto: 'En proceso' },
    incompleto: { icon: 'hourglass', texto: 'Incompleto' },
};
const PASO_NUM = { lectura: 1, guion: 2, fragmentacion: 3, audio: 4, completado: 5 };

// Tarjeta para un job del jobStore (tiene jobId: siempre se puede reabrir/continuar)
function crearTarjetaJob(job) {
    const info = ESTADO_PROCESO[job.estado] || ESTADO_PROCESO.incompleto;
    const paso = PASO_NUM[job.paso] || 1;
    const canalNombre = job.folderName || canalesMap[job.canalId] || '-';
    const fecha = new Date(job.actualizado).toLocaleString();

    const item = document.createElement('div');
    item.className = 'historial-item';

    const header = document.createElement('div');
    header.className = 'historial-item-header';
    header.innerHTML = `
        <div class="historial-item-titulo">${job.titulo || job.nombreCorto || '(sin título)'}</div>
        <div class="historial-item-meta">
            <span>${icon(info.icon)} ${info.texto}</span>
            <span>Paso ${paso}/5</span>
            <span>${icon('userFocus')} ${job.protagonista || '-'}</span>
            <span>${icon('televisionSimple')} ${canalNombre}</span>
            <span>${icon('calendar')} ${fecha}</span>
        </div>
    `;

    const body = document.createElement('div');
    body.className = 'historial-item-body';
    body.innerHTML = `
        <p><a class="btn btn-primary link-btn" href="/?jobId=${job.jobId}" target="_blank" rel="noopener">${icon('play')} ${job.estado === 'terminado' ? 'Abrir para hacer otro video' : 'Continuar en pestaña nueva'}</a></p>
        <div class="copy-block">
            <div class="copy-header">
                <label>Título</label>
                <button class="btn-copy" onclick="navigator.clipboard.writeText(${JSON.stringify(job.titulo || '')}); log('📋 Título copiado del historial')">${icon('copy')} Copiar</button>
            </div>
            <p class="copy-content">${job.titulo || '-'}</p>
        </div>
        <div class="copy-block">
            <div class="copy-header">
                <label>Descripción + Hashtags</label>
                <button class="btn-copy" onclick="navigator.clipboard.writeText(${JSON.stringify(job.descripcion || '')}); log('📋 Descripción copiada del historial')">${icon('copy')} Copiar</button>
            </div>
            <p class="copy-content">${job.descripcion || '-'}</p>
        </div>
        <p><strong>Protagonista:</strong> ${job.protagonista || '-'} &nbsp;|&nbsp; <strong>Canal:</strong> ${canalNombre}</p>
        ${job.fileName ? `<p><strong>Archivo:</strong> ${job.fileName}</p>` : ''}
        ${job.driveLink ? `<p><a href="${job.driveLink}" target="_blank">${icon('link')} Ver video en Drive</a></p>` : ''}
        ${job.insumosLimpiados ? `<p class="nota-limpieza">${icon('trash')} Insumos borrados por antigüedad (más de 48h). El guion y la descripción siguen acá; la locución habría que regenerarla.</p>` : ''}
        ${job.script ? `
        <div class="copy-block mt-sm">
            <div class="copy-header">
                <label>Guion</label>
                <button class="btn-copy" onclick="navigator.clipboard.writeText(${JSON.stringify(job.script)}); log('📋 Guion copiado del historial')">${icon('copy')} Copiar</button>
            </div>
            <p class="copy-content">${job.script}</p>
        </div>` : ''}
    `;
    return { item, header, body };
}

// Tarjeta para una fila de la Hoja de Cálculo (historial real, sin jobId — no se puede reabrir,
// pero es la fuente autoritativa de TODO video ya publicado, incluidos los de antes del jobStore)
function crearTarjetaSheet(fila) {
    const item = document.createElement('div');
    item.className = 'historial-item';

    const header = document.createElement('div');
    header.className = 'historial-item-header';
    header.innerHTML = `
        <div class="historial-item-titulo">${fila.titulo || '(sin título)'}</div>
        <div class="historial-item-meta">
            <span>${icon('checkCircle')} Terminado</span>
            <span>${icon('userFocus')} ${fila.protagonista || '-'}</span>
            <span>${icon('televisionSimple')} ${fila.canal || '-'}</span>
            <span>${icon('calendar')} ${fila.fecha || '-'}</span>
        </div>
    `;

    const body = document.createElement('div');
    body.className = 'historial-item-body';
    body.innerHTML = `
        <div class="copy-block">
            <div class="copy-header">
                <label>Título</label>
                <button class="btn-copy" onclick="navigator.clipboard.writeText(${JSON.stringify(fila.titulo || '')}); log('📋 Título copiado del historial')">${icon('copy')} Copiar</button>
            </div>
            <p class="copy-content">${fila.titulo || '-'}</p>
        </div>
        <div class="copy-block">
            <div class="copy-header">
                <label>Descripción + Hashtags</label>
                <button class="btn-copy" onclick="navigator.clipboard.writeText(${JSON.stringify(fila.descripcion || '')}); log('📋 Descripción copiada del historial')">${icon('copy')} Copiar</button>
            </div>
            <p class="copy-content">${fila.descripcion || '-'}</p>
        </div>
        <p><strong>Protagonista:</strong> ${fila.protagonista || '-'} &nbsp;|&nbsp; <strong>Canal:</strong> ${fila.canal || '-'}</p>
        ${fila.nombreArchivo ? `<p><strong>Archivo:</strong> ${fila.nombreArchivo}</p>` : ''}
        ${fila.linkRender ? `<p><a href="${fila.linkRender}" target="_blank">${icon('link')} Ver video en Drive</a></p>` : ''}
        ${fila.guion ? `
        <div class="copy-block mt-sm">
            <div class="copy-header">
                <label>Guion</label>
                <button class="btn-copy" onclick="navigator.clipboard.writeText(${JSON.stringify(fila.guion)}); log('📋 Guion copiado del historial')">${icon('copy')} Copiar</button>
            </div>
            <p class="copy-content">${fila.guion}</p>
        </div>` : ''}
    `;
    return { item, header, body };
}

// Historial ÚNICO: fusiona el jobStore (procesos recientes, con estado/paso, reabribles) con la
// Hoja de Cálculo (registro real de TODO video publicado, incluidos los de antes de este sistema).
// Evita duplicar un video que ya está en ambos lados (mismo título) mostrando solo la versión con jobId.
async function cargarHistorial() {
    const cont = document.getElementById('historial-lista');
    cont.style.maxHeight = '';
    cont.innerHTML = '<p class="hint">Cargando...</p>';
    try {
        const [jobsResult, sheetResult] = await Promise.all([
            apiCall('/jobs').catch(() => ({ jobs: [] })),
            apiCall('/historial').catch(() => ({ historial: [] })),
        ]);
        const jobs = jobsResult.jobs || [];
        const titulosEnJobs = new Set(jobs.map(j => j.titulo).filter(Boolean));
        const filasSheet = (sheetResult.historial || []).filter(f => !titulosEnJobs.has(f.titulo));

        const entradas = [
            ...jobs.map(job => ({ fecha: job.actualizado, construir: () => crearTarjetaJob(job) })),
            ...filasSheet.map(fila => ({ fecha: fila.fecha, construir: () => crearTarjetaSheet(fila) })),
        ].sort((a, b) => new Date(b.fecha) - new Date(a.fecha));

        if (entradas.length === 0) {
            cont.innerHTML = '<p class="hint">Sin registros todavía.</p>';
            return;
        }
        cont.innerHTML = '';
        const items = [];
        entradas.forEach(entrada => {
            const { item, header, body } = entrada.construir();
            header.onclick = () => {
                body.classList.toggle('abierto');
                actualizarAltoHistorial();
            };
            item.appendChild(header);
            item.appendChild(body);
            cont.appendChild(item);
            items.push(item);
        });

        // Alto del contenedor: si nada está expandido, una tarjeta completa + un pedacito de la
        // siguiente (asoma, invita a scrollear). Si algo se expandió, un alto acotado con scroll
        // interno (NO el alto de toda la tarjeta abierta ni "toda la página") para poder leerla
        // completa sin que empuje el resto del layout.
        function actualizarAltoHistorial() {
            const hayExpandido = items.some(it => it.children[1].classList.contains('abierto'));
            if (hayExpandido) {
                cont.style.maxHeight = '70vh';
                return;
            }
            let alto = 20; // padding-top del contenedor (deja espacio para el badge "Viendo")
            alto += items[0].offsetHeight;
            if (items.length > 1) {
                alto += 8; // separación (margin-bottom) hasta la siguiente tarjeta
                alto += Math.max(20, Math.round(items[1].offsetHeight * 0.3)); // pedacito visible de la siguiente
            }
            cont.style.maxHeight = alto + 'px';
        }
        actualizarAltoHistorial();
        observarSnap(cont, '.historial-item');
    } catch (error) {
        cont.innerHTML = `<p class="error-text">Error cargando historial: ${error.message}</p>`;
    }
}

// Recuperación de proceso pendiente (jobId guardado en localStorage de una sesión anterior)
let jobPendiente = null;

async function chequearJobPendiente() {
    const jobId = sessionStorage.getItem('farandula_job_id');
    if (!jobId || !API_KEY) return;
    try {
        const job = await apiCall(`/jobs/${jobId}`);
        if (job && job.paso !== 'completado') {
            jobPendiente = job;
            document.getElementById('recuperar-banner').classList.remove('hidden');
        } else {
            sessionStorage.removeItem('farandula_job_id');
        }
    } catch {
        // Job no encontrado (expiró, se podó, o server reiniciado): limpiar referencia vieja
        sessionStorage.removeItem('farandula_job_id');
    }
}

// Carga directa (sin banner) de un job pasado por ?jobId= en la URL — usado al abrir
// un proceso del historial en una pestaña nueva. true si logró cargar algo.
async function cargarDesdeURL() {
    const jobId = new URLSearchParams(location.search).get('jobId');
    if (!jobId || !API_KEY) return false;
    try {
        const job = await apiCall(`/jobs/${jobId}`);
        if (!job) return false;
        jobPendiente = job;
        sessionStorage.setItem('farandula_job_id', jobId);
        await recuperarJobPendiente();
        return true;
    } catch (e) {
        log(`⚠️ No se pudo cargar el proceso ${jobId}: ${e.message}`);
        return false;
    }
}

// Rehidrata state + UI según en qué etapa quedó el job, sin repetir pasos ya hechos
async function recuperarJobPendiente() {
    if (!jobPendiente) return;
    const job = jobPendiente;
    document.getElementById('recuperar-banner').classList.add('hidden');

    state.jobId = job.jobId;
    // job.fuentes es lo nuevo (Fase 4, multifuente); job.fuente (singular) es de jobs viejos
    // guardados antes de esa fase — se adapta al formato nuevo para no romper la recuperación.
    state.fuentes = job.fuentes || (job.fuente ? [job.fuente] : []);
    state.sesgo = job.sesgo || job.fuente?.sesgo || 'neutral';
    state.materialesAdicionales = job.materialesAdicionales || [];
    renderMaterialesLista();

    // Job de videos gemelos: se repuebla la segunda pestaña con lo que ese video ya tenía. Un job
    // viejo (o de un solo video) no trae `gemela` y todo sigue exactamente igual que antes.
    if (job.gemela) {
        state.gemelos = true;
        state.B = { ...nuevaVarianteB(), ...job.gemela, aprobado: {} };
        const chk = document.getElementById('chk-gemelos');
        if (chk) chk.checked = true;
        document.querySelectorAll('[data-tabs]').forEach(t => t.classList.remove('hidden'));
        state.varianteActiva = 'A';
        actualizarTabs();
        log('👯 Este proceso tiene video gemelo: usá las pestañas para pasar de uno al otro');
    }
    const primerLink = state.fuentes.find(f => f.type === 'link');
    state.sourceData = {
        cronica: job.cronica, titulo: job.titulo, descripcion: job.descripcion,
        protagonista: job.protagonista, secundario: job.secundario,
        accion: job.accion, nombreCorto: job.nombreCorto,
        linkFuente: primerLink ? primerLink.content : '',
    };

    document.getElementById('res-titulo').textContent = job.titulo || '';
    document.getElementById('res-descripcion').textContent = job.descripcion || '';
    document.getElementById('res-cronica').textContent = job.cronica || '';
    revealLectura();
    renderFuentesLista();
    setStepStatus('fuente-section', 'done');
    log(`🔁 Proceso recuperado (etapa: ${job.paso})`);

    if (job.paso === 'lectura') {
        setStepStatus('script-section', 'active');
        return;
    }

    state.guion = job.script || '';
    document.getElementById('guion-editor').value = state.guion;
    actualizarStatsGuion();
    if (state.guion) renderProductoGuion(state.guion);
    setStepStatus('script-section', 'done');
    if (job.paso === 'guion') {
        setStepStatus('guion-section', 'active');
        return;
    }

    state.fragments = job.fragments || [];
    state.carpetas = job.carpetas || [];
    setStepStatus('guion-section', 'done');
    if (job.paso === 'fragmentacion') {
        renderAsignaciones(false, state.sourceData.protagonista);
        setStepStatus('revision-section', 'active');
        return;
    }

    state.audioToken = job.audioToken;
    setStepStatus('revision-section', 'done');
    if (job.paso === 'audio') {
        document.getElementById('audio-info').textContent = `Duración: ${Math.round(job.duracion || 0)}s | Modelo: ${job.modelo || ''}`;
        const player = document.getElementById('audio-player');
        player.src = apiBase() + '/api/audio/' + job.audioToken + '?t=' + Date.now();
        player.load();
        renderProductoAudio(player.src);
        setStepStatus('audio-section', 'active');
        return;
    }

    // completado: ya generó un video con este guion/asignaciones. El audioToken viejo puede
    // haber quedado inválido (vivía solo en memoria del server, se pierde en cada redeploy),
    // así que en vez de intentar reproducirlo se deja lista la revisión de carpetas (paso 4):
    // desde ahí, confirmar → regenera locución fresca → elegir destino → generar OTRO video
    // con el mismo guion, sin repetir lectura ni redacción.
    if (job.fileName || job.driveLink) {
        renderProductoFinal({ driveLink: job.driveLink });
        log(`✅ Este proceso ya generó: ${job.fileName || 'un video'}${job.driveLink ? ` — ${job.driveLink}` : ''}`);
    }
    log('🔁 Confirma las asignaciones para regenerar locución y crear OTRO video con el mismo guion (o edita el guion/ángulo arriba antes de confirmar).');
    renderAsignaciones(false, state.sourceData.protagonista);
    setStepStatus('revision-section', 'active');
}

function descartarJobPendiente() {
    sessionStorage.removeItem('farandula_job_id');
    jobPendiente = null;
    document.getElementById('recuperar-banner').classList.add('hidden');
    log('🗑️ Proceso pendiente descartado');
}

// Nombre de canal a partir de su id (poblado por cargarCanales) — para mostrarlo en el historial
const canalesMap = {};

// Cargar canales de insumos en el dropdown de Paso 1
async function cargarCanales() {
    try {
        const response = await apiCall('/canales', 'GET');
        const select = document.getElementById('canal-select');
        select.innerHTML = '';
        if (response.canales && response.canales.length > 0) {
            response.canales.forEach(canal => {
                canalesMap[canal.id] = canal.name;
                const option = document.createElement('option');
                option.value = canal.id;
                option.textContent = canal.name;
                select.appendChild(option);
            });
        } else {
            const option = document.createElement('option');
            option.textContent = 'No hay canales disponibles';
            option.disabled = true;
            select.appendChild(option);
        }
    } catch (error) {
        log(`⚠️ Error cargando canales: ${error.message}`);
        const select = document.getElementById('canal-select');
        select.innerHTML = '<option disabled>Error cargando canales</option>';
    }
}

// Inicialización
// Inserta los iconos declarados en HTML como <span data-icon="nombreIcono">
// --- Vista previa de tamaño/posición de subtítulos ---
// No es un render real: un mockup a escala del canvas 1080x1920 que usa subtitulos.js (Fase 6),
// con la palabra de ejemplo arrastrable verticalmente y un slider de tamaño. Los valores por
// defecto tienen que calzar con TAMANO_DEFAULT/MARGIN_V de subtitulos.js — si se cambian ahí,
// cambiar acá también.
const SUBS_PLAYRES_Y = 1920;
const SUBS_PLAYRES_X = 1080;
// Mismo ancho útil que ANCHO_UTIL de subtitulos.js (PlayResX menos los márgenes del Style).
const SUBS_ANCHO_UTIL = SUBS_PLAYRES_X - 60 - 60;
let subsTamano = 210;
let subsMarginV = 606;
let subsFuente = 'bangers';

// Zonas que cada app tapa con su propia interfaz, en píxeles del canvas 1080x1920.
//
// Origen (2026-08-16): medidas de las plantillas oficiales de zona segura 9:16 que pasó el
// usuario (TikTok, Cortos de YouTube y Reels de Facebook), calibrando el marco de cada imagen
// contra 1080x1920. Reemplazan a la primera tanda de valores, que eran de referencia general.
//
// ⚠️ Siguen siendo APROXIMADAS: leídas de una imagen, con ±10px de error de medición, y las
// plantillas mismas cambian entre versiones de cada app y entre modelos de teléfono (una pantalla
// con notch alto come más arriba). Sirven para NO poner el subtítulo donde con seguridad hay
// botones, no como garantía al píxel. Este es el ÚNICO lugar donde viven: para afinarlas, tocar
// acá y nada más.
const SUBS_ZONAS_APPS = [
  { nombre: 'TikTok',          color: '#ff2d55', arriba: 181, abajo: 292, derecha: 174 },
  { nombre: 'YouTube Shorts',  color: '#ff4444', arriba: 181, abajo: 195, derecha: 169 },
  { nombre: 'Facebook Reels',  color: '#4a9eff', arriba: 191, abajo: 302, derecha: 164 },
];
// Bandas laterales marcadas "SE CORTARÁ" en las tres plantillas (idénticas en las tres): en
// pantallas más angostas que 9:16 esos bordes se recortan, así que ahí no va nada importante.
const SUBS_CORTE_LATERAL = 48;
// La zona realmente segura es la INTERSECCIÓN: hay que respetar el límite más exigente de las
// tres, no el de una sola.
const SUBS_LIMITE_ARRIBA = Math.max(...SUBS_ZONAS_APPS.map(z => z.arriba));
const SUBS_LIMITE_ABAJO = Math.max(...SUBS_ZONAS_APPS.map(z => z.abajo));
const SUBS_LIMITE_DERECHA = Math.max(...SUBS_ZONAS_APPS.map(z => z.derecha));

// Mapeo clave del catálogo (subtitulos.js) → familia/peso CSS que carga el <link> de Google
// Fonts en index.html. Es SOLO para que el preview se vea con la tipografía real — el render
// final sigue self-hosted con ffmpeg (fontsdir), esto no lo toca. Si se agrega una fuente al
// catálogo del servidor, agregar acá su equivalente CSS y el <link> del <head>.
const SUBS_FUENTES_CSS = {
    anton:     { family: 'Anton',         weight: 400 },
    poppins:   { family: 'Poppins',       weight: 800 },
    bebas:     { family: 'Bebas Neue',    weight: 400 },
    archivo:   { family: 'Archivo Black', weight: 400 },
    bangers:   { family: 'Bangers',       weight: 400 },
    righteous: { family: 'Righteous',     weight: 400 },
    passion:   { family: 'Passion One',   weight: 900 },
    kanit:     { family: 'Kanit',         weight: 800 },
    luckiest:  { family: 'Luckiest Guy',  weight: 400 },
};

// Trae el catálogo real de subtitulos.js (server.js expone /api/fuentes-subtitulos) — si falla
// (sin conexión, key inválida), el selector se queda con la única opción por defecto y el
// render igual funciona con Anton, que es lo que ya manda el server si no llega `fuente`.
// Catálogo de tonos de música (Fase 8) — agrega los 7 tonos DESPUÉS de "Automático" (que no es
// parte de gemini.TONOS, es una opción propia de la UI). Si falla, se queda solo "Automático" —
// el server igual funciona, usa el tono que detectó la síntesis.
async function cargarTonosMusica() {
    const select = document.getElementById('musica-tono');
    if (!select) return;
    try {
        const { tonos } = await apiCall('/tonos-musica', 'GET');
        const NOMBRES = {
            tragedia: 'Tragedia', tension: 'Tensión', escandalo: 'Escándalo',
            alegre: 'Alegre', romantico: 'Romántico', misterio: 'Misterio', neutral: 'Neutral',
        };
        select.innerHTML += tonos.map(t => `<option value="${t}">${NOMBRES[t] || t}</option>`).join('');
    } catch (e) {
        console.warn('No se pudo cargar el catálogo de tonos de música, se usa "Automático":', e.message);
    }
}

async function cargarFuentesSubtitulos() {
    const select = document.getElementById('subs-fuente');
    if (!select) return;
    try {
        const { fuentes, default: porDefecto } = await apiCall('/fuentes-subtitulos', 'GET');
        select.innerHTML = fuentes.map(f => `<option value="${f.clave}">${f.familia}</option>`).join('');
        subsFuente = porDefecto || fuentes[0]?.clave || 'anton';
        select.value = subsFuente;
    } catch (e) {
        console.warn('No se pudo cargar el catálogo de tipografías, se usa Anton por defecto:', e.message);
    }
}

// Versión genérica de lo de arriba, para selects que no necesitan trackear `subsFuente` (ej.
// el de la portada). Mismo catálogo/endpoint, no toca la fuente elegida para los subtítulos.
async function cargarFuentesEnSelect(selectId) {
    const select = document.getElementById(selectId);
    if (!select) return;
    try {
        const { fuentes, default: porDefecto } = await apiCall('/fuentes-subtitulos', 'GET');
        select.innerHTML = fuentes.map(f => `<option value="${f.clave}">${f.familia}</option>`).join('');
        select.value = porDefecto || fuentes[0]?.clave || 'anton';
    } catch (e) {
        console.warn(`No se pudo cargar el catálogo de tipografías para #${selectId}:`, e.message);
    }
}

// Cuadrícula de referencia: 10 columnas x 10 filas sobre el canvas real. Las líneas de los
// tercios van más marcadas (regla de composición) que el resto.
function subsDibujarCuadricula(ctx) {
    const pasoX = SUBS_PLAYRES_X / 10;
    const pasoY = SUBS_PLAYRES_Y / 10;
    ctx.lineWidth = 2;
    for (let i = 1; i < 10; i++) {
        const tercioV = i === 3 || i === 7;   // 30% y 70% ~ tercios verticales
        ctx.strokeStyle = tercioV ? 'rgba(255,255,255,0.20)' : 'rgba(255,255,255,0.07)';
        ctx.beginPath(); ctx.moveTo(i * pasoX, 0); ctx.lineTo(i * pasoX, SUBS_PLAYRES_Y); ctx.stroke();
        ctx.strokeStyle = tercioV ? 'rgba(255,255,255,0.20)' : 'rgba(255,255,255,0.07)';
        ctx.beginPath(); ctx.moveTo(0, i * pasoY); ctx.lineTo(SUBS_PLAYRES_X, i * pasoY); ctx.stroke();
    }
}

// Zonas tapadas por la interfaz de las apps: un velo rojo sobre la UNIÓN (lo que hay que evitar
// sí o sí) más una línea por app en su propio color, para saber cuál manda cada límite. Las
// bandas laterales "SE CORTARÁ" van con rayado propio, porque no son UI encima: es recorte, el
// contenido de ahí directamente no se ve.
function subsDibujarZonasSeguras(ctx) {
    ctx.fillStyle = 'rgba(255,60,60,0.16)';
    ctx.fillRect(0, 0, SUBS_PLAYRES_X, SUBS_LIMITE_ARRIBA);
    ctx.fillRect(0, SUBS_PLAYRES_Y - SUBS_LIMITE_ABAJO, SUBS_PLAYRES_X, SUBS_LIMITE_ABAJO);
    ctx.fillRect(SUBS_PLAYRES_X - SUBS_LIMITE_DERECHA, SUBS_LIMITE_ARRIBA,
                 SUBS_LIMITE_DERECHA, SUBS_PLAYRES_Y - SUBS_LIMITE_ARRIBA - SUBS_LIMITE_ABAJO);

    // Bandas de recorte lateral, a los dos lados.
    ctx.fillStyle = 'rgba(190,20,90,0.38)';
    ctx.fillRect(0, 0, SUBS_CORTE_LATERAL, SUBS_PLAYRES_Y);
    ctx.fillRect(SUBS_PLAYRES_X - SUBS_CORTE_LATERAL, 0, SUBS_CORTE_LATERAL, SUBS_PLAYRES_Y);

    ctx.setLineDash([18, 14]);
    ctx.lineWidth = 4;
    for (const z of SUBS_ZONAS_APPS) {
        ctx.strokeStyle = z.color;
        ctx.beginPath();
        ctx.moveTo(0, SUBS_PLAYRES_Y - z.abajo);
        ctx.lineTo(SUBS_PLAYRES_X - z.derecha, SUBS_PLAYRES_Y - z.abajo);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(0, z.arriba);
        ctx.lineTo(SUBS_PLAYRES_X - z.derecha, z.arriba);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(SUBS_PLAYRES_X - z.derecha, z.arriba);
        ctx.lineTo(SUBS_PLAYRES_X - z.derecha, SUBS_PLAYRES_Y - z.abajo);
        ctx.stroke();
    }
    ctx.setLineDash([]);
}

// Pinta el preview completo: cuadrícula + zonas + la palabra de ejemplo en su tamaño y posición
// REALES sobre 1080x1920 (antes era una aproximación en CSS a 202px de ancho).
//
// Ojo, diferencia honesta con el cartel de portada: ese canvas ES el archivo que se superpone,
// así que previa y resultado son idénticos por construcción. Acá NO — los subtítulos los quema
// libass desde el .ass, con su propio motor de texto. La geometría (posición, tamaño, márgenes)
// sí es fiel; el dibujo exacto de cada letra puede variar un pelo respecto del render final.
function dibujarPreviewSubs(canvas) {
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    canvas.width = SUBS_PLAYRES_X;
    canvas.height = SUBS_PLAYRES_Y;

    ctx.fillStyle = '#1a1a1a';
    ctx.fillRect(0, 0, SUBS_PLAYRES_X, SUBS_PLAYRES_Y);
    subsDibujarCuadricula(ctx);
    subsDibujarZonasSeguras(ctx);

    // Mismo resguardo que tamanoSeguro() en subtitulos.js: si la palabra no entra en el ancho
    // útil, se achica hasta que quepa — igual que pasaría en el render real con una palabra larga.
    const f = SUBS_FUENTES_CSS[subsFuente] || SUBS_FUENTES_CSS.anton;
    let tam = subsTamano;
    ctx.font = `${f.weight} ${tam}px '${f.family}', sans-serif`;
    const ancho = ctx.measureText('PALABRA').width;
    if (ancho > SUBS_ANCHO_UTIL) {
        tam = Math.max(20, Math.floor(tam * (SUBS_ANCHO_UTIL / ancho)));
        ctx.font = `${f.weight} ${tam}px '${f.family}', sans-serif`;
    }

    const yTexto = SUBS_PLAYRES_Y - subsMarginV;
    // Línea de la posición elegida, para leerla contra la cuadrícula sin depender de la palabra.
    ctx.strokeStyle = 'rgba(247,194,4,0.75)';
    ctx.lineWidth = 3;
    ctx.setLineDash([10, 10]);
    ctx.beginPath(); ctx.moveTo(0, yTexto); ctx.lineTo(SUBS_PLAYRES_X, yTexto); ctx.stroke();
    ctx.setLineDash([]);

    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = '#000';
    ctx.lineWidth = Math.max(4, tam * 0.06);   // contorno, como el Outline 4 del Style del .ass
    ctx.strokeText('PALABRA', SUBS_PLAYRES_X / 2, yTexto);
    ctx.fillStyle = '#fff';
    ctx.fillText('PALABRA', SUBS_PLAYRES_X / 2, yTexto);
}

function initSubsPreview() {
    const slider = document.getElementById('subs-tamano');
    const numInput = document.getElementById('subs-tamano-num');
    const preview = document.getElementById('subs-preview');
    const canvas = document.getElementById('subs-preview-canvas');
    const selectFuente = document.getElementById('subs-fuente');
    const lecturaPos = document.getElementById('subs-pos-valor');
    if (!slider || !preview || !canvas) return;

    const repintar = () => {
        dibujarPreviewSubs(canvas);
        if (lecturaPos) lecturaPos.textContent = subsMarginV;
    };

    // Slider y número escriben el MISMO valor — pedido del usuario: poder tipear el tamaño
    // directo en vez de solo arrastrar. Los dos controles se mantienen sincronizados entre sí.
    const fijarTamano = (nuevo) => {
        if (!Number.isFinite(nuevo)) return;
        subsTamano = Math.min(360, Math.max(80, Math.round(nuevo)));
        slider.value = subsTamano;
        if (numInput) numInput.value = subsTamano;
        repintar();
    };

    slider.addEventListener('input', () => fijarTamano(Number(slider.value)));
    numInput?.addEventListener('input', () => {
        if (numInput.value === '') return; // dejar escribir sin recortar a mitad de tecleo
        fijarTamano(Number(numInput.value));
    });
    // Al salir del campo, normaliza (recorta al rango 80-360 si quedó vacío o fuera de rango).
    numInput?.addEventListener('blur', () => fijarTamano(subsTamano));

    selectFuente?.addEventListener('change', async () => {
        subsFuente = selectFuente.value;
        await asegurarFuenteCargada(subsFuente); // sin esto el canvas mide con una letra de reemplazo
        repintar();
    });

    // Arrastrar en CUALQUIER punto del preview (antes solo agarraba la palabra, que a este tamaño
    // es un blanco chico y difícil de pegarle).
    let arrastrando = false;
    const moverA = (clientY) => {
        const rect = preview.getBoundingClientRect();
        const desdeAbajoPx = Math.max(0, Math.min(rect.height, rect.bottom - clientY));
        subsMarginV = Math.round((desdeAbajoPx / rect.height) * SUBS_PLAYRES_Y);
        repintar();
    };
    preview.addEventListener('pointerdown', e => {
        arrastrando = true;
        preview.setPointerCapture(e.pointerId);
        moverA(e.clientY);
    });
    preview.addEventListener('pointermove', e => { if (arrastrando) moverA(e.clientY); });
    preview.addEventListener('pointerup', () => { arrastrando = false; });
    preview.addEventListener('pointercancel', () => { arrastrando = false; });

    if (numInput) numInput.value = subsTamano;
    asegurarFuenteCargada(subsFuente).then(repintar);
    repintar();
}

function aplicarIconos() {
    document.querySelectorAll('[data-icon]').forEach(el => {
        el.innerHTML = (typeof ICONS !== 'undefined' && ICONS[el.dataset.icon]) || '';
        el.classList.add('icon-slot');
    });
}

document.addEventListener('DOMContentLoaded', () => {
    aplicarIconos();
    document.querySelectorAll('.steps-grid .form-section[id]').forEach(el => actualizarStepBadge(el, el.dataset.status));
    log('✅ App iniciada');
    initApiKey();
    if (API_KEY) {
        iniciarSesion();
    }
    observarSnap(document.querySelector('.col-procesos .scroll-snap-col'), '.form-section', 'x');
    cargarFuentesSubtitulos().then(initSubsPreview);
    cargarFuentesEnSelect('portada-fuente').then(initPortadaDiseno);
    initPortadaTamano();
    initPortadaCaja();
    cargarTonosMusica();
    if (API_KEY) iniciarPanelCola();
    const contPasos = contenedorPasos();
    if (contPasos) contPasos.addEventListener('scroll', actualizarPasosIndicador);
    actualizarPasosIndicador();
});
