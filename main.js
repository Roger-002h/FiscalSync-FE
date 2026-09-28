// ══════════════════════════════════════════════════════════════════════
// FiscalSync FE — Proceso principal de Electron
// Proyecto derivado de FiscalSync, recortado para contener SOLO:
//   - Facturación Electrónica (webview + descargas + clientes FE)
//   - Envío de correo (nodemailer)
//   - Login / Empresas (a implementar en js/login-admin y js/empresas)
//   - Actualizaciones automáticas (electron-updater + GitHub Releases)
// ══════════════════════════════════════════════════════════════════════
const { app, BrowserWindow, Menu, session, ipcMain, dialog, shell } = require('electron');
const path = require('path');
const fs   = require('fs');
const { autoUpdater } = require('electron-updater');

// Catálogo CAT-002 (DGII) — lo usa el panel de Clientes de Facturación Electrónica
const { cat002CodigoDesdeTexto, nombrePorCodigo, CAT_002 } = require('./data/cat002.js');

let mainWindowRef = null;

// Corrección de persistencia: forzar una ruta única y estable para los
// datos de la app en %AppData%. Históricamente esta app (y las versiones
// anteriores de FiscalSync) podían guardarse bajo nombres distintos
// ('FiscalSync', 'fiscalsync', 'fiscalsync-fe'), lo que hacía que al
// reabrir la app leyera otra carpeta y pensara que la empresa no existía.
// Con esta ruta fija, se evita recrear la empresa en cada arranque.
function cleanupLegacyAppDataDirs(canonicalDir, legacyDirs) {
  for (const legacyDir of legacyDirs) {
    // Corrección persistencia — en Windows (y macOS) el sistema de archivos
    // no distingue mayúsculas de minúsculas: 'FiscalSync' y 'fiscalsync' son
    // LA MISMA carpeta física en disco, aunque como strings de JS sean
    // distintos. La comparación estricta (===) de abajo no lo detectaba, así
    // que esta función borraba la carpeta canónica (recién creada unas
    // líneas antes) en CADA arranque, creyendo que era una carpeta legacy
    // distinta — esa era la causa real de que la empresa nunca sobreviviera
    // a un reinicio. Se compara ignorando mayúsculas/minúsculas.
    if (!legacyDir || legacyDir.toLowerCase() === canonicalDir.toLowerCase()) continue;
    try {
      if (fs.existsSync(legacyDir)) {
        fs.rmSync(legacyDir, { recursive: true, force: true });
        console.log('[FiscalSync FE][persistencia] carpeta legacy eliminada:', legacyDir);
      }
    } catch (e) {
      console.warn('[FiscalSync FE][persistencia] no se pudo eliminar la carpeta legacy:', legacyDir, e.message);
    }
  }
}

// Separación de datos respecto al programa FiscalSync original: FiscalSync
// FE guarda sus datos en %AppData%/FiscalSync FE. Antes usaba
// %AppData%/FiscalSync, carpeta que también usa el programa original
// (mismo fiscaldata.json), y ambos podían pisarse los datos.
// Migración única: si la carpeta nueva todavía no tiene fiscaldata.json, se
// COPIA (nunca se mueve ni se borra el origen) lo de FE desde la carpeta
// anterior. Como esa carpeta puede ser del otro programa, solo se copia si
// su fiscaldata.json contiene la clave "fs_empresas", exclusiva de FE.
function _fiscalDataEsDeFE(archivo) {
  try {
    return fs.readFileSync(archivo, 'utf8').indexOf('"fs_empresas"') !== -1;
  } catch (e) {
    return false;
  }
}

function _copiarDatosFE(origenDir, destinoDir) {
  fs.mkdirSync(destinoDir, { recursive: true });
  fs.copyFileSync(path.join(origenDir, 'fiscaldata.json'), path.join(destinoDir, 'fiscaldata.json'));
  // Archivos auxiliares de userData; cada uno por separado para que un fallo
  // en uno no impida copiar los demás. Las sesiones del portal de Hacienda
  // (Partitions) no se migran: hay que volver a iniciar sesión una vez.
  const cfg = path.join(origenDir, 'export-config.json');
  try {
    if (fs.existsSync(cfg)) fs.copyFileSync(cfg, path.join(destinoDir, 'export-config.json'));
  } catch (e) {
    console.warn('[FiscalSync FE][persistencia] no se pudo copiar export-config.json:', e.message);
  }
  const clientes = path.join(origenDir, 'facturacion-electronica-clientes');
  try {
    if (fs.existsSync(clientes)) fs.cpSync(clientes, path.join(destinoDir, 'facturacion-electronica-clientes'), { recursive: true });
  } catch (e) {
    console.warn('[FiscalSync FE][persistencia] no se pudo copiar los clientes de FE:', e.message);
  }
}

function resolveStableUserDataPath() {
  const appDataRoot = app.getPath('appData');
  const canonicalDir = path.join(appDataRoot, 'FiscalSync FE');
  // Carpeta del programa FiscalSync original (y donde FE guardaba antes):
  // SOLO se lee para migrar; NUNCA se borra ni se modifica.
  const sharedDir = path.join(appDataRoot, 'FiscalSync');
  // Carpetas antiguas propias de FE: tras intentar migrar, se eliminan.
  const legacyDirs = [
    path.join(appDataRoot, 'fiscalsync-fe')
  ].filter(function(dir, index, arr) {
    return dir && arr.indexOf(dir) === index;
  });

  const canonicalFile = path.join(canonicalDir, 'fiscaldata.json');
  const hasCanonicalData = fs.existsSync(canonicalFile);

  if (!hasCanonicalData) {
    const fuentes = [sharedDir].concat(legacyDirs);
    for (const dir of fuentes) {
      const archivo = path.join(dir, 'fiscaldata.json');
      if (!fs.existsSync(archivo)) continue;
      if (dir === sharedDir && !_fiscalDataEsDeFE(archivo)) continue;
      try {
        _copiarDatosFE(dir, canonicalDir);
        console.log('[FiscalSync FE][persistencia] datos migrados desde:', dir, 'hacia:', canonicalDir);
        break;
      } catch (e) {
        console.warn('[FiscalSync FE][persistencia] no se pudo migrar los datos desde:', dir, e.message);
      }
    }
  }

  try {
    fs.mkdirSync(canonicalDir, { recursive: true });
  } catch (e) {
    console.warn('[FiscalSync FE][persistencia] no se pudo crear la carpeta canónica:', e.message);
  }

  cleanupLegacyAppDataDirs(canonicalDir, legacyDirs);
  app.setPath('userData', canonicalDir);
  console.log('[FiscalSync FE][persistencia] userData final:', app.getPath('userData'));
}
resolveStableUserDataPath();

// ══════════════════════════════════════════════════════════════════════
// Corrección 04 — Facturación Electrónica: descarga/organización de JSON
// y PDF dentro de Gestión (Mes → Cliente → Facturacion).
// ══════════════════════════════════════════════════════════════════════
const _feContextos = {};
const _feSesionesEnganchadas = new Map();

