// Registro de videos en Google Sheets (misma Service Account que Drive)
const { google } = require('googleapis');
const path = require('path');

const SHEET_ID = process.env.GOOGLE_SHEET_ID;

const ENCABEZADOS = [
  'Fecha', 'Título', 'Descripción + Hashtags', 'Protagonista', 'Canal',
  'Nombre archivo', 'Link fuente', 'Link render', 'Dinero generado', 'Status', 'Guion',
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
    range: 'A1:K1',
  });
  if (!res.data.values || res.data.values.length === 0) {
    await client.spreadsheets.values.update({
      spreadsheetId: SHEET_ID,
      range: 'A1:K1',
      valueInputOption: 'RAW',
      requestBody: { values: [ENCABEZADOS] },
    });
    // Primera vez: dar formato neobrutalism a la hoja
    try { await formatearHoja(); } catch (e) { console.warn('⚠️ No se pudo formatear la hoja:', e.message); }
  }
}

// ---- Formato neobrutalism (paleta de las apps) ----
// Idempotente: borra bandings y reglas condicionales previas antes de re-aplicar.
const COLOR = {
  negro:    { red: 0.067, green: 0.067, blue: 0.067 },
  blanco:   { red: 1, green: 1, blue: 1 },
  crema:    { red: 1, green: 0.965, blue: 0.898 },
  amarillo: { red: 1, green: 0.851, blue: 0.239 },
  verde:    { red: 0.722, green: 0.949, blue: 0.545 },
};
const ANCHOS = [92, 220, 330, 125, 135, 250, 120, 120, 115, 155, 350]; // px por columna A..K
const ALINEAR = ['CENTER','LEFT','LEFT','LEFT','CENTER','LEFT','CENTER','CENTER','CENTER','CENTER','LEFT'];
const FILAS_CAPACIDAD = 200; // formatea header + 199 filas por adelantado

