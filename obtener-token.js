// Script de un solo uso: obtiene el REFRESH TOKEN de tu cuenta de Google para que
// la app pueda subir a TU Drive desde Railway (los Service Accounts no tienen cuota).
//
// Requisitos previos (Google Cloud Console → APIs y servicios → Credenciales):
//   1. Crear "ID de cliente de OAuth 2.0", tipo "App de escritorio".
//   2. Copiar Client ID y Client Secret.
//
// Uso:
//   GOOGLE_OAUTH_CLIENT_ID=xxx GOOGLE_OAUTH_CLIENT_SECRET=yyy node obtener-token.js
// (o ponlos en .env). Abre la URL, autoriza, pega el código y copia el refresh token.

require('dotenv').config();
const { google } = require('googleapis');
const readline = require('readline');

const CLIENT_ID = process.env.GOOGLE_OAUTH_CLIENT_ID;
const CLIENT_SECRET = process.env.GOOGLE_OAUTH_CLIENT_SECRET;

if (!CLIENT_ID || !CLIENT_SECRET) {
  console.error('❌ Falta GOOGLE_OAUTH_CLIENT_ID o GOOGLE_OAUTH_CLIENT_SECRET.');
  console.error('   Créalos en Google Cloud Console (tipo "App de escritorio") y ponlos en .env');
  process.exit(1);
}

// "urn:ietf:wg:oauth:2.0:oob" está deprecado; usamos el flujo de copiar/pegar por consola
const oauth2 = new google.auth.OAuth2(CLIENT_ID, CLIENT_SECRET, 'http://localhost:53682');

const url = oauth2.generateAuthUrl({
  access_type: 'offline',      // imprescindible para obtener refresh_token
  prompt: 'consent',
  scope: ['https://www.googleapis.com/auth/drive'],
});

console.log('\n1) Abre esta URL en tu navegador y autoriza:\n');
console.log(url);
console.log('\n2) Tras autorizar te redirige a una URL http://localhost:53682/?code=XXXX (dará error de conexión, es normal).');
console.log('   Copia SOLO el valor de "code=" de la barra de direcciones.\n');

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
rl.question('Pega el código aquí: ', async (code) => {
  rl.close();
  try {
    const { tokens } = await oauth2.getToken(code.trim());
    if (!tokens.refresh_token) {
      console.error('\n❌ No se recibió refresh_token. Revoca el acceso de la app en https://myaccount.google.com/permissions y reintenta.');
      process.exit(1);
    }
    console.log('\n✅ ¡Listo! Agrega esta variable a Railway (y a tu .env local si quieres):\n');
    console.log(`GOOGLE_OAUTH_REFRESH_TOKEN=${tokens.refresh_token}\n`);
  } catch (e) {
    console.error('\n❌ Error obteniendo el token:', e.message);
    process.exit(1);
  }
});
