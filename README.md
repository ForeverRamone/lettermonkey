# LetterMonkey

Userscript de Tampermonkey para Letterboxd. Sobre cada póster, ficha y lista
aparece un distintivo que dice si esa película ya está en tu Plex, y un botón
para enviarla a Radarr si no la tienes.

Es el equivalente de [FA-Monkey](https://github.com/ForeverRamone/famonkey) para
Letterboxd, y comparte con él casi todo el código: solo cambian la lectura del
DOM y la forma de averiguar el identificador de TMDB.

## Instalación

1. Instala [Tampermonkey](https://www.tampermonkey.net/) en tu navegador.
2. Abre [este enlace](https://raw.githubusercontent.com/ForeverRamone/lettermonkey/main/lettermonkey.user.js): Tampermonkey
   reconoce el archivo y ofrece instalarlo. Si prefieres hacerlo a mano, crea un
   script nuevo y pega el contenido de [`lettermonkey.user.js`](lettermonkey.user.js).
3. Abre el menú de Tampermonkey en cualquier página de Letterboxd y elige
   **LetterMonkey: ajustes**.

Instalado así, Tampermonkey avisa por su cuenta cuando hay una versión nueva.

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
una coincidencia automática es incorrecta. La que esté en uso aparece la primera
y marcada en verde. La elección se guarda para siempre.

Nunca se da por buena una coincidencia que solo se parezca: si ningún título
cuadra exactamente, se pide elegir en lugar de arriesgar.

## Cómo funciona

Los catálogos de Plex, Radarr y Sonarr se descargan enteros una vez cada seis
horas y se indexan por identificador (`tmdb`, `imdb`, `tvdb`). Navegar no genera
ni una petición a esos servicios: solo se consulta el índice en memoria.

Para saber a qué película de TMDB corresponde cada póster, Letterboxd pone las
cosas mucho más fáciles que otras webs:

- **En una ficha** el identificador viene dado. Letterboxd lo publica en el
  propio `<body>`, en `data-tmdb-id`, y además en el enlace a TMDB del pie, que
  sirve de respaldo. La coincidencia es exacta y no cuesta ni una petición, y
  manda sobre cualquier cosa que se hubiera deducido antes desde una rejilla:
  abrir la ficha corrige lo que estuviera mal guardado. Lo que hayas elegido a
  mano se respeta.
- **En rejillas y listas** cada póster lleva el título y el año en
  `data-item-name` ("Interstellar (2014)"). Como los datos de Letterboxd salen
  de TMDB, buscar por título y año acierta a la primera casi siempre.
- **Si aun así hay dudas**, el script abre la ficha en segundo plano y coge de
  ahí el identificador exacto. Ese caso es raro, y el resultado se cachea para
  siempre.

Letterboxd cataloga películas, así que lo normal es que todo vaya a Radarr. Pero
hay entradas que TMDB tiene como serie —miniseries sobre todo, del tipo *The
Penguin* o *Something Very Bad Is Going to Happen*—, y esas van a Sonarr.

Distinguirlas tiene truco, porque Letterboxd no lo pone fácil: en esas fichas
deja `data-tmdb-type` valiendo `movie`, que es mentira, y encima vacía
`data-tmdb-id`. Lo único fiable es el enlace a TMDB del pie de la ficha, que es
la dirección canónica y lleva `movie` o `tv` en la propia ruta. El script mira
ahí primero y solo usa los atributos del `<body>` como respaldo.

### La primera carga

La primera vez tarda, y ese rato tiene explicación: hay que descargar enteros
los catálogos de Plex, Radarr y Sonarr —varios megabytes si la biblioteca es
grande— y además resolver los pósteres que no traen ya puesto el identificador.
Mientras eso pasa, abajo a la derecha aparece una barrita que va diciendo por
dónde va: primero qué servicio está leyendo y luego cuántos títulos lleva
identificados. Se cierra sola al acabar, no vuelve a salir en el resto de la
página, y si molesta se quita con un clic.

Las dos esperas corren a la vez en lugar de una detrás de otra, las bibliotecas
de Plex se piden en paralelo y las consultas repetidas de una misma página se
agrupan en una sola: un póster y su título son dos enlaces distintos, pero
preguntan lo mismo. De la segunda visita en adelante casi todo sale de la caché
y la barra ni llega a asomar.

## Si los distintivos funcionan pero el envío da "tiempo de espera agotado"

Radarr y Sonarr no guardan los metadatos de las películas: los piden a
servidores propios cada vez que buscas o añades algo.

| Servicio | Servidor de metadatos | IP |
|---|---|---|
| Radarr | `api.radarr.video`, `radarr.servarr.com` | `188.114.96.5` (Cloudflare) |
| Sonarr | `skyhook.sonarr.tv` | `104.26.0.163` (Cloudflare) |

En España, las órdenes judiciales de LaLiga hacen que los operadores bloqueen
por IP rangos enteros de Cloudflare durante los partidos, y `188.114.96.0/20`
es uno de los habituales. El bloqueo es un agujero negro: la conexión no se
rechaza, simplemente no contesta nunca, así que Radarr se queda esperando y tu
petición acaba en tiempo de espera agotado.

Que TMDB siga funcionando no es casualidad ni contradice nada: **TMDB no está en
Cloudflare** (usa CloudFront y BunnyCDN), y Letterboxd y FilmAffinity sí lo
están, pero en rangos distintos que no suelen entrar en el bloqueo.

Los distintivos siguen apareciendo bien porque el estado sale de la base de
datos local de Radarr, que no depende de internet. Lo único que se rompe es
añadir películas.

### Comprobarlo

Desde la máquina donde corre Radarr:

```bash
curl -m 5 https://api.radarr.video/v1/movie/603
```

Si se queda colgado y con `curl -m 5 --resolve api.radarr.video:443:104.26.0.163
https://api.radarr.video/v1/movie/603` responde al instante, es este problema.

### Solución

Como el bloqueo es por IP y Cloudflare enruta por SNI, cualquier IP suya no
bloqueada sirve el mismo contenido. Basta con fijarla en el fichero `hosts`
**de la máquina que ejecuta Radarr**, no la del navegador:

```
104.26.0.163 api.radarr.video
104.26.0.163 radarr.servarr.com
```

En Linux es `/etc/hosts`; en Windows, `C:\Windows\System32\drivers\etc\hosts`
como administrador. Si Radarr corre en Docker, en el `docker-compose.yml`:

```yaml
services:
  radarr:
    extra_hosts:
      - "api.radarr.video:104.26.0.163"
      - "radarr.servarr.com:104.26.0.163"
```

No es una solución definitiva: si algún día bloquean también esa IP, busca otra
de Cloudflare que responda y cámbiala. Las alternativas son una VPN en la
máquina de Radarr, o enrutar solo ese dominio por otra salida.

## Menú de Tampermonkey

- **Ajustes**: el panel de configuración.
- **Refrescar índices**: vuelve a leer Plex, Radarr y Sonarr sin esperar a que
  caduquen. Útil después de añadir cosas por otra vía.
- **Borrar caché de coincidencias**: olvida todos los emparejamientos
  Letterboxd–TMDB, incluidos los elegidos a mano.

## Detalles

- Las rejillas de Letterboxd se cargan por JavaScript y con scroll infinito. El
  script las vigila y va poniendo distintivos según aparecen.
- Solo se marcan los enlaces a la ficha de una película. Los que Letterboxd
  inyecta bajo cada póster con el número de visionados, listas y me gusta
  apuntan también a `/film/...`, pero no son títulos y se ignoran.
- Los distintivos se resuelven cuando entran en pantalla, no todos de golpe.
- Cambiar el número de peticiones en paralelo requiere recargar la página.
- Si Plex, Radarr o Sonarr no responden, el script sigue usando el último índice
  bueno que tuviera guardado en lugar de quedarse sin datos.
