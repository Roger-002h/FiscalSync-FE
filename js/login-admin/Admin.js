// login-admin/Admin.js
// Extraído automáticamente de index.html (FiscalSync) — Fase 2.
// No se modificó ninguna línea de lógica: es exactamente el código original,
// solo reordenado por módulo.



    /*
    ═══════════════════════════════════════════════════════════════════════════
    GUÍA DE INTEGRACIÓN EN ELECTRON main.js
    Agrega esto en tu main.js para que el envío funcione vía IPC:

    const { ipcMain } = require('electron');
    const nodemailer   = require('nodemailer');

    ipcMain.handle('send-email', async (event, { mailOptions, smtpConfig }) => {
        try {
            const transporter = nodemailer.createTransport(smtpConfig);
            const sendOpts = { ...mailOptions };
            // Filtrar adjuntos inexistentes
            if (Array.isArray(sendOpts.attachments)) {
                const fs = require('fs');
                sendOpts.attachments = sendOpts.attachments.filter(a => a && a.path && fs.existsSync(a.path));
            }
            const info = await transporter.sendMail(sendOpts);
            return { ok: true, messageId: info.messageId };
        } catch (err) {
            return { error: err.message };
        }
    });

    // OPCIONAL: Seleccionar carpeta y devolver rutas absolutas de todos los JSON (recursivo)
    const { dialog } = require('electron');
    const path = require('path');
    const fs   = require('fs');

    function getAllJsonsInDir(dir, results = []) {
        const entries = fs.readdirSync(dir, { withFileTypes: true });
        for (const entry of entries) {
            const full = path.join(dir, entry.name);
            if (entry.isDirectory()) getAllJsonsInDir(full, results);
            else if (entry.name.toLowerCase().endsWith('.json')) results.push(full);
        }
        return results;
    }

    ipcMain.handle('select-folder-jsons', async () => {
        const { canceled, filePaths } = await dialog.showOpenDialog({ properties: ['openDirectory'] });
        if (canceled || !filePaths[0]) return { files: [] };
        return { files: getAllJsonsInDir(filePaths[0]) };
    });

    // Y en preload.js exponer via contextBridge:
    contextBridge.exposeInMainWorld('electronAPI', {
        sendEmail:         (data) => ipcRenderer.invoke('send-email', data),
        selectFolderJsons: ()     => ipcRenderer.invoke('select-folder-jsons'),
        selectFolder:      ()     => ipcRenderer.invoke('select-folder'),
        readFolder:        (path) => ipcRenderer.invoke('read-folder', path),
    });

    // NOTA: Los handlers 'select-folder' y 'read-folder' ya están definidos en main.js.
    // Solo necesitas agregar 'send-email' y 'select-folder-jsons' + exponer todo en preload.js.
    ═══════════════════════════════════════════════════════════════════════════
    */

    // FIN MÓDULO CORREOS DTE
    // ══════════════════════════════════════════════════════════════════

    // Proyecto FiscalSync FE — se quitó borrarTodosLosDatos(): borraba los
    // registros mensuales de Libros IVA (debitoRecords, cfRecords, etc.),
    // que no forman parte de este proyecto.

    // ══════════════════════════════════════════════
    // INIT
    // ══════════════════════════════════════════════

    // ══════════════════════════════════════════════
    // AGREGADO NUEVO: SISTEMA DE LOGIN + GESTIÓN DE USUARIOS
    // ══════════════════════════════════════════════

    // Credenciales base (admin siempre existe, no se puede eliminar)
    var FS_ADMIN_USER = 'admin';
    var FS_ADMIN_PASS_DEFAULT = 'Fiscal0215'; // Cambio 02: clave admin actualizada (antes 'fiscal2024')

    function loadFsUsers() {
        var raw = fsStore.getItem('fs_v' + APP_VERSION + '_users');
        var users;
        if (raw) {
            try { users = JSON.parse(raw); } catch(e) { users = null; }
        }
        // Si no hay datos válidos, retornar lista por defecto
        if (!users || !Array.isArray(users) || users.length === 0) {
            return [
                { user: 'admin', pass: 'Fiscal0215', isAdmin: true }, // Cambio 02: clave admin actualizada (antes 'fiscal2024')
                { user: 'roger', pass: '2025', isAdmin: false },
                { user: 'user',  pass: 'User2026', isAdmin: false } // Cambio 03: clave de 'user' actualizada (antes 'FiscalSync')
            ];
        }
        // Garantizar que admin SIEMPRE exista en la lista cargada
        var adminExists = users.some(function(u) { return u.user === FS_ADMIN_USER; });
        var needsPersist = false;
        if (!adminExists) {
            users.unshift({ user: FS_ADMIN_USER, pass: FS_ADMIN_PASS_DEFAULT, isAdmin: true });
            needsPersist = true;
        }
        // AGREGADO NUEVO (Cambio 02): migración de la clave de admin para
        // instalaciones ya existentes. Los datos de usuarios se guardan en
        // disco (fsStore) desde la primera vez que se usó la app, así que el
        // valor por defecto de arriba (FS_ADMIN_PASS_DEFAULT) NO alcanza a las
        // instalaciones que ya tenían guardada la clave anterior 'fiscal2024'.
        // Aquí se detecta ese caso puntual y se actualiza la clave del admin a
        // 'Fiscal0215', dejando intacto el resto de usuarios y su lógica.
        users.forEach(function(u) {
            if (u.user === FS_ADMIN_USER && u.pass === 'fiscal2024') {
                u.pass = FS_ADMIN_PASS_DEFAULT;
                needsPersist = true;
            }
        });
        // AGREGADO NUEVO (Cambio 03): igual que con admin arriba, garantizamos
        // que el usuario 'user' SIEMPRE exista en instalaciones ya existentes
        // (las que ya tenían su lista de usuarios guardada en disco antes de
        // este cambio), y migramos su clave anterior 'FiscalSync' a 'User2026'.
        var userExists = users.some(function(u) { return u.user === 'user'; });
        if (!userExists) {
            users.push({ user: 'user', pass: 'User2026', isAdmin: false });
            needsPersist = true;
        }
        users.forEach(function(u) {
            if (u.user === 'user' && u.pass === 'FiscalSync') {
                u.pass = 'User2026';
                needsPersist = true;
            }
        });
        if (needsPersist) {
            try { fsStore.setItem('fs_v' + APP_VERSION + '_users', JSON.stringify(users)); } catch(e) {}
        }
        return users;
    }

    function saveFsUsers(list) {
        fsStore.setItem('fs_v' + APP_VERSION + '_users', JSON.stringify(list));
    }

    function getAdminPass() {
        var users = loadFsUsers();
        var adm = users.find(function(u) { return u.user === FS_ADMIN_USER; });
        return adm ? adm.pass : FS_ADMIN_PASS_DEFAULT;
    }

    function loginSubmit() {
        var userVal = document.getElementById('loginUser').value.trim();
        var passVal = document.getElementById('loginPass').value;
        var errMsg  = document.getElementById('loginErrorMsg');
        var btn     = document.getElementById('loginBtn');

        document.getElementById('loginUser').classList.remove('login-error');
        document.getElementById('loginPass').classList.remove('login-error');
        errMsg.innerText = '';

        if (!userVal) {
            document.getElementById('loginUser').classList.add('login-error');
            errMsg.innerText = 'El usuario es obligatorio.';
            triggerLoginShake();
            return;
        }
        if (!passVal) {
            document.getElementById('loginPass').classList.add('login-error');
            errMsg.innerText = 'La contraseña es obligatoria.';
            triggerLoginShake();
            return;
        }

        btn.disabled = true;
        btn.innerText = 'Verificando…';

        setTimeout(function() {
            var users = loadFsUsers();
            var found = users.find(function(u) {
                return u.user === userVal && u.pass === passVal;
            });

            if (found) {
                // Verificar vencimiento si es usuario de prueba
                if (found.tipo === 'prueba' && found.vencimiento) {
                    var hoy = new Date();
                    hoy.setHours(0,0,0,0);
                    var venc = new Date(found.vencimiento);
                    venc.setHours(0,0,0,0);
                    if (hoy > venc) {
                        document.getElementById('loginUser').classList.add('login-error');
                        document.getElementById('loginPass').classList.add('login-error');
                        var vencStr = venc.toLocaleDateString('es-SV', { day:'2-digit', month:'2-digit', year:'numeric' });
                        errMsg.innerText = 'Tu acceso de prueba venció el ' + vencStr + '. Contacta al administrador.';
                        btn.disabled = false;
                        btn.innerText = 'Ingresar al Sistema';
                        triggerLoginShake();
                        return;
                    }
                }
                document.getElementById('loginScreen').style.opacity = '0';
                document.getElementById('loginScreen').style.transition = 'opacity 0.4s ease';
                setTimeout(function() {
                    document.getElementById('loginScreen').classList.add('hidden');
                }, 400);
                showToast('Bienvenido, ' + userVal, 'success');
                // Proyecto FiscalSync FE — de un flujo multiempresa a una
                // sola empresa: en vez de dejar que empresaScreen (ya
                // marcada "active" por defecto en el HTML) quede visible
                // detrás del login sin más, se decide explícitamente qué
                // mostrar: si la empresa ya está configurada, se entra
                // directo a Facturación Electrónica; si no, se ve la
                // pantalla de configuración inicial (ver
                // _iniciarFlujoPostLogin en Empresas.js).
                _iniciarFlujoPostLogin();
            } else {
                document.getElementById('loginUser').classList.add('login-error');
                document.getElementById('loginPass').classList.add('login-error');
                errMsg.innerText = 'Usuario o contraseña incorrectos.';
                btn.disabled = false;
                btn.innerText = 'Ingresar al Sistema';
                triggerLoginShake();
            }
        }, 350);
    }

    function triggerLoginShake() {
        var card = document.getElementById('loginCard');
        card.classList.remove('login-shake');
        void card.offsetWidth;
        card.classList.add('login-shake');
        setTimeout(function() { card.classList.remove('login-shake'); }, 500);
    }

    // ══════════════════════════════════════════════════════════════════
    // Proyecto FiscalSync FE — CERRAR SESIÓN
    // El programa original nunca tuvo un botón de logout (una vez dentro
    // solo se cerraba la ventana). Se agrega aquí porque, con Facturación
    // Electrónica como única pantalla de trabajo, es la forma natural de
    // volver al login. NO destruye el <webview> de Hacienda — solo lo
    // oculta (ver _ocultarFacturacionElec en FacturacionElectronica.js) —
    // para que la sesión del portal siga viva al volver a entrar.
    // ══════════════════════════════════════════════════════════════════
    function logout() {
        if (typeof _ocultarFacturacionElec === 'function') {
            _ocultarFacturacionElec('loginScreen');
        } else {
            var fe = document.getElementById('facturacionElectronicaScreen');
            if (fe) { fe.classList.remove('active'); fe.style.left = '-10000px'; }
            var login = document.getElementById('loginScreen');
            if (login) login.classList.remove('hidden');
        }
        var login = document.getElementById('loginScreen');
        if (login) {
            login.style.opacity = '0';
            login.style.transition = 'none';
            requestAnimationFrame(function() {
                login.style.transition = 'opacity 0.3s ease';
                login.style.opacity = '1';
            });
        }
        document.getElementById('loginUser').value = '';
        document.getElementById('loginPass').value = '';
        var btn = document.getElementById('loginBtn');
        if (btn) { btn.disabled = false; btn.innerText = 'Ingresar al Sistema'; }
    }

    // ── AGREGADO NUEVO — Multiempresa: límite de empresas (Sistema) ──
    // Se guarda en fsStore bajo EMPRESAS_LIMITE_STORE_KEY (ver Empresas.js).
    // Vacío = sin límite. Bajar el límite por debajo de las empresas ya
    // registradas no elimina ninguna: solo impide agregar más.
    function loadEmpresasLimiteUI() {
        var inp = document.getElementById('adminEmpresasLimite');
        if (!inp) return;
        var lim = _empresasLimiteLeer();
        inp.value = lim > 0 ? String(lim) : '';
    }

    function guardarEmpresasLimite() {
        var inp = document.getElementById('adminEmpresasLimite');
        if (!inp) return;
        var txt = inp.value.trim();
        if (txt === '') {
            fsStore.removeItem(EMPRESAS_LIMITE_STORE_KEY);
            fsStore.flushNow();
            showToast('Sin límite de empresas', 'success');
            return;
        }
        var n = parseInt(txt, 10);
        if (isNaN(n) || n < 1 || String(n) !== txt) {
            showToast('Ingresa un número entero mayor o igual a 1, o déjalo vacío para no limitar', 'error');
            return;
        }
        fsStore.setItem(EMPRESAS_LIMITE_STORE_KEY, String(n));
        fsStore.flushNow();
        showToast('Límite de empresas guardado: ' + n, 'success');
    }

    // ── Helpers de formulario de vencimiento ──
    // Activa visualmente el selector de tipo de acceso (pill/tab style)
    function _tipoAccesoSetActive(tipo) {
        var lblPerm   = document.getElementById('tipoAccesoPermanenteLabel');
        var lblPrueba = document.getElementById('tipoAccesoPruebaLabel');
        if (!lblPerm || !lblPrueba) return;
        function _on(lbl)  { lbl.style.background = 'var(--rp-border)'; lbl.style.borderColor = 'var(--rp-text-secondary)'; lbl.querySelector('span').style.color = 'var(--rp-text-primary)'; }
        function _off(lbl) { lbl.style.background = 'transparent'; lbl.style.borderColor = 'transparent'; lbl.querySelector('span').style.color = 'var(--rp-text-secondary)'; }
        if (tipo === 'prueba') { _on(lblPrueba); _off(lblPerm); }
        else                   { _on(lblPerm);   _off(lblPrueba); }
    }

    function onUserTipoChange() {
        var tipoPrueba = document.getElementById('newUserTipoPrueba');
        var vencWrap = document.getElementById('vencimientoWrap');
        if (!tipoPrueba || !vencWrap) return;
        if (tipoPrueba.checked) {
            vencWrap.style.display = 'block';
            _tipoAccesoSetActive('prueba');
        } else {
            vencWrap.style.display = 'none';
            _tipoAccesoSetActive('permanente');
        }
    }

    // ── Admin Panel ──
    function openAdminPanel() {
        var modal = document.getElementById('adminUsersModal');
        modal.style.display = 'flex';
        modal.classList.remove('hidden');
        // Resetear siempre el tamaño del box al estado inicial (pantalla de contraseña)
        var box = document.getElementById('adminModalBox');
        if (box) { box.style.maxWidth = '500px'; box.style.height = ''; box.style.maxHeight = '90vh'; }
        document.getElementById('adminAuthStep').style.display = 'block';
        document.getElementById('adminUsersStep').style.display = 'none';
        // Proyecto FiscalSync FE — se quitaron los pasos "Parámetros"
        // (adminParametrosStep) y "Escaneo QR" (adminEscaneoQRStep): esos
        // elementos ya no existen en el HTML, así que referenciarlos aquí
        // rompía la apertura completa del panel.
        document.getElementById('adminSistemaStep').style.display = 'none';
        document.getElementById('adminTabNav').style.display = 'none';
        document.getElementById('adminAuthPass').value = '';
        document.getElementById('adminAuthError').innerText = '';
        setTimeout(function() { document.getElementById('adminAuthPass').focus(); }, 100);
    }

    function closeAdminPanel() {
        var modal = document.getElementById('adminUsersModal');
        modal.style.display = 'none';
        modal.classList.add('hidden');
        document.getElementById('addUserForm').style.display = 'none';
        document.getElementById('addUserError').innerText = '';
    }

    function verifyAdmin() {
        var passInput = document.getElementById('adminAuthPass');
        var errEl = document.getElementById('adminAuthError');
        var entered = passInput.value.trim();
        errEl.innerText = '';

        if (!entered) { errEl.innerText = 'Ingresa la contraseña.'; return; }

        if (entered === getAdminPass()) {
            document.getElementById('adminAuthStep').style.display = 'none';
            // Mostrar tabs
            var tabNav = document.getElementById('adminTabNav');
            tabNav.style.display = 'flex';
            switchAdminTab('usuarios');
        } else {
            errEl.innerText = 'Contraseña incorrecta.';
            passInput.classList.add('login-error');
            setTimeout(function() { passInput.classList.remove('login-error'); }, 1500);
        }
    }

    // ── Cambio 6: switch entre tabs del panel admin ──
    // Proyecto FiscalSync FE — de 4 pestañas (usuarios/parámetros/sistema/
    // escaneoqr) a solo 2: "Parámetros" (catálogos de Libros IVA) y
    // "Escaneo QR" no forman parte de este proyecto.
    function switchAdminTab(tab) {
        var usersStep     = document.getElementById('adminUsersStep');
        var sistemaStep   = document.getElementById('adminSistemaStep');
        var btnU = document.getElementById('adminTabBtnUsuarios');
        var btnS = document.getElementById('adminTabBtnSistema');
        var title = document.getElementById('adminModalTitle');
        var box = document.getElementById('adminModalBox');

        [btnU, btnS].forEach(function(b) { if (b) { b.style.background = 'transparent'; b.style.color = 'var(--rp-text-secondary)'; } });
        [usersStep, sistemaStep].forEach(function(s) { if (s) s.style.display = 'none'; });

        if (tab === 'sistema') {
            sistemaStep.style.display = 'flex';
            btnS.style.background = 'var(--rp-border)'; btnS.style.color = 'var(--rp-text-primary)';
            if (title) title.innerText = 'Sistema';
            if (box) { box.style.maxWidth = '500px'; box.style.height = ''; box.style.maxHeight = '90vh'; }
            loadExportConfigUI(); // AGREGADO NUEVO (Cambio 03)
            loadEmpresasLimiteUI(); // AGREGADO NUEVO — Multiempresa
        } else {
            usersStep.style.display = 'flex';
            btnU.style.background = 'var(--rp-border)'; btnU.style.color = 'var(--rp-text-primary)';
            if (title) title.innerText = 'Gestión de Usuarios';
            if (box) { box.style.maxWidth = '500px'; box.style.height = ''; }
            renderAdminUserList();
        }
    }

    function renderAdminUserList() {
        var users = loadFsUsers();
        var container = document.getElementById('adminUserList');
        var countEl = document.getElementById('adminUserCount');
        countEl.innerText = users.length + (users.length === 1 ? ' usuario' : ' usuarios');
        container.innerHTML = '';

        users.forEach(function(u) {
            var row = document.createElement('div');
            row.style.cssText = 'display:flex;align-items:center;justify-content:space-between;padding:10px 0;border-bottom:1px solid var(--rp-border);';

            // Determinar badge de tipo y estado de vencimiento
            var badgeHtml = '';
            if (u.isAdmin) {
                badgeHtml = ' <span style="font-size:9px;color:var(--rp-accent);font-weight:700;letter-spacing:0.05em;text-transform:uppercase;padding:1px 6px;background:rgba(59,130,246,0.1);border-radius:4px;">admin</span>';
            } else if (u.tipo === 'prueba' && u.vencimiento) {
                var hoy = new Date(); hoy.setHours(0,0,0,0);
                var venc = new Date(u.vencimiento); venc.setHours(0,0,0,0);
                var diasRestantes = Math.ceil((venc - hoy) / (1000 * 60 * 60 * 24));
                var vencStr = venc.toLocaleDateString('es-SV', { day:'2-digit', month:'2-digit', year:'numeric' });
                if (hoy > venc) {
                    badgeHtml = ' <span style="font-size:9px;color:var(--rp-error);font-weight:700;letter-spacing:0.05em;text-transform:uppercase;padding:1px 6px;background:rgba(248,113,113,0.08);border:1px solid rgba(248,113,113,0.18);border-radius:4px;">Vencido · ' + vencStr + '</span>';
                } else if (diasRestantes <= 5) {
                    badgeHtml = ' <span style="font-size:9px;color:var(--rp-warning);font-weight:700;letter-spacing:0.05em;text-transform:uppercase;padding:1px 6px;background:rgba(245,158,11,0.08);border:1px solid rgba(245,158,11,0.2);border-radius:4px;">Prueba · ' + diasRestantes + 'd restantes</span>';
                } else {
                    badgeHtml = ' <span style="font-size:9px;color:var(--rp-text-secondary);font-weight:700;letter-spacing:0.05em;text-transform:uppercase;padding:1px 6px;background:rgba(63,63,70,0.25);border:1px solid var(--rp-border-strong);border-radius:4px;">Prueba · vence ' + vencStr + '</span>';
                }
            } else {
                badgeHtml = ' <span style="font-size:9px;color:var(--rp-text-secondary);font-weight:700;letter-spacing:0.05em;text-transform:uppercase;padding:1px 6px;background:rgba(39,39,42,0.4);border:1px solid var(--rp-border-strong);border-radius:4px;">Permanente</span>';
            }

            var left = '<div style="display:flex;align-items:center;gap:10px;">' +
                '<div style="width:32px;height:32px;border-radius:8px;background:' + (u.isAdmin ? 'rgba(59,130,246,0.12)' : 'var(--rp-border)') + ';display:flex;align-items:center;justify-content:center;flex-shrink:0;">' +
                '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="' + (u.isAdmin ? 'var(--rp-accent)' : 'var(--rp-text-secondary)') + '"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"/></svg>' +
                '</div>' +
                '<div>' +
                '<p style="font-size:13px;font-weight:500;color:var(--rp-text-heading);">' + u.user + badgeHtml + '</p>' +
                '<p style="font-size:10px;color:var(--rp-text-secondary);margin-top:1px;">••••••••</p>' +
                '</div>' +
                '</div>';

            var right = '<div style="display:flex;gap:6px;">';
            right += '<button onclick="openEditUserForm(\'' + u.user + '\')" style="padding:5px 12px;background:transparent;color:var(--rp-text-secondary);font-size:10px;font-weight:600;border:1px solid var(--rp-border-strong);border-radius:7px;cursor:pointer;font-family:\'Inter\',sans-serif;text-transform:uppercase;letter-spacing:0.03em;transition:all 0.2s;" onmouseover="this.style.color=\'#fff\';this.style.borderColor=\'var(--rp-text-secondary)\'" onmouseout="this.style.color=\'var(--rp-text-secondary)\';this.style.borderColor=\'var(--rp-border-strong)\'">Editar</button>';
            if (!u.isAdmin) {
                right += '<button onclick="deleteUser(\'' + u.user + '\')" style="padding:5px 12px;background:transparent;color:var(--rp-text-secondary);font-size:10px;font-weight:600;border:1px solid var(--rp-border-strong);border-radius:7px;cursor:pointer;font-family:\'Inter\',sans-serif;text-transform:uppercase;letter-spacing:0.03em;transition:all 0.2s;" onmouseover="this.style.color=\'var(--rp-error)\';this.style.borderColor=\'rgba(239,68,68,0.4)\'" onmouseout="this.style.color=\'var(--rp-text-secondary)\';this.style.borderColor=\'var(--rp-border-strong)\'">Eliminar</button>';
            }
            right += '</div>';

            row.innerHTML = left + right;
            container.appendChild(row);
        });

        if (!users.length) {
            container.innerHTML = '<p style="font-size:12px;color:var(--rp-text-secondary);text-align:center;padding:24px 0;">No hay usuarios registrados.</p>';
        }
    }

    function openAddUserForm() {
        document.getElementById('addUserFormTitle').innerText = 'Nuevo Usuario';
        document.getElementById('editUserOriginal').value = '';
        document.getElementById('newUserName').value = '';
        document.getElementById('newUserPass').value = '';
        document.getElementById('addUserError').innerText = '';
        document.getElementById('newUserName').removeAttribute('disabled');
        // Resetear tipo de acceso a permanente
        document.getElementById('newUserTipoPermanente').checked = true;
        document.getElementById('vencimientoWrap').style.display = 'none';
        _tipoAccesoSetActive('permanente');
        document.getElementById('vencTipoDias').checked = true;
        document.getElementById('vencDiasWrap').style.display = 'block';
        document.getElementById('vencFechaWrap').style.display = 'none';
        document.getElementById('newUserDias').value = '30';
        document.getElementById('newUserFechaVenc').value = '';
        document.getElementById('addUserForm').style.display = 'block';
        setTimeout(function() { document.getElementById('newUserName').focus(); }, 60);
    }

    function openEditUserForm(username) {
        var users = loadFsUsers();
        var u = users.find(function(x) { return x.user === username; });
        if (!u) return;
        document.getElementById('addUserFormTitle').innerText = 'Editar Usuario — ' + username;
        document.getElementById('editUserOriginal').value = username;
        document.getElementById('newUserName').value = u.user;
        document.getElementById('newUserPass').value = '';
        document.getElementById('addUserError').innerText = '';
        // Si es admin, bloquear cambio de nombre y ocultar sección de vencimiento
        if (u.isAdmin) {
            document.getElementById('newUserName').setAttribute('disabled', 'disabled');
            document.getElementById('newUserTipoPermanente').checked = true;
            document.getElementById('vencimientoWrap').style.display = 'none';
            _tipoAccesoSetActive('permanente');
        } else {
            document.getElementById('newUserName').removeAttribute('disabled');
            // Cargar tipo de acceso guardado
            var esPrueba = u.tipo === 'prueba' && u.vencimiento;
            document.getElementById('newUserTipoPrueba').checked = esPrueba;
            document.getElementById('newUserTipoPermanente').checked = !esPrueba;
            if (esPrueba) {
                document.getElementById('vencimientoWrap').style.display = 'block';
                _tipoAccesoSetActive('prueba');
                // Mostrar siempre como fecha exacta al editar (más claro para el admin)
                document.getElementById('vencTipoFecha').checked = true;
                document.getElementById('vencDiasWrap').style.display = 'none';
                document.getElementById('vencFechaWrap').style.display = 'block';
                document.getElementById('newUserFechaVenc').value = u.vencimiento;
                document.getElementById('newUserDias').value = '30';
            } else {
                document.getElementById('vencimientoWrap').style.display = 'none';
                _tipoAccesoSetActive('permanente');
                document.getElementById('vencTipoDias').checked = true;
                document.getElementById('vencDiasWrap').style.display = 'block';
                document.getElementById('vencFechaWrap').style.display = 'none';
                document.getElementById('newUserDias').value = '30';
                document.getElementById('newUserFechaVenc').value = '';
            }
        }
        document.getElementById('addUserForm').style.display = 'block';
        setTimeout(function() { document.getElementById('newUserPass').focus(); }, 60);
    }

    function cancelAddUser() {
        document.getElementById('addUserForm').style.display = 'none';
        document.getElementById('addUserError').innerText = '';
    }

    function saveNewUser() {
        var newUser  = document.getElementById('newUserName').value.trim();
        var newPass  = document.getElementById('newUserPass').value;
        var errEl    = document.getElementById('addUserError');
        var original = document.getElementById('editUserOriginal').value;
        errEl.innerText = '';

        if (!newUser) { errEl.innerText = 'El usuario no puede estar vacío.'; return; }
        if (!newPass) { errEl.innerText = 'La contraseña no puede estar vacía.'; return; }
        if (newPass.length < 4) { errEl.innerText = 'La contraseña debe tener al menos 4 caracteres.'; return; }

        // Leer tipo de acceso y vencimiento
        var esPrueba = document.getElementById('newUserTipoPrueba') && document.getElementById('newUserTipoPrueba').checked;
        var vencimiento = null;
        if (esPrueba) {
            vencimiento = _calcVencimiento();
            if (!vencimiento) { errEl.innerText = 'Debes ingresar una fecha o cantidad de días válida.'; return; }
            // Validar que la fecha de vencimiento no sea en el pasado
            var hoy = new Date(); hoy.setHours(0,0,0,0);
            var vencDate = new Date(vencimiento); vencDate.setHours(0,0,0,0);
            if (vencDate < hoy) { errEl.innerText = 'La fecha de vencimiento no puede ser en el pasado.'; return; }
        }

        var users = loadFsUsers();

        if (original) {
            // Editar existente
            var idx = users.findIndex(function(u) { return u.user === original; });
            if (idx === -1) { errEl.innerText = 'Usuario no encontrado.'; return; }
            // Si no es admin, verificar que el nuevo nombre no colisione
            if (!users[idx].isAdmin && newUser !== original) {
                var collision = users.some(function(u) { return u.user === newUser; });
                if (collision) { errEl.innerText = 'Ese nombre de usuario ya existe.'; return; }
                users[idx].user = newUser;
            }
            users[idx].pass = newPass;
            // Solo actualizar tipo/vencimiento si no es admin
            if (!users[idx].isAdmin) {
                if (esPrueba) {
                    users[idx].tipo = 'prueba';
                    users[idx].vencimiento = vencimiento;
                } else {
                    users[idx].tipo = 'permanente';
                    delete users[idx].vencimiento;
                }
            }
        } else {
            // Crear nuevo
            var exists = users.some(function(u) { return u.user === newUser; });
            if (exists) { errEl.innerText = 'Ese nombre de usuario ya existe.'; return; }
            var nuevoUser = { user: newUser, pass: newPass, isAdmin: false };
            if (esPrueba) {
                nuevoUser.tipo = 'prueba';
                nuevoUser.vencimiento = vencimiento;
            } else {
                nuevoUser.tipo = 'permanente';
            }
            users.push(nuevoUser);
        }

        saveFsUsers(users);
        cancelAddUser();
        renderAdminUserList();
        var msg = original ? 'Usuario actualizado' : 'Usuario creado';
        if (esPrueba && vencimiento) {
            var vencStr = new Date(vencimiento).toLocaleDateString('es-SV', { day:'2-digit', month:'2-digit', year:'numeric' });
            msg += ' · vence ' + vencStr;
        }
        showToast(msg, 'success');
    }

    function deleteUser(username) {
        fsConfirm('¿Eliminar el usuario "' + username + '"?\nEsta acción no se puede deshacer.', function() {
        var users = loadFsUsers();
        users = users.filter(function(u) { return u.user !== username; });
        saveFsUsers(users);
        renderAdminUserList();
        showToast('Usuario eliminado', 'success');
    }); }