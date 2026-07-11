const axios = require('axios');
const fs = require('fs');

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const GEMINI_API_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent';

// Prompts maestros
const PROMPTS = {
  lectura: `Rol: Periodista de élite, experto en storytelling digital, narrativa transmedia y análisis de tendencias en redes sociales. Tu estilo es audaz, dinámico y profundamente analítico.

Tarea: Procesar el contenido que te proporcione (texto, página web, video o audio) y responder ÚNICAMENTE con un objeto JSON válido (sin markdown, sin bloques de código) con esta estructura exacta:

{
  "cronica": "Crónica periodística sobre el contenido. Centro de atención: el ángulo más viral, actual o disruptivo. Técnicas de storytelling (inicio impactante, desarrollo con tensión y ritmo, cierre memorable). Sin tono corporativo.",
  "titulo": "Título corto, viral y contundente",
  "descripcion": "UNA SOLA descripción adictiva para TikTok terminada en exactamente 5 hashtags estratégicos, todo en un solo bloque",
  "protagonista": "Nombre del famoso principal de la noticia",
  "secundario": "Nombre del segundo involucrado, o cadena vacía si no hay",
  "accion": "El acontecimiento en 2-4 palabras, lo más corto posible"
}

RESTRICCIONES:
- protagonista, secundario y accion NO deben contener caracteres prohibidos en nombres de archivo (/ \\ : * ? " < > |).
- La descripción y los hashtags van juntos en el mismo campo.
- Responde SOLO el JSON.`,

  guion: `Rol: Guionista Senior de Contenido Viral de Farándula. Tu estilo es ágil, picante, cargado de cinismo, tensión dramática y ritmo rápido.

INSTRUCCIONES CRÍTICAS:
1. LONGITUD: El guion DEBE tener entre 205 y 220 palabras (unos 70 segundos de locución). Nunca menos de 200.
2. Efecto Bucle Perfecto: La última frase debe conectar orgánicamente con la primera, creando un ciclo infinito imperceptible.
3. Apertura de Impacto Directo: Cero introducciones. Arranca con el clímax del escándalo EN LA PRIMERA FRASE.
4. Ritmo: Alterna frases cortas e incisivas (2-5 palabras) con medianas explicativas (10-15 palabras). Mantén tensión constante.
5. Tono: Lenguaje de farándula real ("lo hundió", "quedó expuesto", "se le cayó la mentira", "la jugada le salió mal"). NUNCA uses muletillas de IA como "increíble", "impactante", "no vas a creer".
6. DESARROLLO: El cuerpo debe revelar datos jugosos en el medio y prometer la peor parte al final, pero cumplir la promesa.
7. FORMATO: UN BLOQUE DE TEXTO CORRIDO. Sin saltos de línea, sin etiquetas, sin negritas. Solo texto limpio con comas, puntos y signos de exclamación.

PROHIBIDO:
- Frases incompletas o cortadas.
- Palabras inventadas o neologismos.
- Explicar el contexto antes del clímax (arranca directo en la acción).
- Párrafos separados (TODO en un solo párrafo).
- Numerar, listar o contar palabras en la salida: entrega SOLO el texto del guion.`,

  fragmentacion: `Rol: Asistente de fragmentación para edición automática en TikTok.

INSTRUCCIONES CRÍTICAS:
1. Fragmentación de "Corte Rápido": Cada segmento debe durar 1.5-3 segundos.
2. Sentido de Oración: No dejes palabras sueltas. Cada línea debe tener significado lógico.
3. Límite: Máximo 55-60 caracteres por línea.
4. Corte Sintáctico: Separa Sujeto en una línea, Predicado (desde verbo) en la siguiente.
5. Saltos Obligatorios: En comas, puntos, signos de exclamación.
6. Conectores: Salto antes de "y", "que", "pero", "porque", "cuando", "aunque".

FORMATO DE SALIDA:
Cada línea en formato: Nombre_Carpeta: [fragmento con sentido]

Las carpetas disponibles son: [LISTA_DE_CARPETAS]

Asigna el famoso más relevante a cada fragmento basándote en el contenido.`,

  marcas: `Rol: Senior Audio Engineer & Prompting Strategist para ElevenLabs v3.

Objetivo: Procesar guiones fragmentados y transformarlos en una descarga eléctrica de palabras para voz femenina mexicana (chilanga/fresa/moderna).

DICCIONARIO DE ETIQUETAS (Strictly English):
[excited]: Hook inicial y picos de dopamina.
[fast]: Estado por defecto. Elimina aire entre frases.
[sarcastic]: Veneno, ironía, modismos mexicanos.
[whispering]: Conspiraciones rápidas (sin bajar velocidad).
[laughing]: Burla descarada o incredulidad.
[shouting]: Énfasis explosivo en palabras clave.
[surprised]: Shock que mantiene al usuario pegado.

REGLAS DE ORO:
1. Cero Pausas: PROHIBIDO usar [pause]. Si hay puntos, ignóralos en la cadencia y usa [fast].
2. Efecto Slingshot: El final debe ser un disparo de energía. Termina con [fast] o [excited] que se corte abruptamente.
3. No Alterar Texto: Mantén palabras intactas, solo saturarlas de etiquetas.
4. Bloque Único: Resultado en un solo bloque denso. Sin introducciones.

FORMATO DE RESPUESTA:
Un solo bloque con el guion fragmentado saturado de etiquetas.`
};

