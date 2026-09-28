// facturacion-electronica/FEClientes.js
// Extraído automáticamente de index.html (FiscalSync) — Fase 2.
// No se modificó ninguna línea de lógica: es exactamente el código original,
// solo reordenado por módulo.



    // ════════════════════════════════════════════════════════════════════
    // Implementación 02 — Facturación Electrónica: CLIENTES
    // ────────────────────────────────────────────────────────────────────
    // Reemplaza al botón flotante (FAB) que antes inyectaba la extensión
    // de Chrome directo sobre admin.factura.gob.sv. Ahora es un dropdown
    // que vive en el DOM de la app (#feClientesDropdown, dentro de
    // #facturacionElecWebviewContainer) — el <webview> nunca se toca ni
    // se le inyecta nada; el llenado se hace desde afuera con
    // webview.executeJavaScript(), igual que el resto del programa ya usa
    // ese mismo mecanismo para otras automatizaciones sobre Hacienda.
    //
    // Almacenamiento: JSON en disco por empresa (fiscalAPI.leerClientesFE/
    // guardarClientesFE, ver main.js) — independiente del catálogo de
    // "Clientes" de Gestión/Escaneo QR (Libro de Ventas).
    // ════════════════════════════════════════════════════════════════════

    var _feClientesCache = [];

    function _feClientesToggleDropdown(ev) {
        if (ev) ev.stopPropagation();
        var dd = document.getElementById('feClientesDropdown');
        if (!dd) return;
        var abriendo = !dd.classList.contains('open');
        if (abriendo) {
            _feClientesAbrirDropdown();
        } else {
            _feClientesCerrarDropdown();
        }
    }

    function _feClientesAbrirDropdown() {
        var dd = document.getElementById('feClientesDropdown');
        if (!dd) return;
        // AGREGADO NUEVO (Cambio 01 — Separar Registro de Clientes del
        // Listado): al abrir el panel siempre se parte desde la vista de
        // Lista de Clientes (por si había quedado en la vista de
        // Registrar/Editar de una apertura anterior).
        _feClientesMostrarVista('lista');
        document.getElementById('feClientesBuscar').value = "";
        dd.classList.add('open');
        _feClientesCargar();
        _feCorreoActualizarPosicion();  // AGREGADO (Cambio 03, Caso 2)
        _feConfigActualizarPosicion();  // AGREGADO (Cambio 03, Caso 2)
    }

    function _feClientesCerrarDropdown() {
        var dd = document.getElementById('feClientesDropdown');
        if (dd) dd.classList.remove('open');
        _feCorreoActualizarPosicion();  // AGREGADO (Cambio 03, Caso 2)
        _feConfigActualizarPosicion();  // AGREGADO (Cambio 03, Caso 2)
    }

    // Cierra el dropdown al hacer clic fuera de él (pero no al hacer clic
    // en el propio botón que lo abre, ni dentro del panel).
    document.addEventListener('click', function(e) {
        var dd = document.getElementById('feClientesDropdown');
        var btn = document.getElementById('btnFeClientes');
        if (!dd || !dd.classList.contains('open')) return;
        if (dd.contains(e.target) || (btn && btn.contains(e.target))) return;
        _feClientesCerrarDropdown();
    });

    function _feClientesEmpresaActual() {
        var empresaId = _facturacionElecActiva && _facturacionElecActiva.empresaId;
        if (!empresaId) return null;
        var emp = (typeof empresas !== 'undefined') ? empresas.find(function(e) { return e.id === empresaId; }) : null;
        return { id: empresaId, nombre: emp ? (emp.nombre || emp.razonSocial || String(empresaId)) : String(empresaId) };
    }

    function _feClientesCargar() {
        var ctx = _feClientesEmpresaActual();
        if (!ctx || !window.fiscalAPI || !window.fiscalAPI.leerClientesFE) { _feClientesCache = []; _feClientesRender(); return; }
        window.fiscalAPI.leerClientesFE(ctx.id).then(function(res) {
            _feClientesCache = (res && res.ok && Array.isArray(res.clientes)) ? res.clientes : [];
            _feClientesRender();
        });
    }

    function _feClientesPersistir(callback) {
        var ctx = _feClientesEmpresaActual();
        if (!ctx || !window.fiscalAPI || !window.fiscalAPI.guardarClientesFE) return;
        window.fiscalAPI.guardarClientesFE(ctx.id, _feClientesCache).then(function() {
            if (callback) callback();
        });
    }

    function _feClientesRender(filtro) {
        var div = document.getElementById('feClientesLista');
        if (!div) return;
        filtro = (filtro || document.getElementById('feClientesBuscar').value || "").toLowerCase();
        var modoActual = _feDetectarModoPorUrlWebview();
        var vis = _feClientesCache.filter(function(c) {
            return ((c.nom || "") + (c.num || "")).toLowerCase().indexOf(filtro) !== -1;
        });
        if (!vis.length) {
            div.innerHTML = '<p style="text-align:center;color:var(--rp-text-secondary);font-size:12px;margin-top:10px;">Sin clientes' + (filtro ? ' que coincidan' : '') + '.</p>';
            return;
        }
        div.innerHTML = vis.map(function(c) {
            var idx = _feClientesCache.indexOf(c);
            var modos = _feModosDe(c);
            var badges = modos.map(function(m) {
                var tipo = FE_TIPOS_DOC[m] || { label: m || "N/D", color: "#94a3b8" };
                return '<span class="fe-cli-badge" style="background:' + tipo.color + ';" title="' + tipo.label + '">' + tipo.label + '</span>';
            }).join('');
            var puedeLlenar = !!modoActual && modos.indexOf(modoActual) !== -1;
            var tipoActual = modoActual ? (FE_TIPOS_DOC[modoActual] || { label: modoActual, color: "#22C55E" }) : null;
            var tituloDeshabilitado = !modoActual
                ? 'Abre esta acción desde una pantalla de Hacienda (Factura, CCF, FSE o Nota de Crédito)'
                : ('Este cliente no tiene habilitado ' + tipoActual.label);
            var btnFill = puedeLlenar
                ? '<button onclick="_feClientesLlenar(' + idx + ')" style="background:' + tipoActual.color + ';color:#fff;border:none;border-radius:7px;padding:6px 9px;font-weight:600;font-size:11px;cursor:pointer;">Llenar</button>'
                : '<button disabled title="' + tituloDeshabilitado + '" style="background:#cbd5e1;color:#f8fafc;border:none;border-radius:7px;padding:6px 9px;font-weight:600;font-size:11px;cursor:not-allowed;">Llenar</button>';
            return '<div class="fe-cli-item">' +
                '<div style="font-weight:700;font-size:12px;color:var(--rp-text-primary);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;" title="' + (c.nom || '') + '">' + (c.nom || '(sin nombre)') + '</div>' +
                '<div style="font-size:10px;opacity:.7;color:var(--rp-text-secondary);margin-bottom:5px;">' + (c.tDoc || '') + ': ' + (c.num || '') + '</div>' +
                '<div style="display:flex;flex-wrap:wrap;gap:3px;margin-bottom:7px;">' + badges + '</div>' +
                '<div style="display:flex;gap:6px;">' +
                    '<button onclick="_feClientesEditar(' + idx + ')" style="background:var(--rp-surface);border:1px solid var(--rp-border-strong);color:var(--rp-text-secondary);border-radius:7px;padding:6px 9px;font-weight:600;font-size:11px;cursor:pointer;">Editar</button>' +
                    '<button onclick="_feClientesBorrar(' + idx + ')" style="background:#EF4444;color:#fff;border:none;border-radius:7px;padding:6px 9px;font-weight:600;font-size:11px;cursor:pointer;">Borrar</button>' +
                    btnFill +
                '</div>' +
            '</div>';
        }).join('');
    }

    function _feClientesBorrar(idx) {
        // Corrección 02 — el confirm() nativo aquí era el causante del
        // congelamiento del teclado en toda la aplicación tras eliminar un
        // cliente (mismo problema, ya resuelto en otros lugares, que
        // motivó la creación de fsConfirm/fsAlert: un diálogo nativo del
        // sistema sobre una ventana con <webview> activo deja el teclado
        // bloqueado hasta reiniciar el programa). Se reemplaza por
        // fsConfirm, el modal propio ya usado por deleteClienteRecord.
        fsConfirm('¿Borrar este cliente?', function() {
            _feClientesCache.splice(idx, 1);
            _feClientesPersistir(function() { _feClientesRender(); });
        });
    }

    // Corrección 01 — Autocomplete de Actividad Económica: reutiliza el
    // catálogo ACTIVIDADES_ECONOMICAS (actividades.js) para mostrar una
    // lista en cascada de coincidencias mientras se escribe, igual que ya
    // funcionaba en la extensión de Chrome retirada. Se inicializa UNA
    // sola vez (el input y el dropdown son elementos fijos del DOM de la
    // app, no se recrean cada vez que se abre el formulario).
    (function _feInitActividadAutocomplete() {
        var input = document.getElementById('fecli_actividad');
        var dropdown = document.getElementById('fecli_actividad_dropdown');
        if (!input || !dropdown) return;
        var selectedIndex = -1;

        function highlight(text, query) {
            if (!query) return text;
            var escaped = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            return text.replace(new RegExp('(' + escaped + ')', 'gi'), '<mark>$1</mark>');
        }

        function renderDropdown(query) {
            if (typeof ACTIVIDADES_ECONOMICAS === 'undefined') return;
            var q = query.trim().toLowerCase();
            var resultados = q
                ? ACTIVIDADES_ECONOMICAS.filter(function(a) { return a.toLowerCase().indexOf(q) !== -1; }).slice(0, 80)
                : ACTIVIDADES_ECONOMICAS.slice(0, 80);
            if (!resultados.length) {
                dropdown.innerHTML = '<div class="fe-cli-autocomplete-item" style="color:var(--rp-text-secondary);">Sin resultados</div>';
            } else {
                dropdown.innerHTML = resultados.map(function(a, i) {
                    return '<div class="fe-cli-autocomplete-item" data-value="' + a.replace(/"/g, '&quot;') + '" data-idx="' + i + '">' + highlight(a, q) + '</div>';
                }).join('');
            }
            selectedIndex = -1;
            dropdown.classList.add('open');
            Array.prototype.slice.call(dropdown.querySelectorAll('.fe-cli-autocomplete-item')).forEach(function(item) {
                item.addEventListener('mousedown', function(e) {
                    e.preventDefault();
                    input.value = item.dataset.value;
                    dropdown.classList.remove('open');
                });
            });
        }

        input.addEventListener('input', function() { renderDropdown(input.value); });
        input.addEventListener('focus', function() { renderDropdown(input.value); });
        input.addEventListener('keydown', function(e) {
            var items = dropdown.querySelectorAll('.fe-cli-autocomplete-item');
            if (!items.length) return;
            if (e.key === 'ArrowDown') { e.preventDefault(); selectedIndex = Math.min(selectedIndex + 1, items.length - 1); }
            else if (e.key === 'ArrowUp') { e.preventDefault(); selectedIndex = Math.max(selectedIndex - 1, 0); }
            else if (e.key === 'Enter' && selectedIndex >= 0) { e.preventDefault(); input.value = items[selectedIndex].dataset.value; dropdown.classList.remove('open'); return; }
            else if (e.key === 'Escape') { dropdown.classList.remove('open'); return; }
            items.forEach(function(item, i) { item.classList.toggle('selected', i === selectedIndex); });
            if (selectedIndex >= 0) items[selectedIndex].scrollIntoView({ block: 'nearest' });
        });
        document.addEventListener('click', function(e) {
            if (!input.contains(e.target) && !dropdown.contains(e.target)) dropdown.classList.remove('open');
        });
    })();

    // AGREGADO NUEVO (Cambio 01 — Separar Registro de Clientes del Listado):
    // el panel de Clientes ahora funciona como dos vistas independientes
    // dentro del mismo módulo — 'lista' (Lista de Clientes) y 'form'
    // (Registrar/Editar Cliente) — que se muestran una a la vez en vez de
    // aparecer una debajo de la otra. Esta función centraliza ese cambio.
    function _feClientesMostrarVista(vista) {
        var listaSection = document.getElementById('feClientesListaSection');
        var formSection = document.getElementById('feClientesForm');
        var headerAcciones = document.getElementById('feClientesHeaderAcciones');
        if (!listaSection || !formSection) return;
        if (vista === 'form') {
            listaSection.classList.add('hidden');
            formSection.classList.remove('hidden');
            if (headerAcciones) headerAcciones.classList.add('hidden');
        } else {
            formSection.classList.add('hidden');
            listaSection.classList.remove('hidden');
            if (headerAcciones) headerAcciones.classList.remove('hidden');
        }
    }

    function _feClientesNuevo() {
        // AGREGADO NUEVO (Corrección 04): título del bloque/tarjeta del
        // formulario, para dejar claro que se está registrando un cliente
        // nuevo (distinto del título al editar, ver _feClientesEditar).
        var _feTituloForm = document.getElementById('fecli_form_titulo');
        if (_feTituloForm) _feTituloForm.textContent = 'Registrar Cliente';
        document.getElementById('fecli_index').value = -1;
        _feModosConfigurados = [];
        _feModoActivo = null;
        _feDatosPorModo = {};
        _feRenderChipsModo(_feModosConfigurados, _feModoActivo);
        _feCargarModoActivoEnCampos();
        _feActualizarVisibilidadCampos(_feModosConfigurados, _feModoActivo);
        _feLlenarDeptos();
        document.getElementById('fecli_nombre').value = "";
        document.getElementById('fecli_depto').value = "06";
        _feActualizarMunicipios("06");
        document.getElementById('fecli_complemento').value = "";
        document.getElementById('fecli_tel').value = "";
        document.getElementById('fecli_correo').value = "";
        // AGREGADO NUEVO — Detalle automático de factura: cliente nuevo
        // arranca siempre desactivado y con los valores por defecto.
        _feDetalleCargarEnFormulario(null);
        _feClientesMostrarVista('form');
    }

    function _feClientesEditar(idx) {
        var c = _feClientesCache[idx];
        if (!c) return;
        // AGREGADO NUEVO (Corrección 04): título del bloque/tarjeta del
        // formulario cuando se está editando un cliente existente.
        var _feTituloForm = document.getElementById('fecli_form_titulo');
        if (_feTituloForm) _feTituloForm.textContent = 'Editar Cliente';
        var modos = _feModosDe(c);

        // AJUSTADO (Corrección 02 — Orden y selección de documentos): al
        // editar, los botones de arriba deben poder mostrar/llenar los
        // datos de CUALQUIER tipo de documento que el cliente ya tenga
        // guardado en "porModo", no solo los que quedaron marcados como
        // VÁLIDOS (c.modos) la última vez que se guardó — esos dos
        // conceptos ya son independientes: "modos" define en qué
        // documentos es válido el cliente; "porModo" conserva los datos
        // digitados para cada tipo de documento que se haya llegado a
        // configurar.
        var modosConDatos = modos.slice();
        if (c.porModo) {
            Object.keys(c.porModo).forEach(function(m) {
                if (modosConDatos.indexOf(m) === -1) modosConDatos.push(m);
            });
        }
        document.getElementById('fecli_index').value = idx;

        // AGREGADO NUEVO (Corrección 01): reconstruye los datos propios de
        // cada tipo de documento habilitado para este cliente. Si ya se
        // guardó con el formato nuevo (c.porModo) se usa tal cual; si es un
        // cliente guardado ANTES de este cambio (con los campos "planos"
        // compartidos entre todos sus tipos de documento), se toma ese
        // mismo valor como punto de partida para cada tipo que tenía
        // habilitado — desde este momento cada uno queda independiente.
        _feModosConfigurados = modosConDatos.slice();
        _feDatosPorModo = {};
        modosConDatos.forEach(function(m) {
            if (c.porModo && c.porModo[m]) {
                _feDatosPorModo[m] = c.porModo[m];
            } else {
                _feDatosPorModo[m] = {
                    tDoc: c.tDoc || "",
                    num: c.num || "",
                    nitCcf: c.nitCcf || (c.tDoc === "36" ? (c.num || "") : ""),
                    nrc: c.nrc || "",
                    nomCom: c.nomCom || "",
                    act: c.act || "",
                    actFse: c.actFse || ""
                };
            }
        });
        _feModoActivo = modosConDatos.length ? modosConDatos[0] : null;

        _feRenderChipsModo(_feModosConfigurados, _feModoActivo);
        _feCargarModoActivoEnCampos();
        _feActualizarVisibilidadCampos(_feModosConfigurados, _feModoActivo);
        _feLlenarDeptos();
        document.getElementById('fecli_nombre').value = c.nom || "";
        document.getElementById('fecli_depto').value = c.dep || "06";
        _feActualizarMunicipios(c.dep || "06", c.mun, c.dis);
        document.getElementById('fecli_complemento').value = c.com || "";
        document.getElementById('fecli_tel').value = c.tel || "";
        document.getElementById('fecli_correo').value = c.cor || "";
        // AGREGADO NUEVO — Detalle automático de factura: repuebla el
        // bloque con lo que este cliente ya tenga guardado (o los valores
        // por defecto, desactivado, si todavía no lo tiene).
        _feDetalleCargarEnFormulario(c.detalle);
        _feClientesMostrarVista('form');
    }

    function _feClientesCancelarForm() {
        _feClientesMostrarVista('lista');
    }

    // AJUSTADO (Corrección 02 — Orden y selección de documentos): guardar ya
    // no persiste el cliente de una vez. Primero se valida el formulario
    // (nombre y que haya al menos un tipo de documento configurado con
    // datos) y luego se abre fecliValidezModal para preguntar en qué
    // documentos debe quedar VÁLIDO el cliente. El guardado real ocurre en
    // _feClientesGuardarFormFinal, una vez confirmada esa selección.
    function _feClientesGuardarForm() {
        // Guarda en memoria lo digitado para el tipo de documento activo
        // antes de armar el registro final del cliente.
        _feGuardarModoActivoEnMemoria();
        var modos = _feModosConfigurados.slice();
        var nombre = document.getElementById('fecli_nombre').value.trim();
        // Corrección 02 — alert() nativo reemplazado por fsAlert (mismo
        // motivo que en _feClientesBorrar: evita el bloqueo de teclado).
        if (!nombre) { fsAlert('El nombre es obligatorio.'); return; }
        if (!modos.length) { fsAlert('Selecciona al menos un tipo de documento aplicable.'); return; }
        _feAbrirModalValidez();
    }

    // AJUSTADO (Corrección 02): arma y persiste el registro del cliente,
    // usando "modosValidos" (confirmado en fecliValidezModal) para definir
    // en qué documentos queda VÁLIDO/habilitado. Los datos propios de cada
    // tipo de documento ("porModo") se siguen guardando para TODOS los
    // tipos configurados en el formulario (_feModosConfigurados), se hayan
    // marcado o no como válidos — así no se pierde nada de lo ya llenado
    // si luego se vuelve a habilitar ese documento.
    // AGREGADO NUEVO (Cambio 01 — Actualizar clientes importados): se
    // extrae de _feClientesGuardarFormFinal la construcción del objeto
    // "cliente" final a partir de lo que esté AHORA MISMO cargado en el
    // formulario (_feModosConfigurados / _feDatosPorModo y los campos
    // comunes del DOM), sin tocar _feClientesCache ni persistir nada. Así,
    // tanto el Guardar manual (un cliente a la vez) como el botón
    // "Actualizar clientes importados" (todos, uno por uno, ver
    // _feClientesActualizarTodos) ejecutan EXACTAMENTE el mismo cálculo,
    // sin duplicar la lógica.
    function _feConstruirClienteDesdeFormulario(modosValidos) {
        var nombre = document.getElementById('fecli_nombre').value.trim();

        // AGREGADO NUEVO (Corrección 01): cada tipo de documento guarda sus
        // propios datos (Tipo Doc/Número, NIT CCF, NRC, Nombre comercial,
        // Actividad económica) de forma independiente en "porModo", sin
        // mezclarse con los de los demás tipos de documento del mismo
        // cliente.
        var porModo = {};
        _feModosConfigurados.forEach(function(m) {
            var d = _feDatosPorModo[m] || {};
            porModo[m] = {
                tDoc: d.tDoc || "",
                num: d.num || "",
                nitCcf: d.nitCcf || "",
                nrc: d.nrc || "",
                nomCom: d.nomCom || "",
                act: d.act || "",
                actFse: d.actFse || ""
            };
        });
        // Tipo de documento "principal" — sus datos se replican también en
        // los campos "planos" de nivel superior (tDoc/num/nitCcf/nrc/
        // nomCom/act/actFse) para no romper la exportación/importación CSV
        // existente, que no conoce la nueva estructura "porModo". El
        // detalle real e independiente de cada tipo de documento vive
        // únicamente en "porModo".
        //
        // Corrección 05 — Crédito Fiscal (CCF) se identifica solo con el
        // NIT del campo "NIT (para Crédito Fiscal)"; NUNCA usa Tipo
        // Doc/Número. Antes, cuando había selección múltiple de tipos de
        // documento y CCF estaba entre los válidos, SIEMPRE se elegía como
        // "modoPrincipal" — y como CCF no tiene Tipo Doc/Número, esos
        // campos quedaban vacíos ("") a nivel superior, sobrescribiendo/
        // perdiendo los que sí aplicaban y estaban llenos para los demás
        // tipos configurados (p. ej. Consumidor Final). Ahora se prioriza
        // como principal el primer tipo VÁLIDO que sí use Tipo Doc/Número;
        // CCF solo se usa como principal cuando es el ÚNICO tipo válido del
        // cliente, y en ese caso sigue sin exigir ni mostrar esos campos
        // (ver necesitaTipoNum en _feActualizarVisibilidadCampos).
        var modoPrincipal = modosValidos[0];
        for (var mvi = 0; mvi < modosValidos.length; mvi++) {
            if (modosValidos[mvi] !== "CCF") { modoPrincipal = modosValidos[mvi]; break; }
        }
        var dPrincipal = porModo[modoPrincipal] || {};
        // El NIT de Crédito Fiscal se toma siempre de los propios datos de
        // CCF (si el cliente lo tiene configurado, esté o no marcado como
        // "modoPrincipal"), en vez de depender de cuál tipo haya quedado
        // como principal arriba — así queda disponible igual sin afectar
        // ni ser afectado por el Tipo Doc/Número de los demás tipos.
        var nitCcfPrincipal = (porModo.CCF && porModo.CCF.nitCcf) || dPrincipal.nitCcf || "";
        return {
            modos: modosValidos,
            nom: nombre,
            tDoc: dPrincipal.tDoc,
            num: dPrincipal.num,
            nitCcf: nitCcfPrincipal,
            nrc: dPrincipal.nrc,
            nomCom: dPrincipal.nomCom,
            act: dPrincipal.act,
            actFse: dPrincipal.actFse,
            porModo: porModo,
            dep: document.getElementById('fecli_depto').value,
            mun: document.getElementById('fecli_municipio').value,
            dis: document.getElementById('fecli_distrito').value,
            com: document.getElementById('fecli_complemento').value.trim(),
            tel: document.getElementById('fecli_tel').value.trim(),
            cor: document.getElementById('fecli_correo').value.trim(),
            // AGREGADO NUEVO — Detalle automático de factura, INDEPENDIENTE
            // por cliente y de la Configuración general de Facturación
            // Electrónica (FEConfig.js — no se toca). No depende del tipo de
            // documento (modo): a diferencia de "porModo", este detalle es
            // el mismo sin importar si se factura como CF, CCF, FSE o NC
            // (ver _feDetalleAutoAgregar / _feClientesLlenar).
            detalle: _feDetalleLeerDesdeFormulario()
        };
    }

    // AGREGADO NUEVO — Lee del formulario los 5 datos del detalle automático
    // de factura de este cliente, más el estado del toggle de activación
    // (#fecli_detalle_toggle, ver _feDetalleSetToggleUI). El precio se
    // guarda como número plano (sin separador de miles), mismo criterio que
    // usa _feConfigLimpiarPrecio/_feConfigFormatearPrecio en FEConfig.js
    // para el campo "Precio" de la Configuración general — se reutilizan
    // esas mismas funciones en vez de duplicar el formateo.
    function _feDetalleLeerDesdeFormulario() {
        var elActivo = document.getElementById('fecli_detalle_activo');
        var elPrecio = document.getElementById('fecli_detalle_precio');
        return {
            activo: !!(elActivo && elActivo.value === '1'),
            tipo: (document.getElementById('fecli_detalle_tipo') || {}).value || '',
            cantidad: (document.getElementById('fecli_detalle_cantidad') || {}).value.trim() || '',
            producto: (document.getElementById('fecli_detalle_producto') || {}).value.trim() || '',
            tipoVenta: (document.getElementById('fecli_detalle_tipoVenta') || {}).value || '',
            precio: elPrecio ? _feConfigLimpiarPrecio(elPrecio.value) : ''
        };
    }

    // Valores por defecto del bloque "detalle" — mismo patrón que
    // _feConfigDefaults() en FEConfig.js, pero este bloque vive DENTRO de
    // cada cliente (no en fsStore aparte), porque es exclusivo de ese
    // cliente y debe viajar con él en Backup/Restore, Importar/Exportar,
    // etc. igual que el resto de sus datos.
    function _feDetalleDefaults() {
        return { activo: false, tipo: '2', cantidad: '', producto: '', tipoVenta: 'G', precio: '' };
    }

    // AGREGADO NUEVO — Pinta el slide-toggle (#fecli_detalle_toggle) según
    // esté activo o no, y muestra/oculta los 5 campos del detalle
    // (#fecli_detalle_campos). Mismo criterio visual que ya usa
    // _feConfigSetToggleUI en FEConfig.js para el panel de Configuración
    // (fondo + posición del "thumb" via estilo inline), aplicado aquí a su
    // propio toggle (#fecli_detalle_toggle / .fe-detalle-thumb) para no
    // tocar ni depender de ese otro panel.
    function _feDetalleSetToggleUI(on) {
        var tog = document.getElementById('fecli_detalle_toggle');
        var cont = document.getElementById('fecli_detalle_campos');
        if (tog) {
            var thumb = tog.querySelector('.fe-detalle-thumb');
            if (on) {
                tog.style.background = '#4f46e5';
                if (thumb) { thumb.style.left = '18px'; thumb.style.background = '#fff'; }
            } else {
                tog.style.background = 'var(--rp-border-strong)';
                if (thumb) { thumb.style.left = '2px'; thumb.style.background = 'var(--rp-text-secondary)'; }
            }
        }
        if (cont) cont.classList.toggle('hidden', !on);
    }

    // Alterna el estado del toggle (guardado en el input oculto
    // #fecli_detalle_activo, valor "0"/"1") y repinta su UI. Se llama al
    // hacer clic sobre el slide (ver onclick en index.html).
    function _feDetalleToggleActivo() {
        var hidden = document.getElementById('fecli_detalle_activo');
        if (!hidden) return;
        var nuevoActivo = hidden.value !== '1';
        hidden.value = nuevoActivo ? '1' : '0';
        _feDetalleSetToggleUI(nuevoActivo);
    }

    // Carga en el formulario los datos guardados de "detalle" de un
    // cliente (o los valores por defecto si el cliente todavía no tiene
    // este bloque, p. ej. clientes guardados antes de este agregado).
    function _feDetalleCargarEnFormulario(detalle) {
        var d = detalle || _feDetalleDefaults();
        var defaults = _feDetalleDefaults();
        var hidden = document.getElementById('fecli_detalle_activo');
        if (hidden) hidden.value = d.activo ? '1' : '0';
        document.getElementById('fecli_detalle_tipo').value = d.tipo || defaults.tipo;
        document.getElementById('fecli_detalle_cantidad').value = d.cantidad || '';
        document.getElementById('fecli_detalle_producto').value = d.producto || '';
        document.getElementById('fecli_detalle_tipoVenta').value = d.tipoVenta || defaults.tipoVenta;
        document.getElementById('fecli_detalle_precio').value = _feConfigFormatearPrecio(d.precio || '');
        _feDetalleSetToggleUI(!!d.activo);
    }

    function _feClientesGuardarFormFinal(modosValidos) {
        var idx = parseInt(document.getElementById('fecli_index').value, 10);
        var cliente = _feConstruirClienteDesdeFormulario(modosValidos);
        if (idx >= 0) { _feClientesCache[idx] = cliente; } else { _feClientesCache.push(cliente); }
        _feClientesPersistir(function() {
            _feClientesMostrarVista('lista');
            _feClientesRender();
        });
    }

    // ════════════════════════════════════════════════════════════════════
    // Cambio 01 — Actualizar clientes importados
    // ────────────────────────────────────────────────────────────────────
    // Recorre TODOS los clientes ya registrados y le aplica a cada uno,
    // automáticamente y en segundo plano, el MISMO proceso que ocurre al
    // entrar a ese cliente, presionar "Editar" y luego "Guardar cambios":
    // reutiliza _feClientesEditar (repuebla el formulario con los datos de
    // ese cliente, igual que "Editar") y _feConstruirClienteDesdeFormulario
    // (recalcula el registro final con esos mismos datos ya cargados,
    // igual que "Guardar cambios"), cliente por cliente, sin abrir el
    // formulario visualmente para el usuario ni pedir confirmación por
    // cada uno. No cambia qué documentos quedan válidos ni ningún dato que
    // el propio Editar → Guardar no cambiaría por sí mismo — solo vuelve a
    // calcular/normalizar cada registro con la lógica ACTUAL del programa
    // (por ejemplo, ya no arrastra el Tipo Doc/Número vacío de Crédito
    // Fiscal sobre los demás tipos de documento, ver Corrección 05), lo
    // cual es especialmente útil justo después de importar un catálogo de
    // clientes desde CSV.
    // ════════════════════════════════════════════════════════════════════
    function _feClientesActualizarTodos() {
        var ctx = _feClientesEmpresaActual();
        if (!ctx) return;
        var total = _feClientesCache.length;
        if (!total) { fsAlert('No hay clientes registrados para actualizar.'); return; }

        // Se recuerda en qué vista estaba el panel (Lista o
        // Registrar/Editar Cliente) antes de iniciar, para dejarlo igual
        // al terminar — el proceso repuebla el formulario internamente
        // para cada cliente, pero eso no debe notarse como un cambio de
        // pantalla para quien presionó el botón.
        var formSection = document.getElementById('feClientesForm');
        var vistaOriginal = (formSection && !formSection.classList.contains('hidden')) ? 'form' : 'lista';

        for (var i = 0; i < total; i++) {
            // "modos" (los tipos de documento en los que el cliente ya
            // está marcado como VÁLIDO) no lo decide este proceso — se
            // conserva tal cual estaba, exactamente igual que si el
            // usuario editara y guardara sin tocar el toggle de "Tipo(s)
            // de Documento que aplican a este cliente".
            var modosValidos = _feModosDe(_feClientesCache[i]).slice();
            _feClientesEditar(i);
            if (!modosValidos.length) modosValidos = _feModosConfigurados.slice();
            _feClientesCache[i] = _feConstruirClienteDesdeFormulario(modosValidos);
        }

        _feClientesMostrarVista(vistaOriginal);
        _feClientesPersistir(function() {
            _feClientesRender();
            if (typeof showToast === 'function') {
                showToast('Clientes actualizados: ' + total, 'success');
            }
        });
    }

    // ── Importar / Exportar CSV (diálogos nativos de Electron) ──────────
    function _feClientesImportar() {
        var ctx = _feClientesEmpresaActual();
        if (!ctx || !window.fiscalAPI || !window.fiscalAPI.importarClientesFE) return;
        window.fiscalAPI.importarClientesFE(ctx.id).then(function(res) {
            if (res && res.canceled) return;
            // CORRECCIÓN 01: idem — mismo alert() nativo reemplazado por
            // fsAlert() para no bloquear el teclado en el caso de error.
            if (res && res.error) { fsAlert(res.error); return; }
            if (res && res.ok) {
                _feClientesCache = res.clientes || [];
                _feClientesRender();
                var resumen = 'Importación completada\n\n' +
                    'Clientes procesados: ' + (res.procesados || 0) + '\n' +
                    'Clientes nuevos: ' + (res.nuevos || 0) + '\n' +
                    'Clientes actualizados: ' + (res.actualizados || 0) + '\n' +
                    'Errores: ' + (res.errores || 0);
                if (res.errores && res.detalleErrores && res.detalleErrores.length) {
                    resumen += '\n\nFilas con problemas:\n' + res.detalleErrores.map(function(e) {
                        return '  Fila ' + e.fila + ': ' + e.motivo;
                    }).join('\n');
                }
                // CORRECCIÓN 01: se reemplaza el alert() nativo por un modal
                // propio (fsAlert) porque, tras el diálogo nativo de
                // selección de archivo (dialog.showOpenDialog en main.js),
                // un alert() nativo dejaba el teclado bloqueado en toda la
                // aplicación hasta reiniciarla.
                fsAlert(resumen);
            }
        });
    }

    function _feClientesExportar() {
        var ctx = _feClientesEmpresaActual();
        if (!ctx || !window.fiscalAPI || !window.fiscalAPI.exportarClientesFE) return;
        window.fiscalAPI.exportarClientesFE(ctx.id, ctx.nombre).then(function(res) {
            if (res && res.canceled) return;
            // Corrección 02 — alert() nativo reemplazado por fsAlert.
            if (res && res.error) { fsAlert(res.error); return; }
            if (res && res.ok) showToast && showToast('Clientes exportados: ' + res.path, 'success');
        });
    }

    // ── Llenado en Hacienda vía webview.executeJavaScript ───────────────
    // IMPORTANTE: esto NO usa un preload dentro del <webview> — main.js
    // fuerza `webPreferences.preload = undefined` en 'will-attach-webview'
    // como candado de seguridad (el webview carga el portal real de
    // Hacienda con la sesión del usuario) y ese candado no se toca. En su
    // lugar se ejecuta el script DESDE AFUERA con el método nativo
    // `<webview>.executeJavaScript()`, exactamente el mismo mecanismo que
    // main.js ya usa (allá vía win.webContents.executeJavaScript) para
    // otras automatizaciones sobre admin.factura.gob.sv.
    function _feClientesLlenar(idx) {
        var c = _feClientesCache[idx];
        var wv = _facturacionElecActiva.webview;
        if (!c || !wv || !wv.executeJavaScript) return;
        var modo = _feDetectarModoPorUrlWebview();
        if (!modo) return;

        // AGREGADO NUEVO (Corrección 01): se llenan solo los datos propios
        // del tipo de documento que está abierto ahora mismo en Hacienda
        // (c.porModo[modo]), no una mezcla de los distintos tipos de
        // documento que tenga configurados el cliente. Si el cliente se
        // guardó ANTES de este cambio (sin c.porModo), se usa el propio
        // cliente `c` como estaban antes (sus campos planos), igual que
        // funcionaba previamente.
        var datosModo = (c.porModo && c.porModo[modo]) ? c.porModo[modo] : c;
        var cParaLlenar = {
            nom: c.nom, cor: c.cor, tel: c.tel, dep: c.dep, mun: c.mun, dis: c.dis, com: c.com,
            tDoc: datosModo.tDoc || "",
            num: datosModo.num || "",
            nitCcf: datosModo.nitCcf || (datosModo.tDoc === "36" ? (datosModo.num || "") : ""),
            nrc: datosModo.nrc || "",
            nomCom: datosModo.nomCom || "",
            act: datosModo.act || "",
            actFse: datosModo.actFse || ""
        };

        var datosJson = JSON.stringify({ c: cParaLlenar, modo: modo });

        var fillScript = '(function(){' +
            'var datos = ' + datosJson + ';' +
            'var c = datos.c; var modo = datos.modo;' +
            'var actividadParaLlenar = modo === "FSE" ? (c.actFse || c.act) : c.act;' +
            // Corrección 04 — CAUSA RAÍZ del campo "Distrito" vacío de forma
            // intermitente, específicamente en Consumidor Final: find()
            // solo excluía los campos del EMISOR en el último recurso (el
            // fallback por [formcontrolname]), pero el primer intento —
            // document.getElementById(selector) || document.querySelector
            // ('[id*="' + selector + '"]') — no aplicaba ese mismo filtro.
            // El formulario de Consumidor Final en el portal de Hacienda
            // incluye, además del campo de distrito del receptor, uno del
            // EMISOR cuyo id también contiene "distrito" (de solo lectura,
            // precargado desde el certificado); ese era el que a veces
            // encontraba primero — el orden en que el navegador devuelve
            // los nodos del DOM no es determinístico frente a cargas
            // asíncronas del portal, de ahí la intermitencia — y al
            // intentar asignarle el valor, el campo real del receptor
            // quedaba sin llenar. Ahora se descarta cualquier candidato del
            // emisor en TODAS las rutas de búsqueda por igual, no solo en
            // la última.
            'function find(selector) {' +
                'function esEmisor(el) {' +
                    'var idFc = ((el.id || "") + " " + (el.getAttribute("formcontrolname") || "")).toLowerCase();' +
                    'return idFc.indexOf("emisor") !== -1;' +
                '}' +
                'var exacto = document.getElementById(selector);' +
                'if (exacto && !esEmisor(exacto)) return exacto;' +
                'var porId = document.querySelectorAll("[id*=\\"" + selector + "\\"]");' +
                'for (var i = 0; i < porId.length; i++) {' +
                    'if (!esEmisor(porId[i])) return porId[i];' +
                '}' +
                'var byControl = document.querySelectorAll("[formcontrolname=\\"" + selector + "\\"]");' +
                'for (var j = 0; j < byControl.length; j++) {' +
                    'if (!esEmisor(byControl[j])) return byControl[j];' +
                '}' +
                // Último recurso: si el único candidato encontrado
                // pertenece al emisor (formulario sin un campo de receptor
                // separado para este selector), se devuelve igual — para
                // no romper ningún caso en el que este filtro resulte
                // demasiado estricto.
                'return exacto || porId[0] || byControl[0] || null;' +
            '}' +
            'function set(el, val) {' +
                'if (!el || val === undefined || val === null) return;' +
                'var proto = Object.getPrototypeOf(el);' +
                'var d = Object.getOwnPropertyDescriptor(proto, "value");' +
                'var setter = d && d.set;' +
                'if (setter) setter.call(el, val); else el.value = val;' +
                '["input","change","blur"].forEach(function(ev){ el.dispatchEvent(new Event(ev, { bubbles: true })); });' +
            '}' +
            'function wait(sel) {' +
                'return new Promise(function(r) {' +
                    'var el = find(sel); if (el) return r(el);' +
                    'var counter = 0;' +
                    'var interval = setInterval(function() {' +
                        'var target = find(sel); counter++;' +
                        'if (target || counter > 15) { clearInterval(interval); r(target); }' +
                    '}, 200);' +
                '});' +
            '}' +
            // Corrección 01 — CAUSA RAÍZ del campo "Distrito" vacío de forma
            // intermitente: el <select> de municipio/distrito ya existe en
            // el DOM desde el inicio (por eso wait() lo encontraba de
            // inmediato), pero sus <option> las llena el portal de Hacienda
            // de forma asíncrona (vía su propia llamada al backend) recién
            // DESPUÉS de disparar el evento "change" del campo anterior
            // (departamento → municipio → distrito). set() asignaba el
            // valor con un setTimeout de 400ms fijo que no tiene relación
            // con cuánto tarde esa carga real: a veces alcanzaba, a veces
            // no, y si no alcanzaba, el valor no coincidía con ninguna
            // <option> todavía cargada y el campo quedaba vacío. Se
            // reemplaza por una espera real de las opciones del propio
            // <select> antes de asignar su valor.
            'function waitForOption(sel, val) {' +
                'return new Promise(function(r) {' +
                    'function tieneOpcion() {' +
                        'if (!sel || !val) return true;' +
                        'for (var i = 0; i < sel.options.length; i++) {' +
                            'if (sel.options[i].value === val) return true;' +
                        '}' +
                        'return false;' +
                    '}' +
                    'if (tieneOpcion()) return r(true);' +
                    'var counter = 0;' +
                    'var interval = setInterval(function() {' +
                        'counter++;' +
                        'if (tieneOpcion() || counter > 20) { clearInterval(interval); r(tieneOpcion()); }' +
                    '}, 150);' +
                '});' +
            '}' +
            // AGREGADO NUEVO — se captura la promesa de flow() (antes se
            // invocaba sin guardarla y la función exterior devolvía "true"
            // de inmediato, sin esperar a que terminara). Ahora la función
            // exterior devuelve esa misma promesa, así
            // wv.executeJavaScript(fillScript, true) — más abajo, en
            // _feClientesLlenar — recién se resuelve cuando el llenado del
            // cliente TERMINÓ de verdad. Esto es lo que permite encadenar
            // con precisión el detalle automático (_feDetalleAutoAgregar)
            // en vez de adivinar con un tiempo de espera fijo. No cambia
            // ningún dato que se llena ni el orden en que se llena — solo
            // cuándo se avisa que ya terminó.
            'var __flowPromise = (async function flow(){' +
                'if (modo === "CCF") {' +
                    'var nitParaCcf = c.nitCcf || (c.tDoc === "36" ? c.num : "");' +
                    'var tDoc = await wait("tipoDocumento"); if (tDoc) set(tDoc, "36");' +
                    'var elNit = await wait("nit");' +
                    'if (elNit && nitParaCcf) set(elNit, nitParaCcf);' +
                '} else {' +
                    'var tDoc2 = await wait("tipoDocumento"); if (tDoc2) set(tDoc2, c.tDoc);' +
                    'var docField = c.tDoc === "13" ? "dui" : "nit";' +
                    'var elDoc = await wait(docField); if (elDoc) set(elDoc, c.num);' +
                '}' +
                'var elNomByPlaceholder = ' +
                    'document.querySelector(\'input[placeholder="Nombre completo del receptor"]\') || ' +
                    'document.querySelector(\'input[placeholder="Nombre del receptor"]\') || ' +
                    'document.querySelector(\'input[placeholder*="receptor" i][placeholder*="nombre" i]\') || ' +
                    'document.querySelector(\'input[placeholder="Nombre completo del cliente"]\') || ' +
                    'document.querySelector(\'input[placeholder*="cliente" i][placeholder*="nombre" i]\');' +
                'var elNom = elNomByPlaceholder || await wait("nombre") || await wait("razonSocial");' +
                'if (elNom) set(elNom, c.nom);' +
                'var elCor = document.getElementById("CorreoReceptor") || find("correoReceptor") || find("correo");' +
                'if (elCor) set(elCor, c.cor);' +
                'var elTel = document.getElementById("TelefonoReceptor") || find("telefonoReceptor") || find("telefono");' +
                'if (elTel) set(elTel, c.tel);' +
                'if (c.nrc && (modo === "CCF" || modo === "NC" || modo === "FCF")) {' +
                    'var elNrc = document.querySelector(\'[formcontrolname="nrc"]\');' +
                    'if (elNrc) set(elNrc, c.nrc);' +
                '}' +
                'if (modo === "CCF" || modo === "NC") { set(find("nombreComercial"), c.nomCom); }' +
                'if (actividadParaLlenar) {' +
                    'if (modo === "FSE") {' +
                        'var candidatos = ["descActividad","actividadEconomica","actividad_economica","descripcionActividad","actividadDescripcion","giro","actividadFse"];' +
                        'var elDescAct = null;' +
                        'for (var i = 0; i < candidatos.length; i++) {' +
                            'elDescAct = document.getElementById(candidatos[i]) || find(candidatos[i]);' +
                            'if (elDescAct) break;' +
                        '}' +
                        'if (!elDescAct) {' +
                            'elDescAct = document.querySelector(' +
                                '\'textarea[formcontrolname*="ctividad" i]:not([id*="emisor" i]), \' + ' +
                                '\'input[formcontrolname*="ctividad" i]:not([id*="emisor" i]), \' + ' +
                                '\'textarea[placeholder*="actividad" i], input[placeholder*="actividad" i]\'' +
                            ');' +
                        '}' +
                        'if (elDescAct) set(elDescAct, actividadParaLlenar);' +
                    '} else {' +
                        // CORRECCIÓN NUEVA — CAUSA RAÍZ de que "Agregar
                        // Detalle" no reaccionara al primer clic: esta
                        // simulación de tipeo (necesaria para que el
                        // autocompletado de Actividad Económica despliegue
                        // sus opciones) se disparaba con una cadena de
                        // setTimeout SUELTA, sin ningún await ni Promise
                        // que la conectara con __flowPromise. Por eso
                        // __flowPromise (y con él _fillPromise, en
                        // _feClientesLlenar) se resolvía de inmediato,
                        // ANTES de que el combobox terminara de escribir y
                        // de cerrar su lista desplegable (.ng-option /
                        // [role="option"]). Cuando el detalle automático
                        // arrancaba 300ms después, ese overlay de Angular
                        // todavía podía estar abierto — y el primer clic
                        // sintético (el de "Agregar Detalle") lo absorbía
                        // el propio listener de "clic afuera" que usa el
                        // overlay para cerrarse, en vez de llegar al botón.
                        // Ahora todo el proceso se envuelve en una Promise
                        // real y se espera con "await", así __flowPromise
                        // no se resuelve hasta que el overlay esté
                        // genuinamente cerrado.
                        'await new Promise(function(resolverActividad) {' +
                            'var combo = document.querySelector(\'input[role="combobox"]\');' +
                            'if (!combo) return resolverActividad();' +
                            'combo.focus();' +
                            'var proto = Object.getPrototypeOf(combo);' +
                            'var d = Object.getOwnPropertyDescriptor(proto, "value");' +
                            'var setter = d && d.set;' +
                            'var texto = actividadParaLlenar; var i = 0;' +
                            'var typeChar = function() {' +
                                'if (i <= texto.length) {' +
                                    'var partial = texto.slice(0, i);' +
                                    'if (setter) setter.call(combo, partial); else combo.value = partial;' +
                                    'combo.dispatchEvent(new Event("input", { bubbles: true }));' +
                                    'combo.dispatchEvent(new KeyboardEvent("keyup", { bubbles: true }));' +
                                    'i++;' +
                                    'if (i <= texto.length) { setTimeout(typeChar, 30); }' +
                                    'else {' +
                                        'setTimeout(function() {' +
                                            'var opt = document.querySelector(".ng-option, mat-option, [role=\\"option\\"]");' +
                                            'if (opt) opt.click();' +
                                            // Margen extra tras el clic en la
                                            // opción para dejar que el overlay
                                            // efectivamente se cierre antes de
                                            // avisar que ya terminó.
                                            'setTimeout(resolverActividad, 250);' +
                                        '}, 700);' +
                                    '}' +
                                '}' +
                            '};' +
                            'setTimeout(typeChar, 200);' +
                        '});' +
                    '}' +
                '}' +
                'var dep = await wait("departamento");' +
                'if (dep) {' +
                    'set(dep, c.dep);' +
                    'var mun = await wait("municipio");' +
                    'if (mun) {' +
                        'await waitForOption(mun, c.mun);' +
                        'set(mun, c.mun);' +
                        'var dis = await wait("distrito");' +
                        'if (dis) {' +
                            'await waitForOption(dis, c.dis);' +
                            'set(dis, c.dis);' +
                        '}' +
                    '}' +
                    'var com = await wait("complemento") || await wait("direccion"); if (com) set(com, c.com);' +
                '}' +
            '})();' +
            'return __flowPromise;' +
        '})();';

        // AGREGADO NUEVO — antes este resultado no se guardaba en ninguna
        // variable (solo se le encadenaba un .catch para loguear errores),
        // así que no había forma de saber, desde afuera, cuándo el llenado
        // del cliente había terminado de verdad. Ahora sí: gracias a que
        // fillScript devuelve __flowPromise (ver arriba), esta promesa se
        // resuelve recién cuando el llenado terminó, y es lo que se usa
        // abajo para encadenar con precisión el detalle automático — en
        // vez de adivinar con un setTimeout fijo.
        var _fillPromise = wv.executeJavaScript(fillScript, true).catch(function(e) {
            console.warn('[Facturación Electrónica][Clientes] Error al llenar el formulario:', e);
            return null;
        });
        _feClientesCerrarDropdown();

        // ════════════════════════════════════════════════════════════════
        // AGREGADO NUEVO — Detalle automático de factura por cliente.
        // Regla principal de activación: SOLO se dispara si el cliente
        // tiene detalle.activo=true Y los 5 datos completos; si falta
        // cualquiera de los dos, no se hace nada más y el comportamiento
        // sigue siendo exactamente el actual (detalle manual). NO consulta
        // ni depende de "Facturación Electrónica → Configuración"
        // (FEConfig.js / _feConfigLeer) — esa configuración general sigue
        // funcionando igual para los clientes que no tengan esta capa.
        //
        // Se dispara DESPUÉS de que _fillPromise se resuelva (llenado del
        // cliente terminado de verdad), no con una espera fija a ciegas.
        // ════════════════════════════════════════════════════════════════
        if (_feDetalleEstaCompleto(c.detalle)) {
            console.log('[FiscalSync][Detalle automático] Cliente con configuración propia detectada — se ejecutará al terminar el llenado del receptor.');
            _fillPromise.then(function() {
                _feDetalleAutoAgregar(wv, c.detalle, modo);
            });
        } else if (c.detalle && c.detalle.activo) {
            // AGREGADO NUEVO — aviso solo por consola (no interrumpe al
            // usuario) para poder diagnosticar por qué no se disparó: el
            // cliente tiene el detalle ACTIVADO pero le falta algún dato.
            console.log('[FiscalSync][Detalle automático] El cliente tiene el detalle activado pero le falta completar algún campo — no se ejecuta la automatización.', c.detalle);
        }
    }

    // Un cliente "tiene configuración propia" para esta automatización
    // solo cuando está activada Y los 5 datos están presentes. Cantidad y
    // precio se validan como no-vacíos (no como > 0) a propósito: la
    // decisión de qué es un valor válido para Hacienda ya la resuelve el
    // propio formulario de Hacienda, igual que con la Configuración
    // general (_instalarAutoConfigFE no valida rangos tampoco).
    function _feDetalleEstaCompleto(detalle) {
        if (!detalle || !detalle.activo) return false;
        return !!(detalle.tipo && detalle.cantidad && detalle.producto && detalle.tipoVenta && detalle.precio);
    }

    // Sustituye el marcador {MES} (si está presente) por el nombre del mes
    // actualmente activo en Facturación Electrónica — reutiliza el mismo
    // mes que ya maneja este módulo (_feMesIndex, sincronizado con
    // Gestión vía _sincronizarMesFEconGestion) y el mismo arreglo
    // MONTH_NAMES de core/estado.js, sin crear una lista de meses nueva.
    // Si la plantilla no incluye {MES}, se devuelve tal cual (no fuerza
    // el cambio mensual en descripciones que no lo necesitan).
    function _feDetalleResolverProducto(plantilla) {
        if (!plantilla) return '';
        if (plantilla.indexOf('{MES}') === -1) return plantilla;
        var mes = MONTH_NAMES[_feMesIndex] || MONTH_NAMES[new Date().getMonth()];
        return plantilla.split('{MES}').join(mes);
    }

    // ════════════════════════════════════════════════════════════════════
    // AGREGADO NUEVO — Automatización de "Agregar Detalle" por cliente.
    // ────────────────────────────────────────────────────────────────────
    // Mismo mecanismo que el resto del módulo (webview.executeJavaScript
    // desde afuera, sin preload dentro del <webview> — ver el comentario
    // grande al inicio de _feClientesLlenar): NO se agrega ninguna función
    // nueva en preload.js/main.js.
    //
    // Se invoca DESPUÉS de que el llenado del cliente ya terminó de verdad
    // (ver _fillPromise en _feClientesLlenar) — ya no depende de un
    // setTimeout fijo adivinado.
    //
    // Secuencia real confirmada con el HTML de Hacienda:
    //   1. "Agregar Detalle" es un botón-dropdown (Bootstrap) —
    //      <button id="btnGroupDrop2" class="btn btn-primary
    //      dropdown-toggle">Agregar Detalle</button>. Al hacer clic,
    //      despliega un menú.
    //   2. Del menú desplegado hay que elegir
    //      <a class="dropdown-item">Producto o Servicio</a>, que es la
    //      que efectivamente abre el formulario del ítem (tipo, cantidad,
    //      producto, tipoVenta, precio).
    //   3. Recién ahí aplican los mismos selectores que ya usa
    //      _instalarAutoConfigFE (FacturacionElectronica.js) para esos 5
    //      campos — se reutilizan tal cual.
    //   4. "Agregar ítem" y "Regresar al documento" quedan igual que antes.
    //
    // El id "btnGroupDrop2" podría no ser estable entre distintos tipos de
    // documento; se intenta primero por ese id exacto, y si no aparece (o
    // está deshabilitado) se cae a buscarlo por texto entre los
    // .dropdown-toggle, igual que "Agregar ítem"/"Regresar al documento".
    //
    // Cada paso descarta elementos deshabilitados (disabled / aria-disabled
    // / clase "disabled") además de invisibles — un botón presente en el
    // DOM pero deshabilitado (p. ej. mientras el formulario del receptor
    // todavía no termina de validarse) no dispara clic real.
    // ════════════════════════════════════════════════════════════════════
    function _feDetalleAutoAgregar(wv, detalle, modo) {
        if (!wv || !wv.executeJavaScript) return;

        var producto = _feDetalleResolverProducto(detalle.producto);
        var datos = {
            tipo: detalle.tipo,
            cantidad: detalle.cantidad,
            producto: producto,
            tipoVenta: detalle.tipoVenta,
            precio: detalle.precio
        };

        var script = '(function(){\n' +
            'var D = ' + JSON.stringify(datos) + ';\n' +
            'var MODO = ' + JSON.stringify(modo || '') + ';\n' +
            'var LOG = "[FiscalSync][Detalle automático] ";\n' +
            // AGREGADO NUEVO — Configuración especial por cada tipo de
            // documento electrónico. Cada uno abre el formulario del ítem
            // de forma distinta en el portal de Hacienda:
            //   - FCF (Factura): botón-dropdown <button id="btnGroupDrop2"
            //     class="dropdown-toggle">Agregar Detalle</button>; hay
            //     que elegir "Producto o Servicio" del menú para que abra
            //     el formulario del ítem.
            //   - CCF (Crédito Fiscal) / NC (Nota de Crédito): mismo
            //     mecanismo de dropdown, pero el botón que lo abre dice
            //     "Agregar Ítem" en vez de "Agregar Detalle".
            //   - FSE (Sujetos Excluidos): NO es un dropdown, es un
            //     <input type="button" value="Agregar ítem">; al hacer
            //     clic abre el formulario del ítem directo, sin pasar por
            //     "Producto o Servicio".
            // "Agregar ítem" (guardar) y "Regresar al documento" son
            // iguales para los 4 tipos de documento.
            'var CONFIG_POR_MODO = {\n' +
            '  FCF: { textoAbrir: "Agregar Detalle", requiereProductoServicio: true },\n' +
            '  CCF: { textoAbrir: "Agregar Ítem", requiereProductoServicio: true },\n' +
            '  NC:  { textoAbrir: "Agregar Ítem", requiereProductoServicio: true },\n' +
            '  FSE: { textoAbrir: "Agregar ítem", requiereProductoServicio: false }\n' +
            '};\n' +
            'var CFG = CONFIG_POR_MODO[MODO] || CONFIG_POR_MODO.CCF;\n' +
            'var TEXTOS = { detalle: CFG.textoAbrir, productoServicio: "Producto o Servicio", item: "Agregar ítem", regresar: "Regresar al documento" };\n' +
            'function normalizar(t) {\n' +
            '  return (t || "").replace(/\\s+/g, " ").trim().toLowerCase()' +
            '    .normalize("NFD").replace(/[\\u0300-\\u036f]/g, "");\n' +
            '}\n' +
            'function estaDeshabilitado(el) {\n' +
            '  return !!(el.disabled || el.getAttribute("aria-disabled") === "true" || el.classList.contains("disabled"));\n' +
            '}\n' +
            // AGREGADO NUEVO — el botón de "Agregar ítem" de Sujetos
            // Excluidos es un <input type="button" value="..."> en vez de
            // un <button>: su texto visible vive en la propiedad "value",
            // no en "textContent".
            'function textoVisible(el) {\n' +
            '  return (el.tagName === "INPUT") ? el.value : el.textContent;\n' +
            '}\n' +
            // Busca cualquier botón/enlace/elemento clickeable, VISIBLE y
            // HABILITADO, cuyo texto coincida EXACTO (normalizado, sin
            // acentos) con el texto pedido. Cubre <button>
            // ("Agregar Detalle"/"Agregar Ítem", "Agregar ítem",
            // "Regresar al documento"), <a class="dropdown-item">
            // ("Producto o Servicio") e <input type="button"> (Sujetos
            // Excluidos).
            'function buscarElementoPorTexto(texto) {\n' +
            '  var objetivo = normalizar(texto);\n' +
            '  var candidatos = document.querySelectorAll("button, a, input[type=\\"button\\"], [role=\\"button\\"], .dropdown-item, .dropdown-toggle");\n' +
            '  for (var i = 0; i < candidatos.length; i++) {\n' +
            '    var el = candidatos[i];\n' +
            '    if (el.offsetParent === null) continue;\n' + // invisible/oculto
            '    if (estaDeshabilitado(el)) continue;\n' +
            '    if (normalizar(textoVisible(el)) === objetivo) return el;\n' +
            '  }\n' +
            '  return null;\n' +
            '}\n' +
            // AGREGADO NUEVO — El botón que GUARDA el ítem puede tener el
            // MISMO texto que el botón que ABRE el formulario: en Factura
            // /CCF/NC porque ambos dicen "Agregar Ítem"/"Agregar Detalle"
            // (se distinguen por btnGroupDrop2/dropdown-toggle), y en
            // Sujetos Excluidos porque literalmente los DOS dicen
            // "Agregar ítem" (uno es el <input> que abre, el otro el
            // <button ngbpopover> que guarda). Si se confunden, el clic
            // "de guardar" en realidad reabre el formulario de captura en
            // blanco encima del ya lleno, y este último nunca se guarda —
            // por eso se identifica el botón de guardar de dos formas,
            // ambas más confiables que solo el texto:
            //   1. Por el atributo "ngbpopover", que en el portal real
            //      SOLO tiene el botón de guardar (nunca el de abrir).
            //   2. Si no aparece por atributo, por texto — pero
            //      excluyendo por REFERENCIA el elemento que se usó para
            //      abrir (elAbrir) y cualquier <input> (guardar nunca es
            //      un <input>, siempre es un <button>).
            'function buscarBotonGuardarItem(elAbrir) {\n' +
            '  var porAtributo = document.querySelector("button[ngbpopover]");\n' +
            '  if (porAtributo && porAtributo !== elAbrir && porAtributo.offsetParent !== null && !estaDeshabilitado(porAtributo)) return porAtributo;\n' +
            '  var objetivo = normalizar(TEXTOS.item);\n' +
            '  var candidatos = document.querySelectorAll("button, [role=\\"button\\"]");\n' +
            '  for (var i = 0; i < candidatos.length; i++) {\n' +
            '    var el = candidatos[i];\n' +
            '    if (el === elAbrir) continue;\n' +
            '    if (el.tagName === "INPUT") continue;\n' +
            '    if (el.id === "btnGroupDrop2" || el.classList.contains("dropdown-toggle")) continue;\n' +
            '    if (el.offsetParent === null) continue;\n' +
            '    if (estaDeshabilitado(el)) continue;\n' +
            '    if (normalizar(textoVisible(el)) === objetivo) return el;\n' +
            '  }\n' +
            '  return null;\n' +
            '}\n' +
            // El botón que ABRE el menú se busca primero por su id real
            // (btnGroupDrop2, visto en el portal), y si no está disponible
            // (invisible, deshabilitado, u otro tipo de documento lo
            // numera distinto) se cae a buscarlo por texto entre los
            // .dropdown-toggle, igual que los demás. Su texto real es
            // "Agregar Ítem" (ver TEXTOS.detalle) — a pesar del nombre de
            // esta función, que se conserva solo para no reescribir cada
            // referencia.
            'function buscarBotonAgregarDetalle() {\n' +
            '  var porId = document.getElementById("btnGroupDrop2");\n' +
            '  if (porId && porId.offsetParent !== null && !estaDeshabilitado(porId) && normalizar(textoVisible(porId)) === normalizar(TEXTOS.detalle)) return porId;\n' +
            '  return buscarElementoPorTexto(TEXTOS.detalle);\n' +
            '}\n' +
            // AGREGADO NUEVO — Diagnóstico. Si después de todos los
            // reintentos no se encuentra/activa el botón, se vuelca en
            // consola el estado real del DOM en ese instante: URL de la
            // página, si "btnGroupDrop2" existe pero está oculto o
            // deshabilitado (y por qué), y el texto/estado de TODOS los
            // ".dropdown-toggle" presentes. Esto reemplaza la adivinanza
            // por datos concretos para el siguiente diagnóstico.
            'function diagnosticoBoton(etiqueta) {\n' +
            '  try {\n' +
            '    var info = { etiqueta: etiqueta, modo: MODO, textoAbrirEsperado: TEXTOS.detalle, url: location.href };\n' +
            '    var porId = document.getElementById("btnGroupDrop2");\n' +
            '    if (porId) {\n' +
            '      info.btnGroupDrop2 = {\n' +
            '        texto: textoVisible(porId),\n' +
            '        visible: porId.offsetParent !== null,\n' +
            '        disabled: !!porId.disabled,\n' +
            '        ariaDisabled: porId.getAttribute("aria-disabled"),\n' +
            '        clases: porId.className\n' +
            '      };\n' +
            '    } else {\n' +
            '      info.btnGroupDrop2 = "NO EXISTE en el DOM en este momento";\n' +
            '    }\n' +
            '    var toggles = document.querySelectorAll(".dropdown-toggle");\n' +
            '    info.totalDropdownToggle = toggles.length;\n' +
            '    info.dropdownToggles = Array.prototype.slice.call(toggles).map(function(el) {\n' +
            '      return { id: el.id, texto: normalizar(textoVisible(el)), visible: el.offsetParent !== null, disabled: estaDeshabilitado(el) };\n' +
            '    });\n' +
            '    console.log(LOG + "DIAGNÓSTICO -> " + JSON.stringify(info, null, 2));\n' +
            '  } catch (e) { console.warn(LOG + "fallo el diagnóstico:", e); }\n' +
            '}\n' +
            'function esperar(ms) { return new Promise(function(r){ setTimeout(r, ms); }); }\n' +
            'function esperarElemento(buscar, intentos, esperaMs) {\n' +
            '  return new Promise(function(resolve) {\n' +
            '    var restantes = intentos;\n' +
            '    (function intentar() {\n' +
            '      var el = buscar();\n' +
            '      if (el || restantes <= 0) return resolve(el);\n' +
            '      restantes--;\n' +
            '      setTimeout(intentar, esperaMs);\n' +
            '    })();\n' +
            '  });\n' +
            '}\n' +
            'function clic(el, nombrePaso) {\n' +
            '  if (!el) { console.warn(LOG + "no se encontró: " + nombrePaso); return false; }\n' +
            '  el.click();\n' +
            '  console.log(LOG + "clic en: " + nombrePaso);\n' +
            '  return true;\n' +
            '}\n' +
            'function setValor(input, valor, nombreCampo) {\n' +
            '  if (!input) { console.warn(LOG + "no se encontró el campo: " + nombreCampo); return; }\n' +
            '  var proto = Object.getPrototypeOf(input);\n' +
            '  var d = Object.getOwnPropertyDescriptor(proto, "value");\n' +
            '  var setter = d && d.set;\n' +
            '  if (setter) setter.call(input, valor); else input.value = valor;\n' +
            '  ["input","change","blur"].forEach(function(ev){ input.dispatchEvent(new Event(ev, { bubbles: true })); });\n' +
            '}\n' +
            '(async function flow(){\n' +
            '  console.log(LOG + "iniciando (cliente ya lleno)");\n' +
            // Margen mínimo, solo para dejar que el DOM termine de
            // asentarse justo después del último campo del receptor —
            // ya NO es el único mecanismo de sincronización (eso ahora lo
            // hace _fillPromise en _feClientesLlenar).
            '  await esperar(300);\n' +
            '  var btnDetalle = await esperarElemento(buscarBotonAgregarDetalle, 25, 300);\n' +
            '  if (!btnDetalle) { diagnosticoBoton("no se encontró el botón de apertura (" + TEXTOS.detalle + ") tras esperar"); return; }\n' +
            '  if (!clic(btnDetalle, TEXTOS.detalle)) return;\n' +
            // AGREGADO NUEVO — se guarda la REFERENCIA exacta del elemento
            // que se usó para abrir, para poder excluirla más abajo al
            // buscar el botón de "guardar" (ver buscarBotonGuardarItem).
            // Es la corrección al bug de Sujetos Excluidos: ahí el botón
            // de abrir y el de guardar dicen exactamente el mismo texto
            // ("Agregar ítem"), y sin esta exclusión por referencia la
            // automatización podía volver a hacer clic sobre el botón de
            // abrir en vez del de guardar — reabriendo un segundo
            // formulario en blanco encima del ya lleno, que nunca llegaba
            // a guardarse.
            '  var btnDetalleAbierto = btnDetalle;\n' +
            '  await esperar(200);\n' +
            // AGREGADO NUEVO — este paso solo aplica a los tipos de
            // documento cuyo botón de apertura es un dropdown (Factura,
            // Crédito Fiscal, Nota de Crédito): hay que elegir
            // "Producto o Servicio" del menú para que recién ahí abra el
            // formulario del ítem. En Sujetos Excluidos (FSE) el botón de
            // apertura ya abre el formulario directo, así que este paso
            // se salta por completo (CFG.requiereProductoServicio = false).
            '  if (CFG.requiereProductoServicio) {\n' +
            '    var opcProdServ = await esperarElemento(function(){ return buscarElementoPorTexto(TEXTOS.productoServicio); }, 15, 250);\n' +
            // AGREGADO NUEVO — reintento de un solo clic extra: si el
            // primer clic sobre el botón de apertura no llegó a abrir el
            // dropdown (p. ej. porque quedó absorbido por el cierre de
            // algún overlay todavía presente en la página, como el del
            // autocompletado de Actividad Económica), se reintenta una
            // vez el clic sobre el mismo botón antes de rendirse. No
            // reemplaza la corrección de fondo (que ya evita ese overlay
            // abierto), es solo un colchón adicional.
            '    if (!opcProdServ) {\n' +
            '      console.warn(LOG + "\\"Producto o Servicio\\" no apareció tras el primer clic — reintentando el botón de apertura");\n' +
            '      diagnosticoBoton("Producto o Servicio no apareció tras primer clic en el botón de apertura (" + TEXTOS.detalle + ")");\n' +
            '      var btnDetalle2 = await esperarElemento(buscarBotonAgregarDetalle, 5, 300);\n' +
            '      if (!clic(btnDetalle2, TEXTOS.detalle + " (reintento)")) return;\n' +
            '      btnDetalleAbierto = btnDetalle2;\n' +
            '      await esperar(200);\n' +
            '      opcProdServ = await esperarElemento(function(){ return buscarElementoPorTexto(TEXTOS.productoServicio); }, 15, 250);\n' +
            '      if (!opcProdServ) diagnosticoBoton("Producto o Servicio tampoco apareció tras el reintento");\n' +
            '    }\n' +
            '    if (!clic(opcProdServ, TEXTOS.productoServicio)) return;\n' +
            '  }\n' +
            // Al elegir "Producto o Servicio" (o, en FSE, directo tras el
            // único botón de apertura) el formulario del ítem se abre.
            // Mismos selectores que ya usa _instalarAutoConfigFE en
            // FacturacionElectronica.js para estos 5 campos del ítem — se
            // reutilizan tal cual, sin inventar selectores nuevos.
            '  var tipoEl = await esperarElemento(function(){ return document.querySelector(\'select[formcontrolname="tipo"]\'); }, 20, 300);\n' +
            '  setValor(tipoEl, D.tipo, "tipo");\n' +
            '  var cantEl = document.getElementById("inputCantidad");\n' +
            '  setValor(cantEl, D.cantidad, "cantidad");\n' +
            '  var prodEl = document.querySelector(\'input[formcontrolname="producto"], textarea[formcontrolname="producto"]\');\n' +
            '  setValor(prodEl, D.producto, "producto");\n' +
            '  var tvEl = document.querySelector(\'select[formcontrolname="tipoVenta"]\');\n' +
            '  setValor(tvEl, D.tipoVenta, "tipoVenta");\n' +
            '  var precEl = document.getElementById("inputPrecio");\n' +
            '  setValor(precEl, D.precio, "precio");\n' +
            '  await esperar(300);\n' +
            // "Agregar ítem" (guardar) — mismo texto que el botón de abrir
            // el menú, pero se busca explícitamente EXCLUYENDO ese
            // dropdown-toggle (ver buscarBotonGuardarItem) para no
            // volver a hacer clic sobre el botón equivocado.
            '  var btnItemGuardar = await esperarElemento(function(){ return buscarBotonGuardarItem(btnDetalleAbierto); }, 15, 300);\n' +
            '  if (!btnItemGuardar) diagnosticoBoton("no se encontró el botón de guardar (Agregar ítem)");\n' +
            '  if (!clic(btnItemGuardar, TEXTOS.item + " (guardar)")) return;\n' +
            '  var btnRegresar = await esperarElemento(function(){ return buscarElementoPorTexto(TEXTOS.regresar); }, 15, 300);\n' +
            '  clic(btnRegresar, TEXTOS.regresar);\n' +
            '  console.log(LOG + "completado");\n' +
            '})();\n' +
            'return true;\n' +
            '})();';

        wv.executeJavaScript(script, true).catch(function(e) {
            console.warn('[Facturación Electrónica][Clientes] Error en detalle automático:', e);
        });
    }

    // ══════════════════════════════════════════════════════════════════
    // AGREGADO (Cambio 01 — Incluir clientes de Facturación Electrónica
    // en el Backup): este catálogo vive en disco por empresa
    // (fiscalAPI.leerClientesFE / guardarClientesFE, ver main.js) y es
    // completamente independiente del catálogo de Clientes de Gestión
    // (claves 'fs_clientes_v...' de localStorage) — nunca se combinan.
    // Estas claves con prefijo FE_CLIENTES_BACKUP_PREFIX solo se usan
    // para transportar ese catálogo dentro del archivo de Backup/Restore.
    // ══════════════════════════════════════════════════════════════════
    var FE_CLIENTES_BACKUP_PREFIX = 'fs_feclientes_v' + APP_VERSION + '_emp_';

    function _feClientesBackupRecolectar() {
        // Devuelve una Promise que resuelve a { clave: arrayDeClientes }
        // con los Clientes de Facturación Electrónica de todas las
        // empresas, para incorporarlos al Backup completo.
        if (!window.fiscalAPI || !window.fiscalAPI.leerClientesFE || !Array.isArray(empresas) || !empresas.length) {
            return Promise.resolve({});
        }
        var out = {};
        var promesas = empresas.map(function(emp) {
            return window.fiscalAPI.leerClientesFE(emp.id).then(function(res) {
                out[FE_CLIENTES_BACKUP_PREFIX + emp.id] = (res && res.ok && Array.isArray(res.clientes)) ? res.clientes : [];
            }).catch(function() {
                out[FE_CLIENTES_BACKUP_PREFIX + emp.id] = [];
            });
        });
        return Promise.all(promesas).then(function() { return out; });
    }

    function _feClientesBackupRestaurar(data) {
        // Recorre las claves del Backup restaurado que correspondan a
        // Clientes de Facturación Electrónica y las guarda en su propio
        // almacenamiento (fiscalAPI.guardarClientesFE), SIN convertirlas
        // en Clientes de Gestión ni sobrescribir ese catálogo.
        if (!window.fiscalAPI || !window.fiscalAPI.guardarClientesFE) return;
        Object.keys(data).forEach(function(key) {
            if (key.indexOf(FE_CLIENTES_BACKUP_PREFIX) === 0) {
                var empresaId = key.substring(FE_CLIENTES_BACKUP_PREFIX.length);
                var arr = Array.isArray(data[key]) ? data[key] : [];
                try { window.fiscalAPI.guardarClientesFE(empresaId, arr); } catch(e) {}
            }
        });
    }

    // ══════════════════════════════════════════════════════════════════
    // AUTOCOMPLETE GENÉRICO — Helpers compartidos
    // ══════════════════════════════════════════════════════════════════
    function acClose(listId) {
        var el = document.getElementById(listId);
        if (el) { el.classList.remove('open'); el.innerHTML = ''; }
    }
    function acKeyDown(e, listId) {
        var list = document.getElementById(listId);
        if (!list || !list.classList.contains('open')) return;
        var items = list.querySelectorAll('.autocomplete-item');
        var active = list.querySelector('.autocomplete-item.active');
        var idx = active ? Array.from(items).indexOf(active) : -1;
        if (e.key === 'ArrowDown') {
            e.preventDefault();
            if (active) active.classList.remove('active');
            var next = items[idx + 1] || items[0];
            if (next) next.classList.add('active');
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            if (active) active.classList.remove('active');
            var prev = items[idx - 1] || items[items.length - 1];
            if (prev) prev.classList.add('active');
        } else if (e.key === 'Enter') {
            e.preventDefault();
            var sel = list.querySelector('.autocomplete-item.active') || items[0];
            if (sel) sel.click();
        } else if (e.key === 'Escape') {
            acClose(listId);
        }
    }