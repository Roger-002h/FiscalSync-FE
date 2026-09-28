// facturacion-electronica/FEConfig.js
// Extraído automáticamente de index.html (FiscalSync) — Fase 2.
// No se modificó ninguna línea de lógica: es exactamente el código original,
// solo reordenado por módulo.



    function _feConfigStorageKey(empresaId) {
        return 'fs_feConfig_' + empresaId;
    }

    function _feConfigDefaults() {
        return {
            fecha:     { activo: false, valor: '' },
            tipo:      { activo: false, valor: '1' },
            cantidad:  { activo: false, valor: '' },
            producto:  { activo: false, valor: '' },
            tipoVenta: { activo: false, valor: 'G' },
            precio:    { activo: false, valor: '' }
        };
    }

    // AGREGADO NUEVO — "Precio" se guarda internamente como número plano,
    // sin separador de miles (ej. "1234.5"), porque ese es el valor que
    // se inyecta tal cual en el <input> del portal de Hacienda (ver
    // _instalarAutoConfigFE en FacturacionElectronica.js). El separador de
    // miles es solo una capa de presentación dentro de ESTE panel de
    // Configuración: se aplica al mostrar el campo y se retira antes de
    // guardar o de mientras el usuario está escribiendo.
    function _feConfigFormatearPrecio(valorPlano) {
        if (!valorPlano) return '';
        var partes = String(valorPlano).split('.');
        var entero = partes[0].replace(/\B(?=(\d{3})+(?!\d))/g, ',');
        return partes.length > 1 ? (entero + '.' + partes[1]) : entero;
    }

    function _feConfigLimpiarPrecio(valorFormateado) {
        return String(valorFormateado || '').replace(/,/g, '');
    }

    function _feConfigLeer(empresaId) {
        var def = _feConfigDefaults();
        if (!empresaId) return def;
        try {
            var raw = fsStore.getItem(_feConfigStorageKey(empresaId));
            if (!raw) return def;
            var parsed = JSON.parse(raw);
            FE_CONFIG_CAMPOS.forEach(function(c) {
                if (!parsed[c]) parsed[c] = def[c];
            });
            return parsed;
        } catch (e) {
            return def;
        }
    }

    function _feConfigGuardarObjeto(empresaId, cfg) {
        if (!empresaId) return;
        fsStore.setItem(_feConfigStorageKey(empresaId), JSON.stringify(cfg));
    }

    function _feConfigSetToggleUI(campo, on) {
        var tog  = document.getElementById('feCfgToggle_' + campo);
        var item = document.getElementById('feCfgItem_' + campo);
        if (!tog) return;
        var thumb = tog.querySelector('.fe-cfg-thumb');
        if (on) {
            tog.style.background = '#4f46e5';
            if (thumb) { thumb.style.left = '18px'; thumb.style.background = '#fff'; }
            if (item) item.classList.remove('disabled');
        } else {
            tog.style.background = 'var(--rp-border-strong)';
            if (thumb) { thumb.style.left = '2px'; thumb.style.background = 'var(--rp-text-secondary)'; }
            if (item) item.classList.add('disabled');
        }
    }

    function _feConfigCargarUI() {
        var ctx = _feClientesEmpresaActual();
        var cfg = _feConfigLeer(ctx && ctx.id);
        var defaults = _feConfigDefaults();
        FE_CONFIG_CAMPOS.forEach(function(campo) {
            var el = document.getElementById('feCfgValor_' + campo);
            if (el) {
                var valor = cfg[campo].valor || defaults[campo].valor || '';
                el.value = (campo === 'precio') ? _feConfigFormatearPrecio(valor) : valor;
            }
            _feConfigSetToggleUI(campo, !!cfg[campo].activo);
        });
    }

    function _feConfigToggleCampo(campo) {
        var ctx = _feClientesEmpresaActual();
        if (!ctx) return;
        var cfg = _feConfigLeer(ctx.id);
        cfg[campo].activo = !cfg[campo].activo;
        _feConfigGuardarObjeto(ctx.id, cfg);
        _feConfigSetToggleUI(campo, cfg[campo].activo);
        _feConfigReinstalar();
    }

    function _feConfigGuardar() {
        var ctx = _feClientesEmpresaActual();
        if (!ctx) return;
        var cfg = _feConfigLeer(ctx.id);
        FE_CONFIG_CAMPOS.forEach(function(campo) {
            var el = document.getElementById('feCfgValor_' + campo);
            if (!el) return;
            cfg[campo].valor = (campo === 'precio') ? _feConfigLimpiarPrecio(el.value) : (el.value || '');
        });
        _feConfigGuardarObjeto(ctx.id, cfg);
        _feConfigReinstalar();
    }

    // AGREGADO NUEVO — helpers de foco/blur del campo "Precio" (ver el
    // <input id="feCfgValor_precio"> en index.html): al enfocarlo se quita
    // el separador de miles para no interferir con la edición del cursor;
    // al perder el foco se vuelve a formatear con separador de miles y se
    // dispara el guardado (onchange ya está en el propio input).
    function _feConfigPrecioOnFocus(el) {
        el.value = _feConfigLimpiarPrecio(el.value);
    }

    function _feConfigPrecioOnBlur(el) {
        el.value = _feConfigFormatearPrecio(_feConfigLimpiarPrecio(el.value));
    }

    // Vuelve a inyectar la configuración vigente en el <webview> activo
    // (si lo hay), para que un cambio hecho desde el panel se refleje sin
    // esperar a la próxima recarga/navegación del portal.
    function _feConfigReinstalar() {
        var ctx = _feClientesEmpresaActual();
        var wv = _facturacionElecActiva && _facturacionElecActiva.webview;
        if (!ctx || !wv) return;
        _instalarAutoConfigFE(wv, ctx.id);
    }

    function _feConfigAbrirDropdown() {
        var dd = document.getElementById('feConfigDropdown');
        if (!dd) return;
        _feConfigCargarUI();
        dd.classList.add('open');
        _feConfigActualizarPosicion();
    }

    // AJUSTADO — Configuración se corre a right:402px salvo cuando Correo Y
    // Clientes están AMBOS abiertos (los tres módulos completos): eso
    // cubre Configuración sola, Configuración+Correo y Configuración+
    // Clientes, en los tres casos pegada al módulo vecino (o al slot de
    // Correo si no hay ningún otro abierto). Solo con los tres abiertos
    // permanece en su posición original (right:792px, por CSS base).
    function _feConfigActualizarPosicion() {
        var dd = document.getElementById('feConfigDropdown');
        if (!dd) return;
        var correo = document.getElementById('feCorreoDropdown');
        var clientes = document.getElementById('feClientesDropdown');
        var correoAbierto = !!(correo && correo.classList.contains('open'));
        var clientesAbierto = !!(clientes && clientes.classList.contains('open'));
        dd.classList.toggle('fe-cfg-shifted', !(correoAbierto && clientesAbierto));
    }

    function _feConfigCerrarDropdown() {
        var dd = document.getElementById('feConfigDropdown');
        if (dd) dd.classList.remove('open');
    }

    function _feConfigToggleDropdown(ev) {
        if (ev) ev.stopPropagation();
        var dd = document.getElementById('feConfigDropdown');
        if (!dd) return;
        if (dd.classList.contains('open')) {
            _feConfigCerrarDropdown();
        } else {
            _feConfigAbrirDropdown();
        }
    }

    // Cierra el panel de Configuración al hacer clic fuera de él (mismo
    // patrón que el listener de #feClientesDropdown, justo abajo).
    document.addEventListener('click', function(e) {
        var dd = document.getElementById('feConfigDropdown');
        var btn = document.getElementById('btnFeConfig');
        if (!dd || !dd.classList.contains('open')) return;
        if (dd.contains(e.target) || (btn && btn.contains(e.target))) return;
        _feConfigCerrarDropdown();
    });