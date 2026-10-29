'use strict';
// Ejecuta el userscript de verdad dentro de jsdom, con el almacén y la red de
// Tampermonkey simulados, y devuelve lo que se ve (los distintivos) y lo que
// ha costado (peticiones, bytes, tiempo de parseo, escrituras al almacén).

const { JSDOM } = require('jsdom');
const { performance } = require('perf_hooks');

// Modelo de red: ida y vuelta fija más el tiempo de transferencia. Sólo sirve
// para que el orden y el solapamiento de las esperas se parezcan a la
// realidad; los tiempos de reloj que salgan dependen de estos números.
const RED = {
    lan:        { rtt: 4,   bytesPorMs: 12500 },   // ~100 Mbit/s
    tmdb:       { rtt: 80,  bytesPorMs: 2500 },    // ~20 Mbit/s
    letterboxd: { rtt: 120, bytesPorMs: 2500 }
};

function tipoDeHost(host) {
    if (host === 'api.themoviedb.org') return 'tmdb';
    if (/letterboxd\.com$/.test(host)) return 'letterboxd';
    return 'lan';
}

async function ejecutar(opts) {
    const dom = new JSDOM(opts.html, {
        url: opts.url || 'https://letterboxd.com/films/popular/',
        runScripts: 'outside-only',
        pretendToBeVisual: true
    });
    const w = dom.window;
    const t0 = performance.now();
    const ahora = function () { return performance.now() - t0; };

    const gm = new Map(Object.entries(opts.gm || {}));
    const log = {
        peticiones: [],          // { metodo, url, host, estado, bytes, t }
        enVuelo: 0,
        maxEnVuelo: 0,
        escrituras: [],          // { clave, bytes, t }
        parseMs: 0, parseBytes: 0,
        stringifyMs: 0,
        domParserMs: 0,
        errores: []
    };

    w.GM_getValue = function (k, d) { return gm.has(k) ? gm.get(k) : d; };
    w.GM_setValue = function (k, v) {
        gm.set(k, v);
        log.escrituras.push({ clave: k, bytes: String(v).length, t: ahora() });
    };
    w.GM_deleteValue = function (k) { gm.delete(k); };
    w.GM_addStyle = function (css) {
        const s = w.document.createElement('style');
        s.textContent = css;
        (w.document.head || w.document.documentElement).appendChild(s);
    };
    const menu = {};
    w.GM_registerMenuCommand = function (nombre, fn) { menu[nombre] = fn; };

    w.GM_xmlhttpRequest = function (d) {
        let host = '';
        try { host = new URL(d.url).hostname; } catch (e) { /* nada */ }
        const res = opts.red(d, ahora) || { status: 404, body: '' };
        const cuerpo = typeof res.body === 'string' ? res.body : JSON.stringify(res.body);
        const modelo = RED[tipoDeHost(host)];
        const espera = res.espera !== undefined ? res.espera : modelo.rtt + cuerpo.length / modelo.bytesPorMs;
        const reg = { metodo: d.method || 'GET', url: d.url, host: host, estado: res.status, bytes: cuerpo.length, t: ahora() };
        log.peticiones.push(reg);
        log.enVuelo++;
        log.maxEnVuelo = Math.max(log.maxEnVuelo, log.enVuelo);
        w.setTimeout(function () {
            log.enVuelo--;
            reg.fin = ahora();
            if (res.red === 'error') return d.onerror && d.onerror({});
            if (res.red === 'timeout') return d.ontimeout && d.ontimeout({});
            d.onload && d.onload({
                status: res.status,
                responseText: cuerpo,
                responseHeaders: res.headers || ''
            });
        }, espera);
    };

    // Todo lo observado está a la vista. Se avisa en el siguiente turno, como
    // hace el navegador, y no de inmediato.
    w.IntersectionObserver = class {
        constructor(cb) { this.cb = cb; }
        observe(el) { const cb = this.cb; w.setTimeout(function () { cb([{ isIntersecting: true, target: el }]); }, 0); }
        unobserve() {}
        disconnect() {}
    };
    if (!w.requestAnimationFrame) w.requestAnimationFrame = function (fn) { return w.setTimeout(fn, 16); };
    w.requestIdleCallback = function (fn) { return w.setTimeout(function () { fn({ timeRemaining: function () { return 10; }, didTimeout: false }); }, 5); };
    w.open = function (url) { (log.abiertas = log.abiertas || []).push(url); };

    // El script usa el JSON del propio realm de la ventana: se cronometra ahí.
    const JP = w.JSON.parse, JS = w.JSON.stringify;
    w.JSON.parse = function (s) {
        const a = performance.now();
        try { return JP.apply(this, arguments); }
        finally { log.parseMs += performance.now() - a; log.parseBytes += (s && s.length) || 0; }
    };
    w.JSON.stringify = function () {
        const a = performance.now();
        try { return JS.apply(this, arguments); }
        finally { log.stringifyMs += performance.now() - a; }
    };
    const DP = w.DOMParser.prototype.parseFromString;
    w.DOMParser.prototype.parseFromString = function () {
        const a = performance.now();
        try { return DP.apply(this, arguments); }
        finally { log.domParserMs += performance.now() - a; }
    };

    w.addEventListener('error', function (e) { log.errores.push(String(e.error && e.error.stack || e.message)); });
    w.addEventListener('unhandledrejection', function (e) { log.errores.push('promesa: ' + String(e.reason && e.reason.stack || e.reason)); });

    // Último cambio visible de un distintivo.
    let ultimoCambio = 0;
    const mo = new w.MutationObserver(function (muts) {
        for (const m of muts) {
            const n = m.target;
            if (n.nodeType === 1 && n.classList.contains('ltm-chip')) { ultimoCambio = ahora(); return; }
            if (n.nodeType === 3 && n.parentNode && n.parentNode.classList && n.parentNode.classList.contains('ltm-chip')) { ultimoCambio = ahora(); return; }
        }
    });
    mo.observe(w.document, { subtree: true, attributes: true, attributeFilter: ['class', 'title'], childList: true, characterData: true });

    try {
        w.eval(opts.script);
    } catch (e) {
        log.errores.push('eval: ' + e.stack);
    }

    if (opts.antesDeEsperar) await opts.antesDeEsperar(w, menu, ahora);

    // Se espera a que no quede nada en vuelo ni ningún distintivo cargando, y
    // a que eso se mantenga un rato.
    let tTodos = null, quieto = 0;
    const limite = opts.limiteMs || 120000;
    while (ahora() < limite) {
        await new Promise(function (r) { setTimeout(r, 10); });
        const chips = w.document.querySelectorAll('.ltm-chip');
        const cargando = Array.prototype.some.call(chips, function (c) { return c._state === 'loading' || c._state === 'busy'; });
        if (!cargando && chips.length && tTodos === null) tTodos = ahora();
        if (cargando) tTodos = null;
        if (!cargando && log.enVuelo === 0) quieto += 10; else quieto = 0;
        if (quieto >= (opts.quietoMs || 400)) break;
    }

    if (opts.despues) await opts.despues(w, menu, ahora);

    // Como al cerrar la pestaña: lo pendiente de guardar se guarda.
    w.dispatchEvent(new w.Event('pagehide'));
    await new Promise(function (r) { setTimeout(r, 30); });

    const resultado = {
        distintivos: foto(w),
        log: log,
        tTodos: tTodos,
        tFinal: ultimoCambio,
        gm: Object.fromEntries(gm),
        menu: menu,
        window: w
    };
    return resultado;
}

// Lo que ve el usuario de cada distintivo, en el orden del documento: dónde
// está, qué pone, de qué color es y qué dice al pasar por encima. Se añade la
// coincidencia de TMDB, que no se ve pero decide lo que pasa al pulsar.
function foto(w) {
    return Array.prototype.map.call(w.document.querySelectorAll('.ltm-chip'), function (c) {
        const p = c.parentElement;
        const sitio = p ? (p.tagName.toLowerCase() + (p.className ? '.' + String(p.className).trim().split(/\s+/).filter(function (k) { return k !== 'ltm-wrap'; }).join('.') : '')) : '';
        return {
            slug: c._meta && c._meta.slug,
            sitio: sitio,
            modo: c._mode,
            estado: c._state,
            clase: c.className,
            texto: c.textContent,
            tip: c.title,
            match: c._match ? c._match.kind + ':' + c._match.id : null
        };
    });
}

module.exports = { ejecutar: ejecutar, foto: foto, RED: RED };
