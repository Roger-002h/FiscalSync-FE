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
        // Cierra otros paneles flotantes de FE (Config/Correo/Clientes) si
        // están abiertos, igual que ya hacen entre ellos.
        ['feConfigDropdown', 'feCorreoDropdown', 'feClientesDropdown'].forEach(function (id) {
            var el = document.getElementById(id);
            if (el) el.classList.remove('open');
        });
        var abrir = !abierto;
        if (abrir) _feReportesPosicionar(panel);
        panel.classList.toggle('open', abrir);
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
        panel.classList.remove('open');
    });

    window.addEventListener('resize', function () {
        var panel = document.getElementById('feReportesDropdown');
        if (panel && panel.classList.contains('open')) _feReportesPosicionar(panel);
    });

    function _feReportesElegirTipo(tipo) {
        _feRepTipoSeleccionado = tipo;
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

        var docs = _feRepCargarDocs();
        var empActivaId = _feRepEmpresaActiva().id; // AGREGADO NUEVO — Multiempresa
        _feRepResultados = docs.filter(function (d) {
            return d.empresaId === empActivaId && d.fecha >= ini && d.fecha <= fin && tipos.indexOf(d.tipoDoc) !== -1;
        }).sort(function (a, b) { return a.fecha < b.fecha ? -1 : a.fecha > b.fecha ? 1 : 0; });

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

    function _feRepSnapshotAnexo1(registros, meta) {
        return '<html><head><meta charset="UTF-8"><style>' + _feRepPrintCss + '</style></head><body>' +
            '<p class="sub">' + escHtml(meta.empresaRazon) + ' — ' + escHtml(meta.rango) + '</p>' +
            _feRepTablaAnexo1(registros) +
            '</body></html>';
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
        return '<html><head><meta charset="UTF-8"><style>' + _feRepPrintCss + '</style></head><body>' +
            '<p class="sub">' + escHtml(meta.empresaRazon) + ' — ' + escHtml(meta.rango) + '</p>' +
            _feRepTablaAnexo2(registros) +
            '</body></html>';
    }

    // PDF General (opción "Generar Reporte General"): un único documento
    // que incluye Anexo 1 y Anexo 2, reutilizando exactamente las mismas
    // tablas/totales que se usan cuando se genera cada anexo por separado.
    function _feRepSnapshotGeneral(anexo1Docs, anexo2Docs, meta) {
        return '<html><head><meta charset="UTF-8"><style>' + _feRepPrintCss + '</style></head><body>' +
            '<h2 style="font-size:18px;">Reporte General de Ventas</h2>' +
            '<p class="sub">' + escHtml(meta.empresaRazon) + ' — ' + escHtml(meta.rango) + '</p>' +
            (anexo1Docs.length > 0 ? _feRepTablaAnexo1(anexo1Docs) : '') +
            (anexo1Docs.length > 0 && anexo2Docs.length > 0 ? '<div style="height:18px;"></div>' : '') +
            (anexo2Docs.length > 0 ? _feRepTablaAnexo2(anexo2Docs) : '') +
            '</body></html>';
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
        if (_feRepResultados.length === 0) { fsAlert('Primero presiona "Buscar documentos".'); return; }

        var cfg = FE_REP_TIPOS[_feRepTipoSeleccionado];

        _feReportesResolverExportacion(_feRepResultados, function () {
            var emp = _feRepEmpresaActiva();
            var tipoIng = emp.tipoIng || '1';
            var ini = document.getElementById('feRepFechaInicio').value;
            var fin = document.getElementById('feRepFechaFin').value;
            var rango = formatFecha(ini) + ' al ' + formatFecha(fin);
            var mesLabel = MONTH_NAMES[currentMonth] + ' ' + currentYear;

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
        return window.fiscalAPI.guardarReportePdf({
            htmlSnapshot: html,
            fileName: nombreBase + '.pdf',
            mesLabel: mesLabel,
            empresaNombre: emp.razon
        });
    }

    function _feReportesGuardarGeneral(anexo1Docs, anexo2Docs, rango, mesLabel, emp) {
        var nombreBase = 'ReporteGeneral_' + rango.replace(/\//g, '-').replace(/ al /, '_al_');
        var meta = { empresaRazon: emp.razon || '', rango: rango };
        var html = _feRepSnapshotGeneral(anexo1Docs, anexo2Docs, meta);
        return window.fiscalAPI.guardarReportePdf({
            htmlSnapshot: html,
            fileName: nombreBase + '.pdf',
            mesLabel: mesLabel,
            empresaNombre: emp.razon
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

    // Exponer al scope global lo que necesitan los atributos onclick/onchange
    // del HTML (mismo patrón que el resto de módulos de este proyecto).
    window._feReportesToggleDropdown = _feReportesToggleDropdown;
    window._feReportesElegirTipo = _feReportesElegirTipo;
    window._feReportesBuscar = _feReportesBuscar;
    window._feReportesGenerar = _feReportesGenerar;
    window._feReportesResultados = _feReportesResultados;
    window._feReportesEliminarDocsEmpresa = _feReportesEliminarDocsEmpresa;

})();
