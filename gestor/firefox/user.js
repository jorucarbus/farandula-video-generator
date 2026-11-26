// Preferencias del perfil de Firefox de la superapp (INICIAR-SUPERAPP.bat lo copia al perfil la primera vez; después puedes cambiarlas).
// Perfil propio: aquí inicias sesión en Instagram, TikTok, Facebook y X, y el Selector lee las cookies de ESTE perfil (no del Firefox de siempre).
user_pref("browser.startup.homepage", "http://127.0.0.1:3100");
user_pref("browser.startup.page", 1);                       // al abrir: la superapp
user_pref("browser.shell.checkDefaultBrowser", false);
user_pref("browser.aboutwelcome.enabled", false);
user_pref("browser.startup.homepage_override.mstone", "ignore");
user_pref("startup.homepage_welcome_url", "");
user_pref("startup.homepage_welcome_url.additional", "");
user_pref("datareporting.policy.dataSubmissionPolicyBypassNotification", true);
user_pref("browser.tabs.warnOnClose", false);
user_pref("browser.newtabpage.enabled", false);             // pestaña nueva en blanco (rápida)
user_pref("signon.rememberSignons", true);                  // Firefox ofrece guardar contraseñas en ESTE perfil
user_pref("browser.download.useDownloadDir", true);
