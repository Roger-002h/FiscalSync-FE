// core/navegacion.js
// Extraído automáticamente de index.html (FiscalSync) — Fase 2.
// No se modificó ninguna línea de lógica: es exactamente el código original,
// solo reordenado por módulo.



    function switchScreen(showId) {
        // AJUSTADO — Cambio 07 (4ta vuelta): reescrito para que la transición
        // sea SECUENCIAL y no simultánea. Antes, mientras el anexo saliente
        // se desvanecía, el anexo entrante ya estaba visible al mismo tiempo
        // (crossfade). Como estos anexos son hijos directos de <main> en flujo
        // normal (no superpuestos con position:absolute), tener dos visibles
        // a la vez hacía que compitieran por el alto disponible y producía el
        // salto/traba reportado. Ahora primero se oculta por completo el
        // anexo anterior y RECIÉN DESPUÉS aparece el nuevo — nunca hay dos al
        // mismo tiempo, así que no hay pelea de layout ni traba.
        var ids = ['homeScreen','jsonScreen','csvScreen','debitoFiscalScreen','consumidorFinalScreen','comprasScreen',
         'percibidoScreen','retenidoScreen','anticipoScreen','excluidoScreen','exportScreen','librosLegalesScreen',
         'retencionesF14Screen','quincena25Screen','anuladosScreen','proveedoresScreen','clientesScreen','empleadosScreen','correosScreen',
         'gestionCatalogosScreen','escaneoDocumentosScreen'];

        function activarPantalla() {
            var el = document.getElementById(showId);
            if (!el) return;
            el.classList.remove('hidden');
            // Doble rAF: asegura que el navegador ya pintó el frame en
            // opacity:0 antes de animar a "active" (mismo truco que usa
            // fsConfirm() en este archivo), para que el fundido se vea
            // siempre y no aparezca de golpe.
            requestAnimationFrame(function() {
                requestAnimationFrame(function() { el.classList.add('active'); });
            });
            if (showId === 'exportScreen') updateExportCounts();
            if (showId === 'librosLegalesScreen') { updateLibrosLegalesCounts(); resetLibrosLegalesView(); }
            if (showId === 'proveedoresScreen') { renderProveedoresTable(); }
            if (showId === 'clientesScreen') { renderClientesTable(); }
            if (showId === 'empleadosScreen') { renderEmpleadosTable(); }
            if (showId === 'csvScreen') { initCsvScreen(); }
            if (showId === 'correosScreen') { correosRenderTabla(); correosRenderHistorial(); _correosCheckAutoloadBanner(); }
            if (showId === 'escaneoDocumentosScreen') {
                // El QR solo se genera cuando el usuario presiona "Vincular
                // teléfono" (abrirEscaneoDocumentosFisicos). Al entrar a la
                // pantalla solo se redibuja el estado actual — si no hay
                // sesión activa, se ve el botón de vincular sin QR todavía.
                _renderEscaneoDocScreen();
            }
        }

        var habiaVisible = false;
        ids.forEach(function(id) {
            if (id === showId) return;
            var el = document.getElementById(id);
            if (el && !el.classList.contains('hidden')) {
                habiaVisible = true;
                el.classList.remove('active');
                setTimeout(function() { el.classList.add('hidden'); }, 150);
            }
        });

        if (habiaVisible) {
            setTimeout(activarPantalla, 150);
        } else {
            activarPantalla();
        }
    }

    // ══════════════════════════════════════════════════════════════════
    // AGREGADO NUEVO — Cambio 07 (Animaciones): transición entre la
    // pantalla de empresas y el workspace interno de una empresa.
    // AJUSTADO (4ta vuelta): igual que switchScreen() arriba, ahora es
    // SECUENCIAL. empresaScreen y workspaceContainer son hijos directos
    // de <body class="flex ..."> — es decir, hermanos dentro de un flex
    // row. Tenerlos visibles los dos al mismo tiempo (crossfade) hacía que
    // ambos compitieran por el ancho de body como si fueran dos columnas,
    // por eso el que entraba se veía angosto y "empujado" desde la
    // derecha, y al ocultarse el otro se expandía de golpe. Ahora primero
    // se oculta por completo la pantalla anterior y RECIÉN DESPUÉS aparece
    // la nueva — un simple fundido, sin desplazamiento y sin ese salto.
    // ══════════════════════════════════════════════════════════════════
    function _mostrarPantalla(idMostrar, idOcultar) {
        var elMostrar = document.getElementById(idMostrar);
        var elOcultar = document.getElementById(idOcultar);

        function mostrar() {
            if (!elMostrar) return;
            elMostrar.classList.remove('hidden');
            requestAnimationFrame(function() {
                requestAnimationFrame(function() { elMostrar.classList.add('active'); });
            });
        }

        if (elOcultar) {
            elOcultar.classList.remove('active');
            setTimeout(function() {
                elOcultar.classList.add('hidden');
                mostrar();
            }, 150);
        } else {
            mostrar();
        }
    }

    function showScreen(type) {
        if (type === 'csv') {
            switchScreen('csvScreen');
            return;
        }
        // ═══ AGREGADO NUEVO: CONTROL DE IMPORTACIÓN ═══
        // Limpiar cola y buffer antes de cada nueva importación o cambio de modo
        clearQueue();
        currentMode = type;
        document.getElementById('jsonTitle').innerText = type === 'compras' ? 'Carga JSON — Compras' : 'Carga JSON — Ventas';
        document.getElementById('queueMode').innerText = type === 'compras'
            ? 'Modo: Compras → Compras · IVA Percibido · IVA Retenido · Anticipo · Excluido'
            : 'Modo: Ventas → Consumidor Final · Crédito Fiscal · IVA Retenido';
        switchScreen('jsonScreen');
    }

    // ══════════════════════════════════════════════════════════════════
    // HEADER DROPDOWN MENU — Opciones (Modo Revisión / Falta Físico / Borrar)
    // ══════════════════════════════════════════════════════════════════
    function toggleHdrMenu(id, event) {
        event.stopPropagation();
        var menus = document.querySelectorAll('.hdr-dropdown');
        menus.forEach(function(m) { if (m.id !== id) m.classList.remove('open'); });
        var menu = document.getElementById(id);
        if (menu) menu.classList.toggle('open');
    }
    function closeHdrMenu(id) {
        var menu = document.getElementById(id);
        if (menu) menu.classList.remove('open');
    }
    document.addEventListener('click', function() {
        document.querySelectorAll('.hdr-dropdown.open').forEach(function(m) { m.classList.remove('open'); });
    });