// Función principal para llamar a Gemini (con reintentos si se alcanza el límite de tasa)
// userMessage: string o array de parts ({text}, {inlineData}, {fileData}) para enviar audio/video
async function callGemini(prompt, userMessage, intento = 1, configExtra = {}) {
  const MAX_INTENTOS = 4;
  const userParts = Array.isArray(userMessage) ? userMessage : [{ text: userMessage }];
  try {
    const response = await axios.post(`${GEMINI_API_URL}?key=${GEMINI_API_KEY}`, {
      contents: [
        {
          parts: [
            { text: prompt },
            ...userParts
          ]
        }
      ],
      generationConfig: {
        temperature: 0.7,
        topP: 0.95,
        maxOutputTokens: 8192,
        // Desactivar el razonamiento interno: consume el límite de tokens y corta la salida
        thinkingConfig: { thinkingBudget: 0 },
        ...configExtra,
      }
    });

    if (response.data.candidates && response.data.candidates.length > 0) {
      // Unir todas las partes de texto (puede venir en varias)
      const parts = response.data.candidates[0].content.parts || [];
      const texto = parts.map(p => p.text || '').join('');
      if (texto.trim()) return texto;
    }
    throw new Error('No hay respuesta de Gemini');
  } catch (error) {
    // 429 = límite de peticiones; 503 = modelo sobrecargado. Ambos son temporales: esperar y reintentar
    const status = error.response?.status;
    if ((status === 429 || status === 503 || status === 500) && intento < MAX_INTENTOS) {
      const espera = (status === 429 ? 20000 : 8000) * intento;
      console.log(`⏳ Gemini respondió ${status}, esperando ${espera / 1000}s (intento ${intento}/${MAX_INTENTOS - 1})...`);
      await new Promise(r => setTimeout(r, espera));
      return callGemini(prompt, userMessage, intento + 1, configExtra);
    }
    console.error('Error Gemini:', error.message);
    throw error;
  }
}

