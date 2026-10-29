'use strict';
// Datos sintéticos y deterministas para el banco. No son la biblioteca de
// nadie: la forma de cada objeto imita la respuesta documentada de Plex,
// Radarr, Sonarr y TMDB, y el marcado de Letterboxd es el que el script ya
// sabe leer (data-item-slug, data-item-full-display-name, enlace a TMDB en
// .text-footer). Los bytes que salen de aquí miden el modelo, no un servidor
// real.

function rng(seed) {
    let s = seed >>> 0;
    return function () {
        s = (s * 1664525 + 1013904223) >>> 0;
        return s / 4294967296;
    };
}

const PALABRAS = ('amor noche ciudad sombra rio tiempo guerra mar luz fuego viento hijo ' +
    'casa camino silencio memoria verano invierno puerta sangre cielo tierra piedra ' +
    'sueno lluvia frontera ultimo primer regreso viaje secreto').split(' ');

function frase(r, n) {
    const out = [];
    for (let i = 0; i < n; i++) out.push(PALABRAS[Math.floor(r() * PALABRAS.length)]);
    return out.join(' ');
}

function cap(s) { return s.charAt(0).toUpperCase() + s.slice(1); }

/* ------------------------------------------------------------------ *
 * Títulos que aparecen en la página de Letterboxd
 * ------------------------------------------------------------------ */

// Cada entrada describe un título de la rejilla y dónde está en casa.
//   kind: catálogo real en TMDB ('movie' | 'tv')
//   plex: 'tmdb' | 'imdb' | 'tvdb' | 'titulo' | null
//   arr:  'downloaded' | 'queued' | null
//   tmdb: 'unico' | 'homonimo' | 'ausente' | 'anio-1'
//   pagina: la ficha de Letterboxd lleva enlace a TMDB (true) o no (false)
function titulosDePagina() {
    const t = [];
    let id = 900000;
    function add(o) {
        const n = t.length;
        t.push(Object.assign({
            slug: 'film-' + n,
            title: 'Titulo ' + cap(frase(rng(n + 7), 2)) + ' ' + n,
            year: 1970 + (n % 50),
            kind: 'movie', plex: null, arr: null, tmdb: 'unico', pagina: true,
            tmdbId: id++, imdb: 'tt' + (7000000 + n), tvdb: 300000 + n
        }, o));
    }
    for (let i = 0; i < 30; i++) add({ plex: 'tmdb' });
    for (let i = 0; i < 4; i++)  add({ plex: 'imdb' });
    for (let i = 0; i < 3; i++)  add({ plex: 'titulo' });
    for (let i = 0; i < 4; i++)  add({ arr: 'downloaded' });
    for (let i = 0; i < 3; i++)  add({ arr: 'queued' });
    for (let i = 0; i < 6; i++)  add({});
    add({ kind: 'tv', plex: 'tvdb', title: 'Miniserie Pinguino', year: 2024 });
    add({ kind: 'tv', arr: 'queued', title: 'Miniserie Algo Malo', year: 2025 });
    add({ kind: 'tv', title: 'Miniserie Sin Nadie', year: 2023 });
    for (let i = 0; i < 4; i++)  add({ tmdb: 'homonimo', plex: i % 2 ? 'tmdb' : null, title: 'Genesis ' + ['Uno', 'Dos', 'Tres', 'Cuatro'][i] });
    add({ tmdb: 'ausente', pagina: false, title: 'Corto Inedito Uno' });
    add({ tmdb: 'ausente', pagina: false, title: 'Corto Inedito Dos' });
    add({ tmdb: 'anio-1', plex: 'tmdb' });
    add({ tmdb: 'anio-1' });
    // Decididos a mano por el usuario: van sembrados en el almacén.
    add({ plex: 'tmdb', manual: 'ignorar' });
    add({ plex: 'tmdb', manual: 'elegir' });
    return t;
}

/* ------------------------------------------------------------------ *
 * Catálogo de TMDB
 * ------------------------------------------------------------------ */

