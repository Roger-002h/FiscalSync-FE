// js/facturacion-electronica/FEReportes.js
// AGREGADO NUEVO — Módulo de Reportes DTE.
// ─────────────────────────────────────────────────────────────────────────
// Genera el Anexo 1 (Crédito Fiscal: Comprobante de Crédito Fiscal / Nota
// de Crédito / Nota de Débito) y el Anexo 2 (Consumidor Final / Exportación
// de Servicios) del Libro de Ventas de Hacienda, en PDF y en CSV, para un
// rango de fechas.
//
// Reutiliza (no duplica):
//   - window.fiscalAPI.onFacturacionDescarga  → captura de documentos, ya
//     existente (ver main.js / FacturacionElectronica.js). Este módulo solo
//     agrega un segundo listener sobre el mismo evento, sin tocar el que ya
//     usa el módulo de Correo.
//   - window.fiscalAPI.readJson                → lectura del JSON ya guardado.
//   - fsStore (core/utilidades.js)              → persistencia en disco,
//     mismo patrón que usa Empresas.js.
//   - gv / gn (core/utilidades.js)               → lectura segura de rutas
//     anidadas dentro del JSON de Hacienda.
//   - FiscalSyncCat002 (data/cat002.js)          → catálogo CAT-002.
//   - fsAlert / showToast                        → avisos, ya existentes.
//   - emp.tipoIng (Empresas.js)                  → columna "tipoIng" del
//     Anexo 1/2, uno por empresa, no por documento.
//
// Adaptado (con cambios) del patrón de mapJsonToDebito / mapJsonToCf de
// ImportacionJSON.js (proyecto de referencia): se quitó todo lo que
// dependía de loadClientes()/catálogo de clientes con condición de
// operación, que no existe en FiscalSync-FE.
// ─────────────────────────────────────────────────────────────────────────

