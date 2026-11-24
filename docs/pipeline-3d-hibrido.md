# Pipeline híbrido 3D + Gemini (una persona nueva con ~6 imágenes)

Idea (2026-11-24): en vez de pedir a Gemini una imagen por boca/emoción (41 por persona), un modelo 3D con todas las formas faciales renderiza las **hojas modelo** (rejillas con la misma cámara y las expresiones exactas) y Gemini solo las **"viste" con la cara de la persona** (1 imagen por hoja).

## Piezas
- **Blender 4.5 LTS** portátil: `C:\Users\jorucarbus\herramientas\blender-4.5.10-windows-x64\blender.exe` (descargado de blender.org).
- **MPFB 2.0.18** (extensión de Blender, CC0) + paquetes de assets de MakeHuman en `%APPDATA%\Blender Foundation\Blender\4.5\extensions\.user\user_default\mpfb\data` (`makehuman_system_assets_cc0`, `faceunits01` = 52 formas ARKit, `visemes02` = visemas Oculus).
- `herramientas/blender/cabeza_modelo.py`: arma la cabeza 3D (mujer joven) con ojos, cejas, pestañas, dientes y lengua, y renderiza visemas, emociones y giro de cabeza.
- `scripts/hojas-3d.js`: arma las hojas modelo (rejillas) con esos renders.
- `scripts/hojas-gemini.js`: las "viste" con el retrato de la persona. **Tope de gasto** (`--tope`, contador en `data-motor/gasto-gemini.json`), se detiene ante 402/429 y no reintenta.
- `scripts/hojas-recortar.js`: separa las celdas, las registra (escala + desplazamiento) contra la cabeza base y las deja como imágenes alineadas.
- `scripts/bocas-elegir.js` + `scripts/kit-foto-rig.js --persona <slug>3d`: pegan boca/emoción con borde suave en el rig.

## Cómo repetirlo para otra persona
1. Cabeza aprobada en `assets/kit/personas/<slug>/cabeza.png` (frontal, fondo gris).
2. `blender -b --python herramientas/blender/cabeza_modelo.py -- --salida data-motor/blender/todo --todo` y luego `... --cara` (una sola vez; las hojas sirven para todos). `node scripts/hojas-3d.js`.
3. `node scripts/hojas-gemini.js --persona <slug> --hojas visa,visb,sup --tope 3` (3 imágenes ≈ 0.12 USD).
4. `node scripts/hojas-recortar.js --persona <slug>`; agregar la persona `<slug>3d` en `scripts/personas-foto.js`; `bocas-elegir` y `kit-foto-rig`.

## Lo aprendido
- Hojas de **cara completa** (con frente y pelo) → Gemini las trata como retratos y pone la identidad. Hojas de **solo la parte baja** de la cara → copia el render 3D sin cambiar la identidad (falló).
- Las celdas de **ángulos** (giro de cabeza) no las respetó: devolvió perfiles repetidos. Pendiente: una imagen por ángulo o ángulos en hojas más chicas.
- Resolución: celdas de ~400 px; para primeros planos grandes se nota blanda.