function catalogoTmdb(titulos) {
    const r = rng(42);
    const movies = [], tv = [];
    titulos.forEach(function (x) {
        if (x.tmdb === 'ausente') return;
        const anioTmdb = x.tmdb === 'anio-1' ? x.year + 1 : x.year;
        const item = {
            id: x.tmdbId, title: x.title, original: x.title, year: anioTmdb,
            popularity: 5 + r() * 30, imdb: x.imdb, tvdb: x.kind === 'tv' ? x.tvdb : null,
            overview: frase(r, 40), poster: '/p' + x.tmdbId + '.jpg'
        };
        (x.kind === 'tv' ? tv : movies).push(item);
        if (x.tmdb === 'homonimo') {
            // Mismo título y mismo año, popularidad parecida: no hay forma
            // honrada de elegir sin la ficha.
            movies.push(Object.assign({}, item, { id: x.tmdbId + 50000, popularity: item.popularity + 1, imdb: 'tt9' + x.tmdbId }));
        }
        // Una homónima lejana en el tiempo, que no debe ganar.
        movies.push(Object.assign({}, item, { id: x.tmdbId + 70000, year: anioTmdb - 20, popularity: 2, imdb: 'tt8' + x.tmdbId }));
    });
    // Las miniseries también existen como "película" homónima en TMDB: es la
    // trampa que hace falta la ficha para deshacer.
    titulos.filter(function (x) { return x.kind === 'tv'; }).forEach(function (x) {
        movies.push({ id: x.tmdbId + 60000, title: x.title + ' Making Of', original: x.title + ' Making Of',
                      year: x.year, popularity: 1, imdb: null, overview: '', poster: null });
    });
    return { movie: movies, tv: tv };
}

/* ------------------------------------------------------------------ *
 * Plex
 * ------------------------------------------------------------------ */

function plexMovie(r, n, o) {
    const rk = String(10000 + n);
    const it = {
        ratingKey: rk,
        key: '/library/metadata/' + rk,
        guid: o.legacy ? 'com.plexapp.agents.imdb://' + o.imdb + '?lang=es' : 'plex://movie/5d7768' + (n.toString(16).padStart(6, '0')) + 'a091de9f',
        slug: o.title.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
        studio: cap(frase(r, 2)) + ' Pictures',
        type: o.type || 'movie',
        title: o.title,
        titleSort: o.title,
        contentRating: 'es/16',
        summary: cap(frase(r, 70)) + '.',
        rating: Math.round(r() * 100) / 10,
        audienceRating: Math.round(r() * 100) / 10,
        year: o.year,
        tagline: cap(frase(r, 8)) + '.',
        thumb: '/library/metadata/' + rk + '/thumb/1700000000',
        art: '/library/metadata/' + rk + '/art/1700000000',
        duration: 5400000 + Math.floor(r() * 3600000),
        originallyAvailableAt: o.year + '-03-14',
        addedAt: 1600000000 + n,
        updatedAt: 1700000000 + n,
        audienceRatingImage: 'rottentomatoes://image.rating.upright',
        chapterSource: 'media',
        primaryExtraKey: '/library/metadata/' + (90000 + n),
        ratingImage: 'rottentomatoes://image.rating.ripe',
        Image: [
            { alt: o.title, type: 'coverPoster', url: '/library/metadata/' + rk + '/thumb/1700000000' },
            { alt: o.title, type: 'background', url: '/library/metadata/' + rk + '/art/1700000000' },
            { alt: o.title, type: 'clearLogo', url: '/library/metadata/' + rk + '/clearLogo/1700000000' }
        ],
        UltraBlurColors: { topLeft: '3f2c1d', topRight: '6a4b2f', bottomRight: '1d1410', bottomLeft: '2e2219' },
        Media: [{
            id: 20000 + n, duration: 6000000, bitrate: 9800, width: 1920, height: 800, aspectRatio: 2.35,
            audioChannels: 6, audioCodec: 'eac3', videoCodec: 'h264', videoResolution: '1080',
            container: 'mkv', videoFrameRate: '24p', videoProfile: 'high',
            Part: [{
                id: 30000 + n, key: '/library/parts/' + (30000 + n) + '/1700000000/file.mkv', duration: 6000000,
                file: '/data/media/peliculas/' + o.title + ' (' + o.year + ')/' + o.title + ' (' + o.year + ') - 1080p.mkv',
                size: 7000000000 + n, container: 'mkv', videoProfile: 'high'
            }]
        }],
        Genre: [{ tag: 'Drama' }, { tag: cap(PALABRAS[n % PALABRAS.length]) }],
        Country: [{ tag: 'Spain' }],
        Director: [{ tag: cap(frase(r, 2)) }],
        Writer: [{ tag: cap(frase(r, 2)) }, { tag: cap(frase(r, 2)) }],
        Role: [{ tag: cap(frase(r, 2)) }, { tag: cap(frase(r, 2)) }, { tag: cap(frase(r, 2)) }]
    };
    if (!o.sinGuid && !o.legacy) {
        it.Guid = [{ id: 'imdb://' + o.imdb }, { id: 'tmdb://' + o.tmdb }];
        if (o.tvdb) it.Guid.push({ id: 'tvdb://' + o.tvdb });
    }
    if (o.type === 'show') {
        delete it.Media;
        it.childCount = 2; it.leafCount = 16; it.viewedLeafCount = 0;
        it.guid = 'plex://show/5d9c08' + n.toString(16).padStart(6, '0');
        if (!o.sinGuid) it.Guid = [{ id: 'tvdb://' + o.tvdb }].concat(o.tmdbEnShow ? [{ id: 'tmdb://' + o.tmdb }] : []);
    }
    return it;
}

