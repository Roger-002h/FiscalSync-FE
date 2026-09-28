// core/utilidades.js
// Extraído automáticamente de index.html (FiscalSync) — Fase 2.
// No se modificó ninguna línea de lógica: es exactamente el código original,
// solo reordenado por módulo.



    // ══════════════════════════════════════════════════════════════════
    // CAMBIO 7 — fsStore: CAPA DE ALMACENAMIENTO EN DISCO (Electron)
    // Reemplaza localStorage con archivos JSON en disco cuando corre en Electron.
    // En web/dev fallback transparente a localStorage.
    // Archivo de datos: %AppData%/FiscalSync/fiscaldata.json (Windows)
    // ══════════════════════════════════════════════════════════════════
    var fsStore = (function() {
        var _isElectron = !!(window.fiscalAPI && window.fiscalAPI.isElectron);
        var _cache = null;          // Cache en memoria del store completo
        var _dirty = false;
        var _saveTimer = null;

        // Corrección persistencia — reconstruye el store desde localStorage.
        // setItem()/flushNow() escriben SIEMPRE una copia síncrona en
        // localStorage además de disco (ver más abajo). Si la escritura a
        // disco (fiscaldata.json, vía IPC asíncrono) no llegó a completarse
        // antes de cerrar la app, esa copia en localStorage sigue intacta:
        // se usa como respaldo en vez de arrancar con un cache vacío.
        function _rebuildFromLocalStorage() {
            var out = {};
            try {
                for (var i = 0; i < localStorage.length; i++) {
                    var k = localStorage.key(i);
                    if (k && k.indexOf('fs_') === 0) {
                        try { out[k] = JSON.parse(localStorage.getItem(k)); }
                        catch(e) { out[k] = localStorage.getItem(k); }
                    }
                }
            } catch(e) {}
            return out;
        }

        // Leer el store completo desde disco (una sola vez, luego usa cache)
        function _loadAll() {
            if (_cache !== null) return;
            // Antes: en Electron esto asumía "cache inicializado en boot" y
            // ponía _cache = {} a ciegas. Si algo llega a leer el store
            // antes de que termine initFromElectron() (o si esa llamada
            // nunca llegó a hacerse porque fsReadStore() devolvió null),
            // ya no partimos de un cache vacío: se reconstruye desde
            // localStorage, igual que en el modo no-Electron.
            _cache = _rebuildFromLocalStorage();
        }

        // Persistir cache a disco (debounced 400ms para evitar escrituras excesivas)
        function _persist() {
            if (!_dirty) return;
            if (_saveTimer) clearTimeout(_saveTimer);
            _saveTimer = setTimeout(function() {
                _dirty = false;
                var jsonStr = JSON.stringify(_cache);
                if (_isElectron && window.fiscalAPI && window.fiscalAPI.fsWriteStore) {
                    // Escritura asíncrona a disco via Electron IPC
                    window.fiscalAPI.fsWriteStore(jsonStr).catch(function(e) {
                        console.warn('fsStore write error:', e);
                    });
                }
                // SIEMPRE sincronizar a localStorage como respaldo
                if (_cache) {
                    Object.keys(_cache).forEach(function(k) {
                        try {
                            var v = _cache[k];
                            localStorage.setItem(k, typeof v === 'string' ? v : JSON.stringify(v));
                        } catch(e) {}
                    });
                }
            }, 400);
        }

        // Inicializar cache desde store Electron al arrancar.
        // Corrección persistencia: si el archivo en disco no existe, vino
        // vacío o vino corrupto, no se asume que no hay datos — se
        // reconstruye desde localStorage (respaldo síncrono, ver
        // _rebuildFromLocalStorage) en vez de arrancar con {} directamente.
        function _initFromElectron(rawJson) {
            if (!rawJson) { _cache = _rebuildFromLocalStorage(); return; }
            try { _cache = JSON.parse(rawJson); }
            catch(e) { _cache = _rebuildFromLocalStorage(); }
        }

        return {
            isElectron: _isElectron,
            initFromElectron: _initFromElectron,

            getItem: function(key) {
                _loadAll();
                var v = _cache[key];
                if (v === undefined) return null;
                if (typeof v === 'string') return v;
                return JSON.stringify(v);
            },

            setItem: function(key, value) {
                _loadAll();
                try { _cache[key] = typeof value === 'string' ? JSON.parse(value) : value; }
                catch(e) { _cache[key] = value; }
                _dirty = true;
                _persist();
                // También sincronizar a localStorage como backup
                try { localStorage.setItem(key, typeof value === 'string' ? value : JSON.stringify(value)); } catch(e) {}
            },

            removeItem: function(key) {
                _loadAll();
                delete _cache[key];
                _dirty = true;
                _persist();
                try { localStorage.removeItem(key); } catch(e) {}
            },

            // Proyecto FiscalSync FE — fuerza el guardado a disco de
            // inmediato, sin esperar los 400ms de debounce de _persist().
            // _persist() está pensado para guardados frecuentes (tablas
            // mientras se escribe); para datos poco frecuentes pero
            // críticos — como configurar/editar la empresa — cerrar la
            // app dentro de esos 400ms perdía el cambio, porque el
            // setTimeout nunca llegaba a dispararse. Se usa justo después
            // de guardar la empresa (ver saveEmpresas() en Empresas.js).
            flushNow: function() {
                if (_saveTimer) { clearTimeout(_saveTimer); _saveTimer = null; }
                _dirty = false;
                if (_cache === null) return;
                var jsonStr = JSON.stringify(_cache);
                // Proyecto FiscalSync FE — DIAGNÓSTICO TEMPORAL. Quitar
                // estos console.log una vez resuelto el bug de persistencia.
                console.log('[FiscalSync FE][diagnóstico] flushNow() llamado, _isElectron =', _isElectron, ', tamaño del cache =', jsonStr.length, 'caracteres');
                if (_isElectron && window.fiscalAPI && window.fiscalAPI.fsWriteStore) {
                    window.fiscalAPI.fsWriteStore(jsonStr).then(function(res) {
                        console.log('[FiscalSync FE][diagnóstico] fsWriteStore() resolvió:', res);
                    }).catch(function(e) {
                        console.warn('fsStore flushNow error:', e);
                    });
                } else {
                    console.warn('[FiscalSync FE][diagnóstico] flushNow(): _isElectron es false o falta window.fiscalAPI.fsWriteStore — solo se guardó en localStorage, NO en disco.');
                }
                Object.keys(_cache).forEach(function(k) {
                    try {
                        var v = _cache[k];
                        localStorage.setItem(k, typeof v === 'string' ? v : JSON.stringify(v));
                    } catch(e) {}
                });
            },

            getAllKeys: function() {
                _loadAll();
                return Object.keys(_cache);
            },

            length: function() {
                _loadAll();
                return Object.keys(_cache).length;
            },

            key: function(i) {
                _loadAll();
                return Object.keys(_cache)[i] || null;
            }
        };
    })();

    var REGEX_NIT = /.*/;
    var REGEX_NRC = /.*/;
    var REGEX_DUI = /.*/;

    function isValidNit(val) { return true; }
    function isValidNrc(val) { return true; }
    function isValidDui(val) { return true; }
    function isValidNitOrNrc(val) { return true; }
    function isValidDuiOrNit(val) { return true; }

    function clearFieldError(inputId, errorId) {
        document.getElementById(inputId).classList.remove('input-error');
        document.getElementById(errorId).classList.remove('show');
    }

    function setFieldError(inputId, errorId) {
        document.getElementById(inputId).classList.add('input-error');
        document.getElementById(errorId).classList.add('show');
    }

    function validateDocField(inputId, errorId, validatorFn) {
        var val = document.getElementById(inputId).value.trim();
        if (!val) {
            setFieldError(inputId, errorId);
            return false;
        }
        clearFieldError(inputId, errorId);
        return true;
    }

    function fMoney(n) {
        var val = n || 0;
        return '$' + val.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    }

    // ── Cambio 8: flag de render pendiente — cualquier save dispara re-render ──
    var _renderPending = false;
    var _renderRAF = null;
    function _scheduleRender() {
        if (_renderPending) return;
        _renderPending = true;
        if (_renderRAF) cancelAnimationFrame(_renderRAF);
        _renderRAF = requestAnimationFrame(function() {
            _renderPending = false;
            _renderRAF = null;
            renderAllTables();
        });
    }

    // ══════════════════════════════════════════════════════════════════
    // NORMALIZACIÓN UUID — elimina guiones y unifica mayúsculas/minúsculas
    // Ej: 76B87B5A-6BC7-4FED-A4DA-F4A9798CA3F8
    //   = 76B87B5A6BC74FEDA4DAF4A9798CA3F8
    //   = 76b87b5a6bc74feda4daf4a9798ca3f8  → todos iguales
    // ══════════════════════════════════════════════════════════════════
    function normalizeUUID(str) {
        if (!str) return '';
        return str.replace(/-/g, '').toUpperCase().trim();
    }

    // ══════════════════════════════════════════════════════════════════
    // BUSCADOR GLOBAL — filterTable
    // ══════════════════════════════════════════════════════════════════
    function filterTable(libro) {
        var searchId    = { debito: 'searchDebito', cf: 'searchCf', compras: 'searchCompras',
                            percibido: 'searchPercibido', retenido: 'searchRetenido',
                            anticipo: 'searchAnticipo', excluido: 'searchExcluido',
                            f14: 'searchF14', quincena25: 'searchQuincena25', anulados: 'searchAnulados' };
        var revSearchId = { debito: 'revSearchDebito', cf: 'revSearchCf', compras: 'revSearchCompras' };
        var tbodyId     = { debito: 'debitoTableBody', cf: 'cfTableBody', compras: 'comprasTableBody',
                            percibido: 'percibidoTableBody', retenido: 'retenidoTableBody',
                            anticipo: 'anticipoTableBody', excluido: 'excluidoTableBody',
                            f14: 'f14TableBody', quincena25: 'quincena25TableBody', anulados: 'anuladosTableBody' };

        var normalInput = document.getElementById(searchId[libro]);
        var revInput    = document.getElementById(revSearchId[libro]);
        var tbody       = document.getElementById(tbodyId[libro]);
        if (!tbody) return;

        var query = ((normalInput ? normalInput.value : '') + ' ' + (revInput ? revInput.value : '')).trim().toLowerCase();
        var rows = tbody.querySelectorAll('tr');
        rows.forEach(function(row) {
            if (!query) { row.style.display = ''; return; }
            var text = row.textContent.toLowerCase();
            row.style.display = text.indexOf(query) !== -1 ? '' : 'none';
        });
    }

    // ══════════════════════════════════════════════
    // NAVIGATION
    // ══════════════════════════════════════════════
    function toggleSub(id) { document.getElementById(id).classList.toggle('show'); }

    // ── Helpers de lectura JSON ──
    function gv(obj) {
        var paths = Array.prototype.slice.call(arguments, 1);
        for (var p = 0; p < paths.length; p++) {
            var keys = paths[p].split('.');
            var cur = obj;
            for (var k = 0; k < keys.length; k++) { if (cur == null) break; cur = cur[keys[k]]; }
            if (cur !== undefined && cur !== null && cur !== '') return cur;
        }
        return '';
    }
    function gn() { return parseFloat(gv.apply(null, arguments)) || 0; }

    // ══════════════════════════════════════════════
    // CSV EXPORT
    // ══════════════════════════════════════════════

    function formatFecha(val) {
        if (!val) return '00/00/0000';

        var s = val.toString().trim();
        var day, month, year;

        if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
            var parts = s.split('-');
            year = parts[0]; month = parts[1]; day = parts[2];
        } else if (s.indexOf('/') !== -1) {
            var p = s.split('/');
            if (p[0].length === 4) { year = p[0]; month = p[1]; day = p[2]; }
            else { day = p[0]; month = p[1]; year = p[2]; }
        } else if (s.indexOf('-') !== -1) {
            var p2 = s.split('-');
            if (p2[0].length === 4) { year = p2[0]; month = p2[1]; day = p2[2]; }
            else { day = p2[0]; month = p2[1]; year = p2[2]; }
        } else {
            return '00/00/0000';
        }

        day = String(day).padStart(2, '0');
        month = String(month).padStart(2, '0');

        return day + '/' + month + '/' + year;
    }

    function extractNum(val) {
        if (val === null || val === undefined) return '';
        var s = val.toString().trim();
        var m = s.match(/^(\d{1,3})\s*[—\-–]/);
        if (m) return m[1];
        if (/^\d+$/.test(s)) return s;
        return s;
    }

    function escHtml(s) {
        return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
    }
    // ══════════════════════════════════════════════════════════════
    // AGREGADO NUEVO — Cambio 01: Total Visual
    // ══════════════════════════════════════════════════════════════
    // Suma exclusivamente informativa/visual de TODOS los conceptos económicos
    // de la factura (exentas, gravadas, FOVIAL, COTRANS, IVA Percibido y Crédito
    // Fiscal) para que el usuario pueda comparar contra el total real del
    // documento físico y detectar errores de digitación. NO se guarda en
    // comprasRecords, NO se envía a saveComprasRecord, y NO participa en el
    // cálculo del Anexo de Compras, del Crédito Fiscal, ni de ningún reporte,
    // exportación o libro impreso. La lógica fiscal existente (calcCompras /
    // calcComprasTotal / saveComprasRecord) permanece intacta.
    function calcTotalVisual() {
        var el = document.getElementById('cp_total_visual');
        if (!el) return;
        var n = function(id) { var f = document.getElementById(id); return f ? (parseFloat(f.value) || 0) : 0; };
        var totalVisual = n('cp_int_exentas') + n('cp_intern_exentas') + n('cp_imp_exentas') +
                           n('cp_int_gravadas') + n('cp_intern_grav') + n('cp_imp_grav') + n('cp_imp_serv') +
                           n('cp_fovial') + n('cp_cotrans') + n('cp_iva_percibido') + n('cp_credito');
        el.value = totalVisual.toFixed(2);
    }

    // Convierte dd/mm/aaaa -> aaaa-mm-dd para poblar un <input type="date">
    function _isoFromDdmmyyyy(val) {
        if (!val) return '';
        var p = val.split('/');
        if (p.length !== 3) return '';
        return p[2] + '-' + p[1] + '-' + p[0];
    }

        // ══════════════════════════════════════════════
    // LEGACY updateList
    // ══════════════════════════════════════════════
    function updateList(files) {
        loadFilesIntoQueue(Array.from(files).filter(function(f) { return f.name.toLowerCase().endsWith('.json'); }));
    }

    /* ═══ UTILIDADES UI — stepper numérico y radio pill ═══ */
    function stepNum(id, delta, min, max) {
        var el = document.getElementById(id);
        if (!el) return;
        var val = parseFloat(el.value) || 0;
        val = Math.min(max, Math.max(min, val + delta));
        el.value = val;
        el.dispatchEvent(new Event('input', { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
    }

    function syncPillGroup(radio) {
        if (!radio) return;
        var name = radio.name;
        document.querySelectorAll('input[type="radio"][name="' + name + '"]').forEach(function(r) {
            var lbl = r.closest('.radio-pill-item');
            if (!lbl) return;
            if (r.checked) { lbl.classList.add('checked'); }
            else           { lbl.classList.remove('checked'); }
        });
    }

    // Inicializar estado visual de todos los grupos pill al cargar
    document.addEventListener('DOMContentLoaded', function() {
        document.querySelectorAll('.radio-pill-item input[type="radio"]').forEach(function(r) {
            r.addEventListener('change', function() { syncPillGroup(r); });
            if (r.checked) {
                var lbl = r.closest('.radio-pill-item');
                if (lbl) lbl.classList.add('checked');
            }
        });
    });

    function onVencTipoChange() {
        var tipoDias = document.getElementById('vencTipoDias');
        if (!tipoDias) return;
        document.getElementById('vencDiasWrap').style.display  = tipoDias.checked ? 'block' : 'none';
        document.getElementById('vencFechaWrap').style.display = tipoDias.checked ? 'none'  : 'block';
    }

    // Calcular fecha ISO de vencimiento desde el formulario
    function _calcVencimiento() {
        var tipoDias = document.getElementById('vencTipoDias');
        if (!tipoDias) return null;
        if (tipoDias.checked) {
            var dias = parseInt(document.getElementById('newUserDias').value, 10);
            if (isNaN(dias) || dias < 1) return null;
            var d = new Date();
            d.setDate(d.getDate() + dias);
            return d.toISOString().split('T')[0];
        } else {
            var fecha = document.getElementById('newUserFechaVenc').value;
            return fecha || null;
        }
    }

    function _esc(s) { return String(s||'').replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;'); }

    // Refleja el estado (marcado/no marcado) del checkbox oculto en la
    // tarjeta visual correspondiente (misma técnica que syncPillGroup)
    function syncAnexoCard(checkboxId) {
        var input = document.getElementById(checkboxId);
        var card  = document.getElementById(checkboxId + '_card');
        if (!input || !card) return;
        if (input.checked) card.classList.add('checked');
        else card.classList.remove('checked');
    }

    // ── Helpers de formato completo para validar NIT/NRC/DUI ──
    function _isCompleteNit(v)  { return /^\d{4}-\d{6}-\d{3}-\d$/.test(v); }
    function _isCompleteNrc(v)  { return /^\d{1,6}-\d$/.test(v); }
    function _isCompleteDui(v)  { return /^\d{8}-\d$/.test(v); }
    function _isCompleteId(v)   { return _isCompleteNit(v) || _isCompleteNrc(v) || _isCompleteDui(v); }