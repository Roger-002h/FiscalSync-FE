const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('fiscalAPI', {

    // Abrir diálogo para seleccionar carpeta
    selectFolder: () => ipcRenderer.invoke('select-folder'),

    // Leer todos los archivos de una carpeta (retorna array de { name, ext })
    readFolder: (folderPath) => ipcRenderer.invoke('read-folder', folderPath),

    // Leer contenido de un archivo JSON
    readJson: (folderPath, fileName) => ipcRenderer.invoke('read-json', folderPath, fileName),

    // ── Almacenamiento en disco ─────────────────────────────────────────
    fsReadStore: () => ipcRenderer.invoke('fs-read-store'),
    fsWriteStore: (jsonStr) => ipcRenderer.invoke('fs-write-store', jsonStr),

    // Controles de ventana
    windowMinimize: () => ipcRenderer.invoke('window-minimize'),
    windowMaximize: () => ipcRenderer.invoke('window-maximize'),
    windowClose:    () => ipcRenderer.invoke('window-close'),

    // Verificar si el API está disponible (para detección en runtime)
    isElectron: true,

    // ── Exportación automática organizada por mes y empresa ─────────────
    // params: { mes, empresa, fileName, content, encoding }
    saveExportFile: (params) => ipcRenderer.invoke('save-export-file', params),

    // ── Auto-actualizaciones (GitHub Releases) ──────────────────────────
    checkForUpdates: () => ipcRenderer.invoke('check-for-updates'),
    getAppVersion: () => ipcRenderer.invoke('get-app-version'),
    installUpdate: () => ipcRenderer.invoke('install-update'),
    onUpdateStatus: (callback) => ipcRenderer.on('update-status', (event, data) => callback(data)),

    // ── Configuración de rutas de exportación ───────────────────────────
    getExportConfig: () => ipcRenderer.invoke('get-export-config'),
    setExportConfig: (cfg) => ipcRenderer.invoke('set-export-config', cfg),
    resetExportConfig: () => ipcRenderer.invoke('reset-export-config'),

    // ── Facturación Electrónica: JSON/PDF organizados por Mes/Empresa ───
    // El renderer llama esto al entrar a Facturación Electrónica y cada vez
    // que el usuario cambia el "Mes de trabajo".
    // params: { empresaId, mesLabel, empresaNombre }
    setFacturacionContext: (params) => ipcRenderer.invoke('fe-set-context', params),

    // cb(info) — info: { ok, state, ext, path } — cuando main.js termina de
    // guardar un JSON o PDF de Facturación Electrónica.
    onFacturacionDescarga: (callback) => ipcRenderer.on('fe-descarga-completada', (event, data) => callback(data)),

    // cb() — atajo Ctrl+B dentro del <webview> de Facturación Electrónica
    onAtajoBusquedaRapidaFE: (callback) => ipcRenderer.on('fe-atajo-busqueda-rapida', () => callback()),

    // ── Facturación Electrónica: Clientes (autocompletar en el portal) ──
    // Devuelve/recibe: { ok, clientes } | { error }
    leerClientesFE: (empresaId) => ipcRenderer.invoke('fe-clientes-leer', { empresaId }),
    guardarClientesFE: (empresaId, clientes) => ipcRenderer.invoke('fe-clientes-guardar', { empresaId, clientes }),
    importarClientesFE: (empresaId) => ipcRenderer.invoke('fe-clientes-importar-csv', { empresaId }),
    exportarClientesFE: (empresaId, empresaNombre) => ipcRenderer.invoke('fe-clientes-exportar-csv', { empresaId, empresaNombre }),

    // ── Facturación Electrónica: Reportes DTE (Anexo 1 / Anexo 2) ───────
    // Guardado silencioso (sin diálogo), organizado igual que los JSON/PDF
    // de Facturación: Gestión → [Mes] → [Empresa] → Facturacion → Reportes.
    // params PDF: { htmlSnapshot, fileName, mesLabel, empresaNombre }
    // params CSV: { content, fileName, mesLabel, empresaNombre }
    guardarReportePdf: (params) => ipcRenderer.invoke('fe-reportes-guardar-pdf', params),
    guardarReporteCsv: (params) => ipcRenderer.invoke('fe-reportes-guardar-csv', params),

    // ── Eliminar TODOS los datos de una empresa (clientes FE, carpetas, sesión del portal)
    eliminarDatosEmpresaFE: (empresaId, empresaNombre) => ipcRenderer.invoke('fe-eliminar-empresa-datos', { empresaId, empresaNombre })
});

// ── electronAPI — usado por el módulo de Correo ──────────────────────────
contextBridge.exposeInMainWorld('electronAPI', {

    // Enviar correo vía nodemailer (main process)
    sendEmail: (data) => ipcRenderer.invoke('send-email', data),

    // Seleccionar carpeta / leer archivos (reutiliza handlers existentes)
    selectFolder: () => ipcRenderer.invoke('select-folder'),
    readFolder: (folderPath) => ipcRenderer.invoke('read-folder', folderPath),
    readJson: (folderPath, fileName) => ipcRenderer.invoke('read-json', folderPath, fileName),
    selectFolderJsons: () => ipcRenderer.invoke('select-folder-jsons'),

    // Resuelve la ruta real de PDF/JSON a adjuntar en un correo, usando el
    // Código de Generación cuando no hay ruta directa disponible.
    // params: { pdfPath, jsonPath, mesLabel, empresaNombre, codigoBase }
    resolverAdjuntosCorreo: (params) => ipcRenderer.invoke('fe-resolver-adjuntos-correo', params),

    isElectron: true
});