function plexBiblioteca(titulos, relleno) {
    const r = rng(7);
    const movies = [], shows = [];
    let n = 0;
    titulos.forEach(function (x) {
        if (!x.plex) return;
        if (x.kind === 'tv') {
            shows.push(plexMovie(r, n++, { type: 'show', title: x.title, year: x.year, tvdb: x.tvdb, tmdb: x.tmdbId }));
            return;
        }
        movies.push(plexMovie(r, n++, {
            title: x.title, year: x.tmdb === 'anio-1' ? x.year + 1 : x.year, imdb: x.imdb, tmdb: x.tmdbId,
            legacy: x.plex === 'imdb', sinGuid: x.plex === 'titulo'
        }));
    });
    for (let i = 0; i < relleno.movies; i++) {
        movies.push(plexMovie(r, n++, { title: cap(frase(r, 3)) + ' ' + i, year: 1950 + (i % 75), imdb: 'tt' + (1000000 + i), tmdb: 1000 + i }));
    }
    for (let i = 0; i < relleno.shows; i++) {
        shows.push(plexMovie(r, n++, { type: 'show', title: cap(frase(r, 2)) + ' S' + i, year: 1990 + (i % 35), tvdb: 70000 + i, tmdb: 50000 + i, tmdbEnShow: true }));
    }
    return { movies: movies, shows: shows };
}

/* ------------------------------------------------------------------ *
 * Radarr y Sonarr
 * ------------------------------------------------------------------ */

function radarrMovie(r, n, o) {
    return {
        title: o.title, originalTitle: o.title, originalLanguage: { id: 3, name: 'Spanish' },
        alternateTitles: [{ sourceType: 'tmdb', movieMetadataId: n, title: o.title + ' alt', id: n }],
        secondaryYearSourceId: 0, sortTitle: o.title.toLowerCase(), sizeOnDisk: o.files ? 7000000000 : 0,
        status: 'released', overview: cap(frase(r, 60)) + '.', inCinemas: o.year + '-03-14T00:00:00Z',
        physicalRelease: o.year + '-07-01T00:00:00Z', digitalRelease: o.year + '-06-01T00:00:00Z',
        images: [
            { coverType: 'poster', url: '/MediaCover/' + n + '/poster.jpg', remoteUrl: 'https://image.tmdb.org/t/p/original/p' + n + '.jpg' },
            { coverType: 'fanart', url: '/MediaCover/' + n + '/fanart.jpg', remoteUrl: 'https://image.tmdb.org/t/p/original/f' + n + '.jpg' }
        ],
        website: '', year: o.year, youTubeTrailerId: 'abc' + n, studio: 'Estudio', path: '/data/media/peliculas/' + o.title,
        qualityProfileId: 4, hasFile: !!o.files, movieFileId: o.files ? n : 0, monitored: true,
        minimumAvailability: 'released', isAvailable: true, folderName: '/data/media/peliculas/' + o.title,
        runtime: 112, cleanTitle: o.title.toLowerCase().replace(/[^a-z0-9]/g, ''), imdbId: o.imdb, tmdbId: o.tmdb,
        titleSlug: String(o.tmdb), rootFolderPath: '/data/media/peliculas', certification: '16', genres: ['Drama'],
        tags: [], added: '2023-01-01T00:00:00Z',
        ratings: { imdb: { votes: 1000, value: 7.1, type: 'user' }, tmdb: { votes: 500, value: 7.0, type: 'user' } },
        popularity: 12.3, statistics: { movieFileCount: o.files ? 1 : 0, sizeOnDisk: 0, releaseGroups: [] }, id: n
    };
}

