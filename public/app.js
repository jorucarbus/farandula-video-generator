// Config
const API_BASE = 'http://localhost:3000/api';
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
    sourceData: null,
    selectedAngle: null,
    selectedDestFolder: null,
    cronista: null,
    guion: null,
    fragments: null,
    carpetas: [],
    audioToken: null,
    fuente: null,   // {type, content} para regenerar con otro sesgo
    sesgo: 'neutral',
};

// Funciones auxiliares
function showSection(sectionId) {
    document.querySelectorAll('.form-section, .progress-section, .result-section').forEach(el => {
        el.classList.add('hidden');
    });
    document.getElementById(sectionId).classList.remove('hidden');
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
        const response = await fetch(`${API_BASE}${endpoint}`, options);
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

// PASO 1: Leer fuente
async function handleRead() {
    const sourceType = document.getElementById('source-type').value;
    const sourceInput = document.getElementById('source-input').value;
    const sesgo = document.getElementById('sesgo-select').value;

    if (!sourceInput.trim()) {
        alert('Por favor ingresa un link o texto');
        return;
    }
    await leerFuente(sourceType, sourceInput, sesgo);
}

// Lectura reutilizable (también para regenerar con otro sesgo al final)
async function leerFuente(sourceType, sourceInput, sesgo) {
    try {
        state.fuente = { type: sourceType, content: sourceInput };
        state.sesgo = sesgo;

        showSection('progress-section');
        log(`📖 Iniciando lectura (sesgo: ${sesgo})...`);
        updateProgress(10);

        const result = await apiCall('/read', 'POST', {
            type: sourceType,
            content: sourceInput,
            sesgo: sesgo,
        });

        log('✅ Lectura completada');
        log('📝 Crónica generada');

        state.sourceData = result;
        // Guardar el link original de la noticia (para la hoja de Google Sheets)
        state.sourceData.linkFuente = sourceType === 'link' ? sourceInput.trim() : '';
        updateProgress(30);

        // Mostrar resultado de la lectura (título, descripción, crónica)
        document.getElementById('res-titulo').textContent = result.titulo;
        document.getElementById('res-descripcion').textContent = result.descripcion;
        document.getElementById('res-cronica').textContent = result.cronica;

        showSection('script-section');
        document.getElementById('lectura-section').classList.remove('hidden');
        log('➡️ Selecciona un ángulo para continuar');
    } catch (error) {
        log(`❌ Error en lectura: ${error.message}`);
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

    try {
        showSection('progress-section');
        log('✍️ Generando guion...');
        updateProgress(40);

        const result = await apiCall('/generate-script', 'POST', {
            cronica: state.sourceData.cronica,
            angle: state.selectedAngle,
            angleContent: angleContent,
        });

        log('✅ Guion generado');
        state.guion = result.script;
        updateProgress(50);

        // Mostrar el guion en el editor para revisión (aprobar / modificar / rechazar)
        document.getElementById('guion-editor').value = result.script;
        actualizarStatsGuion();
        const numPalabras = result.palabras || result.script.split(/\s+/).filter(Boolean).length;
        log(`📜 Guion: ${numPalabras} palabras`);
        if (numPalabras < 180) {
            log('⚠️ Guion corto (se esperan 205-220 palabras)');
        }

        showSection('guion-section');
        document.getElementById('lectura-section').classList.remove('hidden');
        log('➡️ Revisa el guion: aprueba, edita o regenera');
    } catch (error) {
        log(`❌ Error generando guion: ${error.message}`);
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
    log('✅ Guion aprobado');

    try {
        showSection('progress-section');
        log('📂 Asignando carpetas a los párrafos...');
        updateProgress(52);
        const result = await apiCall('/fragment', 'POST', {
            script: state.guion,
            protagonista: state.sourceData?.protagonista,
        });
        state.fragments = result.fragments;
        state.carpetas = result.carpetas;

        const aviso = document.getElementById('aviso-protagonista');
        if (result.protagonistaSinCarpeta) {
            aviso.textContent = `⚠️ ${result.protagonista} NO tiene carpeta propia: los clips saldrán de las carpetas asignadas abajo. Revisa bien (o crea la carpeta en Drive y vuelve a intentar).`;
            aviso.classList.remove('hidden');
        } else {
            aviso.classList.add('hidden');
        }

        const lista = document.getElementById('lista-asignaciones');
        lista.innerHTML = '';
        state.fragments.forEach((f, i) => {
            const div = document.createElement('div');
            div.style.cssText = 'border:1px solid #ddd;border-radius:8px;padding:10px;margin-bottom:8px;';
            const p = document.createElement('p');
            p.style.cssText = 'margin:0 0 6px;font-size:0.9rem;';
            p.textContent = `${i + 1}. (${f.porcentaje}%) ${f.texto}`;
            const sel = document.createElement('select');
            sel.style.width = '100%';
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

        showSection('revision-section');
        document.getElementById('lectura-section').classList.remove('hidden');
    } catch (error) {
        log(`❌ Error asignando carpetas: ${error.message}`);
        showSection('guion-section');
        document.getElementById('lectura-section').classList.remove('hidden');
    }
}

// Confirmar asignaciones → generar locución para aprobación
async function confirmarAsignaciones() {
    await regenerarAudio('eleven_v3');
}

// Generar (o regenerar) la locución y mostrarla para aprobación
async function regenerarAudio(modelo) {
    try {
        showSection('progress-section');
        log(`🎙️ Generando locución (${modelo})...`);
        updateProgress(65);
        const result = await apiCall('/generar-audio', 'POST', {
            fragments: state.fragments,
            modelo: modelo,
        });
        state.audioToken = result.audioToken;

        document.getElementById('audio-info').textContent =
            `Duración: ${result.duracion}s | Modelo: ${result.modelo}`;
        const player = document.getElementById('audio-player');
        player.src = result.audioUrl + '?t=' + Date.now();
        player.load();

        showSection('audio-section');
        document.getElementById('revision-section').classList.remove('hidden');
        document.getElementById('lectura-section').classList.remove('hidden');
        log('🎧 Escucha la locución y apruébala o regenérala');
    } catch (error) {
        log(`❌ Error generando locución: ${error.message}`);
        showSection('revision-section');
        document.getElementById('lectura-section').classList.remove('hidden');
    }
}

// Locución aprobada → elegir carpeta de destino
async function aprobarAudio() {
    if (!state.audioToken) {
        alert('No hay locución generada');
        return;
    }
    log('✅ Locución aprobada');
    await loadDestinationFolders();
    showSection('destination-section');
    document.getElementById('audio-section').classList.remove('hidden');
    document.getElementById('lectura-section').classList.remove('hidden');
}

// RECHAZO: regenerar con el mismo ángulo
function regenerarGuion() {
    log('🔄 Regenerando guion (mismo ángulo)...');
    handleGenerateScript();
}

// RECHAZO: volver a elegir ángulo
function cambiarAngulo() {
    showSection('script-section');
    document.getElementById('lectura-section').classList.remove('hidden');
    log('🎯 Elige otro ángulo');
}

// Cargar carpetas de destino
async function loadDestinationFolders() {
    try {
        log('📂 Cargando carpetas de Google Drive...');
        const result = await apiCall('/folders');

        const select = document.getElementById('dest-folder');
        select.innerHTML = '<option value="">-- Selecciona una carpeta --</option>';

        result.folders.forEach(folder => {
            const option = document.createElement('option');
            option.value = folder.id;
            option.textContent = folder.name;
            select.appendChild(option);
        });

        log(`✅ ${result.folders.length} carpetas cargadas`);
    } catch (error) {
        log(`❌ Error cargando carpetas: ${error.message}`);
    }
}

// PASO 3: Generar video completo
async function handleGenerateVideo() {
    const destFolder = document.getElementById('dest-folder').value;

    if (!destFolder) {
        alert('Selecciona una carpeta de destino');
        return;
    }

    state.selectedDestFolder = destFolder;

    try {
        showSection('progress-section');
        log('🚀 Iniciando generación de video...');
        updateProgress(50);

        // Todo ya aprobado: párrafos revisados + locución escuchada
        if (!state.fragments || state.fragments.length === 0) {
            throw new Error('No hay párrafos asignados (vuelve a aprobar el guion)');
        }
        if (!state.audioToken) {
            throw new Error('No hay locución aprobada');
        }

        log('🎞️ Generando video con FFmpeg...');
        updateProgress(70);
        const videoResult = await apiCall('/generate-video', 'POST', {
            fragments: state.fragments,
            audioToken: state.audioToken,
            destFolder: state.selectedDestFolder,
            guion: state.guion,
            metadatos: {
                titulo: state.sourceData?.titulo,
                descripcion: state.sourceData?.descripcion,
                protagonista: state.sourceData?.protagonista,
                nombreCorto: state.sourceData?.nombreCorto,
                linkFuente: state.sourceData?.linkFuente,
            },
        });
        log('✅ Video generado');
        updateProgress(100);

        showResult(videoResult);
    } catch (error) {
        log(`❌ Error: ${error.message}`);
    }
}

// Mostrar resultado
function showResult(videoData) {
    showSection('result-section');
    // Mantener visible el título/descripción para copiar al publicar
    document.getElementById('lectura-section').classList.remove('hidden');
    const resultInfo = document.getElementById('result-info');
    const playerHtml = videoData.previewUrl
        ? `<video controls playsinline style="width:100%;max-width:320px;aspect-ratio:9/16;background:#000;border-radius:12px;display:block;margin:0 auto 15px;" src="${videoData.previewUrl}"></video>`
        : '';
    const nombresSesgo = { neutral: '⚖️ Neutral', favor: '💚 A favor', contra: '🔥 En contra' };
    const otrosSesgos = ['neutral', 'favor', 'contra'].filter(s => s !== state.sesgo);
    const botonesSesgo = otrosSesgos.map(s =>
        `<button class="btn btn-primary" style="margin-right:8px;" onclick="otroSesgo('${s}')">${nombresSesgo[s]}</button>`
    ).join('');

    resultInfo.innerHTML = `
        ${playerHtml}
        <p><strong>✅ Video generado exitosamente</strong> (sesgo: ${nombresSesgo[state.sesgo]})</p>
        <p>📁 Carpeta destino: ${videoData.folderName}</p>
        <p>📝 Nombre del archivo: <code>${videoData.fileName}</code></p>
        <p>⏱️ Duración: ${videoData.duration}s</p>
        <p><a href="${videoData.driveLink}" target="_blank">🔗 Ver en Google Drive</a></p>
        <p style="margin-top:15px;"><strong>🔁 Generar otro video de la MISMA noticia con otro sesgo:</strong></p>
        <p>${botonesSesgo}</p>
        <p style="color: #666; font-size: 0.9rem; margin-top: 15px;">
            El video está listo para publicar en redes sociales.
        </p>
    `;
    log('🎉 ¡Proceso completado!');
}

// Rehacer el flujo con la misma fuente pero otro sesgo (nueva crónica → nuevo guion → nuevo video)
async function otroSesgo(sesgo) {
    if (!state.fuente) {
        alert('No hay fuente guardada, empieza de nuevo');
        return;
    }
    state.selectedAngle = null;
    state.audioToken = null;
    state.fragments = null;
    await leerFuente(state.fuente.type, state.fuente.content, sesgo);
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

// Inicialización
document.addEventListener('DOMContentLoaded', () => {
    log('✅ App iniciada');
    initApiKey();
});