function _feMesLabelPorDefecto() {
  const meses = ['Enero','Febrero','Marzo','Abril','Mayo','Junio',
    'Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
  const d = new Date();
  return meses[d.getMonth()] + ' ' + d.getFullYear();
}

function _feContextoDe(partition) {
  return _feContextos[partition] || {
    mesLabel: _feMesLabelPorDefecto(),
    empresaNombre: 'Empresa',
    ultimoJsonBase: null,
    ultimaCarpetaFecha: null
  };
}

// Corrección 08 — Simula el clic sobre el botón "Descargar" del visor de
// PDF de Chromium, atravesando recursivamente el Shadow DOM.
const _FE_SCRIPT_BUSCAR_BOTON_DESCARGA = `
    (function() {
      function buscarBoton(root) {
        if (!root) return null;
        var directo = root.querySelector('#save');
        if (directo) return directo;
        var nodos = root.querySelectorAll('*');
        for (var i = 0; i < nodos.length; i++) {
          if (nodos[i].shadowRoot) {
            var enc = buscarBoton(nodos[i].shadowRoot);
            if (enc) return enc;
          }
        }
        return null;
      }
      var boton = buscarBoton(document);
      if (boton) { boton.click(); return true; }
      return false;
    })();
`;

function _feRecolectarFrames(frame, lista) {
  if (!frame) return lista;
  lista.push(frame);
  try {
    const hijos = frame.frames || [];
    for (const hijo of hijos) _feRecolectarFrames(hijo, lista);
  } catch (e) { /* noop */ }
  return lista;
}

async function _feBuscarYClickEnTodosLosFrames(wc) {
  let frames = [];
  try {
    frames = _feRecolectarFrames(wc.mainFrame, []);
  } catch (e) {
    console.warn('[Facturación Electrónica][debug] no se pudo listar frames:', e.message);
  }
  console.log('[Facturación Electrónica][debug] buscando botón de descarga en', frames.length, 'frame(s)');
  for (const frame of frames) {
    try {
      const clicked = await frame.executeJavaScript(_FE_SCRIPT_BUSCAR_BOTON_DESCARGA, true);
      if (clicked) return true;
    } catch (e) {
      console.warn('[Facturación Electrónica][debug] error ejecutando el script en un frame:', e.message);
    }
  }
  return false;
}

function _feIntentarClickDescargarPdf(childWindow, intentosRestantes) {
  if (!childWindow || childWindow.isDestroyed()) return;
  const wc = childWindow.webContents;
  if (!wc || wc.isDestroyed()) return;

  _feBuscarYClickEnTodosLosFrames(wc).then((clicked) => {
    if (clicked) {
      console.log('[Facturación Electrónica][debug] clic automático en "Descargar" realizado con éxito.');
      return;
    }
    if (intentosRestantes > 0) {
      setTimeout(() => _feIntentarClickDescargarPdf(childWindow, intentosRestantes - 1), 500);
    } else {
      console.warn('[Facturación Electrónica] No se encontró el botón de descarga tras varios intentos; se muestra la pestaña para descarga manual.');
      if (!childWindow.isDestroyed()) childWindow.show();
    }
  }).catch((e) => {
    console.warn('[Facturación Electrónica] Error automatizando la descarga del PDF:', e.message);
    if (intentosRestantes > 0) {
      setTimeout(() => _feIntentarClickDescargarPdf(childWindow, intentosRestantes - 1), 500);
    } else if (!childWindow.isDestroyed()) {
      childWindow.show();
    }
  });
}

function createWindow() {
  const appVersion = app.getVersion() || '';
  const winTitle = 'FiscalSync FE' + (appVersion ? ' | Versión ' + appVersion : '');

  const win = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 1024,
    minHeight: 680,
    icon: path.join(__dirname, 'icon.ico'),
    show: false,
    backgroundColor: '#000000',
    autoHideMenuBar: true,
    titleBarStyle: 'default',
    titleBarOverlay: false,
    title: winTitle,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
      webSecurity: true,
      webviewTag: true,
      backgroundThrottling: false,
    }
  });

  mainWindowRef = win; // 👈 NUEVO

  Menu.setApplicationMenu(null);

  // Implementación 01 / Corrección 01 — Facturación Electrónica: candado
  // de seguridad para el tag <webview> (ver #facturacionElectronicaScreen
  // en index.html). Aunque el HTML que crea el <webview> es el nuestro (no
  // contenido de terceros), Electron recomienda validar igual cualquier
  // <webview> antes de adjuntarse, por si en el futuro se agrega
  // contenido dinámico a esa pantalla:
  //   - Fuerza sus webPreferences (nunca nodeIntegration, siempre
  //     contextIsolation) sin importar lo que el HTML haya pedido.
  //   - Valida que la partición sea una de Facturación Electrónica para
  //     UNA empresa concreta ("persist:facturacion-electronica-<idEmpresa>")
  //     — Corrección 01 le dio a cada empresa su propia sesión aislada
  //     (ver _asegurarWebviewFacturacion en index.html), así que YA NO se
  //     fuerza un único valor fijo (eso volvería a mezclar la sesión de
  //     todas las empresas en una sola, deshaciendo esa corrección) — solo
  //     se rechaza cualquier partición que no siga ese patrón esperado.
  //   - Rechaza cualquier intento de cargar un <webview> fuera del
  //     dominio oficial de Hacienda (admin.factura.gob.sv).
  win.webContents.on('will-attach-webview', (event, webPreferences, params) => {
    webPreferences.nodeIntegration = false;
    webPreferences.contextIsolation = true;
    webPreferences.preload = undefined;

    if (typeof params.partition !== 'string' || !/^persist:facturacion-electronica-.+$/.test(params.partition)) {
      console.warn('[Facturación Electrónica] Se bloqueó un <webview> con partición inesperada:', params.partition);
      event.preventDefault();
      return;
    }

    let host = '';
    try { host = new URL(params.src).hostname; } catch (e) { /* noop */ }
    if (host !== 'admin.factura.gob.sv') {
      console.warn('[Facturación Electrónica] Se bloqueó un <webview> fuera del portal oficial:', params.src);
      event.preventDefault();
      return;
    }

    // Corrección 04, punto 1 y 5/6 — Hacienda descarga el .json de forma
    // automática y, para el PDF, abre una pestaña nueva desde la cual el
    // usuario lo descarga manualmente. Ambas descargas pasan por la MISMA
    // sesión (partition) de esta empresa, así que basta con enganchar
    // 'will-download' una sola vez por partición para capturar las dos.
    const partition = params.partition;
    if (!_feSesionesEnganchadas.has(partition)) {
      const sess = session.fromPartition(partition);
      _feSesionesEnganchadas.set(partition, sess);

      sess.on('will-download', (downloadEvent, item, webContentsDeDescarga) => {
        try {
          const ctx = _feContextoDe(partition);
          const dir = _feGetFacturacionDir(ctx.mesLabel, ctx.empresaNombre);
          const originalName = item.getFilename();
          const ext = path.extname(originalName).toLowerCase();
          let destName;
          // AGREGADO — carpeta por fecha: mientras se descarga el .json no
          // se sabe todavía su fecha (está dentro del archivo), así que
          // sigue guardándose primero en la raíz de "Facturacion" como
          // hasta ahora; recién en el 'done' de más abajo se mueve a su
          // subcarpeta de fecha. El .pdf, en cambio, se descarga DESPUÉS
          // del .json correspondiente, así que para cuando llega ya
          // conocemos esa carpeta (ctx.ultimaCarpetaFecha) y puede ir
          // directo ahí, quedando junto a su .json.
          let dirDestino = dir;

          if (ext === '.json') {
            // Punto 1/2 — el .json se guarda con su nombre tal cual, y se
            // recuerda su nombre base para que el PDF (punto 6) lo use.
            destName = sanitizeFolderName(originalName);
            _feContextos[partition] = Object.assign({}, ctx, {
              ultimoJsonBase: path.basename(originalName, ext),
              ultimaCarpetaFecha: null // se resuelve recién al terminar la descarga (ver 'done')
            });
          } else if (ext === '.pdf') {
            // Punto 6 — el PDF usa como base el nombre del último .json
            // descargado, cambiando únicamente la extensión.
            const base = ctx.ultimoJsonBase || path.basename(originalName, ext);
            destName = sanitizeFolderName(base) + '.pdf';
            if (ctx.ultimaCarpetaFecha) {
              dirDestino = path.join(dir, ctx.ultimaCarpetaFecha);
              if (!fs.existsSync(dirDestino)) fs.mkdirSync(dirDestino, { recursive: true });
            }
          } else {
            destName = sanitizeFolderName(originalName);
          }

          const destPath = path.join(dirDestino, destName);
          item.setSavePath(destPath);

          item.once('done', (doneEvent, state) => {
            // AGREGADO — una vez que el .json terminó de descargarse, ya
            // se puede leer su contenido: se calcula/crea su carpeta de
            // fecha (identificacion.fecEmi) y se mueve el archivo ahí
            // desde la raíz de "Facturacion". Se recuerda esa carpeta en
            // el contexto para que el .pdf de este mismo documento (que
            // llega después) se guarde directo junto a él.
            let rutaFinal = destPath;
            if (state === 'completed' && ext === '.json') {
              const carpetaFecha = _feCarpetaFechaDesdeJson(destPath, dir);
              if (carpetaFecha) {
                try {
                  const nuevoPath = path.join(carpetaFecha, path.basename(destPath));
                  if (!fs.existsSync(nuevoPath)) fs.renameSync(destPath, nuevoPath);
                  rutaFinal = nuevoPath;
                } catch (e) {
                  console.warn('[Facturación Electrónica] No se pudo mover el .json a su carpeta de fecha:', e.message);
                }
              }
              const ctxActual = _feContextoDe(partition);
              _feContextos[partition] = Object.assign({}, ctxActual, {
                // AGREGADO — se guarda la ruta relativa completa (que
                // ahora puede incluir la carpeta de tipo de documento
                // antes de la de fecha, ver _feCarpetaFechaDesdeJson) en
                // vez de solo el nombre de la carpeta de fecha, para que
                // el .pdf de este mismo documento (líneas de arriba) se
                // guarde en el mismo lugar exacto que su .json.
                ultimaCarpetaFecha: carpetaFecha ? path.relative(dir, carpetaFecha) : null
              });
            }

            if (mainWindowRef && !mainWindowRef.isDestroyed()) {
              mainWindowRef.webContents.send('fe-descarga-completada', {
                ok: state === 'completed',
                state: state,
                ext: ext,
                path: rutaFinal
              });
            }
            // Corrección 07, punto 2 — apenas el PDF termina de guardarse
            // (ya organizado y renombrado igual que el .json, arriba), se
            // abre automáticamente con el visor de PDF predeterminado del
            // sistema, para que el usuario lo vea de inmediato sin tener
            // que ir a buscarlo a mano en la carpeta Facturacion. Misma
            // mecánica que ya usa el handler 'print-pdf' (shell.openPath).
            if (state === 'completed' && ext === '.pdf') {
              shell.openPath(rutaFinal).then((err) => {
                if (err) console.warn('[Facturación Electrónica] No se pudo abrir automáticamente el PDF:', err);
              });
            }
            // Corrección 08 — la pestaña oculta que disparó esta descarga
            // (mediante el clic simulado en 'Descargar', ver
            // _feIntentarClickDescargarPdf) ya cumplió su función; se
            // cierra sola para no dejar ventanas ocultas acumulándose.
            // Cuidado: NUNCA se cierra si la descarga vino del <webview>
            // principal (el .json, que se descarga directo, sin pestaña
            // nueva) — por eso se compara contra mainWindowRef.
            if (ext === '.pdf' && webContentsDeDescarga && !webContentsDeDescarga.isDestroyed()) {
              try {
                const winDeDescarga = BrowserWindow.fromWebContents(webContentsDeDescarga);
                if (winDeDescarga && !winDeDescarga.isDestroyed() && winDeDescarga !== mainWindowRef) {
                  winDeDescarga.destroy();
                }
              } catch (e) { /* noop */ }
            }
          });
        } catch (e) {
          console.warn('[Facturación Electrónica] Error organizando descarga:', e.message);
        }
      });
    }
  });

  // Corrección 04, punto 1 — Hacienda muestra el PDF en una pestaña nueva
  // del navegador (no lo descarga directo). Se permite esa pestaña nueva
  // ÚNICAMENTE si apunta al portal oficial, y se la fuerza a compartir la
  // MISMA partición (sesión) del <webview> que la abrió, para que su
  // descarga pase por el mismo 'will-download' de arriba y quede
  // organizada y renombrada igual que el .json (ver Corrección 04).
  win.webContents.on('did-attach-webview', (event, contents) => {
    let partitionDeEstaWebview = null;
    for (const [p, s] of _feSesionesEnganchadas.entries()) {
      if (s === contents.session) { partitionDeEstaWebview = p; break; }
    }
    if (!partitionDeEstaWebview) return;

    // AGREGADO NUEVO (Agregado 01 — Atajo Ctrl+B para búsqueda rápida de
    // clientes): mientras el usuario trabaja normalmente en el portal de
    // Hacienda, el foco del teclado queda DENTRO de este <webview> — un
    // WebContents aparte del de la ventana principal. Un keydown escuchado
    // en el documento de index.html nunca se entera de esas teclas, así
    // que hay que interceptarlas aquí, sobre el propio webContents del
    // <webview> (antes de que la página del portal las reciba), y
    // reenviar el atajo a la ventana principal por IPC para que sea
    // index.html quien abra/cierre el panel flotante de búsqueda rápida.
    contents.on('before-input-event', (event, input) => {
      if (input.type !== 'keyDown') return;
      if (!(input.control || input.meta) || input.alt || input.shift) return;
      if ((input.key || '').toLowerCase() !== 'b') return;
      if (mainWindowRef && !mainWindowRef.isDestroyed()) {
        mainWindowRef.webContents.send('fe-atajo-busqueda-rapida');
      }
    });

    contents.setWindowOpenHandler(({ url }) => {
      let host = '';
      try { host = new URL(url).hostname; } catch (e) { /* noop */ }

      // Corrección 05 — Hacienda abre la pestaña nueva inicialmente en
      // "about:blank" (todavía sin dominio) y RECIÉN DESPUÉS, ya con la
      // ventana abierta, la redirige hacia el PDF. Si aquí solo se
      // aceptara el dominio oficial, esa apertura en about:blank quedaba
      // bloqueada y la pestaña nunca llegaba a existir para poder navegar
      // al PDF (ese era el bug: new URL('about:blank').hostname es '' y
      // nunca coincide con 'admin.factura.gob.sv'). Por eso se permite
      // about:blank explícitamente aquí; el candado de dominio se aplica
      // de todas formas más abajo, en 'did-create-window', validando la
      // PRIMERA navegación real que haga esa pestaña.
      const esAboutBlank = (url === 'about:blank' || host === '');
      if (!esAboutBlank && host !== 'admin.factura.gob.sv') {
        console.warn('[Facturación Electrónica] Se bloqueó una pestaña nueva fuera del portal oficial:', url);
        return { action: 'deny' };
      }
      // Corrección 08, punto 1 — la pestaña sigue oculta (el usuario no
      // necesita verla), pero ahora SÍ se le permite cargar normalmente
      // hasta mostrar el visor de PDF de Chromium (igual que cuando
      // estaba visible y la descarga manual funcionaba) — se agrega
      // backgroundThrottling:false para que, al estar oculta, Chromium no
      // le baje la prioridad a sus temporizadores/JS y el visor tarde lo
      // mismo en aparecer que si estuviera visible. El clic en
      // "Descargar" se automatiza más abajo, en 'did-create-window'.
      return {
        action: 'allow',
        overrideBrowserWindowOptions: {
          show: false,
          webPreferences: {
            partition: partitionDeEstaWebview,
            nodeIntegration: false,
            contextIsolation: true,
            backgroundThrottling: false
          }
        }
      };
    });

    // Corrección 08 — Automatiza la descarga del PDF simulando el clic
    // real sobre el botón "Descargar" del visor de PDF de Chromium
    // (<cr-icon-button id="save">), en vez de intentar reconstruir o
    // interceptar la URL del PDF a mano (la Corrección 07 intentó eso y
    // falló: Hacienda no siempre navega esa pestaña de forma directa a
    // una URL descargable — a veces el PDF se carga dentro del propio
    // visor interno, así que 'will-navigate' nunca llegaba a dispararse
    // con una URL útil, y la pestaña oculta se quedaba sin hacer nada).
    // Ahora se dej a la pestaña cargar TAL CUAL lo hacía cuando estaba
    // visible (igual comportamiento, solo que sin mostrarla), y una vez
    // que termina de cargar se busca el botón de descarga atravesando
    // los Shadow DOM del visor (son de tipo "open", por eso se puede
    // encontrar así) y se le simula un clic. Ese clic dispara la MISMA
    // descarga que el 'will-download' de la sesión compartida ya
    // organiza y renombra igual que el .json (Corrección 04).
    contents.on('did-create-window', (childWindow) => {
      try {
        console.log('[Facturación Electrónica][debug] se creó la pestaña oculta del PDF (about:blank).');

        childWindow.webContents.on('will-navigate', (navEvent, navUrl) => {
          let navHost = '';
          try { navHost = new URL(navUrl).hostname; } catch (e) { /* noop */ }
          console.log('[Facturación Electrónica][debug] will-navigate en la pestaña del PDF ->', navUrl);
          if (navHost !== 'admin.factura.gob.sv') {
            console.warn('[Facturación Electrónica] Se bloqueó una navegación fuera del portal oficial en la pestaña del PDF:', navUrl);
            navEvent.preventDefault();
            if (!childWindow.isDestroyed()) childWindow.destroy();
          }
          // Si es del dominio oficial, se deja continuar la navegación
          // normalmente — es necesario que el visor cargue de verdad
          // para poder simular el clic de descarga más abajo.
        });

        childWindow.webContents.on('did-finish-load', () => {
          console.log('[Facturación Electrónica][debug] did-finish-load en la pestaña del PDF, URL actual:', childWindow.webContents.getURL());
          _feIntentarClickDescargarPdf(childWindow, 15);
        });
      } catch (e) {
        console.warn('[Facturación Electrónica] No se pudo asegurar la pestaña del PDF:', e.message);
      }
    });
  });

  session.defaultSession.webRequest.onBeforeRequest(
    { urls: ['http://*/*', 'https://*/*'] },
    (details, callback) => { callback({ cancel: true }); }
  );

  win.loadFile('index.html');

  // did-finish-load: volver a forzar el título porque Electron lo sobreescribe con el <title> del HTML al cargar
  win.webContents.on('did-finish-load', () => {
    win.setTitle(winTitle);
  });

  win.once('ready-to-show', () => {
    win.setTitle(winTitle);
    win.show();
  });

  win.webContents.on('did-fail-load', (event, errorCode, errorDescription) => {
    console.error('Error al cargar:', errorCode, errorDescription);
  });
}
// ══════════════════════════════════════════════════════════════════════
// AGREGADO NUEVO (Cambio 03): CONFIGURACIÓN DE RUTAS DE EXPORTACIÓN
// Permite al usuario elegir dónde se guardan los CSV y los PDF, en vez de
// usar siempre el Escritorio. Se guarda en un archivo aparte dentro de
// userData, independiente del store principal (fiscaldata.json).
// Si no hay configuración (o se restablece), se usa el Escritorio por defecto.
// ══════════════════════════════════════════════════════════════════════
function getExportConfigPath() {
  return path.join(app.getPath('userData'), 'export-config.json');
}

