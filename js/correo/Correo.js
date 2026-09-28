// correo/Correo.js
// Extraído automáticamente de index.html (FiscalSync) — Fase 2.
// No se modificó ninguna línea de lógica: es exactamente el código original,
// solo reordenado por módulo.



    // ══════════════════════════════════════════════
    // BORRAR TODOS LOS DATOS
    // ══════════════════════════════════════════════
    // ══════════════════════════════════════════════════════════════════
    // MÓDULO CORREOS DTE
    // ══════════════════════════════════════════════════════════════════

    // Cifrado simple XOR para credenciales (ofuscación básica)
    function _correosSimpleCipher(str) {
        var key = 'FiscalSync_K9z!';
        var out = '';
        for (var i = 0; i < str.length; i++) {
            out += String.fromCharCode(str.charCodeAt(i) ^ key.charCodeAt(i % key.length));
        }
        try { return btoa(out); } catch(e) { return out; }
    }
    function _correosDecipher(enc) {
        try {
            var str = atob(enc);
            var key = 'FiscalSync_K9z!';
            var out = '';
            for (var i = 0; i < str.length; i++) {
                out += String.fromCharCode(str.charCodeAt(i) ^ key.charCodeAt(i % key.length));
            }
            return out;
        } catch(e) { return ''; }
    }

    // Corrección 02 — Facturación Electrónica: los documentos/estados de
    // "Correos" se estaban guardando SIEMPRE bajo la empresa/mes de
    // Gestión (activeEmpresaId + currentYear + currentMonth), pero
    // Facturación Electrónica tiene su PROPIA empresa activa
    // (_facturacionElecActiva.empresaId) y su PROPIO "mes de trabajo"
    // (_feAnio/_feMesIndex, ver Corrección 04/06 más arriba) — son
    // variables completamente independientes entre sí. Por eso, al
    // cambiar de mes con las flechas de Facturación Electrónica (o al
    // entrar a Facturación Electrónica sin haber entrado antes a Gestión
    // para esa empresa), la información de correos no se separaba
    // correctamente por empresa+mes: siempre leía/escribía la misma
    // clave (la de Gestión), mezclando o "perdiendo" documentos según
    // cuál mes estuviera abierto en Gestión en ese momento — no el que el
    // usuario veía en pantalla dentro de Facturación Electrónica.
    // _correosContextoActivo() resuelve la empresa+mes correctos según
    // cuál de las dos pantallas está realmente activa en este momento,
    // para que "Correos" siempre lea y guarde en la clave que
    // corresponde a lo que el usuario tiene abierto — sin tocar cómo
    // funciona el módulo de Correos completo (Gestión → Correos), que
    // sigue usando exactamente activeEmpresaId/currentYear/currentMonth
    // como siempre.
    function _correosContextoActivo() {
        var feScreen = document.getElementById('facturacionElectronicaScreen');
        var feActiva = feScreen && feScreen.classList.contains('active');
        if (feActiva && typeof _facturacionElecActiva !== 'undefined' && _facturacionElecActiva.empresaId) {
            return { empresaId: _facturacionElecActiva.empresaId, anio: _feAnio, mes: _feMesIndex };
        }
        return { empresaId: activeEmpresaId, anio: currentYear, mes: currentMonth };
    }

    // Storage keys
    function _correosDocsKey()      { var c = _correosContextoActivo(); return 'fs_correos_docs_v' + APP_VERSION + '_' + (c.empresaId||'_') + '_' + c.anio + '_' + String(c.mes).padStart(2,'0'); }
    function _correosHistKey()      { var c = _correosContextoActivo(); return 'fs_correos_hist_v' + APP_VERSION + '_' + (c.empresaId||'_') + '_' + c.anio + '_' + String(c.mes).padStart(2,'0'); }
    function _correosPlantKey(tipo) { return 'fs_correos_plant_v' + APP_VERSION + '_' + tipo; }

    function _correosLoadDocs()    { try { return JSON.parse(fsStore.getItem(_correosDocsKey()) || '[]'); } catch(e) { return []; } }
    function _correosLoadHist()    { try { return JSON.parse(fsStore.getItem(_correosHistKey()) || '[]'); } catch(e) { return []; } }
    function _correosSaveDocs(d)   { try { fsStore.setItem(_correosDocsKey(), JSON.stringify(d)); } catch(e) {} }
    function _correosSaveHist(h)   { try { fsStore.setItem(_correosHistKey(), JSON.stringify(h)); } catch(e) {} }

    // Plantillas por defecto
    var _correosPlantillasDefault = {
        ccf:  { asunto: 'Comprobante de Crédito Fiscal — {{documento}}', cuerpo: 'Estimado/a {{nombre}},\n\nPor medio del presente le hacemos llegar su Comprobante de Crédito Fiscal N° {{documento}} con fecha {{fecha}} por un monto gravado de {{monto}}.\n\nAdjunto encontrará el documento en formato PDF y JSON del Ministerio de Hacienda.\n\nAtentamente,\n{{emisor}}' },
        cf:   { asunto: 'Factura — {{documento}}', cuerpo: 'Estimado/a {{nombre}},\n\nAdjunto encontrará su Factura de Consumidor Final N° {{documento}} con fecha {{fecha}} por un total de {{monto}}.\n\nAtentamente,\n{{emisor}}' },
        nc:   { asunto: 'Nota de Crédito — {{documento}}', cuerpo: 'Estimado/a {{nombre}},\n\nAdjunto encontrará la Nota de Crédito N° {{documento}} con fecha {{fecha}}.\n\nAtentamente,\n{{emisor}}' },
        nd:   { asunto: 'Nota de Débito — {{documento}}', cuerpo: 'Estimado/a {{nombre}},\n\nAdjunto encontrará la Nota de Débito N° {{documento}} con fecha {{fecha}}.\n\nAtentamente,\n{{emisor}}' },
        ret:  { asunto: 'IVA Retenido — {{documento}}', cuerpo: 'Estimado/a {{nombre}},\n\nAdjunto encontrará el comprobante de IVA Retenido N° {{documento}} con fecha {{fecha}}.\n\nAtentamente,\n{{emisor}}' },
        perc: { asunto: 'IVA Percibido — {{documento}}', cuerpo: 'Estimado/a {{nombre}},\n\nAdjunto encontrará el comprobante de IVA Percibido N° {{documento}} con fecha {{fecha}}.\n\nAtentamente,\n{{emisor}}' },
        fe:   { asunto: 'Factura Electrónica — {{documento}}', cuerpo: 'Estimado/a {{nombre}},\n\nAdjunto encontrará su Factura Electrónica N° {{documento}} con fecha {{fecha}} por un total de {{monto}}.\n\nAtentamente,\n{{emisor}}' }
    };
    // (se quitó var _correosActivePlantTipo — solo la usaba la UI de
    // plantillas ya eliminada, ver más abajo)
    var _correosPendingCallback = null;

    // ── Cargar JSONs de ventas — seleccionar CARPETA (incluye subcarpetas) ──
    function correosSincronizarJsons() {
        // Si Electron expone selectFolder, usarlo para recursividad real
        if (window.electronAPI && window.electronAPI.selectFolderJsons) {
            window.electronAPI.selectFolderJsons().then(function(result) {
                if (!result || !result.files || result.files.length === 0) {
                    showToast('No se seleccionó carpeta o no hay JSONs', 'info');
                    return;
                }
                _correosProcessarArchivosElectron(result.files);
            }).catch(function(e) {
                console.warn('selectFolderJsons error:', e);
                // Fallback a input de carpeta
                _correosTriggerFolderInput();
            });
        } else {
            _correosTriggerFolderInput();
        }
    }

    function _correosTriggerFolderInput() {
        var inp = document.getElementById('correosJsonVentasInput');
        inp.value = '';
        // webkitdirectory permite seleccionar carpeta y sube todos los archivos dentro (incluyendo subcarpetas en Electron)
        inp.setAttribute('webkitdirectory', '');
        inp.setAttribute('multiple', '');
        inp.click();
    }

    function correosOnJsonVentasSelected(files) {
        if (!files || files.length === 0) return;
        // Filtrar solo .json
        var jsonFiles = Array.from(files).filter(function(f) { return f.name.toLowerCase().endsWith('.json'); });
        if (jsonFiles.length === 0) { showToast('No se encontraron archivos JSON en la carpeta seleccionada', 'info'); return; }

        var docs      = _correosLoadDocs();
        var added     = 0;
        var processed = 0;
        var total     = jsonFiles.length;

        showToast('Procesando ' + total + ' JSON(s)…', 'info');

        jsonFiles.forEach(function(file) {
            var reader = new FileReader();
            reader.onload = function(e) {
                processed++;
                try {
                    var json = JSON.parse(e.target.result);
                    var doc  = _correosExtraerDocumento(json, file.name);
                    if (doc && doc.numDoc) {
                        var existe = docs.find(function(d) { return d.numDoc === doc.numDoc; });
                        if (!existe) {
                            var baseName = file.name.replace(/\.json$/i, '');
                            // Asignar paths — en Electron file.path tiene la ruta absoluta
                            if (file.path) {
                                var sep  = file.path.includes('\\') ? '\\' : '/';
                                var dir  = file.path.substring(0, file.path.lastIndexOf(sep) + 1);
                                doc.jsonPath = file.path;
                                doc.pdfPath  = dir + baseName + '.pdf';
                            } else {
                                // webkitRelativePath en browser
                                doc.jsonPath = file.webkitRelativePath || file.name;
                                doc.pdfPath  = '';
                            }
                            docs.push(doc);
                            added++;
                        } else {
                            // Actualizar path si le falta
                            if (!existe.jsonPath && file.path) {
                                existe.jsonPath = file.path;
                                var baseName2 = file.name.replace(/\.json$/i, '');
                                var sep2  = file.path.includes('\\') ? '\\' : '/';
                                var dir2  = file.path.substring(0, file.path.lastIndexOf(sep2) + 1);
                                if (!existe.pdfPath) existe.pdfPath = dir2 + baseName2 + '.pdf';
                            }
                        }
                    }
                } catch(err) { console.warn('JSON inválido:', file.name, err); }

                if (processed === total) {
                    _correosSaveDocs(docs);
                    correosRenderTabla();
                    correosActualizarStats();
                    showToast(added > 0 ? (added + ' documento(s) cargado(s) de ' + total + ' JSON(s)') : 'Todos los documentos ya estaban registrados', added > 0 ? 'success' : 'info');
                }
            };
            reader.readAsText(file);
        });
    }

    // Para cuando Electron devuelve lista de rutas absolutas (selectFolderJsons)
    // Lee el contenido de cada JSON vía IPC (read-json) para respetar contextIsolation
    function _correosProcessarArchivosElectron(fileList) {
        if (!fileList || fileList.length === 0) return;

        var docs      = _correosLoadDocs();
        var added     = 0;
        var processed = 0;
        var total     = fileList.length;

        showToast('Procesando ' + total + ' JSON(s) de subcarpetas…', 'info');

        fileList.forEach(function(filePath) {
            var fileName = filePath.split(/[/\\]/).pop();
            var sep      = filePath.includes('\\') ? '\\' : '/';
            var dir      = filePath.substring(0, filePath.lastIndexOf(sep) + 1);
            var folderPath = dir.replace(/[/\\]$/, '');

            // Leer JSON vía IPC — compatible con contextIsolation:true + nodeIntegration:false
            var readPromise;
            if (window.electronAPI && window.electronAPI.readJson) {
                readPromise = window.electronAPI.readJson(folderPath, fileName);
            } else if (window.fiscalAPI && window.fiscalAPI.readJson) {
                readPromise = window.fiscalAPI.readJson(folderPath, fileName);
            } else {
                // Fallback: ipcRenderer directo
                var ipcR = null;
                try { ipcR = window.require('electron').ipcRenderer; } catch(e) {}
                if (ipcR) {
                    readPromise = ipcR.invoke('read-json', folderPath, fileName);
                } else {
                    processed++;
                    if (processed === total) _correosFinalizarCarga(docs, added, total);
                    return;
                }
            }

            readPromise.then(function(json) {
                try {
                    if (json && !json.error) {
                        var doc = _correosExtraerDocumento(json, fileName);
                        if (doc && doc.numDoc) {
                            var existe = docs.find(function(d) { return d.numDoc === doc.numDoc; });
                            if (!existe) {
                                var baseName = fileName.replace(/\.json$/i, '');
                                doc.jsonPath = filePath;
                                doc.pdfPath  = dir + baseName + '.pdf';
                                docs.push(doc);
                                added++;
                            } else {
                                if (!existe.jsonPath) {
                                    existe.jsonPath = filePath;
                                    var bn2 = fileName.replace(/\.json$/i, '');
                                    if (!existe.pdfPath) existe.pdfPath = dir + bn2 + '.pdf';
                                }
                            }
                        }
                    }
                } catch(err) { console.warn('Error procesando:', filePath, err); }
                processed++;
                if (processed === total) _correosFinalizarCarga(docs, added, total);
            }).catch(function(err) {
                console.warn('Error leyendo via IPC:', filePath, err);
                processed++;
                if (processed === total) _correosFinalizarCarga(docs, added, total);
            });
        });
    }

    function _correosFinalizarCarga(docs, added, total) {
        _correosSaveDocs(docs);
        correosRenderTabla();
        correosActualizarStats();
        showToast(
            added > 0
                ? (added + ' documento(s) cargado(s) de ' + total + ' JSON(s)')
                : 'Todos los documentos ya estaban registrados',
            added > 0 ? 'success' : 'info'
        );
    }


    // ── Cargar PDFs automáticamente por nombre coincidente ──
    // Versión mejorada: selecciona una carpeta y vincula PDFs a TODOS los documentos
    // de la lista cuyo nombre base del JSON coincida con el PDF (igual que el nombre del archivo).
    function correosCargarPdfs() {
        // Preferir Electron IPC para obtener lista de archivos de la carpeta
        if (window.electronAPI && window.electronAPI.selectFolder) {
            window.electronAPI.selectFolder().then(function(folderPath) {
                if (!folderPath) return;
                _correosVincularPdfsDesdeCarpeta(folderPath);
            }).catch(function() {
                _correosFallbackPdfInput();
            });
            return;
        }

        // Capa 2: ipcRenderer directo
        var ipcR = null;
        try { ipcR = window.require('electron').ipcRenderer; } catch(e) {}
        if (ipcR) {
            ipcR.invoke('select-folder').then(function(folderPath) {
                if (!folderPath) return;
                _correosVincularPdfsDesdeCarpeta(folderPath);
            }).catch(function() {
                _correosFallbackPdfInput();
            });
            return;
        }

        // Capa 3: fallback — input de archivos múltiples (comportamiento anterior)
        _correosFallbackPdfInput();
    }

    // Leer archivos de la carpeta vía IPC y vincular PDFs automáticamente
    function _correosVincularPdfsDesdeCarpeta(folderPath) {
        var ipcR = null;
        try { ipcR = window.require('electron').ipcRenderer; } catch(e) {}
        var readPromise;
        if (window.electronAPI && window.electronAPI.readFolder) {
            readPromise = window.electronAPI.readFolder(folderPath);
        } else if (ipcR) {
            readPromise = ipcR.invoke('read-folder', folderPath);
        } else {
            showToast('No se puede leer la carpeta en este entorno', 'error');
            return;
        }

        readPromise.then(function(files) {
            if (!files || files.error) {
                showToast('Error al leer la carpeta: ' + (files && files.error ? files.error : 'desconocido'), 'error');
                return;
            }

            // Construir mapa nombre_base_lower → ruta completa para todos los PDFs de la carpeta
            var sep = folderPath.includes('\\') ? '\\' : '/';
            var pdfMap = {};
            files.forEach(function(f) {
                if (f.ext === '.pdf') {
                    pdfMap[f.name.toLowerCase()] = folderPath + sep + f.full;
                }
            });

            var docs = _correosLoadDocs();
            var vinculados = 0;

            docs.forEach(function(doc) {
                // Obtener el nombre base del JSON vinculado (sin extensión)
                var baseJson = doc.jsonPath
                    ? doc.jsonPath.split(/[/\\]/).pop().replace(/\.json$/i, '').toLowerCase()
                    : '';
                // También intentar por numDoc como fallback
                var baseNum = (doc.numDoc || '').toLowerCase();

                // Buscar coincidencia exacta primero, luego parcial
                var pdfPath = pdfMap[baseJson] || pdfMap[baseNum] || null;

                // Si no hay exacta, buscar si el nombre del PDF contiene el base o viceversa
                if (!pdfPath) {
                    Object.keys(pdfMap).forEach(function(k) {
                        if (!pdfPath && baseJson && (k.indexOf(baseJson) > -1 || baseJson.indexOf(k) > -1)) {
                            pdfPath = pdfMap[k];
                        }
                        if (!pdfPath && baseNum && (k.indexOf(baseNum) > -1 || baseNum.indexOf(k) > -1)) {
                            pdfPath = pdfMap[k];
                        }
                    });
                }

                if (pdfPath) {
                    doc.pdfPath = pdfPath;
                    vinculados++;
                }
            });

            _correosSaveDocs(docs);
            correosRenderTabla();
            showToast(
                vinculados > 0
                    ? vinculados + ' PDF(s) vinculado(s) automáticamente en ' + docs.length + ' documento(s)'
                    : 'No se encontraron coincidencias por nombre en la carpeta seleccionada',
                vinculados > 0 ? 'success' : 'info'
            );
        }).catch(function(e) {
            showToast('Error al leer carpeta: ' + (e && e.message ? e.message : e), 'error');
        });
    }

    function _correosFallbackPdfInput() {
        document.getElementById('correosPdfMasivoInput').value = '';
        document.getElementById('correosPdfMasivoInput').click();
    }

    function correosOnPdfsMasivosSelected(files) {
        if (!files || files.length === 0) return;
        var docs = _correosLoadDocs();
        var vinculados = 0;

        Array.from(files).forEach(function(file) {
            var basePdf = file.name.replace(/\.pdf$/i, '').toLowerCase();
            docs.forEach(function(doc) {
                // Comparar por nombre base del JSON vinculado o del numDoc
                var baseJson = doc.jsonPath
                    ? doc.jsonPath.split(/[/\\]/).pop().replace(/\.json$/i,'').toLowerCase()
                    : '';
                var baseNum = (doc.numDoc || '').toLowerCase();
                if (basePdf === baseJson || basePdf === baseNum || baseJson.indexOf(basePdf) > -1 || basePdf.indexOf(baseNum) > -1) {
                    doc.pdfPath = file.path || file.name;
                    vinculados++;
                }
            });
        });

        _correosSaveDocs(docs);
        correosRenderTabla();
        showToast(vinculados > 0 ? vinculados + ' PDF(s) vinculado(s) automáticamente' : 'No se encontraron coincidencias por nombre', vinculados > 0 ? 'success' : 'info');
    }

    // ── Borrar todos los documentos ──
    function correosBorrarTodos() {
        var docs = _correosLoadDocs();
        if (docs.length === 0) { showToast('No hay documentos para borrar', 'info'); return; }
        fsConfirm('¿Borrar TODOS los documentos de la lista de correos? El historial se mantiene.', function() {
            _correosSaveDocs([]);
            correosRenderTabla();
            correosActualizarStats();
            showToast('Lista de correos vaciada', 'success');
        });
    }


    function _correosExtraerDocumento(json, filename) {
        var doc = {
            numDoc: '', tipo: '', tipoCodigo: '',
            nombreCliente: '', nitCliente: '', correoCliente: '',
            fecha: '', monto: '', estado: 'pendiente',
            pdfPath: '', jsonPath: '', fechaEnvio: '',
            // Implementación 01 — Código de Generación del DTE, usado como
            // nombre base para la búsqueda alternativa de PDF/JSON dentro
            // de la carpeta de Facturación Electrónica cuando doc.pdfPath /
            // doc.jsonPath ya no apuntan a un archivo existente.
            codigoGeneracion: ''
        };

        // Detectar tipo de documento
        var tipoDTE = json.identificacion && json.identificacion.tipoDte
            ? json.identificacion.tipoDte
            : (json.dteJson && json.dteJson.identificacion ? json.dteJson.identificacion.tipoDte : '');

        var tipoMap = { '01':'cf','03':'ccf','04':'nc','05':'nd','06':'fe','07':'ret','08':'perc','09':'perc','11':'fe','14':'fe' };
        var tipoNomMap = { '01':'Consumidor Final','03':'Crédito Fiscal','04':'Nota de Crédito','05':'Nota de Débito','06':'Factura Elec.','07':'IVA Retenido','08':'IVA Percibido','11':'Factura Elec.','14':'Factura Elec.' };

        doc.tipoCodigo = tipoDTE || '';
        doc.tipo       = tipoNomMap[tipoDTE] || (tipoDTE ? 'Tipo ' + tipoDTE : 'Desconocido');

        // Número de documento
        var ident = json.identificacion || (json.dteJson && json.dteJson.identificacion) || {};
        doc.numDoc = ident.numeroControl || ident.codigoGeneracion || filename.replace('.json','');
        doc.fecha  = ident.fecEmi || ident.fechaEmision || '';

        // Implementación 01 — se guarda por separado del código de
        // generación, ya sea que numDoc haya terminado usando el número de
        // control (caso normal) o el propio código de generación como
        // respaldo (ver línea de arriba).
        doc.codigoGeneracion = ident.codigoGeneracion || '';

        // Datos del receptor
        var receptor = json.receptor || (json.dteJson && json.dteJson.receptor) || {};
        doc.nombreCliente = receptor.nombre || receptor.nombreComercial || receptor.razonSocial || 'Sin nombre';
        doc.nitCliente    = receptor.nit || receptor.numDocumento || receptor.dui || '';

        // Detectar correo — buscar en múltiples campos posibles
        doc.correoCliente = receptor.correo || receptor.email || receptor.correoElectronico
            || receptor.mail || receptor.emailAddress || '';

        // Si no hay correo en receptor, buscar en campos de nivel raíz
        if (!doc.correoCliente) {
            doc.correoCliente = json.correo || json.email || json.correoReceptor || '';
        }

        // Monto
        var resumen = json.resumen || (json.dteJson && json.dteJson.resumen) || {};
        var monto = resumen.totalGravada || resumen.totalPagar || resumen.montoTotalOperacion || resumen.totalComprobante || 0;
        doc.monto = parseFloat(monto).toFixed(2);

        return doc;
    }


    // ── Filtro activo ──
    var _correosActiveFiltro = 'todos';

    function correosSetFiltro(filtro) {
        _correosActiveFiltro = filtro;
        ['todos','pendiente','enviado','error'].forEach(function(f) {
            var el = document.getElementById('fchip_' + f);
            if (el) el.className = 'correos-filter-chip' + (f === filtro ? ' active' : '');
        });
        correosRenderTabla();
    }

    // ── Render tabla de documentos ──
    function correosRenderTabla() {
        // Actualizar label de periodo en header
        var periodoEl = document.getElementById('correosperiodoLabel');
        if (periodoEl) periodoEl.textContent = MONTH_NAMES[currentMonth] + ' ' + currentYear;
        var docs   = _correosLoadDocs();
        var busq   = (document.getElementById('correosBusqueda') || {}).value || '';
        busq = busq.toLowerCase();
        var tbody  = document.getElementById('correosTablaBody');
        if (!tbody) return;

        // BUG FIX: docs.indexOf(doc) siempre retorna -1 porque _correosLoadDocs() hace JSON.parse
        // Rastrear índice real durante el forEach
        var filteredWithIdx = [];
        docs.forEach(function(d, i) {
            var matchBusq = !busq ||
                d.nombreCliente.toLowerCase().indexOf(busq) > -1 ||
                d.numDoc.toLowerCase().indexOf(busq) > -1 ||
                (d.correoCliente||'').toLowerCase().indexOf(busq) > -1;
            var matchFiltro = _correosActiveFiltro === 'todos' || d.estado === _correosActiveFiltro;
            if (matchBusq && matchFiltro) filteredWithIdx.push({ doc: d, realIdx: i });
        });

        var countEl = document.getElementById('correosDocCount');
        if (countEl) countEl.textContent = filteredWithIdx.length + ' de ' + docs.length;

        if (filteredWithIdx.length === 0) {
            var msg = docs.length === 0
                ? '<div class="correos-empty"><div class="empty-icon-wrap"><i data-lucide="inbox" style="width:20px;height:20px;color:var(--rp-indigo);"></i></div><p style="font-size:13px;font-weight:500;color:var(--rp-text-secondary);">Sin documentos cargados</p><p style="font-size:11px;color:var(--rp-text-secondary);">Usa <strong style="color:var(--rp-indigo-soft);">Sincronizar Ventas</strong> para cargar automáticamente los documentos del mes</p></div>'
                : '<div class="correos-empty"><div class="empty-icon-wrap"><i data-lucide="search" style="width:20px;height:20px;color:var(--rp-indigo);"></i></div><p style="font-size:13px;font-weight:500;color:var(--rp-text-secondary);">Sin resultados</p></div>';
            tbody.innerHTML = '<tr><td colspan="7" style="padding:20px;">' + msg + '</td></tr>';
            correosActualizarStats();
            lucide.createIcons();
            return;
        }

        tbody.innerHTML = filteredWithIdx.map(function(item) {
            var doc     = item.doc;
            var realIdx = item.realIdx;
            var badgeCls = doc.estado === 'enviado' ? 'enviado' : (doc.estado === 'error' ? 'error' : (doc.estado === 'enviando' ? 'pendiente' : 'pendiente'));
            var badgeTxt = doc.estado === 'enviado' ? '✓ Enviado' : (doc.estado === 'error' ? '✗ Error' : (doc.estado === 'enviando' ? '↻ Enviando…' : '⏳ Pendiente'));
            var hasPdf  = !!doc.pdfPath;
            var hasJson = !!doc.jsonPath;
            var adjIcon = (hasPdf && hasJson) ? '<span style="color:var(--rp-success);font-size:10px;font-weight:600;">PDF + JSON</span>'
                        : hasPdf              ? '<span style="color:var(--rp-success);font-size:10px;font-weight:600;">PDF</span> <span style="color:var(--rp-text-secondary);font-size:10px;">JSON</span>'
                        : hasJson             ? '<span style="color:var(--rp-text-secondary);font-size:10px;">PDF</span> <span style="color:var(--rp-success);font-size:10px;font-weight:600;">JSON</span>'
                        :                       '<span style="color:var(--rp-border-strong);font-size:10px;">Sin adjuntos</span>';

            return '<tr class="correos-tabla-row">' +
                '<td style="padding:12px 16px;">' +
                    '<div style="font-size:12px;color:var(--rp-text-primary);font-weight:500;max-width:150px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="' + doc.nombreCliente + '">' + doc.nombreCliente + '</div>' +
                    (doc.nitCliente ? '<div style="font-size:10px;color:var(--rp-text-secondary);font-family:monospace;margin-top:2px;">' + doc.nitCliente + '</div>' : '') +
                '</td>' +
                '<td style="padding:12px 16px;">' +
                    '<div style="font-size:10px;color:var(--rp-text-secondary);font-family:monospace;max-width:160px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="' + doc.numDoc + '">' + doc.numDoc + '</div>' +
                    (doc.fecha ? '<div style="font-size:9px;color:var(--rp-text-secondary);margin-top:2px;">' + doc.fecha + '</div>' : '') +
                '</td>' +
                '<td style="padding:12px 16px;white-space:nowrap;"><span style="font-size:10px;font-weight:600;color:var(--rp-indigo-soft);background:rgba(99,102,241,0.1);border:1px solid rgba(99,102,241,0.2);padding:2px 9px;border-radius:999px;white-space:nowrap;display:inline-block;">' + doc.tipo + '</span></td>' +
                '<td style="padding:12px 16px;max-width:180px;"><input class="correos-input-edit" value="' + (doc.correoCliente||'') + '" placeholder="Sin correo" onblur="correosActualizarCorreo(' + realIdx + ',this.value)"></td>' +
                '<td style="padding:12px 16px;white-space:nowrap;">' + adjIcon + '</td>' +
                '<td style="padding:12px 16px;white-space:nowrap;">' +
                    '<span class="correos-estado-badge ' + badgeCls + '" style="white-space:nowrap;display:inline-flex;">' + badgeTxt + '</span>' +
                    (doc.fechaEnvio ? '<div style="font-size:9px;color:var(--rp-text-secondary);margin-top:3px;">' + doc.fechaEnvio + '</div>' : '') +
                '</td>' +
                '<td style="padding:12px 16px;text-align:right;white-space:nowrap;">' +
                    '<div style="display:inline-flex;gap:5px;">' +
                    '<button onclick="openAdjuntosModal(' + realIdx + ')" class="correos-icon-btn" title="Vincular adjuntos" style="display:inline-flex;align-items:center;justify-content:center;"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m21.44 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/></svg></button>' +
                    '<button onclick="correosEliminarDoc(' + realIdx + ')" class="correos-icon-btn" title="Eliminar" style="border-color:rgba(248,113,113,0.25);color:var(--rp-error);font-size:13px;">✕</button>' +
                    '<button onclick="correosEnviarIndividual(' + realIdx + ')" class="correos-icon-btn send" title="Enviar este documento" style="width:auto;padding:0 11px;gap:5px;font-size:11px;font-weight:600;"><span>Enviar</span></button>' +
                    '</div>' +
                '</td>' +
            '</tr>';
        }).join('');

        correosActualizarStats();
        lucide.createIcons();
    }

    function correosActualizarStats() {
        var docs  = _correosLoadDocs();
        var pend  = docs.filter(function(d) { return d.estado === 'pendiente' || d.estado === ''; }).length;
        var env   = docs.filter(function(d) { return d.estado === 'enviado'; }).length;
        var err   = docs.filter(function(d) { return d.estado === 'error'; }).length;
        var elT   = document.getElementById('correosStatTotal');
        var elP   = document.getElementById('correosStatPendientes');
        var elE   = document.getElementById('correosStatEnviados');
        var elEr  = document.getElementById('correosStatErrores');
        if (elT)  elT.textContent  = docs.length;
        if (elP)  elP.textContent  = pend;
        if (elE)  elE.textContent  = env;
        if (elEr) elEr.textContent = err;
        // Integración 01 — mantiene el badge del botón "Correo" de
        // Facturación Electrónica al día aunque el cambio venga del
        // Módulo de Correos completo (envío masivo, borrado, etc.).
        var badgeFE = document.getElementById('feCorreoBadgePendientes');
        if (badgeFE) {
            if (pend > 0) { badgeFE.style.display = 'inline-flex'; badgeFE.textContent = pend > 99 ? '99+' : String(pend); }
            else { badgeFE.style.display = 'none'; }
        }
    }

    function correosEliminarDoc(idx) {
        fsConfirm('¿Eliminar este documento de la lista de correos?', function() {
            var docs = _correosLoadDocs();
            docs.splice(idx, 1);
            _correosSaveDocs(docs);
            correosRenderTabla();
            if (typeof _feCorreoRefreshActiveTab === 'function') _feCorreoRefreshActiveTab();
            if (typeof _feCorreoActualizarStats === 'function') _feCorreoActualizarStats();
            showToast('Documento eliminado', 'success');
        });
    }

    // ── Auto-carga desde ventas en memoria ──
    function correosAutoCargarDesdeVentas() {
        var docs = _correosLoadDocs();
        var added = 0;
        var tipoNomMap = { '01':'Consumidor Final','03':'Crédito Fiscal','04':'Nota de Crédito','05':'Nota de Débito','06':'Factura Elec.','07':'IVA Retenido','08':'IVA Percibido','11':'Factura Elec.','14':'Factura Elec.' };

        // Procesar debitoRecords (CCF, NC, ND, etc.)
        (typeof debitoRecords !== 'undefined' ? debitoRecords : []).forEach(function(r) {
            var numId = r.numDoc || r.resolucion || '';
            if (!numId) return;
            var existe = docs.find(function(d) { return d.numDoc === numId; });
            if (!existe) {
                docs.push({
                    numDoc:        numId,
                    tipo:          tipoNomMap[r.tipoDoc] || ('Tipo ' + (r.tipoDoc || '')),
                    tipoCodigo:    r.tipoDoc || '03',
                    nombreCliente: r.nombre  || 'Sin nombre',
                    nitCliente:    r.nit     || r.dui || '',
                    correoCliente: '',
                    fecha:         r.fecha   || '',
                    monto:         parseFloat(r.total || 0).toFixed(2),
                    estado:        'pendiente',
                    pdfPath:       '',
                    jsonPath:      '',
                    fechaEnvio:    ''
                });
                added++;
            }
        });

        // Procesar cfRecords (Consumidor Final)
        (typeof cfRecords !== 'undefined' ? cfRecords : []).forEach(function(r) {
            var numId = r.docDel || r.resolucion || '';
            if (!numId) return;
            var existe = docs.find(function(d) { return d.numDoc === numId; });
            if (!existe) {
                docs.push({
                    numDoc:        numId,
                    tipo:          tipoNomMap[r.tipoDoc] || 'Consumidor Final',
                    tipoCodigo:    r.tipoDoc || '01',
                    nombreCliente: r.nombre  || 'Consumidor Final',
                    nitCliente:    r.nit     || r.dui || '',
                    correoCliente: '',
                    fecha:         r.fecha   || '',
                    monto:         parseFloat(r.total || 0).toFixed(2),
                    estado:        'pendiente',
                    pdfPath:       '',
                    jsonPath:      '',
                    fechaEnvio:    ''
                });
                added++;
            }
        });

        _correosSaveDocs(docs);
        correosRenderTabla();
        correosActualizarStats();
        _correosCheckAutoloadBanner();
        if (added > 0) {
            showToast(added + ' documento(s) sincronizado(s) correctamente', 'success');
        } else {
            showToast('Todo al día — no hay documentos nuevos para sincronizar', 'info');
        }
    }

    function _correosCheckAutoloadBanner() {
        var banner = document.getElementById('correosAutoloadBanner');
        var msgEl  = document.getElementById('correosAutoloadMsg');
        if (!banner) return;
        var total   = (typeof debitoRecords !== 'undefined' ? debitoRecords.length : 0)
                    + (typeof cfRecords     !== 'undefined' ? cfRecords.length     : 0);
        var cargados = _correosLoadDocs().length;
        if (total > 0 && cargados < total) {
            banner.style.display = 'flex';
            if (msgEl) msgEl.textContent = 'Hay ' + (total - cargados) + ' registro(s) de ventas sin sincronizar.';
            lucide.createIcons();
        } else {
            banner.style.display = 'none';
        }
    }

    function correosActualizarCorreo(idx, nuevoCorreo) {
        var docs = _correosLoadDocs();
        if (!docs[idx]) return;
        docs[idx].correoCliente = nuevoCorreo.trim();
        _correosSaveDocs(docs);
    }

    // ── Historial ──
    function correosRenderHistorial() {
        var hist  = _correosLoadHist();
        var tbody = document.getElementById('correosHistorialBody');
        if (!tbody) return;
        if (hist.length === 0) {
            tbody.innerHTML = '<tr><td colspan="5" style="padding:60px 20px;text-align:center;"><div class="correos-empty"><div class="empty-icon-wrap"><i data-lucide="clock" style="width:20px;height:20px;color:var(--rp-indigo);"></i></div><p style="font-size:13px;font-weight:500;color:var(--rp-text-secondary);">Sin envíos registrados</p></div></td></tr>';
            lucide.createIcons();
            return;
        }
        var rows = hist.slice().reverse().map(function(h) {
            return '<tr class="correos-tabla-row">' +
                '<td style="padding:12px 16px;font-size:10px;color:var(--rp-text-secondary);font-family:monospace;">' + h.fecha + '</td>' +
                '<td style="padding:12px 16px;font-size:12px;color:var(--rp-text-primary);font-weight:500;">' + h.cliente + '</td>' +
                '<td style="padding:12px 16px;font-size:10px;color:var(--rp-text-secondary);font-family:monospace;">' + h.documento + '</td>' +
                '<td style="padding:12px 16px;font-size:11px;color:var(--rp-indigo-soft);">' + h.correo + '</td>' +
                '<td style="padding:12px 16px;"><span class="correos-estado-badge ' + (h.ok ? 'enviado' : 'error') + '">' + (h.ok ? '✓ Enviado' : '✗ Error') + '</span>' +
                (h.error && !h.ok ? '<div style="font-size:9px;color:var(--rp-error);margin-top:3px;">' + h.error + '</div>' : '') + '</td>' +
            '</tr>';
        }).join('');
        tbody.innerHTML = rows;
    }

    function correosLimpiarHistorial() {
        fsConfirm('¿Eliminar todo el historial de envíos?', function() {
            try { fsStore.removeItem(_correosHistKey()); } catch(e) {}
            correosRenderHistorial();
            // Proyecto FiscalSync FE — refresca también el panel compacto
            // de Correo dentro de Facturación Electrónica (ver
            // _feCorreoLimpiarHistorial en FECorreo.js), que es la única
            // interfaz de correo de este proyecto.
            if (typeof _feCorreoRefreshActiveTab === 'function') _feCorreoRefreshActiveTab();
            showToast('Historial eliminado', 'success');
        });
    }

    // Proyecto FiscalSync FE — se quitaron correosShowTab() (tabs de la
    // pantalla completa "Correos", eliminada) y todo el "apartado de
    // plantillas" editable (correosSelectTipoPlantilla, correosLoadPlantilla,
    // correosGuardarPlantilla, correosInsertarVar, _correosPlantTipoLabels,
    // _correosActivePlantTipo): los correos se generan siempre con el
    // mismo HTML fijo del sistema (ver _correosPlantillaAzulHtml más abajo)
    // y ya no hay ninguna pantalla donde editar ese texto. La función
    // _correosResolverPlantilla se conserva porque _correosPlantillasDefault
    // (los valores fijos de asunto/cuerpo) sigue siendo la fuente que usa
    // el envío real (ver _correosEnviarDocConAdjuntosListos).

    function _correosResolverPlantilla(plantilla, doc, empresaNombre) {
        return plantilla
            .replace(/{{nombre}}/g,    doc.nombreCliente || '')
            .replace(/{{documento}}/g, doc.numDoc || '')
            .replace(/{{fecha}}/g,     doc.fecha || '')
            .replace(/{{monto}}/g,     '$' + (doc.monto || '0.00'))
            .replace(/{{nit}}/g,       doc.nitCliente || '')
            .replace(/{{tipo}}/g,      doc.tipo || '')
            .replace(/{{emisor}}/g,    empresaNombre || '');
    }

    // ══════════════════════════════════════════════════════════════════
    // AGREGADO NUEVO — Plantilla visual de correo "01 · Azul profesional"
    // ══════════════════════════════════════════════════════════════════
    // Único cambio solicitado: nueva presentación HTML del correo de envío
    // de DTE (resumen del comprobante + sección visual de documentos
    // adjuntos). NO reemplaza la plantilla de texto configurable
    // (asunto/cuerpo por tipo de documento, editable en Gestión → Correos
    // → Configurar plantillas): ese mensaje personalizado se resuelve
    // igual que siempre (_correosResolverPlantilla) y se inserta dentro
    // del encabezado de este diseño, además de seguir enviándose como
    // "text" (alternativa en texto plano para clientes que no rendericen
    // HTML). Esta función es puramente de PRESENTACIÓN: no genera datos
    // ficticios, no toca cálculos ni adjuntos — solo compone el HTML a
    // partir de los mismos campos de "doc" que ya usa el resto del
    // módulo de Correos DTE. Al vivir dentro de _correosEnviarDoc (único
    // punto de envío usado por el botón principal, el reenvío y por
    // Gestión → Correos DTE) queda garantizado que exista una única
    // plantilla para todos los flujos (sección 15 del pedido).
    function _correosEscHtml(str) {
        return String(str == null ? '' : str)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    }

    function _correosFormatearFechaEs(fechaStr) {
        if (!fechaStr) return '';
        var meses = ['ene.','feb.','mar.','abr.','may.','jun.','jul.','ago.','sep.','oct.','nov.','dic.'];
        // Acepta 'YYYY-MM-DD' (formato típico de identificacion.fecEmi en el DTE)
        var m = /^(\d{4})-(\d{2})-(\d{2})/.exec(fechaStr);
        if (m) {
            var y = m[1], mo = parseInt(m[2], 10), d = parseInt(m[3], 10);
            if (mo >= 1 && mo <= 12) return d + ' ' + meses[mo - 1] + ' ' + y;
        }
        return fechaStr; // Si el formato no es reconocido, se muestra tal cual (sin inventar datos)
    }

    function _correosPlantillaAzulHtml(doc, empresaNombre) {
        var C = {
            dark:       '#12305D',
            accent:     '#55A8FF',
            accentDark: '#176BB7',
            soft:       '#EAF4FF',
            border:     '#CFE3F6',
            note:       '#F1F7FD',
            noteText:   '#7B8999',
            footer:     '#EAF3FC',
            footerText: '#6E8196',
            person:     '#FBFCFD',
            white:      '#FFFFFF'
        };

        var nombreReceptor = _correosEscHtml(doc.nombreCliente || 'Cliente');
        var numDoc         = _correosEscHtml(doc.numDoc || '');
        var tipoDoc        = _correosEscHtml(doc.tipo || 'Documento Tributario Electrónico');
        var fecha          = _correosEscHtml(_correosFormatearFechaEs(doc.fecha));
        var nit            = _correosEscHtml(doc.nitCliente || '—');
        var emisor         = _correosEscHtml(empresaNombre || '');
        var monto          = parseFloat(doc.monto || 0).toFixed(2);
        // Saludo fijo del diseño aprobado (no el mensaje configurable
        // completo): esos mismos datos ya se muestran abajo en la tarjeta
        // del comprobante y en "Información del comprobante", así que
        // repetirlos aquí solo generaba un párrafo largo y redundante.
        var mensaje        = 'Hola <strong>' + nombreReceptor + '</strong>. Te enviamos la documentación de tu comprobante electrónico.';

        var partesAdj = [];
        if (doc.pdfPath)  partesAdj.push('pdf');
        if (doc.jsonPath) partesAdj.push('json');

        var docsIncluidosHtml = '';
        if (partesAdj.indexOf('pdf') !== -1) {
            docsIncluidosHtml += '' +
            '<tr><td style="padding-bottom:10px;">' +
                '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:' + C.person + ';border:1px solid ' + C.border + ';border-radius:9px;">' +
                    '<tr>' +
                        '<td style="width:44px;padding:12px;">' +
                            '<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="36" height="36" style="background:' + C.soft + ';border-radius:8px;">' +
                                '<tr><td align="center" valign="middle" style="color:' + C.accentDark + ';font-size:10px;font-weight:700;font-family:Arial,sans-serif;">PDF</td></tr>' +
                            '</table>' +
                        '</td>' +
                        '<td style="padding:12px 12px 12px 0;font-family:Arial,sans-serif;">' +
                            '<div style="font-size:13px;font-weight:600;color:' + C.dark + ';">Comprobante electrónico</div>' +
                            '<div style="font-size:12px;color:#7B8999;margin-top:2px;">Archivo PDF de respaldo</div>' +
                        '</td>' +
                    '</tr>' +
                '</table>' +
            '</td></tr>';
        }
        if (partesAdj.indexOf('json') !== -1) {
            docsIncluidosHtml += '' +
            '<tr><td>' +
                '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:' + C.person + ';border:1px solid ' + C.border + ';border-radius:9px;">' +
                    '<tr>' +
                        '<td style="width:44px;padding:12px;">' +
                            '<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="36" height="36" style="background:' + C.soft + ';border-radius:8px;">' +
                                '<tr><td align="center" valign="middle" style="color:' + C.accentDark + ';font-size:9px;font-weight:700;font-family:Arial,sans-serif;">JSON</td></tr>' +
                            '</table>' +
                        '</td>' +
                        '<td style="padding:12px 12px 12px 0;font-family:Arial,sans-serif;">' +
                            '<div style="font-size:13px;font-weight:600;color:' + C.dark + ';">Documento electrónico firmado</div>' +
                            '<div style="font-size:12px;color:#7B8999;margin-top:2px;">Archivo JSON del DTE</div>' +
                        '</td>' +
                    '</tr>' +
                '</table>' +
            '</td></tr>';
        }
        if (!docsIncluidosHtml) {
            docsIncluidosHtml = '<tr><td style="font-family:Arial,sans-serif;font-size:12px;color:#7B8999;">Sin documentos adjuntos.</td></tr>';
        }

        function infoCard(label, value) {
            return '' +
            '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:' + C.person + ';border:1px solid ' + C.border + ';border-radius:9px;margin-bottom:10px;">' +
                '<tr><td style="padding:12px 14px;font-family:Arial,sans-serif;">' +
                    '<div style="font-size:10px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:' + C.accentDark + ';">' + label + '</div>' +
                    '<div style="font-size:13.5px;font-weight:600;color:' + C.dark + ';margin-top:4px;">' + value + '</div>' +
                '</td></tr>' +
            '</table>';
        }

        var html = '' +
        '<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8">' +
        '<meta name="viewport" content="width=device-width, initial-scale=1.0">' +
        '<title>FiscalSync — Comprobante electrónico</title>' +
        '<meta name="color-scheme" content="light only">' +
        '<meta name="supported-color-schemes" content="light only">' +
        '<style>' +
            'body{margin:0;padding:0;background:#F3F6FA;}' +
            'img{border:0;}' +
            '@media only screen and (max-width:600px){' +
                '.fs-wrap{width:100%!important;}' +
                '.fs-pad{padding-left:16px!important;padding-right:16px!important;}' +
                '.fs-stack td{display:block!important;width:100%!important;}' +
            '}' +
        '</style>' +
        '</head>' +
        '<body bgcolor="#F3F6FA" style="margin:0;padding:0;background:#F3F6FA;">' +
        '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#F3F6FA" style="background:#F3F6FA;">' +
        '<tr><td align="center" style="padding:24px 12px;">' +
        '<table role="presentation" class="fs-wrap" width="600" cellpadding="0" cellspacing="0" border="0" style="width:600px;max-width:100%;">' +

            // 1. Encabezado
            '<tr><td class="fs-pad" style="background:' + C.dark + ';border-radius:14px 14px 0 0;padding:28px 32px;font-family:Arial,sans-serif;">' +
                '<div style="font-size:18px;font-weight:700;color:' + C.white + ';">Fiscal<span style="color:' + C.accent + ';">Sync</span></div>' +
                '<div style="font-size:11px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:' + C.accent + ';margin-top:18px;">Facturación electrónica</div>' +
                '<div style="font-size:22px;font-weight:700;color:' + C.white + ';margin-top:6px;">Tu comprobante está listo</div>' +
                '<div style="font-size:13.5px;line-height:1.6;color:#DCE9FB;margin-top:10px;">' + mensaje + '</div>' +
            '</td></tr>' +

            // 2-5. Contenedor blanco: pega directo con el header azul (sin
            // franja de color intermedia); el espacio de 24-32px que pide
            // el diseño se logra con padding-top, no con una fila de otro
            // color, para que el blanco y el azul queden unidos.
            '<tr><td class="fs-pad" style="background:' + C.white + ';padding:28px 32px 0;">' +

                // 3. Tarjeta del comprobante
                '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:' + C.white + ';border:1px solid ' + C.border + ';border-radius:13px;">' +
                    '<tr><td style="padding:16px 18px;">' +
                        '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>' +
                            '<td style="font-family:Arial,sans-serif;">' +
                                '<div style="font-size:11px;font-weight:700;letter-spacing:.04em;text-transform:uppercase;color:' + C.accentDark + ';">' + tipoDoc + '</div>' +
                                '<div style="font-size:16px;font-weight:700;color:' + C.dark + ';margin-top:4px;font-family:monospace;">#' + numDoc + '</div>' +
                            '</td>' +
                            '<td align="right" valign="top" style="font-family:Arial,sans-serif;">' +
                                '<span style="display:inline-block;background:' + C.soft + ';color:' + C.accentDark + ';font-size:10.5px;font-weight:700;letter-spacing:.03em;padding:5px 10px;border-radius:999px;">✓ EMITIDO</span>' +
                            '</td>' +
                        '</tr></table>' +
                    '</td></tr>' +
                    '<tr><td style="border-top:1px solid ' + C.border + ';"></td></tr>' +
                    '<tr><td style="padding:14px 18px;">' +
                        '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" class="fs-stack"><tr>' +
                            '<td style="font-family:Arial,sans-serif;">' +
                                '<div style="font-size:10.5px;color:#8A97A8;">Fecha</div>' +
                                '<div style="font-size:13px;font-weight:700;color:' + C.dark + ';margin-top:2px;">' + (fecha || '—') + '</div>' +
                            '</td>' +
                            '<td align="right" style="font-family:Arial,sans-serif;">' +
                                '<div style="font-size:10.5px;color:#8A97A8;">Estado</div>' +
                                '<div style="font-size:13px;font-weight:700;color:' + C.dark + ';margin-top:2px;">Documento válido</div>' +
                            '</td>' +
                        '</tr></table>' +
                    '</td></tr>' +
                '</table>' +

                // 5. Total de la operación
                '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:' + C.soft + ';border:1px solid ' + C.border + ';border-radius:11px;margin-top:14px;">' +
                    '<tr><td style="padding:14px 18px;font-family:Arial,sans-serif;">' +
                        '<div style="font-size:10.5px;font-weight:700;letter-spacing:.05em;text-transform:uppercase;color:' + C.accentDark + ';">Total de la operación</div>' +
                        '<div style="font-size:22px;font-weight:700;color:' + C.dark + ';margin-top:4px;">$' + monto + ' <span style="color:' + C.accentDark + ';font-size:13px;font-weight:700;">USD</span></div>' +
                    '</td></tr>' +
                '</table>' +

                // 6. Información del comprobante
                '<div style="font-size:11px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:' + C.dark + ';margin:22px 0 10px;font-family:Arial,sans-serif;">Información del comprobante</div>' +
                infoCard('Emisor', emisor || '—') +
                infoCard('Receptor', nombreReceptor) +
                infoCard('NIT / Documento', nit) +
                infoCard('Tipo', tipoDoc) +
                infoCard('Estado del documento', '✓ Emitido correctamente') +

                // 7. Documentos incluidos
                '<div style="font-size:11px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:' + C.dark + ';margin:12px 0 10px;font-family:Arial,sans-serif;">Documentos incluidos</div>' +
                '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">' + docsIncluidosHtml + '</table>' +

                // 9. Aviso
                '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:' + C.note + ';border-radius:9px;margin:22px 0 24px;">' +
                    '<tr><td style="padding:12px 16px;font-family:Arial,sans-serif;font-size:11.5px;line-height:1.6;color:' + C.noteText + ';">' +
                        'Este correo fue generado automáticamente por FiscalSync.<br>Conserva los archivos adjuntos como respaldo de tu comprobante.' +
                    '</td></tr>' +
                '</table>' +

            '</td></tr>' +

            // 10. Footer
            '<tr><td class="fs-pad" style="background:' + C.footer + ';border-radius:0 0 14px 14px;padding:20px 32px;font-family:Arial,sans-serif;text-align:center;">' +
                '<div style="font-size:12.5px;font-weight:700;"><span style="color:' + C.dark + ';">FiscalSync</span> <span style="color:' + C.footerText + ';font-weight:400;">— Facturación Electrónica</span></div>' +
                '<div style="font-size:11px;color:' + C.footerText + ';margin-top:6px;">© ' + (new Date().getFullYear()) + ' FiscalSync. Todos los derechos reservados.</div>' +
                '<div style="font-size:10.5px;color:' + C.footerText + ';margin-top:4px;">Mensaje automático · No responder directamente a este correo.</div>' +
            '</td></tr>' +

        '</table>' +
        '</td></tr>' +
        '</table>' +
        '</body></html>';

        return html;
    }

    // Proyecto FiscalSync FE — se quitaron openCorreosConfigModal(),
    // closeCorreosConfigModal() y correosGuardarConfig(): ese modal
    // (correosConfigModal, en la pantalla completa "Correos" ya eliminada)
    // duplicaba lo que ahora se edita directamente desde "Editar Empresa"
    // (ver openEmpresaModal(0) en Empresas.js, sección "Módulo de Correos
    // DTE"). Además dependía de activeEmpresaId, que ya no se usa en este
    // proyecto (no hay modo Gestión).

    // ── Clave maestra ELIMINADA — envío directo sin confirmación ──
    function _correosAbrirClaveMaestra(msg, callback) {
        // Clave maestra eliminada — ejecutar callback directamente
        if (callback) callback();
    }
    function closeClaveMaestraModal() {}
    function correosVerificarClave() {}

    // ── Adjuntos modal ──
    function openAdjuntosModal(idx) {
        var docs = _correosLoadDocs();
        var doc  = docs[idx];
        if (!doc) return;
        document.getElementById('adjuntosDocIndex').value = idx;
        document.getElementById('adjuntosModalTitle').textContent = 'Adjuntos — ' + doc.numDoc;
        document.getElementById('adjuntosPdfPath').value  = doc.pdfPath  || '';
        document.getElementById('adjuntosJsonPath').value = doc.jsonPath || '';
        document.getElementById('correosAdjuntosModal').style.display = 'flex';
        document.getElementById('correosAdjuntosModal').classList.add('modal-open');
        lucide.createIcons();
    }
    function closeAdjuntosModal() {
        _cerrarModalAnimado('correosAdjuntosModal');
    }
    function correosSeleccionarPdf() {
        document.getElementById('adjuntosPdfInput').value = '';
        document.getElementById('adjuntosPdfInput').click();
    }
    function correosSeleccionarJson() {
        document.getElementById('adjuntosJsonInput').value = '';
        document.getElementById('adjuntosJsonInput').click();
    }
    function correosOnPdfSelected(input) {
        if (input.files && input.files[0]) {
            document.getElementById('adjuntosPdfPath').value = input.files[0].path || input.files[0].name;
        }
    }
    function correosOnJsonSelected(input) {
        if (input.files && input.files[0]) {
            document.getElementById('adjuntosJsonPath').value = input.files[0].path || input.files[0].name;
        }
    }
    function correosGuardarAdjuntos() {
        var idx  = parseInt(document.getElementById('adjuntosDocIndex').value);
        var docs = _correosLoadDocs();
        if (!docs[idx]) return;
        docs[idx].pdfPath  = document.getElementById('adjuntosPdfPath').value.trim();
        docs[idx].jsonPath = document.getElementById('adjuntosJsonPath').value.trim();
        _correosSaveDocs(docs);
        correosRenderTabla();
        closeAdjuntosModal();
        showToast('Adjuntos guardados', 'success');
    }

    // ── Envío ──
    // Corrección 02 — CAUSA RAÍZ de "el correo no está configurado" al
    // enviar desde Facturación Electrónica: esta función usaba siempre
    // activeEmpresaId, pero _entrarModoFacturacionElectronica() NUNCA
    // asigna activeEmpresaId (esa variable es propia de Gestión — ver
    // _entrarModoGestion). Si el usuario entraba a Facturación Electrónica
    // sin haber entrado antes a Gestión para esa misma empresa en la
    // sesión, activeEmpresaId quedaba en null (o apuntando a otra
    // empresa), así que aquí no se encontraba la empresa correcta aunque
    // sí tuviera correo configurado — de ahí el mensaje de error. Ejecutar
    // "Probar Conexión" (que se hace desde Gestión → Correos) de casualidad
    // dejaba activeEmpresaId ya apuntando a la empresa correcta, y por eso
    // "arreglaba" el problema hasta la próxima vez.
    // _correosContextoActivo() (ya usado para las claves de
    // almacenamiento de documentos/historial) ya resuelve exactamente esto:
    // usa la empresa de Facturación Electrónica (_facturacionElecActiva)
    // cuando esa pantalla está activa, y activeEmpresaId en cualquier otro
    // caso (Gestión → Correos, comportamiento igual que siempre). Se
    // reutiliza aquí para que el envío de correos siempre encuentre la
    // configuración de la empresa correcta, sin necesidad del Test de
    // Conexión como paso previo.
    function _correosGetEmpresaActiva() {
        var empresaId = _correosContextoActivo().empresaId;
        return empresas.find(function(e) { return e.id === empresaId; });
    }

    // Implementación 01 — Antes de armar los adjuntos, intenta localizar el
    // PDF/JSON real del documento: primero en doc.pdfPath/doc.jsonPath (como
    // siempre), y si esas rutas ya no existen, en la carpeta de Facturación
    // Electrónica de la empresa/mes de este documento (misma estructura de
    // carpetas existente — ver _feGetFacturacionDir en main.js). No crea,
    // copia ni mueve archivos: solo localiza rutas y, si encuentra algo en
    // la segunda ubicación, actualiza doc.pdfPath/doc.jsonPath para no tener
    // que volver a buscarlo en el futuro. Si no hay canal IPC disponible
    // (electronAPI.resolverAdjuntosCorreo), continúa sin cambios — igual que
    // el comportamiento anterior.
    function _correosResolverAdjuntos(doc, idx, callback) {
        if (!window.electronAPI || !window.electronAPI.resolverAdjuntosCorreo) { callback(); return; }

        var c            = _correosContextoActivo();
        var mesLabel      = MONTH_NAMES[c.mes] + ' ' + c.anio;
        var emp           = empresas.find(function(e) { return e.id === c.empresaId; });
        var empresaNombre = emp ? emp.razon : 'Empresa';

        window.electronAPI.resolverAdjuntosCorreo({
            pdfPath:       doc.pdfPath  || '',
            jsonPath:      doc.jsonPath || '',
            mesLabel:      mesLabel,
            empresaNombre: empresaNombre,
            codigoBase:    doc.codigoGeneracion || ''
        }).then(function(res) {
            if (!res || res.error) { callback(); return; }

            var cambio = false;
            if (res.pdfOrigen === 'facturacion' && res.pdfPath) { doc.pdfPath = res.pdfPath; cambio = true; }
            if (res.jsonOrigen === 'facturacion' && res.jsonPath) { doc.jsonPath = res.jsonPath; cambio = true; }

            // Persistir las rutas encontradas para no repetir la búsqueda
            // en próximos envíos de este mismo documento (Sección 6).
            if (cambio && typeof idx === 'number') {
                var docs = _correosLoadDocs();
                if (docs[idx]) {
                    docs[idx].pdfPath  = doc.pdfPath;
                    docs[idx].jsonPath = doc.jsonPath;
                    _correosSaveDocs(docs);
                }
            }

            // Aviso no bloqueante si, después de ambas búsquedas, algún
            // archivo sigue sin encontrarse (Sección 9) — el envío continúa
            // igual (main.js filtra adjuntos inexistentes, comportamiento
            // sin cambios).
            if (!res.pdfPath)  showToast('No se encontró el PDF del DTE: ' + (doc.numDoc || ''), 'error');
            if (!res.jsonPath) showToast('No se encontró el JSON del DTE: ' + (doc.numDoc || ''), 'error');

            callback();
        }).catch(function() { callback(); });
    }

    function _correosEnviarDoc(doc, idx, onDone) {
        var emp = _correosGetEmpresaActiva();
        if (!emp || !emp.correosEmail) { onDone(false, 'Sin correo configurado. Ve a Configuración.'); return; }
        if (!emp.correosPass)          { onDone(false, 'Sin contraseña de aplicación. Ve a Configuración.'); return; }
        if (!doc.correoCliente)        { onDone(false, 'Sin correo de destinatario en: ' + doc.numDoc); return; }

        // Implementación 01 — localizar PDF/JSON (ruta actual o, en su
        // defecto, carpeta de Facturación Electrónica) antes de construir
        // los adjuntos del correo.
        _correosResolverAdjuntos(doc, idx, function() {
            _correosEnviarDocConAdjuntosListos(doc, emp, onDone);
        });
    }

    function _correosEnviarDocConAdjuntosListos(doc, emp, onDone) {
        var emailFrom = emp.correosEmail;
        var passRaw   = _correosDecipher(emp.correosPass);
        var tipo      = doc.tipoCodigo;
        var tipoMap2  = { '01':'cf','03':'ccf','04':'nc','05':'nd','06':'fe','07':'ret','08':'perc','11':'fe','14':'fe' };
        var plantTipo = tipoMap2[tipo] || 'ccf';

        var stored    = fsStore.getItem(_correosPlantKey(plantTipo));
        var plantilla = stored ? JSON.parse(stored) : (_correosPlantillasDefault[plantTipo] || { asunto:'Documento {{documento}}', cuerpo:'Estimado/a {{nombre}}, adjunto su documento.' });
        var asunto    = _correosResolverPlantilla(plantilla.asunto, doc, emp.razon);
        var cuerpo    = _correosResolverPlantilla(plantilla.cuerpo, doc, emp.razon);

        // Adjuntos — sin verificar existencia (main.js lo hace con fs.existsSync)
        var attachments = [];
        if (doc.pdfPath)  attachments.push({ path: doc.pdfPath });
        if (doc.jsonPath) attachments.push({ path: doc.jsonPath });

        // AGREGADO NUEVO — Plantilla visual "01 · Azul profesional"
        // (única plantilla para envío inicial, reenvío y Gestión → Correos
        // DTE, ya que todos pasan por esta misma función). "text" se
        // conserva sin cambios como alternativa en texto plano (usa el
        // mensaje configurable completo); el HTML usa el saludo corto del
        // diseño aprobado para no repetir los mismos datos dos veces.
        var cuerpoHtml = _correosPlantillaAzulHtml(doc, emp.razon);

        var mailOptions = {
            from:        emailFrom,
            to:          doc.correoCliente,
            cc:          doc.correoCC  || '',
            bcc:         doc.correoBCC || '',
            subject:     asunto,
            text:        cuerpo,
            html:        cuerpoHtml,
            attachments: attachments
        };

        var smtpConfig = {
            host:              'smtp.gmail.com',
            port:              465,
            secure:            true,
            auth:              { user: emailFrom, pass: passRaw },
            connectionTimeout: 30000,
            greetingTimeout:   15000,
            socketTimeout:     30000
        };

        // CAPA 1: electronAPI.sendEmail (contextBridge — preload.js)
        if (window.electronAPI && window.electronAPI.sendEmail) {
            window.electronAPI.sendEmail({ mailOptions: mailOptions, smtpConfig: smtpConfig })
                .then(function(res) {
                    if (res && res.error) { onDone(false, 'SMTP: ' + res.error); return; }
                    onDone(true, '');
                })
                .catch(function(err) {
                    onDone(false, 'IPC error: ' + (err && err.message ? err.message : String(err)));
                });
            return;
        }

        // CAPA 2: fiscalAPI no tiene sendEmail — saltar

        // CAPA 3: ipcRenderer directo
        var ipcRenderer = null;
        try { ipcRenderer = window.require('electron').ipcRenderer; } catch(e) {}
        if (ipcRenderer) {
            ipcRenderer.invoke('send-email', { mailOptions: mailOptions, smtpConfig: smtpConfig })
                .then(function(res) {
                    if (res && res.error) { onDone(false, 'SMTP: ' + res.error); return; }
                    onDone(true, '');
                })
                .catch(function(err) {
                    onDone(false, 'IPC directo error: ' + (err && err.message ? err.message : String(err)));
                });
            return;
        }

        // Sin canal disponible
        onDone(false, 'No se detectó canal Electron. Verifica preload.js y reinicia la app.');
    }

    function _correosRegistrarEnHistorial(doc, ok, errorMsg) {
        var hist = _correosLoadHist();
        var now  = new Date();
        var fechaStr = now.toLocaleDateString('es-SV') + ' ' + now.toLocaleTimeString('es-SV', { hour:'2-digit', minute:'2-digit' });
        hist.push({ fecha: fechaStr, cliente: doc.nombreCliente, documento: doc.numDoc, correo: doc.correoCliente, ok: ok, error: errorMsg || '' });
        _correosSaveHist(hist);
    }

    // ── Barra de progreso de envío masivo ──
    function _correosShowProgress(current, total, label) {
        var wrap = document.getElementById('correosProgressWrap');
        var bar  = document.getElementById('correosProgressBar');
        var txt  = document.getElementById('correosProgressTxt');
        var sub  = document.getElementById('correosProgressSub');
        if (!wrap) return;
        var pct = total > 0 ? Math.round((current / total) * 100) : 0;
        wrap.style.display = 'block';
        bar.style.width    = pct + '%';
        txt.textContent    = current + ' / ' + total + ' (' + pct + '%)';
        sub.textContent    = label || '';
    }
    function _correosHideProgress() {
        var wrap = document.getElementById('correosProgressWrap');
        if (wrap) wrap.style.display = 'none';
    }

    function correosEnviarMasivo() {
        var allDocsPre = _correosLoadDocs();
        var pendientesConIdx = [];
        allDocsPre.forEach(function(d, i) {
            if (d.estado !== 'enviado') pendientesConIdx.push({ doc: d, realIdx: i });
        });
        if (pendientesConIdx.length === 0) { showToast('No hay documentos pendientes de envío', 'info'); return; }

        var total    = pendientesConIdx.length;
        var enviados = 0;
        var errores  = 0;

        _correosShowProgress(0, total, 'Preparando envío…');
        showToast('Iniciando envío de ' + total + ' correo(s)…', 'info');

        function enviarSiguiente(i) {
            if (i >= pendientesConIdx.length) {
                _correosHideProgress();
                correosRenderTabla();
                correosRenderHistorial();
                correosActualizarStats();
                showToast('Envío completado: ' + enviados + ' enviado(s), ' + errores + ' error(es)', enviados > 0 ? 'success' : 'error');
                return;
            }
            var item    = pendientesConIdx[i];
            var doc     = item.doc;
            var realIdx = item.realIdx;

            _correosShowProgress(i, total, 'Enviando: ' + (doc.correoCliente || doc.numDoc));

            var prepDocs = _correosLoadDocs();
            if (prepDocs[realIdx]) { prepDocs[realIdx].estado = 'enviando'; _correosSaveDocs(prepDocs); correosRenderTabla(); }

            _correosEnviarDoc(doc, realIdx, function(ok, errMsg) {
                var allDocs2 = _correosLoadDocs();
                if (allDocs2[realIdx]) {
                    allDocs2[realIdx].estado     = ok ? 'enviado' : 'error';
                    allDocs2[realIdx].fechaEnvio = ok ? new Date().toLocaleDateString('es-SV') : '';
                    if (!ok) allDocs2[realIdx].errorMsg = errMsg || '';
                    _correosSaveDocs(allDocs2);
                }
                _correosRegistrarEnHistorial(doc, ok, errMsg);
                if (ok) enviados++; else errores++;
                _correosShowProgress(i + 1, total, ok ? ('✓ ' + doc.correoCliente) : ('✗ Error: ' + doc.numDoc));
                correosRenderTabla();
                enviarSiguiente(i + 1);
            });
        }
        enviarSiguiente(0);
    }

    function correosEnviarIndividual(idx) {
        var docs = _correosLoadDocs();
        var doc  = docs[idx];
        if (!doc) { showToast('Error: documento no encontrado en índice ' + idx, 'error'); return; }
        if (!doc.correoCliente) { showToast('Sin correo de destinatario en: ' + (doc.numDoc||'este documento'), 'error'); return; }
        showToast('Enviando a ' + doc.correoCliente + '…', 'info');
        var prep = _correosLoadDocs();
        if (prep[idx]) { prep[idx].estado = 'enviando'; _correosSaveDocs(prep); correosRenderTabla(); }
        // Integración 01 — mantiene sincronizado el panel simplificado de
        // Facturación Electrónica (#feCorreoDropdown) sin duplicar lógica de
        // envío: solo refresca su lista/estadísticas si está presente.
        if (typeof _feCorreoRefreshActiveTab === 'function') _feCorreoRefreshActiveTab();
        if (typeof _feCorreoActualizarStats === 'function') _feCorreoActualizarStats();
        _correosEnviarDoc(doc, idx, function(ok, errMsg) {
            var allDocs = _correosLoadDocs();
            if (allDocs[idx]) {
                allDocs[idx].estado     = ok ? 'enviado' : 'error';
                allDocs[idx].fechaEnvio = ok ? new Date().toLocaleDateString('es-SV') : '';
                if (!ok) allDocs[idx].errorMsg = errMsg || '';
                _correosSaveDocs(allDocs);
            }
            _correosRegistrarEnHistorial(doc, ok, errMsg);
            correosRenderTabla();
            correosActualizarStats();
            if (typeof _feCorreoRefreshActiveTab === 'function') _feCorreoRefreshActiveTab();
            if (typeof _feCorreoActualizarStats === 'function') _feCorreoActualizarStats();
            showToast(ok ? ('✓ Enviado a ' + doc.correoCliente) : ('✗ Error: ' + errMsg), ok ? 'success' : 'error');
        });
    }

    // ══════════════════════════════════════════════════════════════════
    // ── Test de conexión SMTP ──
    function correosTestConexion() {
        var emp = _correosGetEmpresaActiva();
        if (!emp || !emp.correosEmail || !emp.correosPass) {
            showToast('Configura el correo y contraseña primero', 'error'); return;
        }
        var email   = emp.correosEmail;
        var passRaw = _correosDecipher(emp.correosPass);
        var smtpConfig = { host:'smtp.gmail.com', port:465, secure:true, auth:{ user:email, pass:passRaw }, connectionTimeout:15000 };
        var testMail   = { from:email, to:email, subject:'FiscalSync — Test de conexión', text:'Conexión SMTP correcta desde FiscalSync.' };

        showToast('Probando conexión SMTP…', 'info');

        // Capa 1 electronAPI
        if (window.electronAPI && window.electronAPI.sendEmail) {
            window.electronAPI.sendEmail({ mailOptions:testMail, smtpConfig:smtpConfig })
                .then(function(r){ showToast(r && r.error ? ('Error: ' + r.error) : 'Conexión OK — correo de prueba enviado a ' + email, r && r.error ? 'error' : 'success'); })
                .catch(function(e){ showToast('Error: ' + (e.message||e), 'error'); });
            return;
        }
        // Capa 2 ipcRenderer
        var ipcR = null;
        try { ipcR = window.require('electron').ipcRenderer; } catch(e){}
        if (ipcR) {
            ipcR.invoke('send-email', { mailOptions:testMail, smtpConfig:smtpConfig })
                .then(function(r){ showToast(r && r.error ? ('Error: '+r.error) : 'Conexión OK — correo de prueba enviado', r && r.error ? 'error' : 'success'); })
                .catch(function(e){ showToast('Error: '+(e.message||e), 'error'); });
            return;
        }
        // Capa 3 nodemailer
        try {
            var nm = window.require('nodemailer');
            nm.createTransport(smtpConfig).sendMail(testMail, function(err){
                showToast(err ? ('Error: '+(err.message||err)) : 'Conexión OK', err ? 'error' : 'success');
            });
            return;
        } catch(e){}
        showToast('No se detectó entorno Electron/Node. Asegúrate de ejecutar la app como aplicación Electron.', 'error');
    }
    // AGREGADO NUEVO: búsqueda profunda de una clave dentro del .json completo,
    // sin importar en qué nivel de anidamiento la coloque el proveedor de
    // facturación electrónica. Se usa como respaldo cuando gv() con rutas fijas
    // no encuentra el valor (algunos .json ubican "selloRecibido" en posiciones
    // distintas a identificacion/raíz/respuestaMH).
    function buscarClaveProfundo(obj, clave, maxDepth) {
        if (maxDepth === undefined) maxDepth = 6;
        if (!obj || typeof obj !== 'object' || maxDepth < 0) return '';
        var claveLower = clave.toLowerCase();
        for (var key in obj) {
            if (!Object.prototype.hasOwnProperty.call(obj, key)) continue;
            if (key.toLowerCase() === claveLower) {
                var val = obj[key];
                if (val !== undefined && val !== null && val !== '' && typeof val !== 'object') return val;
            }
        }
        for (var key2 in obj) {
            if (!Object.prototype.hasOwnProperty.call(obj, key2)) continue;
            var child = obj[key2];
            if (child && typeof child === 'object') {
                var found = buscarClaveProfundo(child, clave, maxDepth - 1);
                if (found !== '') return found;
            }
        }
        return '';
    }