function radarrLista(titulos, relleno) {
    const r = rng(9);
    const out = [];
    let n = 1;
    titulos.forEach(function (x) {
        if (x.kind !== 'movie') return;
        if (x.arr) out.push(radarrMovie(r, n++, { title: x.title, year: x.year, imdb: x.imdb, tmdb: x.tmdbId, files: x.arr === 'downloaded' }));
        else if (x.plex === 'tmdb' && x.tmdbId % 3 === 0) out.push(radarrMovie(r, n++, { title: x.title, year: x.year, imdb: x.imdb, tmdb: x.tmdbId, files: true }));
    });
    for (let i = 0; i < relleno; i++) out.push(radarrMovie(r, n++, { title: cap(frase(r, 3)) + ' ' + i, year: 1950 + (i % 75), imdb: 'tt' + (1000000 + i), tmdb: 1000 + i, files: true }));
    return out;
}

function sonarrLista(titulos, relleno) {
    const out = [];
    let n = 1;
    function serie(o) {
        return {
            title: o.title, alternateTitles: [], sortTitle: o.title.toLowerCase(), status: 'ended', ended: true,
            overview: frase(rng(n), 50), network: 'HBO',
            images: [{ coverType: 'poster', url: '/MediaCover/' + n + '/poster.jpg', remoteUrl: 'https://artworks.thetvdb.com/x' + n + '.jpg' }],
            seasons: [{ seasonNumber: 1, monitored: true, statistics: { episodeFileCount: o.files, episodeCount: 8, totalEpisodeCount: 8 } }],
            year: o.year, path: '/data/media/series/' + o.title, qualityProfileId: 4, seasonFolder: true, monitored: true,
            runtime: 55, tvdbId: o.tvdb, tvRageId: 0, tvMazeId: 0, tmdbId: o.tmdb, firstAired: o.year + '-09-01T00:00:00Z',
            seriesType: 'standard', cleanTitle: o.title.toLowerCase().replace(/[^a-z0-9]/g, ''), imdbId: '',
            titleSlug: o.title.toLowerCase().replace(/[^a-z0-9]+/g, '-'), rootFolderPath: '/data/media/series/', genres: ['Drama'],
            tags: [], added: '2023-01-01T00:00:00Z', ratings: { votes: 10, value: 8 },
            statistics: { seasonCount: 1, episodeFileCount: o.files, episodeCount: 8, totalEpisodeCount: 8, sizeOnDisk: 0, percentOfEpisodes: 0 },
            id: n++
        };
    }
    titulos.forEach(function (x) {
        if (x.kind === 'tv' && x.arr) out.push(serie({ title: x.title, year: x.year, tvdb: x.tvdb, tmdb: x.tmdbId, files: x.arr === 'downloaded' ? 8 : 0 }));
    });
    for (let i = 0; i < relleno; i++) out.push(serie({ title: 'Serie ' + i, year: 1990 + (i % 35), tvdb: 70000 + i, tmdb: 50000 + i, files: 8 }));
    return out;
}

/* ------------------------------------------------------------------ *
 * Letterboxd
 * ------------------------------------------------------------------ */

