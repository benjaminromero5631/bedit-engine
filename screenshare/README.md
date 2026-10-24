# B Edit · Pantalla Compartida (motor aislado)

Servicio y almacenamiento separados. No agrega rutas, datos ni pasos de proceso al servicio
de producción de B Edit ni al de Green Screen.

## Diseño (plantilla fija)

Video vertical 1080×1920, siempre con las mismas medidas:

- **Cámara** arriba — 820 px (42,7%)
- **Franja de subtítulos** al medio — 280 px (14,6%), fondo negro, texto blanco (mismo estilo que B Edit)
- **Pantalla** abajo — 820 px (42,7%)

Cada panel se recorta "cubriendo" (sin franjas), priorizando que el contenido se vea claro.
Sin zooms. Audio: solo el de la cámara (evita eco). Cortes: silencios y muletillas con la
sensibilidad "fuerte" de B Edit, aplicados a ambos videos a la vez. Música: la pista
predeterminada de B Edit, igual que el resto del sistema.

## Contrato de entrada

`POST /jobs` (multipart, `Authorization: Bearer <SCREENSHARE_TOKEN>`):

- `camera`: video de la cámara, con audio (MP4/MOV/M4V/WebM/MKV, hasta 2 GB, máx. 125 s).
- `screen`: video de la pantalla, grabado al mismo tiempo que `camera` (mismo formato).
- `name` (opcional) y `callbackUrl` (opcional).

Si los dos archivos duran distinto, se usa la parte en común (la más corta) y el trabajo queda
con un aviso (`durationWarning`) para revisar antes de aprobar — nunca se inventa video.

`GET /jobs/:id` devuelve el estado; `GET /jobs/:id/result` descarga el MP4; `GET /jobs/:id/plan`
devuelve la transcripción, los cortes y los avisos de revisión. `GET /health` no requiere token.

## Aislamiento del despliegue

- Servicio en Easypanel: `screenshare-engine`.
- Ruta del Dockerfile: `screenshare/Dockerfile` desde la raíz del repositorio.
- `DATA_DIR=/data/screenshare`, con un volumen propio `screenshare-data` montado en `/data`.
- `SCREENSHARE_TOKEN` es un secreto distinto de `BEDIT_TOKEN` y de `GREEN_SCREEN_TOKEN`.
- Para compartir música, igual que Green Screen: montaje de solo lectura restringido a la
  carpeta de música. No montar el volumen de B Edit en modo lectura-escritura.

## Retención en Drive

El motor guarda los archivos originales, el plan de cortes y el resultado en su volumen
aislado por `RETENTION_DAYS` (7 días por defecto). El flujo de n8n debería mover los proyectos
ya procesados a una carpeta `Procesados` y dejar el resultado en `Borradores` para revisión;
los proyectos con error deben quedar disponibles para reintentar en `Errores`.

## Primera prueba

Antes de automatizar la subida, probar con un clip corto (cámara + pantalla, un par de
segundos) para validar el encuadre y la franja de subtítulos antes de tocar el sistema real.
