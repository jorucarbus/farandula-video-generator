# Bibliotecas de modelos 3D, escenarios, props, texturas y HDRI con licencia comercial (estado nov-2026)

Leyenda: [V] = HECHO VERIFICADO en página consultada en esta sesión (enlace). [I] = INFERENCIA / memoria previa, SIN verificar en esta sesión. Límite: se hicieron ~25 consultas; varias páginas oficiales no devolvieron el texto de licencia (se anota). Regla general antes de usar cualquier pack: abrir la página del pack y confirmar la licencia ese día, y guardar captura/archivo LICENSE junto al asset.

## 1. Fichas por fuente

### Takeaway
Las fuentes de primera línea (todas CC0, sin atribución) son Poly Haven, Kenney, Quaternius, ambientCG y Poly Pizza (parte CC0). Sketchfab y Poly Pizza/Google Poly son CC-BY (exigen atribución) y son el recurso para lo que falta (escenarios específicos). Mixamo y BlenderKit son usables comercialmente pero con restricción de redistribución de archivos crudos. NASA y Smithsonian: uso libre con salvedades.

### Cited Findings (fichas)

**1. Poly Haven — prioridad ALTA** (https://polyhaven.com)
- Contiene HDRIs, texturas PBR y modelos 3D. Licencia CC0; uso comercial permitido; atribución no requerida (apreciada); redistribución permitida, incluso dentro de productos que se venden — [Licencia](https://polyhaven.com/license). Conteo: la página no lo muestra [V]; cifras del catálogo [I].
- Exclusiones: logos, avatares, renders de ejemplo y texto del sitio NO son CC0; los ToS prohíben scraping sin permiso — [Licencia](https://polyhaven.com/license). No se puede reclamar autoría ni re-licenciar — [FAQ](https://polyhaven.com/faq).
- API api.polyhaven.com con términos propios. Fuentes en conflicto: una página corporativa dice que es gratuita para todos incluido uso comercial; un dev log dice que uso comercial de la API requiere contactarlos — [Corporate](https://polyhaven.com/corporate); [Dev Log #20](https://blog.polyhaven.com/dev-log-20/). => Antes de automatizar masivamente, leer API Terms o pedir permiso (descargar a mano o poco volumen es seguro).
- Formatos/estilo [I]: GLB/FBX/blend (modelos), HDR/EXR, texturas PNG/JPG/EXR 1k-8k; estilo fotorrealista (escaneos), no estilizado; HDRIs muy útiles para fondos de plaza, calle, playa, estudio. Descarga sin cuenta [I].

**2. ambientCG — prioridad ALTA (texturas)** (https://ambientcg.com)
- docs.ambientcg.com expone API v1/v2/v3 con endpoints /downloads_csv y /full_json; la página de licencia exacta no se pudo leer — [Docs](https://docs.ambientcg.com/). Licencia CC0 y descarga por lotes [I, muy conocida pero NO verificada aquí]. Verificar en https://docs.ambientcg.com/license/ antes de uso.
- Contenido [I]: miles de materiales PBR, algunos HDRI y modelos; sin cuenta; las descargas ZIP tienen URLs estables por ID.

**3. Kenney — prioridad ALTA (estilo limpio low-poly)** (https://kenney.nl/assets/category:3D)
- Licencia: activos de las páginas de assets son CC0, uso comercial permitido, atribución no requerida (se agradece); la redistribución no se aclara en esa página, remite al archivo de licencia de cada pack — [Support](https://kenney.nl/support).
- Packs 3D vistos en la página 1 de 4: Mini Characters, Mini Shop, Mini Skate, City Kit (Roads), City Kit (Industrial), Mini Dungeon, Mini Forest, Modular Cave Kit, Factory Kit, Car Kit, Platformer Kit, Cube Pets, Modular Dungeon Kit, Pirate Kit, Modular Space Kit, Graveyard Kit — [Kenney 3D](https://kenney.nl/assets/category:3D). Las páginas 2-4 NO se leyeron [gap]. Packs que probablemente existen y sirven (City Kit Commercial/Suburban, Furniture Kit, Blocky Characters, Food Kit, Watercraft, Building Kit) [I, verificar].
- Formatos [I]: GLB/FBX/OBJ/DAE y a veces blend; carpeta pequeña (MB). Sin cuenta; sin API oficial conocida [I]; enlaces de descarga en cada pack (no se probó su estabilidad). Estilo: low-poly de colores planos, coherente entre packs; excelente para "juguete/arcilla".

**4. Quaternius — prioridad ALTA** (https://quaternius.com)
- Las páginas de pack (p. ej. Modular Sci-Fi Megakit) dicen CC0, libre para uso personal, educativo y comercial; formatos FBX, OBJ, glTF gratis; la versión Source (con .blend) y Pro/"All in one" son de pago/Patreon; "60-70% de mis packs es totalmente gratis" — [Modular Sci-Fi Megakit](https://quaternius.com/packs/modularscifimegakit.html); [Outfits Fantasy](https://quaternius.com/packs/modularcharacteroutfitsfantasy.html); [Ultimate Platformer en itch](https://quaternius.itch.io/ultimate-platformer-pack) (CC0, FBX/OBJ/glTF/Blend). Quaternius también publica en OpenGameArt como "all CC0" — [OGA](https://opengameart.org/content/all-cc0-uploader-quaternius).
- Categorías de la home: Characters, Nature, Animated, FPS, Buildings, Medieval, Space, Vehicles; etiquetas: Furniture, Food, Modular, Rigged, Cyberpunk, Tabletop — [quaternius.com](https://quaternius.com/index.html). La home no declara licencia (hay que mirar cada pack).
- Estilo: low-poly suave, personajes rigeados con animaciones; buenos para figuras genéricas sin cara. Sin API [I].

**5. KayKit (Kay Lousberg) — prioridad MEDIA** (https://kaylousberg.itch.io/)
- Hay packs de pago (The Complete KayKit $150; Mystery Monthly $19.99; Bits Bundles $19.95) y varios packs sin precio visible (City Builder Bits, Furniture Bits, Restaurant Bits, Prototype Bits, Character Pack Adventurers/Skeletons, Platformer, Forest, Dungeon, etc.) — [itch KayKit](https://kaylousberg.itch.io/). La página NO declara licencia ni formatos [gap]; CC0 para los gratuitos [I, no verificado]. NO USAR sin verificar la licencia de cada pack. Estilo: low-poly cartoon coherente; Furniture/Restaurant/City Builder Bits encajan con oficina/casa/hotel.

**6. Poly Pizza — prioridad ALTA (buscador de low-poly)** (https://poly.pizza)
- Más de 10.700 modelos gratis; hay enlace a API (/docs/api/v1.1); la home no menciona licencia ni formatos — [poly.pizza](https://poly.pizza/). Ficha de prensa: "creative commons y dominio público" (cifra antigua 7000+) — [Fact Sheet](https://poly.pizza/docs/press). Es sucesor de Google Poly, no espejo directo — [GameFromScratch](https://gamefromscratch.com/poly-pizza-a-replacement-to-google-poly/).
- Mezcla CC0 y CC-BY por modelo [I, consistente con la ficha]; los CC-BY exigen atribución al autor. Hay que registrar licencia + autor por modelo. Formato GLB [I]. Estilo: low-poly heterogéneo (mezcla Quaternius, Kenney, otros). La API requiere clave [I]. Útil como "buscador" para props (trofeo, micrófono, cámara).

**7. Sketchfab — prioridad ALTA para huecos, con cuidado**
- Por defecto los modelos descargables son CC BY (atribución); CC0 existe pero es minoría (~2.000 de instituciones culturales en 2019-2020); CC BY-NC NO permite uso comercial; también hay licencia "Standard" de la tienda — [Intro CC](https://sketchfab.com/blogs/community/an-introduction-to-creative-commons-licenses); [Filtros de licencia](https://sketchfab.com/blogs/community/refine-downloadable-model-searches-with-new-license-filters). Si el autor cambia la licencia después, vale la que tenía al descargar — [Help](https://help.sketchfab.com/en/articles/16152215-crediting-users-for-3d-model-downloads).
- Cómo filtrar: en el buscador activar Downloadable y el filtro de licencia (CC0 / CC BY); evitar NC, ND "editorial" y modelos de marcas. Esos filtros existen según el blog oficial; nombres exactos de parámetros de API no verificados [gap].
- Descarga por API: GET https://api.sketchfab.com/v3/models/{UID}/download con token Bearer (OAuth 2.0 / cuenta); devuelve enlaces temporales a glTF y USDZ — [Download API](https://sketchfab.com/developers/download-api/downloading-models); [Guidelines](https://sketchfab.com/developers/download-api/guidelines). Apps de terceros deben mostrar la licencia CC y la procedencia — [API Terms](https://sketchfab.com/developers/terms). Enlaces temporales => no hay URLs estables para lotes. Automatizar con permiso/cuenta del usuario y respetando términos.
- Nota: el fetch directo a sketchfab.com/licenses devolvió texto de otro tipo de licencia (no CC); no usarlo como fuente. Calidad muy variable; revisar polígonos y texturas.

**8. Google Poly (archivo/espejos) — prioridad MEDIA/BAJA**
- Poly cerró en 2021. Existen archivos: polygone.art (CC-BY, torrent y zip), Internet Archive, icosa.gallery — [Archive Team](https://wiki.archiveteam.org/index.php/Google_Poly); [polygone.art](https://github.com/arodic/polygone.art). Atribución generalmente requerida; riesgo de marcas en objetos copiados. No se verificó que los enlaces sigan vivos [gap]. Prefiero Poly Pizza (curado).

**9. OpenGameArt (OGA) — prioridad MEDIA** (https://opengameart.org)
- Aloja packs CC0 (Quaternius sube allí con "all CC0"; Modular Dungeon, Medieval Village en CC0 según búsqueda) — [OGA Quaternius](https://opengameart.org/content/all-cc0-uploader-quaternius). Mezcla de licencias CC0, CC-BY, CC-BY-SA, GPL: filtrar por licencia; CC-BY-SA y GPL: NO USAR sin verificar (copyleft). Calidad variable.

**10. itch.io (packs gratuitos) — prioridad MEDIA**
- Quaternius y KayKit publican allí (ver arriba). Packs de terceros: licencia por página (Creative Commons Zero aparece como campo "License"). No hay API pública de descarga sin cuenta/clave [I]. Cada autor distinto: verificar.

**11. Smithsonian 3D — prioridad BAJA para este proyecto** (https://3d.si.edu)
- Modelos "Open Access" bajo CC0; descargables en OBJ o glTF; unos 2.000-2.200 (cifra de 2020, puede estar desactualizada); el espejo de Harvard LIL en Source Cooperative tiene copia masiva (carpeta 3d, S3/Rclone) — [Smithsonian](https://www.si.edu/openaccess?page=0); [CG Channel](https://www.cgchannel.com/2020/03/get-2000-free-3d-models-from-the-smithsonian-collection/); [Source Coop](https://source.coop/harvard-lil/smithsonian-open-access). Contenido: museo/escaneos (fósiles, objetos históricos), poco para escenarios de farándula. Escaneos pesados.

**12. NASA 3D Resources — prioridad BAJA** (https://science.nasa.gov/3d-resources/)
- Gratis para descargar y usar bajo las pautas de imagen/medios de NASA: no sugerir aval de NASA en uso comercial, no usar insignia/logotipo NASA, cuidado con personas identificables y créditos de terceros — [NASA 3D](https://science.nasa.gov/3d-resources/); [Guidelines](https://www.nasa.gov/nasa-brand-center/images-and-media). Contenido espacial (naves, planetas). Poco relevante.

**13. BlenderKit — prioridad MEDIA** (https://www.blenderkit.com)
- Dos licencias: "Royalty-free" y "CC0". Uso comercial permitido, no se pueden vender los assets sueltos y no deben ser extraíbles de lo distribuido — [Licenses](https://www.blenderkit.com/docs/licenses/); [Licensing FAQ](https://www.blenderkit.com/docs/licenses/licensing-faq/). Buena parte gratuita (~54.000 de más de 114.000 según reporte 2026; cifras inconsistentes). Requiere cuenta y el addon de Blender; para video renderizado es adecuado. Cuidado con los assets de pago (no incluidos en plan gratuito). No es adecuado para exportar y reempaquetar.

**14. Mixamo (Adobe) — prioridad ALTA para personajes/animaciones, no para escenarios**
- FAQ oficial: personajes y animaciones libres de regalías para proyectos personales, comerciales y sin fines de lucro; no hay que comprar ni suscribirse (cuenta Adobe gratuita); no se permite redistribuir los archivos crudos ni usarlos para entrenar modelos ML; atribución no requerida — [Adobe FAQ](https://helpx.adobe.com/creative-cloud/faq/mixamo-faq.html); [Comunidad Adobe](https://community.adobe.com/t5/mixamo-discussions/mixamo-faq-licensing-royalties-ownership-eula-and-tos/td-p/13234775) (hilo de empleado 2022, no oficial; sin confirmación más reciente). Formato FBX. Requiere cuenta; sin API oficial pública [I]. Personajes de aspecto genérico y datado.

**15. Blender demo files y Blender Studio — prioridad MEDIA**
- Asset bundles oficiales: Human Base Meshes y Cube Diorama CC0; Ellie Pose Library CC-BY — [Blender Demo](https://www.blender.org/download/demo-files/). Blender Studio: contenido en general CC-BY, cada asset indica su licencia; librería de personajes en CC-BY (dato antiguo) — [Remixing](https://studio.blender.org/remixing/); [Character library](https://studio.blender.org/blog/new-the-character-library). Escenas de películas (Coffee Run, Glass Half, etc.) tienen licencias por proyecto (ver /licensing de cada película). Formato .blend. Cuenta para el contenido de Studio.

**16. glTF Sample Assets (Khronos) — prioridad BAJA** (https://github.com/KhronosGroup/glTF-Sample-Assets)
- Licencia por modelo: README.md y metadata.json de cada carpeta; hay archivo REUSE; muchos exigen atribución (ej. CC BY 4.0 Wayfair); algunos CC0 — [Repo](https://github.com/KhronosGroup/glTF-Sample-Assets); [X3D list](https://www.web3d.org/pipermail/x3d-public_web3d.org/2025-June/021610.html). Piezas de prueba (silla, lámparas), no escenarios. Descarga por git, enlaces estables.

**17. Three.js examples models — prioridad BAJA** — Licencias mezcladas por modelo (muchos son de terceros, no libres) [I, no verificado]. NO USAR sin verificar.

**18. CGTrader / TurboSquid / Free3D — prioridad BAJA, NO USAR sin verificar**
- TurboSquid: licencia royalty-free salvo indicación; modelos "Editorial" requieren que tú limpies los derechos de la IP representada; no se pueden entregar archivos a un cliente sin licencia por cliente — [TurboSquid License](https://www.turbosquid.com/licensing); [Royalty-Free](https://www.turbosquid.com/help/en/articles/9937422-royalty-free-license). Free3D (de TurboSquid): cada archivo tiene términos del autor => verificar uno por uno — [Free3D terms](https://free3d.com/terms-conditions). CGTrader: sin ficha oficial leída [gap]; términos por vendedor. Riesgo: marcas/IP, términos de IA.

**19. Thingiverse — NO USAR** (modelos para impresión 3D; licencias a menudo NC/SA; mala fidelidad visual). [I]

**20. Synty (solo informativo)** — Packs low-poly de pago (POLYGON, etc.), licencia propietaria que normalmente no permite redistribuir los archivos fuente; estilo muy usable pero fuera del presupuesto cero [I, no verificado en esta sesión]. Solo referencia de estilo.

### Inferences
- Para un look coherente "juguete/low-poly" conviene fijar Kenney + Quaternius + KayKit (si su licencia se verifica) como base y Poly Haven solo para HDRI/texturas de fondo.
- Para automatizar sin fricción: Kenney/Quaternius/ambientCG (descargas por URL de pack); Poly Haven (API, ver conflicto de términos); Sketchfab solo vía API oficial con token del usuario.
- Mantener un manifiesto (CSV) con fuente, URL, licencia, autor, fecha de captura; es obligatorio para CC-BY.

### Gaps
- No se leyeron páginas 2-4 de Kenney 3D ni se confirmó el texto de licencia de ambientCG, KayKit, Quaternius (home), Three.js, OpenGameArt, itch.io, Synty, CGTrader, Free3D.
- No se verificaron conteos actuales por fuente ni tamaños típicos de descarga.
- Estado vivo de espejos de Google Poly no confirmado.

## 2. Matriz escena/prop -> mejores fuentes

Marcado [I] todo lo que depende de nombres de packs no verificados.

| Elemento | Mejores fuentes (orden) | Comentario |
|---|---|---|
| Pasarela/desfile | Sketchfab CC0/CC-BY (buscar "runway"), Poly Pizza; modelar en código (plataforma + luces) | Pocas opciones libres; es geometría simple: modelar |
| Escenario concurso de belleza | Sketchfab; Kenney/Quaternius para estructuras modulares; resto en código | Truss, cortinas, luces: código |
| Estadio | Poly Pizza, Quaternius (sports/FPS), Sketchfab CC0 | Hay estadios low-poly; verificar |
| Plaza / calle / ciudad | Kenney City Kit (Roads, Commercial, Suburban) [I], KayKit City Builder Bits, Quaternius city; HDRI Poly Haven | Mejor cobertura |
| Oficina | KayKit Furniture Bits, Kenney Furniture Kit [I], Quaternius furniture, Poly Haven | Escritorios, sillas, laptops |
| Estudio de TV | Modelar en código (set, mesa, pantallas) + props Kenney/Poly Pizza (cámaras, micrófonos) | Pocos libres |
| Tribunal | Sketchfab; mobiliario genérico Kenney/Quaternius; martillo en Poly Pizza | Modular propio |
| Hospital | Sketchfab, Quaternius sci-fi interior modular, KayKit; camilla/cama en Poly Pizza | |
| Aeropuerto | Kenney (Car/City), Sketchfab; cintas y asientos en código | |
| Hotel / casa | KayKit Furniture Bits, Kenney Furniture Kit [I], Quaternius | Buen soporte |
| Playa | Quaternius/Kenney nature (palmas, rocas), HDRI Poly Haven (playa), texturas arena ambientCG | Muy bien cubierto |
| Discoteca | Código (luces, bola disco, piso LED) + HDRI/emisivos; props en Poly Pizza | Modelar |
| Alfombra roja | Código (plano + postes/cuerdas) + ambientCG (tela roja) | Fácil |
| Rueda de prensa | Código (atril, backdrop) + micrófonos, cámaras de Poly Pizza/Sketchfab | |
| Corona / banda / trofeo | Poly Pizza, Sketchfab (CC0/CC-BY), Quaternius fantasy (corona) | Corona y banda: modelar en código |
| Micrófono / cámara de fotos / flashes | Poly Pizza, Sketchfab; flashes = luces en código | |
| Sillas / mesas | KayKit Furniture Bits, Kenney, Quaternius | Abundantes |
| Autos | Kenney Car Kit, Quaternius vehicles, Poly Pizza | Genéricos sin marcas |
| Celulares | Poly Pizza, Sketchfab; o caja con textura en código | Evitar marcas |
| Ropa / vestidos | Quaternius Modular Character Outfits, Mixamo (personajes vestidos), Blender Human Base Meshes | Vestidos de gala: modelar o texturizar |
| Bandera | Código (plano con ondulación) + textura | Fácil |
| Cartelera / letrero | Código (texto 3D/planos) | |
| Texturas | ambientCG, Poly Haven | |
| HDRI | Poly Haven | |

## 3. Elementos difíciles de encontrar libres (modelar en código)
- Pasarela con luces y escenario de concurso (truss, cortinas, pantalla LED).
- Estudio de TV, sala de prensa, tribunal con identidad propia.
- Discoteca (luces dinámicas, bola de espejos).
- Alfombra roja con postes y cuerdas, banda de reina, corona con look uniforme.
- Banderas, carteleras, flashes de cámara (efectos de luz).
- Vestidos de gala genéricos y cabello/maquillaje: no hay opciones libres de calidad coherente.
- Props de marcas reales (celulares, autos, logos): evitar; usar genéricos.

## 4. Recomendación de prioridades
Alta: Poly Haven (HDRI/texturas), ambientCG, Kenney, Quaternius, Poly Pizza, Sketchfab (filtro CC0/CC-BY con manifiesto), Mixamo (personajes). Media: BlenderKit, OpenGameArt, itch.io, KayKit (tras verificar), Blender Studio. Baja: Smithsonian, NASA, glTF Samples, Google Poly archive. NO USAR sin verificar: Thingiverse, CGTrader/TurboSquid/Free3D, Three.js example models, packs CC-BY-SA/GPL/NC, Synty.
