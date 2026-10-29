'use strict';
// Servidores simulados. Cada uno contesta lo que contestaría el de verdad a
// las rutas que usa el script; Plex además puede portarse de varias maneras
// con los parámetros de recorte, porque eso no está documentado oficialmente
// y la salvaguarda tiene que aguantar todas.

const F = require('./fixtures');

function norm(s) {
    return String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
        .replace(/[^a-z0-9]+/g, ' ').trim();
}

const HOSTS = {
    plex: 'plex.lan', radarr: 'radarr.lan', sonarr: 'sonarr.lan'
};

const CONFIG = {
    tmdbKey: 'k', plexUrl: 'http://plex.lan:32400', plexToken: 'tok',
    radarrUrl: 'http://radarr.lan:7878', radarrKey: 'rk', radarrProfileId: 4, radarrRoot: '/data/media/peliculas',
    sonarrUrl: 'http://sonarr.lan:8989', sonarrKey: 'sk', sonarrProfileId: 4, sonarrRoot: '/data/media/series/'
};

// Campos que el servidor deja fuera cuando se le pide. Plex sólo recorta lo
// que reconoce; aquí se reconoce todo lo que el script pide quitar.
function recortar(it, campos, elementos) {
    const o = {};
    Object.keys(it).forEach(function (k) {
        const v = it[k];
        const esElemento = Array.isArray(v) || (v && typeof v === 'object');
        if (esElemento ? elementos.has(k) : campos.has(k)) return;
        o[k] = v;
    });
    return o;
}

