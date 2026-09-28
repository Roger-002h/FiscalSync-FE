// actualizaciones/Actualizaciones.js
// Extraído automáticamente de index.html (FiscalSync) — Fase 2.
// No se modificó ninguna línea de lógica: es exactamente el código original,
// solo reordenado por módulo.



    // ══════════════════════════════════════════════════════════════════
    // AGREGADO NUEVO: ACTUALIZACIONES (auto-updater vía GitHub Releases)
    // ══════════════════════════════════════════════════════════════════

    function openUpdateModal() {
        var modal = document.getElementById('updateModal');
        modal.style.display = 'flex';
        modal.classList.remove('hidden');
        updateSetStatusIcon('idle');
        document.getElementById('updateVersionArrowWrap').style.display = 'none';
        var verEl = document.getElementById('updateCurrentVersion');
        verEl.textContent = '...';
        if (window.fiscalAPI && window.fiscalAPI.getAppVersion) {
            window.fiscalAPI.getAppVersion().then(function(v) {
                verEl.textContent = v || '—';
            }).catch(function() {
                verEl.textContent = '—';
            });
        } else {
            verEl.textContent = '—';
        }
    }

    function closeUpdateModal() {
        var modal = document.getElementById('updateModal');
        modal.style.display = 'none';
        modal.classList.add('hidden');
    }

    // Alterna cuál ícono de estado se muestra dentro del círculo (idle/checking/ok/download/error)
    function updateSetStatusIcon(kind) {
        var icons = { idle: 'updateStatusIconIdle', checking: 'updateStatusIconChecking', ok: 'updateStatusIconOk', download: 'updateStatusIconDownload', error: 'updateStatusIconError' };
        Object.keys(icons).forEach(function(k) {
            document.getElementById(icons[k]).style.display = (k === kind) ? 'block' : 'none';
        });
        var box = document.getElementById('updateStatusBox');
        var borderColors = { idle: 'var(--rp-border-strong)', checking: '#1f3a5f', ok: '#14532d', download: '#1f3a5f', error: '#4c1d1d' };
        box.style.borderColor = borderColors[kind] || 'var(--rp-border-strong)';
    }

    function checkForUpdatesUI() {
        if (!window.fiscalAPI || !window.fiscalAPI.checkForUpdates) {
            document.getElementById('updateStatusText').textContent = 'Esta función no está disponible en este entorno.';
            updateSetStatusIcon('error');
            return;
        }
        var btn = document.getElementById('updateActionBtn');
        btn.disabled = true;
        btn.style.opacity = '0.6';
        document.getElementById('updateVersionArrowWrap').style.display = 'none';
        document.getElementById('updateStatusText').textContent = 'Buscando actualizaciones...';
        document.getElementById('updateProgressWrap').style.display = 'none';
        updateSetStatusIcon('checking');
        window.fiscalAPI.checkForUpdates();
    }

    // Escucha los eventos que manda main.js durante todo el proceso
    if (window.fiscalAPI && window.fiscalAPI.onUpdateStatus) {
        window.fiscalAPI.onUpdateStatus(function(data) {
            var statusText = document.getElementById('updateStatusText');
            var progressWrap = document.getElementById('updateProgressWrap');
            var progressBar = document.getElementById('updateProgressBar');
            var progressLabel = document.getElementById('updateProgressLabel');
            var btn = document.getElementById('updateActionBtn');
            var dot = document.getElementById('updateDotBadge');
            var arrowWrap = document.getElementById('updateVersionArrowWrap');
            var targetVerEl = document.getElementById('updateTargetVersion');

            if (data.status === 'checking') {
                statusText.textContent = 'Buscando actualizaciones...';
                updateSetStatusIcon('checking');
            } else if (data.status === 'not-available') {
                statusText.textContent = 'Ya tienes la última versión instalada.';
                updateSetStatusIcon('ok');
                btn.disabled = false; btn.style.opacity = '1';
                btn.innerHTML = '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M21 21l-4.35-4.35M19 11a8 8 0 11-16 0 8 8 0 0116 0z"/></svg> Buscar actualizaciones';
                btn.setAttribute('onclick', 'checkForUpdatesUI()');
            } else if (data.status === 'available') {
                statusText.textContent = 'Versión ' + data.version + ' encontrada. Descargando...';
                updateSetStatusIcon('download');
                progressWrap.style.display = 'block';
                targetVerEl.textContent = data.version || '—';
                arrowWrap.style.display = 'flex';
            } else if (data.status === 'downloading') {
                updateSetStatusIcon('download');
                progressWrap.style.display = 'block';
                var pct = data.percent || 0;
                progressBar.style.width = pct + '%';
                progressLabel.textContent = pct + '%';
                statusText.textContent = 'Descargando actualización...';
            } else if (data.status === 'downloaded') {
                statusText.textContent = 'Actualización descargada. Instalando y reiniciando...';
                updateSetStatusIcon('ok');
                progressWrap.style.display = 'none';
                btn.disabled = true;
                btn.style.opacity = '0.6';
                btn.innerHTML = 'Reiniciando...';
                // No se necesita ninguna acción del usuario: main.js instala y reinicia sola en unos segundos.
            } else if (data.status === 'error') {
                statusText.textContent = 'Error al buscar actualizaciones: ' + (data.message || 'desconocido');
                updateSetStatusIcon('error');
                progressWrap.style.display = 'none';
                btn.disabled = false; btn.style.opacity = '1';
                btn.innerHTML = 'Reintentar';
                btn.setAttribute('onclick', 'checkForUpdatesUI()');
            }
        });
    }

    function installUpdateUI() {
        fsConfirm('La aplicación se cerrará y se reiniciará con la nueva versión. ¿Continuar?', function() {
            window.fiscalAPI.installUpdate();
        });
    }