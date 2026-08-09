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

// Bloque C: rehacer un paso ya completado (editar y reenviar) invalida todo lo posterior.
// Se llama al INICIO de cada función que muta el pipeline, antes de la llamada a la API.
const STEP_ORDER = ['fuente-section', 'script-section', 'guion-section', 'revision-section', 'audio-section', 'destination-section'];
function lockFrom(stepId) {
    const idx = STEP_ORDER.indexOf(stepId);
    if (idx === -1) return;
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
    state = { jobId: null, sourceData: null, selectedAngle: null, selectedDestFolder: null, cronista: null, guion: null, fragments: null, carpetas: [], audioToken: null, fuentes: [], sesgo: 'neutral', avisoReconstruccion: null };
    renderFuentesLista();
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
};
const MAX_FUENTES = 6;

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
        });

        log('✅ Guion generado');
        state.guion = result.script;
        renderProductoGuion(result.script);
        updateProgress(50);

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
    state.guion = texto;
    renderProductoGuion(texto);
    log('✅ Guion aprobado');

    setButtonDisabled('btn-approve-guion', true);
    try {
        // Rehacer la aprobación (guion editado) invalida audio/destino ya hechos
        state.audioToken = null;
        state.selectedDestFolder = null;
        lockFrom('revision-section');

        showProgress(`${icon('folderOpen')} Asignando carpetas...`);
        log('📂 Asignando carpetas a los párrafos...');
        updateProgress(52);
        const result = await apiCall(cfg().asignar, 'POST', {
            [cfg().asignarParam]: state.guion,
            protagonista: state.sourceData?.protagonista,
            jobId: state.jobId,
        });
        state.fragments = result[cfg().parrafosKey];
        state.carpetas = result.carpetas;
        state.avisoReconstruccion = result.avisoReconstruccion || null;
        renderAsignaciones(result.protagonistaSinCarpeta, result.protagonista);

        hideProgress();
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
    if (state.avisoReconstruccion) {
        avisoRec.textContent = `⚠️ ${state.avisoReconstruccion}`;
        avisoRec.classList.remove('hidden');
    } else {
        avisoRec.classList.add('hidden');
    }

    const lista = document.getElementById('lista-asignaciones');
    lista.innerHTML = '';
    state.fragments.forEach((f, i) => {
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
        lista.appendChild(div);
    });
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
        state.selectedDestFolder = null;
        lockFrom('destination-section');

        showProgress(`${icon('microphone')} Generando locución (${modelo})...`);
        log(`🎙️ Generando locución (${modelo})...`);
        updateProgress(65);
        const result = await apiCall('/generar-audio', 'POST', {
            [cfg().audioParam]: state.fragments,
            modelo: modelo,
            jobId: state.jobId,
        });
        state.audioToken = result.audioToken;

        document.getElementById('audio-info').textContent =
            `Duración: ${result.duracion}s | Modelo: ${result.modelo}`;
        const player = document.getElementById('audio-player');
        // La URL del audio es relativa al backend activo (importante en modo insumos)
        player.src = apiBase() + result.audioUrl + '?t=' + Date.now();
        player.load();
        renderProductoAudio(player.src);

        hideProgress();
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
        state.selectedDestFolder = null;
        lockFrom('destination-section');

        showProgress(`${icon('arrowsClockwise')} Recargando audio desde Drive...`);
        log('♻️ Recargando audio desde Drive...');
        updateProgress(65);
        const result = await apiCall('/recargar-audio', 'POST', { jobId: state.jobId });
        state.audioToken = result.audioToken;

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
    if (!state.audioToken) {
        alert('No hay locución generada');
        return;
    }
    setButtonDisabled('btn-approve-audio', true);
    try {
        log('✅ Locución aprobada');
        await loadDestinationFolders();
        setStepStatus('audio-section', 'done');
        setStepStatus('destination-section', 'active');
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

        log(`✅ ${lista.length} carpetas cargadas`);
    } catch (error) {
        log(`❌ Error cargando carpetas: ${error.message}`);
    }
}

