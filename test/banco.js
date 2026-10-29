'use strict';
// Banco de pruebas: ejecuta la versión de referencia (por defecto la 1.7.0, el
// commit f16c4fd) y la del directorio de trabajo con los mismos escenarios, y
// exige que los distintivos que se ven salgan idénticos. Además mide lo que
// cuesta cada una: peticiones, bytes, parseo y escrituras al almacén.
//
//   node test/banco.js                 todo, biblioteca grande
//   node test/banco.js --base <ref>    otra versión de referencia
//   node test/banco.js --rapido        biblioteca pequeña, para iterar

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const H = require('./harness');
const S = require('./servidor');
const F = require('./fixtures');

const args = process.argv.slice(2);
function arg(n, d) { const i = args.indexOf(n); return i === -1 ? d : (args[i + 1] || d); }
const BASE = arg('--base', 'f16c4fd');
const RAPIDO = args.indexOf('--rapido') !== -1;
const REPES = parseInt(arg('--repes', RAPIDO ? '1' : '3'), 10);
const RELLENO = RAPIDO ? { movies: 1500, shows: 200, radarr: 800, sonarr: 150 }
                       : { movies: 10000, shows: 1500, radarr: 8000, sonarr: 1200 };

const RAIZ = path.join(__dirname, '..');
const ANTES = execFileSync('git', ['-C', RAIZ, 'show', BASE + ':lettermonkey.user.js'], { encoding: 'utf8', maxBuffer: 1 << 26 });
const DESPUES = fs.readFileSync(path.join(RAIZ, 'lettermonkey.user.js'), 'utf8');

let fallos = 0, pasadas = 0;
function ok(cond, msg) {
    if (cond) { pasadas++; return; }
    fallos++;
    console.log('  ✗ ' + msg);
}

// Comparación de lo visible. Se ignora el orden de las clases.
function claveVisible(d) {
    return [d.slug, d.sitio, d.modo, d.estado, d.clase.split(/\s+/).sort().join(' '), d.texto, d.tip, d.match].join(' ¦ ');
}
function iguales(a, b, nombre) {
    const A = a.map(claveVisible), B = b.map(claveVisible);
    let dif = 0;
    const n = Math.max(A.length, B.length);
    for (let i = 0; i < n; i++) {
        if (A[i] !== B[i]) {
            if (dif < 6) console.log('    antes:   ' + (A[i] || '(nada)') + '\n    despues: ' + (B[i] || '(nada)'));
            dif++;
        }
    }
    ok(dif === 0 && A.length === B.length, nombre + ': ' + dif + ' distintivos distintos de ' + n);
    return dif === 0;
}

// El índice que queda guardado, sin la fecha: el de Plex construido con el
// listado recortado tiene que ser idéntico al construido con el entero.
function indices(gm) {
    const out = {};
    const v = gm['lettermonkey.index'] ? JSON.parse(gm['lettermonkey.index']) : {};
    Object.keys(v).forEach(function (s) { out[s] = JSON.stringify(v[s].data); });
    return out;
}
function mismoIndice(a, b, nombre) {
    const A = indices(a.gm), B = indices(b.gm);
    ['plex', 'radarr', 'sonarr'].forEach(function (s) {
        ok(A[s] !== undefined && A[s] === B[s], nombre + ': índice de ' + s + ' idéntico' +
           (A[s] === B[s] ? '' : ' (' + (A[s] || '').length + ' frente a ' + (B[s] || '').length + ' caracteres)'));
    });
}

function resumen(d) {
    const c = {};
    d.forEach(function (x) { c[x.estado] = (c[x.estado] || 0) + 1; });
    return Object.keys(c).sort().map(function (k) { return k + ' ' + c[k]; }).join(', ');
}

function coste(r) {
    const por = {};
    let bytes = 0;
    r.log.peticiones.forEach(function (p) {
        const h = p.host.replace(/\.lan$/, '').replace('api.themoviedb.org', 'tmdb');
        por[h] = por[h] || { n: 0, bytes: 0 };
        por[h].n++; por[h].bytes += p.bytes; bytes += p.bytes;
    });
    const esc = r.log.escrituras.reduce(function (s, e) { return s + e.bytes; }, 0);
    return {
        peticiones: r.log.peticiones.length, bytes: bytes, por: por,
        parseMs: r.log.parseMs, parseMB: r.log.parseBytes / 1e6, stringifyMs: r.log.stringifyMs,
        escrituras: r.log.escrituras.length, escrituraMB: esc / 1e6,
        tTodos: r.tTodos, tFinal: r.tFinal, maxEnVuelo: r.log.maxEnVuelo
    };
}

