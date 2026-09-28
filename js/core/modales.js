// core/modales.js
// Extraído automáticamente de index.html (FiscalSync) — Fase 2.
// No se modificó ninguna línea de lógica: es exactamente el código original,
// solo reordenado por módulo.


    // ═══════════════════════════════════════════════════════════════════
    // AGREGADO NUEVO: fsConfirm — reemplaza confirm() nativo
    // Evita el congelamiento de Electron con diálogos del sistema
    // ═══════════════════════════════════════════════════════════════════
    function fsConfirm(msg, onYes) {
        var modal   = document.getElementById('fsConfirmModal');
        var titleEl = document.getElementById('fsConfirmTitle');
        var msgEl   = document.getElementById('fsConfirmMsg');

        // Extraer primera línea como título si el mensaje tiene varias líneas
        var lines = msg.trim().split('\n').filter(function(l){ return l.trim(); });
        if (lines.length > 1) {
            titleEl.innerText = lines[0];
            msgEl.innerText   = lines.slice(1).join('\n').trim();
        } else {
            titleEl.innerText = '¿Confirmar acción?';
            msgEl.innerText   = msg;
        }

        var inner = modal.querySelector('div');
        inner.style.transform    = 'scale(0.95) translateY(8px)';
        inner.style.opacity      = '0';
        inner.style.transition   = 'none';
        modal.style.display      = 'flex';
        modal.classList.add('modal-open');
        requestAnimationFrame(function() {
            requestAnimationFrame(function() {
                inner.style.transition = 'transform 0.2s cubic-bezier(0.16,1,0.3,1), opacity 0.18s ease';
                inner.style.transform  = 'scale(1) translateY(0)';
                inner.style.opacity    = '1';
            });
        });

        var ok     = document.getElementById('fsConfirmOk');
        var cancel = document.getElementById('fsConfirmCancel');
        function close() {
            inner.style.transition = 'transform 0.15s ease, opacity 0.15s ease';
            inner.style.transform  = 'scale(0.96) translateY(4px)';
            inner.style.opacity    = '0';
            setTimeout(function() {
                modal.style.display = 'none';
                modal.classList.remove('modal-open');
            }, 150);
            ok.onclick = null;
            cancel.onclick = null;
        }
        ok.onclick     = function() { close(); setTimeout(onYes, 160); };
        cancel.onclick = function() { close(); };
    }

    // ═══════════════════════════════════════════════════════════════════
    // CORRECCIÓN 01: fsAlert — reemplaza alert() nativo
    // Igual que fsConfirm, evita el congelamiento del teclado en toda la
    // aplicación que provoca Electron cuando, tras un diálogo nativo
    // (ej. dialog.showOpenDialog del IPC), se dispara un alert()/confirm()
    // nativo del sistema. Se usa un modal propio en HTML en su lugar.
    // ═══════════════════════════════════════════════════════════════════
    function fsAlert(msg, onClose) {
        var modal   = document.getElementById('fsAlertModal');
        var titleEl = document.getElementById('fsAlertTitle');
        var msgEl   = document.getElementById('fsAlertMsg');

        var lines = String(msg || '').trim().split('\n').filter(function(l){ return l.trim(); });
        if (lines.length > 1) {
            titleEl.innerText = lines[0];
            msgEl.innerText   = lines.slice(1).join('\n').trim();
        } else {
            titleEl.innerText = 'Aviso';
            msgEl.innerText   = msg;
        }

        var inner = modal.querySelector('div');
        inner.style.transform    = 'scale(0.95) translateY(8px)';
        inner.style.opacity      = '0';
        inner.style.transition   = 'none';
        modal.style.display      = 'flex';
        modal.classList.add('modal-open');
        requestAnimationFrame(function() {
            requestAnimationFrame(function() {
                inner.style.transition = 'transform 0.2s cubic-bezier(0.16,1,0.3,1), opacity 0.18s ease';
                inner.style.transform  = 'scale(1) translateY(0)';
                inner.style.opacity    = '1';
            });
        });

        var ok = document.getElementById('fsAlertOk');
        function close() {
            inner.style.transition = 'transform 0.15s ease, opacity 0.15s ease';
            inner.style.transform  = 'scale(0.96) translateY(4px)';
            inner.style.opacity    = '0';
            setTimeout(function() {
                modal.style.display = 'none';
                modal.classList.remove('modal-open');
            }, 150);
            ok.onclick = null;
            if (typeof onClose === 'function') setTimeout(onClose, 160);
        }
        ok.onclick = function() { close(); };
    }

    // ══════════════════════════════════════════════════════════════════
    // AGREGADO NUEVO — Cambio 07 (Animaciones), 2da vuelta: cierre animado
    // de modales. Todas las funciones closeXxxModal() de este archivo
    // ocultaban el modal de golpe (display:none + quitar "modal-open" en
    // el mismo instante). Este helper agrega la clase "modal-closing"
    // (dispara el fundido/pop de salida por @keyframes, ver CSS de
    // .modal-overlay.modal-closing) y espera a que termine antes de fijar
    // display:none, para no cortar la animación. Acepta un id (string) o
    // el elemento ya obtenido con getElementById. No cambia qué hace cada
    // función al cerrar (limpiar campos, resetear estado, etc.), solo
    // cómo se oculta visualmente el modal.
    // ══════════════════════════════════════════════════════════════════
    function _cerrarModalAnimado(idOrEl) {
        var modal = (typeof idOrEl === 'string') ? document.getElementById(idOrEl) : idOrEl;
        if (!modal) return;
        modal.classList.remove('modal-open');
        modal.classList.add('modal-closing');
        setTimeout(function() {
            modal.classList.remove('modal-closing');
            modal.style.display = 'none';
        }, 150);
    }

    // ══════════════════════════════════════════════
    // DÉBITO FISCAL CRUD
    // ══════════════════════════════════════════════
    function _setModalMode(prefix, isEdit, records, index) {
        var fnew = document.getElementById(prefix + '-footer-new');
        var fedit = document.getElementById(prefix + '-footer-edit');
        if (!fnew || !fedit) return;
        if (isEdit) {
            fnew.classList.add('hidden'); fnew.classList.remove('flex');
            fedit.classList.remove('hidden'); fedit.classList.add('flex');
            var pos = document.getElementById(prefix + '-nav-pos');
            if (pos) pos.innerText = (parseInt(index) + 1) + ' / ' + records.length;
        } else {
            fedit.classList.add('hidden'); fedit.classList.remove('flex');
            fnew.classList.remove('hidden'); fnew.classList.add('flex');
        }
    }