// core/estado.js
// Extraído automáticamente de index.html (FiscalSync) — Fase 2.
// No se modificó ninguna línea de lógica: es exactamente el código original,
// solo reordenado por módulo.



    // ══════════════════════════════════════════════════════════════════
    // VERSIÓN DE LA APLICACIÓN — cada versión tiene su propia base de datos
    // Cambiar este valor al actualizar la aplicación aísla los datos automáticamente
    // ══════════════════════════════════════════════════════════════════
    const APP_VERSION = '1.0.9';

    // DATA STORES
    // ══════════════════════════════════════════════
    let debitoRecords   = [];
    let cfRecords       = [];
    let comprasRecords  = [];
    let percibidoRecords= [];
    let retenidoRecords = [];
    let anticipoRecords = [];
    let excluidoRecords = [];
    let f14Records      = []; // AGREGADO NUEVO
    let quincena25Records = []; // AGREGADO 01 — Quincena Veinticinco
    let anuladosRecords = [];

    let empresas = [];
    let activeEmpresaId = null;
    let currentMonth = new Date().getMonth();
    let currentYear  = new Date().getFullYear();

    const MONTH_NAMES = [
        'Enero','Febrero','Marzo','Abril','Mayo','Junio',
        'Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'
    ];