    function applyFiscalSyncTheme(theme) {
        var html = document.documentElement;
        var sun = document.getElementById('themeToggleIconSun');
        var moon = document.getElementById('themeToggleIconMoon');
        var btn = document.getElementById('themeToggleBtn');
        var label = document.getElementById('themeToggleLabel');
        if (theme === 'light') {
            html.setAttribute('data-theme', 'light');
            if (sun) sun.style.display = 'none';
            if (moon) moon.style.display = '';
            if (btn) btn.title = 'Activar Modo Oscuro';
            if (label) label.textContent = 'Modo Oscuro';
        } else {
            html.removeAttribute('data-theme');
            if (sun) sun.style.display = '';
            if (moon) moon.style.display = 'none';
            if (btn) btn.title = 'Activar Modo Claro';
            if (label) label.textContent = 'Modo Claro';
        }
    }

    // AJUSTADO (Cambio 05 — corrección de fluidez): en vez de forzar una
    // transición CSS sobre TODO el DOM (lo que causaba el "trabón" en
    // pantallas con tablas grandes), se usa la View Transitions API nativa:
    // el navegador anima un crossfade entre una captura del estado anterior
    // y el nuevo, compuesto por GPU, sin recalcular estilos de cada nodo.
    // applyFiscalSyncTheme(next) sigue siendo la única función que realmente
    // cambia colores/atributo/localStorage — aquí solo se decide si ese
    // cambio se envuelve o no en la animación.
    function toggleFiscalSyncTheme() {
        var html = document.documentElement;
        var isLight = html.getAttribute('data-theme') === 'light';
        var next = isLight ? 'dark' : 'light';

        function applyAndPersist() {
            applyFiscalSyncTheme(next);
            try { localStorage.setItem('fiscalsync-theme', next); } catch (e) { /* no-op */ }
        }

        // Soportado por el Chromium que trae Electron (y navegadores modernos).
        // Si no está disponible, se aplica el cambio directamente: sin
        // animación, pero también sin ningún costo de rendimiento extra —
        // nunca se vuelve a usar la vieja transición "*" sobre todo el DOM.
        if (typeof document.startViewTransition === 'function') {
            document.startViewTransition(applyAndPersist);
        } else {
            applyAndPersist();
        }
    }

    // Sincroniza el ícono/tooltip del botón con el tema ya aplicado por el
    // script anti-parpadeo del <head> (que corrió antes de pintar la UI).
    (function () {
        var current = document.documentElement.getAttribute('data-theme') === 'light' ? 'light' : 'dark';
        applyFiscalSyncTheme(current);
    })();
