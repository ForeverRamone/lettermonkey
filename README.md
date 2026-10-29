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
| Cualquiera, atenuado y con borde discontinuo | Provisional: sale del índice guardado, que ha caducado, mientras llega el nuevo | Lo mismo que sin atenuar; enviar espera antes al índice nuevo |
| Rojo, `!` | Error; el motivo está en el tooltip | Reintenta |

**Mayús+clic** sobre cualquier distintivo abre el selector de candidatos, por si
una coincidencia automática es incorrecta. La que esté en uso aparece la primera
y marcada en verde. La elección se guarda para siempre.

Nunca se da por buena una coincidencia que solo se parezca: si ningún título
cuadra exactamente, se pide elegir en lugar de arriesgar.

## Cómo funciona

Los catálogos de Plex, Radarr y Sonarr se descargan una vez cada seis horas (es
la caducidad por defecto, se cambia en los ajustes) y se indexan por
identificador (`tmdb`, `imdb`, `tvdb`). Navegar no genera ni una petición a esos
servicios: solo se consulta el índice en memoria.

Cada clave del índice lleva delante si es película o serie, y no es un detalle
menor: TMDB y TVDB numeran los dos catálogos por separado, así que el mismo
número designa dos cosas distintas. `tmdb://8592` es *Dick Tracy* entre las
películas y *Parks and Recreation* entre las series. Sin esa distinción, una
serie que no tienes se quedaba con la ficha de una película que sí, se marcaba
como presente en Plex y al pulsarla abría la película.

Para saber a qué película de TMDB corresponde cada póster, Letterboxd pone las
cosas mucho más fáciles que otras webs:

- **En una ficha** el identificador viene dado. Letterboxd lo publica en el
  enlace a TMDB del pie de la ficha, que es el que manda, y además en el propio
  `<body>`, en `data-tmdb-id`, que solo sirve de respaldo (ver más abajo por
  qué). La coincidencia es exacta y no cuesta ni una petición, y
  manda sobre cualquier cosa que se hubiera deducido antes desde una rejilla:
  abrir la ficha corrige lo que estuviera mal guardado. Lo que hayas elegido a
  mano se respeta.
- **En rejillas y listas** cada póster lleva el título y el año en
  `data-item-full-display-name` ("Interstellar (2014)"), y el título solo en
  `data-item-name`. No lleva el identificador de TMDB, así que hay que buscarlo
  por título y año. Como los datos de Letterboxd salen de TMDB, eso suele
  acertar a la primera.
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

La primera vez tarda, y ese rato tiene explicación: hay que descargar los
catálogos de Plex, Radarr y Sonarr y además resolver en TMDB los pósters de la
página, que no traen el identificador. Mientras eso pasa, abajo a la derecha
aparece una barrita que va diciendo por dónde va: primero qué servicio está
leyendo y luego cuántos títulos lleva identificados. Se cierra sola al acabar, no
vuelve a salir en el resto de la página, y si molesta se quita con un clic.

Para que sea lo más corta posible sin que ningún distintivo salga distinto:

- **Del catálogo de Plex solo se pide lo que el índice mira**: tipo, ratingKey,
  título, año e identificadores. La sinopsis, las rutas de los ficheros, el
  reparto o los géneros eran casi toda la descarga y no se usaban. Que Plex deje
  campos fuera con `excludeFields` y `excludeElements` no está en la
  documentación oficial, así que el script lo comprueba en cada descarga: pide
  enteros, de uno en uno, unos pocos títulos (los que tendrían más que perder) y
  los compara con los recortados. Si algo no cuadra, o Plex rechaza los
  parámetros, se pide el catálogo entero, como antes.
- **Los índices se piden nada más arrancar**, no cuando el primer póster entra
  en pantalla.
- **Cada distintivo espera solo lo suyo**: una película espera a Plex y a
  Radarr, no a Sonarr, y una serie no espera a Radarr. Con Sonarr lento o
  apagado, las películas ya no se quedan girando.
