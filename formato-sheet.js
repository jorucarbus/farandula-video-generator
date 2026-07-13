// Re-aplica el formato neobrutalism a la hoja de registro (herramienta manual).
// Uso: node formato-sheet.js  (requiere GOOGLE_SHEET_ID y credenciales en .env / credentials.json)
// El formato también se aplica solo la primera vez que se crean los encabezados.
require('dotenv').config();
const sheets = require('./sheets');

if (!sheets.configurado()) {
  console.error('❌ Falta GOOGLE_SHEET_ID');
  process.exit(1);
}

sheets.formatearHoja()
  .then(() => console.log('✅ Listo'))
  .catch(e => { console.error('❌', e.message); process.exit(1); });