function esc(s) { return String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;'); }

// Rejilla de pósters (como /films/popular/) y, debajo, una lista en vista de
// detalle con el enlace del título junto al póster, que es donde un mismo
// título lleva dos enlaces y no debe llevar dos distintivos.
function paginaRejilla(titulos) {
    const enRejilla = titulos.slice(0, Math.ceil(titulos.length * 0.7));
    const enLista = titulos.slice(Math.ceil(titulos.length * 0.7));
    function poster(x) {
        return '<div class="react-component poster film-poster" data-component-class="LazyPoster"' +
            ' data-item-name="' + esc(x.title) + '" data-item-slug="' + x.slug + '"' +
            ' data-item-link="/film/' + x.slug + '/" data-item-full-display-name="' + esc(x.title + ' (' + x.year + ')') + '">' +
            '<div><img src="https://s.ltrbxd.com/empty.png" alt="' + esc(x.title) + '" width="150" height="225">' +
            '<a href="/film/' + x.slug + '/" class="frame"><span class="frame-title"></span></a></div></div>';
    }
    let html = '<!doctype html><html><head><title>Popular</title></head><body data-type="films">' +
        '<header id="header"><a href="/">Letterboxd</a></header><section><h2>Popular</h2><ul class="poster-list">';
    enRejilla.forEach(function (x) { html += '<li class="poster-container">' + poster(x) + '</li>'; });
    html += '</ul></section><section><ul class="film-details-list">';
    enLista.forEach(function (x) {
        html += '<li class="film-detail">' + poster(x) +
            '<div class="film-detail-content"><h2 class="headline-2 prettify"><a href="/film/' + x.slug + '/">' + esc(x.title) +
            '</a> <small class="metadata"><a href="/films/year/' + x.year + '/">' + x.year + '</a></small></h2>' +
            '<p><a href="/film/' + x.slug + '/members/">1k</a> <a href="/film/' + x.slug + '/likes/">300</a></p></div></li>';
    });
    html += '</ul></section></body></html>';
    return html;
}

// Ficha de una película: lo que el script lee de ella y algo de relleno para
// que el tamaño se parezca al de una ficha de verdad (decenas de KB).
function paginaFicha(x) {
    const tipo = x.kind;
    const pie = x.pagina
        ? '<p class="text-link text-footer">More at <a href="http://www.imdb.com/title/' + x.imdb + '/maindetails" data-track-action="IMDb">IMDb</a>' +
          ' <a href="https://www.themoviedb.org/' + tipo + '/' + x.tmdbId + '/" data-track-action="TMDB">TMDB</a></p>'
        : '<p class="text-link text-footer">More at <a href="http://www.imdb.com/title/' + x.imdb + '/maindetails">IMDb</a></p>';
    // Como en Letterboxd, las series llevan data-tmdb-type="movie" y el id vacío.
    const cuerpo = tipo === 'tv'
        ? ' data-tmdb-type="movie" data-tmdb-id=""'
        : (x.pagina ? ' data-tmdb-type="movie" data-tmdb-id="' + x.tmdbId + '"' : '');
    let relleno = '';
    for (let i = 0; i < 60; i++) relleno += '<li class="review"><div class="body-text"><p>' + frase(rng(i), 40) + '</p></div></li>';
    return '<!doctype html><html><head><title>' + esc(x.title) + '</title></head><body class="film" data-type="film"' + cuerpo + '>' +
        '<div id="film-header"><section class="film-header-group"><h1 class="headline-1 filmtitle">' + esc(x.title) + '</h1>' +
        '<span class="releasedate"><a href="/films/year/' + x.year + '/">' + x.year + '</a></span></section></div>' +
        '<section id="popular-reviews"><ul>' + relleno + '</ul></section>' + pie + '</body></html>';
}

module.exports = {
    rng: rng,
    titulosDePagina: titulosDePagina,
    catalogoTmdb: catalogoTmdb,
    plexBiblioteca: plexBiblioteca,
    radarrLista: radarrLista,
    sonarrLista: sonarrLista,
    paginaRejilla: paginaRejilla,
    paginaFicha: paginaFicha
};
