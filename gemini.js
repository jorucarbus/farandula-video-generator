const axios = require('axios');

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const GEMINI_API_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent';

// Prompts maestros
const PROMPTS = {
  lectura: `Rol: Periodista de élite, experto en storytelling digital, narrativa transmedia y análisis de tendencias en redes sociales. Tu estilo es audaz, dinámico y profundamente analítico.

Tarea: Procesar el contenido que te proporcione (video, link o información) y realizar lo siguiente:

1. LA CRÓNICA: Desarrolla una crónica periodística sobre el contenido. El centro de atención debe ser el ángulo más viral, actual o disruptivo. Usa técnicas de storytelling (inicio impactante, desarrollo con tensión y ritmo, cierre memorable). Evita tono corporativo.

2. EL CIERRE: Al finalizar la crónica, incluye:
   - Un título corto, viral y contundente
   - UNA SOLA descripción adictiva para TikTok + exactamente 5 hashtags estratégicos (TODO EN UN BLOQUE)

RESTRICCIÓN: La descripción y hashtags deben ir juntos en un solo bloque, no separados.

Formato de respuesta:
[CRÓNICA AQUÍ]

---SEPARADOR---

[TÍTULO]

[DESCRIPCIÓN + 5 HASHTAGS EN UN BLOQUE]`,

  guion: `Rol: Guionista Senior de Contenido Viral de Farándula. Tu estilo es ágil, picante, cargado de cinismo, tensión dramática y ritmo rápido.

INSTRUCCIONES:
1. Efecto Bucle Perfecto: La última frase debe conectar orgánicamente con la primera, creando un ciclo infinito imperceptible.
2. Apertura de Impacto Directo: Cero introducciones. Arranca con el clímax del escándalo.
3. Ritmo: 205-220 palabras (~70 segundos). Alterna frases cortas e incisivas con medianas explicativas.
4. Tono: Lenguaje de farándula real ("lo hundió", "quedó expuesto", "se le cayó la mentira"). Evita muletillas de IA.
5. FORMATO: UN BLOQUE DE TEXTO CORRIDO. Sin saltos, sin etiquetas, sin negritas. Solo texto limpio con puntuación.

NO alteres el texto original, solo reorganízalo dramáticamente.`,

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

// Función principal para llamar a Gemini
async function callGemini(prompt, userMessage) {
  try {
    const response = await axios.post(`${GEMINI_API_URL}?key=${GEMINI_API_KEY}`, {
      contents: [
        {
          parts: [
            { text: prompt },
            { text: userMessage }
          ]
        }
      ],
      generationConfig: {
        temperature: 0.7,
        topP: 0.95,
        maxOutputTokens: 2048,
      }
    });

    if (response.data.candidates && response.data.candidates.length > 0) {
      return response.data.candidates[0].content.parts[0].text;
    }
    throw new Error('No hay respuesta de Gemini');
  } catch (error) {
    console.error('Error Gemini:', error.message);
    throw error;
  }
}

// ETAPA 1: Lectura
async function procesarLectura(sourceType, content) {
  try {
    const userMessage = `Procesa este contenido de ${sourceType}:\n\n${content}`;
    const response = await callGemini(PROMPTS.lectura, userMessage);

    const parts = response.split('---SEPARADOR---');

    return {
      cronica: parts[0].trim(),
      titulo: parts[1]?.trim() || 'Sin título',
      descripcion: parts[2]?.trim() || 'Sin descripción',
    };
  } catch (error) {
    throw new Error(`Error en lectura: ${error.message}`);
  }
}

// ETAPA 2: Generar Guion (7 ángulos)
async function generarGuion(cronica, angle, angleContent = null) {
  try {
    let userMessage;

    if (angle === 7) {
      userMessage = `Basándote en esta crónica:\n\n${cronica}\n\nGenera un guion usando este enfoque personalizado:\n${angleContent}`;
    } else {
      const angleName = getAngleName(angle);
      userMessage = `Basándote en esta crónica:\n\n${cronica}\n\nGenera un guion usando el Ángulo ${angle}: ${angleName}`;
    }

    const response = await callGemini(PROMPTS.guion, userMessage);
    return response.trim();
  } catch (error) {
    throw new Error(`Error generando guion: ${error.message}`);
  }
}

// ETAPA 3: Fragmentar + Asignar Carpetas
async function fragmentarGuion(script, carpetas) {
  try {
    const carpetasString = carpetas.join(', ');
    const prompt = PROMPTS.fragmentacion.replace('[LISTA_DE_CARPETAS]', carpetasString);

    const userMessage = `Fragmenta este guion:\n\n${script}`;
    const response = await callGemini(prompt, userMessage);

    // Parsear respuesta en líneas
    const fragmentos = response.split('\n')
      .filter(line => line.trim() && line.includes(':'))
      .map(line => {
        const [famoso, texto] = line.split(':');
        return {
          famoso: famoso.trim(),
          texto: texto.trim(),
          caracteres: texto.trim().length,
        };
      });

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
};