- **Las peticiones se limitan por servidor, no por título**, así que un título
  difícil ya no retiene a los fáciles. Las consultas repetidas de una misma página
  se agrupan en una sola: un póster y su título son dos enlaces distintos, pero
  preguntan lo mismo. Las bibliotecas de Plex se piden en paralelo.
- **Si una consulta recibe un 429 (TMDB cuando se le aprieta) o un 503, se
  reintenta** con espera, respetando `Retry-After`, en lugar de dejar el
  distintivo en rojo o dar por hecho que no hay coincidencia. Las altas en
  Radarr y Sonarr no se reintentan: repetir una que sí se hizo daría dos.
- **El índice se guarda en un momento libre**, no antes de pintar. Si un servicio
  falla, o no lo tienes configurado, ya no se reescriben los índices de los
  demás en cada carga.

De la segunda visita en adelante casi todo sale de la caché y la barra ni llega a
asomar.

**Cuando el índice guardado ha caducado**, ya no se tira: los distintivos se
pintan al momento con él y el índice nuevo se descarga por detrás. Mientras
llega, cada distintivo pintado así sale atenuado y con borde discontinuo, y al
pasar por encima lo dice: es provisional. Cuando llega lo nuevo, se repinta. Si
pulsas para enviar algo en ese rato, el script espera antes al índice nuevo. Si
resulta que ya la tenías, te lo dice en lugar de mandarla.

## Direcciones de los servicios

Se pueden escribir con esquema o sin él: `192.168.1.10:32400`, `plex.local:32400`
y `http://plex.local:32400` valen lo mismo. El script las completa antes de
usarlas, y eso importa más de lo que parece: una dirección sin `http://` es una
ruta relativa para el navegador, así que antes acababa resolviéndose contra la
propia web y la petición salía hacia ella **con el token de Plex o la API key en
la cabecera**. Ahora eso no puede pasar: además de completarlas, sólo se sale a
direcciones absolutas y sólo hacia TMDB, la propia web y los servicios que hayas
configurado.

## Si tu Plex es antiguo

Las bibliotecas creadas con los agentes viejos (`com.plexapp.agents.imdb`,
`.themoviedb`, `.thetvdb`) no guardan el identificador de TMDB, sino el de IMDb.
Esas fichas se indexan y se consultan igual: cuando un título no aparece por
TMDB ni por TVDB, se pregunta su IMDb y se busca por ahí. Sólo se hace esa
consulta de más si tu índice tiene alguna clave de ese tipo, así que a una
biblioteca moderna no le cuesta ni una petición.

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
- Los distintivos se resuelven cuando entran en pantalla, no todos de golpe. Los
  índices, en cambio, se piden al cargar la página, haya pósters o no.
- Cambiar el número de peticiones en paralelo requiere recargar la página.
- Si Plex, Radarr o Sonarr no responden, el script sigue usando el último índice
  bueno que tuviera guardado en lugar de quedarse sin datos.
- La descarga del catálogo de Plex tiene dos minutos de margen, no los treinta
  segundos del resto: con una biblioteca grande y una conexión lenta no cabía, y
  un índice de Plex con error deja todo lo que tienes como si faltara.

## Banco de pruebas

En [`test/`](test/) hay un banco que ejecuta el script de verdad en jsdom, con el
almacén y la red de Tampermonkey simulados: Plex con una biblioteca sintética
grande, Radarr, Sonarr, TMDB y las fichas de Letterboxd. Compara una versión de
referencia con la del directorio de trabajo en los mismos escenarios: en frío,
con caché fresca, con caché caducada, con un Plex que entiende el recorte de
cinco maneras distintas, con TMDB devolviendo 429, con Sonarr lento, apagado o
sin configurar, en una ficha, y al enviar con el índice caducado. Exige que los
distintivos salgan idénticos y que el índice de Plex sea idéntico byte a byte. Y
mide peticiones, bytes, tiempo de `JSON.parse` y lo escrito al almacén.

```bash
cd test && npm install && node banco.js
```

`node banco.js --rapido` usa una biblioteca pequeña, y `--base <commit>` cambia
la versión de referencia (por defecto, la 1.7.0). Los datos son sintéticos: los
bytes que mide son los del modelo, no los de tu servidor.