function readExportConfig() {
  try {
    const p = getExportConfigPath();
    if (!fs.existsSync(p)) return { csvPath: null, pdfPath: null };
    const raw = fs.readFileSync(p, 'utf8');
    const parsed = JSON.parse(raw);
    return { csvPath: parsed.csvPath || null, pdfPath: parsed.pdfPath || null };
  } catch (e) {
    return { csvPath: null, pdfPath: null };
  }
}

function writeExportConfig(cfg) {
  fs.writeFileSync(getExportConfigPath(), JSON.stringify(cfg, null, 2), 'utf8');
}

ipcMain.handle('get-export-config', async () => {
  try {
    return { ok: true, config: readExportConfig() };
  } catch (e) {
    return { ok: false, error: e.message };
  }
});

ipcMain.handle('set-export-config', async (event, { csvPath, pdfPath }) => {
  try {
    const current = readExportConfig();
    const next = {
      csvPath: (csvPath !== undefined) ? csvPath : current.csvPath,
      pdfPath: (pdfPath !== undefined) ? pdfPath : current.pdfPath
    };
    writeExportConfig(next);
    return { ok: true, config: next };
  } catch (e) {
    return { ok: false, error: e.message };
  }
});

ipcMain.handle('reset-export-config', async () => {
  try {
    writeExportConfig({ csvPath: null, pdfPath: null });
    return { ok: true, config: { csvPath: null, pdfPath: null } };
  } catch (e) {
    return { ok: false, error: e.message };
  }
});

// ══════════════════════════════════════════════════════════════════════
// EXPORTACIÓN AUTOMÁTICA ORGANIZADA POR AÑO, MES Y EMPRESA
// Centraliza todos los documentos generados por FiscalSync en:
//   [Raíz]/FiscalSync FE/FiscalSync [Año]/FiscalSync - [Mes] [Año]/[Empresa]/
// [Raíz] es el Escritorio por defecto, o la carpeta configurada por el
// usuario en Admin > Sistema > Rutas de exportación (Cambio 03).
// Las carpetas se crean únicamente si no existen; si ya existen se reutilizan.
// ══════════════════════════════════════════════════════════════════════
function sanitizeFolderName(name) {
  return String(name || '')
    .replace(/[\\/:*?"<>|]/g, '_')
    .trim()
    .replace(/\s+/g, ' ') || 'Sin_Nombre';
}

// Carpeta raíz de los documentos de FiscalSync FE dentro de [Raíz]. Es DISTINTA
// de "FiscalSync", que usa el programa original: así, ni los documentos ni el
// borrado de datos de una empresa (fe-eliminar-empresa-datos) ni la migración
// de archivos sueltos pueden tocar carpetas del otro programa, aunque ambos
// tengan una empresa con el mismo nombre.
const FE_EXPORT_ROOT_NAME = 'FiscalSync FE';

// Devuelve (y crea si hace falta) la carpeta de destino para una empresa y un mes dados.
// mesLabel esperado con formato "Nombre_del_Mes Año" (ej. "Julio 2026").
// tipo: 'csv' | 'pdf' — determina qué carpeta raíz configurada usar (Cambio 03).
function getExportDir(mesLabel, empresaNombre, tipo) {
  const cfg = readExportConfig();
  const customRoot = tipo === 'pdf' ? cfg.pdfPath : cfg.csvPath;
  const rootBase = (customRoot && fs.existsSync(customRoot)) ? customRoot : app.getPath('desktop');

  // Extrae el año del mesLabel (ej. "Julio 2026" -> "2026").
  // Si por algún motivo no viene el año en el texto, usa el año actual como respaldo.
  const yearMatch = String(mesLabel || '').match(/(\d{4})/);
  const year = yearMatch ? yearMatch[1] : String(new Date().getFullYear());

  const rootDir     = path.join(rootBase, FE_EXPORT_ROOT_NAME);
  const yearDir     = path.join(rootDir, 'FiscalSync ' + year);
  const mesDir      = path.join(yearDir, 'FiscalSync - ' + sanitizeFolderName(mesLabel));
  const empresaDir  = path.join(mesDir, sanitizeFolderName(empresaNombre));

  if (!fs.existsSync(rootDir))     fs.mkdirSync(rootDir, { recursive: true });
  if (!fs.existsSync(yearDir))     fs.mkdirSync(yearDir, { recursive: true });
  if (!fs.existsSync(mesDir))      fs.mkdirSync(mesDir, { recursive: true });
  if (!fs.existsSync(empresaDir))  fs.mkdirSync(empresaDir, { recursive: true });

  return empresaDir;
}

// ══════════════════════════════════════════════════════════════════════
// Corrección 04, puntos 2-5 — Carpeta de Facturación Electrónica dentro de
// la MISMA estructura que ya usa Gestión (getExportDir de arriba), para no
// tener una segunda lógica de carpetas independiente:
// [Raíz]/FiscalSync FE/FiscalSync [Año]/FiscalSync - [Mes]/[Empresa]/Facturacion/
// Se crea solo si no existe; si ya existe (con archivos o sin ellos) se
// reutiliza tal cual — nunca se borra ni sobrescribe nada.
// ══════════════════════════════════════════════════════════════════════
function _feGetFacturacionDir(mesLabel, empresaNombre) {
  const empresaDir = getExportDir(mesLabel, empresaNombre, 'pdf');
  const facturacionDir = path.join(empresaDir, 'Facturacion');
  if (!fs.existsSync(facturacionDir)) fs.mkdirSync(facturacionDir, { recursive: true });
  return facturacionDir;
}

// ══════════════════════════════════════════════════════════════════════
// AGREGADO NUEVO — Módulo de Reportes DTE (Anexo 1 Crédito Fiscal / Anexo 2
// Consumidor Final): carpeta de destino para los PDF/CSV generados, dentro
// de la MISMA carpeta "Facturacion" que ya usa el resto del módulo de
// Facturación Electrónica (_feGetFacturacionDir de arriba) — no crea una
// estructura de carpetas paralela.
// [Raíz]/FiscalSync FE/FiscalSync [Año]/FiscalSync - [Mes]/[Empresa]/Facturacion/Reportes/
// ══════════════════════════════════════════════════════════════════════
function _feGetReportesDir(mesLabel, empresaNombre) {
  const facturacionDir = _feGetFacturacionDir(mesLabel, empresaNombre);
  const reportesDir = path.join(facturacionDir, 'Reportes');
  if (!fs.existsSync(reportesDir)) fs.mkdirSync(reportesDir, { recursive: true });
  return reportesDir;
}

// ══════════════════════════════════════════════════════════════════════
// AGREGADO — Subcarpeta por fecha dentro de "Facturacion": cada documento
// (.json + .pdf) se guarda junto, dentro de una subcarpeta con su fecha de
// emisión (identificacion.fecEmi del propio .json, "AAAA-MM-DD" ->
// "DD-MM-AAAA"), en vez de sueltos en la raíz. Reutiliza _feGetFacturacionDir
// y sanitizeFolderName de arriba — no crea una segunda lógica de carpetas.
// ══════════════════════════════════════════════════════════════════════

// Convierte "AAAA-MM-DD" (fecEmi) a "DD-MM-AAAA" para usarlo como nombre de
// subcarpeta. Devuelve null si el formato no es el esperado.
function _feFechaEmiACarpeta(fecEmi) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(fecEmi || '').trim());
  if (!m) return null;
  return sanitizeFolderName(m[3] + '-' + m[2] + '-' + m[1]);
}

