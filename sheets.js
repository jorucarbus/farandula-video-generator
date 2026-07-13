// Registro de videos en Google Sheets (misma Service Account que Drive)
const { google } = require('googleapis');
const path = require('path');

const SHEET_ID = process.env.GOOGLE_SHEET_ID;

const ENCABEZADOS = [
  'Fecha', 'Título', 'Descripción + Hashtags', 'Protagonista', 'Canal',
  'Nombre archivo', 'Link fuente', 'Link render', 'Dinero generado', 'Status',
];

let sheetsClient = null;

function getClient() {
  if (!sheetsClient) {
    // En Railway no hay credentials.json en disco: se usa GOOGLE_CREDENTIALS_JSON
    const opciones = { scopes: ['https://www.googleapis.com/auth/spreadsheets'] };
    if (process.env.GOOGLE_CREDENTIALS_JSON) {
      opciones.credentials = JSON.parse(process.env.GOOGLE_CREDENTIALS_JSON);
    } else {
      opciones.keyFile = path.join(__dirname, 'credentials.json');
    }
    sheetsClient = google.sheets({ version: 'v4', auth: new google.auth.GoogleAuth(opciones) });
  }
  return sheetsClient;
}

function configurado() {
  return Boolean(SHEET_ID);
}

// Escribir la fila de encabezados si la hoja está vacía
async function asegurarEncabezados() {
  const client = getClient();
  const res = await client.spreadsheets.values.get({
    spreadsheetId: SHEET_ID,
    range: 'A1:J1',
  });
  if (!res.data.values || res.data.values.length === 0) {
    await client.spreadsheets.values.update({
      spreadsheetId: SHEET_ID,
      range: 'A1:J1',
      valueInputOption: 'RAW',
      requestBody: { values: [ENCABEZADOS] },
    });
  }
}

// Agregar una fila por cada video generado.
// "Dinero generado" queda vacío: se llena a mano. Status inicial: pendiente_publicar.
async function registrarVideo(datos) {
  if (!configurado()) {
    console.warn('⚠️ GOOGLE_SHEET_ID no configurado: se omite el registro en Sheets');
    return false;
  }
  await asegurarEncabezados();
  await getClient().spreadsheets.values.append({
    spreadsheetId: SHEET_ID,
    range: 'A:J',
    valueInputOption: 'USER_ENTERED',
    requestBody: {
      values: [[
        datos.fecha || new Date().toISOString().slice(0, 10),
        datos.titulo || '',
        datos.descripcion || '',
        datos.protagonista || '',
        datos.canal || '',
        datos.nombreArchivo || '',
        datos.linkFuente || '',
        datos.linkRender || '',
        '', // Dinero generado (manual)
        'pendiente_publicar',
      ]],
    },
  });
  console.log(`📊 Registrado en Sheets: ${datos.nombreArchivo}`);
  return true;
}

module.exports = { registrarVideo, configurado };
