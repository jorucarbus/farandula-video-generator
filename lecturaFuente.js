// Lectura de UNA fuente (link, video social, YouTube o texto) -> su acta. Vivía en server.js; se sacó a un módulo para que la
// tubería sin interfaz (scripts/noticia-a-video.js) y el servidor lean las fuentes EXACTAMENTE igual.
const fs = require('fs');
const fuentes = require('./fuentes');
const gemini = require('./gemini');

// Decide CÓMO leer una fuente y devuelve su acta ya extraída (Fase 4 del plan maestro:
// multifuente + solo audio). El orden de intentos SIEMPRE prioriza lo más barato — de los
// videos no importa nada visual (pedido explícito del usuario), así que "ver" el video queda
// como último recurso si todo lo demás falla, nunca como default. Cada escalón que falla cae
// al siguiente en vez de abortar (regla de robustez del plan: degradar, no romper).
async function extraerActaDeFuente(type, content) {
  if (type !== 'link' && type !== 'video') {
    // Texto manual u otro tipo simple: directo, sin branching.
    const acta = await gemini.extraerActa(type, content);
    return { acta, tipoReal: type };
  }

  if (fuentes.esYoutube(content)) {
    // 1) Transcripción (subtítulos manuales o autogenerados): texto puro, CERO tokens de
    //    audio/video en Gemini — la fuente más barata que existe. Se intenta siempre primero.
    try {
      const transcripcion = await fuentes.obtenerTranscripcionYoutube(content);
      if (transcripcion) {
        console.log('  📄 Transcripción de YouTube obtenida (sin tocar audio ni video)');
        const acta = await gemini.extraerActa('transcripcion', transcripcion);
        return { acta, tipoReal: 'youtube-transcripcion' };
      }
      console.log('  ℹ️ YouTube sin subtítulos disponibles; probando audio...');
    } catch (e) {
      console.warn(`  ⚠️ Transcripción de YouTube falló (${e.message}); probando audio...`);
    }

    // 2) Audio solo: ~1/8 del costo de mandar el video completo (263 vs 32 tokens/s).
    try {
      const audioPath = await fuentes.descargarAudio(content);
      try {
        console.log('  🔊 Audio de YouTube descargado (sin video)');
        const acta = await gemini.extraerActa('audio', audioPath);
        return { acta, tipoReal: 'youtube-audio' };
      } finally {
        try { fs.unlinkSync(audioPath); } catch {}
      }
    } catch (e) {
      console.warn(`  ⚠️ Audio de YouTube falló (${e.message}); probando lectura directa...`);
    }

    // 3) Gemini lee la URL de YouTube directo, sin pasar por yt-dlp (más caro — video completo
    //    — pero robusto: no depende de que yt-dlp pueda acceder a YouTube en este momento).
    try {
      console.log('  📖 Lectura de YouTube directa (Gemini)...');
      const acta = await gemini.extraerActa('youtube', content);
      return { acta, tipoReal: 'youtube-directo' };
    } catch (e) {
      console.warn(`  ⚠️ Lectura directa de YouTube falló (${e.message}); último recurso: descargar el video...`);
    }

    // 4) Último recurso: descargar el video completo (yt-dlp) y subirlo a la File API.
    const videoPath = await fuentes.descargarVideo(content);
    try {
      const acta = await gemini.extraerActa('video', videoPath);
      return { acta, tipoReal: 'youtube-video' };
    } finally {
      try { fs.unlinkSync(videoPath); } catch {}
    }
  }

  if (fuentes.esVideoSocial(content) || type === 'video') {
    // TikTok/IG/etc: audio primero — nunca importa lo visual — video completo como fallback.
    try {
      const audioPath = await fuentes.descargarAudio(content);
      try {
        console.log('  🔊 Audio descargado (sin video)');
        const acta = await gemini.extraerActa('audio', audioPath);
        return { acta, tipoReal: 'social-audio' };
      } finally {
        try { fs.unlinkSync(audioPath); } catch {}
      }
    } catch (e) {
      console.warn(`  ⚠️ Audio-only falló (${e.message}); descargando video completo...`);
      const videoPath = await fuentes.descargarVideo(content);
      try {
        const acta = await gemini.extraerActa('video', videoPath);
        return { acta, tipoReal: 'social-video' };
      } finally {
        try { fs.unlinkSync(videoPath); } catch {}
      }
    }
  }

  // Link normal de noticia: extraer el texto de la página.
  console.log('  📄 Extrayendo texto de la página...');
  const texto = await fuentes.extraerTextoWeb(content);
  const acta = await gemini.extraerActa('web', texto);
  return { acta, tipoReal: 'web' };
}

module.exports = { extraerActaDeFuente };