// ETAPA 1: Lectura
// sourceType: 'texto' | 'web' (texto ya extraído) | 'youtube' (URL directa) | 'audio' (ruta a MP3 local)
async function procesarLectura(sourceType, content) {
  try {
    let userParts;
    if (sourceType === 'youtube') {
      // Gemini lee videos de YouTube directamente por URL
      userParts = [
        { fileData: { fileUri: content } },
        { text: 'Procesa este video de una noticia de farándula.' },
      ];
    } else if (sourceType === 'audio') {
      // Audio descargado con yt-dlp (TikTok/Instagram), enviado inline en base64
      const data = fs.readFileSync(content).toString('base64');
      userParts = [
        { inlineData: { mimeType: 'audio/mpeg', data } },
        { text: 'Procesa este audio de una noticia de farándula.' },
      ];
    } else {
      userParts = [{ text: `Procesa este contenido (${sourceType}):\n\n${content}` }];
    }

    const response = await callGemini(PROMPTS.lectura, userParts, 1, {
      responseMimeType: 'application/json',
    });

    const datos = JSON.parse(response);
    const limpiar = (s) => (s || '').toString().replace(/[/\\:*?"<>|]/g, '').trim();

    const protagonista = limpiar(datos.protagonista);
    const secundario = limpiar(datos.secundario);
    const accion = limpiar(datos.accion);
    // Nombre de archivo: "Protagonista - Secundario - Hecho" (sin la fecha; se antepone al guardar)
    const nombreCorto = [protagonista, secundario, accion].filter(Boolean).join(' - ').slice(0, 80);

    return {
      cronica: (datos.cronica || '').trim(),
      titulo: (datos.titulo || 'Sin título').trim(),
      descripcion: (datos.descripcion || 'Sin descripción').trim(),
      protagonista,
      secundario,
      accion,
      nombreCorto: nombreCorto || 'Video farandula',
    };
  } catch (error) {
    throw new Error(`Error en lectura: ${error.message}`);
  }
}

// ETAPA 2: Generar Guion (7 ángulos)
async function generarGuion(cronica, angle, angleContent = null) {
  try {
    let descripcionEnfoque;

    if (angle === 7) {
      descripcionEnfoque = angleContent;
    } else if (angle === 6) {
      descripcionEnfoque = 'Combina elementos de varios enfoques: lenguaje corporal, hipocresía del pasado, reacción del entorno, dinero oculto y ruptura de expectativas. Usa los 2-3 que mejor encajen con la historia.';
    } else {
      descripcionEnfoque = getAngleDescription(angle);
    }

    const userMessage = `A continuación tienes dos bloques claramente separados.

=== MATERIAL BASE (la crónica con los HECHOS de la noticia; de aquí sale TODO el contenido del guion) ===
${cronica}
=== FIN DEL MATERIAL BASE ===

=== ENFOQUE NARRATIVO (esto NO es contenido; es solo la LENTE con la que debes contar los hechos) ===
${descripcionEnfoque}
=== FIN DEL ENFOQUE ===

TAREA: Escribe el guion de 205-220 palabras usando ÚNICAMENTE los hechos del MATERIAL BASE, contados a través del ENFOQUE NARRATIVO. No copies el texto del enfoque en el guion; úsalo solo para decidir el ángulo, el tono y el orden de la revelación.`;

    const response = await callGemini(PROMPTS.guion, userMessage);
    return response.trim();
  } catch (error) {
    throw new Error(`Error generando guion: ${error.message}`);
  }
}

// Descripción completa de cada ángulo (1-5)
function getAngleDescription(angle) {
  const descripciones = {
    1: 'El Ángulo del Lenguaje Corporal / Detalle Oculto: enfócate en lo que nadie notó en el video, la cara que pusieron, los gestos o un fotograma específico.',
    2: 'El Ángulo del Pasado / Hipocresía: contrapón lo que el famoso dice hoy con una verdad incómoda o un momento de su pasado que lo contradice.',
    3: 'El Ángulo de las Víctimas / Terceros: enfócate en la reacción de la ex, la familia, los amigos o los comentarios filtrados del entorno cercano.',
    4: 'El Ángulo de la Conspiración / Dinero: sigue la pista del beneficio oculto. ¿Es marketing? ¿Cuánto dinero hay en juego? ¿Qué intentan tapar con este escándalo?',
    5: 'El Ángulo de la Ruptura de Expectativas: inicia rompiendo lo que todos dan por hecho (ej: "Todos creen que la pelea fue por X, pero el verdadero motivo es otro...").',
  };
  return descripciones[angle] || 'Enfoque libre.';
}

// ETAPA 3: Fragmentar + Asignar Carpetas
async function fragmentarGuion(script, carpetas) {
  try {
    const carpetasString = carpetas.join(', ');
    const prompt = PROMPTS.fragmentacion.replace('[LISTA_DE_CARPETAS]', carpetasString);

    const userMessage = `Fragmenta este guion:\n\n${script}`;
    const response = await callGemini(prompt, userMessage);

    // Parsear respuesta en líneas (dividir solo en el PRIMER ':' para no cortar el texto)
    const fragmentos = response.split('\n')
      .filter(line => line.trim() && line.includes(':'))
      .map(line => {
        const idx = line.indexOf(':');
        const famoso = line.slice(0, idx).trim().replace(/^[-*\d.\s]+/, '');
        const texto = line.slice(idx + 1).trim();
        return {
          famoso: famoso,
          texto: texto,
          caracteres: texto.length,
        };
      })
      .filter(f => f.famoso && f.texto);

    console.log(`  ✂️ ${fragmentos.length} fragmentos, ${fragmentos.reduce((s, f) => s + f.caracteres, 0)} caracteres totales`);
    return fragmentos;
  } catch (error) {
    throw new Error(`Error fragmentando: ${error.message}`);
  }
}

// ETAPA 4: Agregar Marcas ElevenLabs
async function agregarMarcas(guionFragmentado) {
  try {
    const guionText = guionFragmentado
      .map(f => `${f.famoso}: ${f.texto}`)
      .join('\n');

    const userMessage = `Procesa este guion fragmentado y agrega las etiquetas de actuación:\n\n${guionText}`;
    const response = await callGemini(PROMPTS.marcas, userMessage);

    return response.trim();
  } catch (error) {
    throw new Error(`Error agregando marcas: ${error.message}`);
  }
}

// Generar nombre corto de archivo: "Protagonista - Secundario - Hecho"
async function generarNombreArchivo(guion) {
  try {
    const prompt = `Genera un nombre de archivo para este guion de farándula.
Formato EXACTO: Protagonista - Secundario - Hecho
- Protagonista: el famoso principal de la noticia.
- Secundario: el segundo involucrado (si no hay, omite esta parte y su guion).
- Hecho: el acontecimiento en 2-4 palabras, lo más corto posible.
Responde SOLO el nombre, sin comillas, sin extensión, sin explicaciones.
No uses caracteres prohibidos en nombres de archivo (/ \\ : * ? " < > |).`;

    const response = await callGemini(prompt, guion);
    // Sanear por si acaso
    return response.trim().split('\n')[0].replace(/[/\\:*?"<>|]/g, '').slice(0, 80);
  } catch (error) {
    return 'Video farandula';
  }
}

// Utilidades
function getAngleName(angle) {
  const angles = {
    1: 'Lenguaje Corporal / Detalle Oculto',
    2: 'Pasado / Hipocresía',
    3: 'Víctimas / Terceros',
    4: 'Conspiración / Dinero',
    5: 'Ruptura de Expectativas',
    6: 'Combinado',
  };
  return angles[angle] || 'Desconocido';
}

module.exports = {
  procesarLectura,
  generarGuion,
  fragmentarGuion,
  agregarMarcas,
  generarNombreArchivo,
};
