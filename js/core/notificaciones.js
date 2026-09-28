// core/notificaciones.js
// Extraído automáticamente de index.html (FiscalSync) — Fase 2.
// No se modificó ninguna línea de lógica: es exactamente el código original,
// solo reordenado por módulo.



    // ══════════════════════════════════════════════════════════════════
    // CENTRO DE NOTIFICACIONES (rediseño)
    // ══════════════════════════════════════════════════════════════════
    // showToast(msg, type) conserva exactamente su firma e interfaz
    // original — todas las llamadas existentes en el proyecto siguen
    // funcionando sin modificarse. Internamente ahora delega en una cola
    // FIFO con tarjetas apiladas, SVG reutilizados del propio proyecto,
    // barra de progreso de 3s, pausa al pasar el mouse y resumen
    // automático de mensajes largos con panel "Ver detalles". Un tercer
    // argumento opcional (opts: {title, details}) permite, de forma
    // localizada, enriquecer notificaciones puntuales (p. ej. CSV por
    // tipo, o descargas JSON/PDF de Facturación Electrónica) sin tocar
    // ninguna llamada existente ni la lógica que las genera.
    var NOTIF_ICONS = {
        success: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/></svg>',
        error:   '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/></svg>',
        warning: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/></svg>',
        info:    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>'
    };
    var NOTIF_DEFAULT_TITLES = {
        success: 'Operación exitosa',
        error:   'Ocurrió un error',
        warning: 'Advertencia',
        info:    'Información'
    };
    var NOTIF_DURATION = 3000; // 3 segundos, según especificación

    // ── Notificaciones de CAMBIO DE MES (reemplazo, no acumulación) ──
    // Categoría interna explícita: la pasa únicamente changeMonth() vía
    // opts.category. Se usa una etiqueta interna en vez de comparar el
    // texto visible de la notificación, para identificar el evento de
    // forma robusta aunque el texto del período cambie en cada llamada.
    var NOTIF_CATEGORY_MONTH_CHANGE = 'month-change';
    var NOTIF_MONTH_CHANGE_DURATION = 1500; // 1.5s exactos, según especificación

    // Textualización por defecto para tarjetas agrupadas (misma acción
    // repetida consecutivamente) cuando la llamada a showToast() no
    // especifica un opts.groupNoun propio. No se usa para cambio de mes.
    var NOTIF_DEFAULT_GROUP_NOUN = { singular: 'operación realizada', plural: 'operaciones realizadas' };

    var _notifQueue = [];
    var _notifIdSeq = 0;
    var _notifRaf = null;
    var _notifPauseStart = null;
    var _notifDetailsStore = {};

    // Corrección persistencia — showToast() usa esta bandera para
    // silenciar toasts individuales mientras corre "Recorrer y Actualizar
    // Documentos" (función de Libros IVA que no forma parte de
    // FiscalSync-FE). La bandera nunca se declaraba en este proyecto
    // recortado, así que CADA llamada a showToast() terminaba en
    // "ReferenceError: _recorridoSilencioso is not defined" — eso incluía
    // el showToast('Bienvenido, ...') de loginSubmit() (Admin.js), que se
    // ejecuta justo antes de _iniciarFlujoPostLogin(): al reventar ahí,
    // _iniciarFlujoPostLogin() nunca llegaba a correr, así que jamás se
    // decidía si mostrar "Configurar Empresa" o Facturación Electrónica.
    // Se declara en false porque esa función no existe aquí, así que el
    // guard de arriba queda inerte (nunca debe silenciar nada).
    var _recorridoSilencioso = false;

    function _notifEscapeHtml(str) {
        var d = document.createElement('div');
        d.textContent = str == null ? '' : String(str);
        return d.innerHTML;
    }

    // Resume automáticamente mensajes demasiado largos (rutas completas,
    // listados extensos, errores técnicos) en un resumen corto + detalles
    // completos accesibles vía "Ver detalles". No se pierde información,
    // solo se reubica dónde se muestra (ver punto 9 de la especificación).
    function _notifSplitMessage(rawMsg) {
        var msg = rawMsg == null ? '' : String(rawMsg);
        var LIMIT = 88;
        var looksLikePath = /[A-Za-z]:\\\\|[A-Za-z]:\\|\/[^\s]+\/[^\s]+/.test(msg);
        if (msg.length <= LIMIT && !looksLikePath) {
            return { message: msg, details: null };
        }
        var cut = msg.slice(0, LIMIT).replace(/\s+\S*$/, '');
        if (!cut) cut = msg.slice(0, LIMIT);
        return { message: cut + '…', details: msg };
    }

    function showToast(msg, type, opts) {
        // Mientras "Recorrer y Actualizar Documentos" corre en segundo plano, se
        // suprimen los toasts de guardado individuales (uno por documento) para no
        // saturar al usuario; el comportamiento normal de showToast no cambia.
        if (_recorridoSilencioso) return;
        if (!type || !NOTIF_ICONS[type]) type = 'success';
        opts = opts || {};

        var title, message, details;
        if (opts.title || opts.details) {
            title = opts.title || NOTIF_DEFAULT_TITLES[type];
            message = opts.message != null ? opts.message : msg;
            details = opts.details || null;
        } else {
            var split = _notifSplitMessage(msg);
            title = NOTIF_DEFAULT_TITLES[type];
            message = split.message;
            details = split.details;
        }
        // opts.category y opts.groupNoun son NUEVOS y 100% opcionales: las
        // llamadas existentes a showToast() (que no los envían) no cambian
        // en nada su comportamiento actual. Solo se usan para:
        //  - 'month-change': reemplazar la notificación anterior en vez de
        //    encolar una nueva (ver _notifAdd).
        //  - cualquier otra categoría: agrupar repeticiones consecutivas de
        //    la misma acción bajo una sola tarjeta con contador ×N.
        _notifAdd(type, title, message, details, opts.category || null, opts.groupNoun || null, opts.duration || null, !!opts.replace);
    }

    // Posiciona el Centro de Notificaciones justo debajo del encabezado
    // que esté visible en ese momento (el del Workspace normal —empresa,
    // DUI/NIT, selector de mes— o el de Facturación Electrónica —Volver,
    // Correo, Clientes, selector de mes—, que es una pantalla superpuesta
    // de pantalla completa con su propio encabezado). Si ninguno está
    // visible (p. ej. la selección de empresas) usa la posición por
    // defecto, cerca del borde superior. Se recalcula en cada notificación
    // nueva y al redimensionar la ventana, así se adapta solo sin valores
    // fijos ni depender de una sola pantalla.
    function _notifUpdatePosition() {
        var container = document.getElementById('notifCenter');
        if (!container) return;
        var DEFAULT_TOP = 20;
        var top = DEFAULT_TOP;

        // Facturación Electrónica es un overlay de pantalla completa
        // independiente del Workspace normal (mismo patrón que usa el
        // resto del código para detectarla: classList.contains('active'),
        // ver _feBusquedaRapidaAbrir()); si está activa, su encabezado manda.
        var feScreen = document.getElementById('facturacionElectronicaScreen');
        var feTopbar = document.getElementById('feTopbar');
        if (feScreen && feScreen.classList.contains('active') && feTopbar) {
            var feRect = feTopbar.getBoundingClientRect();
            if (feRect.height > 0) top = Math.round(feRect.bottom + 14);
            container.style.top = top + 'px';
            return;
        }

        var topbar = document.querySelector('.workspace-topbar');
        if (topbar) {
            var rect = topbar.getBoundingClientRect();
            if (rect.height > 0 && topbar.offsetParent !== null) {
                top = Math.round(rect.bottom + 14);
            }
        }
        container.style.top = top + 'px';
    }
    window.addEventListener('resize', _notifUpdatePosition);

    function _notifAdd(type, title, message, details, category, groupNoun, customDuration, replace) {
        var container = document.getElementById('notifCenter');
        if (!container) return;
        _notifUpdatePosition();

        // ── 1) REEMPLAZO EN VIVO: cambio de mes, o cualquier categoría que
        // pida opts.replace (ej. guardados consecutivos). Si ya existe una
        // notificación viva de esa misma categoría (en cualquier posición
        // de la cola), se actualiza su contenido y se reinicia su
        // temporizador en vez de crear/acumular una tarjeta nueva.
        if (category === NOTIF_CATEGORY_MONTH_CHANGE || (replace && category)) {
            var existingMonthItem = null;
            for (var mi = 0; mi < _notifQueue.length; mi++) {
                if (_notifQueue[mi].category === category) { existingMonthItem = _notifQueue[mi]; break; }
            }
            if (existingMonthItem) {
                _notifUpdateContent(existingMonthItem, title, message);
                existingMonthItem.baseTitle = title;
                existingMonthItem.baseMessage = message;
                existingMonthItem.duration = customDuration || ((category === NOTIF_CATEGORY_MONTH_CHANGE) ? NOTIF_MONTH_CHANGE_DURATION : NOTIF_DURATION);
                if (existingMonthItem.active) {
                    existingMonthItem._activeStart = Date.now();
                    existingMonthItem._pausedTotal = 0;
                    if (existingMonthItem.fillEl) existingMonthItem.fillEl.style.transform = 'scaleX(1)';
                }
                return;
            }
            // No existía todavía: continúa el flujo normal de creación de
            // tarjeta más abajo, ya con la categoría y duración especiales.
        } else if (category) {
            // ── 2) MISMA CATEGORÍA repetida consecutivamente: agrupar ──
            // Solo se agrupa contra la ÚLTIMA notificación añadida (la más
            // reciente), para no fusionar notificaciones separadas por
            // otras acciones intermedias.
            var lastItem = _notifQueue.length ? _notifQueue[_notifQueue.length - 1] : null;
            if (lastItem && lastItem.category === category) {
                _notifGroupIncrement(lastItem, message, details, groupNoun);
                return;
            }
        } else {
            // ── 3) Sin categoría explícita: respaldo conservador ──
            // Solo agrupa si la notificación es EXACTAMENTE igual (mismo
            // tipo + mismo título + mismo mensaje) a la última añadida de
            // forma consecutiva. Cualquier otra combinación conserva el
            // comportamiento actual sin cambios (no rompe nada existente).
            var lastPlain = _notifQueue.length ? _notifQueue[_notifQueue.length - 1] : null;
            if (lastPlain && !lastPlain.category && lastPlain.type === type &&
                lastPlain.baseTitle === title && lastPlain.baseMessage === message) {
                _notifGroupIncrement(lastPlain, message, details, groupNoun);
                return;
            }
        }

        var id = 'notif_' + (++_notifIdSeq);

        var el = document.createElement('div');
        el.className = 'notif-card type-' + type;
        el.dataset.notifId = id;

        var detailsHtml = '';
        if (details) {
            _notifDetailsStore[id] = { title: title, details: details };
            detailsHtml = '<button type="button" class="notif-details-btn" onclick="showNotifDetails(\'' + id + '\')">• Ver detalles</button>';
        }

        el.innerHTML =
            '<div class="notif-card-inner">' +
                '<div class="notif-icon">' + NOTIF_ICONS[type] + '</div>' +
                '<div class="notif-body">' +
                    '<div class="notif-title-row">' +
                        '<div class="notif-title">' + _notifEscapeHtml(title) + '</div>' +
                        '<button type="button" class="notif-close" onclick="closeNotification(\'' + id + '\')" aria-label="Cerrar">×</button>' +
                    '</div>' +
                    '<div class="notif-msg">' + _notifEscapeHtml(message) + '</div>' +
                    detailsHtml +
                '</div>' +
            '</div>' +
            '<div class="notif-progress-track"><div class="notif-progress-fill"></div></div>';

        container.appendChild(el);

        var item = {
            id: id, type: type, el: el,
            fillEl: el.querySelector('.notif-progress-fill'),
            duration: customDuration || ((category === NOTIF_CATEGORY_MONTH_CHANGE) ? NOTIF_MONTH_CHANGE_DURATION : NOTIF_DURATION),
            _activeStart: 0, _pausedTotal: 0, active: false,
            // Metadatos para reemplazo (cambio de mes) y agrupación
            // (misma acción repetida). No afectan a notificaciones que no
            // usan categoría: category queda null y count en 1, igual que
            // el comportamiento previo a este cambio.
            category: category || null,
            baseTitle: title,
            baseMessage: message,
            baseDetails: details || null,
            count: 1,
            groupNoun: groupNoun || null
        };
        _notifQueue.push(item);

        // Forzar reflow antes de agregar la clase de entrada para que la
        // transición (opacity + transform) se dispare correctamente.
        requestAnimationFrame(function() {
            requestAnimationFrame(function() { el.classList.add('notif-in'); });
        });

        if (_notifQueue.length === 1) {
            _notifActivate(item);
        }
    }

    // Actualiza el título y mensaje de una tarjeta EXISTENTE sin recrearla
    // (usado tanto por el reemplazo de cambio de mes como por la
    // agrupación). No toca íconos, colores, layout ni animaciones.
    function _notifUpdateContent(item, title, message) {
        var titleEl = item.el.querySelector('.notif-title');
        var msgEl = item.el.querySelector('.notif-msg');
        if (titleEl) titleEl.textContent = title;
        if (msgEl) msgEl.textContent = message;
    }

    // Agrega el botón "Ver detalles" a una tarjeta que no lo tenía todavía
    // (p. ej. una notificación simple que empieza a agruparse). Reutiliza
    // exactamente la misma clase/estilo que ya existía para ese botón.
    function _notifEnsureDetailsButton(item) {
        if (item.el.querySelector('.notif-details-btn')) return;
        var body = item.el.querySelector('.notif-body');
        if (!body) return;
        var btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'notif-details-btn';
        btn.textContent = '• Ver detalles';
        btn.addEventListener('click', function() { showNotifDetails(item.id); });
        body.appendChild(btn);
    }

    // Incrementa el contador de una tarjeta agrupada (misma acción
    // repetida consecutivamente): actualiza el título con "· ×N", genera
    // un mensaje resumen y conserva CADA mensaje/detalle individual en
    // "Ver detalles" (punto 6 de la especificación: no se pierde
    // información al agrupar). También reinicia el temporizador de la
    // tarjeta si está activa, para que siga visible mientras la acción se
    // repite.
    function _notifGroupIncrement(item, newMessage, newDetails, groupNoun) {
        item.count++;
        if (groupNoun && !item.groupNoun) item.groupNoun = groupNoun;
        if (!item.groupMessages) item.groupMessages = [item.baseDetails || item.baseMessage];
        item.groupMessages.push(newDetails || newMessage);

        var noun = item.groupNoun || NOTIF_DEFAULT_GROUP_NOUN;
        var displayTitle = item.baseTitle + ' · ×' + item.count;
        var displayMessage = item.count + ' ' + noun.plural + ' correctamente.';

        _notifUpdateContent(item, displayTitle, displayMessage);
        _notifEnsureDetailsButton(item);
        _notifDetailsStore[item.id] = {
            title: displayTitle,
            details: item.groupMessages.map(function(m, i) { return (i + 1) + '. ' + m; }).join('\n')
        };

        if (item.active) {
            item._activeStart = Date.now();
            item._pausedTotal = 0;
            if (item.fillEl) item.fillEl.style.transform = 'scaleX(1)';
        }
    }

    function _notifActivate(item) {
        item.active = true;
        item._activeStart = Date.now();
        item._pausedTotal = 0;
        if (item.fillEl) item.fillEl.style.transform = 'scaleX(1)';
        if (!_notifRaf) _notifRaf = requestAnimationFrame(_notifTick);
    }

    function _notifTick() {
        _notifRaf = null;
        if (!_notifQueue.length) return;
        var active = _notifQueue[0];
        if (!active.active) { _notifActivate(active); }

        if (_notifPauseStart === null) {
            var elapsed = Date.now() - active._activeStart - active._pausedTotal;
            var pct = 1 - (elapsed / active.duration);
            if (pct < 0) pct = 0;
            if (active.fillEl) active.fillEl.style.transform = 'scaleX(' + pct + ')';
            if (elapsed >= active.duration) {
                closeNotification(active.id);
                return; // closeNotification reprograma el siguiente tick si hace falta
            }
        }
        _notifRaf = requestAnimationFrame(_notifTick);
    }

    function _notifPauseHover() {
        if (!_notifQueue.length) return;
        if (_notifPauseStart === null) _notifPauseStart = Date.now();
    }

    function _notifResumeHover() {
        if (_notifPauseStart === null) return;
        var elapsedPaused = Date.now() - _notifPauseStart;
        _notifPauseStart = null;
        if (_notifQueue.length) {
            _notifQueue[0]._pausedTotal += elapsedPaused;
        }
        if (_notifQueue.length && !_notifRaf) _notifRaf = requestAnimationFrame(_notifTick);
    }

    // Elimina una notificación (manual con "×" o automática al agotar su
    // tiempo). Usa únicamente opacity/transform para la salida (sin animar
    // height/padding/margin, ver punto 6) y aplica la técnica FLIP para que
    // el resto de tarjetas suban suavemente con transform, no con animación
    // de layout.
    function closeNotification(id) {
        var idx = -1;
        for (var i = 0; i < _notifQueue.length; i++) { if (_notifQueue[i].id === id) { idx = i; break; } }
        if (idx === -1) return;
        var item = _notifQueue[idx];
        var wasActive = (idx === 0);
        _notifQueue.splice(idx, 1);
        delete _notifDetailsStore[id];

        var container = item.el.parentElement;
        var remainingEls = _notifQueue.map(function(n) { return n.el; });
        var firstRects = remainingEls.map(function(el) { return el.getBoundingClientRect(); });

        if (container) {
            var rect = item.el.getBoundingClientRect();
            var parentRect = container.getBoundingClientRect();
            item.el.style.position = 'absolute';
            item.el.style.left = (rect.left - parentRect.left) + 'px';
            item.el.style.top = (rect.top - parentRect.top) + 'px';
            item.el.style.width = rect.width + 'px';
            item.el.style.margin = '0';
        }
        item.el.classList.remove('notif-in');
        item.el.classList.add('notif-out');

        var lastRects = remainingEls.map(function(el) { return el.getBoundingClientRect(); });
        remainingEls.forEach(function(el, i) {
            var dy = firstRects[i].top - lastRects[i].top;
            if (dy) {
                el.style.transition = 'none';
                el.style.transform = 'translateY(' + dy + 'px)';
                // Forzar reflow para que el navegador registre el estado inicial
                // antes de animar hacia la posición final.
                void el.offsetHeight;
                el.style.transition = 'transform 0.28s cubic-bezier(0.4,0,0.2,1)';
                el.style.transform = '';
            }
        });

        setTimeout(function() {
            if (item.el && item.el.parentElement) item.el.parentElement.removeChild(item.el);
        }, 240);

        if (wasActive) {
            _notifPauseStart = null;
            if (_notifQueue.length) {
                _notifActivate(_notifQueue[0]);
            }
        }
    }

    function showNotifDetails(id) {
        var data = _notifDetailsStore[id];
        if (!data) return;
        var modal = document.getElementById('notifDetailsModal');
        document.getElementById('notifDetailsTitle').textContent = data.title || 'Detalles';
        document.getElementById('notifDetailsBody').textContent = data.details || '';
        if (modal) { modal.style.display = 'flex'; modal.classList.remove('hidden'); modal.classList.add('modal-open'); }
    }

    function closeNotifDetails() {
        var modal = document.getElementById('notifDetailsModal');
        if (!modal) return;
        modal.classList.remove('modal-open');
        modal.classList.add('hidden');
        modal.style.display = 'none';
    }