// AGREGADO — Carpeta por tipo de documento dentro de "Facturacion", un
// nivel ANTES de la carpeta de fecha. El nombre de la carpeta sale del
// catálogo oficial CAT-002 centralizado en cat002.js (nombrePorCodigo,
// ya importado arriba junto con cat002CodigoDesdeTexto) — una carpeta
// por cada tipo real del catálogo (Factura, Comprobante de Crédito
// Fiscal, Nota de Remisión, etc.), en vez de agrupar varios códigos bajo
// un mismo nombre. Si el tipoDte no está en el catálogo (código
// desconocido o ausente en el .json), va a "Otros Documentos".
//
// Caso aparte — Invalidación: el .json de un evento de Invalidación (se
// anula un documento ya emitido) NO trae identificacion.tipoDte como los
// DTE normales; en cambio trae un bloque "motivo" con "tipoAnulacion" /
// "motivoAnulacion" (y un "documento" con el tipoDte del documento
// ANULADO, no del evento en sí). Por eso se detecta aparte, ANTES de
// buscar en el catálogo, y va siempre a "Documentos Invalidados".
function _feCarpetaTipoDocumento(json) {
  if (json && json.motivo && typeof json.motivo.tipoAnulacion !== 'undefined') {
    return sanitizeFolderName('Documentos Invalidados');
  }
  const id = (json && json.identificacion) || {};
  const tipoDTE = String(id.tipoDte || '').trim();
  const nombreOficial = nombrePorCodigo(tipoDTE); // '' si el código no está en el catálogo
  const nombre = nombreOficial ? _feNombreCarpetaDesdeCat002(nombreOficial) : 'Otros Documentos';
  return sanitizeFolderName(nombre);
}

// Convierte el nombre oficial del catálogo (en MAYÚSCULAS, ej. "COMPROBANTE
// DE CRÉDITO FISCAL") a formato Título ("Comprobante De Crédito Fiscal")
// para que la carpeta se vea igual de prolija que "Otros Documentos".
// Solo cambia mayúsculas/minúsculas — no toca tildes ni el texto en sí.
function _feNombreCarpetaDesdeCat002(nombreOficial) {
  return String(nombreOficial)
    .toLowerCase()
    .replace(/(^|\s)([a-záéíóúñ])/g, function (m, espacio, letra) {
      return espacio + letra.toUpperCase();
    });
}

// Lee un .json ya guardado en disco y devuelve (creándola si hace falta)
// su carpeta de tipo+fecha dentro de facturacionDir, o null si no se pudo
// leer/parsear el archivo o no trae identificacion.fecEmi (en ese caso el
// archivo se deja donde está, sin mover nada).
function _feCarpetaFechaDesdeJson(jsonPath, facturacionDir) {
  try {
    const raw = fs.readFileSync(jsonPath, 'utf8');
    const data = JSON.parse(raw);
    const fecEmi = data && data.identificacion && data.identificacion.fecEmi;
    const nombreCarpeta = _feFechaEmiACarpeta(fecEmi);
    if (!nombreCarpeta) return null;
    // AGREGADO — carpeta de tipo de documento antes de la de fecha.
    const tipoDir = path.join(facturacionDir, _feCarpetaTipoDocumento(data));
    if (!fs.existsSync(tipoDir)) fs.mkdirSync(tipoDir, { recursive: true });
    const destDir = path.join(tipoDir, nombreCarpeta);
    if (!fs.existsSync(destDir)) fs.mkdirSync(destDir, { recursive: true });
    return destDir;
  } catch (e) {
    console.warn('[Facturación Electrónica] No se pudo leer la fecha/tipo del .json para organizarlo por carpeta:', e.message);
    return null;
  }
}

// Migra a su subcarpeta de fecha los .json/.pdf que hayan quedado sueltos
// en la raíz de "Facturacion" (descargados antes de este cambio). Se llama
// sola, sin pedir nada al usuario, desde ipcMain.handle('fe-set-context')
// —que ya se dispara cada vez que el renderer entra a Facturación
// Electrónica o cambia el mes de trabajo— así que no hace falta ningún
// canal IPC ni pantalla nueva. No toca nada que ya esté en una subcarpeta.
function _feMigrarSueltos(facturacionDir) {
  let entradas;
  try {
    entradas = fs.readdirSync(facturacionDir, { withFileTypes: true });
  } catch (e) {
    return;
  }
  const jsonsSueltos = entradas
    .filter((entrada) => entrada.isFile() && entrada.name.toLowerCase().endsWith('.json'))
    .map((entrada) => entrada.name);

  for (const jsonName of jsonsSueltos) {
    try {
      const jsonPath = path.join(facturacionDir, jsonName);
      const destDir = _feCarpetaFechaDesdeJson(jsonPath, facturacionDir);
      if (!destDir) continue; // no se pudo leer la fecha; se deja donde está

      const base = path.basename(jsonName, '.json');
      const pdfName = base + '.pdf';
      const pdfPath = path.join(facturacionDir, pdfName);

      const destJsonPath = path.join(destDir, jsonName);
      if (!fs.existsSync(destJsonPath)) fs.renameSync(jsonPath, destJsonPath);

      if (fs.existsSync(pdfPath)) {
        const destPdfPath = path.join(destDir, pdfName);
        if (!fs.existsSync(destPdfPath)) fs.renameSync(pdfPath, destPdfPath);
      }
    } catch (e) {
      console.warn('[Facturación Electrónica] Error migrando archivo suelto a su carpeta de fecha:', jsonName, e.message);
    }
  }
}

// AGREGADO — Migración de la estructura vieja (Facturacion/[Fecha]/...,
// sin carpeta de tipo de documento) a la nueva (Facturacion/[Tipo]/
// [Fecha]/...). Igual que _feMigrarSueltos de arriba: se llama sola, sin
// pedir nada al usuario. Solo mueve carpetas que estén DIRECTAMENTE
// dentro de facturacionDir con forma de fecha (DD-MM-AAAA) — no toca las
// carpetas de tipo ya conocidas, para no reprocesar lo que ya está
// migrado.
// AGREGADO — lista de carpetas de tipo "conocidas" (una por cada tipo del
// catálogo CAT-002, con el mismo formato que ya usa _feCarpetaTipoDocumento,
// más "Otros Documentos" y "Documentos Invalidados"), para que
// _feMigrarEstructuraTipo no intente reprocesar carpetas de tipo ya
// creadas si alguna llegara a tener nombre de fecha por coincidencia.
const FE_CARPETAS_TIPO_CONOCIDAS = CAT_002.map(function (item) {
  return _feNombreCarpetaDesdeCat002(item.nombre);
}).concat(['Otros Documentos', 'Documentos Invalidados']);
const FE_REGEX_CARPETA_FECHA = /^\d{2}-\d{2}-\d{4}$/;

function _feMigrarEstructuraTipo(facturacionDir) {
  let entradas;
  try {
    entradas = fs.readdirSync(facturacionDir, { withFileTypes: true });
  } catch (e) {
    return;
  }

  const carpetasFechaSueltas = entradas
    .filter((entrada) => entrada.isDirectory()
      && FE_REGEX_CARPETA_FECHA.test(entrada.name)
      && FE_CARPETAS_TIPO_CONOCIDAS.indexOf(entrada.name) === -1)
    .map((entrada) => entrada.name);

  for (const nombreFecha of carpetasFechaSueltas) {
    const fechaDirVieja = path.join(facturacionDir, nombreFecha);
    let archivos;
    try {
      archivos = fs.readdirSync(fechaDirVieja, { withFileTypes: true })
        .filter((e) => e.isFile() && e.name.toLowerCase().endsWith('.json'))
        .map((e) => e.name);
    } catch (e) {
      continue;
    }

    for (const jsonName of archivos) {
      try {
        const jsonPathViejo = path.join(fechaDirVieja, jsonName);
        const raw = fs.readFileSync(jsonPathViejo, 'utf8');
        const data = JSON.parse(raw);
        const tipoDir = path.join(facturacionDir, _feCarpetaTipoDocumento(data));
        if (!fs.existsSync(tipoDir)) fs.mkdirSync(tipoDir, { recursive: true });
        const fechaDirNueva = path.join(tipoDir, nombreFecha);
        if (!fs.existsSync(fechaDirNueva)) fs.mkdirSync(fechaDirNueva, { recursive: true });

        const base = path.basename(jsonName, '.json');
        const pdfName = base + '.pdf';
        const pdfPathViejo = path.join(fechaDirVieja, pdfName);

        const jsonPathNuevo = path.join(fechaDirNueva, jsonName);
        if (!fs.existsSync(jsonPathNuevo)) fs.renameSync(jsonPathViejo, jsonPathNuevo);

        if (fs.existsSync(pdfPathViejo)) {
          const pdfPathNuevo = path.join(fechaDirNueva, pdfName);
          if (!fs.existsSync(pdfPathNuevo)) fs.renameSync(pdfPathViejo, pdfPathNuevo);
        }
      } catch (e) {
        console.warn('[Facturación Electrónica] Error migrando documento a su carpeta de tipo:', jsonName, e.message);
      }
    }

    // Si la carpeta de fecha vieja quedó vacía, se elimina para no dejar
    // carpetas duplicadas; si algo no se pudo mover, se deja tal cual
    // está (nunca se borra una carpeta que todavía tenga archivos).
    try {
      const quedan = fs.readdirSync(fechaDirVieja);
      if (quedan.length === 0) fs.rmdirSync(fechaDirVieja);
    } catch (e) { /* noop */ }
  }
}

// AGREGADO — Re-clasifica documentos que ya están dentro de una carpeta
// de tipo (por ejemplo "Otros Documentos") pero que, con el criterio de
// clasificación ACTUAL, deberían estar en otra (por ejemplo "Documentos
// Invalidados"). Esto corrige solo, sin pedir nada al usuario, los
// documentos que se organizaron con una versión anterior de este cambio
// (antes de agregar, por ejemplo, la detección de Invalidación). Recorre
// cada carpeta de tipo ya existente (no las carpetas de fecha sueltas —
// esas las resuelve _feMigrarEstructuraTipo de arriba) y, dentro de cada
// una, cada subcarpeta de fecha, comparando la carpeta de tipo actual
// contra _feCarpetaTipoDocumento(json). No toca nada que ya esté en la
// carpeta correcta.
function _feReclasificarDocumentos(facturacionDir) {
  let carpetasTipo;
  try {
    carpetasTipo = fs.readdirSync(facturacionDir, { withFileTypes: true })
      .filter((e) => e.isDirectory() && !FE_REGEX_CARPETA_FECHA.test(e.name))
      .map((e) => e.name);
  } catch (e) {
    return;
  }

  for (const tipoActual of carpetasTipo) {
    const tipoActualDir = path.join(facturacionDir, tipoActual);
    let carpetasFecha;
    try {
      carpetasFecha = fs.readdirSync(tipoActualDir, { withFileTypes: true })
        .filter((e) => e.isDirectory() && FE_REGEX_CARPETA_FECHA.test(e.name))
        .map((e) => e.name);
    } catch (e) {
      continue;
    }

    for (const nombreFecha of carpetasFecha) {
      const fechaDirActual = path.join(tipoActualDir, nombreFecha);
      let jsons;
      try {
        jsons = fs.readdirSync(fechaDirActual, { withFileTypes: true })
          .filter((e) => e.isFile() && e.name.toLowerCase().endsWith('.json'))
          .map((e) => e.name);
      } catch (e) {
        continue;
      }

      for (const jsonName of jsons) {
        try {
          const jsonPathActual = path.join(fechaDirActual, jsonName);
          const raw = fs.readFileSync(jsonPathActual, 'utf8');
          const data = JSON.parse(raw);
          const tipoCorrecto = _feCarpetaTipoDocumento(data);
          if (tipoCorrecto === tipoActual) continue; // ya está donde corresponde

          const tipoCorrectoDir = path.join(facturacionDir, tipoCorrecto);
          if (!fs.existsSync(tipoCorrectoDir)) fs.mkdirSync(tipoCorrectoDir, { recursive: true });
          const fechaDirCorrecta = path.join(tipoCorrectoDir, nombreFecha);
          if (!fs.existsSync(fechaDirCorrecta)) fs.mkdirSync(fechaDirCorrecta, { recursive: true });

          const base = path.basename(jsonName, '.json');
          const pdfName = base + '.pdf';
          const pdfPathActual = path.join(fechaDirActual, pdfName);

          const jsonPathNuevo = path.join(fechaDirCorrecta, jsonName);
          if (!fs.existsSync(jsonPathNuevo)) fs.renameSync(jsonPathActual, jsonPathNuevo);

          if (fs.existsSync(pdfPathActual)) {
            const pdfPathNuevo = path.join(fechaDirCorrecta, pdfName);
            if (!fs.existsSync(pdfPathNuevo)) fs.renameSync(pdfPathActual, pdfPathNuevo);
          }
        } catch (e) {
          console.warn('[Facturación Electrónica] Error re-clasificando documento:', jsonName, e.message);
        }
      }

      // Si la carpeta de fecha quedó vacía tras mover documentos mal
      // clasificados, se elimina.
      try {
        const quedanEnFecha = fs.readdirSync(fechaDirActual);
        if (quedanEnFecha.length === 0) fs.rmdirSync(fechaDirActual);
      } catch (e) { /* noop */ }
    }

    // Si la carpeta de tipo quedó vacía (todos sus documentos se movieron
    // a otro tipo), se elimina también.
    try {
      const quedanEnTipo = fs.readdirSync(tipoActualDir);
      if (quedanEnTipo.length === 0) fs.rmdirSync(tipoActualDir);
    } catch (e) { /* noop */ }
  }
}

