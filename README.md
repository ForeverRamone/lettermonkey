# LetterMonkey

Userscript de Tampermonkey para Letterboxd. Sobre cada póster, ficha y lista
aparece un distintivo que dice si esa película ya está en tu Plex, y un botón
para enviarla a Radarr si no la tienes.

Es el equivalente de [FA-Monkey](https://github.com/ForeverRamone/famonkey) para
Letterboxd, y comparte con él casi todo el código: solo cambian la lectura del
DOM y la forma de averiguar el identificador de TMDB.

## Instalación

1. Instala [Tampermonkey](https://www.tampermonkey.net/) en tu navegador.
2. Abre su panel, elige "Crear un nuevo script", borra la plantilla y pega el
   contenido de [`lettermonkey.user.js`](lettermonkey.user.js).
3. Guarda con Ctrl+S.
4. Abre el menú de Tampermonkey en cualquier página de Letterboxd y elige
   **LetterMonkey: ajustes**.

## Configuración

Las claves se introducen en el panel de ajustes del script, no en el código.
Se guardan en el almacenamiento de Tampermonkey.

| Dato | Dónde se obtiene |
|---|---|
| URLs de Plex, Radarr y Sonarr | Las de tu red, con puerto: `http://192.168.1.10:32400`, `http://192.168.1.20:7878`, `http://192.168.1.20:8989` |
| API key de TMDB | themoviedb.org, ajustes de la cuenta, sección API. La **API Key (v3 auth)**, no el "API Read Access Token" |
| X-Plex-Token | En Plex Web, en cualquier elemento: menú ⋮, "Get Info", "View XML". El token va en la URL que se abre |
| API key de Radarr | Radarr, Settings, General, API Key |
| API key de Sonarr | Sonarr, Settings, General, API Key |

Después de pegar cada clave, pulsa **Probar conexión**. En Radarr y Sonarr eso
además rellena los desplegables de perfil de calidad y carpeta raíz, que hay que
elegir antes de poder enviar nada.

No hace falta editar nada más. Las direcciones de tus servicios se ponen en el
panel y el script las usa tal cual, con la IP y el puerto que sean.

## Seguridad

El script solo puede conectarse a TMDB, a la propia web y a las direcciones que
tú hayas configurado. Esa comprobación está en el código, en el único punto por
el que sale una petición, así que tu token de Plex y tus API keys no pueden
acabar en un host ajeno aunque la cabecera declare `@connect *`. Esa declaración
está para que cada uno pueda usar sus propias direcciones sin tocar el código;
la restricción de verdad la impone el script.

## Qué significa cada distintivo

| Aspecto | Significado | Al pulsar |
|---|---|---|
| Ámbar, `▸ PLEX` | Está en tu servidor | Abre la ficha en Plex |
| Verde, `✔` | Descargada en Radarr/Sonarr, aún no visible en Plex | Abre la ficha en Radarr/Sonarr |
| Naranja oscuro, `↓` | Monitorizada, todavía sin archivo | Abre la ficha en Radarr/Sonarr |
| Azul, `+R` / `+S` | No la tienes | La envía a Radarr o a Sonarr |
| Gris, `?` | TMDB no ha dado una coincidencia fiable | Abre el selector de candidatos |
| Rojo, `!` | Error; el motivo está en el tooltip | Reintenta |

**Mayús+clic** sobre cualquier distintivo abre el selector de candidatos, por si
una coincidencia automática es incorrecta. La elección se guarda para siempre.

## Cómo funciona

Los catálogos de Plex, Radarr y Sonarr se descargan enteros una vez cada seis
horas y se indexan por identificador (`tmdb`, `imdb`, `tvdb`). Navegar no genera
ni una petición a esos servicios: solo se consulta el índice en memoria.

Para saber a qué película de TMDB corresponde cada póster, Letterboxd pone las
cosas mucho más fáciles que otras webs:

- **En una ficha** el identificador viene dado. Letterboxd lo publica en el
  propio `<body>`, en `data-tmdb-id`, así que la coincidencia es exacta y no
  hace falta ni una petición.
- **En rejillas y listas** cada póster lleva el título y el año en
  `data-item-name` ("Interstellar (2014)"). Como los datos de Letterboxd salen
  de TMDB, buscar por título y año acierta a la primera casi siempre.
- **Si aun así hay dudas**, el script abre la ficha en segundo plano y coge de
  ahí el identificador exacto. Ese caso es raro, y el resultado se cachea para
  siempre.

Letterboxd cataloga películas, así que lo normal es que todo vaya a Radarr. Para
las contadas entradas que TMDB clasifica como serie, el script lo detecta por
`data-tmdb-type` y las manda a Sonarr.

## Menú de Tampermonkey

- **Ajustes**: el panel de configuración.
- **Refrescar índices**: vuelve a leer Plex, Radarr y Sonarr sin esperar a que
  caduquen. Útil después de añadir cosas por otra vía.
- **Borrar caché de coincidencias**: olvida todos los emparejamientos
  Letterboxd–TMDB, incluidos los elegidos a mano.

## Detalles

- Las rejillas de Letterboxd se cargan por JavaScript y con scroll infinito. El
  script las vigila y va poniendo distintivos según aparecen.
- Los distintivos se resuelven cuando entran en pantalla, no todos de golpe.
- Cambiar el número de peticiones en paralelo requiere recargar la página.
- Si Plex, Radarr o Sonarr no responden, el script sigue usando el último índice
  bueno que tuviera guardado en lugar de quedarse sin datos.