(function () {

    // ══════════════════════════════════════════════════════════════════
    // CONSTANTES
    // ══════════════════════════════════════════════════════════════════
    var FE_REPORTES_STORE_KEY = 'fe_reportes_docs_v1';
    var FE_ENVDOC_CORREO_KEY = 'fe_envdoc_correo_v1'; // último correo de destino de "Enviar Documentación" (uno por empresa)

    // Tipos CAT-002 que corresponden a cada anexo (confirmado con el
    // usuario: por ahora Anexo 1 solo maneja 03/05/06; Anexo 2 cubre
    // Consumidor Final y Exportación de Servicios).
    var TIPOS_ANEXO1 = ['03', '05', '06'];
    var TIPOS_ANEXO2 = ['01', '11'];
    var TIPO_EXPORTACION = '11';

    // Catálogo oficial "Tipo de Operación" (Renta/IVA) — el usuario lo
    // proporcionó completo; los códigos 12/13 no se detectan de forma
    // automática (no hay ninguna cantidad en el JSON que los distinga),
    // así que solo están disponibles para selección manual.
    var TIPO_OP_CATALOGO = [
        { codigo: '0',  nombre: 'Período Anterior Enero 2025' },
        { codigo: '1',  nombre: 'Gravada' },
        { codigo: '2',  nombre: 'No Gravada o Exento' },
        { codigo: '3',  nombre: 'Excluido o no Constituye Renta' },
        { codigo: '4',  nombre: 'Mixta' },
        { codigo: '12', nombre: 'Ingresos sujetos de retención en F910' },
        { codigo: '13', nombre: 'Sujetos pasivos excluidos' }
    ];

    // Mapeo del <select> único "Tipo de reporte" (5 opciones exactas
    // pedidas por el usuario) hacia qué anexo(s) buscar y en qué formato
    // generar. "general-pdf" es el único que combina ambos anexos, y
    // siempre en un solo PDF (no existe una versión CSV combinada).
    var FE_REP_TIPOS = {
        'anexo1-csv':  { anexos: [1],    formato: 'csv' },
        'anexo2-csv':  { anexos: [2],    formato: 'csv' },
        'anexo1-pdf':  { anexos: [1],    formato: 'pdf' },
        'anexo2-pdf':  { anexos: [2],    formato: 'pdf' },
        'general-pdf': { anexos: [1, 2], formato: 'pdf' }
    };

    // Estado en memoria de la sesión de reportes actual (se reconstruye
    // cada vez que se abre el panel / se presiona "Buscar documentos").
    var _feRepTipoSeleccionado = 'anexo1-csv'; // clave de FE_REP_TIPOS (1ra opción del select)
    var _feRepResultados = [];             // registros filtrados de la última búsqueda
    var _feRepDocsCache = null;             // cache en memoria de todos los documentos capturados

    // ══════════════════════════════════════════════════════════════════
    // PERSISTENCIA — mismo patrón que Empresas.js (fsStore + flushNow)
    // ══════════════════════════════════════════════════════════════════
    function _feRepCargarDocs() {
        if (_feRepDocsCache !== null) return _feRepDocsCache;
        try {
            var raw = fsStore.getItem(FE_REPORTES_STORE_KEY);
            _feRepDocsCache = raw ? JSON.parse(raw) : [];
        } catch (e) {
            _feRepDocsCache = [];
        }
        if (!Array.isArray(_feRepDocsCache)) _feRepDocsCache = [];
        // AGREGADO NUEVO — Multiempresa: los documentos capturados antes de
        // existir varias empresas no traen empresaId; pertenecían a la única
        // empresa que había, o sea la primera de la lista. Se etiquetan una
        // sola vez para que Reportes DTE no mezcle empresas.
        var _primeraEmpId = (Array.isArray(empresas) && empresas[0]) ? empresas[0].id : null;
        if (_primeraEmpId) {
            var _huboCambio = false;
            _feRepDocsCache.forEach(function (d) {
                if (d && !d.empresaId) { d.empresaId = _primeraEmpId; _huboCambio = true; }
            });
            if (_huboCambio) _feRepGuardarDocs();
        }
        return _feRepDocsCache;
    }

    function _feRepGuardarDocs() {
        fsStore.setItem(FE_REPORTES_STORE_KEY, JSON.stringify(_feRepDocsCache || []));
        fsStore.flushNow();
    }

    // ══════════════════════════════════════════════════════════════════
    // CAPTURA — se engancha al MISMO evento que ya usa el módulo de Correo
    // (_feCorreoOnDescarga), sin crear un mecanismo de descarga nuevo.
    // ══════════════════════════════════════════════════════════════════
    if (window.fiscalAPI && window.fiscalAPI.onFacturacionDescarga) {
        window.fiscalAPI.onFacturacionDescarga(function (info) {
            if (!info || !info.ok || !info.path) return;
            // Solo interesa el JSON del documento (los datos), no el PDF.
            if (String(info.ext || '').toLowerCase().indexOf('json') === -1) return;
            _feRepProcesarJsonDescargado(info.path);
        });
    }

    function _feRepSplitPath(fullPath) {
        var norm = String(fullPath || '').replace(/\\/g, '/');
        var idx = norm.lastIndexOf('/');
        if (idx === -1) return { folder: '.', file: norm };
        return { folder: norm.slice(0, idx), file: norm.slice(idx + 1) };
    }

    function _feRepProcesarJsonDescargado(fullPath) {
        var partes = _feRepSplitPath(fullPath);
        if (!window.fiscalAPI || !window.fiscalAPI.readJson) return;
        window.fiscalAPI.readJson(partes.folder, partes.file).then(function (res) {
            if (!res || res.error) return;
            var json = res.data || res.json || res;
            if (typeof json === 'string') { try { json = JSON.parse(json); } catch (e) { return; } }
            _feRepRegistrarDocumento(json);
        }).catch(function () {});
    }

    // Convierte el JSON crudo de Hacienda en un registro interno normalizado
    // y lo agrega al store (si el tipo de documento nos interesa y aún no
    // estaba capturado — dedupe por codigoGeneracion).
    function _feRepRegistrarDocumento(json) {
        if (!json || !json.identificacion) return;
        var tipoDoc = String(gv(json, 'identificacion.tipoDte', 'identificacion.tipoDTE') || '').trim();
        if (TIPOS_ANEXO1.indexOf(tipoDoc) === -1 && TIPOS_ANEXO2.indexOf(tipoDoc) === -1) return;

        var rec = _feRepExtraerDatosDte(json, tipoDoc);
        if (!rec.codigoGeneracion) return;

        // AGREGADO NUEVO — Multiempresa: el documento se etiqueta con la
        // empresa activa (solo existe un <webview> vivo a la vez).
        rec.empresaId = (typeof _facturacionElecActiva !== 'undefined' && _facturacionElecActiva.empresaId) || '';

        var docs = _feRepCargarDocs();
        var yaExiste = docs.some(function (d) { return d.codigoGeneracion === rec.codigoGeneracion; });
        if (yaExiste) return;

        docs.push(rec);
        _feRepGuardarDocs();
    }

    // ══════════════════════════════════════════════════════════════════
    // BÚSQUEDA PROFUNDA — adaptada de buscarClaveProfundo (referencia),
    // sin ninguna dependencia de Libros IVA. Recorre el JSON completo
    // buscando una clave por nombre, sin importar en qué nivel esté.
    // ══════════════════════════════════════════════════════════════════
    function _feRepBuscarClaveProfunda(obj, clave, _visitados) {
        _visitados = _visitados || [];
        if (!obj || typeof obj !== 'object' || _visitados.indexOf(obj) !== -1) return null;
        _visitados.push(obj);
        if (Object.prototype.hasOwnProperty.call(obj, clave) && obj[clave]) return obj[clave];
        for (var k in obj) {
            if (!Object.prototype.hasOwnProperty.call(obj, k)) continue;
            var v = obj[k];
            if (v && typeof v === 'object') {
                var found = _feRepBuscarClaveProfunda(v, clave, _visitados);
                if (found) return found;
            }
        }
        return null;
    }

    // ══════════════════════════════════════════════════════════════════
    // EXTRACCIÓN DE DATOS DEL DTE — adaptado de mapJsonToDebito/mapJsonToCf
    // (ImportacionJSON.js), usando gv/gn ya existentes en utilidades.js.
    // ══════════════════════════════════════════════════════════════════
    function _feRepExtraerDatosDte(json, tipoDoc) {
        var id  = json.identificacion || {};
        var rec = json.receptor || {};

        var exentas   = gn(json, 'resumen.totalExenta', 'resumen.ventasExentas');
        var nosujetas = gn(json, 'resumen.totalNoSuj', 'resumen.ventasNoSujetas');
        var gravadas  = gn(json, 'resumen.totalGravada', 'resumen.ventasGravadas');
        var descuento = gn(json, 'resumen.totalDescu', 'resumen.totalDescuento', 'resumen.descuento');
        if (descuento > 0) gravadas = Math.max(0, gravadas - descuento);

        var ivaTributos = 0;
        if (json.resumen && Array.isArray(json.resumen.tributos)) {
            json.resumen.tributos.forEach(function (t) {
                var cod = String((t && (t.codigo || t.codigoTributo)) || '').trim();
                if (cod === '20') ivaTributos += parseFloat(t.valor) || 0;
            });
        }
        var iva = ivaTributos > 0 ? ivaTributos : gn(json, 'resumen.totalIva');

        var esAnexo1 = TIPOS_ANEXO1.indexOf(tipoDoc) !== -1;
        var totalAnexo1 = gravadas + iva + exentas + nosujetas;
        var totalAnexo2 = gn(json, 'resumen.totalPagar', 'resumen.montoTotalOperacion') || (gravadas + exentas + nosujetas);

        var numeroControl    = gv(id, 'numeroControl') || '';
        var codigoGeneracion = gv(id, 'codigoGeneracion') || '';
        var selloRecepcion   = gv(json, 'selloRecibido', 'selloRecepcion', 'respuestaMH.selloRecibido', 'respuestaHacienda.selloRecibido')
                                || _feRepBuscarClaveProfunda(json, 'selloRecibido') || '';
        var fechaIso = gv(id, 'fecEmi', 'fechaEmision') || '';

        var rec2 = {
            codigoGeneracion: codigoGeneracion,
            numeroControl: numeroControl,
            selloRecepcion: selloRecepcion,
            fecha: fechaIso,
            tipoDoc: tipoDoc,
            nit: gv(rec, 'nit', 'numDocumento') || '',
            nrc: gv(rec, 'nrc') || '',
            nombre: gv(rec, 'nombre', 'razonSocial') || '',
            exentas: exentas,
            nosujetas: nosujetas,
            gravadas: gravadas,
            iva: esAnexo1 ? iva : 0,
            total: esAnexo1 ? totalAnexo1 : totalAnexo2,
            // Exportación de Servicios: se decide con el usuario al generar
            // el reporte (ver _feReportesResolverExportacion), nunca se
            // asume automáticamente.
            esExportacionServicio: null
        };
        // AGREGADO — datos que usa el diseño nuevo de los PDF (hora, método de
        // pago, condición de la operación). Solo se agregan campos al registro;
        // los existentes y el CSV no cambian. Los documentos capturados antes
        // de este cambio no los tienen (el PDF muestra "—" en esos casos).
        rec2.hora = String(gv(id, 'horEmi', 'horaEmision') || '');
        rec2.condicionOp = String(gv(json, 'resumen.condicionOperacion') || '');
        var _codsPago = [];
        if (json.resumen && Array.isArray(json.resumen.pagos)) {
            json.resumen.pagos.forEach(function (p) {
                var c = String((p && p.codigo) || '').trim();
                if (c && _codsPago.indexOf(c) === -1) _codsPago.push(c);
            });
        }
        rec2.metodoPago = _codsPago.join(',');
        rec2.tipoOp = _feRepDetectarTipoOp(rec2);
        return rec2;
    }

    // Regla automática de "Tipo de Operación", según lo indicado por el
    // usuario: revisa primero la fecha (período anterior a enero 2025), y
    // luego qué columnas de venta tienen monto (Gravada / Exenta / No
    // Sujeta / Mixta). Los códigos 12 y 13 quedan solo para edición manual.
    function _feRepDetectarTipoOp(rec) {
        if (rec.fecha && rec.fecha < '2025-01-01') return '0';
        var g = rec.gravadas > 0, e = rec.exentas > 0, n = rec.nosujetas > 0;
        if (g && (e || n)) return '4';
        if (g) return '1';
        if (e) return '2';
        if (n) return '3';
        return '1';
    }

    // ══════════════════════════════════════════════════════════════════
    // UI — Panel flotante (#feReportesDropdown)
    // ══════════════════════════════════════════════════════════════════
    function _feReportesToggleDropdown(event) {
        if (event) event.stopPropagation();
        var panel = document.getElementById('feReportesDropdown');
        if (!panel) return;
        var abierto = panel.classList.contains('open');
        // El cierre de los paneles del otro grupo (Clientes/Correo) lo hace
        // las reglas de paneles (_feGruposInit, más abajo).
        var abrir = !abierto;
        if (abrir) _feReportesPosicionar(panel);
        if (abrir) _feEnvDocActualizarOpcion(); // AGREGADO NUEVO — "Enviar Documentación" solo si hay correo configurado
        if (abrir) _feRepPeriodoAlAbrir();
        panel.classList.toggle('open', abrir);
        if (!abrir) _feDdCerrar();
    }

    function _feReportesCerrarDropdown() {
        var panel = document.getElementById('feReportesDropdown');
        if (panel) panel.classList.remove('open');
        _feDdCerrar();
    }

    // CORRECCIÓN — un top fijo en px (ya sea en vh o en px "a ojo") no
    // acierta siempre: la barra #feTopbar (Reportes/Configuración/Correo/
    // Clientes) puede variar de alto según la ventana/DPI. Se calcula en
    // vivo la posición real de esa barra (getBoundingClientRect) y el
    // panel se ancla justo debajo de ella, con un margen fijo pequeño.
    function _feReportesPosicionar(panel) {
        var topbar = document.getElementById('feTopbar');
        var top = topbar ? topbar.getBoundingClientRect().bottom + 10 : 20;
        panel.style.top = top + 'px';
        panel.style.maxHeight = Math.max(200, window.innerHeight - top - 20) + 'px';
    }

    document.addEventListener('click', function (ev) {
        var panel = document.getElementById('feReportesDropdown');
        var btn = document.getElementById('btnFeReportes');
        if (!panel || !panel.classList.contains('open')) return;
        if (panel.contains(ev.target) || (btn && btn.contains(ev.target))) return;
        // AGREGADO NUEVO — los clics dentro del modal "Enviar Documentación" no deben cerrar Reportes DTE.
        var modalEnvio = document.getElementById('feEnvDocModal');
        if (modalEnvio && modalEnvio.contains(ev.target)) return;
        // AGREGADO NUEVO — Agregado 01: tampoco al configurar "Tipo Op." antes de enviar la documentación.
        var modalTipoOp = document.getElementById('feEnvDocTipoOpModal');
        if (modalTipoOp && modalTipoOp.contains(ev.target)) return;
        panel.classList.remove('open');
    });

    window.addEventListener('resize', function () {
        var panel = document.getElementById('feReportesDropdown');
        if (panel && panel.classList.contains('open')) _feReportesPosicionar(panel);
    });

    function _feReportesElegirTipo(tipo) {
        _feRepTipoSeleccionado = tipo;
        _feRepAplicarModoPanel(tipo === 'ventas-zip' || tipo === 'enviar-doc');
        // Cambiar el tipo de reporte invalida los resultados de una
        // búsqueda anterior (pudo ser para otro anexo/formato); se oculta
        // la tabla hasta que se presione "Buscar documentos" de nuevo.
        _feRepResultados = [];
        var wrap = document.getElementById('feRepTablaWrap');
        var resumen = document.getElementById('feRepResumen');
        if (wrap) wrap.style.display = 'none';
        if (resumen) resumen.innerText = '';
    }

    // Empresa activa — mismo criterio que usa el resto de Facturación
    // Electrónica (una sola empresa activa a la vez en esta app).
    function _feRepEmpresaActiva() {
        // AGREGADO NUEVO — Multiempresa: la empresa activa es la del <webview>
        // vivo (activeEmpresaId ya no se asigna en ninguna parte).
        var id = (typeof _facturacionElecActiva !== 'undefined' && _facturacionElecActiva.empresaId) || (empresas[0] && empresas[0].id);
        var emp = empresas.filter(function (e) { return e.id === id; })[0];
        return emp || empresas[0] || {};
    }

    // AGREGADO NUEVO — Documentos capturados de UNA empresa, dentro de un rango
    // de fechas y de ciertos tipos CAT-002, ordenados por fecha. Es exactamente
    // el filtro que antes estaba dentro de _feReportesBuscar; ahora lo comparten
    // "Buscar documentos" y "Enviar Documentación" para que ambos decidan igual
    // si existen documentos de un tipo.
    function _feRepDocsDelPeriodo(empresaId, ini, fin, tipos) {
        return _feRepCargarDocs().filter(function (d) {
            return d.empresaId === empresaId && d.fecha >= ini && d.fecha <= fin && tipos.indexOf(d.tipoDoc) !== -1;
        }).sort(function (a, b) { return a.fecha < b.fecha ? -1 : a.fecha > b.fecha ? 1 : 0; });
    }

    function _feReportesBuscar() {
        var ini = document.getElementById('feRepFechaInicio').value;
        var fin = document.getElementById('feRepFechaFin').value;
        if (!ini || !fin) { fsAlert('Selecciona la fecha de inicio y la fecha final.'); return; }

        var cfg = FE_REP_TIPOS[_feRepTipoSeleccionado];
        var buscaAnexo1 = cfg.anexos.indexOf(1) !== -1;
        var buscaAnexo2 = cfg.anexos.indexOf(2) !== -1;
        var tipos = buscaAnexo1 && buscaAnexo2 ? TIPOS_ANEXO1.concat(TIPOS_ANEXO2)
                  : buscaAnexo1 ? TIPOS_ANEXO1
                  : TIPOS_ANEXO2;

        _feRepResultados = _feRepDocsDelPeriodo(_feRepEmpresaActiva().id, ini, fin, tipos); // AGREGADO NUEVO — Multiempresa (filtro en helper compartido)

        var resumen = document.getElementById('feRepResumen');
        var wrap = document.getElementById('feRepTablaWrap');
        var tbody = document.getElementById('feRepTablaBody');

        if (_feRepResultados.length === 0) {
            resumen.innerText = 'No se encontraron documentos en ese rango.';
            wrap.style.display = 'none';
            return;
        }

        resumen.innerText = _feRepResultados.length + ' documento(s) encontrado(s).';
        tbody.innerHTML = _feRepResultados.map(function (r, i) {
            var opciones = TIPO_OP_CATALOGO.map(function (o) {
                return '<option value="' + o.codigo + '"' + (o.codigo === r.tipoOp ? ' selected' : '') + '>' + o.codigo + ' — ' + o.nombre + '</option>';
            }).join('');
            return '<tr>' +
                '<td>' + escHtml(formatFecha(r.fecha)) + '</td>' +
                '<td>' + escHtml(r.nombre || '(Consumidor Final)') + '</td>' +
                '<td>' + fMoney(r.total) + '</td>' +
                '<td><select onchange="_feReportesResultados()[' + i + '].tipoOp=this.value;">' + opciones + '</select></td>' +
                '</tr>';
        }).join('');
        wrap.style.display = 'block';
        _feRepMejorarSelects();
    }

    // Pequeño accesor para que el onchange inline de arriba pueda modificar
    // el arreglo en memoria sin exponer la variable directamente.
    function _feReportesResultados() { return _feRepResultados; }


    function _feRepFormatMonto(n) {
        return (parseFloat(n) || 0).toFixed(2);
    }

    // ══════════════════════════════════════════════════════════════════
    // CLASIFICACIÓN Exportación (tipoDoc '11') — Bienes vs Servicios.
    // Se pregunta UNA vez por generación (no por documento), y se aplica
    // igual a todos los documentos de exportación del reporte actual.
    // ══════════════════════════════════════════════════════════════════
    function _feReportesResolverExportacion(registros, continuar) {
        var exportaciones = registros.filter(function (r) { return r.tipoDoc === TIPO_EXPORTACION && r.esExportacionServicio === null; });
        if (exportaciones.length === 0) { continuar(); return; }

        var modal = document.getElementById('feRepExportModal');
        var msg = document.getElementById('feRepExportMsg');
        msg.innerText = 'Se encontraron ' + exportaciones.length + ' documento(s) de Exportación (tipo 11) en este reporte. ' +
            '¿Son de Servicios o de Bienes?';
        modal.style.display = 'flex';

        var btnServicios = document.getElementById('feRepExportServicios');
        var btnBienes = document.getElementById('feRepExportBienes');

        function cerrar() {
            modal.style.display = 'none';
            btnServicios.onclick = null;
            btnBienes.onclick = null;
        }

        btnServicios.onclick = function () {
            exportaciones.forEach(function (r) { r.esExportacionServicio = true; });
            cerrar();
            continuar();
        };
        btnBienes.onclick = function () {
            exportaciones.forEach(function (r) { r.esExportacionServicio = false; });
            cerrar();
            showToast('Este módulo aún no clasifica exportación de Bienes; se dejó en Gravadas para corregirlo manualmente.', 'error');
            continuar();
        };
    }

    // ══════════════════════════════════════════════════════════════════
    // CONSTRUCCIÓN DE CSV — orden de columnas EXACTO según los anexos
    // reales de Hacienda que compartió el usuario (sin encabezados, sin
    // comillas, separador ';', montos con 2 decimales, BOM UTF-8).
    // ══════════════════════════════════════════════════════════════════
    function _feRepCsvLineaAnexo1(r, tipoIng) {
        return [
            formatFecha(r.fecha),
            '4',
            r.tipoDoc,
            r.numeroControl,
            r.selloRecepcion,
            r.codigoGeneracion,
            '', // columna G — debe ir en blanco (confirmado con el usuario)
            r.nit || '',
            r.nombre || '',
            _feRepFormatMonto(r.exentas),
            _feRepFormatMonto(r.nosujetas),
            _feRepFormatMonto(r.gravadas),
            _feRepFormatMonto(r.iva),
            '0.00',
            '0.00',
            _feRepFormatMonto(r.total),
            '', // columna Q — debe ir en blanco (confirmado con el usuario)
            r.tipoOp,
            tipoIng,
            '1' // número de Anexo (fijo)
        ].join(';');
    }

    function _feRepCsvLineaAnexo2(r, tipoIng) {
        var esServicio = r.esExportacionServicio === true;
        var gravadas = esServicio ? 0 : r.gravadas;
        var expServ  = esServicio ? r.gravadas : 0;
        return [
            formatFecha(r.fecha),
            '4',
            r.tipoDoc,
            r.numeroControl,
            r.selloRecepcion,
            r.numeroControl, // ctrlDel
            r.numeroControl, // ctrlAl
            r.codigoGeneracion, // docDel
            r.codigoGeneracion, // docAl
            '', // maquina
            _feRepFormatMonto(r.exentas),
            '0.00', // exentaNosuj
            _feRepFormatMonto(r.nosujetas),
            _feRepFormatMonto(gravadas),
            '0.00', // expCa
            '0.00', // expFuera
            _feRepFormatMonto(expServ),
            '0.00', // zonas
            '0.00', // terceros
            _feRepFormatMonto(r.total),
            r.tipoOp,
            tipoIng,
            '2' // número de Anexo (fijo)
        ].join(';');
    }

    function _feRepConstruirCsv(anexo, registros, tipoIng) {
        var lineas = registros.map(function (r) {
            return anexo === 1 ? _feRepCsvLineaAnexo1(r, tipoIng) : _feRepCsvLineaAnexo2(r, tipoIng);
        });
        return lineas.join('\r\n');
    }

    // ══════════════════════════════════════════════════════════════════
    // CONSTRUCCIÓN DE PDF — snapshot HTML simple (sin el sistema completo
    // de fuentes/orientación configurable de ConfigImpresion.js/
    // FuentesImpresion.js del proyecto de referencia, para no sobre-
    // construir; CSS fijo, tabla + totales).
    // ══════════════════════════════════════════════════════════════════
    var _feRepPrintCss = [
        'body{font-family:Arial,sans-serif;margin:20px;color:#111;}',
        'h2{margin:0 0 4px 0;font-size:16px;}',
        'p.sub{margin:0 0 16px 0;font-size:12px;color:#555;}',
        'table{width:100%;border-collapse:collapse;font-size:10px;}',
        'th,td{border:1px solid #999;padding:4px 6px;text-align:left;}',
        'th{background:#eee;}',
        'tfoot td{font-weight:bold;background:#f5f5f5;}'
    ].join('');

    // Tabla del Anexo 1 (encabezado + filas + totales), sin el envoltorio
    // <html>/<body> — así puede reutilizarse tal cual dentro del PDF de
    // Anexo 1 solo, o combinada con la del Anexo 2 dentro del PDF General.
    function _feRepTablaAnexo1(registros) {
        var filas = registros.map(function (r) {
            return '<tr>' +
                '<td>' + escHtml(formatFecha(r.fecha)) + '</td>' +
                '<td>' + escHtml(r.tipoDoc) + '</td>' +
                '<td>' + escHtml(r.numeroControl) + '</td>' +
                '<td>' + escHtml(r.nit || r.nrc || '') + '</td>' +
                '<td>' + escHtml(r.nombre) + '</td>' +
                '<td>' + fMoney(r.exentas) + '</td>' +
                '<td>' + fMoney(r.nosujetas) + '</td>' +
                '<td>' + fMoney(r.gravadas) + '</td>' +
                '<td>' + fMoney(r.iva) + '</td>' +
                '<td>' + fMoney(r.total) + '</td>' +
                '</tr>';
        }).join('');
        var totales = registros.reduce(function (acc, r) {
            acc.exentas += r.exentas; acc.nosujetas += r.nosujetas; acc.gravadas += r.gravadas;
            acc.iva += r.iva; acc.total += r.total;
            return acc;
        }, { exentas: 0, nosujetas: 0, gravadas: 0, iva: 0, total: 0 });

        return '<h2>Anexo 1 — Crédito Fiscal</h2>' +
            '<table><thead><tr><th>Fecha</th><th>Tipo</th><th>N° Control</th><th>NIT/NRC</th><th>Cliente</th>' +
            '<th>Exentas</th><th>No Sujetas</th><th>Gravadas</th><th>IVA</th><th>Total</th></tr></thead>' +
            '<tbody>' + filas + '</tbody>' +
            '<tfoot><tr><td colspan="5">TOTALES</td>' +
            '<td>' + fMoney(totales.exentas) + '</td><td>' + fMoney(totales.nosujetas) + '</td>' +
            '<td>' + fMoney(totales.gravadas) + '</td><td>' + fMoney(totales.iva) + '</td>' +
            '<td>' + fMoney(totales.total) + '</td></tr></tfoot></table>';
    }

    // CAMBIO — diseño nuevo (modelo "Reporte de Ventas"): el cuerpo lleva solo
    // "Ventas" + "Detalle de operaciones"; el encabezado (empresa + barra azul)
    // y el pie con "Página X de Y" los pone Electron en cada página (ver
    // _feRepPlantillasPdf y 'fe-reportes-guardar-pdf' en main.js).
    function _feRepSnapshotAnexo1(registros, meta) {
        return _feRepSnapshotModelo(registros);
    }

    // Tabla del Anexo 2 (encabezado + filas + totales), sin envoltorio
    // <html>/<body>, por la misma razón que _feRepTablaAnexo1.
    function _feRepTablaAnexo2(registros) {
        var filas = registros.map(function (r) {
            var esServicio = r.esExportacionServicio === true;
            var gravadas = esServicio ? 0 : r.gravadas;
            var expServ = esServicio ? r.gravadas : 0;
            return '<tr>' +
                '<td>' + escHtml(formatFecha(r.fecha)) + '</td>' +
                '<td>' + escHtml(r.tipoDoc) + '</td>' +
                '<td>' + escHtml(r.numeroControl) + '</td>' +
                '<td>' + fMoney(r.exentas) + '</td>' +
                '<td>' + fMoney(r.nosujetas) + '</td>' +
                '<td>' + fMoney(gravadas) + '</td>' +
                '<td>' + fMoney(expServ) + '</td>' +
                '<td>' + fMoney(r.total) + '</td>' +
                '</tr>';
        }).join('');
        var totales = registros.reduce(function (acc, r) {
            var esServicio = r.esExportacionServicio === true;
            acc.exentas += r.exentas; acc.nosujetas += r.nosujetas;
            acc.gravadas += esServicio ? 0 : r.gravadas;
            acc.expServ += esServicio ? r.gravadas : 0;
            acc.total += r.total;
            return acc;
        }, { exentas: 0, nosujetas: 0, gravadas: 0, expServ: 0, total: 0 });

        return '<h2>Anexo 2 — Consumidor Final</h2>' +
            '<table><thead><tr><th>Fecha</th><th>Tipo</th><th>N° Control</th>' +
            '<th>Exentas</th><th>No Sujetas</th><th>Gravadas</th><th>Exp. Servicios</th><th>Total</th></tr></thead>' +
            '<tbody>' + filas + '</tbody>' +
            '<tfoot><tr><td colspan="3">TOTALES</td>' +
            '<td>' + fMoney(totales.exentas) + '</td><td>' + fMoney(totales.nosujetas) + '</td>' +
            '<td>' + fMoney(totales.gravadas) + '</td><td>' + fMoney(totales.expServ) + '</td>' +
            '<td>' + fMoney(totales.total) + '</td></tr></tfoot></table>';
    }

    function _feRepSnapshotAnexo2(registros, meta) {
        return _feRepSnapshotModelo(registros);
    }

    // PDF General (opción "Generar Reporte General"): un único documento
    // que incluye Anexo 1 y Anexo 2, reutilizando exactamente las mismas
    // tablas/totales que se usan cuando se genera cada anexo por separado.
    function _feRepSnapshotGeneral(anexo1Docs, anexo2Docs, meta) {
        return _feRepSnapshotModelo(anexo1Docs.concat(anexo2Docs));
    }

    // ══════════════════════════════════════════════════════════════════
    // AGREGADO — Diseño nuevo de los 3 PDF (Reporte General, Ventas Crédito
    // Fiscal y Ventas a Consumidor Final), basado en el modelo del cliente.
    // Los CSV y el ZIP no usan nada de este bloque.
    // ══════════════════════════════════════════════════════════════════
    var _feRepAzul = '#3B6FB6';
    var _feRepTipoDteLabel = { '01': 'FACTURA', '03': 'CCF', '05': 'NOTA CRÉDITO', '06': 'NOTA DÉBITO', '11': 'EXPORTACIÓN' };
    // CAT-017 (forma de pago) de Hacienda.
    var _feRepMetodoPagoLabel = {
        '01': 'Billetes y monedas', '02': 'Tarjeta Débito', '03': 'Tarjeta Crédito', '04': 'Cheque',
        '05': 'Transferencia Depósito Bancario', '06': 'Vales o Cupones', '07': 'Dinero electrónico',
        '08': 'Monedero electrónico', '09': 'Certificado o tarjeta de regalo', '10': 'Bitcoin',
        '11': 'Otras Criptomonedas', '12': 'Cuentas por pagar del receptor', '13': 'Giro bancario', '99': 'Otros'
    };
    var _feRepCondicionLabel = { '1': 'Contado', '2': 'A crédito', '3': 'Otro' };

    var _feRepCssModelo = [
        'body{font-family:Arial,sans-serif;margin:0;color:#111;}',
        'h3{text-align:center;font-size:11px;color:#3b4a63;margin:4px 0 10px 0;}',
        'table{width:100%;border-collapse:collapse;table-layout:fixed;font-size:8.5px;}',
        'th,td{border:1px solid #777;padding:5px;text-align:left;vertical-align:middle;word-wrap:break-word;}',
        'th{background:' + _feRepAzul + ';color:#fff;text-align:center;font-size:9px;}',
        'thead{display:table-header-group;}',
        'tr{page-break-inside:avoid;}',
        '.cen{text-align:center;}.der{text-align:right;}.cod{word-break:break-all;}',
        '.det{page-break-inside:avoid;margin-top:22px;}',
        '.det td{font-size:9px;padding:7px 5px;}',
        'tr.tot td{background:' + _feRepAzul + ';color:#fff;font-weight:bold;}'
    ].join('');

    function _feRepEtiquetaPago(codigos) {
        if (!codigos) return '—';
        return String(codigos).split(',').map(function (c) {
            return _feRepMetodoPagoLabel[c] || c;
        }).join(' / ');
    }

    function _feRepFilasVentasModelo(registros) {
        return registros.map(function (r) {
            var fechaHora = escHtml(r.fecha || '') + (r.hora ? '<br>' + escHtml(r.hora) : '');
            return '<tr>' +
                '<td>' + fechaHora + '</td>' +
                '<td class="cen">' + escHtml(_feRepTipoDteLabel[r.tipoDoc] || r.tipoDoc) + '</td>' +
                '<td class="cod">' + escHtml(r.codigoGeneracion) + '</td>' +
                '<td class="cod">' + escHtml(r.numeroControl) + '</td>' +
                '<td>' + escHtml(r.nombre || '(Consumidor Final)') + '</td>' +
                '<td class="der">' + fMoney(r.total) + '</td>' +
                '</tr>';
        }).join('');
    }

    // "Detalle de operaciones". Factura = tipos 01 y 11; CCF = 03, 05 y 06.
    // Los montos se suman igual que en los totales de los anexos actuales.
    // Recibos y Anulados no se capturan en el sistema: van en 0 / $0.00.
    function _feRepDetalleModelo(registros) {
        var fac = { n: 0, m: 0 }, ccf = { n: 0, m: 0 };
        registros.forEach(function (r) {
            var g = (r.tipoDoc === '01' || r.tipoDoc === '11') ? fac : ccf;
            g.n++; g.m += (r.total || 0);
        });
        function fila(txt, n, m) {
            return '<tr><td>' + txt + '</td><td class="der">' + n + '</td><td class="der">' + fMoney(m) + '</td></tr>';
        }
        return '<div class="det"><h3>Detalle de operaciones</h3>' +
            '<table><colgroup><col style="width:56%"><col style="width:12%"><col style="width:32%"></colgroup><tbody>' +
            fila('Ventas con factura', fac.n, fac.m) +
            fila('Ventas con CCF', ccf.n, ccf.m) +
            fila('Recibos', 0, 0) +
            fila('Facturas Anuladas', 0, 0) +
            fila('CCF Anulados', 0, 0) +
            fila('Total Doc Anulados', 0, 0) +
            '<tr class="tot"><td>TOTAL</td><td class="der">' + (fac.n + ccf.n) + '</td><td class="der">' + fMoney(fac.m + ccf.m) + '</td></tr>' +
            '</tbody></table></div>';
    }

    function _feRepSnapshotModelo(registros) {
        var ordenados = registros.slice().sort(function (a, b) {
            var fa = (a.fecha || '') + ' ' + (a.hora || ''), fb = (b.fecha || '') + ' ' + (b.hora || '');
            return fa < fb ? -1 : fa > fb ? 1 : 0;
        });
        return '<html><head><meta charset="UTF-8"><style>' + _feRepCssModelo + '</style></head><body>' +
            '<h3>Ventas</h3>' +
            '<table><colgroup>' +
            '<col style="width:14%"><col style="width:11%"><col style="width:23%"><col style="width:23%">' +
            '<col style="width:19%"><col style="width:10%">' +
            '</colgroup><thead><tr><th>Fecha y hora</th><th>Tipo DTE</th><th>Código</th><th>Nº Control</th>' +
            '<th>Cliente</th><th>Total</th></tr></thead>' +
            '<tbody>' + _feRepFilasVentasModelo(ordenados) + '</tbody></table>' +
            _feRepDetalleModelo(ordenados) +
            '</body></html>';
    }

    // Encabezado (empresa en negrita + barra azul con el título) y pie
    // ("Página X de Y") que Electron repite en TODAS las páginas.
    function _feRepPlantillasPdf(empresaRazon, titulo, mesLabel) {
        var tituloFull = titulo + ' - ' + String(mesLabel || '').toLowerCase();
        var base = 'width:100%;box-sizing:border-box;padding:0 0.4in;font-family:Arial,sans-serif;-webkit-print-color-adjust:exact;';
        var header = '<div style="' + base + 'padding-top:0.3in;display:flex;align-items:center;">' +
            '<div style="width:34%;font-size:14px;font-weight:bold;color:#1f3a5f;padding-right:10px;">' + escHtml(empresaRazon) + '</div>' +
            '<div style="flex:1;background:' + _feRepAzul + ';color:#fff;font-size:15px;font-weight:bold;text-align:right;padding:7px 9px;">' + escHtml(tituloFull) + '</div>' +
            '</div>';
        var footer = '<div style="' + base + 'font-size:7px;color:#666;display:flex;align-items:center;">' +
            '<div style="flex:1;text-align:center;font-style:italic;">Documento generado por el sistema de facturación electrónica FiscalSync-FE desarrollado por Roger Antonio Merlos Mejia<br>Contacto: Teléfono: +503 7014 0375 | Correo: efacturacion.78@gmail.com</div>' +
            '<div style="width:90px;text-align:right;font-size:8px;">Página <span class="pageNumber"></span> de <span class="totalPages"></span></div>' +
            '</div>';
        return { header: header, footer: footer };
    }

    // ══════════════════════════════════════════════════════════════════
    // GENERAR — orquesta: resolver Exportación (si aplica) → construir
    // CSV/PDF por anexo → guardar vía preload (sin diálogo).
    // ══════════════════════════════════════════════════════════════════
    // El botón "Generar Reporte" ya no recibe formato: se adapta solo
    // según la opción elegida en el select "Tipo de reporte" (CSV para las
    // dos primeras opciones, PDF individual para las dos siguientes, y PDF
    // General combinado para la última).
    function _feReportesGenerar() {
        // Opción "Descargar PDF y JSON de Ventas": empaqueta en un ZIP, no usa Buscar.
        if (_feRepTipoSeleccionado === 'ventas-zip') { _feVentasZipGenerar(); return; }
        // AGREGADO NUEVO — opción "Enviar Documentación": coordina las funciones de abajo, no usa Buscar.
        if (_feRepTipoSeleccionado === 'enviar-doc') { _feEnviarDocumentacion(); return; }
        if (_feRepResultados.length === 0) { fsAlert('Primero presiona "Buscar documentos".'); return; }

        var cfg = FE_REP_TIPOS[_feRepTipoSeleccionado];

        _feReportesResolverExportacion(_feRepResultados, function () {
            var emp = _feRepEmpresaActiva();
            var tipoIng = emp.tipoIng || '1';
            var ini = document.getElementById('feRepFechaInicio').value;
            var fin = document.getElementById('feRepFechaFin').value;
            var rango = formatFecha(ini) + ' al ' + formatFecha(fin);
            var mesLabel = _feRepMesLabelDesdeIso(fin);

            var anexo1Docs = _feRepResultados.filter(function (r) { return TIPOS_ANEXO1.indexOf(r.tipoDoc) !== -1; });
            var anexo2Docs = _feRepResultados.filter(function (r) { return TIPOS_ANEXO2.indexOf(r.tipoDoc) !== -1; });

            // "Generar Reporte General": un único PDF con ambos anexos.
            if (cfg.anexos.length === 2 && cfg.formato === 'pdf') {
                _feReportesGuardarGeneral(anexo1Docs, anexo2Docs, rango, mesLabel, emp).then(function (res) {
                    if (res && res.ok) showToast('Reporte general guardado en Facturacion/Reportes.', 'success');
                    else fsAlert('Hubo un problema al guardar el reporte general. Revisa la consola para más detalle.');
                });
                return;
            }

            // Cualquiera de las otras 4 opciones: un solo anexo, en su
            // formato correspondiente (CSV o PDF).
            var anexo = cfg.anexos[0];
            var registros = anexo === 1 ? anexo1Docs : anexo2Docs;
            if (registros.length === 0) {
                fsAlert('No hay documentos de ' + (anexo === 1 ? 'Crédito Fiscal' : 'Consumidor Final') + ' en el rango buscado.');
                return;
            }
            _feReportesGuardarUnArchivo(anexo, registros, tipoIng, rango, mesLabel, emp, cfg.formato).then(function (res) {
                if (res && res.ok) showToast('Reporte guardado en Facturacion/Reportes.', 'success');
                else fsAlert('Hubo un problema al guardar el reporte. Revisa la consola para más detalle.');
            });
        });
    }

    // CAMBIO — el mes de la carpeta de Reportes ya no depende de un selector
    // de mes: se toma de la fecha FINAL del rango elegido ("AAAA-MM-DD" ->
    // "Agosto 2026"). Si la fecha no tiene ese formato, se usa como respaldo
    // el mes en curso (comportamiento anterior).
    function _feRepMesLabelDesdeIso(iso) {
        var m = /^(\d{4})-(\d{2})-\d{2}$/.exec(String(iso || '').trim());
        if (!m || +m[2] < 1 || +m[2] > 12) return MONTH_NAMES[currentMonth] + ' ' + currentYear;
        return MONTH_NAMES[+m[2] - 1] + ' ' + m[1];
    }

    function _feReportesGuardarUnArchivo(anexo, registros, tipoIng, rango, mesLabel, emp, formato) {
        var nombreBase = 'Anexo' + anexo + '_' + (anexo === 1 ? 'CreditoFiscal' : 'ConsumidorFinal') + '_' +
            rango.replace(/\//g, '-').replace(/ al /, '_al_');

        if (formato === 'csv') {
            var contenido = _feRepConstruirCsv(anexo, registros, tipoIng);
            return window.fiscalAPI.guardarReporteCsv({
                content: contenido,
                fileName: nombreBase + '.csv',
                mesLabel: mesLabel,
                empresaNombre: emp.razon
            });
        }

        var meta = { empresaRazon: emp.razon || '', rango: rango };
        var html = anexo === 1 ? _feRepSnapshotAnexo1(registros, meta) : _feRepSnapshotAnexo2(registros, meta);
        var plantillas = _feRepPlantillasPdf(emp.razon || '', anexo === 1 ? 'Reporte de Ventas Crédito Fiscal' : 'Reporte de Ventas a Consumidor Final', mesLabel);
        return window.fiscalAPI.guardarReportePdf({
            htmlSnapshot: html,
            fileName: nombreBase + '.pdf',
            mesLabel: mesLabel,
            empresaNombre: emp.razon,
            headerTemplate: plantillas.header,
            footerTemplate: plantillas.footer
        });
    }

    // noAbrir (opcional): solo lo usa "Enviar Documentación" para que el PDF se genere
    // y se adjunte sin abrirse en pantalla. Sin él, el comportamiento es el de siempre.
    function _feReportesGuardarGeneral(anexo1Docs, anexo2Docs, rango, mesLabel, emp, noAbrir) {
        var nombreBase = 'ReporteGeneral_' + rango.replace(/\//g, '-').replace(/ al /, '_al_');
        var meta = { empresaRazon: emp.razon || '', rango: rango };
        var html = _feRepSnapshotGeneral(anexo1Docs, anexo2Docs, meta);
        var plantillas = _feRepPlantillasPdf(emp.razon || '', 'Reporte General', mesLabel);
        return window.fiscalAPI.guardarReportePdf({
            htmlSnapshot: html,
            fileName: nombreBase + '.pdf',
            mesLabel: mesLabel,
            empresaNombre: emp.razon,
            headerTemplate: plantillas.header,
            footerTemplate: plantillas.footer,
            noAbrir: !!noAbrir
        });
    }

    // AGREGADO NUEVO — Multiempresa: al eliminar una empresa se descartan sus
    // documentos capturados. Se llama ANTES de quitarla de empresas[] para
    // que _feRepCargarDocs() todavía pueda atribuirle los documentos viejos
    // sin etiqueta (si era la primera).
    function _feReportesEliminarDocsEmpresa(empresaId) {
        if (!empresaId) return;
        var docs = _feRepCargarDocs();
        _feRepDocsCache = docs.filter(function (d) { return d.empresaId !== empresaId; });
        _feRepGuardarDocs();
        _feRepResultados = [];
    }

    // ══════════════════════════════════════════════════════════════════
    // AGREGADO NUEVO — "Descargar PDF y JSON de Ventas" (.zip)
    // Empaqueta los .pdf/.json que YA existen en disco dentro de un rango
    // de fechas (Facturacion/[Tipo]/[DD-MM-AAAA]/). No genera ni descarga
    // nada de nuevo. La búsqueda y la compresión ocurren en main.js vía
    // window.fiscalAPI.buscarVentasZip / generarVentasZip. Usa el rango de
    // fechas del propio panel "Reportes DTE" (ya no tiene modal aparte):
    // al elegir esta opción se oculta "Buscar documentos" y el botón
    // principal pasa a decir "Generar Zip".
    // ══════════════════════════════════════════════════════════════════
    var _feVentasZipOcupado = false;

    function _feVentasIso(y, m, d) {
        return y + '-' + String(m + 1).padStart(2, '0') + '-' + String(d).padStart(2, '0');
    }

    function _feVentasBloquear(bloquear) {
        _feVentasZipOcupado = bloquear;
        var btn = document.getElementById('feRepBtnGenerar');
        if (btn) {
            btn.disabled = bloquear;
            btn.style.opacity = bloquear ? '0.6' : '1';
            btn.style.cursor = bloquear ? 'not-allowed' : 'pointer';
            btn.innerText = bloquear ? 'Generando...' : 'Generar Zip';
        }
        ['feRepFechaInicio', 'feRepFechaFin', 'feRepTipoSelect', 'feRepPeriodoAnio', 'feRepPeriodoMes', 'feRepPeriodoModo'].forEach(function (id) {
            var el = document.getElementById(id);
            if (el) el.disabled = bloquear;
        });
    }

    // Ajusta el panel según el tipo elegido: modo ZIP (sin "Buscar
    // documentos", botón "Generar Zip", rango de fechas sugerido) o modo
    // normal de reportes.
    function _feRepAplicarModoPanel(esZip) {
        var buscar = document.getElementById('feRepBtnBuscar');
        var generar = document.getElementById('feRepBtnGenerar');
        var wrap = document.getElementById('feRepTablaWrap');
        var resumen = document.getElementById('feRepResumen');
        if (buscar) buscar.style.display = esZip ? 'none' : '';
        if (generar) generar.innerText = _feRepTipoSeleccionado === 'enviar-doc' ? 'Enviar Documentación' : (esZip ? 'Generar Zip' : 'Generar Reporte');
        // AGREGADO NUEVO — el botón principal se pone verde solo con "Enviar Documentación".
        if (generar) generar.style.background = _feRepTipoSeleccionado === 'enviar-doc' ? 'var(--rp-success)' : 'var(--rp-accent)';
        if (esZip) {
            if (wrap) wrap.style.display = 'none';
            if (resumen) resumen.innerText = '';
            // Rango sugerido: el mes de trabajo activo (solo si aún no hay fechas).
            var ini = document.getElementById('feRepFechaInicio');
            var fin = document.getElementById('feRepFechaFin');
            if (ini && fin && !ini.value && !fin.value) {
                ini.value = _feVentasIso(currentYear, currentMonth, 1);
                fin.value = _feVentasIso(currentYear, currentMonth, new Date(currentYear, currentMonth + 1, 0).getDate());
            }
        }
    }

    function _feVentasPausa(ms) {
        return new Promise(function (resolve) { setTimeout(resolve, ms); });
    }

    function _feVentasZipGenerar() {
        if (_feVentasZipOcupado) return; // evita generaciones simultáneas
        if (!(window.fiscalAPI && window.fiscalAPI.buscarVentasZip)) {
            fsAlert('Esta función solo está disponible en la aplicación de escritorio.');
            return;
        }
        var ini = document.getElementById('feRepFechaInicio').value;
        var fin = document.getElementById('feRepFechaFin').value;
        if (!ini || !fin) { fsAlert('Selecciona la fecha de inicio y la fecha final.'); return; }
        if (ini > fin) { fsAlert('La fecha inicial no puede ser posterior a la fecha final.'); return; }

        var emp = _feRepEmpresaActiva();
        if (!emp || !emp.razon) { fsAlert('No se encontró la empresa activa.'); return; }
        var base = { empresaNombre: emp.razon, fechaInicio: ini, fechaFin: fin };
        var mesLabel = _feRepMesLabelDesdeIso(fin);

        _feVentasBloquear(true);

        window.fiscalAPI.buscarVentasZip(base).then(function (busq) {
            if (!busq || busq.error) throw new Error((busq && busq.error) || 'No se pudo buscar los documentos.');
            if (!busq.archivos) return { vacio: true, detalle: busq.detalle };
            return _feVentasPausa(350).then(function () {
                return window.fiscalAPI.generarVentasZip({
                    empresaNombre: emp.razon, fechaInicio: ini, fechaFin: fin, mesLabel: mesLabel
                });
            });
        }).then(function (res) {
            if (res && res.error) throw new Error(res.error);
            _feVentasBloquear(false);
            if (!res || res.vacio) {
                fsAlert('No se encontraron documentos de ventas\ndentro del rango de fechas seleccionado.' + (res && res.detalle ? '\n\n' + res.detalle : ''));
                return;
            }
            showToast('Archivo ZIP guardado en Facturacion/Reportes.', 'success');
        }).catch(function (err) {
            console.error('[Ventas ZIP]', err);
            _feVentasBloquear(false);
            fsAlert('No se pudo generar el archivo.\n' + (err && err.message ? err.message : 'Revisa la consola para más detalle.'));
        });
    }

    // ══════════════════════════════════════════════════════════════════
    // AGREGADO NUEVO — "Enviar Documentación"
    // Genera, para la empresa activa y el período elegido en este mismo
    // panel, la documentación de ventas y la envía por correo. NO genera
    // nada por su cuenta: llama a las mismas funciones que ya usan las demás
    // opciones del panel y adjunta únicamente las rutas que ESAS funciones
    // devuelven en esta ejecución (res.path), nunca archivos buscados "a
    // ciegas" en la carpeta.
    //   - Anexo Crédito Fiscal / Anexo Consumidor Final (CSV):
    //       _feReportesGuardarUnArchivo(anexo, ..., 'csv'), solo si hay
    //       documentos de ese tipo (validación independiente por tipo).
    //   - Reporte General (PDF): _feReportesGuardarGeneral.
    //   - PDF y JSON de Ventas (ZIP): fiscalAPI.buscarVentasZip /
    //       generarVentasZip (mismos dos pasos que _feVentasZipGenerar).
    //   - Agregado 01: antes de generar, se configura "Tipo Op." de los
    //       documentos del período (_feEnvDocConfigurarTipoOp).
    //   - Envío: electronAPI.sendEmail (el mismo canal que Correo.js) con
    //       la cuenta de correo configurada en la empresa activa.
    // Las rutas (Facturacion/Reportes de la empresa) las resuelve main.js,
    // igual que para los reportes individuales.
    // ══════════════════════════════════════════════════════════════════
    var _feEnvDocOcupado = false;   // generación de archivos en curso
    var _feEnvDocEnviando = false;  // envío SMTP en curso
    var _feEnvDocPendiente = null;  // { emp, rango, adjuntos, fallos, omitidos } mientras el modal está abierto

    function _feEnvDocEstado(msg) {
        var el = document.getElementById('feRepResumen');
        if (el) el.innerText = msg || '';
    }

    function _feEnvDocBloquear(bloquear) {
        _feEnvDocOcupado = bloquear;
        var btn = document.getElementById('feRepBtnGenerar');
        if (btn) {
            btn.disabled = bloquear;
            btn.style.opacity = bloquear ? '0.6' : '1';
            btn.style.cursor = bloquear ? 'not-allowed' : 'pointer';
            btn.innerText = bloquear ? 'Preparando...' : 'Enviar Documentación';
        }
        ['feRepFechaInicio', 'feRepFechaFin', 'feRepTipoSelect', 'feRepPeriodoAnio', 'feRepPeriodoMes', 'feRepPeriodoModo'].forEach(function (id) {
            var el = document.getElementById(id);
            if (el) el.disabled = bloquear;
        });
    }

    // Último correo de destino usado en "Enviar Documentación" (por empresa).
    // Mismo almacenamiento que el resto del módulo (fsStore + flushNow).
    function _feEnvDocCorreoGuardado(emp) {
        try {
            var raw = fsStore.getItem(FE_ENVDOC_CORREO_KEY);
            var mapa = raw ? JSON.parse(raw) : {};
            return (emp && emp.id && mapa && mapa[emp.id]) ? String(mapa[emp.id]) : '';
        } catch (e) { return ''; }
    }

    function _feEnvDocGuardarCorreo(emp, correo) {
        try {
            if (!emp || !emp.id || !correo) return;
            var raw = fsStore.getItem(FE_ENVDOC_CORREO_KEY);
            var mapa = raw ? JSON.parse(raw) : {};
            if (!mapa || typeof mapa !== 'object') mapa = {};
            if (mapa[emp.id] === correo) return;
            mapa[emp.id] = correo;
            fsStore.setItem(FE_ENVDOC_CORREO_KEY, JSON.stringify(mapa));
            fsStore.flushNow();
        } catch (e) {
            console.error('[Enviar Documentación] no se pudo guardar el correo de destino:', e);
        }
    }

    function _feEnvDocNombreArchivo(ruta) {
        return String(ruta || '').replace(/\\/g, '/').split('/').pop();
    }

    function _feEnviarDocumentacion() {
        if (_feEnvDocOcupado || _feEnvDocEnviando) return;
        if (!(window.fiscalAPI && window.fiscalAPI.guardarReporteCsv && window.fiscalAPI.guardarReportePdf &&
              window.fiscalAPI.buscarVentasZip && window.electronAPI && window.electronAPI.sendEmail)) {
            fsAlert('Esta función solo está disponible en la aplicación de escritorio.');
            return;
        }
        var ini = document.getElementById('feRepFechaInicio').value;
        var fin = document.getElementById('feRepFechaFin').value;
        if (!ini || !fin) { fsAlert('Selecciona la fecha de inicio y la fecha final.'); return; }
        if (ini > fin) { fsAlert('La fecha inicial no puede ser posterior a la fecha final.'); return; }

        var emp = _feRepEmpresaActiva();
        if (!emp || !emp.razon) { fsAlert('No se encontró la empresa activa.'); return; }
        // Se valida antes de generar nada: sin cuenta de correo no hay envío posible.
        if (!emp.correosEmail || !emp.correosPass) {
            fsAlert('Correo no configurado\nConfigura la cuenta de correo de esta empresa en la sección Correo antes de enviar documentación.');
            return;
        }

        var anexo1Docs = _feRepDocsDelPeriodo(emp.id, ini, fin, TIPOS_ANEXO1);
        var anexo2Docs = _feRepDocsDelPeriodo(emp.id, ini, fin, TIPOS_ANEXO2);

        // AGREGADO NUEVO — Agregado 01: antes de generar nada se permite configurar
        // "Tipo Op." de los documentos del período (solo de los tipos que existen).
        // Si el usuario cancela, no se genera ni se envía nada.
        _feEnvDocConfigurarTipoOp(anexo1Docs, anexo2Docs, function () {
            _feEnvDocBloquear(true);
            // Mismo aviso Bienes/Servicios que ya existe (solo aparece si hay exportaciones).
            _feReportesResolverExportacion(anexo2Docs, function () {
                _feEnvDocGenerar(emp, ini, fin, anexo1Docs, anexo2Docs);
            });
        });
    }

    // ══════════════════════════════════════════════════════════════════
    // AGREGADO NUEVO — Agregado 01: configuración de "Tipo Op." dentro de
    // "Enviar Documentación" (modal #feEnvDocTipoOpModal, index.html).
    // Reutiliza lo mismo que "Buscar documentos": el catálogo TIPO_OP_CATALOGO,
    // los registros de _feRepDocsDelPeriodo (el valor elegido se guarda en
    // r.tipoOp del propio registro, que es lo que leen _feRepCsvLineaAnexo1/2)
    // y la misma tabla (Fecha Doc., Cliente, Total, Tipo Op.). Solo se
    // muestra la sección de los tipos que tienen documentos; si no hay
    // ninguno, continúa de inmediato (el flujo sigue igual que antes).
    // ══════════════════════════════════════════════════════════════════
    function _feEnvDocTipoOpSeccion(titulo, docs) {
        var sec = document.createElement('div');
        sec.className = 'fe-envdoc-tipoop-sec';

        var h = document.createElement('p');
        h.className = 'fe-envdoc-tipoop-tit';
        h.textContent = titulo + ' — ' + docs.length + ' documento(s)';
        sec.appendChild(h);

        var wrap = document.createElement('div');
        wrap.className = 'fe-envdoc-tipoop-wrap';
        var tabla = document.createElement('table');
        tabla.innerHTML = '<thead><tr><th>Fecha Doc.</th><th>Cliente</th><th>Total</th><th>Tipo Op.</th></tr></thead>';
        var tbody = document.createElement('tbody');

        docs.forEach(function (r) {
            var tr = document.createElement('tr');
            [formatFecha(r.fecha), r.nombre || '(Consumidor Final)', fMoney(r.total)].forEach(function (txt) {
                var td = document.createElement('td');
                td.textContent = txt;
                tr.appendChild(td);
            });
            var tdOp = document.createElement('td');
            var sel = document.createElement('select');
            TIPO_OP_CATALOGO.forEach(function (o) {
                var opt = document.createElement('option');
                opt.value = o.codigo;
                opt.textContent = o.codigo + ' — ' + o.nombre;
                if (o.codigo === r.tipoOp) opt.selected = true;
                sel.appendChild(opt);
            });
            sel.addEventListener('change', function () { r.tipoOp = sel.value; });
            tdOp.appendChild(sel);
            tr.appendChild(tdOp);
            // Mismo desplegable propio que usa el panel de Reportes (el <select> se
            // conserva oculto y sincronizado, por lo que el listener de arriba sigue válido).
            _feRepMejorarSelect(sel);
            tbody.appendChild(tr);
        });

        tabla.appendChild(tbody);
        wrap.appendChild(tabla);
        sec.appendChild(wrap);
        return sec;
    }

    function _feEnvDocConfigurarTipoOp(anexo1Docs, anexo2Docs, continuar) {
        var modal = document.getElementById('feEnvDocTipoOpModal');
        var cuerpo = document.getElementById('feEnvDocTipoOpBody');
        var bCancelar = document.getElementById('feEnvDocTipoOpCancelar');
        var bContinuar = document.getElementById('feEnvDocTipoOpContinuar');

        // Sin documentos de ningún tipo no hay nada que configurar.
        if (!anexo1Docs.length && !anexo2Docs.length) { continuar(); return; }
        if (!modal || !cuerpo || !bCancelar || !bContinuar) {
            fsAlert('No se pudo abrir la configuración de Tipo Op. (falta #feEnvDocTipoOpModal en index.html).');
            return;
        }

        cuerpo.innerHTML = '';
        if (anexo1Docs.length) cuerpo.appendChild(_feEnvDocTipoOpSeccion('Crédito Fiscal', anexo1Docs));
        if (anexo2Docs.length) cuerpo.appendChild(_feEnvDocTipoOpSeccion('Consumidor Final', anexo2Docs));

        function cerrar() {
            bCancelar.onclick = null;
            bContinuar.onclick = null;
            _cerrarModalAnimado(modal);
        }
        bCancelar.onclick = function () { cerrar(); };
        bContinuar.onclick = function () { cerrar(); continuar(); };

        modal.style.display = 'flex';
        modal.classList.remove('modal-closing');
        modal.classList.add('modal-open');
    }

    function _feEnvDocGenerar(emp, ini, fin, anexo1Docs, anexo2Docs) {
        var rango = formatFecha(ini) + ' al ' + formatFecha(fin);
        var mesLabel = _feRepMesLabelDesdeIso(fin);
        var tipoIng = emp.tipoIng || '1';
        var adjuntos = [];  // { nombre, path } — solo lo generado en ESTA ejecución
        var fallos = [];    // etapas que fallaron
        var omitidos = [];  // etapas omitidas por no haber documentos

        function etapa(nombre, hacer) {
            _feEnvDocEstado('Generando: ' + nombre + '...');
            return Promise.resolve().then(hacer).then(function (res) {
                if (res && res.ok && res.path) {
                    adjuntos.push({ nombre: nombre, path: res.path });
                    showToast(nombre + ' generado.', 'success'); // AGREGADO NUEVO — aviso por cada documento generado
                }
                else fallos.push(nombre + ': ' + ((res && res.error) || 'no se generó el archivo'));
            }).catch(function (err) {
                fallos.push(nombre + ': ' + ((err && err.message) || 'error inesperado'));
            });
        }

        var cadena = Promise.resolve();

        if (anexo1Docs.length) {
            cadena = cadena.then(function () {
                return etapa('Anexo de Ventas Crédito Fiscal', function () {
                    return _feReportesGuardarUnArchivo(1, anexo1Docs, tipoIng, rango, mesLabel, emp, 'csv');
                });
            });
        } else {
            omitidos.push('Anexo de Ventas Crédito Fiscal (no hay documentos de crédito fiscal en el período)');
        }

        if (anexo2Docs.length) {
            cadena = cadena.then(function () {
                return etapa('Anexo de Ventas Consumidor Final', function () {
                    return _feReportesGuardarUnArchivo(2, anexo2Docs, tipoIng, rango, mesLabel, emp, 'csv');
                });
            });
        } else {
            omitidos.push('Anexo de Ventas Consumidor Final (no hay documentos de consumidor final en el período)');
        }

        if (anexo1Docs.length || anexo2Docs.length) {
            cadena = cadena.then(function () {
                return etapa('Reporte General', function () {
                    return _feReportesGuardarGeneral(anexo1Docs, anexo2Docs, rango, mesLabel, emp, true);
                });
            });
        } else {
            omitidos.push('Reporte General (no hay documentos capturados en el período)');
        }

        // PDF y JSON de Ventas (.zip): mismos dos pasos que _feVentasZipGenerar.
        cadena = cadena.then(function () {
            _feEnvDocEstado('Generando: PDF y JSON de ventas...');
            return window.fiscalAPI.buscarVentasZip({ empresaNombre: emp.razon, fechaInicio: ini, fechaFin: fin }).then(function (busq) {
                if (!busq || busq.error) throw new Error((busq && busq.error) || 'No se pudo buscar los documentos.');
                if (!busq.archivos) return null;
                return _feVentasPausa(350).then(function () {
                    return window.fiscalAPI.generarVentasZip({ empresaNombre: emp.razon, fechaInicio: ini, fechaFin: fin, mesLabel: mesLabel, noAbrir: true });
                });
            }).then(function (res) {
                if (res === null || (res && res.vacio)) { omitidos.push('PDF y JSON de ventas (no hay archivos en el período)'); return; }
                if (res && res.ok && res.path) {
                    adjuntos.push({ nombre: 'PDF y JSON de ventas (ZIP)', path: res.path });
                    showToast('PDF y JSON de ventas (ZIP) generado.', 'success'); // AGREGADO NUEVO — aviso por cada documento generado
                }
                else fallos.push('PDF y JSON de ventas: ' + ((res && res.error) || 'no se generó el archivo'));
            }).catch(function (err) {
                fallos.push('PDF y JSON de ventas: ' + ((err && err.message) || 'error inesperado'));
            });
        });

        cadena.then(function () {
            _feEnvDocBloquear(false);
            _feEnvDocEstado('');
            if (!adjuntos.length) {
                var lineas = fallos.map(function (t) { return '• ' + t; }).concat(omitidos.map(function (t) { return '• Omitido: ' + t; }));
                fsAlert('No hay documentos para enviar\n' + (lineas.join('\n') || 'No se generó ningún archivo.'));
                return;
            }
            _feEnvDocAbrirModal({ emp: emp, rango: rango, adjuntos: adjuntos, fallos: fallos, omitidos: omitidos });
        });
    }

    // ── Modal de correo (index.html: #feEnvDocModal) ────────────────────
    function _feEnvDocError(msg) {
        var el = document.getElementById('feEnvDocError');
        if (!el) return;
        el.textContent = msg || '';
        el.style.display = msg ? 'block' : 'none';
    }

    function _feEnvDocSetEnviando(enviando) {
        _feEnvDocEnviando = enviando;
        var bEnviar = document.getElementById('feEnvDocBtnEnviar');
        var bCancel = document.getElementById('feEnvDocBtnCancelar');
        var input = document.getElementById('feEnvDocCorreo');
        if (bEnviar) { bEnviar.disabled = enviando; bEnviar.innerText = enviando ? 'Enviando...' : 'Enviar'; bEnviar.style.opacity = enviando ? '0.6' : '1'; }
        if (bCancel) { bCancel.disabled = enviando; bCancel.style.opacity = enviando ? '0.6' : '1'; }
        if (input) input.disabled = enviando;
    }

    function _feEnvDocAbrirModal(p) {
        _feEnvDocPendiente = p;
        var lista = document.getElementById('feEnvDocLista');
        var avisos = document.getElementById('feEnvDocAvisos');
        var input = document.getElementById('feEnvDocCorreo');
        var modal = document.getElementById('feEnvDocModal');
        if (!lista || !avisos || !input || !modal) {
            _feEnvDocPendiente = null;
            fsAlert('No se pudo abrir la ventana de envío (falta #feEnvDocModal en index.html).');
            return;
        }
        lista.innerHTML = p.adjuntos.map(function (a) {
            return '<li style="display:flex;justify-content:space-between;gap:10px;padding:5px 0;font-size:12px;color:var(--rp-text-primary);">' +
                '<span>' + escHtml(a.nombre) + '</span>' +
                '<span style="color:var(--rp-text-secondary);font-size:11px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:50%;">' + escHtml(_feEnvDocNombreArchivo(a.path)) + '</span>' +
                '</li>';
        }).join('');

        var html = p.fallos.map(function (t) {
            return '<div style="color:var(--rp-error);">No se pudo generar — ' + escHtml(t) + '</div>';
        }).concat(p.omitidos.map(function (t) {
            return '<div style="color:var(--rp-text-secondary);">Omitido — ' + escHtml(t) + '</div>';
        })).join('');
        avisos.innerHTML = html;
        avisos.style.display = html ? 'block' : 'none';

        input.value = _feEnvDocCorreoGuardado(p.emp);
        input.classList.remove('input-error');
        _feEnvDocError('');
        _feEnvDocSetEnviando(false);
        if (!input._feEnvDocEnter) {
            input._feEnvDocEnter = true;
            input.addEventListener('keydown', function (e) { if (e.key === 'Enter') _feEnvDocConfirmar(); });
            input.addEventListener('input', function () { input.classList.remove('input-error'); _feEnvDocError(''); });
        }
        modal.style.display = 'flex';
        modal.classList.add('modal-open');
        setTimeout(function () { try { input.focus(); } catch (e) {} }, 60);
    }

    function _feEnvDocCerrar() {
        _feEnvDocPendiente = null;
        _cerrarModalAnimado('feEnvDocModal');
    }

    function _feEnvDocCancelar() {
        if (_feEnvDocEnviando) return;
        _feEnvDocCerrar();
        showToast('Envío cancelado. Los archivos quedaron guardados en Facturacion/Reportes.', 'info');
    }

    // AGREGADO NUEVO — Cuerpo HTML del correo de "Enviar Documentación".
    // Mismo diseño "Azul profesional" que usa Correo.js para los DTE
    // (_correosPlantillaAzulHtml: colores, encabezado, tarjetas, aviso y pie),
    // pero con el contenido adaptado a la documentación de ventas de un período.
    // Es solo presentación: no toca adjuntos ni datos.
    function _feEnvDocHtml(empresaNombre, rango, adjuntos) {
        var C = {
            dark: '#12305D', accent: '#55A8FF', accentDark: '#176BB7', soft: '#EAF4FF',
            border: '#CFE3F6', note: '#F1F7FD', noteText: '#7B8999', footer: '#EAF3FC',
            footerText: '#6E8196', person: '#FBFCFD', white: '#FFFFFF'
        };
        var emisor = escHtml(empresaNombre || '');
        var periodo = escHtml(rango || '');
        var mensaje = 'Hola. Te enviamos la documentación de ventas de <strong>' + emisor + '</strong> correspondiente al período <strong>' + periodo + '</strong>.';

        function infoCard(label, value) {
            return '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:' + C.person + ';border:1px solid ' + C.border + ';border-radius:9px;margin-bottom:10px;">' +
                '<tr><td style="padding:12px 14px;font-family:Arial,sans-serif;">' +
                '<div style="font-size:10px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:' + C.accentDark + ';">' + label + '</div>' +
                '<div style="font-size:13.5px;font-weight:600;color:' + C.dark + ';margin-top:4px;">' + value + '</div>' +
                '</td></tr></table>';
        }

        var docs = adjuntos.map(function (a, i) {
            var ext = (_feEnvDocNombreArchivo(a.path).split('.').pop() || '').toUpperCase();
            return '<tr><td style="padding-bottom:' + (i === adjuntos.length - 1 ? '0' : '10') + 'px;">' +
                '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:' + C.person + ';border:1px solid ' + C.border + ';border-radius:9px;"><tr>' +
                '<td style="width:44px;padding:12px;">' +
                '<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="36" height="36" style="background:' + C.soft + ';border-radius:8px;">' +
                '<tr><td align="center" valign="middle" style="color:' + C.accentDark + ';font-size:9px;font-weight:700;font-family:Arial,sans-serif;">' + escHtml(ext) + '</td></tr></table>' +
                '</td>' +
                '<td style="padding:12px 12px 12px 0;font-family:Arial,sans-serif;">' +
                '<div style="font-size:13px;font-weight:600;color:' + C.dark + ';">' + escHtml(a.nombre) + '</div>' +
                '<div style="font-size:12px;color:#7B8999;margin-top:2px;">' + escHtml(_feEnvDocNombreArchivo(a.path)) + '</div>' +
                '</td></tr></table></td></tr>';
        }).join('');

        return '<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8">' +
            '<meta name="viewport" content="width=device-width, initial-scale=1.0">' +
            '<title>FiscalSync — Documentación de ventas</title>' +
            '<meta name="color-scheme" content="light only"><meta name="supported-color-schemes" content="light only">' +
            '<style>body{margin:0;padding:0;background:#F3F6FA;}img{border:0;}' +
            '@media only screen and (max-width:600px){.fs-wrap{width:100%!important;}.fs-pad{padding-left:16px!important;padding-right:16px!important;}}</style>' +
            '</head><body bgcolor="#F3F6FA" style="margin:0;padding:0;background:#F3F6FA;">' +
            '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#F3F6FA" style="background:#F3F6FA;">' +
            '<tr><td align="center" style="padding:24px 12px;">' +
            '<table role="presentation" class="fs-wrap" width="600" cellpadding="0" cellspacing="0" border="0" style="width:600px;max-width:100%;">' +
            '<tr><td class="fs-pad" style="background:' + C.dark + ';border-radius:14px 14px 0 0;padding:28px 32px;font-family:Arial,sans-serif;">' +
            '<div style="font-size:18px;font-weight:700;color:' + C.white + ';">Fiscal<span style="color:' + C.accent + ';">Sync</span></div>' +
            '<div style="font-size:11px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:' + C.accent + ';margin-top:18px;">Facturación electrónica</div>' +
            '<div style="font-size:22px;font-weight:700;color:' + C.white + ';margin-top:6px;">Tu documentación está lista</div>' +
            '<div style="font-size:13.5px;line-height:1.6;color:#DCE9FB;margin-top:10px;">' + mensaje + '</div>' +
            '</td></tr>' +
            '<tr><td class="fs-pad" style="background:' + C.white + ';padding:28px 32px 0;">' +
            '<div style="font-size:11px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:' + C.dark + ';margin:0 0 10px;font-family:Arial,sans-serif;">Información de la documentación</div>' +
            infoCard('Empresa', emisor || '—') +
            infoCard('Período', periodo || '—') +
            infoCard('Documentos adjuntos', String(adjuntos.length)) +
            '<div style="font-size:11px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:' + C.dark + ';margin:12px 0 10px;font-family:Arial,sans-serif;">Documentos incluidos</div>' +
            '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">' + docs + '</table>' +
            '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:' + C.note + ';border-radius:9px;margin:22px 0 24px;">' +
            '<tr><td style="padding:12px 16px;font-family:Arial,sans-serif;font-size:11.5px;line-height:1.6;color:' + C.noteText + ';">' +
            'Este correo fue generado automáticamente por FiscalSync.<br>Conserva los archivos adjuntos como respaldo de la documentación.' +
            '</td></tr></table>' +
            '</td></tr>' +
            '<tr><td class="fs-pad" style="background:' + C.footer + ';border-radius:0 0 14px 14px;padding:20px 32px;font-family:Arial,sans-serif;text-align:center;">' +
            '<div style="font-size:12.5px;font-weight:700;"><span style="color:' + C.dark + ';">FiscalSync</span> <span style="color:' + C.footerText + ';font-weight:400;">— Facturación Electrónica</span></div>' +
            '<div style="font-size:11px;color:' + C.footerText + ';margin-top:6px;">© ' + (new Date().getFullYear()) + ' FiscalSync. Todos los derechos reservados.</div>' +
            '<div style="font-size:10.5px;color:' + C.footerText + ';margin-top:4px;">Mensaje automático · No responder directamente a este correo.</div>' +
            '</td></tr>' +
            '</table></td></tr></table></body></html>';
    }

    // AGREGADO NUEVO — La opción "Enviar Documentación" solo existe en el select
    // si la empresa activa tiene el correo configurado (mismo criterio que el
    // botón "Correo" de la barra superior: _feCorreoActualizarVisibilidad).
    // Se evalúa cada vez que se abre el panel. El menú propio del select se
    // arma al abrirse a partir de sus <option>, así que basta con quitar/poner
    // la opción.
    var _feEnvDocOpcion = null; // el <option> original, para poder volver a ponerlo
    function _feEnvDocActualizarOpcion() {
        var sel = document.getElementById('feRepTipoSelect');
        if (!sel || !sel.querySelector) return;
        if (!_feEnvDocOpcion) _feEnvDocOpcion = sel.querySelector('option[value="enviar-doc"]');
        if (!_feEnvDocOpcion) return;
        var emp = _feRepEmpresaActiva();
        var configurado = !!(emp && emp.correosActivo && emp.correosEmail);
        var presente = _feEnvDocOpcion.parentNode === sel;
        if (configurado && !presente) {
            sel.appendChild(_feEnvDocOpcion);
        } else if (!configurado && presente) {
            if (sel.value === 'enviar-doc') {
                // Si estaba elegida, se vuelve a la primera opción por el camino normal (restablece botón y panel).
                sel.value = 'anexo1-csv';
                sel.dispatchEvent(new Event('change', { bubbles: true }));
            }
            sel.removeChild(_feEnvDocOpcion);
        }
        if (sel._feDdRefresh) sel._feDdRefresh();
    }

    // AGREGADO NUEVO — Deja constancia del envío en el apartado Correo de
    // Facturación Electrónica: una fila "✓ Enviado" en Documentos y una entrada
    // en Historial, usando el mismo almacenamiento de Correo.js
    // (_correosLoadDocs/_correosSaveDocs/_correosRegistrarEnHistorial).
    function _feEnvDocRegistrarEnCorreo(p, correo) {
        try {
            if (typeof _correosRegistrarEnHistorial !== 'function') return;
            var doc = {
                numDoc: p.rango, tipo: p.adjuntos.length + ' archivo(s) adjunto(s)', tipoCodigo: '',
                nombreCliente: 'Documentación de ventas', nitCliente: '', correoCliente: correo,
                fecha: '', monto: '0.00', estado: 'enviado',
                pdfPath: '', jsonPath: '', fechaEnvio: new Date().toLocaleDateString('es-SV'),
                codigoGeneracion: '', esDocumentacion: true
            };
            _correosRegistrarEnHistorial(doc, true, '');
            if (typeof _feCorreoRefreshActiveTab === 'function') _feCorreoRefreshActiveTab();
            if (typeof _feCorreoActualizarStats === 'function') _feCorreoActualizarStats();
        } catch (e) {
            console.error('[Enviar Documentación] no se pudo registrar en Correo:', e);
        }
    }

    function _feEnvDocConfirmar() {
        if (_feEnvDocEnviando || !_feEnvDocPendiente) return;
        var p = _feEnvDocPendiente;
        var input = document.getElementById('feEnvDocCorreo');
        var correo = String(input.value || '').trim();
        if (!/^[^\s@,;<>"']+@[^\s@,;<>"']+\.[^\s@,;<>"']+$/.test(correo)) {
            input.classList.add('input-error');
            _feEnvDocError('Escribe una dirección de correo válida.');
            return;
        }
        if (!p.adjuntos.length) { _feEnvDocError('No hay documentos disponibles para adjuntar.'); return; }
        if (typeof _correosDecipher !== 'function') { _feEnvDocError('No se pudo leer la configuración de correo (módulo Correo no cargado).'); return; }

        var emp = p.emp;
        var texto = 'Estimado/a,\n\nAdjuntamos la documentación de ventas de ' + emp.razon +
            ' correspondiente al período ' + p.rango + ':\n\n' +
            p.adjuntos.map(function (a) { return '• ' + a.nombre; }).join('\n') +
            '\n\nSaludos cordiales.\n' + emp.razon;

        var mailOptions = {
            from: emp.correosEmail,
            to: correo,
            subject: 'Documentación de ventas - ' + emp.razon + ' (' + p.rango + ')',
            text: texto,
            html: _feEnvDocHtml(emp.razon, p.rango, p.adjuntos),
            attachments: p.adjuntos.map(function (a) { return { path: a.path }; })
        };
        var smtpConfig = {
            host: 'smtp.gmail.com', port: 465, secure: true,
            auth: { user: emp.correosEmail, pass: _correosDecipher(emp.correosPass) },
            connectionTimeout: 30000, greetingTimeout: 15000, socketTimeout: 30000
        };

        _feEnvDocError('');
        _feEnvDocSetEnviando(true);
        window.electronAPI.sendEmail({ mailOptions: mailOptions, smtpConfig: smtpConfig }).then(function (res) {
            _feEnvDocSetEnviando(false);
            if (res && res.error) {
                _feEnvDocError('Falló la etapa de envío del correo: ' + res.error);
                showToast('No se pudo enviar la documentación (falló el envío del correo).', 'error');
                return;
            }
            _feEnvDocCerrar();
            _feEnvDocGuardarCorreo(emp, correo);
            _feEnvDocRegistrarEnCorreo(p, correo);
            if (p.fallos.length) {
                showToast('Correo enviado a ' + correo + ', pero faltó generar:\n' + p.fallos.join('\n'), 'warning');
            } else {
                showToast('Documentación enviada a ' + correo + ' (' + p.adjuntos.length + ' adjunto(s)).', 'success');
            }
        }).catch(function (err) {
            _feEnvDocSetEnviando(false);
            _feEnvDocError('Falló la etapa de envío del correo: ' + ((err && err.message) || String(err)));
            showToast('No se pudo enviar la documentación (falló el envío del correo).', 'error');
        });
    }

    // ══════════════════════════════════════════════════════════════════
    // DESPLEGABLE PROPIO — el menú abierto de un <select> nativo lo dibuja
    // el sistema operativo y no se puede estilizar con CSS. Aquí cada
    // <select> del panel de Reportes se oculta y se reemplaza por un botón
    // + menú propio con el diseño de la app. El <select> original se
    // conserva y se mantiene sincronizado (valor + evento "change"), así
    // que sus onchange y toda la lógica existente siguen funcionando igual.
    // ══════════════════════════════════════════════════════════════════
    var _feDdMenuAbierto = null;

    function _feDdCerrar() {
        if (!_feDdMenuAbierto) return;
        var m = _feDdMenuAbierto;
        _feDdMenuAbierto = null;
        m.menu.classList.remove('show');
        m.btn.classList.remove('open');
        setTimeout(function () { if (m.menu.parentNode) m.menu.parentNode.removeChild(m.menu); }, 130);
    }

    function _feDdAbrir(sel, btn) {
        _feDdCerrar();
        var menu = document.createElement('div');
        menu.className = 'fe-dd-menu';
        // El modal de "Tipo Op." (Enviar Documentación) está por encima del panel: el menú debe quedar sobre él.
        if (btn.closest && btn.closest('#feEnvDocTipoOpModal')) menu.style.zIndex = '10000001';
        Array.prototype.forEach.call(sel.options, function (opt) {
            var item = document.createElement('div');
            item.className = 'fe-dd-item' + (opt.value === sel.value ? ' sel' : '');
            var txt = document.createElement('span');
            txt.textContent = opt.text;
            item.appendChild(txt);
            if (opt.value === sel.value) {
                var chk = document.createElement('span');
                chk.textContent = '✓';
                item.appendChild(chk);
            }
            item.addEventListener('click', function (e) {
                e.stopPropagation();
                var cambio = sel.value !== opt.value;
                sel.value = opt.value;
                sel._feDdRefresh();
                _feDdCerrar();
                if (cambio) sel.dispatchEvent(new Event('change', { bubbles: true }));
            });
            menu.appendChild(item);
        });
        document.body.appendChild(menu);

        var r = btn.getBoundingClientRect();
        var ancho = Math.max(r.width, sel.closest('table') ? 260 : 0);
        menu.style.width = ancho + 'px';
        menu.style.left = Math.min(r.left, window.innerWidth - ancho - 8) + 'px';
        // El menú nunca debe salirse del modal de Reportes: el espacio
        // disponible se mide contra el borde del panel (no de la ventana).
        var panel = btn.closest('#feReportesDropdown');
        var pr = panel ? panel.getBoundingClientRect() : { top: 0, bottom: window.innerHeight };
        var limInf = Math.min(window.innerHeight - 8, pr.bottom - 8);
        // La lista se queda por encima del botón "Generar Reporte" (footer):
        // si no cabe completa, se acorta y se desplaza con scroll interno.
        var pie = panel ? panel.querySelector('.fe-rep-footer') : null;
        if (pie) limInf = Math.min(limInf, pie.getBoundingClientRect().top - 6);
        var limSup = Math.max(8, pr.top + 8);
        var abajo = limInf - r.bottom - 4;
        var arriba = r.top - limSup - 4;
        var altoMenu = menu.offsetHeight;
        if (altoMenu <= abajo || abajo >= arriba) {
            var maxA = Math.max(60, Math.min(280, abajo));
            menu.style.maxHeight = maxA + 'px';
            menu.style.top = (r.bottom + 4) + 'px';
        } else {
            var maxB = Math.max(80, Math.min(280, arriba, altoMenu));
            menu.style.maxHeight = maxB + 'px';
            menu.style.top = (r.top - 4 - Math.min(altoMenu, maxB)) + 'px';
        }
        btn.classList.add('open');
        requestAnimationFrame(function () { menu.classList.add('show'); });
        _feDdMenuAbierto = { menu: menu, btn: btn };
    }

    function _feRepMejorarSelect(sel) {
        if (!sel || sel._feDdListo) return;
        sel._feDdListo = true;
        sel.style.display = 'none';

        var btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'fe-dd-btn';
        btn.innerHTML = '<span></span><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M19 9l-7 7-7-7"/></svg>';
        sel.parentNode.insertBefore(btn, sel.nextSibling);

        sel._feDdRefresh = function () {
            var o = sel.options[sel.selectedIndex];
            btn.firstChild.textContent = o ? o.text : '';
        };
        sel._feDdRefresh();

        btn.addEventListener('click', function (e) {
            e.stopPropagation();
            if (_feDdMenuAbierto && _feDdMenuAbierto.btn === btn) _feDdCerrar();
            else _feDdAbrir(sel, btn);
        });
    }

    function _feRepMejorarSelects() {
        var panel = document.getElementById('feReportesDropdown');
        if (!panel) return;
        Array.prototype.forEach.call(panel.querySelectorAll('select'), _feRepMejorarSelect);
    }

    document.addEventListener('click', _feDdCerrar);
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape') _feDdCerrar(); });
    window.addEventListener('resize', _feDdCerrar);
    // Cierra al desplazarse el contenido de fondo, pero NO cuando el scroll
    // ocurre dentro de la propia lista (si no, no se podría desplazar).
    document.addEventListener('scroll', function (e) {
        if (_feDdMenuAbierto && e.target && _feDdMenuAbierto.menu.contains(e.target)) return;
        _feDdCerrar();
    }, true);

    _feRepMejorarSelects();

    // ══════════════════════════════════════════════════════════════════
    // AGREGADO — "Período de consulta": Mensual / Rango personalizado.
    // Los campos Desde/Hasta (#feRepFechaInicio / #feRepFechaFin) siguen
    // siendo la ÚNICA fuente de fechas para Buscar, Generar Reporte y el ZIP.
    // En modo "Mensual" solo se calculan y escriben ahí (y se ocultan);
    // en modo "Rango personalizado" funcionan exactamente como antes.
    // La sección (HTML) está en index.html: #feRepPeriodoBloque.
    // ══════════════════════════════════════════════════════════════════
    var _feRepPeriodoModo = 'mes';
    var _feRepRangoManual = null;   // rango escrito a mano, para restaurarlo al volver a "rango"
    var _feRepPeriodoOcultos = [];  // contenedores de Desde/Hasta que se ocultan en modo "mes"

    function _feRepPeriodoInvalidarResultados() {
        _feRepResultados = [];
        var wrap = document.getElementById('feRepTablaWrap');
        var resumen = document.getElementById('feRepResumen');
        if (wrap) wrap.style.display = 'none';
        if (resumen) resumen.innerText = '';
    }

    // Años: del más reciente al más antiguo. Siempre incluye el año actual,
    // el del mes de trabajo y 5 años atrás; si hay documentos capturados de
    // años más viejos (o más nuevos), también se incluyen.
    function _feRepPeriodoAnios(usarDocs) {
        var hoy = new Date().getFullYear();
        var max = Math.max(hoy, currentYear), min = Math.min(hoy, currentYear) - 5;
        if (usarDocs) {
            try {
                _feRepCargarDocs().forEach(function (d) {
                    var y = parseInt(String((d && d.fecha) || '').slice(0, 4), 10);
                    if (y > 1990 && y < 2200) { if (y < min) min = y; if (y > max) max = y; }
                });
            } catch (e) {}
        }
        var out = [];
        for (var y = max; y >= min; y--) out.push(y);
        return out;
    }

    function _feRepPeriodoLlenarAnios(usarDocs) {
        var sel = document.getElementById('feRepPeriodoAnio');
        if (!sel) return;
        var actual = sel.value || String(currentYear);
        var anios = _feRepPeriodoAnios(usarDocs);
        if (anios.indexOf(parseInt(actual, 10)) === -1) actual = String(anios[0]);
        sel.innerHTML = anios.map(function (y) { return '<option value="' + y + '">' + y + '</option>'; }).join('');
        sel.value = actual;
        if (sel._feDdRefresh) sel._feDdRefresh();
    }

    // Calcula primer y último día del mes elegido (meses de distinta
    // duración y años bisiestos incluidos) y los escribe en Desde/Hasta.
    function _feRepPeriodoAplicar() {
        var anio = document.getElementById('feRepPeriodoAnio');
        var mes = document.getElementById('feRepPeriodoMes');
        var ini = document.getElementById('feRepFechaInicio');
        var fin = document.getElementById('feRepFechaFin');
        var info = document.getElementById('feRepPeriodoInfo');
        if (!anio || !mes || !ini || !fin) return;
        var y = parseInt(anio.value, 10), m = parseInt(mes.value, 10);
        if (isNaN(y) || isNaN(m)) return;
        ini.value = _feVentasIso(y, m, 1);
        fin.value = _feVentasIso(y, m, new Date(y, m + 1, 0).getDate());
        if (info) info.textContent = formatFecha(ini.value) + ' al ' + formatFecha(fin.value);
        ini.dispatchEvent(new Event('change', { bubbles: true }));
        fin.dispatchEvent(new Event('change', { bubbles: true }));
    }

    function _feRepPeriodoCambiarModo(modo) {
        var ini = document.getElementById('feRepFechaInicio');
        var fin = document.getElementById('feRepFechaFin');
        var wrap = document.getElementById('feRepPeriodoMesWrap');
        var info = document.getElementById('feRepPeriodoInfo');
        if (!ini || !fin || !wrap) return;
        var esMes = modo === 'mes';
        if (esMes && _feRepPeriodoModo === 'rango') _feRepRangoManual = { ini: ini.value, fin: fin.value };
        if (esMes && _feRepRangoManual === null) _feRepRangoManual = { ini: ini.value, fin: fin.value };
        _feRepPeriodoModo = modo;
        wrap.style.display = esMes ? 'flex' : 'none';
        if (info) info.style.display = esMes ? '' : 'none';
        _feRepPeriodoOcultos.forEach(function (el) { el.style.display = esMes ? 'none' : 'flex'; });
        if (esMes) {
            _feRepPeriodoAplicar();
        } else if (_feRepRangoManual) {
            ini.value = _feRepRangoManual.ini; fin.value = _feRepRangoManual.fin;
        }
        _feRepPeriodoInvalidarResultados();
    }

    // Conecta la sección "Período de consulta" que ya está en index.html
    // (#feRepPeriodoBloque). Es idempotente.
    var _feRepPeriodoListo = false;
    function _feRepPeriodoInit() {
        if (_feRepPeriodoListo) return;
        var selAnio = document.getElementById('feRepPeriodoAnio');
        var selMes = document.getElementById('feRepPeriodoMes');
        var rangoWrap = document.getElementById('feRepRangoWrap');
        if (!selAnio || !selMes || !rangoWrap || !document.getElementById('feRepPeriodoModo') || !document.getElementById('feRepFechaInicio')) return;
        _feRepPeriodoListo = true;
        _feRepPeriodoOcultos = [rangoWrap];

        _feRepPeriodoLlenarAnios(false);
        selMes.innerHTML = MONTH_NAMES.map(function (n, i) { return '<option value="' + i + '">' + n + '</option>'; }).join('');
        selMes.value = String(currentMonth);
        selAnio.value = String(currentYear);
        _feRepMejorarSelect(selAnio);
        _feRepMejorarSelect(selMes);
        if (selAnio._feDdRefresh) selAnio._feDdRefresh();
        if (selMes._feDdRefresh) selMes._feDdRefresh();

        function alCambiarSel() { _feRepPeriodoAplicar(); _feRepPeriodoInvalidarResultados(); }
        selAnio.addEventListener('change', alCambiarSel);
        selMes.addEventListener('change', alCambiarSel);
        var selModo = document.getElementById('feRepPeriodoModo');
        _feRepMejorarSelect(selModo);
        if (selModo._feDdRefresh) selModo._feDdRefresh();
        selModo.addEventListener('change', function () { _feRepPeriodoCambiarModo(selModo.value === 'rango' ? 'rango' : 'mes'); });

        _feRepPeriodoCambiarModo(selModo.value === 'rango' ? 'rango' : 'mes');
    }

    // Al abrir el panel: conecta la sección si aún no estaba lista y actualiza la
    // lista de años con los documentos ya capturados (mantiene la selección).
    function _feRepPeriodoAlAbrir() {
        _feRepPeriodoInit();
        _feRepPeriodoLlenarAnios(true);
        if (_feRepPeriodoModo === 'mes') _feRepPeriodoAplicar();
    }

    _feRepPeriodoInit();

    // ══════════════════════════════════════════════════════════════════
    // Reglas de apertura de los paneles de la barra superior
    //   - Clientes y Correo: son los únicos que pueden estar abiertos juntos.
    //   - Configuración y Reportes: exclusivos; al abrirse cierran todo lo demás.
    //   - Al abrir Clientes o Correo se cierran Configuración y Reportes.
    // Se observa la clase 'open' de cada panel, así no hace falta tocar sus
    // funciones de apertura. Todos quedan anclados al borde derecho.
    // ══════════════════════════════════════════════════════════════════
    var FE_PANELES = ['feClientesDropdown', 'feCorreoDropdown', 'feConfigDropdown', 'feReportesDropdown'];
    var FE_EXCLUSIVOS = ['feConfigDropdown', 'feReportesDropdown'];
    var FE_CERRAR_FN = {
        feClientesDropdown: '_feClientesCerrarDropdown',
        feCorreoDropdown:   '_feCorreoCerrarDropdown',
        feConfigDropdown:   '_feConfigCerrarDropdown',
        feReportesDropdown: '_feReportesCerrarDropdown'
    };

    function _feGrupoCerrarPanel(id) {
        var el = document.getElementById(id);
        if (!el || !el.classList.contains('open')) return;
        var fn = window[FE_CERRAR_FN[id]];
        if (typeof fn === 'function') fn();
        if (el.classList.contains('open')) el.classList.remove('open');
    }

    // Configuración nunca comparte espacio con otro panel: siempre en el
    // borde derecho (anula el desplazamiento por clase de FEConfig).
    function _feGruposLayout() {
        var cfg = document.getElementById('feConfigDropdown');
        if (cfg) cfg.style.right = '12px';
    }

    function _feGruposAlCambiar(id) {
        var el = document.getElementById(id);
        if (el && el.classList.contains('open')) {
            if (FE_EXCLUSIVOS.indexOf(id) !== -1) {
                FE_PANELES.forEach(function (o) { if (o !== id) _feGrupoCerrarPanel(o); });
            } else {
                FE_EXCLUSIVOS.forEach(_feGrupoCerrarPanel);
            }
        }
        _feGruposLayout();
    }

    function _feGruposInit() {
        FE_PANELES.forEach(function (id) {
            var el = document.getElementById(id);
            if (!el || el._feGrupoObs) return;
            el._feGrupoObs = new MutationObserver(function () { _feGruposAlCambiar(id); });
            el._feGrupoObs.observe(el, { attributes: true, attributeFilter: ['class'] });
        });
        _feGruposLayout();
    }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', _feGruposInit);
    else _feGruposInit();

    // Exponer al scope global lo que necesitan los atributos onclick/onchange
    // del HTML (mismo patrón que el resto de módulos de este proyecto).
    window._feReportesToggleDropdown = _feReportesToggleDropdown;
    window._feReportesCerrarDropdown = _feReportesCerrarDropdown;
    window._feReportesElegirTipo = _feReportesElegirTipo;
    window._feReportesBuscar = _feReportesBuscar;
    window._feReportesGenerar = _feReportesGenerar;
    window._feReportesResultados = _feReportesResultados;
    window._feReportesEliminarDocsEmpresa = _feReportesEliminarDocsEmpresa;
    window._feVentasZipGenerar = _feVentasZipGenerar;
    window._feEnviarDocumentacion = _feEnviarDocumentacion;
    window._feEnvDocConfirmar = _feEnvDocConfirmar;
    window._feEnvDocCancelar = _feEnvDocCancelar;

})();