// Recorre "dir" y todas sus subcarpetas, sin importar la profundidad, y
// junta en "resultado" (objeto nombreBase -> [rutas]) cada archivo que
// termine en "ext". Usada por _feReunificarJsonYPdf para encontrar
// .json/.pdf sin importar en qué carpeta haya quedado cada uno.
function _feListarArchivosRecursivo(dir, ext, resultado) {
  let entradas;
  try {
    entradas = fs.readdirSync(dir, { withFileTypes: true });
  } catch (e) {
    return;
  }
  for (const entrada of entradas) {
    const full = path.join(dir, entrada.name);
    if (entrada.isDirectory()) {
      _feListarArchivosRecursivo(full, ext, resultado);
    } else if (entrada.isFile() && entrada.name.toLowerCase().endsWith(ext)) {
      const base = path.basename(entrada.name, ext);
      if (!resultado[base]) resultado[base] = [];
      resultado[base].push(full);
    }
  }
}

// AGREGADO — Reunifica pares .json/.pdf que quedaron separados en
// carpetas distintas (por ejemplo, si la descarga del .pdf se solapó con
// la del siguiente .json y terminó guardándose junto al documento
// equivocado). Recorre TODA la estructura de "Facturacion", sin importar
// el nivel de cada archivo, y por cada .json busca si existe un .pdf con
// el mismo nombre base en OTRA carpeta; si lo encuentra, lo mueve junto a
// su .json (que a esta altura ya debería estar en su carpeta correcta,
// gracias a _feMigrarSueltos/_feMigrarEstructuraTipo/
// _feReclasificarDocumentos, que se llaman ANTES que esta función).
//
// Si hay más de un .json con el mismo nombre (duplicado) no se toca nada
// para ese nombre, por ambigüedad. Si un .pdf no tiene NINGÚN .json con
// su mismo nombre en toda la estructura, se deja donde está — no hay de
// dónde sacar su tipo de documento para reclasificarlo (un .pdf no trae
// tipoDte legible como el .json).
function _feReunificarJsonYPdf(facturacionDir) {
  const jsons = {};
  const pdfs = {};
  _feListarArchivosRecursivo(facturacionDir, '.json', jsons);
  _feListarArchivosRecursivo(facturacionDir, '.pdf', pdfs);

  for (const base in jsons) {
    const jsonPaths = jsons[base];
    if (jsonPaths.length !== 1) continue; // nombre duplicado; ambiguo, no se toca

    const jsonDir = path.dirname(jsonPaths[0]);
    const pdfDestino = path.join(jsonDir, base + '.pdf');
    if (fs.existsSync(pdfDestino)) continue; // ya están juntos

    const candidatosPdf = pdfs[base] || [];
    if (candidatosPdf.length === 0) continue; // no hay ningún .pdf con ese nombre

    try {
      fs.renameSync(candidatosPdf[0], pdfDestino);
    } catch (e) {
      console.warn('[Facturación Electrónica] Error reunificando .pdf con su .json:', base, e.message);
    }
  }
}

// AGREGADO — limpieza final: borra carpetas de tipo/fecha que hayan
// quedado vacías después de mover documentos (por ejemplo, la carpeta
// donde estaba un .pdf huérfano que _feReunificarJsonYPdf acaba de mover
// a otro lado). Nunca borra facturacionDir en sí, solo sus subcarpetas.
function _feLimpiarCarpetasVacias(dir) {
  let entradas;
  try {
    entradas = fs.readdirSync(dir, { withFileTypes: true });
  } catch (e) {
    return;
  }
  for (const entrada of entradas) {
    if (!entrada.isDirectory()) continue;
    const sub = path.join(dir, entrada.name);
    _feLimpiarCarpetasVacias(sub);
    try {
      if (fs.readdirSync(sub).length === 0) fs.rmdirSync(sub);
    } catch (e) { /* noop */ }
  }
}

// AGREGADO — recorre TODA la estructura ya existente de exportación
// ([Raíz]/FiscalSync FE/FiscalSync [Año]/FiscalSync - [Mes] [Año]/[Empresa]/
// Facturacion/) y le corre _feMigrarSueltos a cada carpeta "Facturacion"
// que encuentre, sin importar año, mes o empresa. Pensada para llamarse
// una sola vez al abrir la app (ver app.whenReady más abajo), así el
// usuario no tiene que entrar al módulo de Facturación Electrónica ni
// cambiar de mes para que se organicen las carpetas viejas. Reutiliza
// readExportConfig (ya existente) para saber la misma raíz configurada
// que usa getExportDir/_feGetFacturacionDir — no inventa una ruta nueva.
function _feMigrarSueltosTodasLasCarpetas() {
  try {
    const cfg = readExportConfig();
    const rootBase = (cfg.pdfPath && fs.existsSync(cfg.pdfPath)) ? cfg.pdfPath : app.getPath('desktop');
    const rootDir = path.join(rootBase, FE_EXPORT_ROOT_NAME);
    if (!fs.existsSync(rootDir)) return;

    const listarDirs = (dir) => {
      try {
        return fs.readdirSync(dir, { withFileTypes: true })
          .filter((e) => e.isDirectory())
          .map((e) => e.name);
      } catch (e) {
        return [];
      }
    };

    for (const yearName of listarDirs(rootDir)) {
      const yearDir = path.join(rootDir, yearName);
      for (const mesName of listarDirs(yearDir)) {
        const mesDir = path.join(yearDir, mesName);
        for (const empresaName of listarDirs(mesDir)) {
          const facturacionDir = path.join(mesDir, empresaName, 'Facturacion');
          if (fs.existsSync(facturacionDir)) {
            _feMigrarSueltos(facturacionDir);
            // AGREGADO — además de los sueltos, se migran las carpetas de
            // fecha viejas (sin carpeta de tipo) a la estructura nueva.
            _feMigrarEstructuraTipo(facturacionDir);
            // AGREGADO — corrige documentos que ya quedaron en una
            // carpeta de tipo distinta a la que les corresponde con el
            // criterio de clasificación actual (por ejemplo, organizados
            // con una versión anterior de este cambio).
            _feReclasificarDocumentos(facturacionDir);
            // AGREGADO — junta cada .pdf con su .json aunque hayan
            // quedado en carpetas distintas (por ejemplo por descargas
            // solapadas), y limpia las carpetas que queden vacías.
            _feReunificarJsonYPdf(facturacionDir);
            _feLimpiarCarpetasVacias(facturacionDir);
          }
        }
      }
    }
  } catch (e) {
    console.warn('[Facturación Electrónica] Error recorriendo carpetas para migrar archivos sueltos:', e.message);
  }
}

// ══════════════════════════════════════════════════════════════════════
// IMPLEMENTACIÓN 01 — Gestión → Correos DTE: búsqueda alternativa de PDF/JSON
// Antes de armar los adjuntos de un correo, el renderer llama a este handler
// para resolver la ruta real de cada archivo:
//   1) Si la ruta actual del documento (doc.pdfPath / doc.jsonPath) existe
//      físicamente, se usa tal cual (sin tocarla).
//   2) Si no existe, se busca en la MISMA carpeta que ya usa Facturación
//      Electrónica para esa empresa/mes (_feGetFacturacionDir de arriba —
//      no se crea una estructura de carpetas nueva), usando el Código de
//      Generación como nombre base (codigoBase + '.pdf' / '.json').
// No copia, mueve ni modifica ningún archivo — solo localiza rutas.
// Cada archivo (pdf/json) se resuelve de forma independiente.
// ══════════════════════════════════════════════════════════════════════
function _feResolverUnAdjunto(currentPath, dir, codigoBase, ext) {
  if (currentPath) {
    try { if (fs.existsSync(currentPath)) return { path: currentPath, origen: 'actual' }; } catch (e) { /* ignorar y continuar buscando */ }
  }
  if (codigoBase) {
    const candidato = path.join(dir, codigoBase + ext);
    try { if (fs.existsSync(candidato)) return { path: candidato, origen: 'facturacion' }; } catch (e) { /* no encontrado */ }

    // AGREGADO — con la organización por subcarpeta de fecha, el archivo ya
    // no queda suelto en la raíz de "Facturacion"; se busca dentro de cada
    // subcarpeta de fecha existente (mismo nombre codigoBase + ext).
    try {
      const entradas = fs.readdirSync(dir, { withFileTypes: true });
      for (const entrada of entradas) {
        if (!entrada.isDirectory()) continue;
        const nivel1Dir = path.join(dir, entrada.name);
        const candidatoEnFecha = path.join(nivel1Dir, codigoBase + ext);
        try { if (fs.existsSync(candidatoEnFecha)) return { path: candidatoEnFecha, origen: 'facturacion' }; } catch (e) { /* seguir buscando */ }

        // AGREGADO — con la carpeta de tipo de documento antes de la de
        // fecha, la carpeta de fecha puede estar un nivel más abajo
        // (Facturacion/[Tipo]/[Fecha]/); se revisa también ahí.
        try {
          const subEntradas = fs.readdirSync(nivel1Dir, { withFileTypes: true });
          for (const subEntrada of subEntradas) {
            if (!subEntrada.isDirectory()) continue;
            const candidatoNivel2 = path.join(nivel1Dir, subEntrada.name, codigoBase + ext);
            try { if (fs.existsSync(candidatoNivel2)) return { path: candidatoNivel2, origen: 'facturacion' }; } catch (e) { /* seguir buscando */ }
          }
        } catch (e) { /* no se pudo listar ese nivel; seguir con la siguiente carpeta */ }
      }
    } catch (e) { /* no se pudo listar subcarpetas; no encontrado */ }
  }
  return { path: null, origen: 'ninguno' };
}

ipcMain.handle('fe-resolver-adjuntos-correo', async (event, { pdfPath, jsonPath, mesLabel, empresaNombre, codigoBase } = {}) => {
  try {
    const dir  = _feGetFacturacionDir(mesLabel, empresaNombre);
    const pdf  = _feResolverUnAdjunto(pdfPath  || '', dir, codigoBase, '.pdf');
    const json = _feResolverUnAdjunto(jsonPath || '', dir, codigoBase, '.json');
    return {
      ok: true,
      pdfPath:   pdf.path,
      pdfOrigen: pdf.origen,
      jsonPath:  json.path,
      jsonOrigen: json.origen
    };
  } catch (e) {
    return { error: e.message };
  }
});