async function formatearHoja() {
  const client = getClient();
  const meta = await client.spreadsheets.get({
    spreadsheetId: SHEET_ID,
    fields: 'sheets(properties(sheetId,title),bandedRanges(bandedRangeId),conditionalFormats)',
  });
  const hoja = meta.data.sheets[0];
  const gid = hoja.properties.sheetId;
  const grueso = { style: 'SOLID_THICK', color: COLOR.negro };
  const medio = { style: 'SOLID_MEDIUM', color: COLOR.negro };
  const requests = [];

  // Limpiar formato previo (evita duplicados al re-correr)
  (hoja.bandedRanges || []).forEach(b => requests.push({ deleteBanding: { bandedRangeId: b.bandedRangeId } }));
  for (let i = (hoja.conditionalFormats || []).length - 1; i >= 0; i--) {
    requests.push({ deleteConditionalFormatRule: { sheetId: gid, index: i } });
  }

  // Congelar encabezado
  requests.push({ updateSheetProperties: { properties: { sheetId: gid, gridProperties: { frozenRowCount: 1 } }, fields: 'gridProperties.frozenRowCount' } });

  // Encabezado negro, texto blanco negrita, centrado
  requests.push({ repeatCell: {
    range: { sheetId: gid, startRowIndex: 0, endRowIndex: 1, startColumnIndex: 0, endColumnIndex: 11 },
    cell: { userEnteredFormat: { backgroundColor: COLOR.negro, horizontalAlignment: 'CENTER', verticalAlignment: 'MIDDLE', wrapStrategy: 'WRAP', textFormat: { foregroundColor: COLOR.blanco, bold: true, fontSize: 11 } } },
    fields: 'userEnteredFormat(backgroundColor,horizontalAlignment,verticalAlignment,wrapStrategy,textFormat)',
  }});
  requests.push({ updateDimensionProperties: { range: { sheetId: gid, dimension: 'ROWS', startIndex: 0, endIndex: 1 }, properties: { pixelSize: 46 }, fields: 'pixelSize' } });

  // Datos: alinear arriba + ajustar texto (el fondo lo pone la banda)
  requests.push({ repeatCell: {
    range: { sheetId: gid, startRowIndex: 1, endRowIndex: FILAS_CAPACIDAD, startColumnIndex: 0, endColumnIndex: 11 },
    cell: { userEnteredFormat: { verticalAlignment: 'TOP', wrapStrategy: 'WRAP', textFormat: { fontSize: 10 } } },
    fields: 'userEnteredFormat(verticalAlignment,wrapStrategy,textFormat)',
  }});
  ALINEAR.forEach((al, col) => requests.push({ repeatCell: {
    range: { sheetId: gid, startRowIndex: 1, endRowIndex: FILAS_CAPACIDAD, startColumnIndex: col, endColumnIndex: col + 1 },
    cell: { userEnteredFormat: { horizontalAlignment: al } }, fields: 'userEnteredFormat.horizontalAlignment',
  }}));
  ANCHOS.forEach((px, col) => requests.push({ updateDimensionProperties: {
    range: { sheetId: gid, dimension: 'COLUMNS', startIndex: col, endIndex: col + 1 }, properties: { pixelSize: px }, fields: 'pixelSize',
  }}));

  // Banda alterna blanco/crema
  requests.push({ addBanding: { bandedRange: {
    range: { sheetId: gid, startRowIndex: 1, endRowIndex: FILAS_CAPACIDAD, startColumnIndex: 0, endColumnIndex: 11 },
    rowProperties: { firstBandColor: COLOR.blanco, secondBandColor: COLOR.crema },
  }}});

  // Bordes negros: gruesos alrededor, medios internos + línea gruesa bajo el encabezado
  requests.push({ updateBorders: {
    range: { sheetId: gid, startRowIndex: 0, endRowIndex: FILAS_CAPACIDAD, startColumnIndex: 0, endColumnIndex: 11 },
    top: grueso, bottom: grueso, left: grueso, right: grueso, innerHorizontal: medio, innerVertical: medio,
  }});
  requests.push({ updateBorders: { range: { sheetId: gid, startRowIndex: 0, endRowIndex: 1, startColumnIndex: 0, endColumnIndex: 11 }, bottom: grueso } });

  // Dinero (col I): moneda
  requests.push({ repeatCell: {
    range: { sheetId: gid, startRowIndex: 1, endRowIndex: FILAS_CAPACIDAD, startColumnIndex: 8, endColumnIndex: 9 },
    cell: { userEnteredFormat: { numberFormat: { type: 'CURRENCY', pattern: '"$"#,##0' } } }, fields: 'userEnteredFormat.numberFormat',
  }});

  // Status (col J): publicado=verde, pendiente_publicar=amarillo
  const rangoStatus = [{ sheetId: gid, startRowIndex: 1, endRowIndex: FILAS_CAPACIDAD, startColumnIndex: 9, endColumnIndex: 10 }];
  requests.push({ addConditionalFormatRule: { index: 0, rule: { ranges: rangoStatus, booleanRule: { condition: { type: 'TEXT_EQ', values: [{ userEnteredValue: 'publicado' }] }, format: { backgroundColor: COLOR.verde, textFormat: { bold: true } } } } } });
  requests.push({ addConditionalFormatRule: { index: 1, rule: { ranges: rangoStatus, booleanRule: { condition: { type: 'TEXT_EQ', values: [{ userEnteredValue: 'pendiente_publicar' }] }, format: { backgroundColor: COLOR.amarillo, textFormat: { bold: true } } } } } });

  await client.spreadsheets.batchUpdate({ spreadsheetId: SHEET_ID, requestBody: { requests } });
  console.log(`🎨 Hoja formateada (${requests.length} operaciones)`);
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
    range: 'A:K',
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
        datos.status || 'pendiente_publicar',
        datos.guion || '',
      ]],
    },
  });
  console.log(`📊 Registrado en Sheets: ${datos.nombreArchivo}`);
  return true;
}

// Últimas N filas del historial (para mostrar título/descripción/hashtags/guion en la UI)
async function leerHistorial(limite = 20) {
  if (!configurado()) return [];
  const res = await getClient().spreadsheets.values.get({
    spreadsheetId: SHEET_ID,
    range: 'A2:K',
  });
  const filas = res.data.values || [];
  return filas.slice(-limite).reverse().map(f => ({
    fecha: f[0] || '',
    titulo: f[1] || '',
    descripcion: f[2] || '',
    protagonista: f[3] || '',
    canal: f[4] || '',
    nombreArchivo: f[5] || '',
    linkFuente: f[6] || '',
    linkRender: f[7] || '',
    dinero: f[8] || '',
    status: f[9] || '',
    guion: f[10] || '',
  }));
}

module.exports = { registrarVideo, configurado, formatearHoja, leerHistorial };
