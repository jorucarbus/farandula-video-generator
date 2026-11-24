// Configuración de las PERSONAS del rig de fotos: de dónde sale su cabeza, dónde están sus bocas y la geometría medida sobre su foto (en píxeles de la foto, 864x1184).
// 'generica' = cabeza ficticia del kit (assets/foto-rig); 'leidy' = cabeza generada a partir de fotos de la protagonista (assets/foto-rig-leidy). OJO LEGAL: rostro de persona real.
// Para agregar una persona: poner assets/kit/personas/<slug>/cabeza.png (retrato frontal, fondo gris liso), medir la geometría y agregarla aquí.
const path = require('path');
const KIT = path.join(__dirname, '..', 'assets', 'kit'), RAIZ = path.join(__dirname, '..', 'assets');
const PERSONAS = {
  generica: {
    salida: path.join(RAIZ, 'foto-rig'), cabeza: path.join(KIT, 'cabeza-relleno-mujer.png'), bocas: path.join(KIT, 'bocas'), crudoBocas: path.join(__dirname, '..', 'data-motor', 'kit', 'bocas-crudo'),
    elegidas: { Aa: 'Aa-1', Ee: 'Ee-1', Oh: 'Oh-1', Woo: 'Woo-1', M: 'M-1', F: 'F-1', D: 'D-1', S: 'S-1', Uh: 'Uh-1', R: 'R-1' },
    geo: { neckY: 830, chinY: 735, cara: { cx: 432, cy: 408, w: 610, h: 663 }, neckX: [300, 585], faceX: [235, 640], fade: [560, 700], hairTop: 340, elipse: { cx: 432, cy: 450, rx: 212, ry: 330 }, peloModo: 'oscuro', peloFinCara: 640,
      boca: { BX: 210, BY: 470, BW: 450, BH: 360, cx: 432, cy: 655, rx: 150, ry: 115, alinear: [250, 300, 620, 470] } },
  },
  leidy: {
    salida: path.join(RAIZ, 'foto-rig-leidy'), cabeza: path.join(KIT, 'personas', 'leidy', 'cabeza.png'), bocas: path.join(KIT, 'personas', 'leidy', 'bocas'), crudoBocas: path.join(__dirname, '..', 'data-motor', 'kit', 'personas', 'leidy', 'bocas-crudo'),
    elegidas: { Aa: 'Aa-1', Ee: 'Ee-1', Oh: 'Oh-1', Woo: 'Woo-1', M: 'M-1', F: 'F-1', D: 'D-1', S: 'S-1', Uh: 'Uh-1', R: 'R-1' },
    geo: { neckY: 900, chinY: 791, cara: { cx: 417, cy: 432, w: 606, h: 712 }, neckX: [330, 525], faceX: [215, 630], fade: [560, 820], hairTop: 340, elipse: { cx: 417, cy: 490, rx: 215, ry: 330 }, peloModo: 'todo', peloFinCara: 820,
      boca: { BX: 195, BY: 482, BW: 450, BH: 360, cx: 420, cy: 667, rx: 150, ry: 115, alinear: [280, 380, 560, 500] },
      emo: { BX: 130, BY: 320, BW: 580, BH: 560, cx: 417, cy: 575, rx: 235, ry: 290, alinear: [260, 190, 580, 320] } },
    emociones: path.join(KIT, 'personas', 'leidy', 'emociones'), crudoEmociones: path.join(__dirname, '..', 'data-motor', 'kit', 'personas', 'leidy', 'emociones-crudo'),
    emocionesElegidas: { feliz: 'feliz-1', sorpresa: 'sorpresa-1', triste: 'triste-1', enojo: 'enojo-1', duda: 'duda-1', orgullo: 'orgullo-1', asco: 'asco-1', preocupacion: 'preocupacion-1', amor: 'amor-1' },
  },
};
module.exports = { PERSONAS };