// PASO 3: Generar el resultado final (video o insumos según el modo)
async function handleGenerateVideo() {
    const select = document.getElementById('dest-folder');
    const destFolder = select.value;

    if (!destFolder) {
        alert('Selecciona una carpeta de destino');
        return;
    }

    state.selectedDestFolder = destFolder;

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
            resultado = await apiCall('/generate-video', 'POST', {
                fragments: state.fragments,
                audioToken: state.audioToken,
                destFolder: state.selectedDestFolder,
                guion: state.guion,
                jobId: state.jobId,
                metadatos: {
                    titulo: state.sourceData?.titulo,
                    descripcion: state.sourceData?.descripcion,
                    protagonista: state.sourceData?.protagonista,
                    nombreCorto: state.sourceData?.nombreCorto,
                    linkFuente: state.sourceData?.linkFuente,
                },
                efectos: {
                    zoom: document.getElementById('efecto-zoom')?.value || 'ninguno',
                    zoomPct: Number(document.getElementById('zoom-pct')?.value) || 20,
                    espejo: document.getElementById('efecto-espejo')?.value || 'ninguno',
                    subtitulos: document.getElementById('efecto-subtitulos')?.checked ?? true,
                    subtitulosFuente: subsFuente,
                    subtitulosTamano: subsTamano,
                    subtitulosMarginV: subsMarginV,
                    transicion: document.getElementById('efecto-transicion')?.value || 'ninguno',
                    transicionTipo: document.getElementById('transicion-tipo')?.value || 'fade',
                    transicionDur: Number(document.getElementById('transicion-dur')?.value) || 0.35,
                },
            });
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
        ? `<video controls playsinline class="result-video-player" src="${videoData.previewUrl}"></video>`
        : '';
    const nombresSesgo = { neutral: `${icon('scales')} Neutral`, favor: `${icon('heart')} A favor`, contra: `${icon('flame')} En contra` };
    const otrosSesgos = ['neutral', 'favor', 'contra'].filter(s => s !== state.sesgo);
    const botonesSesgo = otrosSesgos.map(s =>
        `<button class="btn btn-primary" onclick="otroSesgo('${s}')">${nombresSesgo[s]}</button>`
    ).join('');

    resultInfo.innerHTML = `
        ${playerHtml}
        <p><strong>${icon('checkCircle')} Video generado exitosamente</strong> (sesgo: ${nombresSesgo[state.sesgo]})</p>
        <p>${icon('folderOpen')} Carpeta destino: ${videoData.folderName}</p>
        <p>${icon('pencilSimple')} Nombre del archivo: <code>${videoData.fileName}</code></p>
        <p>${icon('hourglass')} Duración: ${videoData.duration}s</p>
        <p><a href="${videoData.driveLink}" target="_blank">${icon('link')} Ver en Google Drive</a></p>
        <p class="mt-md"><strong>${icon('repeat')} Generar otro video de la MISMA noticia con otro sesgo:</strong></p>
        <p class="btn-row">${botonesSesgo}</p>
        <p class="hint mt-md">
            El video está listo para publicar en redes sociales.
        </p>
    `;
    log('🎉 ¡Proceso completado!');
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
let subsTamano = 264;
let subsMarginV = 300;
let subsFuente = 'anton';

// Trae el catálogo real de subtitulos.js (server.js expone /api/fuentes-subtitulos) — si falla
// (sin conexión, key inválida), el selector se queda con la única opción por defecto y el
// render igual funciona con Anton, que es lo que ya manda el server si no llega `fuente`.
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

function initSubsPreview() {
    const slider = document.getElementById('subs-tamano');
    const valor = document.getElementById('subs-tamano-valor');
    const preview = document.getElementById('subs-preview');
    const palabra = document.getElementById('subs-preview-word');
    const selectFuente = document.getElementById('subs-fuente');
    if (!slider || !preview || !palabra) return;

    const escala = () => preview.clientHeight / SUBS_PLAYRES_Y;
    // Mismo resguardo que tamanoSeguro() en subtitulos.js, pero visual: si "PALABRA" no entra a
    // ese tamaño en el ancho del mockup, la achica hasta que quepa — es justo lo que pasaría con
    // una palabra larga en el render real, así el ejemplo no queda cortado contra el borde.
    const pintarTamano = () => {
        let px = Math.max(8, subsTamano * escala());
        palabra.style.fontSize = `${px}px`;
        const anchoMax = preview.clientWidth * 0.92;
        if (palabra.scrollWidth > anchoMax) {
            px = px * (anchoMax / palabra.scrollWidth);
            palabra.style.fontSize = `${Math.max(6, px)}px`;
        }
    };
    const pintarPosicion = () => { palabra.style.bottom = `${subsMarginV * escala()}px`; };

    slider.addEventListener('input', () => {
        subsTamano = Number(slider.value);
        valor.textContent = subsTamano;
        pintarTamano();
    });

    selectFuente?.addEventListener('change', () => { subsFuente = selectFuente.value; });

    let arrastrando = false;
    const moverA = (clientY) => {
        const rect = preview.getBoundingClientRect();
        const desdeAbajoPx = Math.max(0, Math.min(rect.height, rect.bottom - clientY));
        subsMarginV = Math.round((desdeAbajoPx / rect.height) * SUBS_PLAYRES_Y);
        pintarPosicion();
    };
    palabra.addEventListener('pointerdown', e => {
        arrastrando = true;
        palabra.setPointerCapture(e.pointerId);
    });
    palabra.addEventListener('pointermove', e => { if (arrastrando) moverA(e.clientY); });
    palabra.addEventListener('pointerup', () => { arrastrando = false; });
    palabra.addEventListener('pointercancel', () => { arrastrando = false; });

    pintarTamano();
    pintarPosicion();
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
    const contPasos = contenedorPasos();
    if (contPasos) contPasos.addEventListener('scroll', actualizarPasosIndicador);
    actualizarPasosIndicador();
});
