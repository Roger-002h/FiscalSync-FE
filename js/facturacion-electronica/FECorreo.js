// facturacion-electronica/FECorreo.js
// Extraído automáticamente de index.html (FiscalSync) — Fase 2.
// No se modificó ninguna línea de lógica: es exactamente el código original,
// solo reordenado por módulo.



    // ════════════════════════════════════════════════════════════════════
    // Integración 01 — Envío de Correos desde Facturación Electrónica
    // ────────────────────────────────────────────────────────────────────
    // Objetivo (Sección 2 del pedido): cuando el usuario genera un
    // documento en Facturación Electrónica, debe quedar automáticamente
    // preparado para enviarlo por correo — sin salir de Facturación
    // Electrónica, sin abrir el Módulo de Correos a mano, sin buscar el
    // documento, sin cargar el PDF a mano y sin volver a escribir el
    // correo del cliente.
    //
    // NO se reinventa el Módulo de Correos DTE: esta sección solo arma el
    // registro (usando exactamente la misma estructura {pdfPath, jsonPath,
    // numDoc, tipoCodigo, ...} que ya usa _correosExtraerDocumento) y
    // reutiliza _correosLoadDocs/_correosSaveDocs, _correosExtraerDocumento,
    // correosEnviarIndividual, correosActualizarCorreo y
    // _correosRegistrarEnHistorial (esta última ya la llama
    // correosEnviarIndividual por dentro). El envío real, la plantilla, el
    // SMTP y el historial son 100% del módulo existente (ver Sección 17).
    // ════════════════════════════════════════════════════════════════════

    // Empareja el .json y el .pdf de UN MISMO documento (main.js los
    // guarda con el mismo nombre base — ver Sección 14 del pedido y el
    // comentario "Punto 6" en main.js) antes de construir el registro de
    // correo, para no mostrar el modal de envío con el PDF todavía sin
    // llegar (Sección 14, "IMPORTANTE").
    //
    // Corrección 02 — el modal tardaba SIEMPRE ~10 segundos en abrir aun
    // cuando el .json y el .pdf ya estaban descargados en disco. Causa
    // raíz: cuando el navegador/Electron descarga un archivo y YA existe
    // otro con ese mismo nombre en la carpeta (por ejemplo, de una
    // generación anterior del mismo documento), le agrega automáticamente
    // un sufijo " (1)", " (2)", etc. Si ese sufijo solo lo recibe el
    // .json o solo el .pdf, sus nombres base dejaban de coincidir
    // EXACTAMENTE y el emparejamiento de abajo nunca se completaba.
    // _feCorreoBaseNameNormal le quita ese sufijo antes de comparar, para
    // que ambos archivos del mismo documento se sigan emparejando aunque
    // uno de los dos haya recibido el sufijo de duplicado.
    //
    // Corrección 03 — ANTES, si faltaba uno de los dos archivos, el
    // sistema esperaba un tiempo FIJO (1200 ms, y antes de eso 10000 ms)
    // y luego abría igual "Documento listo para enviar" con solo el JSON,
    // aunque el PDF todavía no hubiera llegado. Eso ya no pasa: ahora NO
    // hay ningún timeout que dispare la apertura del modal por sí solo;
    // "Documento listo para enviar" solo se abre cuando _feCorreoOnDescarga
    // confirma que entry.jsonPath Y entry.pdfPath EXISTEN los dos.
    //
    // Corrección 03 (2da vuelta) — el modal "Procesando documento…" ya
    // NO aparece de inmediato apenas se detecta el .json. Ahora, al
    // detectar el primer archivo del par (.json o .pdf), el sistema
    // arranca una espera de FE_CORREO_PRE_DELAY_MS (~5s) en segundo
    // plano, SIN mostrar todavía ningún modal, para darle tiempo al otro
    // archivo (típicamente el .pdf) de terminar de descargarse. Recién
    // cuando esa espera termina se muestra "Procesando documento…" y se
    // comprueba si los archivos ya están disponibles; si falta alguno,
    // el modal se queda visible esperando el evento real de descarga que
    // falte (sin ningún avance automático por tiempo). El único timer
    // que puede cerrar el modal por sí mismo es _feCorreoStaleTimeout,
    // que no abre nada — es solo una salvaguarda para no dejar la
    // pantalla de carga esperando para siempre si algo sale mal (por
    // ejemplo Hacienda nunca llega a abrir la pestaña del PDF): en ese
    // caso muy excepcional, se oculta la pantalla de carga y se avisa
    // con un mensaje de error, nunca se avanza a "listo para enviar" sin
    // los dos archivos confirmados.
    //
    // El botón "X" del modal (_feCorreoCancelarProcesando) permite al
    // usuario cancelar manualmente esta espera/emparejamiento en
    // cualquier momento: cierra el modal, cancela el armado automático
    // de "Documento listo para enviar" para los documentos que estaban
    // pendientes, y marca sus baseName en _feCorreoCanceladas para que
    // los archivos que terminen de llegar después ya no reabran el
    // modal ni el flujo automático — pero SIN borrar del disco ningún
    // archivo .json/.pdf que ya se haya descargado.
    var _feCorreoPendParEspera = {}; // baseName -> { jsonPath, pdfPath, delayTimer, staleTimer, modalVisible }
    var _feCorreoCanceladas    = {}; // solo limpia/avisa; nunca abre el modal

    function _feCorreoBaseNameNormal(fileName) {
        return fileName.replace(/\.(json|pdf)$/i, '').replace(/\s*\(\d+\)$/, '');
    }

    function _feCorreoOnDescarga(info) {
        if (!info || !info.ok) return;
        if (info.ext !== '.json' && info.ext !== '.pdf') return;
        if (!info.path) return;

        var sep      = info.path.indexOf('\\') > -1 ? '\\' : '/';
        var fileName = info.path.substring(info.path.lastIndexOf(sep) + 1);
        var baseName = _feCorreoBaseNameNormal(fileName);

        // El usuario canceló manualmente el procesamiento de este
        // documento con la "X": se ignora el emparejamiento automático
        // de ahora en más (los archivos ya quedaron guardados en disco,
        // pero no se reabre "Procesando documento…" ni "Documento listo
        // para enviar" para él).
        if (_feCorreoCanceladas[baseName]) return;

        var entry = _feCorreoPendParEspera[baseName];
        if (!entry) { entry = { jsonPath: '', pdfPath: '', delayTimer: null, staleTimer: null, modalVisible: false }; _feCorreoPendParEspera[baseName] = entry; }
        if (info.ext === '.json') entry.jsonPath = info.path;
        if (info.ext === '.pdf')  entry.pdfPath  = info.path;
        if (entry.staleTimer) { clearTimeout(entry.staleTimer); entry.staleTimer = null; }

        if (entry.jsonPath && entry.pdfPath) {
            // Confirmación REAL de que los dos archivos existen. Si el
            // modal "Procesando documento…" todavía no llegó a
            // mostrarse (seguimos dentro de los ~5s de espera en
            // segundo plano), no hace falta mostrarlo: se cancela esa
            // espera y se procede directo. Si ya estaba visible, se
            // cierra al procesar el documento.
            if (entry.delayTimer) { clearTimeout(entry.delayTimer); entry.delayTimer = null; }
            delete _feCorreoPendParEspera[baseName];
            _feCorreoProcesarDocumentoListo(entry.jsonPath, entry.pdfPath);
            return;
        }

        // Todavía falta uno de los dos archivos. Si el modal ya está
        // visible (ya pasaron los ~5s de espera para este documento),
        // simplemente se mantiene mostrado y se sigue esperando el
        // evento real del archivo que falte. Si todavía no se cumplió
        // la espera inicial, no se hace nada más aquí — el propio
        // delayTimer, al cumplirse, se encarga de mostrar el modal y
        // comprobar el estado de los archivos en ese momento.
        if (entry.modalVisible) {
            _feCorreoMostrarProcesando();
            _feCorreoArmarStaleTimer(baseName);
        } else if (!entry.delayTimer) {
            entry.delayTimer = setTimeout(function() {
                _feCorreoTrasEsperaInicial(baseName);
            }, FE_CORREO_PRE_DELAY_MS);
        }
    }

    // Se ejecuta una única vez por documento, transcurridos los ~5s de
    // espera en segundo plano (Corrección 03, 2da vuelta, punto 2/3).
    // Recién aquí se muestra "Procesando documento…" y se comprueba si
    // los archivos necesarios (.json/.pdf) ya están disponibles.
    function _feCorreoTrasEsperaInicial(baseName) {
        var entry = _feCorreoPendParEspera[baseName];
        if (!entry) return; // ya se completó o se canceló mientras tanto
        entry.delayTimer = null;

        if (entry.jsonPath && entry.pdfPath) {
            // Ambos archivos ya llegaron durante la espera inicial: se
            // procede directo, sin necesidad de mostrar el modal.
            delete _feCorreoPendParEspera[baseName];
            _feCorreoProcesarDocumentoListo(entry.jsonPath, entry.pdfPath);
            return;
        }

        // Todavía falta alguno: ahora sí se muestra "Procesando
        // documento…" y se arma la salvaguarda de tiempo máximo.
        entry.modalVisible = true;
        _feCorreoMostrarProcesando();
        _feCorreoArmarStaleTimer(baseName);
    }

    function _feCorreoArmarStaleTimer(baseName) {
        var entry = _feCorreoPendParEspera[baseName];
        if (!entry) return;
        if (entry.staleTimer) return; // ya armado
        entry.staleTimer = setTimeout(function() {
            var pend = _feCorreoPendParEspera[baseName];
            if (!pend) return; // ya se completó el par mientras tanto
            delete _feCorreoPendParEspera[baseName];
            // No hay más documentos pendientes de emparejar: recién ahí
            // se oculta la pantalla de carga (si quedara otro documento
            // en proceso, se mantiene visible por ese otro).
            if (!_feCorreoHayModalesPendientesVisibles()) {
                _feCorreoOcultarProcesando();
            }
            showToast('No se pudo confirmar la descarga completa del documento (.json/.pdf). Vuelve a generarlo desde Hacienda si hace falta.', 'error');
        }, FE_CORREO_STALE_MS);
    }

    function _feCorreoHayModalesPendientesVisibles() {
        for (var k in _feCorreoPendParEspera) {
            if (_feCorreoPendParEspera[k].modalVisible) return true;
        }
        return false;
    }

    // Corrección 03 — Pantalla de carga "Procesando documento…": se
    // muestra recién después de los ~5s de espera en segundo plano
    // (_feCorreoTrasEsperaInicial) y mientras _feCorreoOnDescarga
    // todavía está esperando alguno de los dos archivos (.json/.pdf); se
    // cierra automáticamente en cuanto _feCorreoProcesarDocumentoListo
    // confirma el documento y abre "Documento listo para enviar", o si
    // el usuario la cancela manualmente con la "X".
    function _feCorreoMostrarProcesando() {
        var modal = document.getElementById('feCorreoProcesandoModal');
        if (!modal) return;
        if (modal.classList.contains('modal-open')) return; // ya visible
        modal.style.display = 'flex';
        modal.classList.add('modal-open');
        lucide.createIcons();
    }

    function _feCorreoOcultarProcesando() {
        var modal = document.getElementById('feCorreoProcesandoModal');
        if (!modal) return;
        if (modal.style.display === 'none') return; // ya oculto
        _cerrarModalAnimado('feCorreoProcesandoModal');
    }

    // Botón "X" del modal "Procesando documento…" (Corrección 03, 2da
    // vuelta, punto 5). Cancela manualmente la espera/emparejamiento
    // automático de TODOS los documentos actualmente pendientes: cierra
    // el modal, no abre después "Documento listo para enviar" para
    // ninguno de ellos, y NO borra del disco ningún archivo .json/.pdf
    // que ya se haya descargado — solo deja de esperarlos.
    function _feCorreoCancelarProcesando() {
        Object.keys(_feCorreoPendParEspera).forEach(function(baseName) {
            var entry = _feCorreoPendParEspera[baseName];
            if (entry.delayTimer) clearTimeout(entry.delayTimer);
            if (entry.staleTimer) clearTimeout(entry.staleTimer);
            _feCorreoCanceladas[baseName] = true;
        });
        _feCorreoPendParEspera = {};
        _feCorreoOcultarProcesando();
    }

    // Lee el JSON recién descargado (vía IPC, igual que
    // _correosProcessarArchivosElectron ya hace para la carga manual),
    // arma el documento con _correosExtraerDocumento (MISMA lógica que ya
    // extrae receptor/correo/monto/etc. para el Módulo de Correos DTE) y
    // lo agrega a la cola de correos evitando duplicados (Sección 13:
    // identificador principal = numDoc, ya sea número de control o código
    // de generación, según lo que _correosExtraerDocumento haya resuelto).
    //
    // Solo se llama cuando _feCorreoOnDescarga ya confirmó que el .json Y
    // el .pdf existen los dos — por eso, apenas entra aquí, ya se puede
    // cerrar la pantalla de "Procesando documento…".
    function _feCorreoProcesarDocumentoListo(jsonPath, pdfPath) {
        _feCorreoOcultarProcesando();

        var sep        = jsonPath.indexOf('\\') > -1 ? '\\' : '/';
        var fileName   = jsonPath.substring(jsonPath.lastIndexOf(sep) + 1);
        var folderPath = jsonPath.substring(0, jsonPath.lastIndexOf(sep));

        var readPromise = null;
        if (window.fiscalAPI && window.fiscalAPI.readJson) {
            readPromise = window.fiscalAPI.readJson(folderPath, fileName);
        } else if (window.electronAPI && window.electronAPI.readJson) {
            readPromise = window.electronAPI.readJson(folderPath, fileName);
        }
        if (!readPromise) return;

        readPromise.then(function(json) {
            if (!json || json.error) return;

            // Proyecto FiscalSync FE — se quitó la llamada a
            // _feVentasAutoRegistrar(): clasificaba y agregaba el
            // documento al Libro de Ventas de Gestión (Libros IVA), que no
            // forma parte de este proyecto. La preparación del documento
            // para Correo (abajo) sigue funcionando exactamente igual.

            var doc = _correosExtraerDocumento(json, fileName);
            if (!doc || !doc.numDoc) return;

            doc.jsonPath = jsonPath;
            doc.pdfPath  = pdfPath || '';

            var docs = _correosLoadDocs();
            var existente = docs.find(function(d) { return d.numDoc === doc.numDoc; });

            if (existente) {
                // Sección 13 — ya existe un registro para este documento
                // (por ejemplo, si Hacienda disparó 'will-download' dos
                // veces para el mismo archivo): no se duplica, solo se
                // completan los adjuntos si faltaban.
                var cambio = false;
                if (!existente.jsonPath && doc.jsonPath) { existente.jsonPath = doc.jsonPath; cambio = true; }
                if (!existente.pdfPath  && doc.pdfPath)  { existente.pdfPath  = doc.pdfPath;  cambio = true; }
                if (!existente.codigoGeneracion && doc.codigoGeneracion) { existente.codigoGeneracion = doc.codigoGeneracion; cambio = true; }
                if (cambio) { _correosSaveDocs(docs); _feCorreoActualizarStats(); _feCorreoRefreshActiveTab(); }
                return;
            }

            docs.push(doc);
            _correosSaveDocs(docs);
            _feCorreoActualizarStats();
            _feCorreoRefreshActiveTab();

            // Sección 5 — el documento ya está realmente disponible (los
            // dos archivos confirmados): recién aquí se abre "Documento
            // listo para enviar" — pero SOLO si la empresa activa tiene
            // el módulo de correo configurado (emp.correosActivo, ver
            // Empresas.js). Si no lo tiene, el documento queda igual
            // registrado en la lista de Correos (arriba), pero no se
            // interrumpe al usuario con el modal.
            // AGREGADO NUEVO — Multiempresa: activeEmpresaId nunca se asigna
            // (era de Gestión); _correosGetEmpresaActiva() resuelve la empresa
            // de Facturación Electrónica activa.
            var _empActivaFE = _correosGetEmpresaActiva();
            if (_empActivaFE && _empActivaFE.correosActivo) {
                _feCorreoAbrirModalListoParaEnviar(docs.length - 1);
            }
        }).catch(function() {
            // No se pudo leer/procesar el JSON ya descargado — no dejar
            // la pantalla de carga esperando para siempre.
            _feCorreoOcultarProcesando();
        });
    }

    // ── Panel flotante "Correo" (#feCorreoDropdown) ─────────────────────
    function _feCorreoToggleDropdown(ev) {
        if (ev) ev.stopPropagation();
        var dd = document.getElementById('feCorreoDropdown');
        if (!dd) return;
        if (dd.classList.contains('open')) {
            _feCorreoCerrarDropdown();
        } else {
            _feCorreoAbrirDropdown();
        }
    }

    function _feCorreoAbrirDropdown() {
        var dd = document.getElementById('feCorreoDropdown');
        if (!dd) return;
        dd.classList.add('open');
        _feCorreoShowTab('docs');
        _feCorreoActualizarStats();
        _feCorreoActualizarPosicion(); // AGREGADO (Cambio 03, Caso 2)
        _feConfigActualizarPosicion(); // AGREGADO (Cambio 03)
    }

    function _feCorreoCerrarDropdown() {
        var dd = document.getElementById('feCorreoDropdown');
        if (dd) dd.classList.remove('open');
        _feConfigActualizarPosicion(); // AGREGADO (Cambio 03)
    }

    // Cierra el panel al hacer clic fuera de él (mismo criterio que ya
    // usa #feClientesDropdown, sin tocar ese listener existente).
    document.addEventListener('click', function(e) {
        var dd  = document.getElementById('feCorreoDropdown');
        var btn = document.getElementById('btnFeCorreo');
        if (!dd || !dd.classList.contains('open')) return;
        if (dd.contains(e.target) || (btn && btn.contains(e.target))) return;
        _feCorreoCerrarDropdown();
    });

    // Sección 10/20 — estadísticas del apartado Correo (Documentos,
    // Enviados, Pendientes, Errores) y el badge numérico del botón
    // "Correo" de la barra superior, ambos leídos directo de
    // _correosLoadDocs() (mismo almacenamiento que el módulo completo).
    function _feCorreoActualizarStats() {
        var docs = _correosLoadDocs();
        var pend = docs.filter(function(d) { return d.estado === 'pendiente' || !d.estado; }).length;
        var env  = docs.filter(function(d) { return d.estado === 'enviado'; }).length;
        var err  = docs.filter(function(d) { return d.estado === 'error'; }).length;

        var elT  = document.getElementById('feCorreoStatTotal');
        var elE  = document.getElementById('feCorreoStatEnviados');
        var elP  = document.getElementById('feCorreoStatPendientes');
        var elEr = document.getElementById('feCorreoStatErrores');
        if (elT)  elT.textContent  = docs.length;
        if (elE)  elE.textContent  = env;
        if (elP)  elP.textContent  = pend;
        if (elEr) elEr.textContent = err;

        var badge = document.getElementById('feCorreoBadgePendientes');
        if (badge) {
            if (pend > 0) { badge.style.display = 'inline-flex'; badge.textContent = pend > 99 ? '99+' : String(pend); }
            else { badge.style.display = 'none'; }
        }
    }

    // Sección 8 — lista simplificada de documentos pendientes/recientes.
    // Muestra como mínimo Cliente/Documento/Tipo/Fecha/Correo/Estado —
    // reutilizando las MISMAS clases visuales (.correos-estado-badge,
    // .correos-empty) que ya usa la tabla completa del Módulo de Correos.
    function _feCorreoRenderLista() {
        var cont = document.getElementById('feCorreoLista');
        if (!cont) return;
        var docs = _correosLoadDocs();

        if (docs.length === 0) {
            cont.innerHTML = '<div class="correos-empty"><div class="empty-icon-wrap"><i data-lucide="inbox" style="width:20px;height:20px;color:var(--rp-indigo);"></i></div>' +
                '<p style="font-size:13px;font-weight:500;color:var(--rp-text-secondary);">Sin documentos por correo</p>' +
                '<p style="font-size:11px;color:var(--rp-text-secondary);">Los documentos que generes en Facturación Electrónica aparecerán aquí automáticamente</p></div>';
            lucide.createIcons();
            return;
        }

        // Más recientes primero, conservando el índice real (el mismo que
        // usa el arreglo en disco) para que Enviar/editar correo apunten
        // al documento correcto.
        var conIdx = docs.map(function(d, i) { return { doc: d, realIdx: i }; }).reverse();

        cont.innerHTML = conIdx.map(function(item) {
            var doc = item.doc, realIdx = item.realIdx;
            var badgeCls = doc.estado === 'enviado' ? 'enviado' : (doc.estado === 'error' ? 'error' : 'pendiente');
            var badgeTxt = doc.estado === 'enviado' ? '✓ Enviado' : (doc.estado === 'error' ? '✗ Error' : (doc.estado === 'enviando' ? '↻ Enviando…' : '⏳ Pendiente'));
            var puedeEnviar = doc.estado !== 'enviado' && doc.estado !== 'enviando';

            return '<div class="fe-cor-item">' +
                '<div class="fe-cor-item-top">' +
                    '<div style="min-width:0;">' +
                        '<div style="font-size:12.5px;font-weight:600;color:var(--rp-text-primary);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:230px;" title="' + doc.nombreCliente + '">' + doc.nombreCliente + '</div>' +
                        '<div style="font-size:10px;color:var(--rp-text-secondary);font-family:monospace;margin-top:2px;">' + doc.numDoc + '</div>' +
                        '<div style="font-size:10px;color:var(--rp-text-secondary);margin-top:2px;">' + doc.tipo + (doc.fecha ? ' · ' + doc.fecha : '') + '</div>' +
                    '</div>' +
                    '<span class="correos-estado-badge ' + badgeCls + '" style="white-space:nowrap;flex-shrink:0;">' + badgeTxt + '</span>' +
                '</div>' +
                '<input type="email" value="' + (doc.correoCliente || '') + '" placeholder="Correo del destinatario…" onblur="_feCorreoActualizarCorreoLista(' + realIdx + ',this.value)">' +
                '<div class="fe-cor-item-actions">' +
                    (puedeEnviar
                        ? '<button onclick="_feCorreoEnviarDesdeLista(' + realIdx + ')" class="correos-action-btn primary" style="flex:1;padding:6px 10px;font-size:11px;">Enviar</button>'
                        : '') +
                    '<button onclick="correosEliminarDoc(' + realIdx + ')" class="correos-action-btn secondary" style="flex:1;padding:6px 10px;font-size:11px;">Quitar de la lista</button>' +
                '</div>' +
            '</div>';
        }).join('');
        lucide.createIcons();
    }

    // Cambiar el correo manualmente desde la lista simplificada — reutiliza
    // exactamente correosActualizarCorreo() (Sección 7: el cambio aplica
    // solo al envío de este documento, sin tocar el catálogo de clientes).
    function _feCorreoActualizarCorreoLista(idx, nuevoCorreo) {
        correosActualizarCorreo(idx, nuevoCorreo);
    }

    // Enviar desde la lista simplificada — reutiliza tal cual
    // correosEnviarIndividual() (SMTP, plantilla e historial 100%
    // existentes, ver Sección 6/9/17 del pedido).
    function _feCorreoEnviarDesdeLista(idx) {
        correosEnviarIndividual(idx);
    }

    // ── Pestañas del panel simplificado: Documentos / Historial reciente
    // (Sección 10) — el historial se LEE de _correosLoadHist(), el mismo
    // que ya usa correosRenderHistorial() en el módulo completo; aquí solo
    // se muestran las últimas entradas en un formato compacto, sin
    // duplicar el almacenamiento ni el historial completo.
    var _feCorreoActiveTab = 'docs';

    function _feCorreoShowTab(tab) {
        _feCorreoActiveTab = tab;
        var btnDocs = document.getElementById('feCorreoTabDocsBtn');
        var btnHist = document.getElementById('feCorreoTabHistBtn');
        if (btnDocs) { btnDocs.style.background = tab === 'docs' ? 'var(--rp-indigo)' : ''; btnDocs.style.color = tab === 'docs' ? '#fff' : ''; btnDocs.style.borderColor = tab === 'docs' ? 'transparent' : ''; }
        if (btnHist) { btnHist.style.background = tab === 'hist' ? 'var(--rp-indigo)' : ''; btnHist.style.color = tab === 'hist' ? '#fff' : ''; btnHist.style.borderColor = tab === 'hist' ? 'transparent' : ''; }
        if (tab === 'hist') _feCorreoRenderHistBreve();
        else _feCorreoRenderLista();
    }

    // Refresca lo que esté visible ahora mismo en el panel (Documentos o
    // Historial reciente) sin forzar un cambio de pestaña — usado por los
    // hooks de sincronización (envío, borrado, nuevo documento detectado).
    function _feCorreoRefreshActiveTab() {
        if (_feCorreoActiveTab === 'hist') _feCorreoRenderHistBreve();
        else _feCorreoRenderLista();
    }

    function _feCorreoRenderHistBreve() {
        var cont = document.getElementById('feCorreoLista');
        if (!cont) return;
        var hist = _correosLoadHist();
        if (hist.length === 0) {
            cont.innerHTML = '<div class="correos-empty"><div class="empty-icon-wrap"><i data-lucide="clock" style="width:20px;height:20px;color:var(--rp-indigo);"></i></div>' +
                '<p style="font-size:13px;font-weight:500;color:var(--rp-text-secondary);">Sin envíos registrados</p></div>';
            lucide.createIcons();
            return;
        }
        var recientes = hist.slice().reverse().slice(0, 15);
        cont.innerHTML = recientes.map(function(h) {
            return '<div class="fe-cor-item">' +
                '<div class="fe-cor-item-top">' +
                    '<div style="min-width:0;">' +
                        '<div style="font-size:12.5px;font-weight:600;color:var(--rp-text-primary);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:230px;">' + h.cliente + '</div>' +
                        '<div style="font-size:10px;color:var(--rp-text-secondary);font-family:monospace;margin-top:2px;">' + h.documento + '</div>' +
                        '<div style="font-size:10px;color:var(--rp-text-secondary);margin-top:2px;">' + h.correo + ' · ' + h.fecha + '</div>' +
                    '</div>' +
                    '<span class="correos-estado-badge ' + (h.ok ? 'enviado' : 'error') + '" style="white-space:nowrap;flex-shrink:0;">' + (h.ok ? '✓ Enviado' : '✗ Error') + '</span>' +
                '</div>' +
                (h.error && !h.ok ? '<div style="font-size:9px;color:var(--rp-error);margin-top:6px;">' + h.error + '</div>' : '') +
            '</div>';
        }).join('');
        lucide.createIcons();
    }

    // ── Modal "Documento listo para enviar" (Sección 5) ─────────────────
    function _feCorreoAbrirModalListoParaEnviar(idx) {
        var docs = _correosLoadDocs();
        var doc  = docs[idx];
        if (!doc) return;

        document.getElementById('feCorreoListoIndex').value = idx;
        document.getElementById('feCorreoListoCliente').textContent = doc.nombreCliente || '—';
        document.getElementById('feCorreoListoTipo').textContent    = doc.tipo || '—';
        document.getElementById('feCorreoListoNumero').textContent  = doc.numDoc || '—';
        document.getElementById('feCorreoListoCorreo').value        = doc.correoCliente || '';

        var partesAdj = [];
        if (doc.pdfPath)  partesAdj.push('PDF');
        if (doc.jsonPath) partesAdj.push('JSON');
        document.getElementById('feCorreoListoAdjunto').textContent = partesAdj.length ? partesAdj.join(' + ') : 'Sin adjuntos';

        var modal = document.getElementById('feCorreoListoModal');
        modal.style.display = 'flex';
        modal.classList.add('modal-open');
        lucide.createIcons();
    }

    function _feCorreoListoCerrar() {
        _cerrarModalAnimado('feCorreoListoModal');
    }

    // Guarda el correo (si el usuario lo corrigió) usando la misma función
    // que ya usa el resto del módulo — sin tocar el catálogo de clientes
    // (Sección 7).
    function _feCorreoListoGuardarCorreoEditado() {
        var idx = parseInt(document.getElementById('feCorreoListoIndex').value, 10);
        if (isNaN(idx) || idx < 0) return idx;
        var nuevoCorreo = document.getElementById('feCorreoListoCorreo').value;
        correosActualizarCorreo(idx, nuevoCorreo);
        return idx;
    }

    function _feCorreoListoEnviarAhora() {
        var idx = _feCorreoListoGuardarCorreoEditado();
        _feCorreoListoCerrar();
        if (isNaN(idx) || idx < 0) return;
        correosEnviarIndividual(idx);
    }

    function _feCorreoListoEnviarDespues() {
        var idx = _feCorreoListoGuardarCorreoEditado();
        _feCorreoListoCerrar();
        if (isNaN(idx) || idx < 0) return;
        // El documento ya quedó guardado con estado 'pendiente' (default
        // de _correosExtraerDocumento) — solo se avisa dónde encontrarlo
        // después (Sección 5/9).
        showToast('Documento guardado como pendiente. Podrás enviarlo luego desde "Correo".', 'info');
        _feCorreoActualizarStats();
        _feCorreoRefreshActiveTab();
    }

    // AGREGADO NUEVO (Cambio 03, Caso 2) — mueve Correo al slot de Clientes
    // (right:12px) cuando Clientes está cerrado, o lo regresa a su
    // posición original (right:402px, por CSS base) cuando Clientes está
    // abierto. Solo actúa sobre #feCorreoDropdown; no toca Clientes.
    function _feCorreoActualizarPosicion() {
        var dd = document.getElementById('feCorreoDropdown');
        if (!dd) return;
        var clientes = document.getElementById('feClientesDropdown');
        var clientesAbierto = !!(clientes && clientes.classList.contains('open'));
        dd.classList.toggle('fe-cor-shifted', !clientesAbierto);
    }

    // ════════════════════════════════════════════════════════════════════
    // Proyecto FiscalSync FE — funciones básicas de gestión y envío para
    // el panel compacto de Correo. No se construyó una pantalla aparte
    // ("Correos" completo, con historial extendido y plantillas
    // editables): este panel es la ÚNICA interfaz de correo del proyecto,
    // así que se le agregan aquí las acciones que antes solo vivían en la
    // pantalla completa (correosScreen), reutilizando el mismo motor de
    // Correo.js (_correosLoadDocs/_correosSaveDocs, _correosContextoActivo,
    // etc. — ver Correo.js). No hay "apartado de plantillas": el HTML del
    // correo lo arma siempre el sistema (_correosPlantillaAzulHtml).
    // ════════════════════════════════════════════════════════════════════

    // Selecciona una carpeta y agrega los JSON que encuentre (con su PDF si
    // ya existe junto a él) a la lista de Documentos — para los casos en
    // que un documento no se detectó solo (por ejemplo, generado en una
    // sesión anterior antes de tener la app abierta). Reutiliza tal cual
    // correosSincronizarJsons(), que ya sabe pedir la carpeta por IPC y
    // procesar los archivos encontrados.
    function _feCorreoSincronizarCarpeta() {
        correosSincronizarJsons();
        // correosSincronizarJsons() es asíncrono (espera la respuesta del
        // diálogo de carpeta); se refresca el panel un momento después,
        // una vez que _correosFinalizarCarga ya guardó los documentos.
        setTimeout(function() {
            _feCorreoActualizarStats();
            _feCorreoRefreshActiveTab();
        }, 600);
    }

    // Envía todos los documentos pendientes uno por uno, reutilizando tal
    // cual correosEnviarMasivo() (mismo SMTP, misma plantilla HTML, mismo
    // historial). Esa función ya actualiza el badge de "Correo" sola
    // (correosActualizarStats también escribe en feCorreoBadgePendientes);
    // aquí solo se refresca además la lista visible del panel compacto
    // mientras dura el envío, ya que correosEnviarMasivo no conoce el
    // panel de Facturación Electrónica.
    function _feCorreoEnviarTodosPendientes() {
        var pend = _correosLoadDocs().some(function(d) { return d.estado !== 'enviado'; });
        if (!pend) { showToast('No hay documentos pendientes de envío', 'info'); return; }
        correosEnviarMasivo();
        var poll = setInterval(function() {
            _feCorreoRefreshActiveTab();
            var enCurso = _correosLoadDocs().some(function(d) { return d.estado === 'enviando'; });
            if (!enCurso) { clearInterval(poll); _feCorreoRefreshActiveTab(); }
        }, 700);
    }

    // Vacía el historial de envíos de esta empresa/mes. Reutiliza
    // correosLimpiarHistorial() tal cual (incluye su propio fsConfirm de
    // confirmación); esa función ya refresca el panel compacto por dentro
    // (ver el ajuste en Correo.js).
    function _feCorreoLimpiarHistorial() {
        correosLimpiarHistorial();
    }