// fe-set-context — el renderer llama esto cada vez que el usuario entra a
// Facturación Electrónica o cambia el selector de "Mes de trabajo" (ver
// _feEnviarContexto en index.html), para que las descargas de esa empresa
// (JSON automático y PDF desde la pestaña nueva) se guarden en la carpeta
// correcta. Mientras el usuario no cambie el mes, todo lo que se descargue
// sigue yendo al mismo período — cambiar el mes redirige los PRÓXIMOS
// archivos, sin tocar los ya guardados.
ipcMain.handle('fe-set-context', async (event, { empresaId, mesLabel, empresaNombre } = {}) => {
  try {
    if (!empresaId) return { error: 'empresaId es requerido' };
    const partition = 'persist:facturacion-electronica-' + empresaId;
    const anterior = _feContextos[partition] || {};
    const mesLabelFinal = mesLabel || _feMesLabelPorDefecto();
    const empresaNombreFinal = empresaNombre || anterior.empresaNombre || 'Empresa';
    _feContextos[partition] = {
      mesLabel: mesLabelFinal,
      empresaNombre: empresaNombreFinal,
      ultimoJsonBase: anterior.ultimoJsonBase || null,
      ultimaCarpetaFecha: anterior.ultimaCarpetaFecha || null
    };
    // AGREGADO — primera vez que se detectan archivos sueltos (de antes de
    // este cambio) en la carpeta de Facturacion de esta empresa/mes, se
    // migran solos a su carpeta de fecha. No bloquea la respuesta al
    // renderer si algo falla (ver try/catch dentro de _feMigrarSueltos).
    const _feFacturacionDirActual = _feGetFacturacionDir(mesLabelFinal, empresaNombreFinal);
    _feMigrarSueltos(_feFacturacionDirActual);
    // AGREGADO — además, se migran las carpetas de fecha viejas (de antes
    // de agregar la carpeta de tipo de documento) a la estructura nueva.
    _feMigrarEstructuraTipo(_feFacturacionDirActual);
    // AGREGADO — corrige documentos que ya quedaron en una carpeta de
    // tipo distinta a la que les corresponde con el criterio de
    // clasificación actual (por ejemplo, organizados con una versión
    // anterior de este cambio).
    _feReclasificarDocumentos(_feFacturacionDirActual);
    // AGREGADO — junta cada .pdf con su .json aunque hayan quedado en
    // carpetas distintas (por ejemplo por descargas solapadas), y limpia
    // las carpetas que queden vacías.
    _feReunificarJsonYPdf(_feFacturacionDirActual);
    _feLimpiarCarpetasVacias(_feFacturacionDirActual);
    return { ok: true };
  } catch (e) {
    return { error: e.message };
  }
});

