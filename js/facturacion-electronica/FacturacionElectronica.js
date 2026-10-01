// facturacion-electronica/FacturacionElectronica.js
// Extraído automáticamente de index.html (FiscalSync) — Fase 2.
// No se modificó ninguna línea de lógica: es exactamente el código original,
// solo reordenado por módulo.



    // Envía al proceso principal el contexto vigente (empresa) para que las
    // próximas descargas (JSON automático y PDF desde la pestaña nueva de
    // Hacienda) se guarden en la carpeta de esa empresa. El mes/año ya NO
    // se envía: main.js lo obtiene de identificacion.fecEmi de cada JSON
    // (Año → Mes → Empresa → Facturacion → Tipo → Fecha).
    function _feEnviarContexto() {
        var empresaId = _facturacionElecActiva && _facturacionElecActiva.empresaId;
        if (!empresaId) return;
        var emp = empresas.find(function(e) { return e.id === empresaId; });
        if (!window.fiscalAPI || !window.fiscalAPI.setFacturacionContext) return;
        window.fiscalAPI.setFacturacionContext({
            empresaId: empresaId,
            empresaNombre: emp ? emp.razon : 'Empresa'
        }).catch(function() {});
    }

    // Corrección 04 — aviso opcional cuando main.js termina de guardar un
    // JSON o PDF de Facturación Electrónica en su carpeta correspondiente.
    if (window.fiscalAPI && window.fiscalAPI.onFacturacionDescarga) {
        window.fiscalAPI.onFacturacionDescarga(function(info) {
            if (!info) return;
            if (info.ok) {
                var tipo = info.ext === '.pdf' ? 'PDF' : (info.ext === '.json' ? 'JSON' : 'Archivo');
                // Notificación individual por archivo (JSON y PDF nunca se
                // combinan en un solo aviso — ver punto 11 de la especificación).
                showToast('El documento ' + tipo + ' se descargó correctamente.', 'success', {
                    title: 'Archivo ' + tipo + ' descargado',
                    details: 'Guardado en la carpeta Facturación: ' + info.path + (info.aviso ? '\n' + info.aviso : '')
                });
            } else {
                showToast('No fue posible descargar el archivo de Facturación Electrónica.', 'error', {
                    title: 'Error al descargar',
                    details: 'No se pudo guardar el archivo de Facturación Electrónica.'
                });
            }
            // Integración 01 — Envío de Correos desde Facturación Electrónica:
            // reutiliza este MISMO evento (ya existente, sin tocarlo) para
            // detectar automáticamente el documento y prepararlo para correo.
            // Ver _feCorreoOnDescarga más abajo.
            _feCorreoOnDescarga(info);
        });
    } // baseName -> true (canceladas manualmente con la "X")
    var FE_CORREO_PRE_DELAY_MS = 5000; // espera en segundo plano antes de mostrar "Procesando documento…"
    var FE_CORREO_STALE_MS     = 60000;


    // AGREGADO NUEVO (Agregado 01 — Atajo Ctrl+B para búsqueda rápida de
    // clientes): mientras se trabaja normalmente en el portal de Hacienda,
    // el foco del teclado está DENTRO del <webview> — que es un WebContents
    // aparte (otro proceso), no el documento de esta app. Por eso Ctrl+B no
    // puede detectarse con un simple keydown en el documento del renderer;
    // hay que interceptarlo en main.js sobre el webContents de ESE webview
    // (igual que ya se hace para detectar la descarga del PDF, ver
    // onFacturacionDescarga arriba) y reenviarlo aquí por IPC. Ver main.js
    // (app.on('web-contents-created', …) + contents.hostWebContents.send)
    // y preload.js (contextBridge → onAtajoBusquedaRapidaFE) para la otra
    // mitad de este cambio.
    if (window.fiscalAPI && window.fiscalAPI.onAtajoBusquedaRapidaFE) {
        window.fiscalAPI.onAtajoBusquedaRapidaFE(function() {
            var screen = document.getElementById('facturacionElectronicaScreen');
            if (!screen || !screen.classList.contains('active')) return;
            var panel = document.getElementById('feBusquedaRapida');
            if (panel && panel.classList.contains('open')) {
                _feBusquedaRapidaCerrar();
            } else {
                _feBusquedaRapidaAbrir();
            }
        });
    }

    // Proyecto FiscalSync FE — de multiempresa+Gestión a una sola empresa:
    // ya no existen _facturacionEmpresaIdPendiente ni la pantalla
    // "facturacionSelectScreen" (¿A dónde desea ingresar?"). Esta función
    // se llama de dos formas: (a) sin argumento, justo después de
    // loginSubmit() cuando ya hay una empresa configurada (ver
    // _iniciarFlujoPostLogin en Empresas.js), o (b) con el id recién
    // creado, desde saveEmpresa() la primera vez que se configura la
    // empresa. En ambos casos toma directamente empresas[0] si no se pasa
    // un id explícito, porque este proyecto solo admite una empresa.
    function _entrarModoFacturacionElectronica(empresaId) {
        empresaId = empresaId || (empresas[0] && empresas[0].id);
        var emp = empresas.find(function(e) { return e.id === empresaId; });
        if (!emp) return;

        _feActualizarEmpresaActivaUI(empresaId);
        _asegurarWebviewFacturacion(empresaId);
        _empresaGuardarUltima(empresaId); // AGREGADO NUEVO — Multiempresa: recuerda la última empresa usada
        _feEnviarContexto();
        _mostrarFacturacionElecDesdeInicio();
    }

    // AGREGADO NUEVO — Multiempresa: muestra el nombre de la empresa activa
    // en el botón "Empresa" de la barra superior (#facturacionElecEmpresaNombre)
    // y reconstruye la lista del panel desplegable (#feEmpresaDropdown).
    function _feActualizarEmpresaActivaUI(empresaId) {
        var emp = empresas.find(function(e) { return e.id === empresaId; });
        var nombre = document.getElementById('facturacionElecEmpresaNombre');
        if (nombre) nombre.innerText = emp ? emp.razon : 'Empresa';
        _feEmpresaRenderLista(emp ? emp.id : null);
    }

    // Una fila por empresa: el nombre (clic = cambiar a ella, ✓ en la activa)
    // y un lápiz para editarla. Se arma con DOM (no innerHTML) porque la
    // razón social es texto libre del usuario.
    function _feEmpresaRenderLista(activaId) {
        var lista = document.getElementById('feEmpresaLista');
        if (!lista) return;
        lista.innerHTML = '';
        empresas.forEach(function(e) {
            var fila = document.createElement('div');
            fila.className = 'fe-emp-item' + (e.id === activaId ? ' active' : '');

            var sel = document.createElement('button');
            sel.type = 'button';
            sel.className = 'fe-emp-sel';
            sel.title = 'Cambiar a esta empresa';
            var chk = document.createElement('span');
            chk.className = 'fe-emp-check';
            chk.textContent = (e.id === activaId) ? '✓' : '';
            var nom = document.createElement('span');
            nom.textContent = e.razon;
            sel.appendChild(chk);
            sel.appendChild(nom);
            sel.addEventListener('click', function() {
                _feEmpresaCerrarDropdown();
                cambiarEmpresaFE(e.id);
            });

            var ed = document.createElement('button');
            ed.type = 'button';
            ed.className = 'fe-emp-edit';
            ed.title = 'Editar empresa';
            ed.innerHTML = '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M12 20h9M16.5 3.5a2.1 2.1 0 013 3L7 19l-4 1 1-4z"/></svg>';
            ed.addEventListener('click', function() { _feEmpresaEditar(e.id); });

            fila.appendChild(sel);
            fila.appendChild(ed);
            lista.appendChild(fila);
        });
    }

    function _feEmpresaEditar(empresaId) {
        var idx = empresas.findIndex(function(e) { return e.id === empresaId; });
        if (idx === -1) return;
        _feEmpresaCerrarDropdown();
        openEmpresaModal(idx);
    }

    function _feEmpresaToggleDropdown(ev) {
        var dd = document.getElementById('feEmpresaDropdown');
        if (!dd) return;
        if (dd.classList.contains('open')) {
            _feEmpresaCerrarDropdown();
        } else {
            _feEmpresaRenderLista(_facturacionElecActiva && _facturacionElecActiva.empresaId);
            dd.classList.add('open');
        }
    }

    function _feEmpresaCerrarDropdown() {
        var dd = document.getElementById('feEmpresaDropdown');
        if (dd) dd.classList.remove('open');
    }

    // Cierra el panel al hacer clic fuera de él (mismo patrón que
    // #feConfigDropdown / #feClientesDropdown).
    document.addEventListener('click', function(e) {
        var dd = document.getElementById('feEmpresaDropdown');
        var btn = document.getElementById('btnFeEmpresa');
        if (!dd || !dd.classList.contains('open')) return;
        if (dd.contains(e.target) || (btn && btn.contains(e.target))) return;
        _feEmpresaCerrarDropdown();
    });

    // AGREGADO NUEVO — Multiempresa: cambio de empresa desde el panel. Reutiliza
    // _entrarModoFacturacionElectronica(), que ya destruye el <webview> de
    // la empresa anterior (_asegurarWebviewFacturacion), crea el nuevo,
    // reinicia el mes de trabajo al mes actual y reenvía el contexto a main.js.
    function cambiarEmpresaFE(empresaId) {
        if (!empresaId || empresaId === _facturacionElecActiva.empresaId) return;
        if (!empresas.some(function(e) { return e.id === empresaId; })) {
            _feActualizarEmpresaActivaUI(_facturacionElecActiva.empresaId);
            return;
        }
        try {
            if (_facturacionElecActiva.webview && _facturacionElecActiva.webview.blur) _facturacionElecActiva.webview.blur();
            if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
        } catch (e) {}
        _entrarModoFacturacionElectronica(empresaId);
    }

    // Oculta loginScreen/empresaScreen (cualquiera que esté activo en ese
    // momento) y muestra Facturación Electrónica. Reemplaza a
    // _mostrarFacturacionElec/_ocultarFacturacionElec, que dependían de la
    // pantalla de selección ya eliminada.
    function _mostrarFacturacionElecDesdeInicio() {
        ['loginScreen'].forEach(function(id) {
            var el = document.getElementById(id);
            if (el) { el.classList.remove('active'); el.classList.add('hidden'); }
        });
        var fe = document.getElementById('facturacionElectronicaScreen');
        if (!fe) return;
        _feSetBarraInerte(false);
        fe.style.left = '0';
        requestAnimationFrame(function() {
            requestAnimationFrame(function() { fe.classList.add('active'); });
        });
        setTimeout(function() {
            if (_facturacionElecActiva.webview && _facturacionElecActiva.webview.focus) {
                try { _facturacionElecActiva.webview.focus(); } catch(e) {}
            }
        }, 170);
    }

    // Sin empresa configurada: la barra superior de Facturación Electrónica
    // se ve pero queda inerte (nada de sus botones puede usarse ni provoca
    // errores por no haber empresas[0]). Se vuelve a habilitar apenas se
    // entra a FE con una empresa (ver _mostrarFacturacionElecDesdeInicio).
    function _feSetBarraInerte(inerte) {
        var bar = document.getElementById('feTopbar');
        if (!bar) return;
        if (inerte) {
            bar.setAttribute('inert', '');
            bar.style.pointerEvents = 'none';
        } else {
            bar.removeAttribute('inert');
            bar.style.pointerEvents = '';
        }
    }

    // Muestra la pantalla de Facturación Electrónica SIN crear el <webview>
    // (no hay empresa): solo el fondo del tema y la barra superior, que
    // sirven de fondo al modal de "Configurar Empresa" (ver decidir() y
    // deleteEmpresa() en Empresas.js). Usa el mismo mecanismo de siempre
    // (clase "active" + left), nunca display:none.
    function _mostrarFacturacionElecSinEmpresa() {
        ['loginScreen'].forEach(function(id) {
            var el = document.getElementById(id);
            if (el) { el.classList.remove('active'); el.classList.add('hidden'); }
        });
        var nombre = document.getElementById('facturacionElecEmpresaNombre');
        if (nombre) nombre.innerText = '';
        _feActualizarEmpresaActivaUI(null); // AGREGADO NUEVO — Multiempresa: oculta el selector
        _feSetBarraInerte(true);
        var fe = document.getElementById('facturacionElectronicaScreen');
        if (!fe) return;
        fe.style.left = '0';
        requestAnimationFrame(function() {
            requestAnimationFrame(function() { fe.classList.add('active'); });
        });
    }

    // ══════════════════════════════════════════════════════════════════
    // Corrección 02 (2da vuelta) — ocultar la pantalla de Facturación
    // Electrónica SIN pasar nunca por display:none (ver clase
    // "fe-live-screen" en el CSS): además de la opacidad, se saca
    // literalmente del viewport (left:-10000px) mientras está apagada,
    // porque el <webview> puede seguir interceptando clics de su antigua
    // posición aunque tenga opacity:0/pointer-events:none.
    // Proyecto FiscalSync FE — ahora el único llamador es logout() en
    // Admin.js (idPantallaAMostrar = 'loginScreen'): cerrar sesión no
    // destruye el <webview> de Hacienda, solo lo oculta, para que el
    // usuario pueda volver a entrar sin perder la sesión del portal.
    // ══════════════════════════════════════════════════════════════════
    function _ocultarFacturacionElec(idPantallaAMostrar) {
        var fe = document.getElementById('facturacionElectronicaScreen');
        // Soltar cualquier foco que el <webview> todavía tuviera retenido
        // ANTES de empezar a ocultarlo — si el foco se queda "atrapado"
        // dentro del webview, los clics posteriores en la otra pantalla
        // pueden no llegarle a nadie.
        if (_facturacionElecActiva.webview && _facturacionElecActiva.webview.blur) {
            try { _facturacionElecActiva.webview.blur(); } catch(e) {}
        }
        if (document.activeElement && document.activeElement.blur) {
            try { document.activeElement.blur(); } catch(e) {}
        }
        if (fe) {
            fe.classList.remove('active');
            // Se saca del viewport recién cuando termina el fundido (150ms),
            // para no cortar la animación de salida.
            setTimeout(function() { fe.style.left = '-10000px'; }, 150);
        }
        var destino = document.getElementById(idPantallaAMostrar);
        if (destino) {
            destino.classList.remove('hidden');
            requestAnimationFrame(function() {
                requestAnimationFrame(function() { destino.classList.add('active'); });
            });
        }
    }

    function _recargarWebviewFacturacion() {
        if (_facturacionElecActiva.webview && _facturacionElecActiva.webview.reload) {
            _facturacionElecActiva.webview.reload();
        }
    }

    // ══════════════════════════════════════════════════════════════════
    // Corrección 01 — CICLO DE VIDA DE FACTURACIÓN ELECTRÓNICA POR EMPRESA
    //
    // Cada empresa tiene su propio <webview> y su propia sesión (partition
    // "persist:facturacion-electronica-<idDeEmpresa>"), completamente
    // independiente de las demás empresas — nunca se comparte partición,
    // ventana ni estado de navegación entre dos empresas distintas.
    //
    // Regla de vida (ver Corrección 01, puntos 3, 4 y 7):
    //   - Mientras el usuario siga DENTRO de la misma empresa, puede
    //     entrar y salir de Facturación Electrónica todas las veces que
    //     quiera: el <webview> se crea UNA sola vez y se reutiliza (nunca
    //     se recarga ni se pierde su sesión) — ver logout()/_ocultarFacturacionElec()
    //     en Admin.js/FacturacionElectronica.js, que NO destruyen nada.
    //   - Al salir COMPLETAMENTE de la empresa (volver a la lista de
    //     empresas), el <webview> de esa empresa se destruye por completo
    //     (se quita del DOM) y su instancia se olvida. La próxima vez que
    //     se entre a esa empresa se crea un <webview> nuevo desde cero.
    // ══════════════════════════════════════════════════════════════════
    var _facturacionElecActiva = { empresaId: null, webview: null };

    // Crea el <webview> de Facturación Electrónica para 'empresaId' si no
    // existe todavía uno vivo para ESA MISMA empresa. Si ya hay uno vivo
    // (el usuario solo estaba yendo y viniendo de Gestión, sin salir de la
    // empresa) lo reutiliza tal cual, sin tocarlo — por eso la sesión del
    // portal no se pierde entre idas y vueltas.
    function _asegurarWebviewFacturacion(empresaId) {
        if (_facturacionElecActiva.empresaId === empresaId && _facturacionElecActiva.webview) {
            return; // ya existe una instancia viva para esta empresa — se reutiliza
        }
        // Por seguridad: si quedaba una instancia de OTRA empresa (no
        // debería pasar si volverAEmpresas() ya la destruyó, pero se
        // cubre el caso igual), se destruye antes de crear la nueva.
        _destruirWebviewFacturacion();

        var cont = document.getElementById('facturacionElecWebviewContainer');
        if (!cont) return;

        var wv = document.createElement('webview');
        wv.id = 'facturacionElecWebview';
        wv.setAttribute('src', 'https://admin.factura.gob.sv/login');
        // Partición propia por empresa — ver main.js (will-attach-webview),
        // que también la fuerza del lado del proceso principal como
        // segunda barrera de seguridad, por si este valor se manipulara.
        wv.setAttribute('partition', 'persist:facturacion-electronica-' + empresaId);
        // Corrección 07 — Electron bloquea por defecto CUALQUIER pestaña
        // nueva (window.open, target="_blank", etc.) que un <webview>
        // intente abrir, sin importar lo que haga setWindowOpenHandler en
        // main.js — el popup se descarta antes de llegar ahí. Hacienda
        // abre el PDF precisamente así (ver Corrección 05), así que sin
        // este atributo esa pestaña nunca podía abrirse, aunque el
        // candado de dominio en main.js ya estuviera bien resuelto.
        wv.setAttribute('allowpopups', 'true');
        wv.style.width = '100%';
        wv.style.height = '100%';
        wv.style.display = 'flex';

        var indicador = document.getElementById('facturacionElecLoading');
        if (indicador) {
            wv.addEventListener('did-start-loading', function() { indicador.classList.remove('hidden'); });
            wv.addEventListener('did-stop-loading', function() { indicador.classList.add('hidden'); });
        }

        // Corrección 03 — Autocompletado de credenciales: cada vez que el
        // <webview> termina de cargar una página (login inicial, recarga,
        // o cualquier navegación dentro del portal) se vuelve a instalar
        // tanto el autocompletado de NIT/DUI + Clave de Acceso (pantalla
        // de login) como el detector de la Clave Privada (modal que
        // Hacienda muestra más adelante), porque "dom-ready" entrega un
        // contexto de página nuevo cada vez.
        wv.addEventListener('dom-ready', function() {
            _instalarAutoLoginFacturacion(wv, empresaId);
            _instalarAutoClavePrivada(wv, empresaId);
            // AGREGADO NUEVO — Configuración de Facturación Electrónica:
            // mismo patrón que las dos líneas de arriba, se reinstala en
            // cada dom-ready (login inicial, recarga o navegación dentro
            // del portal) para partir siempre de la configuración vigente.
            _instalarAutoConfigFE(wv, empresaId);
        });

        cont.appendChild(wv);
        _facturacionElecActiva = { empresaId: empresaId, webview: wv };
    }

    // Corrección 03 — Autocompletado de NIT/DUI y Clave de Acceso: al
    // abrir https://admin.factura.gob.sv/login, coloca automáticamente el
    // NIT/DUI (emp.feUsuario) en #username y la Clave de Acceso
    // (emp.feClaveAcceso, descifrada) en #password del portal, usando las
    // credenciales de la empresa actualmente asociada a este <webview>.
    // NO envía el formulario (no simula Enter ni click en el botón de
    // ingresar): el usuario confirma el inicio de sesión manualmente,
    // como pide la Corrección 03 (la automatización del envío queda para
    // una fase aparte, si se decide más adelante). Importante: la Clave
    // Privada NUNCA se usa aquí — solo NIT/DUI y Clave de Acceso, que son
    // los dos datos de inicio de sesión (ver _instalarAutoClavePrivada
    // para la Clave Privada, que es un dato distinto usado más tarde).
    function _instalarAutoLoginFacturacion(wv, empresaId) {
        var emp = empresas.find(function(e) { return e.id === empresaId; });
        if (!emp) return;
        var usuario = emp.feUsuario || '';
        var claveAcceso = emp.feClaveAcceso ? _correosDecipher(emp.feClaveAcceso) : '';
        if (!usuario && !claveAcceso) return;

        var script = '(function(){\n' +
            'if (window.__fsAutoLoginInstalado) return;\n' +
            'window.__fsAutoLoginInstalado = true;\n' +
            'var USUARIO = ' + JSON.stringify(usuario) + ';\n' +
            'var CLAVE_ACCESO = ' + JSON.stringify(claveAcceso) + ';\n' +
            'function setValor(input, valor){\n' +
            '  if (!input || input.dataset.fsAutoLlenado) return;\n' +
            '  input.dataset.fsAutoLlenado = "1";\n' +
            '  var setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;\n' +
            '  setter.call(input, valor);\n' +
            '  input.dispatchEvent(new Event("input", {bubbles:true}));\n' +
            '  input.dispatchEvent(new Event("change", {bubbles:true}));\n' +
            '}\n' +
            'function buscar(){\n' +
            '  var campoUsuario = document.getElementById("username");\n' +
            '  var campoClave = document.getElementById("password");\n' +
            '  if (campoUsuario && USUARIO) setValor(campoUsuario, USUARIO);\n' +
            '  if (campoClave && CLAVE_ACCESO) setValor(campoClave, CLAVE_ACCESO);\n' +
            '}\n' +
            'new MutationObserver(buscar).observe(document.documentElement, {childList:true, subtree:true});\n' +
            'buscar();\n' +
            '})();';

        if (wv.executeJavaScript) {
            wv.executeJavaScript(script).catch(function() {});
        }
    }

    // Implementación 01, punto 5 / Corrección 04 — Detección de la Clave
    // Privada, disparada por el usuario y no automática: cuando el portal
    // de Hacienda muestra el modal (SweetAlert2) "Ingrese la clave
    // privada de validación", el campo queda vacío y esperando — la Clave
    // Privada NO se escribe sola. Cuando el usuario presiona Enter dentro
    // de ese campo estando vacío, ESE Enter se intercepta (preventDefault
    // + stopImmediatePropagation) y ÚNICAMENTE coloca la Clave Privada en
    // el campo — no hace nada más, no reenvía ningún Enter ni envía el
    // formulario. El usuario debe presionar Enter una segunda vez para
    // enviarlo; como en ese momento el campo ya tiene el dato
    // (fsAutoLlenado ya está marcado), ese segundo Enter pasa de largo sin
    // ser interceptado y el portal lo procesa de forma normal.
    //
    // Corrección 05 — ANTES este código, además de colocar la clave,
    // simulaba un Enter sintético 80ms después para enviar el formulario
    // por su cuenta. Eso generó un envío DE MÁS: el usuario presionaba
    // Enter, el sistema llenaba el campo Y ADEMÁS disparaba su propio
    // Enter, resultando en un documento generado sin que el usuario lo
    // pidiera. Se quitó por completo ese segundo Enter automático — ahora
    // el Enter del usuario solo sirve para llenar el campo, y el envío
    // real del formulario queda 100% en manos del usuario.
    function _instalarAutoClavePrivada(wv, empresaId) {
        var emp = empresas.find(function(e) { return e.id === empresaId; });
        if (!emp || !emp.feClavePrivada) return;
        var clave = _correosDecipher(emp.feClavePrivada);
        if (!clave) return;

        var script = '(function(){\n' +
            'if (window.__fsAutoClavePrivadaInstalado) return;\n' +
            'window.__fsAutoClavePrivadaInstalado = true;\n' +
            'var CLAVE = ' + JSON.stringify(clave) + ';\n' +
            'var PLACEHOLDER = ' + JSON.stringify('Ingrese la clave privada de validación') + ';\n' +
            'function ponerClave(input){\n' +
            '  input.dataset.fsAutoLlenado = "1";\n' +
            '  var setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;\n' +
            '  setter.call(input, CLAVE);\n' +
            '  input.dispatchEvent(new Event("input", {bubbles:true}));\n' +
            '  input.dispatchEvent(new Event("change", {bubbles:true}));\n' +
            '}\n' +
            'function instalar(input){\n' +
            '  if (!input || input.dataset.fsEnterInstalado) return;\n' +
            '  input.dataset.fsEnterInstalado = "1";\n' +
            '  input.addEventListener("keydown", function(ev){\n' +
            '    if (ev.key !== "Enter" && ev.keyCode !== 13) return;\n' +
            '    if (input.dataset.fsAutoLlenado) return;\n' +
            '    ev.preventDefault();\n' +
            '    ev.stopImmediatePropagation();\n' +
            '    ponerClave(input);\n' +
            '  }, true);\n' +
            '}\n' +
            'function buscar(){\n' +
            '  var input = document.querySelector("input[placeholder=\\"" + PLACEHOLDER + "\\"]");\n' +
            '  if (input) instalar(input);\n' +
            '}\n' +
            'new MutationObserver(buscar).observe(document.documentElement, {childList:true, subtree:true});\n' +
            'buscar();\n' +
            '})();';

        if (wv.executeJavaScript) {
            wv.executeJavaScript(script).catch(function() {});
        }
    }

    // Destruye por completo la instancia viva de Facturación Electrónica
    // (si existe) — se llama SOLO al salir completamente de la empresa
    // (volverAEmpresas / _volverAEmpresasDesdeSeleccion), nunca al
    // simplemente volver a "¿A dónde desea ingresar?".
    function _destruirWebviewFacturacion() {
        if (_facturacionElecActiva.webview && _facturacionElecActiva.webview.parentNode) {
            _facturacionElecActiva.webview.parentNode.removeChild(_facturacionElecActiva.webview);
        }
        _facturacionElecActiva = { empresaId: null, webview: null };
        // Corrección 02 — reseteo defensivo: asegura que la pantalla nunca
        // quede con la clase "active" puesta si se destruyó el <webview>
        // mientras estaba visible.
        var fe = document.getElementById('facturacionElectronicaScreen');
        if (fe) { fe.classList.remove('active'); fe.style.left = '-10000px'; }
        _feClientesCache = [];
        _feClientesCerrarDropdown();
        // AGREGADO NUEVO — Multiempresa: este es el único punto por el que
        // pasa cualquier salida de una empresa (cambio o eliminación), así
        // que aquí se limpia lo que pertenecía a la empresa anterior:
        // paneles abiertos, documentos de correo en espera de emparejar
        // (si no, el PDF/JSON pendiente se guardaría en la empresa nueva)
        // y los resultados de la última búsqueda de Reportes DTE.
        _feEmpresaCerrarDropdown();
        if (typeof _feConfigCerrarDropdown === 'function') _feConfigCerrarDropdown();
        if (typeof _feCorreoCerrarDropdown === 'function') _feCorreoCerrarDropdown();
        if (typeof _feBusquedaRapidaCerrar === 'function') _feBusquedaRapidaCerrar();
        if (typeof _feCorreoCancelarProcesando === 'function') _feCorreoCancelarProcesando();
        var _selTipoRep = document.getElementById('feRepTipoSelect');
        if (typeof _feReportesElegirTipo === 'function' && _selTipoRep) _feReportesElegirTipo(_selTipoRep.value);
    }

    // AGREGADO NUEVO (Corrección 01 — Registro de Clientes según Tipo de
    // Documento): estado del formulario de alta/edición mientras está
    // abierto. _feModosConfigurados es la lista de tipos de documento que
    // el cliente tiene habilitados (equivalente a lo que antes eran los
    // chips "selected"); _feModoActivo es cuál de esos tipos se está
    // mostrando/editando ahora mismo en el bloque de campos de abajo;
    // _feDatosPorModo guarda, por separado para cada tipo, sus propios
    // datos (Tipo Doc/Número, NIT CCF, NRC, Nombre comercial, Actividad
    // económica) para que no se mezclen entre sí aunque el cliente tenga
    // varios tipos de documento habilitados.
    var _feModosConfigurados = [];
    var _feModoActivo = null;
    var _feDatosPorModo = {};

    var FE_TIPOS_DOC = {
        FCF: { label: "Consumidor Final", color: "#0A66C2" },
        CCF: { label: "Crédito Fiscal",   color: "#22C55E" },
        FSE: { label: "Sujeto Excluido",  color: "#F59E0B" },
        NC:  { label: "Nota de Crédito",  color: "#EF4444" }
    };

    // Tolera registros antiguos que solo tenían `modo` (string) en vez de
    // `modos` (arreglo) — mismo criterio que ya usaba la extensión.
    function _feModosDe(c) {
        if (Array.isArray(c.modos) && c.modos.length) return c.modos;
        if (c.modo) return [c.modo];
        return [];
    }

    // Detecta qué formulario de Hacienda está abierto AHORA MISMO dentro
    // del <webview>, según su URL actual (no la de la ventana de la app).
    //   /cf        -> Factura Consumidor Final (FCF)
    //   /ccf       -> Comprobante de Crédito Fiscal (CCF)
    //   /fse       -> Factura de Sujeto Excluido (FSE)
    //   /notascd.. -> Nota de Crédito (NC)
    var FE_RUTAS_HACIENDA = [
        { modo: 'NC',  test: function(p) { return /^\/notascd(;|\/|$)/.test(p); } },
        { modo: 'CCF', test: function(p) { return /^\/ccf(;|\/|$)/.test(p); } },
        { modo: 'FSE', test: function(p) { return /^\/fse(;|\/|$)/.test(p); } },
        { modo: 'FCF', test: function(p) { return /^\/cf(;|\/|$)/.test(p); } }
    ];
    function _feDetectarModoPorUrlWebview() {
        try {
            var wv = _facturacionElecActiva.webview;
            if (!wv || !wv.getURL) return null;
            var url = new URL(wv.getURL());
            if (url.hostname !== 'admin.factura.gob.sv') return null;
            var match = FE_RUTAS_HACIENDA.find(function(r) { return r.test(url.pathname || ""); });
            return match ? match.modo : null;
        } catch (e) {
            return null;
        }
    }

    // ════════════════════════════════════════════════════════════════════
    // AGREGADO NUEVO — Configuración de Facturación Electrónica
    // ────────────────────────────────────────────────────────────────────
    // Guarda fecha/tipo/cantidad/producto/tipoVenta/precio predeterminados, por empresa,
    // usando fsStore (el MISMO mecanismo de almacenamiento que ya usa
    // FiscalSync para el resto de la app — ver "CAMBIO 7 — fsStore" más
    // arriba). No crea un sistema de almacenamiento nuevo ni toca
    // fiscalAPI.leerClientesFE/guardarClientesFE (eso sigue siendo
    // exclusivo de Clientes). Reutiliza _feClientesEmpresaActual() ya
    // existente para saber a qué empresa asociar la configuración.
    //
    // Cada campo se guarda como {activo, valor}. Desactivar un campo NO
    // borra su valor — solo dejar de aplicarlo (ver _instalarAutoConfigFE).
    // ════════════════════════════════════════════════════════════════════

    var FE_CONFIG_CAMPOS = ['fecha', 'tipo', 'cantidad', 'producto', 'tipoVenta', 'precio'];

    // ── Aplicación en el portal de Hacienda (webview.executeJavaScript) ──
    // Mismo mecanismo que _instalarAutoLoginFacturacion/_instalarAutoClavePrivada
    // (arriba): nunca toca el <webview> por dentro salvo con executeJavaScript,
    // no hace click ni selecciona nada por el usuario, y solo coloca un valor
    // en un campo la primera vez que ese campo concreto aparece (dataset
    // fsAutoLlenado), por lo que si el usuario edita el campo después, esta
    // rutina no vuelve a pisar lo que el usuario escribió.
    //
    // - fecEmi: se coloca automáticamente al aparecer el campo de fecha del
    //   documento (Regla 5). NO se auto-selecciona "Agregar Detalle" ni
    //   "Producto o Servicio" (Regla 6) — tipo/cantidad/producto solo se
    //   colocan cuando esos campos ya existen en el DOM, es decir, después
    //   de que el usuario los haya abierto manualmente (Reglas 7-10).
    function _instalarAutoConfigFE(wv, empresaId) {
        var cfg = _feConfigLeer(empresaId);
        var script = '(function(){\n' +
            'var CFG = ' + JSON.stringify(cfg) + ';\n' +
            'function setValor(input, valor){\n' +
            '  if (!input || input.dataset.fsAutoLlenado) return;\n' +
            '  input.dataset.fsAutoLlenado = "1";\n' +
            '  var setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;\n' +
            '  setter.call(input, valor);\n' +
            '  input.dispatchEvent(new Event("input", {bubbles:true}));\n' +
            '  input.dispatchEvent(new Event("change", {bubbles:true}));\n' +
            '}\n' +
            'function setTextarea(el, valor){\n' +
            '  if (!el || el.dataset.fsAutoLlenado) return;\n' +
            '  el.dataset.fsAutoLlenado = "1";\n' +
            '  var setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, "value").set;\n' +
            '  setter.call(el, valor);\n' +
            '  el.dispatchEvent(new Event("input", {bubbles:true}));\n' +
            '  el.dispatchEvent(new Event("change", {bubbles:true}));\n' +
            '}\n' +
            'function setSelect(el, valor){\n' +
            '  if (!el || el.dataset.fsAutoLlenado) return;\n' +
            '  el.dataset.fsAutoLlenado = "1";\n' +
            '  var setter = Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, "value").set;\n' +
            '  setter.call(el, valor);\n' +
            '  el.dispatchEvent(new Event("change", {bubbles:true}));\n' +
            '  el.dispatchEvent(new Event("input", {bubbles:true}));\n' +
            '}\n' +
            'function buscar(){\n' +
            '  if (CFG.fecha && CFG.fecha.activo && CFG.fecha.valor) {\n' +
            '    var f = document.getElementById("fecEmi");\n' +
            '    if (f) setValor(f, CFG.fecha.valor);\n' +
            '  }\n' +
            '  if (CFG.tipo && CFG.tipo.activo && CFG.tipo.valor) {\n' +
            '    var t = document.querySelector(\'select[formcontrolname="tipo"]\');\n' +
            '    if (t) setSelect(t, CFG.tipo.valor);\n' +
            '  }\n' +
            '  if (CFG.cantidad && CFG.cantidad.activo && CFG.cantidad.valor) {\n' +
            '    var c = document.getElementById("inputCantidad");\n' +
            '    if (c) setValor(c, CFG.cantidad.valor);\n' +
            '  }\n' +
            '  if (CFG.producto && CFG.producto.activo && CFG.producto.valor) {\n' +
            '    var p = document.querySelector(\'input[formcontrolname="producto"], textarea[formcontrolname="producto"]\');\n' +
            '    if (p) { if (p.tagName === "TEXTAREA") setTextarea(p, CFG.producto.valor); else setValor(p, CFG.producto.valor); }\n' +
            '  }\n' +
            '  if (CFG.tipoVenta && CFG.tipoVenta.activo && CFG.tipoVenta.valor) {\n' +
            '    var tv = document.querySelector(\'select[formcontrolname="tipoVenta"]\');\n' +
            '    if (tv) setSelect(tv, CFG.tipoVenta.valor);\n' +
            '  }\n' +
            '  if (CFG.precio && CFG.precio.activo && CFG.precio.valor) {\n' +
            '    var pr = document.getElementById("inputPrecio");\n' +
            '    if (pr) setValor(pr, CFG.precio.valor);\n' +
            '  }\n' +
            '}\n' +
            'if (window.__fsConfigFEObserver) { window.__fsConfigFEObserver.disconnect(); }\n' +
            'window.__fsConfigFEObserver = new MutationObserver(buscar);\n' +
            'window.__fsConfigFEObserver.observe(document.documentElement, {childList:true, subtree:true});\n' +
            'buscar();\n' +
            '})();';

        if (wv.executeJavaScript) {
            wv.executeJavaScript(script).catch(function() {});
        }
    }

    // ── Formulario alta/edición ─────────────────────────────────────────
    // AGREGADO NUEVO (Corrección 01 — Registro de Clientes según Tipo de
    // Documento): la selección múltiple de tipos de documento ya NO junta
    // los campos de todos los tipos seleccionados en un mismo formulario.
    // Cada chip de tipo de documento ahora funciona como una "pestaña":
    //   - Clic en un tipo que aún NO está configurado para este cliente →
    //     se agrega a _feModosConfigurados, se vuelve el tipo activo y sus
    //     campos empiezan vacíos (ver _feModoActivarOAgregar).
    //   - Clic en un tipo que YA está configurado → simplemente lo vuelve
    //     el tipo activo y carga SUS PROPIOS datos guardados (no los de
    //     los demás tipos configurados).
    // AJUSTADO (Corrección 02): los chips ya NO tienen botón "×" — dejó de
    // existir la forma de quitar/eliminar los datos de un tipo de documento
    // desde aquí. La selección final de en qué documentos queda VÁLIDO el
    // cliente se pregunta aparte, al presionar Guardar.
    // Antes de cambiar de tipo activo siempre se guardan en memoria los
    // datos que se estaban editando (_feGuardarModoActivoEnMemoria), para
    // no perder lo digitado al pasar de uno a otro.
    function _feActualizarVisibilidadCampos(modosConfigurados, modoActivo) {
        // Mientras no haya ningún tipo de documento configurado, se oculta
        // por completo el bloque de datos del cliente y se muestra
        // únicamente el aviso "Selecciona al menos un tipo de documento…".
        var hayModoConfigurado = modosConfigurados.length > 0;
        var hayModoActivo = !!modoActivo;
        var contDatos = document.getElementById('fecli_datos_cliente');
        var msgSinTipo = document.getElementById('fecli_sin_tipo_msg');
        var msgNingunActivo = document.getElementById('fecli_ningun_activo_msg');

        // AJUSTADO (Corrección 04 — Estado del formulario al desactivar un
        // documento): el bloque de datos (fecli_datos_cliente) ahora solo
        // se muestra cuando hay un documento CONFIGURADO Y ACTIVO al mismo
        // tiempo. Antes (Corrección 02) solo dependía de "configurado", así
        // que al desactivar con doble toque el único documento activo (ver
        // _feModoDesactivarDoble) los datos generales del cliente (nombre,
        // dirección, etc.) quedaban visibles aunque ya no hubiera ningún
        // documento para llenar. Con este cambio, si todos los documentos
        // quedan desactivados, el formulario completo se oculta — tal como
        // si no se hubiera seleccionado ningún documento.
        if (contDatos) contDatos.classList.toggle('hidden', !hayModoConfigurado || !hayModoActivo);

        // El aviso "Selecciona al menos un tipo de documento…" solo aplica
        // cuando NO hay ningún documento configurado todavía.
        if (msgSinTipo) msgSinTipo.classList.toggle('hidden', hayModoConfigurado);

        // AJUSTADO (Corrección 04): con "un toque selecciona / dos toques
        // desactiva" (ver _feModoActivarOAgregar y _feModoDesactivarDoble),
        // puede haber documentos ya configurados pero ninguno activo en
        // este momento (por ejemplo, justo después de un doble toque sobre
        // el documento que estaba activo). En ese caso se oculta TODO el
        // bloque de datos (ver arriba) y se muestra este aviso en su lugar,
        // dejando claro que no hay ningún documento seleccionado para
        // llenar.
        if (msgNingunActivo) msgNingunActivo.classList.toggle('hidden', !hayModoConfigurado || hayModoActivo);

        // Primera corrección — Crédito Fiscal: para CCF no se necesitan
        // Tipo Doc ni Número (el cliente se identifica solo con su NIT en
        // el campo "NIT (para Crédito Fiscal)"); para los demás tipos de
        // documento sí se necesitan, igual que antes.
        var necesitaTipoNum = !!modoActivo && modoActivo !== "CCF";
        var necesitaNitCcf = modoActivo === "CCF";
        var necesitaNrc = modoActivo === "CCF" || modoActivo === "NC" || modoActivo === "FCF";
        var necesitaComercial = modoActivo === "CCF" || modoActivo === "NC";
        var necesitaActividad = modoActivo === "CCF" || modoActivo === "NC" || modoActivo === "FCF";
        var necesitaActividadFse = modoActivo === "FSE";
        // Corrección 05 (parte 2) — CAUSA RAÍZ de que Tipo Doc/Número
        // siguieran visibles al elegir Crédito Fiscal: este contenedor
        // tiene en el HTML un style="display:flex;..." puesto directamente
        // inline (para el layout en fila de sus dos campos). Un estilo
        // inline siempre gana por especificidad sobre la clase CSS
        // ".hidden{display:none}", así que aunque classList.toggle('hidden',
        // ...) sí agregaba la clase correctamente, el display:flex inline
        // la seguía pisando y el bloque nunca llegaba a ocultarse. Se fija
        // el display explícitamente desde JS (que sí tiene la misma
        // especificidad que el inline existente y lo reemplaza) además de
        // la clase, para que ambos coincidan con el estado real.
        var contTipoNum = document.getElementById('fecli_cont_tipoNum');
        contTipoNum.classList.toggle('hidden', !necesitaTipoNum);
        contTipoNum.style.display = necesitaTipoNum ? 'flex' : 'none';
        document.getElementById('fecli_cont_nit_ccf').classList.toggle('hidden', !necesitaNitCcf);
        document.getElementById('fecli_cont_nrc').classList.toggle('hidden', !necesitaNrc);
        document.getElementById('fecli_cont_comercial').classList.toggle('hidden', !necesitaComercial);
        document.getElementById('fecli_cont_actividad').classList.toggle('hidden', !necesitaActividad);
        document.getElementById('fecli_cont_actividad_fse').classList.toggle('hidden', !necesitaActividadFse);
    }

    // AJUSTADO (Corrección 03 — Deseleccionar documentos mediante doble
    // toque): un solo toque SIEMPRE selecciona/activa el documento (o lo
    // agrega si aún no estaba configurado) y NUNCA lo desactiva — ni
    // siquiera tocando dos veces el mismo botón por separado. Para
    // desactivar un documento hay que hacer DOBLE toque/clic seguido sobre
    // su botón (ver _feModoDesactivarDoble, enlazado por ondblclick más
    // abajo). Los chips siguen sin botón "×".
    function _feRenderChipsModo(modosConfigurados, modoActivo) {
        var cont = document.getElementById('fecli_modos_chips');
        cont.innerHTML = Object.keys(FE_TIPOS_DOC).map(function(m) {
            var tipo = FE_TIPOS_DOC[m];
            var configurado = modosConfigurados.indexOf(m) !== -1;
            var activo = m === modoActivo;
            var clases = (configurado ? ' configurado' : '') + (activo ? ' activo' : '');
            var estilo = configurado ? 'background:' + tipo.color + ';' : '';
            return '<div class="fe-cli-chip' + clases + '" data-modo="' + m + '" style="' + estilo + '" onclick="event.stopPropagation();_feModoActivarOAgregar(\'' + m + '\')" ondblclick="event.stopPropagation();_feModoDesactivarDoble(\'' + m + '\')">' + tipo.label + '</div>';
        }).join('');
        _feRenderResumenModos(modosConfigurados);
    }

    // AGREGADO NUEVO (Corrección 02 — Orden y selección de documentos):
    // resumen informativo (sin clic, sin "×") de los tipos de documento que
    // ya se han configurado para este cliente, mostrado debajo del bloque
    // de datos ("Tipo(s) de Documento que aplican a este cliente"). Solo
    // refleja lo ya configurado con los botones de arriba; no decide la
    // validez final del cliente por documento (eso se pregunta al Guardar).
    function _feRenderResumenModos(modosConfigurados) {
        var cont = document.getElementById('fecli_modos_resumen');
        if (!cont) return;
        if (!modosConfigurados.length) {
            cont.innerHTML = '<span style="font-size:11px;color:var(--rp-text-secondary);">Ninguno configurado todavía.</span>';
            return;
        }
        cont.innerHTML = modosConfigurados.map(function(m) {
            var tipo = FE_TIPOS_DOC[m] || { label: m, color: "#94a3b8" };
            return '<span class="fe-cli-badge" style="background:' + tipo.color + ';font-size:10px;padding:4px 8px;">' + tipo.label + '</span>';
        }).join('');
    }

    // Guarda en _feDatosPorModo los valores que están ahora mismo en los
    // campos del formulario, asociados al tipo de documento activo.
    function _feGuardarModoActivoEnMemoria() {
        if (!_feModoActivo) return;
        _feDatosPorModo[_feModoActivo] = {
            tDoc: document.getElementById('fecli_tipoDoc').value,
            num: document.getElementById('fecli_numDoc').value.trim(),
            nitCcf: document.getElementById('fecli_nitCcf').value.trim(),
            nrc: document.getElementById('fecli_nrc').value.trim(),
            nomCom: document.getElementById('fecli_comercial').value.trim(),
            act: document.getElementById('fecli_actividad').value.trim(),
            actFse: document.getElementById('fecli_actividadFse').value.trim()
        };
    }

    // Carga en los campos del formulario los datos guardados del tipo de
    // documento actualmente activo (vacíos si es un tipo recién agregado).
    function _feCargarModoActivoEnCampos() {
        var datos = (_feModoActivo && _feDatosPorModo[_feModoActivo]) || {};
        document.getElementById('fecli_tipoDoc').value = datos.tDoc || "";
        document.getElementById('fecli_numDoc').value = datos.num || "";
        document.getElementById('fecli_nitCcf').value = datos.nitCcf || "";
        document.getElementById('fecli_nrc').value = datos.nrc || "";
        document.getElementById('fecli_comercial').value = datos.nomCom || "";
        document.getElementById('fecli_actividad').value = datos.act || "";
        document.getElementById('fecli_actividadFse').value = datos.actFse || "";
        var lbl = document.getElementById('fecli_modo_activo_nombre');
        if (lbl) lbl.textContent = _feModoActivo ? ((FE_TIPOS_DOC[_feModoActivo] || {}).label || _feModoActivo) : '';
    }

    // AJUSTADO (Corrección 03 — Deseleccionar documentos mediante doble
    // toque): un toque SIEMPRE selecciona/activa el documento — si ya
    // estaba activo, tocarlo de nuevo lo deja exactamente igual (no lo
    // desactiva; ese comportamiento de "segundo toque desactiva" de la
    // Corrección 02 se reemplazó por el doble toque, ver
    // _feModoDesactivarDoble). Si el documento ya estaba configurado pero
    // no activo, un toque regresa a él y carga sus propios datos ya
    // guardados, sin mezclarlos con los de otros documentos.
    function _feModoActivarOAgregar(m) {
        if (_feModoActivo === m) return; // ya es el tipo activo, un solo toque no hace nada más
        _feGuardarModoActivoEnMemoria();
        var yaConfigurado = _feModosConfigurados.indexOf(m) !== -1;
        if (!yaConfigurado) {
            _feModosConfigurados.push(m);
            // AJUSTADO (Corrección 03): si el documento ya tenía datos
            // guardados de una activación/desactivación anterior, se
            // conservan (ver _feModoDesactivarDoble); solo se inicializa
            // vacío si es la primera vez que se configura.
            if (!_feDatosPorModo[m]) _feDatosPorModo[m] = {};
        }
        _feModoActivo = m;
        _feCargarModoActivoEnCampos();
        _feRenderChipsModo(_feModosConfigurados, _feModoActivo);
        _feActualizarVisibilidadCampos(_feModosConfigurados, _feModoActivo);
    }

    // AGREGADO NUEVO (Corrección 03 — Deseleccionar documentos mediante
    // doble toque): al hacer doble toque/clic sobre el botón de un
    // documento, ese documento se desactiva — pierde su color de
    // selección, deja de estar activo para el llenado, no se muestra
    // ningún dato o campo correspondiente, y se elimina de "Tipo(s) de
    // Documento que aplican a este cliente". Los datos ya digitados para
    // ese documento se conservan en memoria (por si se vuelve a
    // seleccionar más adelante), pero deja de contar como documento
    // configurado/aplicable hasta que se vuelva a tocar. Los demás
    // documentos ya seleccionados no se ven afectados.
    function _feModoDesactivarDoble(m) {
        var idx = _feModosConfigurados.indexOf(m);
        if (idx === -1) return; // no estaba configurado, nada que desactivar
        _feModosConfigurados.splice(idx, 1);
        if (_feModoActivo === m) {
            _feModoActivo = null;
            _feCargarModoActivoEnCampos();
        }
        _feRenderChipsModo(_feModosConfigurados, _feModoActivo);
        _feActualizarVisibilidadCampos(_feModosConfigurados, _feModoActivo);
    }

    // Deptos/municipios/distritos — reutiliza FISCALSYNC_UBICACIONES
    // (ubicaciones.js), catálogo oficial CAT-012/013/008, sin cambios.
    // Corrección 01 — ubicaciones.js solo trae los CÓDIGOS de departamento
    // como claves del objeto (no sus nombres); se agrega aquí el nombre
    // oficial de cada uno (catálogo CAT-012) únicamente para mostrarlo en
    // el <select>, sin alterar en nada los datos de ubicaciones.js.
    var FE_DEPARTAMENTOS_NOMBRES = {
        "01": "AHUACHAPÁN", "02": "SANTA ANA", "03": "SONSONATE",
        "04": "CHALATENANGO", "05": "LA LIBERTAD", "06": "SAN SALVADOR",
        "07": "CUSCATLÁN", "08": "LA PAZ", "09": "CABAÑAS",
        "10": "SAN VICENTE", "11": "USULUTÁN", "12": "SAN MIGUEL",
        "13": "MORAZÁN", "14": "LA UNIÓN"
    };
    function _feLlenarDeptos() {
        var sel = document.getElementById('fecli_depto');
        if (!sel || typeof FISCALSYNC_UBICACIONES === 'undefined') return;
        // Corrección 03 — Object.keys() no respeta el orden de escritura del
        // objeto para claves de este tipo: motores JS reordenan primero,
        // en orden numérico ascendente, cualquier clave que sea un "índice
        // entero canónico" (p.ej. "10".."14", que sí coinciden con su propia
        // representación numérica), y solo DESPUÉS agregan las demás claves
        // en su orden original ("01".."09", que no son canónicas por el cero
        // a la izquierda). El resultado real era 10,11,12,13,14,01,02,...,09
        // — el desorden que se reportó. Se ordena aquí explícitamente por
        // valor numérico para garantizar 01→14 sin depender de ese detalle
        // del motor JS.
        var deptos = Object.keys(FISCALSYNC_UBICACIONES).sort(function(a, b) {
            return parseInt(a, 10) - parseInt(b, 10);
        });
        sel.innerHTML = deptos.map(function(dep) {
            var nombre = FE_DEPARTAMENTOS_NOMBRES[dep] || dep;
            return '<option value="' + dep + '">' + dep + ' - ' + nombre + '</option>';
        }).join('');
    }
    function _feActualizarMunicipios(dep, selMun, selDis) {
        var sel = document.getElementById('fecli_municipio');
        var data = FISCALSYNC_UBICACIONES[dep];
        if (!sel || !data) return;
        sel.innerHTML = data.munis.map(function(m) {
            return '<option value="' + m.v + '"' + (m.v === selMun ? ' selected' : '') + '>' + m.t + '</option>';
        }).join('');
        _feActualizarDistritos(dep, sel.value, selDis);
    }
    function _feActualizarDistritos(dep, mun, selDis) {
        var sel = document.getElementById('fecli_distrito');
        var data = FISCALSYNC_UBICACIONES[dep];
        if (!sel || !data || !data.distritos[mun]) { if (sel) sel.innerHTML = ''; return; }
        sel.innerHTML = data.distritos[mun].map(function(d) {
            return '<option value="' + d.v + '"' + (d.v === selDis ? ' selected' : '') + '>' + d.t + '</option>';
        }).join('');
    }

    // AGREGADO NUEVO (Corrección 02): puebla fecliValidezModal con un
    // checkbox por cada tipo de documento existente (FE_TIPOS_DOC),
    // marcado por defecto si ese tipo ya tiene datos configurados
    // (_feModosConfigurados) — el usuario puede marcar/desmarcar libremente
    // antes de confirmar.
    // AJUSTADO (Corrección 03 — Diseño de selección de documentos válidos):
    // se reemplazó el cuadro con check por un interruptor (toggle-switch),
    // ubicado a la derecha de cada tipo de documento. El <input
    // type="checkbox" class="fecli-validez-check"> se mantiene intacto
    // (mismo value/checked), por lo que _feValidezConfirmar() y el resto de
    // la lógica de validación/registro del cliente siguen funcionando sin
    // ningún cambio; solo cambió el estilo visual del control.
    function _feAbrirModalValidez() {
        var cont = document.getElementById('fecliValidezOpciones');
        if (!cont) return;
        cont.innerHTML = Object.keys(FE_TIPOS_DOC).map(function(m) {
            var tipo = FE_TIPOS_DOC[m];
            var checked = _feModosConfigurados.indexOf(m) !== -1 ? ' checked' : '';
            return '<label style="display:flex;align-items:center;justify-content:space-between;gap:12px;font-size:12.5px;font-weight:600;color:var(--rp-text-primary);cursor:pointer;">' +
                '<span style="display:flex;align-items:center;gap:9px;">' +
                    '<span style="width:9px;height:9px;border-radius:50%;background:' + tipo.color + ';display:inline-block;flex-shrink:0;"></span>' +
                    tipo.label +
                '</span>' +
                '<span class="toggle-switch">' +
                    '<input type="checkbox" class="fecli-validez-check" value="' + m + '"' + checked + '>' +
                    '<span class="toggle-slider"></span>' +
                '</span>' +
            '</label>';
        }).join('');
        var modal = document.getElementById('fecliValidezModal');
        modal.classList.remove('hidden');
        modal.style.display = 'flex';
    }

    function _feValidezCancelar() {
        var modal = document.getElementById('fecliValidezModal');
        modal.classList.add('hidden');
        modal.style.display = 'none';
    }

    function _feValidezConfirmar() {
        var checks = document.querySelectorAll('#fecliValidezOpciones .fecli-validez-check:checked');
        var modosValidos = Array.prototype.slice.call(checks).map(function(c) { return c.value; });
        // Corrección 02 — alert() nativo reemplazado por fsAlert.
        if (!modosValidos.length) { fsAlert('Selecciona al menos un tipo de documento en el que el cliente será válido.'); return; }
        _feValidezCancelar();
        _feClientesGuardarFormFinal(modosValidos);
    }

    // ── Agregado 01 — Atajo Ctrl+B para búsqueda rápida de clientes ─────
    // AGREGADO NUEVO: panel flotante independiente del apartado de
    // Clientes (#feClientesDropdown), pensado como un atajo para no tener
    // que abrir ese panel solo para buscar un cliente y usar "Rellenar".
    // No modifica nada de #feClientesDropdown ni de las funciones que ya
    // existían para él (_feClientesCargar, _feClientesCache,
    // _feDetectarModoPorUrlWebview, _feClientesLlenar): las reutiliza tal
    // cual para que el botón "Rellenar" de aquí haga EXACTAMENTE lo mismo
    // que el botón "Rellenar" de la Lista de Clientes.
    function _feBusquedaRapidaAbrir() {
        // Solo tiene sentido dentro de la pantalla de Facturación
        // Electrónica (con una empresa/webview activa); si se presiona
        // Ctrl+B en cualquier otra pantalla de la app, no hace nada (ver
        // el listener de "keydown" más abajo, que ya filtra por esto antes
        // de llamar a esta función, pero se revalida aquí por seguridad).
        var screen = document.getElementById('facturacionElectronicaScreen');
        if (!screen || !screen.classList.contains('active')) return;
        var panel = document.getElementById('feBusquedaRapida');
        if (!panel) return;
        var input = document.getElementById('feBusquedaRapidaInput');
        if (input) input.value = "";
        // Se cierra el panel de Clientes si estuviera abierto, para no
        // tener dos paneles flotantes superpuestos a la vez.
        _feClientesCerrarDropdown();
        // Misma fuente de datos que la Lista de Clientes (_feClientesCache);
        // se recarga por si se abrió esta búsqueda rápida sin haber entrado
        // antes al apartado de Clientes en esta sesión.
        _feClientesCargar();
        // Corrección 01 (Ctrl+B): al abrir, el panel debe quedar SOLO con
        // la barra de búsqueda — sin listar todos los clientes de una vez.
        // La lista empieza vacía y solo se llena cuando el usuario escribe
        // (ver _feBusquedaRapidaRender, que ahora exige texto no vacío).
        var listaInicial = document.getElementById('feBusquedaRapidaLista');
        if (listaInicial) listaInicial.innerHTML = '';
        panel.classList.add('open');
        // Corrección 02 (bug: no dejaba escribir en la barra): el <webview>
        // de Hacienda es un WebContents aparte y retiene el foco del
        // teclado aunque este panel se muestre encima; si no se le quita
        // el foco explícitamente, las teclas le siguen llegando a Hacienda
        // en vez de a "input" (mismo patrón defensivo que ya usa
        // _ocultarFacturacionElec al cambiar de pantalla).
        if (_facturacionElecActiva.webview && _facturacionElecActiva.webview.blur) {
            try { _facturacionElecActiva.webview.blur(); } catch (e) {}
        }
        if (document.activeElement && document.activeElement.blur) {
            try { document.activeElement.blur(); } catch (e) {}
        }
        setTimeout(function() { if (input) input.focus(); }, 10);
    }

    function _feBusquedaRapidaCerrar() {
        var panel = document.getElementById('feBusquedaRapida');
        if (panel) panel.classList.remove('open');
    }

    // Muestra únicamente nombre + botón "Rellenar" por cliente (sin Tipo
    // Doc/Número, sin badges de documentos, sin Editar/Borrar) — a
    // diferencia de _feClientesRender, que sí muestra toda esa información
    // en la Lista de Clientes del apartado de Clientes (sin tocar esa
    // función). La búsqueda es solo por nombre, tal como se pidió.
    function _feBusquedaRapidaRender(filtro) {
        var div = document.getElementById('feBusquedaRapidaLista');
        if (!div) return;
        var input = document.getElementById('feBusquedaRapidaInput');
        filtro = (filtro !== undefined ? filtro : (input ? input.value : "")).toLowerCase();
        // Corrección 01 (Ctrl+B): mientras no se haya escrito nada, no se
        // muestra ningún cliente debajo de la barra (ni la lista completa
        // ni el mensaje de "sin clientes") — la lista solo aparece a
        // partir de la primera letra escrita.
        if (!filtro) { div.innerHTML = ''; return; }
        var modoActual = _feDetectarModoPorUrlWebview();
        var vis = (_feClientesCache || []).filter(function(c) {
            return (c.nom || "").toLowerCase().indexOf(filtro) !== -1;
        });
        if (!vis.length) {
            div.innerHTML = '<p style="text-align:center;color:var(--rp-text-secondary);font-size:12px;margin:10px 0;">Sin clientes' + (filtro ? ' que coincidan' : '') + '.</p>';
            return;
        }
        div.innerHTML = vis.map(function(c) {
            var idx = _feClientesCache.indexOf(c);
            // Mismo criterio que en _feClientesRender: el botón "Rellenar"
            // solo se habilita si el cliente tiene configurado el tipo de
            // documento que está abierto ahora mismo en Hacienda.
            var modos = _feModosDe(c);
            var puedeLlenar = !!modoActual && modos.indexOf(modoActual) !== -1;
            var tipoActual = modoActual ? (FE_TIPOS_DOC[modoActual] || { label: modoActual, color: "#22C55E" }) : null;
            var tituloDeshabilitado = !modoActual
                ? 'Abre esta acción desde una pantalla de Hacienda (Factura, CCF, FSE o Nota de Crédito)'
                : ('Este cliente no tiene habilitado ' + tipoActual.label);
            var btnFill = puedeLlenar
                ? '<button onclick="_feBusquedaRapidaLlenar(' + idx + ')" style="background:' + tipoActual.color + ';cursor:pointer;">Rellenar</button>'
                : '<button disabled title="' + tituloDeshabilitado + '" style="background:#cbd5e1;cursor:not-allowed;">Rellenar</button>';
            return '<div class="fe-bq-item">' +
                '<span title="' + (c.nom || '') + '">' + (c.nom || '(sin nombre)') + '</span>' +
                btnFill +
            '</div>';
        }).join('');
    }

    // AGREGADO NUEVO: reutiliza _feClientesLlenar EXACTAMENTE igual que el
    // botón "Rellenar" del apartado de Clientes (misma función, mismos
    // datos, mismo resultado sobre el formulario de Hacienda); lo único
    // que se agrega es cerrar este panel flotante después, tal como se
    // pidió ("Rellenar" → la barra flotante se oculta automáticamente).
    function _feBusquedaRapidaLlenar(idx) {
        _feClientesLlenar(idx);
        _feBusquedaRapidaCerrar();
    }

    // Atajo de teclado Ctrl+B: abre la búsqueda rápida flotante. Se
    // registra sobre "document" (no dentro del <webview>, que es contenido
    // ajeno de Hacienda) y se descarta de inmediato si la pantalla de
    // Facturación Electrónica no está activa, para no interferir con
    // ningún otro atajo del resto de la app.
    document.addEventListener('keydown', function(e) {
        if (!(e.ctrlKey || e.metaKey) || e.altKey || e.shiftKey) return;
        if ((e.key || "").toLowerCase() !== 'b') return;
        var screen = document.getElementById('facturacionElectronicaScreen');
        if (!screen || !screen.classList.contains('active')) return;
        if (!_facturacionElecActiva || !_facturacionElecActiva.empresaId) return; // sin empresa: nada que buscar
        e.preventDefault();
        var panel = document.getElementById('feBusquedaRapida');
        if (panel && panel.classList.contains('open')) {
            _feBusquedaRapidaCerrar();
        } else {
            _feBusquedaRapidaAbrir();
        }
    });