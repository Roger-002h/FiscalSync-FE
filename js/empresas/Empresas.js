// empresas/Empresas.js
// Proyecto FiscalSync FE — reescrito para el modelo de UNA SOLA EMPRESA.
// Ya no existen lista de empresas, pantalla intermedia "¿A dónde desea
// ingresar?" ni modo Gestión: solo hay una empresa (empresas[0]) y el
// programa entra siempre directo a Facturación Electrónica.



    // Corrección 09 — clave de almacenamiento FIJA, sin APP_VERSION.
    // Antes la empresa se guardaba bajo 'fs_v' + APP_VERSION + '_empresas'.
    // Eso aísla correctamente los datos fiscales versionados (debitoRecords,
    // comprasRecords, etc.), pero para la configuración de la empresa es un
    // bug: main.js tiene auto-actualización SILENCIOSA (autoDownload +
    // quitAndInstall sin confirmar), así que apenas se instala una versión
    // nueva con un APP_VERSION distinto, la empresa ya guardada queda
    // "huérfana" bajo la clave de la versión anterior — el archivo en disco
    // sigue teniendo los datos intactos, solo que bajo una llave que la
    // versión nueva ya no consulta. Por eso reaparecía el asistente de
    // configuración aunque la empresa nunca se había perdido de verdad.
    var EMPRESAS_STORE_KEY = 'fs_empresas';

    // AGREGADO NUEVO — Multiempresa. Dos claves fijas más en fsStore (sin
    // APP_VERSION, por el mismo motivo que EMPRESAS_STORE_KEY):
    //   - EMPRESA_ULTIMA_STORE_KEY: id de la última empresa con la que se
    //     entró a Facturación Electrónica (se abre esa al iniciar sesión).
    //   - EMPRESAS_LIMITE_STORE_KEY: límite de empresas fijado desde el
    //     panel Admin (Sistema). Vacío/inexistente = sin límite.
    var EMPRESA_ULTIMA_STORE_KEY  = 'fs_empresaUltima';
    var EMPRESAS_LIMITE_STORE_KEY = 'fs_empresasLimite';

    function _empresaLeerUltima() {
        try { return fsStore.getItem(EMPRESA_ULTIMA_STORE_KEY) || null; } catch (e) { return null; }
    }

    function _empresaGuardarUltima(id) {
        if (!id) return;
        fsStore.setItem(EMPRESA_ULTIMA_STORE_KEY, String(id));
        fsStore.flushNow();
    }

    // Devuelve el límite de empresas (número entero >= 1) o 0 si no hay límite.
    function _empresasLimiteLeer() {
        var n = parseInt(fsStore.getItem(EMPRESAS_LIMITE_STORE_KEY), 10);
        return (n > 0) ? n : 0;
    }

    function _empresasLimiteAlcanzado() {
        var lim = _empresasLimiteLeer();
        return lim > 0 && _normalizarEmpresasArray(empresas).length >= lim;
    }

    // Misma normalización que sanitizeFolderName() de main.js (reemplazo de
    // \ / : * ? " < > |, recorte y colapso de espacios) más minúsculas y sin
    // puntos/espacios finales, porque Windows no distingue mayúsculas y
    // main.js guarda los documentos en carpetas nombradas con la razón
    // social. Dos razones sociales con la misma clave compartirían carpeta.
    function _empresaClaveCarpeta(razon) {
        return (String(razon || '')
            .replace(/[\\/:*?"<>|]/g, '_')
            .trim()
            .replace(/\s+/g, ' ')
            .replace(/[. ]+$/, '') || 'Sin_Nombre').toLowerCase();
    }

    // "Agregar empresa" del panel de empresas de la barra superior de
    // Facturación Electrónica (#feEmpresaDropdown).
    function agregarEmpresaFE() {
        if (_empresasLimiteAlcanzado()) {
            showToast('Se alcanzó el límite de empresas (' + _empresasLimiteLeer() + '). El administrador puede cambiarlo en Sistema.', 'error');
            return;
        }
        openEmpresaModal(-1);
    }

    function _normalizarEmpresasArray(value) {
        if (Array.isArray(value)) return value;
        if (!value) return [];
        if (typeof value === 'object') {
            if (Array.isArray(value.empresas)) return value.empresas;
            if (value.id || value.razon || value.nit || value.nrc) return [value];
        }
        return [];
    }

    function saveEmpresas() {
        empresas = _normalizarEmpresasArray(empresas);
        fsStore.setItem(EMPRESAS_STORE_KEY, JSON.stringify(empresas));
        // Proyecto FiscalSync FE — la configuración de la empresa es poco
        // frecuente pero crítica: se fuerza a disco de inmediato (ver
        // fsStore.flushNow en utilidades.js) para que no se pierda si el
        // programa se cierra en los milisegundos siguientes.
        fsStore.flushNow();
    }

    function loadEmpresas() {
        // DIAGNÓSTICO TEMPORAL — quitar estas líneas una vez resuelto el bug.
        console.log('[FiscalSync FE][diagnóstico-empresas] loadEmpresas() llamado. Todas las claves en fsStore:', fsStore.getAllKeys());

        var raw = fsStore.getItem(EMPRESAS_STORE_KEY);
        console.log('[FiscalSync FE][diagnóstico-empresas] fsStore.getItem("' + EMPRESAS_STORE_KEY + '") =', raw);
        if (raw) {
            try {
                empresas = _normalizarEmpresasArray(JSON.parse(raw));
                console.log('[FiscalSync FE][diagnóstico-empresas] empresas cargadas directo de la clave fija:', empresas);
                return;
            } catch(e) {
                console.warn('[FiscalSync FE][diagnóstico-empresas] JSON inválido en la clave fija, se ignora y se intenta migrar:', e);
                empresas = [];
            }
        }

        // Migración de una sola vez: si no hay nada bajo la clave fija,
        // busca la clave versionada más antigua que sí tenga datos (de una
        // versión previa de la app, antes de esta corrección) y la adopta,
        // para no obligar a reconfigurar la empresa a quienes ya la tenían.
        empresas = [];
        try {
            var keys = fsStore.getAllKeys().filter(function(k) {
                return /^fs_v.+_empresas$/.test(k);
            });
            console.log('[FiscalSync FE][diagnóstico-empresas] clave fija vacía. Claves versionadas candidatas para migrar:', keys);
            for (var i = 0; i < keys.length; i++) {
                var oldRaw = fsStore.getItem(keys[i]);
                console.log('[FiscalSync FE][diagnóstico-empresas] contenido de "' + keys[i] + '":', oldRaw);
                if (!oldRaw) continue;
                try {
                    var parsed = JSON.parse(oldRaw);
                    var normalized = _normalizarEmpresasArray(parsed);
                    if (normalized.length) {
                        empresas = normalized;
                        break;
                    }
                } catch(e) { /* clave con formato inesperado, ignorar */ }
            }
            if (empresas.length) {
                console.log('[FiscalSync FE][diagnóstico-empresas] migración exitosa, empresas recuperadas:', empresas);
                // Persistir de inmediato bajo la clave fija para no repetir
                // esta búsqueda en cada arranque futuro.
                saveEmpresas();
            } else {
                console.warn('[FiscalSync FE][diagnóstico-empresas] no se encontró ninguna empresa, ni en la clave fija ni en claves versionadas viejas.');
            }
        } catch(e) { console.error('[FiscalSync FE][diagnóstico-empresas] error durante la migración:', e); }
    }

    // ══════════════════════════════════════════════════════════════════
    // Punto de entrada tras un login exitoso (llamado desde loginSubmit()
    // en Admin.js). Si todavía no se ha configurado la empresa, muestra
    // el modal de configuración inicial. Si ya existe,
    // entra directo a Facturación Electrónica — no hay nada más que
    // elegir en este proyecto.
    // ══════════════════════════════════════════════════════════════════
    function _iniciarFlujoPostLogin() {
        function decidir() {
            empresas = _normalizarEmpresasArray(empresas);
            console.log('[FiscalSync FE][diagnóstico-empresas] decidir() ejecutándose. empresas.length =', empresas.length, 'empresas =', empresas);
            if (!empresas.length) {
                console.warn('[FiscalSync FE][diagnóstico-empresas] decidir() => abriendo modal de CONFIGURAR EMPRESA.');
                // Sin empresa: se ve la barra de FE (sin webview) de fondo y se
                // abre directamente el modal, obligatorio (ver openEmpresaModal).
                _mostrarFacturacionElecSinEmpresa();
                openEmpresaModal(-1);
                return;
            }
            console.log('[FiscalSync FE][diagnóstico-empresas] decidir() => entrando a Facturación Electrónica.');
            // AGREGADO NUEVO — Multiempresa: se abre la última empresa
            // usada; si ya no existe (o nunca se guardó), la primera.
            var _ultimaId = _empresaLeerUltima();
            var _destino = empresas.find(function(e) { return e.id === _ultimaId; }) || empresas[0];
            _entrarModoFacturacionElectronica(_destino.id);
        }

        // Corrección 10 — YA NO se decide nunca "en frío". Antes, si
        // window._fiscalDataReady todavía no existía en el momento exacto
        // en que se llamaba a esta función (por ejemplo, un login que se
        // dispara muy rápido tras cargar la página, antes de que el script
        // final de index.html llegue a crear esa promesa), el código caía
        // al `else` y decidía usando `empresas` con su valor inicial vacío
        // (ver `let empresas = []` en estado.js) — mostrando el asistente
        // de "Configurar Empresa" aunque el disco sí tuviera la empresa
        // guardada, porque loadEmpresas() todavía no había corrido.
        //
        // Ahora, si la promesa no existe todavía, se reintenta en el
        // siguiente ciclo en vez de decidir con datos a medias. Como
        // window._fiscalDataReady se crea siempre (Electron o no) apenas
        // termina de cargar el HTML, este reintento dura como máximo un par
        // de ciclos — nunca se queda esperando indefinidamente.
        function esperarDatosYDecidir() {
            if (window._fiscalDataReady && typeof window._fiscalDataReady.then === 'function') {
                window._fiscalDataReady.then(decidir);
            } else {
                setTimeout(esperarDatosYDecidir, 20);
            }
        }
        esperarDatosYDecidir();
    }

    // ══════════════════════════════════════════════
    // CRUD EMPRESA (MODAL) — una sola empresa, sin lista
    // ══════════════════════════════════════════════
    function openEmpresaModal(index) {
        if (index === undefined) index = -1;
        document.getElementById('emp_editIndex').value = index;
        document.getElementById('emp_razon').value = '';
        document.getElementById('emp_nit').value = '';
        document.getElementById('emp_nrc').value = '';
        document.getElementById('emp_correos_activo').value = '0';
        document.getElementById('emp_correo_email').value = '';
        document.getElementById('emp_correo_pass').value = '';
        _setEmpCorreosToggle(false);
        document.getElementById('emp_fe_usuario').value = '';
        document.getElementById('emp_fe_clave_acceso').value = '';
        document.getElementById('emp_fe_clave_privada').value = '';
        // AGREGADO NUEVO — Reactivación de "Tipo de Ingreso — Ventas"
        // (ver módulo de Reportes DTE, FEReportes.js): por defecto '1'
        // (Profesiones, Artes y Oficios), igual que hacía el campo antes
        // de removerse junto con Libros IVA.
        var _empTipoIngSel = document.getElementById('emp_tipo_ing');
        if (_empTipoIngSel) _empTipoIngSel.value = '1';
        clearFieldError('emp_nit', 'emp_nit_error');
        clearFieldError('emp_nrc', 'emp_nrc_error');

        if (index !== -1) {
            var emp = empresas[index];
            document.getElementById('empresaModalTitle').innerText = 'Editar Empresa';
            document.getElementById('emp_razon').value = emp.razon;
            document.getElementById('emp_nit').value = emp.nit;
            document.getElementById('emp_nrc').value = emp.nrc;
            if (emp.correosActivo) {
                document.getElementById('emp_correos_activo').value = '1';
                document.getElementById('emp_correo_email').value = emp.correosEmail || '';
                _setEmpCorreosToggle(true);
            }
            document.getElementById('emp_fe_usuario').value = emp.feUsuario || '';
            // AGREGADO NUEVO — Tipo de Ingreso — Ventas (ver arriba).
            var _empTipoIngSelEdit = document.getElementById('emp_tipo_ing');
            if (_empTipoIngSelEdit) _empTipoIngSelEdit.value = emp.tipoIng || '1';
            // Implementación 01 — las claves nunca se muestran en claro al
            // reabrir el formulario: el campo queda vacío y solo se
            // sobrescribe el valor guardado si el usuario escribe uno nuevo
            // (ver saveEmpresa). Igual que ya hace correosPass arriba.
            document.getElementById('emp_fe_clave_acceso').value = '';
            document.getElementById('emp_fe_clave_privada').value = '';
        } else {
            // AGREGADO NUEVO — Multiempresa: con empresas ya creadas, el alta
            // es "Agregar Empresa"; "Configurar Empresa" solo si no hay ninguna.
            document.getElementById('empresaModalTitle').innerText = _normalizarEmpresasArray(empresas).length ? 'Agregar Empresa' : 'Configurar Empresa';
        }
        var _empBtnEliminar = document.getElementById('emp_btn_eliminar');
        if (_empBtnEliminar) _empBtnEliminar.style.display = (index !== -1) ? '' : 'none';
        // Sin ninguna empresa configurada: el modal es OBLIGATORIO, sin "X"
        // ni "Cancelar", y con overlay + blur. Al editar una empresa existente
        // se cierra normalmente. (Este modal no tiene manejadores de Esc ni de
        // clic fuera; solo se cierra con estos dos botones o al guardar.)
        // AGREGADO NUEVO — Multiempresa: el modo obligatorio ya no depende de
        // index === -1 sino de que NO exista ninguna empresa; agregar otra
        // empresa sí se puede cancelar.
        var _empAlta = (_normalizarEmpresasArray(empresas).length === 0);
        var _empBtnX = document.getElementById('emp_btn_cerrar_x');
        var _empBtnCancelar = document.getElementById('emp_btn_cancelar');
        if (_empBtnX) _empBtnX.style.display = _empAlta ? 'none' : '';
        if (_empBtnCancelar) _empBtnCancelar.style.display = _empAlta ? 'none' : '';
        document.getElementById('empresaModalForm').classList.toggle('empresa-modal-inicial', _empAlta);
        document.getElementById('empresaModalForm').style.display='flex'; document.getElementById('empresaModalForm').classList.add('modal-open');
        lucide.createIcons();
    }

    function toggleEmpCorreosFields() {
        var activo = document.getElementById('emp_correos_activo').value === '1';
        activo = !activo;
        document.getElementById('emp_correos_activo').value = activo ? '1' : '0';
        _setEmpCorreosToggle(activo);
    }
    function _setEmpCorreosToggle(on) {
        var tog   = document.getElementById('emp_correos_toggle');
        var thumb = document.getElementById('emp_correos_thumb');
        var creds = document.getElementById('empCorreosCreds');
        if (on) {
            tog.style.background   = '#4f46e5';
            thumb.style.left       = '20px';
            thumb.style.background = '#fff';
            creds.style.display    = 'block';
        } else {
            tog.style.background   = 'var(--rp-border-strong)';
            thumb.style.left       = '2px';
            thumb.style.background = 'var(--rp-text-secondary)';
            creds.style.display    = 'none';
        }
    }

    function closeEmpresaModal() {
        _cerrarModalAnimado('empresaModalForm');
    }

    function saveEmpresa() {
        empresas = _normalizarEmpresasArray(empresas);
        var index = parseInt(document.getElementById('emp_editIndex').value);
        var razon = document.getElementById('emp_razon').value.trim();
        var nit   = document.getElementById('emp_nit').value.trim();
        var nrc   = document.getElementById('emp_nrc').value.trim();
        var correosActivo = document.getElementById('emp_correos_activo').value === '1';
        var correosEmail  = document.getElementById('emp_correo_email').value.trim();
        var correosPass   = document.getElementById('emp_correo_pass').value;
        var feUsuario       = document.getElementById('emp_fe_usuario').value.trim();
        var feClaveAcceso   = document.getElementById('emp_fe_clave_acceso').value;
        var feClavePrivada  = document.getElementById('emp_fe_clave_privada').value;
        // AGREGADO NUEVO — Tipo de Ingreso — Ventas (usado por el módulo de
        // Reportes DTE, columna "tipoIng" del Anexo 1/Anexo 2).
        var _empTipoIngSelInput = document.getElementById('emp_tipo_ing');
        var tipoIng = _empTipoIngSelInput ? (_empTipoIngSelInput.value || '1') : '1';

        if (!razon) { showToast('La Razón Social es obligatoria', 'error'); return; }

        // AGREGADO NUEVO — Multiempresa: no se permiten razones sociales
        // duplicadas (los documentos se guardan en carpetas por nombre y
        // eliminar una empresa borraría las carpetas de la otra).
        var _claveRazon = _empresaClaveCarpeta(razon);
        var _razonDuplicada = empresas.some(function(e, i) {
            return i !== index && _empresaClaveCarpeta(e.razon) === _claveRazon;
        });
        if (_razonDuplicada) { showToast('Ya existe otra empresa con esa Razón Social', 'error'); return; }

        // AGREGADO NUEVO — Multiempresa: límite fijado desde el panel Admin.
        if (index === -1 && _empresasLimiteAlcanzado()) {
            showToast('Se alcanzó el límite de empresas (' + _empresasLimiteLeer() + ')', 'error');
            return;
        }

        var valid = true;

        if (nit && !isValidDuiOrNit(nit)) {
            setFieldError('emp_nit', 'emp_nit_error');
            valid = false;
        } else {
            clearFieldError('emp_nit', 'emp_nit_error');
        }

        if (nrc && !isValidNrc(nrc)) {
            setFieldError('emp_nrc', 'emp_nrc_error');
            valid = false;
        } else {
            clearFieldError('emp_nrc', 'emp_nrc_error');
        }

        if (correosActivo && !correosEmail) { showToast('Ingresa el correo de envío para activar el módulo', 'error'); return; }
        if (correosActivo && !correosPass && index === -1) { showToast('Ingresa la contraseña de aplicación', 'error'); return; }

        // Proyecto FiscalSync FE — Facturación Electrónica ya no es
        // opcional: los tres datos son siempre obligatorios (antes solo lo
        // eran si el interruptor "Habilitar Facturación Electrónica"
        // estaba activo). Las claves solo se exigen al configurar la
        // empresa por primera vez; al editar, dejarlas en blanco conserva
        // la clave ya guardada (mismo patrón que Correos DTE).
        if (!feUsuario) { showToast('Ingresa el NIT/DUI de Facturación Electrónica', 'error'); return; }
        if (!feClaveAcceso && index === -1) { showToast('Ingresa la Clave de Acceso de Facturación Electrónica', 'error'); return; }
        if (!feClavePrivada && index === -1) { showToast('Ingresa la Clave Privada de Facturación Electrónica', 'error'); return; }

        if (!valid) { showToast('Corrige los campos con formato incorrecto', 'error'); return; }

        var esNueva = (index === -1);
        var id;

        if (esNueva) {
            id = 'emp_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6);
            empresas.push({
                id: id, razon: razon, nit: nit, nrc: nrc,
                tipoIng: tipoIng,
                correosActivo: correosActivo,
                correosEmail: correosActivo ? correosEmail : '',
                correosPass:  correosActivo && correosPass ? _correosSimpleCipher(correosPass) : '',
                // Implementación 01 — credenciales de Facturación Electrónica.
                feUsuario:      feUsuario,
                feClaveAcceso:  feClaveAcceso  ? _correosSimpleCipher(feClaveAcceso)  : '',
                feClavePrivada: feClavePrivada ? _correosSimpleCipher(feClavePrivada) : ''
            });
        } else {
            id = empresas[index].id;
            empresas[index].razon   = razon;
            empresas[index].nit     = nit;
            empresas[index].nrc     = nrc;
            empresas[index].tipoIng = tipoIng;
            empresas[index].correosActivo = correosActivo;
            if (correosActivo) {
                empresas[index].correosEmail = correosEmail;
                if (correosPass) empresas[index].correosPass = _correosSimpleCipher(correosPass);
            }
            empresas[index].feUsuario = feUsuario;
            if (feClaveAcceso)  empresas[index].feClaveAcceso  = _correosSimpleCipher(feClaveAcceso);
            if (feClavePrivada) empresas[index].feClavePrivada = _correosSimpleCipher(feClavePrivada);
        }

        saveEmpresas();

        // AGREGADO NUEVO — Multiempresa: si se editó la empresa activa,
        // refresca su nombre y el selector de la barra superior.
        if (!esNueva && _facturacionElecActiva && _facturacionElecActiva.empresaId) {
            _feActualizarEmpresaActivaUI(_facturacionElecActiva.empresaId);
        }

        // Empresa nueva (la primera o una adicional): entrar a Facturación
        // Electrónica ANTES de cerrar el modal (no después). Si se hace al
        // revés, la animación de cierre de _cerrarModalAnimado() (fade +
        // display:none con retraso) puede competir con el cambio de
        // pantalla y dejar todo "congelado" a medio camino. Al ir primero,
        // la pantalla de fondo ya cambió cuando el modal empieza a
        // desvanecerse, así que solo se ve una transición.
        //
        // Se envuelve en try/catch únicamente para que, si algo dentro de
        // _entrarModoFacturacionElectronica() falla (por ejemplo, por un
        // elemento del DOM que no coincide), quede un error claro en la
        // consola (F12 → Console) en vez de fallar en silencio y dejar la
        // pantalla "igual" sin ninguna pista de qué pasó.
        if (esNueva) {
            try {
                _entrarModoFacturacionElectronica(id);
            } catch (e) {
                console.error('Error entrando a Facturación Electrónica tras crear la empresa:', e);
                showToast('Empresa guardada, pero hubo un error al abrir Facturación Electrónica. Revisa la consola (F12).', 'error');
            }
        }

        closeEmpresaModal();
        showToast(esNueva ? 'Empresa configurada' : 'Empresa actualizada', 'success');
    }

    // Eliminar la empresa y TODOS sus datos (registro, credenciales,
    // configuración, correos, clientes de FE, carpetas de documentos y
    // sesión del portal). Al quedar sin empresa, vuelve a "Configurar Empresa".
    function deleteEmpresa() {
        empresas = _normalizarEmpresasArray(empresas);
        var index = parseInt(document.getElementById('emp_editIndex').value);
        if (isNaN(index) || index < 0 || !empresas[index]) return;
        var idEliminar = empresas[index].id;
        var nombre = empresas[index].razon;

        fsConfirm(
            '¿Eliminar empresa y TODOS sus datos?\nSe eliminará "' + nombre + '" junto con sus credenciales, clientes y configuración de Facturación Electrónica, historial de correos y todos los documentos (JSON, PDF y reportes) guardados en las carpetas de FiscalSync. Esta acción no se puede deshacer.',
            function() {
                // 0) AGREGADO NUEVO — Multiempresa: los documentos capturados
                //    para Reportes DTE (FEReportes.js) se purgan ANTES de
                //    quitar la empresa de la lista (ver ahí por qué).
                if (typeof _feReportesEliminarDocsEmpresa === 'function') _feReportesEliminarDocsEmpresa(idEliminar);

                // 1) Registro de la empresa
                empresas = _normalizarEmpresasArray(empresas).filter(function(e) {
                    return e.id !== idEliminar;
                });
                saveEmpresas();

                // 2) Claves de fsStore ligadas a esta empresa (configuración de FE,
                //    correos, etc.). El id es único, por eso basta con buscarlo en la clave.
                try {
                    fsStore.getAllKeys().forEach(function(k) {
                        if (k !== EMPRESAS_STORE_KEY && k.indexOf(idEliminar) !== -1) {
                            fsStore.removeItem(k);
                        }
                    });
                    fsStore.flushNow();
                } catch (e) { console.warn('No se pudieron limpiar claves de la empresa:', e); }

                closeEmpresaModal();

                // 3) Al terminar el cierre animado del modal (150 ms) se suelta el
                //    foco del webview, se destruye, se vuelve a mostrar la barra de
                //    Facturación Electrónica SIN webview y se reabre el modal de
                //    configuración (obligatorio). Luego se borra lo que vive en disco.
                setTimeout(function() {
                    try {
                        var _wvAct = _facturacionElecActiva && _facturacionElecActiva.webview;
                        if (_wvAct && _wvAct.blur) _wvAct.blur();
                        if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
                    } catch (e) {}
                    // AGREGADO NUEVO — Multiempresa: si quedan empresas, se abre
                    // la primera; solo si no queda ninguna se reabre el modal
                    // obligatorio. Si la eliminada no era la activa, no se toca
                    // el webview en uso.
                    var _eraActiva = !_facturacionElecActiva.empresaId || _facturacionElecActiva.empresaId === idEliminar;
                    if (_eraActiva) {
                        _destruirWebviewFacturacion();
                        if (empresas.length) {
                            _entrarModoFacturacionElectronica(empresas[0].id);
                        } else {
                            _mostrarFacturacionElecSinEmpresa();
                            openEmpresaModal(-1);
                        }
                    } else {
                        _feActualizarEmpresaActivaUI(_facturacionElecActiva.empresaId);
                    }
                    if (window.fiscalAPI && window.fiscalAPI.eliminarDatosEmpresaFE) {
                        window.fiscalAPI.eliminarDatosEmpresaFE(idEliminar, nombre).then(function(res) {
                            if (res && res.ok) {
                                showToast('Empresa eliminada con todos sus datos', 'success');
                            } else {
                                console.warn('Eliminación parcial de datos de la empresa:', res && res.errores);
                                showToast('Empresa eliminada, pero algunos datos no se pudieron borrar. Revisa la consola (F12).', 'error');
                            }
                        }).catch(function(e) {
                            console.warn('Error eliminando datos de la empresa:', e);
                            showToast('Empresa eliminada, pero no se pudieron borrar sus datos en disco.', 'error');
                        });
                    } else {
                        showToast('Empresa eliminada', 'success');
                    }
                }, 200);
            }
        );
    }