function mediana(xs) { const s = xs.slice().sort(function (a, b) { return a - b; }); return s[Math.floor(s.length / 2)]; }

function fmtCoste(c) {
    const hosts = Object.keys(c.por).sort().map(function (h) {
        return h + ' ' + c.por[h].n + ' pet / ' + (c.por[h].bytes / 1e6).toFixed(2) + ' MB';
    }).join('; ');
    return '      ' + c.peticiones + ' peticiones, ' + (c.bytes / 1e6).toFixed(2) + ' MB  [' + hosts + ']\n' +
           '      JSON.parse ' + c.parseMs.toFixed(0) + ' ms sobre ' + c.parseMB.toFixed(2) + ' MB; JSON.stringify ' + c.stringifyMs.toFixed(0) + ' ms; ' +
           'almacén: ' + c.escrituras + ' escrituras, ' + c.escrituraMB.toFixed(2) + ' MB\n' +
           '      reloj simulado: todos pintados ' + (c.tTodos === null ? '—' : c.tTodos.toFixed(0) + ' ms') +
           ', último cambio ' + c.tFinal.toFixed(0) + ' ms, máx. en vuelo ' + c.maxEnVuelo;
}

async function correr(script, srvOpts, extra) {
    const srv = S.crear(Object.assign({ relleno: RELLENO }, srvOpts || {}));
    const o = Object.assign({
        script: script,
        html: F.paginaRejilla(srv.titulos),
        gm: srv.almacenInicial(),
        red: srv.red
    }, typeof extra === 'function' ? extra(srv) : (extra || {}));
    const r = await H.ejecutar(o);
    r.srv = srv;
    ok(r.log.errores.length === 0, 'sin errores de script: ' + r.log.errores.join(' | ').slice(0, 400));
    return r;
}

// Con el almacén que dejó una carga anterior, un índice viejo: se retrasa la
// fecha y se le quita a Plex una película que ahora sí tiene, para que se vea
// si lo viejo se corrige al llegar lo nuevo.
function envejecer(gm, horas, quitarSlugTmdb) {
    const out = Object.assign({}, gm);
    const atrasar = function (e) { if (e && e.ts) e.ts -= horas * 3600 * 1000; };
    const quitar = function (plex) {
        if (!plex || !plex.guid || !quitarSlugTmdb) return;
        Object.keys(plex.guid).forEach(function (k) {
            if (k === 'movie|tmdb:' + quitarSlugTmdb.tmdbId || k === 'movie|imdb:' + quitarSlugTmdb.imdb) delete plex.guid[k];
        });
        Object.keys(plex.byTitle).forEach(function (k) {
            if (k.indexOf('movie|' + quitarSlugTmdb.titleNorm + '|') === 0) delete plex.byTitle[k];
        });
    };
    Object.keys(out).forEach(function (k) {
        if (k === 'lettermonkey.index' || k.indexOf('lettermonkey.index.') === 0) {
            const v = JSON.parse(out[k]);
            if (k === 'lettermonkey.index') {
                Object.keys(v).forEach(function (s) { atrasar(v[s]); if (s === 'plex') quitar(v[s].data); });
            } else {
                atrasar(v);
                if (k === 'lettermonkey.index.plex') quitar(v.data);
            }
            out[k] = JSON.stringify(v);
        }
    });
    return out;
}

function norm(s) {
    return String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
}

