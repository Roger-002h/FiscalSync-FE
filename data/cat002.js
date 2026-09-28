/*
 * cat002.js — Cambio 04
 * ─────────────────────────────────────────────────────────────────────────
 * Fuente ÚNICA y centralizada del catálogo oficial CAT-002 (Tipo de
 * Documento / Evento) y de la equivalencia "texto real de Hacienda" ->
 * "código CAT-002" que usa FiscalSync.
 *
 * Este archivo NO reemplaza la extracción actual de "Tipo de DTE" desde la
 * consulta de Hacienda (eso sigue igual, sin tocarse). Lo único que hace
 * es tomar ESE texto ya obtenido y normalizarlo a un código interno
 * estable, para que el resto del sistema (Admin y Escaneo QR) hable
 * siempre el mismo idioma: códigos CAT-002, nunca texto suelto ni
 * atributos HTML dinámicos.
 *
 * Se usa desde:
 *   - main.js         (Node/CommonJS)  -> require('./cat002.js')
 *   - index.html       (navegador)      -> <script src="cat002.js"></script>
 *     expone window.FiscalSyncCat002
 *
 * Si en el futuro Hacienda agrega un nuevo tipo de documento, se agrega
 * AQUÍ una sola vez (catálogo + equivalencia) y automáticamente queda
 * disponible en Admin (aparece deshabilitado por defecto, ver Cambio 04
 * sección 23) y en la validación del Escaneo QR — sin tocar ningún otro
 * archivo.
 */
(function (root, factory) {
    if (typeof module === 'object' && module.exports) {
        module.exports = factory();
    } else {
        root.FiscalSyncCat002 = factory();
    }
})(typeof self !== 'undefined' ? self : this, function () {

    // Catálogo oficial CAT-002 — código y nombre EXACTOS. El "nombre" es el
    // valor que se muestra en Admin y también el texto contra el que se
    // compara (una vez normalizado) el "Tipo de DTE" real que devuelve la
    // consulta pública de Hacienda.
    var CAT_002 = [
        { codigo: '01', nombre: 'FACTURA' },
        { codigo: '03', nombre: 'COMPROBANTE DE CRÉDITO FISCAL' },
        { codigo: '04', nombre: 'NOTA DE REMISIÓN' },
        { codigo: '05', nombre: 'NOTA DE CRÉDITO' },
        { codigo: '06', nombre: 'NOTA DE DÉBITO' },
        { codigo: '07', nombre: 'COMPROBANTE DE RETENCIÓN' },
        { codigo: '08', nombre: 'COMPROBANTE DE LIQUIDACIÓN' },
        { codigo: '09', nombre: 'DOCUMENTO CONTABLE DE LIQUIDACIÓN' },
        { codigo: '11', nombre: 'FACTURA DE EXPORTACIÓN' },
        { codigo: '14', nombre: 'FACTURA DE SUJETO EXCLUIDO' },
        { codigo: '15', nombre: 'COMPROBANTE DE DONACIÓN' },
        { codigo: '17', nombre: 'EVENTO DE OPERACIONES ESPECIALES' },
        { codigo: '18', nombre: 'EVENTO DE RETORNO' }
    ];

    // Orden de comparación: del nombre MÁS específico/largo al más corto.
    // Es indispensable comparar así porque varios nombres del catálogo
    // contienen a otros como subcadena una vez normalizados — por ejemplo
    // "FACTURA" es un prefijo de "FACTURA DE SUJETO EXCLUIDO" y de
    // "FACTURA DE EXPORTACIÓN". Si "FACTURA" se comparara primero,
    // cualquier texto de esos otros dos tipos se identificaría
    // incorrectamente como código 01.
    var _ORDEN_COMPARACION = ['14', '11', '03', '07', '08', '09', '15', '04', '05', '06', '17', '18', '01'];
    var _CAT_002_POR_CODIGO = {};
    CAT_002.forEach(function (item) { _CAT_002_POR_CODIGO[item.codigo] = item; });

    // Quita tildes, colapsa espacios y pasa a mayúsculas — así "Factura",
    // "FACTURA ", "  factura" o "Factura" (con espacios dobles) se
    // reconocen todos como el mismo valor, sin inventar equivalencias que
    // no estén en el catálogo.
    function normalizarTexto(s) {
        return String(s || '')
            .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
            .replace(/\s+/g, ' ')
            .trim()
            .toUpperCase();
    }

    // Traduce el texto real de "Tipo de DTE" (tal como lo devuelve la
    // consulta pública de Hacienda) al código CAT-002 correspondiente.
    // Devuelve null si el texto no corresponde a NINGUNO de los tipos del
    // catálogo — un tipo desconocido nunca se asume válido (ver Cambio 04,
    // sección 16/17): se distingue de "conocido pero deshabilitado".
    function cat002CodigoDesdeTexto(texto) {
        var n = normalizarTexto(texto);
        if (!n) return null;
        for (var i = 0; i < _ORDEN_COMPARACION.length; i++) {
            var codigo = _ORDEN_COMPARACION[i];
            var nombreNormalizado = normalizarTexto(_CAT_002_POR_CODIGO[codigo].nombre);
            if (n.indexOf(nombreNormalizado) !== -1) return codigo;
        }
        return null;
    }

    function nombrePorCodigo(codigo) {
        var item = _CAT_002_POR_CODIGO[codigo];
        return item ? item.nombre : '';
    }

    return {
        CAT_002: CAT_002,
        normalizarTexto: normalizarTexto,
        cat002CodigoDesdeTexto: cat002CodigoDesdeTexto,
        nombrePorCodigo: nombrePorCodigo
    };
});
