# B Edit — contexto del proyecto

## Propósito

B Edit es el sistema personal de edición automática de videos cortos verticales del usuario. El flujo principal está pensado para videos talking head: se sube el original a Google Drive, n8n lo envía al motor, el motor genera el montaje y el usuario revisa, corrige y descarga el resultado desde `/review`.

## Principios de producto acordados

- Priorizar automatización para reducir el tiempo de edición y permitir procesar muchos videos.
- No cortar palabras ni frases de forma que cambie el sentido. Los cortes automáticos deben quitar silencios y muletillas con precisión; el usuario quiere cortes relativamente firmes, y controles manuales por palabra y línea de tiempo.
- Revisar los borradores antes de publicarlos. No marcar un video como publicado sin acción del usuario.
- Mantener sistemas y bibliotecas independientes para que nuevas funciones no rompan el flujo Talking Head.
- No inventar contenido visual ni modificar el sentido del material del usuario.

## Flujo Talking Head

- Entrada habitual: video vertical de celular, español, normalmente de hasta un minuto. Algunos iPhone generan HEVC/HDR; el motor debe normalizar para previsualización/render cuando sea necesario.
- Transcripción Whisper con edición manual de texto, recuperación de palabras eliminadas y edición/sincronización temporal.
- Render MP4 vertical 1080×1920, 30 fps.
- Subtítulos centrados, Montserrat ExtraBold, minúsculas según configuración; respetar saltos de línea ingresados manualmente. Estilo blanco con sombra/legibilidad sobria.
- Cortes automáticos de silencios y muletillas, zooms suaves y poco frecuentes, voz prioritaria y música de fondo. Música debe comenzar desde el primer segundo aproximadamente y poder cambiarse o desactivarse.
- Revisión con estados Pendientes, Listos, Publicados y Eliminados; edición manual y descarga individual. Se añadió botón «Descargar todos» en Listos; inicia descargas separadas y cambia esos trabajos a Publicados.
- Los videos de `/jobs/:id/result` deben servirse inline para reproducirse en el navegador; los enlaces de descarga pueden mantener comportamiento de descarga explícito.

## Modo Frase + B-roll

- Sección separada en `/phrase-broll`, con biblioteca de clips propios etiquetados, selección aleatoria y edición manual de tomas, frases y música.
- El usuario ingresa una frase fija centrada, se crea un video vertical de 8–10 segundos con música, sin voz/subtítulos automáticos. Puede variar cada toma aproximadamente entre 1 y 2,5 segundos.
- Respetar literalmente espacios y saltos de línea de la frase; centrar el bloque sin colapsar los saltos escritos.
- Permitir cola de generación con opción de editar/eliminar elementos de la cola. No subir duplicados a la biblioteca.
- Las etiquetas describen tanto contexto como detalles visuales (por ejemplo gym, caminando, face, night).

## Infraestructura conocida

- Repositorio público: https://github.com/benjaminromero5631/bedit-engine
- Motor en Easypanel; interfaz principal en `/review`; modo frase en `/phrase-broll`.
- n8n conecta Google Drive Entrada → motor → Google Drive Borradores/Listos y notificación por webhook.
- Nunca guardar tokens/credenciales en el repositorio ni incluir datos de usuario en logs/documentación pública.

## Pendientes / cautelas actuales

- Corregir y desplegar el workflow activo de n8n para que, antes de subir un nuevo resultado a Drive, busque archivos existentes del mismo nombre en la carpeta destino y los mueva a la papelera; luego suba la versión nueva. Esto debe preservar las credenciales, expresión del nombre y carpeta existentes.
- En una sesión anterior el workflow «B Edit · automático» fue despublicado para intentar editarlo, pero no se pudo completar el cambio. Confirmar su estado actual en n8n y volver a publicarlo después de editar para restaurar el procesamiento.
- Un arreglo local se subió a `main` para servir los MP4 del editor inline y facilitar previsualización. El usuario indicó que pulsó Implementar en Easypanel; la reproducción debe confirmarse por el usuario.
- Mantener separados los formatos Green Screen y Frase + B-roll de Talking Head. Pantalla compartida fue considerada y luego descartada; no volver a agregarla sin petición explícita.

## Forma de colaborar

- El usuario prefiere cambios rápidos, directos y con bajo consumo de tokens.
- Para cambios autorizados, implementar y desplegar cuando sea posible. El usuario pidió que no se hagan verificaciones adicionales salvo que las solicite; respetar esto y evitar pruebas exploratorias innecesarias.
- Comunicar con claridad qué quedó hecho y qué bloqueo concreto impide terminar. No afirmar que algo está desplegado si solo se subió a GitHub.