(async function main() {
    console.log('Banco LetterMonkey — referencia ' + BASE + ' frente al directorio de trabajo');
    console.log('Biblioteca simulada: ' + RELLENO.movies + ' películas y ' + RELLENO.shows + ' series en Plex, ' +
                RELLENO.radarr + ' en Radarr, ' + RELLENO.sonarr + ' en Sonarr; ' + F.titulosDePagina().length + ' títulos en la página.\n');

    const medidas = {};
    function medir(nombre, cA, cD) { medidas[nombre] = { antes: cA, despues: cD }; }

    // 1. Primera carga en frío. Se repite para tener la mediana de los tiempos
    // de CPU; peticiones y bytes son deterministas.
    console.log('1. Primera carga en frío (almacén vacío salvo la configuración y lo elegido a mano)');
    let frioA, frioD;
    const cA = [], cD = [];
    for (let i = 0; i < REPES; i++) {
        frioA = await correr(ANTES); cA.push(coste(frioA));
        frioD = await correr(DESPUES); cD.push(coste(frioD));
    }
    function med(cs) {
        const c = Object.assign({}, cs[cs.length - 1]);
        ['parseMs', 'stringifyMs', 'tTodos', 'tFinal'].forEach(function (k) { c[k] = mediana(cs.map(function (x) { return x[k] === null ? Infinity : x[k]; })); });
        return c;
    }
    iguales(frioA.distintivos, frioD.distintivos, 'frío');
    mismoIndice(frioA, frioD, 'frío');
    console.log('    ' + resumen(frioD.distintivos));
    console.log('    antes:\n' + fmtCoste(med(cA)) + '\n    después:\n' + fmtCoste(med(cD)));
    medir('frío', med(cA), med(cD));

    // 2. Segunda carga con todo fresco en la caché.
    console.log('\n2. Segunda carga, caché fresca');
    const cAc = [], cDc = [];
    let calA, calD;
    for (let i = 0; i < REPES; i++) {
        calA = await correr(ANTES, {}, { gm: frioA.gm }); cAc.push(coste(calA));
        calD = await correr(DESPUES, {}, { gm: frioD.gm }); cDc.push(coste(calD));
    }
    iguales(calA.distintivos, calD.distintivos, 'caliente');
    iguales(frioA.distintivos, calA.distintivos, 'caliente igual que frío (antes)');
    console.log('    antes:\n' + fmtCoste(med(cAc)) + '\n    después:\n' + fmtCoste(med(cDc)));
    medir('caliente', med(cAc), med(cDc));

    // 3. Caché caducada (7 h con la caducidad en 6). El índice viejo no sabe que
    // film-1 está ya en Plex: el resultado final tiene que decirlo igual.
    console.log('\n3. Caché caducada (índice de hace 7 h, y en él falta film-1, que ya está en Plex)');
    const t0 = frioA.srv.titulos[1];   // sólo en Plex: con el índice viejo sale "no la tienes"
    const quitar = { tmdbId: t0.tmdbId, imdb: t0.imdb, titleNorm: norm(t0.title) };
    // Plex tarda 1,5 s en dar cada listado, para que se vea qué se pinta
    // mientras tanto: si llega antes que TMDB, la pintura vieja se descarta.
    const cadA = await correr(ANTES, { plexLento: 1500 }, { gm: envejecer(frioA.gm, 7, quitar) });
    let provisional = null;
    const cadD = await correr(DESPUES, { plexLento: 1500 }, {
        gm: envejecer(frioD.gm, 7, quitar),
        antesDeEsperar: async function (w) {
            // Se mira cómo está film-1 antes de que llegue el índice nuevo.
            for (let i = 0; i < 300; i++) {
                await new Promise(function (r) { setTimeout(r, 5); });
                const c = Array.prototype.find.call(w.document.querySelectorAll('.ltm-chip'), function (x) { return x._meta && x._meta.slug === 'film-1'; });
                if (c && c._state !== 'loading') { provisional = { estado: c._state, clase: c.className, tip: c.title }; break; }
            }
        }
    });
    iguales(cadA.distintivos, cadD.distintivos, 'caducada, estado final');
    ok(provisional && provisional.estado === 'missing' && /ltm-provisional/.test(provisional.clase), 'caducada: film-1 sale provisional y marcado mientras tanto');
    ok(cadD.distintivos[1].estado === 'plex', 'caducada: film-1 acaba en Plex');
    console.log('    antes:\n' + fmtCoste(coste(cadA)) + '\n    después:\n' + fmtCoste(coste(cadD)));
    console.log('    film-1 antes de llegar el índice nuevo (después): ' + JSON.stringify(provisional));
    medir('caducada', coste(cadA), coste(cadD));

    // 4. Comportamientos de Plex con los parámetros de recorte. Lo que salga
    // tiene que ser idéntico a la carga en frío de la versión de referencia.
    console.log('\n4. Plex ante el recorte del listado');
    for (const modo of ['ignora', 'pierdeGuid', 'pierdeGuidParcial', 'pierdeAnio', 'rechaza', 'sinPaginar']) {
        const r = await correr(DESPUES, { plexModo: modo });
        const plexPet = r.log.peticiones.filter(function (p) { return p.host === 'plex.lan'; });
        iguales(frioA.distintivos, r.distintivos, 'plex ' + modo);
        mismoIndice(frioA, r, 'plex ' + modo);
        console.log('    ' + modo + ': ' + plexPet.length + ' peticiones a Plex, ' +
                    (plexPet.reduce(function (s, p) { return s + p.bytes; }, 0) / 1e6).toFixed(2) + ' MB');
    }

    // 5. TMDB responde 429 a las primeras peticiones.
    console.log('\n5. TMDB contesta 429 (Retry-After: 1) a las cinco primeras');
    const t429A = await correr(ANTES, { tmdb429: 5 });
    const t429D = await correr(DESPUES, { tmdb429: 5 });
    console.log('    antes:   ' + resumen(t429A.distintivos));
    console.log('    después: ' + resumen(t429D.distintivos));
    iguales(frioA.distintivos, t429D.distintivos, '429 después igual que sin 429');

    // 6. Sonarr apagado: las películas no deben esperar a Sonarr.
    console.log('\n6. Sonarr apagado');
    const sonA = await correr(ANTES, { sonarrCaido: true });
    const sonD = await correr(DESPUES, { sonarrCaido: true });
    iguales(sonA.distintivos, sonD.distintivos, 'sonarr caído');

    // 6 bis. Sonarr lento (8 s): cuánto tardan en pintarse las películas.
    console.log('\n6 bis. Sonarr tarda 8 s en dar su listado');
    function tPeliculas(w) {
        return new Promise(function (resolve) {
            const t0 = Date.now();
            (function mira() {
                const chips = Array.prototype.filter.call(w.document.querySelectorAll('.ltm-chip'), function (c) {
                    return !(c._match && c._match.kind === 'tv') && c._meta && !/^film-5[0-2]$/.test(c._meta.slug);
                });
                if (chips.length && chips.every(function (c) { return c._state !== 'loading'; })) return resolve(Date.now() - t0);
                if (Date.now() - t0 > 60000) return resolve(null);
                setTimeout(mira, 10);
            })();
        });
    }
    let tpA = null, tpD = null;
    const slA = await correr(ANTES, { sonarrLento: 8000 }, { antesDeEsperar: async function (w) { tpA = await tPeliculas(w); } });
    const slD = await correr(DESPUES, { sonarrLento: 8000 }, { antesDeEsperar: async function (w) { tpD = await tPeliculas(w); } });
    iguales(slA.distintivos, slD.distintivos, 'sonarr lento');
    console.log('    películas pintadas (reloj simulado): antes ' + tpA + ' ms, después ' + tpD + ' ms');
    medidas['Sonarr lento: películas pintadas'] = { soloTiempo: true, antes: tpA, despues: tpD };

    // 7. Sin Sonarr configurado, carga con caché fresca: lo que se reescribe.
    console.log('\n7. Sin Sonarr configurado: segunda carga con caché fresca');
    function sinSonarr(gm) {
        const o = Object.assign({}, gm);
        const cfg = JSON.parse(o['lettermonkey.config']); cfg.sonarrUrl = ''; cfg.sonarrKey = '';
        o['lettermonkey.config'] = JSON.stringify(cfg);
        return o;
    }
    const ssA1 = await correr(ANTES, {}, function (srv) { return { gm: sinSonarr(srv.almacenInicial()) }; });
    const ssD1 = await correr(DESPUES, {}, function (srv) { return { gm: sinSonarr(srv.almacenInicial()) }; });
    const ssA = await correr(ANTES, {}, { gm: ssA1.gm });
    const ssD = await correr(DESPUES, {}, { gm: ssD1.gm });
    iguales(ssA.distintivos, ssD.distintivos, 'sin sonarr');
    console.log('    antes:\n' + fmtCoste(coste(ssA)) + '\n    después:\n' + fmtCoste(coste(ssD)));
    medir('sin Sonarr, caliente', coste(ssA), coste(ssD));

    // 8. La ficha de una película.
    console.log('\n8. Ficha de una película');
    const tf = frioA.srv.titulos[5];
    const fA = await correr(ANTES, {}, { html: F.paginaFicha(tf), url: 'https://letterboxd.com/film/' + tf.slug + '/' });
    const fD = await correr(DESPUES, {}, { html: F.paginaFicha(tf), url: 'https://letterboxd.com/film/' + tf.slug + '/' });
    iguales(fA.distintivos, fD.distintivos, 'ficha');
    ok(fD.distintivos.length === 1 && fD.distintivos[0].modo === 'big', 'ficha: un solo distintivo grande');

    // 9. Pulsar "enviar" con el índice caducado sobre algo que el índice nuevo
    // dice que ya está: no se debe mandar nada a Radarr.
    console.log('\n9. Pulsar enviar con el índice caducado y la película ya en Plex');
    let clicado = false;
    const altaD = await correr(DESPUES, { plexLento: 1500 }, {
        gm: envejecer(frioD.gm, 7, quitar),
        antesDeEsperar: async function (w) {
            for (let i = 0; i < 400; i++) {
                await new Promise(function (r) { setTimeout(r, 5); });
                const c = Array.prototype.find.call(w.document.querySelectorAll('.ltm-chip'), function (x) { return x._meta && x._meta.slug === 'film-1'; });
                if (c && c._state === 'missing') { clicado = true; c.dispatchEvent(new w.MouseEvent('click', { bubbles: true })); break; }
            }
        }
    });
    ok(altaD.srv.estado.altas.length === 0, 'no se manda a Radarr lo que ya está en Plex (altas: ' + JSON.stringify(altaD.srv.estado.altas) + ')');
    ok(altaD.distintivos[1].estado === 'plex', 'y el distintivo acaba en Plex');
    ok(clicado, 'el escenario llega a pulsar el distintivo');
    // Y una que de verdad falta sí se envía.
    const altaD2 = await correr(DESPUES, {}, {
        gm: frioD.gm,
        despues: async function (w) {
            const c = Array.prototype.find.call(w.document.querySelectorAll('.ltm-chip'), function (x) { return x._state === 'missing' && x._match.kind === 'movie'; });
            c.dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
            for (let i = 0; i < 200 && c._state !== 'queued'; i++) await new Promise(function (r) { setTimeout(r, 10); });
        }
    });
    ok(altaD2.srv.estado.altas.length === 1, 'una que falta sí se envía (altas: ' + JSON.stringify(altaD2.srv.estado.altas) + ')');

    console.log('\nResumen de medidas (mediana de ' + REPES + ' en frío y caliente):');
    Object.keys(medidas).forEach(function (k) {
        const a = medidas[k].antes, d = medidas[k].despues;
        if (medidas[k].soloTiempo) { console.log('  ' + k + ': ' + a + ' → ' + d + ' ms (simulado)'); return; }
        console.log('  ' + k + ': peticiones ' + a.peticiones + ' → ' + d.peticiones +
                    ', descarga ' + (a.bytes / 1e6).toFixed(2) + ' → ' + (d.bytes / 1e6).toFixed(2) + ' MB' +
                    ', JSON.parse ' + a.parseMs.toFixed(0) + ' → ' + d.parseMs.toFixed(0) + ' ms' +
                    ', escrito al almacén ' + a.escrituraMB.toFixed(2) + ' → ' + d.escrituraMB.toFixed(2) + ' MB' +
                    ', todos pintados (simulado) ' + (a.tTodos === null || !isFinite(a.tTodos) ? '—' : a.tTodos.toFixed(0)) + ' → ' +
                    (d.tTodos === null || !isFinite(d.tTodos) ? '—' : d.tTodos.toFixed(0)) + ' ms');
    });

    console.log('\n' + pasadas + ' comprobaciones bien, ' + fallos + ' mal');
    process.exit(fallos ? 1 : 0);
})().catch(function (e) { console.error(e); process.exit(2); });