// ══════════════════════════════════════════════════════════════════════
// Implementación 02 — Facturación Electrónica: CLIENTES (llenado de
// formularios en el portal de Hacienda).
//
// Esta lista de clientes es independiente del catálogo de "Clientes" que
// ya usan Gestión / Escaneo QR (Libro de Ventas): aquí solo se guardan los
// datos que se necesitan para autocompletar los formularios de admin.
// factura.gob.sv (Factura, CCF, FSE, Nota de Crédito).
//
// Se guarda en disco, UN archivo JSON por empresa
// (userData/facturacion-electronica-clientes/<empresaId>.json),
// independiente de la carpeta mensual de PDF/JSON (esa carpeta cambia de
// mes en mes; los clientes de un comprador no deberían perderse ni
// duplicarse al cambiar el "Mes de trabajo").
// ══════════════════════════════════════════════════════════════════════
function _feClientesDir() {
  const dir = path.join(app.getPath('userData'), 'facturacion-electronica-clientes');
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function _feClientesPath(empresaId) {
  return path.join(_feClientesDir(), sanitizeFolderName(String(empresaId)) + '.json');
}

function _feClientesLeer(empresaId) {
  try {
    const p = _feClientesPath(empresaId);
    if (!fs.existsSync(p)) return [];
    const data = JSON.parse(fs.readFileSync(p, 'utf8'));
    return Array.isArray(data) ? data : [];
  } catch (e) {
    console.warn('[Facturación Electrónica][Clientes] Error leyendo clientes:', e.message);
    return [];
  }
}

function _feClientesGuardar(empresaId, clientes) {
  try {
    fs.writeFileSync(_feClientesPath(empresaId), JSON.stringify(clientes || [], null, 2), 'utf8');
    return true;
  } catch (e) {
    console.warn('[Facturación Electrónica][Clientes] Error guardando clientes:', e.message);
    return false;
  }
}

// Mismo orden de columnas que ya usaba la extensión de Chrome retirada,
// para que un CSV exportado por ella (o por versiones anteriores) se
// pueda seguir importando aquí sin conversión manual.
const _FE_CSV_HEADER = 'Modos,TipoDoc,Numero,Nombre,Actividad,Depto,Muni,Distrito,Direccion,Tel,Email,NombreComercial,NRC,ActividadFSE,NitCCF';

// Parser CSV genérico (RFC 4180): procesa TODO el contenido carácter por
// carácter en vez de cortar primero por líneas — así un campo entre
// comillas que contenga comas, comillas escapadas ("") o incluso un salto
// de línea literal no rompe el resto de las columnas. Devuelve un arreglo
// de filas, cada fila un arreglo de valores de columna (strings, ya sin
// las comillas envolventes).
function _feParsearCSVFilas(contenido) {
  const text = String(contenido || '');
  const filas = [];
  let fila = [];
  let campo = '';
  let dentroComillas = false;
  const len = text.length;
  let i = 0;
  while (i < len) {
    const ch = text[i];
    if (dentroComillas) {
      if (ch === '"') {
        if (text[i + 1] === '"') { campo += '"'; i += 2; continue; }
        dentroComillas = false; i++; continue;
      }
      campo += ch; i++; continue;
    }
    if (ch === '"') { dentroComillas = true; i++; continue; }
    if (ch === ',') { fila.push(campo); campo = ''; i++; continue; }
    if (ch === '\r') { i++; continue; }
    if (ch === '\n') { fila.push(campo); campo = ''; filas.push(fila); fila = []; i++; continue; }
    campo += ch; i++;
  }
  // Última fila si el archivo no termina con salto de línea.
  if (campo.length || fila.length) { fila.push(campo); filas.push(fila); }
  return filas;
}

// Convierte las filas ya separadas en clientes con la estructura "plana"
// que usa el resto de esta sección (modos/tDoc/num/nom/act/dep/mun/dis/
// com/tel/cor/nomCom/nrc/actFse/nitCcf), respetando el mismo mapeo que ya
// usaba el importador anterior. Los campos numéricos (Numero/NRC/NitCCF/
// Tel) se conservan como texto para no perder ceros a la izquierda. Los
// campos vacíos se conservan vacíos: no se inventa información.
// Devuelve { clientes, errores } — "errores" lista filas con muy pocas
// columnas como para representar un cliente, junto con su número de fila.
function _feClientesParsearCSV(contenido) {
  const filas = _feParsearCSVFilas(contenido);
  const nuevos = [];
  const errores = [];
  for (let i = 1; i < filas.length; i++) { // i = 1: se salta el encabezado
    const f = filas[i];
    if (!f || !f.length || (f.length === 1 && !f[0].trim())) continue; // fila vacía
    if (f.length < 4) { errores.push({ fila: i + 1, motivo: 'Columnas insuficientes (' + f.length + ')' }); continue; }
    nuevos.push({
      modos: (f[0] || '').split(';').map(m => m.trim().toUpperCase()).filter(Boolean),
      tDoc: (f[1] || '').trim(),
      num: (f[2] || '').trim(),
      nom: (f[3] || '').trim(),
      act: (f[4] || '').trim(),
      dep: (f[5] || '').trim().padStart(2, '0'),
      mun: (f[6] || '').trim().padStart(2, '0'),
      dis: (f[7] || '').trim(),
      com: (f[8] || '').trim(),
      tel: (f[9] || '').trim(),
      cor: (f[10] || '').trim(),
      nomCom: (f[11] || '').trim(),
      nrc: (f[12] || '').trim(),
      actFse: (f[13] || '').trim(),
      nitCcf: (f[14] || '').trim()
    });
  }
  return { clientes: nuevos, errores: errores };
}

// ── Detección de duplicados / fusión con clientes ya existentes ─────────
// Identificadores de negocio de un cliente (NIT CCF, NRC, TipoDoc+Numero).
// Solo se usan los que vienen no vacíos: dos clientes con NIT CCF vacío en
// ambos NO se consideran "coincidentes" por eso.
function _feClientesIdentificadores(c) {
  const ids = [];
  if (c && c.nitCcf && String(c.nitCcf).trim()) ids.push('nit:' + String(c.nitCcf).trim());
  if (c && c.nrc && String(c.nrc).trim()) ids.push('nrc:' + String(c.nrc).trim());
  if (c && c.tDoc && c.num && String(c.tDoc).trim() && String(c.num).trim()) {
    ids.push('doc:' + String(c.tDoc).trim() + ':' + String(c.num).trim());
  }
  return ids;
}

// Busca, dentro de la lista ya guardada, el índice de un cliente que
// comparta al menos un identificador con la fila importada. -1 si no hay
// coincidencia (es decir, es un cliente nuevo).
function _feClientesBuscarExistente(clientesExistentes, nuevo) {
  const idsNuevo = _feClientesIdentificadores(nuevo);
  if (!idsNuevo.length) return -1;
  for (let i = 0; i < clientesExistentes.length; i++) {
    const idsExistente = _feClientesIdentificadores(clientesExistentes[i]);
    for (let j = 0; j < idsNuevo.length; j++) {
      if (idsExistente.indexOf(idsNuevo[j]) !== -1) return i;
    }
  }
  return -1;
}

// Arma la estructura porModo para una fila importada: los datos propios
// del tipo de documento (tDoc/num/nitCcf/nrc/nomCom/act/actFse) se
// replican para CADA modo que trae esa fila (el CSV de la extensión
// anterior no distinguía datos por modo dentro de una misma fila).
function _feClientesPorModoDesdeFila(fila) {
  const porModo = {};
  (fila.modos || []).forEach(function(m) {
    porModo[m] = {
      tDoc: fila.tDoc || '',
      num: fila.num || '',
      nitCcf: fila.nitCcf || (fila.tDoc === '36' ? (fila.num || '') : ''),
      nrc: fila.nrc || '',
      nomCom: fila.nomCom || '',
      act: fila.act || '',
      actFse: fila.actFse || ''
    };
  });
  return porModo;
}

// Crea un cliente nuevo (estructura interna completa, con porModo) a
// partir de una fila importada.
function _feClientesCrearDesdeImportacion(fila) {
  return {
    modos: fila.modos || [],
    nom: fila.nom || '',
    tDoc: fila.tDoc || '',
    num: fila.num || '',
    nitCcf: fila.nitCcf || '',
    nrc: fila.nrc || '',
    nomCom: fila.nomCom || '',
    act: fila.act || '',
    actFse: fila.actFse || '',
    porModo: _feClientesPorModoDesdeFila(fila),
    dep: fila.dep || '',
    mun: fila.mun || '',
    dis: fila.dis || '',
    com: fila.com || '',
    tel: fila.tel || '',
    cor: fila.cor || ''
  };
}

// Fusiona un cliente ya existente con una fila importada que coincidió
// con él (mismo NIT CCF, NRC o TipoDoc+Numero). Reglas (ver punto 14 del
// pedido): no se pierde información ya guardada.
//   - Los campos de texto del CSV solo sobrescriben si vienen NO vacíos;
//     si el CSV trae el campo vacío, se conserva el valor ya guardado.
//   - "modos" se UNE (no se reemplaza): si el cliente ya era válido para
//     un modo que este CSV no trae, lo sigue siendo.
//   - "porModo" se actualiza/crea solo para los modos que trae ESTA fila,
//     sin tocar los datos por modo que el cliente ya tenía para otros
//     tipos de documento.
function _feClientesFusionar(existente, fila) {
  const combinado = Object.assign({}, existente);
  ['nom', 'act', 'dep', 'mun', 'dis', 'com', 'tel', 'cor', 'nomCom', 'nrc', 'actFse', 'nitCcf', 'tDoc', 'num'].forEach(function(campo) {
    if (fila[campo] && String(fila[campo]).trim()) combinado[campo] = fila[campo];
  });
  const modosExistentes = (Array.isArray(existente.modos) && existente.modos.length) ? existente.modos.slice() : (existente.modo ? [existente.modo] : []);
  (fila.modos || []).forEach(function(m) { if (modosExistentes.indexOf(m) === -1) modosExistentes.push(m); });
  combinado.modos = modosExistentes;
  combinado.porModo = Object.assign({}, existente.porModo || {}, _feClientesPorModoDesdeFila(fila));
  return combinado;
}

function _feClientesACSV(clientes) {
  const clean = (val) => `"${(val || '').toString().replace(/"/g, '""')}"`;
  const modosDe = (c) => (Array.isArray(c.modos) && c.modos.length) ? c.modos : (c.modo ? [c.modo] : []);
  let csv = _FE_CSV_HEADER + '\n';
  (clientes || []).forEach((c) => {
    csv += `${modosDe(c).join(';')},${c.tDoc || ''},${c.num || ''},${clean(c.nom)},${clean(c.act)},${c.dep || ''},${c.mun || ''},${clean(c.dis)},${clean(c.com)},${clean(c.tel)},${clean(c.cor)},${clean(c.nomCom)},${clean(c.nrc)},${clean(c.actFse)},${clean(c.nitCcf)}\n`;
  });
  return csv;
}

// Lee la lista completa de clientes de una empresa.
ipcMain.handle('fe-clientes-leer', async (event, { empresaId } = {}) => {
  if (!empresaId) return { error: 'empresaId es requerido' };
  return { ok: true, clientes: _feClientesLeer(empresaId) };
});

// Sobrescribe la lista completa de clientes de una empresa (alta, edición
// y borrado se resuelven en el renderer sobre el array completo, y este
// handler simplemente lo persiste).
ipcMain.handle('fe-clientes-guardar', async (event, { empresaId, clientes } = {}) => {
  if (!empresaId) return { error: 'empresaId es requerido' };
  const ok = _feClientesGuardar(empresaId, clientes || []);
  return ok ? { ok: true } : { error: 'No se pudo guardar el archivo de clientes.' };
});

// Diálogo nativo para elegir un CSV e importarlo (se AGREGA a los
// clientes ya existentes de la empresa, no los reemplaza).
ipcMain.handle('fe-clientes-importar-csv', async (event, { empresaId } = {}) => {
  if (!empresaId) return { error: 'empresaId es requerido' };
  const win = BrowserWindow.fromWebContents(event.sender);
  const res = await dialog.showOpenDialog(win, {
    title: 'Importar clientes desde CSV',
    filters: [{ name: 'CSV', extensions: ['csv'] }],
    properties: ['openFile']
  });
  if (res.canceled || !res.filePaths[0]) return { canceled: true };
  try {
    const contenido = fs.readFileSync(res.filePaths[0], 'utf8');
    const parseo = _feClientesParsearCSV(contenido);
    const filasNuevas = parseo.clientes;
    const actuales = _feClientesLeer(empresaId);

    let nuevosCount = 0;
    let actualizadosCount = 0;
    filasNuevas.forEach(function(fila) {
      const idxExistente = _feClientesBuscarExistente(actuales, fila);
      if (idxExistente !== -1) {
        actuales[idxExistente] = _feClientesFusionar(actuales[idxExistente], fila);
        actualizadosCount++;
      } else {
        actuales.push(_feClientesCrearDesdeImportacion(fila));
        nuevosCount++;
      }
    });

    _feClientesGuardar(empresaId, actuales);
    return {
      ok: true,
      clientes: actuales,
      agregados: nuevosCount, // se conserva por compatibilidad con llamadores anteriores
      procesados: filasNuevas.length,
      nuevos: nuevosCount,
      actualizados: actualizadosCount,
      errores: parseo.errores.length,
      detalleErrores: parseo.errores
    };
  } catch (e) {
    return { error: 'No se pudo leer el archivo: ' + e.message };
  }
});

// Diálogo nativo para elegir dónde guardar el CSV exportado.
ipcMain.handle('fe-clientes-exportar-csv', async (event, { empresaId, empresaNombre } = {}) => {
  if (!empresaId) return { error: 'empresaId es requerido' };
  const win = BrowserWindow.fromWebContents(event.sender);
  const res = await dialog.showSaveDialog(win, {
    title: 'Exportar clientes a CSV',
    defaultPath: `Clientes_${sanitizeFolderName(empresaNombre || String(empresaId))}.csv`,
    filters: [{ name: 'CSV', extensions: ['csv'] }]
  });
  if (res.canceled || !res.filePath) return { canceled: true };
  try {
    fs.writeFileSync(res.filePath, _feClientesACSV(_feClientesLeer(empresaId)), 'utf8');
    return { ok: true, path: res.filePath };
  } catch (e) {
    return { error: 'No se pudo guardar el archivo: ' + e.message };
  }
});

// ══════════════════════════════════════════════════════════════════════
// AGREGADO NUEVO — Módulo de Reportes DTE: Descargar PDF (Anexo 1 / Anexo 2)
// El renderer (FEReportes.js) construye un snapshot HTML autocontenido
// (tabla + <style> inline, mismo patrón que construirSnapshotLibroLegal del
// proyecto de referencia) y lo manda aquí. Se renderiza en una BrowserWindow
// oculta y se convierte a PDF con printToPDF (nativo de Electron, sin
// dependencias nuevas). Se guarda SIN diálogo, en la carpeta de Reportes de
// esta empresa/mes (ver _feGetReportesDir arriba) — mismo patrón silencioso
// que ya usa save-export-file.
// params: { htmlSnapshot, fileName, mesLabel, empresaNombre }
// ══════════════════════════════════════════════════════════════════════
ipcMain.handle('fe-reportes-guardar-pdf', async (event, { htmlSnapshot, fileName, mesLabel, empresaNombre } = {}) => {
  let pdfWin = null;
  try {
    if (!htmlSnapshot) return { error: 'No se recibió el contenido del reporte' };
    const destDir  = _feGetReportesDir(mesLabel, empresaNombre);
    let safeName   = sanitizeFolderName(fileName || 'Reporte.pdf');
    if (!/\.pdf$/i.test(safeName)) safeName += '.pdf';
    const destPath = path.join(destDir, safeName);

    pdfWin = new BrowserWindow({ show: false, webPreferences: { offscreen: true } });
    await pdfWin.loadURL('data:text/html;charset=UTF-8,' + encodeURIComponent(htmlSnapshot));

    const buffer = await pdfWin.webContents.printToPDF({
      printBackground: true,
      pageSize: 'Letter',
      landscape: true,
      margins: { marginType: 'default' }
    });
    fs.writeFileSync(destPath, buffer);

    // Igual que con los PDF de Facturación (ver 'fe-descarga-completada'),
    // se abre automáticamente para que el usuario lo vea de inmediato.
    shell.openPath(destPath).catch(function() {});

    return { ok: true, path: destPath };
  } catch (e) {
    return { error: e.message };
  } finally {
    if (pdfWin && !pdfWin.isDestroyed()) pdfWin.destroy();
  }
});

// ══════════════════════════════════════════════════════════════════════
// AGREGADO NUEVO — Módulo de Reportes DTE: Descargar CSV (Anexo 1 / Anexo 2)
// El renderer ya construye el texto CSV completo (separador ';', sin
// encabezados, sin comillas, según el formato oficial de Hacienda). Aquí
// solo se antepone el BOM UTF-8 (para que Excel abra tildes/Ñ correctamente
// al abrir el archivo directo) y se guarda SIN diálogo, mismo destino que
// el PDF de arriba.
// params: { content, fileName, mesLabel, empresaNombre }
// ══════════════════════════════════════════════════════════════════════
ipcMain.handle('fe-reportes-guardar-csv', async (event, { content, fileName, mesLabel, empresaNombre } = {}) => {
  try {
    if (typeof content !== 'string') return { error: 'No se recibió el contenido del reporte' };
    const destDir  = _feGetReportesDir(mesLabel, empresaNombre);
    let safeName   = sanitizeFolderName(fileName || 'Reporte.csv');
    if (!/\.csv$/i.test(safeName)) safeName += '.csv';
    const destPath = path.join(destDir, safeName);
    // CORRECCIÓN — el BOM UTF-8 (que sí se usa para los CSV de Clientes,
    // pensados para abrirse directo en Excel) rompe el validador de carga
    // de Hacienda: antepone un carácter invisible al primer campo de la
    // primera fila (la columna "fecha"), y Hacienda exige que ese campo
    // tenga EXACTAMENTE 10 caracteres ("DD/MM/AAAA") — con el BOM de más,
    // lo rechaza con "Formato de Fecha no es correcto". Los Anexo 1/Anexo 2
    // reales que Hacienda sí aceptó (compartidos por el usuario) tampoco
    // llevan BOM. Se guarda el archivo tal cual, sin BOM.
    fs.writeFileSync(destPath, content, 'utf8');
    return { ok: true, path: destPath };
  } catch (e) {
    return { error: e.message };
  }
});

// ══════════════════════════════════════════════════════════════════════
// Eliminar TODOS los datos de una empresa: clientes de FE, carpetas de
// documentos (todos los años/meses, en todas las raíces configuradas) y
// sesión del portal de Hacienda. Solo borra rutas que este mismo archivo
// ya construye para la empresa (nunca una ruta enviada desde el renderer).
// ══════════════════════════════════════════════════════════════════════
ipcMain.handle('fe-eliminar-empresa-datos', async (event, { empresaId, empresaNombre } = {}) => {
  const errores = [];
  if (!empresaId || typeof empresaId !== 'string') {
    return { ok: false, errores: ['empresaId es requerido'] };
  }
  const partition = 'persist:facturacion-electronica-' + empresaId;

  // 1) Clientes de Facturación Electrónica
  try {
    const pCli = _feClientesPath(empresaId);
    if (fs.existsSync(pCli)) fs.unlinkSync(pCli);
  } catch (e) { errores.push('clientes: ' + e.message); }

  // 2) Carpetas de documentos de la empresa (por nombre, igual que getExportDir)
  try {
    if (empresaNombre && String(empresaNombre).trim()) {
      const nombreCarpeta = sanitizeFolderName(empresaNombre);
      const cfg = readExportConfig();
      const raices = [];
      [cfg.csvPath, cfg.pdfPath, app.getPath('desktop')].forEach(function(r) {
        if (r && fs.existsSync(r) && raices.indexOf(r) === -1) raices.push(r);
      });
      raices.forEach(function(raiz) {
        try {
          const rootDir = path.join(raiz, FE_EXPORT_ROOT_NAME);
          if (!fs.existsSync(rootDir)) return;
          fs.readdirSync(rootDir, { withFileTypes: true }).forEach(function(a) {
            if (!a.isDirectory() || !/^FiscalSync \d{4}$/.test(a.name)) return;
            const yearDir = path.join(rootDir, a.name);
            fs.readdirSync(yearDir, { withFileTypes: true }).forEach(function(m) {
              if (!m.isDirectory() || m.name.indexOf('FiscalSync - ') !== 0) return;
              const mesDir  = path.join(yearDir, m.name);
              const destino = path.join(mesDir, nombreCarpeta);
              // Seguridad: el destino debe ser hijo directo de la carpeta del mes.
              if (path.dirname(destino) !== mesDir) return;
              if (fs.existsSync(destino)) fs.rmSync(destino, { recursive: true, force: true });
              if (fs.existsSync(mesDir) && fs.readdirSync(mesDir).length === 0) fs.rmdirSync(mesDir);
            });
            if (fs.existsSync(yearDir) && fs.readdirSync(yearDir).length === 0) fs.rmdirSync(yearDir);
          });
        } catch (e) { errores.push('carpetas (' + raiz + '): ' + e.message); }
      });
    }
  } catch (e) { errores.push('carpetas: ' + e.message); }

  // 3) Sesión del portal de Hacienda de esta empresa
  try {
    const sess = session.fromPartition(partition);
    await sess.clearStorageData();
    await sess.clearCache();
  } catch (e) { errores.push('sesión: ' + e.message); }
  delete _feContextos[partition];
  _feSesionesEnganchadas.delete(partition);

  return { ok: errores.length === 0, errores: errores };
});

// save-export-file — Guarda cualquier archivo exportado (CSV, XLS, JSON, etc.)
// directamente en [Raíz]/FiscalSync FE/FiscalSync [Año]/FiscalSync - [Mes]/[Empresa]/ sin mostrar ningún diálogo.
// Recibe: { mes, empresa, fileName, content, encoding }
ipcMain.handle('save-export-file', async (event, { mes, empresa, fileName, content, encoding }) => {
  try {
    const destDir  = getExportDir(mes, empresa, 'csv');
    const safeName = String(fileName || 'archivo').replace(/[\\/:*?"<>|]/g, '_');
    const destPath = path.join(destDir, safeName);
    fs.writeFileSync(destPath, content, encoding || 'utf8');
    return { ok: true, path: destPath };
  } catch (e) {
    return { error: e.message };
  }
});
// ══════════════════════════════════════════════════════════════════════
ipcMain.handle('select-folder', async () => {
  const result = await dialog.showOpenDialog({
    title: 'Seleccionar carpeta con PDFs y JSONs',
    properties: ['openDirectory']
  });
  if (result.canceled || !result.filePaths.length) return null;
  return result.filePaths[0];
});

// ══════════════════════════════════════════════════════════════════════
ipcMain.handle('read-folder', async (event, folderPath) => {
  try {
    const files = fs.readdirSync(folderPath);
    return files.map(f => {
      const ext  = path.extname(f).toLowerCase();
      const name = path.basename(f, ext);
      return { name, ext, full: f };
    });
  } catch (e) {
    return { error: e.message };
  }
});

// ══════════════════════════════════════════════════════════════════════
// select-folder-jsons — devuelve rutas absolutas de todos los .json (recursivo)
ipcMain.handle('select-folder-jsons', async () => {
  try {
    const result = await dialog.showOpenDialog({
      title: 'Seleccionar carpeta con JSONs de ventas',
      properties: ['openDirectory']
    });
    if (result.canceled || !result.filePaths.length) return { files: [] };
    function getAllJsons(dir, results) {
      results = results || [];
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) getAllJsons(full, results);
        else if (entry.name.toLowerCase().endsWith('.json')) results.push(full);
      }
      return results;
    }
    return { files: getAllJsons(result.filePaths[0]) };
  } catch (e) {
    return { files: [], error: e.message };
  }
});

// ══════════════════════════════════════════════════════════════════════
ipcMain.handle('read-json', async (event, folderPath, fileName) => {
  try {
    const fullPath = path.join(folderPath, fileName);
    const raw = fs.readFileSync(fullPath, 'utf8');
    return JSON.parse(raw);
  } catch (e) {
    return { error: e.message };
  }
});

// ══════════════════════════════════════════════════════════════════════
// send-email — Equivalente al VBA CDO/SMTP Gmail SSL 465
// Requiere: npm install nodemailer  (en la raíz del proyecto)
// mailOptions: { from, to, cc, bcc, subject, text, html, attachments:[{path}] }
// smtpConfig:  { host, port, secure, auth:{ user, pass }, connectionTimeout }
ipcMain.handle('send-email', async (event, { mailOptions, smtpConfig }) => {
  try {
    let nodemailer;
    try {
      nodemailer = require('nodemailer');
    } catch (e) {
      return { error: 'nodemailer no instalado. Ejecuta: npm install nodemailer en la carpeta del proyecto. (' + e.message + ')' };
    }

    // Crear transporte SMTP igual que VBA: smtp.gmail.com:465 SSL + autenticación
    const transporter = nodemailer.createTransport({
      host:              smtpConfig.host   || 'smtp.gmail.com',
      port:              smtpConfig.port   || 465,
      secure:            smtpConfig.secure !== false,
      auth: {
        user: smtpConfig.auth.user,
        pass: smtpConfig.auth.pass
      },
      connectionTimeout: smtpConfig.connectionTimeout || 30000,
      greetingTimeout:   smtpConfig.greetingTimeout   || 15000,
      socketTimeout:     smtpConfig.socketTimeout      || 30000
    });

    // Construir opciones igual que VBA: .To .CC .BCC .Subject .TextBody .AddAttachment
    const sendOptions = {
      from:    mailOptions.from,
      to:      mailOptions.to,
      subject: mailOptions.subject,
      text:    mailOptions.text
    };
    // AGREGADO NUEVO — Plantilla visual "01 · Azul profesional": el
    // renderer (index.html) ahora arma también un cuerpo HTML
    // (mailOptions.html) además del texto plano de siempre. Antes este
    // archivo lo descartaba porque sendOptions solo copiaba "text", así
    // que el cliente de correo (Gmail, etc.) nunca veía el diseño, solo
    // el texto plano. Se reenvía tal cual, sin modificar el resto de la
    // lógica de envío (SMTP, adjuntos, cc/bcc).
    if (mailOptions.html && String(mailOptions.html).trim()) {
      sendOptions.html = mailOptions.html;
    }
    if (mailOptions.cc  && String(mailOptions.cc).trim())  sendOptions.cc  = mailOptions.cc;
    if (mailOptions.bcc && String(mailOptions.bcc).trim()) sendOptions.bcc = mailOptions.bcc;

    // Adjuntos — verificar existencia antes de adjuntar (igual que VBA: If Dir(path) <> "")
    if (Array.isArray(mailOptions.attachments) && mailOptions.attachments.length > 0) {
      sendOptions.attachments = mailOptions.attachments.filter(a => {
        if (!a || !a.path) return false;
        try { return fs.existsSync(a.path); } catch (e) { return false; }
      });
    }

    const info = await transporter.sendMail(sendOptions);
    return { ok: true, messageId: info.messageId };
  } catch (err) {
    return { error: err.message || 'Error desconocido al enviar correo' };
  }
});

// ══════════════════════════════════════════════════════════════════════
// CAMBIO 7 — Almacenamiento en disco
// Guarda todos los datos de la app en un archivo JSON local en la máquina
// Ruta: app.getPath('userData')/fiscaldata.json  (ej. %AppData%/FiscalSync FE/)
// ══════════════════════════════════════════════════════════════════════
function getFiscalDataPath() {
  return path.join(app.getPath('userData'), 'fiscaldata.json');
}

ipcMain.handle('fs-read-store', async () => {
  try {
    const p = getFiscalDataPath();
    if (!fs.existsSync(p)) {
      return null;
    }
    const contenido = fs.readFileSync(p, 'utf8');
    return contenido;
  } catch(e) {
    console.error('fs-read-store error:', e.message);
    return null;
  }
});

ipcMain.handle('fs-write-store', async (event, jsonStr) => {
  try {
    const p = getFiscalDataPath();
    fs.writeFileSync(p, jsonStr, 'utf8');
    return { ok: true };
  } catch(e) {
    console.error('fs-write-store error:', e.message);
    return { error: e.message };
  }
});
ipcMain.handle('window-minimize', () => {
  const win = BrowserWindow.getFocusedWindow();
  if (win) win.minimize();
});

ipcMain.handle('window-maximize', () => {
  const win = BrowserWindow.getFocusedWindow();
  if (win) {
    if (win.isMaximized()) win.unmaximize();
    else win.maximize();
  }
});

ipcMain.handle('window-close', () => {
  const win = BrowserWindow.getFocusedWindow();
  if (win) win.close();
});

// ══════════════════════════════════════════════════════════════════════
app.whenReady().then(() => {
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
  // Ya NO se revisa automáticamente al iniciar — el usuario la busca manualmente
  // desde el botón "Actualizaciones" en la interfaz.

  // AGREGADO — al abrir la app, organiza solas (una sola vez) las carpetas
  // de Facturación Electrónica de TODAS las empresas/meses que ya existan
  // en disco, sin que el usuario tenga que entrar al módulo. No bloquea la
  // apertura de la ventana: se dispara después de createWindow().
  _feMigrarSueltosTodasLasCarpetas();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

// 👇 NUEVO: actualizaciones manuales, controladas desde el botón en la interfaz
autoUpdater.autoDownload = true;        // al encontrar una versión nueva, la descarga sola
autoUpdater.autoInstallOnAppQuit = false; // no instala silenciosamente al cerrar — solo cuando el usuario confirma

// Envía el estado del updater al HTML (index.html escucha esto vía preload.js)
function sendUpdateStatus(status, data) {
  if (mainWindowRef && !mainWindowRef.isDestroyed()) {
    mainWindowRef.webContents.send('update-status', Object.assign({ status }, data || {}));
  }
}

// El botón "Actualizaciones" del index.html llama a esto para buscar
ipcMain.handle('check-for-updates', async () => {
  try {
    await autoUpdater.checkForUpdates();
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e.message };
  }
});

// Devuelve la versión real instalada (la fuente de verdad es app.getVersion())
ipcMain.handle('get-app-version', () => app.getVersion());

// El botón "Instalar y reiniciar" (aparece solo cuando ya se descargó) llama a esto
ipcMain.handle('install-update', () => {
  autoUpdater.quitAndInstall();
});

autoUpdater.on('checking-for-update', () => {
  sendUpdateStatus('checking');
});

autoUpdater.on('update-available', (info) => {
  sendUpdateStatus('available', { version: info.version });
});

autoUpdater.on('update-not-available', () => {
  sendUpdateStatus('not-available');
});

autoUpdater.on('download-progress', (progress) => {
  sendUpdateStatus('downloading', { percent: Math.round(progress.percent) });
});

autoUpdater.on('update-downloaded', (info) => {
  sendUpdateStatus('downloaded', { version: info.version });
  // Instalación silenciosa y automática: sin diálogo, sin preguntar nada.
  // isSilent=true (no muestra el instalador de Windows), isForceRunAfter=true (reabre la app sola)
  setTimeout(() => {
    autoUpdater.quitAndInstall(true, true);
  }, 1500); // pequeña pausa para que el usuario alcance a ver el mensaje "Instalando..."
});

autoUpdater.on('error', (err) => {
  sendUpdateStatus('error', { message: err.message });
});