function crear(opciones) {
    opciones = opciones || {};
    const titulos = opciones.titulos || F.titulosDePagina();
    const relleno = opciones.relleno || { movies: 10000, shows: 1500, radarr: 8000, sonarr: 1200 };
    const tmdb = F.catalogoTmdb(titulos);
    const plex = F.plexBiblioteca(titulos, relleno);
    const radarr = F.radarrLista(titulos, relleno.radarr);
    const sonarr = F.sonarrLista(titulos, relleno.sonarr);
    const porSlug = {};
    titulos.forEach(function (t) { porSlug[t.slug] = t; });

    const estado = {
        plexModo: opciones.plexModo || 'honra',   // honra | ignora | pierdeGuid | pierdeGuidParcial | pierdeAnio | rechaza | sinPaginar
        tmdb429: opciones.tmdb429 || 0,           // cuántas respuestas 429 dar antes de contestar
        fichaFalla: opciones.fichaFalla || new Set(),
        radarrCaido: !!opciones.radarrCaido,
        sonarrCaido: !!opciones.sonarrCaido,
        plexLento: opciones.plexLento || 0,
        sonarrLento: opciones.sonarrLento || 0,
        altas: []
    };

    function plexAll(key, q) {
        const lista = key === '1' ? plex.movies : plex.shows;
        const hayRecorte = q.has('excludeFields') || q.has('excludeElements');
        if (hayRecorte && estado.plexModo === 'rechaza') return { status: 400, body: '<html>Bad Request</html>' };
        let items = lista;
        if (hayRecorte && estado.plexModo !== 'ignora') {
            const campos = new Set((q.get('excludeFields') || '').split(',').filter(Boolean));
            const elementos = new Set((q.get('excludeElements') || '').split(',').filter(Boolean));
            if (estado.plexModo === 'pierdeGuid') elementos.add('Guid');
            if (estado.plexModo === 'pierdeAnio') campos.add('year');
            items = items.map(function (it, i) {
                const el = new Set(elementos);
                if (estado.plexModo === 'pierdeGuidParcial' && i % 2 === 0) el.add('Guid');
                return recortar(it, campos, el);
            });
        }
        if (q.get('includeGuids') !== '1') items = items.map(function (it) { const o = Object.assign({}, it); delete o.Guid; return o; });
        const total = items.length;
        if (estado.plexModo !== 'sinPaginar' && q.has('X-Plex-Container-Start')) {
            const ini = parseInt(q.get('X-Plex-Container-Start'), 10) || 0;
            const tam = parseInt(q.get('X-Plex-Container-Size'), 10);
            items = items.slice(ini, isFinite(tam) ? ini + tam : undefined);
        }
        return { status: 200, body: { MediaContainer: { size: items.length, totalSize: total, allowSync: true, librarySectionID: Number(key), Metadata: items } } };
    }

    function tmdbBusca(kind, q) {
        const consulta = norm(q.get('query'));
        const anio = q.get(kind === 'movie' ? 'primary_release_year' : 'first_air_date_year');
        const res = tmdb[kind].filter(function (it) {
            if (anio && String(it.year) !== anio) return false;
            return norm(it.title).indexOf(consulta) !== -1 || norm(it.original).indexOf(consulta) !== -1;
        }).sort(function (a, b) { return b.popularity - a.popularity; }).slice(0, 20).map(function (it) {
            const fecha = it.year + '-05-01';
            return kind === 'movie'
                ? { id: it.id, title: it.title, original_title: it.original, release_date: fecha, popularity: it.popularity, poster_path: it.poster, overview: it.overview }
                : { id: it.id, name: it.title, original_name: it.original, first_air_date: fecha, popularity: it.popularity, poster_path: it.poster, overview: it.overview };
        });
        return { status: 200, body: { page: 1, results: res, total_results: res.length, total_pages: 1 } };
    }

    function red(d) {
        const u = new URL(d.url);
        const q = u.searchParams;
        const p = u.pathname;
        if (u.hostname === HOSTS.plex) {
            if ((d.headers || {})['X-Plex-Token'] !== 'tok') return { status: 401, body: '' };
            if (p === '/identity') return { status: 200, body: { MediaContainer: { machineIdentifier: 'maquina123' } } };
            if (p === '/library/sections') return { status: 200, body: { MediaContainer: { Directory: [
                { key: '1', type: 'movie', title: 'Peliculas' }, { key: '2', type: 'show', title: 'Series' }, { key: '3', type: 'artist', title: 'Musica' }] } } };
            const m = /^\/library\/sections\/(\d+)\/all$/.exec(p);
            if (m) {
                const r = plexAll(m[1], q);
                if (estado.plexLento) r.espera = estado.plexLento;
                return r;
            }
            return { status: 404, body: '' };
        }
        if (u.hostname === HOSTS.radarr) {
            if (estado.radarrCaido) return { red: 'error', status: 0, body: '' };
            if (p === '/api/v3/movie' && (d.method || 'GET') === 'GET') return { status: 200, body: radarr };
            if (p === '/api/v3/system/status') return { status: 200, body: { version: '5.8.3' } };
            if (p === '/api/v3/movie/lookup') {
                const id = parseInt(String(q.get('term')).replace('tmdb:', ''), 10);
                return { status: 200, body: [{ title: 'x', tmdbId: id, year: 2000, images: [] }] };
            }
            if (p === '/api/v3/movie' && d.method === 'POST') {
                const b = JSON.parse(d.data);
                estado.altas.push(['radarr', b.tmdbId]);
                return { status: 201, body: Object.assign({ id: 99999, titleSlug: String(b.tmdbId) }, b) };
            }
        }
        if (u.hostname === HOSTS.sonarr) {
            if (estado.sonarrCaido) return { red: 'error', status: 0, body: '' };
            if (p === '/api/v3/system/status') return { status: 200, body: { version: '4.0.9' } };
            if (p === '/api/v3/series') return { status: 200, body: sonarr, espera: estado.sonarrLento || undefined };
        }
        if (u.hostname === 'api.themoviedb.org') {
            if (estado.tmdb429 > 0) {
                estado.tmdb429--;
                return { status: 429, body: { status_code: 25, status_message: 'Your request count is over the allowed limit' }, headers: 'retry-after: 1\r\ncontent-type: application/json\r\n' };
            }
            let m = /^\/3\/search\/(movie|tv)$/.exec(p);
            if (m) return tmdbBusca(m[1], q);
            m = /^\/3\/(movie|tv)\/(\d+)\/external_ids$/.exec(p);
            if (m) {
                const it = tmdb[m[1]].find(function (x) { return x.id === Number(m[2]); });
                return { status: 200, body: { id: Number(m[2]), imdb_id: it ? it.imdb : null, tvdb_id: it ? it.tvdb : null } };
            }
            m = /^\/3\/(movie|tv)\/(\d+)$/.exec(p);
            if (m) {
                const it = tmdb[m[1]].find(function (x) { return x.id === Number(m[2]); });
                if (!it) return { status: 404, body: {} };
                return { status: 200, body: m[1] === 'movie'
                    ? { id: it.id, title: it.title, original_title: it.original, release_date: it.year + '-05-01', popularity: it.popularity }
                    : { id: it.id, name: it.title, original_name: it.original, first_air_date: it.year + '-05-01', popularity: it.popularity } };
            }
        }
        if (/letterboxd\.com$/.test(u.hostname)) {
            const m = /^\/film\/([^/]+)\/$/.exec(p);
            if (m && porSlug[decodeURIComponent(m[1])]) {
                if (estado.fichaFalla.has(m[1])) return { status: 503, body: '<html>busy</html>' };
                return { status: 200, body: F.paginaFicha(porSlug[decodeURIComponent(m[1])]) };
            }
            return { status: 404, body: '' };
        }
        return { status: 404, body: '' };
    }

    // Lo que el usuario ya había decidido a mano antes de la primera carga.
    function almacenInicial() {
        const map = {};
        titulos.forEach(function (t) {
            if (t.manual === 'ignorar') map[t.slug] = { none: 1 };
            if (t.manual === 'elegir') map[t.slug] = { k: 'movie', i: t.tmdbId, t: t.title, y: t.year, m: 1 };
        });
        return {
            'lettermonkey.config': JSON.stringify(CONFIG),
            'lettermonkey.map': JSON.stringify(map),
            'lettermonkey.esquema': JSON.stringify(2)
        };
    }

    return { red: red, estado: estado, titulos: titulos, almacenInicial: almacenInicial, plex: plex, radarr: radarr, sonarr: sonarr };
}

module.exports = { crear: crear, CONFIG: CONFIG, HOSTS: HOSTS };
