# B Edit · Green Screen (independent engine)

Separate service and storage. It does not add routes, data, or processing steps to the production B Edit service.

## Input contract

In Drive, each Green Screen project is one subfolder inside `B Edit / Green Screen / Entrada`. Put exactly one camera video and 1–11 vertical still images in that subfolder. The n8n flow waits 120 seconds after the project folder appears before collecting its contents; finish uploading before that window ends. The engine validates the files and rejects missing or unsupported media instead of inventing replacements.

`POST /jobs` (multipart, `Authorization: Bearer <GREEN_SCREEN_TOKEN>`):

- `video`: one camera recording (MP4/MOV/M4V/WebM/MKV, up to 2 GB, max 125 s).
- `image`: one or more vertical JPG/PNG/WebP/HEIC/HEIF/AVIF/TIFF/BMP/GIF background images (repeat the field), or numbered fields `image_1` through `image_11`. Images are normalized to upright JPEG automatically; the first frame is used for animated images.
- `imageCount` (optional when sending numbered fields): number of actual images to use. This lets fixed-field workflow tools pad unused slots without treating the duplicates as extra backgrounds.
- `name` (optional) and `callbackUrl` (optional).

The first six final seconds use a 2×2 collage made from the first four images (repeat images if fewer were supplied). After that, every supplied image fills the background for an equal share of the remaining duration, so the background stays filled to the end. The camera foreground is segmented with MediaPipe Selfie Segmentation. The audio is transcribed in Spanish and the existing B Edit cut planner is reused at `fuerte` sensitivity; subtitles and zooms are not rendered. The exact default B Edit track is used only when its saved default is available; otherwise the job reports that music is missing and does not silently choose another track.

`GET /jobs/:id` returns status; `GET /jobs/:id/result` downloads the MP4; `GET /jobs/:id/plan` returns the transcript/cuts and review warnings. `GET /health` does not require a token.

## Deployment isolation

- Easypanel service: `greenscreen-engine`.
- Dockerfile path: `greenscreen/Dockerfile` from the repository root.
- `DATA_DIR=/data/green-screen`, with a distinct `greenscreen-data` volume mounted at `/data`.
- `GREEN_SCREEN_TOKEN` is a separate secret from `BEDIT_TOKEN`.
- For music sharing, prefer a read-only mount and restrict the code to the music directory. Do not mount the B Edit volume read-write.
- Do not point the B Edit service at this Dockerfile or storage volume.

## Drive retention

The engine keeps source files, normalized images, the cut plan, and the rendered result in its isolated volume for `RETENTION_DAYS` (7 days by default), then removes the job directory. This is temporary processing storage, not a long-term archive. The Drive automation should move successful project folders into a recoverable `Procesados` archive and retain the result in `Borradores`; failed projects should remain available for retry in `Errores`. Do not delete source assets automatically.

## Draft caveat

Background removal quality depends on a clear, evenly lit neutral background and good separation between the subject and the wall. The automatic output should remain a draft until reviewed, especially around hair, hands, and dark clothing against a dark background.
