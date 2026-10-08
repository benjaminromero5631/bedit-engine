# B Edit · motor de edición

Servidor que edita tus reels solo: transcribe, quita silencios y muletillas, pone subtítulos, zooms,
voz pareja a −14 LUFS, música de fondo y exporta MP4 1080×1920 a 30 fps.
Imagen y audio se procesan en el mismo ffmpeg con la misma línea de tiempo, así que no hay desfase.

Flujo: **Drive `Entrada` → n8n → motor → Drive `Borradores` + aviso por WhatsApp.**

---

## 1. Antes de instalar: mira cuánto servidor tienes

Easypanel → **Dashboard** (la pantalla de inicio). Ahí aparecen CPU, memoria y disco.

| Tu servidor | Qué hacer |
|---|---|
| 4 CPU / 8 GB o más | Perfecto: `WHISPER_MODEL=small` (valor por defecto). |
| 2 CPU / 4 GB | Funciona, más lento: pon `WHISPER_MODEL=base` y `THREADS=2`. |
| Menos de 4 GB de RAM libres | Avísame antes de instalar. |

El motor procesa **un video a la vez**, con prioridad baja, para no molestar a tus otros servicios.
Un reel de 1 minuto tarda unos minutos; como se edita sin que estés, no importa.
Necesita ~10 GB de disco libre (los videos 4K y el modelo de Whisper). Los trabajos se borran solos a los 7 días.

## 2. Subir el código a GitHub

1. GitHub → **New repository** → nombre `bedit-engine` → **Private** → Create.
2. Sube **todo el contenido de esta carpeta** (botón *Add file → Upload files*; arrastra las carpetas `src`, `python`, `fonts`, `n8n` y los archivos `Dockerfile`, `package.json`, `package-lock.json`, `.dockerignore`, `.gitignore`, `README.md`). **No subas `node_modules`.**

## 3. Crear el servicio en Easypanel

1. En tu proyecto: **+ Service → App**. Nombre: `bedit-engine`.
2. **Source → GitHub**: conecta tu cuenta, elige el repo `bedit-engine`, rama `main`. **Build → Dockerfile**.
3. **Environment** (pega esto y cambia el token):
   ```
   BEDIT_TOKEN=inventa-un-texto-largo-de-40-letras-y-numeros
   WHISPER_MODEL=small
   THREADS=
   ```
   (Si tienes poco servidor: `WHISPER_MODEL=base` y `THREADS=2`.)
4. **Mounts → Volume**: nombre `bedit-data`, ruta de montaje `/data`. (Guarda música, modelo de Whisper y trabajos.)
5. **Domains & Ports**: puerto `8080`. Si n8n está en el mismo proyecto de Easypanel, **no necesitas dominio público**: usa la dirección interna (cada servicio la muestra en su pantalla). Si le pones dominio y está detrás de Cloudflare con la nube naranja, Cloudflare corta subidas de más de 100 MB: déjalo en **gris (solo DNS)**.
6. (Recomendado) **Resources**: límite de CPU a la mitad de lo que tengas, memoria 4 GB.
7. **Deploy**. Cuando termine, abre `http://<dirección>/health` → debe decir `{"ok":true}`.

La primera edición tarda más porque descarga el modelo de Whisper (≈ 500 MB, una sola vez).

## 4. Subir tu música

Una vez, desde cualquier computador (cambia la dirección y el token):

```
curl -H "Authorization: Bearer TU_TOKEN" -F "file=@cancion1.mp3" https://TU-MOTOR/music
```

Sube las pistas que quieras (mp3, m4a, wav). El motor las va rotando en orden, una por video.
Ver lista: `GET /music`. Borrar una: `DELETE /music/<nombre>`. Música apagada: `MUSIC=off`.

## 5. WhatsApp que sí te avise

Lo más simple y sin costo extra es una **segunda instancia de Evolution API** con un número distinto al tuyo
(un chip prepago o un número secundario), que te escribe a tu número personal. Así te llega notificación normal.
Anota: URL de Evolution, nombre de esa instancia y su apikey.

## 6. Importar el workflow nuevo en n8n

1. n8n → **Workflows → Import from file** → `n8n/bedit-workflow.json`.
2. En **Config A** y **Config B** (son iguales) rellena: dirección del motor, token, URL del webhook
   (`https://TU-N8N/webhook/bedit-done`), ID de la carpeta **Borradores**, y los datos de Evolution.
   El ID de una carpeta de Drive es lo último de su URL.
3. En **Drive: video nuevo** elige tu credencial de Google Drive y la carpeta **Entrada**.
   En **Drive: descargar** y **Drive: subir resultado** elige la misma credencial.
4. Activa el workflow (interruptor).
5. Recomendado para videos 4K: en n8n agrega la variable `N8N_DEFAULT_BINARY_DATA_MODE=filesystem`
   (así los archivos grandes van a disco y no a la memoria).

## 7. Probar

Sube un video corto a `Entrada`. En 1–2 minutos n8n lo toma, y cuando el motor termina aparece
`<nombre>_bedit.mp4` en Borradores y te llega el WhatsApp. Cuando confíes en el resultado,
cambia `outFolderId` en **Config B** por la carpeta **Listos**.

---

## API (por si quieres usarla directo)

Todas con `Authorization: Bearer <BEDIT_TOKEN>` (salvo `/health`).

| Ruta | Qué hace |
|---|---|
| `POST /jobs` (multipart: `video`, `name`, `meta`, `options`, `callbackUrl`) | Encola una edición. |
| `GET /jobs/:id` | Estado y progreso. |
| `GET /jobs/:id/result` | MP4 final. |
| `GET /jobs/:id/project` | `project.json`: frases, cortes y zooms (para revisar). |
| `POST /jobs/:id/rerender` (cuerpo: project.json editado) | Vuelve a renderizar con tus correcciones, sin re-transcribir. |
| `GET/POST /music`, `DELETE /music/:nombre` | Música. |

`options`: `{"sensitivity":"suave|normal|fuerte","seed":1,"music":false,"musicName":"x.mp3"}`.

## Variables

`BEDIT_TOKEN` (obligatoria) · `WHISPER_MODEL` (small) · `X264_PRESET` (slow) · `X264_CRF` (17) ·
`THREADS` · `NICE` (10) · `HDR_MODE` (`tonemap` o `keep`) · `MUSIC` (`off`) · `MUSIC_BELOW_DB` (18) · `RETENTION_DAYS` (7).
