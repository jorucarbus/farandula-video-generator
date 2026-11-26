# Análisis de github.com/krillinai — qué nos sirve

Revisado el 2026-11-26 (solo lectura, con `gh`). La organización tiene 5 repositorios; lo único realmente relevante es **OpenCreator** (14,5 mil estrellas, Apache-2.0) y **autosocial-skills** (MIT). Los apuntes están en `data-motor/referencias/krillinai/` (READMEs, árbol de archivos y las habilidades leídas).

## Qué es cada repositorio

| Repo | Qué es | ¿Nos sirve? |
|---|---|---|
| **OpenCreator** (TypeScript, Apache-2.0) | Taller de creación con agentes (usa Codex): traducción y doblaje de videos a 120+ idiomas, descargador de videos, miniaturas/imágenes/video generado por IA, voz (TTS), animaciones "stickman" con Remotion, plantillas de redacción y un catálogo de *skills* | **Sí, por ideas y algunas piezas sueltas.** No como base: está pensado para otro flujo (traducir y doblar videos existentes, mucho enfoque chino) |
| **autosocial-skills** (Python + Playwright, MIT) | Sube un video a Xiaohongshu, Douyin, Kuaishou y WeChat Channels, rellena título/descripción/etiquetas y **se detiene antes de publicar** para que la persona revise | **El patrón sí, las plataformas no.** Son redes chinas, pero el método sirve igual para TikTok, Facebook, Instagram y X |
| **awesome-opus-animation** (MIT) | Galería de 114 animaciones hechas con IA, con el prompt y el proceso de cada una | Inspiración visual y de ritmo; no hay código reutilizable |
| **AIGateway** (Go) / **ClaweeAgent** | Pasarela empresarial de modelos/MCP y el cliente de escritorio | No. Es infraestructura de equipos grandes |

## Lo que sí nos sirve, ordenado por valor

### 1. Preparar la publicación con tu sesión (de `autosocial-skills`) — **alto valor**
Su método: `login` una vez (guarda la sesión del navegador), `upload` abre la página de publicar, sube el video, rellena título, descripción y etiquetas, y **para** para que la persona revise el cover y pulse "publicar". Es exactamente lo que falta después de la ficha de publicación: hoy copias y pegas a mano.
- Para nosotros: TikTok, Facebook (Reels), Instagram y X, usando el **Firefox propio de la superapp** (donde ya inician sesión) con Playwright.
- Dato: la parte de "intentar elegir portada recomendada" confirma que las plataformas no dejan fijar la portada por API; por eso la incrustamos en el primer cuadro y dejamos el JPG aparte.
- Riesgo: las páginas de publicar cambian seguido (el propio repo lo advierte); hay que dejarlo como asistente, nunca publicar solo.

### 2. Portadas: su enfoque contrario al nuestro — **medio valor**
Su habilidad `krillinai-cover` genera la portada con un **modelo de imágenes a partir de un prompt** (título dentro del prompt). No toma una foto real ni compone. Nuestro diseño (foto real del artista + titular + logo + círculos) es más controlable y barato.
- Idea aprovechable: la separación **título mayor / título menor** (`--major-title`, `--minor-title`) en su render vertical. Equivale a nuestro "titular + etiqueta".
- Idea opcional a futuro: un fondo generado por IA solo cuando no hay buena foto del artista.

### 3. Fuentes para subtítulos y portadas — **medio valor**
`assets/creator-subtitle-fonts` trae 92 fuentes (la mayoría Noto por escritura, más `OpenCreatorSans/Rounded/Serif`). Para español sirven Noto Sans y las OpenCreator; **no hay nada más expresivo que Anton/Big Shoulders** que ya usamos. Conclusión: no hace falta copiarlas. Si quieres variedad por canal, conviene buscar fuentes de display con licencia abierta (Bebas Neue, Anton, Bangers, Archivo Black), que son más de farándula.

### 4. Canalización con "manifiesto" por tarea — **medio valor (ya lo hacemos a medias)**
Cada etapa deja sus archivos y un `krillinai_manifest.json` con rutas y estado; se reanuda solo lo que falló ("si el render falla, repite solo el render"). Ya hacemos lo mismo con los archivos de `data-motor/noticias/<nombre>/` (lectura, guion, voz). **Mejora concreta:** un `manifiesto.json` por video con etapas, costos y duración (ayuda a medir cuánto gasta cada video y a reanudar desde la superapp con un botón "reintentar" en vez de hacerlo yo por línea de comando).

### 5. Plantillas de redacción — **bajo valor**
`news-analysis` (4 líneas): separar hechos de la fuente de lo que es juicio del autor, no escribir suposiciones como hechos, evitar titulares exagerados y terminar con la incertidumbre. **Ya lo cubre** nuestra pauta de guion (no inventar, hechos no confirmados contados como versión). Lo único útil es el principio "marcar qué es hecho y qué es opinión", que reforzaría el filtro del guion.

### 6. Subtítulos verticales: partir por ancho visual — **bajo valor**
Su render vertical parte las líneas por **ancho de visualización** y reparte los textos largos en el tiempo en vez de apilarlos. Nuestros subtítulos ya parten por ancho medido (máximo 2 líneas por bloque). Nada nuevo, salvo confirmar el diseño.

### 7. Traducir y doblar nuestros videos a otros idiomas — **oportunidad de negocio, no mejora**
Es lo central de OpenCreator. Si algún día quieres versiones en inglés o portugués de los videos de mayor alcance, ahí está el camino: subtítulos → traducción → voz. No lo necesitamos ahora.

### 8. Stickman con Remotion y "creator-preset-video-sources" — **no**
Descartamos el muñeco y las ilustraciones (decisión del 2026-11-24), y los "preset video sources" son ejemplos de video generado por IA (cámara, planos), que no encajan con tomas reales de artistas.

## Lo que NO hay que hacer
- **No copiar código** de OpenCreator: es una aplicación completa con agente Codex, daemon y escritorio; traerla duplicaría trabajo y mantenimiento.
- **No usar las redes chinas** de `autosocial-skills`; solo el patrón.
- Revisar la licencia antes de reutilizar cualquier archivo: OpenCreator es **Apache-2.0** (permite usar con aviso) y `autosocial-skills` **MIT**.

## Propuesta de siguiente paso
1. **Asistente de publicación** con Playwright sobre el Firefox de la superapp (punto 1), empezando por TikTok y Facebook Reels: abre la página, sube el video y la portada, pega título/descripción/hashtags de la ficha y se detiene.
2. **Manifiesto por video** con costos y botón "reintentar" (punto 4).
3. **Fuentes de display** adicionales para portadas por canal (punto 3).
