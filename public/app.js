// Config
const API_BASE = 'http://localhost:3000/api';
let API_KEY = null;

// Obtener API Key del servidor (sin exponerla en el código)
async function initApiKey() {
  try {
    const res = await fetch(API_BASE + '/key-prompt');
    const data = await res.json();
    if (data.requiresKey) {
      const key = prompt('Ingresa tu API Key (disponible en .env del servidor):');
      if (!key) throw new Error('API Key requerida');
      API_KEY = key;
      localStorage.setItem('api_key', key);
    } else {
      API_KEY = 'configured-server-side';
    }
  } catch (e) {
    console.error('Error inicializando API Key:', e);
    alert('No se pudo inicializar. Verifica que el servidor esté corriendo.');
  }
}

let state = {
    sourceData: null,
    selectedAngle: null,
    selectedDestFolder: null,
    cronista: null,
    guion: null,
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
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
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

    if (!sourceInput.trim()) {
        alert('Por favor ingresa un link o texto');
        return;
    }

    try {
        showSection('progress-section');
        log('📖 Iniciando lectura...');
        updateProgress(10);

        const result = await apiCall('/read', 'POST', {
            type: sourceType,
            content: sourceInput,
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

        // Mostrar el guion con conteo de palabras
        const numPalabras = result.palabras || result.script.split(/\s+/).filter(Boolean).length;
        document.getElementById('res-guion').textContent = result.script;
        document.getElementById('guion-stats').textContent = `Guion (${numPalabras} palabras, ~${Math.round(numPalabras / 3)}s de locución)`;
        log(`📜 Guion: ${numPalabras} palabras`);
        if (numPalabras < 180) {
            log('⚠️ Guion corto (se esperan 205-220 palabras)');
        }

        // Cargar carpetas de destino
        await loadDestinationFolders();
        showSection('destination-section');
        document.getElementById('guion-section').classList.remove('hidden');
        document.getElementById('lectura-section').classList.remove('hidden');
    } catch (error) {
        log(`❌ Error generando guion: ${error.message}`);
    }
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

        // Fragmentación + Carpetas
        log('1️⃣ Fragmentando guion...');
        updateProgress(55);
        const fragmentResult = await apiCall('/fragment', 'POST', {
            script: state.guion,
        });
        log('✅ Guion fragmentado');
        updateProgress(60);

        // Marcas ElevenLabs
        log('2️⃣ Agregando marcas de locución...');
        updateProgress(65);
        const markedResult = await apiCall('/add-markers', 'POST', {
            fragments: fragmentResult.fragments,
        });
        log('✅ Marcas agregadas');
        updateProgress(70);

        // Generar audio
        log('3️⃣ Generando audio con ElevenLabs...');
        updateProgress(75);
        const audioResult = await apiCall('/generate-audio', 'POST', {
            guionConMarcas: markedResult.marked,
        });
        log('✅ Audio generado');
        log(`⏱️ Duración: ${audioResult.duration}s`);
        updateProgress(80);

        // Generar video
        log('4️⃣ Generando video con FFmpeg...');
        updateProgress(85);
        const videoResult = await apiCall('/generate-video', 'POST', {
            fragments: fragmentResult.fragments,
            audioPath: audioResult.audioPath,
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
    resultInfo.innerHTML = `
        ${playerHtml}
        <p><strong>✅ Video generado exitosamente</strong></p>
        <p>📁 Carpeta destino: ${videoData.folderName}</p>
        <p>📝 Nombre del archivo: <code>${videoData.fileName}</code></p>
        <p>⏱️ Duración: ${videoData.duration}s</p>
        <p><a href="${videoData.driveLink}" target="_blank">🔗 Ver en Google Drive</a></p>
        <p style="color: #666; font-size: 0.9rem; margin-top: 15px;">
            El video está listo para publicar en redes sociales.
        </p>
    `;
    log('🎉 ¡Proceso completado!');
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
document.addEventListener('DOMContentLoaded', async () => {
    log('✅ App iniciada');
    await initApiKey();
    log('📌 API Key configurada');
});
